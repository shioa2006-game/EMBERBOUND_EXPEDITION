// Studio art is drawn once per requested pose/tier into transparent, high-resolution frame images.
// All public dimensions use the game's 400 × 180 logical coordinates, never texture pixels.
import { definitions, gearPalettes, isolateDrawing } from './vendor/registry.js';

export type StoryPose = 'idle' | 'walk' | 'attack' | 'cast' | 'hurt' | 'dead';
export interface StoryAction {
  period: number;
  frames?: number;
  keys?: readonly number[];
  once?: boolean;
  hold?: boolean;
  releaseAt?: number;
}
export interface StoryDefinition {
  id: string;
  actions: Partial<Record<StoryPose, StoryAction>> & { idle: StoryAction };
  frameBox: { x0: number; x1: number; y0: number; y1: number };
  emberbound: { gameId: string; heightPx: number; facing: 'R' | 'L' };
  projectile?: { releaseAt: number; origin: (facing: 'R' | 'L') => { nock: { x: number; y: number } } };
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, direction: 'R' | 'L', action: StoryPose, time: number, scale: number, options: { shadow: boolean }) => unknown;
}
export interface StorySprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
  width: number;
  height: number;
  density: number;
}
export interface StoryBounds { left: number; right: number; top: number; w: number; h: number }
export interface StoryUnit { key: string; tier?: number; facing?: 'R' | 'L' }

export const STORY_DENSITY = 4;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
// Game display heights (Guardian = 30). Keep these outside vendor so Studio reimports preserve them.
const gameHeights: Readonly<Record<string, number>> = {
  glacial_warden: 60,
  flame_construct: 60,
  drowned_archer: 30,
  rime_archer: 30,
  geomancer: 30,
  frost_revenant: 30,
  hollow_knight: 30,
  ember_acolyte: 30,
  gloom_caster: 30,
  ashen_echo: 30,
  ice_wraith: 24,
  shardback: 24,
  reef_lurker: 24,
  frost_hound: 24,
  char_wolf: 24,
};
const byKey = new Map(definitions.map(def => {
  const heightPx = gameHeights[def.emberbound.gameId];
  return [def.emberbound.gameId, heightPx === undefined ? def : {
    ...def, emberbound: { ...def.emberbound, heightPx },
  }];
}));
const heroKeys = new Set(['guardian', 'ranger', 'arcanist', 'oracle']);
const originalPalettes = Object.fromEntries(Object.entries(gearPalettes).map(([key, colors]) => [key, { ...colors }]));
const allPoses: readonly StoryPose[] = ['idle', 'walk', 'attack', 'cast', 'hurt', 'dead'];
const sprites = new Map<string, StorySprite>();
const measurements = new Map<string, { scale: number; bounds: StoryBounds }>();
const projectileOrigins = new Map<string, { x: number; y: number }>();
let cacheBytes = 0;
let bakedFrames = 0;
let bakeMilliseconds = 0;

/** Original six equipment materials: bronze → silver → gold → azure silver → crimson → white gold. */
const metal = [
  ['#c09468', '#8a6040', '#55392a'], ['#e6edf4', '#a2aebd', '#5d697c'],
  ['#ffe28a', '#e8a43a', '#9a571e'], ['#f2fcff', '#9ed6f6', '#4b7cc0'],
  ['#ff8070', '#cc3444', '#6c1832'], ['#ffffff', '#fff0c4', '#dcae58'],
] as const;
const trim = [
  ['#9c7a52', '#5e4630'], ['#c9d3de', '#76839a'], ['#fff2a8', '#d68a22'],
  ['#c4f4ff', '#3d9ee6'], ['#ffe07a', '#c88a1c'], ['#fffbe2', '#ffcc5a'],
] as const;
const rangerCloth = [
  ['#858d63', '#566043'], ['#789360', '#49613f'], ['#799a63', '#48633e'],
  ['#6fa18a', '#426d5f'], ['#67885a', '#3e5c3e'], ['#b5cda0', '#708d61'],
] as const;
const mageCloth = [
  ['#7a5370', '#523650', '#9c7792'], ['#805b90', '#543a64', '#a780b5'],
  ['#8d609f', '#5d3a71', '#b689c7'], ['#7e75b2', '#514976', '#aba1d8'],
  ['#995b8c', '#663b62', '#c68ab7'], ['#c3afd8', '#8971a8', '#e8d9f5'],
] as const;
const oracleSash = [
  ['#9d8061', '#70553f'], ['#8496b5', '#5f7193'], ['#b79a58', '#816c3c'],
  ['#78afce', '#4b7ea5'], ['#ad5969', '#713b53'], ['#e5d29e', '#b49655'],
] as const;

function gearTier(key: string, tier: number): number {
  return heroKeys.has(key) ? Math.max(0, Math.min(5, tier | 0)) : 0;
}

/** Material-level changes preserve faces, skin, hair, paper shading and each class's silhouette. */
export function getStoryGearPalette(key: string, tier = 0): Readonly<Record<string, string>> | undefined {
  const source = originalPalettes[key];
  if (!source) return undefined;
  const t = gearTier(key, tier), m = metal[t], tr = trim[t];
  if (key === 'guardian') {
    const shields = [['#927256', '#5e4736'], ['#a05d4b', '#713b33'], ['#b07c42', '#77502e'], ['#628db3', '#3c5b7d'], ['#a33d52', '#68283d'], ['#f0dfac', '#bb9757']];
    return { ...source, steel: m[1], light: m[0], mid: m[1], dark: m[2], gold: tr[0],
      red: shields[t][0], redDark: shields[t][1],
      plume: t === 5 ? '#efcf7e' : source.plume, plumeLight: t === 5 ? '#fff1bf' : source.plumeLight };
  }
  if (key === 'ranger') {
    return { ...source, cape: rangerCloth[t][0], capeDark: rangerCloth[t][1],
      accent: tr[0], brass: tr[1], iron: m[1],
      wood: t === 0 ? source.wood : m[1], woodDark: t === 0 ? source.woodDark : m[2],
      fletch: t >= 3 ? m[0] : source.fletch, fletch2: t >= 3 ? tr[0] : source.fletch2 };
  }
  if (key === 'arcanist') {
    return { ...source, cloth: mageCloth[t][0], diamond: mageCloth[t][0], dark: mageCloth[t][1], light: mageCloth[t][2],
      gold: tr[0], lining: t === 5 ? '#fff9e8' : source.lining,
      wood: t >= 2 ? m[1] : source.wood, woodLight: t >= 2 ? m[0] : source.woodLight };
  }
  return { ...source, trim: tr[0], gold: m[1], goldLight: m[0],
    sash: oracleSash[t][0], sashDark: oracleSash[t][1],
    cloth: t === 5 ? '#fff9e9' : source.cloth, clothShade: t === 5 ? '#e6d9b6' : source.clothShade };
}

function drawing<T>(def: StoryDefinition, tier: number, scale: number, fn: () => T): T {
  const palette = gearPalettes[def.emberbound.gameId];
  const saved = palette && { ...palette };
  if (palette) Object.assign(palette, getStoryGearPalette(def.emberbound.gameId, tier));
  try {
    return isolateDrawing({ lw: Math.max(1, 1 / scale), boil: true, footGround: true, linearStance: true }, fn);
  } finally {
    if (palette) Object.assign(palette, saved);
  }
}

function definition(key: string): StoryDefinition {
  const def = byKey.get(key);
  if (!def) throw new Error(`Missing Storybook character: ${key}`);
  return def;
}

function actionFor(def: StoryDefinition, pose: StoryPose): StoryPose {
  return def.actions[pose] ? pose : 'idle';
}
function keysOf(action: StoryAction): readonly number[] {
  return action.keys || Array.from({ length: action.frames || 1 }, (_, i) => i / (action.frames || 1));
}

export function storyCharacterKeys(): string[] { return [...byKey.keys()]; }
export function getStoryDefinition(key: string): Readonly<StoryDefinition> { return definition(key); }
export function getStoryFrameCount(key: string, pose: StoryPose): number {
  const def = definition(key);
  return keysOf(def.actions[actionFor(def, pose)]!).length;
}
export function getStoryActionDuration(key: string, pose: StoryPose): number {
  const def = definition(key);
  return def.actions[actionFor(def, pose)]!.period;
}

/** Elapsed animation time → authored frame, including uneven keys and held death poses. */
export function getStoryFrameIndex(key: string, pose: StoryPose, elapsedSeconds: number, options: { loop?: boolean } = {}): number {
  const def = definition(key), action = def.actions[actionFor(def, pose)]!;
  const keys = keysOf(action);
  const time = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const loop = options.loop ?? !(action.once || action.hold);
  const phase = loop ? (time % action.period) / action.period : Math.min(1, time / action.period);
  let frame = 0;
  while (frame + 1 < keys.length && keys[frame + 1] <= phase + 1e-9) frame++;
  return frame;
}

/** Visual release offset in seconds; null means that the drawing has no specified projectile release. */
export function getStoryReleaseTime(key: string, pose: StoryPose = 'attack'): number | null {
  const def = definition(key), action = def.actions[pose];
  if (!action) return null;
  const release = action.releaseAt ?? (pose === 'attack' ? def.projectile?.releaseAt : undefined);
  return release === undefined ? null : release * action.period;
}

interface PixelsBox { x0: number; y0: number; x1: number; y1: number }
function alphaBounds(canvas: HTMLCanvasElement, threshold: number): PixelsBox {
  const { width, height } = canvas;
  const data = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data;
  let x0 = width, x1 = -1, y0 = height, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] <= threshold) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < x0 || y1 < y0) throw new Error('Storybook drawing produced an empty frame');
  return { x0, y0, x1, y1 };
}

function rawFrame(def: StoryDefinition, pose: StoryPose, phase: number, tier: number, scale: number, facing = def.emberbound.facing) {
  const box = def.frameBox, padding = 4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((box.x1 - box.x0) * scale) + padding * 2;
  canvas.height = Math.ceil((box.y1 - box.y0) * scale) + padding * 2;
  const ax = padding - box.x0 * scale, ay = padding - box.y0 * scale;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const info = drawing(def, tier, scale, () => def.draw(ctx, ax, ay, facing, pose, phase * def.actions[pose]!.period, scale, { shadow: false }));
  return { canvas, ax, ay, info };
}

function measure(def: StoryDefinition, facing = def.emberbound.facing): { scale: number; bounds: StoryBounds } {
  const id = `${def.id}|${facing}`;
  let result = measurements.get(id);
  if (result) return result;
  // Use the same alpha > 40 body-height measurement as Studio's reviewed stage-0 comparison.
  const raw = rawFrame(def, 'idle', 0, 0, 1, facing);
  const b = alphaBounds(raw.canvas, 40);
  const scale = def.emberbound.heightPx / (b.y1 - b.y0 + 1);
  result = { scale, bounds: { left: (b.x0 - raw.ax) * scale, right: (b.x1 + 1 - raw.ax) * scale,
    top: (raw.ay - b.y0) * scale, w: (b.x1 - b.x0 + 1) * scale, h: (raw.ay - b.y0) * scale } };
  measurements.set(id, result);
  raw.canvas.width = raw.canvas.height = 0;
  return result;
}

/** Idle silhouette bounds are independent of equipment colour; use these for HP bars and markers. */
export function getStoryBounds(key: string, _tier = 0, facing?: 'R' | 'L'): StoryBounds {
  return { ...measure(definition(key), facing).bounds };
}

/** Authored arrow nock, relative to the feet in logical pixels; casting uses the raised-bow pose. */
export function getStoryProjectileOrigin(key: string, pose: StoryPose = 'attack'): { x: number; y: number } | null {
  const def = definition(key);
  if (!def.projectile || !def.actions[pose]) return null;
  const id = `${key}|${pose}`;
  const cached = projectileOrigins.get(id);
  if (cached) return { ...cached };
  const scale = measure(def).scale;
  let nock = def.projectile.origin(def.emberbound.facing).nock;
  if (pose === 'cast') {
    const release = def.actions.cast!.releaseAt ?? def.projectile.releaseAt;
    const raw = rawFrame(def, 'cast', release, 0, 1);
    const info = raw.info as { stringMid?: { x: number; y: number } } | undefined;
    if (info?.stringMid) nock = { x: info.stringMid.x - raw.ax, y: info.stringMid.y - raw.ay };
    raw.canvas.width = raw.canvas.height = 0;
  }
  const result = { x: nock.x * scale, y: nock.y * scale };
  projectileOrigins.set(id, result);
  return { ...result };
}

export function getStorySprite(key: string, pose: StoryPose, frame: number, tier = 0, facing?: 'R' | 'L'): StorySprite {
  const def = definition(key), action = actionFor(def, pose), spec = def.actions[action]!;
  const keys = keysOf(spec), f = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
  const index = spec.once || spec.hold ? Math.min(keys.length - 1, f) : f % keys.length;
  const direction = facing ?? def.emberbound.facing;
  const t = gearTier(key, tier), id = `${key}|${action}|${index}|${t}|${direction}`;
  const hit = sprites.get(id);
  if (hit) { sprites.delete(id); sprites.set(id, hit); return hit; }
  const start = performance.now();
  const raw = rawFrame(def, action, keys[index], t, measure(def, direction).scale * STORY_DENSITY, direction);
  // Trim transparent texture margins, retaining the original feet anchor even for fallen or flying figures.
  const b = alphaBounds(raw.canvas, 0);
  const x0 = Math.max(0, b.x0 - 2), y0 = Math.max(0, b.y0 - 2);
  const x1 = Math.min(raw.canvas.width, b.x1 + 3), y1 = Math.min(raw.canvas.height, b.y1 + 3);
  const canvas = document.createElement('canvas');
  canvas.width = x1 - x0; canvas.height = y1 - y0;
  canvas.getContext('2d')!.drawImage(raw.canvas, -x0, -y0);
  const result = { canvas, ax: (raw.ax - x0) / STORY_DENSITY, ay: (raw.ay - y0) / STORY_DENSITY,
    width: canvas.width / STORY_DENSITY, height: canvas.height / STORY_DENSITY, density: STORY_DENSITY };
  raw.canvas.width = raw.canvas.height = 0;
  const bytes = canvas.width * canvas.height * 4;
  // Keep only recently used frames: visiting later areas must not retain every earlier monster atlas.
  while (cacheBytes + bytes > MAX_CACHE_BYTES && sprites.size) {
    const oldest = sprites.keys().next().value!;
    const removed = sprites.get(oldest)!;
    cacheBytes -= removed.canvas.width * removed.canvas.height * 4;
    sprites.delete(oldest);
  }
  sprites.set(id, result); cacheBytes += bytes; bakedFrames++; bakeMilliseconds += performance.now() - start;
  return result;
}

/** Warm only the visible party/area. Yield between small batches so the loading screen can keep painting. */
export async function prewarmStorySprites(units: readonly StoryUnit[], poses: readonly StoryPose[] = allPoses, signal?: AbortSignal): Promise<void> {
  let sliceStart = performance.now();
  const seen = new Set<string>();
  for (const { key, tier = 0, facing } of units) for (const pose of poses) {
    const def = definition(key), action = actionFor(def, pose), t = gearTier(key, tier), id = `${key}|${action}|${t}|${facing ?? def.emberbound.facing}`;
    if (seen.has(id)) continue;
    seen.add(id);
    for (let frame = 0; frame < getStoryFrameCount(key, action); frame++) {
      if (signal?.aborted) return;
      getStorySprite(key, action, frame, t, facing);
      if (performance.now() - sliceStart > 6) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        sliceStart = performance.now();
      }
    }
  }
}

export function getStoryCacheStats() {
  return { frames: sprites.size, bytes: cacheBytes, maxBytes: MAX_CACHE_BYTES, bakedFrames, bakeMilliseconds };
}

/** Primarily for resource teardown and diagnostics; existing frame references remain valid. */
export function clearStorySpriteCache(): void {
  sprites.clear(); measurements.clear(); cacheBytes = 0;
}
