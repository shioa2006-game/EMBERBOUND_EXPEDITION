/**
 * Inkstone — 制作者向けの道具 (新しい職業を作るとき用)
 *
 * ゲームを作るだけなら index.js だけでよい。新しいキャラクターや小物の「描き方」を書くときに、
 * 剣士・弓使いと同じ質感を出すための部品をここから import する (docs/CHARACTER_GUIDE.md)。
 */
// 乱数・設定
export { seed, rnd, R, chance } from './core/random.js';
export { DRAW } from './core/settings.js';
// 幾何
export { TAU, TW, TH, lerp, add, sub, mid, bbox, centroid, ellipsePts, convexHull, V } from './core/geometry.js';
export { PAL } from './core/palette.js';
// 手描き表現
export { roughen, roundedPoly, tracePath, fillPoly, fillPath, clipPath, strokePath, inkLine, inkShape, stippleFace, stipplePoly, rimWeight, hatchPoly, faceCracks } from './core/ink.js';
export { paint, paintA, taperPts, shadeOf, lightOf, mixHex, LW } from './core/paint.js';
// 共通人体リグ
export {
  cShape, cEllipse, cLine, shadeSide, limb, capsulePts, KX, KY, proj, footProj, DIRS, SIDE_DIR_ORDER, SIDE_VIEW_ANGLE, SIDE_CHEST_TURN, bodyToWorld,
  WALK_HZ, smooth, nrm3, keyframes, vlerp, dot3, orth3, walkFeet, rigFrame, yawToBody, chestToLegs, travelDir, renderRig, ik2, BODY_SHAPE, LAYER, bodyLayerKey, groundDirScreen,
} from './characters/rig.js';
export { mittenHand, legParts2 } from './characters/painting.js';
