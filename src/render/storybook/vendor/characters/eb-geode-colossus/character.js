/**
 * EMBERBOUND EXPEDITION — Geode Colossus (game id `geode_colossus`, area 3 boss), a new rock golem after the
 * user's reference image: a hulking body of purple-grey boulders, a small head sunk between huge shoulders with
 * one glowing eye, short thick boulder legs, heavy arms ending in great stone fists, crystals sprouting from the
 * head, shoulders, fists and feet, and a cracked-open geode in the chest — a ring of violet crystals around a
 * glowing pale core.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (heavy breathing, the core pulsing), attack (an overhead slam of
 * the leading fist, impact at 0.15 s), `cast` = the Shard Storm wind-up the game loops (both fists raised, the core
 * flaring, trembling), and the shared hurt.
 */
import { TAU, PAL, keyframes } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, crystal, rock, CRYSTAL, drawCreature } from '../shared/emberbound/creature.js';

const C = { ...CRYSTAL, core: '#eaf8fc', coreGlow: '#c3ecf6', rim: '#b3a6b6', eye: '#a6f3ee', ink: PAL.ink };
const IDLE_T = 3.2;
export const COLOSSUS_ATTACK_T = .3;   // slam: impact at u = .5
export const COLOSSUS_WINDUP_T = .6;   // Shard Storm wind-up: a loop
// Arm joints (elbow, fist) per pose; the shoulder is fixed on the body.
const LEAD_REST = [[62, -128], [66, -78]], REAR_REST = [[-56, -130], [-54, -82]];

export function colossusPose(action, t) {
  const s = Math.sin(TAU * phase(t, IDLE_T));
  const P = { breathe: s, lean: 0, crouch: 0, lead: LEAD_REST, rear: REAR_REST, glow: .45 + .15 * s, dust: -1, shake: 0 };
  if (action === 'attack') {
    const u = phase(t, COLOSSUS_ATTACK_T);
    const k = keyframes([[0, [...LEAD_REST[0], ...LEAD_REST[1]]], [.25, [56, -200, 44, -242]], [.5, [92, -112, 118, -48]], [.72, [90, -110, 114, -46]], [1, [...LEAD_REST[0], ...LEAD_REST[1]]]], u);
    P.lead = [[k[0], k[1]], [k[2], k[3]]];
    P.lean = sample([[0, [0]], [.25, [-8]], [.5, [14]], [.72, [12]], [1, [0]]], u);
    P.crouch = sample([[0, [0]], [.25, [-4]], [.5, [10]], [.72, [8]], [1, [0]]], u);
    P.dust = u >= .5 && u < .9 ? (u - .5) / .4 : -1;
  } else if (action === 'cast') {
    // Shard Storm: both fists raised high, the core flaring, the whole body trembling; periodic in u.
    const u = phase(t, COLOSSUS_WINDUP_T), w = Math.sin(TAU * u * 2);
    P.lead = [[66, -196], [62 + w, -250]]; P.rear = [[-60, -198], [-52 - w, -248]];
    P.glow = .85 + .15 * Math.sin(TAU * u); P.shake = w * 1.2; P.lean = -4;
  }
  return P;
}

export function drawColossus(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = colossusPose(action, t), f = face(direction), b = P.breathe;
  // Upper points lean forward and down in proportion to their height above the hips.
  const U = ([px, py]) => { const k = Math.max(0, Math.min(1, (-py - 70) / 150)); return [px + (P.lean + P.shake) * k, py + P.crouch * k - b * k * 1.5]; };
  const parts = [];
  // An arm of three boulders (upper arm, forearm, fist) from the shoulder through the elbow to the fist.
  const arm = (sh, [el, fi], col, lead) => {
    const S = U(sh), E = U(el), F = U(fi), mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    rock(ctx, f, ...mid(S, E), 30, 32, col, lead ? 31 : 32, { depth: 2.6 });
    // Joint stones at the elbow and wrist keep the arm whole when it stretches out (the ground punch).
    rock(ctx, f, ...E, 22, 22, col, lead ? 37 : 38, { depth: 2.2 });
    rock(ctx, f, ...mid(E, F), 28, 30, col, lead ? 33 : 34, { depth: 2.4 });
    rock(ctx, f, E[0] + (F[0] - E[0]) * .78, E[1] + (F[1] - E[1]) * .78, 22, 22, col, lead ? 39 : 40, { depth: 2.2 });
    // Both fists are the same stone (shape, color and crystals), whichever side they are on.
    rock(ctx, f, ...F, 40, 36, C.rockLight, 35, { depth: 2.8, n: 8 });
    for (const dx of [-16, -2, 12]) line(ctx, f, [[F[0] + dx + 2, F[1] + 6], [F[0] + dx + 4, F[1] + 24]], .8);
    // The crystals lean outward from the body on either side, so the rear fist shows them too.
    const o = lead ? 1 : -1;
    for (const [dx, dy, a, l, c] of [[10, -30, -1.2, 28, C.blue], [24, -22, -.7, 20, C.lilac], [-4, -32, -1.7, 18, C.pink]]) crystal(ctx, f, F[0] + dx * o, F[1] + dy, lead ? a : -Math.PI - a, l, l * .45, c, { w: 1.3, glow: P.glow * .4 });
  };
  const leg = (hx, fx, col, seed) => {
    rock(ctx, f, hx, -64, 26, 24, col, seed, { depth: 2.4 });
    rock(ctx, f, (hx + fx) / 2, -34, 24, 22, col, seed + 1, { depth: 2.2 });
    rock(ctx, f, fx + 6, -12, 36, 14, col, seed + 2, { depth: 2, n: 8 });
  };
  // Limb depth (plan §6.1): the leading limbs (+x, the facing side) pass behind the trunk; the rear arm and leg are
  // the near ones, drawn over it in lighter stone.
  parts.push({ id: 'leadLeg', d: -10, draw: () => {
    leg(18, 22, C.rockDark, 14);
    crystal(ctx, f, 36, -22, -1.3, 18, 8, C.lilac, { w: 1.2 }); crystal(ctx, f, 44, -18, -.9, 12, 6, C.blue, { w: 1 });
  } });
  parts.push({ id: 'leadArm', d: -8, draw: () => arm([52, -166], P.lead, C.rockDark, true) });
  parts.push({ id: 'leadShoulder', d: -6, draw: () => {
    rock(ctx, f, ...U([54, -172]), 34, 30, C.rockDark, 22, { depth: 2.8 });
    for (const [dx, a, l, c] of [[58, -1.2, 32, C.blue], [70, -.8, 22, C.lilac], [44, -1.6, 18, C.pink]]) crystal(ctx, f, ...U([dx, -196]), a, l, l * .45, c, { w: 1.4, glow: P.glow * .3 });
  } });
  parts.push({ id: 'rearLeg', d: -4, draw: () => leg(-30, -34, C.rock, 11) });
  parts.push({ id: 'body', d: 0, draw: () => {
    // The trunk: a big rock mass, a lower belly stone, overlapping plates.
    blob(ctx, f, [[-58, -96], [-66, -150], [-50, -196], [0, -210], [50, -196], [66, -150], [56, -96], [30, -78], [-30, -78]].map(U), C.rock, { w: 2.6, depth: 5, light: .2, speck: 2 });
    rock(ctx, f, ...U([2, -92]), 50, 22, C.rockDark, 41, { depth: 2 });
    for (const [px, py, rx, ry, sd] of [[-36, -120, 22, 26, 42], [-30, -176, 24, 20, 43], [8, -192, 26, 16, 44]]) rock(ctx, f, ...U([px, py]), rx, ry, C.rock, sd, { depth: 2 });
    // The geode: a pale rim, a ring of violet crystals pointing inward, the glowing core.
    const [gx, gy] = U([14, -138]);   // centred on the trunk left showing between the rear shoulder and the front edge
    rock(ctx, f, gx, gy, 40, 42, C.rim, 45, { depth: 1.8, n: 9 });
    disc(ctx, f, gx, gy, 31, 33, C.deep, { w: 1.6, depth: 1.2, speck: .4 });
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, r = 30, px = gx + Math.cos(a) * r, py = gy + Math.sin(a) * r * 1.05;
      crystal(ctx, f, px, py, a + Math.PI, 14 + (i % 3) * 3, 8, i % 2 ? C.lilac : C.deep, { w: .9, glow: P.glow * .3 });
    }
    ctx.save(); ctx.globalAlpha = .2 + P.glow * .3;
    disc(ctx, f, gx, gy, 24 + P.glow * 6, 24 + P.glow * 6, C.coreGlow, { w: 0, depth: 0, speck: 0 });
    ctx.restore();
    disc(ctx, f, gx, gy, 17, 17, C.core, { w: 1.4, depth: .8, speck: .2 });
    disc(ctx, f, gx - 5, gy - 6, 4.5, 3.5, '#ffffff', { w: 0, depth: 0, speck: 0 });
  } });
  parts.push({ id: 'head', d: 4, draw: () => {
    // A small head sunk between the shoulders: a boulder brow over one glowing eye, crystals on top.
    const [hx, hy] = U([4, -226]);
    for (const [dx, dy, a, l, c] of [[-10, -18, -1.8, 30, C.blue], [6, -20, -1.4, 22, C.lilac], [-22, -12, -2.2, 18, C.pink], [16, -16, -1.1, 16, C.blue]]) crystal(ctx, f, hx + dx, hy + dy, a, l, l * .42, c, { w: 1.3, glow: P.glow * .3 });
    rock(ctx, f, hx, hy, 38, 30, C.rockLight, 51, { depth: 2.4, n: 8 });
    blob(ctx, f, [[hx - 6, hy - 6], [hx + 30, hy - 10], [hx + 32, hy - 2], [hx - 4, hy + 1]], C.rockDark, { w: 1.6, depth: .8 });
    ctx.save(); ctx.globalAlpha = .35; disc(ctx, f, hx + 20, hy + 5, 9, 6, C.eye, { w: 0, depth: 0, speck: 0 }); ctx.restore();
    disc(ctx, f, hx + 20, hy + 5, 4.6, 3, C.eye, { w: .8, depth: 0, speck: 0 });
  } });
  parts.push({ id: 'rearShoulder', d: 8, draw: () => {
    rock(ctx, f, ...U([-42, -180]), 34, 30, C.rockLight, 21, { depth: 2.6 });
    for (const [dx, a, l, c] of [[-46, -1.9, 30, C.lilac], [-36, -1.5, 22, C.pink], [-56, -2.3, 18, C.blue]]) crystal(ctx, f, ...U([dx, -204]), a, l, l * .45, c, { w: 1.3, glow: P.glow * .3 });
  } });
  parts.push({ id: 'rearArm', d: 9, draw: () => arm([-46, -170], P.rear, C.rock, false) });
  parts.push({ id: 'dust', d: 12, draw: () => {
    if (P.dust < 0) return;
    // Dust and crystal chips thrown up where the fist hits the ground.
    const F = U(P.lead[1]);
    ctx.save(); ctx.globalAlpha = 1 - P.dust;
    for (const [dx, k] of [[-28, .8], [0, 1], [28, .9], [46, .6]]) disc(ctx, f, F[0] + dx * (1 + P.dust), -6 - P.dust * 14 * k, 10 * k * (1 + P.dust * .6), 6 * k, '#b9adbd', { w: 1, depth: 0, speck: 0 });
    for (const [dx, a] of [[-16, -2.2], [10, -1.2], [30, -.7]]) crystal(ctx, f, F[0] + dx, -16 - P.dust * 26, a, 8, 4, C.lilac, { w: .8 });
    ctx.restore();
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-geode-colossus', fallTilt(action, t), { pivot: 80, toe: 80, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-geode-colossus', label: 'Geode Colossus — EMBERBOUND', kind: 'creature', directional: true, draw: drawColossus,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: COLOSSUS_ATTACK_T, keys: [0, .1, .25, .38, .5, .6, .72, .85], once: true },
    cast: { period: COLOSSUS_WINDUP_T, frames: 8 },
    hurt: hurtAction },
  frameBox: { x0: -200, x1: 200, y0: -330, y1: 14 },
  emberbound: { gameId: 'geode_colossus', heightPx: 62, facing: 'L' },
});
export const studio = Object.freeze({ order: 23, name: 'Geode Colossus（晶洞の巨像）', category: 'EMBERBOUND 第3エリア',
  description: '第3エリアのボス。紫灰色の岩の巨人で、頭と肩に結晶が生え、胸の晶洞の核が光る。大技 Shard Storm を溜め、Crystal Mite を呼ぶ。',
  preview: { direction: 'L', phase: 0 } });
