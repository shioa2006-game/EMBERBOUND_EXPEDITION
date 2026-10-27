/**
 * Inkstone — 横スクロールの背景テーマ「城下町」(鉛筆画)
 *   遠景 (0.28, 淡い): 丘の上の城と屋根の連なり
 *   家並み (0.65): 木組みの家 (漆喰の壁・柱と筋かい・窓と鎧戸・扉・瓦の切妻屋根・煙突・吊り看板)
 *   通り (0.9): 街灯と旗の飾り紐・樽と花箱
 *   石畳 (1): 丸い敷石の通りと切石の縁石。ステージの両端は町の城壁と門
 *   前景 (1.3): まばらな街灯と吊り看板
 */
import { seed, R, chance } from '../../core/random.js';
import { PAL } from '../../core/palette.js';
import { paint } from '../../core/paint.js';
import { fillPoly, hatchPoly, inkLine, inkShape, stipplePoly, strokePath } from '../../core/ink.js';
import { FLOOR, each, stoneCourse, frontStone, strokes, wave, periodicSpans, stageEnds, endFace } from './pencil.js';

const C = Object.freeze({
  hill: '#dfe2cf', far: '#d9d3c6', plaster: ['#f1ebdd', '#ece4d2', '#f3eee4'], timber: '#6e5641',
  roof: ['#b9a189', '#a99883', '#c2aa8c'], glass: '#6f7880', shutter: '#8f7a5d', door: '#8a6c4e',
  cobble: '#e8e3d8', iron: '#4f4c48', flag: ['#c98f78', '#d8c48a', '#93a58a', '#9fb0c2'],
});

const HOUSE_SLOT = 250;
const hill = x => -150 + wave(x, 14, .006) + wave(x, 7, .017, 1);
function far(g, view) {
  each(view, 20, 20, (n, x) => {
    seed(`tw-hill-${n}`);
    const a = { x, y: hill(x) }, b = { x: x + 20, y: hill(x + 20) };
    fillPoly(g, [a, b, { x: b.x, y: FLOOR.back }, { x: a.x, y: FLOOR.back }], C.hill);
    inkLine(g, [a, b], { w: 1, amp: .4, double: 0 });
  });
  each(view, 180, 40, (n, x) => {   // rooftops along the hill
    seed(`tw-farroof-${n}`);
    const cx = x + R(20, 160), base = hill(cx) + 16, w = R(18, 30), h = R(14, 24);
    inkShape(g, [{ x: cx - w, y: base }, { x: cx - w, y: base - h }, { x: cx, y: base - h - w * .7 }, { x: cx + w, y: base - h }, { x: cx + w, y: base }], { fill: C.far, w: .9, amp: .3 });
  });
  each(view, 1600, 100, (n, x) => {   // the small, distant castle on the hill
    seed(`tw-castle-${n}`);
    const cx = x + 700, base = hill(cx) + 8;
    inkShape(g, [{ x: cx - 40, y: base }, { x: cx - 40, y: base - 24 }, { x: cx + 40, y: base - 24 }, { x: cx + 40, y: base }], { fill: C.far, w: .9, amp: .3 });
    for (const [dx, w, h] of [[-40, 11, 44], [0, 14, 60], [40, 11, 42]]) {
      const top = base - h, tip = top - w * 1.3;
      inkShape(g, [{ x: cx + dx - w / 2, y: base }, { x: cx + dx - w / 2, y: top }, { x: cx + dx + w / 2, y: top }, { x: cx + dx + w / 2, y: base }], { fill: C.far, w: .9, amp: .3 });
      inkShape(g, [{ x: cx + dx - w / 2 - 3, y: top }, { x: cx + dx, y: tip }, { x: cx + dx + w / 2 + 3, y: top }], { fill: '#cbc1b2', w: .9, amp: .3 });
      inkLine(g, [{ x: cx + dx, y: tip }, { x: cx + dx, y: tip - 9 }], { w: .7, amp: .1, double: 0 });
      fillPoly(g, [{ x: cx + dx, y: tip - 9 }, { x: cx + dx + 7, y: tip - 6.5 }, { x: cx + dx, y: tip - 4 }], C.flag[0]);
    }
  });
}

/** 窓: ガラス・十字の桟・両側の鎧戸 */
function windowAt(g, x, y, w, h) {
  frontStone(g, x - 3, y + h, x + w + 3, y + h + 5, { fill: '#e6e0d4', density: 1, cracks: 0, round: 1, w: 1.1 });
  const glass = inkShape(g, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], { fill: C.glass, w: 1.6, amp: .3 });
  hatchPoly(g, glass, { angle: -0.7, gap: 3, w: .6, alpha: .35, color: '#f4f1ea' });
  inkLine(g, [{ x: x + w / 2, y }, { x: x + w / 2, y: y + h }], { w: 1.2, amp: .1, double: 0, color: '#efe9dc' });
  inkLine(g, [{ x, y: y + h * .45 }, { x: x + w, y: y + h * .45 }], { w: 1.2, amp: .1, double: 0, color: '#efe9dc' });
  for (const sx of [x - w * .45 - 2, x + w + 2]) {
    inkShape(g, [{ x: sx, y }, { x: sx + w * .45, y }, { x: sx + w * .45, y: y + h }, { x: sx, y: y + h }], { fill: C.shutter, w: 1.3, amp: .3 });
    for (let k = 1; k < 4; k++) inkLine(g, [{ x: sx + 1, y: y + h * k / 4 }, { x: sx + w * .45 - 1, y: y + h * k / 4 }], { w: .6, amp: .1, double: 0 });
  }
}

function house(g, n, slot) {
  seed(`tw-house-${n}`);
  // Mostly two storeys, so the roofs and the castle on the hill stay in view.
  const w = R(160, 205), x0 = slot + (HOUSE_SLOT - w) / 2, x1 = x0 + w, base = FLOOR.back + 4;
  const floors = chance(.7) ? 2 : 3, fh = R(46, 52), top = base - floors * fh, roofH = R(44, 66);
  const plaster = C.plaster[Math.floor(R(0, 3))], roof = C.roof[Math.floor(R(0, 3))];
  if (chance(.6)) {   // chimney behind the roof
    const cx = x0 + R(.2, .8) * w;
    frontStone(g, cx - 9, top - roofH * .8, cx + 9, top - roofH * .2, { fill: '#cfc5b6', density: 2.4, cracks: 0, round: 1.5 });
  }
  paint(g, [{ x: x0, y: base }, { x: x0, y: top }, { x: x1, y: top }, { x: x1, y: base }], { fill: plaster, w: 2, depth: 4, speck: .9, amp: .5 });
  // Timber frame: corner posts, floor beams, and diagonal braces.
  const beam = (pts, w2 = 3.2) => { strokePath(g, pts, w2 + 1.6, false); strokePath(g, pts, w2, false, C.timber); };
  for (const px of [x0 + 3, x1 - 3]) beam([{ x: px, y: base }, { x: px, y: top }]);
  for (let f = 1; f <= floors; f++) beam([{ x: x0, y: base - f * fh + 3 }, { x: x1, y: base - f * fh + 3 }]);
  for (let f = 1; f < floors; f++) {
    const y0 = base - (f + 1) * fh + 6, y1 = base - f * fh;
    beam([{ x: x0 + 3, y: y1 }, { x: x0 + 26, y: y0 }], 2.4); beam([{ x: x1 - 3, y: y1 }, { x: x1 - 26, y: y0 }], 2.4);
  }
  // Windows on the upper floors, a door and a window on the ground floor.
  for (let f = 1; f < floors; f++) {
    const count = w > 190 ? 3 : 2;
    for (let k = 0; k < count; k++) windowAt(g, x0 + w * (k + .5) / count - 9, base - (f + 1) * fh + 12, 18, 24);
  }
  const doorX = x0 + R(.2, .65) * w;
  const door = paint(g, [{ x: doorX, y: base }, { x: doorX, y: base - 40 }, { x: doorX + 13, y: base - 50 }, { x: doorX + 26, y: base - 40 }, { x: doorX + 26, y: base }], { fill: C.door, w: 1.8, depth: 3, speck: .8, amp: .4 });
  hatchPoly(g, door, { angle: Math.PI / 2, gap: 4.5, w: .7, alpha: .5 });
  windowAt(g, doorX > x0 + w / 2 ? x0 + 26 : x1 - 46, base - 44, 18, 22);
  // Tiled gable roof with an overhang.
  paint(g, [{ x: x0 - 12, y: top + 2 }, { x: (x0 + x1) / 2, y: top - roofH }, { x: x1 + 12, y: top + 2 }], { fill: roof, w: 2, depth: 4, speck: .9, amp: .5 });
  for (let k = 1; k < 5; k++) {   // tile courses
    const yy = top + 2 - roofH * k / 5, half = (w / 2 + 12) * (1 - k / 5);
    const row = []; for (let t = 0; t <= 10; t++) row.push({ x: (x0 + x1) / 2 - half + 2 * half * t / 10, y: yy + (t % 2 ? 1.5 : 0) });
    inkLine(g, row, { w: .8, amp: .3, double: 0 });
  }
  if (chance(.45)) {   // a hanging shop sign on a bracket
    const sx = x1 - 6, sy = base - fh - 10;
    beam([{ x: sx, y: sy }, { x: sx + 26, y: sy }], 2);
    for (const dx of [8, 22]) inkLine(g, [{ x: sx + dx, y: sy }, { x: sx + dx, y: sy + 8 }], { w: .8, amp: .1, double: 0 });
    paint(g, [{ x: sx + 4, y: sy + 8 }, { x: sx + 26, y: sy + 8 }, { x: sx + 26, y: sy + 26 }, { x: sx + 4, y: sy + 26 }], { fill: '#d6c299', w: 1.4, depth: 2, speck: .6, amp: .3 });
  }
}

function houses(g, view) {
  each(view, HOUSE_SLOT, 20, (n, slot) => house(g, n, slot));
}

function street(g, view) {
  const post = (x, n) => {
    seed(`tw-lamp-${n}`);
    strokePath(g, [{ x, y: FLOOR.back }, { x, y: -150 }], 5.5, false); strokePath(g, [{ x, y: FLOOR.back }, { x, y: -150 }], 3.2, false, C.iron);
    inkShape(g, [{ x: x - 9, y: -150 }, { x: x + 9, y: -150 }, { x: x + 6, y: -172 }, { x: x - 6, y: -172 }], { fill: '#f1d9a0', w: 1.6, amp: .2 });
    inkShape(g, [{ x: x - 11, y: -172 }, { x: x + 11, y: -172 }, { x, y: -182 }], { fill: C.iron, w: 1.3, amp: .2 });
  };
  each(view, 520, 60, (n, x) => post(x + 80, n));
  each(view, 520, 260, (n, x) => {   // bunting between two posts
    seed(`tw-bunting-${n}`);
    const a = { x: x + 80, y: -162 }, b = { x: x + 600, y: -162 }, sag = 34, pts = [];
    for (let t = 0; t <= 26; t++) { const u = t / 26; pts.push({ x: a.x + (b.x - a.x) * u, y: a.y + sag * 4 * u * (1 - u) }); }
    inkLine(g, pts, { w: 1, amp: .2, double: 0 });
    for (let t = 1; t < 26; t += 2) {
      const p = pts[t], q = pts[t + 1];
      inkShape(g, [p, q, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 + 14 }], { fill: C.flag[(t + n) % 4], w: .9, amp: .2 });
    }
  });
  each(view, 380, 40, (n, x) => {
    seed(`tw-prop-${n}`);
    if (!chance(.7)) return;
    const px = x + R(150, 330);
    if (chance(.5)) {   // barrel
      paint(g, [{ x: px - 13, y: FLOOR.back }, { x: px - 15, y: FLOOR.back - 18 }, { x: px - 13, y: FLOOR.back - 36 }, { x: px + 13, y: FLOOR.back - 36 }, { x: px + 15, y: FLOOR.back - 18 }, { x: px + 13, y: FLOOR.back }], { fill: PAL.wood, w: 1.7, depth: 3, speck: .8, amp: .3 });
      for (const yy of [-8, -28]) inkLine(g, [{ x: px - 14, y: FLOOR.back + yy }, { x: px + 14, y: FLOOR.back + yy }], { w: 1.6, amp: .2, double: 0, color: C.iron });
    } else {   // flower box under a window line
      paint(g, [{ x: px - 20, y: FLOOR.back }, { x: px - 20, y: FLOOR.back - 14 }, { x: px + 20, y: FLOOR.back - 14 }, { x: px + 20, y: FLOOR.back }], { fill: PAL.woodLight, w: 1.5, depth: 2, speck: .6, amp: .3 });
      for (let k = 0; k < 6; k++) {
        const fx = px - 16 + k * 6.4;
        strokes(g, [[fx, FLOOR.back - 14, R(-2, 2), -R(6, 10)]], { w: .9, color: '#6b7a55' });
        g.fillStyle = C.flag[k % 4]; g.beginPath(); g.arc(fx + R(-1, 1), FLOOR.back - R(19, 23), 2.4, 0, Math.PI * 2); g.fill();
      }
    }
  });
}

function cobbles(g, view) {
  const { back, front, slab } = FLOOR;
  each(view, 60, 0, (n, x) => {
    seed(`tw-cobble-${n}`);
    fillPoly(g, [{ x, y: back }, { x: x + 60, y: back }, { x: x + 60, y: front }, { x, y: front }], '#d9d3c7');
    for (let row = 0; row < 3; row++) {
      const y0 = back + row * 14, shift = row % 2 ? 7 : 0;
      for (let k = 0; k < 4; k++) {
        const cx = x + shift + k * 15 + R(-1.5, 1.5), cy = y0 + 7 + R(-1, 1), rx = R(5.5, 7), ry = R(4.5, 5.5);
        const pts = []; for (let i = 0; i < 10; i++) { const a = Math.PI * 2 * i / 10; pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
        const s = inkShape(g, pts, { fill: C.cobble, w: 1.1, amp: .4, round: 2 });
        stipplePoly(g, s, 2.4, { wfn: (px, py) => .2 + .8 * Math.max(0, (py - cy) / ry) });
      }
    }
  });
  each(view, 96, 0, (n, x) => { seed(`tw-cobble-ao-${n}`); stipplePoly(g, [{ x, y: back }, { x: x + 96, y: back }, { x: x + 96, y: back + 10 }, { x, y: back + 10 }], 4, { wfn: (px, py) => 1 - (py - back) / 10 }); });
  stoneCourse(view, 'tw-curb', 41, (a, b) => frontStone(g, a + 1, front, b - 1, slab, { density: 2.2, cracks: .3, w: 2, vgrad: .5 }), { minL: 80, maxL: 150 });
  stoneCourse(view, 'tw-gutter', 300, (a, b) => frontStone(g, a + 1, slab, b - 1, view.bottom + 30, { fill: PAL.stoneY, density: 3.6, cracks: .2, w: 2, vgrad: .8 }), { minL: 90, maxL: 160 });
  each(view, 48, 0, (n, x) => { seed(`tw-edge-${n}`); inkLine(g, [{ x, y: front }, { x: x + 48, y: front }], { w: 2.3, amp: .5, double: .3 }); });
}

/** ステージの両端: 町の城壁と閉じた門 */
function ends(g, view) {
  for (const [[a, b], id] of stageEnds(view.stage).map((s, i) => [s, i ? 'right' : 'left'])) {
    if (b < view.x0 - 4 || a > view.x1 + 4) continue;
    seed(`tw-end-${id}`);
    for (let y1 = view.bottom + 30, c = 0; y1 > view.top - 40; y1 -= 32, c++) {
      for (let x = a - (c % 2) * 40; x < b; x += 80) frontStone(g, Math.max(a, x) + 1, y1 - 31, Math.min(b, x + 80) - 1, y1 - 1, { fill: '#e4ddd0', density: 2.6, cracks: .3, w: 1.8 });
    }
    endFace(g, id === 'left' ? b : a, id, view.top - 40, view.bottom + 30, { fill: '#c4bcae' });
  }
}


function foreground(g, view) {
  each(view, 1200, 40, (n, x) => {
    seed(`tw-fpost-${n}`);
    const cx = x + 700;
    strokePath(g, [{ x: cx, y: view.bottom + 20 }, { x: cx, y: -230 }], 11, false); strokePath(g, [{ x: cx, y: view.bottom + 20 }, { x: cx, y: -230 }], 7, false, '#5a5651');
    inkShape(g, [{ x: cx - 16, y: -230 }, { x: cx + 16, y: -230 }, { x: cx + 11, y: -268 }, { x: cx - 11, y: -268 }], { fill: '#f1d9a0', w: 2.2, amp: .3 });
    inkShape(g, [{ x: cx - 20, y: -268 }, { x: cx + 20, y: -268 }, { x: cx, y: -286 }], { fill: C.iron, w: 1.8, amp: .3 });
  });
  each(view, 1200, 60, (n, x) => {   // a shop sign hanging from above
    seed(`tw-fsign-${n}`);
    const sx = x + 150, top = view.top - 4;
    strokePath(g, [{ x: sx - 30, y: top + 12 }, { x: sx + 40, y: top + 12 }], 6, false); strokePath(g, [{ x: sx - 30, y: top + 12 }, { x: sx + 40, y: top + 12 }], 3.6, false, C.iron);
    for (const dx of [-12, 22]) inkLine(g, [{ x: sx + dx, y: top + 12 }, { x: sx + dx, y: top + 30 }], { w: 1.2, amp: .1, double: 0 });
    paint(g, [{ x: sx - 22, y: top + 30 }, { x: sx + 32, y: top + 30 }, { x: sx + 32, y: top + 64 }, { x: sx - 22, y: top + 64 }], { fill: '#d6c299', w: 2.2, depth: 3, speck: .8, amp: .3 });
  });
}

export const townTheme = Object.freeze({
  id: 'town', name: '城下町',
  layers: Object.freeze([
    { id: 'far', parallax: .28, opacity: .75, band: [null, FLOOR.back + 2], draw: far },
    { id: 'houses', parallax: .65, band: [null, FLOOR.back + 8], draw: houses },
    { id: 'street', parallax: .9, band: [-200, FLOOR.back + 4], draw: street },
    { id: 'cobbles', parallax: 1, band: [FLOOR.back - 4, null], draw: cobbles },
    { id: 'ends', parallax: 1, spans: stage => stageEnds(stage), draw: ends },
    { id: 'front', parallax: 1.3, front: true, opacity: .95, spans: stage => periodicSpans(stage, 1.3, 1200, [[700, 24, 24], [150, 40, 50]]), draw: foreground },
  ]),
});
