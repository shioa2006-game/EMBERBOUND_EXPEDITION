// Headless self-play bot used by the balance simulation and tests.
// Plays like a human of a given skill profile: interrupts windups, shields big hits, marks priority
// targets, spends Gold evenly on levels and Embers on the cheapest interesting tree node.
//
// Profiles (see PROFILES):
//   expert  — reacts to 75% of windups / big hits, always Marks, plays every skill manually (PERFECTs),
//             saves for the ember economy (Scavenger) first.
//   casual  — reacts to 50%, plays half of its cooldowns smartly, Marks half of the waves, puts everything
//             on AUTO once AUTO is smart (Tactical Instinct, cycle 2), saves for Scavenger, spends longer in camp.
//   noskill — never times anything: presses actives whenever it notices they are ready (1.5-5 s late),
//             never Marks, never pre-shields, never touches AUTO.
//   autoplay — noskill that saves for Battle Instinct and puts every skill on (dumb) AUTO.
// DEFAULT_SKILL is the original bot (expert reflexes, greedy spending) — used by sim.ts and the tests.
// See docs/BALANCE.md for the reports these profiles produce.
import { Battle } from '../src/core/battle.ts';
import { computeMods } from '../src/core/mods.ts';
import { Rng } from '../src/core/rng.ts';
import {
  allNodeViews,
  applyRunResult,
  buyLevelsEvenly,
  buyNode,
  buyRelic,
  canRekindle,
  equipRelic,
  frontierArea,
  nodeView,
  rekindle,
  relicSlots,
  type Notice,
} from '../src/core/state.ts';
import { RELIC_LIST } from '../src/data/relics.ts';
import { TREE, TREE_BY_ID } from '../src/data/tree.ts';
import { HERO_ORDER, type AreaId, type HeroId, type RunEndReason, type RunResult, type RunSegment, type SaveData, type Unit } from '../src/core/types.ts';

export interface BotSkill {
  /** Probability the bot notices an orange windup in time (when Bash is ready). */
  interruptRate: number;
  /** Probability the bot notices a big purple windup in time (when Sanctuary is ready). */
  shieldRate: number;
  /** Seconds of "camp time" spent between runs. */
  campTime: number;
  /** Use Mark on priority targets. */
  useMark: boolean;
  /** Probability (decided once per wave) that the bot bothers to Mark. Defaults to 1. */
  markRate?: number;
  /**
   * Probability (rolled every time a skill comes off cooldown) that the player uses it "smartly":
   * holds Bash for the next windup, saves Sanctuary for the next purple hit, fishes for PERFECT casts.
   * Otherwise the skill is simply pressed shortly after it lights up. Default: 1 if interruptRate >= 0.7.
   */
  smartRate?: number;
  /** Shorthand for smartRate 0 (kept for older callers). */
  mash?: boolean;
  /** Seconds between a skill lighting up and the player pressing it on a non-smart cycle. Default [0.15, 1.35]. */
  pressDelay?: [number, number];
  /** What goes on AUTO: nothing, everything once AUTO is smart (Tactical Instinct), damage skills / everything as soon as Battle Instinct is owned. */
  autoMode?: 'none' | 'smart' | 'dps' | 'all';
  /** Tree nodes this player saves up for (e.g. Battle Instinct for AUTO lovers). */
  pursue?: string[];
  /** Profile label for reports. */
  name?: string;
}

export const DEFAULT_SKILL: BotSkill = { interruptRate: 0.75, shieldRate: 0.75, campTime: 9, useMark: true };

export const PROFILES = {
  expert: { ...DEFAULT_SKILL, name: 'expert', markRate: 1, smartRate: 1, autoMode: 'none', pursue: ['scavenger'] },
  casual: { interruptRate: 0.5, shieldRate: 0.5, campTime: 18, useMark: true, markRate: 0.5, smartRate: 0.5, autoMode: 'smart', pursue: ['scavenger'], name: 'casual' },
  noskill: { interruptRate: 0, shieldRate: 0, campTime: 12, useMark: false, markRate: 0, smartRate: 0, pressDelay: [1.5, 5], autoMode: 'none', name: 'noskill' },
  // no-skill player who heads for Battle Instinct and puts every skill on AUTO (informational)
  autoplay: { interruptRate: 0, shieldRate: 0, campTime: 12, useMark: false, markRate: 0, smartRate: 0, pressDelay: [1.5, 5], autoMode: 'all', pursue: ['battle_instinct'], name: 'autoplay' },
} satisfies Record<string, BotSkill>;
export type ProfileId = keyof typeof PROFILES;

const PRIORITY_MARK = new Set(['siren', 'lantern_eater', 'gloom_caster', 'geomancer', 'ember_acolyte', 'shadow_oracle', 'drowned_archer']);

/** Reaction window: a human presses Bash during the last ~1.2 s of an orange bar. */
const REACT = 1.2;

/** Seconds until the next interruptible windup enters the reaction window (bots "learn the rhythm"). */
function nextInterruptible(ts: Unit[]): number {
  let best = Infinity;
  for (const e of ts) {
    if (e.windup?.interruptible) {
      best = Math.min(best, Math.max(0, e.windup.remaining - REACT));
      continue;
    }
    const busy = Math.max(0, e.stun) + (e.windup ? e.windup.remaining : 0);
    const speed = e.speedMult * (e.haste > 0 ? e.hasteMult : 1);
    (e.def?.abilities ?? []).forEach((a, i) => {
      if (!a.interruptible || a.manual) return;
      if ((a.minPhase ?? 0) > e.phase || (a.maxPhase ?? 99) < e.phase) return;
      best = Math.min(best, busy + e.abilityTimers[i] / speed + Math.max(0, a.windup - REACT));
    });
  }
  return best;
}

const BIG_PURPLE = new Set(['nova', 'drainLantern']);

/** Seconds until the next unstoppable party hit lands (bots that know the rhythm save Sanctuary for it). */
function nextPurple(enemies: Unit[]): number {
  let best = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.windup) {
      if (!e.windup.interruptible && BIG_PURPLE.has(e.windup.ability.effect.kind)) best = Math.min(best, e.windup.remaining);
      continue;
    }
    const busy = Math.max(0, e.stun) + Math.max(0, e.untargetable);
    const speed = e.speedMult * (e.haste > 0 ? e.hasteMult : 1);
    (e.def?.abilities ?? []).forEach((a, i) => {
      if (a.interruptible || a.manual || !BIG_PURPLE.has(a.effect.kind)) return;
      if ((a.minPhase ?? 0) > e.phase || (a.maxPhase ?? 99) < e.phase) return;
      best = Math.min(best, busy + e.abilityTimers[i] / speed + a.windup);
    });
  }
  return best;
}

const partyAvg = (b: Battle) => {
  const heroes = b.aliveHeroes();
  return heroes.reduce((s, h) => s + h.hp / h.maxHp, 0) / Math.max(1, heroes.length);
};

export function makeController(skill: BotSkill, rng: Rng) {
  const decided = new Map<number, boolean>();
  const markRate = skill.useMark ? (skill.markRate ?? 1) : 0;
  const smartRate = skill.mash ? 0 : (skill.smartRate ?? (skill.interruptRate >= 0.7 ? 1 : 0.5));
  // per cooldown cycle: when the skill lit up, how long this player takes to press it, and whether they play it smart
  const readySince: Record<HeroId, number> = { guardian: -1, ranger: -1, arcanist: -1, oracle: -1 };
  const delay: Record<HeroId, number> = { guardian: 0, ranger: 0, arcanist: 0, oracle: 0 };
  const smart: Record<HeroId, boolean> = { guardian: false, ranger: false, arcanist: false, oracle: false };
  let markWave = -1;
  let markThisWave = false;
  let odSmart = true;
  const manual = (b: Battle, h: HeroId) => !b.skills[h].auto;
  const notice = (key: number, rate: number) => {
    if (!decided.has(key)) decided.set(key, rng.chance(rate));
    return !!decided.get(key);
  };
  return (b: Battle) => {
    if (b.phase !== 'fight') return;
    const ts = b.targetableEnemies();
    for (const h of HERO_ORDER) {
      if (!b.skillReady(h)) readySince[h] = -1;
      else if (readySince[h] < 0) {
        readySince[h] = b.time;
        const [d0, d1] = skill.pressDelay ?? [0.15, 1.35];
        delay[h] = d0 + rng.next() * (d1 - d0);
        smart[h] = rng.chance(smartRate);
      }
    }
    const pressed = (h: HeroId) => b.time - readySince[h] >= delay[h];
    // Mark (decided once per wave)
    const waveKey = b.segments.length * 100 + b.stage;
    if (waveKey !== markWave) {
      markWave = waveKey;
      markThisWave = markRate > 0 && rng.chance(markRate);
      odSmart = rng.chance(smartRate);
    }
    if (markThisWave && b.canFocus() && b.focusId === null) {
      const pri = ts.find((e) => PRIORITY_MARK.has(e.key));
      if (pri) b.setFocus(pri.id);
    }
    const big = ts.some((e) => e.rank !== 'normal');
    const stunned = ts.some((e) => e.stun > 0.3);
    const g = b.heroUnit('guardian');
    const bashSoon = !!g && g.alive && manual(b, 'guardian') && smart.guardian && b.skills.guardian.cooldown < 2;

    // Guardian: interrupt what you notice; smart cycles keep Bash for the next windup
    if (manual(b, 'guardian') && b.skillReady('guardian')) {
      const w = ts.find((e) => e.windup && e.windup.interruptible && e.windup.remaining < REACT);
      if (w && notice(w.id * 1000 + Math.floor(b.time / 5), skill.interruptRate)) b.cast('guardian');
      else if (smart.guardian) {
        if (!w && nextInterruptible(ts) > b.skills.guardian.maxCooldown * 0.9) b.cast('guardian');
      } else if (pressed('guardian')) b.cast('guardian');
    }
    // Ranger: smart cycles fish for PERFECT (4+ targets or a stunned one)
    if (manual(b, 'ranger') && b.skillReady('ranger')) {
      if (smart.ranger ? ts.length >= 4 || stunned || (!bashSoon && (ts.length >= 2 || big)) : pressed('ranger')) b.cast('ranger');
    }
    // Arcanist: smart cycles fish for PERFECT (3+ targets, a Ward or a stunned target)
    if (manual(b, 'arcanist') && b.skillReady('arcanist')) {
      const ward = ts.some((e) => e.ward > 0);
      if (smart.arcanist ? ts.length >= 3 || ward || stunned || (!bashSoon && (ts.length >= 2 || big)) : pressed('arcanist')) b.cast('arcanist');
    }
    // Oracle: shield what you notice; smart cycles save Sanctuary for the next purple hit
    if (manual(b, 'oracle') && b.skillReady('oracle')) {
      const nuke = b.enemies.some((e) => e.alive && e.windup && !e.windup.interruptible && BIG_PURPLE.has(e.windup.ability.effect.kind) && e.windup.remaining < 1.5);
      const heroes = b.aliveHeroes();
      const avg = partyAvg(b);
      const doomed = heroes.some((h) => (h.doom && h.doom.time < 2) || h.frozen > 1);
      if (nuke && notice(-Math.floor(b.time / 5), skill.shieldRate)) b.cast('oracle');
      else if (doomed && (smart.oracle || pressed('oracle'))) b.cast('oracle');
      else if (smart.oracle) {
        if (avg < 0.3 || (avg < 0.45 && nextPurple(b.enemies) > b.skills.oracle.maxCooldown * 0.8)) b.cast('oracle');
      } else if (avg < 0.55 && pressed('oracle')) b.cast('oracle');
    }
    // Overdrive: smart players save it for elites & bosses
    if (b.canOverdrive() && (big || !odSmart)) b.activateOverdrive();
  };
}

/** AUTO toggles a profile would use given the current save. */
export function autoFor(save: SaveData, skill: BotSkill): Record<HeroId, boolean> {
  const m = computeMods(save);
  const mode = skill.autoMode ?? 'none';
  const all = mode === 'all' || ((mode === 'dps' || mode === 'smart') && m.smartCast);
  const dps = all || mode === 'dps';
  return {
    guardian: m.autoCast && all,
    ranger: m.autoCast && dps,
    arcanist: m.autoCast && dps,
    oracle: m.autoCast && all,
  };
}

export interface SpendOpts {
  /** Node ids the bot saves up for (in order) once their prerequisites are met. */
  pursue?: string[];
  /** Players who like AUTO head for Battle Instinct. */
  wantAuto?: boolean;
}

/** Spend embers: prefer mechanics over stats, cheapest first, with a little lookahead toward synergies. */
export function spendEmbers(save: SaveData, opts: SpendOpts = {}): string[] {
  const bought: string[] = [];
  for (let guard = 0; guard < 200; guard++) {
    // goal: a pursued node whose prerequisites are met -> save for it
    const goal = (opts.pursue ?? []).find((id) => {
      const v = nodeView(save, id);
      return v.status === 'available' || v.status === 'upgradable';
    });
    let cap = Infinity;
    if (goal) {
      if (buyNode(save, goal)) {
        bought.push(goal);
        continue;
      }
      // still saving: only small purchases that barely delay the goal
      const goalCost = nodeView(save, goal).cost ?? 0;
      cap = Math.floor(goalCost * 0.2);
      if (save.embers - cap < 0) break;
    }
    const views = allNodeViews(save).filter((v) => v.affordable && (v.cost ?? 0) <= cap);
    if (!views.length) break;
    views.sort((a, b) => score(b) - score(a));
    const pick = views[0];
    if (!buyNode(save, pick.node.id)) break;
    bought.push(pick.node.id);
  }
  return bought;
  function score(v: ReturnType<typeof allNodeViews>[number]): number {
    const n = v.node;
    let s = 100 - (v.cost ?? 0) * 2;
    if (n.kind === 'synergy') s += 25;
    if (n.kind === 'keystone') s += 20;
    if (n.kind === 'ability' || n.kind === 'behavior') s += 10;
    if (n.id === 'kindling' || n.id === 'tempered_steel' || n.id === 'fletching' || n.id === 'kindled_focus' || n.id === 'grace') s += 15;
    if (n.id === 'battle_instinct') s += opts.wantAuto ? 25 : -15;
    if (opts.wantAuto && leadsTo(n.id, 'battle_instinct')) s += 10;
    if ((opts.pursue ?? []).some((id) => leadsTo(n.id, id))) s += 30;
    return s;
  }
}

/** True if owning `id` is (transitively) a prerequisite of `goal`. */
function leadsTo(id: string, goal: string, depth = 0): boolean {
  if (id === goal) return true;
  if (depth > 8) return false;
  const g = TREE_BY_ID[goal];
  if (!g) return false;
  const reqs = [...(g.req.anyOf ?? []), ...(g.req.allOf ?? [])];
  if (g.req.synergyCount && TREE_BY_ID[id]?.kind === 'synergy') return true;
  return reqs.some((r) => leadsTo(id, r, depth + 1));
}

export const RELIC_PREFS = ['bastion_heart', 'stormhawk_eye', 'hourglass_ash', 'ember_crown', 'gale_quiver', 'phoenix_plume', 'conduit_prism', 'lantern_eternity', 'gilded_idol', 'twin_fang', 'mirror_aegis', 'soulbound_chalice'];

/** Buy & equip relics. `forced` = exact loadout to use (bought first); otherwise preference order. */
export function spendShards(save: SaveData, forced?: string[]): string[] {
  const bought: string[] = [];
  const prefs = forced ?? RELIC_PREFS;
  for (const id of prefs) if (buyRelic(save, id)) bought.push(id);
  const slots = relicSlots(save);
  save.relicsEquipped = [];
  for (const id of prefs) {
    if (save.relicsEquipped.length >= slots) break;
    if (save.relicsOwned.includes(id)) equipRelic(save, id);
  }
  void RELIC_LIST;
  return bought;
}

export type TimelineKind = 'node' | 'rank' | 'hero' | 'area' | 'clear' | 'elite' | 'boss' | 'rekindle' | 'relic' | 'ending' | 'trueEnding';

export interface TimelineEvent {
  t: number; // seconds of play
  what: string;
  kind?: TimelineKind;
  cycle?: number;
}

export interface RunRecord {
  t: number; // play time at the end of the run (+ camp time)
  start: number; // play time when the run started
  cycle: number; // prestige when the run started
  area: AreaId; // starting area
  stage: number; // stage reached in the last segment
  reason: RunEndReason;
  dur: number;
  gold: number;
  embers: number;
  levels: number[];
  routs: number;
  segments: RunSegment[];
  killedBy: string | null;
}

export interface PlaythroughReport {
  timeline: TimelineEvent[];
  runs: RunRecord[];
  attemptsPerBoss: Record<string, number>;
  firstClearTime: number | null; // hollow cleared
  trueEndTime: number | null;
  rekindleTime: number | null;
  maxRunsOnAStage: number;
  /** Fraction of the cycle-1 tree (by ember cost) owned right after the first clear. */
  treeAtFirstClear: number | null;
  /** Fraction of cycle-1 tree nodes (by count) owned right after the first clear. */
  treeNodesAtFirstClear: number | null;
  save: SaveData;
  /** Save snapshot taken right before the first Rekindle (for cycle-2 experiments). */
  preRekindle: SaveData | null;
}

export interface PlaythroughOpts {
  skill?: BotSkill;
  seed?: number;
  maxTime?: number;
  stopAtTrueEnding?: boolean;
  /** Stop right before the first Rekindle (report.preRekindle holds the save). */
  stopAtRekindle?: boolean;
  /** Called before every run; return true to stop the playthrough there. */
  beforeRun?: (save: SaveData, area: AreaId) => boolean | void;
  log?: boolean;
  /** Cycle-2 relic loadout to force (bought first, nothing else equipped). */
  relics?: string[];
  /** Vows to take at the Rekindle into cycle 2. */
  vows?: string[];
  /** Tree nodes to save up for (see SpendOpts). */
  pursue?: string[];
}

const CYCLE1_TREE = TREE.filter((n) => n.branch !== 'rekindled' && n.branch !== 'core');
const CYCLE1_COST = CYCLE1_TREE.reduce((a, n) => a + n.costs.reduce((x, y) => x + y, 0), 0);

export function treeFraction(save: SaveData): { cost: number; nodes: number } {
  let cost = 0;
  let nodes = 0;
  for (const n of CYCLE1_TREE) {
    const r = save.tree[n.id] ?? 0;
    if (r > 0) nodes++;
    for (let i = 0; i < r; i++) cost += n.costs[i];
  }
  return { cost: cost / CYCLE1_COST, nodes: nodes / CYCLE1_TREE.length };
}

export function playthrough(save: SaveData, opts: PlaythroughOpts = {}): PlaythroughReport {
  const skill = opts.skill ?? DEFAULT_SKILL;
  const rng = new Rng(opts.seed ?? 12345);
  const maxTime = opts.maxTime ?? 3 * 3600;
  const spendOpts: SpendOpts = { pursue: [...(opts.pursue ?? []), ...(skill.pursue ?? [])], wantAuto: (skill.autoMode ?? 'none') !== 'none' };
  let t = save.playTime;
  const timeline: TimelineEvent[] = [];
  const runs: RunRecord[] = [];
  const attemptsPerBoss: Record<string, number> = {};
  const stageTries = new Map<string, number>();
  let maxRunsOnAStage = 0;
  let firstClearTime: number | null = null;
  let trueEndTime: number | null = null;
  let rekindleTime: number | null = null;
  let treeAtFirstClear: number | null = null;
  let treeNodesAtFirstClear: number | null = null;
  let preRekindle: SaveData | null = null;
  const seenNodes = new Set<string>(Object.keys(save.tree).filter((k) => (save.tree[k] ?? 0) > 0));
  const push = (what: string, kind: TimelineKind) => timeline.push({ t, what, kind, cycle: save.prestige });
  const spend = () => {
    const nodes = spendEmbers(save, spendOpts);
    for (const id of nodes) {
      if (!seenNodes.has(id)) {
        seenNodes.add(id);
        push(`node ${id}`, 'node');
      } else {
        push(`rank ${id}`, 'rank');
      }
    }
  };
  const shards = () => {
    for (const id of spendShards(save, opts.relics)) push(`relic ${id}`, 'relic');
  };

  while (t < maxTime) {
    const area = frontierArea(save);
    save.selectedArea = area;
    save.autoCast = autoFor(save, skill);
    if (opts.beforeRun?.(save, area)) break;
    const start = t;
    const cycle = save.prestige;
    const b = new Battle({ save, areaId: area, seed: rng.int(1e9) });
    const ctl = makeController(skill, rng);
    const dt = 1 / 30;
    for (const h of HERO_ORDER) b.setAuto(h, !!save.autoCast[h]);
    while (!b.ended && b.time < 600) {
      ctl(b);
      b.tick(dt);
      b.events.length = 0;
    }
    if (!b.ended) b.retreat();
    const r: RunResult = b.result!;
    t += r.duration + skill.campTime;
    save.playTime = t;
    save.cycleTime += r.duration + skill.campTime;
    const last = r.segments[r.segments.length - 1];
    const key = `${save.prestige}:${last.areaId}:${last.stageReached}`;
    const tries = (stageTries.get(key) ?? 0) + 1;
    stageTries.set(key, tries);
    if (!last.bossDefeated) maxRunsOnAStage = Math.max(maxRunsOnAStage, tries);
    for (const seg of r.segments) {
      if (seg.stageReached >= 10) attemptsPerBoss[`${save.prestige}:${seg.areaId}`] = (attemptsPerBoss[`${save.prestige}:${seg.areaId}`] ?? 0) + 1;
    }
    // first sight of an area's elite (stage 5) and boss (stage 10): new mechanics on screen
    for (const seg of r.segments) {
      const best = save.areas[seg.areaId].bestEver;
      if (best < 5 && seg.stageReached >= 5) push('elite ' + seg.areaId, 'elite');
      if (best < 10 && seg.stageReached >= 10) push('boss ' + seg.areaId, 'boss');
    }
    const notices: Notice[] = applyRunResult(save, r);
    for (const n of notices) {
      if (n.kind === 'recruit') push(`recruit ${n.hero} (Lv${n.level})`, 'hero');
      if (n.kind === 'firstClear') push(`clear ${n.area} (cycle ${save.prestige})`, 'clear');
      if (n.kind === 'areaUnlock') push(`unlock ${n.area}`, 'area');
      if (n.kind === 'ending' && firstClearTime === null) {
        firstClearTime = t;
        push('ENDING', 'ending');
      }
      if (n.kind === 'trueEnding' && trueEndTime === null) {
        trueEndTime = t;
        push('TRUE ENDING', 'trueEnding');
      }
    }
    for (const n of notices) if (n.kind === 'ending') save.endingSeen = true;
    for (const n of notices) if (n.kind === 'trueEnding') save.trueEndingSeen = true;
    spend();
    buyLevelsEvenly(save);
    if (firstClearTime === t && treeAtFirstClear === null) {
      const f = treeFraction(save);
      treeAtFirstClear = f.cost;
      treeNodesAtFirstClear = f.nodes;
    }
    const rec: RunRecord = {
      t, start, cycle, area, stage: last.stageReached, reason: r.reason, dur: r.duration, gold: r.loot.gold, embers: r.loot.embers,
      levels: HERO_ORDER.filter((h) => save.heroes[h].recruited).map((h) => save.heroes[h].level),
      routs: r.routs, segments: r.segments, killedBy: r.killedBy,
    };
    runs.push(rec);
    if (opts.log) {
      const segs = r.segments.map((s) => `${s.areaId}:${s.stageReached}${s.bossDefeated ? '★' : ''}`).join('>');
      console.log(`${fmt(t)} ${segs.padEnd(26)} ${r.reason.padEnd(8)} ${r.duration.toFixed(1).padStart(5)}s gold+${r.loot.gold} emb+${r.loot.embers} lv[${rec.levels.join(',')}] emb=${save.embers} routs=${r.routs}${r.killedBy ? ' killedBy=' + r.killedBy : ''}`);
    }
    // prestige once the hollow is cleared in cycle 1
    if (save.prestige === 0 && canRekindle(save) && save.endingSeen) {
      if (opts.stopAtRekindle) {
        preRekindle = structuredClone(save);
        break;
      }
      preRekindle = structuredClone(save);
      const gained = rekindle(save, opts.vows);
      rekindleTime = t;
      push(`REKINDLE (+${gained} shards)`, 'rekindle');
      shards();
      spend();
    } else if (save.prestige >= 1) {
      shards();
    }
    if (trueEndTime !== null && opts.stopAtTrueEnding !== false) break;
    if (save.prestige === 0 && t > maxTime) break;
  }
  return { timeline, runs, attemptsPerBoss, firstClearTime, trueEndTime, rekindleTime, maxRunsOnAStage, treeAtFirstClear, treeNodesAtFirstClear, save, preRekindle };
}

/** Continue a pre-Rekindle save into cycle 2 (used for relic comparisons). */
export function continueFromRekindle(pre: SaveData, opts: PlaythroughOpts = {}): PlaythroughReport {
  const save = structuredClone(pre);
  const t0 = save.playTime;
  rekindle(save, opts.vows);
  spendShards(save, opts.relics);
  spendEmbers(save, { pursue: [...(opts.pursue ?? []), ...(opts.skill?.pursue ?? [])], wantAuto: (opts.skill?.autoMode ?? 'none') !== 'none' });
  const rep = playthrough(save, opts);
  rep.rekindleTime = t0;
  return rep;
}

export function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
