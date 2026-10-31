// Run-result advice: only actionable tips, who fell first (a lost role), and the change since the last run.
import { describe, expect, it } from 'vitest';
import { simulateRun } from '../src/core/battle.ts';
import type { AreaId, HeroId, RunEndReason, RunResult } from '../src/core/types.ts';
import { changeSinceLastRun, firstDownLine, killedByAdvice, reasonAdvice, vowLine } from '../src/ui/advice.ts';
import { makeSave } from './helpers/saves.ts';

function result(o: Partial<RunResult> & { reason?: RunEndReason; area?: AreaId; stage?: number } = {}): RunResult {
  const area = o.area ?? 'glimmer';
  const stage = o.stage ?? 5;
  return {
    areaId: area,
    reason: o.reason ?? 'wiped',
    stageReached: stage,
    stagesCleared: stage - 1,
    segments: o.segments ?? [{ areaId: area, stageReached: stage, stagesCleared: stage - 1, bossDefeated: false, bossTime: null, lanternFrac: null }],
    kills: o.kills ?? 10,
    eliteKills: 0,
    bossDefeated: false,
    loot: { gold: 100, embers: 0, shards: 0 },
    duration: o.duration ?? 40,
    bestHit: 99,
    interrupts: 0,
    perfects: 0,
    routs: 0,
    emberNovas: 0,
    killedBy: o.killedBy ?? null,
    firstDown: o.firstDown ?? null,
    missed: {},
  };
}

const trio = (): HeroId[] => ['guardian', 'ranger', 'arcanist'];

describe('advice only suggests what the party has', () => {
  it('no Barrier for explosions before the Oracle joins', () => {
    expect(killedByAdvice('Crystal Miteの爆発', makeSave({ heroes: trio() })).tip).not.toContain('Barrier');
    expect(killedByAdvice('Crystal Miteの爆発', makeSave({ heroes: 'all' })).tip).toContain('Barrier');
  });

  it('no Barrier or Sanctuary while a vow leaves the Oracle at camp', () => {
    const lone = makeSave({ heroes: 'all', prestige: 1 });
    lone.vows = ['lone'];
    expect(killedByAdvice('Crystal Miteの爆発', lone).tip).not.toContain('Barrier');
    expect(killedByAdvice('Doom', lone).tip).not.toContain('Sanctuary');
  });

  it('mentions the vows only once an area keeps beating a vowed party', () => {
    const s = makeSave({ heroes: 'all', prestige: 1 });
    s.vows = ['steel', 'horde'];
    s.areas.glimmer.attempts = 2;
    expect(vowLine(result(), s)).toBeNull();
    s.areas.glimmer.attempts = 3;
    const l = vowLine(result(), s)!;
    expect(l.text).toContain('鋼の誓い・群れの誓い');
    expect(l.tip).toContain('破棄');
    expect(vowLine(result({ reason: 'retreat' }), s)).toBeNull();
    s.vows = [];
    expect(vowLine(result(), s)).toBeNull();
  });

  it('suggests Kindling for a lantern-out only while it can still be learned', () => {
    const lantern = result({ reason: 'lantern' });
    expect(reasonAdvice(lantern, makeSave({ heroes: trio(), nodes: { core: 1 } }))?.tip).toContain('Kindling');
    expect(reasonAdvice(lantern, makeSave({ heroes: trio(), nodes: { core: 1, kindling: 3 } }))?.tip).not.toContain('Kindling');
  });
});

describe('firstDownLine', () => {
  const save = makeSave({ heroes: trio() });

  it('names the hero, their role and the interrupt that would have saved them', () => {
    const l = firstDownLine(result({ firstDown: { hero: 'arcanist', time: 12.3, by: 'Prism Beam' } }), save)!;
    expect(l.text).toContain('Arcanist');
    expect(l.text).toContain('魔法役');
    expect(l.text).toContain('Prism Beam');
    expect(l.key).toBe('1');
  });

  it('points chip damage on a backliner at Mark (once the Ranger is in) or that hero’s levels', () => {
    expect(firstDownLine(result({ firstDown: { hero: 'arcanist', time: 8, by: 'Gem Bat' } }), save)!.tip).toContain('Mark');
    const purple = firstDownLine(result({ firstDown: { hero: 'ranger', time: 8, by: 'Shard Storm' } }), save)!;
    expect(purple.tip).not.toContain('Sanctuary');
  });

  it('stays quiet for a shared wipe, a solo party or a victory', () => {
    const fd = { hero: 'arcanist' as const, time: 38, by: 'Prism Beam' };
    expect(firstDownLine(result({ firstDown: fd, duration: 40 }), save)).toBeNull();
    expect(firstDownLine(result({ firstDown: { ...fd, hero: 'guardian', time: 5 } }), makeSave())).toBeNull();
    expect(firstDownLine(result({ firstDown: { ...fd, time: 5 }, reason: 'victory' }), save)).toBeNull();
    expect(firstDownLine(result(), save)).toBeNull();
  });
});

describe('changeSinceLastRun', () => {
  it('compares a failed run with the previous one in the same area and cycle', () => {
    const save = makeSave({ heroes: trio(), level: 20 });
    save.prestige = 7; // a key no other test uses
    expect(changeSinceLastRun(result({ area: 'rimeholt', stage: 4, kills: 9, duration: 30 }), save)).toBeNull();
    for (const h of trio()) save.heroes[h].level += 2;
    expect(changeSinceLastRun(result({ area: 'rimeholt', stage: 6, kills: 14, duration: 41 }), save)).toEqual({ stage: 2, kills: 5, time: 11, levels: 6 });
    // a lantern-out has no survival time to compare
    expect(changeSinceLastRun(result({ area: 'rimeholt', reason: 'lantern', stage: 6, kills: 14, duration: 62 }), save)?.time).toBeNull();
  });

  it('ignores victories, retreats and Descent runs', () => {
    const save = makeSave({ heroes: trio() });
    save.prestige = 8;
    for (const reason of ['victory', 'retreat'] as const) expect(changeSinceLastRun(result({ area: 'hollow', reason }), save)).toBeNull();
    const descent = result({ area: 'hollow' });
    descent.segments = [{ ...descent.segments[0], areaId: 'rimeholt', bossDefeated: true }, descent.segments[0]];
    expect(changeSinceLastRun(descent, save)).toBeNull();
    expect(changeSinceLastRun(result({ area: 'hollow' }), save)).toBeNull(); // nothing remembered before
  });
});

describe('battle records the first hero to fall', () => {
  it('keeps who fell first and what hit them', () => {
    const r = simulateRun(makeSave({ heroes: trio(), level: 1 }), 'glimmer', 7);
    expect(r.reason).toBe('wiped');
    expect(r.firstDown).not.toBeNull();
    expect(trio()).toContain(r.firstDown!.hero);
    expect(r.firstDown!.time).toBeLessThanOrEqual(r.duration);
    expect(typeof r.firstDown!.by).toBe('string');
  });
});
