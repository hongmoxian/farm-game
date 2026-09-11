import type { FarmService } from "../services/FarmService";

/**
 * ShopPanel：作物价目目录。
 * 播种时直接扣除金币（无独立购买步骤），此面板仅作价格/解锁参考。
 */
export function openShopPanel(farm: FarmService, onClose: () => void, refresh: () => void): HTMLElement {
  void refresh;
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

  modal.innerHTML = `<h2>🏪 作物价目表</h2><p class="subtitle">播种时直接扣除金币，无需先购买种子 · 金币：${farm.player.coins.toLocaleString()}</p>`;
  const grid = document.createElement("div");
  grid.className = "shop-grid";

  for (const item of farm.shop.getShopItems(farm.player)) {
    const card = document.createElement("div");
    card.className = `shop-item ${item.unlocked ? "" : "locked"}`;
    card.innerHTML = `
      <span class="icon">${item.icon}</span>
      <span class="name">${item.name}</span>
      <span class="meta">种子 💰${item.price} · 收获 💰${item.baseSellPrice} · ⏱ ${item.growthTime}s</span>
      <span class="meta">变异上限 ×${item.maxMutationCount} · ${item.description}</span>
    `;
    if (!item.unlocked) {
      const lock = document.createElement("div");
      lock.className = "lock-overlay";
      lock.innerHTML = `🔒<span>Lv.${item.unlockLevel} 解锁</span>`;
      card.appendChild(lock);
    }
    grid.appendChild(card);
  }
  modal.appendChild(grid);

  const closeRow = document.createElement("div");
  closeRow.className = "close-row";
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = "关闭";
  btn.addEventListener("click", close);
  closeRow.appendChild(btn);
  modal.appendChild(closeRow);
  return mask;
}
