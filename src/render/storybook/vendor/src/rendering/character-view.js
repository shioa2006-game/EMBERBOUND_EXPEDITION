/**
 * Inkstone — CharacterView (キャラクター1体の確認用の描画)
 *
 * 部屋を使わず、1体を任意の倍率で描く。キャラクターの確認画面・新しい職業を作るときの確認に使う。
 * Live (ベクター) と Cached (その倍率で作ったコマ画像) を切り替えられる。
 * 部屋用の Renderer と同じく、描画設定・乱数状態・キャッシュ・登録簿をインスタンスごとに持つ。
 */
import { isolateDrawing } from '../core/settings.js';
import { seed } from '../core/random.js';
import { TW, TH } from '../core/geometry.js';
import { PAL } from '../core/palette.js';
import { fillPoly, roughen, stippleFace, strokePath } from '../core/ink.js';
import { DIRS, SIDE_DIR_ORDER } from '../characters/rig.js';
import { createCharacterRegistry, resolveAction, BUILTIN_CHARACTERS } from '../characters/registry.js';
import { createFrameCacheStore, modT } from './cache.js';
import { SHADOW_BOX, drawUnitShadow } from './effects.js';
import { defaultDpr } from './camera.js';

/** プレビュー用の足元の下敷き (斜めから見た床の1マス、実験B/D/Eの確認画面より)。dirKey があれば向きの矢印 */
function drawTile(g, cx, cy, k, dirKey, fill) {
  seed('tile' + Math.round(cx) + '_' + Math.round(cy));
  const hw = TW / 2 * k, hh = TH / 2 * k;
  const pts = [{ x: cx, y: cy - hh }, { x: cx + hw, y: cy }, { x: cx, y: cy + hh }, { x: cx - hw, y: cy }];
  fillPoly(g, pts, fill || PAL.floorA);
  stippleFace(g, pts[0], pts[1], pts[3], 1.6, { base: 0.15, edge: 0.8, fall: 8 });
  strokePath(g, roughen(pts, true, 0.6, 12), 1.4);
  if (dirKey) {
    const [fx, fy] = DIRS[dirKey].f, tip = { x: cx + (fx - fy) * hw * 0.36, y: cy + (fx + fy) * hh * 0.36 }, base = { x: cx - (fx - fy) * hw * 0.12, y: cy - (fx + fy) * hh * 0.12 };
    const ang = Math.atan2(tip.y - base.y, tip.x - base.x), ah = 8 * Math.min(1.4, k);
    g.save(); g.globalAlpha = 0.55; strokePath(g, [base, tip], 2.2, false, '#4f7442');
    fillPoly(g, [tip, { x: tip.x - Math.cos(ang - 0.45) * ah, y: tip.y - Math.sin(ang - 0.45) * ah }, { x: tip.x - Math.cos(ang + 0.45) * ah, y: tip.y - Math.sin(ang + 0.45) * ah }], '#4f7442'); g.restore();
  }
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {number} [o.width=400] @param {number} [o.height=470] 論理サイズ
 * @param {number} [o.dpr] @param {number} [o.scale=2.9] キャラの倍率 (ローカル px → 論理 px)
 * @param {'live'|'cached'} [o.mode='live'] @param {number} [o.lineScale=0.72] 線幅の倍率 (拡大表示では細くする)
 * @param {boolean} [o.lineBoil=true] @param {boolean} [o.footFix=true]
 * @param {object[]} [o.characters] 登録するキャラクター定義 (既定: 組み込み)
 * @param {object} [o.registry] 既存の登録簿を共有する場合 (Renderer.listCharacters と同じ内容を見せたいとき)
 * @param {string[]} [o.directions] Cached Frames で作る向き (既定: 横スクロールの左右 R / L)
 */
export function createCharacterView(o = {}) {
  if (!o.canvas) throw new Error('Inkstone: createCharacterView({ canvas }) にキャンバスを渡してください');
  const canvas = o.canvas, g = canvas.getContext('2d');
  const st = {
    width: o.width ?? 400, height: o.height ?? 470, dpr: o.dpr ?? defaultDpr(), scale: o.scale ?? 2.9, mode: o.mode === 'cached' ? 'cached' : 'live',
    draw: { lw: o.lineScale ?? 0.72, boil: o.lineBoil ?? true, footGround: o.footFix ?? true, linearStance: o.footFix ?? true },
    registry: o.registry || createCharacterRegistry(o.characters || BUILTIN_CHARACTERS), directions: o.directions || SIDE_DIR_ORDER,
  };
  st.caches = createFrameCacheStore(st.directions);
  const size = () => { canvas.width = st.width * st.dpr; canvas.height = st.height * st.dpr; canvas.style.width = st.width + 'px'; canvas.style.height = st.height + 'px'; };
  size();
  /** 射撃のあと飛んでいく矢 (確認画面用。ゲーム内と同じ速さ・向き。実験D・Eの drawPreviewArrow) */
  function previewProjectile(def, x, y, direction, t, S, speed) {
    const pj = def.projectile, A = def.actions.attack; if (!pj || !A) return null;
    const u = modT(t, A.period) / A.period; if (u < pj.releaseAt) return null;
    const info = pj.origin(direction), [fx, fy] = info.f;
    const v = { x: (fx - fy) * TW / 2, y: (fx + fy) * TH / 2 }, vl = Math.hypot(v.x, v.y), d = { x: v.x / vl, y: v.y / vl };
    const dist = (u - pj.releaseAt) * A.period * speed * vl * S / 1.25;
    const p = { x: x + info.nock.x * S + d.x * dist, y: y + info.nock.y * S + d.y * dist };
    for (let i = 1; i <= 3; i++) { const q = { x: p.x - d.x * (6 + i * 7) * S / 2, y: p.y - d.y * (6 + i * 7) * S / 2 }; strokePath(g, [q, { x: q.x - d.x * 9 * S / 2, y: q.y - d.y * 9 * S / 2 }], 1.1, false, PAL.ink, 0.35); }
    pj.draw(g, p, d, pj.length * S, S * st.draw.lw);
    return p;
  }
  return {
    get mode() { return st.mode; },
    setMode(m) { st.mode = m === 'cached' ? 'cached' : 'live'; },
    setScale(s) { st.scale = s; },
    setOptions({ lineBoil, footFix, lineScale } = {}) {
      if (lineBoil !== undefined) st.draw.boil = !!lineBoil;
      if (footFix !== undefined) st.draw.footGround = st.draw.linearStance = !!footFix;
      if (lineScale !== undefined) st.draw.lw = lineScale;
    },
    resize(width, height, dpr = st.dpr) { st.width = width; st.height = height; st.dpr = dpr; size(); },
    listCharacters: () => st.registry.list(),
    registerCharacter: def => st.registry.register(def),
    /**
     * 1体描く。(originX, originY) = 足元の論理座標 (既定: 中央下寄り)。
     * @returns 定義の draw が返す情報 (手・武器の位置など。Live のときだけ)
     */
    render({ character, direction = st.directions[0], action = 'idle', actionTime = 0, originX, originY, tile = true, background = PAL.paper, clear = true, clip = null, projectile = true, projectileSpeed = 9 } = {}) {
      const def = st.registry.get(character), act = resolveAction(def, action), S = st.scale;
      const X = originX ?? st.width / 2, Y = originY ?? st.height - 78;
      if (def.directional !== false && !DIRS[direction]) throw new Error(`Inkstone: direction は ${Object.keys(DIRS).join(' / ')} のどれか (受け取った値: ${direction})`);
      return isolateDrawing(st.draw, () => {
        seed('inkstone-view');
        g.save();
        g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        if (clip) { g.beginPath(); g.rect(clip.x, clip.y, clip.w, clip.h); g.clip(); }   // 一覧表示で隣のコマへはみ出さないように
        if (clear) { g.fillStyle = background; if (clip) g.fillRect(clip.x, clip.y, clip.w, clip.h); else g.fillRect(0, 0, st.width, st.height); }
        if (tile) drawTile(g, X, Y - 6, S * 0.57, def.directional === false ? null : direction, PAL.floorB);
        let info = null;
        if (st.mode === 'cached') {
          const k = S * st.dpr, e = st.caches.get(def, k, st.draw), c = st.caches.frame(e, direction, act, actionTime), box = def.frameBox;
          g.setTransform(1, 0, 0, 1, 0, 0);
          const sh = st.caches.shadowSprite(k);
          g.drawImage(sh, Math.round(X * st.dpr + SHADOW_BOX.x0 * k), Math.round(Y * st.dpr + SHADOW_BOX.y0 * k));
          g.drawImage(c, Math.round(X * st.dpr + box.x0 * k), Math.round(Y * st.dpr + box.y0 * k));
          g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        } else {
          g.save(); g.translate(X, Y); g.scale(S, S); drawUnitShadow(g); g.restore();
          info = def.draw(g, X, Y, direction, act, actionTime, S, { shadow: false });
        }
        if (projectile && act === 'attack' && def.projectile) previewProjectile(def, X, Y, direction, actionTime, S, projectileSpeed);
        g.restore();
        return info;
      });
    },
    /** キャッシュの状態 (RGBA 理論値) */
    getDiagnostics: () => ({ mode: st.mode, scale: st.scale, dpr: st.dpr, caches: st.caches.stats(), syncPauses: st.caches.pauses.slice() }),
    disposeCaches(ids) { st.caches.dispose(ids); },
    dispose() { st.caches.dispose(); },
  };
}
