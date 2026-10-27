/**
 * EMBERBOUND EXPEDITION — Gem Bat (game id `gem_bat`), a new bat after the user's reference image: a round, fuzzy
 * dark-purple body with big pink-lined ears, glowing cyan eyes, a little snout and fang, a pale blue gem set in
 * its chest with small shards around it, and wide violet membrane wings with crystal points at the wrists and
 * fingertips. The game raises flying enemies 18 px, so the feet hang at about y = 0 here.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (flapping, a loop), a short diving bite (contact at 0.15 s),
 * the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, tufted, crystal, CRYSTAL, drawCreature } from '../shared/emberbound/creature.js';

const C = { fur: '#4e3f55', furDark: '#3a2f40', ear: '#c99ab9', wing: '#9a78b5', wingDark: '#6f5689', bone: '#5e4c66', eye: '#9ff4f0', fang: '#f2ead8', ink: PAL.ink };
const FLAP_T = .4;
export const BAT_ATTACK_T = .3;   // dive: the bite lands at u = .5

export function batPose(action, t) {
  const fl = Math.sin(TAU * phase(t, FLAP_T));
  const P = { flap: fl, bob: -fl * 2, shift: 0, drop: 0, jaw: 0 };
  if (action === 'attack') {
    const u = phase(t, BAT_ATTACK_T);
    P.shift = sample([[0, [0]], [.25, [-4]], [.5, [16]], [.7, [13]], [1, [0]]], u);
    P.drop = sample([[0, [0]], [.25, [-4]], [.5, [6]], [.7, [5]], [1, [0]]], u);
    P.flap = sample([[0, [0]], [.25, [1]], [.5, [-1]], [.75, [0]], [1, [0]]], u);
    P.bob = 0; P.jaw = sample([[0, [0]], [.35, [1]], [.5, [.2]], [1, [0]]], u);
  }
  return P;
}

// A membrane wing spread to one side (dir +1 = toward the facing, −1 = away): the arm bone up and out to the wrist,
// three finger bones fanning down and out, a scalloped membrane between them and back to the body; `lift`
// (−1 down … 1 up) swings it. The bat is drawn nearly face-on, wings spread wide, as in the reference.
function wing(ctx, f, sh, dir, lift, fill, boneCol, k) {
  const a = -.55 - lift * .65, X = (px) => sh[0] + dir * px, at = (ang, l) => [Math.cos(ang) * l * k, Math.sin(ang) * l * k];
  const w0 = at(a, 30), wr = [X(w0[0]), sh[1] + w0[1]];
  const tips = [[a + .55, 44], [a + 1.4, 42], [a + 2.25, 32]].map(([b, l]) => { const d = at(b, l); return [wr[0] + dir * d[0], wr[1] + d[1]]; });
  const root = [X(0), sh[1] + 22];
  const scallop = (p, q) => { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; return [m[0] * .86 + wr[0] * .14, m[1] * .86 + wr[1] * .14]; };
  blob(ctx, f, [sh, wr, tips[0], scallop(tips[0], tips[1]), tips[1], scallop(tips[1], tips[2]), tips[2], scallop(tips[2], root), root], fill, { w: 1.5, depth: 1.6, light: .2, speck: .9 });
  for (const tp of tips) limb(ctx, f, [wr, tp], 1.8, 1, boneCol, { w: 1, depth: .3 });
  limb(ctx, f, [sh, wr], 3.4, 2.6, boneCol, { w: 1.2, depth: .5 });
  disc(ctx, f, wr[0], wr[1], 3.2, 3.2, boneCol, { w: 1, depth: .3, speck: 0 });
  // Crystal points at the wrist and the outer fingertips, a few shards along the trailing edge.
  crystal(ctx, f, wr[0], wr[1], dir > 0 ? a - .2 : Math.PI - a + .2, 11 * k, 7 * k, CRYSTAL.lilac, { w: 1 });
  for (const tp of tips.slice(0, 2)) crystal(ctx, f, tp[0], tp[1], Math.atan2(tp[1] - wr[1], tp[0] - wr[0]), 8 * k, 5 * k, CRYSTAL.white, { w: .9 });
  for (const u of [.4, .62]) { const q = [tips[1][0] * u + wr[0] * (1 - u), tips[1][1] * u + wr[1] * (1 - u) + 6]; crystal(ctx, f, q[0], q[1], -1.7, 6 * k, 3.4 * k, CRYSTAL.white, { w: .7 }); }
}

export function drawBat(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = batPose(action, t), f = face(direction), cx = P.shift, cy = -24 + P.bob + P.drop;
  const parts = [];
  // Both wings attach behind the shoulders; the one on the far side is a little smaller and darker.
  parts.push({ id: 'backWing', d: -6, draw: () => wing(ctx, f, [cx - 6, cy - 8], -1, P.flap, C.wingDark, C.furDark, .85) });
  parts.push({ id: 'frontWing', d: -5, draw: () => wing(ctx, f, [cx + 6, cy - 8], 1, P.flap, C.wing, C.bone, 1) });
  parts.push({ id: 'body', d: 0, draw: () => {
    // Little clawed feet, the fuzzy body, the chest gem.
    for (const dx of [-4, 4]) {
      line(ctx, f, [[cx + dx, cy + 12], [cx + dx + 1, cy + 22]], 1.4);
      for (const t2 of [-2, 0, 2]) line(ctx, f, [[cx + dx + 1, cy + 22], [cx + dx + 1 + t2, cy + 26]], .8);
    }
    const body = [[cx - 14, cy + 4], [cx - 12, cy - 10], [cx, cy - 16], [cx + 12, cy - 10], [cx + 14, cy + 4], [cx + 8, cy + 14], [cx - 8, cy + 14]];
    blob(ctx, f, tufted(body, 5, 2.4), C.fur, { w: 1.8, depth: 2.4, speck: 1.4 });
    crystal(ctx, f, cx + 4, cy + 8, -1.57, 14, 9, CRYSTAL.blue, { w: 1.3, glow: .4 });
    for (const [dx, dy, a] of [[-2, 0, -2.4], [10, 0, -.7], [-1, 6, -2.9], [10, 7, -.2]]) crystal(ctx, f, cx + dx, cy + dy, a, 4, 2.6, CRYSTAL.white, { w: .7 });
  } });
  parts.push({ id: 'head', d: 5, draw: () => {
    const hx = cx + 3, hy = cy - 17;
    // Big ears with pink insides, the round fuzzy head, glowing eyes, a snout and a fang.
    for (const [ex, ew, near] of [[-6, 1, false], [6, 1.1, true]]) {
      const ear = [[hx + ex - 6 * ew, hy - 6], [hx + ex - 4 * ew, hy - 24], [hx + ex + 6 * ew, hy - 8]];
      blob(ctx, f, ear, near ? C.fur : C.furDark, { w: 1.5, depth: 1.2 });
      blob(ctx, f, [[hx + ex - 4 * ew, hy - 7], [hx + ex - 3.5 * ew, hy - 20], [hx + ex + 3.5 * ew, hy - 8.5]], C.ear, { w: 0, depth: .4, speck: .3 });
    }
    blob(ctx, f, tufted([[hx - 12, hy + 2], [hx - 10, hy - 8], [hx, hy - 12], [hx + 11, hy - 8], [hx + 13, hy + 2], [hx + 6, hy + 9], [hx - 6, hy + 9]], 4.5, 2), C.fur, { w: 1.8, depth: 2 });
    for (const ex of [hx + 2, hx + 10]) {
      ctx.save(); ctx.globalAlpha = .25; disc(ctx, f, ex, hy - 1, 4.4, 4.8, C.eye, { w: 0, depth: 0, speck: 0 }); ctx.restore();
      disc(ctx, f, ex, hy - 1, 2.6, 3, C.eye, { w: .7, depth: 0, speck: 0 });
    }
    blob(ctx, f, [[hx + 9, hy + 2], [hx + 15, hy + 2], [hx + 15, hy + 6], [hx + 10, hy + 7]], C.furDark, { w: 1, depth: .4, speck: 0 });
    blob(ctx, f, [[hx + 9, hy + 6.5], [hx + 11, hy + 6.5], [hx + 10, hy + 9.5 + P.jaw * 2]], C.fang, { w: .6, depth: 0, speck: 0 });
    if (action === 'hurt') line(ctx, f, [[hx + 1, hy - 1], [hx + 3, hy - 2]], .8);
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-gem-bat', fallTilt(action, t), { pivot: 10, toe: 10, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-gem-bat', label: 'Gem Bat — EMBERBOUND', kind: 'creature', directional: true, draw: drawBat,
  actions: { idle: { period: FLAP_T, frames: 8 },
    attack: { period: BAT_ATTACK_T, keys: [0, .12, .25, .38, .5, .6, .7, .85], once: true },
    hurt: hurtAction },
  frameBox: { x0: -130, x1: 130, y0: -125, y1: 50 },   // on the downstroke the wing tips dip below the feet
  emberbound: { gameId: 'gem_bat', heightPx: 11, facing: 'L' },
});
export const studio = Object.freeze({ order: 19, name: 'Gem Bat（宝石蝙蝠）', category: 'EMBERBOUND 第3エリア',
  description: '紫の膜の翼を広げた小さな蝙蝠。胸の水色の宝石と光る目、翼の先の結晶。素早く飛び回って噛みつく。',
  preview: { direction: 'L', phase: 0 } });
