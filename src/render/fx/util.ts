// Small math / easing helpers shared by the effect modules. Allocation-free.

export const TAU = Math.PI * 2;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function randInt(a: number, b: number): number {
  return a + Math.floor(Math.random() * (b - a + 1));
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeInQuad(t: number): number {
  return t * t;
}

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** 0 → 1 → 0 over t in [0, 1] (sine bump). */
export function bump(t: number): number {
  return Math.sin(clamp01(t) * Math.PI);
}

/** Fade-in for the first `a` fraction, fade-out for the last `b` fraction of [0, 1]. */
export function fadeInOut(t: number, a: number, b: number): number {
  if (t < a) return clamp01(t / a);
  if (t > 1 - b) return clamp01((1 - t) / b);
  return 1;
}

/** Deterministic hash → [0, 1). */
export function hash01(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Hex '#rrggbb' → 'rgba(r,g,b,a)'. Cached per (hex, alpha step) so hot loops never allocate. */
const rgbaCache = new Map<string, string[]>();
export function rgba(hex: string, alpha: number): string {
  let arr = rgbaCache.get(hex);
  if (!arr) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    arr = [];
    for (let i = 0; i <= 20; i++) arr.push(`rgba(${r},${g},${b},${(i / 20).toFixed(2)})`);
    rgbaCache.set(hex, arr);
  }
  return arr[Math.round(clamp01(alpha) * 20)];
}
