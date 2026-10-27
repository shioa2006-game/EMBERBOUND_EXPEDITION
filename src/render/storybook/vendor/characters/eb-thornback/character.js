/**
 * EMBERBOUND EXPEDITION — Thornback Boar (game id `thornback`, elite), a new boar after the user's reference
 * image: a heavy brown furry body, a row of dark horn spikes along the back streaked with ember, white curved
 * tusks, a pink snout, an angry eye, small ears, a curly tail, dark hooves and smouldering ember spots.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (breathing), a short goring charge (impact at 0.15 s),
 * `cast` = the Gore Charge wind-up, which the game loops while it charges (head down, rear up, a hoof pawing
 * the ground), and the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, tufted, embers, leg, drawCreature } from '../shared/emberbound/creature.js';

const C = { fur:'#6f4a31', furDark:'#4e3322', furLight:'#9b7352', spike:'#45362c', snout:'#c99a86', snoutDark:'#9c6f5f',
  tusk:'#efe4c6', hoof:'#3d3631', ember:'#e9792f', ink:PAL.ink };
const IDLE_T = 2.6;
export const BOAR_ATTACK_T = .3;    // gore: impact at u = .5 (0.15 s)
export const BOAR_WINDUP_T = .5;    // Gore Charge wind-up: a loop

export function boarPose(action, t) {
  const P = { shift: 0, head: 0, nod: 0, rear: 0, paw: 0, breathe: Math.sin(TAU * phase(t, IDLE_T)), tail: Math.sin(t * 4) * 1.5 };
  if (action === 'attack') {
    const u = phase(t, BOAR_ATTACK_T);
    P.shift = sample([[0, [0]], [.22, [-6]], [.5, [18]], [.7, [15]], [1, [0]]], u);
    P.nod = sample([[0, [0]], [.22, [5]], [.45, [6]], [.55, [-7]], [.75, [-3]], [1, [0]]], u);   // head down, then the tusks sweep up
  } else if (action === 'cast') {
    // Gore Charge: head low, rear raised, the front hoof scraping the ground; periodic in u (seamless loop).
    const u = phase(t, BOAR_WINDUP_T);
    P.nod = 7 + Math.sin(TAU * u * 2) * .8; P.rear = 4; P.shift = -3 + Math.sin(TAU * u * 2) * .6;
    P.paw = Math.max(0, Math.sin(TAU * u)) * 1;
  }
  return P;
}

export function drawBoar(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = boarPose(action, t), f = face(direction), sx = P.shift, b = P.breathe, r = P.rear;
  const parts = [];
  const legs = (near) => () => {
    const o = near ? 0 : 7, oy = near ? 0 : -4, col = near ? C.fur : C.furDark;
    const pawLift = near ? P.paw * 6 : 0, pawBack = near ? -P.paw * 8 : 0;
    leg(ctx, f, [40 + sx + o, -36 + oy], [44 + sx + o + pawBack, oy - pawLift], 10, 7, col, -2, { hoof: C.hoof });
    leg(ctx, f, [-46 + sx + o, -40 + oy - r], [-50 + sx + o, oy], 11, 7, col, -5, { hoof: C.hoof });
  };
  parts.push({ id: 'farLegs', d: -10, draw: legs(false) });
  parts.push({ id: 'tail', d: -5, draw: () => {
    const tx = -74 + sx, ty = -70 - r + P.tail;
    line(ctx, f, [[tx + 6, ty + 6], [tx - 4, ty + 2], [tx - 8, ty - 5], [tx - 3, ty - 9], [tx + 1, ty - 5]], 2.4);
    line(ctx, f, [[tx + 6, ty + 6], [tx - 4, ty + 2], [tx - 8, ty - 5], [tx - 3, ty - 9], [tx + 1, ty - 5]], .1);
  } });
  parts.push({ id: 'spikes', d: -2, draw: () => {
    // Dark horn spikes along the spine, leaning back, streaked with ember.
    [[36, 26, 0], [18, 34, 1], [-2, 32, 2], [-22, 28, 3], [-40, 22, 4], [-56, 16, 5]].forEach(([x0, h, i]) => {
      const base = -96 - b + (x0 < 0 ? x0 * -.1 : 0) - (x0 < -30 ? r * .5 : 0) + (x0 > 20 ? P.nod * .4 : 0);
      const spike = [[x0 + sx - 7, base + 6], [x0 + sx - 9 - h * .35, base - h], [x0 + sx + 7, base + 6]];
      blob(ctx, f, spike, C.spike, { w: 1.6, depth: 1.6, light: .25, speck: .6 });
      line(ctx, f, [[x0 + sx - 2, base + 2], [x0 + sx - 5 - h * .25, base - h * .7]], .5);
      embers(ctx, f, [[x0 + sx - 4 - h * .15, base - h * .35, 1.4, 3], [x0 + sx - 1, base, 1.2, 2]], C.ember);
    });
  } });
  parts.push({ id: 'body', d: 0, draw: () => {
    // One silhouette from the rump to the snout, so the head grows out of the body (the head part adds the
    // features); the front follows the head's nod.
    const hx = sx, hy = P.nod;
    const body = [[74 + hx, -76 + hy], [86 + hx, -64 + hy], [88 + hx, -48 + hy], [74 + hx, -40 + hy], [54 + hx, -38 + hy * .5], [36 + sx, -32],
      [6 + sx, -28], [-30 + sx, -28], [-56 + sx, -32], [-74 + sx, -44 - r * .5], [-80 + sx, -64 - r], [-66 + sx, -86 - r],
      [-32 + sx, -98 - b - r * .6], [8 + sx, -102 - b], [38 + sx, -96 - b + hy * .3], [58 + hx, -88 + hy]];
    blob(ctx, f, tufted(body, 8, 4.5), C.fur, { w: 2.2, depth: 4, light: .2, speck: 1.6 });
    blob(ctx, f, tufted([[70 + hx, -44 + hy], [50 + hx, -38 + hy * .5], [28 + sx, -31], [-10 + sx, -29], [-44 + sx, -32], [-10 + sx, -36], [24 + sx, -38], [52 + hx, -44 + hy]], 6, 3), C.furLight, { w: 0, depth: .8, speck: .6 });
    for (const [x0, y0] of [[-20, -80], [-44, -72], [4, -84], [24, -76], [-58, -60], [-30, -56]]) line(ctx, f, [[x0 + sx, y0], [x0 + sx - 5, y0 + 7]], .55);
    embers(ctx, f, [[-36 + sx, -70, 3.6, 2.4], [-14 + sx, -62, 2.6, 1.8], [8 + sx, -72, 3, 2], [-56 + sx, -50, 2.4, 1.6], [26 + sx, -58, 2, 1.4], [-48 + sx, -84, 2, 1.4]], C.ember);
  } });
  parts.push({ id: 'head', d: 5, draw: () => {
    const hx = sx, hy = P.nod;
    // Ear, head, then the snout with nostrils, the tusks, an angry eye under a heavy brow.
    blob(ctx, f, [[44 + hx, -86 + hy], [42 + hx, -106 + hy], [58 + hx, -90 + hy]], C.fur, { w: 1.5, depth: 1.2 });
    blob(ctx, f, [[46 + hx, -88 + hy], [45 + hx, -100 + hy], [54 + hx, -91 + hy]], C.snoutDark, { w: 0, depth: .4, speck: 0 });
    // Cheek fur and the jaw line.
    line(ctx, f, [[48 + hx, -64 + hy], [54 + hx, -56 + hy], [50 + hx, -48 + hy]], .7);
    line(ctx, f, [[66 + hx, -46 + hy], [80 + hx, -45 + hy]], .8);
    disc(ctx, f, 90 + hx, -56 + hy, 7, 9, C.snout, { w: 1.6, depth: 1.4, speck: .3 });
    // Nostrils side by side on the snout's flat end.
    disc(ctx, f, 87.5 + hx, -56 + hy, 1.4, 2.4, C.ink, { w: 0, depth: 0, speck: 0 });
    disc(ctx, f, 93 + hx, -56 + hy, 1.4, 2.4, C.ink, { w: 0, depth: 0, speck: 0 });
    // The tusk curves up from the jaw in front of the face.
    blob(ctx, f, [[68 + hx, -44 + hy], [78 + hx, -44 + hy], [84 + hx, -60 + hy], [80 + hx, -84 + hy], [74 + hx, -62 + hy]], C.tusk, { w: 1.4, depth: .8, speck: 0 });
    disc(ctx, f, 62 + hx, -72 + hy, 2.6, 3.4, C.ink, { w: .5, depth: 0, speck: 0 });
    line(ctx, f, [[54 + hx, -80 + hy], [62 + hx, -78 + hy], [68 + hx, -74 + hy]], 1.5);
  } });
  parts.push({ id: 'nearLegs', d: 10, draw: legs(true) });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-thornback', fallTilt(action, t), { pivot: 60, toe: 60, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-thornback', label: 'Thornback Boar — EMBERBOUND', kind: 'creature', directional: true, draw: drawBoar,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: BOAR_ATTACK_T, keys: [0, .1, .22, .32, .42, .5, .6, .7, .85], once: true },
    cast: { period: BOAR_WINDUP_T, frames: 6 },
    hurt: hurtAction },
  frameBox: { x0: -140, x1: 140, y0: -150, y1: 12 },
  emberbound: { gameId: 'thornback', heightPx: 29, facing: 'L' },
});
export const studio = Object.freeze({ order: 10, name: 'Thornback Boar（棘背の猪）', category: 'EMBERBOUND 第1エリア',
  description: '大きな茶褐色の猪（エリート）。背中に並ぶ長い棘、白い牙、赤熱した斑点。突進技 Gore Charge で前衛を狙う。',
  preview: { direction: 'L', phase: 0 } });
