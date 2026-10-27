/**
 * EMBERBOUND EXPEDITION — Gnarlwood, the Smoldering Elder (game id `gnarlwood`, area 1 boss), a new giant tree
 * after the user's reference image: a huge charred trunk with a face (glowing orange eyes under heavy brows, a
 * frowning mouth), a crown of branches whose broken tips burn, huge branch arms ending in root hands, root legs
 * and glowing cracks. It shares the bark and flame drawing with Cinder Sapling.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (slow sway, flicker), attack (a short overhead slam of the near
 * arm, impact at 0.15 s), `cast` = the Root Crush / Sapling Call wind-up the game loops (both arms raised,
 * trembling, the crown flaring), and the shared hurt.
 */
import { TAU, keyframes } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, flame, sparks, crack, limb, bark, TREE, drawCreature } from '../shared/emberbound/creature.js';

const C = { ...TREE, eye: '#ffb347', eyeCore: '#fff0a8' };
const IDLE_T = 3;
export const GNARL_ATTACK_T = .3;    // slam lands at u = .5 (0.15 s)
export const GNARL_WINDUP_T = .5;    // Root Crush / Sapling Call wind-up: a loop
const UPPER = 60, FORE = 70;

// Arm angles: 0 = forward, + = down (local frame facing right); a2 bends the forearm relative to the upper arm.
const NEAR_IDLE = [1.35, .1], FAR_IDLE = [Math.PI - 1, -.45];

export function gnarlPose(action, t) {
  const P = { sway: Math.sin(TAU * phase(t, IDLE_T)) * 3, lean: 0, crouch: 0, near: NEAR_IDLE, far: FAR_IDLE, flare: 0, dust: -1, t };
  if (action === 'attack') {
    const u = phase(t, GNARL_ATTACK_T);
    P.near = keyframes([[0, NEAR_IDLE], [.25, [-1.5, -.5]], [.5, [.45, .75]], [.72, [.5, .75]], [1, NEAR_IDLE]], u);
    P.lean = sample([[0, [0]], [.25, [-8]], [.5, [14]], [.72, [12]], [1, [0]]], u);
    P.crouch = sample([[0, [0]], [.25, [-4]], [.5, [12]], [.72, [10]], [1, [0]]], u);
    P.dust = u >= .5 && u < .9 ? (u - .5) / .4 : -1;
  } else if (action === 'cast') {
    // Both arms raised high, trembling; periodic in u so the loop is seamless.
    const u = phase(t, GNARL_WINDUP_T), tr = Math.sin(TAU * u * 2);
    P.near = [-1 + tr * .03, -.4]; P.far = [-1.95 - tr * .03, .3];
    P.lean = -4 + tr * 1.2; P.crouch = -3; P.flare = .6 + Math.sin(TAU * u) * .2; P.sway = 0;
  }
  return P;
}

export function drawGnarl(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = gnarlPose(action, t), f = face(direction);
  // Upper points follow the lean (forward) and crouch (down) in proportion to their height.
  const L = (px, py) => { const k = Math.min(1, -py / 220); return [px + (P.lean + P.sway) * k, py + P.crouch * k]; };
  const parts = [];
  const arm = (sh, [a1, a2], fill, r) => {
    const e = [sh[0] + Math.cos(a1) * UPPER, sh[1] + Math.sin(a1) * UPPER], b = a1 + a2, h = [e[0] + Math.cos(b) * FORE, e[1] + Math.sin(b) * FORE];
    limb(ctx, f, [sh, e, h], r, r * .62, fill, { w: 2 });
    // Root hand: a knotted palm and four root fingers spreading around the forearm's direction.
    for (const [d, len] of [[-.7, 22], [-.25, 28], [.2, 26], [.65, 20]])
      limb(ctx, f, [h, [h[0] + Math.cos(b + d) * len * .55, h[1] + Math.sin(b + d) * len * .55], [h[0] + Math.cos(b + d * 1.4) * len, h[1] + Math.sin(b + d * 1.4) * len]], 6, 2, fill, { w: 1.5 });
    disc(ctx, f, h[0], h[1], r * .7, r * .62, fill, { w: 1.8, depth: 1.2 });
    return h;
  };
  const rootLeg = (hx, fx, fill, s) => {
    limb(ctx, f, [[hx, -46], [(hx + fx) / 2 + s * 4, -22], [fx, 0]], 19, 13, fill, { w: 2 });
    for (const [dx, dy] of [[s * 26, 2], [s * 14, 3], [-s * 12, 2]]) limb(ctx, f, [[fx, -4], [fx + dx * .6, -1], [fx + dx, dy]], 7, 2, fill, { w: 1.5 });
  };
  parts.push({ id: 'farLeg', d: -10, draw: () => rootLeg(-24, -44, C.barkDark, -1) });
  parts.push({ id: 'farArm', d: -8, draw: () => arm(L(-30, -165), P.far, C.barkDark, 15) });
  parts.push({ id: 'crown', d: -4, draw: () => {
    // Branches from the top of the trunk; their broken tips burn.
    [[[-30, -210], [-48, -240], [-58, -262], 0], [[-4, -218], [-8, -252], [0, -278], 1.3], [[20, -214], [32, -246], [30, -270], 2.6],
     [[40, -200], [62, -222], [76, -236], 3.4], [[-44, -196], [-70, -212], [-84, -230], 4.7]].forEach(([a, m, tip, s]) => {
      const pts3 = [L(...a), L(...m), L(...tip)];
      limb(ctx, f, pts3, 14, 6, C.bark, { w: 1.8 });
      const [mx, my] = pts3[1], side = s % 2 < 1 ? 1 : -1;
      limb(ctx, f, [[mx, my], [mx + side * 12, my - 8], [mx + side * 18, my - 18]], 4.5, 2, C.bark, { w: 1.3 });
      const [tx, ty] = pts3[2];
      flame(ctx, f, tx, ty + 6, 16 + P.flare * 6, (24 + P.flare * 14) * (1 + Math.sin(P.t * 3 + s) * .06), P.t, -.3, s, { w: 1.3 });
    });
    const [sx0, sy0] = L(0, -270);
    sparks(ctx, f, sx0, sy0, 50, 30, P.t, 6, .2);
  } });
  parts.push({ id: 'trunk', d: 0, draw: () => {
    const trunk = [L(76, -24), L(62, -40), L(64, -84), L(56, -120), L(60, -150), L(52, -190), L(42, -212), L(20, -222), L(-10, -226), L(-40, -214),
      L(-52, -186), L(-50, -150), L(-60, -112), L(-64, -70), L(-70, -40), L(-86, -24), L(-50, -30), L(-20, -26), L(20, -26), L(48, -30)];
    blob(ctx, f, trunk, C.bark, { w: 2.6, depth: 5, light: .2, speck: 2 });
    // Bark grain, knots and the glowing cracks.
    for (const [x0, x1, y0, y1, n, s] of [[-54, -8, -200, -40, 4, .4], [-6, 50, -100, -40, 3, 2.2]]) {
      const [ax] = L(x0, y0); bark(ctx, f, ax, ax + (x1 - x0), y0, y1, n, s, .8);
    }
    disc(ctx, f, ...L(-34, -70), 6, 8, C.hollow, { w: 1.2, depth: 0, speck: 0 });
    crack(ctx, f, [L(-24, -150), L(-28, -128), L(-22, -110), L(-30, -92)]);
    crack(ctx, f, [L(38, -82), L(32, -64), L(40, -48)]);
    crack(ctx, f, [L(-8, -205), L(-14, -190), L(-6, -178)]);
    crack(ctx, f, [L(-48, -60), L(-40, -46)]);
  } });
  parts.push({ id: 'face', d: 2, draw: () => {
    // Glowing eyes in dark sockets, heavy bark brows slanting down to the middle, a knot nose and a frowning mouth.
    const hurt = action === 'hurt' && t < .2;
    for (const [ex, rx] of [[20, 8], [45, 9]]) {
      const [qx, qy] = L(ex, -160);
      disc(ctx, f, qx, qy, rx, 7.5, C.hollow, { w: 1.4, depth: 0, speck: 0 });
      if (!hurt) { disc(ctx, f, qx + 1, qy + 1, rx * .55, 4.2, C.eye, { w: 0, depth: 0, speck: 0 }); disc(ctx, f, qx + 1.5, qy + 1, rx * .25, 2, C.eyeCore, { w: 0, depth: 0, speck: 0 }); }
      else line(ctx, f, [[qx - rx * .6, qy + 1], [qx + rx * .6, qy + 1]], 1.4);
    }
    blob(ctx, f, [L(8, -176), L(30, -168), L(31, -162), L(9, -168)], C.barkLight, { w: 1.6, depth: 1 });
    blob(ctx, f, [L(37, -166), L(56, -176), L(56, -168), L(37, -160)], C.barkLight, { w: 1.6, depth: 1 });
    blob(ctx, f, [L(32, -152), L(40, -150), L(44, -136), L(34, -134)], C.barkLight, { w: 1.4, depth: 1 });
    const mouth = [L(16, -110), L(24, -121), L(38, -123), L(52, -116), L(54, -106), L(46, -111), L(34, -115), L(24, -113)];
    blob(ctx, f, mouth, C.hollow, { w: 1.6, depth: 0, speck: 0 });
    blob(ctx, f, [L(25, -115), L(38, -118), L(46, -113), L(34, -113)], C.glow, { w: 0, depth: 0, speck: 0 });
  } });
  parts.push({ id: 'nearLeg', d: 6, draw: () => rootLeg(26, 46, C.bark, 1) });
  parts.push({ id: 'nearArm', d: 8, draw: () => {
    const h = arm(L(-8, -150), P.near, C.bark, 17);
    if (P.dust >= 0) {
      // Dust and embers kicked up where the hand hits the ground.
      ctx.save(); ctx.globalAlpha = 1 - P.dust;
      for (const [dx, k] of [[-22, .8], [0, 1], [24, .9], [40, .6]]) disc(ctx, f, h[0] + dx * (1 + P.dust), -6 - P.dust * 14 * k, 9 * k * (1 + P.dust * .6), 6 * k, '#b5a596', { w: 1, depth: 0, speck: 0 });
      ctx.restore();
      sparks(ctx, f, h[0] + 10, -10, 30, 26, P.dust * .9, 5, .1);
    }
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-gnarlwood', fallTilt(action, t), { pivot: 70, toe: 70, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-gnarlwood', label: 'Gnarlwood — EMBERBOUND', kind: 'creature', directional: true, draw: drawGnarl,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: GNARL_ATTACK_T, keys: [0, .1, .25, .38, .5, .6, .72, .85], once: true },
    cast: { period: GNARL_WINDUP_T, frames: 6 },
    hurt: hurtAction },
  frameBox: { x0: -190, x1: 190, y0: -330, y1: 14 },
  emberbound: { gameId: 'gnarlwood', heightPx: 67, facing: 'L' },
});
export const studio = Object.freeze({ order: 11, name: 'Gnarlwood（くすぶる古老）', category: 'EMBERBOUND 第1エリア',
  description: '第1エリアのボス。顔のある巨大な枯れ木。根の脚、太い枝の腕、燃える枝先、橙色に光る幹の裂け目。Root Crush と苗木召喚を使う。',
  preview: { direction: 'L', phase: 0 } });
