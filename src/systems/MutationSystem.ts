import type { CropDefinition } from "../data/CropDefinition";
import type { CropInstance } from "../data/CropInstance";
import type { GameConfig, MutationDefinition } from "../config/GameConfig";
import type { RandomService } from "../core/RandomService";

/** 变异判定上下文：未来浇水/肥料/天气/NPC 祝福等加成在此扩展 */
export interface MutationContext {
  cropId: string;
  farmLevel: number;
  currentGrowthProgress: number;
  existingMutations: string[];
  waterBonus: number;
  fertilizerBonus: number;
  eventBonus: number;
  /** 调试：强制触发（可指定变异 id） */
  debugForce?: string | null;
}

export interface MutationResult {
  triggered: boolean;
  mutationId: string | null;
}

export interface ProcessReport {
  newMutations: string[];
  checkpointRolled: number[];
  matured: boolean;
}

/**
 * MutationSystem：按成长进度 checkpoint（25%/50%/75%/成熟）分段判定变异。
 * 只依据 processedProgress → currentProgress 区间判定，因此在线/离线走同一套规则，
 * 同一 checkpoint 天然不会重复 roll。
 */
export class MutationSystem {
  constructor(private config: GameConfig) {}

  private eligibleMutationIds(ctx: MutationContext): MutationDefinition[] {
    const crop = this.config.cropMap.get(ctx.cropId);
    if (!crop || !crop.mutationAllowed) return [];
    const count = this.config.mutationConfig.mutations.length;
    void count;
    return this.config.mutationConfig.mutations.filter(
      (m) =>
        m.unlockLevel <= ctx.farmLevel &&
        !ctx.existingMutations.includes(m.id) &&
        ctx.existingMutations.length < crop.maxMutationCount
    );
  }

  /** 单个 checkpoint 的变异判定 */
  roll(ctx: MutationContext, rng: RandomService): MutationResult {
    const pool = this.eligibleMutationIds(ctx);
    if (pool.length === 0) return { triggered: false, mutationId: null };

    // 调试强制
    if (ctx.debugForce) {
      const forced = ctx.debugForce === "any"
        ? pool[0]
        : pool.find((m) => m.id === ctx.debugForce) ?? pool[0];
      return { triggered: true, mutationId: forced.id };
    }

    const crop = this.config.cropMap.get(ctx.cropId)!;
    const chance =
      this.config.mutationConfig.baseChance +
      crop.mutationRateBonus +
      ctx.waterBonus +
      ctx.fertilizerBonus +
      ctx.eventBonus;

    if (!rng.rollProbability(chance)) return { triggered: false, mutationId: null };

    const idx = rng.weightedChoice(pool.map((m) => m.weight));
    if (idx < 0) return { triggered: false, mutationId: null };
    return { triggered: true, mutationId: pool[idx].id };
  }

  /**
   * 推进一株作物：对 (processedProgress, targetProgress] 区间内经过的每个 checkpoint 判定。
   * 返回新增变异列表；同时更新 crop.processedProgress / growthStage。
   */
  processCrop(
    crop: CropInstance,
    def: CropDefinition,
    targetProgress: number,
    farmLevel: number,
    rng: RandomService,
    now: number
  ): ProcessReport {
    const from = crop.processedProgress;
    const newMutations: string[] = [];
    const rolled: number[] = [];

    for (const cp of this.config.mutationConfig.checkpoints) {
      if (cp > from && cp <= targetProgress) {
        rolled.push(cp);
        const result = this.roll(
          {
            cropId: crop.cropId,
            farmLevel,
            currentGrowthProgress: cp,
            existingMutations: crop.mutationList,
            waterBonus: 0,
            fertilizerBonus: 0,
            eventBonus: 0,
            debugForce: crop.debugForceMutationId ?? null,
          },
          rng
        );
        if (result.triggered && result.mutationId) {
          const category = this.config.mutationMap.get(result.mutationId);
          // 类别下随机抽取词条（颜色：桃霞/橙光/…；材质：铸铁/冰晶/…）
          let variantId: string | undefined;
          if (category?.variants && category.variants.length > 0) {
            const vi = rng.weightedChoice(category.variants.map(() => 1));
            variantId = category.variants[Math.max(0, vi)]?.id;
          }
          crop.mutationList.push(result.mutationId);
          if (!crop.variants) crop.variants = {};
          if (variantId) crop.variants[result.mutationId] = variantId;
          // 记录变异发生在哪个 checkpoint（成长过程展示用）
          if (!crop.mutationEvents) crop.mutationEvents = [];
          crop.mutationEvents.push({ checkpoint: cp, mutationId: result.mutationId, variantId });
          newMutations.push(result.mutationId);
          // 强制变异只生效一次
          crop.debugForceMutationId = null;
        }
      }
    }

    crop.processedProgress = Math.max(crop.processedProgress, targetProgress);
    const beforeStage = crop.growthStage;
    crop.growthStage = targetProgress >= 1 ? "mature" : CropGrowthStage(targetProgress);
    crop.lastUpdateTimestamp = now;
    return { newMutations, checkpointRolled: rolled, matured: beforeStage !== "mature" && crop.growthStage === "mature" };
  }
}

function CropGrowthStage(progress: number): CropInstance["growthStage"] {
  if (progress >= 1) return "mature";
  if (progress >= 0.6) return "growing";
  if (progress >= 0.25) return "sprout";
  return "seed";
}
