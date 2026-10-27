/**
 * Inkstone — 足元の影 (ハッチングの楕円)。絵は実験C〜Eと同じ。
 */
import { seed } from '../core/random.js';
import { ellipsePts } from '../core/geometry.js';
import { roughen, hatchPoly } from '../core/ink.js';

/** 足元の影の範囲 (ローカル px) と描画 (ハッチングの楕円) */
export const SHADOW_BOX = Object.freeze({ x0: -26, x1: 26, y0: -10, y1: 12 });
export function drawUnitShadow(g) {
  seed('hero-shadow');
  hatchPoly(g, roughen(ellipsePts(0, 1, 19, 6.5, 20), true, 0.5, 6), { angle: -0.45, gap: 3, w: 0.75, alpha: 0.55 });
}
