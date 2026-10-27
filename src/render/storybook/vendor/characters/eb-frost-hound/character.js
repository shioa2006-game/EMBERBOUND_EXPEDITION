/**
 * EMBERBOUND EXPEDITION — Frost Hound (game id `frost_hound`), the Charwolf's body after the user's reference
 * image: thick white fur shading to blue-grey on the legs and belly, tall ears with violet-blue insides, an
 * angry face with a black nose and a small fang, a big curled tail tipped with blue, and a row of ice crystals
 * jutting from its back in place of the Charwolf's flame.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (breathing, tail), a short lunging bite (impact at 0.15 s), the
 * shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, tufted, crystal, CRYSTAL, leg, drawCreature } from '../shared/emberbound/creature.js';
const blobAt = blob, lineAt = line, discAt = disc;

const C = { fur:'#eef1f6', furDark:'#9aa9c4', pale:'#ffffff', leg:'#c3cfe0', tip:'#a3bddb', ear:'#8c86bb', nose:'#2b2724', fang:'#f7f4ec', claw:'#5d6478', ink:PAL.ink };
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
    const o = near ? 0 : 5, oy = near ? 0 : -3, col = near ? C.leg : C.furDark;
    leg(ctx, f, [22 + sx + o, -26 + oy], [27 + sx + o + P.reach, oy - P.lift], 7, 4.8, col, -2, { paw: col });
    leg(ctx, f, [-22 + sx * .7 + o, -28 + oy], [-26 + sx * .4 + o, oy], 8, 5, col, -5, { paw: col });
  };
  parts.push({ id: 'farLegs', d: -10, draw: legs(false) });
  parts.push({ id: 'tail', d: -5, draw: () => {
    const tw = P.tail, base = [-34 + sx * .7, -46];
    const tail = [[base[0] + 2, base[1] - 4], [-46 + sx * .7, -58 + tw * .3], [-56 + sx * .7 + tw, -74], [-52 + sx * .7 + tw * 1.2, -86],
      [-46 + sx * .7 + tw, -80], [-42 + sx * .7, -66], [-36 + sx * .7, -54], [base[0] + 2, base[1] + 4]];
    const big = ([px, py]) => [px + (px - base[0]) * .9, py + (py - base[1]) * .55];
    blob(ctx, f, tufted(tail.map(big), 7, 5), C.fur, { w: 1.8, depth: 2.4 });
    blob(ctx, f, tufted([[-56 + sx * .7 + tw, -74], [-52 + sx * .7 + tw * 1.2, -86], [-46 + sx * .7 + tw, -80], [-44 + sx * .7 + tw * .6, -70], [-50 + sx * .7 + tw * .8, -66]].map(big), 5, 3), C.tip, { w: 1.2, depth: 1 });
  } });
  parts.push({ id: 'body', d: 0, draw: () => {
    const body = [[36 + sx, -42], [28 + sx, -60 - b * .5], [6 + sx * .9, -62 - b * .6], [-18 + sx * .8, -60 - b * .5], [-34 + sx * .7, -50],
      [-36 + sx * .7, -30], [-24 + sx * .7, -22], [-4 + sx * .8, -21], [18 + sx, -21], [34 + sx, -28]];
    blob(ctx, f, tufted(body, 7, 4), C.fur, { w: 2, depth: 3, light: .2, speck: 1.4 });
    // Pale chest ruff and belly fur.
    blob(ctx, f, tufted([[34 + sx, -46], [40 + sx, -32], [30 + sx, -20], [8 + sx * .85, -20], [-10 + sx * .8, -23], [6 + sx * .85, -27], [24 + sx, -32]], 5, 3), C.pale, { w: 1.2, depth: 1 });
    blob(ctx, f, tufted([[22 + sx, -24], [4 + sx * .85, -21], [-20 + sx * .75, -23], [-34 + sx * .7, -32], [-28 + sx * .7, -38], [-12 + sx * .8, -30], [12 + sx * .9, -29]], 5, 2.5), C.leg, { w: 0, depth: .6, speck: .5 });
    for (const [x0, y0] of [[-8, -48], [-22, -44], [10, -46]]) line(ctx, f, [[x0 + sx, y0], [x0 + sx - 4, y0 + 6]], .5);
  } });
  parts.push({ id: 'neck', d: -1, draw: () => {
    // Bridges the body and the head so the head stays attached while it lunges (dx, dy = the head's offset).
    const dx = 1.45 * P.head, dy = 1.45 * (P.head * .6 - b * .4);
    blob(ctx, f, tufted([[12 + sx, -60 - b * .5], [34 + sx + dx, -68 + dy], [46 + sx + dx, -56 + dy], [46 + sx + dx, -40 + dy], [38 + sx, -26], [22 + sx, -32]], 6, 3), C.fur, { w: 1.8, depth: 2, speck: 1 });
    blob(ctx, f, tufted([[44 + sx + dx, -46 + dy], [44 + sx + dx * .5, -32 + dy * .5], [36 + sx, -22], [30 + sx, -32], [38 + sx + dx * .5, -42 + dy * .5]], 5, 3), C.pale, { w: 1.2, depth: 1 });
  } });
  parts.push({ id: 'crystals', d: -1, draw: () => {
    // Ice crystals jutting up and back along the spine.
    [[18, -54, 18, -2.0], [6, -58, 26, -1.95], [-6, -58, 22, -2.05], [-18, -54, 16, -2.15], [-28, -50, 11, -2.25]]
      .forEach(([x0, y0, len, a], i) => crystal(ctx, f, x0 + sx * .9, y0 - b * .5, a, len, len * .42, i % 2 ? CRYSTAL.white : CRYSTAL.blue, { w: 1.3 }));
  } });
  parts.push({ id: 'head', d: 5, draw: () => {
    // A big chibi head: the head is drawn 1.45× about the neck (38, −46) via a wrapped mirror helper.
    const K = 1.45, S = ([px, py]) => [38 + (px - 38) * K, -46 + (py + 46) * K];
    const blob = (c, ff, list, fill, o) => blobAt(c, ff, list.map(S), fill, o);
    const line = (c, ff, list, w) => lineAt(c, ff, list.map(S), w);
    const disc = (c, ff, px, py, rx, ry, fill, o) => { const [qx, qy] = S([px, py]); discAt(c, ff, qx, qy, rx * K, ry * K, fill, o); };
    const hx = sx / K + P.head, hy = P.head * .6 - b * .4, j = P.jaw * 5;
    // Tall ears with violet-blue insides.
    blob(ctx, f, [[36 + hx, -60 + hy], [35 + hx, -80 + hy], [44 + hx, -63 + hy]], C.furDark, { w: 1.4, depth: 1 });
    blob(ctx, f, [[42 + hx, -60 + hy], [45 + hx, -83 + hy], [54 + hx, -61 + hy]], C.fur, { w: 1.6, depth: 1.2 });
    blob(ctx, f, [[44.5 + hx, -62 + hy], [46 + hx, -77 + hy], [51 + hx, -62 + hy]], C.ear, { w: 0, depth: .4, speck: 0 });
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
  drawCreature(ctx, x, y, f, scale, parts, 'eb-frost-hound', fallTilt(action, t), { pivot: 34, toe: 34, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-frost-hound', label: 'Frost Hound — EMBERBOUND', kind: 'creature', directional: true, draw: drawWolf,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: WOLF_ATTACK_T, keys: [0, .1, .22, .32, .42, .5, .6, .7, .85], once: true },
    hurt: hurtAction },
  frameBox: { x0: -130, x1: 130, y0: -110, y1: 12 },
  emberbound:{gameId:'frost_hound',heightPx:17,facing:'L'},
});
export const studio=Object.freeze({order:27,name:"Frost Hound（霜の猟犬）",category:"EMBERBOUND 第4エリア",
  description:"白い毛に青い影の四足の猟犬。背中に氷の棘が並ぶ。体力の低い味方を狙う素早い追撃役。",
  preview:{direction:'L',phase:0}});
