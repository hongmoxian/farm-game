import type { Plot } from "../data/Plot";
import type { GameConfig } from "../config/GameConfig";
import type { FarmService } from "../services/FarmService";
import { CropGrowthSystem } from "../systems/CropGrowthSystem";

/**
 * PlotView：单块土地的渲染。
 * 成长进度一律由时间戳换算（不依赖刷新循环），刷新只负责把最新进度画出来。
 * 支持原地更新（renderPlotContent 复用已有 DOM 节点，保留事件监听）。
 */

/** 将游戏内时间戳（epoch 秒，×1 速度下与系统时钟一致）格式化为北京时间 HH:mm */
export function formatBeijing(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** 渲染/更新一块土地的内容到指定元素（不重建节点，保留事件监听） */
export function renderPlotContent(el: HTMLElement, plot: Plot, farm: FarmService, config: GameConfig): void {
  const now = farm.clock.now();
  const state = plot.state;
  el.dataset.plotId = plot.plotId;

  if (state === "LOCKED") {
    el.className = "plot locked";
    el.innerHTML = `<span class="lock-mark">🔒</span>`;
    el.title = "未解锁";
    return;
  }

  if (!plot.crop) {
    el.className = "plot empty";
    el.innerHTML = `<span class="plot-icon">🟫</span>`;
    el.title = "空土地，点击播种";
    return;
  }

  const def = config.cropMap.get(plot.crop.cropId)!;
  const progress = CropGrowthSystem.getProgress(plot.crop, def, now);
  const mature = progress >= 1;

  // 变异视觉：颜色 → 词条色发光；材质 → 💎；巨大化 → 放大
  const variants = plot.crop.variants ?? {};
  const mutClasses: string[] = [];
  let glowColor = "";
  let hasMaterial = false;
  for (const m of plot.crop.mutationList) {
    const md = config.mutationMap.get(m);
    if (!md) continue;
    if (m === "color") {
      mutClasses.push("tint");
      const v = md.variants?.find((x) => x.id === variants.color);
      if (v?.color) glowColor = v.color;
    }
    if (m === "material") hasMaterial = true;
    if (m === "giant") mutClasses.push("giant-mut");
  }

  const badges = plot.crop.mutationList
    .map((m) => config.mutationMap.get(m)?.badge ?? "")
    .join("");
  const displayName = farm.economy.displayName(def, plot.crop.mutationList, variants);
  const remaining = CropGrowthSystem.getRemainingSeconds(plot.crop, def, now);
  // 成熟时刻（北京时间）：时间戳直接换算，浇水前移已体现在 plantTimestamp 中
  const matureAt = plot.crop.plantTimestamp + def.growthTime;

  el.className = `plot ${mature ? "mature" : state.toLowerCase()}`;
  el.innerHTML = `
    <div class="badges">${badges}</div>
    <span class="crop-icon ${mutClasses.join(" ")}" style="font-size:${(30 + 30 * progress).toFixed(0)}px;${glowColor ? `text-shadow:0 0 10px ${glowColor}, 0 0 4px ${glowColor};` : ""}">${def.icon}</span>
    ${hasMaterial ? '<span class="crystal-badge">💎</span>' : ""}
    <div class="mutation-tag">${mature ? "可收获!" : `${displayName} ${formatTime(remaining)}`}</div>
    ${plot.crop.watered ? '<span class="watered-mark">💧</span>' : ""}
    <div class="progress-ring" style="width:${(progress * 100).toFixed(1)}%"></div>
  `;

  el.title = mature
    ? `${displayName} — 可收获`
    : `${displayName} · 成长 ${(progress * 100).toFixed(0)}% · 剩余 ${formatTime(remaining)} · 预计北京时间 ${formatBeijing(matureAt)} 成熟`;
}

/** 新建一块土地元素 */
export function renderPlot(plot: Plot, farm: FarmService, config: GameConfig): HTMLElement {
  const el = document.createElement("div");
  renderPlotContent(el, plot, farm, config);
  return el;
}
