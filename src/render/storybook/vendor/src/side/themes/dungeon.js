/**
 * Inkstone — 横スクロールの背景テーマ「ダンジョンの回廊」(鉛筆画)
 *   遠い広間 (0.35, 淡い): 回廊の窓のアーチ越しにだけ見える柱と暗い戸口
 *   奥の壁 (0.8): 石積みの壁、アーチの窓 (くり抜き)、松明 (金具と光は焼き込み、炎は毎フレーム)
 *   床 (1): 2列の敷石と手前の縁石。ステージの両端は戸口のある石壁
 *   前景 (1.3): まばらな太い柱と吊り下がった鎖
 */
import { seed, R, chance } from '../../core/random.js';
import { PAL } from '../../core/palette.js';
import { fillPath, fillPoly, hatchPoly, inkLine, inkShape, roughen, stipplePoly, strokePath, rimWeight } from '../../core/ink.js';
import { TAU } from '../../core/geometry.js';
import { FLOOR, each, stoneCourse, frontStone, periodicSpans, stageEnds, endFace } from './pencil.js';

const WALL_TOP = -300, WALL_BASE = FLOOR.back + 6, COURSE = 30;
const ARCH = { every: 960, offset: 300, half: 62, sill: -50, spring: -146 };
const TORCH = { every: 960, offset: 780, y: -150 };

/** アーチの窓の開口部 (中心 cx) */
function archOpening(cx, inset = 0) {
  const r = ARCH.half - inset, pts = [{ x: cx + r, y: ARCH.sill }];
  for (let k = 0; k <= 16; k++) { const a = Math.PI * k / 16; pts.push({ x: cx + r * Math.cos(a), y: ARCH.spring - r * Math.sin(a) }); }
  pts.push({ x: cx - r, y: ARCH.sill });
  return pts;
}

/** 扇形の石 (アーチの迫石) */
function wedge(g, cx, cy, r0, r1, a0, a1) {
  const pts = [];
  for (let s = 0; s <= 4; s++) { const a = a0 + (a1 - a0) * s / 4; pts.push({ x: cx + r0 * Math.cos(a), y: cy - r0 * Math.sin(a) }); }
  for (let s = 4; s >= 0; s--) { const a = a0 + (a1 - a0) * s / 4; pts.push({ x: cx + r1 * Math.cos(a), y: cy - r1 * Math.sin(a) }); }
  const sil = roughen(pts, true, .6, 8);
  fillPath(g, sil, PAL.stoneX);
  stipplePoly(g, sil, 3, { wfn: rimWeight(sil, .15, .9) });
  strokePath(g, sil, 1.8);
}

function hall(g, view) {
  // A dim, far hall: darker than the corridor so it reads as depth through the window arches.
  fillPoly(g, [{ x: view.x0, y: view.top }, { x: view.x1, y: view.top }, { x: view.x1, y: -24 }, { x: view.x0, y: -24 }], '#c9c1b3');
  each(view, 64, 0, (n, x) => { seed(`dg-hallwash-${n}`); hatchPoly(g, [{ x, y: view.top }, { x: x + 64, y: view.top }, { x: x + 64, y: -24 }, { x, y: -24 }], { angle: -0.6, gap: 5, w: .6, alpha: .25 }); });
  each(view, 180, 40, (n, x) => {
    seed(`dg-hall-${n}`);
    const cx = x + 40;
    const pillar = inkShape(g, [{ x: cx - 13, y: -236 }, { x: cx + 13, y: -236 }, { x: cx + 13, y: -30 }, { x: cx - 13, y: -30 }], { fill: '#ddd6ca', w: 1.3, amp: .5 });
    stipplePoly(g, pillar, 2, { wfn: rimWeight(pillar, .1, .9) });
    const arch = []; for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; arch.push({ x: cx + 13 + 77 * (1 - Math.cos(a)), y: -170 - 50 * Math.sin(a) }); }
    inkLine(g, arch, { w: 1.2, amp: .5, double: 0 });
    if (n % 2 === 0) {   // a dark doorway between the far pillars
      const door = inkShape(g, [{ x: cx + 60, y: -30 }, { x: cx + 60, y: -96 }, { x: cx + 90, y: -118 }, { x: cx + 120, y: -96 }, { x: cx + 120, y: -30 }], { fill: '#6f665b', w: 1.4, amp: .5 });
      hatchPoly(g, door, { angle: Math.PI / 2, gap: 2.4, w: .8, alpha: .7 });
    }
  });
  each(view, 40, 0, (n, x) => { seed(`dg-hallfloor-${n}`); inkLine(g, [{ x, y: -30 }, { x: x + 40, y: -30 }], { w: 1.2, amp: .4, double: 0 }); });
}

function wall(g, view) {
  for (let c = 0; WALL_BASE - c * COURSE > WALL_TOP; c++) {
    const y1 = WALL_BASE - c * COURSE, y0 = y1 - COURSE;
    stoneCourse(view, `dg-wall-${c}`, c * 137 % 480, (a, b) => frontStone(g, a + 1, y0 + 1, b - 1, y1 - 1, { density: 2.1, cracks: .3, w: 1.5, vgrad: .3 }));
  }
  // Ambient darkening where the wall meets the floor.
  each(view, 96, 0, (n, x) => { seed(`dg-ao-${n}`); stipplePoly(g, [{ x, y: WALL_BASE - 36 }, { x: x + 96, y: WALL_BASE - 36 }, { x: x + 96, y: WALL_BASE }, { x, y: WALL_BASE }], 5, { wfn: (px, py) => Math.pow((py - (WALL_BASE - 36)) / 36, 2.2) }); });
  // Arched windows: cut the opening, then add the reveal, sill, jambs and voussoirs.
  each(view, ARCH.every, ARCH.half + 40, (n, x) => {
    seed(`dg-arch-${n}`);
    const cx = x, open = archOpening(cx);
    g.save(); g.globalCompositeOperation = 'destination-out'; fillPath(g, open, '#000'); g.restore();
    g.save(); g.beginPath(); open.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); g.clip();
    const reveal = [...archOpening(cx), ...archOpening(cx + 10, 8).reverse()];
    fillPath(g, reveal, '#cfc8bc');
    hatchPoly(g, reveal, { angle: -0.8, gap: 3, w: .7, alpha: .55 });
    g.restore();
    let z = ARCH.sill;
    for (const [k, h] of [[0, 34], [1, 32], [2, 30]]) {   // alternating jamb stones
      const wl = k % 2 ? 20 : 26, wr = k % 2 ? 26 : 20;
      frontStone(g, cx - ARCH.half - wl, z - h, cx - ARCH.half, z, { density: 2.6, cracks: .2 });
      frontStone(g, cx + ARCH.half, z - h, cx + ARCH.half + wr, z, { density: 2.6, cracks: .2 });
      z -= h;
    }
    for (let k = 0; k < 9; k++) wedge(g, cx, ARCH.spring, ARCH.half, ARCH.half + (k === 4 ? 24 : 20), Math.PI * (9 - k) / 9 - .012, Math.PI * (8 - k) / 9 + .012);
    frontStone(g, cx - ARCH.half - 8, ARCH.sill, cx + ARCH.half + 8, ARCH.sill + 9, { density: 1.6, cracks: 0, round: 2 });
  }, ARCH.offset);
  // Torches: bracket and warm glow are baked; the flame is drawn every frame (dynamic).
  each(view, TORCH.every, 160, (n, x) => {
    const cx = x, y = TORCH.y;
    seed(`dg-torch-${n}`);
    const glow = g.createRadialGradient(cx, y - 24, 6, cx, y - 24, 150);
    glow.addColorStop(0, 'rgba(242,150,60,.5)'); glow.addColorStop(.35, 'rgba(244,172,95,.22)'); glow.addColorStop(1, 'rgba(244,190,120,0)');
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = glow; g.fillRect(cx - 160, y - 184, 320, 320); g.restore();
    frontStone(g, cx - 8, y + 6, cx + 8, y + 34, { density: 2.4, cracks: 0, round: 2, fill: '#7a7671', w: 1.5 });
    strokePath(g, [{ x: cx, y: y + 18 }, { x: cx, y: y + 4 }], 5, false); strokePath(g, [{ x: cx, y: y + 18 }, { x: cx, y: y + 4 }], 2.4, false, '#6b6762');
    inkShape(g, [{ x: cx - 3, y: y - 22 }, { x: cx + 3, y: y - 22 }, { x: cx + 2.5, y: y + 4 }, { x: cx - 2.5, y: y + 4 }], { fill: PAL.woodDark, w: 1.3, amp: .3 });
    const cup = inkShape(g, [{ x: cx - 9, y: y - 9 }, { x: cx + 9, y: y - 9 }, { x: cx + 5, y: y + 6 }, { x: cx - 5, y: y + 6 }], { fill: '#5c5854', w: 1.8, amp: .4, round: 2 });
    hatchPoly(g, cup, { angle: 1.3, gap: 2.5, w: .7, alpha: .6 });
  }, TORCH.offset);
}

/** 炎: 外側オレンジ→内側黄色の涙形を重ね、インク線で縁取る。time で揺らぐ (動的) */
function drawFlame(ctx, x, y, time) {
  const f = 1 + 0.08 * Math.sin(time * 11) + 0.05 * Math.sin(time * 17.3 + 1);
  const sw = Math.sin(time * 6.5) * 2.2;
  const tear = (w, h, s, oy = 0) => {
    const tip = { x: x + s, y: y + oy - h };
    return [
      { x: x - w, y: y + oy - h * 0.18 }, { x: x - w * 0.95, y: y + oy - h * 0.5 },
      { x: x - w * 0.4 + s * 0.5, y: y + oy - h * 0.8 }, tip, tip,          // 先端は点を重ねて尖らせる
      { x: x + w * 0.45 + s * 0.4, y: y + oy - h * 0.66 },
      { x: x + w * 0.95 + s * 0.6, y: y + oy - h * 0.86 }, { x: x + w * 0.95 + s * 0.6, y: y + oy - h * 0.86 }, // 横の舌
      { x: x + w * 0.8, y: y + oy - h * 0.52 }, { x: x + w, y: y + oy - h * 0.3 },
      { x: x + w * 0.75, y: y + oy - h * 0.02 }, { x: x, y: y + oy + h * 0.07 }, { x: x - w * 0.7, y: y + oy + h * 0.02 },
    ];
  };
  // ふんわりした光
  const g = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 40);
  g.addColorStop(0, 'rgba(255,200,110,0.45)'); g.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = g; ctx.fillRect(x - 40, y - 54, 80, 80);
  const outer = tear(11, 36 * f, sw);
  fillPath(ctx, outer, PAL.flameOut);
  fillPath(ctx, tear(7.5, 27 * f, sw * 0.8, 1), PAL.flameMid);
  fillPath(ctx, tear(4, 16 * f, sw * 0.5, 1), PAL.flameIn);
  strokePath(ctx, outer, 1.6);
  ctx.fillStyle = PAL.flameOut; // 火の粉
  for (let k = 0; k < 3; k++) {
    const ph = (time * 0.9 + k * 0.33) % 1;
    ctx.globalAlpha = 1 - ph;
    ctx.beginPath(); ctx.arc(x + Math.sin(k * 2.1 + time * 3) * 6, y - 38 - ph * 26, 1.3, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function wallFlames(g, view, time) {
  each(view, TORCH.every, 60, (n, x) => drawFlame(g, x, TORCH.y - 22, time + n * .37), TORCH.offset);
}

function floor(g, view) {
  const { back, front, slab } = FLOOR, mid = -6;
  // Flagstones seen from above: long, pale, lightly stippled, thin joints; unlike the wall's tall blocks.
  const flag = (a, b, y0, y1, id) => { seed(id); frontStone(g, a, y0, b, y1, { fill: chance(.5) ? PAL.floorA : PAL.floorB, density: .55, cracks: .18, w: 1.1, vgrad: 0, round: 1.5, amp: .4 }); };
  stoneCourse(view, 'dg-floor-back', 0, (a, b, id) => flag(a, b, back, mid, id), { minL: 96, maxL: 170 });
  stoneCourse(view, 'dg-floor-front', 211, (a, b, id) => flag(a, b, mid, front, id), { minL: 110, maxL: 190 });
  // The wall casts a soft shadow onto the back of the floor.
  each(view, 96, 0, (n, x) => { seed(`dg-floor-ao-${n}`); stipplePoly(g, [{ x, y: back }, { x: x + 96, y: back }, { x: x + 96, y: back + 14 }, { x, y: back + 14 }], 6, { wfn: (px, py) => Math.pow(1 - (py - back) / 14, 1.6) }); });
  // Front riser: two courses down to the bottom of the screen, darker below.
  stoneCourse(view, 'dg-riser', 97, (a, b) => frontStone(g, a + 1, front, b - 1, slab, { density: 3, cracks: .45, w: 2, vgrad: .6 }), { minL: 70, maxL: 140 });
  stoneCourse(view, 'dg-footing', 330, (a, b) => frontStone(g, a + 1, slab, b - 1, view.bottom + 30, { fill: PAL.stoneY, density: 4.2, cracks: .3, w: 2, vgrad: .8 }), { minL: 80, maxL: 150 });
  each(view, 48, 0, (n, x) => {
    seed(`dg-edge-${n}`);
    inkLine(g, [{ x, y: back }, { x: x + 48, y: back }], { w: 2, amp: .4, double: .3 });
    inkLine(g, [{ x, y: front }, { x: x + 48, y: front }], { w: 2.4, amp: .5, double: .3 });
  });
  each(view, 340, 20, (n, x) => {   // scattered rubble on the slabs
    seed(`dg-rubble-${n}`);
    if (!chance(.6)) return;
    const rx = x + R(20, 300), ry = R(-20, 8);
    for (let k = 0; k < 3; k++) {
      const px = rx + R(-8, 8), py = ry + R(-3, 3), s = R(2.5, 5);
      inkShape(g, [{ x: px - s, y: py }, { x: px - s * .3, y: py - s * .8 }, { x: px + s, y: py - s * .3 }, { x: px + s * .6, y: py + s * .5 }], { fill: '#d8d4cb', w: 1, amp: .3 });
    }
  });
}

/** ステージの両端: 戸口を塞いだ鉄の扉のある石壁 */
function ends(g, view) {
  const { slab } = FLOOR;
  for (const [[a, b], id] of stageEnds(view.stage).map((s, i) => [s, i ? 'right' : 'left'])) {
    if (b < view.x0 - 4 || a > view.x1 + 4) continue;
    seed(`dg-end-${id}`);
    for (let y1 = slab, c = 0; y1 > view.top - 30; y1 -= COURSE, c++) {
      let x = a - (c % 2) * 40;
      while (x < b) { const w = R(60, 100); frontStone(g, Math.max(a, x) + 1, y1 - COURSE + 1, Math.min(b, x + w) - 1, y1 - 1, { fill: '#e2ded6', density: 3, cracks: .35, w: 1.8 }); x += w; }
    }
    endFace(g, id === 'left' ? b : a, id, view.top - 30, slab);
  }
}


function foreground(g, view) {
  each(view, 1500, 60, (n, x) => {
    seed(`dg-fpillar-${n}`);
    const cx = x + 900, p = inkShape(g, [{ x: cx - 34, y: view.top - 40 }, { x: cx + 34, y: view.top - 40 }, { x: cx + 34, y: view.bottom + 40 }, { x: cx - 34, y: view.bottom + 40 }], { fill: '#d2cbbf', w: 2.8, amp: .8 });
    stipplePoly(g, p, 2.8, { wfn: px => .2 + .8 * Math.pow(Math.max(0, (px - (cx - 34)) / 68), 1.6) });
    hatchPoly(g, [{ x: cx + 8, y: view.top - 40 }, { x: cx + 36, y: view.top - 40 }, { x: cx + 36, y: view.bottom + 40 }, { x: cx + 8, y: view.bottom + 40 }], { angle: Math.PI / 2, gap: 2.6, w: .8, alpha: .55 });
    for (const yy of [-200, -60, 30]) inkLine(g, [{ x: cx - 34, y: yy }, { x: cx + 34, y: yy + R(-3, 3) }], { w: 1.4, amp: .5, double: 0 });
  });
  each(view, 1500, 20, (n, x) => {   // a hanging chain
    seed(`dg-chain-${n}`);
    const cx = x + 200, end = R(-190, -150);
    for (let y = view.top - 10, k = 0; y < end; y += 9, k++) {
      g.save(); g.translate(cx + Math.sin(k * .7) * .8, y);
      inkShape(g, k % 2 ? [{ x: -2, y: -5 }, { x: 2, y: -5 }, { x: 2, y: 5 }, { x: -2, y: 5 }] : [{ x: -4, y: -5 }, { x: 4, y: -5 }, { x: 4, y: 5 }, { x: -4, y: 5 }], { fill: k % 2 ? '#6d6b68' : '#9a9894', w: 1.2, amp: .2, round: 2.5 });
      g.restore();
    }
  });
}

export const dungeonTheme = Object.freeze({
  id: 'dungeon', name: 'ダンジョンの回廊',
  layers: Object.freeze([
    { id: 'hall', parallax: .35, opacity: .8, band: [null, -20], draw: hall },
    { id: 'wall', parallax: .8, band: [null, WALL_BASE + 2], draw: wall, dynamic: wallFlames },
    { id: 'floor', parallax: 1, band: [FLOOR.back - 12, null], draw: floor },
    { id: 'ends', parallax: 1, spans: stage => stageEnds(stage), draw: ends },
    { id: 'front', parallax: 1.3, front: true, opacity: .96, spans: stage => periodicSpans(stage, 1.3, 1500, [[900, 40, 40], [200, 10, 10]]), draw: foreground },
  ]),
});
