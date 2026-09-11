import type { FarmService } from "../services/FarmService";
import type { EventBus } from "../core/EventBus";
import { renderPlot, renderPlotContent, formatTime } from "./PlotView";
import { openPlotPopup } from "./CropPopup";
import { openShopPanel } from "./ShopPanel";
import { openWarehousePanel } from "./WarehousePanel";
import { openCollectionPanel } from "./CollectionPanel";
import { openUpgradePanel } from "./UpgradePanel";
import { createDebugPanel } from "./DebugPanel";
import type { RealGameClock } from "../core/GameClock";

/**
 * FarmScreen：主界面。
 * 布局：顶栏（等级/经验/金币）→ 农场网格 → 底部功能按钮 → Debug。
 * 只做渲染与转发玩家输入，所有游戏规则由 FarmService 处理。
 */
export class FarmScreen {
  private root: HTMLElement;
  private topbar!: HTMLElement;
  private grid!: HTMLElement;
  private offlineBanner!: HTMLElement;
  private toastContainer!: HTMLElement;
  private debugPanel: HTMLElement | null = null;
  /** 一键种植作物下拉框刷新（升级解锁新作物时调用） */
  private renderCropOptions: () => void = () => {};
  /** 打开中的土地弹窗每秒刷新回调 */
  private plotPopupTick: (() => void) | null = null;

  constructor(
    private farm: FarmService,
    private events: EventBus,
    private clock: RealGameClock,
    private showDebug: boolean
  ) {
    this.root = document.getElementById("app")!;
    this.buildLayout();
    this.subscribeEvents();
  }

  private buildLayout(): void {
    this.root.innerHTML = `
      <div class="topbar">
        <div class="farm-title">🌱 星露农场</div>
        <div class="stats">
          <div class="stat"><span class="label">农场等级</span><span class="value" id="hud-level"></span></div>
          <div class="stat"><span class="label">经验</span><span class="value" id="hud-exp"></span><div class="expbar"><div id="hud-expbar"></div></div></div>
          <div class="stat"><span class="label">金币</span><span class="value" id="hud-coins"></span></div>
        </div>
        <button class="btn" id="debug-toggle" style="display:none">🛠</button>
      </div>
      <div id="offline-banner"></div>
      <div class="quickbar">
        <select id="quick-crop" title="一键种植使用的作物"></select>
        <label class="quick-opt"><input type="checkbox" id="opt-harvest" />🧺收获</label>
        <label class="quick-opt"><input type="checkbox" id="opt-water" />💧浇水</label>
        <label class="quick-opt"><input type="checkbox" id="opt-plant" />🌱播种</label>
        <button class="btn primary" id="btn-quick">⚡ 执行</button>
      </div>
      <div class="farm-grid" id="farm-grid"></div>
      <div class="bottombar">
        <button class="btn primary" id="btn-shop">🏪 价目表</button>
        <button class="btn" id="btn-warehouse">📦 仓库</button>
        <button class="btn" id="btn-collection">📖 图鉴</button>
        <button class="btn gold" id="btn-upgrade">⬆️ 升级</button>
      </div>
      <div class="toast-container" id="toasts"></div>
    `;

    this.topbar = this.root.querySelector(".topbar")!;
    this.grid = this.root.querySelector("#farm-grid")!;
    this.offlineBanner = this.root.querySelector("#offline-banner")!;
    this.toastContainer = this.root.querySelector("#toasts")!;

    /** 打开弹层：必须将返回的遮罩节点挂载到 body，否则不可见 */
    const openModal = (el: HTMLElement) => document.body.appendChild(el);
    const openPanel = (builder: (refresh: () => void) => HTMLElement) => {
      openModal(builder(() => this.renderAll()));
    };
    this.root.querySelector("#btn-shop")!.addEventListener("click", () =>
      openPanel((r) => openShopPanel(this.farm, () => this.renderAll(), r))
    );
    this.root.querySelector("#btn-warehouse")!.addEventListener("click", () =>
      openPanel((r) => openWarehousePanel(this.farm, () => this.renderAll(), r))
    );
    this.root.querySelector("#btn-collection")!.addEventListener("click", () =>
      openModal(openCollectionPanel(this.farm, () => this.renderAll()))
    );
    this.root.querySelector("#btn-upgrade")!.addEventListener("click", () =>
      openPanel((r) => openUpgradePanel(this.farm, () => this.renderAll(), r))
    );

    // 一键操作栏：作物选择 + 可勾选的 收获/浇水/播种 组合，按顺序执行
    const cropSelect = this.root.querySelector("#quick-crop") as HTMLSelectElement;
    const renderCropOptions = () => {
      const unlocked = this.farm.config.crops.filter((c) => c.unlockLevel <= this.farm.player.farmLevel);
      // 已解锁作物集合未变化时跳过重建，避免每秒刷新丢失用户选择
      const signature = unlocked.map((c) => c.id).join(",");
      if (cropSelect.dataset.signature === signature && cropSelect.options.length > 0) return;
      const prev = cropSelect.value;
      cropSelect.innerHTML = unlocked
        .map((c) => `<option value="${c.id}">${c.icon} ${c.name}（💰${c.seedPrice}/株）</option>`)
        .join("");
      // 恢复用户之前的选择；若该作物刚被解锁列表移除则回落到第一项
      if (unlocked.some((c) => c.id === prev)) cropSelect.value = prev;
      cropSelect.dataset.signature = signature;
    };
    renderCropOptions();
    this.renderCropOptions = renderCropOptions;

    // 勾选项持久化到 localStorage，记住用户偏好
    const OPT_KEY = "farm-quick-opts";
    const optBoxes = {
      harvest: this.root.querySelector("#opt-harvest") as HTMLInputElement,
      water: this.root.querySelector("#opt-water") as HTMLInputElement,
      plant: this.root.querySelector("#opt-plant") as HTMLInputElement,
    };
    try {
      const saved = JSON.parse(localStorage.getItem(OPT_KEY) ?? "{}");
      for (const key of Object.keys(optBoxes) as Array<keyof typeof optBoxes>) {
        if (typeof saved[key] === "boolean") optBoxes[key].checked = saved[key];
        else optBoxes[key].checked = true; // 默认全选
      }
    } catch {
      for (const box of Object.values(optBoxes)) box.checked = true;
    }
    for (const box of Object.values(optBoxes)) {
      box.addEventListener("change", () => {
        const state = Object.fromEntries(
          Object.entries(optBoxes).map(([k, b]) => [k, b.checked])
        );
        try {
          localStorage.setItem(OPT_KEY, JSON.stringify(state));
        } catch {
          /* ignore */
        }
      });
    }

    this.root.querySelector("#btn-quick")!.addEventListener("click", () => {
      const enabled = (Object.keys(optBoxes) as Array<keyof typeof optBoxes>).filter((k) => optBoxes[k].checked);
      if (enabled.length === 0) {
        this.toast("请至少勾选一个操作（收获 / 浇水 / 播种）", "error");
        return;
      }
      const parts: string[] = [];
      if (optBoxes.harvest.checked) {
        const n = this.farm.harvestAll();
        if (n) parts.push(`收获 ×${n}`);
      }
      if (optBoxes.water.checked) {
        const n = this.farm.waterAll();
        if (n) parts.push(`浇水 ×${n}`);
      }
      if (optBoxes.plant.checked) {
        const n = this.farm.plantAll(cropSelect.value);
        if (n) parts.push(`播种 ×${n}`);
      }
      if (parts.length === 0) {
        this.toast("没有可执行的操作（无成熟 / 未浇水 / 空地）");
      } else {
        this.toast(`⚡ ${parts.join(" · ")}`, "gold");
      }
      this.renderAll();
    });

    // Debug 开关
    const toggle = this.root.querySelector("#debug-toggle") as HTMLElement;
    if (this.showDebug) {
      toggle.style.display = "";
      toggle.addEventListener("click", () => {
        if (this.debugPanel) {
          this.debugPanel.remove();
          this.debugPanel = null;
        } else {
          this.debugPanel = createDebugPanel(this.farm, this.clock, () => this.renderAll());
          document.body.appendChild(this.debugPanel);
        }
      });
    }
  }

  private subscribeEvents(): void {
    this.events.on("CropMatured", ({ plotId }) => {
      this.toast(`✅ ${plotId} 的作物成熟了！`);
    });
    this.events.on("MutationTriggered", ({ plotId, mutationId }) => {
      const name = this.farm.config.mutationMap.get(mutationId)?.name ?? mutationId;
      this.toast(`🌟 ${plotId} 触发${name}！`, "gold");
    });
    this.events.on("FarmLeveledUp", ({ level }) => {
      this.toast(`🎉 农场升级到 Lv.${level}！`, "gold");
    });
    this.events.on("CollectionUnlocked", ({ displayName }) => {
      this.toast(`📖 NEW DISCOVERY：${displayName}`, "gold");
    });
  }

  /** 稀有变异"中奖"反馈 */
  showJackpot(r: {
    displayName: string;
    mutations: string[];
    value: number;
    multiplier: number;
    exp: number;
    isNewDiscovery: boolean;
    cropIcon: string;
  }): void {
    const jp = document.createElement("div");
    jp.className = "jackpot";
    const mutNames = r.mutations
      .map((m) => this.farm.config.mutationMap.get(m)?.name ?? m)
      .join(" + ");
    jp.innerHTML = `
      <div class="card">
        <div class="title">${r.mutations.length > 0 ? "✨ 稀有变异！" : "🧺 收获"}</div>
        <div class="name">${r.cropIcon} ${r.displayName}</div>
        <div class="detail">
          ${mutNames ? `变异：${mutNames}<br/>` : ""}
          变异倍率：×${r.multiplier}<br/>
          价值：${r.value.toLocaleString()} 金币 · +${r.exp} EXP
        </div>
        ${r.isNewDiscovery ? '<div class="new-discovery">📖 NEW DISCOVERY!</div>' : ""}
      </div>
    `;
    document.body.appendChild(jp);
    setTimeout(() => jp.remove(), r.mutations.length > 0 ? 2200 : 1200);
  }

  toast(text: string, type: "" | "error" | "gold" = ""): void {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = text;
    this.toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  /** 显示离线结算提示 */
  showOfflineReport(report: { offlineDuration: number; newlyMaturedCount: number }): void {
    if (report.offlineDuration < 5 || report.newlyMaturedCount === 0) return;
    this.offlineBanner.innerHTML = `🌙 离线 ${formatTime(report.offlineDuration)}，期间有 <b>${report.newlyMaturedCount}</b> 株作物成熟，请及时收获。`;
  }

  renderHud(): void {
    const p = this.farm.player;
    this.root.querySelector("#hud-level")!.textContent = `Lv.${p.farmLevel}`;
    this.root.querySelector("#hud-exp")!.textContent = `${p.farmExp}`;
    this.root.querySelector("#hud-coins")!.textContent = p.coins.toLocaleString();
    const req = this.farm.levels.getRequiredExp(p.farmLevel);
    (this.root.querySelector("#hud-expbar") as HTMLElement).style.width =
      `${Math.min(100, (p.farmExp / req) * 100)}%`;
  }

  renderGrid(): void {
    this.grid.innerHTML = "";
    let unlockedCount = 0;
    for (const plot of this.farm.plots) {
      if (plot.unlockState === "locked") continue;
      unlockedCount += 1;
      const el = renderPlot(plot, this.farm, this.farm.config);
      el.addEventListener("click", () => {
        this.farm.sync();
        const popup = openPlotPopup(this.farm, plot, () => {
          this.plotPopupTick = null;
          this.renderAll();
        });
        document.body.appendChild(popup.el);
        this.plotPopupTick = popup.tick;
        this.renderAll();
      });
      this.grid.appendChild(el);
    }
    // 只占一格的"待解锁"提示，避免渲染全部预留土地导致页面过长
    const nextLock = this.farm.config.farmLevels.find((l) => l.unlockedPlots > unlockedCount);
    if (nextLock) {
      const tile = document.createElement("div");
      tile.className = "plot locked lock-hint";
      tile.innerHTML = `<span class="lock-mark">🔒</span><div class="lock-text">Lv.${nextLock.level}<br/>+${nextLock.unlockedPlots - unlockedCount} 块</div>`;
      this.grid.appendChild(tile);
    }
  }

  /**
   * 每秒轻量刷新：只原地更新土地进度/倒计时/HUD，不重建 DOM、不丢事件监听。
   * 完整重建（renderAll）仅在操作/弹窗后触发。
   */
  tick(): void {
    this.farm.processGrowth();
    for (const child of Array.from(this.grid.children)) {
      const plotId = (child as HTMLElement).dataset.plotId;
      if (!plotId) continue;
      const plot = this.farm.getPlot(plotId);
      if (plot) renderPlotContent(child as HTMLElement, plot, this.farm, this.farm.config);
    }
    this.renderHud();
    // 打开中的土地弹窗同步刷新（进度 / 变异时间线 / 3D 模型）
    this.plotPopupTick?.();
  }

  renderAll(): void {
    this.renderHud();
    this.renderGrid();
    this.renderCropOptions();
  }
}
