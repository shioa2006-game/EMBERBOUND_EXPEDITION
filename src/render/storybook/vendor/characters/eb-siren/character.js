/**
 * EMBERBOUND EXPEDITION — Siren (game id `siren`), a new mermaid after the user's reference image: long wavy
 * teal hair with a pink scallop-shell ornament and gold beads, pale skin, finned ears, big dark eyes and a
 * singing mouth, a pink shell top, a sea-green sash with gold beads and a scaled teal tail ending in a broad fin.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (floating sway), attack (a short push of the hand that throws
 * a ball of water, released at u = .15), `cast` = Tidal Hymn, the healing song the game loops while she
 * sings (arms open, notes rising), and the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, tufted, drawCreature } from '../shared/emberbound/creature.js';
import { tube, fanFin, arm, eyes } from '../shared/emberbound/merfolk.js';

const C = { skin:'#f4e4d4', hair:'#4f9a96', hairDark:'#3a7774', tail:'#5aa3a3', belly:'#a9d4c9', fin:'#79b9b2', finLight:'#d3e9df',
  shell:'#dc938a', shellDark:'#b86f68', sash:'#80b4a1', gold:'#d1aa55', water:'#86cfe0', waterLight:'#dcf4f6', blush:'#f0b3a8', ink:PAL.ink };
const IDLE_T = 2.6;
export const SIREN_ATTACK_T = .3;   // the water ball leaves the hand at u = .15
export const SIREN_HYMN_T = .6;     // Tidal Hymn: a loop

export function sirenPose(action, t) {
  const s = Math.sin(TAU * phase(t, IDLE_T));
  const P = { bob: s * 1.5, sway: s, lean: 0, front: [[14, -70], [24, -79]], back: [[3, -55], [9, -62]], splay: 0, sing: .4, ball: -1, notes: -1, t };
  if (action === 'attack') {
    const u = phase(t, SIREN_ATTACK_T);
    const k = sample([[0, [0]], [.1, [1]], [.45, [1]], [1, [0]]], u);
    P.front = [[16 + 2 * k, -68 + 2 * k], [24 + 8 * k, -79 + 13 * k]]; P.lean = sample([[0, [0]], [.1, [3]], [.5, [2]], [1, [0]]], u);
    P.sing = .4 + .4 * k; P.ball = u >= .15 && u < .75 ? (u - .15) / .6 : -1;
  } else if (action === 'cast') {
    // Tidal Hymn: arms open and raised, singing; periodic in u.
    const u = phase(t, SIREN_HYMN_T), w = Math.sin(TAU * u);
    P.front = [[15, -74], [26, -88 + w]]; P.back = [[-10, -72], [-18, -84 - w]]; P.splay = .3;
    P.sing = .9; P.bob = w * 1.2; P.sway = w; P.notes = u;
  } else if (action === 'hurt') {
    P.sing = 0;
  }
  return P;
}

export function drawSiren(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = sirenPose(action, t), f = face(direction), by = -P.bob, ln = P.lean;
  // Upper-body points lean forward in proportion to their height above the hips (y -44).
  const U = ([px, py]) => [px + ln * Math.max(0, (-44 - py) / 50), py + by];
  const parts = [];
  parts.push({ id: 'hairBack', d: -6, draw: () => {
    // The long wavy mass of hair behind the head and down the back, drifting with the sway.
    const sw = P.sway * 2;
    // Wavy outer edge: each lock bulges out and tucks in again.
    const hair = [[6, -108], [-8, -114], [-22, -110], [-33, -100], [-38, -90], [-46 + sw * .5, -84], [-43 + sw * .5, -76], [-50 + sw, -68], [-45 + sw, -60],
      [-52 + sw, -50], [-44 + sw, -42], [-38 + sw, -47], [-32 + sw, -40], [-27, -48], [-21, -44], [-19, -56], [-13, -62], [-9, -76], [-5, -90], [4, -98]];
    blob(ctx, f, hair.map(U), C.hair, { w: 2, depth: 3, light: .25, speck: 1.4 });
    for (const pts of [[[-20, -102], [-28, -90], [-34, -76], [-40 + sw, -62], [-44 + sw, -50]], [[-12, -104], [-18, -90], [-22, -76], [-25, -60], [-30 + sw, -46]], [[-28, -86], [-38, -76], [-44 + sw, -66]]])
      line(ctx, f, pts.map(U), .6);
    blob(ctx, f, [[-26, -96], [-32, -84], [-36, -74], [-30, -78], [-24, -90]].map(U), C.hairDark, { w: 0, depth: .3, speck: .5 });
  } });
  parts.push({ id: 'tail', d: -2, draw: () => {
    const sw = P.sway * 3;
    const spine = [[0, -44 + by], [-3, -28 + by * .6], [-12, -12], [-30, -6], [-50, -10], [-62 + sw * .3, -24], [-66 + sw, -38]];
    const r = tube(ctx, f, spine, [25, 25, 22, 17, 12, 8, 5], { fill: C.tail, bellyFill: C.belly, bellySide: -1, belly: .4, scale: true });
    const end = r.out[r.out.length - 1];
    fanFin(ctx, f, end, -2.1 + P.sway * .1, 28, 1.5, C.fin, C.finLight);
  } });
  // The arm on the facing side (front) is the far one, behind the body; the arm on the back side is the near one,
  // in front of the body (its hand rests on the chest).
  parts.push({ id: 'frontArm', d: -4, draw: () => arm(ctx, f, U([6, -64]), U(P.front[0]), U(P.front[1]), C.skin, { hand: 3.4, splay: P.splay }) });
  parts.push({ id: 'torso', d: 0, draw: () => {
    blob(ctx, f, [[-8, -44], [8, -44], [9, -55], [8, -66], [-7, -66], [-9, -55]].map(U), C.skin, { w: 1.8, depth: 1.8, speck: .4 });
    // Shell top: two scallops with ribs.
    for (const cx of [-2, 6]) {
      const shell = [[cx - 5, -58], [cx - 4.5, -62], [cx - 2, -64.5], [cx, -65], [cx + 2, -64.5], [cx + 4.5, -62], [cx + 5, -58], [cx, -57]];
      blob(ctx, f, shell.map(U), C.shell, { w: 1.3, depth: .8, speck: .2 });
      for (const d of [-2.5, 0, 2.5]) line(ctx, f, [U([cx, -57.5]), U([cx + d, -63.5])], .45);
    }
    // Sash over the hips with gold beads, its ends hanging over the tail.
    blob(ctx, f, tufted([[-11, -47], [11, -48], [12, -42], [6, -38], [10, -30], [4, -32], [0, -36], [-6, -33], [-10, -38], [-12, -42]], 5, 2).map(U), C.sash, { w: 1.5, depth: 1.2, speck: .6 });
    for (const [bx, byy] of [[-6, -45], [-1, -45], [4, -45.5], [9, -46]]) disc(ctx, f, ...U([bx, byy]), 1.5, 1.5, C.gold, { w: .6, depth: 0, speck: 0 });
    disc(ctx, f, ...U([2, -45]), 2.6, 2.6, C.gold, { w: .8, depth: .3, speck: 0 });
  } });
  parts.push({ id: 'head', d: 5, draw: () => {
    const hc = U([3, -88]);
    // Finned ear behind the cheek.
    blob(ctx, f, [[-8, -88], [-22, -97], [-19, -88], [-22, -82], [-8, -84]].map(U), C.finLight, { w: 1.2, depth: .6, speck: .2 });
    line(ctx, f, [U([-9, -86]), U([-19, -94])], .45); line(ctx, f, [U([-9, -86]), U([-19, -84])], .45);
    disc(ctx, f, hc[0], hc[1], 18, 19, C.skin, { w: 2, depth: 2, speck: .3 });
    // Bangs sweeping over the forehead.
    blob(ctx, f, [[-16, -96], [-10, -106], [2, -109], [14, -106], [21, -98], [18, -92], [12, -97], [6, -93], [0, -99], [-8, -94]].map(U), C.hair, { w: 1.6, depth: 1.6, speck: .8 });
    // Shell ornament with hanging gold beads.
    const sh = [[-18, -100], [-17, -106], [-13, -110], [-9, -110], [-5, -106], [-5, -100], [-11, -98]];
    blob(ctx, f, sh.map(U), C.shell, { w: 1.3, depth: .8, speck: .2 });
    for (const d of [-14, -11, -8]) line(ctx, f, [U([-11, -99]), U([d, -108])], .45);
    for (const [bx, byy] of [[-16, -96], [-16.5, -92], [-16, -88]]) disc(ctx, f, ...U([bx, byy]), 1.2, 1.2, C.gold, { w: .5, depth: 0, speck: 0 });
    const hurt = action === 'hurt' && t < .2;
    eyes(ctx, f, [U([6, -86]), U([16, -86])], 2.4, 4.2, { closed: hurt, lash: true });
    disc(ctx, f, ...U([1, -79]), 2.4, 1.3, C.blush, { w: 0, depth: 0, speck: 0 });
    // The singing mouth: an open "o", wider while she sings.
    const m = U([13, -77]);
    if (hurt) line(ctx, f, [[m[0] - 2, m[1]], [m[0], m[1] - 1], [m[0] + 2, m[1]]], .9);
    else disc(ctx, f, m[0], m[1], 1.2 + P.sing, 1.4 + P.sing * 1.2, '#7a3b38', { w: .7, depth: 0, speck: 0 });
  } });
  parts.push({ id: 'backArm', d: 8, draw: () => arm(ctx, f, U([-3, -64]), U(P.back[0]), U(P.back[1]), C.skin, { hand: 3.6, splay: P.splay }) });
  parts.push({ id: 'hairFront', d: 4.5, draw: () => {
    // A strand falling from behind the ear, under the shell ornament, down over the back of the shoulder.
    const sw = P.sway;
    blob(ctx, f, [[-13, -96], [-8, -88], [-9, -76], [-5 + sw, -64], [-8 + sw, -54], [-11 + sw, -60], [-15, -72], [-16, -86]].map(U), C.hair, { w: 1.4, depth: 1, speck: .5 });
  } });
  parts.push({ id: 'magic', d: 12, draw: () => {
    if (P.ball >= 0) {
      // The water ball flies forward and fades.
      const u = P.ball, h = U(P.front[1]), bx = h[0] + 8 + u * 46, byy = h[1] - u * 2, r = 7 * (1 - u * .3);
      ctx.save(); ctx.globalAlpha = 1 - u * .6;
      disc(ctx, f, bx, byy, r, r * .9, C.water, { w: 1.3, depth: .6, speck: .2 });
      disc(ctx, f, bx - r * .3, byy - r * .3, r * .35, r * .3, C.waterLight, { w: 0, depth: 0, speck: 0 });
      for (const k of [1, 2]) line(ctx, f, [[bx - r - k * 5, byy - 2 * k], [bx - r - k * 8, byy - 2 * k + 1]], .6);
      ctx.restore();
    }
    if (P.notes >= 0) {
      // Notes of the hymn rising around her (positions cycle with the loop).
      for (let i = 0; i < 3; i++) {
        const u = (P.notes + i / 3) % 1, nx = 24 - i * 22 + Math.sin(TAU * u + i) * 4, ny = -96 - u * 26;
        ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * u);
        disc(ctx, f, nx, ny, 2.6, 2, C.water, { w: .8, depth: 0, speck: 0 });
        line(ctx, f, [[nx + 2.2, ny], [nx + 2.2, ny - 8], [nx + 5, ny - 6]], .8);
        ctx.restore();
      }
    }
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-siren', fallTilt(action, t), { pivot: 30, toe: 30, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-siren', label: 'Siren — EMBERBOUND', kind: 'creature', directional: true, draw: drawSiren,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: SIREN_ATTACK_T, keys: [0, .08, .15, .25, .35, .45, .55, .7, .85], once: true, releaseAt: .15 },
    cast: { period: SIREN_HYMN_T, frames: 8 },
    hurt: hurtAction },
  frameBox: { x0: -120, x1: 120, y0: -150, y1: 14 },
  emberbound: { gameId: 'siren', heightPx: 25, facing: 'L' },
});
export const studio = Object.freeze({ order: 15, name: 'Siren（海の歌い手）', category: 'EMBERBOUND 第2エリア',
  description: '長い青緑の髪の人魚。桃色の貝の髪飾り、ひれの耳、鱗の尾。歌 Tidal Hymn で仲間を回復する。',
  preview: { direction: 'L', phase: 0 } });
