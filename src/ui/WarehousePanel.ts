import type { FarmService } from "../services/FarmService";

/** WarehousePanel：仓库。收获的作物先入仓，玩家在此出售或留作收藏。 */
export function openWarehousePanel(farm: FarmService, onClose: () => void, refresh: () => void): HTMLElement {
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

  const qualityNames: Record<string, string> = {
    normal: "普通",
    fine: "优秀",
    rare: "稀有",
    epic: "史诗",
    legendary: "传说",
  };

  const render = () => {
    modal.innerHTML = `<h2>📦 仓库</h2><p class="subtitle">金币：${farm.player.coins.toLocaleString()} · 共 ${farm.warehouse.length} 种物品</p>`;
    const list = document.createElement("div");
    list.className = "warehouse-list";

    if (farm.warehouse.length === 0) {
      list.innerHTML = `<p class="subtitle">仓库空空如也，去收获一些作物吧。</p>`;
    }

    for (const item of farm.warehouse) {
      const def = farm.getCropDef(item.cropId)!;
      const row = document.createElement("div");
      row.className = "wh-item";
      const mutChips = item.mutations
        .map((m) => {
          const md = farm.config.mutationMap.get(m);
          const v = item.variants?.[m] ? md?.variants?.find((x) => x.id === item.variants![m]) : undefined;
          return `<span class="mutation-chip">${v ? `${v.name}·${md?.name ?? m}` : md?.name ?? m}</span>`;
        })
        .join("");
      row.innerHTML = `
        <span class="icon">${def.icon}</span>
        <div class="info">
          <div class="name">${farm.economy.displayName(def, item.mutations, item.variants)} ×${item.quantity}</div>
          <div class="meta">
            <span class="quality-chip">${qualityNames[item.quality] ?? item.quality}</span>
            ${mutChips}
            单价 ${item.unitValue.toLocaleString()} 金币
          </div>
        </div>
      `;
      const sell1 = document.createElement("button");
      sell1.className = "btn gold";
      sell1.textContent = "售 1";
      sell1.addEventListener("click", () => {
        farm.sellWarehouseItem(item.key, 1);
        render();
        refresh();
      });
      const sellAll = document.createElement("button");
      sellAll.className = "btn gold";
      sellAll.textContent = "全卖";
      sellAll.addEventListener("click", () => {
        farm.sellWarehouseItem(item.key, item.quantity);
        render();
        refresh();
      });
      row.appendChild(sell1);
      row.appendChild(sellAll);
      list.appendChild(row);
    }
    modal.appendChild(list);

    const closeRow = document.createElement("div");
    closeRow.className = "close-row";
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "关闭";
    btn.addEventListener("click", close);
    closeRow.appendChild(btn);
    modal.appendChild(closeRow);
  };
  render();
  return mask;
}
