// Public art API. Geometry stays in game-world pixels; hand-drawn frames are baked at high resolution.
import type { AreaId, SaveData } from '../../core/types.ts';
import { HERO_ORDER } from '../../core/types.ts';
import { gearTier } from '../../core/balance.ts';
import { getStorySprite, getStoryFrameCount, getStoryBounds, getStoryFrameIndex } from '../storybook/characters.ts';
import { drawStoryAreaBackground, drawStoryAreaForeground, drawStoryCampBackground, drawStoryTitleBackground } from '../storybook/scenes.ts';
import { storyIconCanvas } from '../storybook/icons.ts';
import { paintCanvas, registerDensity } from '../storybook/surface.ts';
import { silhouette } from '../fx/pixel.ts';

export type SpritePose = 'idle' | 'walk' | 'attack' | 'cast' | 'hurt' | 'dead';

export interface SpriteFrame {
  canvas: HTMLCanvasElement;
  /** Anchor in sprite pixels: the point that sits on the unit's (x, y) feet position. */
  ax: number;
  ay: number;
  width: number;
  height: number;
  density: number;
}

export type IconKey =
  | 'gold' | 'ember' | 'shard' | 'lantern' | 'star' | 'skull' | 'crown' | 'lock' | 'sword' | 'heart' | 'clock'
  | 'skill_shieldBash' | 'skill_arrowRain' | 'skill_meteor' | 'skill_sanctuary' | 'overdrive'
  | 'hero_guardian' | 'hero_ranger' | 'hero_arcanist' | 'hero_oracle'
  | 'status_burn' | 'status_mark' | 'status_stun' | 'status_doom' | 'status_frozen' | 'status_ward' | 'status_barrier'
  | `relic_${string}`;

export function getUnitSprite(key: string, pose: SpritePose, frame: number, tier = 0, facing?: 'R' | 'L'): SpriteFrame {
  const sprite = getStorySprite(key, pose, frame, tier, facing);
  registerDensity(sprite.canvas, sprite.density);
  return sprite;
}
export function getUnitWhite(key: string, pose: SpritePose, frame: number, tier = 0): SpriteFrame {
  const s = getUnitSprite(key, pose, frame, tier);
  return { ...s, canvas: silhouette(s.canvas, '#ffffff') };
}
export const frameCount = getStoryFrameCount;
export const getUnitBounds = getStoryBounds;
export const drawAreaBackground = drawStoryAreaBackground;
export const drawAreaForeground = drawStoryAreaForeground;
export function drawCampScene(ctx: CanvasRenderingContext2D, save: SaveData, time: number): void {
  drawStoryCampBackground(ctx, save, time);
  const xs = [164, 140, 238, 262];
  for (let i = 0; i < HERO_ORDER.length; i++) {
    const key = HERO_ORDER[i];
    if (!save.heroes[key].recruited) continue;
    const s = getUnitSprite(key, 'idle', getStoryFrameIndex(key, 'idle', time + i * .3), gearTier(save.heroes[key].level), i > 1 ? 'L' : 'R');
    ctx.save();
    ctx.fillStyle = 'rgba(8,7,12,.5)';
    ctx.beginPath(); ctx.ellipse(xs[i], 150, 9, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(xs[i], 150);
    paintCanvas(ctx, s.canvas, -s.ax, -s.ay);
    ctx.restore();
  }
}
export const drawTitleScene = drawStoryTitleBackground;
const icons = new Map<string, HTMLCanvasElement>();
const urls = new Map<string, string>();
export function iconCanvas(key: IconKey, scale = 2): HTMLCanvasElement {
  const k = Math.max(1, Math.round(scale));
  if (!key.startsWith('hero_')) return storyIconCanvas(key, k);
  const id = key + '|' + k;
  let c = icons.get(id);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 16 * k;
  const g = c.getContext('2d')!;
  const hero = key.slice(5);
  const s = getUnitSprite(hero, 'idle', 0, 1);
  const b = getUnitBounds(hero, 1);
  const crop = Math.max(b.w * .72, b.h * .62);
  const sx = (s.ax + (b.left + b.right) / 2 - crop / 2) * s.density;
  const sy = (s.ay - b.top - 1) * s.density;
  g.fillStyle = '#2c252a'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(s.canvas, sx, sy, crop * s.density, crop * s.density, k, k, 14 * k, 14 * k);
  g.strokeStyle = '#b79868'; g.lineWidth = .6 * k; g.strokeRect(k * .6, k * .6, k * 14.8, k * 14.8);
  icons.set(id, c);
  return c;
}
export function iconDataURL(key: IconKey, scale = 2): string {
  const id = key + '|' + Math.max(1, Math.round(scale));
  let url = urls.get(id);
  if (!url) { url = iconCanvas(key, scale).toDataURL(); urls.set(id, url); }
  return url;
}
export function preloadSprites(keys: readonly string[] = HERO_ORDER): void {
  for (const key of keys) getUnitSprite(key, 'idle', 0);
}
