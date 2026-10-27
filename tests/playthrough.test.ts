// Integration: the self-play bot (scripts/bot.ts) plays the whole game from a fresh save.
// Bounds are deliberately generous — balance is tuned elsewhere; these catch soft-locks,
// runaway economies and corrupted saves, not pacing.
import { describe, expect, it } from 'vitest';
import { Battle } from '../src/core/battle.ts';
import { Rng } from '../src/core/rng.ts';
import { loadSave, sanitizeSave, writeSave } from '../src/core/save.ts';
import {
  applyRunResult,
  buyLevelsEvenly,
  canRekindle,
  frontierArea,
  newSave,
  rekindle,
  type Notice,
} from '../src/core/state.ts';
import { AREA_ORDER, HERO_ORDER, type SaveData } from '../src/core/types.ts';
import { autoFor, DEFAULT_SKILL, makeController, playthrough, PROFILES, spendEmbers, spendShards, type BotSkill, type SpendOpts } from '../scripts/bot.ts';
import { MemoryKV } from './helpers/kv.ts';
import { battleProblems, eventProblems, nonFinitePaths, resultProblems, saveProblems } from './helpers/invariants.ts';

const HOURS_3 = 3 * 3600;
const MAX_STUCK_RUNS = 12;

function currencyProblems(s: SaveData, when: string): string[] {
  const p: string[] = [];
  for (const k of ['gold', 'embers', 'shards'] as const) if (!(s[k] >= 0) || !Number.isFinite(s[k])) p.push(`${when}: ${k}=${s[k]}`);
  return p;
}

interface SelfPlay {
  firstClear: number | null;
  trueEnd: number | null;
  runs: number;
  maxStuck: number;
  problems: string[];
  save: SaveData;
}

/**
 * Mirror of scripts/bot.ts playthrough() that checks invariants on every tick and after every run and
 * spending step, and measures the longest streak of consecutive runs without any progress.
 */
function selfPlay(seed: number, skill: BotSkill = DEFAULT_SKILL, maxTime = HOURS_3): SelfPlay {
  const save = newSave(0);
  const rng = new Rng(seed);
  const problems: string[] = [];
  let t = 0;
  let runs = 0;
  let firstClear: number | null = null;
  let trueEnd: number | null = null;
  let stuck = 0;
  let maxStuck = 0;
  const spendOpts: SpendOpts = { pursue: [...(skill.pursue ?? [])], wantAuto: (skill.autoMode ?? 'none') !== 'none' };
  const progressKey = () => `${save.prestige}|${AREA_ORDER.map((a) => `${save.areas[a].unlocked ? 1 : 0}${save.areas[a].cleared ? 1 : 0}${save.areas[a].best}`).join(',')}`;

  while (t < maxTime && problems.length < 20) {
    const area = frontierArea(save);
    save.selectedArea = area;
    save.autoCast = autoFor(save, skill);
    const before = progressKey();
    const b = new Battle({ save, areaId: area, seed: rng.int(1e9) });
    const ctl = makeController(skill, rng);
    for (const h of HERO_ORDER) b.setAuto(h, !!save.autoCast[h]);
    while (!b.ended && b.time < 600) {
      ctl(b);
      b.tick(1 / 30);
      const tickProblems = [...battleProblems(b), ...eventProblems(b.drainEvents())];
      if (tickProblems.length) {
        problems.push(...tickProblems.map((p) => `run ${runs} ${area} t=${b.time.toFixed(2)}: ${p}`));
        break;
      }
    }
    if (!b.ended) b.retreat();
    const r = b.result!;
    runs++;
    problems.push(...resultProblems(r).map((p) => `run ${runs} result: ${p}`));
    t += r.duration + skill.campTime;
    save.playTime = t;
    save.cycleTime += r.duration + skill.campTime;

    const notices: Notice[] = applyRunResult(save, r);
    for (const n of notices) {
      if (n.kind === 'ending') {
        firstClear ??= t;
        save.endingSeen = true;
      }
      if (n.kind === 'trueEnding') {
        trueEnd ??= t;
        save.trueEndingSeen = true;
      }
    }
    problems.push(...currencyProblems(save, `run ${runs} after applyRunResult`));
    spendEmbers(save, spendOpts);
    problems.push(...currencyProblems(save, `run ${runs} after spendEmbers`));
    buyLevelsEvenly(save);
    problems.push(...currencyProblems(save, `run ${runs} after buyLevelsEvenly`));
    if (save.prestige === 0 && canRekindle(save) && save.endingSeen) {
      const shards = rekindle(save);
      if (!(shards > 0)) problems.push(`run ${runs}: rekindle granted ${shards} shards`);
      spendShards(save);
      spendEmbers(save, spendOpts);
    } else if (save.prestige >= 1) {
      spendShards(save);
    }
    problems.push(...currencyProblems(save, `run ${runs} after shards`));
    problems.push(...saveProblems(save).map((p) => `run ${runs} save: ${p}`));

    stuck = progressKey() === before ? stuck + 1 : 0;
    maxStuck = Math.max(maxStuck, stuck);
    if (trueEnd !== null) break;
  }
  return { firstClear, trueEnd, runs, maxStuck, problems, save };
}

function expectHealthyFinalSave(s: SaveData): void {
  expect(nonFinitePaths(s)).toEqual([]);
  expect(saveProblems(s)).toEqual([]);
  expect(s.prestige).toBeGreaterThanOrEqual(1);
  expect(s.endingSeen && s.trueEndingSeen).toBe(true);
  expect(HERO_ORDER.every((h) => s.heroes[h].recruited)).toBe(true);
  expect(s.areas.hollow.everCleared && s.areas.heart.everCleared).toBe(true);
  // survives persistence unchanged
  expect(sanitizeSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  const kv = new MemoryKV();
  expect(writeSave(s, kv)).toBe(true);
  expect(loadSave(kv)).toEqual(s);
}

describe('self-play playthrough', () => {
  it.each([12345, 7, 2024])('playthrough() seed %i: first clear and true ending within bounds', (seed) => {
    const rep = playthrough(newSave(0), { seed, maxTime: HOURS_3 });
    expect(rep.firstClearTime, 'Hollow Sovereign never fell').not.toBeNull();
    expect(rep.trueEndTime, 'Hollow Emberbound never fell').not.toBeNull();
    expect(rep.firstClearTime!).toBeGreaterThan(10 * 60); // not trivially short
    expect(rep.firstClearTime!).toBeLessThan(HOURS_3);
    expect(rep.trueEndTime!).toBeGreaterThan(rep.firstClearTime!);
    expect(rep.trueEndTime!).toBeLessThan(HOURS_3);
    expect(rep.maxRunsOnAStage).toBeLessThanOrEqual(MAX_STUCK_RUNS);
    for (let i = 1; i < rep.timeline.length; i++) expect(rep.timeline[i].t).toBeGreaterThanOrEqual(rep.timeline[i - 1].t);
    for (const r of rep.runs) {
      expect(r.gold).toBeGreaterThanOrEqual(0);
      expect(r.embers).toBeGreaterThanOrEqual(0);
      expect(r.dur).toBeGreaterThan(0);
    }
    expectHealthyFinalSave(rep.save);
  });

  it.each([1, 99])('checked self-play seed %i: invariants hold after every tick and run', (seed) => {
    const res = selfPlay(seed);
    expect(res.problems).toEqual([]);
    expect(res.firstClear).not.toBeNull();
    expect(res.trueEnd).not.toBeNull();
    expect(res.trueEnd!).toBeLessThan(HOURS_3);
    expect(res.maxStuck).toBeLessThanOrEqual(MAX_STUCK_RUNS);
    expectHealthyFinalSave(res.save);
  });

  it.each(Object.keys(PROFILES) as (keyof typeof PROFILES)[])('checked self-play, %s profile: finishes the story without getting stuck', (name) => {
    const res = selfPlay(31337, PROFILES[name]);
    expect(res.problems).toEqual([]);
    expect(res.firstClear, `${name} never cleared The Hollow`).not.toBeNull();
    expect(res.trueEnd, `${name} never reached the true ending`).not.toBeNull();
    expect(res.trueEnd!).toBeLessThan(HOURS_3);
    expect(res.maxStuck).toBeLessThanOrEqual(MAX_STUCK_RUNS);
    expectHealthyFinalSave(res.save);
  });

  it('a sloppy player (few interrupts, no shields, no marks) still clears The Hollow', () => {
    const sloppy: BotSkill = { interruptRate: 0.3, shieldRate: 0.3, campTime: 15, useMark: false };
    const res = selfPlay(4711, sloppy);
    expect(res.problems).toEqual([]);
    expect(res.firstClear).not.toBeNull();
    expect(res.firstClear!).toBeLessThan(HOURS_3);
    expect(res.maxStuck).toBeLessThanOrEqual(MAX_STUCK_RUNS);
  });

  it('playthrough() is deterministic for a seed', () => {
    const a = playthrough(newSave(0), { seed: 4242 });
    const b = playthrough(newSave(0), { seed: 4242 });
    expect(a.timeline).toEqual(b.timeline);
    expect(a.runs.length).toBe(b.runs.length);
    expect({ ...a.save, savedAt: 0 }).toEqual({ ...b.save, savedAt: 0 });
  });
});
