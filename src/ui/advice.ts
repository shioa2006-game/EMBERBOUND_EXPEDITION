// Run-result analysis helpers: death recap advice, change since the last run, next goal, affordable levels.
import { ENEMY_LIST } from '../data/enemies.ts';
import { HEROES } from '../data/heroes.ts';
import { formatTime } from '../core/balance.ts';
import { activeVows } from '../core/mods.ts';
import { allNodeViews, buyLevelsEvenly, expeditionParty, nodeView, type NodeView } from '../core/state.ts';
import { HERO_ORDER, type AbilityDef, type HeroId, type RunResult, type SaveData } from '../core/types.ts';

let abilityIndex: Map<string, { ability: AbilityDef; owner: string }> | null = null;
let enemyNames: Set<string> | null = null;

function index(): Map<string, { ability: AbilityDef; owner: string }> {
  if (!abilityIndex) {
    abilityIndex = new Map();
    enemyNames = new Set();
    for (const e of ENEMY_LIST) {
      enemyNames.add(e.name);
      for (const a of e.abilities ?? []) if (!abilityIndex.has(a.name)) abilityIndex.set(a.name, { ability: a, owner: e.name });
    }
  }
  return abilityIndex;
}

export interface RecapLine {
  text: string;
  tip: string;
  key?: string; // hotkey badge, e.g. "1"
}

const SKILL_HINT = {
  bash: { key: '1', label: `${HEROES.guardian.skill.name}で中断` },
  sanctuary: { key: '4', label: `${HEROES.oracle.skill.name}のBarrierで防ぐ` },
};

/** What each hero brings: what the party loses when that hero falls first. */
const ROLE: Record<HeroId, string> = {
  guardian: '前衛・中断役',
  ranger: '射手・Mark役',
  arcanist: '魔法役',
  oracle: '回復役',
};

interface Cause {
  /** The ability / enemy as the recap names it. */
  what: string;
  /** "…に倒された" in the final-blow line. */
  text: string;
  tip: string;
  key?: string;
}

/**
 * The fix for whatever landed a fatal blow (ability name, enemy name, 'Doom', 'Venom', '…の爆発'), suggesting only
 * what the party has now: no Barrier or Sanctuary before the Oracle joins, no Mark before the Ranger does.
 * `victim`: the hero who fell, when one specific hero is meant (their own levels are the fix for chip damage).
 */
function cause(by: string, save: SaveData, victim: HeroId | null): Cause {
  // a hero left at camp by a vow offers no Sanctuary / Mark either
  const party = expeditionParty(save);
  const hasOracle = party.includes('oracle');
  const levelUp = victim && victim !== 'guardian' ? `${HEROES[victim].name}のレベルを重点的に上げよう` : 'レベルを上げて耐久力を上げよう';
  // detonated Doom marks / poison ticks are labelled 'Doom' / 'Venom' (not the ability that applied them)
  if (by === 'Doom') return { what: 'Doom（時限の呪い）', text: 'Doom（時限の呪い）に倒された', tip: hasOracle ? 'Sanctuaryで解除・Barrierで吸収' : '呪いの主を優先して倒そう', key: hasOracle ? '4' : undefined };
  if (by === 'Venom') return { what: '毒（Venom）', text: '毒（Venom）に倒された', tip: hasOracle ? 'Sanctuaryで解毒できる' : levelUp, key: hasOracle ? '4' : undefined };
  const ab = index().get(by);
  if (ab) {
    const a = ab.ability;
    if (a.interruptible) return { what: `${by}（${ab.owner}）`, text: `${by}（${ab.owner}）に倒された`, tip: SKILL_HINT.bash.label, key: '1' };
    if (a.effect.kind === 'nova' || a.effect.kind === 'drainLantern') {
      return hasOracle
        ? { what: `紫の大技「${by}」`, text: `紫の大技「${by}」に倒された`, tip: SKILL_HINT.sanctuary.label, key: '4' }
        : { what: `紫の大技「${by}」`, text: `紫の大技「${by}」に倒された`, tip: 'レベルを上げて最大HPを増やそう（中断不可）' };
    }
    if (a.effect.kind === 'doom') return { what: `「${by}」の呪い`, text: `「${by}」の呪いに倒された`, tip: hasOracle ? 'Sanctuaryで解除できる' : levelUp, key: hasOracle ? '4' : undefined };
    return { what: `「${by}」（${ab.owner}）`, text: `「${by}」（${ab.owner}）に倒された`, tip: levelUp };
  }
  if (by.endsWith('の爆発')) {
    return { what: by, text: `${by}に巻き込まれた`, tip: hasOracle ? 'HPに余裕を持って倒すか、Barrierで受けよう' : 'HPに余裕を持って倒そう（レベルで最大HPを上げる）' };
  }
  if (enemyNames?.has(by)) {
    const mark = party.includes('ranger') && victim && victim !== 'guardian';
    return { what: `${by}の攻撃`, text: `${by}の攻撃に倒された`, tip: mark ? `Markで${by}を先に倒すか、${HEROES[victim].name}のレベルを上げよう` : 'Goldでレベルを上げてHPと攻撃力を伸ばそう' };
  }
  return { what: by, text: `${by}に倒された`, tip: 'Goldでレベルを上げよう' };
}

/** Advice for what killed the party (killedBy): the final blow on the last hero. */
export function killedByAdvice(killedBy: string, save: SaveData): RecapLine {
  const c = cause(killedBy, save, null);
  return { text: c.text, tip: c.tip, key: c.key };
}

/** Seconds the others must fight on after the first fall for it to count as losing that hero's role. */
const FIGHT_ON_SEC = 5;

/**
 * 「Arcanist（魔法役）が12.3sで倒れた：Prism Beam（Prism Sentinel）→ [1] Shield Bashで中断」.
 * Only when the rest of the party fought on without that hero for a while: a lost role, not a shared wipe.
 */
export function firstDownLine(r: RunResult, save: SaveData): RecapLine | null {
  const fd = r.firstDown;
  if (!fd || r.reason === 'victory' || r.duration - fd.time < FIGHT_ON_SEC) return null;
  if (expeditionParty(save).length < 2) return null;
  const name = HEROES[fd.hero].name;
  const head = `${name}（${ROLE[fd.hero]}）が${formatTime(fd.time)}で倒れた`;
  if (!fd.by) return { text: head, tip: `${name}のレベルを重点的に上げよう` };
  const c = cause(fd.by, save, fd.hero);
  return { text: `${head}：${c.what}`, tip: c.tip, key: c.key };
}

/** Interruptible abilities that landed: 「Root Crushを2回中断できなかった → [1] Shield Bash」 */
export function missedLines(r: RunResult, save: SaveData): RecapLine[] {
  const idx = index();
  const lines: RecapLine[] = [];
  const entries = Object.entries(r.missed).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of entries.slice(0, 3)) {
    const ab = idx.get(name);
    const kind = ab?.ability.effect.kind;
    let tip = HEROES.guardian.skill.name;
    if (kind === 'healAllies') tip = save.heroes.ranger.recruited ? `${HEROES.guardian.skill.name}／Markで優先撃破` : HEROES.guardian.skill.name;
    lines.push({ text: `${name}を${count}回中断できなかった`, tip, key: '1' });
  }
  return lines;
}

/** Generic advice by run-end reason when nothing more specific applies. */
export function reasonAdvice(r: RunResult, save: SaveData): RecapLine | null {
  if (r.reason === 'lantern') {
    // suggest Kindling only while it can be learned or ranked up
    const st = nodeView(save, 'kindling').status;
    const kindling = st === 'available' || st === 'upgradable';
    return { text: 'ランタンの火が尽きた', tip: kindling ? '火力不足：レベルを上げるか Kindling（ランタン+8秒）を習得' : '火力不足：レベルとスキルツリーで火力を伸ばそう' };
  }
  if (r.reason === 'wiped') return { text: 'パーティが全滅した', tip: 'Goldでレベルを上げ、スキルツリーで耐久を伸ばそう' };
  return null;
}

/** Failed departures to one area (this cycle, not yet cleared) before the recap mentions the vows. */
const VOW_HINT_ATTEMPTS = 3;

/** 「鋼の誓いの縛りがかかっている → レリックタブで破棄できる」 once an area keeps beating a vowed party. */
export function vowLine(r: RunResult, save: SaveData): RecapLine | null {
  const vows = activeVows(save);
  const area = save.areas[r.areaId];
  if (!vows.length || r.reason === 'victory' || r.reason === 'retreat' || area.cleared || area.attempts < VOW_HINT_ATTEMPTS) return null;
  return { text: `${vows.map((v) => v.name).join('・')}の縛りがかかっている`, tip: 'レリックタブで破棄すると解ける（その誓約の報酬はなくなる）' };
}

// ─────────────────────────── change since the last run ───────────────────────────

interface RunSnapshot {
  stage: number;
  kills: number;
  duration: number;
  levels: number;
  wiped: boolean;
}

/** Differences from the previous failed run in the same area (this session): what the last round of upgrades changed. */
export interface RunChange {
  stage: number;
  kills: number;
  /** Survival time, when both runs were wipes (a lantern run always lasts the whole lantern). */
  time: number | null;
  /** Sum of the party's levels. */
  levels: number;
}

/** The last failed single-area run per cycle and area, kept for this session only. */
const lastRuns = new Map<string, RunSnapshot>();

/**
 * Compare a wipe or lantern-out with the previous one in the same area and remember it for the next comparison.
 * Victories, retreats and Descent runs (several areas) are neither compared nor remembered.
 */
export function changeSinceLastRun(r: RunResult, save: SaveData): RunChange | null {
  if ((r.reason !== 'wiped' && r.reason !== 'lantern') || r.segments.length > 1) return null;
  const key = `${save.prestige}:${r.areaId}`;
  const now: RunSnapshot = {
    stage: r.stageReached,
    kills: r.kills,
    duration: r.duration,
    levels: HERO_ORDER.reduce((sum, hero) => sum + (save.heroes[hero].recruited ? save.heroes[hero].level : 0), 0),
    wiped: r.reason === 'wiped',
  };
  const prev = lastRuns.get(key);
  lastRuns.set(key, now);
  if (!prev) return null;
  return {
    stage: now.stage - prev.stage,
    kills: now.kills - prev.kills,
    time: now.wiped && prev.wiped ? now.duration - prev.duration : null,
    levels: now.levels - prev.levels,
  };
}

export interface NextGoal {
  view: NodeView;
  cost: number;
  affordable: boolean;
}

/** Cheapest available non-stat tree node (falls back to any available/upgradable node). */
export function nextGoal(save: SaveData): NextGoal | null {
  const views = allNodeViews(save).filter((v) => v.cost !== null && v.node.kind !== 'root');
  const byCost = (a: NodeView, b: NodeView) => (a.cost ?? 0) - (b.cost ?? 0);
  let pool = views.filter((v) => v.status === 'available' && v.node.kind !== 'stat').sort(byCost);
  if (!pool.length) pool = views.filter((v) => v.status === 'available' || v.status === 'upgradable').sort(byCost);
  const v = pool[0];
  if (!v) return null;
  return { view: v, cost: v.cost ?? 0, affordable: v.affordable };
}

/** How many hero levels the current Gold buys when spent evenly. */
export function affordableLevelCount(save: SaveData): number {
  try {
    const clone = structuredClone(save) as SaveData;
    return buyLevelsEvenly(clone);
  } catch {
    return 0;
  }
}
