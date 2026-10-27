/**
 * Inkstone — 横スクロールの背景テーマ「森」(鉛筆画)
 *   空 (0.12, 淡い): ゆっくり流れる雲 / 遠い木立 (0.3, 淡い): 連なる梢の線と針葉樹の先
 *   木々 (0.6): 幹 (樹皮の筋・根) と葉の塊 / 茂み (0.85): 小道の奥の茂みとシダ
 *   小道 (1): 土の道・小石・草の房・根の見える土手。ステージの両端は岩と倒木
 *   前景 (1.3): まばらなシダの株と、上から垂れる枝
 */
import { seed, R, chance } from '../../core/random.js';
import { paint } from '../../core/paint.js';
import { fillPoly, hatchPoly, inkLine, inkShape, roughen, stipplePoly, strokePath } from '../../core/ink.js';
import { FLOOR, each, strokes, wave, periodicSpans, stageEnds } from './pencil.js';

const C = Object.freeze({
  cloud: '#f4f0e6', farLeaf: '#d6dcc5', leaf: '#c7d0ab', leafDark: '#aab68c', bush: '#b8c49b',
  bark: '#a58c6c', barkDark: '#7f6a50', dirt: '#e7ddc9', bank: '#d6c8ad', rock: '#d8d4cb',
});

/** 丸い塊の点列 (雲・葉・茂み)。縁は丸いこぶと鋭い切れ込みの連なり (|sin| の帆立貝形) で、葉の茂りに見せる */
function blob(cx, cy, rx, ry, lumps = 9) {
  const pts = [], n = lumps * 8, phase = R(0, Math.PI);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 2 * i / n, bump = .86 + .16 * Math.abs(Math.sin(a * lumps / 2 + phase)) + R(-.015, .015);
    pts.push({ x: cx + Math.cos(a) * rx * bump, y: cy + Math.sin(a) * ry * bump });
  }
  return pts;
}

function sky(g, view) {
  each(view, 700, 160, (n, x) => {
    seed(`fo-cloud-${n}`);
    const cx = x + R(100, 600), cy = R(-250, -190), w = R(70, 120);
    for (let k = 0; k < 3; k++) inkShape(g, blob(cx + (k - 1) * w * .45, cy - (k === 1 ? 10 : 0), w * .5, w * .24, 6), { fill: C.cloud, w: 1, amp: .5 });
  });
}

const treeline = x => -112 + wave(x, 10, .031) + wave(x, 14, .011, 2) + wave(x, 5, .073, 1);
function far(g, view) {
  each(view, 16, 16, (n, x) => {
    seed(`fo-far-${n}`);
    const a = { x, y: treeline(x) }, b = { x: x + 16, y: treeline(x + 16) };
    fillPoly(g, [a, b, { x: b.x, y: FLOOR.back }, { x: a.x, y: FLOOR.back }], C.farLeaf);
    inkLine(g, [a, b], { w: 1.1, amp: .5, step: 6, double: 0 });
    if (n % 2 === 0) strokes(g, [[x + R(2, 14), treeline(x + 8) + R(6, 30), R(-1, 1), R(6, 14)]], { w: .6, alpha: .5 });
  });
  each(view, 150, 30, (n, x) => {   // pointed conifer tops above the line
    seed(`fo-pine-${n}`);
    if (!chance(.7)) return;
    const cx = x + R(10, 140), base = treeline(cx) + 10, h = R(34, 62);
    // Three stacked tiers read as a conifer, not a roof.
    for (let t = 0; t < 3; t++) {
      const tb = base - h * t * .28, th = h * (.55 - t * .1), tw = h * (.34 - t * .07);
      inkShape(g, [{ x: cx, y: tb - th }, { x: cx + tw, y: tb }, { x: cx + tw * .4, y: tb - th * .12 }, { x: cx - tw * .4, y: tb - th * .12 }, { x: cx - tw, y: tb }], { fill: C.farLeaf, w: .9, amp: .3 });
    }
  });
}

function trees(g, view) {
  each(view, 300, 140, (n, x) => {
    seed(`fo-tree-${n}`);
    const cx = x + R(60, 240), w = R(10, 15), lean = R(-8, 8), top = -205;
    const trunk = [{ x: cx - w - 6, y: FLOOR.back - 2 }, { x: cx - w, y: -60 }, { x: cx - w * .8 + lean, y: top }, { x: cx + w * .8 + lean, y: top }, { x: cx + w, y: -60 }, { x: cx + w + 7, y: FLOOR.back - 2 }];
    paint(g, trunk, { fill: C.bark, w: 1.8, depth: 4, speck: 1.4, amp: .6 });
    for (let k = 0; k < 4; k++) {   // bark furrows
      const bx = cx + R(-w * .6, w * .6);
      inkLine(g, [{ x: bx, y: FLOOR.back - 10 }, { x: bx + lean * .4, y: -120 }, { x: bx + lean * .8, y: top + 20 }], { w: .7, amp: .8, step: 10, double: 0, color: C.barkDark });
    }
    for (const s of [-1, 1]) inkLine(g, [{ x: cx + s * w, y: FLOOR.back - 14 }, { x: cx + s * (w + 12), y: FLOOR.back - 2 }, { x: cx + s * (w + 20), y: FLOOR.back }], { w: 1.4, amp: .4, double: 0 });
    const lumps = 4 + Math.floor(R(0, 3));
    for (let k = 0; k < lumps; k++) {   // leafy crown: overlapping masses, back to front
      const bx = cx + lean + R(-70, 70), by = top + R(-50, 30), r = R(40, 66);
      const crown = paint(g, blob(bx, by, r, r * .78, 10), { fill: k % 2 ? C.leaf : C.leafDark, w: 1.6, depth: 5, light: .25, speck: 1.2, amp: .4, step: 4 });
      for (let i = 0; i < 6; i++) { const p = crown[Math.floor(R(0, crown.length))]; strokes(g, [[p.x, p.y, R(-4, 4), R(3, 6)]], { w: .7 }); }
    }
  });
}

function brush(g, view) {
  each(view, 150, 70, (n, x) => {
    seed(`fo-bush-${n}`);
    const cx = x + R(10, 140), w = R(28, 52), h = R(22, 40);
    paint(g, blob(cx, FLOOR.back - h * .45, w, h * .6, 8), { fill: C.bush, w: 1.4, depth: 3, light: .2, speck: 1, amp: .4, step: 4 });
    if (chance(.5)) for (let k = 0; k < 5; k++) {   // a fern fan
      const a = -Math.PI / 2 + (k - 2) * .38, len = R(20, 30), fx = cx + w * .9;
      inkLine(g, [{ x: fx, y: FLOOR.back - 2 }, { x: fx + Math.cos(a) * len * .6, y: FLOOR.back - 2 + Math.sin(a) * len * .6 }, { x: fx + Math.cos(a) * len, y: FLOOR.back + Math.sin(a) * len }], { w: 1, amp: .3, double: 0 });
    }
    if (chance(.35)) { g.fillStyle = '#e8d38e'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx + R(-w, w) * .7, FLOOR.back - R(6, h * .8), 1.6, 0, Math.PI * 2); g.fill(); } }
  });
}

function path(g, view) {
  const { back, front } = FLOOR, bottom = view.bottom + 30;
  each(view, 64, 0, (n, x) => {
    seed(`fo-path-${n}`);
    fillPoly(g, [{ x, y: back }, { x: x + 64, y: back }, { x: x + 64, y: front }, { x, y: front }], C.dirt);
    stipplePoly(g, [{ x, y: back }, { x: x + 64, y: back }, { x: x + 64, y: front }, { x, y: front }], 2.2, { wfn: (px, py) => .3 + .7 * Math.pow(Math.abs(py - (back + front) / 2) / 21, 2) });
    fillPoly(g, [{ x, y: front }, { x: x + 64, y: front }, { x: x + 64, y: bottom }, { x, y: bottom }], C.bank);
    stipplePoly(g, [{ x, y: front }, { x: x + 64, y: front }, { x: x + 64, y: bottom }, { x, y: bottom }], 3.6, { wfn: (px, py) => .25 + .75 * Math.min(1, (py - front) / 60) });
    if (chance(.5)) {   // a root crossing the bank
      const rx = x + R(0, 64);
      inkLine(g, [{ x: rx, y: front + 3 }, { x: rx + R(-10, 10), y: front + R(14, 22) }, { x: rx + R(-16, 16), y: front + R(28, 44) }], { w: 1.4, amp: .5, step: 6, double: 0, color: '#6f5a43' });
    }
    if (chance(.45)) {   // a pebble on the path
      const px = x + R(6, 58), py = R(back + 6, front - 4), s = R(2.5, 4.5);
      inkShape(g, [{ x: px - s, y: py }, { x: px - s * .2, y: py - s * .7 }, { x: px + s, y: py - s * .2 }, { x: px + s * .4, y: py + s * .5 }], { fill: C.rock, w: 1, amp: .3 });
    }
    const tufts = [];
    for (let k = 0; k < 7; k++) { const tx = x + R(0, 64); tufts.push([tx, back + 2, R(-3, 3), -R(5, 11)]); }
    for (let k = 0; k < 6; k++) { const tx = x + R(0, 64); tufts.push([tx, front - 1, R(-3, 3), R(5, 10)]); }
    strokes(g, tufts, { w: .9 });
    inkLine(g, [{ x, y: back }, { x: x + 64, y: back }], { w: 1.1, amp: .8, double: 0, alpha: .7 });
    inkLine(g, [{ x, y: front }, { x: x + 64, y: front }], { w: 2.1, amp: 1, step: 8, double: .3 });
  });
}

/** ステージの両端: 積み重なった岩 */
function ends(g, view) {
  for (const [[a, b], id] of stageEnds(view.stage).map((s, i) => [s, i ? 'right' : 'left'])) {
    if (b < view.x0 - 4 || a > view.x1 + 4) continue;
    seed(`fo-end-${id}`);
    for (let y = view.bottom + 20, c = 0; y > view.top - 40; y -= R(40, 60), c++) {   // stacked boulders
      for (let x = a - c % 2 * 30; x < b; x += R(70, 110)) {
        const r = R(36, 56), rock = paint(g, blob(Math.max(a + 20, Math.min(b - 20, x + r)), y - r * .5, r, r * .7, 5), { fill: C.rock, w: 2, depth: 6, light: .2, speck: 2.2, amp: .8 });
        hatchPoly(g, rock, { angle: -0.9, gap: 4, w: .7, alpha: .35 });
      }
    }
  }
}


function foreground(g, view) {
  each(view, 1100, 80, (n, x) => {
    seed(`fo-fern-${n}`);
    const cx = x + 520, base = view.bottom + 10;
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (k - 4) * .22, len = R(90, 140);
      const tip = { x: cx + Math.cos(a) * len, y: base + Math.sin(a) * len }, mid = { x: cx + Math.cos(a) * len * .55 + (k - 4) * 3, y: base + Math.sin(a) * len * .55 };
      strokePath(g, roughen([{ x: cx, y: base }, mid, tip], false, .6, 8), 2.2, false, '#5d6649');
      for (let s = .3; s < .95; s += .12) {
        const p = { x: cx + (tip.x - cx) * s, y: base + (tip.y - base) * s }, l = 12 * (1 - s) + 3;
        strokes(g, [[p.x, p.y, -Math.sin(a) * l - 3, Math.cos(a) * l * .3 - 4], [p.x, p.y, Math.sin(a) * l + 3, -Math.cos(a) * l * .3 - 4]], { w: 1.2, color: '#5d6649' });
      }
    }
  });
  each(view, 1100, 120, (n, x) => {   // a branch hanging in from the top
    seed(`fo-branch-${n}`);
    const x0 = x + 980, bend = [{ x: x0 - 140, y: view.top - 10 }, { x: x0 - 40, y: view.top + 24 }, { x: x0 + 70, y: view.top + 40 }];
    strokePath(g, roughen(bend, false, .8, 8), 6, false, '#5f4c38'); strokePath(g, roughen(bend, false, .5, 8), 3.4, false, '#8a7055');
    for (let k = 0; k < 5; k++) {
      const p = { x: x0 - 120 + k * 46 + R(-8, 8), y: view.top + 20 + k * 6 + R(0, 18) };
      paint(g, blob(p.x, p.y + 14, R(18, 26), R(13, 18), 5), { fill: '#a3ae83', w: 1.6, depth: 3, speck: .8, amp: .6 });
    }
  });
}

export const forestTheme = Object.freeze({
  id: 'forest', name: '森',
  layers: Object.freeze([
    { id: 'sky', parallax: .12, opacity: .8, band: [null, -150], draw: sky },
    { id: 'far', parallax: .3, opacity: .7, band: [null, FLOOR.back + 2], draw: far },
    { id: 'trees', parallax: .6, band: [null, FLOOR.back + 6], draw: trees },
    { id: 'brush', parallax: .85, band: [-90, FLOOR.back + 6], draw: brush },
    { id: 'path', parallax: 1, band: [FLOOR.back - 14, null], draw: path },
    { id: 'ends', parallax: 1, spans: stage => stageEnds(stage), draw: ends },
    { id: 'front', parallax: 1.3, front: true, opacity: .95, spans: stage => periodicSpans(stage, 1.3, 1100, [[520, 160, 160], [980, 180, 120]]), draw: foreground },
  ]),
});
