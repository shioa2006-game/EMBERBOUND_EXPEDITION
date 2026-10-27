// Shared type definitions for EMBERBOUND EXPEDITION.
// Core simulation code (src/core) must stay DOM-free so it can run headless in Node (tests, balance sim).

export type HeroId = 'guardian' | 'ranger' | 'arcanist' | 'oracle';
export const HERO_ORDER: readonly HeroId[] = ['guardian', 'ranger', 'arcanist', 'oracle'];

export type AreaId = 'ashwood' | 'ruins' | 'glimmer' | 'rimeholt' | 'hollow' | 'heart';
export const AREA_ORDER: readonly AreaId[] = ['ashwood', 'ruins', 'glimmer', 'rimeholt', 'hollow', 'heart'];

export type DamageType = 'phys' | 'magic' | 'true';
export type TargetStyle = 'front' | 'backline' | 'lowest' | 'random';
export type EnemyRank = 'normal' | 'elite' | 'boss';
export type UnitSize = 'small' | 'medium' | 'large' | 'huge';

// ---------------------------------------------------------------------------
// Static data definitions
// ---------------------------------------------------------------------------

export interface HeroDef {
  id: HeroId;
  name: string; // English proper noun
  title: string; // Japanese role line
  color: string; // UI accent
  hp: number;
  atk: number;
  interval: number; // seconds between auto attacks
  critChance: number;
  critMult: number;
  skill: SkillDef;
  mechanic: string; // Japanese one-liner describing what this hero adds
}

export interface SkillDef {
  id: string;
  name: string;
  key: string; // hotkey label
  cooldown: number;
  desc: string; // Japanese
  perfect: string; // Japanese: condition for a Perfect Cast
}

export type AbilityEffect =
  | { kind: 'strike'; mult: number; target: TargetStyle; stun?: number; dot?: { dps: number; duration: number }; perAlly?: { enemy: string; mult: number } }
  | { kind: 'nova'; mult: number; chill?: number; perAlly?: { enemy: string; mult: number }; wardScale?: number }
  | { kind: 'summon'; enemy: string; count: number; max?: number; hpMult?: number }
  | { kind: 'ward'; amount: number } // fraction of own max HP
  | { kind: 'wardAllies'; amount: number } // fraction of each ally's max HP
  | { kind: 'healAllies'; amount: number } // fraction of max HP, lowest ally
  | { kind: 'doom'; mult: number; count: number; delay: number }
  | { kind: 'freeze'; duration: number; count: number }
  | { kind: 'submerge'; duration: number; then?: string; summon?: { enemy: string; count: number; hpMult?: number } } // untargetable, then starts ability `then`
  | { kind: 'drainLantern'; seconds: number; mult: number }
  | { kind: 'buffAllies'; speed: number; dmg: number; duration: number };

export interface AbilityDef {
  id: string;
  name: string; // shown above the windup bar
  cooldown: number;
  initialDelay?: number; // first use after N seconds (defaults to cooldown * 0.5)
  windup: number; // 0 = instant
  interruptible: boolean;
  effect: AbilityEffect;
  minPhase?: number; // boss phase gating (0-based)
  maxPhase?: number;
  /** Channel: drains lantern seconds per second while winding up. */
  channelDrain?: number;
  /** Windup breaks (counts as a Break/Stagger) if the party deals this fraction of max HP during it. */
  breakFrac?: number;
  /** If the caster's Ward breaks during this windup, the windup becomes interruptible. */
  wardLinked?: boolean;
  /** Caster gains a Ward of this fraction of max HP when the windup starts. */
  startWard?: number;
  /** Only used in cycle 2+ (after the first Rekindle). */
  cycle2?: boolean;
  /** Never on a timer; started by phaseAbility / opener / submerge `then`. */
  manual?: boolean;
}

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  rank: EnemyRank;
  size: UnitSize;
  hp: number; // multiplier on curve HP
  dmg: number; // multiplier on curve damage
  gold: number; // multiplier on curve gold
  interval: number;
  attack: 'melee' | 'ranged' | 'magic';
  target: TargetStyle;
  armor?: number; // physical damage reduction 0..1
  ward?: number; // starting ward as fraction of max HP
  embers?: number; // embers on kill (overrides area default for elites/bosses)
  abilities?: AbilityDef[];
  phases?: number[]; // HP fractions at which boss advances phase, descending e.g. [0.7, 0.35]
  phaseText?: string[]; // Japanese banner per phase transition
  phaseAbility?: string; // ability id started at each phase transition
  opener?: string; // ability id started when the fight begins in cycle 2+
  enrageBelow?: number; // HP fraction: auto attacks become faster
  frenzyPhase?: number; // from this phase: +5% attack speed every 5s
  explodeOnDeath?: number; // damage mult to all heroes on death
  protector?: number; // other enemies take this much less damage while alive & not stunned (0..1)
  phoenix?: boolean; // revives once at 50%
  rally?: number; // when another boss-rank ally dies, survivors gain this much attack speed
  flying?: boolean;
  lanternDrainOnHit?: number; // seconds of lantern drained per landed auto hit
  chillOnHit?: number; // seconds of chill applied to target per auto hit
  desc?: string; // Japanese short description (tooltips / boss banner)
}

export interface StageDef {
  variants: string[][]; // one is picked per run
}

export interface AreaDef {
  id: AreaId;
  index: number;
  name: string;
  subtitle: string; // Japanese
  intro: string; // Japanese one-liner shown on first entry
  palette: { sky: string; far: string; mid: string; ground: string; accent: string };
  stages: StageDef[]; // exactly 10; index 4 elite, index 9 boss
  bossId: string | string[];
  bossName: string;
  recruit?: HeroId; // hero recruited on first clear
  firstClearEmbers: number;
  flare: number; // lantern floor at boss intro (seconds)
  stageOffset: number; // extra global stage index (difficulty jump per area)
  stageScale?: number; // global-stage step per stage inside this area (default 1; >1 = steeper ramp)
  requiresPrestige?: number;
}

export interface TreeRequirement {
  anyOf?: string[];
  allOf?: string[];
  synergyCount?: number; // number of owned synergy nodes required
  hero?: HeroId[]; // heroes that must be recruited
  prestige?: number;
}

export type TreeBranch = 'core' | 'expedition' | 'guardian' | 'ranger' | 'arcanist' | 'oracle' | 'synergy' | 'rekindled';

export interface TreeNodeDef {
  id: string;
  name: string;
  branch: TreeBranch;
  kind: 'stat' | 'ability' | 'behavior' | 'synergy' | 'keystone' | 'root';
  maxRank: number;
  costs: number[]; // embers per rank (length = maxRank)
  desc: string; // Japanese; per-rank effect
  x: number; // layout in a 1200 x 800 virtual space
  y: number;
  req: TreeRequirement;
  pair?: HeroId[]; // for synergy nodes: classes involved
  build?: string; // build family label for synergy nodes (BULWARK / HUNT / PYRE / STORM / RADIANCE)
  apply: (m: Mods, rank: number) => void;
}

export interface RelicDef {
  id: string;
  name: string;
  build: string; // Japanese build label
  cost: number; // relic shards
  desc: string; // Japanese
  icon: string; // sprite key
  apply: (m: Mods) => void;
}

// ---------------------------------------------------------------------------
// Modifiers derived from Skill Tree + Relics + prestige. Flat bag of fields.
// ---------------------------------------------------------------------------

export interface Mods {
  // expedition / economy
  lanternBonus: number;
  goldMult: number;
  emberMultElite: number; // multiplier on elite/boss embers (Ember Sense)
  emberMult: number; // global ember multiplier
  scavengerChance: number;
  walkNoLantern: boolean;
  restHeal: number; // fraction of max HP healed between waves
  lastLight: boolean;
  autoCast: boolean;
  smartCast: boolean;
  levelCostMult: number;
  shardBonus: number;
  memoryMult: number; // Ember Memory (prestige)

  // stats
  atkMult: Record<HeroId, number>;
  hpMult: Record<HeroId, number>;
  partyHpMult: number;
  partyDmgMult: number;
  atkSpeedMult: number; // > 1 = faster
  critChanceAdd: Record<HeroId, number>;
  critMultAdd: Record<HeroId, number>;
  critChanceGlobalMult: number;
  nonCritMult: number;
  cooldownMult: number; // < 1 = shorter

  // guardian
  blockChance: number;
  blockReduction: number;
  retaliation: number; // dmg mult, 0 = off
  shockwaveBash: boolean;
  sunder: number; // seconds of armor removal after bash, 0 = off
  ironResolve: boolean;
  unbrokenVow: boolean;
  cleave: number; // auto attacks hit the next enemy for this fraction
  bashCdFlat: number;
  bashStunBonus: number;
  bashWeakens: boolean; // bash on unstoppable windup weakens it by 60%

  // ranger
  twinShot: boolean;
  autoMarkEvery: number; // 0 = off
  markBonus: number; // extra damage taken by marked enemies
  arrowRainExtra: number;
  arrowRainCdFlat: number;
  arrowRainMarks: boolean;
  executioner: number; // dmg bonus vs low hp, 0 = off
  deadeye: boolean;
  pierce: number; // arrows pierce to another enemy for this fraction, 0 = off
  rangerDoubleShot: boolean;
  markPermanent: boolean;

  // arcanist
  burnMaxStacks: number;
  burnDmgMult: number;
  burnTickMult: number;
  chainEvery: number; // 0 = off
  chainTargets: number;
  chainDmg: number;
  chainBurn: boolean;
  splash: number; // ember bolt splash fraction to other enemies, 0 = off
  meteorExtra: number;
  meteorCdFlat: number;
  meteorBurningGround: boolean;
  combustion: boolean;
  inferno: boolean;
  burnAll: boolean; // all heroes apply burn

  // oracle
  healMult: number;
  overflowCap: number; // 0 = off; max barrier from overheal as fraction of max HP
  benediction: boolean;
  hallowed: boolean;
  intercession: boolean;
  divineEcho: boolean;
  glint: boolean; // heals grant +10% damage for 4s
  barrierMult: number;
  sanctuaryLasting: boolean;

  // synergies
  coveringFire: boolean;
  pinningVolley: boolean;
  moltenBash: boolean;
  spellstrike: number; // magic dmg bonus vs marked, 0 = off
  kindledArrows: boolean;
  aegisRetort: boolean;
  pyreOfRenewal: boolean;
  blessedAim: boolean;
  radiantMeteor: boolean;
  bulwarkOfFaith: boolean;
  emberbond: boolean;

  // rekindle / relics
  overdrive: boolean;
  overdriveFill: number;
  overdriveDuration: number;
  relicSlots: number;
  bastion: boolean;
  phoenixAll: boolean;
  reflect: number;
  waveBarrier: number;
}

// ---------------------------------------------------------------------------
// Save data
// ---------------------------------------------------------------------------

export interface HeroSave {
  recruited: boolean;
  level: number;
}

export interface AreaSave {
  unlocked: boolean;
  cleared: boolean; // cleared in the current cycle
  everCleared: boolean;
  best: number; // best stage reached (1..10) in the current cycle
  bestEver: number;
  attempts: number; // runs in the current cycle
  bossFails: number; // failed boss attempts since the last kill (pity)
  bossFirstTime: number; // seconds of the very first boss kill (0 = never)
  bossBestTime: number; // best boss kill time (0 = never)
  stars: number; // 0..3 lantern stars (ever)
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  sfxVolume: number;
  musicVolume: number;
  screenShake: boolean;
  damageNumbers: boolean;
}

export interface SaveData {
  version: number;
  createdAt: number;
  savedAt: number;
  playTime: number; // seconds (total)
  cycleTime: number; // seconds in current cycle
  gold: number;
  embers: number;
  shards: number;
  heroes: Record<HeroId, HeroSave>;
  peakLevels: Record<HeroId, number>; // highest level reached in previous cycles (Ember Memory)
  tree: Record<string, number>;
  areas: Record<AreaId, AreaSave>;
  selectedArea: AreaId;
  prestige: number;
  relicsOwned: string[];
  relicsEquipped: string[];
  autoCast: Record<HeroId, boolean>;
  settings: Settings;
  tutorial: Record<string, boolean>;
  stats: {
    runs: number;
    kills: number;
    bossKills: number;
    goldEarned: number;
    embersEarned: number;
    deaths: number;
    interrupts: number;
    perfects: number;
    bestHit: number;
  };
  endingSeen: boolean;
  trueEndingSeen: boolean;
}

// ---------------------------------------------------------------------------
// Battle runtime
// ---------------------------------------------------------------------------

export interface Windup {
  ability: AbilityDef;
  total: number;
  remaining: number;
  interruptible: boolean;
  targetId: number | null; // for single-target strikes: chosen at windup start (shown to player)
  dealt: number; // damage taken by the caster during this windup (for breakFrac)
  weakened: boolean; // Ascendant Guardian: damage x0.4
}

export interface Unit {
  id: number;
  side: 'hero' | 'enemy';
  key: string; // hero id or enemy def id
  name: string;
  rank: EnemyRank | 'hero';
  size: UnitSize;
  sprite: string;
  x: number; // logical position (feet), world space 400 x 180
  y: number;
  slot: number;
  level: number; // heroes: current level (for palette tiers); enemies: 0

  maxHp: number;
  hp: number;
  barrier: number;
  barrierTime: number;
  ward: number;
  maxWard: number;
  armor: number;

  atk: number; // heroes: attack power; enemies: hit damage
  interval: number;
  atkTimer: number;
  critChance: number;
  critMult: number;
  dmgType: DamageType;

  alive: boolean;
  deadTime: number; // seconds since death (for fade out)
  untargetable: number; // seconds remaining (submerge)

  // statuses
  stun: number;
  stagger: number; // seconds: takes +50% damage (Break)
  sunder: number; // seconds: armor ignored
  mark: number; // seconds remaining (Infinity for player focus)
  burnStacks: number;
  burnTime: number;
  burnPower: number; // damage per stack per second
  burnTick: number;
  chill: number;
  frozen: number;
  doom: { time: number; total: number; dmg: number } | null;
  dot: { dps: number; time: number } | null;
  taunt: number; // hero: enemies forced to target this unit
  haste: number; // seconds of haste
  hasteMult: number;
  dmgBuff: number; // seconds
  dmgBuffMult: number;
  glint: number; // seconds of +10% damage (Grace III)
  enraged: boolean;
  speedMult: number; // permanent multiplier (enrage, rally, frenzy)
  dmgMult: number; // permanent damage multiplier

  // enemy AI
  def?: EnemyDef;
  abilityTimers: number[];
  windup: Windup | null;
  pendingAbility: string | null; // queued ability to start ASAP (phase/opener)
  phase: number;
  revived: boolean;
  summoned: boolean;
  frenzyTimer: number;

  // hero bookkeeping
  shots: number;
  casts: number;
  critCount: number;
  vow: number; // Unbroken Vow gauge (guardian)
  intercedeCd: number;
  lastHitBy: number | null;
  reviveTimer: number; // >0: will revive when reaches 0
  hitFlash: number; // render helper: seconds since last hit
  actFlash: number; // render helper: seconds since last attack action
}

export interface SkillState {
  hero: HeroId;
  cooldown: number; // remaining
  maxCooldown: number;
  lastCast: number; // battle time of last cast, -Infinity
  auto: boolean;
  pip: number; // Emberbond pip remaining seconds (lit by Perfect Cast)
}

export type RunEndReason = 'wiped' | 'lantern' | 'victory' | 'retreat';

export interface Loot {
  gold: number;
  embers: number;
  shards: number;
}

export interface RunSegment {
  areaId: AreaId;
  stageReached: number; // 1..10
  stagesCleared: number;
  bossDefeated: boolean;
  bossTime: number | null; // seconds from boss fight start to kill
  lanternFrac: number | null; // lantern remaining / max at boss kill
}

export interface RunResult {
  areaId: AreaId; // starting area
  reason: RunEndReason;
  stageReached: number; // in the last segment
  stagesCleared: number; // in the last segment
  segments: RunSegment[];
  kills: number;
  eliteKills: number;
  bossDefeated: boolean; // any boss defeated
  loot: Loot;
  duration: number;
  bestHit: number;
  interrupts: number;
  perfects: number;
  routs: number;
  emberNovas: number;
  killedBy: string | null; // what landed the final blow on the last hero
  missed: Record<string, number>; // interruptible abilities that landed un-interrupted
}

export type FxKind =
  | 'slash' | 'heavySlash' | 'arrow' | 'bolt' | 'chain' | 'heal' | 'smite' | 'bash' | 'shockwave' | 'vowbreaker'
  | 'enemyMelee' | 'enemyShot' | 'enemyMagic' | 'meteor' | 'meteorite' | 'arrowRain'
  | 'sanctuary' | 'nova' | 'emberNova' | 'counter' | 'explosion' | 'doom' | 'freeze' | 'summon'
  | 'ward' | 'submerge' | 'emerge' | 'drain' | 'revive' | 'benediction' | 'overdrive' | 'phase' | 'intercede';

export type BattleEvent =
  | { type: 'attack'; src: number; dst: number; fx: FxKind; travel: number }
  | { type: 'damage'; dst: number; amount: number; crit: boolean; dmgType: DamageType; blocked: boolean; absorbed: number; toWard: number; big: boolean; overkill: boolean; src: number | null; tag: string }
  | { type: 'heal'; dst: number; amount: number }
  | { type: 'barrier'; dst: number; amount: number }
  | { type: 'barrierBreak'; dst: number }
  | { type: 'wardBreak'; dst: number }
  | { type: 'death'; id: number; side: 'hero' | 'enemy'; rank: EnemyRank | 'hero' }
  | { type: 'revive'; id: number }
  | { type: 'loot'; kind: 'gold' | 'ember' | 'shard'; amount: number; from: number; x: number; y: number }
  | { type: 'skill'; hero: HeroId; skill: string; src: number; auto: boolean }
  | { type: 'perfect'; hero: HeroId; src: number }
  | { type: 'emberPip'; hero: HeroId; on: boolean }
  | { type: 'fx'; fx: FxKind; x: number; y: number; src?: number; dst?: number; scale?: number }
  | { type: 'interrupt'; id: number; by: number }
  | { type: 'stagger'; id: number; duration: number }
  | { type: 'stun'; id: number; duration: number }
  | { type: 'windup'; id: number; name: string; duration: number; interruptible: boolean; targetId: number | null; kind: AbilityEffect['kind'] }
  | { type: 'windupChange'; id: number; interruptible: boolean }
  | { type: 'ability'; id: number; name: string; effect: AbilityEffect['kind'] }
  | { type: 'text'; id: number | null; text: string; color: string; size?: number }
  | { type: 'wave'; stage: number; elite: boolean; boss: boolean; routed: boolean }
  | { type: 'rout'; chain: number }
  | { type: 'bossIntro'; id: number; name: string; title: string; pity: number }
  | { type: 'bossPhase'; id: number; phase: number; text: string }
  | { type: 'bossDefeated'; id: number; final: boolean; time: number }
  | { type: 'eliteDefeated'; id: number }
  | { type: 'mark'; id: number; on: boolean }
  | { type: 'lantern'; low: boolean }
  | { type: 'flare'; lantern: number }
  | { type: 'lastLight' }
  | { type: 'descent'; area: AreaId }
  | { type: 'overdrive'; on: boolean }
  | { type: 'vow'; ready: boolean }
  | { type: 'emberNova' }
  | { type: 'heavySwing'; src: number }
  | { type: 'runEnd'; reason: RunEndReason };
