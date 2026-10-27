/**
 * EMBERBOUND EXPEDITION — Ember Wisp (game id `ember_wisp`), a new floating fire spirit after the user's
 * reference image: a round flame body, yellow to orange with a bright core, flame tongues streaming up and
 * back, a small smiling face, and loose sparks. The game raises flying enemies 18 px, so the body's bottom
 * sits at y = 0 here.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (bob, flicker), attack (a short lunge), `cast` = its magic
 * attack (the game shows `cast` for magic enemies): the flame flares and spits a fireball released at
 * u = .15; the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, flame, flamePts, sparks, FLAME, drawCreature } from '../shared/emberbound/creature.js';

const C = { body:'#f39a3e', bodyIn:'#f8bf55', core:'#ffe39a', ink:PAL.ink };
const IDLE_T = 1.8;
export const WISP_ATTACK_T = .3;   // lunge: contact at u = .5
export const WISP_CAST_T = .3;     // fireball released at u = .15 (0.045 s; the game fires on the attack start)

export function wispPose(action, t) {
  const P = { bob: Math.sin(TAU * phase(t, IDLE_T)) * 2.5, shift: 0, squash: 0, flare: 0, ball: -1, t };
  if (action === 'attack') {
    const u = phase(t, WISP_ATTACK_T);
    P.shift = sample([[0, [0]], [.25, [-4]], [.5, [12]], [.7, [10]], [1, [0]]], u);
    P.squash = sample([[0, [0]], [.25, [.12]], [.5, [-.1]], [1, [0]]], u);
  } else if (action === 'cast') {
    const u = phase(t, WISP_CAST_T);
    P.squash = sample([[0, [0]], [.1, [.15]], [.18, [-.12]], [.5, [0]], [1, [0]]], u);
    P.flare = sample([[0, [0]], [.12, [1]], [.4, [.6]], [1, [0]]], u);
    P.ball = u >= .15 && u < .7 ? (u - .15) / .55 : -1;
  } else if (action === 'hurt') {
    P.squash = .18 * sample([[0, [0]], [.15, [1]], [.6, [.6]], [1, [0]]], phase(t, .3));
  }
  return P;
}

export function drawWisp(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = wispPose(action, t), f = face(direction), cx = P.shift, cy = -24 - P.bob, r = 22, sy = 1 - P.squash, sxs = 1 + P.squash;
  const parts = [];
  parts.push({ id: 'tongues', d: 0, draw: () => {
    // A loose tongue licking up behind the body; taller while flaring.
    flame(ctx, f, cx - 12, cy - 2, 18, (30 + P.flare * 12) * sy, P.t, -.5, 2.2, { w: 1.1, tongues: false });
  } });
  parts.push({ id: 'body', d: 5, draw: () => {
    // The body is one big flame: its round bottom holds the face and its tip streams up and back.
    const g = 1 + P.flare * .3;
    flame(ctx, f, cx, cy + r * sy, 2 * r * sxs, (2 * r + 28) * sy * g, P.t, -.28, 0, { w: 1.8 });
    disc(ctx, f, cx - 2, cy + 3, r * .55 * sxs, r * .5 * sy, C.core, { w: 0, depth: 0, speck: 0 });
    // A small face, turned toward the travel direction.
    const ex = cx + 4;
    if (action === 'hurt' && P.squash > .1) for (const dx of [0, 10]) line(ctx, f, [[ex + dx - 2.5, cy - 1], [ex + dx + 2.5, cy - 1]], 1);
    else for (const dx of [0, 10]) disc(ctx, f, ex + dx, cy - 1, 2, 3.6, C.ink, { w: .5, depth: 0, speck: 0 });
    line(ctx, f, [[ex + 2, cy + 6], [ex + 5, cy + 8], [ex + 8, cy + 6]], .9);
  } });
  parts.push({ id: 'sparks', d: 8, draw: () => {
    sparks(ctx, f, cx - 8, cy - 22, 16, 22, P.t, 4, 0);
    if (P.ball >= 0) {
      // The spat fireball travels forward and fades.
      const bx = cx + r + 8 + P.ball * 42, by = cy - 2 + P.ball * 4, br = 10 * (1 - P.ball * .35);
      ctx.save(); ctx.globalAlpha = 1 - P.ball * .6;
      blob(ctx, f, flamePts(bx, by + br, br * 2, br * 2.4, P.t, -1.1, 4), FLAME.outer, { w: 1.2, depth: .8, speck: .3, amp: .1 });
      disc(ctx, f, bx, by + br * .2, br * .75, br * .7, FLAME.mid, { w: 0, depth: 0, speck: 0 });
      disc(ctx, f, bx, by + br * .2, br * .55, br * .5, FLAME.core, { w: 0, depth: 0, speck: 0 });
      ctx.restore();
    }
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-ember-wisp', fallTilt(action, t), { pivot: 14, toe: 14, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-ember-wisp', label: 'Ember Wisp — EMBERBOUND', kind: 'creature', directional: true, draw: drawWisp,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: WISP_ATTACK_T, keys: [0, .12, .25, .38, .5, .62, .75, .9], once: true },
    cast: { period: WISP_CAST_T, keys: [0, .08, .15, .25, .35, .45, .55, .7, .85], once: true, releaseAt: .15 },
    hurt: hurtAction },
  frameBox: { x0: -120, x1: 120, y0: -140, y1: 12 },
  emberbound: { gameId: 'ember_wisp', heightPx: 15, facing: 'L' },
});
export const studio = Object.freeze({ order: 6, name: 'Ember Wisp（残り火の精）', category: 'EMBERBOUND 第1エリア',
  description: '橙から黄色の炎でできた浮遊する火の玉。明るい芯に小さな顔。魔法で火の玉を吐き、後衛にも被害を与える。',
  preview: { direction: 'L', phase: 0 } });
