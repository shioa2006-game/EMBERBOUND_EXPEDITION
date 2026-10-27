/**
 * EMBERBOUND EXPEDITION — Voidspawn (game id `voidspawn`), a new low many-legged beast after the user's reference
 * image: a round, low dark-purple body under jagged shell plates — a great hood-like plate over the head and a row
 * of spiked plates down the back, pitted with holes and veined with glowing yellow-green — big glowing
 * yellow-green eyes deep under the hood, two long curved pale fangs, and six armoured legs bent at high knees,
 * each ending in pale claws.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (breathing, the veins pulsing), a short lunging bite (impact at
 * u = .5, 0.15 s), the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, drawCreature } from '../shared/emberbound/creature.js';

const C = {
  body: '#4b3752', bodyDark: '#34253b', plate: '#5a4364', plateLight: '#755c80', plateDark: '#3f2e47', vein: '#b9d64a',
  glow: '#e4f56b', eyeCore: '#fbffd6', claw: '#e2d5bc', mouth: '#1b1220', ink: PAL.ink,
};
const IDLE_T = 2.6;
export const VOID_ATTACK_T = .3;   // lunging bite: impact at u = .5

export function voidPose(action, t) {
  const P = { shift: 0, nod: 0, jaw: 0, breathe: Math.sin(TAU * phase(t, IDLE_T)), pulse: .5 + .5 * Math.sin(t * 3.1) };
  if (action === 'attack') {
    const u = phase(t, VOID_ATTACK_T);
    P.shift = sample([[0, [0]], [.25, [-7]], [.5, [18]], [.7, [14]], [1, [0]]], u);
    P.nod = sample([[0, [0]], [.25, [-5]], [.45, [5]], [.6, [3]], [1, [0]]], u);
    P.jaw = sample([[0, [0]], [.3, [1]], [.5, [0]], [1, [0]]], u);
    P.pulse = sample([[0, [.5]], [.3, [1]], [.6, [.7]], [1, [.5]]], u);
  }
  return P;
}

/** An armoured insect leg: hip → high knee → foot, a plate at the knee, pale claws on the foot. */
function armLeg(ctx, f, hip, knee, foot, col, near, glow) {
  limb(ctx, f, [hip, knee], 9, 8, col, { w: 1.7, depth: 1.6 });
  limb(ctx, f, [knee, [foot[0], foot[1] - 6]], 8, 6.5, col, { w: 1.7, depth: 1.6 });
  // The knee plate (a glowing spot on the near ones), the cuff above the foot.
  blob(ctx, f, [[knee[0] - 9, knee[1] - 2], [knee[0] - 2, knee[1] - 10], [knee[0] + 8, knee[1] - 6], [knee[0] + 7, knee[1] + 6], [knee[0] - 6, knee[1] + 7]], near ? C.plateLight : C.plate, { w: 1.5, depth: 1.2 });
  if (near && glow) disc(ctx, f, knee[0] + 1, knee[1] - 1, 2.6, 2.6, C.glow, { w: .8, depth: 0, speck: 0 });
  blob(ctx, f, [[foot[0] - 9, foot[1] - 4], [foot[0] - 7, foot[1] - 12], [foot[0] + 8, foot[1] - 12], [foot[0] + 10, foot[1] - 4]], near ? C.plate : C.plateDark, { w: 1.4, depth: 1 });
  for (const dx of [-7, -1, 5, 10]) blob(ctx, f, [[foot[0] + dx - 2.4, foot[1] - 4], [foot[0] + dx + 2.4, foot[1] - 4], [foot[0] + dx + 3, foot[1] + .5], [foot[0] + dx + 1, foot[1] + 1]], C.claw, { w: 1, depth: .3, speck: 0 });
}

export function drawVoidspawn(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = voidPose(action, t), f = face(direction), sx = P.shift, b = P.breathe, g = P.pulse;
  const parts = [];
  // Six legs: front, middle and rear on each side; the far ones a little behind and darker.
  const legs = near => () => {
    const o = near ? 0 : 8, oy = near ? 0 : -3, col = near ? C.body : C.bodyDark;
    armLeg(ctx, f, [30 + sx + o, -34 + oy], [42 + sx * .8 + o, -30 + oy], [58 + sx * .4 + o, oy], col, near, false);
    armLeg(ctx, f, [2 + sx + o, -32 + oy], [14 + sx * .7 + o, -40 + oy], [16 + sx * .3 + o, oy], col, near, true);
    armLeg(ctx, f, [-30 + sx * .8 + o, -34 + oy], [-46 + sx * .6 + o, -44 + oy], [-56 + sx * .3 + o, oy], col, near, false);
  };
  parts.push({ id: 'farLegs', d: -10, draw: legs(false) });
  parts.push({ id: 'body', d: 0, draw: () => {
    // The round, low body, its segments showing under the plates.
    blob(ctx, f, [[44 + sx, -40], [36 + sx, -60 - b * .6], [6 + sx, -68 - b], [-30 + sx * .9, -64 - b], [-56 + sx * .8, -50], [-60 + sx * .8, -34],
      [-44 + sx * .8, -22], [-10 + sx * .9, -18], [26 + sx, -20], [42 + sx, -28]], C.body, { w: 2.2, depth: 3.4, light: .15, speck: 1.4 });
    for (const [px, w2] of [[-34, 14], [-12, 16], [12, 15]]) line(ctx, f, [[px + sx, -58 - b], [px - 3 + sx, -40], [px + 1 + sx, -22]].map(([qx, qy]) => [qx, qy]), .6);
    blob(ctx, f, [[-48 + sx * .8, -26], [-10 + sx, -20], [24 + sx, -22], [10 + sx, -30], [-20 + sx, -30]], C.bodyDark, { w: 0, depth: .6, speck: .6 });
  } });
  parts.push({ id: 'backPlates', d: 2, draw: () => {
    // Spiked plates down the back, pitted with holes, a glowing vein running along them.
    const plates = [
      [[22, -60], [10, -86], [0, -78], [-6, -92], [-16, -80], [-22, -62]],
      [[-14, -62], [-22, -84], [-30, -76], [-36, -86], [-42, -72], [-46, -56]],
      [[-40, -56], [-48, -72], [-54, -64], [-60, -70], [-64, -54], [-62, -40]],
    ];
    plates.forEach((pts, i) => {
      const q = pts.map(([px, py]) => [px + sx * (.95 - i * .08), py - b * .8]);
      blob(ctx, f, [...q, [q[q.length - 1][0] + 8, q[q.length - 1][1] + 10], [q[0][0] - 4, q[0][1] + 10]], i % 2 ? C.plate : C.plateLight, { w: 1.9, depth: 2.2, light: .2, speck: 1.2 });
      const c = [(q[1][0] + q[4][0]) / 2, (q[1][1] + q[4][1]) / 2 + 8];
      disc(ctx, f, c[0], c[1], 2.4, 2, C.mouth, { w: .6, depth: 0, speck: 0 });
    });
    ctx.save(); ctx.globalAlpha = .55 + .45 * g;
    for (const seg of [[[18, -64], [4, -70], [-8, -70]], [[-18, -68], [-30, -66], [-40, -62]], [[-48, -56], [-56, -50]]]) limb(ctx, f, seg.map(([px, py]) => [px + sx * .9, py - b * .8]), 1.4, .8, C.vein, { w: 0, depth: 0 });
    ctx.restore();
  } });
  parts.push({ id: 'head', d: 5, draw: () => {
    const hx = sx + 10, hy = P.nod, jw = P.jaw * 4;
    // The face under the hood: dark, with a jagged mouth and the two long curved fangs.
    blob(ctx, f, [[36 + hx, -54 + hy], [70 + hx, -52 + hy], [80 + hx, -36 + hy], [74 + hx, -24 + hy + jw], [50 + hx, -22 + hy], [34 + hx, -32 + hy]], C.bodyDark, { w: 2, depth: 2 });
    blob(ctx, f, [[52 + hx, -30 + hy], [78 + hx, -32 + hy], [76 + hx, -25 + hy + jw], [70 + hx, -28 + hy + jw], [64 + hx, -24 + hy + jw], [58 + hx, -28 + hy], [52 + hx, -25 + hy]], C.mouth, { w: 1, depth: 0, speck: 0 });
    for (const [fx, l] of [[56, 22], [72, 24]]) {
      const r = [fx + hx, -30 + hy + (fx > 60 ? jw : 0)];
      blob(ctx, f, [[r[0] - 3.4, r[1]], [r[0] + 3.4, r[1]], [r[0] + 3, r[1] + l * .55], [r[0] - 1, r[1] + l], [r[0] - 2.6, r[1] + l * .5]], C.claw, { w: 1.3, depth: .6, light: .3, speck: 0, amp: .05 });
      line(ctx, f, [[r[0] - .6, r[1] + 3], [r[0] - 1.2, r[1] + l * .7]], .5);
    }
    // The great hood plate over the head, ridged, its rim jutting over the eyes.
    blob(ctx, f, [[24 + hx, -64 + hy], [34 + hx, -82 + hy], [52 + hx, -88 + hy], [70 + hx, -76 + hy], [84 + hx, -54 + hy], [82 + hx, -42 + hy], [74 + hx, -48 + hy],
      [62 + hx, -52 + hy], [48 + hx, -50 + hy], [36 + hx, -44 + hy], [26 + hx, -48 + hy]], C.plateLight, { w: 2.1, depth: 2.4, light: .25, speck: 1.2 });
    line(ctx, f, [[30 + hx, -66 + hy], [50 + hx, -80 + hy], [70 + hx, -68 + hy]], .7);
    disc(ctx, f, 44 + hx, -70 + hy, 2.4, 2, C.mouth, { w: .6, depth: 0, speck: 0 });
    ctx.save(); ctx.globalAlpha = .5 + .5 * g;
    limb(ctx, f, [[38 + hx, -60 + hy], [52 + hx, -66 + hy], [66 + hx, -60 + hy]], 1.3, 1, C.vein, { w: 0, depth: 0 });
    ctx.restore();
    // The glowing eyes in the dark under the rim: a big near one and the far one beyond the snout.
    for (const [ex, ey, r] of [[60, -42, 6.4], [77, -42, 4]]) {
      ctx.save(); ctx.globalAlpha = .35 + .3 * g; disc(ctx, f, ex + hx, ey + hy, r * 1.9, r * 1.7, C.glow, { w: 0, depth: 0, speck: 0 }); ctx.restore();
      disc(ctx, f, ex + hx, ey + hy, r, r * .9, C.glow, { w: 1.2, depth: 0, speck: 0 });
      disc(ctx, f, ex + hx + r * .15, ey + hy - r * .1, r * .45, r * .4, C.eyeCore, { w: 0, depth: 0, speck: 0 });
    }
  } });
  parts.push({ id: 'nearLegs', d: 10, draw: legs(true) });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-voidspawn', fallTilt(action, t), { pivot: 60, toe: 60, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-voidspawn', label: 'Voidspawn — EMBERBOUND', kind: 'creature', directional: true, draw: drawVoidspawn,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: VOID_ATTACK_T, keys: [0, .12, .25, .38, .5, .6, .7, .85], once: true },
    hurt: hurtAction },
  frameBox: { x0: -130, x1: 130, y0: -120, y1: 12 },
  emberbound: { gameId: 'voidspawn', heightPx: 21, facing: 'L' },
});
export const studio = Object.freeze({ order: 30, name: 'Voidspawn（虚無の落とし子）', category: 'EMBERBOUND 第5エリア',
  description: '濃紫の甲殻に覆われた低い多脚の獣。黄緑に光る目と大きな牙。召喚される基本の近接敵。',
  preview: { direction: 'L', phase: 0 } });
