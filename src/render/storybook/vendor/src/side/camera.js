/**
 * Inkstone — 横スクロールのカメラ
 *
 *   論理座標 (CSS px) = ((x − cam.x × parallax) × s, groundY + y × s)
 *   デバイス座標      = 論理 × dpr
 * 倍率 s はキャンバスの高さから決める (縦に VIEW_HEIGHT ワールド px が映る)。地面は画面の高さの GROUND_RATIO の位置。
 * DOM に依存しない (テストから直接使える)。
 */

/** 縦に映るワールドの高さ (px)。キャラ (倍率 1.25 で約 125px) が画面の約 1/3 になる */
export const VIEW_HEIGHT = 360;
/** 地面の線の位置 (画面の高さに対する割合) */
export const GROUND_RATIO = 0.74;

export function createSideCamera({ width = 960, height = 540, dpr = 1 } = {}) {
  return fitSideCamera({ width, height, dpr, s: 1, x: 0, groundY: 0 });
}

/** キャンバスの大きさから倍率と地面の位置を決め直す */
export function fitSideCamera(cam) {
  cam.s = cam.height / VIEW_HEIGHT;
  cam.groundY = Math.round(cam.height * GROUND_RATIO);
  return cam;
}

/** 横に映るワールドの幅 (px) */
export const viewWidth = cam => cam.width / cam.s;

/** ステージの外を映さないように左端 cam.x を収める (ステージが画面より短ければ 0) */
export function clampCamera(cam, length) {
  cam.x = Math.max(0, Math.min(cam.x, Math.max(0, length - viewWidth(cam))));
  return cam;
}

/** target を画面の中央に置く */
export function centerCamera(cam, targetX, length) {
  cam.x = targetX - viewWidth(cam) / 2;
  return clampCamera(cam, length);
}

/**
 * 追従: target が画面中央の「遊び」(中央 ± zone × 画面幅) の外へ出たときだけ動かす。
 * ステージの端ではカメラが止まり、キャラは端まで歩ける。
 */
export function followCamera(cam, targetX, length, zone = 0.12) {
  const w = viewWidth(cam), left = cam.x + w * (0.5 - zone), right = cam.x + w * (0.5 + zone);
  if (targetX < left) cam.x = targetX - w * (0.5 - zone);
  else if (targetX > right) cam.x = targetX - w * (0.5 + zone);
  return clampCamera(cam, length);
}

/** ワールド (x, y) → 論理キャンバス座標 */
export const sideWorldToScreen = (cam, x, y = 0) => ({ x: (x - cam.x) * cam.s, y: cam.groundY + y * cam.s });
/** 論理キャンバス座標 → ワールド (x, y) */
export const sideScreenToWorld = (cam, px, py) => ({ x: px / cam.s + cam.x, y: (py - cam.groundY) / cam.s });

/** ワールド → デバイス px (parallax = 層の流れる速さ。1 = 主役の層) */
export const sideDevX = (cam, x, parallax = 1) => cam.dpr * cam.s * (x - cam.x * parallax);
export const sideDevY = (cam, y) => cam.dpr * (cam.groundY + cam.s * y);
