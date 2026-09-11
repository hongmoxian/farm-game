import type { PlotState } from "./Plot";

/** 全局事件表：逻辑层 → UI 层的唯一通讯通道 */
export interface GameEvents {
  CropPlanted: { plotId: string; cropId: string };
  CropStageChanged: { plotId: string; stage: PlotState };
  MutationTriggered: { plotId: string; cropId: string; mutationId: string };
  CropMatured: { plotId: string; cropId: string; mutations: string[] };
  CropHarvested: {
    plotId: string;
    cropId: string;
    mutations: string[];
    value: number;
    exp: number;
    multiplier: number;
    isNewDiscovery: boolean;
    isRareMutation: boolean;
    displayName: string;
  };
  SeedsPurchased: { cropId: string; quantity: number };
  ItemSold: { cropId: string; mutations: string[]; quantity: number; coins: number };
  FarmLeveledUp: { level: number };
  CollectionUnlocked: { cropId: string; mutations: string[]; displayName: string };
  PlotUnlocked: { plotId: string };
  CoinsChanged: { coins: number };
  WateredPlot: { plotId: string };
}
