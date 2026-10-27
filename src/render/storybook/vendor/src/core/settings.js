/**
 * Inkstone — 描画設定
 *
 * 実験Eでは CFG.boil (線のゆらぎ)・RIG.lw (線幅倍率)・RIG_FIX (足の滑り補正) がページ全体の大域変数で、
 * 画面ごとに書き換えていた。ライブラリではこれを1つの設定オブジェクト DRAW にまとめる。
 *
 * 描画関数 (人物・小物) は DRAW を読むだけ。値を決めるのは Renderer / CharacterView で、
 * 描く直前に自分の設定を書き込み、描き終わったら元に戻す (isolateDrawing)。
 * そのため、設定の違う複数の Renderer を同じページで交互に描いても状態が混ざらない。
 */
import { getRandomState, setRandomState } from './random.js';

export const DRAW = {
  lw: 1,               // 線幅の倍率 (拡大プレビューで細くするときに使う)
  boil: true,          // 線のゆらぎ: キャラの線を数fpsで描き直す「手描きアニメ」風の効果
  footGround: true,    // 足の接地補正 (足だけ床と同じ奥行き比で投影し、縦方向の滑りを消す)
  linearStance: true,  // 足の接地補正 (接地中の足を等速で後ろへ動かし、横方向の滑りを消す)
};
export const DRAW_DEFAULTS = Object.freeze({ ...DRAW });

/**
 * 描画設定と乱数状態を一時的に切り替えて fn を実行し、終わったら元に戻す。
 * @param {Partial<typeof DRAW>} settings
 * @param {() => T} fn
 * @returns {T}
 * @template T
 */
export function isolateDrawing(settings, fn) {
  const saved = { ...DRAW }, rng = getRandomState();
  Object.assign(DRAW, settings);
  try { return fn(); } finally { Object.assign(DRAW, saved); setRandomState(rng); }
}
