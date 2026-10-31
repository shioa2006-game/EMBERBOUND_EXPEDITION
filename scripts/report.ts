// Balance report: several seeds x bot profiles, compact tables.
//   node scripts/report.ts                       (3 seeds x expert/casual/noskill)
//   node scripts/report.ts --seeds=1,2,3,4,5 --profiles=casual
//   node scripts/report.ts --relics [--profiles=casual] [--vows=steel+horde]   (cycle 2 with each relic forced)
//   node scripts/report.ts --gaps                (list every >5 min gap without something new)
//   node scripts/report.ts --runs                (per-run log for each playthrough)
import { newSave } from '../src/core/state.ts';
import { RELIC_LIST } from '../src/data/relics.ts';
import { AREA_ORDER, type AreaId } from '../src/core/types.ts';
import { continueFromRekindle, fmt, playthrough, PROFILES, type BotSkill, type PlaythroughReport, type ProfileId, type RunRecord } from './bot.ts';
import { applyOverridesFromArgv } from './overrides.ts';

const __overrides = applyOverridesFromArgv(process.argv.slice(2));
if (__overrides.length) console.log('overrides:', __overrides.join(' '));

const argv = process.argv.slice(2);
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => argv.includes(`--${name}`);
const seeds = (arg('seeds') ?? '101,202,303').split(',').map(Number);
const profiles = (arg('profiles') ?? 'expert,casual,noskill').split(',');
const GAP = 300;

/** 'casual' or a variant such as 'casual@interruptRate=0;markRate=0' (values parsed as JSON). */
function profileOf(spec: string): BotSkill {
  const [base, mods] = spec.split('@');
  const p: BotSkill = { ...(PROFILES as Record<string, BotSkill>)[base] };
  if (!PROFILES[base as ProfileId]) throw new Error('unknown profile ' + base);
  for (const kv of (mods ?? '').split(';').filter(Boolean)) {
    const [k, v] = kv.split('=');
    (p as unknown as Record<string, unknown>)[k] = JSON.parse(v.replace(/\|/g, ',')); // arrays: ["a"|"b"]
  }
  p.name = spec;
  return p;
}

const SHORT: Record<AreaId, string> = { ashwood: 'Ash', ruins: 'Ruin', glimmer: 'Glim', rimeholt: 'Rime', hollow: 'Holl', heart: 'Hrt' };
const t = (s: number | null | undefined) => (s === null || s === undefined ? '  --  ' : fmt(s));
const pad = (s: string | number, n: number) => String(s).padStart(n);
const padR = (s: string | number, n: number) => String(s).padEnd(n);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

interface AreaStat {
  firstStage: number | null;
  runs: number;
  att: number;
  kill: number | null;
}

interface Metrics {
  profile: string;
  seed: number;
  c1: Record<AreaId, AreaStat>;
  firstClear: number | null;
  tree: number | null;
  treeNodes: number | null;
  bi: number | null;
  bond: number | null;
  rekindle: number | null;
  c2Clear: Partial<Record<AreaId, number>>;
  c2FirstRun: string;
  c2FirstRouts: number;
  heartFirstStage: number | null;
  heartRuns: number;
  heartAtt: number;
  trueEnd: number | null;
  runs: number;
  maxStall: number;
  stallWhere: string;
  inBand: number;
  medianDur: number;
  gaps: { from: number; to: number; after: string }[];
  gapsRank: { from: number; to: number; after: string }[];
  rep: PlaythroughReport;
}

function areaStats(runs: RunRecord[], cycle: number): Record<AreaId, AreaStat> {
  const out = {} as Record<AreaId, AreaStat>;
  for (const a of AREA_ORDER) out[a] = { firstStage: null, runs: 0, att: 0, kill: null };
  for (const r of runs) {
    if (r.cycle !== cycle) continue;
    for (const seg of r.segments) {
      const s = out[seg.areaId];
      if (s.kill !== null) continue;
      if (s.firstStage === null) s.firstStage = seg.stageReached;
      s.runs++;
      if (seg.stageReached >= 10) s.att++;
      if (seg.bossDefeated) s.kill = r.t;
    }
  }
  return out;
}

/** Longest streak of runs that did not push the cycle's frontier (area, stage) or kill a new boss. */
function maxStall(runs: RunRecord[]): { n: number; where: string } {
  let best = -1;
  let cyc = -1;
  let streak = 0;
  let max = 0;
  let where = '';
  for (const r of runs) {
    if (r.cycle !== cyc) {
      cyc = r.cycle;
      best = -1;
      streak = 0;
    }
    let reach = -1;
    for (const seg of r.segments) {
      const v = AREA_ORDER.indexOf(seg.areaId) * 11 + seg.stageReached + (seg.bossDefeated ? 1 : 0);
      reach = Math.max(reach, v);
    }
    if (reach > best) {
      best = reach;
      streak = 0;
    } else {
      streak++;
      if (streak > max) {
        max = streak;
        const last = r.segments[r.segments.length - 1];
        where = `c${r.cycle + 1} ${SHORT[last.areaId]}${last.stageReached}`;
      }
    }
  }
  return { n: max, where };
}

/** Gaps longer than GAP between 'new things' (new node, hero, area, first elite/boss sight, relic, rekindle). */
function gapsOf(rep: PlaythroughReport, end: number, withRanks = false): Metrics['gaps'] {
  const evs = rep.timeline.filter((e) => withRanks || e.kind !== 'rank');
  const out: Metrics['gaps'] = [];
  let prev = 0;
  let prevWhat = 'start';
  for (const e of evs) {
    if (e.t - prev > GAP) out.push({ from: prev, to: e.t, after: prevWhat });
    if (e.t > prev) {
      prev = e.t;
      prevWhat = e.what;
    }
  }
  if (end - prev > GAP) out.push({ from: prev, to: end, after: prevWhat });
  return out;
}

function analyse(profile: string, seed: number, rep: PlaythroughReport): Metrics {
  const c1 = areaStats(rep.runs, 0);
  const c2 = areaStats(rep.runs, 1);
  const c2Clear: Partial<Record<AreaId, number>> = {};
  for (const a of AREA_ORDER) if (c2[a].kill !== null) c2Clear[a] = c2[a].kill!;
  const c2runs = rep.runs.filter((r) => r.cycle === 1);
  const first2 = c2runs[0];
  const node = (id: string) => rep.timeline.find((e) => e.what === `node ${id}`)?.t ?? null;
  const durs = rep.runs.map((r) => r.dur).sort((a, b) => a - b);
  const end = rep.trueEndTime ?? rep.runs[rep.runs.length - 1]?.t ?? 0;
  const stall = maxStall(rep.runs);
  return {
    profile, seed, c1,
    firstClear: rep.firstClearTime,
    tree: rep.treeAtFirstClear,
    treeNodes: rep.treeNodesAtFirstClear,
    bi: node('battle_instinct'),
    bond: node('emberbond'),
    rekindle: rep.rekindleTime,
    c2Clear,
    c2FirstRun: first2 ? first2.segments.map((s) => `${SHORT[s.areaId]}${s.bossDefeated ? '★' : s.stageReached}`).join('>') : '--',
    c2FirstRouts: first2?.routs ?? 0,
    heartFirstStage: c2.heart.firstStage,
    heartRuns: c2.heart.runs,
    heartAtt: c2.heart.att,
    trueEnd: rep.trueEndTime,
    runs: rep.runs.length,
    maxStall: stall.n,
    stallWhere: stall.where,
    inBand: durs.filter((d) => d >= 25 && d <= 90).length / Math.max(1, durs.length),
    medianDur: durs[Math.floor(durs.length / 2)] ?? 0,
    gaps: gapsOf(rep, end),
    gapsRank: gapsOf(rep, end, true),
    rep,
  };
}

function printRuns(m: Metrics): void {
  console.log(`\n--- runs: ${m.profile} seed ${m.seed} ---`);
  for (const r of m.rep.runs) {
    const segs = r.segments.map((s) => `${SHORT[s.areaId]}:${s.stageReached}${s.bossDefeated ? '★' : ''}`).join('>');
    console.log(`${fmt(r.t)} c${r.cycle + 1} ${padR(segs, 30)} ${padR(r.reason, 8)} ${pad(r.dur.toFixed(1), 5)}s emb+${pad(r.embers, 3)} lv[${r.levels.join(',')}] routs=${r.routs}${r.killedBy ? ' ✝' + r.killedBy : ''}`);
  }
}

/** One line per profile: averages of the key pacing numbers (for parameter sweeps). */
function printBrief(all: Metrics[]): void {
  for (const p of profiles) {
    const ms = all.filter((m) => m.profile === p);
    const av = (f: (m: Metrics) => number | null | undefined) => {
      const xs = ms.map(f).filter((x): x is number => typeof x === 'number' && isFinite(x));
      return xs.length ? avg(xs) : null;
    };
    const kills = AREA_ORDER.slice(0, 5).map((a) => t(av((m) => m.c1[a].kill)).trim()).join(' ');
    const fs = AREA_ORDER.slice(0, 5).map((a) => (av((m) => m.c1[a].firstStage) ?? 0).toFixed(1)).join('/');
    const att = AREA_ORDER.slice(0, 5).map((a) => (av((m) => m.c1[a].att) ?? 0).toFixed(1)).join('/');
    const rk = (m: Metrics, a: AreaId) => (m.c2Clear[a] !== undefined && m.rekindle !== null ? m.c2Clear[a]! - m.rekindle : null);
    const maxGap = Math.max(0, ...ms.flatMap((m) => m.gaps.map((g) => g.to - g.from)));
    const f1 = (x: number | null) => (x ?? 0).toFixed(1);
    console.log(
      `${padR(p, 7)} kills[${kills}] 1st[${fs}] att[${att}] tree ${((av((m) => m.tree) ?? 0) * 100).toFixed(0)}% AUTO ${t(av((m) => m.bi)).trim()}` +
        ` | c2 Holl+${t(av((m) => rk(m, 'hollow'))).trim()} Hrt+${t(av((m) => rk(m, 'heart'))).trim()} s/r/a ${f1(av((m) => m.heartFirstStage))}/${f1(av((m) => m.heartRuns))}/${f1(av((m) => m.heartAtt))}` +
        ` | TRUE ${t(av((m) => m.trueEnd)).trim()} runs ${(av((m) => m.runs) ?? 0).toFixed(0)} stall ${Math.max(...ms.map((m) => m.maxStall))} band ${((av((m) => m.inBand) ?? 0) * 100).toFixed(0)}% gap ${t(maxGap).trim()}(${ms.reduce((a, m) => a + m.gaps.length, 0)})` +
        ` +rank ${t(Math.max(0, ...ms.flatMap((m) => m.gapsRank.map((g) => g.to - g.from)))).trim()}(${ms.reduce((a, m) => a + m.gapsRank.length, 0)})`,
    );
  }
}

// ───────────────────────────── main table ─────────────────────────────

if (!flag('relics')) {
  const all: Metrics[] = [];
  for (const p of profiles) {
    for (const seed of seeds) {
      const camp = arg('camp');
      const skill = camp ? { ...profileOf(p), campTime: Number(camp) } : profileOf(p);
      const rep = playthrough(newSave(0), { skill, seed, maxTime: 3 * 3600 });
      const m = analyse(p, seed, rep);
      all.push(m);
      if (flag('runs')) printRuns(m);
    }
  }
  if (flag('brief')) {
    printBrief(all);
    process.exit(0);
  }

  console.log('\nCYCLE 1 — per area: s=first-run stage  r=runs until boss kill  a=boss attempts  @kill time');
  const head = ['profile', 'seed', ...AREA_ORDER.slice(0, 5).map((a) => padR(SHORT[a], 18)), '1stClr', 'tree%(n%)', 'AUTO', 'Bond'];
  console.log(head.join(' | '));
  for (const m of all) {
    const cells = AREA_ORDER.slice(0, 5).map((a) => {
      const s = m.c1[a];
      return padR(`s${s.firstStage ?? '-'} r${s.runs} a${s.att} @${t(s.kill)}`, 18);
    });
    const tree = m.tree === null ? '  --   ' : `${pad((m.tree * 100).toFixed(0), 3)}%(${pad(((m.treeNodes ?? 0) * 100).toFixed(0), 2)})`;
    console.log([padR(m.profile, 7), pad(m.seed, 4), ...cells, t(m.firstClear), padR(tree, 9), t(m.bi), t(m.bond)].join(' | '));
  }

  console.log('\nCYCLE 2 — Δ from Rekindle; first run path (★ = boss killed), area clear times, Heart: first stage / runs / boss attempts');
  console.log(['profile', 'seed', 'rekindle', padR('first run (routs)', 30), ...AREA_ORDER.map((a) => padR(SHORT[a], 6)), 'Hrt s/r/a', 'TRUE END', 'runs', 'stall', '25-90s', 'med'].join(' | '));
  for (const m of all) {
    const rk = m.rekindle ?? 0;
    const cl = AREA_ORDER.map((a) => padR(m.c2Clear[a] !== undefined ? fmt(m.c2Clear[a]! - rk) : '--', 6));
    console.log([
      padR(m.profile, 7), pad(m.seed, 4), padR(t(m.rekindle), 8), padR(`${m.c2FirstRun} (${m.c2FirstRouts})`, 30), ...cl,
      padR(`${m.heartFirstStage ?? '-'}/${m.heartRuns}/${m.heartAtt}`, 9), padR(t(m.trueEnd), 8), pad(m.runs, 4), padR(`${m.maxStall} ${m.stallWhere}`, 12),
      pad((m.inBand * 100).toFixed(0) + '%', 6), pad(m.medianDur.toFixed(0) + 's', 4),
    ].join(' | '));
  }

  console.log('\nAVERAGES per profile (mm:ss)');
  console.log(['profile', ...AREA_ORDER.slice(0, 4).map((a) => padR(SHORT[a] + ' kill', 9)), '1stClr', 'tree%', 'AUTO', 'Holl c2Δ', 'Heart c2Δ', 'TRUE END', 'max gap', 'gaps>5m'].join(' | '));
  for (const p of profiles) {
    const ms = all.filter((m) => m.profile === p);
    const av = (f: (m: Metrics) => number | null | undefined) => {
      const xs = ms.map(f).filter((x): x is number => typeof x === 'number' && isFinite(x));
      return xs.length === ms.length ? avg(xs) : xs.length ? avg(xs) : null;
    };
    const maxGap = Math.max(0, ...ms.flatMap((m) => m.gaps.map((g) => g.to - g.from)));
    console.log([
      padR(p, 7),
      ...AREA_ORDER.slice(0, 4).map((a) => padR(t(av((m) => m.c1[a].kill)), 9)),
      t(av((m) => m.firstClear)),
      padR(((av((m) => m.tree) ?? 0) * 100).toFixed(0) + '%', 5),
      t(av((m) => m.bi)),
      padR(t(av((m) => (m.c2Clear.hollow !== undefined && m.rekindle !== null ? m.c2Clear.hollow - m.rekindle : null))), 8),
      padR(t(av((m) => (m.c2Clear.heart !== undefined && m.rekindle !== null ? m.c2Clear.heart - m.rekindle : null))), 9),
      padR(t(av((m) => m.trueEnd)), 8),
      t(maxGap),
      ms.reduce((a, m) => a + m.gaps.length, 0),
    ].join(' | '));
  }
  const fast = all.filter((m) => m.profile === 'expert');
  const cas = all.filter((m) => m.profile === 'casual');
  const nos = all.filter((m) => m.profile === 'noskill');
  if (cas.length && (fast.length || nos.length)) {
    const ca = avg(cas.map((m) => m.trueEnd ?? 3 * 3600));
    if (fast.length) console.log(`expert is ${((1 - avg(fast.map((m) => m.trueEnd ?? 3 * 3600)) / ca) * 100).toFixed(0)}% faster than casual (true ending)`);
    if (nos.length) console.log(`noskill is ${((avg(nos.map((m) => m.trueEnd ?? 3 * 3600)) / ca - 1) * 100).toFixed(0)}% slower than casual (true ending)`);
  }

  // gaps
  console.log('\nGAPS > 5 min without a new node / hero / area / first elite or boss sight / relic (rank-ups not counted; * = no rank-up either)');
  for (const m of all) {
    if (!m.gaps.length) continue;
    const alsoNoRank = (g: Metrics['gaps'][number]) => m.gapsRank.some((x) => x.from < g.to && x.to > g.from);
    console.log(`  ${padR(m.profile, 7)} ${pad(m.seed, 4)}: ` + m.gaps.map((g) => `${fmt(g.from)}→${fmt(g.to)} (${Math.round(g.to - g.from)}s after ${g.after})${alsoNoRank(g) ? '*' : ''}`).join(', '));
  }

  // emberbond pursuit (casual)
  if (profiles.includes('casual') && !flag('nopursue')) {
    const res = seeds.map((seed) => {
      const rep = playthrough(newSave(0), { skill: PROFILES.casual, seed, maxTime: 3 * 3600, pursue: ['emberbond'] });
      return { seed, bond: rep.timeline.find((e) => e.what === 'node emberbond')?.t ?? null, first: rep.firstClearTime, end: rep.trueEndTime };
    });
    console.log('\nEMBERBOND pursued (casual): ' + res.map((r) => `seed ${r.seed}: bond ${t(r.bond)} (1stClr ${t(r.first)}, true ${t(r.end)})`).join('  '));
    const bi = seeds.map((seed) => {
      const rep = playthrough(newSave(0), { skill: { ...PROFILES.casual, pursue: ['battle_instinct'] }, seed, maxTime: 3 * 3600, stopAtRekindle: true });
      return rep.timeline.find((e) => e.what === 'node battle_instinct')?.t ?? null;
    });
    console.log('BATTLE INSTINCT (AUTO) pursued from the start (casual): ' + bi.map((x, i) => `seed ${seeds[i]}: ${t(x)}`).join('  '));
  }
}

// ───────────────────────────── relic comparison ─────────────────────────────

if (flag('relics')) {
  const p = profiles[0] ?? 'casual';
  const vows = arg('vows')?.split('+') ?? [];
  console.log(`\nRELICS — ${p}, cycle 2 with a single forced relic (Δ from Rekindle)${vows.length ? `, vows ${vows.join('+')}` : ''}. seeds ${seeds.join(',')}`);
  const pres = seeds.map((seed) => playthrough(newSave(0), { skill: profileOf(p), seed, stopAtRekindle: true }).preRekindle!);
  console.log(['relic', 'cost', 'Holl Δ', 'Heart Δ', 'Hrt att', 'runs c2', 'per seed (heart Δ)'].join(' | '));
  for (const relic of [null, ...RELIC_LIST.map((r) => r.id)]) {
    const rows = pres.map((pre, i) => {
      const rep = continueFromRekindle(pre, { skill: profileOf(p), seed: seeds[i] + 7, relics: relic ? [relic] : [], vows, maxTime: 4 * 3600 });
      const rk = pre.playTime;
      const c2 = areaStats(rep.runs, 1);
      return {
        holl: c2.hollow.kill !== null ? c2.hollow.kill - rk : null,
        heart: c2.heart.kill !== null ? c2.heart.kill - rk : null,
        att: c2.heart.att,
        runs: rep.runs.length,
      };
    });
    const cost = relic ? RELIC_LIST.find((r) => r.id === relic)!.cost : 0;
    const a = (f: (r: (typeof rows)[number]) => number | null) => {
      const xs = rows.map(f).filter((x): x is number => x !== null);
      return xs.length ? avg(xs) : null;
    };
    console.log([
      padR(relic ?? '(none)', 18), pad(cost, 4), padR(t(a((r) => r.holl)), 6), padR(t(a((r) => r.heart)), 7), pad((a((r) => r.att) ?? 0).toFixed(1), 7), pad((a((r) => r.runs) ?? 0).toFixed(1), 7),
      rows.map((r) => t(r.heart)).join(' '),
    ].join(' | '));
  }
}
