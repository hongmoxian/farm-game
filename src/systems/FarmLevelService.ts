import type { Player } from "../data/Player";
import type { GameConfig, FarmLevelDefinition } from "../config/GameConfig";

export interface UpgradeCheck {
  canUpgrade: boolean;
  expEnough: boolean;
  coinsEnough: boolean;
  requiredExp: number;
  upgradeCost: number;
  nextLevel: number;
}

/**
 * FarmLevelService：农场等级 / 升级判定。
 * 数值全部来自 farm_levels.json。
 */
export class FarmLevelService {
  constructor(private config: GameConfig) {}

  getLevelDef(level: number): FarmLevelDefinition {
    return this.config.levelMap.get(level) ?? this.config.farmLevels[this.config.farmLevels.length - 1];
  }

  getMaxLevel(): number {
    return this.config.farmLevels[this.config.farmLevels.length - 1].level;
  }

  /** 当前等级累计需要达到的经验（升级门槛） */
  getRequiredExp(level: number): number {
    return this.getLevelDef(level).requiredExp;
  }

  checkUpgrade(player: Player): UpgradeCheck {
    const def = this.getLevelDef(player.farmLevel);
    const next = player.farmLevel + 1;
    const maxed = player.farmLevel >= this.getMaxLevel();
    return {
      canUpgrade: !maxed && player.farmExp >= def.requiredExp && player.coins >= def.upgradeCost,
      expEnough: maxed || player.farmExp >= def.requiredExp,
      coinsEnough: maxed || player.coins >= def.upgradeCost,
      requiredExp: def.requiredExp,
      upgradeCost: def.upgradeCost,
      nextLevel: next,
    };
  }

  /**
   * 执行升级：需要 EXP 达标 且 支付升级金币。
   * 返回 null 表示成功，否则为失败原因。
   */
  upgrade(player: Player): string | null {
    const check = this.checkUpgrade(player);
    if (player.farmLevel >= this.getMaxLevel()) return "已达最高等级";
    if (!check.expEnough) return "经验不足";
    if (!check.coinsEnough) return "金币不足";
    player.coins -= check.upgradeCost;
    player.farmLevel += 1;
    return null;
  }

  /** 该等级解锁的地块数量 */
  getUnlockedPlots(level: number): number {
    return this.getLevelDef(level).unlockedPlots;
  }
}
