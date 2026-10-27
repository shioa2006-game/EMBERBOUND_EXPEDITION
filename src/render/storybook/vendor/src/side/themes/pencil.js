/**
 * Inkstone — 横スクロールの背景テーマで共有する鉛筆画の部品
 *
 * 座標は層の座標 (x = 層の上の位置、y = 地面からの高さ。下へ +)。どの部品も、呼ぶ前に部品ごとの乱数の種を決める
 * (区画の境界をまたいでも同じ形になるように)。手描きの質感はキャラクターと同じ ink.js の線・点描・ハッチングで出す。
 */
import { seed, R } from '../../core/random.js';
import { PAL } from '../../core/palette.js';
import { faceCracks, fillPath, clipPath, roughen, roundedPoly, stippleFace, strokePath, inkLine } from '../../core/ink.js';

/** 床の帯: 奥の縁 (y < 0) と手前の縁 (y > 0)、手前の縁の下端。キャラクターの足元 (y = 0) は帯の中 */
export const FLOOR = Object.freeze({ back: -26, front: 16, slab: 54 });

/** [x0, x1] にかかる「間隔 step の n 番目」の部品を順に呼ぶ (pad = 部品のはみ出しの余裕) */
export function each(view, step, pad, fn, offset = 0) {
  for (let n = Math.floor((view.x0 - pad - offset) / step); n * step + offset <= view.x1 + pad; n++) fn(n, n * step + offset);
}

/**
 * 石積みの段: 幅 span ごとの区間に、長さ minL〜maxL の石を割り付ける。区間ごとに種を決めるので、
 * どの区画から描いても同じ割り付けになる。段ごとに区間の始まりをずらし (phase)、縦の目地がそろわないようにする。
 * cb(x0, x1, id) を [view.x0, view.x1] にかかる石ごとに呼ぶ。
 */
export function stoneCourse(view, key, phase, cb, { span = 480, minL = 46, maxL = 96 } = {}) {
  each(view, span, maxL, (n, start) => {
    seed(`${key}-${n}`);
    let x = start;
    while (x < start + span - 1) {
      let len = R(minL, maxL);
      if (start + span - (x + len) < minL * .6) len = start + span - x;   // absorb thin offcuts
      const a = x, b = x + len; x = b;
      if (b >= view.x0 - 2 && a <= view.x1 + 2) cb(a, b, `${key}-${n}-${Math.round(a)}`);
    }
  }, phase);
}

/**
 * 正面から見た石のブロック: 角を不ぞろいに丸めた外形 → 塗り → 縁ほど濃い点描 → 面のひび → 外形線。
 * o = { fill, density, round, w, cracks (確率), vgrad (下ほど濃く), amp }。戻り値は外形の点列。
 */
export function frontStone(g, x0, y0, x1, y1, o = {}) {
  const r = o.round ?? 4;
  const sil = roughen(roundedPoly([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], () => r * R(.4, 1.8)), true, o.amp ?? .8, 9);
  g.save();
  fillPath(g, sil, o.fill ?? PAL.stoneX);
  clipPath(g, sil);
  const A = { x: x0, y: y0 }, B = { x: x1, y: y0 }, D = { x: x0, y: y1 };
  stippleFace(g, A, B, D, o.density ?? 2.6, { base: .08, edge: 1, fall: 5, vgrad: o.vgrad ?? .45 });
  if ((o.cracks ?? .5) > 0) faceCracks(g, A, B, D, o.cracks ?? .5);
  g.restore();
  strokePath(g, sil, o.w ?? 1.8);
  return sil;
}

/** 上から見た石の天端 (縁石・棚の上面): 平行四辺形の帯。y0 = 奥の縁、y1 = 手前の縁 */
export function stoneTop(g, x0, x1, y0, y1, o = {}) {
  const pts = roughen([{ x: x0 + 2, y: y0 }, { x: x1 - 2, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], true, .6, 9);
  fillPath(g, pts, o.fill ?? PAL.stoneTop);
  stippleFace(g, { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y1 }, o.density ?? 1, { base: .05, edge: .9, fall: 7 });
  strokePath(g, pts, o.w ?? 1.4);
  return pts;
}

/** 揺らぎ線の短い描線を束ねる (草・葉・毛羽立ち)。strokes = [[x, y, dx, dy], …] */
export function strokes(g, list, o = {}) {
  for (const [x, y, dx, dy] of list) inkLine(g, [{ x, y }, { x: x + dx, y: y + dy }], { w: o.w ?? .8, amp: o.amp ?? .3, step: 5, alpha: o.alpha ?? 1, double: 0, color: o.color });
}

/**
 * 間隔 step ごとに置く部品の「絵がある範囲」(層の spans 用)。items = [[offset, 左の幅, 右の幅], …]。
 * 層の座標でステージの長さ × parallax より十分広い範囲を返すので、まばらな前景の空の区画を作らずに済む。
 */
export function periodicSpans(stage, parallax, step, items) {
  const out = [], end = stage.length * parallax + 3000;
  for (let x = Math.floor(-2000 / step) * step; x <= end; x += step) for (const [o, l, r] of items) out.push([x + o - l, x + o + r]);
  return out;
}

/**
 * ステージ両端の壁の範囲 (主役の層の座標)。カメラは 0〜length の外を映さないので、壁は inset だけステージの内側へ入れて
 * 画面の端に見せる (キャラクターは margin より外へ出ないので、壁の手前で止まって見える)。
 */
export const stageEnds = (stage, width = 360, inset = 36) => [[-width, inset], [stage.length - inset, stage.length + width]];

/** 端の壁の、ステージに向いた厚みの面を陰の帯で描く。side = 'left' なら壁は帯の左にある */
export function endFace(g, x, side, top, bottom, o = {}) {
  const w = o.width ?? 12, x0 = side === 'left' ? x - w : x, x1 = x0 + w;
  const face = roughen([{ x: x0, y: top }, { x: x1, y: top }, { x: x1, y: bottom }, { x: x0, y: bottom }], true, .5, 9);
  fillPath(g, face, o.fill ?? '#b9b2a6');
  for (let y = top + 3; y < bottom; y += 3.2) inkLine(g, [{ x: x0 + 1, y }, { x: x1 - 1, y: y + 2 }], { w: .7, amp: .2, step: 6, alpha: .6, double: 0 });
  strokePath(g, face, o.w ?? 2.2);
}

/** 決まった x に対して滑らかに揺れる値 (乱数を使わないので区画の境界で必ず連続する) */
export const wave = (x, a, f, p = 0) => a * Math.sin(x * f + p);
