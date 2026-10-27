/**
 * EMBERBOUND EXPEDITION — Shardback (game id `shardback`), a new heavy four-legged beast after the user's
 * reference image: a low, purple-grey body armoured with angular rock plates, a blunt boxy head with a small
 * dark eye under a plate brow, short thick legs with pale claws, a short spiked tail, and a row of lilac, blue
 * and pink crystals along the spine, tallest over the middle of the back.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (breathing), a short head-down ram (impact at 0.15 s), the
 * shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, crystal, rock, CRYSTAL, drawCreature } from '../shared/emberbound/creature.js';

const C = { ...CRYSTAL, belly: '#a89c96', claw: '#ddd2c0', ink: PAL.ink };
const IDLE_T = 2.8;
export const SHARD_ATTACK_T = .3;   // ram: impact at u = .5

export function shardPose(action, t) {
  const P = { shift: 0, nod: 0, breathe: Math.sin(TAU * phase(t, IDLE_T)), tail: Math.sin(t * 2) * 2 };
  if (action === 'attack') {
    const u = phase(t, SHARD_ATTACK_T);
    P.shift = sample([[0, [0]], [.25, [-6]], [.5, [16]], [.7, [13]], [1, [0]]], u);
    P.nod = sample([[0, [0]], [.25, [-3]], [.45, [6]], [.55, [4]], [1, [0]]], u);
  }
  return P;
}

/** A thick leg with three pale claws at the front of the foot. */
function stump(ctx, f, hip, foot, r0, r1, fill) {
  limb(ctx, f, [hip, [(hip[0] + foot[0]) / 2 + 2, (hip[1] + foot[1]) / 2], [foot[0], foot[1] - r1 * .8]], r0, r1, fill, { w: 1.7 });
  blob(ctx, f, [[foot[0] - r1 * 1.2, foot[1]], [foot[0] - r1 * 1.1, foot[1] - r1 * 1.4], [foot[0] + r1 * 1.2, foot[1] - r1 * 1.3], [foot[0] + r1 * 1.5, foot[1]]], fill, { w: 1.6, depth: 1.2 });
  for (const dx of [-.4, .5, 1.3]) blob(ctx, f, [[foot[0] + r1 * dx - 2.6, foot[1] + .5], [foot[0] + r1 * dx - 2, foot[1] - 4], [foot[0] + r1 * dx + 2.4, foot[1] - 4], [foot[0] + r1 * dx + 3, foot[1] + .5]], C.claw, { w: 1.1, depth: .4, speck: 0 });
}

export function drawShardback(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = shardPose(action, t), f = face(direction), sx = P.shift, b = P.breathe;
  const parts = [];
  const legs = (near) => () => {
    const o = near ? 0 : 7, oy = near ? 0 : -3, col = near ? C.rock : C.rockDark;
    stump(ctx, f, [32 + sx + o, -26 + oy], [36 + sx + o, oy], 12, 8, col);
    stump(ctx, f, [-32 + sx * .7 + o, -28 + oy], [-36 + sx * .6 + o, oy], 13, 8.5, col);
  };
  parts.push({ id: 'farLegs', d: -10, draw: legs(false) });
  parts.push({ id: 'tail', d: -6, draw: () => {
    const tw = P.tail;
    limb(ctx, f, [[-50 + sx * .7, -38], [-66 + sx * .6, -34 + tw * .5], [-82 + sx * .5, -30 + tw]], 12, 3, C.rock, { w: 1.6 });
    for (const [px, py, l] of [[-60, -42, 9], [-70, -38, 7], [-78, -34, 5]]) crystal(ctx, f, px + sx * .6, py + tw * .4, -2.1, l, 5, C.lilac, { w: 1 });
  } });
  parts.push({ id: 'crystals', d: -2, draw: () => {
    // Crystals along the spine, leaning back a little; the tallest stand over the middle of the back.
    [[28, -46, 20, -1.8, C.lilac], [16, -50, 32, -1.72, C.blue], [2, -52, 46, -1.62, C.lilac], [-14, -52, 40, -1.55, C.blue],
     [-28, -50, 30, -1.5, C.pink], [-40, -47, 22, -1.45, C.lilac], [-50, -43, 15, -1.4, C.blue], [-8, -50, 22, -1.9, C.pink], [22, -48, 14, -1.3, C.pink]]
      .forEach(([px, py, len, a, col]) => crystal(ctx, f, px + sx * .9, py - b * .6, a, len * 1.35, Math.max(8, len * .4), col, { w: 1.3 }));
  } });
  parts.push({ id: 'body', d: 0, draw: () => {
    // The body mass, then overlapping rock plates over the back and flank, a paler belly.
    blob(ctx, f, [[46 + sx, -38], [40 + sx, -50 - b * .5], [10 + sx, -56 - b], [-30 + sx * .8, -54 - b], [-54 + sx * .7, -44], [-58 + sx * .7, -30],
      [-46 + sx * .7, -18], [-10 + sx * .8, -14], [26 + sx, -16], [44 + sx, -24]], C.rock, { w: 2.2, depth: 3.5, light: .2, speck: 1.6 });
    blob(ctx, f, [[40 + sx, -22], [26 + sx, -15], [-10 + sx * .8, -13], [-44 + sx * .7, -17], [-30 + sx * .8, -24], [10 + sx * .9, -24]], C.belly, { w: 0, depth: .8, speck: .8 });
    for (const [px, py, rx, ry, s] of [[-40, -38, 15, 12, 1], [-18, -44, 16, 11, 2], [6, -46, 16, 11, 3], [28, -42, 13, 11, 4], [-26, -28, 15, 9, 5], [-2, -30, 14, 10, 6], [22, -28, 12, 9, 7]])
      rock(ctx, f, px + sx * (.8 + px / 400), py - b * .5, rx, ry, s % 2 ? C.rock : C.rockLight, s, { depth: 1.6 });
  } });
  parts.push({ id: 'head', d: 5, draw: () => {
    const hx = sx, hy = P.nod;
    // A blunt, boxy head: the skull block, a pale snout, a heavy plate over the eye.
    blob(ctx, f, [[36 + hx, -44 + hy], [54 + hx, -48 + hy], [70 + hx, -42 + hy], [76 + hx, -30 + hy], [72 + hx, -20 + hy], [56 + hx, -16 + hy], [40 + hx, -20 + hy], [34 + hx, -32 + hy]], C.rock, { w: 2, depth: 2.4 });
    blob(ctx, f, [[52 + hx, -30 + hy], [74 + hx, -30 + hy], [72 + hx, -20 + hy], [56 + hx, -17 + hy], [48 + hx, -22 + hy]], C.belly, { w: 0, depth: .6, speck: .6 });
    rock(ctx, f, 52 + hx, -44 + hy, 16, 7, C.rockLight, 9, { depth: 1.2, rot: .2 });
    rock(ctx, f, 40 + hx, -36 + hy, 8, 9, C.rock, 11, { depth: 1, w: 1.4 });
    disc(ctx, f, 60 + hx, -32 + hy, 2.4, 3.6, C.ink, { w: .5, depth: 0, speck: 0 });
    line(ctx, f, [[55 + hx, -37 + hy], [61 + hx, -37 + hy], [65 + hx, -35 + hy]], 1.3);
    disc(ctx, f, 74 + hx, -27 + hy, 1.2, 1.6, C.ink, { w: 0, depth: 0, speck: 0 });
    line(ctx, f, [[58 + hx, -21 + hy], [70 + hx, -22 + hy]], .7);
  } });
  parts.push({ id: 'nearLegs', d: 10, draw: legs(true) });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-shardback', fallTilt(action, t), { pivot: 50, toe: 50, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-shardback', label: 'Shardback — EMBERBOUND', kind: 'creature', directional: true, draw: drawShardback,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: SHARD_ATTACK_T, keys: [0, .12, .25, .38, .5, .6, .7, .85], once: true },
    hurt: hurtAction },
  frameBox: { x0: -130, x1: 130, y0: -125, y1: 12 },
  emberbound: { gameId: 'shardback', heightPx: 18, facing: 'L' },
});
export const studio = Object.freeze({ order: 18, name: 'Shardback（結晶背）', category: 'EMBERBOUND 第3エリア',
  description: '紫灰色の岩の鎧をまとった低い四足の獣。背中に紫・水色・桃色の結晶が並ぶ。物理攻撃に強い装甲役。',
  preview: { direction: 'L', phase: 0 } });
