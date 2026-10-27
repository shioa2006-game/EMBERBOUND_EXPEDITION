/**
 * EMBERBOUND EXPEDITION — Prism Sentinel (game id `prism_sentinel`, elite), a new floating crystal construct after
 * the user's reference image: a glowing pale core sphere held by four crystal clusters — pale blue above and
 * below, violet to the front and back — each set in a grey stone collar with a small diamond gem, with stone
 * wedges floating between them. No limbs; it hovers, its lowest point a little above the ground.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (hovering, the arms breathing in and out), attack (the front arm
 * jabs and fires a shard, released at u = .15), `cast` = the Prism Beam charge the game loops (the arms spread,
 * the core flares), and the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, crystal, CRYSTAL, drawCreature } from '../shared/emberbound/creature.js';

const C = { ...CRYSTAL, core: '#e8f7fb', coreGlow: '#bfeaf5', stone: '#8d8590', stoneDark: '#6c6470', gem: '#cdb6ee', ink: PAL.ink };
const IDLE_T = 2.4;
export const PRISM_ATTACK_T = .3;   // the shard leaves the front arm at u = .15
export const PRISM_CHARGE_T = .6;   // Prism Beam charge: a loop
const CY = -84, R = 20;            // core centre height and radius

export function prismPose(action, t) {
  const s = Math.sin(TAU * phase(t, IDLE_T));
  const P = { bob: s * 3, gap: 1 + s * 1.5, front: 0, glow: .3 + .1 * s, shard: -1, rays: -1 };
  if (action === 'attack') {
    const u = phase(t, PRISM_ATTACK_T);
    P.front = sample([[0, [0]], [.1, [-4]], [.2, [12]], [.5, [8]], [1, [0]]], u);
    P.glow = sample([[0, [.3]], [.15, [.9]], [.6, [.4]], [1, [.3]]], u);
    P.shard = u >= .15 && u < .75 ? (u - .15) / .6 : -1;
  } else if (action === 'cast') {
    // Prism Beam: the arms pulled out, the core flaring and pulsing; periodic in u.
    const u = phase(t, PRISM_CHARGE_T), w = Math.sin(TAU * u);
    P.gap = 9 + w * 2; P.glow = .8 + .2 * w; P.rays = u; P.bob = w * 1.2;
  }
  return P;
}

/** A crystal arm: a stone collar at distance `d` from the core along angle `a`, a cluster of crystals beyond it. */
function arm(ctx, f, cy, a, d, len, col, glow, seed) {
  const c = Math.cos(a), s = Math.sin(a), at = (u, v) => [c * u - s * v, cy + s * u + c * v];
  // Two smaller crystals beside the main one, then the main crystal.
  for (const v of [-1, 1]) { const [bx, by] = at(d + 4, v * 10); crystal(ctx, f, bx, by, a + v * .3, len * .6, len * .32, col, { w: 1.2, glow }); }
  const [mx, my] = at(d + 2, 0);
  crystal(ctx, f, mx, my, a, len, len * .52, col, { w: 1.5, glow, shoulder: .6 });
  // The stone collar: a thick band across the arm, with a diamond gem in a square setting.
  blob(ctx, f, [at(d - 3, -13), at(d + 6, -14), at(d + 8, 0), at(d + 6, 14), at(d - 3, 13), at(d - 5, 0)], C.stone, { w: 1.6, depth: 1.6, speck: 1.2 });
  blob(ctx, f, [at(d - 1, 0), at(d + 3, -7), at(d + 7, 0), at(d + 3, 7)], C.stoneDark, { w: 1.2, depth: .6, speck: .5 });
  blob(ctx, f, [at(d + .5, 0), at(d + 3, -4.4), at(d + 5.5, 0), at(d + 3, 4.4)], C.gem, { w: .8, depth: .2, speck: 0 });
  line(ctx, f, [at(d, -12), at(d + 5, -13)], .5);
  void seed;
}

export function drawPrism(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = prismPose(action, t), f = face(direction), cy = CY - P.bob, d = R + 2 + P.gap;
  const parts = [];
  parts.push({ id: 'back', d: -6, draw: () => arm(ctx, f, cy, Math.PI, d, 58, C.lilac, P.glow * .5, 1) });
  parts.push({ id: 'vertical', d: -4, draw: () => {
    arm(ctx, f, cy, -Math.PI / 2, d, 56, C.blue, P.glow * .5, 2);
    arm(ctx, f, cy, Math.PI / 2, d - 2, 44, C.blue, P.glow * .5, 3);
  } });
  parts.push({ id: 'wedges', d: -2, draw: () => {
    // Stone wedges floating in the four gaps between the arms.
    for (const a of [-.78, .78, 2.36, -2.36]) {
      const c = Math.cos(a), s = Math.sin(a), r0 = R + 4 + P.gap * .6, at = (u, v) => [c * u - s * v, cy + s * u + c * v];
      blob(ctx, f, [at(r0, -5), at(r0 + 12, 0), at(r0, 5)], C.stone, { w: 1.3, depth: 1, speck: .6 });
    }
  } });
  parts.push({ id: 'core', d: 0, draw: () => {
    // The glowing core: a halo, the pale sphere, violet shards seen inside it, a bright highlight.
    ctx.save(); ctx.globalAlpha = .18 + P.glow * .25;
    disc(ctx, f, 0, cy, R + 8 + P.glow * 6, R + 8 + P.glow * 6, C.coreGlow, { w: 0, depth: 0, speck: 0 });
    ctx.restore();
    disc(ctx, f, 0, cy, R, R, C.core, { w: 1.8, depth: 1.4, speck: .3 });
    ctx.save(); ctx.globalAlpha = .35;
    for (const [dx, dy, rx, ry] of [[-6, 6, 6, 4], [5, 7, 5, 3.5], [-9, -3, 4, 3], [8, -5, 4, 3]]) disc(ctx, f, dx, cy + dy, rx, ry, C.lilac, { w: 0, depth: 0, speck: 0 });
    ctx.restore();
    disc(ctx, f, -6, cy - 7, 5, 4, '#ffffff', { w: 0, depth: 0, speck: 0 });
  } });
  parts.push({ id: 'front', d: 6, draw: () => arm(ctx, f, cy, 0, d + P.front, 62, C.lilac, P.glow * .6, 4) });
  parts.push({ id: 'magic', d: 10, draw: () => {
    if (P.shard >= 0) {
      const u = P.shard, bx = R + d + 60 + u * 60;
      ctx.save(); ctx.globalAlpha = 1 - u * .6;
      crystal(ctx, f, bx, cy, 0, 18, 8, C.lilac, { w: 1.2, glow: .8 });
      for (const k of [1, 2]) line(ctx, f, [[bx - k * 8, cy - 2], [bx - k * 8 - 6, cy - 2]], .6);
      ctx.restore();
    }
    if (P.rays >= 0) {
      // Short rays flicking out from the core as the beam charges (they cycle with the loop).
      for (let i = 0; i < 6; i++) {
        const a = TAU * (i / 6 + P.rays * .25), r0 = R + 6, r1 = R + 14 + 6 * Math.sin(TAU * (P.rays * 2 + i / 3));
        ctx.save(); ctx.globalAlpha = .7;
        line(ctx, f, [[Math.cos(a) * r0, cy + Math.sin(a) * r0], [Math.cos(a) * r1, cy + Math.sin(a) * r1]], .9);
        ctx.restore();
      }
    }
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-prism-sentinel', fallTilt(action, t), { pivot: 40, toe: 40, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-prism-sentinel', label: 'Prism Sentinel — EMBERBOUND', kind: 'creature', directional: true, draw: drawPrism,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: PRISM_ATTACK_T, keys: [0, .08, .15, .25, .35, .45, .55, .7, .85], once: true, releaseAt: .15 },
    cast: { period: PRISM_CHARGE_T, frames: 8 },
    hurt: hurtAction },
  frameBox: { x0: -200, x1: 200, y0: -190, y1: 16 },
  emberbound: { gameId: 'prism_sentinel', heightPx: 39, facing: 'L' },
});
export const studio = Object.freeze({ order: 22, name: 'Prism Sentinel（プリズムの番兵）', category: 'EMBERBOUND 第3エリア',
  description: '光る球の核を、上下の水色と前後の紫の結晶で囲んだ浮遊する構造物（エリート）。後衛を狙う光線 Prism Beam を溜める。',
  preview: { direction: 'L', phase: 0 } });
