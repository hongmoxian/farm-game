import type { Plot } from "../data/Plot";
import type { CropDefinition } from "../data/CropDefinition";
import { CropGrowthSystem } from "./CropGrowthSystem";

export interface OfflineReport {
  /** 离线时长（秒） */
  offlineDuration: number;
  /** 离线期间新成熟的作物数 */
  newlyMaturedCount: number;
  /** 离线期间新触发的变异总数（由成长系统处理时统计） */
  newlyMaturedPlotIds: string[];
}

/**
 * OfflineProgressService：离线结算。
 * 不逐秒模拟 —— 直接根据 plantTimestamp 与 lastUpdateTimestamp 重算进度，
 * 跨越的 mutation checkpoint 由 MutationSystem.processCrop 统一补执行。
 */
export class OfflineProgressService {
  /** 在读取存档后、开始游戏前调用：先得到离线概况（供 UI 提示） */
  static computeReport(plots: Plot[], cropMap: Map<string, CropDefinition>, lastSave: number, now: number): OfflineReport {
    const report: OfflineReport = {
      offlineDuration: Math.max(0, now - lastSave),
      newlyMaturedCount: 0,
      newlyMaturedPlotIds: [],
    };
    if (report.offlineDuration <= 0) return report;
    for (const plot of plots) {
      if (!plot.crop || plot.unlockState === "locked") continue;
      const def = cropMap.get(plot.crop.cropId);
      if (!def) continue;
      const wasMature = CropGrowthSystem.getProgress(plot.crop, def, lastSave) >= 1;
      const isMature = CropGrowthSystem.getProgress(plot.crop, def, now) >= 1;
      if (!wasMature && isMature) {
        report.newlyMaturedCount += 1;
        report.newlyMaturedPlotIds.push(plot.plotId);
      }
    }
    return report;
  }
}
