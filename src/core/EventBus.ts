import type { GameEvents } from "../data/GameEvents";

/**
 * EventBus：系统间解耦通讯。
 * 逻辑系统只发事件，UI 只监听事件；禁止 MutationSystem 等直接操作 UI。
 */
export class EventBus {
  private handlers: { [K in keyof GameEvents]?: Array<(payload: GameEvents[K]) => void> } = {};

  /** 订阅事件，返回取消订阅函数 */
  on<K extends keyof GameEvents>(event: K, handler: (payload: GameEvents[K]) => void): () => void {
    if (!this.handlers[event]) this.handlers[event] = [];
    const list = this.handlers[event] as Array<(p: GameEvents[K]) => void>;
    list.push(handler);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const list = this.handlers[event];
    if (!list) return;
    for (const h of [...list]) h(payload);
  }

  clear(): void {
    this.handlers = {};
  }
}
