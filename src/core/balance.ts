// Central balance model. Every growth curve in the game lives here so the
// headless self-play simulation (scripts/sim.ts, scripts/report.ts) can tune one place.
// Tuning rationale and the latest bot report: docs/BALANCE.md.
//
// Global stage index s = 10 * areaIndex + stageIndex + area.stageOffset (0..79).
// Gold grows a hair slower than level cost (1.168 vs 1.175 per step), so the late game
// asks for more runs per level than the early game: later walls are deliberately stickier.

export const BAL = {
  // enemy curves
  enemyHp0: 14,
  enemyHpGrowth: 1.162,
  enemyDmg0: 3.2,
  enemyDmgGrowth: 1.142,
  enemyGold0: 1.15,
  enemyGoldGrowth: 1.168,
  earlyGoldBoost: 2, // extra gold multiplier at stage 0, fading linearly to 0 by earlyGoldStages (snappier first runs)
  earlyGoldStages: 10,

  // hero levels
  heroGrowth: 1.115, // stat multiplier per level
  milestones: [10, 25, 50, 75, 100] as readonly number[], // each grants x milestoneMult
  milestoneMult: 1.5,
  levelCost0: 32,
  levelCostEarly: 0.15, // first levels are discounted (ramps to full price by Lv13)
  levelCostEarlyLevels: 12,
  levelCostGrowth: 1.18,
  recruitLevelRatio: 0.9, // recruits join at this ratio of the party's mean level
  memoryPerLevel: 0.0012, // Ember Memory: dmg & hp x (1 + this * sum of peak levels) after Rekindle

  // run structure
  lanternBase: 60,
  walkTime: 1.1,
  routWalkTime: 0.3,
  routThreshold: 2.0, // wave dies within this many seconds of party DPS -> ROUT
  routThresholdElite: 0.5,
  routDepthScale: 1.0, // ROUT threshold x (1 + this * areaIndex): deeper areas rout outgrown stages sooner
  restHeal: 0.08,
  bossIntroTime: 1.6,
  phaseFreeze: 1.2, // lantern frozen for this long at a boss phase change
  victoryTime: 3.0,
  descentTime: 2.0,
  descentMinLantern: 10,
  descentRefuel: 8,
  lastLightTime: 8,
  pityPerFail: 0.05,
  pityMax: 0.2,

  // drops
  eliteEmbers: [2, 3, 5, 7, 9, 12] as readonly number[],
  bossEmbers: [6, 9, 12, 16, 22, 30] as readonly number[],
  scavengerCap: 3,
  starEmbers: 2,
  depthEmbers: 1, // embers per new best stage reached in an area (per cycle)

  // skills
  bashMult: 2.0, // a plain Bash is a modest hit...
  bashBreakMult: 7, // ...an interrupt (BREAK) is the real payoff: 7x + stagger
  bashStun: 1.5,
  bossStunMult: 0.5,
  shockwaveSecondary: 0.5,
  shockwaveStun: 0.75,
  arrowRainArrows: 10,
  arrowRainMult: 0.55,
  meteorMult: 4.5,
  meteorDelay: 0.8,
  meteorWardMult: 3,
  sanctuaryBarrier: 0.35,
  sanctuaryHeal: 0.15,
  sanctuaryDuration: 8,
  perfectRefund: 0.4, // manual PERFECT casts refund 40% of the cooldown (AUTO never does)
  emberPipTime: 15,
  emberNovaMult: 8,
  emberNovaCd: 30,

  // statuses
  markBonus: 0.2,
  burnPerStack: 0.12, // fraction of applier ATK per second per stack
  burnDuration: 4,
  burnMaxStacks: 3,
  burnArmorShred: 0.15, // armor removed per burn stack
  blockChance: 0.2,
  blockReduction: 0.6,
  staggerMult: 2.0, // damage taken while staggered
  staggerTime: 1.5,
  staggerTimeBoss: 4, // a boss BREAK opens a 4 s double-damage window
  wardBreakStagger: 3,
  vowThreshold: 0.4,

  // overdrive
  overdrivePerSecond: 1.0,
  overdrivePerKill: 2,
  overdrivePerElite: 12,
  overdrivePerInterrupt: 15,
  overdrivePerBreak: 30,
  overdrivePerPerfect: 10,
  overdriveDuration: 6,
} as const;

export function stageIndexGlobal(areaIndex: number, stage: number): number {
  return areaIndex * 10 + stage;
}

export function enemyHpAt(s: number): number {
  return BAL.enemyHp0 * Math.pow(BAL.enemyHpGrowth, s);
}
export function enemyDmgAt(s: number): number {
  return BAL.enemyDmg0 * Math.pow(BAL.enemyDmgGrowth, s);
}
export function enemyGoldAt(s: number): number {
  const fade = Math.max(0, 1 - s / BAL.earlyGoldStages);
  const early = 1 + BAL.earlyGoldBoost * fade * fade; // quadratic fade keeps the curve monotonic
  return BAL.enemyGold0 * Math.pow(BAL.enemyGoldGrowth, s) * early;
}

/** Stat multiplier for a hero level, including milestone bonuses. */
export function heroLevelMult(level: number): number {
  let m = Math.pow(BAL.heroGrowth, level - 1);
  for (const ms of BAL.milestones) if (level >= ms) m *= BAL.milestoneMult;
  return m;
}

/** Next milestone level at or above `level`, or null. */
export function nextMilestone(level: number): number | null {
  for (const ms of BAL.milestones) if (ms > level) return ms;
  return null;
}

/** Visual gear tier 0..5 from level (palette swaps). */
export function gearTier(level: number): number {
  let t = 0;
  for (const ms of BAL.milestones) if (level >= ms) t++;
  return t;
}

export function levelCost(level: number, costMult = 1): number {
  const early = BAL.levelCostEarly + (1 - BAL.levelCostEarly) * Math.min(1, (level - 1) / BAL.levelCostEarlyLevels);
  return Math.ceil(BAL.levelCost0 * Math.pow(BAL.levelCostGrowth, level - 1) * early * costMult);
}

/** Total cost to go from `level` up by `n` levels. */
export function levelCostN(level: number, n: number, costMult = 1): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += levelCost(level + i, costMult);
  return total;
}

/** How many levels can be bought with `gold` starting at `level`. */
export function affordableLevels(level: number, gold: number, costMult = 1, cap = 1000): number {
  let n = 0;
  let spent = 0;
  while (n < cap) {
    const c = levelCost(level + n, costMult);
    if (spent + c > gold) break;
    spent += c;
    n++;
  }
  return n;
}

export function formatNum(n: number): string {
  if (!isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a < 10000) return String(Math.floor(n));
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
  let u = -1;
  let v = a;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return (n < 0 ? '-' : '') + s + units[u];
}

export function formatTime(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
