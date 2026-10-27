/**
 * Inkstone — 人物用の立体部品 (実験Eで追加): ミトン形の手・太さのある脚とブーツ (legParts2)
 */
import { DRAW } from '../core/settings.js';
import { TAU, ellipsePts, lerp } from '../core/geometry.js';
import { inkShape } from '../core/ink.js';
import { LW, paint, shadeOf, taperPts } from '../core/paint.js';
import { cLine, capsulePts, footProj } from './rig.js';

/** ミトン形の手 (親指つき)。h = 手の位置、(ux,uy) = 前腕の向き、r = 大きさ */
export function mittenHand(ctx, h, ux, uy, r, fill, o = {}) {
  const L = Math.hypot(ux, uy) || 1; ux /= L; uy /= L;
  const nx = -uy, ny = ux, side = o.thumbSide ?? 1;
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const t = TAU * i / 14, ca = Math.cos(t), sa = Math.sin(t);
    pts.push({ x: h.x + ux * ca * r * 1.08 + nx * sa * r * 0.92, y: h.y + uy * ca * r * 1.08 + ny * sa * r * 0.92 });
  }
  paint(ctx, pts, { fill, w: LW.part, depth: r * 0.45, speck: 0, amp: 0.25, step: 4 });
  const th = { x: h.x + nx * r * 0.75 * side - ux * r * 0.15, y: h.y + ny * r * 0.75 * side - uy * r * 0.15 };   // 親指
  inkShape(ctx, ellipsePts(th.x, th.y, r * 0.42, r * 0.42, 10), { fill, w: LW.detail * DRAW.lw, amp: 0.15, step: 4 });
  if (o.knuckles !== false) cLine(ctx, [[h.x + ux * r * 0.55 - nx * r * 0.5, h.y + uy * r * 0.55 - ny * r * 0.5], [h.x + ux * r * 0.55 + nx * r * 0.35, h.y + uy * r * 0.55 + ny * r * 0.35]], 0.7);
}

/**
 * [実験E] 脚 (共通リグの legParts の後継): 太さのある脚 + ブーツ (甲・底・筒・折り返し)。
 * 足の位置は実験Cの接地補正 (footProj) をそのまま使う。style = { pants, boot, cuff, bootH, legR0, legR1, sole, footR, soleR }
 * [E修正10] 足の大きさ footR / soleR を引数に (既定値は従来どおり。剣士だけ小さくする)
 */
export function legParts2(ctx, rf, P, st = {}) {
  const parts = [], { dir, W } = rf;
  for (const side of ['L', 'R']) {
    const sb = side === 'L' ? 1 : -1, ft = side === 'L' ? P.footL : P.footR;
    const hip = W(P.body[0] * 0.5, sb * 6.5, 21 + P.body[2] * 0.6), ank = footProj(dir, ft[0], ft[1], ft[2] + 5);
    parts.push({ id: 'leg' + side, d: -100 + (hip.d + ank.d) / 2, draw: () => {
      paint(ctx, taperPts(hip, ank, st.legR0 ?? 3.8, st.legR1 ?? 3.1), { fill: st.pants, w: LW.part, depth: 2.2, speck: 1.0 });
      const top = { x: lerp(ank.x, hip.x, st.bootH ?? 0.38), y: lerp(ank.y, hip.y, st.bootH ?? 0.38) };
      paint(ctx, taperPts(top, ank, 4.1, 3.7), { fill: st.boot, w: LW.part, depth: 2.4, speck: 0.8 });   // 筒
      const heel = footProj(dir, ft[0] - 3, ft[1], ft[2] + 2.4), toe = footProj(dir, ft[0] + 6, ft[1], ft[2] + 2.2);
      const sole = capsulePts({ x: heel.x, y: heel.y + 1.6 }, { x: toe.x, y: toe.y + 1.6 }, st.soleR ?? 3.6);
      inkShape(ctx, sole, { fill: st.sole ?? shadeOf(st.boot, 0.45), w: LW.part * DRAW.lw, amp: 0.25, step: 4 });   // 靴底
      paint(ctx, capsulePts(heel, toe, st.footR ?? 4.1), { fill: st.boot, w: LW.outline, depth: 2.2, speck: 0.8, light: 0.25 });   // 甲
      if (st.cuff) {                                                                   // 折り返し: 脚に直交する帯
        const ux = ank.x - hip.x, uy = ank.y - hip.y, ul = Math.hypot(ux, uy) || 1, nx = -uy / ul * 4.4, ny = ux / ul * 4.4;
        paint(ctx, taperPts({ x: top.x - nx, y: top.y - ny }, { x: top.x + nx, y: top.y + ny }, 2.1, 2.1, 4), { fill: st.cuff, w: LW.detail, depth: 1.2, speck: 0 });
      }
    } });
  }
  return parts;
}
