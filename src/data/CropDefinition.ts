/** 品质（第一版仅保留数据结构，规则后置） */
export type Quality = "normal" | "fine" | "rare" | "epic" | "legendary";

/**
 * CropDefinition：描述"番茄是什么"——静态定义，来自配置。
 * 与 CropInstance（"这一株番茄现在怎么样"）严格分离。
 */
export interface CropDefinition {
  id: string;
  name: string;
  icon: string;
  /** 基础色（3D 预览 / UI 用） */
  color: string;
  /** 3D 植物原型（程序化建模兜底）：grain/leafy/bush/ground/stalk/tree/cactus */
  model: "grain" | "leafy" | "bush" | "ground" | "stalk" | "tree" | "cactus";
  /** GLB 模型文件（public/models 下），优先于程序化原型 */
  gltfFile?: string;
  /** 3D 模型整体染色为 color 字段的颜色（用于复用模型表现不同作物） */
  tint3d?: boolean;
  unlockLevel: number;
  seedPrice: number;
  baseSellPrice: number;
  /** 成长时间（秒，scale=1 时） */
  growthTime: number;
  expReward: number;
  rarity: "common" | "rare" | "epic" | "legendary";
  mutationAllowed: boolean;
  maxMutationCount: number;
  /** 额外变异概率加成（如草莓 +0.03） */
  mutationRateBonus: number;
  description: string;
}
