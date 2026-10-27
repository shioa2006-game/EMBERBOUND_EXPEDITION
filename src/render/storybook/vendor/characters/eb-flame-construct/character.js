/**
 * EMBERBOUND EXPEDITION — Flame Construct (game id `flame_construct`), a new iron-and-stone golem after the user's
 * reference image (built on the Geode Colossus's heavy joints): a hulking body of rust-brown stone blocks bound with
 * riveted iron, a square furnace in the chest — flames behind iron bars — a boxy helm-head with two glowing slit
 * eyes and fire burning from its top, huge blocky fists in riveted iron cuffs with flames licking up from the
 * wrists, stacked stone legs, and a riveted iron belt with a hanging plate.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (heavy breathing, the fires flickering), attack (an overhead slam
 * of the leading fist, impact at 0.15 s), `cast` = the Furnace Slam wind-up the game loops (both fists raised, the
 * furnace roaring, trembling — the game can interrupt it), and the shared hurt.
 */
import { TAU, PAL, keyframes } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, flame, rock, drawCreature } from '../shared/emberbound/creature.js';

const C = {
  stone: '#7a6a5b', stoneDark: '#574a3f', stoneLight: '#9a8874', iron: '#4f4740', ironLight: '#6e645a', rivet: '#8f826f',
  fire: '#f08a36', fireLight: '#ffd27a', furnace: '#3a2016', ink: PAL.ink,
};
const FIRE = { outer: '#ec7d33', mid: '#f6a948', core: '#ffe08c' };
const IDLE_T = 3.2;
export const CONSTRUCT_ATTACK_T = .3;   // slam: impact at u = .5
export const CONSTRUCT_SLAM_T = .6;     // Furnace Slam wind-up: a loop
// Arm joints (elbow, fist) per pose; the shoulders are fixed on the body.
const LEAD_REST = [[62, -128], [68, -76]], REAR_REST = [[-56, -130], [-54, -80]];

export function constructPose(action, t) {
  const s = Math.sin(TAU * phase(t, IDLE_T));
  const P = { breathe: s, lean: 0, crouch: 0, lead: LEAD_REST, rear: REAR_REST, heat: .45 + .15 * s, dust: -1, shake: 0, t };
  if (action === 'attack') {
    const u = phase(t, CONSTRUCT_ATTACK_T);
    const k = keyframes([[0, [...LEAD_REST[0], ...LEAD_REST[1]]], [.25, [56, -200, 44, -242]], [.5, [92, -112, 118, -48]], [.72, [90, -110, 114, -46]], [1, [...LEAD_REST[0], ...LEAD_REST[1]]]], u);
    P.lead = [[k[0], k[1]], [k[2], k[3]]];
    P.lean = sample([[0, [0]], [.25, [-8]], [.5, [14]], [.72, [12]], [1, [0]]], u);
    P.crouch = sample([[0, [0]], [.25, [-4]], [.5, [10]], [.72, [8]], [1, [0]]], u);
    P.heat = sample([[0, [.45]], [.25, [.8]], [.5, [1]], [1, [.45]]], u);
    P.dust = u >= .5 && u < .9 ? (u - .5) / .4 : -1;
  } else if (action === 'cast') {
    // Furnace Slam wind-up: both fists raised high, the furnace roaring, the body trembling; periodic in u.
    const u = phase(t, CONSTRUCT_SLAM_T), w = Math.sin(TAU * u * 2);
    P.lead = [[66, -196], [62 + w, -250]]; P.rear = [[-60, -198], [-52 - w, -248]];
    P.heat = .85 + .15 * Math.sin(TAU * u); P.shake = w * 1.2; P.lean = -4;
  }
  return P;
}

export function drawConstruct(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = constructPose(action, t), f = face(direction), b = P.breathe, h = P.heat;
  // Upper points lean forward and down in proportion to their height above the hips.
  const U = ([px, py]) => { const k = Math.max(0, Math.min(1, (-py - 70) / 150)); return [px + (P.lean + P.shake) * k, py + P.crouch * k - b * k * 1.5]; };
  const rivet = (px, py, r = 3.2) => { disc(ctx, f, px, py, r, r, C.rivet, { w: 1, depth: .4, speck: 0 }); disc(ctx, f, px - r * .3, py - r * .3, r * .3, r * .3, '#c6b9a2', { w: 0, depth: 0, speck: 0 }); };
  const box = (cx, cy, w, hgt, col, o = {}) => blob(ctx, f, [[cx - w, cy - hgt], [cx + w, cy - hgt * 1.05], [cx + w * 1.04, cy + hgt], [cx - w * .98, cy + hgt * 1.02]], col, { w: 2, depth: 2.4, light: .2, speck: 1.4, amp: .12, ...o });
  const parts = [];
  // An arm: a stone upper arm and forearm, a huge blocky fist in a riveted iron cuff, fire licking up from the wrist.
  const arm = (sh, [el, fi], col, lead) => {
    const S = U(sh), E = U(el), F = U(fi), mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    rock(ctx, f, ...mid(S, E), 28, 30, col, lead ? 31 : 32, { depth: 2.4 });
    disc(ctx, f, ...E, 12, 12, C.iron, { w: 1.6, depth: 1, speck: .6 });
    rock(ctx, f, ...mid(E, F), 26, 28, col, lead ? 33 : 34, { depth: 2.2 });
    // Fire from the wrist (behind the fist), then the fist: the same shape and colours on both sides.
    flame(ctx, f, F[0] - 4, F[1] - 26, 30, 44 + h * 14, P.t, -.1, lead ? 1 : 2, FIRE);
    // The fist: a stone back, four knuckle blocks along its front and a thumb block, an iron cuff above.
    rock(ctx, f, F[0], F[1] - 2, 34, 28, C.stoneLight, 35, { depth: 2.4, n: 8 });
    for (const [dx, sd] of [[-21, 1], [-7, 2], [7, 3], [21, 4]]) rock(ctx, f, F[0] + dx, F[1] + 16, 9, 11, C.stone, 60 + sd, { depth: 1.6, n: 6 });
    rock(ctx, f, F[0] + 28, F[1] + 2, 9, 13, C.stone, 66, { depth: 1.6, n: 6 });
    box(F[0], F[1] - 26, 37, 9, C.iron, { depth: 1.2 });
    for (const dx of [-24, 0, 24]) rivet(F[0] + dx, F[1] - 26);
  };
  const leg = (hx, fx, col) => {
    box(hx, -66, 24, 18, col);
    box((hx + fx) / 2, -36, 22, 16, col);
    rivet((hx + fx) / 2 + 12, -40, 4);
    box(fx + 6, -12, 34, 12, col, { depth: 2 });
  };
  // Limb depth (plan §6.1): the leading limbs (+x, the facing side) pass behind the trunk; the rear arm and leg are
  // the near ones, drawn over it in lighter stone.
  parts.push({ id: 'leadLeg', d: -10, draw: () => leg(18, 22, C.stoneDark) });
  parts.push({ id: 'leadArm', d: -8, draw: () => arm([52, -166], P.lead, C.stoneDark, true) });
  parts.push({ id: 'leadShoulder', d: -6, draw: () => {
    box(...U([54, -174]), 32, 26, C.stoneDark);
    rivet(...U([54, -182]), 4);
  } });
  parts.push({ id: 'rearLeg', d: -4, draw: () => leg(-30, -34, C.stone) });
  parts.push({ id: 'body', d: 0, draw: () => {
    // The trunk of stone blocks, a riveted iron belt with a hanging plate.
    blob(ctx, f, [[-58, -96], [-64, -150], [-50, -198], [0, -208], [50, -198], [64, -150], [56, -96], [30, -80], [-30, -80]].map(U), C.stone, { w: 2.6, depth: 5, light: .2, speck: 2 });
    for (const [px, py, rx, ry] of [[-38, -126, 20, 24], [-32, -178, 22, 18]]) box(...U([px, py]), rx, ry, C.stone, { depth: 1.6 });
    blob(ctx, f, [[-58, -104], [58, -104], [56, -86], [-56, -86]].map(U), C.iron, { w: 2, depth: 1.4, speck: .8 });
    for (const px of [-40, -14, 12, 38]) rivet(...U([px, -95]), 3.4);
    blob(ctx, f, [[-8, -90], [18, -90], [16, -62], [5, -54], [-6, -62]].map(U), C.ironLight, { w: 1.8, depth: 1.2, speck: .6 });
    // The furnace: an iron frame, glowing fire inside, bars across it.
    const [gx, gy] = U([6, -146]);
    blob(ctx, f, [[gx - 34, gy - 32], [gx + 34, gy - 32], [gx + 36, gy + 32], [gx - 36, gy + 32]], C.iron, { w: 2.2, depth: 1.6, speck: .8, amp: .1 });
    blob(ctx, f, [[gx - 26, gy - 24], [gx + 26, gy - 24], [gx + 27, gy + 25], [gx - 27, gy + 25]], C.furnace, { w: 1.4, depth: 0, speck: 0, amp: .08 });
    ctx.save(); ctx.globalAlpha = .4 + .5 * h; blob(ctx, f, [[gx - 26, gy + 25], [gx - 26, gy - 4], [gx + 26, gy - 4], [gx + 27, gy + 25]], C.fire, { w: 0, depth: 0, speck: 0, amp: .1 }); ctx.restore();
    for (const dx of [-16, 0, 16]) flame(ctx, f, gx + dx, gy + 24, 14, 24 + h * 14, P.t, 0, dx, { ...FIRE, tongues: false });
    for (const dx of [-13, 0, 13]) blob(ctx, f, [[gx + dx - 2.6, gy - 25], [gx + dx + 2.6, gy - 25], [gx + dx + 2.6, gy + 26], [gx + dx - 2.6, gy + 26]], C.ironLight, { w: 1.2, depth: .4, speck: 0, amp: .04 });
    for (const [dx, dy] of [[-30, -28], [30, -28], [-30, 28], [30, 28]]) rivet(gx + dx, gy + dy, 2.8);
  } });
  parts.push({ id: 'head', d: 4, draw: () => {
    // A boxy helm-head sunk between the shoulders: an iron band with rivets, two glowing slit eyes, fire on top.
    const [hx, hy] = U([6, -226]);
    flame(ctx, f, hx, hy - 20, 36, 40 + h * 16, P.t, -.15, 7, FIRE);
    box(hx, hy, 28, 24, C.stoneLight);
    blob(ctx, f, [[hx - 30, hy + 8], [hx + 30, hy + 6], [hx + 30, hy + 18], [hx - 30, hy + 20]], C.iron, { w: 1.8, depth: 1, speck: .6 });
    for (const dx of [-18, 2, 22]) rivet(hx + dx, hy + 13, 3);
    blob(ctx, f, [[hx + 2, hy - 10], [hx + 28, hy - 10], [hx + 28, hy + 3], [hx + 2, hy + 3]], C.furnace, { w: 1.2, depth: 0, speck: 0, amp: .06 });
    for (const ex of [hx + 9, hx + 20]) {
      ctx.save(); ctx.globalAlpha = .4; disc(ctx, f, ex, hy - 3, 6, 7, C.fire, { w: 0, depth: 0, speck: 0 }); ctx.restore();
      blob(ctx, f, [[ex - 2.4, hy - 8], [ex + 2.4, hy - 8], [ex + 2.4, hy + 1], [ex - 2.4, hy + 1]], C.fireLight, { w: 0, depth: 0, speck: 0, amp: .04 });
    }
  } });
  parts.push({ id: 'rearShoulder', d: 8, draw: () => {
    box(...U([-42, -182]), 32, 26, C.stoneLight);
    blob(ctx, f, [[-68, -172], [-16, -174], [-17, -164], [-68, -162]].map(U), C.iron, { w: 1.6, depth: .8, speck: .5 });
    for (const px of [-60, -42, -24]) rivet(...U([px, -168]), 3.2);
  } });
  parts.push({ id: 'rearArm', d: 9, draw: () => arm([-46, -170], P.rear, C.stone, false) });
  parts.push({ id: 'dust', d: 12, draw: () => {
    if (P.dust < 0) return;
    // Dust, stone chips and sparks thrown up where the fist hits the ground.
    const F = U(P.lead[1]);
    ctx.save(); ctx.globalAlpha = 1 - P.dust;
    for (const [dx, k] of [[-28, .8], [0, 1], [28, .9], [46, .6]]) disc(ctx, f, F[0] + dx * (1 + P.dust), -6 - P.dust * 14 * k, 10 * k * (1 + P.dust * .6), 6 * k, '#b7a894', { w: 1, depth: 0, speck: 0 });
    for (const [dx, k] of [[-16, 1], [10, 1.3], [30, .8]]) disc(ctx, f, F[0] + dx, -16 - P.dust * 30 * k, 2.2, 2.2, C.fireLight, { w: .6, depth: 0, speck: 0 });
    ctx.restore();
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-flame-construct', fallTilt(action, t), { pivot: 80, toe: 80, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-flame-construct', label: 'Flame Construct — EMBERBOUND', kind: 'creature', directional: true, draw: drawConstruct,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: CONSTRUCT_ATTACK_T, keys: [0, .1, .25, .38, .5, .6, .72, .85], once: true },
    cast: { period: CONSTRUCT_SLAM_T, frames: 8 },
    hurt: hurtAction },
  frameBox: { x0: -200, x1: 200, y0: -340, y1: 14 },
  emberbound: { gameId: 'flame_construct', heightPx: 36, facing: 'L' },
});
export const studio = Object.freeze({ order: 37, name: 'Flame Construct（炉の巨人）', category: 'EMBERBOUND 第6エリア',
  description: '鉄と石の巨体。胸に格子の炉、頭頂と拳が燃える。装甲を持つ耐久役で、溜めの Furnace Slam で強打する。',
  preview: { direction: 'L', phase: 0 } });
