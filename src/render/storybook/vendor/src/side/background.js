/**
 * Inkstone — 横スクロールの背景 (層ごとの区画キャッシュ)
 *
 * 背景は層 (遠景・中景・主役の層 …) の重ね合わせ。層は parallax の速さで流れる (主役の層 = 1、奥ほど小さい)。
 * 点描の多い手描きは重いので、毎フレームは描かない。層を幅 CHUNK 論理 px の区画に切って画像に焼き込み、
 * 映っている区画だけを貼る。区画は倍率・DPR・キャンバスの大きさ・ステージが変わったときに作り直す。
 *
 * テーマの層 = { id, parallax, draw(g, view), front?, opacity?, band?, spans?, dynamic?(g, view, time) }。
 *   draw    : 区画に焼き込む静的な絵。g は区画に合わせて変換済みで、層の座標 (x = 層の上の位置、y = 地面からの高さ。下へ +)
 *             でそのまま描ける。view = { x0, x1 (この区画の層の座標の範囲), top, bottom, stage, parallax }。
 *             区画の境界をまたぐ部品も両側の区画で同じ形になるよう、部品ごとに乱数の種を決めて描くこと (seed('層-番号') など)。
 *   front   : true ならキャラクターより手前に描く前景 (drawFront)。それ以外はキャラクターの奥 (drawBack)
 *   opacity : 区画を貼るときの不透明度 (遠景を淡くする。既定 1)
 *   band    : [上端, 下端] この層が描く高さの範囲 (ワールド y。null = 画面の端)。区画をその帯の高さだけ作り、メモリを減らす
 *   spans   : stage => [[x0, x1], …] 絵がある範囲 (層の座標)。指定すると範囲外の区画は作らない (ステージ両端の壁など)
 *   dynamic : 毎フレーム描く軽い動き (松明の炎など)。view は画面に映る範囲。区画には焼き込まない
 */
import { drawPaper } from '../core/ink.js';
import { placeholderTheme } from './themes/placeholder.js';
import { dungeonTheme } from './themes/dungeon.js';
import { forestTheme } from './themes/forest.js';
import { townTheme } from './themes/town.js';

/** 区画の幅 (論理 px) */
export const CHUNK = 512;

/** 背景のテーマ (ステージの theme で選ぶ) */
export const SIDE_THEMES = { dungeon: dungeonTheme, forest: forestTheme, town: townTheme, placeholder: placeholderTheme };

/** 区画の幅 (デバイス px, 整数)。隣り合う区画が継ぎ目なく並ぶよう整数にそろえる */
export const chunkDeviceWidth = cam => Math.round(CHUNK * cam.dpr);

/**
 * 層のうち画面に映る区画の番号の範囲。offset = 層の左端のずれ (デバイス px, 整数)。
 * DOM に依存しない (テストから直接使える)。
 */
export function visibleChunks(cam, parallax) {
  const wd = chunkDeviceWidth(cam), offset = Math.round(cam.dpr * cam.s * cam.x * parallax);
  return { first: Math.floor(offset / wd), last: Math.floor((offset + cam.width * cam.dpr - 1) / wd), offset, wd };
}

/**
 * ステージの背景を作る。drawBack(ctx, cam, time) で紙 → 奥の層 → 動き、drawFront(ctx, cam) で前景を貼る。
 * @param {object} stage normalizeStage 済みのステージ
 */
export function createSideBackground(stage) {
  const theme = SIDE_THEMES[stage.theme];
  if (!theme) throw new Error(`Inkstone: 未登録の背景テーマ "${stage.theme}" (登録済み: ${Object.keys(SIDE_THEMES).join(', ')})`);
  const chunks = new Map();   // `${layer}:${i}` → { c, y } (y = device top of the band) or null (nothing to draw)
  const lastOffset = new Map(), heading = new Map();   // per layer: previous offset and scroll direction (-1, 0, 1)
  let key = '', paper = null, bakeMs = 0, baked = 0;
  const release = c => { c.width = 0; c.height = 0; };
  function reset(cam) {
    const k = `${cam.width}|${cam.height}|${cam.dpr}|${cam.s}|${cam.groundY}`;
    if (k === key) return;
    key = k; for (const e of chunks.values()) if (e) release(e.c); chunks.clear();
    if (paper) release(paper);
    paper = document.createElement('canvas'); paper.width = Math.round(cam.width * cam.dpr); paper.height = Math.round(cam.height * cam.dpr);
    const g = paper.getContext('2d'); g.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0); drawPaper(g, cam.width, cam.height);
  }
  function bake(cam, layer, i, wd) {
    const k = cam.dpr * cam.s, x0 = i * wd / k, x1 = (i + 1) * wd / k;
    if (layer.spans && !layer.spans(stage).some(([a, b]) => b >= x0 && a <= x1)) return null;
    const top = -cam.groundY / cam.s, bottom = (cam.height - cam.groundY) / cam.s;
    const y0 = Math.max(top, layer.band?.[0] ?? top), y1 = Math.min(bottom, layer.band?.[1] ?? bottom);
    if (y1 <= y0) return null;
    const devTop = Math.floor(cam.dpr * (cam.groundY + cam.s * y0)), devBottom = Math.ceil(cam.dpr * (cam.groundY + cam.s * y1));
    const t0 = performance.now(), c = document.createElement('canvas');
    c.width = wd; c.height = devBottom - devTop;
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, -i * wd, cam.dpr * cam.groundY - devTop);
    layer.draw(g, { x0, x1, top, bottom, stage, parallax: layer.parallax });
    bakeMs += performance.now() - t0; baked++;
    return { c, y: devTop };
  }
  let prefetched = false;   // at most one chunk is baked ahead per frame
  function drawLayers(ctx, cam, front) {
    for (const layer of theme.layers) {
      if (!!layer.front !== front) continue;
      const { first, last, offset, wd } = visibleChunks(cam, layer.parallax);
      const prev = lastOffset.get(layer.id);
      if (prev !== undefined && offset !== prev) heading.set(layer.id, Math.sign(offset - prev));
      lastOffset.set(layer.id, offset);
      ctx.globalAlpha = layer.opacity ?? 1;
      for (let i = first; i <= last; i++) {
        const id = `${layer.id}:${i}`;
        if (!chunks.has(id)) chunks.set(id, bake(cam, layer, i, wd));
        const e = chunks.get(id);
        if (e) ctx.drawImage(e.c, i * wd - offset, e.y);
      }
      ctx.globalAlpha = 1;
      // Bake one chunk ahead in the scroll direction (both sides before the first scroll),
      // keep that spare, and release everything else.
      const dir = heading.get(layer.id) ?? 0, lo = first - (dir <= 0 ? 1 : 0), hi = last + (dir >= 0 ? 1 : 0);
      for (const i of [hi, lo]) {
        if (!prefetched && !chunks.has(`${layer.id}:${i}`)) { chunks.set(`${layer.id}:${i}`, bake(cam, layer, i, wd)); prefetched = true; }
      }
      for (const [id, e] of chunks) {
        const [lid, n] = id.split(':');
        if (lid === layer.id && (Number(n) < lo || Number(n) > hi)) { if (e) release(e.c); chunks.delete(id); }
      }
    }
  }
  /** Layer transform for drawing in layer coordinates directly on the screen (dynamic hooks). */
  function layerView(ctx, cam, layer) {
    const k = cam.dpr * cam.s;
    ctx.setTransform(k, 0, 0, k, -Math.round(k * cam.x * layer.parallax), cam.dpr * cam.groundY);
    const x0 = cam.x * layer.parallax;
    return { x0, x1: x0 + cam.width / cam.s, top: -cam.groundY / cam.s, bottom: (cam.height - cam.groundY) / cam.s, stage, parallax: layer.parallax };
  }
  return {
    theme,
    /** 紙と、キャラクターより奥の層 (区画)・毎フレームの動き */
    drawBack(ctx, cam, time = 0) {
      reset(cam); prefetched = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(paper, 0, 0);
      drawLayers(ctx, cam, false);
      for (const layer of theme.layers) if (!layer.front && layer.dynamic) { ctx.save(); layer.dynamic(ctx, layerView(ctx, cam, layer), time); ctx.restore(); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    /** キャラクターより手前の前景の層 */
    drawFront(ctx, cam) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawLayers(ctx, cam, true);
    },
    /** 区画の数・RGBA 理論容量・焼き込み時間 */
    stats() {
      let bytes = paper ? paper.width * paper.height * 4 : 0;
      let count = 0;
      for (const e of chunks.values()) if (e) { bytes += e.c.width * e.c.height * 4; count++; }
      return { theme: theme.id, chunks: count, bytesRGBA: bytes, bakedChunks: baked, bakeMs };
    },
    dispose() { for (const e of chunks.values()) if (e) release(e.c); chunks.clear(); if (paper) release(paper); paper = null; key = ''; },
  };
}
