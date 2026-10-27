// Damage formula and secondary mechanics: Armor / Sunder / Burn shred, Ward multipliers, Stagger,
// Overdrive, Ember Nova, Unbroken Vow, rest healing, drops, enemy ability effects.
import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance.ts';
import { GROUND_Y, SIZE_BOX } from '../src/core/battle.ts';
import { computeMods } from '../src/core/mods.ts';
import { heroStats } from '../src/core/state.ts';
import { type AreaId, type HeroId, type Mods, type SaveData, type Unit } from '../src/core/types.ts';
import { AREAS } from '../src/data/areas.ts';
import { ENEMIES } from '../src/data/enemies.ts';
import { damageTo, Harness, stageWithAtLeast, testAbility } from './helpers/harness.ts';
import { battleProblems } from './helpers/invariants.ts';
import { makeSave } from './helpers/saves.ts';

function staged(save: SaveData, stage = 0, area: AreaId = 'ashwood', mods?: Mods): Harness {
  const h = new Harness({ save, areaId: area, seed: 4321, mods });
  h.b.stage = stage;
  h.toFight();
  h.b.routed = false;
  h.pacifyEnemies();
  h.holdFire();
  h.clearLog();
  return h;
}

/** Mods with every crit disabled so skill damage is exact. */
function noCrits(save: SaveData): Mods {
  const m = computeMods(save);
  m.critChanceGlobalMult = 0;
  return m;
}

const front = (h: Harness): Unit => h.aliveEnemies().reduce((a, b) => (b.x < a.x ? b : a));
const MULTI = stageWithAtLeast(AREAS.ashwood.stages, 2);

/** Damage of one manual Shield Bash on the front enemy (no windups around). */
function bashDamage(prepare: (e: Unit, h: Harness) => void, save = makeSave({ level: 5 })): { dealt: number; atk: number; e: Unit; h: Harness } {
  const h = staged(save);
  const e = front(h);
  prepare(e, h);
  h.b.cast('guardian');
  h.tick(0.2);
  return { dealt: damageTo(h.log, e.id, 'skill'), atk: h.hero('guardian').atk, e, h };
}

function stageWith(pred: (id: string) => boolean): { area: AreaId; stage: number } | null {
  for (const area of Object.keys(AREAS) as AreaId[]) {
    const stage = AREAS[area].stages.findIndex((st, i) => i !== 9 && st.variants.every((v) => v.some(pred)));
    if (stage >= 0) return { area, stage };
  }
  return null;
}

describe('physical damage vs Armor', () => {
  it('Armor reduces physical damage', () => {
    const { dealt, atk } = bashDamage((e) => (e.armor = 0.5));
    expect(dealt).toBeCloseTo(atk * BAL.bashMult * 0.5, 6);
  });

  it('Sunder ignores Armor', () => {
    const { dealt, atk } = bashDamage((e) => {
      e.armor = 0.5;
      e.sunder = 5;
    });
    expect(dealt).toBeCloseTo(atk * BAL.bashMult, 6);
  });

  it('each Burn stack shreds Armor', () => {
    const { dealt, atk } = bashDamage((e) => {
      e.armor = 0.5;
      e.burnStacks = 2;
      e.burnTime = 4;
      e.burnTick = -10; // no tick during the test
    });
    expect(dealt).toBeCloseTo(atk * BAL.bashMult * (1 - (0.5 - 2 * BAL.burnArmorShred)), 6);
  });

  it('Stagger increases damage taken', () => {
    const { dealt, atk } = bashDamage((e) => (e.stagger = 5));
    expect(dealt).toBeCloseTo(atk * BAL.bashMult * BAL.staggerMult, 6);
  });

  it('Magic (Burn) ignores Armor', () => {
    const h = staged(makeSave({ level: 5 }));
    const e = front(h);
    e.armor = 0.9;
    e.burnStacks = 1;
    e.burnPower = 10;
    e.burnTime = 4;
    e.burnTick = 0;
    h.tick(0.55);
    expect(h.of('damage').find((d) => d.dst === e.id && d.tag === 'burn')!.amount).toBeCloseTo(5, 6);
  });
});

describe('Ward', () => {
  it('physical hits deal half damage to a Ward, HP untouched', () => {
    const { h, e, atk } = bashDamage((u) => (u.ward = u.maxWard = 1e7));
    const d = h.of('damage').find((x) => x.dst === e.id && x.tag === 'skill')!;
    expect(d.toWard).toBeCloseTo(atk * BAL.bashMult * 0.5, 6);
    expect(e.hp).toBe(e.maxHp);
  });

  it('magic deals 1.5x and Meteor 3x to a Ward', () => {
    const save = makeSave({ heroes: ['arcanist'], level: 10 });
    const h = staged(save, MULTI, 'ashwood', noCrits(save));
    const [warded, bare] = h.aliveEnemies();
    warded.ward = warded.maxWard = 1e8;
    expect(h.b.cast('arcanist')).toBe(true);
    h.tick(BAL.meteorDelay + 0.2);
    const a = h.hero('arcanist');
    const onBare = h.of('damage').find((d) => d.dst === bare.id && d.tag === 'meteor')!;
    const onWard = h.of('damage').find((d) => d.dst === warded.id && d.tag === 'meteor')!;
    expect(onBare.amount).toBeCloseTo(a.atk * BAL.meteorMult, 6);
    expect(onWard.toWard / onBare.amount).toBeCloseTo(BAL.meteorWardMult, 6);
    // a Burn tick on the Ward: 1.5x
    h.tick(0.6);
    const burnBare = h.of('damage').find((d) => d.dst === bare.id && d.tag === 'burn')!;
    const burnWard = h.of('damage').find((d) => d.dst === warded.id && d.tag === 'burn')!;
    expect(burnWard.toWard / burnBare.amount).toBeCloseTo(1.5, 6);
  });

  it('breaking a Ward emits wardBreak; elites and bosses are staggered', () => {
    const { h, e } = bashDamage((u) => {
      u.ward = u.maxWard = 1;
      u.rank = 'elite';
    });
    expect(e.ward).toBe(0);
    expect(h.of('wardBreak')).toEqual([{ type: 'wardBreak', dst: e.id }]);
    expect(e.stagger).toBeGreaterThan(0);
  });

  it('breaking the Ward of a ward-linked windup makes it interruptible', () => {
    const h = staged(makeSave({ level: 5 }));
    const e = front(h);
    h.giveWindup(e, testAbility({ interruptible: false, wardLinked: true, effect: { kind: 'nova', mult: 1 } }));
    e.ward = e.maxWard = 1;
    h.hero('guardian').atkTimer = 0.01;
    h.tick(0.3);
    expect(e.windup?.interruptible).toBe(true);
    expect(h.of('windupChange')).toEqual([{ type: 'windupChange', id: e.id, interruptible: true }]);
  });
});

describe('Overdrive (cycle 2+)', () => {
  it('is unavailable before the first Rekindle', () => {
    const h = staged(makeSave({ level: 5 }));
    h.b.overdriveGauge = 100;
    expect(h.b.canOverdrive()).toBe(false);
    expect(h.b.activateOverdrive()).toBe(false);
  });

  it('fills over time, triggers at 100 and expires', () => {
    const h = staged(makeSave({ level: 5, prestige: 1 }));
    h.tick(2);
    expect(h.b.overdriveGauge).toBeCloseTo(2 * BAL.overdrivePerSecond * h.b.mods.overdriveFill, 3);
    expect(h.b.canOverdrive()).toBe(false);
    h.b.overdriveGauge = 100;
    expect(h.b.canOverdrive()).toBe(true);
    expect(h.b.activateOverdrive()).toBe(true);
    h.flush();
    expect(h.of('overdrive')).toEqual([{ type: 'overdrive', on: true }]);
    expect(h.b.overdriveGauge).toBe(0);
    expect(h.b.overdriveActive).toBe(h.b.overdriveMax);
    expect(h.b.canOverdrive()).toBe(false);
    h.tick(h.b.overdriveMax + 0.2);
    expect(h.b.overdriveActive).toBe(0);
    expect(h.of('overdrive')).toEqual([{ type: 'overdrive', on: true }, { type: 'overdrive', on: false }]);
  });

  it('boosts damage by 50% while active', () => {
    const { dealt, atk } = bashDamage((_e, h) => (h.b.overdriveActive = 5), makeSave({ level: 5, prestige: 1 }));
    expect(dealt).toBeCloseTo(atk * BAL.bashMult * 1.5, 6);
  });
});

describe('keystones', () => {
  it('Emberbond: four lit pips release an Ember Nova', () => {
    const save = makeSave({ heroes: 'all', level: 10, nodes: ['emberbond'] });
    const h = staged(save, MULTI);
    for (const k of ['ranger', 'arcanist', 'oracle'] as const) h.b.skills[k].pip = 10;
    h.giveWindup(front(h), testAbility());
    h.b.cast('guardian'); // PERFECT interrupt lights the last pip
    h.tick(0.8);
    expect(h.of('emberNova')).toHaveLength(1);
    expect(h.b.emberNovaCount).toBe(1);
    for (const k of ['guardian', 'ranger', 'arcanist', 'oracle'] as const) expect(h.b.skills[k].pip).toBe(0);
    for (const e of h.aliveEnemies()) expect(damageTo(h.log, e.id, 'emberNova')).toBeGreaterThan(0);
  });

  it('Emberbond needs the full party', () => {
    const h = staged(makeSave({ heroes: ['ranger', 'arcanist'], level: 10, nodes: ['emberbond'] }));
    h.giveWindup(front(h), testAbility());
    h.b.cast('guardian');
    h.tick(0.5);
    expect(h.of('perfect')).toHaveLength(1);
    expect(h.b.skills.guardian.pip).toBe(0);
    expect(h.of('emberNova')).toEqual([]);
  });

  it('Unbroken Vow: absorbed damage fills the vow; a full vow turns Shield Bash into Vowbreaker', () => {
    const h = staged(makeSave({ level: 10, nodes: ['unbroken_vow'] }), MULTI);
    const g = h.hero('guardian');
    const cap = g.maxHp * BAL.vowThreshold;
    g.barrier = cap * 2;
    g.barrierTime = 30;
    g.doom = { time: 0.05, total: 1, dmg: cap * 1.01 };
    h.tick(0.2);
    expect(g.vow).toBeGreaterThanOrEqual(cap);
    expect(h.of('vow')).toContainEqual({ type: 'vow', ready: true });
    const vow = g.vow;
    h.clearLog();
    h.b.cast('guardian');
    h.tick(0.3);
    expect(g.vow).toBe(0);
    expect(h.of('vow')).toContainEqual({ type: 'vow', ready: false });
    for (const e of h.aliveEnemies()) expect(damageTo(h.log, e.id, 'vow')).toBeCloseTo(vow + g.atk * 3, 3);
  });
});

describe('between waves and drops', () => {
  it('the party rests between waves', () => {
    const h = staged(makeSave({ level: 5 }));
    const g = h.hero('guardian');
    g.hp = g.maxHp * 0.5;
    h.finish(h.aliveEnemies());
    expect(h.b.phase).toBe('walk');
    expect(h.b.stage).toBe(1);
    expect(h.b.stagesCleared).toBe(1);
    expect(g.hp).toBeCloseTo(g.maxHp * (0.5 + h.b.mods.restHeal), 6);
  });

  it('elites drop embers; every kill drops gold', () => {
    const h = staged(makeSave({ heroes: 'all', level: 20 }), 4);
    const elite = h.aliveEnemies().find((e) => e.rank === 'elite')!;
    expect(elite).toBeDefined();
    h.finish(h.aliveEnemies());
    expect(h.b.eliteKills).toBe(1);
    expect(h.of('eliteDefeated')).toEqual([{ type: 'eliteDefeated', id: elite.id }]);
    expect(h.b.loot.embers).toBeGreaterThanOrEqual(BAL.eliteEmbers[0]);
    const golds = h.of('loot').filter((l) => l.kind === 'gold');
    expect(golds.length).toBe(h.b.kills);
    expect(h.b.loot.gold).toBe(golds.reduce((a, l) => a + l.amount, 0));
  });

  it('Gilded Path increases gold', () => {
    const gold = (nodes: Record<string, number>) => {
      const h = staged(makeSave({ level: 20, nodes }));
      h.finish(h.aliveEnemies());
      return h.b.loot.gold;
    };
    expect(gold({ gilded_path: 3 })).toBeGreaterThan(gold({}));
  });
});

describe('enemy abilities', () => {
  it('Doom marks heroes; Freeze stops a hero from acting', () => {
    const h = staged(makeSave({ heroes: ['ranger'], level: 30 }));
    const e = front(h);
    h.giveWindup(e, testAbility({ windup: 0.1, interruptible: false, effect: { kind: 'doom', mult: 1, count: 1, delay: 5 } }));
    h.tick(0.3);
    expect(h.b.heroes.filter((u) => u.doom).length).toBe(1);
    h.giveWindup(e, testAbility({ windup: 0.1, interruptible: false, effect: { kind: 'freeze', duration: 3, count: 1 } }));
    h.tick(0.3);
    const frozen = h.b.heroes.filter((u) => u.frozen > 0);
    expect(frozen).toHaveLength(1);
    expect(h.b.cast(frozen[0].key as 'guardian' | 'ranger')).toBe(false);
  });

  it('Summon adds summoned enemies up to the cap', () => {
    const h = staged(makeSave({ level: 30 }));
    const e = front(h);
    const before = h.aliveEnemies().length;
    const summon = testAbility({ windup: 0.1, interruptible: false, effect: { kind: 'summon', enemy: 'cinder_sapling', count: 3, max: 2 } });
    h.giveWindup(e, summon);
    h.tick(0.3);
    const summoned = h.aliveEnemies().filter((u) => u.summoned);
    expect(summoned).toHaveLength(2);
    expect(h.aliveEnemies().length).toBe(before + 2);
    expect(h.of('fx').filter((f) => f.fx === 'summon')).toHaveLength(2);
  });

  it('a purple party nova is absorbed by Barrier', () => {
    const h = staged(makeSave({ heroes: ['oracle'], level: 30 }));
    const e = front(h);
    h.giveWindup(e, testAbility({ windup: 0.5, interruptible: false, effect: { kind: 'nova', mult: 3 } }));
    h.b.cast('oracle'); // Sanctuary right before the hit
    h.flush();
    expect(h.of('perfect')).toEqual([expect.objectContaining({ hero: 'oracle' })]);
    const hp = h.b.heroes.map((u) => u.hp);
    h.tick(0.7);
    const hits = h.of('damage').filter((d) => d.tag === 'nova');
    expect(hits).toHaveLength(2);
    for (const d of hits) expect(d.absorbed).toBeCloseTo(d.amount, 6);
    expect(h.b.heroes.map((u) => u.hp)).toEqual(hp);
  });

  it('Lantern-draining enemies burn extra lantern on hit', () => {
    const where = stageWith((id) => !!ENEMIES[id]?.lanternDrainOnHit);
    expect(where).not.toBeNull();
    const h = staged(makeSave({ heroes: 'all', level: 90 }), where!.stage, where!.area);
    const eater = h.aliveEnemies().find((e) => e.def?.lanternDrainOnHit)!;
    eater.stun = 0;
    eater.atkTimer = 0.01;
    const l0 = h.b.lantern;
    h.tick(0.5);
    expect(h.of('fx').some((f) => f.fx === 'drain')).toBe(true);
    expect(l0 - h.b.lantern).toBeCloseTo(0.5 + eater.def!.lanternDrainOnHit!, 1);
  });

  it('exploding enemies damage the whole party on death', () => {
    const where = stageWith((id) => !!ENEMIES[id]?.explodeOnDeath);
    expect(where).not.toBeNull();
    const h = staged(makeSave({ heroes: 'all', level: 60 }), where!.stage, where!.area);
    const mite = h.aliveEnemies().find((e) => e.def?.explodeOnDeath)!;
    h.finish([mite]);
    const hits = h.of('damage').filter((d) => d.tag === 'explode' && h.b.heroes.some((u) => u.id === d.dst));
    expect(hits.length).toBe(h.b.heroes.length);
  });
});

describe('AUTO cast', () => {
  it('needs Battle Instinct', () => {
    const save = makeSave({ level: 5 });
    save.autoCast.guardian = true;
    const h = staged(save);
    expect(h.b.skills.guardian.auto).toBe(false);
    h.b.setAuto('guardian', true);
    expect(h.b.skills.guardian.auto).toBe(false);
    h.tick(1);
    expect(h.of('skill')).toEqual([]);
  });

  it('plain AUTO fires as soon as the skill is ready, and is never PERFECT', () => {
    const save = makeSave({ level: 5, nodes: ['battle_instinct'] });
    save.autoCast.guardian = true;
    const h = staged(save);
    expect(h.b.skills.guardian.auto).toBe(true);
    h.giveWindup(front(h), testAbility());
    h.tick(0.3);
    expect(h.of('skill')).toEqual([expect.objectContaining({ hero: 'guardian', auto: true })]);
    expect(h.of('interrupt')).toHaveLength(1);
    expect(h.of('perfect')).toEqual([]);
    h.b.setAuto('guardian', false);
    expect(h.b.skills.guardian.auto).toBe(false);
  });

  it('plain AUTO Sanctuary waits until someone is hurt', () => {
    const save = makeSave({ heroes: ['oracle'], level: 5, nodes: ['battle_instinct'] });
    save.autoCast.oracle = true;
    const h = staged(save);
    h.tick(2);
    expect(h.of('skill')).toEqual([]);
    h.hero('guardian').hp *= 0.5;
    h.tick(0.1);
    expect(h.of('skill')).toEqual([expect.objectContaining({ hero: 'oracle', auto: true })]);
  });

  it('smart AUTO (Tactical Instinct) saves Shield Bash for a windup', () => {
    const where = stageWith((id) => (ENEMIES[id]?.abilities ?? []).some((a) => a.interruptible) && ENEMIES[id].rank === 'normal');
    expect(where).not.toBeNull();
    const save = makeSave({ heroes: 'all', level: 30, prestige: 1, nodes: ['battle_instinct', 'tactical_instinct'] });
    save.autoCast.guardian = true;
    const h = staged(save, where!.stage, where!.area);
    h.tick(2);
    expect(h.of('skill')).toEqual([]);
    const e = front(h);
    h.giveWindup(e, testAbility({ windup: 3 }));
    h.tick(2.5);
    expect(h.of('skill')).toEqual([expect.objectContaining({ hero: 'guardian', auto: true })]);
    expect(h.of('interrupt')).toEqual([expect.objectContaining({ id: e.id })]);
  });
});

describe('tree and relic effects in battle', () => {
  it('Tempered Steel III: auto attacks cleave the enemy behind', () => {
    const h = staged(makeSave({ level: 5, nodes: { tempered_steel: 3 } }), MULTI);
    const [a, b] = [...h.aliveEnemies()].sort((x, y) => x.x - y.x);
    h.hero('guardian').atkTimer = 0.01;
    h.tick(0.3);
    const main = h.of('damage').find((d) => d.dst === a.id && d.tag === 'auto')!;
    const splash = h.of('damage').find((d) => d.dst === b.id && d.tag === 'splash')!;
    expect(splash.amount / main.amount).toBeCloseTo(h.b.mods.cleave, 6);
  });

  it("Hunter's Instinct: every 5th arrow applies a timed Mark", () => {
    const h = staged(makeSave({ heroes: ['ranger'], level: 5, nodes: ['hunters_instinct'] }), MULTI);
    const r = h.hero('ranger');
    r.atkTimer = 0.01;
    expect(h.until(() => r.shots >= 5, 10)).toBe(true);
    h.tick(0.3);
    const marked = h.aliveEnemies().filter((e) => e.mark > 0);
    expect(marked.length).toBeGreaterThan(0);
    for (const e of marked) expect(e.mark).toBeLessThan(Infinity);
  });

  it('Chain Lightning arcs to other enemies', () => {
    const h = staged(makeSave({ heroes: ['arcanist'], level: 5, nodes: ['chain_lightning'] }), MULTI);
    const a = h.hero('arcanist');
    a.atkTimer = 0.01;
    expect(h.until(() => a.casts >= h.b.mods.chainEvery, 15)).toBe(true);
    h.tick(0.5);
    const hit = new Set(h.of('damage').filter((d) => d.tag === 'chain').map((d) => d.dst));
    expect(hit.size).toBeGreaterThanOrEqual(2);
    expect(h.of('fx').some((f) => f.fx === 'chain')).toBe(true);
  });

  it('Combustion: a burning enemy explodes on death', () => {
    const h = staged(makeSave({ heroes: ['arcanist'], level: 5, nodes: ['combustion'] }), MULTI);
    const [a, b] = [...h.aliveEnemies()].sort((x, y) => x.x - y.x);
    a.burnStacks = 1;
    a.burnPower = 1;
    a.burnTime = 4;
    h.finish([a]);
    h.holdFire();
    h.tick(0.2);
    expect(damageTo(h.log, b.id, 'explode')).toBeGreaterThan(0);
    expect(b.burnStacks).toBeGreaterThanOrEqual(1);
  });

  it('Intercession shields an ally that drops below 20% HP', () => {
    const h = staged(makeSave({ heroes: ['oracle'], level: 10, nodes: ['intercession'] }));
    const g = h.hero('guardian');
    g.doom = { time: 0.05, total: 1, dmg: g.maxHp * 0.85 };
    h.tick(0.2);
    expect(g.alive).toBe(true);
    expect(g.barrier).toBeCloseTo(g.maxHp * 0.25 * h.b.mods.barrierMult, 6);
    expect(g.intercedeCd).toBeGreaterThan(0);
  });

  it('Phoenix Plume revives each hero once; a second total wipe ends the run', () => {
    const h = staged(makeSave({ heroes: ['ranger'], level: 10, prestige: 1, relics: ['phoenix_plume'] }));
    for (const u of h.b.heroes) u.doom = { time: 0.05, total: 1, dmg: 1e12 };
    h.tick(0.2);
    expect(h.b.heroes.every((u) => !u.alive)).toBe(true);
    expect(h.b.ended).toBe(false); // revives pending: not a wipe
    h.tick(2.2);
    expect(h.b.heroes.every((u) => u.alive && Math.abs(u.hp - u.maxHp * 0.5) < 1e-6)).toBe(true);
    expect(h.of('revive')).toHaveLength(2);
    for (const u of h.b.heroes) u.doom = { time: 0.05, total: 1, dmg: 1e12 };
    h.tick(0.5);
    expect(h.b.result?.reason).toBe('wiped');
  });
});

describe('renderer contract: party setup and layout', () => {
  it('hero units carry their save level and computed stats', () => {
    const save = makeSave({ heroes: 'all', level: { guardian: 12, ranger: 9, arcanist: 7, oracle: 5 }, nodes: { tempered_steel: 2 } });
    const h = new Harness({ save, areaId: 'ashwood' });
    expect(h.b.heroes.map((u) => u.key)).toEqual(['guardian', 'ranger', 'arcanist', 'oracle']);
    for (const u of h.b.heroes) {
      const st = heroStats(save, h.b.mods, u.key as HeroId);
      expect(u.level).toBe(save.heroes[u.key as HeroId].level);
      expect(u.maxHp).toBeCloseTo(st.maxHp, 9);
      expect(u.hp).toBe(u.maxHp);
      expect(u.atk).toBeCloseTo(st.atk, 9);
      expect(u.side).toBe('hero');
      expect(u.rank).toBe('hero');
    }
    expect(h.b.heroes.find((u) => u.key === 'arcanist')!.dmgType).toBe('magic');
    expect(h.b.heroes.find((u) => u.key === 'guardian')!.dmgType).toBe('phys');
  });

  it('every stage spawns inside the world, enemies right of the heroes, Guardian in front', () => {
    for (const area of Object.keys(AREAS) as AreaId[]) {
      for (let stage = 0; stage < 10; stage++) {
        const h = new Harness({ save: makeSave({ heroes: 'all', level: 50, prestige: 1 }), areaId: area, seed: stage + 1 });
        h.b.stage = stage;
        h.toFight();
        const where = `${area} stage ${stage + 1}`;
        expect(battleProblems(h.b), where).toEqual([]);
        const heroMaxX = Math.max(...h.b.heroes.map((u) => u.x));
        expect(h.hero('guardian').x, where).toBe(heroMaxX);
        for (const e of h.b.enemies) {
          expect(e.x, where).toBeGreaterThan(heroMaxX);
          expect(e.side).toBe('enemy');
          expect(e.rank).toBe(ENEMIES[e.key].rank);
          if (e.def?.flying) expect(e.y, `${where} flying ${e.key}`).toBeLessThan(GROUND_Y);
        }
        // boss stages: every enemy is a boss; enemy ids unique
        if (stage === 9) expect(h.b.enemies.every((e) => e.rank === 'boss')).toBe(true);
        expect(new Set([...h.b.heroes, ...h.b.enemies].map((u) => u.id)).size).toBe(h.b.heroes.length + h.b.enemies.length);
      }
    }
  });

  it('enemyAt hit-tests enemies and ignores empty ground', () => {
    const h = staged(makeSave({ level: 5 }), MULTI);
    for (const e of h.aliveEnemies()) {
      const hit = h.b.enemyAt(e.x, e.y - SIZE_BOX[e.size].h / 2);
      expect(hit?.id).toBe(e.id);
    }
    expect(h.b.enemyAt(5, 5)).toBeNull();
    expect(h.b.enemyAt(h.hero('guardian').x, h.hero('guardian').y - 5)).toBeNull();
    const e = front(h);
    e.untargetable = 3;
    expect(h.b.enemyAt(e.x, e.y - 4)?.id).not.toBe(e.id);
  });
});
