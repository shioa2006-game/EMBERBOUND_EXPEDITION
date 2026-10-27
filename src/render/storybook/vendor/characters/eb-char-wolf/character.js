/**
 * EMBERBOUND EXPEDITION — Charwolf (game id `char_wolf`), a new four-legged wolf after the user's reference
 * image: dark grey fur with a pale chest, muzzle and tail tip, pointed ears with orange insides, an angry face
 * with a small fang, a bushy tail and a flame running along its back. The base of the four-legged family
 * (Frost Hound, Thornback, Shardback).
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (breathing, tail, flame), a short lunging bite (impact at
 * 0.15 s), the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, tufted, flame, sparks, leg, drawCreature } from '../shared/emberbound/creature.js';
const blobAt = blob, lineAt = line, discAt = disc;

const C = { fur:'#56514d', furDark:'#3f3b38', pale:'#bfb4a4', ear:'#e38a4c', nose:'#2b2724', fang:'#f2ead6', claw:'#e9dfc6', ink:PAL.ink };
const IDLE_T = 2.2;
export const WOLF_ATTACK_T = .3;   // bite lands at u = .5 (0.15 s)

export function wolfPose(action, t) {
  const P = { shift: 0, lift: 0, head: 0, jaw: 0, reach: 0, tail: Math.sin(t * 2.6) * 4, breathe: Math.sin(TAU * phase(t, IDLE_T)), t };
  if (action === 'attack') {
    const u = phase(t, WOLF_ATTACK_T);
    P.shift = sample([[0, [0]], [.22, [-4]], [.5, [14]], [.7, [12]], [1, [0]]], u);
    P.head = sample([[0, [0]], [.22, [-2]], [.5, [3]], [.7, [2.5]], [1, [0]]], u);
    P.jaw = sample([[0, [0]], [.3, [1]], [.5, [.2]], [.7, [0]], [1, [0]]], u);
    P.reach = sample([[0, [0]], [.3, [6]], [.5, [8]], [.7, [5]], [1, [0]]], u);
    P.lift = sample([[0, [0]], [.35, [4]], [.5, [1]], [1, [0]]], u);
  }
  return P;
}

export function drawWolf(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = wolfPose(action, t), f = face(direction), sx = P.shift, b = P.breathe;
  const parts = [];
  const legs = (near) => () => {
    const o = near ? 0 : 5, oy = near ? 0 : -3, col = near ? C.fur : C.furDark;
    leg(ctx, f, [22 + sx + o, -26 + oy], [27 + sx + o + P.reach, oy - P.lift], 7, 4.8, col, -2, { paw: col });
    leg(ctx, f, [-22 + sx * .7 + o, -28 + oy], [-26 + sx * .4 + o, oy], 8, 5, col, -5, { paw: col });
  };
  parts.push({ id: 'farLegs', d: -10, draw: legs(false) });
  parts.push({ id: 'tail', d: -5, draw: () => {
    const tw = P.tail, base = [-34 + sx * .7, -46];
    const tail = [[base[0] + 2, base[1] - 4], [-46 + sx * .7, -58 + tw * .3], [-56 + sx * .7 + tw, -74], [-52 + sx * .7 + tw * 1.2, -86],
      [-46 + sx * .7 + tw, -80], [-42 + sx * .7, -66], [-36 + sx * .7, -54], [base[0] + 2, base[1] + 4]];
    blob(ctx, f, tufted(tail.map(([px, py]) => [px + (px - base[0]) * .25, py + (py - base[1]) * .15]), 6, 4), C.fur, { w: 1.6, depth: 2 });
    blob(ctx, f, tufted([[-55 + sx * .7 + tw, -76], [-52 + sx * .7 + tw * 1.2, -86], [-46 + sx * .7 + tw, -80], [-48 + sx * .7 + tw * .8, -72]], 4, 2), C.pale, { w: 1, depth: .8 });
  } });
  parts.push({ id: 'body', d: 0, draw: () => {
    const body = [[36 + sx, -42], [28 + sx, -60 - b * .5], [6 + sx * .9, -62 - b * .6], [-18 + sx * .8, -60 - b * .5], [-34 + sx * .7, -50],
      [-36 + sx * .7, -30], [-24 + sx * .7, -22], [-4 + sx * .8, -21], [18 + sx, -21], [34 + sx, -28]];
    blob(ctx, f, tufted(body, 7, 4), C.fur, { w: 2, depth: 3, light: .2, speck: 1.4 });
    // Pale chest ruff and belly fur.
    blob(ctx, f, tufted([[34 + sx, -46], [40 + sx, -32], [30 + sx, -20], [8 + sx * .85, -20], [-10 + sx * .8, -23], [6 + sx * .85, -27], [24 + sx, -32]], 5, 3), C.pale, { w: 1.2, depth: 1 });
    for (const [x0, y0] of [[-8, -48], [-22, -44], [10, -46]]) line(ctx, f, [[x0 + sx, y0], [x0 + sx - 4, y0 + 6]], .5);
  } });
  parts.push({ id: 'neck', d: -1, draw: () => {
    // Bridges the body and the head so the head stays attached while it lunges (dx, dy = the head's offset).
    const dx = 1.45 * P.head, dy = 1.45 * (P.head * .6 - b * .4);
    blob(ctx, f, tufted([[12 + sx, -60 - b * .5], [34 + sx + dx, -68 + dy], [46 + sx + dx, -56 + dy], [46 + sx + dx, -40 + dy], [38 + sx, -26], [22 + sx, -32]], 6, 3), C.fur, { w: 1.8, depth: 2, speck: 1 });
    blob(ctx, f, tufted([[44 + sx + dx, -46 + dy], [44 + sx + dx * .5, -32 + dy * .5], [36 + sx, -22], [30 + sx, -32], [38 + sx + dx * .5, -42 + dy * .5]], 5, 3), C.pale, { w: 1.2, depth: 1 });
  } });
  parts.push({ id: 'flame', d: 2, draw: () => {
    // Fire along the spine, trailing back; sparks drift off it.
    [[20, 20, 0], [8, 26, 1.7], [-6, 24, 3.1], [-20, 18, 4.4]].forEach(([x0, h, s]) =>
      flame(ctx, f, x0 + sx * .9, -56 - b * .5, 15, h, P.t, -.55, s, { w: 1.2, tongues: false }));
    sparks(ctx, f, 0 + sx, -80, 18, 16, P.t, 4, .3);
  } });
  parts.push({ id: 'head', d: 5, draw: () => {
    // A big chibi head: the head is drawn 1.45× about the neck (38, −46) via a wrapped mirror helper.
    const K = 1.45, S = ([px, py]) => [38 + (px - 38) * K, -46 + (py + 46) * K];
    const blob = (c, ff, list, fill, o) => blobAt(c, ff, list.map(S), fill, o);
    const line = (c, ff, list, w) => lineAt(c, ff, list.map(S), w);
    const disc = (c, ff, px, py, rx, ry, fill, o) => { const [qx, qy] = S([px, py]); discAt(c, ff, qx, qy, rx * K, ry * K, fill, o); };
    const hx = sx / K + P.head, hy = P.head * .6 - b * .4, j = P.jaw * 5;
    // Ears with orange insides.
    blob(ctx, f, [[37 + hx, -60 + hy], [37 + hx, -76 + hy], [44 + hx, -63 + hy]], C.furDark, { w: 1.4, depth: 1 });
    blob(ctx, f, [[43 + hx, -60 + hy], [46 + hx, -78 + hy], [53 + hx, -61 + hy]], C.fur, { w: 1.6, depth: 1.2 });
    blob(ctx, f, [[45 + hx, -62 + hy], [46.5 + hx, -73 + hy], [50.5 + hx, -62 + hy]], C.ear, { w: 0, depth: .4, speck: 0 });
    // Lower jaw (opens for the bite), then the skull and muzzle.
    blob(ctx, f, [[44 + hx, -40 + hy], [60 + hx, -40 + hy + j * .4], [66 + hx, -38 + hy + j], [58 + hx, -34 + hy + j * .8], [44 + hx, -34 + hy]], C.pale, { w: 1.3, depth: 1 });
    const skull = [[34 + hx, -50 + hy], [38 + hx, -60 + hy], [48 + hx, -63 + hy], [56 + hx, -57 + hy], [66 + hx, -50 + hy], [71 + hx, -46 + hy],
      [68 + hx, -42 + hy], [58 + hx, -41 + hy], [48 + hx, -38 + hy], [38 + hx, -40 + hy]];
    blob(ctx, f, tufted(skull, 6, 2.4), C.fur, { w: 1.8, depth: 2 });
    blob(ctx, f, [[50 + hx, -48 + hy], [62 + hx, -48 + hy], [70 + hx, -45 + hy], [67 + hx, -42 + hy], [56 + hx, -41 + hy], [46 + hx, -40 + hy], [40 + hx, -43 + hy]], C.pale, { w: 0, depth: .6, speck: .4 });
    disc(ctx, f, 69.5 + hx, -47 + hy, 2.6, 2, C.nose, { w: .8, depth: 0, speck: 0 });
    // Angry eye under a slanted brow, a small fang.
    disc(ctx, f, 54 + hx, -52 + hy, 2.2, 3, C.ink, { w: .5, depth: 0, speck: 0 });
    line(ctx, f, [[49 + hx, -57 + hy], [55 + hx, -55 + hy], [59 + hx, -52 + hy]], 1.2);
    blob(ctx, f, [[60 + hx, -41 + hy], [62.5 + hx, -41 + hy], [61.5 + hx, -37.5 + hy + j * .3]], C.fang, { w: .6, depth: 0, speck: 0 });
    line(ctx, f, [[57 + hx, -42 + hy], [64 + hx, -42 + hy]], .6);
  } });
  parts.push({ id: 'nearLegs', d: 10, draw: legs(true) });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-char-wolf', fallTilt(action, t), { pivot: 34, toe: 34, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-char-wolf', label: 'Charwolf — EMBERBOUND', kind: 'creature', directional: true, draw: drawWolf,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: WOLF_ATTACK_T, keys: [0, .1, .22, .32, .42, .5, .6, .7, .85], once: true },
    hurt: hurtAction },
  frameBox: { x0: -130, x1: 130, y0: -110, y1: 12 },
  emberbound: { gameId: 'char_wolf', heightPx: 17, facing: 'L' },
});
export const studio = Object.freeze({ order: 7, name: 'Charwolf（焦げ狼）', category: 'EMBERBOUND 第1エリア',
  description: '黒〜灰色の四足の狼。尖った耳と尾、背中に走る橙色の炎。攻撃間隔の短い近接の敵。',
  preview: { direction: 'L', phase: 0 } });
