// Robustness: real battles in every area with many builds (every node, every relic, AUTO, smart AUTO)
// must keep the simulation state sane on every single tick.
import { describe, expect, it } from 'vitest';
import { Battle } from '../src/core/battle.ts';
import { Rng } from '../src/core/rng.ts';
import { applyRunResult } from '../src/core/state.ts';
import { AREA_ORDER, HERO_ORDER, type AreaId, type BattleEvent, type SaveData } from '../src/core/types.ts';
import { AREAS } from '../src/data/areas.ts';
import { RELIC_LIST } from '../src/data/relics.ts';
import { TREE } from '../src/data/tree.ts';
import { DEFAULT_SKILL, makeController } from '../scripts/bot.ts';
import { battleProblems, eventProblems, nonFinitePaths, resultProblems } from './helpers/invariants.ts';
import { makeSave } from './helpers/saves.ts';

interface Build {
  name: string;
  make: (area: AreaId) => SaveData;
  auto: boolean; // AUTO-cast every skill instead of the scripted player
}

const AREA_LEVEL: Record<AreaId, number> = { ashwood: 8, ruins: 20, glimmer: 32, rimeholt: 45, hollow: 58, heart: 80 };
const partyFor = (area: AreaId) => HERO_ORDER.filter((_h, i) => i <= Math.min(3, AREAS[area].index));
const relicSet = (i: number) => RELIC_LIST.slice((i * 4) % RELIC_LIST.length, ((i * 4) % RELIC_LIST.length) + 4).map((r) => r.id);

const BUILDS: Build[] = [
  { name: 'fresh', auto: false, make: (a) => makeSave({ heroes: partyFor(a), level: AREA_LEVEL[a], prestige: a === 'heart' ? 1 : 0 }) },
  ...[0, 1, 2].map((i) => ({
    name: `maxed tree + relics ${relicSet(i).join('/')}`,
    auto: i !== 0,
    make: (a: AreaId) => {
      const s = makeSave({ heroes: 'all', level: AREA_LEVEL[a], prestige: 2, nodes: TREE.map((n) => n.id), relics: relicSet(i) });
      s.peakLevels = { guardian: 30, ranger: 30, arcanist: 30, oracle: 30 };
      return s;
    },
  })),
  {
    name: 'tree without Tactical Instinct (dumb AUTO)',
    auto: true,
    make: (a) => makeSave({ heroes: 'all', level: AREA_LEVEL[a], nodes: TREE.filter((n) => n.branch !== 'rekindled').map((n) => n.id) }),
  },
];

function runChecked(save: SaveData, area: AreaId, seed: number, auto: boolean): string[] {
  const problems: string[] = [];
  const b = new Battle({ save, areaId: area, seed });
  const ctl = auto ? null : makeController(DEFAULT_SKILL, new Rng(seed));
  if (auto) for (const h of HERO_ORDER) b.setAuto(h, true);
  const seen = new Set<BattleEvent['type']>();
  while (!b.ended && b.time < 400) {
    ctl?.(b);
    if (b.canOverdrive() && auto) b.activateOverdrive();
    b.tick(1 / 30);
    const ev = b.drainEvents();
    for (const e of ev) seen.add(e.type);
    for (const p of [...battleProblems(b), ...eventProblems(ev)]) problems.push(`t=${b.time.toFixed(2)} ${p}`);
    if (problems.length > 10) break;
  }
  if (!b.ended) b.retreat();
  const r = b.result!;
  problems.push(...resultProblems(r));
  if (!seen.has('wave')) problems.push('no wave event');
  // results of any build apply cleanly
  applyRunResult(save, r);
  problems.push(...nonFinitePaths(save));
  if (save.gold < 0 || save.embers < 0 || save.shards < 0) problems.push('negative currency after applyRunResult');
  return problems;
}

describe('battle invariants under self-play', () => {
  for (const build of BUILDS) {
    it.each([...AREA_ORDER])(`${build.name}: %s`, (area) => {
      for (const seed of [11, 29]) {
        const save = build.make(area);
        expect(runChecked(save, area, seed, build.auto), `seed ${seed}`).toEqual([]);
      }
    });
  }
});
