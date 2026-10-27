// Save builders for tests. Everything goes through newSave() so defaults stay in sync with core.
import { newSave } from '../../src/core/state.ts';
import { AREA_ORDER, HERO_ORDER, type AreaId, type HeroId, type SaveData } from '../../src/core/types.ts';
import { TREE_BY_ID } from '../../src/data/tree.ts';

export interface SaveOpts {
  /** Recruited heroes (Guardian is always recruited). 'all' = the full party. */
  heroes?: HeroId[] | 'all';
  /** Level for every recruited hero, or per hero. */
  level?: number | Partial<Record<HeroId, number>>;
  /** Tree ranks. An array means "max rank of each listed node". */
  nodes?: Record<string, number> | string[];
  prestige?: number;
  /** Unlocked areas (ashwood is always unlocked). 'all' unlocks every area. */
  unlocked?: AreaId[] | 'all';
  gold?: number;
  embers?: number;
  shards?: number;
  /** Relics that are both owned and equipped. */
  relics?: string[];
}

export function makeSave(o: SaveOpts = {}): SaveData {
  const s = newSave(0);
  const heroes = o.heroes === 'all' ? [...HERO_ORDER] : (o.heroes ?? []);
  for (const h of heroes) s.heroes[h].recruited = true;
  for (const h of HERO_ORDER) {
    if (!s.heroes[h].recruited) continue;
    const lv = typeof o.level === 'number' ? o.level : o.level?.[h];
    if (lv !== undefined) s.heroes[h].level = lv;
  }
  if (Array.isArray(o.nodes)) {
    for (const id of o.nodes) s.tree[id] = TREE_BY_ID[id].maxRank;
  } else if (o.nodes) {
    Object.assign(s.tree, o.nodes);
  }
  s.prestige = o.prestige ?? 0;
  const unlocked = o.unlocked === 'all' ? [...AREA_ORDER] : (o.unlocked ?? []);
  for (const a of unlocked) s.areas[a].unlocked = true;
  s.gold = o.gold ?? 0;
  s.embers = o.embers ?? 0;
  s.shards = o.shards ?? 0;
  if (o.relics) {
    s.relicsOwned = [...o.relics];
    s.relicsEquipped = [...o.relics];
  }
  return s;
}

export function clone<T>(x: T): T {
  return structuredClone(x);
}
