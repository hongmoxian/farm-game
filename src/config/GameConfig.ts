import cropsJson from "./crops.json";
import mutationsJson from "./mutations.json";
import farmLevelsJson from "./farm_levels.json";
import economyJson from "./economy.json";
import type { CropDefinition } from "../data/CropDefinition";
import type { Plot } from "../data/Plot";
import { createPlots } from "../data/Plot";
import { SAVE_VERSION, type SaveGame } from "../data/SaveGame";
import { createEmptyStatistics } from "../data/Player";

/** 全局常量（非数值平衡参数，平衡参数一律放 JSON 配置） */
export const MAX_PLOTS = 24;
export const SAVE_KEY = "farm-mutation-save";

/** 变异类别下的具体词条（如颜色变异的"桃霞"，材质变异的"铸铁"） */
export interface MutationVariant {
  id: string;
  name: string;
  /** 词条代表色（3D / UI 用） */
  color?: string;
}

export interface MutationDefinition {
  id: string;
  name: string;
  /** 无词条时的默认前缀（如巨大化的"巨大"） */
  prefix: string;
  multiplier: number;
  weight: number;
  unlockLevel: number;
  badge: string;
  /** 类别下的可选词条；触发该类别时随机抽一个 */
  variants?: MutationVariant[];
  /** 巨大化等体型类别的缩放 */
  scale?: number;
}

export interface MutationConfig {
  baseChance: number;
  checkpoints: number[];
  maxPriceMultiplier: number;
  displayOrder: string[];
  mutations: MutationDefinition[];
}

export interface FarmLevelDefinition {
  level: number;
  requiredExp: number;
  upgradeCost: number;
  unlockedCrops: string[];
  unlockedPlots: number;
  unlockedFeatures: string[];
}

export interface EconomyConfig {
  startingCoins: number;
  waterGrowthSpeedup: number;
  warehouseUnlimited: boolean;
  qualityWeights: Record<string, number>;
  qualityMultiplier: Record<string, number>;
}

export interface GameConfig {
  crops: CropDefinition[];
  cropMap: Map<string, CropDefinition>;
  mutationConfig: MutationConfig;
  mutationMap: Map<string, MutationDefinition>;
  farmLevels: FarmLevelDefinition[];
  levelMap: Map<number, FarmLevelDefinition>;
  economy: EconomyConfig;
  maxPlots: number;
}

/** 加载全部 JSON 配置（数据驱动：改数值只改配置文件）。深拷贝隔离，避免运行时修改配置互相污染 */
export function loadConfig(): GameConfig {
  const crops = structuredClone(cropsJson) as CropDefinition[];
  const mutationConfig = structuredClone(mutationsJson) as unknown as MutationConfig;
  const farmLevels = structuredClone(farmLevelsJson) as FarmLevelDefinition[];
  const economy = structuredClone(economyJson) as EconomyConfig;
  return {
    crops,
    cropMap: new Map(crops.map((c) => [c.id, c])),
    mutationConfig,
    mutationMap: new Map(mutationConfig.mutations.map((m) => [m.id, m])),
    farmLevels,
    levelMap: new Map(farmLevels.map((l) => [l.level, l])),
    economy,
    maxPlots: MAX_PLOTS,
  };
}

/** 创建全新存档 */
export function createNewSave(config: GameConfig): SaveGame {
  const lv1 = config.levelMap.get(1)!;
  const plots: Plot[] = createPlots(config.maxPlots, lv1.unlockedPlots);
  return {
    saveVersion: SAVE_VERSION,
    player: { farmLevel: 1, farmExp: 0, coins: config.economy.startingCoins },
    plots,
    seedInventory: {}, // 播种直接扣款，种子库存仅保留字段以兼容旧存档
    warehouse: [],
    collectionBook: [],
    statistics: createEmptyStatistics(),
    lastSaveTimestamp: 0,
    rngSeed: 0,
    timeScale: 1,
  };
}
