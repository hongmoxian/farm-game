import type { GameClock } from "../core/GameClock";
import type { RandomService } from "../core/RandomService";
import type { EventBus } from "../core/EventBus";
import type { GameConfig } from "../config/GameConfig";
import { createNewSave } from "../config/GameConfig";
import type { SaveGame } from "../data/SaveGame";
import type { Plot } from "../data/Plot";
import type { Player, WarehouseItem, CollectionEntry, Statistics } from "../data/Player";
import type { CropDefinition, Quality } from "../data/CropDefinition";
import { CropGrowthSystem } from "../systems/CropGrowthSystem";
import { MutationSystem } from "../systems/MutationSystem";
import { EconomyService } from "../systems/EconomyService";
import { ShopService } from "../systems/ShopService";
import { FarmLevelService } from "../systems/FarmLevelService";
import { CollectionService } from "../systems/CollectionService";
import { InventoryService } from "../systems/InventoryService";
import { OfflineProgressService, type OfflineReport } from "../systems/OfflineProgressService";
import type { SaveService } from "../systems/SaveService";

export interface HarvestResult {
  ok: boolean;
  reason?: string;
  cropId?: string;
  displayName?: string;
  mutations?: string[];
  value?: number;
  exp?: number;
  multiplier?: number;
  quality?: Quality;
  isNewDiscovery?: boolean;
  isRareMutation?: boolean;
}

/**
 * FarmService：游戏编排层。
 * 组合各系统，承载玩家操作（播种/浇水/收获/买卖/升级）与成长推进（在线/离线同一路径）。
 * 注意：不直接操作 UI / 动画，全部通过 EventBus 通知。
 */
export class FarmService {
  state!: SaveGame;
  readonly mutationSystem: MutationSystem;
  readonly economy: EconomyService;
  readonly shop: ShopService;
  readonly levels: FarmLevelService;
  readonly collection: CollectionService;
  readonly inventory: InventoryService;

  constructor(
    public config: GameConfig,
    public clock: GameClock,
    public rng: RandomService,
    public events: EventBus,
    public saveService: SaveService
  ) {
    this.mutationSystem = new MutationSystem(config);
    this.economy = new EconomyService(config);
    this.shop = new ShopService(config);
    this.levels = new FarmLevelService(config);
    this.collection = new CollectionService(config);
    this.inventory = new InventoryService(config, this.economy, rng);
  }

  // ================= 存档 / 初始化 =================

  /** 开始新游戏 */
  newGame(): void {
    this.state = createNewSave(this.config);
    this.state.rngSeed = this.rng.seed;
    this.save();
  }

  /** 读取存档；成功后立即按当前时间补算成长（离线结算） */
  load(): OfflineReport | null {
    const save = this.saveService.load();
    if (!save) return null;
    this.state = save;
    const now = this.clock.now();
    const report = OfflineProgressService.computeReport(
      save.plots,
      this.config.cropMap,
      save.lastSaveTimestamp,
      now
    );
    // 关键：离线成长与在线成长走同一条 processGrowth 路径（checkpoint 全部补执行）
    this.processGrowth(now);
    return report;
  }

  save(): void {
    this.state.lastSaveTimestamp = this.clock.now();
    this.state.timeScale = (this.clock as any).getSpeed?.() ?? 1;
    this.saveService.save(this.state);
  }

  // ================= 查询 =================

  get player(): Player {
    return this.state.player;
  }
  get plots(): Plot[] {
    return this.state.plots;
  }
  get warehouse(): WarehouseItem[] {
    return this.state.warehouse;
  }
  get collectionBook(): CollectionEntry[] {
    return this.state.collectionBook;
  }
  get statistics(): Statistics {
    return this.state.statistics;
  }

  getPlot(plotId: string): Plot | undefined {
    return this.state.plots.find((p) => p.plotId === plotId);
  }

  getCropDef(cropId: string): CropDefinition | undefined {
    return this.config.cropMap.get(cropId);
  }

  /** 播种/种植操作前需要调用的成长同步（保证 UI 看到的状态最新） */
  sync(now: number = this.clock.now()): void {
    this.processGrowth(now);
  }

  // ================= 成长推进（在线 / 离线唯一路径） =================

  /**
   * 推进所有已种植地块：
   * 从 crop.processedProgress 计算到当前进度，跨过的 checkpoint 全部判定，
   * 同一 checkpoint 不会重复 roll（processedProgress 持久化于存档）。
   */
  processGrowth(now: number = this.clock.now()): void {
    for (const plot of this.state.plots) {
      if (!plot.crop || plot.unlockState === "locked") continue;
      const def = this.config.cropMap.get(plot.crop.cropId);
      if (!def) continue;
      const crop = plot.crop;
      const progress = CropGrowthSystem.getProgress(crop, def, now);
      const from = crop.processedProgress;
      if (progress <= from) continue;

      const report = this.mutationSystem.processCrop(crop, def, progress, this.player.farmLevel, this.rng, now);

      // 事件通知
      const newStage = crop.growthStage;
      this.events.emit("CropStageChanged", { plotId: plot.plotId, stage: this.resolvePlotState(plot, now, def) });
      for (const m of report.newMutations) {
        this.state.statistics.totalMutations += 1;
        this.events.emit("MutationTriggered", { plotId: plot.plotId, cropId: crop.cropId, mutationId: m });
      }
      if (report.matured) {
        plot.harvestable = true;
        plot.state = "MATURE";
        this.events.emit("CropMatured", { plotId: plot.plotId, cropId: crop.cropId, mutations: [...crop.mutationList] });
      }
      void from;
    }
  }

  private resolvePlotState(plot: Plot, now: number, def?: CropDefinition): Plot["state"] {
    const s = CropGrowthSystem.resolvePlotState(plot, now, def);
    if (plot.unlockState === "locked") return "LOCKED";
    if (!plot.crop) return "EMPTY";
    return s;
  }

  // ================= 玩家操作 =================

  /** 一键种植：在所有空地上播种指定作物，逐块直接扣款（金币不足的地块跳过） */
  plantAll(cropId: string): number {
    let count = 0;
    for (const plot of [...this.plots]) {
      if (plot.unlockState === "unlocked" && !plot.crop) {
        if (this.plantSeed(plot.plotId, cropId) === null) count += 1;
      }
    }
    return count;
  }

  /** 一键浇水：给所有未浇水且未成熟的作物浇水 */
  waterAll(): number {
    this.sync();
    let count = 0;
    for (const plot of [...this.plots]) {
      if (plot.crop && !plot.crop.watered && !plot.harvestable) {
        if (this.water(plot.plotId) === null) count += 1;
      }
    }
    return count;
  }

  /** 一键收获：收获所有成熟作物 */
  harvestAll(): number {
    let count = 0;
    for (const plot of [...this.plots]) {
      if (plot.crop && plot.harvestable) {
        if (this.harvest(plot.plotId).ok) count += 1;
      }
    }
    return count;
  }

  /** 播种：直接扣除种子价格（无需先购买种子），金币不足则失败 */
  plantSeed(plotId: string, cropId: string): string | null {
    this.sync();
    const plot = this.getPlot(plotId);
    const def = this.config.cropMap.get(cropId);
    if (!plot) return "土地不存在";
    if (plot.unlockState === "locked") return "土地未解锁";
    if (plot.crop) return "土地上已有作物";
    if (!def) return "未知作物";
    if (def.unlockLevel > this.player.farmLevel) return "农场等级不足";
    if (this.player.coins < def.seedPrice) return "金币不足";
    this.player.coins -= def.seedPrice;
    this.events.emit("CoinsChanged", { coins: this.player.coins });

    const now = this.clock.now();
    plot.crop = {
      cropId,
      plantTimestamp: now,
      lastUpdateTimestamp: now,
      processedProgress: 0,
      growthStage: "seed",
      mutationList: [],
      variants: {},
      mutationEvents: [],
      watered: false,
      quality: "normal",
      debugForceMutationId: this.debugForceMutationId ?? null,
    };
    plot.harvestable = false;
    this.debugForceMutationId = null;
    plot.state = "PLANTED";
    this.events.emit("CropPlanted", { plotId, cropId });
    this.save();
    return null;
  }

  /**
   * 浇水：每个成长周期一次有效。
   * 实现：剩余成长时间减少 waterGrowthSpeedup 比例（前移 plantTimestamp）。
   */
  water(plotId: string): string | null {
    this.sync();
    const plot = this.getPlot(plotId);
    if (!plot || !plot.crop) return "这里没有作物";
    const def = this.config.cropMap.get(plot.crop.cropId)!;
    const now = this.clock.now();
    if (plot.crop.watered) return "这个成长周期已经浇过水了";
    if (plot.harvestable || CropGrowthSystem.getProgress(plot.crop, def, now) >= 1) return "作物已成熟，无需浇水";

    const remaining = CropGrowthSystem.getRemainingSeconds(plot.crop, def, now);
    plot.crop.plantTimestamp -= remaining * this.config.economy.waterGrowthSpeedup;
    plot.crop.watered = true;
    this.events.emit("WateredPlot", { plotId });
    this.sync(now); // 浇水可能使进度跨过 checkpoint，立即结算
    this.save();
    return null;
  }

  /** 收获：作物进仓库 + 图鉴 + 经验，土地恢复 EMPTY */
  harvest(plotId: string): HarvestResult {
    this.sync();
    const plot = this.getPlot(plotId);
    if (!plot || !plot.crop) return { ok: false, reason: "这里没有作物" };
    const crop = plot.crop;
    const def = this.config.cropMap.get(crop.cropId);
    if (!def) return { ok: false, reason: "未知作物" };
    if (!plot.harvestable && CropGrowthSystem.getProgress(crop, def, this.clock.now()) < 1) {
      return { ok: false, reason: "作物尚未成熟" };
    }

    // 品质（第一版：简单随机 + 等级加成）
    const quality = this.inventory.rollQuality(this.player);
    const price = this.economy.calculateCropValue(def, crop.mutationList, quality);
    const displayName = this.economy.displayName(def, crop.mutationList, crop.variants);
    const exp = def.expReward;
    const now = this.clock.now();

    // 入仓库
    this.inventory.addToWarehouse(this.state.warehouse, def, crop.mutationList, crop.variants, quality, now);

    // 图鉴
    const discovery = this.collection.record(
      this.state.collectionBook,
      def,
      crop.mutationList,
      crop.variants,
      price.multiplier,
      price.value,
      displayName,
      now
    );

    // 经验与统计
    this.player.farmExp += exp;
    const stats = this.state.statistics;
    stats.totalHarvests += 1;
    stats.highestCropValue = Math.max(stats.highestCropValue, price.value);
    stats.highestMultiplier = Math.max(stats.highestMultiplier, price.multiplier);
    if (crop.mutationList.length > 0) {
      stats.rareMutationCount += 1;
    }

    // 土地恢复
    plot.crop = null;
    plot.harvestable = false;
    plot.state = "EMPTY";

    this.events.emit("CropHarvested", {
      plotId,
      cropId: def.id,
      mutations: [...(discovery.entry.mutations)],
      value: price.value,
      exp,
      multiplier: price.multiplier,
      isNewDiscovery: discovery.isNew,
      isRareMutation: crop.mutationList.length > 0,
      displayName,
    });
    if (discovery.isNew) {
      this.events.emit("CollectionUnlocked", { cropId: def.id, mutations: discovery.entry.mutations, displayName });
    }
    this.save();
    return {
      ok: true,
      cropId: def.id,
      displayName,
      mutations: discovery.entry.mutations,
      value: price.value,
      exp,
      multiplier: price.multiplier,
      quality,
      isNewDiscovery: discovery.isNew,
      isRareMutation: crop.mutationList.length > 0,
    };
  }

  /** 从仓库出售；返回获得金币（0 表示失败） */
  sellWarehouseItem(key: string, quantity: number): number {
    const item = this.state.warehouse.find((i) => i.key === key);
    if (!item) return 0;
    const coins = this.inventory.sellFromWarehouse(this.state.warehouse, this.player, key, quantity);
    if (coins <= 0) return 0;
    this.state.statistics.totalCropsSold += quantity;
    this.state.statistics.totalCoinsEarned += coins;
    this.events.emit("ItemSold", { cropId: item.cropId, mutations: item.mutations, quantity, coins });
    this.events.emit("CoinsChanged", { coins: this.player.coins });
    this.save();
    return coins;
  }

  /** 农场升级；成功后同步解锁土地 */
  upgradeFarm(): string | null {
    const err = this.levels.upgrade(this.player);
    if (err) return err;
    this.applyUnlockedPlots();
    this.events.emit("FarmLeveledUp", { level: this.player.farmLevel });
    this.save();
    return null;
  }

  /** 按等级解锁土地（新解锁的地块进入 EMPTY 状态） */
  applyUnlockedPlots(): void {
    const count = this.levels.getUnlockedPlots(this.player.farmLevel);
    for (const plot of this.state.plots) {
      const idx = Number(plot.plotId.slice(1));
      if (idx < count && plot.unlockState === "locked") {
        plot.unlockState = "unlocked";
        plot.state = "EMPTY";
        this.events.emit("PlotUnlocked", { plotId: plot.plotId });
      }
    }
  }

  // ================= 调试 =================

  /** 下一株强制变异（'any' 或具体变异 id；null 取消） */
  debugForceMutationId: string | null = null;

  debugAddCoins(amount: number): void {
    this.player.coins += amount;
    this.events.emit("CoinsChanged", { coins: this.player.coins });
    this.save();
  }

  debugAddExp(amount: number): void {
    this.player.farmExp += amount;
    this.save();
  }

  debugSetLevel(level: number): void {
    this.player.farmLevel = Math.max(1, level);
    this.applyUnlockedPlots();
    this.save();
  }

  debugResetSave(): void {
    this.saveService.clear();
    this.newGame();
  }
}
