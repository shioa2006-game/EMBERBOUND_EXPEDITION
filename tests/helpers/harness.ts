// Battle test harness: fixed-step ticking with an event log, plus helpers to stage precise situations
// using only the Battle's public fields (no private API), so tests survive internal refactors.
import { Battle, type BattleConfig } from '../../src/core/battle.ts';
import type { AbilityDef, BattleEvent, HeroId, Unit } from '../../src/core/types.ts';

export const DT = 1 / 60;

export type EventOf<T extends BattleEvent['type']> = Extract<BattleEvent, { type: T }>;

export class Harness {
  readonly b: Battle;
  readonly log: BattleEvent[] = [];

  constructor(cfg: BattleConfig | Battle) {
    this.b = cfg instanceof Battle ? cfg : new Battle({ seed: 1234, ...cfg });
  }

  /** One fixed step; drained events are appended to the log. */
  step(dt = DT): void {
    this.b.tick(dt);
    this.flush();
  }

  /** Move events emitted outside tick() (cast, setFocus, retreat...) into the log. */
  flush(): void {
    const ev = this.b.drainEvents();
    for (const e of ev) this.log.push(e);
  }

  /** Advance `sec` seconds (stops early if the battle ends). */
  tick(sec: number): void {
    const n = Math.round(sec / DT);
    for (let i = 0; i < n && !this.b.ended; i++) this.step();
  }

  /** Tick until `pred` holds. Returns false if `maxSec` elapsed (or the battle ended) first. */
  until(pred: (b: Battle) => boolean, maxSec = 30): boolean {
    const n = Math.round(maxSec / DT);
    for (let i = 0; i < n; i++) {
      if (pred(this.b)) return true;
      if (this.b.ended) return pred(this.b);
      this.step();
    }
    return pred(this.b);
  }

  /** Tick until the battle is in the `fight` phase (stage spawned, boss intro over). */
  toFight(maxSec = 10): void {
    if (!this.until((b) => b.phase === 'fight', maxSec)) throw new Error(`never reached fight (phase=${this.b.phase})`);
  }

  of<T extends BattleEvent['type']>(type: T): EventOf<T>[] {
    return this.log.filter((e): e is EventOf<T> => e.type === type);
  }

  clearLog(): void {
    this.flush();
    this.log.length = 0;
  }

  hero(h: HeroId): Unit {
    const u = this.b.heroUnit(h);
    if (!u) throw new Error(`hero ${h} not in party`);
    return u;
  }

  aliveEnemies(): Unit[] {
    return this.b.enemies.filter((e) => e.alive);
  }

  /** Enemies become passive punching bags: huge HP, no ward, stunned (statuses like Burn still tick). */
  pacifyEnemies(hp = 1e9): void {
    for (const e of this.b.enemies) {
      if (!e.alive) continue;
      e.maxHp = e.hp = hp;
      e.ward = e.maxWard = 0;
      e.stun = 1e6;
      e.windup = null;
      e.pendingAbility = null;
    }
  }

  /** Heroes stop auto-attacking/healing (they can still cast skills). `except` keep attacking. */
  holdFire(except: HeroId[] = []): void {
    for (const h of this.b.heroes) if (!except.includes(h.key as HeroId)) h.atkTimer = 1e6;
  }

  /** Let heroes attack again right away. */
  release(): void {
    for (const h of this.b.heroes) h.atkTimer = Math.min(h.atkTimer, 0.01);
  }

  /** Put a windup on an enemy as if it had just started the ability. */
  giveWindup(e: Unit, ability: AbilityDef, remaining = ability.windup): void {
    e.stun = 0;
    e.windup = { ability, total: ability.windup, remaining, interruptible: ability.interruptible, targetId: null, dealt: 0, weakened: false };
  }

  /** Reduce `targets` to (almost) zero HP and let the party finish them. */
  finish(targets: Unit[], maxSec = 10): void {
    for (const t of targets) {
      t.hp = 1e-6;
      t.ward = 0;
      t.untargetable = 0;
      t.windup = null;
      t.pendingAbility = null; // e.g. a cycle-2 Submerge opener would make it untargetable
    }
    this.release();
    if (!this.until(() => targets.every((t) => !t.alive), maxSec)) throw new Error('targets survived finish()');
  }
}

export function testAbility(over: Partial<AbilityDef> = {}): AbilityDef {
  return {
    id: 'testSmash',
    name: 'Test Smash',
    cooldown: 99,
    windup: 5,
    interruptible: true,
    effect: { kind: 'strike', mult: 3, target: 'front' },
    ...over,
  };
}

/** Index of a regular stage (not elite / boss) of `area` whose every variant has at least `n` enemies. */
export function stageWithAtLeast(stages: { variants: string[][] }[], n: number): number {
  const i = stages.findIndex((st, idx) => idx !== 4 && idx !== 9 && st.variants.every((v) => v.length >= n));
  if (i < 0) throw new Error(`no regular stage with >= ${n} enemies`);
  return i;
}

/** Sum of `damage` event amounts for one unit, optionally restricted to a tag. */
export function damageTo(log: BattleEvent[], id: number, tag?: string): number {
  let s = 0;
  for (const e of log) if (e.type === 'damage' && e.dst === id && (tag === undefined || e.tag === tag)) s += e.amount;
  return s;
}
