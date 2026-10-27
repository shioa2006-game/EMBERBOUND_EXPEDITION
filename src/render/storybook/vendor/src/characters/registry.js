/**
 * Inkstone — キャラクター登録
 *
 * キャラクター定義 (CharacterDefinition) の形:
 *   {
 *     id: 'archer', label: '弓使い',
 *     kind: 'humanoid' | 'sprite',          // 共通人体リグで描くか、一枚絵か (説明用)
 *     directional: true,                    // false なら向きを持たない (左右反転 mirror だけ)。既定 true
 *     draw(ctx, x, y, direction, action, time, scale, opts) → 任意の情報,   // (x, y) = 足元
 *     actions: { idle: { period, frames }, walk: {...}, attack: { period, keys, once: true, releaseAt } },
 *     frameBox: { x0, x1, y0, y1 },         // Cached Frames の1コマの範囲 (足元を原点とするローカル px)
 *     projectile?: { type, releaseAt, origin(direction) → { nock: {x, y}, f: [fx, fy] }, draw(ctx, p, d, len, lw), length },
 *   }
 * 新しい職業は、定義ファイルを作って registry.register(def) するだけで追加できる (既存の職業のファイルは変更不要)。
 */
import { swordsman } from './swordsman.js';
import { archer } from './archer.js';
import { skeleton } from './skeleton.js';

/** ライブラリに含まれるキャラクター */
export const BUILTIN_CHARACTERS = Object.freeze([swordsman, archer, skeleton]);

/** 定義の検査 (足りない項目があれば、その名前を含むエラーにする) */
export function validateCharacter(def) {
  const fail = m => { throw new Error(`Inkstone: キャラクター定義 "${def && def.id}" — ${m}`); };
  if (!def || typeof def.id !== 'string' || !def.id) fail('id (文字列) が必要です');
  if (typeof def.draw !== 'function') fail('draw(ctx, x, y, direction, action, time, scale, opts) が必要です');
  if (!def.actions || !def.actions.idle) fail('actions.idle が必要です');
  for (const [name, a] of Object.entries(def.actions)) {
    if (!(a.period > 0)) fail(`actions.${name}.period (秒) は正の数にしてください`);
    if (a.keys) { if (!Array.isArray(a.keys) || !a.keys.length || a.keys[0] !== 0 || a.keys.some((u, i) => u < 0 || u >= 1 || (i && u <= a.keys[i - 1]))) fail(`actions.${name}.keys は 0 から始まる昇順の [0, 1) の位相にしてください`); }
    else if (!(a.frames >= 1)) fail(`actions.${name} には frames (等間隔のコマ数) か keys (位相の配列) が必要です`);
  }
  const b = def.frameBox;
  if (!b || !(b.x1 > b.x0 && b.y1 > b.y0)) fail('frameBox { x0, x1, y0, y1 } (x1 > x0, y1 > y0) が必要です');
  if (def.projectile && (typeof def.projectile.origin !== 'function' || typeof def.projectile.draw !== 'function')) fail('projectile には origin(direction) と draw(ctx, p, d, len, lw) が必要です');
  return def;
}

/**
 * 登録簿を作る。Renderer は1つずつ自分の登録簿を持つ (別の Renderer へ登録が漏れない)。
 * @param {Iterable<object>} initial 最初に登録する定義 (既定: 組み込みの3体)
 */
export function createCharacterRegistry(initial = BUILTIN_CHARACTERS) {
  const map = new Map(); let version = 0;
  const api = {
    /** 定義を登録する (同じ id があれば置き換え、その id のキャッシュは次の描画で作り直される) */
    register(def) { validateCharacter(def); map.set(def.id, def); version++; return def; },
    unregister(id) { const ok = map.delete(id); if (ok) version++; return ok; },
    get(id) { const d = map.get(id); if (!d) throw new Error(`Inkstone: 未登録のキャラクター "${id}" (登録済み: ${[...map.keys()].join(', ')})`); return d; },
    has: id => map.has(id),
    list: () => [...map.values()],
    get version() { return version; },
  };
  for (const d of initial) api.register(d);
  return api;
}

/** 動作のコマ割り: 各コマの開始位相 u (0 ≤ u < 1) の配列。keys があればそれ、なければ等間隔 frames 枚 */
export function frameKeysOf(spec) {
  if (spec.keys) return spec.keys;
  const n = spec.frames || 14; return Array.from({ length: n }, (_, i) => i / n);
}
/** そのキャラで再生する動作 (定義にない動作は idle で描く) */
export const resolveAction = (def, action) => (def.actions[action] ? action : 'idle');
