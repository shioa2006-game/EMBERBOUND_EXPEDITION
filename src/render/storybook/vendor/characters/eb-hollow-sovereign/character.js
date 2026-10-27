/**
 * EMBERBOUND EXPEDITION — The Hollow Sovereign (game id `hollow_sovereign`, area 5 boss), after the user's reference
 * image: a tall, hooded king with a small head — a tall crown of dark bronze spikes set with green gems, a deep hood
 * with nothing inside but one huge yellow-green eye with a slit pupil — layered, tattered black and purple robes, a
 * capelet with round bronze medallions and a hanging chain, a bronze-edged tabard with diamond gems, a great torn
 * cloak spreading behind, a clawed open hand reaching forward, and a long dark staff whose spiked bronze head cages
 * a glowing eye-orb, ragged ribbons hanging from it.
 * Drawn by hand in a right-facing local frame (like the Rimequeen), so the boss can have a long body and a small
 * head. The staff is always in his left hand: facing left it is the near arm, at his back; facing right the far
 * arm, held out in front behind the body (see HANDS). Elbows bend down and back.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): `attack` is the heavy strike (the staff lifted and slammed down at
 * u = .12, the orb flaring; no ground effect), `cast` = the Eclipse wind-up the game
 * loops (staff raised, a dark eclipse with a green corona swelling over the orb), and the shared hurt.
 */
import { TAU, PAL, keyframes } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, drawCreature } from '../shared/emberbound/creature.js';

const C = {
  cloak: '#1f1a25', cloakIn: '#563c6a', robe: '#2b2333', robeLight: '#3d3247', purple: '#5d4272', purpleLight: '#7a5a8e',
  bronze: '#9a7a4c', bronzeDark: '#5e4a33', iron: '#3a3238', hood: '#2a2231', void: '#0c090f',
  glow: '#dcef5c', glowPale: '#f4ffc8', glowDim: '#8fa63a', ink: PAL.ink,
};
const IDLE_T = 3.6;
export const SOVEREIGN_ATTACK_T = .3;   // heavy strike: the staff lands at u = .12
export const SOVEREIGN_ECLIPSE_T = .6;  // Eclipse wind-up: a loop
const SH_FRONT = [14, -146], SH_BACK = [-12, -146], ARM = 24;   // shoulders, upper arm = forearm length
// The staff is always in his left hand and the open hand is his right, whichever way he faces (as the Rimequeen).
// Staff: [hand x, y, angle] (angle −π/2 = straight up); palm: [x, y].
const HANDS = {
  L: { staff: [-26, -112, -1.62], palm: [48, -140], lift: [-26, -138, -1.62], slam: [-24, -104, -1.62], slamPalm: [52, -136], castStaff: [-20, -150, -1.7], castPalm: [46, -162] },
  R: { staff: [32, -114, -1.5], palm: [8, -118], lift: [32, -140, -1.5], slam: [34, -106, -1.5], slamPalm: [12, -122], castStaff: [30, -152, -1.52], castPalm: [-26, -162] },
};
const STAFF_UP = 116, STAFF_DOWN = 104;   // staff length above and below the hand

export function sovereignPose(action, t, direction = 'L') {
  const s = Math.sin(TAU * phase(t, IDLE_T)), Q = HANDS[direction === 'R' ? 'R' : 'L'];
  const P = { sway: s * 1.4, staff: Q.staff.slice(), palm: Q.palm.slice(), glow: .4 + .15 * Math.sin(t * 2.2), eclipse: -1, lean: 0, blink: false };
  if (action === 'attack') {
    // Heavy strike: the staff lifted, then slammed down, the orb flaring (no ground effect: the user asked for none).
    const u = phase(t, SOVEREIGN_ATTACK_T);
    P.staff = keyframes([[0, Q.staff], [.06, Q.lift], [.12, Q.slam], [.45, Q.slam], [1, Q.staff]], u);
    P.palm = keyframes([[0, Q.palm], [.06, Q.palm], [.12, Q.slamPalm], [.45, Q.slamPalm], [1, Q.palm]], u);
    P.lean = sample([[0, [0]], [.06, [-2]], [.12, [4]], [.45, [3]], [1, [0]]], u);
    P.glow = sample([[0, [.4]], [.1, [1]], [.3, [.7]], [.6, [.3]], [1, [.4]]], u);
  } else if (action === 'cast') {
    // Eclipse wind-up: the staff raised, the palm up, a dark disc with a green corona over the orb; periodic in u.
    const u = phase(t, SOVEREIGN_ECLIPSE_T), w = Math.sin(TAU * u);
    P.staff = [Q.castStaff[0], Q.castStaff[1] + w * .6, Q.castStaff[2]]; P.palm = [Q.castPalm[0], Q.castPalm[1] + w * .6];
    P.lean = -2; P.glow = .8 + .2 * w; P.eclipse = u; P.sway = w * 1.5;
  } else if (action === 'hurt') {
    P.blink = t < .2;
  }
  return P;
}

/** Two-bone reach from shoulder S to hand H; of the two elbows, the lower one further back. */
function elbow(S, H) {
  const dx = H[0] - S[0], dy = H[1] - S[1], L = Math.hypot(dx, dy) || 1, d = Math.min(L, ARM * 2 - .01);
  const h = Math.sqrt(Math.max(0, ARM * ARM - (d / 2) ** 2)), m = [S[0] + dx / 2, S[1] + dy / 2];
  const a = [m[0] - dy / L * h, m[1] + dx / L * h], b = [m[0] + dy / L * h, m[1] - dx / L * h];
  return a[1] - a[0] * .5 >= b[1] - b[0] * .5 ? a : b;
}
/** A ragged edge from p to q: tongues hanging toward +y by up to `depth`, swaying with `sw`. */
function ragged(p, q, n, depth, sw = 0) {
  const out = [];
  for (let i = 0; i <= n * 2; i++) {
    const u = i / (n * 2), d = i % 2 ? depth * (.55 + .45 * Math.abs(Math.sin(i * 1.7))) : 0;
    out.push([p[0] + (q[0] - p[0]) * u + sw * u, p[1] + (q[1] - p[1]) * u + d]);
  }
  return out;
}

export function drawSovereign(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = sovereignPose(action, t, direction), f = face(direction), sw = P.sway, R = direction === 'R';
  const U = ([px, py]) => [px + P.lean * Math.max(0, -py - 60) / 140, py];
  const parts = [];
  parts.push({ id: 'cloak', d: -10, draw: () => {
    // The great torn cloak spreading behind him, its purple lining showing through the tears.
    const hem = ragged([-20, -6], [-104 + sw, -18], 7, 16, sw);
    blob(ctx, f, [[-8, -156], [-30, -150], [-58, -122], [-84, -84], [-100 + sw, -46], ...hem.slice().reverse(), [-8, -4], [6, -60], [4, -120]].map(U), C.cloak, { w: 2.2, depth: 2.6, speck: 1 });
    blob(ctx, f, [[-30, -138], [-56, -110], [-80, -70], [-94 + sw, -36], [-80 + sw, -30], [-64, -56], [-44, -98]].map(U), C.cloakIn, { w: 0, depth: .6, speck: .8 });
    for (const pts of [[[-24, -140], [-50, -80], [-58, -20]], [[-40, -130], [-74, -70], [-88, -30]]]) line(ctx, f, pts.map(U), .6);
    // The far edge of the cloak shows ahead of the body.
    blob(ctx, f, [[16, -146], [34, -120], [48, -70], [56, -20], ...ragged([56, -16], [24, -10], 3, 10).slice(1), [20, -80]].map(U), C.cloak, { w: 1.8, depth: 1.6, speck: .6 });
  } });
  // A wide tattered sleeve from shoulder S through the elbow to the wrist.
  const sleeve = (S, E, H, col) => {
    const dx = H[0] - E[0], dy = H[1] - E[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, cuff = [H[0] - ux * 5, H[1] - uy * 5];
    const sg = ux >= 0 ? 1 : -1, nx = -uy * sg, ny = ux * sg, Rr = 10;
    const lo = [cuff[0] + nx * Rr, cuff[1] + ny * Rr], hi = [cuff[0] - nx * Rr, cuff[1] - ny * Rr];
    limb(ctx, f, [S, E], 8, 7.5, col, { w: 1.6, depth: 1.6 });
    blob(ctx, f, [[E[0] - nx * 7, E[1] - ny * 7], hi, ...ragged(lo, [lo[0] - ux * 6, lo[1] + 24], 2, 5).map(([px, py]) => [px, py]), [E[0] + nx * 7 + ux * L * .3, E[1] + ny * 7 + uy * L * .3 + 10], [E[0] + nx * 7, E[1] + ny * 7]], col, { w: 1.6, depth: 1.8, speck: .6 });
    disc(ctx, f, E[0], E[1], 7, 7, col, { w: 0, depth: 0, speck: 0 });
    limb(ctx, f, [hi, lo], 2.4, 2.4, C.bronzeDark, { w: 1, depth: .3 });
  };
  const clawHand = (H, E) => {
    const dx = H[0] - E[0], dy = H[1] - E[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    disc(ctx, f, H[0] + ux * 2, H[1] + uy * 2, 5, 4.4, C.iron, { w: 1.3, depth: .5, speck: 0 });
    for (const d of [-.9, -.35, .2, .75]) {
      const a = Math.atan2(uy, ux) + d - .3, b0 = [H[0] + ux * 5, H[1] + uy * 5], k1 = [b0[0] + Math.cos(a) * 6, b0[1] + Math.sin(a) * 6];
      limb(ctx, f, [b0, k1, [k1[0] + Math.cos(a + .7) * 4, k1[1] + Math.sin(a + .7) * 4]], 1.6, .8, C.iron, { w: 1, depth: .2 });
    }
  };
  parts.push({ id: 'openArm', d: R ? 9 : -4, draw: () => {
    // The right arm, the clawed hand open: far (behind the body) facing left, near facing right.
    const S = U(R ? SH_BACK : SH_FRONT), H = U(P.palm), E = elbow(S, H);
    sleeve(S, E, H, R ? C.robeLight : C.robe); clawHand(H, E);
  } });
  parts.push({ id: 'robe', d: 0, draw: () => {
    // Layered robes down to the ground, their hems torn.
    blob(ctx, f, [[16, -146], [26, -100], [36, -40], ...ragged([40, -6], [-34, -4], 6, 8).map(([px, py]) => [px, py]), [-30, -50], [-24, -110], [-14, -148]].map(U), C.robe, { w: 2.2, depth: 2.6, speck: 1 });
    blob(ctx, f, [[-24, -100], [-30, -50], [-34, -10], [-20, -10], [-16, -60]].map(U), C.purple, { w: 0, depth: .6, speck: .6 });
    for (const pts of [[[24, -90], [32, -30]], [[-18, -96], [-24, -20]]]) line(ctx, f, pts.map(U), .6);
    // The tabard: a dark panel edged in bronze, diamond gems down it.
    blob(ctx, f, [[4, -120], [20, -120], [28, -4], [0, -4]].map(U), C.robeLight, { w: 1.6, depth: 1.2, speck: .5 });
    for (const pts of [[[4, -120], [0, -4]], [[20, -120], [28, -4]]]) limb(ctx, f, pts.map(U), 2, 2.4, C.bronze, { w: 1, depth: .4 });
    for (const [px, py, r] of [[13, -96, 6], [15, -62, 5], [17, -30, 4]]) {
      blob(ctx, f, [[px, py - r * 1.5], [px + r, py], [px, py + r * 1.5], [px - r, py]].map(U), C.bronze, { w: 1, depth: .4, speck: 0 });
      blob(ctx, f, [[px, py - r * .8], [px + r * .5, py], [px, py + r * .8], [px - r * .5, py]].map(U), C.glow, { w: .6, depth: 0, speck: 0 });
    }
    // The belt with a diamond buckle.
    blob(ctx, f, [[-22, -124], [22, -124], [22, -116], [-22, -116]].map(U), C.bronzeDark, { w: 1.3, depth: .6 });
    blob(ctx, f, [[11, -127], [16, -120], [11, -113], [6, -120]].map(U), C.bronze, { w: 1, depth: .3, speck: 0 });
    // The chest above, under the capelet.
    blob(ctx, f, [[-18, -124], [20, -124], [22, -140], [16, -150], [-12, -152], [-20, -138]].map(U), C.robe, { w: 2, depth: 2, speck: .8 });
  } });
  parts.push({ id: 'capelet', d: 2, draw: () => {
    // A tattered capelet over the shoulders, two round bronze medallions and a chain hanging between them.
    blob(ctx, f, [[-30, -150], [-22, -162], [0, -160], [20, -162], [30, -150], ...ragged([30, -146], [-30, -142], 4, 9).slice(1)].map(U), C.purple, { w: 1.8, depth: 1.6, speck: .8 });
    blob(ctx, f, [[-26, -156], [-16, -160], [0, -158], [18, -160], [24, -154], [0, -150]].map(U), C.purpleLight, { w: 0, depth: .4, speck: .4 });
    const m1 = U([-8, -146]), m2 = U([20, -146]);
    for (let i = 1; i < 7; i++) { const u = i / 7, cx = m1[0] + (m2[0] - m1[0]) * u, cy = m1[1] + (m2[1] - m1[1]) * u + Math.sin(Math.PI * u) * 9; disc(ctx, f, cx, cy, 1.5, 1.2, C.bronze, { w: .6, depth: 0, speck: 0 }); }
    const mc = U([6, -134]); blob(ctx, f, [[mc[0], mc[1] - 4], [mc[0] + 3, mc[1]], [mc[0], mc[1] + 5], [mc[0] - 3, mc[1]]], C.glow, { w: .8, depth: 0, speck: 0 });
    for (const m of [m1, m2]) { disc(ctx, f, m[0], m[1], 4.6, 4.6, C.bronze, { w: 1.1, depth: .4, speck: 0 }); disc(ctx, f, m[0], m[1], 2.2, 2.2, C.glow, { w: .5, depth: 0, speck: 0 }); }
  } });
  parts.push({ id: 'head', d: 4, draw: () => {
    // The deep hood, the void inside, one huge eye with a slit pupil.
    blob(ctx, f, [[-16, -150], [-20, -168], [-14, -182], [2, -186], [18, -184], [28, -172], [30, -156], [22, -148], [0, -146]].map(U), C.hood, { w: 2, depth: 2, speck: .8 });
    blob(ctx, f, [[4, -152], [2, -166], [8, -178], [20, -180], [28, -170], [28, -156], [20, -150]].map(U), C.void, { w: 1.2, depth: 0, speck: 0 });
    const e = U([17, -166]);
    ctx.save(); ctx.globalAlpha = .3 + .2 * P.glow; disc(ctx, f, e[0], e[1], 12, 10, C.glow, { w: 0, depth: 0, speck: 0 }); ctx.restore();
    if (P.blink) line(ctx, f, [[e[0] - 7, e[1]], [e[0] + 7, e[1]]], 1.2);
    else {
      blob(ctx, f, [[e[0] - 8, e[1]], [e[0] - 3, e[1] - 5], [e[0] + 3, e[1] - 5], [e[0] + 8, e[1]], [e[0] + 3, e[1] + 5], [e[0] - 3, e[1] + 5]], C.glow, { w: 1, depth: 0, speck: 0, amp: .04 });
      blob(ctx, f, [[e[0], e[1] - 4.4], [e[0] + 1.3, e[1]], [e[0], e[1] + 4.4], [e[0] - 1.3, e[1]]], C.void, { w: 0, depth: 0, speck: 0, amp: .03 });
    }
    line(ctx, f, [[-12, -160], [-6, -176], [4, -182]].map(U), .6);
    // The tall crown worn on the hood: dark bronze spikes rising from a bronze band across the hood's top, green gems.
    const base = -180;
    for (const [cx, h, w] of [[-6, 26, 4.4], [2, 36, 5], [11, 48, 5.6], [20, 36, 5], [28, 26, 4.4]]) {
      blob(ctx, f, [[cx - w, base], [cx - w * .5, base - h * .55], [cx - w * .25, base - h * .7], [cx, base - h], [cx + w * .25, base - h * .7], [cx + w * .5, base - h * .55], [cx + w, base]].map(U), C.iron, { w: 1.4, depth: .8, light: .25, speck: .4, amp: .05 });
      line(ctx, f, [[cx, base - 3], [cx, base - h + 6]].map(U), .5);
    }
    blob(ctx, f, [[-16, base + 3], [30, base + 1], [30, base - 8], [-16, base - 6]].map(U), C.bronze, { w: 1.4, depth: .6, speck: .4 });
    for (const gx of [0, 11, 22]) { const g = U([gx, base - 2.5]); blob(ctx, f, [[g[0], g[1] - 3.6], [g[0] + 2.4, g[1]], [g[0], g[1] + 3.6], [g[0] - 2.4, g[1]]], C.glow, { w: .7, depth: 0, speck: 0 }); }
  } });
  parts.push({ id: 'staff', d: R ? -6 : 6, draw: () => {
    // The dark staff with bronze bands; its spiked bronze head cages the glowing eye-orb; ragged ribbons hang.
    const [hx, hy] = U(P.staff), a = P.staff[2], ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    const at = (s2, w = 0) => [hx + ux * s2 + nx * w, hy + uy * s2 + ny * w];
    limb(ctx, f, [at(-STAFF_DOWN), at(STAFF_UP - 18)], 2.8, 2.6, C.iron, { w: 1.4, depth: .5 });
    for (const s2 of [-60, 20, 70]) blob(ctx, f, [at(s2 - 2, -3.6), at(s2 + 2, -3.6), at(s2 + 2, 3.6), at(s2 - 2, 3.6)], C.bronze, { w: .9, depth: .2, speck: 0 });
    blob(ctx, f, [at(-STAFF_DOWN - 8), at(-STAFF_DOWN + 2, 3.6), at(-STAFF_DOWN + 2, -3.6)], C.bronze, { w: 1, depth: .2, speck: 0 });
    for (const [w, l] of [[-1, 30], [1, 26]]) blob(ctx, f, [at(STAFF_UP - 30, w * 2), at(STAFF_UP - 30 + l * .55, w * (6 + l * .1)), at(STAFF_UP - 30 + l, w * 2.4), at(STAFF_UP - 30 + l * .4, w * 3)], C.cloakIn, { w: 1, depth: .4, speck: .4 });
    const c = at(STAFF_UP), g = P.glow;
    for (const w of [-1, 1]) blob(ctx, f, [at(STAFF_UP - 18, w * 3), at(STAFF_UP - 10, w * 15), at(STAFF_UP + 10, w * 15), at(STAFF_UP + 22, w * 9), at(STAFF_UP + 12, w * 11), at(STAFF_UP - 4, w * 10), at(STAFF_UP - 12, w * 2)], C.bronze, { w: 1.3, depth: .5, speck: .2, amp: .05 });
    blob(ctx, f, [at(STAFF_UP + 8, -3), at(STAFF_UP + 30, 0), at(STAFF_UP + 8, 3)], C.bronze, { w: 1.2, depth: .4, speck: 0 });
    ctx.save(); ctx.globalAlpha = .25 + .3 * g; disc(ctx, f, c[0], c[1], 14 + g * 6, 14 + g * 6, C.glowPale, { w: 0, depth: 0, speck: 0 }); ctx.restore();
    disc(ctx, f, c[0], c[1], 9, 9, C.glow, { w: 1.3, depth: .2, speck: 0 });
    blob(ctx, f, [[c[0], c[1] - 7], [c[0] + 1.8, c[1]], [c[0], c[1] + 7], [c[0] - 1.8, c[1]]], C.void, { w: 0, depth: 0, speck: 0, amp: .03 });
  } });
  parts.push({ id: 'staffArm', d: R ? -5 : 8, draw: () => {
    const S = U(R ? SH_FRONT : SH_BACK), H = U(P.staff), E = elbow(S, H);
    sleeve(S, E, H, R ? C.robe : C.robeLight);
    disc(ctx, f, H[0], H[1], 5, 4.6, C.iron, { w: 1.4, depth: .5, speck: 0 });
  } });
  parts.push({ id: 'magic', d: 12, draw: () => {
    const [hx, hy] = U(P.staff), a = P.staff[2], c = [hx + Math.cos(a) * STAFF_UP, hy + Math.sin(a) * STAFF_UP];
    if (P.eclipse >= 0) {
      // Eclipse: a dark disc swelling over the orb inside a pulsing green corona (it cycles with the loop).
      const u = P.eclipse, k = .5 + .5 * Math.sin(TAU * u), e = [c[0], c[1] - 34];
      ctx.save(); ctx.globalAlpha = .55 + .3 * k; disc(ctx, f, e[0], e[1], 20 + k * 4, 20 + k * 4, C.glow, { w: 0, depth: 0, speck: 0 }); ctx.restore();
      disc(ctx, f, e[0], e[1], 16, 16, C.void, { w: 1.3, depth: 0, speck: 0 });
      for (let i = 0; i < 6; i++) { const b = TAU * (u + i / 6), r = 30 - ((u * 2 + i / 6) % 1) * 12; disc(ctx, f, e[0] + Math.cos(b) * r, e[1] + Math.sin(b) * r, 1.6, 1.6, C.glow, { w: .5, depth: 0, speck: 0 }); }
    }
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-hollow-sovereign', fallTilt(action, t), { pivot: 60, toe: 60, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-hollow-sovereign', label: 'The Hollow Sovereign — EMBERBOUND', kind: 'creature', directional: true, draw: drawSovereign,
  actions: { idle: { period: IDLE_T, frames: 16 },
    attack: { period: SOVEREIGN_ATTACK_T, keys: [0, .06, .12, .2, .3, .45, .6, .8], once: true, releaseAt: .12 },
    cast: { period: SOVEREIGN_ECLIPSE_T, frames: 8 },
    hurt: hurtAction },
  frameBox: { x0: -220, x1: 220, y0: -350, y1: 14 },
  emberbound: { gameId: 'hollow_sovereign', heightPx: 70, facing: 'L' },
});
export const studio = Object.freeze({ order: 35, name: 'The Hollow Sovereign（虚ろの君主）', category: 'EMBERBOUND 第5エリア',
  description: '第5エリアのボス。高い冠、裂けた黒紫のマント、フードの奥の巨大な黄緑の眼、眼の玉を抱く長い杖。Eclipse とランタン吸収を使う。',
  preview: { direction: 'L', phase: 0 } });
