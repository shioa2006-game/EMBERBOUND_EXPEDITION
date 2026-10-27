/**
 * Inkstone — Cached Frames (キャラのコマ画像のキャッシュ)
 *
 * キャッシュは「描画結果」を保持するだけで、姿勢は決めない。どのコマを貼るかは
 * 定義の動作 (period・コマ割り) と、ゲームから渡された actionTime だけで決まる。
 *
 * - 1つのストアは1つの Renderer (または CharacterView) が持つ。同じ職業の複数体は同じコマを共有する。
 * - コマは「倍率 k (= キャラの倍率 × カメラ倍率 × DPR)」と「描画設定 (線幅・ゆらぎ・足の補正)」と
 *   「定義そのもの」に依存する。どれかが変われば、次に使うときにその職業のコマを作り直す (古いコマは破棄)。
 * - 容量は幅 × 高さ × 4 (RGBA の理論値)。ブラウザが実際に使うメモリ (GPU 側の複製など) とは別物。
 * - 生成は同期処理 (その間は画面が止まる)。生成にかかった時間を pauses に記録する。
 * - 生成する向きはストアごとに決める (既定: 横スクロールの左右2方向)。
 */
import { SIDE_DIR_ORDER } from '../characters/rig.js';
import { frameKeysOf } from '../characters/registry.js';
import { SHADOW_BOX, drawUnitShadow } from './effects.js';

/**
 * キャラのコマ1枚: ローカル座標の箱 box を k 倍 (= キャラの倍率 × カメラ倍率 × DPR) で描く。
 * 足元 (0, 0) が箱の中の (−box.x0, −box.y0) × k に来る。
 */
export function frameCanvas(k, box, draw) {
  const c = document.createElement('canvas');
  c.width = Math.ceil((box.x1 - box.x0) * k); c.height = Math.ceil((box.y1 - box.y0) * k);
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, -box.x0 * k, -box.y0 * k); draw(g);
  return c;
}

export const modT = (t, p) => ((t % p) + p) % p;
/** 時刻 → コマ番号 (そのコマの開始位相 ≦ 現在の位相 となる最後のコマ) */
export function frameIndexOf(keys, u) { let i = 0; while (i + 1 < keys.length && keys[i + 1] <= u) i++; return i; }

/** @param {string[]} [directions] コマを作る向き (DIRS のキー) */
export function createFrameCacheStore(directions = SIDE_DIR_ORDER) {
  const entries = new Map();   // id → { def, key, k, frames, keys, count, bytes, ms, frameW, frameH }
  const pauses = [];           // 同期生成の記録 [{ id, ms, frames, at }]
  let shadow = null;           // { k, c } 足元の影のスプライト
  const keyOf = (k, draw) => `${k}|${draw.lw}|${draw.boil}|${draw.footGround}|${draw.linearStance}`;

  function build(def, k, draw) {
    const t0 = performance.now(), frames = {}, keys = {}, dirs = def.directional === false ? [''] : directions;
    let count = 0, bytes = 0;
    for (const a of Object.keys(def.actions)) {
      keys[a] = frameKeysOf(def.actions[a]);
      for (const d of dirs) {
        frames[d + a] = keys[a].map(u => {
          const c = frameCanvas(k, def.frameBox, g => def.draw(g, 0, 0, d || null, a, u * def.actions[a].period, 1, { shadow: false }));
          count++; bytes += c.width * c.height * 4; return c;
        });
      }
    }
    const first = frames[(dirs[0]) + 'idle'][0];
    const e = { def, key: keyOf(k, draw), k, frames, keys, count, bytes, ms: performance.now() - t0, frameW: first.width, frameH: first.height };
    pauses.push({ id: def.id, ms: e.ms, frames: count, at: performance.now() });
    if (pauses.length > 50) pauses.shift();
    return e;
  }
  const release = e => { for (const list of Object.values(e.frames)) for (const c of list) { c.width = 0; c.height = 0; } };

  return {
    /** その職業のコマ一式 (なければ・古ければ作る) */
    get(def, k, draw) {
      let e = entries.get(def.id);
      if (!e || e.def !== def || e.key !== keyOf(k, draw)) { if (e) release(e); e = build(def, k, draw); entries.set(def.id, e); }
      return e;
    },
    /** 作り直さずに参照だけする (なければ undefined) */
    peek: id => entries.get(id),
    /** 時刻 t のコマ。direction は向きを持たない定義では無視 */
    frame(e, direction, action, t) {
      const spec = e.def.actions[action], list = e.frames[(e.def.directional === false ? '' : direction) + action];
      if (!list) throw new Error(`Inkstone: "${e.def.id}" の向き "${direction}" のコマはありません (このキャッシュの向き: ${directions.join(' / ')})`);
      const u = modT(t, spec.period) / spec.period;
      return list[spec.index === 'floor' ? Math.floor(u * list.length) % list.length : frameIndexOf(e.keys[action], u)];
    },
    /** 足元の影のスプライト (倍率 k ごと) */
    shadowSprite(k) {
      if (!shadow || shadow.k !== k) shadow = { k, c: frameCanvas(k, SHADOW_BOX, drawUnitShadow) };
      return shadow.c;
    },
    /** 破棄: ids を省略すると全部 (影も) */
    dispose(ids) {
      for (const id of ids || [...entries.keys()]) { const e = entries.get(id); if (e) { release(e); entries.delete(id); } }
      if (!ids) shadow = null;
    },
    /** 状態: 職業ごとのコマ数・RGBA 理論値・生成時間 */
    stats() {
      const out = {}; let frames = 0, bytes = 0;
      for (const [id, e] of entries) { out[id] = { frames: e.count, bytesRGBA: e.bytes, buildMs: e.ms, frameW: e.frameW, frameH: e.frameH, k: e.k }; frames += e.count; bytes += e.bytes; }
      if (shadow) bytes += shadow.c.width * shadow.c.height * 4;
      return { characters: out, totalFrames: frames, totalBytesRGBA: bytes };
    },
    pauses,
    directions,
  };
}
