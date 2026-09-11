import type { Quality } from "./CropDefinition";

/**
 * CropInstance：描述"这一株番茄现在怎么样"——每株作物的动态状态。
 * 只记录 cropId 引用，不复制作物定义。
 */
export interface CropInstance {
  cropId: string;
  /** 播种时的虚拟时间戳（秒）。浇水通过前移该时间戳实现"减少剩余成长时间" */
  plantTimestamp: number;
  /** 最近一次被成长系统处理的时间戳（离线补算的起点） */
  lastUpdateTimestamp: number;
  /** 已完成变异判定的成长进度（0~1），保证同一 checkpoint 不重复 roll */
  processedProgress: number;
  growthStage: "seed" | "sprout" | "growing" | "mature";
  /** 已触发的变异 id 列表（类别 id：color / material / giant） */
  mutationList: string[];
  /** 类别 -> 抽中的词条 id（如 color -> peach 表示"桃霞"） */
  variants?: Record<string, string>;
  /** 变异发生记录：在哪个 checkpoint 触发了什么（成长过程展示用） */
  mutationEvents?: Array<{ checkpoint: number; mutationId: string; variantId?: string }>;
  /** 本成长周期是否已浇水（每周期仅一次有效） */
  watered: boolean;
  quality: Quality;
  /** 调试：播种时强制指定的变异（可null） */
  debugForceMutationId?: string | null;
}
