import type { FarmService } from "../services/FarmService";
import type { GameClock, RealGameClock } from "../core/GameClock";

/**
 * DebugPanel：开发调试面板（正式构建可整体移除该模块与入口按钮）。
 * 金币/经验/等级、时间加速、强制变异、存档导入导出、RNG seed 查看、清档。
 */
export function createDebugPanel(farm: FarmService, clock: GameClock, refresh: () => void): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "debug-panel";

  const numInput = (value: number): HTMLInputElement => {
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(value);
    return input;
  };
  const btn = (text: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  };

  const render = () => {
    panel.innerHTML = `<h3>🛠 Debug Panel</h3>`;
    const seedInfo = document.createElement("div");
    seedInfo.className = "info";
    seedInfo.textContent = `RNG Seed: ${farm.rng.seed} · 加速 ×${(clock as RealGameClock).getSpeed?.() ?? 1}`;
    panel.appendChild(seedInfo);

    // 金币
    const coinRow = document.createElement("div");
    coinRow.className = "row";
    const coinInput = numInput(1000);
    coinRow.appendChild(coinInput);
    coinRow.appendChild(btn("加金币", () => { farm.debugAddCoins(Number(coinInput.value) || 0); refresh(); }));
    panel.appendChild(coinRow);

    // 经验/等级
    const expRow = document.createElement("div");
    expRow.className = "row";
    const expInput = numInput(100);
    expRow.appendChild(expInput);
    expRow.appendChild(btn("加经验", () => { farm.debugAddExp(Number(expInput.value) || 0); refresh(); }));
    const lvInput = numInput(farm.player.farmLevel);
    expRow.appendChild(lvInput);
    expRow.appendChild(btn("设等级", () => { farm.debugSetLevel(Number(lvInput.value) || 1); refresh(); render(); }));
    panel.appendChild(expRow);

    // 时间加速
    const speedRow = document.createElement("div");
    speedRow.className = "row";
    for (const s of [1, 10, 100]) {
      speedRow.appendChild(btn(`×${s}`, () => {
        (clock as RealGameClock).setSpeed?.(s);
        render();
        refresh();
      }));
    }
    panel.appendChild(speedRow);

    // 强制变异
    const forceRow = document.createElement("div");
    forceRow.className = "row";
    forceRow.appendChild(btn("强制下株变异", () => { farm.debugForceMutationId = "any"; }));
    const mutSelect = document.createElement("select");
    mutSelect.style.cssText = "flex:1;padding:3px;background:#2e3748;color:#fff;border:none;border-radius:4px";
    mutSelect.innerHTML = `<option value="">指定变异…</option>` +
      farm.config.mutationConfig.mutations.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
    mutSelect.addEventListener("change", () => {
      if (mutSelect.value) farm.debugForceMutationId = mutSelect.value;
    });
    forceRow.appendChild(mutSelect);
    panel.appendChild(forceRow);

    // 立即成熟
    panel.appendChild(btn("全部立即成熟", () => {
      const now = clock.now();
      for (const plot of farm.plots) {
        if (plot.crop) {
          const def = farm.getCropDef(plot.crop.cropId);
          if (def) plot.crop.plantTimestamp = now - def.growthTime - 1;
        }
      }
      farm.sync(now);
      refresh();
    }));

    // 存档操作
    const saveRow = document.createElement("div");
    saveRow.className = "row";
    saveRow.appendChild(btn("导出存档", () => {
      farm.save();
      const json = farm.saveService.exportSave(farm.state);
      prompt("复制存档 JSON：", json);
    }));
    saveRow.appendChild(btn("导入存档", () => {
      const json = prompt("粘贴存档 JSON：");
      if (!json) return;
      const save = farm.saveService.importSave(json);
      if (save) {
        farm.state = save;
        farm.sync();
        refresh();
      } else {
        alert("存档格式无效");
      }
    }));
    panel.appendChild(saveRow);
    panel.appendChild(btn("清空存档（重开）", () => {
      if (confirm("确认清空存档并重新开始？")) {
        farm.debugResetSave();
        refresh();
        render();
      }
    }));
  };
  render();
  return panel;
}
