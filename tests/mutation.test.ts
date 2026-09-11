import { describe, it, expect } from "vitest";
import { makeTestFarm, buyAndPlant } from "./helpers";

/**
 * 变异 / 成长 / 经济系统测试。
 * 通过把 baseChance 设为 1 强制每次 checkpoint 必出变异，验证规则逻辑。
 */
function forceMutations(farm: any, chance = 1) {
  farm.config.mutationConfig.baseChance = chance;
}

describe("作物成长", () => {
  it("播种直接扣除金币（无需先购买种子）", () => {
    const { farm } = makeTestFarm();
    const before = farm.player.coins;
    expect(farm.plantSeed("p0", "wheat")).toBeNull();
    expect(farm.player.coins).toBe(before - 10);
  });

  it("金币不足无法播种", () => {
    const { farm } = makeTestFarm();
    farm.player.coins = 0;
    expect(farm.plantSeed("p0", "wheat")).toContain("金币不足");
  });

  it("达到成长时间后成熟", () => {
    const { farm, clock } = makeTestFarm();
    buyAndPlant(farm, "p0", "wheat"); // 20s
    clock.advance(19);
    farm.sync();
    expect(farm.getPlot("p0")!.harvestable).toBe(false);
    clock.advance(2); // 21s
    farm.sync();
    const plot = farm.getPlot("p0")!;
    expect(plot.harvestable).toBe(true);
    expect(plot.crop!.growthStage).toBe("mature");
  });

  it("浇水使剩余成长时间减少 10%，且每周期仅一次有效", () => {
    const { farm, clock } = makeTestFarm();
    buyAndPlant(farm, "p0", "carrot"); // 30s
    clock.advance(10); // 剩余 20s
    farm.sync();
    expect(farm.water("p0")).toBeNull();
    // 浇水后剩余应约为 18s（减少 2s）
    const remaining1 = farm.state.plots[0].crop!.plantTimestamp;
    expect(farm.water("p0")).toContain("已经浇过水");
    // 剩余时间确实被缩短：20s 剩余减为 18s，推进 18.5s 应成熟（不浇水则不够）
    clock.advance(18.5);
    farm.sync();
    expect(farm.getPlot("p0")!.harvestable).toBe(true);
    void remaining1;
  });
});

describe("变异系统", () => {
  it("离线跨多个 checkpoint 时全部判定且 maxMutationCount 生效", () => {
    const { farm, clock } = makeTestFarm();
    farm.player.farmLevel = 8; // color/crystal/giant 解锁
    forceMutations(farm, 1);
    buyAndPlant(farm, "p0", "watermelon"); // 240s, maxMut=3, 4 个 checkpoint
    clock.advance(240);
    farm.sync();
    const muts = farm.getPlot("p0")!.crop!.mutationList;
    expect(muts.length).toBe(3); // 4 次 roll，最多 3 个（maxMutationCount）
    // 同类变异不重复
    expect(new Set(muts).size).toBe(muts.length);
  });

  it("同一 checkpoint 不会重复 roll", () => {
    const { farm, clock } = makeTestFarm();
    farm.player.farmLevel = 10;
    forceMutations(farm, 1);
    buyAndPlant(farm, "p0", "watermelon");
    clock.advance(61); // 刚过 25% checkpoint
    farm.sync();
    const p1 = farm.getPlot("p0")!.crop!.processedProgress;
    const n1 = farm.getPlot("p0")!.crop!.mutationList.length;
    farm.sync(); // 同一时刻再次处理
    expect(farm.getPlot("p0")!.crop!.processedProgress).toBe(p1);
    expect(farm.getPlot("p0")!.crop!.mutationList.length).toBe(n1);
    clock.advance(0.1); // 未到下一 checkpoint（50% = 120s）
    farm.sync();
    expect(farm.getPlot("p0")!.crop!.mutationList.length).toBe(n1);
  });

  it("变异概率与权重可配置（修改配置即生效）", () => {
    const { farm, clock } = makeTestFarm();
    farm.player.farmLevel = 10;
    forceMutations(farm, 0); // 概率 0 → 永不变异
    buyAndPlant(farm, "p0", "strawberry");
    clock.advance(120);
    farm.sync();
    expect(farm.getPlot("p0")!.crop!.mutationList.length).toBe(0);
  });

  it("低等级不会触发未解锁的变异类型", () => {
    const { farm, clock } = makeTestFarm();
    forceMutations(farm, 1); // 必定 roll，但等级 1 无可变异类型
    buyAndPlant(farm, "p0", "wheat");
    clock.advance(20);
    farm.sync();
    expect(farm.getPlot("p0")!.crop!.mutationList.length).toBe(0);
  });
});

describe("经济系统", () => {
  it("finalPrice = base × 变异倍率乘积（颜色×1.5 × 巨大化×8）", () => {
    const { farm } = makeTestFarm();
    const def = farm.getCropDef("watermelon")!;
    const r = farm.economy.calculateCropValue(def, ["giant", "color"]);
    expect(r.multiplier).toBeCloseTo(12);
    expect(r.value).toBe(290 * 12);
  });

  it("MAX_PRICE_MULTIPLIER 截断倍率", () => {
    const { farm } = makeTestFarm();
    const def = farm.getCropDef("watermelon")!;
    // 颜色×1.5 × 材质×2.5 × 巨大化×8 = 30 > 临时上限 25
    farm.config.mutationConfig.maxPriceMultiplier = 25;
    const r = farm.economy.calculateCropValue(def, ["color", "material", "giant"]);
    expect(r.capped).toBe(true);
    expect(r.multiplier).toBe(25);
    expect(r.value).toBe(290 * 25);
  });

  it("三类变异全齐达到理论极限 ×30，恰好不被上限截断", () => {
    const { farm } = makeTestFarm();
    const def = farm.getCropDef("watermelon")!;
    const r = farm.economy.calculateCropValue(def, ["color", "material", "giant"]);
    expect(r.capped).toBe(false);
    expect(r.multiplier).toBe(30);
  });
});
