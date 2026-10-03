/**
 * Small seeded pseudo-random generator (mulberry32).
 *
 * The state is a plain object owned by the engine, so the simulation stays fully
 * deterministic. The same seed always gives the same sequence, no matter how
 * simulation time is split into calls.
 */
export interface RngState {
  state: number;
}

export function createRng(seed: number): RngState {
  return { state: Math.trunc(seed) >>> 0 };
}

/** Returns the next pseudo-random number in [0, 1) and advances the state. */
export function nextRandom(rng: RngState): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
