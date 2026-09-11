import type { CropDefinition } from "../data/CropDefinition";
import type { Player } from "../data/Player";
import type { GameConfig } from "../config/GameConfig";

export interface ShopItem {
  cropId: string;
  name: string;
  icon: string;
  price: number;
  unlockLevel: number;
  unlocked: boolean;
  growthTime: number;
  baseSellPrice: number;
  maxMutationCount: number;
  rarity: string;
  description: string;
}

/**
 * ShopService：种子商店逻辑。
 * 未解锁 → 锁定展示；已解锁且金币足够才允许购买。
 */
export class ShopService {
  constructor(private config: GameConfig) {}

  getShopItems(player: Player): ShopItem[] {
    return this.config.crops.map((c) => ({
      cropId: c.id,
      name: c.name,
      icon: c.icon,
      price: c.seedPrice,
      unlockLevel: c.unlockLevel,
      unlocked: c.unlockLevel <= player.farmLevel,
      growthTime: c.growthTime,
      baseSellPrice: c.baseSellPrice,
      maxMutationCount: c.maxMutationCount,
      rarity: c.rarity,
      description: c.description,
    }));
  }

  /** 返回 null 表示成功，否则为失败原因 */
  buySeed(player: Player, seedInventory: Record<string, number>, cropId: string, quantity = 1): string | null {
    const def: CropDefinition | undefined = this.config.cropMap.get(cropId);
    if (!def) return "未知作物";
    if (def.unlockLevel > player.farmLevel) return "农场等级不足，尚未解锁";
    const cost = def.seedPrice * quantity;
    if (player.coins < cost) return "金币不足";
    player.coins -= cost;
    seedInventory[cropId] = (seedInventory[cropId] ?? 0) + quantity;
    return null;
  }
}
