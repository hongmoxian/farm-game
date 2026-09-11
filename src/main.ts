import "./ui/styles.css";
import { loadConfig } from "./config/GameConfig";
import { RealGameClock } from "./core/GameClock";
import { RandomService } from "./core/RandomService";
import { EventBus } from "./core/EventBus";
import { SaveService, LocalStorageAdapter } from "./systems/SaveService";
import { FarmService } from "./services/FarmService";
import { FarmScreen } from "./ui/FarmScreen";
import { SAVE_KEY } from "./config/GameConfig";

/** 启动入口：装配依赖 → 读档/建档 → 离线结算 → 主循环 */
function bootstrap(): void {
  const config = loadConfig();
  const clock = new RealGameClock();
  const rng = new RandomService();
  const events = new EventBus();
  const saveService = new SaveService(new LocalStorageAdapter(), SAVE_KEY);
  const farm = new FarmService(config, clock, rng, events, saveService);

  // 读档（含离线成长补算）或新游戏
  const report = farm.load();
  if (!report) farm.newGame();

  const DEBUG_MODE = true; // 正式构建改为 false 即可隐藏 Debug 入口
  const screen = new FarmScreen(farm, events, clock, DEBUG_MODE);

  if (report) screen.showOfflineReport(report);

  // 稀有变异"中奖"反馈
  events.on("CropHarvested", (r) => {
    if (r.isRareMutation || r.isNewDiscovery) {
      screen.showJackpot({
        displayName: r.displayName,
        mutations: r.mutations,
        value: r.value,
        multiplier: r.multiplier,
        exp: r.exp,
        isNewDiscovery: r.isNewDiscovery,
        cropIcon: config.cropMap.get(r.cropId)?.icon ?? "🌱",
      });
    }
  });

  // 主循环：每秒轻量刷新（成长由时间戳换算，刷新只负责重绘进度与倒计时）
  setInterval(() => screen.tick(), 1000);

  // 自动存档：每 30 秒
  setInterval(() => farm.save(), 30_000);
  // 程序退出时保存
  window.addEventListener("beforeunload", () => farm.save());

  screen.renderAll();
}

bootstrap();
