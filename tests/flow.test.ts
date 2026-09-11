import { describe, it, expect } from "vitest";
import { makeTestFarm, buyAndPlant } from "./helpers";
import { FakeGameClock } from "../src/core/GameClock";
import { RandomService } from "../src/core/RandomService";
import { EventBus } from "../src/core/EventBus";
import { SaveService, MemoryStorage } from "../src/systems/SaveService";
import { FarmService } from "../src/services/FarmService";

describe("播种（直接扣款）与批量操作", () => {
  it("金币不足无法播种", () => {
    const { farm } = makeTestFarm();
    farm.player.coins = 0;
    expect(farm.plantSeed("p0", "wheat")).toContain("金币不足");
    expect(farm.getPlot("p0")!.crop).toBeNull();
  });

  it("未解锁作物无法播种", () => {
    const { farm } = makeTestFarm();
    farm.player.coins = 999999;
    expect(farm.plantSeed("p0", "strawberry")).toContain("等级不足"); // Lv.3
    expect(farm.getPlot("p0")!.crop).toBeNull();
  });

  it("plantAll 批量播种，金币不足的地块自动跳过", () => {
    const { farm, clock } = makeTestFarm();
    const before = farm.player.coins;
    const n = farm.plantAll("wheat"); // 6 块空地，每块 10 金币
    expect(n).toBe(6);
    expect(farm.player.coins).toBe(before - 60);
    clock.advance(20); // 小麦成熟 → 收获腾出空地
    farm.sync();
    expect(farm.harvestAll()).toBe(6);
    farm.player.coins = 25; // 只够播 2 块
    const n2 = farm.plantAll("wheat");
    expect(n2).toBe(2);
    expect(farm.player.coins).toBe(5);
  });

  it("waterAll 一键浇水且不重复浇水", () => {
    const { farm, clock } = makeTestFarm();
    farm.plantAll("wheat");
    expect(farm.waterAll()).toBe(6);
    expect(farm.waterAll()).toBe(0); // 全部浇过
    clock.advance(20);
    farm.sync();
    expect(farm.harvestAll()).toBe(6);
  });

  it("harvestAll 一键收获，土地恢复 EMPTY", () => {
    const { farm, clock } = makeTestFarm();
    farm.plantAll("wheat");
    clock.advance(5);
    farm.sync();
    expect(farm.harvestAll()).toBe(0); // 未成熟
    clock.advance(16);
    farm.sync();
    expect(farm.harvestAll()).toBe(6);
    // 同作物组合按品质可能拆成多条目，但总数应为 6
    const totalQty = farm.warehouse.reduce((a, b) => a + b.quantity, 0);
    expect(totalQty).toBe(6);
    expect(farm.plots.every((p) => p.crop === null)).toBe(true);
  });
});

describe("收获 / 仓库 / 出售 / 图鉴", () => {
  function plantAndGrow(farm: any, clock: FakeGameClock, plotId: string, cropId: string) {
    expect(buyAndPlant(farm, plotId, cropId)).toBeNull();
    const def = farm.getCropDef(cropId)!;
    clock.advance(def.growthTime + 1);
    farm.sync();
  }

  it("收获后土地恢复 EMPTY，收获物进入仓库，获得经验", () => {
    const { farm, clock } = makeTestFarm();
    plantAndGrow(farm, clock, "p0", "wheat");
    const expBefore = farm.player.farmExp;
    const r = farm.harvest("p0");
    expect(r.ok).toBe(true);
    expect(farm.getPlot("p0")!.state).toBe("EMPTY");
    expect(farm.getPlot("p0")!.crop).toBeNull();
    expect(farm.warehouse.length).toBe(1);
    expect(farm.warehouse[0].quantity).toBe(1);
    expect(farm.player.farmExp).toBe(expBefore + 5);
  });

  it("未成熟无法收获", () => {
    const { farm, clock } = makeTestFarm();
    buyAndPlant(farm, "p0", "wheat");
    clock.advance(5);
    farm.sync();
    expect(farm.harvest("p0").ok).toBe(false);
  });

  it("出售正确增加金币并记录统计", () => {
    const { farm, clock } = makeTestFarm();
    plantAndGrow(farm, clock, "p0", "wheat");
    farm.harvest("p0");
    const coinsBefore = farm.player.coins;
    const unit = farm.warehouse[0].unitValue;
    const coins = farm.sellWarehouseItem(farm.warehouse[0].key, 1);
    expect(coins).toBe(unit);
    expect(farm.player.coins).toBe(coinsBefore + unit);
    expect(farm.state.statistics.totalCropsSold).toBe(1);
    expect(farm.warehouse.length).toBe(0);
  });

  it("图鉴首次发现记录，重复发现不重复创建", () => {
    const { farm, clock } = makeTestFarm();
    plantAndGrow(farm, clock, "p0", "wheat");
    const r1 = farm.harvest("p0");
    expect(r1.isNewDiscovery).toBe(true);
    expect(farm.collectionBook.length).toBe(1);
    plantAndGrow(farm, clock, "p1", "wheat");
    const r2 = farm.harvest("p1");
    expect(r2.isNewDiscovery).toBe(false);
    expect(farm.collectionBook.length).toBe(1);
    expect(farm.collectionBook[0].harvestCount).toBe(2);
  });

  it("不同变异组合在图鉴中是不同条目", () => {
    const { farm, clock } = makeTestFarm();
    farm.player.farmLevel = 10;
    farm.config.mutationConfig.baseChance = 1;
    plantAndGrow(farm, clock, "p0", "wheat"); // maxMut=1 → 必有 1 变异
    const r1 = farm.harvest("p0");
    expect(r1.mutations!.length).toBe(1);
    expect(farm.collectionBook.length).toBe(1);
    // 普通版本是另一个条目
    plantAndGrow(farm, clock, "p1", "carrot");
    farm.config.mutationConfig.baseChance = 0;
    farm.harvest("p1");
    expect(farm.collectionBook.length).toBe(2);
  });
});

describe("农场等级", () => {
  it("升级需要经验与金币同时满足", () => {
    const { farm } = makeTestFarm();
    farm.player.farmExp = 100; // Lv1 → 2 需要 100 EXP / 500 金币
    farm.player.coins = 400;
    expect(farm.upgradeFarm()).toContain("金币不足");
    farm.player.coins = 500;
    expect(farm.upgradeFarm()).toBeNull();
    expect(farm.player.farmLevel).toBe(2);
    expect(farm.player.coins).toBe(0);
  });

  it("升级解锁新土地", () => {
    const { farm } = makeTestFarm();
    expect(farm.getPlot("p6")!.unlockState).toBe("locked");
    farm.player.farmExp = 999999;
    farm.player.coins = 9999999;
    // 升到 Lv3（7 块地）
    farm.upgradeFarm(); // Lv2
    farm.upgradeFarm(); // Lv3
    expect(farm.player.farmLevel).toBe(3);
    expect(farm.getPlot("p6")!.unlockState).toBe("unlocked");
    expect(farm.getPlot("p7")!.unlockState).toBe("locked");
  });

  it("升级解锁新作物", () => {
    const { farm } = makeTestFarm();
    farm.player.coins = 999999;
    expect(farm.plantSeed("p0", "tomato")).toContain("等级不足");
    farm.player.farmExp = 999999;
    farm.upgradeFarm(); // Lv2 解锁番茄
    expect(farm.plantSeed("p0", "tomato")).toBeNull();
  });
});

describe("离线成长与存档", () => {
  it("离线时间正确推进成长（重新进入自动成熟）", () => {
    // 会话 1：播种并保存
    const s1 = makeTestFarm(7);
    buyAndPlant(s1.farm, "p0", "wheat");
    s1.farm.save();
    // 模拟关闭游戏期间经过 1 小时
    s1.clock.advance(3600);
    // 会话 2：新实例读档
    const config = s1.config;
    const rng2 = new RandomService(s1.rng.seed + 1);
    const farm2 = new FarmService(config, s1.clock, rng2, new EventBus(), s1.saveService);
    const report = farm2.load()!;
    expect(report.offlineDuration).toBeGreaterThanOrEqual(3600);
    expect(report.newlyMaturedCount).toBe(1);
    expect(farm2.getPlot("p0")!.harvestable).toBe(true);
  });

  it("存档保存/加载结果一致", () => {
    const { farm, clock, saveService } = makeTestFarm(3);
    farm.player.farmLevel = 5;
    farm.debugAddCoins(1234);
    buyAndPlant(farm, "p2", "carrot");
    clock.advance(100);
    farm.sync();
    farm.save();
    const snapshot = JSON.stringify(farm.state);

    const farm2 = new FarmService(farm.config, clock, new RandomService(999), new EventBus(), saveService);
    farm2.load();
    expect(JSON.stringify(farm2.state)).toBe(snapshot);
  });

  it("固定 RNG seed 得到完全一致的结果", () => {
    function runGame(): string[] {
      const { farm, clock } = makeTestFarm(2024);
      farm.player.farmLevel = 10;
      farm.config.mutationConfig.baseChance = 0.1;
      const results: string[] = [];
      const plots = ["p0", "p1", "p2", "p3", "p4"];
      const crops = ["tomato", "strawberry", "corn", "pumpkin", "grape"];
      plots.forEach((p, i) => {
        expect(buyAndPlant(farm, p, crops[i])).toBeNull();
      });
      clock.advance(400);
      farm.sync();
      for (const p of plots) {
        const c = farm.getPlot(p)!.crop!;
        results.push(c.mutationList.join("+"));
      }
      return results;
    }
    const a = runGame();
    const b = runGame();
    expect(a).toEqual(b);
    // 且随机流确实产生了变异（测试有效性）
    expect(a.some((m) => m.length > 0)).toBe(true);
  });
});
