// applyRunResult (notices, unlocks, recruits, embers, records) and Rekindle (prestige).
import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance.ts';
import { computeMods } from '../src/core/mods.ts';
import {
  applyRunResult,
  bossPity,
  canDescendFrom,
  canRekindle,
  frontierArea,
  recruitLevel,
  rekindle,
  rekindleShards,
  starsFor,
  type Notice,
} from '../src/core/state.ts';
import { AREA_ORDER, HERO_ORDER, type AreaId, type RunEndReason, type RunResult, type RunSegment, type SaveData } from '../src/core/types.ts';
import { AREAS } from '../src/data/areas.ts';
import { saveProblems } from './helpers/invariants.ts';
import { clone, makeSave } from './helpers/saves.ts';

function seg(areaId: AreaId, o: { stage?: number; boss?: { time: number; lantern: number } } = {}): RunSegment {
  const killed = !!o.boss;
  const stage = killed ? 10 : (o.stage ?? 3);
  return {
    areaId,
    stageReached: stage,
    stagesCleared: killed ? 10 : stage - 1,
    bossDefeated: killed,
    bossTime: o.boss?.time ?? null,
    lanternFrac: o.boss?.lantern ?? null,
  };
}

function run(segments: RunSegment[], o: { reason?: RunEndReason; gold?: number; embers?: number; shards?: number } = {}): RunResult {
  const last = segments[segments.length - 1];
  return {
    areaId: segments[0].areaId,
    reason: o.reason ?? (last.bossDefeated ? 'victory' : 'lantern'),
    stageReached: last.stageReached,
    stagesCleared: last.stagesCleared,
    segments,
    kills: 10,
    eliteKills: 1,
    bossDefeated: segments.some((s) => s.bossDefeated),
    loot: { gold: o.gold ?? 100, embers: o.embers ?? 0, shards: o.shards ?? 0 },
    duration: 45,
    bestHit: 99,
    interrupts: 2,
    perfects: 1,
    routs: 0,
    emberNovas: 0,
    killedBy: null,
    missed: {},
  };
}

const kill = (area: AreaId, time = 30, lantern = 0.2) => run([seg(area, { boss: { time, lantern } })]);
const kinds = (ns: Notice[]) => ns.map((n) => n.kind);

/** A cycle-0 save that has cleared every area before `area`. */
function saveUpTo(area: AreaId, prestige = 0): SaveData {
  const s = makeSave({ heroes: 'all', level: 30, prestige });
  for (const a of AREA_ORDER) {
    if (a === area) break;
    applyRunResult(s, kill(a));
  }
  return s;
}

describe('applyRunResult: bookkeeping', () => {
  it('banks loot and updates stats', () => {
    const s = makeSave();
    applyRunResult(s, run([seg('ashwood', { stage: 4 })], { gold: 250, embers: 3, shards: 0, reason: 'wiped' }));
    expect(s.gold).toBe(250);
    // 3 looted + depth bonus for reaching stage 4 for the first time (stages 2..4)
    const depth = 3 * BAL.depthEmbers;
    expect(s.embers).toBe(3 + depth);
    expect(s.stats).toMatchObject({ runs: 1, kills: 10, goldEarned: 250, embersEarned: 3 + depth, deaths: 1, interrupts: 2, perfects: 1, bestHit: 99 });
    applyRunResult(s, run([seg('ashwood', { stage: 2 })], { gold: 10, reason: 'lantern' }));
    expect(s.stats.deaths).toBe(1);
    expect(s.stats.runs).toBe(2);
    expect(s.areas.ashwood.attempts).toBe(2);
    expect(s.areas.ashwood.best).toBe(4);
    expect(saveProblems(s)).toEqual([]);
  });

  it('newRecord notice only when an existing best is beaten', () => {
    const s = makeSave();
    expect(kinds(applyRunResult(s, run([seg('ashwood', { stage: 3 })])))).not.toContain('newRecord');
    expect(applyRunResult(s, run([seg('ashwood', { stage: 6 })]))).toContainEqual({ kind: 'newRecord', area: 'ashwood', stage: 6 });
    expect(kinds(applyRunResult(s, run([seg('ashwood', { stage: 5 })])))).not.toContain('newRecord');
    expect(s.areas.ashwood.best).toBe(6);
    expect(s.areas.ashwood.bestEver).toBe(6);
  });

  it('failed boss attempts build pity; a kill resets it', () => {
    const s = makeSave();
    applyRunResult(s, run([seg('ashwood', { stage: 9 })]));
    expect(s.areas.ashwood.bossFails).toBe(0); // never reached the boss
    applyRunResult(s, run([seg('ashwood', { stage: 10 })], { reason: 'wiped' }));
    applyRunResult(s, run([seg('ashwood', { stage: 10 })], { reason: 'lantern' }));
    expect(s.areas.ashwood.bossFails).toBe(2);
    expect(bossPity(s, 'ashwood')).toBeCloseTo(2 * BAL.pityPerFail, 9);
    s.areas.ashwood.bossFails = 999;
    expect(bossPity(s, 'ashwood')).toBe(BAL.pityMax);
    applyRunResult(s, kill('ashwood'));
    expect(s.areas.ashwood.bossFails).toBe(0);
    expect(bossPity(s, 'ashwood')).toBe(0);
  });
});

describe('applyRunResult: first clears', () => {
  it('first Ashwood clear: embers, Ranger joins, Drowned Ruins unlocks', () => {
    const s = makeSave({ level: 20 });
    const expectedLevel = recruitLevel(s);
    const ns = applyRunResult(s, kill('ashwood', 40, 0.1));
    expect(ns).toContainEqual({ kind: 'firstClear', area: 'ashwood', embers: AREAS.ashwood.firstClearEmbers });
    expect(ns).toContainEqual({ kind: 'recruit', hero: 'ranger', level: expectedLevel });
    expect(ns).toContainEqual({ kind: 'areaUnlock', area: 'ruins' });
    expect(s.heroes.ranger).toEqual({ recruited: true, level: expectedLevel });
    expect(s.areas.ashwood).toMatchObject({ cleared: true, everCleared: true, best: 10, bestEver: 10, stars: 1 });
    expect(s.areas.ruins.unlocked).toBe(true);
    expect(frontierArea(s)).toBe('ruins');
    expect(s.embers).toBe(AREAS.ashwood.firstClearEmbers + BAL.starEmbers + 9 * BAL.depthEmbers);
    expect(ns).toContainEqual({ kind: 'depth', area: 'ashwood', stage: 10, embers: 9 * BAL.depthEmbers });
    expect(s.stats.bossKills).toBe(1);
    expect(saveProblems(s)).toEqual([]);
  });

  it('recruit level follows the party level', () => {
    const s = makeSave({ level: 40 });
    expect(recruitLevel(s)).toBe(Math.max(1, Math.round(40 * BAL.recruitLevelRatio)));
    expect(recruitLevel(makeSave())).toBeGreaterThanOrEqual(1);
  });

  it('first-clear embers, recruits and unlocks happen once per cycle', () => {
    const s = makeSave({ level: 20 });
    applyRunResult(s, kill('ashwood', 40, 0.1));
    const embers = s.embers;
    const rangerLevel = s.heroes.ranger.level;
    const ns = applyRunResult(s, kill('ashwood', 45, 0.1));
    expect(kinds(ns)).not.toContain('firstClear');
    expect(kinds(ns)).not.toContain('recruit');
    expect(kinds(ns)).not.toContain('areaUnlock');
    expect(s.embers).toBe(embers); // loot.embers = 0, no new star
    expect(s.heroes.ranger.level).toBe(rangerLevel);
    expect(s.stats.bossKills).toBe(2);
  });

  it.each([
    ['ruins', 'arcanist'],
    ['glimmer', 'oracle'],
  ] as const)('clearing %s recruits the %s', (area, hero) => {
    const s = makeSave({ level: 10 });
    for (const a of AREA_ORDER) {
      const ns = applyRunResult(s, kill(a));
      if (a === area) {
        expect(ns.find((n) => n.kind === 'recruit')).toMatchObject({ kind: 'recruit', hero });
        break;
      }
    }
    expect(s.heroes[hero].recruited).toBe(true);
  });

  it('a Descent run clears and unlocks every area it passed through', () => {
    const s = makeSave({ prestige: 1, level: 10 });
    const ns = applyRunResult(s, run([seg('ashwood', { boss: { time: 20, lantern: 0.9 } }), seg('ruins', { boss: { time: 25, lantern: 0.6 } }), seg('glimmer', { stage: 4 })], { reason: 'lantern' }));
    expect(ns.filter((n) => n.kind === 'firstClear').map((n) => (n as { area: AreaId }).area)).toEqual(['ashwood', 'ruins']);
    expect(ns.filter((n) => n.kind === 'recruit').map((n) => (n as { hero: string }).hero)).toEqual(['ranger', 'arcanist']);
    expect(s.areas.ashwood.cleared && s.areas.ruins.cleared).toBe(true);
    expect(s.areas.ruins.unlocked && s.areas.glimmer.unlocked).toBe(true);
    expect(s.areas.glimmer.best).toBe(4);
    expect(s.areas.ashwood.attempts).toBe(1);
    expect(s.areas.ruins.attempts).toBe(0); // attempts count only for the starting area
    expect(s.stats.bossKills).toBe(2);
    expect(saveProblems(s)).toEqual([]);
  });
});

describe('applyRunResult: stars and records', () => {
  it('starsFor thresholds', () => {
    expect(starsFor(0)).toBe(1);
    expect(starsFor(0.49)).toBe(1);
    expect(starsFor(0.5)).toBe(2);
    expect(starsFor(0.75)).toBe(3);
    expect(starsFor(1)).toBe(3);
  });

  it('star embers are granted once per new star', () => {
    const s = makeSave();
    const first = AREAS.ashwood.firstClearEmbers;
    let ns = applyRunResult(s, kill('ashwood', 30, 0.1));
    expect(ns).toContainEqual({ kind: 'star', area: 'ashwood', stars: 1, embers: BAL.starEmbers });
    expect(s.embers).toBe(first + BAL.starEmbers + 9 * BAL.depthEmbers);
    ns = applyRunResult(s, kill('ashwood', 30, 0.2));
    expect(kinds(ns)).not.toContain('star');
    ns = applyRunResult(s, kill('ashwood', 30, 0.8)); // 1 -> 3 stars: two new stars
    expect(ns).toContainEqual({ kind: 'star', area: 'ashwood', stars: 3, embers: 2 * BAL.starEmbers });
    expect(s.embers).toBe(first + 3 * BAL.starEmbers + 9 * BAL.depthEmbers);
    ns = applyRunResult(s, kill('ashwood', 30, 0.55)); // fewer stars never take any back
    expect(kinds(ns)).not.toContain('star');
    expect(s.areas.ashwood.stars).toBe(3);
    expect(s.embers).toBe(first + 3 * BAL.starEmbers + 9 * BAL.depthEmbers);
  });

  it('bossRecord notice when the best kill time improves', () => {
    const s = makeSave();
    expect(kinds(applyRunResult(s, kill('ashwood', 40)))).not.toContain('bossRecord');
    expect(s.areas.ashwood.bossFirstTime).toBe(40);
    expect(applyRunResult(s, kill('ashwood', 30))).toContainEqual({ kind: 'bossRecord', area: 'ashwood', first: 40, prev: 40, now: 30 });
    expect(kinds(applyRunResult(s, kill('ashwood', 35)))).not.toContain('bossRecord');
    expect(applyRunResult(s, kill('ashwood', 12.5))).toContainEqual({ kind: 'bossRecord', area: 'ashwood', first: 40, prev: 30, now: 12.5 });
    expect(s.areas.ashwood.bossFirstTime).toBe(40);
    expect(s.areas.ashwood.bossBestTime).toBe(12.5);
  });
});

describe('applyRunResult: endings', () => {
  it('first Hollow Sovereign kill: ending + Rekindle unlocked, but no Ember Heart in cycle 1', () => {
    const s = saveUpTo('hollow');
    const ns = applyRunResult(s, kill('hollow'));
    expect(kinds(ns)).toContain('ending');
    expect(kinds(ns)).toContain('rekindleReady');
    expect(kinds(ns)).not.toContain('trueEnding');
    expect(s.areas.heart.unlocked).toBe(false);
    expect(canRekindle(s)).toBe(true);
  });

  it('the ending notice is not repeated once seen', () => {
    const s = saveUpTo('hollow');
    s.endingSeen = true;
    const ns = applyRunResult(s, kill('hollow'));
    expect(kinds(ns)).not.toContain('ending');
    expect(kinds(ns)).toContain('rekindleReady');
  });

  it('cycle 2+: clearing The Hollow unlocks The Ember Heart; its clear is the true ending', () => {
    const s = saveUpTo('hollow', 1);
    expect(applyRunResult(s, kill('hollow'))).toContainEqual({ kind: 'areaUnlock', area: 'heart' });
    expect(s.areas.heart.unlocked).toBe(true);
    const ns = applyRunResult(s, kill('heart'));
    expect(kinds(ns)).toContain('trueEnding');
    expect(kinds(ns)).toContain('firstClear');
    expect(kinds(ns)).not.toContain('areaUnlock'); // nothing after the heart
    s.trueEndingSeen = true;
    const again = saveUpTo('hollow', 1);
    again.trueEndingSeen = true;
    applyRunResult(again, kill('hollow'));
    expect(kinds(applyRunResult(again, kill('heart')))).not.toContain('trueEnding');
    expect(saveProblems(s)).toEqual([]);
  });
});

describe('Rekindle', () => {
  it('is impossible before The Hollow is cleared', () => {
    const s = saveUpTo('hollow');
    expect(canRekindle(s)).toBe(false);
    expect(rekindleShards(s)).toBe(0);
    const before = clone(s);
    expect(rekindle(s)).toBe(0);
    expect(s).toEqual(before);
  });

  it('resets gold, levels and area progress; keeps tree, embers, relics, heroes and records', () => {
    const s = saveUpTo('hollow');
    applyRunResult(s, kill('hollow', 50, 0.6));
    s.gold = 98765;
    s.embers = 42;
    s.shards = 3;
    s.tree.tempered_steel = 2;
    s.tree.kindling = 1;
    s.heroes.guardian.level = 61;
    s.heroes.ranger.level = 55;
    s.relicsOwned = ['gale_quiver'];
    s.relicsEquipped = ['gale_quiver'];
    s.playTime = 3000;
    s.cycleTime = 3000;
    const before = clone(s);
    const preview = rekindleShards(s);
    expect(preview).toBeGreaterThan(0);

    expect(rekindle(s)).toBe(preview);
    expect(s.prestige).toBe(1);
    expect(s.shards).toBe(3 + preview);
    expect(s.gold).toBe(0);
    expect(s.cycleTime).toBe(0);
    expect(s.playTime).toBe(3000);
    for (const h of HERO_ORDER) {
      expect(s.heroes[h]).toEqual({ recruited: true, level: 1 });
      expect(s.peakLevels[h]).toBe(before.heroes[h].level);
    }
    expect(s.tree).toEqual(before.tree);
    expect(s.embers).toBe(42);
    expect(s.relicsOwned).toEqual(['gale_quiver']);
    expect(s.relicsEquipped).toEqual(['gale_quiver']);
    for (const a of AREA_ORDER) {
      const ar = s.areas[a];
      const was = before.areas[a];
      expect(ar.unlocked).toBe(a === 'ashwood');
      expect(ar).toMatchObject({ cleared: false, best: 0, attempts: 0, bossFails: 0 });
      expect(ar).toMatchObject({ everCleared: was.everCleared, bestEver: was.bestEver, stars: was.stars, bossFirstTime: was.bossFirstTime, bossBestTime: was.bossBestTime });
    }
    expect(s.selectedArea).toBe('ashwood');
    expect(canRekindle(s)).toBe(false);
    expect(saveProblems(s)).toEqual([]);
  });

  it('peak levels keep the best of each cycle', () => {
    const s = saveUpTo('hollow');
    applyRunResult(s, kill('hollow'));
    s.heroes.guardian.level = 70;
    rekindle(s);
    expect(s.peakLevels.guardian).toBe(70);
    for (const a of AREA_ORDER.slice(0, 5)) applyRunResult(s, kill(a));
    s.heroes.guardian.level = 50;
    rekindle(s);
    expect(s.prestige).toBe(2);
    expect(s.peakLevels.guardian).toBe(70);
  });

  it('unlocks cycle-2 systems: Overdrive, relic slots, Ember Memory, Descent', () => {
    const s = saveUpTo('hollow');
    applyRunResult(s, kill('hollow'));
    expect(canDescendFrom(s, 'ashwood')).toBe(false);
    const memBefore = computeMods(s).memoryMult;
    rekindle(s);
    const m = computeMods(s);
    expect(m.overdrive).toBe(true);
    expect(m.relicSlots).toBeGreaterThanOrEqual(2);
    expect(m.memoryMult).toBeGreaterThan(memBefore);
    expect(canDescendFrom(s, 'ashwood')).toBe(true);
    expect(canDescendFrom(s, 'hollow')).toBe(true); // into The Ember Heart
    expect(canDescendFrom(s, 'heart')).toBe(false); // nothing deeper
  });

  it('shards grow with cleared areas and prestige', () => {
    const a = saveUpTo('hollow');
    applyRunResult(a, kill('hollow'));
    const b = saveUpTo('hollow', 1);
    applyRunResult(b, kill('hollow'));
    applyRunResult(b, kill('heart'));
    expect(rekindleShards(b)).toBeGreaterThan(rekindleShards(a));
  });
});
