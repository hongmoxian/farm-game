import type { SaveGame } from "../data/SaveGame";
import { SAVE_VERSION, migrateSave } from "../data/SaveGame";

/** 存储适配器：浏览器 localStorage / 测试内存实现 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 存储不可用时静默失败，游戏仍可运行 */
    }
  }
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export class MemoryStorage implements StorageAdapter {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/**
 * SaveService：序列化 / 反序列化 / 迁移。
 * SAVE_VERSION 变化时经 migrateSave 升级，旧档不丢失。
 */
export class SaveService {
  constructor(private storage: StorageAdapter, private saveKey: string) {}

  save(data: SaveGame): void {
    data.saveVersion = SAVE_VERSION;
    this.storage.setItem(this.saveKey, JSON.stringify(data));
  }

  /** 读取并迁移存档；无档 / 损坏返回 null */
  load(): SaveGame | null {
    const raw = this.storage.getItem(this.saveKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.player) return null;
      return migrateSave(parsed);
    } catch {
      return null;
    }
  }

  clear(): void {
    this.storage.removeItem(this.saveKey);
  }

  exportSave(data: SaveGame): string {
    return JSON.stringify(data, null, 2);
  }

  importSave(json: string): SaveGame | null {
    try {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== "object" || !parsed.player) return null;
      return migrateSave(parsed);
    } catch {
      return null;
    }
  }
}
