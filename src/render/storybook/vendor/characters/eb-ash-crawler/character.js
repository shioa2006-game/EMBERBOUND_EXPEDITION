/**
 * EMBERBOUND EXPEDITION — Ash Crawler (game id `ash_crawler`), a new beetle after the user's reference image:
 * a high, dusty grey-brown shell split down the middle with two glowing ember spots, a round pale head with
 * dark eyes, curled antennae and small mandibles, and six short segmented legs with dark claws.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (breathing, antennae), a short lunge-and-bite attack
 * (impact at 0.15 s), the shared hurt. Shares its legs and crawl with Crystal Mite later.
 */
import { TAU, PAL, strokePath, DRAW } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, embers, leg, drawCreature } from '../shared/emberbound/creature.js';

const C = { shell:'#7f7262', shellDark:'#5f5446', shellLight:'#a49482', under:'#4c4137', head:'#93856f',
  legs:'#8a7a66', claw:'#4a3d33', ember:'#ef8a32', ink:PAL.ink };
const IDLE_T = 2.4;
export const CRAWLER_ATTACK_T = .3;   // lunge: the bite lands at u = .5 (0.15 s)

export function crawlerPose(action, t) {
  const P = { shift: 0, dip: 0, breathe: 0, ant: 0, jaw: 0, legLift: 0 };
  if (action === 'attack') {
    const u = phase(t, CRAWLER_ATTACK_T);
    P.shift = sample([[0, [0]], [.2, [-3]], [.5, [11]], [.7, [10]], [1, [0]]], u);
    P.dip = sample([[0, [0]], [.2, [1]], [.5, [3]], [.7, [2]], [1, [0]]], u);
    P.jaw = sample([[0, [0]], [.3, [1]], [.5, [-.4]], [.7, [0]], [1, [0]]], u);
    P.ant = sample([[0, [0]], [.5, [-4]], [1, [0]]], u);
    P.legLift = sample([[0, [0]], [.3, [1]], [.5, [0]], [1, [0]]], u);
  } else {
    const s = Math.sin(TAU * phase(t, IDLE_T));
    P.breathe = s; P.ant = Math.sin(t * 3.1) * 2.2;
  }
  return P;
}

export function drawCrawler(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = crawlerPose(action, t), f = face(direction), sx = P.shift, b = P.breathe * .8;
  const parts = [];
  // Far legs (behind the body), then the shell, the head and the near legs.
  const legAt = (x0, near, k) => {
    const lift = P.legLift * (k % 2 ? 3 : 0), dx = near ? 0 : 5, dy = near ? 0 : -3;
    return () => leg(ctx, f, [x0 + sx + dx, -9 + dy + P.dip * .3], [x0 + sx + 7 + dx - P.shift * .2, dy - lift], 3.4, 2.4,
      near ? C.legs : C.under, 3, { claws: C.claw });
  };
  [[26, 0], [6, 1], [-16, 2]].forEach(([x0, k]) => parts.push({ id: 'farLeg' + k, d: -10 + k * .1, draw: legAt(x0, false, k) }));
  parts.push({ id: 'under', d: 0, draw: () => blob(ctx, f, [[-38 + sx, -10], [34 + sx, -10], [36 + sx, -5 + P.dip], [-36 + sx, -5 + P.dip]], C.under, { w: 1.3, depth: 1 }) });
  parts.push({ id: 'shell', d: 5, draw: () => {
    const top = -50 - b + P.dip, cx = -4 + sx;
    const shell = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI * (1 - i / 16); shell.push([cx + Math.cos(a) * 42, -10 + P.dip + Math.sin(a) * (top + 10)]); }
    blob(ctx, f, [...shell, [cx + 40, -6 + P.dip], [cx - 40, -6 + P.dip]], C.shell, { w: 2, depth: 3, light: .25, speck: 1.4 });
    // Split down the middle of the shell, a darker rim and two glowing ember spots.
    line(ctx, f, [[cx - 6, top + 1], [cx - 2, top + 14], [cx + 2, top + 30], [cx + 4, -10 + P.dip]], 1.1);
    line(ctx, f, [[cx - 38, -10 + P.dip], [cx - 20, -12 + P.dip], [cx + 20, -12 + P.dip], [cx + 38, -10 + P.dip]], .6);
    for (const [a, r] of [[.3, .8], [.62, .9]]) line(ctx, f, [[cx - 30 + a * 60, top + 10], [cx - 32 + a * 60, top + 26 * r]], .45);
    embers(ctx, f, [[cx + 18, top + 14, 4.5, 3.2], [cx + 27, top + 22, 2.4, 1.8]], C.ember);
  } });
  parts.push({ id: 'head', d: 10, draw: () => {
    const hx = 36 + sx + P.shift * .1, hy = -20 + P.dip * 1.3;
    // Curled antennae with knobbed tips.
    for (const [ox, k] of [[-4, 1], [2, .8]]) {
      const tip = [hx + ox + 12 + P.ant * k, hy - 24 - P.ant * .3];
      const ant = [[hx + ox, hy - 10], [hx + ox + 4, hy - 20], tip].map(([px, py]) => ({ x: f * px, y: py }));
      strokePath(ctx, ant, 4 * DRAW.lw, false, C.ink); strokePath(ctx, ant, 2.2, false, C.legs);
      disc(ctx, f, tip[0] + 1.5, tip[1], 2.6, 2, C.head, { w: 1 });
    }
    disc(ctx, f, hx, hy, 13, 12, C.head, { w: 1.8, depth: 1.6, speck: .9 });
    disc(ctx, f, hx + 2, hy - 2, 2.8, 4.2, C.ink, { w: .5, depth: 0, speck: 0 });
    disc(ctx, f, hx + 9.5, hy - 1.5, 2.3, 3.8, C.ink, { w: .5, depth: 0, speck: 0 });
    // Two small mandibles, opening for the bite.
    const j = P.jaw * 2.5;
    blob(ctx, f, [[hx + 6, hy + 9], [hx + 12 + j, hy + 13], [hx + 10 + j * .6, hy + 16], [hx + 7, hy + 12]], C.legs, { w: .9, depth: .4, speck: 0 });
    blob(ctx, f, [[hx + 11, hy + 8], [hx + 17 + j, hy + 10 - j * .5], [hx + 16 + j * .6, hy + 13], [hx + 12, hy + 11]], C.legs, { w: .9, depth: .4, speck: 0 });
  } });
  [[26, 0], [6, 1], [-16, 2]].forEach(([x0, k]) => parts.push({ id: 'nearLeg' + k, d: 20 + k * .1, draw: legAt(x0, true, k) }));
  drawCreature(ctx, x, y, f, scale, parts, 'eb-ash-crawler', fallTilt(action, t), { pivot: 40, toe: 30, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-ash-crawler', label: 'Ash Crawler — EMBERBOUND', kind: 'creature', directional: true, draw: drawCrawler,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: CRAWLER_ATTACK_T, keys: [0, .1, .2, .3, .4, .5, .6, .7, .85], once: true },
    hurt: hurtAction },
  frameBox: { x0: -90, x1: 90, y0: -85, y1: 12 },
  emberbound: { gameId: 'ash_crawler', heightPx: 12, facing: 'L' },
});
export const studio = Object.freeze({ order: 5, name: 'Ash Crawler（灰這い）', category: 'EMBERBOUND 第1エリア',
  description: '灰褐色の丸い甲殻を持つ、地面を這う甲虫。甲殻に光る残り火の斑点、丸い頭と触角、短い脚。最初に出会う近接の敵。',
  preview: { direction: 'L', phase: 0 } });
