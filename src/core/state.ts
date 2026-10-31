// Save-state creation, derived queries and player actions (purchases, prestige, run results).
// DOM-free.
import { AREA_SHARDS, AREAS } from '../data/areas.ts';
import { HEROES } from '../data/heroes.ts';
import { RELICS } from '../data/relics.ts';
import { SYNERGY_IDS, TREE, TREE_BY_ID } from '../data/tree.ts';
import { VOW_LIST, VOWS } from '../data/vows.ts';
import { BAL, affordableLevels, heroLevelMult, levelCost, levelCostN } from './balance.ts';
import { activeVows, computeMods } from './mods.ts';
import {
  AREA_ORDER,
  HERO_ORDER,
  type AreaId,
  type HeroId,
  type Mods,
  type RunResult,
  type SaveData,
  type TreeNodeDef,
  type VowDef,
} from './types.ts';

export const SAVE_VERSION = 1;

export function newSave(now = Date.now()): SaveData {
  const areas = {} as SaveData['areas'];
  for (const id of AREA_ORDER) {
    areas[id] = { unlocked: id === 'ashwood', cleared: false, everCleared: false, best: 0, bestEver: 0, attempts: 0, bossFails: 0, bossFirstTime: 0, bossBestTime: 0, stars: 0 };
  }
  return {
    version: SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    playTime: 0,
    cycleTime: 0,
    gold: 0,
    embers: 0,
    shards: 0,
    heroes: {
      guardian: { recruited: true, level: 1 },
      ranger: { recruited: false, level: 1 },
      arcanist: { recruited: false, level: 1 },
      oracle: { recruited: false, level: 1 },
    },
    peakLevels: { guardian: 0, ranger: 0, arcanist: 0, oracle: 0 },
    tree: { core: 1 },
    areas,
    selectedArea: 'ashwood',
    prestige: 0,
    relicsOwned: [],
    relicsEquipped: [],
    vows: [],
    vowBest: {},
    autoCast: { guardian: false, ranger: false, arcanist: false, oracle: false },
    settings: { sfx: true, music: true, sfxVolume: 0.7, musicVolume: 0.45, screenShake: true, damageNumbers: true },
    tutorial: {},
    stats: { runs: 0, kills: 0, bossKills: 0, goldEarned: 0, embersEarned: 0, deaths: 0, interrupts: 0, perfects: 0, bestHit: 0, vowsKept: 0 },
    endingSeen: false,
    trueEndingSeen: false,
  };
}

// ─────────────────────────── Heroes ───────────────────────────

export interface HeroStats {
  maxHp: number;
  atk: number;
  interval: number;
  critChance: number;
  critMult: number;
}

export function recruitedHeroes(save: SaveData): HeroId[] {
  return HERO_ORDER.filter((h) => save.heroes[h].recruited);
}

/** Heroes who set out on an expedition: the recruited ones a vow does not leave at camp. */
export function expeditionParty(save: SaveData): HeroId[] {
  const benched = new Set(activeVows(save).map((v) => v.bench));
  return recruitedHeroes(save).filter((h) => !benched.has(h));
}

/** The vow that leaves this hero at camp this cycle, if any. */
export function benchingVow(save: SaveData, hero: HeroId): VowDef | null {
  return activeVows(save).find((v) => v.bench === hero) ?? null;
}

export function heroStats(save: SaveData, mods: Mods, hero: HeroId): HeroStats {
  const def = HEROES[hero];
  const lm = heroLevelMult(save.heroes[hero].level);
  return {
    maxHp: def.hp * lm * mods.hpMult[hero] * mods.partyHpMult * mods.memoryMult,
    atk: def.atk * lm * mods.atkMult[hero] * mods.partyDmgMult * mods.memoryMult,
    interval: def.interval / mods.atkSpeedMult,
    critChance: Math.min(1, (def.critChance + mods.critChanceAdd[hero]) * mods.critChanceGlobalMult),
    critMult: def.critMult + mods.critMultAdd[hero],
  };
}

/** Effective active-skill cooldown (seconds) after tree / relic reductions. Used by the battle and the UI. */
export function skillCooldown(mods: Mods, hero: HeroId): number {
  const flat = hero === 'guardian' ? mods.bashCdFlat : hero === 'ranger' ? mods.arrowRainCdFlat : hero === 'arcanist' ? mods.meteorCdFlat : 0;
  return Math.max(2, (HEROES[hero].skill.cooldown - flat) * mods.cooldownMult);
}

export function heroLevelCost(save: SaveData, hero: HeroId, n = 1, mods?: Mods): number {
  const m = mods ?? computeMods(save);
  return levelCostN(save.heroes[hero].level, n, m.levelCostMult);
}

export function maxAffordableLevels(save: SaveData, hero: HeroId, mods?: Mods): number {
  const m = mods ?? computeMods(save);
  return affordableLevels(save.heroes[hero].level, save.gold, m.levelCostMult);
}

/** Buy `n` levels for a hero. Returns true on success. Never lets gold go negative. */
export function buyLevels(save: SaveData, hero: HeroId, n = 1): boolean {
  if (!save.heroes[hero].recruited || n <= 0) return false;
  const cost = heroLevelCost(save, hero, n);
  if (cost > save.gold) return false;
  save.gold -= cost;
  save.heroes[hero].level += n;
  return true;
}

/** Spend gold evenly: repeatedly level the lowest-level hero. Returns levels bought. */
export function buyLevelsEvenly(save: SaveData): number {
  const mods = computeMods(save);
  let bought = 0;
  for (let guard = 0; guard < 5000; guard++) {
    const heroes = expeditionParty(save);
    let best: HeroId | null = null;
    let bestCost = Infinity;
    for (const h of heroes) {
      const c = levelCost(save.heroes[h].level, mods.levelCostMult);
      // prefer lowest level, then cheapest
      if (best === null || save.heroes[h].level < save.heroes[best].level || (save.heroes[h].level === save.heroes[best].level && c < bestCost)) {
        best = h;
        bestCost = c;
      }
    }
    if (!best || bestCost > save.gold) break;
    save.gold -= bestCost;
    save.heroes[best].level += 1;
    bought++;
  }
  return bought;
}

export function recruitLevel(save: SaveData): number {
  const hs = recruitedHeroes(save);
  const mean = hs.reduce((a, h) => a + save.heroes[h].level, 0) / Math.max(1, hs.length);
  return Math.max(1, Math.round(mean * BAL.recruitLevelRatio));
}

// ─────────────────────────── Skill Tree ───────────────────────────

export type NodeStatus = 'maxed' | 'upgradable' | 'available' | 'locked' | 'sealed';

export interface NodeView {
  node: TreeNodeDef;
  rank: number;
  status: NodeStatus;
  cost: number | null; // next rank cost
  affordable: boolean;
  sealReason: string | null;
}

export function nodeRank(save: SaveData, id: string): number {
  return save.tree[id] ?? 0;
}

export function ownedSynergies(save: SaveData): number {
  return SYNERGY_IDS.filter((id) => nodeRank(save, id) > 0).length;
}

function sealReason(save: SaveData, node: TreeNodeDef): string | null {
  const req = node.req;
  if (req.prestige && save.prestige < req.prestige) return 'Rekindle（転生）で解放';
  const heroes = new Set<HeroId>([...(req.hero ?? []), ...(node.pair ?? [])]);
  if (node.branch !== 'core' && node.branch !== 'expedition' && node.branch !== 'synergy' && node.branch !== 'rekindled') {
    heroes.add(node.branch as HeroId);
  }
  for (const h of heroes) {
    if (!save.heroes[h].recruited) return `${HEROES[h].name}の加入で解放`;
  }
  return null;
}

export function prereqsMet(save: SaveData, node: TreeNodeDef): boolean {
  const req = node.req;
  if (req.anyOf && req.anyOf.length && !req.anyOf.some((id) => nodeRank(save, id) > 0)) return false;
  if (req.allOf && !req.allOf.every((id) => nodeRank(save, id) > 0)) return false;
  if (req.synergyCount && ownedSynergies(save) < req.synergyCount) return false;
  return true;
}

export function nodeView(save: SaveData, id: string): NodeView {
  const node = TREE_BY_ID[id];
  const rank = nodeRank(save, id);
  const seal = sealReason(save, node);
  const cost = rank < node.maxRank ? node.costs[rank] : null;
  let status: NodeStatus;
  if (rank >= node.maxRank) status = 'maxed';
  else if (seal) status = 'sealed';
  else if (!prereqsMet(save, node)) status = rank > 0 ? 'upgradable' : 'locked';
  else status = rank > 0 ? 'upgradable' : 'available';
  const affordable = cost !== null && (status === 'available' || status === 'upgradable') && save.embers >= cost;
  return { node, rank, status, cost, affordable, sealReason: seal };
}

export function canBuyNode(save: SaveData, id: string): boolean {
  const v = nodeView(save, id);
  return v.affordable;
}

export function buyNode(save: SaveData, id: string): boolean {
  if (!canBuyNode(save, id)) return false;
  const v = nodeView(save, id);
  save.embers -= v.cost!;
  save.tree[id] = v.rank + 1;
  return true;
}

export function allNodeViews(save: SaveData): NodeView[] {
  return TREE.map((n) => nodeView(save, n.id));
}

// ─────────────────────────── Relics ───────────────────────────

export function relicSlots(save: SaveData, mods?: Mods): number {
  return (mods ?? computeMods(save)).relicSlots;
}

export function buyRelic(save: SaveData, id: string): boolean {
  const r = RELICS[id];
  if (!r || save.prestige < 1 || save.relicsOwned.includes(id) || save.shards < r.cost) return false;
  save.shards -= r.cost;
  save.relicsOwned.push(id);
  return true;
}

export function equipRelic(save: SaveData, id: string): boolean {
  if (!save.relicsOwned.includes(id) || save.relicsEquipped.includes(id)) return false;
  if (save.relicsEquipped.length >= relicSlots(save)) return false;
  save.relicsEquipped.push(id);
  return true;
}

export function unequipRelic(save: SaveData, id: string): boolean {
  const i = save.relicsEquipped.indexOf(id);
  if (i < 0) return false;
  save.relicsEquipped.splice(i, 1);
  return true;
}

/** Replace one equipped relic without spending Shards or leaving an intermediate empty slot. */
export function swapRelic(save: SaveData, outgoing: string, incoming: string): boolean {
  const slot = save.relicsEquipped.indexOf(outgoing);
  if (slot < 0 || slot >= relicSlots(save) || !RELICS[incoming] ||
      !save.relicsOwned.includes(incoming) || save.relicsEquipped.includes(incoming)) return false;
  save.relicsEquipped[slot] = incoming;
  return true;
}

// ─────────────────────────── Areas ───────────────────────────

export function isAreaUnlocked(save: SaveData, id: AreaId): boolean {
  return save.areas[id].unlocked;
}

export function frontierArea(save: SaveData): AreaId {
  let last: AreaId = 'ashwood';
  for (const id of AREA_ORDER) if (save.areas[id].unlocked) last = id;
  return last;
}

/** Shards dropped by the boss on this run (first clear in a cycle, prestige >= 1). */
export function bossShardsFor(save: SaveData, id: AreaId, mods?: Mods): number {
  if (save.prestige < 1 || save.areas[id].cleared) return 0;
  return AREA_SHARDS[id] + (mods ?? computeMods(save)).shardBonus;
}

// ─────────────────────────── Run results ───────────────────────────

export type Notice =
  | { kind: 'firstClear'; area: AreaId; embers: number }
  | { kind: 'recruit'; hero: HeroId; level: number }
  | { kind: 'areaUnlock'; area: AreaId }
  | { kind: 'star'; area: AreaId; stars: number; embers: number }
  | { kind: 'bossRecord'; area: AreaId; first: number; prev: number; now: number }
  | { kind: 'ending' }
  | { kind: 'trueEnding' }
  | { kind: 'rekindleReady' }
  | { kind: 'newRecord'; area: AreaId; stage: number }
  | { kind: 'depth'; area: AreaId; stage: number; embers: number };

/** Lantern stars: 1 = cleared, 2 = cleared with >= 50% lantern left, 3 = >= 75%. */
export function starsFor(lanternFrac: number): number {
  return lanternFrac >= 0.75 ? 3 : lanternFrac >= 0.5 ? 2 : 1;
}

export function applyRunResult(save: SaveData, r: RunResult): Notice[] {
  const notices: Notice[] = [];
  save.gold += r.loot.gold;
  save.embers += r.loot.embers;
  save.shards += r.loot.shards;
  save.stats.runs += 1;
  save.stats.kills += r.kills;
  save.stats.goldEarned += r.loot.gold;
  save.stats.embersEarned += r.loot.embers;
  save.stats.interrupts += r.interrupts;
  save.stats.perfects += r.perfects;
  save.stats.bestHit = Math.max(save.stats.bestHit, r.bestHit);
  if (r.reason === 'wiped') save.stats.deaths += 1;

  r.segments.forEach((seg, i) => {
    const area = save.areas[seg.areaId];
    const isLast = i === r.segments.length - 1;
    if (i === 0) area.attempts += 1;
    if (seg.stageReached > area.best) {
      if (area.best > 0 && !seg.bossDefeated) notices.push({ kind: 'newRecord', area: seg.areaId, stage: seg.stageReached });
      // pushing the frontier always feeds the Skill Tree: +1 Ember per new stage reached (per cycle, stage 1 free);
      // stages already reached in an earlier cycle pay only BAL.repeatClearEmbers of that
      const fresh = Math.max(0, seg.stageReached - Math.max(area.best, area.bestEver, 1));
      const again = Math.max(0, seg.stageReached - Math.max(area.best, 1)) - fresh;
      const depth = Math.round((fresh + again * BAL.repeatClearEmbers) * BAL.depthEmbers);
      if (depth > 0) {
        save.embers += depth;
        save.stats.embersEarned += depth;
        notices.push({ kind: 'depth', area: seg.areaId, stage: seg.stageReached, embers: depth });
      }
      area.best = seg.stageReached;
    }
    area.bestEver = Math.max(area.bestEver, seg.stageReached);
    if (!seg.bossDefeated) {
      if (isLast && seg.stageReached >= 10) area.bossFails += 1;
      return;
    }
    area.bossFails = 0;
    save.stats.bossKills += 1;
    if (seg.bossTime !== null) {
      const prev = area.bossBestTime;
      if (!area.bossFirstTime) area.bossFirstTime = seg.bossTime;
      if (!prev || seg.bossTime < prev) area.bossBestTime = seg.bossTime;
      if (prev && seg.bossTime < prev) notices.push({ kind: 'bossRecord', area: seg.areaId, first: area.bossFirstTime, prev, now: seg.bossTime });
    }
    if (seg.lanternFrac !== null) {
      const st = starsFor(seg.lanternFrac);
      if (st > area.stars) {
        const gained = (st - area.stars) * BAL.starEmbers;
        area.stars = st;
        save.embers += gained;
        notices.push({ kind: 'star', area: seg.areaId, stars: st, embers: gained });
      }
    }
    const first = !area.cleared;
    const bonus = firstClearBonus(save, seg.areaId); // before everCleared flips
    area.cleared = true;
    area.everCleared = true;
    if (first) {
      const def = AREAS[seg.areaId];
      save.embers += bonus;
      notices.push({ kind: 'firstClear', area: seg.areaId, embers: bonus });
      if (def.recruit && !save.heroes[def.recruit].recruited) {
        const lvl = recruitLevel(save);
        save.heroes[def.recruit].recruited = true;
        save.heroes[def.recruit].level = lvl;
        notices.push({ kind: 'recruit', hero: def.recruit, level: lvl });
      }
      const next = AREA_ORDER[def.index + 1];
      if (next) {
        const nd = AREAS[next];
        if (!save.areas[next].unlocked && (nd.requiresPrestige ?? 0) <= save.prestige) {
          save.areas[next].unlocked = true;
          notices.push({ kind: 'areaUnlock', area: next });
        }
      }
      if (seg.areaId === 'hollow') {
        if (!save.endingSeen) notices.push({ kind: 'ending' });
        notices.push({ kind: 'rekindleReady' });
      }
      if (seg.areaId === 'heart' && !save.trueEndingSeen) notices.push({ kind: 'trueEnding' });
    }
  });
  return notices;
}

/** Embers for clearing `id` this cycle: in full the first time ever, BAL.repeatClearEmbers of that after a Rekindle. */
export function firstClearBonus(save: SaveData, id: AreaId): number {
  const full = AREAS[id].firstClearEmbers;
  return save.areas[id].everCleared ? Math.round(full * BAL.repeatClearEmbers) : full;
}

/** Boss HP and damage reduction from failed attempts ("ランタンの記憶"). */
export function bossPity(save: SaveData, id: AreaId): number {
  return Math.min(BAL.pityMax, save.areas[id].bossFails * BAL.pityPerFail);
}

/** Whether a run in `id` may continue into the next area after its boss (Descent, cycle 2+). */
export function canDescendFrom(save: SaveData, id: AreaId): boolean {
  if (save.prestige < 1) return false;
  const next = AREA_ORDER[AREAS[id].index + 1];
  if (!next) return false;
  return (AREAS[next].requiresPrestige ?? 0) <= save.prestige;
}

// ─────────────────────────── Prestige (Rekindle) ───────────────────────────

export function canRekindle(save: SaveData): boolean {
  return save.areas.hollow.cleared;
}

/** Relic Shards for the vows kept through this cycle (paid with the Rekindle that ends it). */
export function vowShards(save: SaveData): number {
  return activeVows(save).reduce((a, v) => a + v.shards, 0);
}

export function rekindleShards(save: SaveData): number {
  if (!canRekindle(save)) return 0;
  const cleared = AREA_ORDER.filter((a) => save.areas[a].cleared).length;
  return 8 + cleared + 2 * save.prestige + vowShards(save);
}

/** Can this vow be taken for the next cycle? (A benching vow needs that hero in the party.) */
export function canTakeVow(save: SaveData, id: string): boolean {
  const v = VOWS[id];
  return !!v && (!v.bench || save.heroes[v.bench].recruited);
}

/** Give up a vow mid-cycle: its rule lifts at once and its Shards are lost. */
export function abandonVow(save: SaveData, id: string): boolean {
  if (save.prestige < 1 || !save.vows.includes(id)) return false;
  save.vows = save.vows.filter((x) => x !== id);
  return true;
}

/** Perform Rekindle. Resets gold, levels and area progress; keeps tree, heroes, embers, relics.
 *  `vows` are taken for the cycle that starts now. */
export function rekindle(save: SaveData, vows: readonly string[] = []): number {
  if (!canRekindle(save)) return 0;
  const shards = rekindleShards(save);
  save.shards += shards;
  // the vows kept through this cycle go on record before the next ones are taken
  for (const v of activeVows(save)) {
    const best = save.vowBest[v.id];
    if (!best || save.cycleTime < best) save.vowBest[v.id] = save.cycleTime;
    save.stats.vowsKept += 1;
  }
  save.vows = VOW_LIST.filter((v) => vows.includes(v.id) && canTakeVow(save, v.id)).map((v) => v.id);
  save.prestige += 1;
  save.gold = 0;
  save.cycleTime = 0;
  for (const h of HERO_ORDER) {
    if (save.heroes[h].recruited) save.peakLevels[h] = Math.max(save.peakLevels[h], save.heroes[h].level);
    save.heroes[h].level = 1;
  }
  for (const a of AREA_ORDER) {
    const s = save.areas[a];
    s.unlocked = a === 'ashwood';
    s.cleared = false;
    s.best = 0;
    s.attempts = 0;
    s.bossFails = 0;
  }
  save.selectedArea = 'ashwood';
  return shards;
}

export function totalHeroLevels(save: SaveData): number {
  return HERO_ORDER.reduce((a, h) => a + (save.heroes[h].recruited ? save.heroes[h].level : 0), 0);
}
