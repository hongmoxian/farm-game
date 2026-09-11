import type { FarmService } from "../services/FarmService";

/** UpgradePanel：农场升级。展示经验/金币条件与下一级解锁内容。 */
export function openUpgradePanel(farm: FarmService, onClose: () => void, refresh: () => void): HTMLElement {
  const mask = document.createElement("div");
  mask.className = "modal-mask";
  const modal = document.createElement("div");
  modal.className = "modal";
  mask.appendChild(modal);
  const close = () => {
    mask.remove();
    onClose();
  };
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });

  const featureNames: Record<string, string> = {
    color_mutation: "🌈 颜色变异",
    material_mutation: "💎 材质变异",
    giant_mutation: "🧬 巨大化",
  };

  const render = () => {
    const check = farm.levels.checkUpgrade(farm.player);
    const nextDef = farm.levels.getLevelDef(check.nextLevel);
    const cropNames = nextDef.unlockedCrops
      .map((id) => farm.getCropDef(id)?.name ?? id)
      .join("、");

    modal.innerHTML = `
      <h2>⬆️ 农场升级</h2>
      <p class="subtitle">当前 Lv.${farm.player.farmLevel} · EXP ${farm.player.farmExp} · 金币 ${farm.player.coins.toLocaleString()}</p>
      ${
        check.nextLevel > farm.levels.getMaxLevel()
          ? `<p>已达最高等级。</p>`
          : `<div class="section-title">升级到 Lv.${check.nextLevel} 需要</div>
             <p>✅ 经验 ≥ ${check.requiredExp}（当前 ${farm.player.farmExp}）${check.expEnough ? "✔" : "✘"}</p>
             <p>✅ 金币 ≥ ${check.upgradeCost.toLocaleString()}（当前 ${farm.player.coins.toLocaleString()}）${check.coinsEnough ? "✔" : "✘"}</p>
             <div class="section-title">解锁内容</div>
             <p>🌱 新作物：${cropNames || "无"}</p>
             <p>🟫 土地：${nextDef.unlockedPlots} 块</p>
             <p>${nextDef.unlockedFeatures.map((f) => featureNames[f] ?? f).join("　") || "—"}</p>`
      }
    `;

    const actions = document.createElement("div");
    actions.className = "actions";
    if (check.nextLevel <= farm.levels.getMaxLevel()) {
      const upBtn = document.createElement("button");
      upBtn.className = "btn primary";
      upBtn.textContent = `升级到 Lv.${check.nextLevel}（${check.upgradeCost.toLocaleString()} 金币）`;
      upBtn.disabled = !check.canUpgrade;
      upBtn.addEventListener("click", () => {
        const err = farm.upgradeFarm();
        if (err) alert(err);
        render();
        refresh();
      });
      actions.appendChild(upBtn);
    }
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn";
    closeBtn.textContent = "关闭";
    closeBtn.addEventListener("click", close);
    actions.appendChild(closeBtn);
    modal.appendChild(actions);
  };
  render();
  return mask;
}
