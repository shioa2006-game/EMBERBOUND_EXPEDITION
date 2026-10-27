/**
 * Inkstone — 横スクロールのステージデータ
 *
 * ワールド座標: x = ステージの左端からの距離 (右へ +)、y = 地面からの高さ (画面の下へ +、地面 = 0)。
 * 単位はワールド px (カメラ倍率 1 のとき 1 論理 px)。キャラクターの足元は y = 0 に立つ。
 */

/** 既定値。theme は背景の種類 (side/background.js の SIDE_THEMES のキー) */
export const STAGE_DEFAULTS = Object.freeze({
  id: '', name: '', length: 2400, start: 240, margin: 40, theme: 'placeholder',
});

/**
 * StageData → 内部形式 (省略した値を既定値で埋め、範囲を検査する)。
 * @param {object} s { id, name, length, start, margin, theme }
 */
export function normalizeStage(s = {}) {
  const v = k => s[k] ?? STAGE_DEFAULTS[k];
  const stage = { id: String(v('id')), name: v('name'), length: v('length'), start: v('start'), margin: v('margin'), theme: v('theme') };
  if (!(Number.isFinite(stage.length) && stage.length >= 200)) throw new Error('Inkstone: ステージの length は 200 以上の数にしてください');
  if (!(Number.isFinite(stage.margin) && stage.margin >= 0 && stage.margin * 2 < stage.length)) throw new Error('Inkstone: ステージの margin は 0 以上、length の半分未満にしてください');
  if (!(Number.isFinite(stage.start) && stage.start >= stage.margin && stage.start <= stage.length - stage.margin)) throw new Error('Inkstone: ステージの start は margin 〜 length − margin の範囲にしてください');
  if (typeof stage.theme !== 'string' || !stage.theme) throw new Error('Inkstone: ステージの theme (背景の種類) が必要です');
  return stage;
}

/** キャラクターが立てる範囲 [margin, length − margin] に x を収める */
export const clampToStage = (stage, x) => Math.max(stage.margin, Math.min(stage.length - stage.margin, x));
