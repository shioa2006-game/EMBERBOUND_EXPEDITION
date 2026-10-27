/**
 * Inkstone — 弓使い — 姿勢 (待機・歩行・射撃) と弓・弦・矢の幾何、矢の形
 *   射撃: 構える → 矢筒へ → 抜く → つがえる → 引き分け → 引き切り保持 → 離れ (u=0.75) → 戻す。1回 1.7秒。
 */
import { TAU } from '../core/geometry.js';
import { PAL } from '../core/palette.js';
import { inkShape, strokePath } from '../core/ink.js';
import { DIRS, KX, bodyToWorld, chestToLegs, keyframes, nrm3, orth3, smooth, vlerp, walkFeet } from './rig.js';

export const ARC = {
  skin: '#f4dfb9', hair: '#e8cb89', hairLight: '#fff0bd', hairDark: '#bba06a',
  accent: '#c9bc96',
  leather: '#95704c', leatherDark: '#694d35', linen: '#eee5ce', linenShade: '#d8caa8',
  cape: '#858d63', capeDark: '#566043', pants: '#65634e', boot: '#805e40', bootCuff: '#9b7852',
  wood: '#a78255', woodDark: '#705234', grip: '#795939', string: '#302d25',
  fletch: '#eee3c8', fletch2: '#d4c59d', iron: '#92948a', brass: '#b99c61',
};

export const ARCHER_ATTACK_T = 1.7;                 // 射撃1回の長さ (秒)

export const ARCHER_IDLE_PERIOD = TAU / 2.2;        // 呼吸の周期

export const ARCHER_RELEASE_U = 0.75;               // 射撃の中で矢を放つ瞬間 (0〜1)

export const ARROW_LEN = 36;                        // 矢の長さ (ローカルpx) [E] 34 → 36

export const IDLE_GRIP = [9, 30, 38], IDLE_UP = [0.10, 0.45, 0.89], IDLE_RH = [5, -18, 29];
export const QUIVER_TOP = [-10, -23, 61];

export const AIM_GRIP = [26, -1, 45], AIM_UP = [0.04, 0.10, 0.99];   // [E修正6] D [21,2,48] → E初版 [22,-1,47] → 握りを前へ (26。腕が約1割伸びる誇張)・矢の線を胸の高さへ (45)。弓と引き手が顔に重ならない

export const AIM_YAW = 0.32;   // 構えで左肩を的へ向けるひねり ([修正6] 0.42 では ↗ で胴が真横になり細く見えた)
const quiverReach = [QUIVER_TOP[0]*Math.cos(AIM_YAW)+QUIVER_TOP[1]*Math.sin(AIM_YAW),
  -QUIVER_TOP[0]*Math.sin(AIM_YAW)+QUIVER_TOP[1]*Math.cos(AIM_YAW),QUIVER_TOP[2]];

// 右手の軌道: 構え → 矢筒へ → 矢を抜く → つがえる → 引き分け → 会(保持) → 離れ → 戻り
export const RHAND_KEYS = [
  [0.00, IDLE_RH], [0.18, [4, -12, 42]], [0.28, quiverReach], [0.36, [-2, -6, 57]],
  [0.45, [20, -1, 45]], [0.62, [2, -1, 45]], [0.75, [1.5, -1, 45]], [0.80, [-7, -10, 52]],   // [E修正6] 引き手は顎の下 (z45) に付け、離れで後ろへ抜ける
  [0.90, [2, -9, 42]], [1.00, IDLE_RH],
];

/** 弓使いの姿勢 */
export function archerPose(action, t) {
  const P = {
    body: [0, 0, 0], yaw: 0, footL: [0, 6, 0], footR: [0, -6, 0],
    grip: IDLE_GRIP.slice(), bowUp: nrm3(IDLE_UP), bowFwd: [1, 0.15, 0], draw: 0, vib: 0,
    rHand: IDLE_RH.slice(), arrow: null, elbowR: [0.1, -0.35, -1], elbowL: [0.1, 0.55, -0.85],
    look: 0, blink: (t % 3.4) > 3.27, mouth: 0, focus: 0, capeSway: 0, quiverSway: 0, released: -1,
  };
  if (action === 'idle') {
    const br = Math.sin(t * 2.2);
    P.body = [0, 0, br * 0.8];
    P.grip = [IDLE_GRIP[0], IDLE_GRIP[1], IDLE_GRIP[2] + br * 0.3];
    P.bowUp = nrm3([IDLE_UP[0] + Math.sin(t * 1.1) * 0.03, IDLE_UP[1], IDLE_UP[2]]);
    P.rHand = [IDLE_RH[0], IDLE_RH[1], IDLE_RH[2] + br * 0.4];
    P.look = Math.sin(t * 0.9) * 1.6;             // 周囲を見回す (視線が左右に動く)
    P.capeSway = Math.sin(t * 1.6) * 1.2;
    P.quiverSway = Math.sin(t * 2.2 + 0.6) * 0.4;
  } else if (action === 'walk') {
    const wf = walkFeet(t), s = wf.s;               // 共通リグの足運び (接地補正込み)
    P.footL = wf.footL; P.footR = wf.footR; P.body = [2, 0, wf.bob];
    P.grip = [IDLE_GRIP[0] - 4 * s, IDLE_GRIP[1], IDLE_GRIP[2] + Math.abs(s) * 0.8];
    P.bowUp = nrm3([IDLE_UP[0] - 0.12 * s, IDLE_UP[1], IDLE_UP[2]]);
    P.rHand = [4 + 4 * s, -15, 32];
    P.capeSway = -s * 2.2;                         // ケープは体の揺れに遅れて振れる
    P.quiverSway = Math.cos(2 * wf.ph) * 0.9;
  } else {
    const T = ARCHER_ATTACK_T, u = (t % T) / T;
    P.grip = keyframes([[0, IDLE_GRIP], [0.2, AIM_GRIP], [0.82, AIM_GRIP], [1, IDLE_GRIP]], u);
    P.bowUp = nrm3(keyframes([[0, IDLE_UP], [0.2, AIM_UP], [0.82, AIM_UP], [1, IDLE_UP]], u));
    P.bowFwd = keyframes([[0, [1, 0.15, 0]], [0.2, [1, 0, 0]], [0.82, [1, 0, 0]], [1, [1, 0.15, 0]]], u);
    P.yaw = keyframes([[0, [0]], [0.2, [AIM_YAW]], [0.82, [AIM_YAW]], [1, [0]]], u)[0];   // 左肩を的へ向ける
    P.rHand = keyframes(RHAND_KEYS, u);
    // 引き分け量 (弓のしなり・弦の位置)
    P.draw = u < 0.45 ? 0 : u < 0.62 ? smooth((u - 0.45) / 0.17) : u < ARCHER_RELEASE_U ? 1 : 0;
    if (u >= ARCHER_RELEASE_U) {                   // 離れ: 弦が戻って減衰しながら震える
      const e = (u - ARCHER_RELEASE_U) * T;
      P.vib = Math.sin(e * 70) * Math.exp(-e * 18) * 4;
      P.released = e;
    }
    // 矢: 矢筒から抜く → 向きを変えながら弓へ → つがえて引く。放った後はワールドの飛翔体 (別処理)
    if (u >= 0.28 && u < 0.45) {
      const k = smooth((u - 0.28) / 0.17);
      P.arrow = { mode: 'hand', dir: nrm3(vlerp([-0.35, -0.25, 0.9], [1, 0, 0], k)) };
    } else if (u >= 0.45 && u < ARCHER_RELEASE_U) P.arrow = { mode: 'nock' };
    // 右肘: 後ろへ引き、ちび頭の顎・フードに当たらない高さに収める。
    const kd = u < 0.4 ? smooth(u / 0.4) * 0.5 : u < 0.82 ? 1 : 1 - smooth((u - 0.82) / 0.18);
    P.elbowR = nrm3(vlerp([0.1, -0.35, -1], [-0.8, -0.6, -0.1], kd));
    P.elbowL = nrm3(vlerp([0.1, 0.55, -0.85], [0, 0.6, -0.8], kd));
    // 体: 引き分けでわずかに反り、離れで小さく揺れる。足は左を前に開く (射の構え)
    P.body = keyframes([[0, [0, 0, 0]], [0.62, [-1.2, 0, 0.4]], [0.75, [-1.2, 0, 0.4]], [0.8, [0.6, 0, 0]], [1, [0, 0, 0]]], u);
    const st = keyframes([[0, [0, 0]], [0.2, [5, -4]], [0.82, [5, -4]], [1, [0, 0]]], u);
    P.footL = [st[0], 7.5, 0]; P.footR = [st[1], -7, 0];
    P.focus = u > 0.45 && u < ARCHER_RELEASE_U ? 1 : 0;
    P.mouth = u >= ARCHER_RELEASE_U && u < 0.86 ? 1 : 0;
    P.capeSway = u >= ARCHER_RELEASE_U ? Math.sin(P.released * 14) * Math.exp(-P.released * 5) * 2.5 : 0;
    P.look = 0;
  }
  return P;
}

/** 向きごとの弓の傾き (+1 = 左手側 b+ へ / −1 = 右手側へ)。構えの姿勢で上端が頭から遠ざかる側を選ぶ */
export const _cantCache = {};

export function bowCantSign(dirKey) {
  if (_cantCache[dirKey]) return _cantCache[dirKey];
  const dir = DIRS[dirKey], sx = b => { const w = bodyToWorld(dir, ...chestToLegs(dir.turn, AIM_GRIP[0] + AIM_UP[0] * 31, b)); return (w.X - w.Y) * KX; };
  const head = (() => { const w = bodyToWorld(dir, ...chestToLegs(dir.turn, 1.5, 0)); return (w.X - w.Y) * KX; })();
  const top = AIM_GRIP[1] + AIM_UP[1] * 31;   // [E] 弓の長さに合わせる
  return (_cantCache[dirKey] = Math.abs(sx(top + 8) - head) >= Math.abs(sx(top - 8) - head) ? 1 : -1);
}

/** 弓の形 (体の座標系の点): 握り G、上方向 u、前方向 w。しなり量は引き分けに応じて増える */
export function bowGeometry(P) {
  const u = P.bowUp, w = orth3(P.bowFwd, u), G = P.grip;
  const L = 31 * (1 - 0.05 * P.draw), bend = 5.5 + 8 * P.draw;   // [E] 弓を大きく、引き切りでよくしならせる
  const pt = s => {
    const rc = Math.max(0, Math.abs(s) - 0.8) / 0.2 * 2.6;       // 先端の反り返し (リカーブ)
    const k = -bend * s * s + rc;
    return [G[0] + u[0] * s * L + w[0] * k, G[1] + u[1] * s * L + w[1] * k, G[2] + u[2] * s * L + w[2] * k];
  };
  const tipT = pt(1), tipB = pt(-1);
  // 弦の中央: 矢をつがえて引いている間は右手の位置、それ以外は弦の休止位置 (+離れの振動)
  const rest = [(tipT[0] + tipB[0]) / 2 + w[0] * P.vib, (tipT[1] + tipB[1]) / 2 + w[1] * P.vib, (tipT[2] + tipB[2]) / 2 + w[2] * P.vib];
  const nocked = P.arrow && P.arrow.mode === 'nock';
  return { G, u, w, pt, tipT, tipB, stringMid: nocked ? P.rHand : rest, nocked };
}

/** 画面上の矢 (矢じり・矢柄・矢羽・矢筈)。p = 矢筈の位置, d = 単位方向, len = 矢柄の長さ。射撃中の矢と飛翔中の矢で共用 */
export function drawArrowShape(ctx, p, d, len, lw = 1) {
  const n = { x: -d.y, y: d.x }, P = (a, b) => ({ x: p.x + d.x * a + n.x * b, y: p.y + d.y * a + n.y * b });
  const shaft = [P(0, 0), P(len, 0)];
  strokePath(ctx, shaft, 3.0 * lw, false, PAL.ink); strokePath(ctx, shaft, 1.5 * lw, false, ARC.wood);
  for (const sgn of [1, -1]) {                       // 矢羽 (2枚。片方はくすんだ緑)
    const f = [P(1.5, 0), P(3.5, 3.6 * sgn), P(10.5, 3.2 * sgn), P(9.5, 0.4 * sgn)];
    inkShape(ctx, f, { fill: sgn > 0 ? ARC.fletch : ARC.accent, w: 0.9 * lw, amp: 0.2, step: 4 });
  }
  inkShape(ctx, [P(len - 1, -2.6), P(len + 6, 0), P(len - 1, 2.6), P(len + 0.5, 0)], { fill: ARC.iron, w: 1.0 * lw, amp: 0.15, step: 4 });
  ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.arc(p.x, p.y, 1.1 * lw, 0, TAU); ctx.fill();
}
