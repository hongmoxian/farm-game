import { loadConfig, type GameConfig } from "../src/config/GameConfig";
import { FakeGameClock } from "../src/core/GameClock";
import { RandomService } from "../src/core/RandomService";
import { EventBus } from "../src/core/EventBus";
import { SaveService, MemoryStorage } from "../src/systems/SaveService";
import { FarmService } from "../src/services/FarmService";

/** 构建一套可复现的测试环境（固定 seed + FakeClock + 内存存储） */
export function makeTestFarm(seed = 42): {
  farm: FarmService;
  config: GameConfig;
  clock: FakeGameClock;
  rng: RandomService;
  events: EventBus;
  saveService: SaveService;
} {
  const config = loadConfig();
  const clock = new FakeGameClock();
  const rng = new RandomService(seed);
  const events = new EventBus();
  const saveService = new SaveService(new MemoryStorage(), "test-save");
  const farm = new FarmService(config, clock, rng, events, saveService);
  farm.newGame();
  return { farm, config, clock, rng, events, saveService };
}

/** 播种（播种时直接扣款），返回失败原因或 null。qty 仅保留兼容签名 */
export function buyAndPlant(farm: FarmService, plotId: string, cropId: string, qty = 1): string | null {
  void qty;
  return farm.plantSeed(plotId, cropId);
}
