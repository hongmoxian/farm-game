/** 玩家数据：等级 / 经验 / 金币 */
export interface Player {
  farmLevel: number;
  farmExp: number;
  coins: number;
}

/** 仓库条目：同作物+同变异组合（含词条）+同品质 堆叠 */
export interface WarehouseItem {
  /** 堆叠 key：cropId|mutation[:variant]...|quality */
  key: string;
  cropId: string;
  mutations: string[];
  /** 类别 -> 词条 id（如 color -> peach） */
  variants?: Record<string, string>;
  quality: string;
  quantity: number;
  /** 出售单价（已含变异/品质倍率与上限） */
  unitValue: number;
  harvestTimestamp: number;
}

/** 图鉴条目 */
export interface CollectionEntry {
  /** key：cropId|mutation[:variant]... */
  key: string;
  cropId: string;
  mutations: string[];
  /** 类别 -> 词条 id */
  variants?: Record<string, string>;
  displayName: string;
  firstDiscoveryTimestamp: number;
  harvestCount: number;
  highestMultiplier: number;
  highestValue: number;
}

/** 统计数据 */
export interface Statistics {
  totalHarvests: number;
  totalCropsSold: number;
  totalCoinsEarned: number;
  totalMutations: number;
  rareMutationCount: number;
  highestCropValue: number;
  highestMultiplier: number;
  playTime: number;
}

export function createEmptyStatistics(): Statistics {
  return {
    totalHarvests: 0,
    totalCropsSold: 0,
    totalCoinsEarned: 0,
    totalMutations: 0,
    rareMutationCount: 0,
    highestCropValue: 0,
    highestMultiplier: 1,
    playTime: 0,
  };
}
