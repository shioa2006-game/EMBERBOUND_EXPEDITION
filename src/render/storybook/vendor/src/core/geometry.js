/**
 * Inkstone — 幾何の基本 (点・補間・外接矩形・楕円・凸包)
 */
/**
 * 斜め 45° から見た床の1マスの画面上の幅・高さ (px)。比 TH / TW が床の奥行きのつぶれ方で、
 * キャラクターの足の接地 (rig.js の KY_G) と Studio の足元のタイルが使う。
 */
export const TW = 150, TH = 84;

export const TAU = Math.PI * 2;

export const lerp = (a, b, t) => a + (b - a) * t;

export const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y });

export const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });

export const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}

export function centroid(pts) {
  let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}

export function ellipsePts(cx, cy, rx, ry, n = 28, a0 = 0, a1 = TAU) {
  const out = [];
  const closed = Math.abs(a1 - a0 - TAU) < 1e-6;
  const cnt = closed ? n : n + 1;
  for (let i = 0; i < cnt; i++) {
    const a = a0 + (a1 - a0) * i / n;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
}

/** 凸包 (曲面の外形線を求めるのに使う) */
export function convexHull(points) {
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export const facePt = (A, B, D, u, v) => ({ x: A.x + (B.x - A.x) * u + (D.x - A.x) * v, y: A.y + (B.y - A.y) * u + (D.y - A.y) * v });

export const V = arr => arr.map(([x, y]) => ({ x, y }));
