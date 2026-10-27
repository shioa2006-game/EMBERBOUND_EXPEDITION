// Run flow: run end reasons, lantern, bosses, pity, ROUT, Descent, determinism.
import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance.ts';
import { Battle, simulateRun } from '../src/core/battle.ts';
import { Rng } from '../src/core/rng.ts';
import { applyRunResult, bossPity } from '../src/core/state.ts';
import { type AreaId, type SaveData } from '../src/core/types.ts';
import { AREA_SHARDS, AREAS } from '../src/data/areas.ts';
import { DEFAULT_SKILL, makeController } from '../scripts/bot.ts';
import { DT, Harness } from './helpers/harness.ts';
import { resultProblems, saveProblems } from './helpers/invariants.ts';
import { clone, makeSave } from './helpers/saves.ts';

function staged(save: SaveData, stage = 0, area: AreaId = 'ashwood', seed = 1234): Harness {
  const h = new Harness({ save, areaId: area, seed });
  h.b.stage = stage;
  h.toFight();
  h.b.routed = false;
  h.pacifyEnemies();
  h.holdFire();
  h.clearLog();
  return h;
}

/** Start a run directly at the boss stage and stop when the boss fight begins. */
function atBoss(save: SaveData, area: AreaId = 'ashwood', seed = 1234): Harness {
  const h = new Harness({ save, areaId: area, seed });
  h.b.stage = 9;
  h.toFight();
  return h;
}

const LAST_LIGHT = { kindling: 1, swift_march: 1, last_light: 1 };

describe('run end reasons', () => {
  it('all heroes dead -> wiped', () => {
    const h = staged(makeSave({ heroes: ['ranger'], level: 5 }));
    for (const u of h.b.heroes) u.doom = { time: 0.05, total: 1, dmg: 1e12 };
    h.tick(0.5);
    expect(h.b.ended).toBe(true);
    expect(h.b.result!.reason).toBe('wiped');
    expect(h.b.result!.killedBy).toBe('Doom');
    expect(h.of('runEnd')).toEqual([{ type: 'runEnd', reason: 'wiped' }]);
    expect(h.of('death').filter((d) => d.side === 'hero').length).toBe(2);
    const s = makeSave();
    applyRunResult(s, h.b.result!);
    expect(s.stats.deaths).toBe(1);
  });

  it('a lone level-1 Guardian in The Hollow is wiped for real', () => {
    const r = simulateRun(makeSave(), 'hollow', 7, { maxTime: 300 });
    expect(r.reason).toBe('wiped');
    expect(r.killedBy).toBeTruthy();
    expect(resultProblems(r)).toEqual([]);
  });

  it('the lantern running out ends the run', () => {
    const h = staged(makeSave({ level: 5 }));
    h.b.lantern = 0.5;
    expect(h.until((b) => b.ended, 2)).toBe(true);
    expect(h.b.result!.reason).toBe('lantern');
    expect(h.b.lantern).toBe(0);
    expect(h.of('lantern')).toContainEqual({ type: 'lantern', low: true });
  });

  it('retreat ends the run immediately and keeps the loot', () => {
    const h = staged(makeSave({ level: 5 }));
    h.finish([h.aliveEnemies()[0]]);
    const gold = h.b.loot.gold;
    expect(gold).toBeGreaterThan(0);
    h.b.retreat();
    h.flush();
    const r = h.b.result!;
    expect(r.reason).toBe('retreat');
    expect(r.loot.gold).toBe(gold);
    expect(r.kills).toBe(1);
    expect(h.of('runEnd')).toEqual([{ type: 'runEnd', reason: 'retreat' }]);
    const t = h.b.time;
    h.b.retreat();
    h.tick(1);
    expect(h.b.result).toBe(r);
    expect(h.b.time).toBe(t);
    expect(resultProblems(r)).toEqual([]);
  });

  it('stage progress is reported for unfinished runs', () => {
    const h = staged(makeSave({ level: 5 }), 3);
    h.b.retreat();
    expect(h.b.result!.stageReached).toBe(4);
    expect(h.b.result!.segments).toHaveLength(1);
  });
});

describe('lantern', () => {
  it('burns while walking and fighting, not during the boss intro', () => {
    const h = new Harness({ save: makeSave({ level: 1 }), areaId: 'ashwood' });
    const start = h.b.lantern;
    expect(start).toBe(h.b.lanternMax);
    h.tick(0.5);
    expect(h.b.phase).toBe('walk');
    expect(h.b.lantern).toBeCloseTo(start - 0.5, 3);
    const boss = new Harness({ save: makeSave({ level: 30 }), areaId: 'ashwood' });
    boss.b.stage = 9;
    boss.until((b) => b.phase === 'bossIntro');
    const l = boss.b.lantern;
    expect(boss.b.lanternFrozen).toBe(true);
    boss.tick(0.5);
    expect(boss.b.lantern).toBe(l);
  });

  it('lantern max includes Kindling', () => {
    const b = new Battle({ save: makeSave({ nodes: { kindling: 2 } }), areaId: 'ashwood', seed: 1 });
    expect(b.mods.lanternBonus).toBeGreaterThan(0);
    expect(b.lanternMax).toBe(BAL.lanternBase + b.mods.lanternBonus);
  });

  it('Swift March: walking does not burn the lantern', () => {
    const h = new Harness({ save: makeSave({ nodes: { kindling: 1, swift_march: 1 } }), areaId: 'ashwood' });
    expect(h.b.lanternFrozen).toBe(true);
    h.tick(0.5);
    expect(h.b.lantern).toBe(h.b.lanternMax);
  });

  it('the boss Flare raises a low lantern', () => {
    const h = new Harness({ save: makeSave({ level: 30 }), areaId: 'ashwood' });
    h.b.stage = 9;
    h.b.lantern = 5;
    h.until((b) => b.phase === 'bossIntro');
    expect(h.b.lantern).toBe(AREAS.ashwood.flare);
    expect(h.of('flare')).toEqual([{ type: 'flare', lantern: AREAS.ashwood.flare }]);
  });

  it('Last Light grants extra seconds once, then the run ends', () => {
    const h = staged(makeSave({ level: 5, nodes: LAST_LIGHT }));
    h.b.lantern = 0.2;
    h.tick(0.5);
    expect(h.b.ended).toBe(false);
    expect(h.of('lastLight')).toHaveLength(1);
    expect(h.b.lastLightActive).toBeGreaterThan(0);
    expect(h.b.lastLightActive).toBeLessThanOrEqual(BAL.lastLightTime);
    const t0 = h.b.time;
    expect(h.until((b) => b.ended, BAL.lastLightTime + 2)).toBe(true);
    expect(h.b.result!.reason).toBe('lantern');
    expect(h.b.time - t0).toBeGreaterThan(BAL.lastLightTime - 1);
    expect(h.of('lastLight')).toHaveLength(1);
  });

  // BUG (src/core/battle.ts spawnStage boss Flare vs burnLantern): if Last Light is active when the
  // party reaches the boss, the Flare refills `lantern` (e.g. to 30 s) but `lastLightActive` keeps
  // counting down, and burnLantern() ends the run with reason 'lantern' when it hits 0 — while the
  // lantern still shows ~30 s. Repro: Last Light owned; lantern hits 0 on stage 9 (Last Light
  // starts); clear the stage; boss intro flares the lantern to area.flare; ~(8 s - time used) into
  // the boss fight the run ends as 'lantern' with b.lantern ≈ 30. Expected: the Flare should end
  // Last Light (lastLightActive = 0) so the refilled lantern burns normally (or Last Light should
  // not end a run whose lantern is above zero).
  it('Flare refilling the lantern during Last Light lets the boss fight continue', () => {
    const h = staged(makeSave({ heroes: 'all', level: 5, nodes: LAST_LIGHT }), 8);
    h.b.lantern = 0.05;
    h.tick(0.2);
    h.finish(h.aliveEnemies());
    expect(h.until((b) => b.phase === 'fight' && b.isBossStage, 10)).toBe(true);
    expect(h.b.lantern).toBe(AREAS.ashwood.flare);
    h.pacifyEnemies();
    h.holdFire();
    h.tick(BAL.lastLightTime + 1);
    expect(h.b.ended).toBe(false);
    expect(h.b.lantern).toBeGreaterThan(0);
  });
});

describe('bosses', () => {
  it('killing the boss is a victory', () => {
    const h = new Harness({ save: makeSave({ level: 30 }), areaId: 'ashwood' });
    h.b.stage = 9;
    expect(h.until((b) => b.phase === 'bossIntro')).toBe(true);
    expect(h.of('bossIntro')).toHaveLength(1);
    expect(h.of('wave').at(-1)).toMatchObject({ stage: 9, boss: true, routed: false });
    h.toFight();
    const boss = h.b.bosses()[0];
    expect(boss.rank).toBe('boss');
    expect(boss.key).toBe(AREAS.ashwood.bossId);
    h.finish([boss]);
    expect(h.b.phase).toBe('victory');
    expect(h.b.lanternFrozen).toBe(true);
    expect(h.until((b) => b.ended, BAL.victoryTime + 1)).toBe(true);
    const r = h.b.result!;
    expect(r.reason).toBe('victory');
    expect(r.bossDefeated).toBe(true);
    expect(r.segments).toHaveLength(1); // no Descent before the first Rekindle
    expect(r.segments[0]).toMatchObject({ areaId: 'ashwood', bossDefeated: true, stageReached: 10, stagesCleared: 10 });
    expect(r.segments[0].bossTime).toBeGreaterThanOrEqual(0);
    expect(r.segments[0].lanternFrac).toBeGreaterThan(0);
    expect(r.loot.embers).toBeGreaterThan(0);
    expect(h.of('bossDefeated')).toEqual([expect.objectContaining({ id: boss.id, final: false })]);
    expect(h.of('descent')).toEqual([]);
    expect(resultProblems(r)).toEqual([]);
  });

  it('The Hollow Sovereign is a final boss', () => {
    const h = atBoss(makeSave({ heroes: 'all', level: 60 }), 'hollow');
    h.finish(h.b.bosses());
    expect(h.of('bossDefeated')).toEqual([expect.objectContaining({ final: true })]);
  });

  it('the four-boss final needs all four shadows dead', () => {
    const h = atBoss(makeSave({ heroes: 'all', level: 60, prestige: 1, unlocked: 'all' }), 'heart');
    const bosses = h.b.bosses();
    expect(bosses).toHaveLength(4);
    h.pacifyEnemies();
    h.holdFire();
    const [survivor, ...rest] = [...bosses].reverse();
    const speedBefore = survivor.speedMult;
    h.finish(rest);
    h.tick(1);
    expect(h.b.phase).toBe('fight');
    expect(h.b.bossDefeated).toBe(false);
    expect(h.of('bossDefeated')).toEqual([]);
    expect(survivor.alive).toBe(true);
    if (survivor.def?.rally) expect(survivor.speedMult).toBeGreaterThan(speedBefore);
    h.finish([survivor]);
    expect(h.until((b) => b.ended, BAL.victoryTime + 1)).toBe(true);
    expect(h.b.result!.reason).toBe('victory');
    expect(h.of('bossDefeated')).toEqual([expect.objectContaining({ id: survivor.id, final: true })]);
  });

  it('pity: failed attempts shrink the boss HP, capped', () => {
    const hpFor = (fails: number) => {
      const s = makeSave({ level: 30 });
      s.areas.ashwood.bossFails = fails;
      const h = atBoss(s);
      return { hp: h.b.bosses()[0].maxHp, pity: h.of('bossIntro')[0].pity, frac: bossPity(s, 'ashwood') };
    };
    const base = hpFor(0);
    expect(base.pity).toBe(0);
    const two = hpFor(2);
    expect(two.pity).toBeCloseTo(2 * BAL.pityPerFail, 9);
    expect(two.hp / base.hp).toBeCloseTo(1 - two.frac, 9);
    const many = hpFor(500);
    expect(many.pity).toBe(BAL.pityMax);
    expect(many.hp / base.hp).toBeCloseTo(1 - BAL.pityMax, 9);
  });

  it('a boss attempt that fails adds pity for the next run', () => {
    const s = makeSave({ level: 1 });
    const h = atBoss(s);
    h.b.retreat();
    applyRunResult(s, h.b.result!);
    expect(s.areas.ashwood.bossFails).toBe(1);
    expect(atBoss(s).b.bossPityFrac).toBeGreaterThan(0);
  });
});

describe('ROUT', () => {
  it('an overpowered party routs regular waves', () => {
    const h = new Harness({ save: makeSave({ heroes: 'all', level: 90 }), areaId: 'ashwood' });
    h.toFight();
    expect(h.b.routed).toBe(true);
    expect(h.b.lanternFrozen).toBe(true);
    expect(h.of('rout')).toEqual([{ type: 'rout', chain: 1 }]);
    expect(h.of('wave')[0]).toMatchObject({ stage: 0, routed: true });
    const l = h.b.lantern;
    expect(h.until((b) => b.stage >= 2 && b.phase === 'fight', 10)).toBe(true);
    expect(h.b.lantern).toBe(l); // no burn during routed fights and walks
    expect(h.of('rout').map((r) => r.chain).slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('a level-1 party does not rout, and bosses never rout', () => {
    const weak = new Harness({ save: makeSave(), areaId: 'ashwood' });
    weak.toFight();
    expect(weak.b.routed).toBe(false);
    expect(weak.of('rout')).toEqual([]);
    const boss = new Harness({ save: makeSave({ heroes: 'all', level: 150 }), areaId: 'ashwood' });
    boss.b.stage = 9;
    boss.until((b) => b.phase === 'bossIntro');
    expect(boss.b.routed).toBe(false);
    expect(boss.of('wave').at(-1)).toMatchObject({ boss: true, routed: false });
  });
});

describe('Descent (cycle 2+)', () => {
  it('a boss kill continues into the next area; applyRunResult clears and unlocks both', () => {
    const save = makeSave({ prestige: 1, level: 40 });
    const h = atBoss(save, 'ashwood');
    h.finish(h.b.bosses());
    expect(h.b.phase).toBe('victory');
    const lanternAtKill = h.b.lantern;
    expect(lanternAtKill).toBeGreaterThanOrEqual(BAL.descentMinLantern);
    expect(h.until(() => h.of('descent').length > 0, BAL.victoryTime + 1)).toBe(true);
    expect(h.of('descent')).toEqual([{ type: 'descent', area: 'ruins' }]);
    expect(h.b.ended).toBe(false);
    expect(h.b.area.id).toBe('ruins');
    expect(h.b.stage).toBe(0);
    expect(h.b.phase).toBe('walk');
    expect(h.b.descending).toBe(true);
    expect(h.b.lanternFrozen).toBe(true);
    expect(h.b.segments.map((s) => s.areaId)).toEqual(['ashwood', 'ruins']);
    expect(h.b.lantern).toBeCloseTo(Math.min(lanternAtKill + BAL.descentRefuel, h.b.lanternMax + BAL.descentRefuel), 6);

    // jump straight to the Drowned Ruins boss and kill it too (its cycle-2 opener is suppressed)
    h.b.stage = 9;
    h.toFight();
    expect(h.b.bosses()[0].key).toBe(AREAS.ruins.bossId);
    h.finish(h.b.bosses());
    expect(h.until(() => h.of('descent').length > 1, BAL.victoryTime + 1)).toBe(true);
    expect(h.b.area.id).toBe('glimmer');
    h.b.retreat();

    const r = h.b.result!;
    expect(resultProblems(r)).toEqual([]);
    expect(r.reason).toBe('retreat');
    expect(r.segments.map((s) => [s.areaId, s.bossDefeated])).toEqual([['ashwood', true], ['ruins', true], ['glimmer', false]]);
    expect(r.loot.shards).toBe(AREA_SHARDS.ashwood + AREA_SHARDS.ruins);

    const ns = applyRunResult(save, r);
    expect(save.areas.ashwood).toMatchObject({ cleared: true, everCleared: true });
    expect(save.areas.ruins).toMatchObject({ unlocked: true, cleared: true, everCleared: true });
    expect(save.areas.glimmer.unlocked).toBe(true);
    expect(save.heroes.ranger.recruited && save.heroes.arcanist.recruited).toBe(true);
    expect(ns.filter((n) => n.kind === 'firstClear')).toHaveLength(2);
    expect(save.shards).toBe(r.loot.shards);
    expect(saveProblems(save)).toEqual([]);
  });

  it('no Descent with a nearly empty lantern', () => {
    const h = atBoss(makeSave({ prestige: 1, level: 40 }), 'ashwood');
    h.finish(h.b.bosses());
    h.b.lantern = BAL.descentMinLantern - 1;
    expect(h.until((b) => b.ended, BAL.victoryTime + 1)).toBe(true);
    expect(h.b.result!.reason).toBe('victory');
    expect(h.of('descent')).toEqual([]);
  });

  it('cycle-2 bosses use their openers', () => {
    const h = atBoss(makeSave({ prestige: 1, heroes: 'all', level: 40 }), 'ruins');
    const boss = h.b.bosses()[0];
    expect(boss.pendingAbility).toBe(boss.def!.opener);
    const p0 = atBoss(makeSave({ heroes: 'all', level: 40 }), 'ruins');
    expect(p0.b.bosses()[0].pendingAbility).toBeNull();
  });
});

describe('determinism and purity', () => {
  it('the same seed gives the same run', () => {
    const s = makeSave({ heroes: ['ranger', 'arcanist'], level: 14, unlocked: ['ruins'] });
    const a = simulateRun(clone(s), 'ruins', 99);
    const b = simulateRun(clone(s), 'ruins', 99);
    expect(a).toEqual(b);
    expect(resultProblems(a)).toEqual([]);
  });

  it('the same seed with the bot controller gives the same run', () => {
    const s = makeSave({ heroes: 'all', level: 30 });
    const go = () => simulateRun(clone(s), 'glimmer', 5, { controller: makeController(DEFAULT_SKILL, new Rng(5)) });
    expect(go()).toEqual(go());
  });

  it('battles never mutate the save', () => {
    const s = makeSave({ heroes: 'all', level: 25, prestige: 1, nodes: ['tempered_steel', 'fletching', 'kindling'], relics: ['phoenix_plume'] });
    s.areas.ashwood.bossFails = 2;
    const before = clone(s);
    simulateRun(s, 'ashwood', 3, { controller: makeController(DEFAULT_SKILL, new Rng(3)) });
    simulateRun(s, 'rimeholt', 4);
    expect(s).toEqual(before);
  });

  it('time advances exactly by the fixed step', () => {
    const b = new Battle({ save: makeSave(), areaId: 'ashwood', seed: 1 });
    for (let i = 0; i < 120; i++) b.tick(DT);
    expect(b.time).toBeCloseTo(2, 9);
  });
});
