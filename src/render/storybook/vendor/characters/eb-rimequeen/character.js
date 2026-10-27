/**
 * EMBERBOUND EXPEDITION — Rimequeen Isveil (game id `rimequeen`, area 4 boss), after the user's reference image:
 * a tall queen with a small head — long wavy silver-lavender hair, pointed ears, a pale oval face with dark stern
 * eyes, a tall crown of ice spikes — in a deep blue gown that flares wide to the ground, opening over a pale blue
 * panel patterned with ice diamonds, trimmed with white fur; a fitted bodice with a snowflake brooch and a fur
 * collar, wide bell sleeves hung with ice drops, an open hand reaching forward, and a silver staff crowned with a
 * great snowflake.
 * Drawn by hand in a right-facing local frame (like the other non-rig bodies), so the boss can have a long body and
 * a small head. She holds the staff in her left hand and opens her right whichever way she faces, so the arms swap
 * depth with the facing (see HANDS); elbows always bend down and back.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): `attack` is the ice spear (the staff swung forward, light bursting from
 * the snowflake at u = .12), `cast` = the Frozen Tomb / Absolute Zero wind-up the game loops (staff raised, palm
 * out, the snowflake glowing, snow circling), and the shared hurt. She does not walk.
 */
import { TAU, PAL, keyframes } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, tufted, drawCreature } from '../shared/emberbound/creature.js';

const C = {
  gown: '#3f6596', gownDark: '#2d4c78', panel: '#a9cbe6', panelDark: '#7ea8cf', fur: '#f3f1ec', furShade: '#d3d8de',
  hair: '#e9e4f1', hairShade: '#c4bad9', skin: '#e9eef3', silver: '#dde4ec', silverDark: '#97a3b3',
  ice: '#cde8f5', iceDark: '#8dbbdb', glow: '#dff6ff', eye: '#262d3b', ink: PAL.ink,
};
const IDLE_T = 3.4;
export const QUEEN_ATTACK_T = .3;   // ice spear: the staff points ahead and the light bursts at u = .12
export const QUEEN_WINDUP_T = .6;   // Frozen Tomb / Absolute Zero wind-up: a loop
const SH_FRONT = [12, -146], SH_BACK = [-10, -146], ARM = 22;   // shoulders, upper arm = forearm length
// The staff is always in her left hand and the open hand is her right, whichever way she faces. Facing left (the
// reference and the game) her left side is toward us, so the staff arm is the near arm and holds it at her back;
// facing right it is the far arm, so she holds the staff out in front, behind the body, and the open right hand is
// the near arm — the same hands as the shared rig keeps (docs/SIDE_VIEW_GUIDE.md, 左右反転しない).
// Staff: [hand x, y, angle] (angle −π/2 = straight up, toward 0 = leaning forward); palm: [x, y].
const HANDS = {
  L: { staff: [-22, -108, -1.6], palm: [44, -142], spear: [-34, -160, -1.0], spearPalm: [48, -148], castStaff: [-14, -146, -1.72], castPalm: [46, -158] },
  R: { staff: [30, -110, -1.48], palm: [6, -118], spear: [40, -128, -.95], spearPalm: [8, -122], castStaff: [30, -150, -1.5], castPalm: [-24, -160] },
};
const STAFF_UP = 112, STAFF_DOWN = 100;   // staff length above and below the hand

export function queenPose(action, t, direction = 'L') {
  const s = Math.sin(TAU * phase(t, IDLE_T)), Q = HANDS[direction === 'R' ? 'R' : 'L'];
  const P = { sway: s * 1.2, staff: Q.staff.slice(), palm: Q.palm.slice(), glow: .35 + .12 * Math.sin(t * 2.6), burst: -1, snow: -1, lean: 0, blink: false };
  if (action === 'attack') {
    // Ice spear: the staff turned to point ahead, light bursting from the snowflake, then back. Facing left it is
    // raised over and past the crown (it never crosses the face); facing right it is already in front.
    const u = phase(t, QUEEN_ATTACK_T), hold = [Q.spear[0], Q.spear[1] + 2, Q.spear[2] - .04];
    P.staff = keyframes([[0, Q.staff], [.12, Q.spear], [.45, hold], [1, Q.staff]], u);
    P.palm = keyframes([[0, Q.palm], [.12, Q.spearPalm], [.45, Q.spearPalm], [1, Q.palm]], u);
    P.lean = sample([[0, [0]], [.12, [4]], [.45, [3.5]], [1, [0]]], u);
    P.glow = sample([[0, [.3]], [.1, [1]], [.3, [.6]], [.6, [.2]], [1, [.3]]], u);
    P.burst = u >= .1 && u < .6 ? (u - .1) / .5 : -1;
  } else if (action === 'cast') {
    // The wind-up: the staff raised high beside her, the palm out, the snowflake pulsing; periodic in u.
    const u = phase(t, QUEEN_WINDUP_T), w = Math.sin(TAU * u);
    P.staff = [Q.castStaff[0], Q.castStaff[1] + w * .6, Q.castStaff[2]]; P.palm = [Q.castPalm[0], Q.castPalm[1] + w * .6]; P.lean = -2; P.glow = .8 + .2 * w; P.snow = u; P.sway = w;
  } else if (action === 'hurt') {
    P.blink = t < .2;
  }
  return P;
}

/** Two-bone reach from shoulder S to hand H. Of the two possible elbows it takes the natural one, lower and further
 *  back: an elbow never bends forward or up. */
function elbow(S, H) {
  const dx = H[0] - S[0], dy = H[1] - S[1], L = Math.hypot(dx, dy) || 1, d = Math.min(L, ARM * 2 - .01);
  const h = Math.sqrt(Math.max(0, ARM * ARM - (d / 2) ** 2)), m = [S[0] + dx / 2, S[1] + dy / 2];
  const a = [m[0] - dy / L * h, m[1] + dx / L * h], b = [m[0] + dy / L * h, m[1] - dx / L * h];
  return a[1] - a[0] * .5 >= b[1] - b[0] * .5 ? a : b;
}
/** A small crystal drop hanging from (x, y). */
const drop = (ctx, f, x, y, l = 7) => blob(ctx, f, [[x, y], [x + 2, y + l * .45], [x, y + l], [x - 2, y + l * .45]], C.ice, { w: .9, depth: .2, speck: 0, amp: .05 });

export function drawQueen(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = queenPose(action, t, direction), f = face(direction), sw = P.sway, R = direction === 'R';
  // Upper points lean with the gesture, in proportion to their height above the hem.
  const U = ([px, py]) => [px + P.lean * Math.max(0, -py - 60) / 140, py];
  const parts = [];
  parts.push({ id: 'hairBack', d: -8, draw: () => {
    // Long wavy hair falling down her back.
    const hair = [[4, -190], [-10, -192], [-22, -184], [-30, -168], [-32, -150], [-38, -136], [-34, -122], [-42, -108], [-36, -94], [-44 + sw, -80], [-36 + sw, -70],
      [-28 + sw, -78], [-22, -92], [-18, -108], [-12, -126], [-6, -150], [-2, -172]];
    blob(ctx, f, hair.map(U), C.hair, { w: 1.8, depth: 2.2, light: .25, speck: 1 });
    for (const pts of [[[-20, -178], [-28, -156], [-32, -132], [-38, -110], [-40 + sw, -86]], [[-10, -180], [-14, -156], [-18, -130], [-24, -104]]]) line(ctx, f, pts.map(U), .6);
    blob(ctx, f, [[-28, -150], [-34, -130], [-38, -112], [-30, -118], [-24, -138]].map(U), C.hairShade, { w: 0, depth: 0, speck: .4 });
  } });
  // A wide bell sleeve from shoulder S through the elbow to the wrist, hanging low below the forearm.
  const sleeve = (S, E, H, col) => {
    const dx = H[0] - E[0], dy = H[1] - E[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, cuff = [H[0] - ux * 5, H[1] - uy * 5];
    // The lower edge of the forearm (perpendicular toward +y): the bell drapes down from it.
    const sg = ux >= 0 ? 1 : -1, nx = -uy * sg, ny = ux * sg, R = 10;
    const lo = [cuff[0] + nx * R, cuff[1] + ny * R], hi = [cuff[0] - nx * R, cuff[1] - ny * R], tip = [lo[0] - ux * 4, lo[1] + 18];
    limb(ctx, f, [S, E], 7, 6.5, col, { w: 1.6, depth: 1.6 });
    blob(ctx, f, [[E[0] - nx * 6, E[1] - ny * 6], hi, lo, tip, [E[0] + nx * 6 + ux * L * .3, E[1] + ny * 6 + uy * L * .3 + 8], [E[0] + nx * 6, E[1] + ny * 6]], col, { w: 1.6, depth: 1.8, speck: .6 });
    disc(ctx, f, E[0], E[1], 6.4, 6.4, col, { w: 0, depth: 0, speck: 0 });
    limb(ctx, f, [hi, lo, tip], 2.6, 2.6, C.fur, { w: 1.1, depth: .4 });
    drop(ctx, f, tip[0], tip[1] + 1, 7); drop(ctx, f, (lo[0] + tip[0]) / 2 - 3, (lo[1] + tip[1]) / 2 + 2, 5);
  };
  parts.push({ id: 'gown', d: 0, draw: () => {
    // The gown flares from the waist to a wide hem that trails behind; fur along its hem and front opening.
    const hem = [[60, -2], [36, 1], [10, 2], [-20, 1], [-48, 0], [-74 + sw, -1]];
    blob(ctx, f, [[14, -112], [24, -76], [42, -34], [60, -4], ...hem, [-62 + sw, -24], [-40, -60], [-22, -94], [-16, -112]].map(U), C.gown, { w: 2.2, depth: 3, light: .2, speck: 1.2 });
    blob(ctx, f, [[-22, -94], [-40, -60], [-62 + sw, -24], [-74 + sw, -1], [-48, 0], [-34, -34]].map(U), C.gownDark, { w: 0, depth: .6, speck: .6 });
    // The pale panel in front, with ice diamonds, between fur edges.
    blob(ctx, f, [[8, -110], [16, -110], [46, -2], [4, -2]].map(U), C.panel, { w: 1.4, depth: 1, speck: .5 });
    for (const [px, py] of [[16, -84], [22, -58], [26, -30]]) blob(ctx, f, [[px, py - 6], [px + 3.4, py], [px, py + 6], [px - 3.4, py]].map(U), C.panelDark, { w: .7, depth: 0, speck: 0 });
    for (const pts of [[[8, -110], [4, -2]], [[16, -110], [46, -2]]]) limb(ctx, f, pts.map(U), 3.4, 4.2, C.fur, { w: 1.1, depth: .5 });
    blob(ctx, f, tufted([...hem.map(([px, py]) => [px, py + 1]), ...hem.slice().reverse().map(([px, py]) => [px * .98, py - 7])].map(U), 6, 1.8), C.fur, { w: 1.3, depth: .8, speck: .5 });
    for (const pts of [[[28, -70], [40, -30]], [[-28, -70], [-46, -20]], [[-8, -80], [-14, -10]]]) line(ctx, f, pts.map(U), .6);
    // The fitted bodice with a silver girdle and a hanging ice drop, the snowflake brooch.
    blob(ctx, f, [[-17, -112], [16, -112], [18, -130], [14, -150], [-12, -152], [-19, -132]].map(U), C.gown, { w: 2, depth: 2, speck: .8 });
    blob(ctx, f, [[-17, -116], [16, -116], [16, -110], [-17, -110]].map(U), C.silver, { w: 1.2, depth: .5 });
    const g = U([10, -112]); drop(ctx, f, g[0], g[1], 10);
    const br = U([9, -138]);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; line(ctx, f, [[br[0] - Math.cos(a) * 4.4, br[1] - Math.sin(a) * 4.4], [br[0] + Math.cos(a) * 4.4, br[1] + Math.sin(a) * 4.4]], 1); }
    disc(ctx, f, br[0], br[1], 1.8, 1.8, C.ice, { w: .5, depth: 0, speck: 0 });
  } });
  parts.push({ id: 'collar', d: 2, draw: () => {
    blob(ctx, f, tufted([[-24, -146], [-16, -158], [0, -156], [14, -158], [24, -146], [14, -140], [0, -142], [-14, -140]].map(U), 5, 2.4), C.fur, { w: 1.6, depth: 1.2, speck: .5 });
    limb(ctx, f, [U([2, -154]), U([6, -160])], 4.2, 4, C.skin, { w: 1.4, depth: .6 });
  } });
  parts.push({ id: 'head', d: 4, draw: () => {
    // Crown spikes (behind the hair top), the hair mass, the oval face with a softly pointed chin, a pointed ear.
    for (const [cx, h, w] of [[-4, 12, 3.4], [2, 17, 3.8], [9, 24, 4.4], [16, 17, 3.8], [22, 12, 3.4]])
      blob(ctx, f, [[cx - w, -184], [cx - w * .4, -184 - h * .7], [cx, -184 - h], [cx + w * .4, -184 - h * .7], [cx + w, -184]].map(U), C.ice, { w: 1.3, depth: .8, light: .35, speck: .2, amp: .06 });
    blob(ctx, f, [[-8, -176], [-4, -188], [8, -192], [20, -186], [24, -174], [22, -160], [18, -158], [16, -170], [6, -178], [-2, -170], [-6, -160]].map(U), C.hair, { w: 1.7, depth: 1.4 });
    blob(ctx, f, [[-2, -176], [3, -184], [12, -186], [20, -180], [22, -170], [20, -160], [14, -152], [8, -149], [2, -153], [-1, -162]].map(U), C.skin, { w: 1.7, depth: 1.1, speck: 0 });
    blob(ctx, f, [[-1, -168], [-14, -174], [-8, -164], [-1, -162]].map(U), C.skin, { w: 1.1, depth: .5, speck: 0 });
    // Bangs sweeping over the brow; a lock falling behind the cheek.
    blob(ctx, f, [[-4, -180], [2, -188], [14, -190], [22, -182], [23, -174], [18, -178], [12, -182], [6, -176], [0, -178]].map(U), C.hair, { w: 1.3, depth: 1 });
    blob(ctx, f, [[-4, -176], [-8, -160], [-6, -140], [-2, -150], [-1, -166]].map(U), C.hair, { w: 1.2, depth: .8 });
    // Dark, stern almond eyes under slanted brows, a small flat mouth.
    for (const [ex, ey] of [[9, -168], [17, -167]]) {
      const [qx, qy] = U([ex, ey]);
      if (P.blink) { line(ctx, f, [[qx - 2.4, qy], [qx + 2.4, qy]], .9); continue; }
      blob(ctx, f, [[qx - 2.6, qy + .6], [qx - 1, qy - 2.6], [qx + 2.4, qy - 1.6], [qx + 2, qy + 2.4], [qx - .8, qy + 2.8]], C.eye, { w: .5, depth: 0, speck: 0, amp: .05 });
      disc(ctx, f, qx + .4, qy - 1, .7, .9, '#ffffff', { w: 0, depth: 0, speck: 0 });
    }
    line(ctx, f, [U([5, -173]), U([11, -172])], .8); line(ctx, f, [U([15, -172]), U([20, -173])], .8);
    line(ctx, f, [U([12, -158]), U([15, -158])], .65);
    // The crown band with a central ice gem and two drops.
    blob(ctx, f, [[-6, -186], [24, -186], [24, -182], [-6, -182]].map(U), C.silver, { w: 1.1, depth: .5 });
    const gm = U([9, -184]); blob(ctx, f, [[gm[0], gm[1] - 3], [gm[0] + 2.2, gm[1]], [gm[0], gm[1] + 3], [gm[0] - 2.2, gm[1]]], C.ice, { w: .7, depth: 0, speck: 0 });
    for (const ex of [-5, 23]) { const [qx, qy] = U([ex, -182]); drop(ctx, f, qx, qy, 6); }
  } });
  parts.push({ id: 'staff', d: R ? -6 : 6, draw: () => {
    // The silver staff in the left hand, wound with an ice ribbon, crowned with a great snowflake: in front of the
    // body facing left, behind it facing right.
    const [hx, hy] = U(P.staff), a = P.staff[2], ux = Math.cos(a), uy = Math.sin(a);
    const at = s => [hx + ux * s, hy + uy * s], top = at(STAFF_UP), bot = at(-STAFF_DOWN);
    limb(ctx, f, [bot, top], 2.6, 2.4, C.silver, { w: 1.4, depth: .4 });
    for (let s2 = -90; s2 < 100; s2 += 12) line(ctx, f, [at(s2), [at(s2 + 6)[0] + 2, at(s2 + 6)[1]]], .7);
    blob(ctx, f, [[bot[0] - 2.4, bot[1]], [bot[0] - ux * 7, bot[1] - uy * 7], [bot[0] + 2.4, bot[1]]], C.ice, { w: .9, depth: 0, speck: 0 });
    const c = at(STAFF_UP - 2), g = P.glow;
    if (g > 0) { ctx.save(); ctx.globalAlpha = g * .35; disc(ctx, f, c[0], c[1], 16 + g * 6, 16 + g * 6, C.glow, { w: 0, depth: 0, speck: 0 }); ctx.restore(); }
    for (let i = 0; i < 6; i++) {
      const b = a + i * TAU / 6, vx = Math.cos(b), vy = Math.sin(b), px = -vy, py = vx, R = 16;
      const Q = (s2, w) => [c[0] + vx * s2 + px * w, c[1] + vy * s2 + py * w];
      blob(ctx, f, [Q(2, -2.4), Q(R - 4, -2.8), Q(R + 3, 0), Q(R - 4, 2.8), Q(2, 2.4)], C.ice, { w: 1.2, depth: .4, light: .3, speck: 0, amp: .05 });
      for (const sg of [-1, 1]) blob(ctx, f, [Q(R * .5, sg * 2), Q(R * .7, sg * 6.4), Q(R * .78, sg * 2)], C.ice, { w: .9, depth: 0, speck: 0, amp: .04 });
    }
    disc(ctx, f, c[0], c[1], 4.6, 4.6, C.silver, { w: 1.1, depth: .4, speck: 0 });
    disc(ctx, f, c[0], c[1], 2.4, 2.4, C.iceDark, { w: 0, depth: 0, speck: 0 });
  } });
  parts.push({ id: 'staffArm', d: R ? -5 : 8, draw: () => {
    // The left arm holds the staff: the near arm facing left, the far arm facing right.
    const S = U(R ? SH_FRONT : SH_BACK), H = U(P.staff), E = elbow(S, H);
    sleeve(S, E, H, R ? C.gownDark : C.gown);
    disc(ctx, f, H[0], H[1], 4.6, 4.2, C.skin, { w: 1.4, depth: .5, speck: 0 });
  } });
  parts.push({ id: 'openArm', d: R ? 9 : -4, draw: () => {
    // The right arm, palm open: facing left it is the far arm (behind the body) reaching forward; facing right it is
    // the near arm, resting in front of the waist.
    const S = U(R ? SH_BACK : SH_FRONT), H = U(P.palm), E = elbow(S, H);
    sleeve(S, E, H, R ? C.gown : C.gownDark);
    const dx = H[0] - E[0], dy = H[1] - E[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    disc(ctx, f, H[0] + ux * 2, H[1] + uy * 2, 4.4, 3.8, C.skin, { w: 1.3, depth: .5, speck: 0 });
    for (const d of [-.8, -.3, .2, .7]) { const a = Math.atan2(uy, ux) + d - .3; limb(ctx, f, [[H[0] + ux * 4, H[1] + uy * 4], [H[0] + ux * 4 + Math.cos(a) * 7, H[1] + uy * 4 + Math.sin(a) * 7]], 1.4, 1, C.skin, { w: 1, depth: .2 }); }
  } });
  parts.push({ id: 'magic', d: 12, draw: () => {
    const [hx, hy] = U(P.staff), a = P.staff[2], c = [hx + Math.cos(a) * (STAFF_UP - 2), hy + Math.sin(a) * (STAFF_UP - 2)];
    if (P.burst >= 0) {
      // Light bursting from the snowflake as the ice spear is cast.
      const u = P.burst, r = 10 + u * 18;
      ctx.save(); ctx.globalAlpha = (1 - u) * .85;
      disc(ctx, f, c[0], c[1], r, r, C.glow, { w: .9, depth: 0, speck: 0 });
      for (let i = 0; i < 8; i++) { const b = i / 8 * TAU + .2; line(ctx, f, [[c[0] + Math.cos(b) * (r + 2), c[1] + Math.sin(b) * (r + 2)], [c[0] + Math.cos(b) * (r + (i % 2 ? 6 : 10)), c[1] + Math.sin(b) * (r + (i % 2 ? 6 : 10))]], .8); }
      ctx.restore();
    }
    if (P.snow >= 0) {
      // Snow circling her as the spell gathers (positions cycle with the loop).
      for (let i = 0; i < 8; i++) {
        const u = (P.snow + i / 8) % 1, b = TAU * u + i, r = 56 + (i % 3) * 12, fx = Math.cos(b) * r - 6, fy = -110 + Math.sin(b) * r * .4 - u * 24;
        ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * u);
        for (let k = 0; k < 3; k++) { const e = k * Math.PI / 3; line(ctx, f, [[fx - Math.cos(e) * 4.5, fy - Math.sin(e) * 4.5], [fx + Math.cos(e) * 4.5, fy + Math.sin(e) * 4.5]], .7); }
        disc(ctx, f, fx, fy, 1.4, 1.4, '#ffffff', { w: 0, depth: 0, speck: 0 });
        ctx.restore();
      }
    }
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-rimequeen', fallTilt(action, t), { pivot: 60, toe: 60, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-rimequeen', label: 'Rimequeen Isveil — EMBERBOUND', kind: 'creature', directional: true, draw: drawQueen,
  actions: { idle: { period: IDLE_T, frames: 16 },
    attack: { period: QUEEN_ATTACK_T, keys: [0, .06, .12, .2, .3, .45, .6, .8], once: true, releaseAt: .12 },
    cast: { period: QUEEN_WINDUP_T, frames: 8 },
    hurt: hurtAction },
  frameBox: { x0: -200, x1: 200, y0: -290, y1: 14 },
  emberbound: { gameId: 'rimequeen', heightPx: 68, facing: 'L' },
});
export const studio = Object.freeze({ order: 29, name: 'Rimequeen Isveil（霧氷の女王イスヴェイル）', category: 'EMBERBOUND 第4エリア',
  description: '第4エリアのボス。白銀の長い髪、氷の冠、裾の広がった青いドレス、雪の結晶の杖。Frozen Tomb と Absolute Zero を使う。',
  preview: { direction: 'L', phase: 0 } });
