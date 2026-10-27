/**
 * Inkstone — 横スクロールの仮の背景 (段階3)。段階4で鉛筆画のテーマに置き換える。
 *   遠景: 低い丘の線 / 中景: 等間隔の柱 (スクロールが分かる目印) / 主役の層: 床の帯と手前の縁、ステージ両端の壁
 *   座標は層の座標 (x = 層の上の位置、y = 地面からの高さ。下へ +)。部品ごとに乱数の種を決める (区画の継ぎ目対策)。
 */
import { seed, R } from '../../core/random.js';
import { PAL } from '../../core/palette.js';
import { fillPoly, hatchPoly, inkLine, inkShape, stipplePoly } from '../../core/ink.js';
import { FLOOR, each, stageEnds } from './pencil.js';

const hill = x => -128 + 16 * Math.sin(x * .0045) + 8 * Math.sin(x * .013 + 1.3);

function far(g, view) {
  each(view, 24, 24, (n, x) => {
    seed(`ph-far-${n}`);
    const a = { x, y: hill(x) }, b = { x: x + 24, y: hill(x + 24) };
    fillPoly(g, [a, b, { x: b.x, y: FLOOR.back - 8 }, { x: a.x, y: FLOOR.back - 8 }], 'rgba(214,207,192,.28)');
    inkLine(g, [a, b], { w: 1.1, amp: .5, step: 8, alpha: .38, double: 0 });
    if (n % 3 === 0) for (let k = 0; k < 3; k++) {
      const hx = x + R(2, 22), hy = hill(hx) + R(8, 30);
      inkLine(g, [{ x: hx, y: hy }, { x: hx + 6, y: hy + 4 }], { w: .7, amp: .2, alpha: .22, double: 0 });
    }
  });
}

function mid(g, view) {
  const top = -214, base = FLOOR.back - 8;
  each(view, 32, 32, (n, x) => {   // faint back-wall baseline
    seed(`ph-wall-${n}`);
    inkLine(g, [{ x, y: base }, { x: x + 32, y: base }], { w: 1, amp: .4, alpha: .3, double: 0 });
  });
  each(view, 280, 40, (n, x) => {
    seed(`ph-pillar-${n}`);
    const cx = x + 60, w = 15;
    const body = inkShape(g, [{ x: cx - w, y: top + 16 }, { x: cx + w, y: top + 16 }, { x: cx + w, y: base - 10 }, { x: cx - w, y: base - 10 }],
      { fill: '#ebe7df', w: 1.1, amp: .5 });
    hatchPoly(g, [{ x: cx + w * .3, y: top + 16 }, { x: cx + w + 2, y: top + 16 }, { x: cx + w + 2, y: base - 10 }, { x: cx + w * .3, y: base - 10 }],
      { angle: Math.PI / 2, gap: 3, w: .6, alpha: .32 });
    for (const [y0, y1, ext] of [[top, top + 16, 6], [base - 10, base, 7]])
      inkShape(g, [{ x: cx - w - ext, y: y0 }, { x: cx + w + ext, y: y0 }, { x: cx + w + ext, y: y1 }, { x: cx - w - ext, y: y1 }], { fill: '#e2ded5', w: 1.1, amp: .4 });
    stipplePoly(g, body, 1.2);
  });
}

function ground(g, view) {
  const { back, front, slab } = FLOOR;
  each(view, 72, 0, (n, x) => {
    seed(`ph-floor-${n}`);
    fillPoly(g, [{ x, y: back }, { x: x + 72, y: back }, { x: x + 72, y: front }, { x, y: front }], n % 2 ? PAL.floorA : PAL.floorB);
    fillPoly(g, [{ x, y: front }, { x: x + 72, y: front }, { x: x + 72, y: slab }, { x, y: slab }], PAL.stoneX);
    stipplePoly(g, [{ x, y: back }, { x: x + 72, y: back }, { x: x + 72, y: back + 12 }, { x, y: back + 12 }], 4, { wfn: (px, py) => 1 - (py - back) / 12 });
    stipplePoly(g, [{ x, y: front }, { x: x + 72, y: front }, { x: x + 72, y: slab }, { x, y: slab }], 2.4, { wfn: (px, py) => .25 + .75 * (py - front) / (slab - front) });
    inkLine(g, [{ x, y: back }, { x: x + 72, y: back }], { w: 1.6, amp: .5, double: .3 });
    inkLine(g, [{ x, y: front }, { x: x + 72, y: front }], { w: 2, amp: .6, double: .3 });
    inkLine(g, [{ x, y: slab }, { x: x + 72, y: slab }], { w: 2.2, amp: .6, double: 0 });
    const jx = x + R(-3, 3);
    inkLine(g, [{ x: jx, y: back }, { x: jx + R(-2, 2), y: front }], { w: 1.2, amp: .4, double: 0 });
    if (n % 2 === 0) inkLine(g, [{ x: jx + R(-4, 4), y: front }, { x: jx + R(-4, 4), y: slab }], { w: 1.2, amp: .4, double: 0 });
    if (R(0, 1) < .35) {   // a small crack in the tile
      const cx = x + R(14, 58), cy = back + R(6, 20);
      inkLine(g, [{ x: cx, y: cy }, { x: cx + R(-6, 6), y: cy + R(4, 8) }, { x: cx + R(-8, 8), y: cy + R(9, 14) }], { w: .8, amp: .3, step: 4, double: 0 });
    }
  });
  // Stage ends: hatched walls reaching just inside 0 and length, so they show at the screen edge.
  for (const [[a, b], id] of stageEnds(view.stage, 320).map((s, i) => [s, i ? 'right' : 'left'])) {
    if (b < view.x0 - 4 || a > view.x1 + 4) continue;
    seed(`ph-end-${id}`);
    const wall = inkShape(g, [{ x: a, y: view.top - 20 }, { x: b, y: view.top - 20 }, { x: b, y: slab }, { x: a, y: slab }], { fill: '#d9d3c7', w: 2.4, amp: .6 });
    hatchPoly(g, wall, { angle: -0.9, gap: 4, w: .8, alpha: .5 });
  }
}

export const placeholderTheme = Object.freeze({
  id: 'placeholder', name: '仮の背景',
  layers: Object.freeze([
    { id: 'far', parallax: .3, draw: far },
    { id: 'mid', parallax: .6, draw: mid },
    { id: 'ground', parallax: 1, draw: ground },
  ]),
});
