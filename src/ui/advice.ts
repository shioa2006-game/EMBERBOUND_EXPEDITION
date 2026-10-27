// Run-result analysis helpers: death recap advice, next goal, affordable levels.
import { ENEMY_LIST } from '../data/enemies.ts';
import { HEROES } from '../data/heroes.ts';
import { allNodeViews, buyLevelsEvenly, type NodeView } from '../core/state.ts';
import type { AbilityDef, RunResult, SaveData } from '../core/types.ts';

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

/** Advice for what killed the party (killedBy) — ability name, enemy name, 'Doom', 'Venom', '…の爆発'. */
export function killedByAdvice(killedBy: string, save: SaveData): RecapLine {
  const hasOracle = save.heroes.oracle.recruited;
  // detonated Doom marks / poison ticks are labelled 'Doom' / 'Venom' (not the ability that applied them)
  if (killedBy === 'Doom') return { text: 'Doom（時限の呪い）に倒された', tip: hasOracle ? 'Sanctuaryで解除・Barrierで吸収' : '呪いの主を優先して倒そう', key: hasOracle ? '4' : undefined };
  if (killedBy === 'Venom') return { text: '毒（Venom）に倒された', tip: hasOracle ? 'Sanctuaryで解毒できる' : 'レベルを上げて耐えよう', key: hasOracle ? '4' : undefined };
  const idx = index();
  const ab = idx.get(killedBy);
  if (ab) {
    const a = ab.ability;
    if (a.interruptible) return { text: `${killedBy}（${ab.owner}）に倒された`, tip: SKILL_HINT.bash.label, key: '1' };
    if (a.effect.kind === 'nova' || a.effect.kind === 'drainLantern') {
      return hasOracle
        ? { text: `紫の大技「${killedBy}」に倒された`, tip: SKILL_HINT.sanctuary.label, key: '4' }
        : { text: `紫の大技「${killedBy}」に倒された`, tip: 'レベルを上げて最大HPを増やそう（中断不可）' };
    }
    if (a.effect.kind === 'doom') return { text: `「${killedBy}」の呪いに倒された`, tip: hasOracle ? 'Sanctuaryで解除できる' : 'レベルを上げて耐えよう', key: hasOracle ? '4' : undefined };
    return { text: `「${killedBy}」（${ab.owner}）に倒された`, tip: 'レベルを上げて耐久力を上げよう' };
  }
  if (killedBy.endsWith('の爆発')) return { text: `${killedBy}に巻き込まれた`, tip: 'HPに余裕を持って倒すか、Barrierで受けよう' };
  if (enemyNames?.has(killedBy)) return { text: `${killedBy}の攻撃に倒された`, tip: 'Goldでレベルを上げてHPと攻撃力を伸ばそう' };
  return { text: `${killedBy}に倒された`, tip: 'Goldでレベルを上げよう' };
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
    const kindling = (save.tree.kindling ?? 0) < 3;
    return { text: 'ランタンの火が尽きた', tip: kindling ? '火力不足：レベルを上げるか Kindling（ランタン+8秒）を習得' : '火力不足：レベルとスキルツリーで火力を伸ばそう' };
  }
  if (r.reason === 'wiped') return { text: 'パーティが全滅した', tip: 'Goldでレベルを上げ、スキルツリーで耐久を伸ばそう' };
  return null;
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
