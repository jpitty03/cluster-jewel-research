export interface RandomSource {
  next(): number;
}

export class DefaultRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

export class Mulberry32RandomSource implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function createRandomSource(seed?: number): RandomSource {
  if (seed !== undefined && seed !== null) {
    return new Mulberry32RandomSource(seed);
  }
  return new DefaultRandomSource();
}
