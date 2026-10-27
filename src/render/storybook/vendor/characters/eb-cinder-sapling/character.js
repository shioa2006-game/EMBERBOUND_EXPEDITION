/**
 * EMBERBOUND EXPEDITION — Cinder Sapling (game id `cinder_sapling`), a new small tree creature after the user's
 * reference image: a charred stump body with a jagged rim and a flame burning in its hollow top, a small face,
 * glowing cracks and a knot hole, twig arms and stubby root legs. Gnarlwood summons it; it shares the bark and
 * flame drawing with Gnarlwood.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (sway, flicker), a short twig-arm swipe (impact at 0.15 s), the
 * shared hurt.
 */
import { TAU } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, flame, sparks, crack, limb, bark, TREE, drawCreature } from '../shared/emberbound/creature.js';

const C = TREE;
const IDLE_T = 2;
export const SAPLING_ATTACK_T = .3;   // swipe lands at u = .5

export function saplingPose(action, t) {
  const P = { sway: Math.sin(TAU * phase(t, IDLE_T)), arm: .3, lean: 0, shift: 0, t };
  if (action === 'attack') {
    const u = phase(t, SAPLING_ATTACK_T);
    P.arm = sample([[0, [.3]], [.25, [-1.3]], [.5, [.95]], [.7, [.8]], [1, [.3]]], u);
    P.lean = sample([[0, [0]], [.25, [-3]], [.5, [4]], [.7, [3]], [1, [0]]], u);
    P.shift = sample([[0, [0]], [.25, [-2]], [.5, [5]], [.7, [4]], [1, [0]]], u);
  }
  return P;
}

// A twig arm from the shoulder at angle a (0 = forward, + = down), elbow bent down, three twig fingers.
function arm(ctx, f, sx, sy, a, fill) {
  const e = [sx + Math.cos(a) * 9, sy + Math.sin(a) * 9], b = a + .45, h = [e[0] + Math.cos(b) * 8, e[1] + Math.sin(b) * 8];
  limb(ctx, f, [[sx, sy], e, h], 2.8, 1.6, fill, { w: 1.2 });
  for (const d of [-.6, 0, .6]) line(ctx, f, [h, [h[0] + Math.cos(b + d) * 5, h[1] + Math.sin(b + d) * 5]], 1);
}

export function drawSapling(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = saplingPose(action, t), f = face(direction), sx = P.shift, lw = P.lean, sw = P.sway * .8;
  const top = -42, parts = [];
  // Points high on the body follow the lean (forward at the top).
  const L = (px, py) => [px + sx + lw * (-py / 42) + sw * (-py / 42), py];
  // Root legs: short roots splaying out to the ground.
  parts.push({ id: 'farLeg', d: -10, draw: () => limb(ctx, f, [[-4 + sx, -12], [-9 + sx, -4], [-17 + sx, 0]], 5, 2, C.barkDark, { w: 1.3 }) });
  // The front arm is the far one (behind the body) and swipes; the near arm hangs at the back.
  parts.push({ id: 'farArm', d: -6, draw: () => arm(ctx, f, ...L(17, -26), P.arm, C.barkDark) });
  parts.push({ id: 'flame', d: -3, draw: () => {
    const [fx, fy] = L(0, top + 2);
    flame(ctx, f, fx, fy, 20, 30, P.t, -.3, 0, { w: 1.3 });
    sparks(ctx, f, fx - 2, fy - 26, 8, 12, P.t, 3, .4);
  } });
  parts.push({ id: 'body', d: 0, draw: () => {
    // Stump: wider at the roots, a jagged broken rim on top.
    const body = [L(18, -10), L(19, -26), L(17, top), L(12, top - 4), L(7, top + 1), L(1, top - 6), L(-5, top), L(-10, top - 3), L(-17, top + 1),
      L(-18, -26), L(-19, -10), L(-12, -6), L(12, -6)];
    blob(ctx, f, body, C.bark, { w: 1.8, depth: 2.4, light: .2, speck: 1.2 });
    blob(ctx, f, [L(15, top + 2), L(-15, top + 2), L(-12, top + 6), L(12, top + 6)], C.hollow, { w: 0, depth: 0, speck: 0 });
    bark(ctx, f, -16 + sx, -2 + sx, top + 10, -8, 3, 1.2, .5);
    crack(ctx, f, [L(-9, -16), L(-7, -22), L(-10, -29)]);
    crack(ctx, f, [L(12, -10), L(10, -15)]);
    disc(ctx, f, ...L(-12, -12), 2.4, 3, C.hollow, { w: .7, depth: 0, speck: 0 });
    // Face: two dark eyes and a small mouth, near the front.
    const blink = action === 'hurt' && t < .2;
    for (const ex of [2, 10]) {
      const [qx, qy] = L(ex, -30);
      if (blink) line(ctx, f, [[qx - 2, qy], [qx + 2, qy]], 1);
      else disc(ctx, f, qx, qy, 1.8, 3, C.ink, { w: .4, depth: 0, speck: 0 });
    }
    const [mx, my] = L(6, -22);
    line(ctx, f, [[mx - 2, my], [mx, my + 1.2], [mx + 2, my]], .8);
  } });
  parts.push({ id: 'nearLeg', d: 6, draw: () => { limb(ctx, f, [[5 + sx, -12], [10 + sx, -4], [18 + sx, 0]], 5.2, 2, C.bark, { w: 1.3 }); limb(ctx, f, [[2 + sx, -8], [2 + sx, -2], [-2 + sx, 1]], 3, 1.4, C.bark, { w: 1.1 }); } });
  parts.push({ id: 'nearArm', d: 8, draw: () => arm(ctx, f, ...L(-16, -22), Math.PI - .6 - P.sway * .1, C.bark) });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-cinder-sapling', fallTilt(action, t), { pivot: 18, toe: 18, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-cinder-sapling', label: 'Cinder Sapling — EMBERBOUND', kind: 'creature', directional: true, draw: drawSapling,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: SAPLING_ATTACK_T, keys: [0, .12, .25, .38, .5, .62, .75, .9], once: true },
    hurt: hurtAction },
  frameBox: { x0: -60, x1: 60, y0: -95, y1: 12 },
  emberbound: { gameId: 'cinder_sapling', heightPx: 14, facing: 'L' },
});
export const studio = Object.freeze({ order: 9, name: 'Cinder Sapling（燃えさしの苗木）', category: 'EMBERBOUND 第1エリア',
  description: '焦げた小さな切り株の苗木。小枝の腕と根の脚、頭頂の窪みで炎が燃える。Gnarlwood が呼び出す増援。',
  preview: { direction: 'L', phase: 0 } });
