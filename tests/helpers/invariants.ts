// Invariant checkers returning human-readable problem lists, so `expect(problems).toEqual([])`
// prints exactly what broke.
import { BAL } from '../../src/core/balance.ts';
import { WORLD_H, WORLD_W, type Battle } from '../../src/core/battle.ts';
import { computeMods } from '../../src/core/mods.ts';
import { AREAS } from '../../src/data/areas.ts';
import { RELICS } from '../../src/data/relics.ts';
import { TREE_BY_ID } from '../../src/data/tree.ts';
import { AREA_ORDER, HERO_ORDER, type BattleEvent, type RunResult, type SaveData } from '../../src/core/types.ts';

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Paths of every number in `obj` that is NaN or ±Infinity. */
export function nonFinitePaths(obj: unknown, path = '$', out: string[] = []): string[] {
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(`${path}=${obj}`);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => nonFinitePaths(v, `${path}[${i}]`, out));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) nonFinitePaths(v, `${path}.${k}`, out);
  }
  return out;
}

const isNonNegInt = (v: number): boolean => Number.isInteger(v) && v >= 0;

export function saveProblems(s: SaveData): string[] {
  const p: string[] = [];
  p.push(...nonFinitePaths(s));
  for (const k of ['gold', 'embers', 'shards', 'playTime', 'cycleTime'] as const) if (!(s[k] >= 0)) p.push(`${k} negative: ${s[k]}`);
  if (!isNonNegInt(s.prestige)) p.push(`prestige invalid: ${s.prestige}`);
  if (!s.heroes.guardian.recruited) p.push('guardian not recruited');
  for (const h of HERO_ORDER) {
    const lv = s.heroes[h].level;
    if (!Number.isInteger(lv) || lv < 1) p.push(`${h}.level invalid: ${lv}`);
    if (!(s.peakLevels[h] >= 0)) p.push(`peakLevels.${h} invalid: ${s.peakLevels[h]}`);
  }
  if (s.tree.core !== 1) p.push('tree.core !== 1');
  for (const [id, rank] of Object.entries(s.tree)) {
    if (!own(TREE_BY_ID, id)) p.push(`unknown tree node ${id}`);
    else if (!Number.isInteger(rank) || rank < 0 || rank > TREE_BY_ID[id].maxRank) p.push(`tree.${id} rank invalid: ${rank}`);
  }
  if (!s.areas.ashwood.unlocked) p.push('ashwood locked');
  AREA_ORDER.forEach((a, i) => {
    const ar = s.areas[a];
    if (ar.cleared && !ar.unlocked) p.push(`${a} cleared but locked`);
    if (ar.cleared && !ar.everCleared) p.push(`${a} cleared but not everCleared`);
    if (!Number.isInteger(ar.best) || ar.best < 0 || ar.best > 10) p.push(`${a}.best invalid: ${ar.best}`);
    if (ar.bestEver < ar.best || ar.bestEver > 10) p.push(`${a}.bestEver invalid: ${ar.bestEver} (best ${ar.best})`);
    if (!Number.isInteger(ar.stars) || ar.stars < 0 || ar.stars > 3) p.push(`${a}.stars invalid: ${ar.stars}`);
    if (ar.stars > 0 && !ar.everCleared) p.push(`${a} has stars but never cleared`);
    if (!isNonNegInt(ar.attempts)) p.push(`${a}.attempts invalid: ${ar.attempts}`);
    if (!isNonNegInt(ar.bossFails)) p.push(`${a}.bossFails invalid: ${ar.bossFails}`);
    if (ar.bossFirstTime < 0 || ar.bossBestTime < 0) p.push(`${a} boss times negative`);
    if (ar.bossBestTime > 0 && ar.bossFirstTime > 0 && ar.bossBestTime > ar.bossFirstTime + 1e-9) p.push(`${a}.bossBestTime > bossFirstTime`);
    if (i > 0 && ar.unlocked && !s.areas[AREA_ORDER[i - 1]].cleared) p.push(`${a} unlocked but ${AREA_ORDER[i - 1]} not cleared this cycle`);
    if ((AREAS[a].requiresPrestige ?? 0) > s.prestige && ar.unlocked) p.push(`${a} unlocked below required prestige`);
  });
  if (!s.areas[s.selectedArea]?.unlocked) p.push(`selectedArea ${s.selectedArea} not unlocked`);
  if (new Set(s.relicsOwned).size !== s.relicsOwned.length) p.push('duplicate owned relics');
  if (new Set(s.relicsEquipped).size !== s.relicsEquipped.length) p.push('duplicate equipped relics');
  for (const r of s.relicsOwned) if (!own(RELICS, r)) p.push(`unknown relic owned: ${r}`);
  for (const r of s.relicsEquipped) if (!s.relicsOwned.includes(r)) p.push(`relic equipped but not owned: ${r}`);
  if (s.relicsEquipped.length > computeMods(s).relicSlots) p.push('more relics equipped than slots');
  for (const [k, v] of Object.entries(s.stats)) if (!(v >= 0)) p.push(`stats.${k} negative: ${v}`);
  return p;
}

export function resultProblems(r: RunResult): string[] {
  const p: string[] = [];
  p.push(...nonFinitePaths({ ...r, segments: r.segments.map((s) => ({ ...s, bossTime: s.bossTime ?? 0, lanternFrac: s.lanternFrac ?? 0 })) }));
  if (!['wiped', 'lantern', 'victory', 'retreat'].includes(r.reason)) p.push(`bad reason ${r.reason}`);
  if (!(r.duration > 0)) p.push(`duration ${r.duration}`);
  if (!r.segments.length) return [...p, 'no segments'];
  if (r.segments[0].areaId !== r.areaId) p.push('first segment area != areaId');
  const last = r.segments[r.segments.length - 1];
  if (r.stageReached !== last.stageReached) p.push('stageReached != last segment');
  if (r.stagesCleared !== last.stagesCleared) p.push('stagesCleared != last segment');
  r.segments.forEach((s, i) => {
    if (i > 0 && AREA_ORDER.indexOf(s.areaId) !== AREA_ORDER.indexOf(r.segments[i - 1].areaId) + 1) p.push(`segment ${i} not the next area`);
    if (i < r.segments.length - 1 && !s.bossDefeated) p.push(`segment ${i} left without a boss kill`);
    if (s.stageReached < 1 || s.stageReached > 10) p.push(`segment ${i} stageReached ${s.stageReached}`);
    if (s.stagesCleared < 0 || s.stagesCleared > s.stageReached) p.push(`segment ${i} stagesCleared ${s.stagesCleared} > reached ${s.stageReached}`);
    if (s.bossDefeated) {
      if (s.stageReached !== 10 || s.stagesCleared !== 10) p.push(`segment ${i} boss kill without 10 stages`);
      if (s.bossTime === null || s.bossTime < 0) p.push(`segment ${i} bossTime ${s.bossTime}`);
      if (s.lanternFrac === null || s.lanternFrac < 0 || s.lanternFrac > 1.5) p.push(`segment ${i} lanternFrac ${s.lanternFrac}`);
    }
  });
  if (r.bossDefeated !== r.segments.some((s) => s.bossDefeated)) p.push('bossDefeated flag inconsistent');
  if (r.reason === 'victory' && !last.bossDefeated) p.push('victory without boss kill');
  for (const k of ['gold', 'embers', 'shards'] as const) if (!isNonNegInt(r.loot[k])) p.push(`loot.${k} invalid: ${r.loot[k]}`);
  if (!isNonNegInt(r.kills) || !isNonNegInt(r.eliteKills) || r.eliteKills > r.kills) p.push('kill counters invalid');
  return p;
}

/** Per-tick state invariants of a running battle. */
export function battleProblems(b: Battle): string[] {
  const p: string[] = [];
  if (!Number.isFinite(b.lantern) || b.lantern < 0 || b.lantern > b.lanternMax + BAL.descentRefuel + 1e-6) p.push(`lantern ${b.lantern} / ${b.lanternMax}`);
  if (!(b.overdriveGauge >= 0 && b.overdriveGauge <= 100)) p.push(`overdrive ${b.overdriveGauge}`);
  if (b.stage < 0 || b.stage > 9) p.push(`stage ${b.stage}`);
  for (const u of [...b.heroes, ...b.enemies]) {
    const tag = `${u.key}#${u.id}`;
    if (!(u.maxHp > 0) || !Number.isFinite(u.maxHp)) p.push(`${tag} maxHp ${u.maxHp}`);
    if (!Number.isFinite(u.hp) || u.hp < 0 || u.hp > u.maxHp * (1 + 1e-9)) p.push(`${tag} hp ${u.hp}/${u.maxHp}`);
    if (u.alive && !(u.hp > 0)) p.push(`${tag} alive with hp ${u.hp}`);
    if (!Number.isFinite(u.barrier) || u.barrier < 0) p.push(`${tag} barrier ${u.barrier}`);
    if (!Number.isFinite(u.ward) || u.ward < 0) p.push(`${tag} ward ${u.ward}`);
    if (!Number.isFinite(u.atk) || u.atk <= 0) p.push(`${tag} atk ${u.atk}`);
    if (!(u.x >= 0 && u.x <= WORLD_W && u.y >= 0 && u.y <= WORLD_H)) p.push(`${tag} outside the world at (${u.x}, ${u.y})`);
  }
  for (const h of b.party) {
    const s = b.skills[h];
    if (!(s.cooldown >= 0 && s.cooldown <= s.maxCooldown + 1e-9)) p.push(`${h} cooldown ${s.cooldown}/${s.maxCooldown}`);
    if (!(s.maxCooldown >= 2)) p.push(`${h} maxCooldown ${s.maxCooldown}`);
  }
  return p;
}

/** Event payload invariants. */
export function eventProblems(events: readonly BattleEvent[]): string[] {
  const p: string[] = [];
  for (const e of events) {
    if (e.type === 'damage' && (!Number.isFinite(e.amount) || e.amount < 0 || e.absorbed < 0 || e.toWard < 0)) p.push(`damage event ${JSON.stringify(e)}`);
    if (e.type === 'heal' && (!Number.isFinite(e.amount) || e.amount < 0)) p.push(`heal event ${JSON.stringify(e)}`);
    if (e.type === 'loot' && (!Number.isInteger(e.amount) || e.amount <= 0)) p.push(`loot event ${JSON.stringify(e)}`);
  }
  return p;
}
