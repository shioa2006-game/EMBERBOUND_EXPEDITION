/**
 * Inkstone — 描画用のシード付き乱数 (mulberry32)
 *
 * 手描きの揺らぎ・点描・石の割り付けは、毎回同じ絵になるようシード付き乱数で決める。
 * 実験A〜Eの seed() / rnd() / R() / chance() と **まったく同じ数列** を返す
 * (元はクロージャに隠れていた状態を、保存・復元できるようモジュール変数に出しただけ)。
 *
 * - この状態はライブラリ内部専用で、Math.random やゲーム側の乱数には一切触れない。
 * - 描画関数の多くは描く直前に seed('部品名') で固定するので、呼び出し順に左右されない。
 * - Renderer は1回の描画の前後で状態を保存・復元する (getRandomState / setRandomState)。
 */
let _a = 1;

/** 文字列 → 32bit ハッシュ (FNV-1a) */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** 乱数を再シードする (数値 or 文字列) */
export function seed(s) { _a = typeof s === 'string' ? hashStr(s) : s; }
/** 0 以上 1 未満の乱数 */
export function rnd() {
  _a |= 0; _a = _a + 0x6D2B79F5 | 0;
  let t = Math.imul(_a ^ _a >>> 15, 1 | _a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
/** a 以上 b 未満の乱数 */
export const R = (a, b) => a + (b - a) * rnd();
/** 確率 p で true */
export const chance = p => rnd() < p;

/** 現在の乱数状態 (保存用の整数) */
export const getRandomState = () => _a;
/** 乱数状態を戻す */
export const setRandomState = s => { _a = s; };
