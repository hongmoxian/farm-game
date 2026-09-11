import type { CropDefinition } from "../data/CropDefinition";
import type { CropInstance } from "../data/CropInstance";
import type { Plot, PlotState } from "../data/Plot";

/**
 * CropGrowthSystem：纯函数式成长计算。
 * 进度一律由时间戳推导（currentTime - plantTimestamp），不逐秒写存档 →
 * 天然支持离线成长：重新进入时按当前时间重算即可。
 */
export class CropGrowthSystem {
  /** 考虑浇水前移后的成长进度 [0, 1] */
  static getProgress(crop: CropInstance, def: CropDefinition, now: number): number {
    const elapsed = now - crop.plantTimestamp;
    return Math.max(0, Math.min(1, elapsed / def.growthTime));
  }

  /** 剩余成长秒数 */
  static getRemainingSeconds(crop: CropInstance, def: CropDefinition, now: number): number {
    return Math.max(0, def.growthTime - (now - crop.plantTimestamp));
  }

  /** 进度 -> 阶段（四阶段：seed / sprout / growing / mature） */
  static stageOfProgress(progress: number): CropInstance["growthStage"] {
    if (progress >= 1) return "mature";
    if (progress >= 0.6) return "growing";
    if (progress >= 0.25) return "sprout";
    return "seed";
  }

  /** 派生地块状态（WITHERED 第一版保留，不启用） */
  static resolvePlotState(plot: Plot, now: number, def?: CropDefinition): PlotState {
    if (plot.unlockState === "locked") return "LOCKED";
    if (!plot.crop) return "EMPTY";
    if (def) {
      const p = this.getProgress(plot.crop, def, now);
      return p >= 1 ? "MATURE" : p >= 0.02 ? "GROWING" : "PLANTED";
    }
    return plot.crop.growthStage === "mature" ? "MATURE" : "GROWING";
  }
}
