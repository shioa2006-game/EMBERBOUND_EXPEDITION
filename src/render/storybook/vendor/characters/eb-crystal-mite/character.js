/**
 * EMBERBOUND EXPEDITION — Crystal Mite (game id `crystal_mite`), a new small crystal bug after the user's
 * reference image: a purple-grey rocky shell over short jointed legs, a rounded head with big dark eyes and two
 * beaded antennae, and a big cluster of pale pink crystals heaped on its back. The crystals pulse faintly with
 * light (it bursts when defeated).
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (pulsing, antennae), a short lunge (contact at 0.15 s), the
 * shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, crystal, rock, CRYSTAL, drawCreature } from '../shared/emberbound/creature.js';

const C = { ...CRYSTAL, pinkDeep: '#e3a3c1', claw: '#5b4a46', ink: PAL.ink };
const IDLE_T = 1.6;
export const MITE_ATTACK_T = .3;   // lunge: contact at u = .5

export function mitePose(action, t) {
  const P = { shift: 0, lift: 0, glow: .5 + .5 * Math.sin(TAU * phase(t, IDLE_T)), ant: Math.sin(t * 5) * 2, step: Math.sin(TAU * phase(t, IDLE_T)) };
  if (action === 'attack') {
    const u = phase(t, MITE_ATTACK_T);
    P.shift = sample([[0, [0]], [.25, [-4]], [.5, [12]], [.7, [10]], [1, [0]]], u);
    P.lift = sample([[0, [0]], [.25, [2]], [.5, [-1]], [1, [0]]], u);
    P.glow = sample([[0, [.5]], [.5, [1]], [1, [.5]]], u);
  }
  return P;
}

export function drawMite(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = mitePose(action, t), f = face(direction), sx = P.shift, ly = P.lift;
  const parts = [];
  // Three short jointed legs per side, each with a dark tip.
  const legs = (near) => () => {
    const col = near ? CRYSTAL.rock : CRYSTAL.rockDark, oy = near ? 0 : -2;
    [[-18, -10], [0, -2], [18, 8]].forEach(([hx, dx], i) => {
      const hip = [hx + sx + (near ? 0 : 4), -12 + oy - ly], st = (i % 2 ? 1 : -1) * P.step * .8;
      const foot = [hip[0] + dx * .6 + st, oy];
      limb(ctx, f, [hip, [hip[0] + dx * .5 + 3, -14 + oy - ly], foot], 5.4, 3.2, col, { w: 1.3 });
      blob(ctx, f, [[foot[0] - 2, foot[1] - 3], [foot[0] + 2, foot[1] - 3], [foot[0] + 1, foot[1] + .5], [foot[0] - 1.5, foot[1] + .5]], C.claw, { w: .9, depth: .2, speck: 0 });
    });
  };
  parts.push({ id: 'farLegs', d: -10, draw: legs(false) });
  parts.push({ id: 'crystals', d: -2, draw: () => {
    // A heap of pink crystals on the back, the biggest in the middle; they glow brighter as it pulses.
    [[-14, -42, 26, -1.85, C.pink], [16, -40, 22, -1.2, C.pink], [-24, -36, 18, -2.25, C.lilac], [22, -34, 14, -.9, C.pink],
     [-2, -44, 46, -1.62, C.pink], [8, -42, 36, -1.38, C.pinkDeep], [-10, -40, 16, -1.95, C.white], [4, -38, 14, -1.1, C.lilac]]
      .forEach(([px, py, len, a, col]) => crystal(ctx, f, px + sx, py - ly, a, len, Math.max(7, len * .42), col, { w: 1.3, glow: P.glow }));
    ctx.save(); ctx.globalAlpha = .12 + P.glow * .12;
    disc(ctx, f, 2 + sx, -64 - ly, 24, 22, '#ffe6f2', { w: 0, depth: 0, speck: 0 });
    ctx.restore();
  } });
  parts.push({ id: 'body', d: 0, draw: () => {
    // The rocky shell over a darker under-shell.
    blob(ctx, f, [[-34 + sx, -10 - ly], [34 + sx, -10 - ly], [36 + sx, -18 - ly], [-36 + sx, -18 - ly]], CRYSTAL.rockDark, { w: 1.5, depth: 1.2 });
    blob(ctx, f, [[-36 + sx, -14 - ly], [-34 + sx, -28 - ly], [-20 + sx, -40 - ly], [2 + sx, -44 - ly], [22 + sx, -40 - ly], [34 + sx, -28 - ly], [34 + sx, -14 - ly]], CRYSTAL.rock, { w: 2, depth: 2.6, speck: 1.2 });
    for (const [px, py, rx, ry, s] of [[-20, -28, 13, 10, 1], [2, -34, 14, 10, 2], [20, -28, 12, 10, 3], [-12, -18, 13, 7, 4], [12, -18, 12, 7, 5]])
      rock(ctx, f, px + sx, py - ly, rx, ry, s % 2 ? CRYSTAL.rock : CRYSTAL.rockLight, s, { depth: 1.4, w: 1.5 });
  } });
  parts.push({ id: 'head', d: 5, draw: () => {
    const hx = sx, hy = -ly;
    // Beaded antennae, the round head, big dark eyes, a small mouth.
    // Each antenna starts inside the head (drawn over its root) and its beads run unbroken from there to the tip.
    for (const [bx, k] of [[34, .8], [39, 1]]) {
      const a = [bx + 1, -29], c = [bx + 2, -50 + P.ant * .3], e = [bx + 14 + P.ant * k, -54 + P.ant * .5];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8, qx = (1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * e[0], qy = (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * e[1];
        disc(ctx, f, qx + hx, qy + hy, 2.4 - u * .5, 2.2 - u * .4, i === 8 ? C.pink : CRYSTAL.rockLight, { w: .9, depth: .2, speck: 0 });
      }
    }
    blob(ctx, f, [[26 + hx, -30 + hy], [40 + hx, -34 + hy], [50 + hx, -26 + hy], [50 + hx, -16 + hy], [40 + hx, -10 + hy], [28 + hx, -13 + hy]], CRYSTAL.rock, { w: 1.8, depth: 1.8 });
    for (const ex of [38, 46]) {
      disc(ctx, f, ex + hx, -23 + hy, 2.8, 3.8, C.ink, { w: .5, depth: 0, speck: 0 });
      disc(ctx, f, ex - 1 + hx, -24.5 + hy, .9, 1.1, '#ffffff', { w: 0, depth: 0, speck: 0 });
    }
    line(ctx, f, [[41 + hx, -15 + hy], [44 + hx, -14 + hy], [47 + hx, -15.5 + hy]], .7);
  } });
  parts.push({ id: 'nearLegs', d: 10, draw: legs(true) });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-crystal-mite', fallTilt(action, t), { pivot: 30, toe: 30, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-crystal-mite', label: 'Crystal Mite — EMBERBOUND', kind: 'creature', directional: true, draw: drawMite,
  actions: { idle: { period: IDLE_T, frames: 10 },
    attack: { period: MITE_ATTACK_T, keys: [0, .12, .25, .38, .5, .6, .7, .85], once: true },
    hurt: hurtAction },
  frameBox: { x0: -80, x1: 80, y0: -100, y1: 12 },
  emberbound: { gameId: 'crystal_mite', heightPx: 10, facing: 'L' },
});
export const studio = Object.freeze({ order: 20, name: 'Crystal Mite（結晶ダニ）', category: 'EMBERBOUND 第3エリア',
  description: '岩の殻に桃色の結晶を山のように背負った小さな虫。結晶が淡く脈打ち、倒されると爆発する。',
  preview: { direction: 'L', phase: 0 } });
