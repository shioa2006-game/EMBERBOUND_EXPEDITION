// Real-time battle simulation. Deterministic for a given seed and dt sequence.
// No DOM access: renderer/audio/UI consume `battle.drainEvents()` each frame and read unit fields.
import { AREAS } from '../data/areas.ts';
import { ENEMIES } from '../data/enemies.ts';
import { HEROES } from '../data/heroes.ts';
import { BAL, enemyDmgAt, enemyGoldAt, enemyHpAt, stageIndexGlobal } from './balance.ts';
import { computeMods } from './mods.ts';
import { Rng } from './rng.ts';
import { bossPity, bossShardsFor, canDescendFrom, heroStats, recruitedHeroes, skillCooldown } from './state.ts';
import {
  AREA_ORDER,
  HERO_ORDER,
  type AbilityDef,
  type AreaDef,
  type AreaId,
  type BattleEvent,
  type DamageType,
  type HeroId,
  type Loot,
  type Mods,
  type RunEndReason,
  type RunResult,
  type RunSegment,
  type SaveData,
  type SkillState,
  type TargetStyle,
  type Unit,
  type UnitSize,
} from './types.ts';

export type BattlePhase = 'walk' | 'bossIntro' | 'fight' | 'victory' | 'ended';

/** World space used by the engine (renderer scales it). Ground line at y = 150. */
export const WORLD_W = 400;
export const WORLD_H = 180;
export const GROUND_Y = 150;

/** Approximate sprite boxes (world px) used for hit testing & effect anchoring. */
export const SIZE_BOX: Record<UnitSize, { w: number; h: number }> = {
  small: { w: 16, h: 16 },
  medium: { w: 22, h: 26 },
  large: { w: 32, h: 38 },
  huge: { w: 60, h: 64 },
};

export const HERO_POS = [
  { x: 152, y: 150 },
  { x: 120, y: 146 },
  { x: 90, y: 151 },
  { x: 60, y: 147 },
];
const ENEMY_POS = [
  { x: 236, y: 150 },
  { x: 266, y: 144 },
  { x: 296, y: 153 },
  { x: 324, y: 146 },
  { x: 352, y: 152 },
  { x: 378, y: 145 },
];
const BOSS_POS = { x: 318, y: 152 };
const BOSS_SUMMON_POS = [
  { x: 236, y: 150 },
  { x: 262, y: 144 },
  { x: 212, y: 153 },
  { x: 274, y: 156 },
  { x: 224, y: 141 },
];
const PARTY_BOSS_POS = [
  { x: 240, y: 150 },
  { x: 280, y: 145 },
  { x: 318, y: 152 },
  { x: 356, y: 146 },
];

export interface BattleConfig {
  save: SaveData;
  areaId: AreaId;
  seed?: number;
  mods?: Mods;
}

interface Scheduled {
  at: number;
  seq: number;
  fn: () => void;
}

type HitTag = 'auto' | 'skill' | 'burn' | 'meteor' | 'chain' | 'counter' | 'nova' | 'explode' | 'doom' | 'reflect' | 'emberNova' | 'splash' | 'vow';

interface HitOpts {
  type: DamageType;
  crit?: boolean;
  canBlock?: boolean;
  tag?: HitTag;
  big?: boolean;
  label?: string; // what dealt it (death recap)
}

export class Battle {
  area: AreaDef;
  readonly mods: Mods;
  readonly rng: Rng;
  readonly party: HeroId[];
  readonly startArea: AreaId;
  readonly cycle2: boolean;

  time = 0;
  phase: BattlePhase = 'walk';
  phaseTimer = 0.9;
  phaseDuration = 0.9;
  stage = 0; // 0-based index of current / next stage
  stagesCleared = 0;
  heroes: Unit[] = [];
  enemies: Unit[] = [];
  lantern: number;
  lanternMax: number;
  loot: Loot = { gold: 0, embers: 0, shards: 0 };
  skills: Record<HeroId, SkillState>;
  focusId: number | null = null;
  overdriveGauge = 0;
  overdriveActive = 0;
  overdriveMax = 0;
  kills = 0;
  eliteKills = 0;
  interrupts = 0;
  perfects = 0;
  routs = 0;
  routChain = 0;
  routed = false; // current stage is a ROUT
  descending = false; // walking into a new area (Descent)
  bestHit = 0;
  bossDefeated = false;
  bossShards = 0;
  bossPityFrac = 0;
  bossFightStart = 0;
  phaseFreeze = 0;
  lastLightActive = 0;
  lastLightUsed = false;
  emberNovaCount = 0;
  emberNovaCd = 0;
  segments: RunSegment[] = [];
  result: RunResult | null = null;
  events: BattleEvent[] = [];

  private save: SaveData;
  private nextId = 1;
  private seq = 0;
  private scheduled: Scheduled[] = [];
  private phoenixUsed = new Set<number>();
  private benedictionTimer = 8;
  private benedictionUntil = -1;
  private lanternWarned = false;
  private bestCritChance = 0.05;
  private bestCritMult = 1.5;
  private bastionCd = new Map<number, number>();
  private aegisCd = 0;
  private scavenged = 0;
  private killedBy: string | null = null;
  private missed: Record<string, number> = {};

  constructor(cfg: BattleConfig) {
    const save = cfg.save;
    this.save = save;
    this.startArea = cfg.areaId;
    this.area = AREAS[cfg.areaId];
    this.cycle2 = save.prestige >= 1;
    this.mods = cfg.mods ?? computeMods(save);
    this.rng = new Rng(cfg.seed ?? ((Date.now() ^ 0x5bd1e995) >>> 0));
    this.party = recruitedHeroes(save);
    this.lanternMax = BAL.lanternBase + this.mods.lanternBonus;
    this.lantern = this.lanternMax;
    this.enterArea(cfg.areaId);

    this.party.forEach((h, i) => {
      const st = heroStats(save, this.mods, h);
      const u = this.makeUnit('hero', h, HEROES[h].name, 'medium', h, HERO_POS[i].x, HERO_POS[i].y, i);
      u.level = save.heroes[h].level;
      u.maxHp = u.hp = st.maxHp;
      u.atk = st.atk;
      u.interval = st.interval;
      u.atkTimer = st.interval * (0.3 + 0.15 * i);
      u.critChance = st.critChance;
      u.critMult = st.critMult;
      u.dmgType = h === 'arcanist' || h === 'oracle' ? 'magic' : 'phys';
      this.heroes.push(u);
      if (u.critChance > this.bestCritChance) this.bestCritChance = u.critChance;
      if (u.critMult > this.bestCritMult) this.bestCritMult = u.critMult;
    });

    const m = this.mods;
    const mk = (h: HeroId): SkillState => ({
      hero: h,
      cooldown: 0,
      maxCooldown: skillCooldown(m, h),
      lastCast: -Infinity,
      auto: !!save.autoCast[h] && m.autoCast,
      pip: 0,
    });
    this.skills = {
      guardian: mk('guardian'),
      ranger: mk('ranger'),
      arcanist: mk('arcanist'),
      oracle: mk('oracle'),
    };
    this.overdriveMax = BAL.overdriveDuration + m.overdriveDuration;
  }

  // ───────────────────────────── public API ─────────────────────────────

  get ended(): boolean {
    return this.phase === 'ended';
  }

  get isBossStage(): boolean {
    return this.stage === 9;
  }

  get isEliteStage(): boolean {
    return this.stage === 4;
  }

  /** True when the lantern is currently not burning (UI shows a frozen lantern). */
  get lanternFrozen(): boolean {
    if (this.phase === 'bossIntro' || this.phase === 'victory') return true;
    if (this.phase === 'walk') return this.routed || this.descending || this.mods.walkNoLantern;
    if (this.phase === 'fight') {
      if (this.routed || this.phaseFreeze > 0) return true;
      if (this.isBossStage && this.enemies.some((e) => e.rank === 'boss' && e.alive && e.untargetable > 0)) return true;
    }
    return false;
  }

  heroUnit(h: HeroId): Unit | undefined {
    return this.heroes.find((u) => u.key === h);
  }

  unitById(id: number): Unit | undefined {
    return this.heroes.find((u) => u.id === id) ?? this.enemies.find((u) => u.id === id);
  }

  targetableEnemies(): Unit[] {
    return this.enemies.filter((e) => e.alive && e.untargetable <= 0);
  }

  aliveHeroes(): Unit[] {
    return this.heroes.filter((h) => h.alive);
  }

  bosses(): Unit[] {
    return this.enemies.filter((e) => e.rank === 'boss');
  }

  /** Returns the enemy whose box contains world point (x, y), if any. */
  /** The enemy under a point; `pad` widens every box (fingers are less precise than a mouse). */
  enemyAt(x: number, y: number, pad = 6): Unit | null {
    let best: Unit | null = null;
    for (const e of this.enemies) {
      if (!e.alive || e.untargetable > 0) continue;
      const b = SIZE_BOX[e.size];
      if (x >= e.x - b.w / 2 - pad && x <= e.x + b.w / 2 + pad && y <= e.y + pad && y >= e.y - b.h - pad) {
        if (!best || Math.abs(e.x - x) < Math.abs(best.x - x)) best = e;
      }
    }
    return best;
  }

  canFocus(): boolean {
    return this.party.includes('ranger');
  }

  /** Player-applied Mark (Ranger mechanic). Clicking the focused target again clears it. */
  setFocus(id: number | null): boolean {
    if (!this.canFocus()) return false;
    if (this.focusId !== null) {
      const prev = this.enemies.find((e) => e.id === this.focusId);
      if (prev && prev.mark === Infinity && !this.mods.markPermanent) prev.mark = 0;
      if (prev) this.emit({ type: 'mark', id: prev.id, on: prev.mark > 0 });
      if (this.focusId === id) {
        this.focusId = null;
        return true;
      }
    }
    this.focusId = null;
    if (id === null) return true;
    const e = this.enemies.find((u) => u.id === id && u.alive);
    if (!e) return false;
    this.focusId = id;
    e.mark = Infinity;
    this.emit({ type: 'mark', id, on: true });
    this.emit({ type: 'text', id, text: 'MARK', color: '#7dff8a' });
    return true;
  }

  skillReady(h: HeroId): boolean {
    const s = this.skills[h];
    const u = this.heroUnit(h);
    return !!u && u.alive && u.frozen <= 0 && u.stun <= 0 && s.cooldown <= 0 && this.phase === 'fight';
  }

  /** Cast a hero's active skill. `manual` casts can be PERFECT. Returns true if it fired. */
  cast(h: HeroId, manual = true): boolean {
    if (!this.party.includes(h) || !this.skillReady(h)) return false;
    if (h !== 'oracle' && this.targetableEnemies().length === 0) return false;
    const s = this.skills[h];
    s.cooldown = s.maxCooldown;
    s.lastCast = this.time;
    const u = this.heroUnit(h)!;
    u.actFlash = 0;
    this.emit({ type: 'skill', hero: h, skill: HEROES[h].skill.id, src: u.id, auto: !manual });
    if (h === 'guardian') this.shieldBash(u, manual);
    else if (h === 'ranger') this.arrowRain(u, manual);
    else if (h === 'arcanist') this.meteor(u, manual);
    else this.sanctuary(u, 1, manual);
    return true;
  }

  canOverdrive(): boolean {
    return this.mods.overdrive && this.overdriveGauge >= 100 && this.overdriveActive <= 0 && this.phase === 'fight';
  }

  activateOverdrive(): boolean {
    if (!this.canOverdrive()) return false;
    this.overdriveGauge = 0;
    this.overdriveActive = this.overdriveMax;
    for (const e of this.enemies) if (e.alive && e.stagger > 0) e.stagger += 1.5;
    this.emit({ type: 'overdrive', on: true });
    this.emit({ type: 'fx', fx: 'overdrive', x: 120, y: 120 });
    return true;
  }

  setAuto(h: HeroId, on: boolean): void {
    this.skills[h].auto = on && this.mods.autoCast;
  }

  retreat(): void {
    if (this.phase !== 'ended') this.end('retreat');
  }

  drainEvents(): BattleEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  /** Advance the simulation. Call with small dt (<= 1/30 recommended). */
  tick(dt: number): void {
    if (this.phase === 'ended') return;
    this.time += dt;
    this.runScheduled();
    if ((this.phase as BattlePhase) === 'ended') return;
    for (const u of this.heroes) {
      u.hitFlash += dt;
      u.actFlash += dt;
    }
    for (const u of this.enemies) {
      u.hitFlash += dt;
      u.actFlash += dt;
    }

    switch (this.phase) {
      case 'walk':
        this.phaseTimer -= dt;
        if (!this.lanternFrozen) this.burnLantern(dt);
        this.updateHeroStatuses(dt, false);
        if (this.phaseTimer <= 0 && this.phase === 'walk') this.spawnStage();
        break;
      case 'bossIntro':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.startBossFight();
        break;
      case 'fight':
        if (this.phaseFreeze > 0) this.phaseFreeze -= dt;
        this.updateFight(dt);
        if (this.phase === 'fight' && !this.lanternFrozen) this.burnLantern(dt);
        break;
      case 'victory':
        this.phaseTimer -= dt;
        for (const u of this.enemies) if (!u.alive) u.deadTime += dt;
        if (this.phaseTimer <= 0) this.afterVictory();
        break;
    }
  }

  // ───────────────────────────── internals ─────────────────────────────

  private emit(e: BattleEvent): void {
    this.events.push(e);
  }

  private schedule(delay: number, fn: () => void): void {
    this.scheduled.push({ at: this.time + delay, seq: this.seq++, fn });
  }

  private runScheduled(): void {
    if (!this.scheduled.length) return;
    let due: Scheduled[] = [];
    const keep: Scheduled[] = [];
    for (const s of this.scheduled) (s.at <= this.time ? due : keep).push(s);
    if (!due.length) return;
    this.scheduled = keep;
    due = due.sort((a, b) => a.at - b.at || a.seq - b.seq);
    for (const s of due) {
      if (this.phase === 'ended') return;
      s.fn();
    }
  }

  private makeUnit(side: 'hero' | 'enemy', key: string, name: string, size: UnitSize, sprite: string, x: number, y: number, slot: number): Unit {
    return {
      id: this.nextId++, side, key, name, rank: 'hero', size, sprite, x, y, slot, level: 0,
      maxHp: 1, hp: 1, barrier: 0, barrierTime: 0, ward: 0, maxWard: 0, armor: 0,
      atk: 1, interval: 1.5, atkTimer: 1, critChance: 0, critMult: 1.5, dmgType: 'phys',
      alive: true, deadTime: 0, untargetable: 0,
      stun: 0, stagger: 0, sunder: 0, mark: 0, burnStacks: 0, burnTime: 0, burnPower: 0, burnTick: 0, chill: 0, frozen: 0,
      doom: null, dot: null, taunt: 0, haste: 0, hasteMult: 1, dmgBuff: 0, dmgBuffMult: 1, glint: 0,
      enraged: false, speedMult: 1, dmgMult: 1,
      abilityTimers: [], windup: null, pendingAbility: null, phase: 0, revived: false, summoned: false, frenzyTimer: 0,
      shots: 0, casts: 0, critCount: 0, vow: 0, intercedeCd: 0, lastHitBy: null, reviveTimer: 0, hitFlash: 99, actFlash: 99,
    };
  }

  private enterArea(id: AreaId): void {
    this.area = AREAS[id];
    this.stage = 0;
    this.stagesCleared = 0;
    this.bossShards = bossShardsFor(this.save, id, this.mods);
    this.bossPityFrac = bossPity(this.save, id);
    this.segments.push({ areaId: id, stageReached: 1, stagesCleared: 0, bossDefeated: false, bossTime: null, lanternFrac: null });
  }

  private get segment(): RunSegment {
    return this.segments[this.segments.length - 1];
  }

  private burnLantern(dt: number): void {
    if (this.lastLightActive > 0) {
      this.lastLightActive -= dt;
      if (this.lastLightActive <= 0) this.end('lantern');
      return;
    }
    this.lantern -= dt;
    this.checkLantern();
  }

  private drainLantern(sec: number): void {
    if (this.lastLightActive > 0) return;
    this.lantern = Math.max(0, this.lantern - sec);
    this.checkLantern();
  }

  private checkLantern(): void {
    if (!this.lanternWarned && this.lantern <= 10) {
      this.lanternWarned = true;
      this.emit({ type: 'lantern', low: true });
    }
    if (this.lantern <= 0) {
      this.lantern = 0;
      if (this.mods.lastLight && !this.lastLightUsed && this.phase === 'fight') {
        this.lastLightUsed = true;
        this.lastLightActive = BAL.lastLightTime;
        this.emit({ type: 'lastLight' });
        this.emit({ type: 'text', id: null, text: 'LAST LIGHT', color: '#ffd36a', size: 1.8 });
        return;
      }
      this.end('lantern');
    }
  }

  private get globalStage(): number {
    return this.area.index * 10 + this.area.stageOffset + this.stage * (this.area.stageScale ?? 1);
  }

  private spawnStage(): void {
    const st = this.area.stages[this.stage];
    const variant = st.variants[this.rng.int(st.variants.length)];
    this.enemies = [];
    this.focusId = null;
    this.descending = false;
    const boss = this.isBossStage;
    const multiBoss = boss && variant.length > 1;
    variant.forEach((id, i) => {
      let pos = ENEMY_POS[i] ?? ENEMY_POS[ENEMY_POS.length - 1];
      if (boss) pos = multiBoss ? PARTY_BOSS_POS[i] : BOSS_POS;
      this.spawnEnemy(id, pos.x, pos.y, i, false);
    });
    this.segment.stageReached = Math.max(this.segment.stageReached, this.stage + 1);
    if (this.mods.waveBarrier > 0) {
      for (const h of this.aliveHeroes()) this.addBarrier(h, h.maxHp * this.mods.waveBarrier * this.mods.barrierMult, h.maxHp, 10);
    }
    // ROUT check: the party has outgrown this stage
    this.routed = false;
    if (boss) {
      for (const h of this.heroes) if (h.hasteMult >= 3) {
        h.haste = 0;
        h.hasteMult = 1;
      }
    }
    if (!boss) {
      const t = this.estimateWaveTime() / (1 + BAL.routDepthScale * this.area.index);
      if (t <= (this.isEliteStage ? BAL.routThresholdElite : BAL.routThreshold)) {
        this.routed = true;
        this.routs++;
        this.routChain++;
        for (const h of this.aliveHeroes()) {
          h.haste = Math.max(h.haste, 2);
          h.hasteMult = Math.max(h.hasteMult, 3);
          h.atkTimer = Math.min(h.atkTimer, 0.05 + this.rng.next() * 0.1);
        }
        this.emit({ type: 'rout', chain: this.routChain });
      } else {
        this.routChain = 0;
      }
    } else {
      this.routChain = 0;
    }
    this.emit({ type: 'wave', stage: this.stage, elite: this.isEliteStage, boss, routed: this.routed });
    if (boss) {
      const b = this.enemies[0];
      this.phase = 'bossIntro';
      this.phaseTimer = BAL.bossIntroTime;
      if (this.lantern < this.area.flare) {
        this.lantern = this.area.flare;
        this.lastLightActive = 0; // the Flare relights the lantern: Last Light (if burning) is over
        this.lanternWarned = this.lantern <= 10;
        this.emit({ type: 'flare', lantern: this.lantern });
      }
      this.emit({
        type: 'bossIntro',
        id: b.id,
        name: this.area.bossName,
        title: multiBoss ? '虚ろなる残り火の一行――影のパーティ。倒す順番が鍵だ。' : (b.def?.desc ?? ''),
        pity: this.bossPityFrac,
      });
    } else {
      this.phase = 'fight';
    }
  }

  private startBossFight(): void {
    this.phase = 'fight';
    this.bossFightStart = this.time;
    if (this.cycle2) {
      for (const e of this.enemies) if (e.alive && e.def?.opener) e.pendingAbility = e.def.opener;
    }
  }

  /** Rough seconds for the party to kill the current wave (single-target, no skills). */
  private estimateWaveTime(): number {
    let phys = 0;
    let magic = 0;
    for (const h of this.aliveHeroes()) {
      const critF = 1 + h.critChance * (h.critMult - 1);
      let dps = (h.atk / h.interval) * critF * this.heroDmgMult(h);
      if (h.key === 'guardian') dps *= 1.2;
      if (h.key === 'oracle') dps *= 0.8;
      if (h.dmgType === 'magic') magic += dps;
      else phys += dps;
    }
    let total = 0;
    for (const e of this.enemies) {
      const dps = phys * (1 - e.armor) + magic;
      if (dps <= 0) return Infinity;
      total += (e.hp + e.ward) / dps;
    }
    return total;
  }

  private spawnEnemy(id: string, x: number, y: number, slot: number, summoned: boolean): Unit {
    const def = ENEMIES[id];
    if (!def) throw new Error(`Unknown enemy ${id}`);
    const s = this.globalStage;
    const u = this.makeUnit('enemy', id, def.name, def.size, def.sprite, x, y - (def.flying ? 18 : 0), slot);
    u.rank = def.rank;
    u.def = def;
    u.maxHp = u.hp = enemyHpAt(s) * def.hp * (def.rank === 'boss' ? 1 - this.bossPityFrac : 1);
    u.atk = enemyDmgAt(s) * def.dmg * (def.rank === 'boss' ? 1 - this.bossPityFrac : 1);
    u.interval = def.interval;
    u.atkTimer = def.interval * (0.6 + this.rng.next() * 0.5);
    u.armor = def.armor ?? 0;
    u.dmgType = def.attack === 'magic' ? 'magic' : 'phys';
    if (def.ward) u.ward = u.maxWard = u.maxHp * def.ward;
    u.summoned = summoned;
    u.abilityTimers = (def.abilities ?? []).map((a) => (a.manual ? Infinity : (a.initialDelay ?? a.cooldown * 0.5)));
    this.enemies.push(u);
    if (summoned) this.emit({ type: 'fx', fx: 'summon', x: u.x, y: u.y, dst: u.id });
    return u;
  }

  private updateFight(dt: number): void {
    const m = this.mods;
    // overdrive
    if (this.overdriveActive > 0) {
      this.overdriveActive -= dt;
      if (this.overdriveActive <= 0) {
        this.overdriveActive = 0;
        this.emit({ type: 'overdrive', on: false });
      }
    } else if (m.overdrive) {
      this.gainOverdrive(BAL.overdrivePerSecond * dt);
    }
    const cdRate = this.overdriveActive > 0 ? 2 : 1;
    for (const h of this.party) {
      const s = this.skills[h];
      if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt * cdRate);
      if (s.pip > 0) {
        s.pip -= dt;
        if (s.pip <= 0) {
          s.pip = 0;
          this.emit({ type: 'emberPip', hero: h, on: false });
        }
      }
    }
    if (this.aegisCd > 0) this.aegisCd -= dt;
    if (this.emberNovaCd > 0) this.emberNovaCd -= dt;

    // benediction
    const oracle = this.heroUnit('oracle');
    if (m.benediction && oracle && oracle.alive) {
      this.benedictionTimer -= dt;
      if (this.benedictionTimer <= 0) {
        this.benedictionTimer = 8;
        this.benedictionUntil = this.time + 4;
        for (const h of this.aliveHeroes()) {
          h.haste = Math.max(h.haste, 4);
          h.hasteMult = Math.max(h.hasteMult, 1.3);
        }
        this.emit({ type: 'fx', fx: 'benediction', x: oracle.x, y: oracle.y, src: oracle.id });
      }
    }

    this.updateHeroStatuses(dt, true);
    if (this.phase !== 'fight') return;

    // hero auto attacks
    for (const h of this.heroes) {
      if (!h.alive || h.stun > 0 || h.frozen > 0) continue;
      if (this.targetableEnemies().length === 0 && h.key !== 'oracle') continue;
      h.atkTimer -= dt * this.heroSpeed(h);
      if (h.atkTimer <= 0) {
        h.atkTimer += h.interval;
        if (h.atkTimer < 0) h.atkTimer = h.interval * 0.5;
        this.heroAttack(h);
        if (this.phase !== 'fight') return;
      }
    }

    // enemies
    for (const e of [...this.enemies]) {
      this.updateEnemy(e, dt);
      if (this.phase !== 'fight') return;
    }
    this.enemies = this.enemies.filter((e) => e.alive || e.deadTime < 1.2 || e.reviveTimer > 0);

    this.autoCast();
    this.checkWaveState();
  }

  private gainOverdrive(n: number): void {
    if (!this.mods.overdrive || this.overdriveActive > 0) return;
    this.overdriveGauge = Math.min(100, this.overdriveGauge + n * this.mods.overdriveFill);
  }

  private heroSpeed(h: Unit): number {
    let s = 1;
    if (h.haste > 0) s *= h.hasteMult;
    if (h.chill > 0) s *= 0.7;
    if (this.overdriveActive > 0) s *= 2;
    return s;
  }

  private heroDmgMult(h: Unit): number {
    let m = 1;
    if (h.dmgBuff > 0) m *= h.dmgBuffMult;
    if (h.glint > 0) m *= 1.1;
    if (this.overdriveActive > 0) m *= 1.5;
    if (this.lastLightActive > 0) m *= 1.4;
    return m;
  }

  private updateHeroStatuses(dt: number, fighting: boolean): void {
    for (const h of this.heroes) {
      if (!h.alive) {
        if (h.reviveTimer > 0) {
          h.reviveTimer -= dt;
          if (h.reviveTimer <= 0) this.reviveHero(h, 0.5);
        }
        continue;
      }
      if (h.barrierTime > 0) {
        h.barrierTime -= dt;
        if (h.barrierTime <= 0) h.barrier = 0;
      }
      if (h.stun > 0) h.stun -= dt;
      if (h.frozen > 0) h.frozen -= dt;
      if (h.chill > 0) h.chill -= dt;
      if (h.haste > 0) h.haste -= dt;
      else h.hasteMult = 1;
      if (h.dmgBuff > 0) h.dmgBuff -= dt;
      else h.dmgBuffMult = 1;
      if (h.glint > 0) h.glint -= dt;
      if (h.taunt > 0) h.taunt -= dt;
      if (h.intercedeCd > 0) h.intercedeCd -= dt;
      if (!fighting) continue;
      if (h.dot) {
        h.dot.time -= dt;
        h.burnTick += dt;
        if (h.burnTick >= 0.5) {
          h.burnTick -= 0.5;
          this.damageHero(null, h, h.dot.dps * 0.5, { type: 'magic', tag: 'nova', label: 'Venom' });
        }
        if (h.dot && h.dot.time <= 0) h.dot = null;
      }
      if (h.doom && h.alive) {
        h.doom.time -= dt;
        if (h.doom.time <= 0) {
          const d = h.doom.dmg;
          h.doom = null;
          this.emit({ type: 'fx', fx: 'doom', x: h.x, y: h.y - 12, dst: h.id });
          this.damageHero(null, h, d, { type: 'true', tag: 'doom', big: true, label: 'Doom' });
        }
      }
    }
  }

  // ───────────────────────────── heroes ─────────────────────────────

  private pickHeroTarget(h: Unit): Unit | null {
    const ts = this.targetableEnemies();
    if (!ts.length) return null;
    if (this.focusId !== null) {
      const f = ts.find((e) => e.id === this.focusId);
      if (f) return f;
    }
    switch (h.key as HeroId) {
      case 'guardian':
      case 'oracle':
        return ts.reduce((a, b) => (b.x < a.x ? b : a));
      case 'ranger':
        return ts.reduce((a, b) => (b.hp + b.ward < a.hp + a.ward ? b : a));
      case 'arcanist':
        return ts.reduce((a, b) => (b.burnStacks < a.burnStacks || (b.burnStacks === a.burnStacks && b.hp + b.ward > a.hp + a.ward) ? b : a));
    }
    return ts[0];
  }

  /** Nearest targetable enemy standing behind `t` (larger x). */
  private enemyBehind(t: Unit): Unit | null {
    let best: Unit | null = null;
    for (const e of this.targetableEnemies()) {
      if (e === t || e.x <= t.x) continue;
      if (!best || e.x < best.x) best = e;
    }
    return best;
  }

  private heroAttack(h: Unit): void {
    h.actFlash = 0;
    const m = this.mods;
    switch (h.key as HeroId) {
      case 'guardian': {
        const t = this.pickHeroTarget(h);
        if (!t) return;
        h.shots++;
        const heavy = h.shots % 3 === 0;
        this.emit({ type: 'attack', src: h.id, dst: t.id, fx: heavy ? 'heavySlash' : 'slash', travel: 0.12 });
        if (heavy) this.emit({ type: 'heavySwing', src: h.id });
        this.schedule(0.12, () => {
          if (!t.alive) return;
          const crit = this.rng.chance(h.critChance);
          const dmg = h.atk * (heavy ? 1.6 : 1) * (crit ? h.critMult : m.nonCritMult);
          this.hitEnemy(h, t, dmg, { type: 'phys', crit, tag: 'auto', big: heavy });
          if (m.burnAll) this.applyBurn(t, 1, h.atk);
          if (m.cleave > 0) {
            const b = this.enemyBehind(t);
            if (b) this.hitEnemy(h, b, dmg * m.cleave, { type: 'phys', crit, tag: 'splash' });
          }
        });
        break;
      }
      case 'ranger': {
        const t = this.pickHeroTarget(h);
        if (!t) return;
        h.shots++;
        this.fireArrow(h, t, true);
        if (m.rangerDoubleShot) {
          const others = this.targetableEnemies().filter((e) => e !== t);
          this.schedule(0.08, () => this.fireArrow(h, others.length ? this.rng.pick(others) : t, true));
        }
        if (m.autoMarkEvery > 0 && h.shots % m.autoMarkEvery === 0) {
          this.schedule(0.18, () => this.applyMark(t, 4));
        }
        break;
      }
      case 'arcanist': {
        const t = this.pickHeroTarget(h);
        if (!t) return;
        h.casts++;
        if (m.chainEvery > 0 && h.casts % m.chainEvery === 0) {
          this.chainLightning(h, t);
        } else {
          this.emit({ type: 'attack', src: h.id, dst: t.id, fx: 'bolt', travel: 0.3 });
          this.schedule(0.3, () => {
            if (!t.alive) return;
            const crit = this.rng.chance(h.critChance);
            const dmg = h.atk * (crit ? h.critMult : m.nonCritMult);
            this.hitEnemy(h, t, dmg, { type: 'magic', crit, tag: 'auto' });
            this.applyBurn(t, 1, h.atk);
            if (m.splash > 0) {
              for (const e of this.targetableEnemies()) {
                if (e !== t && Math.abs(e.x - t.x) <= 40) this.hitEnemy(h, e, dmg * m.splash, { type: 'magic', tag: 'splash' });
              }
            }
          });
        }
        break;
      }
      case 'oracle': {
        const allies = this.aliveHeroes();
        const hurt = allies.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a));
        const needsHeal = hurt.hp / hurt.maxHp < 0.9 || (m.overflowCap > 0 && hurt.barrier < hurt.maxHp * m.overflowCap * 0.5 && this.targetableEnemies().length > 0);
        if (needsHeal) {
          this.emit({ type: 'attack', src: h.id, dst: hurt.id, fx: 'heal', travel: 0.25 });
          const amt = h.atk * 1.6 * m.healMult;
          this.schedule(0.25, () => {
            this.healUnit(hurt, amt);
            if (m.glint && hurt.alive) hurt.glint = 4;
          });
        } else {
          const t = this.pickHeroTarget(h);
          if (!t) return;
          this.emit({ type: 'attack', src: h.id, dst: t.id, fx: 'smite', travel: 0.25 });
          this.schedule(0.25, () => {
            if (!t.alive) return;
            const crit = this.rng.chance(h.critChance);
            this.hitEnemy(h, t, h.atk * 0.8 * (crit ? h.critMult : m.nonCritMult), { type: 'magic', crit, tag: 'auto' });
            if (m.burnAll) this.applyBurn(t, 1, h.atk);
          });
        }
        break;
      }
    }
  }

  private fireArrow(h: Unit, t: Unit, allowTwin: boolean, mult = 1): void {
    this.emit({ type: 'attack', src: h.id, dst: t.id, fx: 'arrow', travel: 0.18 });
    this.schedule(0.18, () => {
      let tt = t;
      if (!tt.alive) {
        const alt = this.targetableEnemies();
        if (!alt.length) return;
        tt = alt[0];
      }
      this.arrowHit(h, tt, h.atk * mult, allowTwin, false);
    });
  }

  private arrowHit(h: Unit, t: Unit, base: number, allowTwin: boolean, rain: boolean): void {
    const m = this.mods;
    let crit = this.rng.chance(h.critChance + (m.blessedAim && this.time < this.benedictionUntil ? 0.15 : 0));
    if (rain && m.pinningVolley && t.stun > 0) crit = true;
    let dmg = base * (crit ? h.critMult : m.nonCritMult);
    if (m.executioner > 0 && t.hp / t.maxHp < 0.35) dmg *= 1 + m.executioner;
    let deadeye = false;
    if (crit) {
      h.critCount++;
      if (m.deadeye && h.critCount % 4 === 0) {
        dmg *= 4;
        deadeye = true;
      }
    }
    const behind = !rain && m.pierce > 0 ? this.enemyBehind(t) : null;
    const dealt = this.hitEnemy(h, t, dmg, { type: 'phys', crit, tag: rain ? 'skill' : 'auto', big: deadeye });
    if (deadeye) this.emit({ type: 'text', id: t.id, text: 'DEADEYE!', color: '#ffe066', size: 1.4 });
    if (behind && behind.alive) this.hitEnemy(h, behind, dmg * m.pierce, { type: 'phys', crit, tag: 'splash' });
    if (m.burnAll) this.applyBurn(t, 1, h.atk);
    if (rain && m.arrowRainMarks) this.applyMark(t, 4);
    if (crit) {
      if (m.kindledArrows) this.applyBurn(t, 1, Math.max(h.atk, this.heroUnit('arcanist')?.atk ?? 0));
      if (m.blessedAim) {
        const low = this.lowestHero();
        if (low) this.healUnit(low, dealt * 0.04, true);
      }
      if (allowTwin && m.twinShot) {
        const others = this.targetableEnemies().filter((e) => e !== t);
        const t2 = others.length ? this.rng.pick(others) : t.alive ? t : null;
        if (t2) this.fireArrow(h, t2, false);
      }
    }
  }

  private chainLightning(h: Unit, first: Unit): void {
    const m = this.mods;
    this.emit({ type: 'attack', src: h.id, dst: first.id, fx: 'chain', travel: 0.08 });
    this.schedule(0.08, () => {
      if (!first.alive) return;
      const crit = this.rng.chance(h.critChance);
      this.hitEnemy(h, first, h.atk * (crit ? h.critMult : m.nonCritMult), { type: 'magic', crit, tag: 'chain' });
      this.applyBurn(first, 1, h.atk);
      let pool = this.targetableEnemies().filter((e) => e !== first);
      const chosen: Unit[] = [];
      for (let i = 0; i < m.chainTargets && pool.length; i++) {
        const marked = m.spellstrike > 0 ? pool.filter((e) => e.mark > 0) : [];
        const next = marked.length ? marked[0] : pool[this.rng.int(pool.length)];
        chosen.push(next);
        pool = pool.filter((e) => e !== next);
      }
      let prev = first;
      chosen.forEach((t, i) => {
        const from = prev;
        prev = t;
        this.schedule(0.05 * (i + 1), () => {
          if (!t.alive) return;
          this.emit({ type: 'fx', fx: 'chain', x: t.x, y: t.y, src: from.id, dst: t.id });
          const c = this.rng.chance(h.critChance);
          this.hitEnemy(h, t, h.atk * m.chainDmg * (c ? h.critMult : m.nonCritMult), { type: 'magic', crit: c, tag: 'chain' });
          if (m.chainBurn) this.applyBurn(t, 1, h.atk);
        });
      });
    });
  }

  private lowestHero(): Unit | null {
    const a = this.aliveHeroes();
    if (!a.length) return null;
    return a.reduce((x, y) => (y.hp / y.maxHp < x.hp / x.maxHp ? y : x));
  }

  private applyMark(t: Unit, dur: number): void {
    if (!t.alive) return;
    const wasMarked = t.mark > 0;
    t.mark = this.mods.markPermanent ? Infinity : Math.max(t.mark, dur);
    if (!wasMarked) this.emit({ type: 'mark', id: t.id, on: true });
  }

  private applyBurn(t: Unit, stacks: number, applierAtk: number): void {
    if (!t.alive) return;
    const m = this.mods;
    t.burnStacks = Math.min(m.burnMaxStacks, t.burnStacks + stacks);
    t.burnTime = BAL.burnDuration;
    t.burnPower = Math.max(t.burnPower, applierAtk * BAL.burnPerStack * m.burnDmgMult);
  }

  private stagger(t: Unit, dur: number, reason: string): void {
    if (!t.alive) return;
    t.stagger = Math.max(t.stagger, dur);
    this.emit({ type: 'stagger', id: t.id, duration: dur });
    this.emit({ type: 'text', id: t.id, text: reason, color: '#ffcf4a', size: 1.6 });
    this.gainOverdrive(t.rank === 'boss' ? BAL.overdrivePerBreak : BAL.overdrivePerInterrupt);
  }

  /** PERFECT cast. Manual casts get the full reward; smart AUTO (Tactical Instinct) only lights the Emberbond pip. */
  private markPerfect(h: HeroId, manual = true): void {
    const s = this.skills[h];
    const u = this.heroUnit(h);
    if (manual) {
      this.perfects++;
      s.cooldown = Math.max(0, s.cooldown - s.maxCooldown * BAL.perfectRefund);
      this.gainOverdrive(BAL.overdrivePerPerfect);
      this.emit({ type: 'perfect', hero: h, src: u?.id ?? 0 });
      if (u) this.emit({ type: 'text', id: u.id, text: 'PERFECT', color: '#ffd84a', size: 1.3 });
    }
    if (this.mods.emberbond && this.party.length >= 4) {
      const wasLit = s.pip > 0;
      s.pip = BAL.emberPipTime;
      if (!wasLit) this.emit({ type: 'emberPip', hero: h, on: true });
      this.checkEmberbond();
    }
  }

  // ───────────────────────────── skills ─────────────────────────────

  private windupThreat(e: Unit): number {
    const w = e.windup;
    if (!w) return 0;
    const fx = w.ability.effect;
    const mult = fx.kind === 'strike' || fx.kind === 'nova' ? fx.mult * (fx.kind === 'nova' ? this.aliveHeroes().length : 1) : 1;
    return e.atk * mult;
  }

  private shieldBash(g: Unit, manual: boolean): void {
    const m = this.mods;
    const ts = this.targetableEnemies();
    const canInterrupt = (e: Unit) => !!e.windup && e.windup.interruptible;
    const canWeaken = (e: Unit) => !!e.windup && !e.windup.interruptible && m.bashWeakens && !e.windup.weakened;
    const winding = ts.filter((e) => canInterrupt(e) || canWeaken(e)).sort((a, b) => this.windupThreat(b) - this.windupThreat(a) || a.windup!.remaining - b.windup!.remaining);
    let primary: Unit | null = winding[0] ?? null;
    if (!primary && this.focusId !== null) primary = ts.find((e) => e.id === this.focusId) ?? null;
    if (!primary) primary = ts.reduce((a, b) => (b.x < a.x ? b : a));
    const vow = m.unbrokenVow && g.vow >= g.maxHp * BAL.vowThreshold;
    const targets = m.shockwaveBash || vow ? ts : [primary];
    this.emit({ type: 'attack', src: g.id, dst: primary.id, fx: vow ? 'vowbreaker' : m.shockwaveBash ? 'shockwave' : 'bash', travel: 0.1 });
    const vowDmg = vow ? g.vow + g.atk * 3 : 0;
    if (vow) {
      g.vow = 0;
      this.emit({ type: 'vow', ready: false });
      this.emit({ type: 'text', id: g.id, text: 'VOWBREAKER!', color: '#ffe9a0', size: 1.7 });
    }
    this.schedule(0.1, () => {
      let interrupted = false;
      for (const t of targets) {
        if (!t.alive || t.untargetable > 0) continue;
        const main = t === primary;
        if (t.windup && canInterrupt(t) && (main || m.shockwaveBash || vow)) {
          // BREAK: interrupt + stagger, double damage
          this.interrupt(t, g);
          interrupted = true;
          const st = t.rank === 'boss' ? BAL.staggerTimeBoss : BAL.staggerTime;
          t.stun = Math.max(t.stun, st);
          this.stagger(t, st, 'BREAK!');
          this.hitEnemy(g, t, g.atk * BAL.bashBreakMult * (main ? 1 : BAL.shockwaveSecondary), { type: 'phys', tag: 'skill', big: true });
        } else {
          this.hitEnemy(g, t, g.atk * (main ? BAL.bashMult : BAL.shockwaveSecondary), { type: 'phys', tag: 'skill', big: main });
          if (!t.alive) continue;
          if (t.windup && !t.windup.interruptible) {
            if (canWeaken(t)) {
              t.windup.weakened = true;
              this.emit({ type: 'text', id: t.id, text: 'WEAKENED', color: '#c9a0ff', size: 1.2 });
            } else {
              this.emit({ type: 'text', id: t.id, text: 'IMMUNE', color: '#c9a0ff' });
            }
          } else {
            const base = main ? BAL.bashStun + m.bashStunBonus : BAL.shockwaveStun;
            const stun = (vow ? 2 : base) * (t.rank === 'boss' ? BAL.bossStunMult : 1);
            t.stun = Math.max(t.stun, stun);
            this.emit({ type: 'stun', id: t.id, duration: stun });
          }
        }
        if (!t.alive) continue;
        if (vow) this.hitEnemy(g, t, vowDmg, { type: 'true', tag: 'vow', big: true });
        if (m.sunder > 0 && t.alive) t.sunder = Math.max(t.sunder, m.sunder);
        if (m.moltenBash && t.alive) this.applyBurn(t, 3, Math.max(g.atk, this.heroUnit('arcanist')?.atk ?? 0));
      }
      if (interrupted && m.ironResolve) {
        this.skills.guardian.cooldown *= 0.5;
        this.healUnit(g, g.maxHp * 0.1);
      }
      if (interrupted && (manual || m.smartCast)) this.markPerfect('guardian', manual);
    });
  }

  private interrupt(t: Unit, by: Unit): void {
    t.windup = null;
    this.interrupts++;
    this.emit({ type: 'interrupt', id: t.id, by: by.id });
  }

  private arrowRain(r: Unit, manual: boolean): void {
    const m = this.mods;
    const n = BAL.arrowRainArrows + m.arrowRainExtra;
    const span = 1.5;
    const hit = new Set<number>();
    let stunnedHit = false;
    this.emit({ type: 'fx', fx: 'arrowRain', x: 300, y: 60, src: r.id });
    for (let i = 0; i < n; i++) {
      this.schedule(0.15 + (i * span) / n, () => {
        const ts = this.targetableEnemies();
        if (!ts.length) return;
        const t = ts[this.rng.int(ts.length)];
        this.emit({ type: 'attack', src: r.id, dst: t.id, fx: 'arrowRain', travel: 0.12 });
        this.schedule(0.12, () => {
          if (!t.alive) return;
          hit.add(t.id);
          if (t.stun > 0) stunnedHit = true;
          this.arrowHit(r, t, r.atk * BAL.arrowRainMult, false, true);
        });
      });
    }
    if (manual || m.smartCast) {
      this.schedule(0.15 + span + 0.15, () => {
        if (hit.size >= 4 || stunnedHit) this.markPerfect('ranger', manual);
      });
    }
  }

  private meteor(a: Unit, manual: boolean): void {
    const m = this.mods;
    const ts = this.targetableEnemies();
    const cx = ts.length ? ts.reduce((s, e) => s + e.x, 0) / ts.length : 300;
    this.emit({ type: 'fx', fx: 'meteor', x: cx, y: GROUND_Y, src: a.id, scale: 1 });
    this.schedule(BAL.meteorDelay, () => {
      const hitList = this.targetableEnemies();
      const perfect = hitList.length >= 3 || hitList.some((t) => t.ward > 0 || t.stun > 0);
      for (const t of hitList) {
        const crit = this.rng.chance(a.critChance);
        this.hitEnemy(a, t, a.atk * BAL.meteorMult * (crit ? a.critMult : m.nonCritMult), { type: 'magic', crit, tag: 'meteor', big: true });
        this.applyBurn(t, 2, a.atk);
      }
      this.emit({ type: 'fx', fx: 'explosion', x: cx, y: GROUND_Y - 8, scale: 2 });
      if (m.radiantMeteor && hitList.length) {
        const frac = Math.min(0.4, 0.1 * hitList.length);
        for (const h of this.aliveHeroes()) this.addBarrier(h, h.maxHp * frac * m.barrierMult, h.maxHp, 8);
      }
      if (m.meteorBurningGround) {
        for (let i = 1; i <= 8; i++) {
          this.schedule(i * 0.5, () => {
            for (const t of this.targetableEnemies()) this.applyBurn(t, 1, a.atk);
          });
        }
      }
      if ((manual || m.smartCast) && perfect && hitList.length) this.markPerfect('arcanist', manual);
    });
    for (let i = 0; i < m.meteorExtra; i++) {
      const delay = BAL.meteorDelay + 0.25 + i * 0.2;
      this.schedule(delay - 0.5, () => {
        const ts2 = this.targetableEnemies();
        if (!ts2.length) return;
        const t = this.rng.pick(ts2);
        this.emit({ type: 'fx', fx: 'meteorite', x: t.x, y: t.y, src: a.id, dst: t.id });
        this.schedule(0.5, () => {
          if (!t.alive) return;
          this.hitEnemy(a, t, a.atk * 1.0, { type: 'magic', tag: 'meteor' });
          this.applyBurn(t, 1, a.atk);
        });
      });
    }
  }

  private sanctuary(o: Unit, strength: number, manual: boolean): void {
    const m = this.mods;
    // perfect check before effects apply
    let perfect = false;
    if ((manual || m.smartCast) && strength >= 1) {
      const heroes = this.aliveHeroes();
      const avg = heroes.reduce((s, x) => s + x.hp / x.maxHp, 0) / Math.max(1, heroes.length);
      const bigIncoming = this.enemies.some((e) => {
        const w = e.windup;
        if (!e.alive || !w) return false;
        const k = w.ability.effect.kind;
        return (k === 'nova' || k === 'drainLantern' || k === 'doom' || (!w.interruptible && k === 'strike')) && w.remaining <= 3.2;
      });
      const cleanse = heroes.some((h) => h.doom || h.frozen > 0 || h.dot || h.stun > 0 || h.chill > 0);
      perfect = bigIncoming || cleanse || avg < 0.5;
    }
    this.emit({ type: 'fx', fx: 'sanctuary', x: 105, y: GROUND_Y, src: o.id, scale: strength });
    const dur = BAL.sanctuaryDuration * (m.sanctuaryLasting ? 3 : 1);
    for (const h of this.aliveHeroes()) {
      const bonus = m.bulwarkOfFaith && h.key === 'guardian' ? 1.5 : 1;
      this.addBarrier(h, h.maxHp * BAL.sanctuaryBarrier * m.barrierMult * strength * bonus, h.maxHp * 1.5, dur);
      this.healUnit(h, h.maxHp * (m.hallowed ? 0.25 : BAL.sanctuaryHeal) * strength * m.healMult, true);
      if (h.doom || h.frozen > 0 || h.chill > 0 || h.dot || h.stun > 0) {
        h.doom = null;
        h.frozen = 0;
        h.chill = 0;
        h.dot = null;
        h.stun = 0;
        this.emit({ type: 'text', id: h.id, text: 'CLEANSE', color: '#fff3a0' });
      }
      if (m.hallowed) {
        h.dmgBuff = Math.max(h.dmgBuff, 6);
        h.dmgBuffMult = Math.max(h.dmgBuffMult, 1.3);
      }
    }
    if (m.bulwarkOfFaith && strength >= 1) {
      this.skills.guardian.cooldown = 0;
      const g = this.heroUnit('guardian');
      if (g && g.alive) g.taunt = Math.max(g.taunt, 4);
    }
    if (m.divineEcho && strength >= 1) {
      this.schedule(4, () => {
        if (o.alive && this.phase === 'fight') this.sanctuary(o, 0.5, false);
      });
    }
    if (perfect) this.markPerfect('oracle', manual);
  }

  private checkEmberbond(): void {
    if (!this.mods.emberbond || this.party.length < 4 || this.emberNovaCd > 0) return;
    for (const h of HERO_ORDER) if (this.skills[h].pip <= 0) return;
    for (const h of HERO_ORDER) {
      this.skills[h].pip = 0;
      this.emit({ type: 'emberPip', hero: h, on: false });
    }
    this.emberNovaCd = BAL.emberNovaCd;
    this.emberNovaCount++;
    const avgAtk = this.heroes.reduce((s, h) => s + h.atk, 0) / this.heroes.length;
    this.emit({ type: 'emberNova' });
    this.emit({ type: 'fx', fx: 'emberNova', x: 280, y: 110, scale: 2 });
    this.schedule(0.4, () => {
      for (const t of this.targetableEnemies()) {
        if (t.ward > 0) {
          t.ward = 0;
          this.onWardBreak(t);
        }
        this.hitEnemy(null, t, avgAtk * BAL.emberNovaMult, { type: 'true', tag: 'emberNova', big: true });
      }
      for (const h of this.aliveHeroes()) {
        h.haste = Math.max(h.haste, 5);
        h.hasteMult = Math.max(h.hasteMult, 1.3);
      }
    });
  }

  // ───────────────────────────── damage ─────────────────────────────

  private effectiveArmor(t: Unit): number {
    if (t.sunder > 0) return 0;
    return Math.max(0, t.armor - BAL.burnArmorShred * t.burnStacks);
  }

  private onWardBreak(t: Unit): void {
    this.emit({ type: 'wardBreak', dst: t.id });
    this.emit({ type: 'text', id: t.id, text: 'SHIELD BREAK!', color: '#9fe8ff', size: 1.3 });
    if (t.windup && t.windup.ability.wardLinked && !t.windup.interruptible) {
      t.windup.interruptible = true;
      this.emit({ type: 'windupChange', id: t.id, interruptible: true });
      this.emit({ type: 'text', id: t.id, text: '中断可能！', color: '#ffb347', size: 1.4 });
    }
    if (t.rank !== 'normal') this.stagger(t, BAL.wardBreakStagger, 'BREAK!');
  }

  /** Damage dealt to an enemy. Returns total damage applied (ward + hp). */
  private hitEnemy(src: Unit | null, t: Unit, base: number, o: HitOpts): number {
    if (!t.alive || t.untargetable > 0 || this.phase === 'bossIntro') return 0;
    const m = this.mods;
    let amt = base;
    if (src && src.side === 'hero') amt *= this.heroDmgMult(src);
    if (t.mark > 0 && o.tag !== 'emberNova') amt *= 1 + m.markBonus;
    if (t.stagger > 0) amt *= BAL.staggerMult;
    if (o.type === 'magic') {
      if (t.mark > 0 && m.spellstrike > 0) amt *= 1 + m.spellstrike;
      if (t.stun > 0 && m.moltenBash) amt *= 1.4;
    }
    let prot = 0;
    for (const e of this.enemies) if (e !== t && e.alive && e.def?.protector && e.stun <= 0) prot = Math.max(prot, e.def.protector);
    if (prot > 0) amt *= 1 - prot;
    if (o.type === 'phys') amt *= 1 - this.effectiveArmor(t);

    const hpBefore = t.hp;
    let toWard = 0;
    let wardBroke = false;
    if (t.ward > 0) {
      const wm = o.type === 'phys' ? 0.5 : o.type === 'magic' ? (o.tag === 'meteor' ? BAL.meteorWardMult : 1.5) : 1;
      const eff = amt * wm;
      toWard = Math.min(t.ward, eff);
      t.ward -= toWard;
      amt = (eff - toWard) / wm;
      if (t.ward <= 0.0001) {
        t.ward = 0;
        wardBroke = true;
      }
    }
    t.hp -= amt;
    t.hitFlash = 0;
    if (src) t.lastHitBy = src.id;
    const total = Math.min(hpBefore, amt) + toWard;
    const overkill = t.hp <= 0 && amt >= hpBefore * 3 && t.rank !== 'boss';
    this.emit({ type: 'damage', dst: t.id, amount: amt + toWard, crit: !!o.crit, dmgType: o.type, blocked: false, absorbed: toWard, toWard, big: !!o.big, overkill, src: src?.id ?? null, tag: o.tag ?? 'auto' });
    if (src && src.side === 'hero' && amt + toWard > this.bestHit) this.bestHit = amt + toWard;
    if (wardBroke) this.onWardBreak(t);
    // channel break
    if (t.windup && t.windup.ability.breakFrac) {
      t.windup.dealt += total;
      if (t.windup.dealt >= t.maxHp * t.windup.ability.breakFrac) {
        t.windup = null;
        this.interrupts++;
        this.emit({ type: 'interrupt', id: t.id, by: src?.id ?? 0 });
        this.stagger(t, BAL.wardBreakStagger, 'CHANNEL BREAK!');
      }
    }

    if (t.hp <= 0) {
      t.hp = 0;
      this.killEnemy(t);
    } else {
      this.checkBossPhase(t);
    }
    return total;
  }

  private checkBossPhase(t: Unit): void {
    const def = t.def!;
    if (def.enrageBelow && !t.enraged && t.hp / t.maxHp < def.enrageBelow) {
      t.enraged = true;
      t.speedMult *= 1.3;
      this.emit({ type: 'text', id: t.id, text: 'ENRAGED!', color: '#ff5050', size: 1.4 });
    }
    if (def.phases) {
      while (t.phase < def.phases.length && t.hp / t.maxHp <= def.phases[t.phase]) {
        t.phase++;
        const abil = def.abilities ?? [];
        abil.forEach((a, i) => {
          if (!a.manual && (a.minPhase ?? 0) === t.phase) t.abilityTimers[i] = a.initialDelay ?? a.cooldown * 0.5;
        });
        if (t.windup && (t.windup.ability.maxPhase ?? 99) < t.phase) t.windup = null;
        if (def.phaseAbility) t.pendingAbility = def.phaseAbility;
        this.phaseFreeze = BAL.phaseFreeze;
        this.emit({ type: 'bossPhase', id: t.id, phase: t.phase, text: def.phaseText?.[t.phase - 1] ?? '' });
        this.emit({ type: 'fx', fx: 'phase', x: t.x, y: t.y, dst: t.id });
      }
    }
  }

  private killEnemy(t: Unit): void {
    const m = this.mods;
    const def = t.def!;
    t.alive = false;
    t.deadTime = 0;
    t.windup = null;
    t.pendingAbility = null;
    const burning = t.burnStacks > 0;
    if (def.phoenix && !t.revived) {
      t.revived = true;
      t.reviveTimer = 1.6;
      if (this.focusId === t.id) this.focusId = null;
      this.emit({ type: 'death', id: t.id, side: 'enemy', rank: t.rank });
      this.emit({ type: 'text', id: t.id, text: 'REBIRTH...', color: '#ffb060' });
      this.afterEnemyDeathEffects(t, burning);
      return;
    }
    this.kills++;
    this.emit({ type: 'death', id: t.id, side: 'enemy', rank: t.rank });
    if (this.focusId === t.id) this.focusId = null;

    // loot
    const s = this.globalStage;
    const gold = Math.max(1, Math.round(enemyGoldAt(s) * def.gold * m.goldMult * (t.summoned ? 0.3 : 1)));
    this.loot.gold += gold;
    this.emit({ type: 'loot', kind: 'gold', amount: gold, from: t.id, x: t.x, y: t.y - 8 });
    let embers = 0;
    const ai = this.area.index;
    if (t.rank === 'elite') embers = Math.max(BAL.eliteEmbers[ai] + (m.emberMultElite > 1 ? 1 : 0), Math.round(BAL.eliteEmbers[ai] * m.emberMultElite));
    else if (t.rank === 'boss') {
      const base = def.embers ?? BAL.bossEmbers[ai];
      embers = Math.max(base + (m.emberMultElite > 1 ? 1 : 0), Math.round(base * m.emberMultElite));
    } else if (!t.summoned && m.scavengerChance > 0 && this.scavenged < BAL.scavengerCap && this.rng.chance(m.scavengerChance)) {
      embers = 1;
      this.scavenged++;
    }
    if (embers > 0) {
      embers = Math.max(1, Math.round(embers * m.emberMult));
      this.loot.embers += embers;
      this.emit({ type: 'loot', kind: 'ember', amount: embers, from: t.id, x: t.x, y: t.y - 8 });
    }
    this.gainOverdrive(t.rank === 'normal' ? BAL.overdrivePerKill : BAL.overdrivePerElite);
    if (t.rank === 'elite') {
      this.eliteKills++;
      this.emit({ type: 'eliteDefeated', id: t.id });
    }
    this.afterEnemyDeathEffects(t, burning);

    if (t.rank === 'boss') {
      const left = this.enemies.filter((e) => e.rank === 'boss' && (e.alive || e.reviveTimer > 0));
      for (const b of left) {
        if (b.def?.rally) {
          b.speedMult *= 1 + b.def.rally;
          this.emit({ type: 'text', id: b.id, text: 'RALLY', color: '#ff7070' });
        }
      }
      if (left.length === 0) this.onBossDefeated(t);
    }
  }

  private afterEnemyDeathEffects(t: Unit, burning: boolean): void {
    const m = this.mods;
    const def = t.def!;
    if (burning && m.combustion) {
      const arc = this.heroUnit('arcanist');
      const atk = arc ? arc.atk : t.burnPower / BAL.burnPerStack;
      this.emit({ type: 'fx', fx: 'explosion', x: t.x, y: t.y - 8, scale: 1 });
      this.schedule(0.05, () => {
        for (const e of this.targetableEnemies()) {
          if (e === t) continue;
          this.hitEnemy(arc ?? null, e, atk * 0.8, { type: 'magic', tag: 'explode' });
          this.applyBurn(e, 1, atk);
        }
      });
    }
    if (burning && m.pyreOfRenewal) {
      for (const h of this.aliveHeroes()) this.healUnit(h, h.maxHp * 0.02, true);
      for (const h of this.party) this.skills[h].cooldown = Math.max(0, this.skills[h].cooldown - 0.5);
    }
    t.burnStacks = 0;
    t.burnTime = 0;
    t.mark = 0;
    if (def.explodeOnDeath) {
      this.emit({ type: 'fx', fx: 'explosion', x: t.x, y: t.y - 8, scale: 1 });
      const dmg = t.atk * def.explodeOnDeath;
      for (const h of this.aliveHeroes()) this.damageHero(t, h, dmg, { type: 'magic', tag: 'explode', label: `${def.name}の爆発` });
    }
  }

  private onBossDefeated(last: Unit): void {
    this.bossDefeated = true;
    for (const h of this.heroes) {
      h.doom = null;
      h.dot = null;
    }
    const final = this.area.id === 'hollow' || this.area.id === 'heart';
    for (const e of this.enemies) {
      if (e.alive) {
        e.alive = false;
        e.deadTime = 0;
        this.emit({ type: 'death', id: e.id, side: 'enemy', rank: e.rank });
      }
      e.windup = null;
    }
    const bossTime = this.time - this.bossFightStart;
    const seg = this.segment;
    seg.bossDefeated = true;
    seg.bossTime = bossTime;
    seg.lanternFrac = this.lastLightActive > 0 ? 0 : this.lantern / this.lanternMax;
    seg.stageReached = 10;
    seg.stagesCleared = 10;
    this.stagesCleared = 10;
    this.emit({ type: 'bossDefeated', id: last.id, final, time: bossTime });
    if (this.bossShards > 0) {
      this.loot.shards += this.bossShards;
      this.emit({ type: 'loot', kind: 'shard', amount: this.bossShards, from: last.id, x: last.x, y: last.y - 20 });
    }
    if (this.area.id === 'heart') this.lantern = this.lanternMax;
    this.phase = 'victory';
    this.phaseTimer = BAL.victoryTime;
  }

  private afterVictory(): void {
    const next = AREA_ORDER[this.area.index + 1];
    if (next && canDescendFrom(this.save, this.area.id) && this.lantern >= BAL.descentMinLantern && this.lastLightActive <= 0) {
      this.enterArea(next);
      this.lantern = Math.min(this.lantern + BAL.descentRefuel, this.lanternMax + BAL.descentRefuel);
      this.lanternWarned = this.lantern <= 10;
      this.descending = true;
      this.enemies = [];
      this.phase = 'walk';
      this.phaseTimer = this.phaseDuration = BAL.descentTime;
      for (const h of this.aliveHeroes()) this.healUnit(h, h.maxHp * 0.3, true);
      this.emit({ type: 'descent', area: next });
      return;
    }
    this.end('victory');
  }

  private damageHero(src: Unit | null, h: Unit, base: number, o: HitOpts): void {
    if (!h.alive) return;
    const m = this.mods;
    let amt = base;
    if (src && src.side === 'enemy') {
      amt *= src.dmgMult;
      if (src.dmgBuff > 0) amt *= src.dmgBuffMult;
    }
    let blocked = false;
    if (h.key === 'guardian' && o.canBlock && this.rng.chance(Math.min(0.75, m.blockChance))) {
      blocked = true;
      const saved = amt * m.blockReduction;
      amt -= saved;
      if (m.unbrokenVow) this.addVow(h, saved);
      this.emit({ type: 'text', id: h.id, text: 'BLOCK', color: '#9cc8ff' });
      if (src && src.alive) {
        if (m.retaliation > 0) {
          const s2 = src;
          this.emit({ type: 'attack', src: h.id, dst: s2.id, fx: 'counter', travel: 0.08 });
          this.schedule(0.08, () => this.hitEnemy(h, s2, h.atk * m.retaliation, { type: 'phys', tag: 'counter' }));
        }
        const r = this.heroUnit('ranger');
        if (m.coveringFire && r && r.alive) {
          const s2 = src;
          this.emit({ type: 'attack', src: r.id, dst: s2.id, fx: 'arrow', travel: 0.18 });
          this.schedule(0.18, () => {
            if (!s2.alive) return;
            this.arrowHit(r, s2, r.atk, false, false);
            this.applyMark(s2, 4);
          });
        }
      }
    }
    const raw = amt;
    let absorbed = 0;
    if (h.barrier > 0) {
      absorbed = Math.min(h.barrier, amt);
      h.barrier -= absorbed;
      amt -= absorbed;
      if (h.key === 'guardian' && m.unbrokenVow) this.addVow(h, absorbed);
      if (h.barrier <= 0.0001) {
        h.barrier = 0;
        h.barrierTime = 0;
        this.onBarrierBreak(h);
      }
    }
    h.hp -= amt;
    h.hitFlash = 0;
    this.emit({ type: 'damage', dst: h.id, amount: raw, crit: false, dmgType: o.type, blocked, absorbed, toWard: 0, big: !!o.big, overkill: false, src: src?.id ?? null, tag: o.tag ?? 'auto' });
    if (src && src.side === 'enemy' && src.alive) {
      if (m.reflect > 0 && o.tag !== 'reflect') this.hitEnemy(h, src, raw * m.reflect, { type: 'true', tag: 'reflect' });
      const def = src.def;
      if (def?.lanternDrainOnHit && o.tag === 'auto' && this.lastLightActive <= 0) {
        this.drainLantern(def.lanternDrainOnHit);
        this.emit({ type: 'text', id: h.id, text: `-${def.lanternDrainOnHit}s`, color: '#b4ff6a' });
        this.emit({ type: 'fx', fx: 'drain', x: h.x, y: h.y - 20, src: src.id });
      }
      if (def?.chillOnHit && o.tag === 'auto') h.chill = Math.max(h.chill, def.chillOnHit);
    }
    if (h.hp <= 0) {
      h.hp = 0;
      this.killedBy = o.label ?? src?.name ?? null;
      this.killHero(h);
    } else if (m.intercession && h.hp / h.maxHp < 0.2 && h.intercedeCd <= 0) {
      const o2 = this.heroUnit('oracle');
      if (o2 && o2.alive) {
        h.intercedeCd = 20;
        this.addBarrier(h, h.maxHp * 0.25 * m.barrierMult, h.maxHp, 6);
        this.emit({ type: 'fx', fx: 'intercede', x: h.x, y: h.y, src: o2.id, dst: h.id });
        this.emit({ type: 'text', id: h.id, text: 'SAVED', color: '#fff3a0' });
      }
    }
  }

  private addVow(g: Unit, amount: number): void {
    const before = g.vow;
    const cap = g.maxHp * BAL.vowThreshold;
    g.vow = Math.min(cap * 1.5, g.vow + amount);
    if (before < cap && g.vow >= cap) {
      this.emit({ type: 'vow', ready: true });
      this.emit({ type: 'text', id: g.id, text: 'VOW READY', color: '#ffe9a0' });
    }
  }

  private onBarrierBreak(h: Unit): void {
    const m = this.mods;
    this.emit({ type: 'barrierBreak', dst: h.id });
    if (m.aegisRetort && h.key === 'guardian' && this.aegisCd <= 0) {
      this.aegisCd = 2;
      this.emit({ type: 'fx', fx: 'shockwave', x: h.x + 20, y: h.y, src: h.id, scale: 1.5 });
      this.emit({ type: 'text', id: h.id, text: 'AEGIS RETORT!', color: '#ffe9a0', size: 1.3 });
      this.schedule(0.1, () => {
        for (const e of this.targetableEnemies()) this.hitEnemy(h, e, h.atk * 3, { type: 'phys', tag: 'counter', big: true });
      });
    }
    if (m.bastion) {
      const cd = this.bastionCd.get(h.id) ?? -99;
      if (this.time - cd >= 1) {
        this.bastionCd.set(h.id, this.time);
        const avg = this.heroes.reduce((s, x) => s + x.atk, 0) / this.heroes.length;
        this.emit({ type: 'fx', fx: 'shockwave', x: h.x + 20, y: h.y, src: h.id, scale: 1 });
        this.schedule(0.1, () => {
          for (const e of this.targetableEnemies()) this.hitEnemy(null, e, avg * 1.5, { type: 'magic', tag: 'counter' });
        });
      }
    }
  }

  private killHero(h: Unit): void {
    const m = this.mods;
    h.alive = false;
    h.deadTime = 0;
    h.barrier = 0;
    h.doom = null;
    h.dot = null;
    h.frozen = 0;
    this.emit({ type: 'death', id: h.id, side: 'hero', rank: 'hero' });
    if (m.phoenixAll && !this.phoenixUsed.has(h.id)) {
      this.phoenixUsed.add(h.id);
      h.reviveTimer = 2;
      this.emit({ type: 'text', id: h.id, text: 'PHOENIX', color: '#ffb060' });
    }
  }

  private reviveHero(h: Unit, frac: number): void {
    h.alive = true;
    h.hp = h.maxHp * frac;
    h.reviveTimer = 0;
    h.stun = 0;
    h.frozen = 0;
    h.atkTimer = h.interval * 0.5;
    this.emit({ type: 'revive', id: h.id });
    this.emit({ type: 'fx', fx: 'revive', x: h.x, y: h.y, dst: h.id });
  }

  private healUnit(t: Unit, amount: number, quiet = false): void {
    if (!t.alive || amount <= 0) return;
    const m = this.mods;
    const missing = t.maxHp - t.hp;
    const healed = Math.min(missing, amount);
    t.hp += healed;
    if (healed > 0.5 || !quiet) this.emit({ type: 'heal', dst: t.id, amount: healed });
    const over = amount - healed;
    if (over > 0 && m.overflowCap > 0) {
      const cap = t.maxHp * m.overflowCap;
      if (t.barrier < cap) this.addBarrier(t, Math.min(over, cap - t.barrier), cap, 6);
    }
  }

  private addBarrier(t: Unit, amount: number, cap: number, duration: number): void {
    if (!t.alive || amount <= 0) return;
    const before = t.barrier;
    t.barrier = Math.min(Math.max(cap, before), before + amount);
    t.barrierTime = Math.max(t.barrierTime, duration);
    if (t.barrier > before + 0.5) this.emit({ type: 'barrier', dst: t.id, amount: t.barrier - before });
  }

  // ───────────────────────────── enemies ─────────────────────────────

  private updateEnemy(e: Unit, dt: number): void {
    if (!e.alive) {
      e.deadTime += dt;
      if (e.reviveTimer > 0) {
        e.reviveTimer -= dt;
        if (e.reviveTimer <= 0) {
          e.alive = true;
          e.hp = e.maxHp * 0.5;
          e.deadTime = 0;
          e.atkTimer = e.interval;
          this.emit({ type: 'revive', id: e.id });
          this.emit({ type: 'fx', fx: 'revive', x: e.x, y: e.y, dst: e.id });
        }
      }
      return;
    }
    // statuses
    if (e.mark > 0 && e.mark !== Infinity) {
      e.mark -= dt;
      if (e.mark <= 0) {
        e.mark = 0;
        this.emit({ type: 'mark', id: e.id, on: false });
      }
    }
    if (e.stagger > 0) e.stagger -= dt;
    if (e.sunder > 0) e.sunder -= dt;
    if (e.haste > 0) e.haste -= dt;
    else e.hasteMult = 1;
    if (e.dmgBuff > 0) e.dmgBuff -= dt;
    else e.dmgBuffMult = 1;
    if (e.burnStacks > 0) {
      e.burnTime -= dt;
      e.burnTick += dt * this.mods.burnTickMult;
      if (e.burnTick >= 0.5) {
        e.burnTick -= 0.5;
        let dmg = e.burnStacks * e.burnPower * 0.5;
        let crit = false;
        if (this.mods.inferno && this.rng.chance(this.bestCritChance)) {
          crit = true;
          dmg *= this.bestCritMult;
        }
        const arc = this.heroUnit('arcanist');
        this.hitEnemy(arc && arc.alive ? arc : null, e, dmg, { type: 'magic', crit, tag: 'burn' });
        if (!e.alive) return;
      }
      if (e.burnTime <= 0) {
        e.burnStacks = 0;
        e.burnPower = 0;
      }
    }
    const def = e.def!;
    if (def.frenzyPhase !== undefined && e.phase >= def.frenzyPhase) {
      e.frenzyTimer += dt;
      if (e.frenzyTimer >= 5) {
        e.frenzyTimer -= 5;
        e.speedMult *= 1.05;
      }
    }
    if (e.untargetable > 0) {
      e.untargetable -= dt;
      if (e.untargetable <= 0) this.emerge(e);
      return;
    }
    if (e.stun > 0) {
      e.stun -= dt;
      return;
    }
    const speed = e.speedMult * (e.haste > 0 ? e.hasteMult : 1);
    if (e.windup) {
      const w = e.windup;
      w.remaining -= dt;
      if (w.ability.channelDrain && this.lastLightActive <= 0) this.drainLantern(w.ability.channelDrain * dt);
      if (this.phase !== 'fight') return;
      if (e.windup && e.windup.remaining <= 0) {
        e.windup = null;
        this.executeAbility(e, w.ability, w.targetId, w.weakened);
      }
      return;
    }
    if (e.pendingAbility) {
      const a = def.abilities?.find((x) => x.id === e.pendingAbility);
      e.pendingAbility = null;
      if (a && (!a.cycle2 || this.cycle2)) {
        this.startAbility(e, a);
        return;
      }
    }
    // abilities
    const abil = def.abilities ?? [];
    for (let i = 0; i < abil.length; i++) {
      const a = abil[i];
      if (a.manual || (a.cycle2 && !this.cycle2)) continue;
      if ((a.minPhase ?? 0) > e.phase || (a.maxPhase ?? 99) < e.phase) continue;
      e.abilityTimers[i] -= dt * speed;
      if (e.abilityTimers[i] <= 0) {
        e.abilityTimers[i] = a.cooldown;
        this.startAbility(e, a);
        return;
      }
    }
    // auto attack
    e.atkTimer -= dt * speed;
    if (e.atkTimer <= 0) {
      e.atkTimer += e.interval;
      if (e.atkTimer < 0) e.atkTimer = e.interval * 0.5;
      this.enemyAttack(e);
    }
  }

  private emerge(e: Unit): void {
    e.untargetable = 0;
    this.emit({ type: 'fx', fx: 'emerge', x: e.x, y: e.y, dst: e.id });
    const sub = (e as Unit & { _sub?: { then?: string; summon?: { enemy: string; count: number; hpMult?: number } } })._sub;
    if (sub?.summon) this.summon(sub.summon.enemy, sub.summon.count, 6, sub.summon.hpMult ?? 1);
    const then = sub?.then ? e.def?.abilities?.find((a) => a.id === sub.then) : undefined;
    if (then) this.startAbility(e, then);
  }

  private pickHeroFor(style: TargetStyle): Unit | null {
    const alive = this.aliveHeroes();
    if (!alive.length) return null;
    const tank = alive.find((h) => h.taunt > 0);
    if (tank) return tank;
    switch (style) {
      case 'front':
        return alive[0];
      case 'backline':
        return alive[alive.length - 1];
      case 'lowest':
        return alive.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a));
      case 'random':
        return alive[this.rng.int(alive.length)];
    }
  }

  private enemyAttack(e: Unit): void {
    const def = e.def!;
    const t = this.pickHeroFor(def.target);
    if (!t) return;
    e.actFlash = 0;
    const fx = def.attack === 'melee' ? 'enemyMelee' : def.attack === 'ranged' ? 'enemyShot' : 'enemyMagic';
    const travel = def.attack === 'melee' ? 0.15 : 0.3;
    this.emit({ type: 'attack', src: e.id, dst: t.id, fx, travel });
    this.schedule(travel, () => {
      if (!e.alive || !t.alive) return;
      this.damageHero(e, t, e.atk, { type: e.dmgType, canBlock: true, tag: 'auto', label: e.name });
    });
  }

  private startAbility(e: Unit, a: AbilityDef): void {
    let targetId: number | null = null;
    if (a.effect.kind === 'strike') targetId = this.pickHeroFor(a.effect.target)?.id ?? null;
    if (a.startWard) {
      e.ward += e.maxHp * a.startWard;
      e.maxWard = Math.max(e.maxWard, e.ward);
      this.emit({ type: 'fx', fx: 'ward', x: e.x, y: e.y, dst: e.id });
    }
    if (a.windup > 0) {
      e.windup = { ability: a, total: a.windup, remaining: a.windup, interruptible: a.interruptible, targetId, dealt: 0, weakened: false };
      this.emit({ type: 'windup', id: e.id, name: a.name, duration: a.windup, interruptible: a.interruptible, targetId, kind: a.effect.kind });
    } else {
      this.executeAbility(e, a, targetId, false);
    }
  }

  private perAllyMult(fx: { perAlly?: { enemy: string; mult: number } }): number {
    if (!fx.perAlly) return 1;
    const n = this.enemies.filter((x) => x.alive && x.key === fx.perAlly!.enemy).length;
    return 1 + fx.perAlly.mult * n;
  }

  private summon(enemy: string, count: number, max: number, hpMult = 1): void {
    const alive = this.enemies.filter((x) => x.alive && x.key === enemy).length;
    const n = Math.min(count, Math.max(0, max - alive));
    const positions = this.isBossStage ? BOSS_SUMMON_POS : ENEMY_POS;
    for (let i = 0; i < n; i++) {
      const used = new Set(this.enemies.filter((x) => x.alive || x.deadTime < 1.2).map((x) => `${x.x}|${x.y + (x.def?.flying ? 18 : 0)}`));
      const free = positions.find((p) => !used.has(`${p.x}|${p.y}`));
      if (!free) break;
      const u = this.spawnEnemy(enemy, free.x, free.y, -1, true);
      if (hpMult !== 1) u.maxHp = u.hp = u.maxHp * hpMult;
    }
  }

  private executeAbility(e: Unit, a: AbilityDef, targetId: number | null, weakened: boolean): void {
    const fx = a.effect;
    const weak = weakened ? 0.4 : 1;
    e.actFlash = 0;
    this.emit({ type: 'ability', id: e.id, name: a.name, effect: fx.kind });
    if (a.interruptible && (fx.kind === 'strike' || fx.kind === 'nova' || fx.kind === 'doom' || fx.kind === 'freeze' || fx.kind === 'healAllies')) {
      this.missed[a.name] = (this.missed[a.name] ?? 0) + 1;
    }
    switch (fx.kind) {
      case 'strike': {
        let t = this.heroes.find((h) => h.id === targetId && h.alive) ?? null;
        const taunter = this.aliveHeroes().find((h) => h.taunt > 0);
        if (taunter) t = taunter;
        if (!t) t = this.pickHeroFor(fx.target);
        if (!t) return;
        const tt = t;
        const mult = fx.mult * this.perAllyMult(fx) * weak;
        this.emit({ type: 'attack', src: e.id, dst: tt.id, fx: e.def!.attack === 'melee' ? 'enemyMelee' : 'enemyMagic', travel: 0.15 });
        this.schedule(0.15, () => {
          if (!e.alive || !tt.alive) return;
          this.damageHero(e, tt, e.atk * mult, { type: e.dmgType, canBlock: true, tag: 'nova', big: true, label: a.name });
          if (fx.stun && tt.alive) {
            tt.stun = Math.max(tt.stun, fx.stun);
            this.emit({ type: 'stun', id: tt.id, duration: fx.stun });
          }
          if (fx.dot && tt.alive) tt.dot = { dps: e.atk * fx.dot.dps, time: fx.dot.duration };
        });
        break;
      }
      case 'nova': {
        let mult = fx.mult * this.perAllyMult(fx) * weak;
        if (fx.wardScale && e.maxWard > 0) mult *= 1 + fx.wardScale * (e.ward / e.maxWard);
        this.emit({ type: 'fx', fx: 'nova', x: 110, y: GROUND_Y - 10, src: e.id, scale: Math.min(3, mult) });
        for (const h of this.aliveHeroes()) {
          this.damageHero(e, h, e.atk * mult, { type: 'magic', tag: 'nova', big: true, label: a.name });
          if (fx.chill && h.alive) h.chill = Math.max(h.chill, fx.chill);
        }
        break;
      }
      case 'drainLantern': {
        this.emit({ type: 'fx', fx: 'drain', x: 110, y: GROUND_Y - 30, src: e.id, scale: 2 });
        if (this.lastLightActive <= 0) {
          this.drainLantern(fx.seconds);
          this.emit({ type: 'text', id: null, text: `LANTERN -${fx.seconds}s`, color: '#b4ff6a', size: 1.5 });
        }
        for (const h of this.aliveHeroes()) this.damageHero(e, h, e.atk * fx.mult * weak, { type: 'magic', tag: 'nova', label: a.name });
        break;
      }
      case 'summon':
        this.summon(fx.enemy, fx.count, fx.max ?? 4, fx.hpMult ?? 1);
        break;
      case 'ward': {
        e.ward += e.maxHp * fx.amount;
        e.maxWard = Math.max(e.maxWard, e.ward);
        this.emit({ type: 'fx', fx: 'ward', x: e.x, y: e.y, dst: e.id });
        break;
      }
      case 'wardAllies': {
        for (const x of this.enemies) {
          if (!x.alive) continue;
          x.ward += x.maxHp * fx.amount;
          x.maxWard = Math.max(x.maxWard, x.ward);
          this.emit({ type: 'fx', fx: 'ward', x: x.x, y: x.y, dst: x.id });
        }
        break;
      }
      case 'healAllies': {
        const alive = this.enemies.filter((x) => x.alive);
        if (!alive.length) return;
        const low = alive.reduce((p, q) => (q.hp / q.maxHp < p.hp / p.maxHp ? q : p));
        const amt = low.maxHp * fx.amount;
        low.hp = Math.min(low.maxHp, low.hp + amt);
        this.emit({ type: 'heal', dst: low.id, amount: amt });
        this.emit({ type: 'fx', fx: 'heal', x: low.x, y: low.y, src: e.id, dst: low.id });
        break;
      }
      case 'doom': {
        const cands = this.aliveHeroes().filter((h) => !h.doom);
        for (let i = 0; i < fx.count && cands.length; i++) {
          const h = cands.splice(this.rng.int(cands.length), 1)[0];
          h.doom = { time: fx.delay, total: fx.delay, dmg: e.atk * fx.mult * weak };
          this.emit({ type: 'text', id: h.id, text: 'DOOM', color: '#d070ff' });
        }
        break;
      }
      case 'freeze': {
        const cands = this.aliveHeroes().filter((h) => h.frozen <= 0);
        cands.sort((a2, b2) => b2.slot - a2.slot);
        for (let i = 0; i < fx.count && cands.length; i++) {
          const h = cands.shift()!;
          h.frozen = fx.duration;
          this.emit({ type: 'fx', fx: 'freeze', x: h.x, y: h.y, dst: h.id });
          this.emit({ type: 'text', id: h.id, text: 'FROZEN', color: '#bfe8ff' });
        }
        break;
      }
      case 'submerge': {
        e.untargetable = fx.duration;
        (e as Unit & { _sub?: unknown })._sub = { then: fx.then, summon: fx.summon };
        if (this.focusId === e.id) this.setFocus(null);
        this.emit({ type: 'fx', fx: 'submerge', x: e.x, y: e.y, dst: e.id });
        break;
      }
      case 'buffAllies': {
        for (const x of this.enemies) {
          if (!x.alive) continue;
          x.haste = Math.max(x.haste, fx.duration);
          x.hasteMult = Math.max(x.hasteMult, fx.speed);
          x.dmgBuff = Math.max(x.dmgBuff, fx.duration);
          x.dmgBuffMult = Math.max(x.dmgBuffMult, fx.dmg);
        }
        this.emit({ type: 'text', id: e.id, text: 'EMPOWER', color: '#ff9a50' });
        break;
      }
    }
  }

  // ───────────────────────────── flow ─────────────────────────────

  private checkWaveState(): void {
    if (this.phase !== 'fight') return;
    const anyAlive = this.heroes.some((h) => h.alive || h.reviveTimer > 0);
    if (!anyAlive) {
      this.end('wiped');
      return;
    }
    const remaining = this.enemies.some((e) => e.alive || e.reviveTimer > 0);
    if (!remaining && !this.isBossStage) {
      this.stagesCleared = this.stage + 1;
      this.segment.stagesCleared = this.stagesCleared;
      this.stage++;
      this.segment.stageReached = Math.max(this.segment.stageReached, this.stage + 1);
      this.phase = 'walk';
      this.phaseTimer = this.phaseDuration = this.routed ? BAL.routWalkTime : BAL.walkTime;
      this.focusId = null;
      for (const h of this.aliveHeroes()) {
        h.doom = null;
        h.dot = null;
        this.healUnit(h, h.maxHp * this.mods.restHeal, true);
      }
    }
  }

  private autoCast(): void {
    const m = this.mods;
    if (!m.autoCast) return;
    for (const h of this.party) {
      const s = this.skills[h];
      if (!s.auto || !this.skillReady(h)) continue;
      if (!m.smartCast) {
        if (h === 'oracle') {
          const low = this.lowestHero();
          if (!low || low.hp / low.maxHp > 0.85) continue;
        }
        this.cast(h, false);
        continue;
      }
      if (this.smartWants(h)) this.cast(h, false);
    }
  }

  private smartWants(h: HeroId): boolean {
    const ts = this.targetableEnemies();
    if (!ts.length && h !== 'oracle') return false;
    const m = this.mods;
    const bigPresent = ts.some((e) => e.rank !== 'normal');
    switch (h) {
      case 'guardian': {
        const threat = ts.some((e) => e.windup && (e.windup.interruptible || (m.bashWeakens && !e.windup.weakened)) && e.windup.remaining < 1.4);
        if (threat) return true;
        const anyInterruptible = ts.some((e) => (e.def?.abilities ?? []).some((a) => a.interruptible));
        return !anyInterruptible;
      }
      case 'ranger':
        return ts.length >= 3 || bigPresent || ts.length === 1;
      case 'arcanist':
        return ts.length >= 3 || bigPresent || ts.some((e) => e.ward > 0) || ts.length === this.enemies.filter((e) => e.alive).length;
      case 'oracle': {
        const nuke = ts.some((e) => {
          const w = e.windup;
          if (!w) return false;
          const k = w.ability.effect.kind;
          const dangerous = k === 'nova' || k === 'drainLantern' || k === 'doom';
          const bashable = w.interruptible && this.skills.guardian.cooldown <= 0 && this.heroUnit('guardian')?.alive;
          return dangerous && !bashable && w.remaining < 1.2;
        });
        if (nuke) return true;
        const heroes = this.aliveHeroes();
        if (heroes.some((x) => (x.doom && x.doom.time < 1.5) || x.frozen > 0.5)) return true;
        const avg = heroes.reduce((s, x) => s + x.hp / x.maxHp, 0) / Math.max(1, heroes.length);
        return avg < 0.5;
      }
    }
  }

  private end(reason: RunEndReason): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    const seg = this.segment;
    if (reason !== 'victory') seg.stageReached = Math.min(10, Math.max(seg.stageReached, this.stage + 1));
    this.result = {
      areaId: this.startArea,
      reason,
      stageReached: seg.stageReached,
      stagesCleared: seg.stagesCleared,
      segments: this.segments.map((s) => ({ ...s })),
      kills: this.kills,
      eliteKills: this.eliteKills,
      bossDefeated: this.segments.some((s) => s.bossDefeated),
      loot: { ...this.loot },
      duration: this.time,
      bestHit: this.bestHit,
      interrupts: this.interrupts,
      perfects: this.perfects,
      routs: this.routs,
      emberNovas: this.emberNovaCount,
      killedBy: reason === 'wiped' ? this.killedBy : null,
      missed: { ...this.missed },
    };
    this.emit({ type: 'runEnd', reason });
  }
}

/** Headless helper: run a battle to completion with an optional per-tick controller. */
export function simulateRun(
  save: SaveData,
  areaId: AreaId,
  seed: number,
  opts: { dt?: number; maxTime?: number; controller?: (b: Battle) => void } = {},
): RunResult {
  const b = new Battle({ save, areaId, seed });
  const dt = opts.dt ?? 1 / 30;
  const maxT = opts.maxTime ?? 900;
  while (!b.ended && b.time < maxT) {
    opts.controller?.(b);
    b.tick(dt);
    b.events.length = 0;
  }
  if (!b.ended) b.retreat();
  return b.result!;
}
