import type { CollectionEntry } from "../data/Player";
import type { CropDefinition } from "../data/CropDefinition";
import type { GameConfig } from "../config/GameConfig";

export interface DiscoveryResult {
  isNew: boolean;
  entry: CollectionEntry;
  /** 图鉴星级条件达成情况 */
  stars: number;
  starConditions: StarCondition[];
}

export interface StarCondition {
  id: string;
  label: string;
  achieved: boolean;
}

/**
 * CollectionService：图鉴收集。
 * 记录 cropId + 变异组合的首次发现；同一组合重复收获只累计计数。
 */
export class CollectionService {
  constructor(private config: GameConfig) {}

  static entryKey(cropId: string, mutations: string[], variants?: Record<string, string>): string {
    const parts = [...mutations].sort().map((m) => (variants?.[m] ? `${m}:${variants[m]}` : m));
    return `${cropId}|${parts.join("+")}`;
  }

  /**
   * 记录一次收获。新组合（含具体词条）→ 新发现；旧组合 → 累计并刷新最高值。
   */
  record(
    book: CollectionEntry[],
    def: CropDefinition,
    mutations: string[],
    variants: Record<string, string> | undefined,
    multiplier: number,
    value: number,
    displayName: string,
    now: number
  ): DiscoveryResult {
    const key = CollectionService.entryKey(def.id, mutations, variants);
    let entry = book.find((e) => e.key === key);
    const isNew = !entry;
    if (isNew) {
      entry = {
        key,
        cropId: def.id,
        mutations: [...mutations].sort(),
        variants: variants ? { ...variants } : undefined,
        displayName,
        firstDiscoveryTimestamp: now,
        harvestCount: 0,
        highestMultiplier: multiplier,
        highestValue: value,
      };
      book.push(entry);
    }
    entry!.harvestCount += 1;
    entry!.highestMultiplier = Math.max(entry!.highestMultiplier, multiplier);
    entry!.highestValue = Math.max(entry!.highestValue, value);
    const starConditions = this.getStarConditions(book, def.id);
    const stars = starConditions.filter((c) => c.achieved).length;
    return { isNew, entry: entry!, stars, starConditions };
  }

  /** 某作物已收集的组合条目 */
  getEntriesForCrop(book: CollectionEntry[], cropId: string): CollectionEntry[] {
    return book.filter((e) => e.cropId === cropId);
  }

  /**
   * 图鉴星级条件（第一版实现统计）：
   * 普通版本 / 颜色变异 / 材质变异 / 巨大化 / 双变异 / 三重变异 / 全变异
   */
  getStarConditions(book: CollectionEntry[], cropId: string): StarCondition[] {
    const entries = this.getEntriesForCrop(book, cropId);
    const has = (m?: string) => entries.some((e) => (m ? e.mutations.includes(m) : e.mutations.length === 0));
    const def = this.config.cropMap.get(cropId);
    return [
      { id: "normal", label: "收获普通版本", achieved: def ? has(undefined) : false },
      { id: "color", label: "获得一次颜色变异", achieved: has("color") },
      { id: "material", label: "获得一次材质变异", achieved: has("material") },
      { id: "giant", label: "获得一次巨大化", achieved: has("giant") },
      { id: "double", label: "获得双变异", achieved: entries.some((e) => e.mutations.length >= 2) },
      { id: "triple", label: "获得三重变异", achieved: entries.some((e) => e.mutations.length >= 3) },
    ];
  }

  /** 收集进度：已解锁作物数中收集到至少一个组合的数量 */
  getCollectionProgress(book: CollectionEntry[]): { collected: number; totalCrops: number } {
    const collectedCrops = new Set(book.map((e) => e.cropId));
    return { collected: collectedCrops.size, totalCrops: this.config.crops.length };
  }
}
