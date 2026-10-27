/**
 * Inkstone — 手描きインク画風の横スクロール描画ライブラリ (公開 API)
 *
 * 新しいゲームからはこのファイルだけを import すればよい:
 *   import { createSideRenderer } from './src/index.js';
 *
 * 公開するもの:
 *   - createSideRenderer      横スクロールのステージとキャラクターを描く (ステージ: STAGE_DEFAULTS / normalizeStage / SIDE_THEMES)
 *   - createCharacterView     キャラクター1体を確認用に描く
 *   - キャラクター定義と登録   swordsman / archer / skeleton / BUILTIN_CHARACTERS / createCharacterRegistry / validateCharacter
 *   - 向き・動作の定数         SIDE_DIRECTIONS (右 R / 左 L) / ACTIONS_LIST
 *   - 描画プリミティブ (新しい職業を作るとき用) は ./authoring.js から
 */
export { createCharacterView } from './rendering/character-view.js';
export { createSideRenderer } from './side/renderer.js';
export { STAGE_DEFAULTS, normalizeStage, clampToStage } from './side/stage.js';
export { SIDE_THEMES, CHUNK as SIDE_CHUNK } from './side/background.js';
export { VIEW_HEIGHT as SIDE_VIEW_HEIGHT } from './side/camera.js';
export { createCharacterRegistry, validateCharacter, BUILTIN_CHARACTERS, frameKeysOf } from './characters/registry.js';
export { swordsman } from './characters/swordsman.js';
export { archer, ARCHER_ATTACK_KEYS } from './characters/archer.js';
export { skeleton } from './characters/skeleton.js';
export { sideWalkSecondsPerPixel, SIDE_VIEW_ANGLE, SIDE_CHEST_TURN } from './characters/rig.js';
export { PAL as PALETTE } from './core/palette.js';

/** 向き: 横スクロールの左右2方向 (sign = 画面の横の向き) */
export const SIDE_DIRECTIONS = Object.freeze({
  R: Object.freeze({ key: 'R', name: '右', sign: 1 }),
  L: Object.freeze({ key: 'L', name: '左', sign: -1 }),
});
/** 動作: 人型キャラクターの共通の3動作 */
export const ACTIONS_LIST = Object.freeze(['idle', 'walk', 'attack']);
/** ライブラリの版 */
export const VERSION = '0.1.0';
