/**
 * RandomService：全局统一随机服务。
 * - 所有游戏随机必须经由本服务，禁止在业务代码中直接调用 Math.random()
 * - 支持 seeded RNG（mulberry32），固定 seed 即可复现结果，便于单元测试
 */
export class RandomService {
  private state: number;
  readonly seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.state = this.seed >>> 0;
  }

  /** [0, 1) 均匀分布 */
  random(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 以概率 p 返回 true */
  rollProbability(p: number): boolean {
    return this.random() < p;
  }

  /** [min, max] 整数 */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }

  /** 按权重从条目中选择一个，返回索引。权重全为 0 时返回 -1 */
  weightedChoice(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return -1;
    let r = this.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
}
