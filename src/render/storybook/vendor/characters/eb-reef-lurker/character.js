/**
 * EMBERBOUND EXPEDITION — Reef Lurker (game id `reef_lurker`), a new crab after the user's reference image: a
 * broad, flat teal carapace mottled with pale patches and crusted with barnacles, red branching coral growing
 * from its back, an angry face under the shell rim, big cream-tipped claws and pointed, jointed legs.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (breathing, claws flexing), a short pinch with the near claw
 * (it rises open, then snaps shut forward at 0.15 s), the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, drawCreature } from '../shared/emberbound/creature.js';

const C = { shell:'#5f9c98', shellDark:'#41726f', patch:'#a2c6ad', under:'#58705f', tip:'#ecdcb8', barnacle:'#ece6d6',
  coral:'#d9573f', coralDark:'#a8402f', ink:PAL.ink };
const IDLE_T = 2.4;
export const LURKER_ATTACK_T = .3;   // pinch: snaps shut at u = .5

export function lurkerPose(action, t) {
  const b = Math.sin(TAU * phase(t, IDLE_T));
  const P = { breathe: b, shift: 0, lift: 0, claw: [0, 0], open: .25 + b * .08, far: .2 - b * .05, t };
  if (action === 'attack') {
    const u = phase(t, LURKER_ATTACK_T);
    P.shift = sample([[0, [0]], [.25, [-3]], [.5, [7]], [.7, [6]], [1, [0]]], u);
    // Near claw: up and back while opening wide, then forward and shut.
    P.claw = [sample([[0, [0]], [.25, [10]], [.5, [20]], [.7, [18]], [1, [0]]], u), sample([[0, [0]], [.25, [-30]], [.5, [-2]], [.7, [-2]], [1, [0]]], u)];
    P.open = sample([[0, [.25]], [.25, [.9]], [.46, [.7]], [.5, [0]], [.7, [0]], [1, [.25]]], u);
    P.lift = sample([[0, [0]], [.25, [2]], [.5, [-1]], [1, [0]]], u);
  }
  return P;
}

// A claw at wrist (x, y) pointing along angle `a` (0 = forward), scaled by s; `open` (0–1) lowers the finger.
function claw(ctx, f, x, y, a, s, open, fill, barnacles) {
  const c = Math.cos(a), sn = Math.sin(a), R = ([px, py]) => [x + (px * c - py * sn) * s, y + (px * sn + py * c) * s];
  const pivot = [14, 5], o = open * .7, oc = Math.cos(o), os = Math.sin(o);
  const fingerPt = ([px, py]) => { const dx = px - pivot[0], dy = py - pivot[1]; return R([pivot[0] + dx * oc - dy * os, pivot[1] + dx * os + dy * oc]); };
  // Movable lower finger (behind the palm), the palm, then the fixed upper finger.
  const lower = [[13, 3], [26, 5], [37, 10], [33, 15], [22, 14], [12, 11]];
  blob(ctx, f, lower.map(fingerPt), fill, { w: 1.6, depth: 1.4 });
  blob(ctx, f, [[24, 7], [37, 10], [33, 15], [24, 13]].map(fingerPt), C.tip, { w: 1.2, depth: .8, speck: .3 });
  blob(ctx, f, [[-10, -12], [6, -15], [17, -11], [19, -1], [16, 9], [4, 13], [-10, 10], [-15, 0]].map(R), fill, { w: 1.8, depth: 2.2, light: .2, speck: 1.2 });
  blob(ctx, f, [[-6, -6], [6, -9], [10, -2], [2, 4], [-6, 3]].map(R), C.patch, { w: 0, depth: .4, speck: .5 });
  blob(ctx, f, [[15, -11], [27, -13], [37, -7], [41, 2], [35, 1], [26, -3], [16, -1]].map(R), fill, { w: 1.6, depth: 1.4 });
  blob(ctx, f, [[27, -12], [37, -7], [41, 2], [35, 1], [28, -4]].map(R), C.tip, { w: 1.2, depth: .8, speck: .3 });
  for (const [px, py] of [[30, -3], [24, -1]]) line(ctx, f, [R([px, py]), R([px + 1, py + 2])], .5);
  if (barnacles) for (const [px, py, r] of barnacles) barnacle(ctx, f, ...R([px, py]), r * s);
}

function barnacle(ctx, f, x, y, r) {
  disc(ctx, f, x, y, r, r * .85, C.barnacle, { w: 1, depth: .6, speck: .2 });
  disc(ctx, f, x + .3, y - .3, r * .4, r * .35, C.under, { w: .5, depth: 0, speck: 0 });
}

export function drawLurker(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = lurkerPose(action, t), f = face(direction), sx = P.shift, b = P.breathe, ly = P.lift;
  const parts = [];
  // Jointed legs splayed out from under the shell: hip, a high knee, a pointed tip on the ground.
  const legs = (near) => () => {
    const col = near ? C.shell : C.shellDark, oy = near ? 0 : -3, k = near ? 1 : .85;
    [[-38, -34], [-16, -14], [6, 14]].forEach(([hx, dx]) => {
      const hip = [hx + sx * .6 + (near ? 0 : 8), -20 + oy - ly], foot = [hip[0] + dx * k, oy];
      limb(ctx, f, [hip, [hip[0] + dx * .45, -42 + oy - ly], [foot[0] + 2, oy - 9], foot], 6.2, 1.8, col, { w: 1.5 });
    });
  };
  parts.push({ id: 'farLegs', d: -10, draw: legs(false) });
  parts.push({ id: 'farClaw', d: -8, draw: () => {
    limb(ctx, f, [[30 + sx, -24 - ly], [46 + sx, -32 - ly], [58 + sx, -30 - ly]], 6, 5, C.shellDark, { w: 1.5 });
    claw(ctx, f, 60 + sx, -30 - ly, -.15, .7, P.far, C.shellDark);
  } });
  parts.push({ id: 'coral', d: -4, draw: () => {
    // Red branching coral growing from the back of the shell.
    const base = (px, py) => [px + sx, py - ly - b * .5];
    for (const [pts, w] of [
      [[[-18, -68], [-22, -82], [-18, -94], [-22, -106]], 4.4], [[[-20, -84], [-30, -90], [-32, -100]], 3], [[[-18, -94], [-10, -100], [-8, -108]], 2.4],
      [[[-34, -62], [-44, -72], [-46, -84]], 3.4], [[[-44, -73], [-52, -74]], 2], [[[-2, -70], [2, -80], [-1, -88]], 2.6],
    ]) limb(ctx, f, pts.map(p => base(...p)), w, w * .55, C.coral, { w: 1.4, depth: 1.2 });
    for (const [px, py] of [[-22, -106], [-32, -100], [-8, -108], [-46, -84], [-1, -88]]) disc(ctx, f, ...base(px, py), 2, 2, C.coral, { w: 1.2, depth: .4, speck: 0 });
  } });
  parts.push({ id: 'body', d: 0, draw: () => {
    const top = -74 - b - ly, Y = py => py - ly;
    // Underside and the face beneath the front of the rim: angry eyes, a toothy plate mouth.
    // (Its top edge runs up under the shell, so no gap opens between the rim and the body.)
    blob(ctx, f, [[-58 + sx, Y(-40)], [-30 + sx, Y(-52)], [10 + sx, Y(-56)], [46 + sx, Y(-50)], [60 + sx, Y(-36)], [54 + sx, Y(-16)], [30 + sx, Y(-12)], [-24 + sx, Y(-12)], [-50 + sx, Y(-20)]], C.under, { w: 1.6, depth: 1.6 });
    blob(ctx, f, [[40 + sx, Y(-40)], [62 + sx, Y(-40)], [66 + sx, Y(-26)], [56 + sx, Y(-17)], [42 + sx, Y(-20)]], '#7d9c88', { w: 1.4, depth: 1 });
    for (const ex of [48, 60]) disc(ctx, f, ex + sx, Y(-33), 2.6, 3.6, C.ink, { w: .5, depth: 0, speck: 0 });
    line(ctx, f, [[43 + sx, Y(-40)], [49 + sx, Y(-37)], [53 + sx, Y(-37)]], 1.3);
    line(ctx, f, [[57 + sx, Y(-37)], [61 + sx, Y(-38)], [65 + sx, Y(-41)]], 1.2);
    line(ctx, f, [[46 + sx, Y(-24)], [63 + sx, Y(-24)]], .9);
    for (const tx of [49, 53, 57, 61]) line(ctx, f, [[tx + sx, Y(-26.5)], [tx + sx, Y(-21.5)]], .6);
    // The domed carapace with a wavy rim, pale patches and barnacles.
    const shell = [[-66 + sx, Y(-32)], [-60 + sx, Y(-50)], [-42 + sx, top + 10], [-12 + sx, top], [18 + sx, top + 2], [42 + sx, top + 12], [58 + sx, Y(-52)], [68 + sx, Y(-40)],
      [62 + sx, Y(-38)], [56 + sx, Y(-42)], [46 + sx, Y(-39)], [36 + sx, Y(-43)], [24 + sx, Y(-36)], [10 + sx, Y(-40)], [-4 + sx, Y(-34)],
      [-18 + sx, Y(-38)], [-32 + sx, Y(-31)], [-46 + sx, Y(-35)], [-56 + sx, Y(-30)]];
    blob(ctx, f, shell, C.shell, { w: 2.2, depth: 4, light: .2, speck: 1.8 });
    for (const pts of [[[-44, -50], [-28, -62], [-14, -58], [-26, -48]], [[0, -64], [20, -66], [28, -58], [10, -54]], [[32, -54], [46, -56], [50, -48], [38, -46]], [[-16, -46], [0, -48], [6, -42], [-8, -40]]])
      blob(ctx, f, pts.map(([px, py]) => [px + sx, Y(py) - b * .5]), C.patch, { w: 0, depth: .4, speck: .6 });
    line(ctx, f, [[-54 + sx, Y(-40)], [-20 + sx, Y(-46)], [20 + sx, Y(-48)], [56 + sx, Y(-45)]], .6);
    for (const [px, py, r] of [[-32, -56, 3.4], [-26, -61, 2.6], [14, -60, 3], [38, -52, 2.6], [-4, -52, 2.2], [42, -57, 2], [-48, -46, 2.2]]) barnacle(ctx, f, px + sx, Y(py) - b * .5, r);
  } });
  parts.push({ id: 'nearLegs', d: 10, draw: legs(true) });
  parts.push({ id: 'nearClaw', d: 12, draw: () => {
    const [cx, cy] = P.claw, wx = 62 + sx + cx, wy = -10 - ly + cy;
    // The arm comes out under the face, so the claw stays below and in front of it.
    limb(ctx, f, [[28 + sx, -16 - ly], [46 + sx + cx * .5, -8 - ly + cy * .5], [wx, wy]], 7.5, 6.5, C.shell, { w: 1.6 });
    claw(ctx, f, wx, wy, cy < -12 ? -.7 : -.05, 1.1, P.open, C.shell, [[2, -8, 2.6], [-4, -3, 2.2], [6, -2, 1.8]]);
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-reef-lurker', fallTilt(action, t), { pivot: 50, toe: 50, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-reef-lurker', label: 'Reef Lurker — EMBERBOUND', kind: 'creature', directional: true, draw: drawLurker,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: LURKER_ATTACK_T, keys: [0, .12, .25, .38, .46, .5, .6, .7, .85], once: true },
    hurt: hurtAction },
  frameBox: { x0: -150, x1: 150, y0: -130, y1: 12 },
  emberbound: { gameId: 'reef_lurker', heightPx: 18, facing: 'L' },
});
export const studio = Object.freeze({ order: 12, name: 'Reef Lurker（岩礁の潜み蟹）', category: 'EMBERBOUND 第2エリア',
  description: '青緑色の平たい甲羅の蟹。フジツボと赤い珊瑚が背に生え、大きな鋏で挟む。頑丈な前衛向けの敵。',
  preview: { direction: 'L', phase: 0 } });
