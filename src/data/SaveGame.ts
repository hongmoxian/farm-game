import type { Player, WarehouseItem, CollectionEntry, Statistics } from "./Player";
import type { Plot } from "./Plot";

/** 存档版本号：字段新增必须保证旧档可读（migration） */
export const SAVE_VERSION = 1;

export interface SaveGame {
  saveVersion: number;
  player: Player;
  plots: Plot[];
  /** cropId -> 数量 */
  seedInventory: Record<string, number>;
  warehouse: WarehouseItem[];
  collectionBook: CollectionEntry[];
  statistics: Statistics;
  lastSaveTimestamp: number;
  /** RNG seed，保证可复现 */
  rngSeed: number;
  /** 当前 Debug 时间加速倍率 */
  timeScale: number;
}

export interface MigrationResult {
  data: SaveGame;
  migratedFrom: number;
}

/** 存档迁移函数表：v(n) -> v(n+1) */
export const migrations: Record<number, (data: any) => any> = {
  // 示例：v1 -> v2 时新增字段可在此补齐默认值
  // 1: (d) => ({ ...d, warehouseCapacity: 9999, saveVersion: 2 }),
};

/** 将任意旧版本存档迁移到当前版本 */
export function migrateSave(raw: any): SaveGame {
  let data = raw;
  let from = typeof raw?.saveVersion === "number" ? raw.saveVersion : 1;
  while (data.saveVersion < SAVE_VERSION) {
    const step = migrations[data.saveVersion];
    data = step ? step(data) : { ...data, saveVersion: data.saveVersion + 1 };
  }
  // 兜底补齐缺失字段（比 SAVE_VERSION 更老的破坏性情况）
  return { ...data, saveVersion: SAVE_VERSION } as SaveGame;
}
