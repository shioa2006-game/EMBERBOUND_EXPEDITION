// localStorage persistence with defensive parsing/migration.
import { newSave, SAVE_VERSION } from './state.ts';
import { AREA_ORDER, HERO_ORDER, type SaveData } from './types.ts';
import { RELICS } from '../data/relics.ts';
import { VOWS } from '../data/vows.ts';
import { TREE_BY_ID } from '../data/tree.ts';

export const SAVE_KEY = 'emberbound-save-v1';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function defaultStorage(): KV | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* access denied */
  }
  return null;
}

const num = (v: unknown, d: number, min = -Infinity): number =>
  typeof v === 'number' && isFinite(v) ? Math.max(min, v) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Merge an untrusted parsed object onto a fresh save, validating every field. */
export function sanitizeSave(raw: unknown): SaveData {
  const base = newSave();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;
  const s = base;
  s.createdAt = num(r.createdAt, s.createdAt);
  s.savedAt = num(r.savedAt, s.savedAt);
  s.playTime = num(r.playTime, 0, 0);
  s.cycleTime = num(r.cycleTime, 0, 0);
  s.gold = num(r.gold, 0, 0);
  s.embers = num(r.embers, 0, 0);
  s.shards = num(r.shards, 0, 0);
  s.prestige = Math.floor(num(r.prestige, 0, 0));
  for (const h of HERO_ORDER) {
    const hr = r.heroes?.[h];
    if (hr) {
      s.heroes[h].recruited = h === 'guardian' ? true : bool(hr.recruited, false);
      s.heroes[h].level = Math.max(1, Math.floor(num(hr.level, 1, 1)));
    }
  }
  for (const h of HERO_ORDER) s.peakLevels[h] = Math.floor(num(r.peakLevels?.[h], 0, 0));
  if (r.tree && typeof r.tree === 'object') {
    for (const [id, rank] of Object.entries(r.tree)) {
      const node = Object.hasOwn(TREE_BY_ID, id) ? TREE_BY_ID[id] : undefined;
      if (node && typeof rank === 'number') s.tree[id] = Math.max(0, Math.min(node.maxRank, Math.floor(rank)));
    }
  }
  s.tree.core = 1;
  for (const a of AREA_ORDER) {
    const ar = r.areas?.[a];
    if (ar) {
      const t = s.areas[a];
      t.unlocked = bool(ar.unlocked, t.unlocked);
      t.cleared = bool(ar.cleared, false);
      t.everCleared = bool(ar.everCleared, t.cleared);
      t.best = Math.max(0, Math.min(10, Math.floor(num(ar.best, 0))));
      t.bestEver = Math.max(t.best, Math.min(10, Math.floor(num(ar.bestEver, 0))));
      t.attempts = Math.floor(num(ar.attempts, 0, 0));
      t.bossFails = Math.floor(num(ar.bossFails, 0, 0));
      t.bossFirstTime = num(ar.bossFirstTime, 0, 0);
      t.bossBestTime = num(ar.bossBestTime, 0, 0);
      t.stars = Math.max(0, Math.min(3, Math.floor(num(ar.stars, 0))));
    }
  }
  s.areas.ashwood.unlocked = true;
  if (typeof r.selectedArea === 'string' && (AREA_ORDER as readonly string[]).includes(r.selectedArea) && s.areas[r.selectedArea as SaveData['selectedArea']].unlocked) {
    s.selectedArea = r.selectedArea as SaveData['selectedArea'];
  }
  if (Array.isArray(r.relicsOwned)) s.relicsOwned = [...new Set(r.relicsOwned.filter((x: unknown) => typeof x === 'string' && Object.hasOwn(RELICS, x)))] as string[];
  if (Array.isArray(r.vows)) s.vows = [...new Set(r.vows.filter((x: unknown) => typeof x === 'string' && Object.hasOwn(VOWS, x)))] as string[];
  for (const id of Object.keys(VOWS)) {
    const t = num(r.vowBest?.[id], 0, 0);
    if (t > 0) s.vowBest[id] = t;
  }
  if (Array.isArray(r.relicsEquipped)) s.relicsEquipped = [...new Set(r.relicsEquipped.filter((x: unknown) => typeof x === 'string' && s.relicsOwned.includes(x as string)))] as string[];
  for (const h of HERO_ORDER) s.autoCast[h] = bool(r.autoCast?.[h], false);
  if (r.settings) {
    s.settings.sfx = bool(r.settings.sfx, true);
    s.settings.music = bool(r.settings.music, true);
    s.settings.sfxVolume = Math.min(1, num(r.settings.sfxVolume, 0.7, 0));
    s.settings.musicVolume = Math.min(1, num(r.settings.musicVolume, 0.45, 0));
    s.settings.screenShake = bool(r.settings.screenShake, true);
    s.settings.damageNumbers = bool(r.settings.damageNumbers, true);
  }
  if (r.tutorial && typeof r.tutorial === 'object') {
    for (const [k, v] of Object.entries(r.tutorial)) if (typeof v === 'boolean') s.tutorial[k] = v;
  }
  if (r.stats) {
    for (const k of Object.keys(s.stats) as (keyof SaveData['stats'])[]) s.stats[k] = num(r.stats[k], 0, 0);
  }
  s.endingSeen = bool(r.endingSeen, false);
  s.trueEndingSeen = bool(r.trueEndingSeen, false);
  s.version = SAVE_VERSION;
  return s;
}

export function hasSave(storage: KV | null = defaultStorage()): boolean {
  try {
    return !!storage?.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function loadSave(storage: KV | null = defaultStorage()): SaveData | null {
  try {
    const txt = storage?.getItem(SAVE_KEY);
    if (!txt) return null;
    return sanitizeSave(JSON.parse(txt));
  } catch {
    return null;
  }
}

export function writeSave(save: SaveData, storage: KV | null = defaultStorage()): boolean {
  try {
    save.savedAt = Date.now();
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
    return !!storage;
  } catch {
    return false;
  }
}

export function deleteSave(storage: KV | null = defaultStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportSave(save: SaveData): string {
  const json = JSON.stringify(save);
  return typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json).toString('base64');
}

export function importSave(code: string): SaveData | null {
  try {
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(code.trim()))) : Buffer.from(code.trim(), 'base64').toString();
    return sanitizeSave(JSON.parse(json));
  } catch {
    return null;
  }
}
