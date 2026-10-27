/**
 * EMBERBOUND EXPEDITION — Lantern Eater (game id `lantern_eater`), a new moth after the user's reference image: a
 * fuzzy dark-purple body seen from the side — a round head with huge dark glossy eyes and a small yellow beak-like
 * mouth, two curved feathery antennae, a shaggy collar, six thin hairy legs hanging below, a striped abdomen with a
 * yellow tip — and four broad dusky-violet wings with soft yellow-green spots. The game raises flying enemies
 * 18 px, so the feet hang at about y = 0 here.
 * Unlike the Gem Bat (face-on, quick flaps) it is drawn side-on with slow, fluttering strokes of the raised wings.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (fluttering, a loop), a short lunging bite that sips the lantern's
 * light (contact at 0.15 s), the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, tufted, drawCreature } from '../shared/emberbound/creature.js';

const C = {
  fur: '#4a3b55', furDark: '#352a3f', furLight: '#6d5a78', ruff: '#8a7a8e', wing: '#7e6496', wingDark: '#5b4672', wingEdge: '#b98a9a',
  spot: '#d9e86a', eye: '#1d1722', glint: '#f2e98a', beak: '#e7c65a', light: '#f7f2a8', ink: PAL.ink,
};
const FLAP_T = .5;
export const MOTH_ATTACK_T = .3;   // lunge: the bite lands at u = .5

export function mothPose(action, t) {
  const fl = Math.sin(TAU * phase(t, FLAP_T));
  const P = { flap: fl, bob: -fl * 2.5, shift: 0, drop: 0, beak: 0, sip: -1 };
  if (action === 'attack') {
    const u = phase(t, MOTH_ATTACK_T);
    P.shift = sample([[0, [0]], [.25, [-5]], [.5, [16]], [.7, [13]], [1, [0]]], u);
    P.drop = sample([[0, [0]], [.25, [-4]], [.5, [5]], [.7, [4]], [1, [0]]], u);
    P.flap = sample([[0, [0]], [.25, [1]], [.5, [-.8]], [.75, [0]], [1, [0]]], u);
    P.bob = 0; P.beak = sample([[0, [0]], [.35, [1]], [.55, [.3]], [1, [0]]], u);
    P.sip = u >= .45 && u < .85 ? (u - .45) / .4 : -1;
  }
  return P;
}

/** Rotate local points about origin o by angle a, after shifting them to o. */
const turn = (pts, o, a) => pts.map(([px, py]) => [o[0] + px * Math.cos(a) - py * Math.sin(a), o[1] + px * Math.sin(a) + py * Math.cos(a)]);

/** A wing outline from points around its root, its spots (centres and radii in the same frame), turned by `a`. */
function wing(ctx, f, o, a, pts, spots, fill, k = 1) {
  const sc = p => [p[0] * k, p[1] * k];
  blob(ctx, f, turn(pts.map(sc), o, a), fill, { w: 1.6, depth: 1.6, light: .2, speck: 1 });
  for (const [px, py, rx, ry] of spots) {
    const [c] = turn([sc([px, py])], o, a);
    ctx.save(); ctx.globalAlpha = .85; disc(ctx, f, c[0], c[1], rx * k, ry * k, C.spot, { w: 0, depth: 0, speck: .4 }); ctx.restore();
  }
  // Veins from the root.
  for (const p of [pts[2], pts[4], pts[6]]) if (p) line(ctx, f, turn([[0, 0], sc([p[0] * .8, p[1] * .8])], o, a), .45);
}

export function drawMoth(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = mothPose(action, t), f = face(direction), cx = P.shift, cy = -34 + P.bob + P.drop, fa = P.flap * .45;
  const sh = [cx - 4, cy - 10];
  const parts = [];
  const FORE = [[0, 0], [-6, -26], [-16, -50], [-34, -60], [-56, -56], [-66, -42], [-58, -26], [-36, -12], [-12, -2]];
  const HIND = [[0, 4], [-16, 4], [-34, 10], [-48, 22], [-46, 36], [-30, 40], [-14, 30], [-4, 16]];
  // The far forewing rises behind the body, a little forward and darker.
  parts.push({ id: 'farWing', d: -8, draw: () => wing(ctx, f, [sh[0] + 6, sh[1] - 2], fa * 1.1 + .5, FORE, [[-30, -40, 6, 4], [-46, -46, 4.4, 3]], C.wingDark, .82) });
  // The far legs, shorter and darker.
  const legs = near => () => {
    const col = near ? C.furLight : C.furDark, o = near ? 0 : 5;
    [[9, 4, 20, 16], [2, 6, 6, 20], [-5, 6, -12, 18]].forEach(([hx, hy, fx, fy], i) => {
      const hip = [cx + hx + o, cy + hy], knee = [cx + (hx + fx) / 2 + o + 4, cy + hy + fy * .45], foot = [cx + fx + o, cy + hy + fy];
      limb(ctx, f, [hip, knee, foot], 2, 1.2, col, { w: 1, depth: .4 });
      line(ctx, f, [foot, [foot[0] + 2.5, foot[1] + 2]], .7);
      if (near) for (const u of [.3, .6]) line(ctx, f, [[hip[0] + (knee[0] - hip[0]) * u * 2, hip[1] + (knee[1] - hip[1]) * u * 2], [hip[0] + (knee[0] - hip[0]) * u * 2 - 2, hip[1] + (knee[1] - hip[1]) * u * 2 + 1]], .45);
    });
  };
  parts.push({ id: 'farLegs', d: -6, draw: legs(false) });
  parts.push({ id: 'hindWing', d: -4, draw: () => wing(ctx, f, [sh[0] - 2, sh[1] + 4], fa * .6, HIND, [[-26, 22, 6, 5]], C.wing) });
  parts.push({ id: 'body', d: 0, draw: () => {
    // The striped abdomen curving down and back to a yellow tip, the fuzzy thorax.
    const ab = [[cx - 4, cy + 2], [cx - 16, cy + 8], [cx - 26, cy + 16], [cx - 34, cy + 26]];
    limb(ctx, f, ab, 11, 4, C.fur, { w: 1.8, depth: 2 });
    blob(ctx, f, [[cx - 31, cy + 22], [cx - 37, cy + 24], [cx - 37, cy + 31], [cx - 32, cy + 29]], C.beak, { w: 1, depth: .4, speck: 0 });
    for (const [px, py, r] of [[-12, 6, 9], [-20, 11, 7.5], [-27, 17, 6]]) line(ctx, f, [[cx + px + r * .5, cy + py - r], [cx + px - r * .4, cy + py + r]], .6);
    for (const [px, py] of [[-18, 6], [-26, 14]]) disc(ctx, f, cx + px, cy + py, 1.6, 1.4, C.spot, { w: 0, depth: 0, speck: 0 });
    blob(ctx, f, tufted([[cx - 12, cy + 2], [cx - 8, cy - 12], [cx + 4, cy - 14], [cx + 12, cy - 6], [cx + 10, cy + 8], [cx - 4, cy + 10]], 4.5, 2.2), C.fur, { w: 1.8, depth: 2, speck: 1.2 });
  } });
  parts.push({ id: 'nearLegs', d: 2, draw: legs(true) });
  parts.push({ id: 'head', d: 4, draw: () => {
    // Drawn 1.5x about its centre: a big round head with huge eyes, as in the reference.
    const hx0 = cx + 20, hy0 = cy - 10, K = 1.5, hx = 0, hy = 0, Q = ([px, py]) => [hx0 + px * K, hy0 + py * K];
    // Feathery antennae curving up and forward, the far one first.
    for (const [ox, k, col] of [[-3, .85, C.furDark], [2, 1, C.furLight]]) {
      const pts = [[ox, -10], [ox + 4 * k, -22 * k], [ox + 14 * k, -30 * k], [ox + 24 * k, -28 * k]].map(Q);
      limb(ctx, f, pts, 1, .6, col, { w: .7, depth: .2 });
      for (let i = 1; i <= 8; i++) {
        const u = i / 9, s = Math.min(2, Math.floor(u * 3)), p = pts[s], q = pts[s + 1], v = u * 3 - s, m = [p[0] + (q[0] - p[0]) * v, p[1] + (q[1] - p[1]) * v];
        line(ctx, f, [m, [m[0] - 2 * k, m[1] - 4 * k]], .35); line(ctx, f, [m, [m[0] + 2.6 * k, m[1] - 3 * k]], .35);
      }
    }
    // The shaggy collar, the round head, the big dark eyes with yellow glints, the little beak.
    blob(ctx, f, tufted([[-17, 6], [-16, -6], [-9, -10], [-3, -2], [-1, 9], [-7, 15], [-14, 13]].map(Q), 3.5, 2.8), C.ruff, { w: 1.5, depth: 1.2, light: .25, speck: .8 });
    blob(ctx, f, tufted([[-10, 2], [-8, -9], [2, -13], [12, -8], [15, 2], [9, 10], [-4, 10]].map(Q), 4, 1.8), C.fur, { w: 1.8, depth: 2 });
    for (const [ex, ey, r] of [[...Q([1, -1]), 5 * K], [...Q([9.5, -1]), 5.8 * K]]) {
      disc(ctx, f, ex, ey, r, r * 1.05, C.eye, { w: .9, depth: 0, speck: 0 });
      disc(ctx, f, ex + r * .25, ey - r * .1, r * .42, r * .48, C.glint, { w: 0, depth: 0, speck: 0 });
      disc(ctx, f, ex - r * .35, ey - r * .45, r * .16, r * .16, '#ffffff', { w: 0, depth: 0, speck: 0 });
    }
    const bk = P.beak * 2.4;
    blob(ctx, f, [[12, 5], [16, 6], [13, 8.5 - bk * .3]].map(Q), C.beak, { w: .8, depth: 0, speck: 0 });
    blob(ctx, f, [[12, 7.5], [15, 8 + bk], [12, 9.5 + bk]].map(Q), C.beak, { w: .8, depth: 0, speck: 0 });
  } });
  parts.push({ id: 'nearWing', d: 6, draw: () => wing(ctx, f, sh, fa, FORE, [[-36, -40, 7, 5], [-52, -46, 5, 3.6], [-22, -22, 4, 3]], C.wing) });
  parts.push({ id: 'sip', d: 12, draw: () => {
    if (P.sip < 0) return;
    // A wisp of lantern light drawn into the mouth.
    const u = P.sip, hx = cx + 46, hy = cy;
    ctx.save(); ctx.globalAlpha = (1 - u) * .9;
    for (let i = 0; i < 4; i++) { const k = (i / 4 + u) % 1, px = hx + 22 * (1 - k), py = hy + Math.sin(k * 6 + i) * 3; disc(ctx, f, px, py, 2.6 * (1 - k * .5), 2.6 * (1 - k * .5), C.light, { w: .6, depth: 0, speck: 0 }); }
    ctx.restore();
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-lantern-eater', fallTilt(action, t), { pivot: 10, toe: 10, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-lantern-eater', label: 'Lantern Eater — EMBERBOUND', kind: 'creature', directional: true, draw: drawMoth,
  actions: { idle: { period: FLAP_T, frames: 8 },
    attack: { period: MOTH_ATTACK_T, keys: [0, .12, .25, .38, .5, .6, .7, .85], once: true },
    hurt: hurtAction },
  frameBox: { x0: -130, x1: 130, y0: -125, y1: 30 },
  emberbound: { gameId: 'lantern_eater', heightPx: 17, facing: 'L' },
});
export const studio = Object.freeze({ order: 33, name: 'Lantern Eater（灯喰らい）', category: 'EMBERBOUND 第5エリア',
  description: '羽に黄緑の斑点がある紫の蛾。大きな黒い目と羽毛の触角。噛みつくとランタンの残り時間を削る。',
  preview: { direction: 'L', phase: 0 } });
