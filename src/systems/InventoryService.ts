import type { WarehouseItem, Player } from "../data/Player";
import type { CropDefinition, Quality } from "../data/CropDefinition";
import type { RandomService } from "../core/RandomService";
import type { EconomyService } from "./EconomyService";
import type { GameConfig } from "../config/GameConfig";

/**
 * InventoryService：种子库存 + 仓库管理。
 * 收获的作物先进仓库，由玩家决定出售或收藏。
 */
export class InventoryService {
  constructor(
    private config: GameConfig,
    private economy: EconomyService,
    private rng: RandomService
  ) {}

  // ---- 种子库存 ----

  getSeedCount(seedInventory: Record<string, number>, cropId: string): number {
    return seedInventory[cropId] ?? 0;
  }

  consumeSeed(seedInventory: Record<string, number>, cropId: string): boolean {
    const n = this.getSeedCount(seedInventory, cropId);
    if (n <= 0) return false;
    seedInventory[cropId] = n - 1;
    return true;
  }

  addSeeds(seedInventory: Record<string, number>, cropId: string, quantity: number): void {
    seedInventory[cropId] = (seedInventory[cropId] ?? 0) + quantity;
  }

  // ---- 仓库 ----

  static warehouseKey(cropId: string, mutations: string[], variants: Record<string, string> | undefined, quality: string): string {
    const parts = [...mutations].sort().map((m) => (variants?.[m] ? `${m}:${variants[m]}` : m));
    return `${cropId}|${parts.join("+")}|${quality}`;
  }

  /**
   * 品质判定（第一版简单规则：基础随机数 + 农场等级加成）。
   * 变异优先级高于品质 —— 品质只影响售价倍率的小幅加成。
   */
  rollQuality(player: Player): Quality {
    const weights = this.config.economy.qualityWeights;
    const ids = Object.keys(weights) as Quality[];
    // 农场等级略微提升高品质权重：level-1 次向 epic/legendary 倾斜
    const w = ids.map((id, i) => {
      const base = weights[id];
      return i >= 3 ? base * (1 + (player.farmLevel - 1) * 0.08) : base;
    });
    const idx = this.rng.weightedChoice(w);
    return ids[Math.max(0, idx)];
  }

  /** 收获物入仓（同组合含词条堆叠） */
  addToWarehouse(
    warehouse: WarehouseItem[],
    def: CropDefinition,
    mutations: string[],
    variants: Record<string, string> | undefined,
    quality: Quality,
    now: number
  ): WarehouseItem {
    const price = this.economy.calculateCropValue(def, mutations, quality);
    const key = InventoryService.warehouseKey(def.id, mutations, variants, quality);
    let item = warehouse.find((i) => i.key === key);
    if (item) {
      item.quantity += 1;
      item.unitValue = price.value; // 同品质价值一致
      item.harvestTimestamp = now;
    } else {
      item = {
        key,
        cropId: def.id,
        mutations: [...mutations].sort(),
        variants: variants ? { ...variants } : undefined,
        quality,
        quantity: 1,
        unitValue: price.value,
        harvestTimestamp: now,
      };
      warehouse.push(item);
    }
    return item;
  }

  /** 出售仓库条目；返回获得金币 */
  sellFromWarehouse(warehouse: WarehouseItem[], player: Player, key: string, quantity: number): number {
    const idx = warehouse.findIndex((i) => i.key === key);
    if (idx < 0) return 0;
    const item = warehouse[idx];
    const qty = Math.min(quantity, item.quantity);
    if (qty <= 0) return 0;
    const coins = item.unitValue * qty;
    player.coins += coins;
    item.quantity -= qty;
    if (item.quantity <= 0) warehouse.splice(idx, 1);
    return coins;
  }
}
