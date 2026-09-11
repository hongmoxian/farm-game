import type { CropInstance } from "./CropInstance";

/** 土地状态机 */
export type PlotState = "LOCKED" | "EMPTY" | "PLANTED" | "GROWING" | "MATURE" | "WITHERED";

/**
 * Plot：一块土地。只保存 cropId 引用 + 种植实例，不保存作物定义。
 */
export interface Plot {
  plotId: string;
  /** 网格坐标（UI 布局用） */
  row: number;
  col: number;
  unlockState: "locked" | "unlocked";
  /** 当前作物实例；空地为 null */
  crop: CropInstance | null;
  /** 派生状态：EMPTY/PLANTED/GROWING/MATURE/WITHERED（WITHERED 第一版保留接口不启用） */
  state: PlotState;
  harvestable: boolean;
}

/** 创建初始土地网格：rows x cols，defaultUnlocked 数量内的地块解锁 */
export function createPlots(maxPlots: number, defaultUnlocked: number): Plot[] {
  const cols = 4; // 4 列网格
  const plots: Plot[] = [];
  for (let i = 0; i < maxPlots; i++) {
    plots.push({
      plotId: `p${i}`,
      row: Math.floor(i / cols),
      col: i % cols,
      unlockState: i < defaultUnlocked ? "unlocked" : "locked",
      crop: null,
      state: i < defaultUnlocked ? "EMPTY" : "LOCKED",
      harvestable: false,
    });
  }
  return plots;
}
