/**
 * Inkstone — 手描き表現のプリミティブ: 揺らぎ線・角丸・塗り・二度描き・点描・ハッチング・紙・ひび
 *   すべて描画用の乱数 (core/random.js) を消費する。実験A〜Eと同じコード
 */
import { R, chance, rnd, seed } from './random.js';
import { TAU, V, bbox, centroid, mid, sub } from './geometry.js';
import { PAL } from './palette.js';

/** 折れ線を細分化し、法線方向へ低周波+微小ノイズでずらす → ペンの揺らぎ */
export function roughen(pts, closed = true, amp = 1, step = 12) {
  const out = [], n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const k = Math.max(1, Math.round(len / step));
    const nx = -dy / len, ny = dx / len;
    const ph = R(0, TAU), fq = R(2, 5);
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const off = amp * (0.65 * Math.sin(ph + t * fq) + R(-0.35, 0.35)) * (j === 0 ? 0.35 : 1);
      out.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
    }
  }
  if (!closed) {
    const l = pts[n - 1];
    out.push({ x: l.x + R(-amp, amp) * 0.3, y: l.y + R(-amp, amp) * 0.3 });
  }
  return out;
}

/** 多角形の角を丸める (石の角の欠け・丸みを表現)。r は数値 or 角ごとに呼ばれる関数 */
export function roundedPoly(pts, r) {
  if (!r) return pts.slice();
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const d0 = Math.hypot(p0.x - p1.x, p0.y - p1.y) || 1;
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const ri = typeof r === 'function' ? r(i) : r;
    const k0 = Math.min(ri / d0, 0.45), k2 = Math.min(ri / d2, 0.45);
    const A = { x: p1.x + (p0.x - p1.x) * k0, y: p1.y + (p0.y - p1.y) * k0 };
    const B = { x: p1.x + (p2.x - p1.x) * k2, y: p1.y + (p2.y - p1.y) * k2 };
    for (let s = 0; s <= 3; s++) {
      const t = s / 3, u = 1 - t;
      out.push({ x: u * u * A.x + 2 * u * t * p1.x + t * t * B.x, y: u * u * A.y + 2 * u * t * p1.y + t * t * B.y });
    }
  }
  return out;
}

/** 中点を通る二次曲線でなめらかにパスを引く (ガタガタを「線」に見せる) */
export function tracePath(ctx, pts, closed = true) {
  const n = pts.length; if (n < 2) return;
  ctx.beginPath();
  if (closed) {
    const m0 = mid(pts[n - 1], pts[0]);
    ctx.moveTo(m0.x, m0.y);
    for (let i = 0; i < n; i++) {
      const p = pts[i], m = mid(p, pts[(i + 1) % n]);
      ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n - 1; i++) {
      const m = mid(pts[i], pts[i + 1]);
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y);
    }
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
  }
}

/** 直線多角形の塗り (面の塗り分け用。揺らぎなし) */
export function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath(); ctx.fill();
}

export function fillPath(ctx, pts, color) { ctx.fillStyle = color; tracePath(ctx, pts, true); ctx.fill(); }

export function clipPath(ctx, pts) { tracePath(ctx, pts, true); ctx.clip(); }

export function strokePath(ctx, pts, w = 1.6, closed = true, color = PAL.ink, alpha = 1) {
  ctx.lineWidth = w; ctx.strokeStyle = color; ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  tracePath(ctx, pts, closed); ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * インク線: 揺らぎ + 部分的な二度描き(線の太さムラ)
 * @returns 揺らぎ後の点列 (クリップ等に再利用可)
 */
export function inkLine(ctx, pts, o = {}) {
  const { w = 1.6, amp = 0.8, closed = false, step = 12, color = PAL.ink, alpha = 1, double = 0.6 } = o;
  const r = roughen(pts, closed, amp, step);
  strokePath(ctx, r, w, closed, color, alpha);
  if (double > 0 && r.length > 3 && chance(double)) {
    // ランダムな区間だけ少しずらして重ね描き → 筆圧のムラ
    const s = Math.floor(R(0, r.length * 0.5));
    const e = Math.min(r.length, s + Math.max(3, Math.floor(R(0.3, 0.7) * r.length)));
    const ox = R(-0.7, 0.7), oy = R(-0.7, 0.7);
    const part = r.slice(s, e).map(p => ({ x: p.x + ox, y: p.y + oy }));
    if (part.length > 1) strokePath(ctx, part, w * 0.6, false, color, alpha * 0.6);
  }
  return r;
}

/**
 * 形状: 角丸 → 揺らぎ → 塗り → 輪郭。戻り値は輪郭点列。
 */
export function inkShape(ctx, pts, o = {}) {
  const { fill = PAL.paper, w = 1.8, amp = 0.8, round = 0, step = 10, stroke = true } = o;
  const r = roughen(roundedPoly(pts, round), true, amp, step);
  if (fill) fillPath(ctx, r, fill);
  if (stroke) {
    strokePath(ctx, r, w);
    if (chance(0.6)) { // 輪郭の一部だけ二度描き
      const s = Math.floor(R(0, r.length)), len = Math.floor(r.length * R(0.2, 0.45));
      const part = []; for (let i = 0; i < len; i++) part.push(r[(s + i) % r.length]);
      const ox = R(-0.6, 0.6), oy = R(-0.6, 0.6);
      strokePath(ctx, part.map(p => ({ x: p.x + ox, y: p.y + oy })), w * 0.55, false, PAL.ink, 0.55);
    }
  }
  return r;
}

/** 点描の1ドット: 細かい点・やや大きい点・稀に「穴」っぽい黒い粒 */
export function dot(ctx, x, y, scale = 1) {
  const r = rnd();
  if (r < 0.05) {
    ctx.globalAlpha = 0.92; ctx.beginPath();
    ctx.ellipse(x, y, R(1.1, 2.4) * scale, R(0.8, 1.6) * scale, R(0, TAU), 0, TAU); ctx.fill();
  } else if (r < 0.32) {
    ctx.globalAlpha = R(0.6, 0.95); ctx.beginPath();
    ctx.arc(x, y, R(0.7, 1.25) * scale, 0, TAU); ctx.fill();
  } else {
    ctx.globalAlpha = R(0.35, 0.85);
    const s = R(0.8, 1.5) * scale; ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
}

/**
 * 平行四辺形の面に点描する。A=左上, B=右上, D=左下。
 * 縁ほど濃く(edge/fall)、下ほど濃く(vgrad)して石の量感を出す。
 * o.wfn(u,v) を渡せば任意の密度関数にできる。
 */
export function stippleFace(ctx, A, B, D, density, o = {}) {
  const U = sub(B, A), V = sub(D, A);
  const area = Math.abs(U.x * V.y - U.y * V.x);
  const base = o.base ?? 0.3, edge = o.edge ?? 0.7, fall = o.fall ?? 7, vgrad = o.vgrad ?? 0;
  const n = Math.round(area * density / 100);
  ctx.fillStyle = o.color || PAL.ink;
  for (let i = 0; i < n; i++) {
    const u = rnd(), v = rnd();
    const w = o.wfn ? o.wfn(u, v)
      : base + edge * Math.exp(-Math.min(u, 1 - u, v, 1 - v) * fall) + vgrad * v;
    if (rnd() > w) continue;
    const x = A.x + U.x * u + V.x * v, y = A.y + U.y * u + V.y * v;
    dot(ctx, x, y, o.scale || 1);
    if (rnd() < 0.02) for (let k = 0; k < 4; k++) dot(ctx, x + R(-3, 3), y + R(-2, 2), 0.8); // 小さな塊
  }
  ctx.globalAlpha = 1;
}

/** 任意多角形への点描 (クリップ使用)。o.wfn(x,y) で密度を変えられる */
export function stipplePoly(ctx, pts, density, o = {}) {
  const bb = bbox(pts);
  const n = Math.round((bb.x1 - bb.x0) * (bb.y1 - bb.y0) * density / 100);
  ctx.save(); clipPath(ctx, pts);
  ctx.fillStyle = o.color || PAL.ink;
  for (let i = 0; i < n; i++) {
    const x = R(bb.x0, bb.x1), y = R(bb.y0, bb.y1);
    if (o.wfn && rnd() > o.wfn(x, y)) continue;
    dot(ctx, x, y, o.scale || 1);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 多角形の中心から縁へ向かって濃くなる密度関数を作る */
export function rimWeight(pts, base = 0.25, edge = 0.9) {
  const c = centroid(pts); let dm = 1;
  for (const p of pts) dm = Math.max(dm, Math.hypot(p.x - c.x, p.y - c.y));
  return (x, y) => base + edge * Math.pow(Math.hypot(x - c.x, y - c.y) / dm, 2);
}

/** ハッチング: クリップ内に揺らいだ平行線を引く (影・暗部用) */
export function hatchPoly(ctx, pts, o = {}) {
  const { angle = -0.6, gap = 4, w = 0.8, alpha = 0.75, amp = 0.5, color = PAL.ink, jitter = 0.25 } = o;
  const bb = bbox(pts);
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  const rad = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2 + 4;
  const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
  ctx.save(); clipPath(ctx, pts);
  for (let s = -rad; s <= rad; s += gap * R(1 - jitter, 1 + jitter)) {
    const p0 = { x: cx + nx * s - dx * rad, y: cy + ny * s - dy * rad };
    const p1 = { x: cx + nx * s + dx * rad, y: cy + ny * s + dy * rad };
    strokePath(ctx, roughen([p0, p1], false, amp, 10), w * R(0.8, 1.2), false, color, alpha * R(0.7, 1));
  }
  ctx.restore();
}

/** 紙: 生成りの地 + 繊維っぽい粒 + うっすら周辺減光。W×H = 論理キャンバスの大きさ */
export function drawPaper(ctx, W, H) {
  seed('paper');
  ctx.fillStyle = PAL.paper; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rnd() < 0.55 ? 'rgba(120,108,90,0.07)' : 'rgba(255,255,255,0.5)';
    ctx.fillRect(R(0, W), R(0, H), R(0.6, 1.8), R(0.6, 1.8));
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
  g.addColorStop(0, 'rgba(90,80,60,0)'); g.addColorStop(1, 'rgba(90,80,60,0.10)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/** 面の上辺から垂れる「V字のひび」や細いクラック (参考画像の石の質感) */
export function faceCracks(ctx, A, B, D, prob = 0.55) {
  const U = sub(B, A), V = sub(D, A);
  const wpx = Math.hypot(U.x, U.y), hpx = Math.hypot(V.x, V.y);
  if (wpx < 14 || hpx < 12) return;
  const P = (u, v) => ({ x: A.x + U.x * u + V.x * v, y: A.y + U.y * u + V.y * v });
  if (chance(prob)) { // 上辺から垂れるV/W字
    const u0 = R(0.15, 0.75), du = 4 / wpx, dv = Math.min(0.5, R(7, 13) / hpx);
    const pts = [P(u0, 0), P(u0 + du, dv), P(u0 + du * 2, dv * 0.25)];
    if (chance(0.5)) pts.push(P(u0 + du * 3, dv * 0.8), P(u0 + du * 4, 0));
    inkLine(ctx, pts, { w: 1.1, amp: 0.3, step: 5, double: 0 });
  }
  if (chance(prob * 0.45)) { // 細いひび
    let u = R(0.1, 0.9), v = chance(0.5) ? 0 : 1;
    const dir = v === 0 ? 1 : -1;
    const pts = [P(u, v)];
    for (let k = 0; k < 3; k++) {
      u += R(-6, 6) / wpx; v += dir * R(4, 8) / hpx;
      pts.push(P(Math.min(0.95, Math.max(0.05, u)), Math.min(1, Math.max(0, v))));
    }
    inkLine(ctx, pts, { w: 0.8, amp: 0.3, step: 4, double: 0 });
  }
}
