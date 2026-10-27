/**
 * EMBERBOUND EXPEDITION — Rime Archer (game id `rime_archer`), the archer's body (by way of the Ranger) after the
 * user's reference image: a deep blue hood lined with white fur around a shadowed face with glowing cyan eyes, a
 * blue capelet with a fur trim and a snowflake brooch, a pale blue tunic with a snowflake hem, navy trousers,
 * brown boots with fur cuffs, a ragged blue cloak, and a pale ice bow with frost spikes along its limbs.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): the attack plays the second half of the archer's shot, so the draw reads
 * before the arrow leaves (nocked arrow drawn back → full draw → release at 0.15 s → lower); the shared hurt.
 *   左手 = 弓、右手 = 弦と矢、矢筒 = 背中。
 */
import { DRAW } from '../../src/core/settings.js';
import { TAU, ellipsePts, lerp } from '../../src/core/geometry.js';
import { PAL } from '../../src/core/palette.js';
import { strokePath } from '../../src/core/ink.js';
import { LW, paint, paintA, taperPts } from '../../src/core/paint.js';
import { KX, KY_G, LAYER, bodyLayerKey, bodyToWorld, chestToLegs, cLine, groundDirScreen, ik2, nrm3, renderRig, rigFrame, vlerp, yawToBody } from '../../src/characters/rig.js';
import { legParts2, mittenHand } from '../../src/characters/painting.js';
import { AIM_YAW, ARC, QUIVER_TOP, ARCHER_ATTACK_T, ARCHER_IDLE_PERIOD, ARCHER_RELEASE_U, ARROW_LEN, archerPose, bowCantSign, bowGeometry, drawArrowShape } from '../../src/characters/archer-pose.js';
import { bandAcross, drawQuiver, polyStroke, pLine } from '../../src/characters/archer-parts.js';
import { archerReleaseInfo } from '../../src/characters/archer.js';
import { hurtAction, phase, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';

// Game timing (seconds).
export const RIME_ATTACK_T = .3;   // the archer's shot from the nocked arrow: draw, release at 0.15 s, lower the bow
const SHOT_FROM = .5;              // where on the archer's 1.7 s shot the attack starts (arrow nocked, drawing)
export const RIME_RELEASE_U = (ARCHER_RELEASE_U - SHOT_FROM) / (1 - SHOT_FROM);
const KEYS = Object.freeze({ attack: [0, .1, .2, .3, .4, RIME_RELEASE_U, .6, .7, .8, .9] });

const R = Object.freeze({
  hood: '#3f6290', hoodDark: '#2c486e', fur: '#f1eee6', furShade: '#cfd6de', void: '#11141c', eye: '#93f1ec',
  tunic: '#a9cbe3', tunicDark: '#7fa6c6', pants: '#3c4d70', boot: '#7b5636', glove: '#7a5234',
  ice: '#dbeef6', iceDark: '#9cc7dc', snow: '#f4fbff',
});
const FROST_LEGS = { pants: R.pants, boot: R.boot, cuff: R.fur, bootH: .5, legR0: 4.5, legR1: 3.6, footR: 4.4, soleR: 4 };
const fshape = (ctx, pts, fill, o = {}) => paintA(ctx, pts, { fill, w: 1.5, depth: 1.5, speck: .55, speckScale: .32, amp: .25, step: 4, ...o });
/** A fur trim: one fluffy band of half-width `r` along `pts` (screen points). */
function furBand(ctx, pts, r) {
  const L = [], Rt = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    L.push({ x: p.x - dy / l * r, y: p.y + dx / l * r }); Rt.push({ x: p.x + dy / l * r, y: p.y - dx / l * r });
  });
  paint(ctx, [...L, ...Rt.reverse()], { fill: R.fur, w: 1.3, depth: .9, speck: .5, speckScale: .3, amp: .6, step: 2.5 });
}

export function rimePose(action, t) {
  if (action === 'attack') return archerPose('attack', (SHOT_FROM + (1 - SHOT_FROM) * phase(t, RIME_ATTACK_T)) * ARCHER_ATTACK_T);
  if (action === 'hurt') {
    const P = archerPose('idle', 0), k = hurtAmount(t);
    P.body = [-2.5 * k, 0, -1.2 * k]; P.grip = [P.grip[0] - 2 * k, P.grip[1], P.grip[2] + 3 * k];
    P.capeSway = 2.5 * k; P.blink = k > .5; P.look = 0;
    return P;
  }
  return archerPose('idle', t);
}

/** The hood: deep blue with a white fur rim around a dark face opening and two glowing eyes. */
function drawFrostHead(ctx, c, sx, P) {
  ctx.save(); ctx.translate(c.x, c.y); ctx.scale(sx * .96, .96);
  // Hood: one outline whose pointed tip runs out of the crown and droops back (no separate tip piece).
  fshape(ctx, [[-24, 16], [-28, 2], [-27, -10], [-32, -15], [-42, -18], [-50, -15], [-47, -22], [-38, -28], [-24, -30], [-12, -31], [4, -28], [18, -21], [24, -10], [22, 6], [18, 18], [0, 22]], R.hood, { w: 2.1, depth: 2.1, speck: 1.1 });
  cLine(ctx, [[-26, -24], [-38, -23], [-46, -19]], .6);
  // The fur rim and the dark opening.
  // One fluffy ring of fur: a pale shape a little larger than the opening, the opening drawn over it.
  fshape(ctx, [[-16, 20], [-19, 6], [-16, -10], [-7, -21], [7, -23], [19, -15], [24, -2], [23, 12], [15, 21], [0, 23]], R.fur, { w: 1.4, depth: 1, speck: .5, amp: .7, step: 2.5 });
  fshape(ctx, [[-11, 14], [-13, 4], [-10, -7], [-3, -14], [6, -16], [14, -10], [17, -1], [16, 9], [10, 15], [0, 17]], R.void, { w: 1, depth: 0, light: 0, speck: 0, amp: .1 });
  for (const ex of [2, 12]) {
    const x = ex + P.look * .4, y = 3;
    if (P.blink) { cLine(ctx, [[x - 2, y], [x + 2, y]], .9); continue; }
    ctx.save(); ctx.globalAlpha = .22; paint(ctx, ellipsePts(x, y, 3.4, 4.6, 14), { fill: R.eye, w: 0, depth: 0, speck: 0 }); ctx.restore();
    paint(ctx, ellipsePts(x, y, 1.8, 3.2, 14), { fill: R.eye, w: 0, depth: 0, speck: 0, amp: .05 });
  }
  cLine(ctx, [[-26, -12], [-20, -22], [-8, -27]], .7);
  ctx.restore();
}
/** Pale blue tunic with a white snowflake hem, crossing leather belts. */
function drawFrostTorso(ctx, rf, P) {
  const Q = (arr, a = 0) => arr.map(([b, z]) => rf.UY(a, b, z));
  paint(ctx, Q([[-13, 47], [13, 47], [15, 30], [18, 12], [10, 14], [5, 10], [0, 13], [-5, 10], [-10, 14], [-18, 12], [-15, 30]]), { fill: R.tunic, w: 1.7, depth: 1.8, speck: .6, speckScale: .32, amp: .25 });
  paint(ctx, Q([[-17, 18], [17, 18], [18, 12], [10, 14], [5, 10], [0, 13], [-5, 10], [-10, 14], [-18, 12]], 1), { fill: R.snow, w: 1, depth: .6, speck: .3, amp: .25 });
  for (const b of [-9, 0, 9]) { const p = rf.UY(2, b, 15); for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; cLine(ctx, [[p.x - Math.cos(a) * 2.2, p.y - Math.sin(a) * 2.2], [p.x + Math.cos(a) * 2.2, p.y + Math.sin(a) * 2.2]], .45); } }
  paint(ctx, Q([[-11, 49], [-7, 50], [14, 31], [11, 28]], 3), { fill: ARC.leatherDark, w: 1, depth: .7, speck: .2 });
  paint(ctx, Q([[-17, 31], [17, 31], [17, 26], [-17, 26]], 4), { fill: ARC.leather, w: 1.4, depth: 1, speck: .3 });
  const k = rf.UY(5, 0, 28.5);
  fshape(ctx, [[k.x - 3, k.y - 2.6], [k.x + 3, k.y - 2.6], [k.x + 3, k.y + 2.6], [k.x - 3, k.y + 2.6]], ARC.brass, { w: 1, depth: .4, speck: 0 });
  paint(ctx, Q([[-8, 29], [-17, 29], [-18, 20], [-9, 19]], 5), { fill: ARC.leather, w: 1.2, depth: 1, speck: .3, round: 1 });
}
/** Long ragged blue cloak behind the body, a fur strip at its lower edge. */
function drawFrostCape(ctx, rf, P) {
  const Q = arr => arr.map(([b, z]) => { const k = Math.max(0, (48 - z) / 36); return rf.UY(-7, b + P.capeSway * k, z - Math.abs(P.capeSway) * .1 * k); });
  paint(ctx, Q([[-12, 52], [-22, 39], [-32, 12], [-27, 6], [-22, 11], [-18, 5], [-12, 11], [-6, 6], [0, 11], [7, 5], [14, 11], [20, 6], [25, 11], [30, 6], [32, 14], [22, 39], [12, 52]]),
    { fill: R.hoodDark, w: 1.8, depth: 2, speck: .8, speckScale: .32, amp: .35 });
  for (const b of [-17, -7, 10, 20]) pLine(ctx, Q([[b * .6, 43], [b, 17]]), .65);
}
/** Blue capelet with a thick fur trim and a snowflake brooch in front. */
function drawFrostMantle(ctx, rf) {
  const Q = arr => arr.map(([b, z]) => rf.UY(3, b, z));
  paint(ctx, Q([[-12, 53], [-22, 48], [-27, 37], [-17, 39], [0, 45], [17, 39], [27, 37], [22, 48], [12, 53], [0, 50]]), { fill: R.hood, w: 1.7, depth: 1.5, speck: .65, speckScale: .32, amp: .25 });
  furBand(ctx, Q([[-27, 38], [-14, 41], [0, 46], [14, 41], [27, 38]]), 3.4);
  furBand(ctx, Q([[-12, 53], [0, 51], [12, 53]]), 3);
  const c = rf.UY(4, 0, 47);
  paint(ctx, ellipsePts(c.x, c.y, 3.6, 3.6, 18), { fill: ARC.brass, w: 1.1, depth: .6, speck: 0 });
  paint(ctx, ellipsePts(c.x, c.y, 2.5, 2.5, 14), { fill: R.tunic, w: .5, depth: 0, speck: 0 });
  for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; cLine(ctx, [[c.x - Math.cos(a) * 2.2, c.y - Math.sin(a) * 2.2], [c.x + Math.cos(a) * 2.2, c.y + Math.sin(a) * 2.2]], .4); }
}
/** The ice bow: a pale, frosted limb with small ice spikes along its back, a leather grip. */
function drawIceBow(ctx, UG, geo) {
  const N = 18, pts = [];
  for (let i = 0; i <= N; i++) pts.push(UG(...geo.pt(-1 + 2 * i / N)));
  const left = [], right = [], normals = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i], q = pts[Math.min(N, i + 1)], r = pts[Math.max(0, i - 1)];
    const tx = q.x - r.x, ty = q.y - r.y, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
    const s = -1 + 2 * i / N, w = 1.8 + 3.0 * Math.pow(1 - Math.abs(s), .75);
    normals.push([nx, ny]); left.push({ x: p.x + nx * w / 2, y: p.y + ny * w / 2 }); right.push({ x: p.x - nx * w / 2, y: p.y - ny * w / 2 });
  }
  // Frost spikes on the bow's back, between the grip and the tips.
  for (const i of [3, 5, 7, 11, 13, 15]) {
    const p = left[i], [nx, ny] = normals[i], d = i < N / 2 ? -1 : 1;
    paint(ctx, [{ x: p.x - nx * .5, y: p.y - ny * .5 }, { x: p.x + nx * 5 + ny * d * 2, y: p.y + ny * 5 - nx * d * 2 }, { x: p.x + ny * d * 3, y: p.y - nx * d * 3 }], { fill: R.ice, w: .8, depth: .3, speck: 0, amp: .05 });
  }
  paint(ctx, left.concat(right.slice().reverse()), { fill: R.ice, w: LW.part, depth: 1.2, speck: 0, amp: .15, step: 4 });
  strokePath(ctx, pts.slice(2, N - 1), .9 * DRAW.lw, false, R.iceDark, .9);
  const g0 = UG(...geo.pt(-.14)), g1 = UG(...geo.pt(.14));
  strokePath(ctx, [g0, g1], 6.2 * DRAW.lw, false, PAL.ink); strokePath(ctx, [g0, g1], 4.2 * DRAW.lw, false, ARC.grip);
  for (const tp of [geo.tipT, geo.tipB]) { const q = UG(...tp); paint(ctx, ellipsePts(q.x, q.y, 1.8, 1.8, 8), { fill: R.iceDark, w: .9, depth: 0, speck: 0 }); }
}

/**
 * Rime Archer. (x,y) = 足元の画面座標。
 * @returns 手・弦・矢の画面座標 (確認表示用)
 */
export function drawRimeArcher(ctx, x, y, dirKey, action, t, scale = 1, opts = {}) {
  const P = rimePose(action, t);
  const boil = 0; // Stable cloth and hair texture across animation frames.
  const rf = rigFrame(dirKey, P.body, P.yaw), { dir, U, sx } = rf;
  // Same upper-body frame as U (side views turn the chest by rf.turn), so the bow stays in the hand.
  const UG = (a, b, z) => { const w = bodyToWorld(dir, ...chestToLegs(rf.turn, a + P.body[0], b + P.body[1])); return { x: (w.X - w.Y) * KX, y: (w.X + w.Y) * KY_G() - (z + P.body[2]), d: w.X + w.Y }; };
  const key = (p, eps = 0) => bodyLayerKey(rf, p[0], p[1], p[2]) + eps;
  // [方向ごとの補正] 弓の上端を頭から離す傾き。[E] 弓が大きくなったので傾きを増やす (D: 0.1 + 0.24·k)
  P.bowUp = nrm3([P.bowUp[0], P.bowUp[1] + bowCantSign(dirKey) * (0.12 + 0.62 * (P.yaw / AIM_YAW)), P.bowUp[2]]);
  const geo = bowGeometry(P), parts = [];
  const joints = Object.fromEntries(['L', 'R'].map(side => {
    const sa = yawToBody(rf, 0, side === 'L' ? 14 : -14), S = [sa[0], sa[1], 47];
    const H = side === 'L' ? P.grip : P.rHand;
    return [side, { S, H, E: ik2(S, H, 11.5, 11.5, side === 'L' ? P.elbowL : P.elbowR) }];
  }));
  // Facing left the left bow arm is nearest. Keep the nocked arrow and drawing
  // arm behind that whole assembly, including while the hands meet to nock.
  const nearBowArm = dirKey === 'L' && geo.nocked;
  const nockedDepth = Math.min(key(joints.L.E), key(geo.G, -0.02)) - 0.04;
  const armDepth = (side, depth) => nearBowArm && side === 'R' ? Math.min(depth, nockedDepth - 0.02) : depth;
  // The drawing hand may sit at the chin, but its sleeve is behind the head.
  // Do not promote a whole white forearm with the hand's a+10 depth bias.
  const sleeveDepth = (side, depth) => {
    if (side !== 'R') return armDepth(side, depth);
    // The rear cloak covers the drawing sleeve wherever their silhouettes
    // overlap. An elbow-centre threshold misses the sleeve's width during
    // interpolation and makes it pop through the cloak (e.g. u=0.566).
    // Keep this order throughout the motion; the separate hand still reaches
    // the quiver/string, and sleeve portions outside the cloak remain visible.
    return Math.min(armDepth(side, depth), LAYER.head - 0.6);
  };
  parts.push(...legParts2(ctx, rf, P, FROST_LEGS));
  parts.push({ id: 'torso', d: LAYER.torso, draw: () => drawFrostTorso(ctx, rf, P) });
  parts.push({ id: 'cape', d: -200, draw: () => drawFrostCape(ctx, rf, P) });
  parts.push({ id: 'mantle', d: LAYER.cape + 1, draw: () => drawFrostMantle(ctx, rf) });
  const hc = U(1.5, 0, 67);
  parts.push({ id: 'head', d: LAYER.head, draw: () => drawFrostHead(ctx, hc, sx, P) });
  const qa = yawToBody(rf, QUIVER_TOP[0], QUIVER_TOP[1]);
  parts.push({ id: 'quiver', d: Math.min(key([qa[0], qa[1], QUIVER_TOP[2]]), LAYER.head - 1), draw: () => drawQuiver(ctx, rf, P) });
  // 腕: 肩 → 肘 (IK) → 手。[E] 上腕・前腕を太さのある先細りの形にし、手をミトン形に
  const arm = (side) => {
    const { S, H, E } = joints[side];
    const S2 = vlerp(S, E, 0.3);
    parts.push({ id: 'upper' + side, d: sleeveDepth(side, key(E)), draw: () => paint(ctx, taperPts(U(...S2), U(...E), 4.8, 4.1), { fill: R.hood, w: LW.part, depth: 1.8, speck: 0.9 }) });
    const Hk = side === 'R' && H[0] > -2 ? [H[0] + 10, H[1], H[2]] : H;           // [D修正3・5] 胸の前の右手は「胸と顎より前」
    // [E修正7] 前腕の分割: 肘と手が別の層 (胴の奥 / 胴と頭の間 / 頭の手前) にあるときは、肘側の半分を肘の順位で、手側の半分を手の順位で描く。
    //   1つの部品のままだと、↙↘ の引き切りで「体の後ろの肘 → 胸の前の手」の前腕全体が顎の前に描かれ、白い棒が口元に立って見えた。
    const layerOf = k => Math.round(k / 1000), split = layerOf(key(E)) !== layerOf(key(Hk));
    const fore = (half) => {
      const e = U(...E), h = UG(...H), ux = h.x - e.x, uy = h.y - e.y, wr = { x: e.x + ux * 0.8, y: e.y + uy * 0.8 };
      const m = { x: lerp(e.x, wr.x, 0.5), y: lerp(e.y, wr.y, 0.5) }, seg = half === 'e' ? [e, m] : half === 'h' ? [m, wr] : [e, wr];
      const r0 = side === 'L' ? 4.4 : 4.3, r1 = side === 'L' ? 4.0 : 3.6, rm = (r0 + r1) / 2;
      const rr = half === 'e' ? [r0, rm] : half === 'h' ? [rm, r1] : [r0, r1];
      if (side === 'L') {                                                         // 弓手: 革の籠手 (帯2本) + 弓を握る手
        paint(ctx, taperPts(seg[0], seg[1], rr[0], rr[1]), { fill: ARC.leatherDark, w: LW.part, depth: 1.6, speck: 0.8, light: 0.2 });
        if (half !== 'h') bandAcross(ctx, { x: lerp(e.x, wr.x, 0.35), y: lerp(e.y, wr.y, 0.35) }, ux, uy, 4.7, 1.1, ARC.leather);
        if (half === 'e') return;
        bandAcross(ctx, { x: lerp(e.x, wr.x, 0.8), y: lerp(e.y, wr.y, 0.8) }, ux, uy, 4.4, 1.1, ARC.leather);
        mittenHand(ctx, h, ux, uy, 4.1, R.glove, { thumbSide: -sx });
      } else {                                                                    // 弦を引く手: 生成りの袖 + 革の手袋
        paint(ctx, taperPts(seg[0], seg[1], rr[0], rr[1]), { fill: R.hood, w: LW.part, depth: 1.6, speck: 0.9 });
        if (half === 'e') return;
        bandAcross(ctx, wr, ux, uy, 4.6, 2.2, R.fur);
      }
    };
    if (split) {
      parts.push({ id: 'foreE' + side, d: sleeveDepth(side, key(E, 0.01)), draw: () => fore('e') });
      parts.push({ id: 'fore' + side, d: sleeveDepth(side, key(Hk)), draw: () => fore('h') });
    } else parts.push({ id: 'fore' + side, d: sleeveDepth(side, key(Hk)), draw: () => fore('all') });
    return { S, E, H };
  };
  const armL = arm('L'), armR = arm('R');
  const drawingHandKey = armR.H[0] > -2 ? [armR.H[0] + 10, armR.H[1], armR.H[2]] : armR.H;
  parts.push({ id: 'drawingHand', d: nearBowArm ? nockedDepth + 0.01 : key(drawingHandKey), draw: () => {
    // Fingers cover the nock/string contact, but stay behind the near left arm.
    const e = U(...armR.E), h = UG(...armR.H);
    mittenHand(ctx, h, h.x - e.x, h.y - e.y, 3.9, R.glove, { knuckles: false, thumbSide: sx });
  } });
  // Bow under its gripping fingers; facing left the nocked arrow is behind the left bow arm.
  parts.push({ id: 'bow', d: key(geo.G, -0.02), draw: () => drawIceBow(ctx, UG, geo) });
  const sm = vlerp(geo.G, geo.stringMid, 0.5);
  // [E修正8] 弦の上半分は頭より手前に来ても「頭の直前」に描く (↙↘ の引き切りで弦が顔の真ん中を斜めに横切っていた)。
  //   顎の下の引き手から上の弦は顔の縁で隠れ、弓の上端からまた現れる。物理的には顔の前だが、顔の読みやすさを優先した誇張。
  const su = vlerp(geo.tipT, geo.stringMid, 0.5);
  parts.push({ id: 'stringU', d: Math.min(key(su), LAYER.head - 0.5), draw: () => polyStroke(ctx, [UG(...geo.tipT), UG(...geo.stringMid)], (P.draw > 0.5 ? 1.2 : 1.0) * DRAW.lw, ARC.string) });
  parts.push({ id: 'string', d: key(sm), draw: () => {
    polyStroke(ctx, [UG(...geo.stringMid), UG(...geo.tipB)], (P.draw > 0.5 ? 1.2 : 1.0) * DRAW.lw, ARC.string);
    if (P.released >= 0 && P.released < 0.16) {                                  // [E] 離れの瞬間: 弦の跳ね返りを示す短い線 (誇張)
      const m = UG(...geo.stringMid), tT = UG(...geo.tipT), tB = UG(...geo.tipB), k = 1 - P.released / 0.16;
      const vx = tT.x - tB.x, vy = tT.y - tB.y, vl = Math.hypot(vx, vy) || 1, nx = -vy / vl, ny = vx / vl;
      ctx.save(); ctx.globalAlpha = 0.85 * k;
      for (const s of [-1, 1]) for (const o of [5, 9]) strokePath(ctx, [{ x: m.x + vx / vl * o * s * 0.9 + nx * 2, y: m.y + vy / vl * o * s * 0.9 + ny * 2 }, { x: m.x + vx / vl * o * s * 1.2 + nx * 6, y: m.y + vy / vl * o * s * 1.2 + ny * 6 }], 1.0 * DRAW.lw, false, PAL.ink, 1);
      ctx.restore();
    }
  } });
  const fwd = groundDirScreen(dir.f[0], dir.f[1]), fl = Math.hypot(fwd.x, fwd.y), fd = { x: fwd.x / fl, y: fwd.y / fl };
  let arrowInfo = null;
  if (P.arrow) {
    const nock = UG(...P.rHand);
    let d = fd, len = ARROW_LEN;
    if (P.aimPitch) {
      // Arrow Rain: the nocked arrow points from the drawing hand through the bow grip.
      const g = UG(...P.grip), vx = g.x - nock.x, vy = g.y - nock.y, vl = Math.hypot(vx, vy) || 1;
      d = { x: vx / vl, y: vy / vl };
    } else if (P.arrow.mode === 'hand') {
      const q = UG(P.rHand[0] + P.arrow.dir[0], P.rHand[1] + P.arrow.dir[1], P.rHand[2] + P.arrow.dir[2]);
      const vx = q.x - nock.x, vy = q.y - nock.y, vl = Math.hypot(vx, vy) || 1;
      d = { x: vx / vl, y: vy / vl }; len = ARROW_LEN * Math.min(1, vl);
    }
    arrowInfo = { nock, d, len };
    const ha = P.rHand[0] > -2 ? [P.rHand[0] + 10, P.rHand[1], P.rHand[2]] : P.rHand;
    parts.push({ id: 'arrow', d: nearBowArm ? nockedDepth : (P.arrow.mode === 'nock' ? key(geo.G) : key(ha)) + 0.02, draw: () => drawArrowShape(ctx, nock, d, len, DRAW.lw) });
  }
  withTilt(ctx, x, y, scale, sx, fallTilt(action, t), false,
    () => renderRig(ctx, x, y, scale, parts, { prefix: 'eb-rime-archer', boil, shadow: opts.shadow }));
  const S = p => ({ x: x + p.x * scale, y: y + p.y * scale });
  return {
    leftHand: S(UG(...P.grip)), rightHand: S(UG(...P.rHand)), stringMid: S(UG(...geo.stringMid)),
    tips: [S(UG(...geo.tipT)), S(UG(...geo.tipB))], arrow: arrowInfo && { nock: S(arrowInfo.nock), d: arrowInfo.d, len: arrowInfo.len * scale },
    fwd: fd, order: parts.slice().sort((p, q) => p.d - q.d).map(p => p.id), pose: P, arms: { L: armL, R: armR }, head: S(hc),
  };
}

export const character = Object.freeze({
  id: 'eb-rime-archer',
  label: 'Rime Archer — EMBERBOUND',
  kind: 'humanoid',
  directional: true,
  draw: drawRimeArcher,
  actions: {
    idle: { period: ARCHER_IDLE_PERIOD, frames: 16 },
    attack: { period: RIME_ATTACK_T, keys: KEYS.attack, once: true, releaseAt: RIME_RELEASE_U },
    hurt: hurtAction,
  },
  frameBox: { x0: -100, x1: 100, y0: -130, y1: 24 },
  equipment: { leftHand: 'bow', rightHand: 'string', back: 'quiver' },
  // The release pose is the archer's, so the arrow leaves from the same nock point.
  projectile: { type: 'arrow', releaseAt: RIME_RELEASE_U, origin: archerReleaseInfo, draw: drawArrowShape, length: ARROW_LEN },
  emberbound: { gameId: 'rime_archer', heightPx: 24, facing: 'L' },
});
export const studio=Object.freeze({order:25,name:"Rime Archer（霧氷の射手）",category:"EMBERBOUND 第4エリア",
  description:"毛皮の縁取りの青いフードとマントの射手。影の顔に水色の目、氷の弓。後衛を狙い、Chill で動きを鈍らせる。",
  preview:{direction:'L',phase:0}});
