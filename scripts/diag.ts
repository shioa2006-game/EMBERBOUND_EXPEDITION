// Fight diagnostics: freeze a save at a point of a bot playthrough, then replay many runs from it
// with different controllers and print outcome + damage breakdowns.
//   node scripts/diag.ts --area=ruins --when=boss [--profile=casual] [--seed=101] [--n=30] [--levels=0] [--cycle=0]
//   --when=entry  first run in the area      --when=boss  first run after reaching the boss
import { Battle } from '../src/core/battle.ts';
import { Rng } from '../src/core/rng.ts';
import { newSave } from '../src/core/state.ts';
import { HERO_ORDER, type AreaId, type SaveData } from '../src/core/types.ts';
import { autoFor, makeController, playthrough, PROFILES, type BotSkill, type ProfileId } from './bot.ts';
import { applyOverridesFromArgv } from './overrides.ts';

const __overrides = applyOverridesFromArgv(process.argv.slice(2));
if (__overrides.length) console.log('overrides:', __overrides.join(' '));

const argv = process.argv.slice(2);
const arg = (name: string, d: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? d;
const area = arg('area', 'ashwood') as AreaId;
const when = arg('when', 'boss');
const profile = arg('profile', 'casual') as ProfileId;
const seed = Number(arg('seed', '101'));
const n = Number(arg('n', '30'));
const extraLv = Number(arg('levels', '0'));
const cycle = Number(arg('cycle', '0'));
const detail = argv.includes('--detail');

let snap: SaveData | null = null;
playthrough(newSave(0), {
  skill: PROFILES[profile], seed,
  beforeRun: (save, a) => {
    if (save.prestige !== cycle || a !== area) return false;
    if (when === 'entry' || save.areas[a].best >= 10) {
      snap = structuredClone(save);
      return true;
    }
    return false;
  },
});
if (!snap) throw new Error('state not reached');
const base: SaveData = snap;
for (const h of HERO_ORDER) if (base.heroes[h].recruited) base.heroes[h].level += extraLv;
console.log(`state: ${profile} seed ${seed} cycle ${cycle} ${area} (${when}) t=${Math.round(base.playTime)}s levels ${HERO_ORDER.filter((h) => base.heroes[h].recruited).map((h) => base.heroes[h].level).join(',')} tree=${Object.keys(base.tree).filter((k) => base.tree[k] > 0).join(' ')}`);

const variants: Record<string, BotSkill> = {
  perfect: { interruptRate: 1, shieldRate: 1, campTime: 0, useMark: true },
  expert: PROFILES.expert,
  casual: PROFILES.casual,
  noskill: PROFILES.noskill,
  cas_s25: { ...PROFILES.casual, smartRate: 0.25 },
  cas_s75: { ...PROFILES.casual, smartRate: 0.75 },

  idle: { interruptRate: 0, shieldRate: 0, campTime: 0, useMark: false, autoMode: 'none' },
};

for (const [name, skill] of Object.entries(variants)) {
  const taken = new Map<string, number>();
  const dealt = new Map<string, number>();
  const reasons = new Map<string, number>();
  let stage = 0;
  let dur = 0;
  let kills = 0;
  let bossTime = 0;
  let interrupts = 0;
  let perfects = 0;
  const missed = new Map<string, number>();
  const killedBy = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const save = structuredClone(base);
    save.autoCast = autoFor(save, skill);
    const rng = new Rng(1000 + i);
    const b = new Battle({ save, areaId: area, seed: 77 + i * 13 });
    for (const h of HERO_ORDER) b.setAuto(h, !!save.autoCast[h]);
    const ctl = makeController(skill, rng);
    while (!b.ended && b.time < 600) {
      ctl(b);
      b.tick(1 / 30);
      for (const e of b.events) {
        if (e.type !== 'damage') continue;
        const dst = b.unitById(e.dst);
        const src = e.src !== null ? b.unitById(e.src) : undefined;
        if (!dst) continue;
        if (dst.side === 'hero') {
          const k = `${src?.name ?? '?'}:${e.tag}${e.big ? '!' : ''}`;
          taken.set(k, (taken.get(k) ?? 0) + (e.amount - e.absorbed) / dst.maxHp);
        } else {
          const k = `${src?.key ?? e.tag}:${e.tag}`;
          dealt.set(k, (dealt.get(k) ?? 0) + e.amount);
        }
      }
      b.events.length = 0;
    }
    if (!b.ended) b.retreat();
    const r = b.result!;
    const seg = r.segments[0];
    reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
    stage += seg.stageReached;
    dur += r.duration;
    if (seg.bossDefeated) {
      kills++;
      bossTime += seg.bossTime ?? 0;
    }
    interrupts += r.interrupts;
    perfects += r.perfects;
    for (const [k, v] of Object.entries(r.missed)) missed.set(k, (missed.get(k) ?? 0) + v);
    if (r.killedBy) killedBy.set(r.killedBy, (killedBy.get(r.killedBy) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, k: number, scale = 1) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([a, v]) => `${a}=${(v / n / scale).toFixed(2)}`).join(' ');
  console.log(`\n[${name}] stage ${(stage / n).toFixed(1)} dur ${(dur / n).toFixed(0)}s boss kills ${kills}/${n}${kills ? ` (avg ${(bossTime / kills).toFixed(1)}s)` : ''} ends ${[...reasons.entries()].map(([a, v]) => `${a}:${v}`).join(' ')} intr ${(interrupts / n).toFixed(1)} perf ${(perfects / n).toFixed(1)}`);
  console.log(`  missed: ${top(missed, 6)}   killedBy: ${top(killedBy, 4)}`);
  if (detail) {
    console.log(`  taken (hero max-HP units/run): ${top(taken, 10)}`);
    const totalDealt = [...dealt.values()].reduce((a, b) => a + b, 0);
    console.log(`  dealt share: ${[...dealt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([a, v]) => `${a}=${((v / totalDealt) * 100).toFixed(0)}%`).join(' ')}`);
  }
}
