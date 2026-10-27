/**
 * Inkstone — 共通人体リグ (職業に依存しない部分)
 *   体の座標系: a = 前, b = 左, z = 上 (ローカルpx)。右向き R と左向き L の違いは前ベクトル f と上半身のひねり turn だけ。
 *   - 描画ヘルパー (cShape / cEllipse / cLine / shadeSide / limb / capsulePts)
 *   - 投影 (proj・足の接地補正 footProj)・向き (DIRS)・体の座標系 → ワールド (bodyToWorld)
 *   - アニメ補助 (smooth / keyframes / walkFeet)・2関節IK (ik2)・ベクトル (vlerp / dot3 / orth3)
 *   - フレーム (rigFrame: 上半身の揺れ・ひねり込み)・描画順キー (bodyLayerKey)・描画パイプライン (renderRig)
 *   実験Eの RIG.lw / RIG_FIX は core/settings.js の DRAW に置き換えた (値の意味は同じ)。
 */
import { seed } from '../core/random.js';
import { DRAW } from '../core/settings.js';
import { TAU, TH, TW, V, bbox, ellipsePts, lerp } from '../core/geometry.js';
import { PAL } from '../core/palette.js';
import { clipPath, hatchPoly, inkLine, inkShape, roughen, strokePath } from '../core/ink.js';

export function cShape(ctx, arr, fill, w = 1.8, amp = 0.45) { return inkShape(ctx, V(arr), { fill, w: w * DRAW.lw, amp, step: 6 }); }

export function cEllipse(ctx, cx, cy, rx, ry, fill, w = 1.8) {
  return inkShape(ctx, ellipsePts(cx, cy, rx, ry, 22), { fill, w: w * DRAW.lw, amp: 0.4, step: 6 });
}

export function cLine(ctx, arr, w = 1.1) { return inkLine(ctx, V(arr), { w: w * DRAW.lw, amp: 0.2, double: 0 }); }

/** 形の一部 (画面x > fromX) だけハッチングで陰を付ける (光は左上から) */
export function shadeSide(ctx, shape, fromX, o = {}) {
  const bb = bbox(shape), x0 = Math.max(fromX, bb.x0);
  if (x0 >= bb.x1) return;
  ctx.save(); clipPath(ctx, shape);
  // ハッチ範囲は形の外接矩形に限定する (広い矩形だと線の本数が増えて重くなる)
  hatchPoly(ctx, V([[x0, bb.y0], [bb.x1, bb.y0], [bb.x1, bb.y1], [x0, bb.y1]]),
    { angle: o.angle ?? 1.1, gap: o.gap ?? 2.4, w: 0.6 * DRAW.lw, alpha: o.alpha ?? 0.55, amp: 0.3 });
  ctx.restore();
}

/** 太さのある線 (腕・脚): 黒い太線の上に色の線 */
export function limb(ctx, a, b, w, color) {
  const p = roughen([a, b], false, 0.3, 5);
  strokePath(ctx, p, w + 2.8 * DRAW.lw, false, PAL.ink); strokePath(ctx, p, w, false, color);
}

/** カプセル形の点列 (ブーツ) */
export function capsulePts(p, q, r) {
  const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, a0 = Math.atan2(uy, ux);
  const out = [];
  for (let i = 0; i <= 6; i++) { const a = a0 - Math.PI / 2 + Math.PI * i / 6; out.push({ x: q.x + Math.cos(a) * r, y: q.y + Math.sin(a) * r }); }
  for (let i = 0; i <= 6; i++) { const a = a0 + Math.PI / 2 + Math.PI * i / 6; out.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r }); }
  return out;
}

// --- 投影と向き ---
export const KX = Math.SQRT1_2, KY = 0.18;   // 画面水平な地面ベクトルが等倍、奥行きはちびキャラ用に潰す

export const proj = (X, Y, Z) => ({ x: (X - Y) * KX, y: (X + Y) * KY - Z });

export const KY_G = () => (TH / TW) * KX;

/** 足 (体の座標系 a, b, z) → ローカル画面座標 */
export function footProj(dir, a, b, z) {
  const w = bodyToWorld(dir, a, b);
  return { x: (w.X - w.Y) * KX, y: (w.X + w.Y) * (DRAW.footGround ? KY_G() : KY) - z, d: w.X + w.Y };
}

/**
 * 横スクロールの視点: 真横 (画面の右 = ワールド (1,−1)/√2) から手前 (ワールド (1,1)/√2) へ傾ける角度。
 * 0 だと前ベクトルが画面の奥へ向かず、顔の正面 (3/4 の絵) が見えなくなる。20〜30° で頭の絵のまま横向きに見える。
 */
export const SIDE_VIEW_ANGLE = 25 * Math.PI / 180;

/**
 * 横向きだけ上半身 (U / UY) をカメラ側へひねる角度 (カメラに向けるごまかし)。脚と足運び (W・footProj) は進行方向のまま。
 * 胴・ベルトなどは前後の厚みのない板として描くので、真横に近いと板の幅が細く見える。
 * 25° + 20° = 45° で、胴の板が斜め 45° から見たときと同じ幅になる (絵はその幅で描いてある)。
 */
export const SIDE_CHEST_TURN = 20 * Math.PI / 180;

/** 横向き (sign = +1 右 / −1 左) の前ベクトル。左右反転ではなく投影で描くので、持ち手は体の左右のまま保たれる */
const sideForward = sign => {
  const c = Math.cos(SIDE_VIEW_ANGLE) * Math.SQRT1_2, n = Math.sin(SIDE_VIEW_ANGLE) * Math.SQRT1_2;
  return [sign * c + n, -sign * c + n];
};

/** 向き。f = 前ベクトル (ワールドの X, Y)、turn = 上半身のひねり (+ で胸の正面が体の右側へ回る) */
export const DIRS = {
  R: { key: 'R', arrow: '→', name: '右', axis: 'side+', f: sideForward(1), turn: SIDE_CHEST_TURN },
  L: { key: 'L', arrow: '←', name: '左', axis: 'side−', f: sideForward(-1), turn: -SIDE_CHEST_TURN },
};

/** 横スクロールの左右2方向 */
export const SIDE_DIR_ORDER = ['R', 'L'];

export const ACTIONS = { idle: '待機', walk: '歩行', attack: '攻撃' };

/** 体の座標系 (a前, b左) → ワールド (X, Y) */
export function bodyToWorld(dir, a, b) {
  const [fx, fy] = dir.f;
  return { X: fx * a + fy * b, Y: fy * a - fx * b };
}

// --- アニメーション ---
export const WALK_HZ = 1.4;     // 歩行サイクル (回/秒)

export const smooth = t => t * t * (3 - 2 * t);

export const nrm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** キーフレーム補間 keys=[[u, [値...]], ...] (区間ごとに smoothstep) */
export function keyframes(keys, u) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, v0] = keys[i], [u1, v1] = keys[i + 1];
    if (u >= u0 && u <= u1) { const k = smooth((u - u0) / (u1 - u0 || 1)); return v0.map((x, j) => lerp(x, v1[j], k)); }
  }
  return keys[keys.length - 1][1].slice();
}

/* ---- [実験D] 共通リグに追加した処理 (職業をまたいで使う) ---- */
/** 歩行の足運び (実験Cの接地補正込み)。元は剣士の computePose の中にあった処理を関数化 */
export function walkFeet(t) {
  const ph = t * TAU * WALK_HZ, s = Math.sin(ph), c = Math.cos(ph);
  let footL, footR;
  if (DRAW.linearStance) {
    // 接地中 (u=0.25〜0.75) は等速で +9 → −9、遊脚中はなめらかに戻して持ち上げる
    const foot = u => {
      u = ((u % 1) + 1) % 1;
      if (u >= 0.25 && u < 0.75) return [9 - 36 * (u - 0.25), 0];
      const w = ((u + 0.25) % 1) / 0.5;
      return [-9 + 18 * smooth(w), Math.sin(Math.PI * w) * 6];
    };
    const fl = foot(ph / TAU), fr = foot(ph / TAU + 0.5);
    footL = [fl[0], 6, fl[1]]; footR = [fr[0], -6, fr[1]];
  } else {
    footL = [9 * s, 6, Math.max(0, c) * 6];       // 前へ出す側の足を持ち上げる
    footR = [-9 * s, -6, Math.max(0, -c) * 6];
  }
  return { ph, s, c, footL, footR, bob: Math.cos(2 * ph) * 1.8 + 0.8 };
}

/**
 * キャラ1体ぶんの座標フレーム。
 *  W(a,b,z)  : 体の座標系 → ローカル画面座標 (d = 奥行き X+Y)。脚・足はこれで描く
 *  U(a,b,z)  : 上半身の揺れ (body) を加えた W。さらに上半身を SIDE_CHEST_TURN だけカメラ側へひねる (turn)
 *  UY(a,b,z) : さらに上半身のひねり yaw (ラジアン, +で左肩が前へ) を加えたもの
 *  vs, vt    : 視点方向 (ワールドの (1,1)) を体の座標系の a, b 成分で表したもの
 */
export function rigFrame(dirKey, body, yaw = 0) {
  const dir = DIRS[dirKey];
  // 上半身 (U / UY) だけカメラ側へひねる (dir.turn。+ で胸の正面が体の右側 −b へ回る)。W (脚・足) は進行方向のまま
  const turn = dir.turn, ct = Math.cos(turn), st = Math.sin(turn);
  const W = (a, b, z) => { const w = bodyToWorld(dir, a, b); return { ...proj(w.X, w.Y, z), d: w.X + w.Y }; };
  const U = (a, b, z) => { const a1 = a + body[0], b1 = b + body[1]; return W(a1 * ct + b1 * st, -a1 * st + b1 * ct, z + body[2]); };
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const UY = (a, b, z) => U(a * cy + b * sy, -a * sy + b * cy, z);
  const [fx, fy] = dir.f, Lx = fy, Ly = -fx, cT = Math.cos(yaw + turn), sT = Math.sin(yaw + turn);
  const fU = [cT * fx - sT * Lx, cT * fy - sT * Ly], LU = [sT * fx + cT * Lx, sT * fy + cT * Ly];
  return { dir, W, U, UY, yaw, turn, fU, LU, sx: W(1, 0, 0).x >= 0 ? 1 : -1, vs: fx + fy, vt: fy - fx };
}

/**
 * 上半身の座標 (a, b) → 脚の座標 (a, b)。上半身のひねり turn (rf.turn / DIRS[key].turn) を戻す。
 * bodyToWorld(dir, …) や独自の投影 (弓使いの UG など) へ上半身の点を渡すときに使い、U で描く手と位置をそろえる。
 */
export function chestToLegs(turn, a, b) {
  if (!turn) return [a, b];
  const c = Math.cos(turn), s = Math.sin(turn);
  return [a * c + b * s, -a * s + b * c];
}

/**
 * 上半身の座標の向き v = [a, b, z] を、進行方向へ k の割合だけ戻す (横向きガイド 2.3)。
 * 胸がカメラを向いた分 (rf.turn) と上半身のひねり (yaw) だけ逆に回す。
 * 振り下ろし・詠唱の間だけ k を上げると、手の位置は動かさずに横方向の届きを保てる。
 */
export function travelDir(rf, v, k = 1, yaw = rf.yaw) {
  const angle = (rf.turn + yaw) * k;
  if (!angle) return v;
  const c = Math.cos(angle), s = Math.sin(angle), [a, b, z] = v;
  return [a * c - b * s, a * s + b * c, z];
}

/** ひねった上半身の座標 (a,b) → ひねっていない体の座標 (a,b) */
export const yawToBody = (rf, a, b) => [a * Math.cos(rf.yaw) + b * Math.sin(rf.yaw), -a * Math.sin(rf.yaw) + b * Math.cos(rf.yaw)];

/** 描画パイプライン: 原点移動・拡大 → 足元の影 → 部品を d の順に描く (部品ごとに乱数を固定) → 後処理 */
export function renderRig(ctx, x, y, scale, parts, o) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  if (o.shadow !== false) {
    seed(o.shadowSeed || 'hero-shadow');
    hatchPoly(ctx, roughen(ellipsePts(0, 1, 19, 6.5, 20), true, 0.5, 6), { angle: -0.45, gap: 3, w: 0.75 * DRAW.lw, alpha: 0.55 });
  }
  parts.sort((p, q) => p.d - q.d);
  for (const p of parts) { seed(`${o.prefix}-${p.id}-${o.boil}`); p.draw(); }
  if (o.after) o.after();
  ctx.restore();
}

/** 2関節IK: 肩 S から手 H へ (上腕 l1, 前腕 l2)。肘は hint の方向へ曲げる。すべて [a, b, z] */
export function ik2(S, H, l1, l2, hint) {
  const d = [H[0] - S[0], H[1] - S[1], H[2] - S[2]], L = Math.hypot(...d) || 1e-6;
  const u = d.map(v => v / L), Lc = Math.min(L, l1 + l2 - 1e-3);
  const x = (l1 * l1 - l2 * l2 + Lc * Lc) / (2 * Lc), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const k = hint[0] * u[0] + hint[1] * u[1] + hint[2] * u[2];
  let n = [hint[0] - k * u[0], hint[1] - k * u[1], hint[2] - k * u[2]];
  const nl = Math.hypot(...n) || 1; n = n.map(v => v / nl);
  return [S[0] + u[0] * x + n[0] * h, S[1] + u[1] * x + n[1] * h, S[2] + u[2] * x + n[2] * h];
}

/**
 * 胴を楕円柱、頭を球で近似した描画順キー (部品の基準点 a,b,z = 体の座標系 (ひねり無し))。
 *   層0: 胴より奥 / 層1: 胴より手前・頭より奥 / 層2: 頭より手前。層の中はワールド奥行き (X+Y) 順。
 *   胴の判定はひねった上半身の向き (fU, LU) で行う。
 *   弓使いが使う (剣士は実験Bからの単純な点の奥行きソート)。
 */
// 頭: 横・縦の半径 r (縦は hz だけ伸ばして襟足の髪も覆う)。奥行きは顔側が平たく (rFace)、後頭部は丸い (r)
export const BODY_SHAPE = { A: 9, B: 16, head: { a: 1.5, z: 67, r: 17, hz: 6, rFace: 8 } };

export const LAYER = { torso: 500, cape: 600, head: 1500 };

export function bodyLayerKey(rf, a, b, z) {
  // a, b は上半身 (U) の座標。ひねり rf.turn を戻して脚の座標系 (W) にする
  const c = Math.cos(rf.turn), s = Math.sin(rf.turn);
  const w = bodyToWorld(rf.dir, a * c + b * s, -a * s + b * c);
  const at = w.X * rf.fU[0] + w.Y * rf.fU[1], bt = w.X * rf.LU[0] + w.Y * rf.LU[1];
  const vs = rf.fU[0] + rf.fU[1], vt = rf.LU[0] + rf.LU[1];
  const torsoFront = vs * at / (BODY_SHAPE.A ** 2) + vt * bt / (BODY_SHAPE.B ** 2) > 0;
  const H = BODY_SHAPE.head, hw = bodyToWorld(rf.dir, H.a * c, -H.a * s);
  const dX = w.X - hw.X, dY = w.Y - hw.Y, dz = z - H.z;
  const ez = Math.max(0, Math.abs(dz) - H.hz);
  const depth = (dX + dY) / Math.SQRT2, lat = (dY - dX) / Math.SQRT2, q = (lat * lat + ez * ez) / (H.r * H.r);
  const rD = a - H.a >= 0 ? H.rFace : H.r;   // [修正5] 顔の前 (顎の下の手・弦) が頭の内側扱いにならないように
  const headFront = q >= 1 ? depth > 0 : depth > rD * Math.sqrt(1 - q);
  return (!torsoFront ? 0 : headFront ? 2 : 1) * 1000 + (w.X + w.Y);
}

/** 床に平行な方向ベクトル (ワールド) → 画面の向き (床と同じ奥行き比。矢がワールドの軸に沿って見えるように) */
export const groundDirScreen = (X, Y) => ({ x: (X - Y) * KX, y: (X + Y) * KY_G() });

export const vlerp = (p, q, k) => p.map((v, i) => lerp(v, q[i], k));

export const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

/** q を u に直交化して正規化 */
export const orth3 = (q, u) => { const k = dot3(q, u); return nrm3([q[0] - k * u[0], q[1] - k * u[1], q[2] - k * u[2]]); };

/** 歩幅 (walkFeet の足の振れ幅 ±9) */
export const WALK_STRIDE = 9;
/**
 * 横向き (R / L) で足を滑らせないための「画面上を1px進む間に進めるアニメーション時間 (秒)」。
 * 前方向 a の1px は画面の横 cos(SIDE_VIEW_ANGLE) px。接地した足は1周期に 4 × 歩幅 だけ後ろへ動く。
 * ゲーム側は歩行の actionTime = 横に歩いた距離 (ワールド px) × この値 にする。
 */
export const sideWalkSecondsPerPixel = scale => 1 / (4 * WALK_STRIDE * WALK_HZ * Math.cos(SIDE_VIEW_ANGLE) * scale);
