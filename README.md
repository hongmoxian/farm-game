# 星露农场（Farm Mutation Game）

轻量级休闲农场游戏：**种植 → 成长 → 随机变异 → 收集图鉴 → 出售 → 升级**。

基于 TypeScript + Vite + Three.js，单机运行、数据驱动、离线成长、可测试。

## 特性

- 🌱 10 种作物，时间戳驱动的成长系统（关游戏也会继续长，重新进入自动结算）
- 🌈 三大变异体系：颜色（桃霞/橙光/绿光/幽蓝 ×1.5）、材质（铸铁/冰晶/青铜/琥珀/璀璨/琉璃/明珠/青玉 ×2.5）、巨大化（×8），倍率相乘，理论极限 ×30
- 📖 图鉴收集：按作物 + 变异词条组合记录首次发现与星级
- 💰 仓库/出售/农场等级/土地解锁，全部数值在 `src/config/*.json`
- 🧊 Three.js 低多边形 3D 预览（模型来源 [Quaternius](https://quaternius.com)，CC0 公有领域）
- 🛠 Debug 面板：时间加速、强制变异、金币/等级调整、存档导入导出
- ✅ Vitest 单元测试 27 项

## 快速开始

```bash
npm install
npm run dev      # 开发：http://localhost:5175
npm test         # 运行单元测试
npm run build    # 生产构建（输出 dist/）
```

## 项目结构

```
src/
├── config/    # JSON 数值配置（作物/变异/等级/经济）+ 加载器
├── core/      # GameClock / RandomService(seeded) / EventBus
├── data/      # 数据模型（CropDefinition / CropInstance / Plot / SaveGame…）
├── systems/   # 成长/变异/经济/商店/等级/图鉴/仓库/存档/离线结算
├── services/  # FarmService（编排层）
└── ui/        # 界面与 3D 预览（Three.js）
public/models/ # GLB 作物模型（CC0）
tests/         # Vitest 单元测试
```

## License

MIT
