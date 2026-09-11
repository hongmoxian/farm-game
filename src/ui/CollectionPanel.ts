import type { FarmService } from "../services/FarmService";

/** CollectionPanel：图鉴。按作物分组展示已收集的 Crop + Mutation 组合与星级。 */
export function openCollectionPanel(farm: FarmService, onClose: () => void): HTMLElement {
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

  const progress = farm.collection.getCollectionProgress(farm.collectionBook);
  modal.innerHTML = `
    <h2>📖 图鉴</h2>
    <p class="subtitle">收集进度：${progress.collected} / ${progress.totalCrops} 种作物 · 共 ${farm.collectionBook.length} 个组合条目</p>
  `;

  const list = document.createElement("div");
  list.className = "collection-list";

  for (const def of farm.config.crops) {
    const stars = farm.collection.getStarConditions(farm.collectionBook, def.id);
    const starCount = stars.filter((s) => s.achieved).length;
    const entries = farm.collection.getEntriesForCrop(farm.collectionBook, def.id);

    const cropBlock = document.createElement("div");
    cropBlock.className = "col-item";
    cropBlock.innerHTML = `
      <span class="icon">${def.icon}</span>
      <div class="info">
        <div class="name">${def.name} <span class="star-row">${"★".repeat(starCount)}${"☆".repeat(stars.length - starCount)}</span> ${starCount}/${stars.length}</div>
        <div class="meta">
          ${
            entries.length === 0
              ? "尚未发现"
              : entries
                  .map((e) => {
                    const muts = e.mutations
                      .map((m) => farm.config.mutationMap.get(m)?.name ?? m)
                      .join(" + ");
                    return `<span class="mutation-chip">${muts || "普通"} ×${e.harvestCount}（最高 ${e.highestValue}💰 / ×${e.highestMultiplier}）</span>`;
                  })
                  .join(" ")
          }
        </div>
      </div>
    `;
    list.appendChild(cropBlock);
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
  return mask;
}
