/**
 * GameClock：时间抽象。
 * 游戏逻辑只依赖该接口，测试可注入 FakeGameClock 直接推进时间。
 * 时间单位：秒（虚拟时间，可被加速）。
 */
export interface GameClock {
  /** 当前虚拟时间（秒） */
  now(): number;
}

/** 生产环境：真实时间，支持 Debug 时间加速（×1 / ×10 / ×100） */
export class RealGameClock implements GameClock {
  private speed = 1;
  private anchorReal = 0;
  private anchorVirtual = 0;

  constructor() {
    this.anchorReal = Date.now() / 1000;
    this.anchorVirtual = this.anchorReal;
  }

  /** 切换加速倍率，保持当前虚拟时间连续 */
  setSpeed(speed: number): void {
    const real = Date.now() / 1000;
    this.anchorVirtual = this.now();
    this.anchorReal = real;
    this.speed = speed;
  }

  getSpeed(): number {
    return this.speed;
  }

  now(): number {
    const real = Date.now() / 1000;
    return this.anchorVirtual + (real - this.anchorReal) * this.speed;
  }
}

/** 测试 / 调试环境：手动推进时间 */
export class FakeGameClock implements GameClock {
  private t: number;
  constructor(start = 1_000_000) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  /** 直接推进 n 秒 */
  advance(seconds: number): void {
    this.t += seconds;
  }
  setTime(t: number): void {
    this.t = t;
  }
}
