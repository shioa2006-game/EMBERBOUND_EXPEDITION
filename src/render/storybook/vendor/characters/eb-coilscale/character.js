/**
 * EMBERBOUND EXPEDITION — Coilscale Matriarch (game id `coilscale`, area 2 boss), a new serpent queen after the
 * user's reference image: a pale sea-green woman with long dark teal hair, pink finned ears and a gold crown
 * with a red gem, a deep blue dress with gold trim, a gold scale peplum, draped sleeves and gold bracelets with
 * red drops; below the waist a long blue-scaled serpent body with a cream belly, coiled on the ground, and a
 * golden trident with a red gem. Shares the tail and arm parts with the Siren (shared/emberbound/merfolk.js).
 *
 * The serpent body is one continuous spiral, drawn in pieces so each turn overlaps the right way: from the
 * tail tip behind, the big lower turn passes behind the body and comes round in front along the ground, climbs
 * at the back into a smaller upper turn resting on it, comes round in front once more and rises into the
 * waist. She holds the trident in her left hand and throws with her right whichever way she faces, so the arms swap
 * depth with the facing (see HANDS): facing left the trident is in the near hand, in front of the head and hair.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (swaying), attack (a short push of the open hand that throws a
 * venom bolt, released at u = .15 — her poison attack on the back row), `cast` = the Crashing Wave wind-up the
 * game loops (trident raised, the body risen, water swirling), and the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, drawCreature } from '../shared/emberbound/creature.js';
import { tube, arm, eyes } from '../shared/emberbound/merfolk.js';

const C = { skin:'#a3c9c4', skinDark:'#84aca8', hair:'#2f5a66', hairDark:'#22434d', fin:'#e08a85', dress:'#3c6a8f', dressDark:'#2c4f6d',
  gold:'#d3ab55', goldDark:'#a07c34', gem:'#d6524c', scale:'#6f9fb7', scaleDark:'#55809a', belly:'#efe5c8',
  venom:'#8fc66a', venomDark:'#557f3c', water:'#86cfe0', waterLight:'#dcf4f6', ink:PAL.ink };
const IDLE_T = 3;
export const COIL_ATTACK_T = .3;   // the venom bolt leaves the hand at u = .15
export const COIL_WINDUP_T = .6;   // Crashing Wave wind-up: a loop
const LOW = { cy: -50, rx: 92, ry: 22, w: 54 }, HIGH = { cy: -82, rx: 68, ry: 15, w: 46 };   // the two turns of the coil
const SH_FRONT = [8, -160], SH_BACK = [-8, -160], ARM = 20;   // shoulders (body units), upper arm = forearm length
// The trident is always in her left hand and the open hand is her right. Facing left (the reference and the game)
// her left side is toward us: the trident arm is the near arm and holds it at her back, the open hand reaches
// forward behind the body. Facing right the trident arm is the far arm, holding it out in front behind the body,
// and the open right hand is the near arm — the same hands as the shared rig keeps (docs/SIDE_VIEW_GUIDE.md).
// Trident: [hand x, y] and its tilt from upright (+ = top forward); open: [hand x, y].
const HANDS = {
  L: { trident: [-26, -128], tilt: -.04, open: [44, -168], push: [56, -158], castTrident: [-22, -188], castTilt: -.14, castOpen: [46, -178] },
  R: { trident: [28, -130], tilt: .04, open: [-22, -134], push: [30, -156], castTrident: [26, -188], castTilt: .14, castOpen: [-24, -178] },
};

export function coilPose(action, t, direction = 'L') {
  const s = Math.sin(TAU * phase(t, IDLE_T)), Q = HANDS[direction === 'R' ? 'R' : 'L'];
  const P = { lean: s * 2, lift: 0, open: Q.open.slice(), trident: Q.trident.slice(), tilt: Q.tilt, splay: 0, bolt: -1, swirl: -1, tail: s, t };
  if (action === 'attack') {
    const u = phase(t, COIL_ATTACK_T), k = sample([[0, [0]], [.1, [1]], [.45, [1]], [1, [0]]], u);
    P.open = [Q.open[0] + (Q.push[0] - Q.open[0]) * k, Q.open[1] + (Q.push[1] - Q.open[1]) * k]; P.lean = 5 * k;
    P.bolt = u >= .15 && u < .75 ? (u - .15) / .6 : -1;
  } else if (action === 'cast') {
    // Crashing Wave: the trident raised high, the open hand forward, the body risen; periodic in u.
    const u = phase(t, COIL_WINDUP_T), w = Math.sin(TAU * u);
    P.trident = [Q.castTrident[0], Q.castTrident[1] + w]; P.tilt = Q.castTilt; P.open = [Q.castOpen[0], Q.castOpen[1] + w]; P.splay = .25;
    P.lift = 8 + w * 1.5; P.lean = -3 + w; P.swirl = u; P.tail = w;
  }
  return P;
}

/** Two-bone reach from shoulder S to hand H (body units). Of the two possible elbows it takes the natural one, lower
 *  and further back: an elbow never bends forward or up. */
function elbow(S, H) {
  const dx = H[0] - S[0], dy = H[1] - S[1], L = Math.hypot(dx, dy) || 1, d = Math.min(L, ARM * 2 - .01);
  const h = Math.sqrt(Math.max(0, ARM * ARM - (d / 2) ** 2)), m = [S[0] + dx / 2, S[1] + dy / 2];
  const a = [m[0] - dy / L * h, m[1] + dx / L * h], b = [m[0] + dy / L * h, m[1] - dx / L * h];
  return a[1] - a[0] * .5 >= b[1] - b[0] * .5 ? a : b;
}

/** Points on a coil turn (an ellipse lying on the ground) from angle a0 to a1; 0 = front-right, π/2 = nearest. */
const turn = (c, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [Math.cos(a) * c.rx, c.cy + Math.sin(a) * c.ry]; });

export function drawCoilscale(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = coilPose(action, t, direction), f = face(direction), R = direction === 'R';
  // The human body above the waist is drawn S times larger (about the waist), so the queen stands tall over her
  // coils; upper-body points also lean and rise in proportion to their height above the coils.
  const S = 1.5, W0 = -124;
  const U = ([px, py]) => {
    if (py < W0) { px *= S; py = W0 + (py - W0) * S; }
    const k = Math.max(0, Math.min(1, (-py - 60) / 120)); return [px + P.lean * k, py - P.lift * k];
  };
  // The head is drawn K times about the chin (so K·S in all), smaller than the body; KS scales its radii.
  const K = .74, KS = K * S, H = ([px, py]) => U([6 + (px - 6) * K, -174 + (py + 178) * K]);
  // The hair blends from the head's scale at the crown to the body's at the shoulders.
  const HU = p => { const a = H(p), b = U(p), k = Math.max(0, Math.min(1, (p[1] + 190) / 60)); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
  const scales = { fill: C.scale, bellyFill: C.belly, scale: true };
  const parts = [];
  parts.push({ id: 'tail', d: -9, draw: () => {
    // The tail leaves the lower turn at the back and curls up.
    const tw = P.tail * 3;
    tube(ctx, f, [[-84, -44], [-110, -54], [-126, -74], [-124 + tw, -96], [-110 + tw, -106]], [44, 32, 21, 12, 5], { ...scales, bellySide: 1, belly: .4, openEnds: 'start' });
  } });
  parts.push({ id: 'lowBack', d: -8, draw: () => tube(ctx, f, turn(LOW, Math.PI - .15, TAU + .15), Array(11).fill(LOW.w), { fill: C.scaleDark, scale: true, openEnds: 'both' }) });
  parts.push({ id: 'hairBack', d: -7, draw: () => {
    const hair = [[10, -228], [-14, -232], [-34, -218], [-44, -196], [-44, -174], [-52, -158], [-48, -144], [-56, -130], [-48, -116], [-38, -122],
      [-32, -114], [-24, -128], [-16, -138], [-10, -158], [-4, -186], [6, -200]];
    blob(ctx, f, hair.map(HU), C.hair, { w: 2.2, depth: 3.4, light: .25, speck: 1.6 });
    for (const pts of [[[-24, -208], [-34, -188], [-42, -166], [-48, -140]], [[-14, -210], [-20, -186], [-26, -158], [-34, -128]]]) line(ctx, f, pts.map(HU), .7);
  } });
  // Climbing at the back from the lower turn into the upper one, which then passes behind. The climb starts
  // inside the lower turn, so its cut end is hidden under it.
  parts.push({ id: 'highBack', d: -6, draw: () => tube(ctx, f, [[-80, LOW.cy + 14], [-80, -62], ...turn(HIGH, Math.PI, TAU + .15, 9)], [HIGH.w, HIGH.w, ...Array(10).fill(HIGH.w)], { fill: C.scaleDark, scale: true, openEnds: 'both' }) });
  parts.push({ id: 'openArm', d: R ? 10.5 : -3, draw: () => {
    // The right arm, hand open toward the enemy (far facing left, near facing right); a draped sleeve hangs under the
    // upper arm, a bracelet with a drop.
    const sh = R ? SH_BACK : SH_FRONT, s = U(sh), e = U(elbow(sh, P.open)), h = U(P.open);
    blob(ctx, f, [s, [e[0] - 3, e[1] - 3], [e[0] - 1, e[1] + 8], [e[0] - 8, e[1] + 26], [s[0] - 2, s[1] + 22], [s[0] - 6, s[1] + 8]], C.dressDark, { w: 1.6, depth: 1.4, speck: .6 });
    arm(ctx, f, s, e, h, C.skinDark, { r0: 5.4 * S, r1: 4.6 * S, r2: 4 * S, hand: 4.6 * S, splay: P.splay });
    const bx = e[0] + (h[0] - e[0]) * .55, by = e[1] + (h[1] - e[1]) * .55;
    disc(ctx, f, bx, by, 2.6 * S, 4.6 * S, C.gold, { w: 1, depth: .4, speck: 0 });
    disc(ctx, f, bx, by + 7 * S, 1.6 * S, 2.4 * S, C.gem, { w: .6, depth: 0, speck: 0 });
  } });
  // The lower turn coming round in front along the ground.
  parts.push({ id: 'lowFront', d: 2, draw: () => tube(ctx, f, turn(LOW, -.12, Math.PI + .12), Array(11).fill(LOW.w), { ...scales, bellySide: -1, belly: .3, openEnds: 'both' }) });
  // The upper turn coming round in front, resting on the lower one, then rising into the waist (one tube, so
  // there is no seam at the front). The cream belly shows only on the front of the rise.
  parts.push({ id: 'highFront', d: 3, draw: () => {
    const rise = [[10, -69], [-2, -84], [0, -106], U([0, -120]), U([0, -132])], rw = [48, 46, 44, 40, 38];
    tube(ctx, f, [...turn(HIGH, -.32, Math.PI / 2 - .5, 4), ...rise], [...Array(5).fill(HIGH.w), ...rw], { fill: C.scale, scale: true, openEnds: 'start' });
    const edge = rise.map(([px, py], k) => [px + rw[k] / 2 - 1.5, py]), inner = rise.map(([px, py], k) => [px + rw[k] * .08, py]);
    blob(ctx, f, [...edge, ...inner.reverse()], C.belly, { w: 0, depth: .8, speck: .6, amp: .15 });
    for (let k = 0; k < rise.length - 1; k++) for (const u of [.33, .66]) {
      const a = edge[k], b = edge[k + 1], c = inner[rise.length - 1 - k], d = inner[rise.length - 2 - k];
      line(ctx, f, [[a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], [c[0] + (d[0] - c[0]) * u, c[1] + (d[1] - c[1]) * u]], .5);
    }
  } });
  parts.push({ id: 'torso', d: 6, draw: () => {
    // Skin torso and bare shoulders, the bodice fitted over it with gold trim and a red gem.
    blob(ctx, f, [[-15, -130], [15, -130], [16, -148], [14, -163], [6, -168], [-6, -168], [-14, -163], [-16, -148]].map(U), C.skin, { w: 2, depth: 2, speck: .4 });
    const bodice = [[-15, -130], [15, -130], [16, -148], [13, -156], [6, -151], [0, -155], [-6, -151], [-13, -156], [-16, -148]];
    blob(ctx, f, bodice.map(U), C.dress, { w: 1.8, depth: 2, speck: .8 });
    line(ctx, f, [[13, -155], [6, -150], [0, -154], [-6, -150], [-13, -155]].map(U), 1.8);
    blob(ctx, f, [[13, -156], [6, -151], [0, -155], [-6, -151], [-13, -156], [-13, -153.5], [-6, -148.5], [0, -152.5], [6, -148.5], [13, -153.5]].map(U), C.gold, { w: .6, depth: .2, speck: 0 });
    blob(ctx, f, [[-2, -152], [2, -152], [5, -136], [0, -131], [-5, -136]].map(U), C.gold, { w: .9, depth: .3, speck: 0 });
    disc(ctx, f, ...U([0, -150]), 2.8 * S, 3.4 * S, C.gem, { w: 1, depth: .5, speck: 0 });
    // Draped panels hanging at the hips over the serpent body.
    for (const [px, w] of [[-14, 1], [14, -1]]) blob(ctx, f, [[px - 6 * w, -132], [px + 6 * w, -132], [px + 8 * w, -112], [px + 2 * w, -94], [px - 3 * w, -104], [px - 8 * w, -98], [px - 9 * w, -114]].map(U), C.dressDark, { w: 1.6, depth: 1.4, speck: .7 });
    // Gold scale peplum over the join: two rows of rounded plates.
    for (const [row, z] of [[0, -134], [1, -128]]) for (let i = 0; i < 6; i++) {
      const px = -16 + i * 6.2 + row * 3;
      blob(ctx, f, [[px - 3.3, z - 2], [px + 3.3, z - 2], [px + 3, z + 2.5], [px, z + 5], [px - 3, z + 2.5]].map(U), C.gold, { w: 1, depth: .5, speck: .2 });
    }
    for (const px of [-8, 2, 12]) { const [qx, qy] = U([px, -122]); line(ctx, f, [[qx, qy], [qx, qy + 6]], .5); disc(ctx, f, qx, qy + 8, 1.6, 2.4, C.gem, { w: .6, depth: 0, speck: 0 }); }
  } });
  parts.push({ id: 'neck', d: 7, draw: () => limb(ctx, f, [U([2, -160]), H([6, -180])], 6.5 * S, 6 * S, C.skin, { w: 1.6, depth: 1 }) });
  parts.push({ id: 'head', d: 8, draw: () => {
    // Pink finned ear, then the face and hair framing it.
    blob(ctx, f, [[-10, -198], [-28, -212], [-24, -198], [-28, -188], [-10, -190]].map(H), C.fin, { w: 1.3, depth: .7, speck: .2 });
    for (const yy of [-208, -198, -190]) line(ctx, f, [H([-11, -195]), H([-25, yy])], .45);
    const oval = Array.from({ length: 28 }, (_, i) => {
      const a = i / 28 * TAU, c = Math.cos(a), sn = Math.sin(a), lo = Math.max(0, sn);
      return H([6 + c * 20 * (1 - .34 * lo * lo) + 3 * lo, -196 + sn * (sn > 0 ? 27 : 23)]);
    });
    blob(ctx, f, oval, C.skin, { w: 2.2, depth: 2.4, speck: .4, amp: .06 });
    blob(ctx, f, [[-22, -204], [-14, -218], [2, -224], [18, -220], [28, -208], [24, -198], [16, -208], [8, -200], [0, -210], [-10, -202]].map(H), C.hair, { w: 1.8, depth: 1.8, speck: .9 });
    // Gold crown with points and a red gem.
    const crown = [[-12, -218], [-10, -226], [-6, -221], [-2, -232], [2, -222], [6, -236], [10, -222], [14, -230], [16, -220], [18, -214], [-12, -212]];
    blob(ctx, f, crown.map(H), C.gold, { w: 1.4, depth: .9, speck: .3 });
    disc(ctx, f, ...H([6, -220]), 3 * KS, 3.8 * KS, C.gem, { w: 1, depth: .4, speck: 0 });
    // Stern almond eyes under slanted brows, a small frown.
    const hurt = action === 'hurt' && t < .2;
    eyes(ctx, f, [H([10, -194]), H([23, -194])], 2.6 * KS, 3.4 * KS, { closed: hurt });
    line(ctx, f, [H([5, -201]), H([10, -200]), H([14, -198])], 1.2);
    line(ctx, f, [H([20, -198]), H([24, -200]), H([28, -201])], 1.1);
    line(ctx, f, [H([14, -181]), H([18, -183]), H([22, -181])], .9);
  } });
  parts.push({ id: 'trident', d: R ? -4 : 9.5, draw: () => {
    // Held upright in the left hand: facing left at her back, in front of the hair and head; facing right out in
    // front, behind the body. A red gem in the head.
    const [hx, hy] = U(P.trident), a = -Math.PI / 2 + P.tilt, ux = Math.cos(a), uy = Math.sin(a);
    const T = 1.2, at = s => [hx + ux * s * T, hy + uy * s * T], butt = at(-56), top = at(108);
    limb(ctx, f, [butt, top], 3.4 * T, 3 * T, C.goldDark, { w: 1.5, depth: .6 });
    for (const s of [-50, 60]) disc(ctx, f, ...at(s), 3.4 * T, 2.4 * T, C.gold, { w: 1, depth: .4, speck: 0 });
    const [tx, ty] = top, nx = -uy, ny = ux, Q = (s, w) => [tx + (ux * s + nx * w) * T, ty + (uy * s + ny * w) * T];
    blob(ctx, f, [Q(-4, -11), Q(3, -12), Q(5, 0), Q(3, 12), Q(-4, 11), Q(-2, 0)], C.gold, { w: 1.4, depth: .8, speck: .2 });
    for (const w of [-10, 0, 10]) {
      const len = w ? 18 : 24;
      blob(ctx, f, [Q(2, w - 2.2), Q(len - 4, w - 1.8), Q(len, w), Q(len - 4, w + 1.8), Q(2, w + 2.2)], C.gold, { w: 1.3, depth: .6, speck: .1 });
      if (w) blob(ctx, f, [Q(len - 7, w), Q(len - 4, w + Math.sign(w) * 3.5), Q(len - 2, w)], C.gold, { w: 1, depth: 0, speck: 0 });
    }
    disc(ctx, f, ...Q(0, 0), 3.4 * T, 3.4 * T, C.gem, { w: 1, depth: .4, speck: 0 });
    for (const w of [-9, 9]) { const [px, py] = Q(-3, w); line(ctx, f, [[px, py], [px, py + 6]], .6); disc(ctx, f, px, py + 8, 1.8, 2.6, C.gem, { w: .7, depth: 0, speck: 0 }); }
  } });
  parts.push({ id: 'tridentArm', d: R ? -3.5 : 10, draw: () => {
    // The left arm grips the trident (near facing left, far facing right); a gold bracelet with a red drop.
    const sh = R ? SH_FRONT : SH_BACK, s = U(sh), h = U(P.trident), e = U(elbow(sh, P.trident));
    arm(ctx, f, s, e, h, C.skin, { r0: 5.4 * S, r1: 4.6 * S, r2: 4 * S, hand: 4.8 * S, grip: true });
    const bx = e[0] + (h[0] - e[0]) * .6, by = e[1] + (h[1] - e[1]) * .6;
    disc(ctx, f, bx, by, 4.6 * S, 2.6 * S, C.gold, { w: 1, depth: .4, speck: 0 });
    disc(ctx, f, bx, by + 5 * S, 1.6 * S, 2.4 * S, C.gem, { w: .6, depth: 0, speck: 0 });
  } });
  parts.push({ id: 'magic', d: 14, draw: () => {
    if (P.bolt >= 0) {
      // The venom bolt flies forward and fades.
      const u = P.bolt, h = U(P.open), bx = h[0] + 14 + u * 90, by = h[1] + u * 6, r = 12 * (1 - u * .3);
      ctx.save(); ctx.globalAlpha = 1 - u * .6;
      disc(ctx, f, bx, by, r * 1.3, r, C.venom, { w: 1.4, depth: .8, speck: .3 });
      disc(ctx, f, bx - r * .3, by - r * .25, r * .4, r * .3, '#d8f0b8', { w: 0, depth: 0, speck: 0 });
      for (const k of [1, 2, 3]) disc(ctx, f, bx - r - k * 7, by + (k % 2 ? -3 : 3), 2.4 - k * .5, 2 - k * .4, C.venomDark, { w: .6, depth: 0, speck: 0 });
      ctx.restore();
    }
    if (P.swirl >= 0) {
      // Water swirling up around the coils as the wave gathers (cycles with the loop).
      for (let i = 0; i < 3; i++) {
        const u = (P.swirl + i / 3) % 1, a = TAU * u, wx = Math.cos(a) * 118, wy = -58 + Math.sin(a) * 26 - u * 30;
        ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * u) * .9;
        blob(ctx, f, [[wx - 12, wy], [wx - 4, wy - 7], [wx + 8, wy - 6], [wx + 14, wy + 1], [wx + 6, wy - 1], [wx - 4, wy + 2]], C.water, { w: 1.2, depth: .4, speck: 0 });
        line(ctx, f, [[wx - 6, wy - 2], [wx + 6, wy - 4]], .5);
        ctx.restore();
      }
    }
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-coilscale', fallTilt(action, t), { pivot: 100, toe: 100, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-coilscale', label: 'Coilscale Matriarch — EMBERBOUND', kind: 'creature', directional: true, draw: drawCoilscale,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: COIL_ATTACK_T, keys: [0, .08, .15, .25, .35, .45, .55, .7, .85], once: true, releaseAt: .15 },
    cast: { period: COIL_WINDUP_T, frames: 8 },
    hurt: hurtAction },
  frameBox: { x0: -220, x1: 220, y0: -440, y1: 16 },
  emberbound: { gameId: 'coilscale', heightPx: 64, facing: 'L' },
});
export const studio = Object.freeze({ order: 17, name: 'Coilscale Matriarch（とぐろ鱗の女王）', category: 'EMBERBOUND 第2エリア',
  description: '第2エリアのボス。上半身は人の姿、下半身は青い鱗の長い蛇。金の冠と三叉槍。Tideling を呼び、大波 Crashing Wave と毒で攻める。',
  preview: { direction: 'L', phase: 0 } });
