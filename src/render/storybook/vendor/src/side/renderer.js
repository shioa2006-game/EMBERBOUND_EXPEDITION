/**
 * Inkstone — 横スクロール用の Renderer (背景とキャラクターの描画)
 *
 * ゲームから「ステージのデータ」と「毎フレームの状態 (誰がどこで何をしているか)」を受け取って描く。
 * 移動・攻撃・当たり判定などのゲームの規則は持たない (scroll/game.js などのゲーム側の責務)。
 *
 * 1フレームの描画順: 紙と奥の背景の層 → 背景の動き (松明の炎など) → 足元の影 → キャラクター (x の順) → 飛んでいる矢 → 前景の層
 * キャラクターは右向き R / 左向き L で描き、Cached Frames は左右2方向のコマを作る。
 * 描画の入口で描画設定と乱数状態を自分のものに切り替え、終わったら元に戻す (isolateDrawing)。
 */
import { isolateDrawing } from '../core/settings.js';
import { seed } from '../core/random.js';
import { PAL } from '../core/palette.js';
import { strokePath } from '../core/ink.js';
import { SIDE_DIR_ORDER } from '../characters/rig.js';
import { createCharacterRegistry, resolveAction, BUILTIN_CHARACTERS } from '../characters/registry.js';
import { createFrameCacheStore } from '../rendering/cache.js';
import { SHADOW_BOX, drawUnitShadow } from '../rendering/effects.js';
import { defaultDpr } from '../rendering/camera.js';
import { normalizeStage } from './stage.js';
import { createSideCamera, fitSideCamera, centerCamera, followCamera, sideDevX, sideDevY, sideWorldToScreen, sideScreenToWorld } from './camera.js';
import { createSideBackground } from './background.js';

const MODES = ['live', 'cached'];

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {'live'|'cached'} [o.mode='live']
 * @param {number} [o.width=960] @param {number} [o.height=540] 論理キャンバスの大きさ (CSS px)
 * @param {number} [o.dpr] 既定は min(2, devicePixelRatio)
 * @param {number} [o.characterScale=1.25] キャラの表示倍率 (ワールド px / キャラのローカル px)
 * @param {number} [o.footOffset=0] 足元を下げる描画だけの補正 (ワールド px)
 * @param {boolean} [o.lineBoil=true] @param {boolean} [o.footFix=true]
 * @param {object[]} [o.characters] 最初に登録するキャラクター定義
 * @param {object} [o.stage] 最初のステージ (setStage と同じ)
 */
export function createSideRenderer(o = {}) {
  if (!o.canvas || typeof o.canvas.getContext !== 'function') throw new Error('Inkstone: createSideRenderer({ canvas }) に描画先のキャンバスを渡してください');
  const canvas = o.canvas, ctx = canvas.getContext('2d');
  const cam = createSideCamera({ width: o.width ?? 960, height: o.height ?? 540, dpr: o.dpr ?? defaultDpr() });
  const st = {
    mode: MODES.includes(o.mode) ? o.mode : 'live', characterScale: o.characterScale ?? 1.25, footOffset: o.footOffset ?? 0,
    draw: { lw: 1, boil: o.lineBoil ?? true, footGround: o.footFix ?? true, linearStance: o.footFix ?? true },
    registry: createCharacterRegistry(o.characters || BUILTIN_CHARACTERS),
    caches: createFrameCacheStore(SIDE_DIR_ORDER), stage: null, background: null, disposed: false,
    last: { totalMs: 0, characterMs: 0, warnings: [] },
  };
  const k = () => st.characterScale * cam.s * cam.dpr;
  const alive = () => { if (st.disposed) throw new Error('Inkstone: dispose() 済みの Renderer です'); };
  const applyCanvasSize = () => { canvas.width = Math.round(cam.width * cam.dpr); canvas.height = Math.round(cam.height * cam.dpr); };
  applyCanvasSize();

  /** 足元のデバイス座標 (整数)。背景の区画と同じく整数にそろえてにじみを防ぐ */
  const feet = x => ({ F: Math.round(sideDevX(cam, x)), B: Math.round(sideDevY(cam, st.footOffset)) });
  function drawShadow(u) {
    const { F, B } = feet(u.x);
    if (st.mode === 'cached') {
      const kk = k(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(st.caches.shadowSprite(kk), Math.round(F + SHADOW_BOX.x0 * kk), Math.round(B + SHADOW_BOX.y0 * kk));
    } else { const kk = k(); ctx.setTransform(kk, 0, 0, kk, F, B); drawUnitShadow(ctx); }
  }
  function drawUnit(u, def, action, t) {
    const { F, B } = feet(u.x), dir = def.directional === false ? null : u.direction;
    if (st.mode === 'cached') {
      const kk = k(), box = def.frameBox, c = st.caches.frame(st.caches.get(def, kk, st.draw), dir, action, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, Math.round(F + box.x0 * kk), Math.round(B + box.y0 * kk));
      return;
    }
    const s = cam.dpr * cam.s; ctx.setTransform(s, 0, 0, s, F, B);
    def.draw(ctx, 0, 0, dir, action, t, st.characterScale, { shadow: false });
  }
  /** 飛んでいる矢: 放った位置 (矢筈) から進行方向へ画面の水平に distance 進む */
  function drawProjectile(pr) {
    const def = st.registry.get(pr.character), pj = def.projectile;
    if (!pj) throw new Error(`Inkstone: "${def.id}" には projectile の定義がありません`);
    const info = pj.origin(pr.direction), sign = pr.direction === 'L' ? -1 : 1, S = st.characterScale;
    const p = { x: pr.x + info.nock.x * S + sign * (pr.distance ?? 0), y: st.footOffset + info.nock.y * S }, d = { x: sign, y: 0 };
    const s = cam.dpr * cam.s; ctx.setTransform(s, 0, 0, s, -s * cam.x, cam.dpr * cam.groundY);
    for (let i = 1; i <= 3; i++) {   // speed lines behind the nock
      const q = { x: p.x - d.x * (6 + i * 7) * S / 1.25, y: p.y + (i - 2) * 2.2 };
      strokePath(ctx, [q, { x: q.x - d.x * 9 * S / 1.25, y: q.y }], 1.1, false, PAL.ink, .35);
    }
    pj.draw(ctx, p, d, pj.length * S, S * st.draw.lw);
  }
  function checkUnit(u, def) {
    if (def.directional !== false && !SIDE_DIR_ORDER.includes(u.direction)) throw new Error(`Inkstone: unit "${u.id}" の direction は R / L にしてください (受け取った値: ${u.direction})`);
    if (!Number.isFinite(u.x)) throw new Error(`Inkstone: unit "${u.id}" の x (ステージ上の位置) が数値ではありません`);
  }

  const api = {
    get canvas() { return canvas; },
    get mode() { return st.mode; },
    get stage() { return st.stage; },
    get characterScale() { return st.characterScale; },

    /** ステージを設定する (背景を作り直し、カメラを開始位置の中央へ) */
    setStage(stageData) {
      alive(); st.stage = normalizeStage(stageData);
      st.background?.dispose(); st.background = createSideBackground(st.stage);
      centerCamera(cam, st.stage.start, st.stage.length); return api;
    },
    setMode(mode) { alive(); if (!MODES.includes(mode)) throw new Error(`Inkstone: mode は ${MODES.join(' / ')}`); st.mode = mode; return api; },
    setOptions({ lineBoil, footFix } = {}) {
      alive();
      if (lineBoil !== undefined) st.draw.boil = !!lineBoil;
      if (footFix !== undefined) st.draw.footGround = st.draw.linearStance = !!footFix;
      return api;
    },
    getOptions: () => ({ mode: st.mode, lineBoil: st.draw.boil, footFix: st.draw.footGround, characterScale: st.characterScale, footOffset: st.footOffset }),

    /* ---- カメラ ---- */
    /** 追従 (画面中央の遊びの外へ出たときだけ動く。ステージの端で止まる) */
    follow(x, zone) { alive(); if (st.stage) followCamera(cam, x, st.stage.length, zone); return api; },
    /** x を画面の中央に置く */
    centerOn(x) { alive(); if (st.stage) centerCamera(cam, x, st.stage.length); return api; },
    getCamera: () => ({ x: cam.x, scale: cam.s, groundY: cam.groundY, dpr: cam.dpr, width: cam.width, height: cam.height }),
    resize(width, height, dpr = cam.dpr) {
      alive(); cam.width = width; cam.height = height; cam.dpr = dpr; fitSideCamera(cam); applyCanvasSize();
      if (st.stage) centerCamera(cam, cam.x + cam.width / cam.s / 2, st.stage.length);
      return api;
    },
    worldToScreen: (x, y = 0) => sideWorldToScreen(cam, x, y),
    screenToWorld: (px, py) => sideScreenToWorld(cam, px, py),

    /* ---- キャラクター登録・キャッシュ ---- */
    registerCharacter: def => { alive(); return st.registry.register(def); },
    getCharacter: id => st.registry.get(id),
    hasCharacter: id => st.registry.has(id),
    listCharacters: () => st.registry.list(),
    prepareCaches(ids) {
      alive();
      return isolateDrawing(st.draw, () => {
        const out = {}, kk = k();
        for (const id of ids || st.registry.list().map(d => d.id)) { const e = st.caches.get(st.registry.get(id), kk, st.draw); out[id] = { frames: e.count, bytesRGBA: e.bytes, buildMs: e.ms }; }
        st.caches.shadowSprite(kk); return out;
      });
    },
    disposeCaches(ids) { st.caches.dispose(ids); return api; },

    /**
     * 1フレーム描く。
     * @param {object} f
     * @param {number} [f.timeSeconds=0]
     * @param {object[]} [f.units] [{ id, character, x, direction: 'R'|'L', action, actionTime }]
     * @param {object[]} [f.projectiles] [{ id?, character, x (放ったキャラの足元), direction, distance }]
     */
    render(f = {}) {
      alive();
      if (!st.background) throw new Error('Inkstone: 先に setStage(stageData) でステージを設定してください');
      return isolateDrawing(st.draw, () => {
        seed('inkstone-side-frame');
        const t0 = performance.now(), warnings = [], items = [];
        st.background.drawBack(ctx, cam, f.timeSeconds ?? 0);
        for (const u of f.units || []) {
          const def = st.registry.get(u.character); checkUnit(u, def);
          const action = resolveAction(def, u.action || 'idle');
          if (action !== (u.action || 'idle')) warnings.push(`${u.id}: ${def.id} には動作 "${u.action}" がないため idle で描画`);
          items.push({ u, def, action, t: u.actionTime ?? 0 });
        }
        items.sort((a, b) => a.u.x - b.u.x);
        const c0 = performance.now();
        for (const it of items) drawShadow(it.u);
        for (const it of items) drawUnit(it.u, it.def, it.action, it.t);
        const characterMs = performance.now() - c0;
        for (const pr of f.projectiles || []) drawProjectile(pr);
        st.background.drawFront(ctx, cam);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        st.last = { totalMs: performance.now() - t0, characterMs, warnings };
        return st.last;
      });
    },

    getDiagnostics() {
      return {
        mode: st.mode, options: api.getOptions(), camera: api.getCamera(), characterFrameScale: k(), stage: st.stage,
        lastFrame: { ...st.last }, background: st.background?.stats() ?? null,
        caches: st.caches.stats(), syncPauses: st.caches.pauses.slice(),
        memoryNote: 'bytesRGBA は幅×高さ×4 の理論値。ブラウザの実メモリ (GPU 側の複製などを含む) とは異なる',
      };
    },
    dispose() {
      if (st.disposed) return;
      st.caches.dispose(); st.background?.dispose(); st.background = null; st.disposed = true;
    },
  };
  if (o.stage) api.setStage(o.stage);
  return api;
}
