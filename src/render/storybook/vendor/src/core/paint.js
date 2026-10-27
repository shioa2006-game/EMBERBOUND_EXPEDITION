/**
 * Inkstone — 色の濃淡による塗り (実験Eで追加した共通の「塗り」)
 *   同じ色相の暗い色の三日月形の陰 + 淡い明るみ + 同系色の点描 + 輪郭。線の太さの階層 LW。
 */
import { DRAW } from './settings.js';
import { V, bbox } from './geometry.js';
import { clipPath, fillPath, roughen, roundedPoly, stipplePoly, strokePath } from './ink.js';

export const _rgbCache = new Map();

export function hexRgb(h) { if (!_rgbCache.has(h)) _rgbCache.set(h, [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))); return _rgbCache.get(h); }

export const _mixCache = new Map();

/** 2色の混合 (k=0 → a, k=1 → b) */
export function mixHex(a, b, k) {
  const key = a + b + k; if (_mixCache.has(key)) return _mixCache.get(key);
  const p = hexRgb(a), q = hexRgb(b), r = p.map((v, i) => Math.round(v + (q[i] - v) * k));
  const s = '#' + r.map(v => v.toString(16).padStart(2, '0')).join(''); _mixCache.set(key, s); return s;
}

export const shadeOf = (hex, k = 0.3) => mixHex(hex, '#2b2118', k);   // 墨ではなく焦げ茶寄りの陰

export const lightOf = (hex, k = 0.35) => mixHex(hex, '#fffaf0', k);

/** 線の太さの段階 (外形 > 部品 > 細部) */
export const LW = { outline: 2.1, part: 1.6, detail: 1.0, fine: 0.75 };

/**
 * 形を塗る: 下地 → 右下に色の陰 (三日月形) → 左上に淡い明るみ → 同系色の点描 → 輪郭。
 * pts = 画面座標の点 {x,y}。o = { fill, w, depth (陰の幅), shade (陰の濃さ), light, speck (点描の密度), round, amp }
 */
export function paint(ctx, pts, o) {
  const r = roughen(o.round ? roundedPoly(pts, o.round) : pts, true, o.amp ?? 0.45, o.step ?? 6);
  fillPath(ctx, r, o.fill);
  const d = o.depth ?? 3;
  if (d > 0 || o.light) {
    const bb = bbox(r);
    ctx.save(); clipPath(ctx, r);
    const crescent = (dx, dy, color, alpha) => {   // 外接矩形から「ずらした形」をくり抜いた部分 = 縁の三日月
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
      ctx.rect(bb.x0 - 4, bb.y0 - 4, bb.x1 - bb.x0 + 8, bb.y1 - bb.y0 + 8);
      r.forEach((p, i) => i ? ctx.lineTo(p.x + dx, p.y + dy) : ctx.moveTo(p.x + dx, p.y + dy)); ctx.closePath();
      ctx.fill('evenodd');
    };
    if (d > 0) crescent(-d * 0.8, -d * 0.62, shadeOf(o.fill, o.shadeK ?? 0.32), o.shade ?? 0.75);
    if (o.light) crescent(d * 0.7, d * 0.7, lightOf(o.fill), o.light);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  if ((o.speck ?? 1.3) > 0) stipplePoly(ctx, r, o.speck ?? 1.3, { color: shadeOf(o.fill, 0.5), scale: o.speckScale ?? 0.8 });
  if (o.w !== 0) strokePath(ctx, r, (o.w ?? LW.part) * DRAW.lw);
  return r;
}

/** [x,y] 配列版 */
export const paintA = (ctx, arr, o) => paint(ctx, V(arr), o);

/** 先細りのカプセル (腕・脚・袖)。a 側の半径 r0、b 側の半径 r1 */
export function taperPts(a, b, r0, r1, n = 6) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1e-3, a0 = Math.atan2(dy, dx), out = [];
  for (let i = 0; i <= n; i++) { const t = a0 - Math.PI / 2 + Math.PI * i / n; out.push({ x: b.x + Math.cos(t) * r1, y: b.y + Math.sin(t) * r1 }); }
  for (let i = 0; i <= n; i++) { const t = a0 + Math.PI / 2 + Math.PI * i / n; out.push({ x: a.x + Math.cos(t) * r0, y: a.y + Math.sin(t) * r0 }); }
  return out;
}
