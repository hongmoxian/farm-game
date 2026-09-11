import type { FarmService } from "../services/FarmService";
import type { Plot } from "../data/Plot";
import { CropGrowthSystem } from "../systems/CropGrowthSystem";
import { formatTime, formatBeijing } from "./PlotView";
import { mountCrop3D, type Crop3DHandle } from "./Crop3DView";

/**
 * CropPopup：点击土地时的操作弹层。
 * 空地 → 选种播种（播种直接扣款）；
 * 成长中 → 3D 预览 / 变异时间线 / 浇水；成熟 → 收获。
 * 弹窗内容通过 tick() 每秒刷新：成长进度、变异时间线、3D 模型实时同步。
 */
export interface PlotPopupHandle {
  el: HTMLElement;
  tick: () => void;
}

export function openPlotPopup(farm: FarmService, plot: Plot, onClose: () => void): PlotPopupHandle {
  const mask = document.createElement("div");
  mask.className = "modal-mask";
  const modal = document.createElement("div");
  modal.className = "modal plot-popup";
  mask.appendChild(modal);

  /** 3D 视图等资源的清理函数 */
  let cleanup: (() => void) | null = null;
  const close = () => {
    cleanup?.();
    cleanup = null;
    mask.remove();
    onClose();
  };
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });

  if (plot.unlockState === "locked") {
    modal.innerHTML = `<h2>🔒 未解锁的土地</h2><p class="subtitle">提升农场等级后可解锁更多土地。</p>`;
    return { el: mask, tick: () => {} };
  }

  if (!plot.crop) {
    renderSeedSelection(farm, plot, modal, close);
    return { el: mask, tick: () => {} };
  }

  const tick = renderGrowingCrop(farm, plot, modal, close, (fn) => (cleanup = fn));
  return { el: mask, tick };
}

function renderSeedSelection(farm: FarmService, plot: Plot, modal: HTMLElement, close: () => void): void {
  modal.innerHTML = `<h2>播种 — ${plot.plotId}</h2><p class="subtitle">选择作物后直接扣除金币（无需先购买种子）</p>`;
  const grid = document.createElement("div");
  grid.className = "seed-options";

  for (const def of farm.config.crops) {
    const unlocked = def.unlockLevel <= farm.player.farmLevel;
    const affordable = farm.player.coins >= def.seedPrice;
    const option = document.createElement("div");
    option.className = `seed-option ${!unlocked || !affordable ? "disabled" : ""}`;
    option.innerHTML = `
      <span class="icon">${def.icon}</span>
      <span class="name">${def.name}</span>
      <span class="cnt">${!unlocked ? `Lv.${def.unlockLevel} 解锁` : `💰${def.seedPrice}${affordable ? "" : "（金币不足）"}`}</span>
    `;
    if (unlocked && affordable) {
      option.addEventListener("click", () => {
        const err = farm.plantSeed(plot.plotId, def.id);
        if (err) alert(err);
        close();
      });
    }
    grid.appendChild(option);
  }
  modal.appendChild(grid);
  const row = document.createElement("div");
  row.className = "close-row";
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "关闭";
  btn.addEventListener("click", close);
  row.appendChild(btn);
  modal.appendChild(row);
}

function renderGrowingCrop(
  farm: FarmService,
  plot: Plot,
  modal: HTMLElement,
  close: () => void,
  onCleanup: (fn: () => void) => void
): (() => void) {
  const crop = plot.crop!;
  const def = farm.getCropDef(crop.cropId)!;

  /** 类别 + 词条的徽章文案，如 "桃霞·颜色变异" */
  const mutLabel = (mutationId: string, variantId?: string): string => {
    const md = farm.config.mutationMap.get(mutationId);
    if (!md) return mutationId;
    const v = variantId ? md.variants?.find((x) => x.id === variantId) : undefined;
    return v ? `${v.name}·${md.name}` : md.name;
  };

  // 静态骨架 + 动态区域引用
  modal.innerHTML = `
    <h2 id="pp-name"></h2>
    <p class="subtitle">${def.description}</p>
    <div id="pp-chips"></div>
    <div class="crop3d-box" id="crop3d"></div>
    <div class="section-title">变异判定点（25% / 50% / 75% / 成熟）</div>
    <div class="cp-timeline" id="pp-timeline"></div>
    <div id="pp-progress"></div>
  `;
  const nameEl = modal.querySelector("#pp-name") as HTMLElement;
  const chipsEl = modal.querySelector("#pp-chips") as HTMLElement;
  const timelineEl = modal.querySelector("#pp-timeline") as HTMLElement;
  const progressEl = modal.querySelector("#pp-progress") as HTMLElement;

  // 挂载 3D 预览（WebGL 不可用时自动降级为 emoji）
  const box = modal.querySelector("#crop3d") as HTMLElement;
  const view3d: Crop3DHandle = mountCrop3D(box, def, crop.mutationList, crop.variants, farm.config, 0);

  // 操作按钮：未成熟显示浇水，成熟切换为收获
  const actions = document.createElement("div");
  actions.className = "actions";
  const waterBtn = document.createElement("button");
  waterBtn.className = "btn primary";
  waterBtn.addEventListener("click", () => {
    const err = farm.water(plot.plotId);
    if (err) alert(err);
  });
  const harvestBtn = document.createElement("button");
  harvestBtn.className = "btn primary";
  harvestBtn.textContent = "🧺 收获";
  harvestBtn.addEventListener("click", () => {
    farm.harvest(plot.plotId);
    close();
  });
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn";
  closeBtn.textContent = "关闭";
  closeBtn.addEventListener("click", close);
  actions.append(waterBtn, harvestBtn, closeBtn);
  modal.appendChild(actions);

  const wasMature = () => CropGrowthSystem.getProgress(crop, def, farm.clock.now()) >= 1;
  let lastMature = wasMature();
  let lastMutationCount = -1;

  /** 每秒刷新：进度、剩余时间、成熟时刻、变异词条与时间线、3D 模型 */
  const tick = (): void => {
    const now = farm.clock.now();
    const progress = CropGrowthSystem.getProgress(crop, def, now);
    const mature = progress >= 1;
    const displayName = farm.economy.displayName(def, crop.mutationList, crop.variants);

    nameEl.innerHTML = `${def.icon} ${displayName}`;

    // 变异词条徽章
    chipsEl.innerHTML =
      crop.mutationList
        .map((m) => `<span class="mutation-chip">${mutLabel(m, crop.variants?.[m])}</span>`)
        .join("") || '<span class="subtitle">尚未发生变异</span>';

    // 变异时间线
    const events = crop.mutationEvents ?? [];
    timelineEl.innerHTML = farm.config.mutationConfig.checkpoints
      .map((cp) => {
        const ev = events.find((e) => e.checkpoint === cp);
        const cls = ev ? "mut" : progress >= cp ? "passed" : "";
        const label = ev
          ? mutLabel(ev.mutationId, ev.variantId)
          : progress >= cp
            ? "未触发"
            : `${cp * 100}%`;
        return `<div class="cp-dot ${cls}"><span class="dot"></span><span class="cp-label">${label}</span></div>`;
      })
      .join("");

    // 进度区
    if (mature) {
      progressEl.innerHTML = `<div class="section-title">✅ 已成熟，可以收获了</div>`;
    } else {
      const speedOk = (farm.clock as { getSpeed?: () => number }).getSpeed?.() === 1;
      progressEl.innerHTML = `
        <div class="section-title">成长进度：${(progress * 100).toFixed(1)}%</div>
        <div class="progress-line"><div style="width:${progress * 100}%"></div></div>
        <div class="subtitle">剩余 ${formatTime(CropGrowthSystem.getRemainingSeconds(crop, def, now))}</div>
        ${speedOk ? `<div class="subtitle">🕐 预计北京时间 ${formatBeijing(crop.plantTimestamp + def.growthTime)} 成熟</div>` : ""}
      `;
    }

    // 3D 模型同步进度与外观
    view3d.update(progress, crop.mutationList, crop.variants);

    // 成熟状态切换按钮
    waterBtn.style.display = mature ? "none" : "";
    harvestBtn.style.display = mature ? "" : "none";
    if (!mature) {
      waterBtn.textContent = crop.watered ? "💧 已浇过水" : "💧 浇水（剩余时间 -10%）";
      waterBtn.disabled = crop.watered;
    }

    // 新触发变异时保存一次
    if (crop.mutationList.length !== lastMutationCount || mature !== lastMature) {
      lastMutationCount = crop.mutationList.length;
      lastMature = mature;
      farm.save();
    }
  };
  tick();
  onCleanup(() => view3d.dispose());

  return tick;
}
