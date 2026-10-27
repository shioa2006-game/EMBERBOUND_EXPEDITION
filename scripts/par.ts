// Skill-gap probe: for every boss, find the "par" party level offset at which each bot profile kills
// the boss in >= 50% of runs, starting from the casual bot's state at its first boss attempt.
// The spread between profiles (in levels) is how much skill is worth at that wall.
//   node scripts/par.ts [--seed=101] [--n=30] [--cycle=0] [--areas=ashwood,ruins]
import { Battle } from '../src/core/battle.ts';
import { Rng } from '../src/core/rng.ts';
import { newSave } from '../src/core/state.ts';
import { AREA_ORDER, HERO_ORDER, type AreaId, type SaveData } from '../src/core/types.ts';
import { autoFor, makeController, playthrough, PROFILES, type BotSkill } from './bot.ts';
import { applyOverridesFromArgv } from './overrides.ts';

const __overrides = applyOverridesFromArgv(process.argv.slice(2));
if (__overrides.length) console.log('overrides:', __overrides.join(' '));

const argv = process.argv.slice(2);
const arg = (name: string, d: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const seed = Number(arg('seed', '101'));
const n = Number(arg('n', '30'));
const cycle = Number(arg('cycle', '0'));
const areas = arg('areas', cycle === 0 ? 'ashwood,ruins,glimmer,rimeholt,hollow' : 'hollow,heart').split(',') as AreaId[];

const snaps = new Map<AreaId, SaveData>();
playthrough(newSave(0), {
  skill: PROFILES.casual, seed,
  beforeRun: (save, a) => {
    if (save.prestige === cycle && save.areas[a].best >= 10 && !snaps.has(a)) snaps.set(a, structuredClone(save));
    return save.prestige > cycle || (snaps.size >= areas.length && areas.every((x) => snaps.has(x)));
  },
});

const variants: Record<string, BotSkill> = {
  perfect: { interruptRate: 1, shieldRate: 1, campTime: 0, useMark: true },
  expert: PROFILES.expert,
  casual: PROFILES.casual,
  noskill: PROFILES.noskill,
};

function killRate(base: SaveData, area: AreaId, skill: BotSkill, off: number): number {
  let kills = 0;
  for (let i = 0; i < n; i++) {
    const save = structuredClone(base);
    for (const h of HERO_ORDER) if (save.heroes[h].recruited) save.heroes[h].level = Math.max(1, save.heroes[h].level + off);
    save.areas[area].bossFails = 0;
    save.autoCast = autoFor(save, skill);
    const b = new Battle({ save, areaId: area, seed: 991 + i * 7 });
    for (const h of HERO_ORDER) b.setAuto(h, !!save.autoCast[h]);
    const ctl = makeController(skill, new Rng(31 + i));
    while (!b.ended && b.time < 600) {
      ctl(b);
      b.tick(1 / 30);
      b.events.length = 0;
    }
    if (b.result?.segments[0].bossDefeated) kills++;
  }
  return kills / n;
}

console.log(`par level offsets (kill rate >= 50%), relative to casual's first boss attempt; seed ${seed}, n=${n}`);
console.log(['area', 'lv', ...Object.keys(variants).map((v) => v.padStart(8))].join(' | '));
for (const area of areas.filter((a) => AREA_ORDER.includes(a))) {
  const base = snaps.get(area);
  if (!base) continue;
  const lv = HERO_ORDER.filter((h) => base.heroes[h].recruited).map((h) => base.heroes[h].level).join(',');
  const cells: string[] = [];
  for (const skill of Object.values(variants)) {
    // walk from -10 upward; report the first offset with >= 50%
    let found: number | null = null;
    let lo = -12;
    let hi = 16;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (killRate(base, area, skill, mid) >= 0.5) {
        found = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    cells.push(String(found === null ? '>16' : (found >= 0 ? '+' : '') + found).padStart(8));
  }
  console.log([area.padEnd(8), lv.padEnd(12), ...cells].join(' | '));
}
