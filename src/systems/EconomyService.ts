import type { CropDefinition, Quality } from "../data/CropDefinition";
import type { GameConfig } from "../config/GameConfig";

export interface PriceResult {
  multiplier: number;
  value: number;
  /** 是否被 MAX_PRICE_MULTIPLIER 截断 */
  capped: boolean;
}

/**
 * EconomyService：统一经济计算。
 * 售价公式唯一出处，禁止在 UI 中重复实现。
 */
export class EconomyService {
  constructor(private config: GameConfig) {}

  /**
   * finalMultiplier = min(∏ mutationMultiplier × qualityMultiplier, MAX_PRICE_MULTIPLIER)
   * finalPrice = round(baseSellPrice × finalMultiplier)
   */
  calculateCropValue(def: CropDefinition, mutations: string[], quality: Quality = "normal"): PriceResult {
    const cap = this.config.mutationConfig.maxPriceMultiplier;
    let mult = 1;
    for (const id of mutations) {
      const m = this.config.mutationMap.get(id);
      if (m) mult *= m.multiplier;
    }
    mult *= this.config.economy.qualityMultiplier[quality] ?? 1;
    const capped = mult > cap;
    const multiplier = Math.min(mult, cap);
    return { multiplier, value: Math.round(def.baseSellPrice * multiplier), capped };
  }

  /**
   * 变异组合的展示名，如 "巨大桃霞铸铁西瓜"。
   * 有词条的类别（颜色/材质）用词条名作前缀，无词条类别用 prefix（巨大化）。
   */
  displayName(def: CropDefinition, mutations: string[], variants?: Record<string, string>): string {
    const order = this.config.mutationConfig.displayOrder;
    const sorted = [...mutations].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    let name = def.name;
    for (const id of sorted) {
      const m = this.config.mutationMap.get(id);
      if (!m) continue;
      const variant = variants?.[id] ? m.variants?.find((v) => v.id === variants[id]) : undefined;
      name = (variant ? variant.name : m.prefix) + name;
    }
    return name;
  }
}
