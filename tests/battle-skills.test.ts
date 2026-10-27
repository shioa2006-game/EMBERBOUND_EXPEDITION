// Active skills, cooldowns, interrupts and status effects, staged with fixed seeds.
import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance.ts';
import { Battle } from '../src/core/battle.ts';
import { computeMods, defaultMods } from '../src/core/mods.ts';
import { HERO_ORDER, type AreaId, type SaveData, type Unit } from '../src/core/types.ts';
import { AREAS } from '../src/data/areas.ts';
import { ENEMIES } from '../src/data/enemies.ts';
import { HEROES } from '../src/data/heroes.ts';
import { damageTo, Harness, stageWithAtLeast, testAbility } from './helpers/harness.ts';
import { makeSave } from './helpers/saves.ts';

/** Enter the fight of `stage` with passive enemies and heroes holding fire. */
function staged(save: SaveData, stage = 0, area: AreaId = 'ashwood', seed = 1234): Harness {
  const h = new Harness({ save, areaId: area, seed });
  h.b.stage = stage;
  h.toFight();
  h.b.routed = false;
  h.pacifyEnemies();
  h.holdFire();
  h.clearLog();
  return h;
}

const front = (h: Harness): Unit => h.aliveEnemies().reduce((a, b) => (b.x < a.x ? b : a));
const back = (h: Harness): Unit => h.aliveEnemies().reduce((a, b) => (b.x > a.x ? b : a));
const MULTI = stageWithAtLeast(AREAS.ashwood.stages, 2);

describe('casting and cooldowns', () => {
  it('a cast starts the full cooldown, which ticks down during combat', () => {
    const h = staged(makeSave({ level: 5 }));
    const s = h.b.skills.guardian;
    expect(h.b.skillReady('guardian')).toBe(true);
    expect(h.b.cast('guardian')).toBe(true);
    h.flush();
    expect(h.of('skill')).toEqual([expect.objectContaining({ hero: 'guardian', skill: HEROES.guardian.skill.id, auto: false })]);
    expect(s.cooldown).toBe(s.maxCooldown);
    expect(s.lastCast).toBe(h.b.time);
    h.tick(1);
    expect(s.cooldown).toBeCloseTo(s.maxCooldown - 1, 3);
    expect(h.b.skillReady('guardian')).toBe(false);
    expect(h.b.cast('guardian')).toBe(false);
    expect(h.until(() => s.cooldown === 0, s.maxCooldown + 1)).toBe(true);
    expect(h.b.cast('guardian')).toBe(true);
  });

  it('a cast fails outside combat, on cooldown, or when the hero is dead, frozen, stunned or absent', () => {
    const h = new Harness({ save: makeSave({ heroes: ['oracle'], level: 5 }), areaId: 'ashwood' });
    expect(h.b.phase).toBe('walk');
    expect(h.b.cast('guardian')).toBe(false);
    h.toFight();
    h.pacifyEnemies();
    h.holdFire();
    const g = h.hero('guardian');
    g.frozen = 2;
    expect(h.b.cast('guardian')).toBe(false);
    g.frozen = 0;
    g.stun = 1;
    expect(h.b.cast('guardian')).toBe(false);
    g.stun = 0;
    g.alive = false;
    expect(h.b.cast('guardian')).toBe(false);
    g.alive = true;
    expect(h.b.cast('ranger')).toBe(false); // not recruited
    expect(h.b.cast('arcanist')).toBe(false);
    for (const e of h.b.enemies) e.untargetable = 5; // nothing to hit
    expect(h.b.cast('guardian')).toBe(false);
    expect(h.b.cast('oracle')).toBe(true); // Sanctuary needs no target
    expect(h.b.cast('oracle')).toBe(false); // on cooldown
    for (const e of h.b.enemies) e.untargetable = 0;
    expect(h.b.cast('guardian')).toBe(true);
  });

  it('base cooldowns match the hero definitions', () => {
    const b = new Battle({ save: makeSave({ heroes: 'all' }), areaId: 'ashwood', seed: 1 });
    for (const hero of HERO_ORDER) expect(b.skills[hero].maxCooldown).toBe(HEROES[hero].skill.cooldown);
  });

  it('flat reductions from the tree shorten specific skills', () => {
    const save = makeSave({ heroes: 'all', nodes: ['arrow_storm', 'meteor_swarm'] });
    const m = computeMods(save);
    expect(m.arrowRainCdFlat).toBeGreaterThan(0);
    expect(m.meteorCdFlat).toBeGreaterThan(0);
    const b = new Battle({ save, areaId: 'ashwood', seed: 1 });
    expect(b.skills.ranger.maxCooldown).toBeCloseTo(HEROES.ranger.skill.cooldown - m.arrowRainCdFlat, 9);
    expect(b.skills.arcanist.maxCooldown).toBeCloseTo(HEROES.arcanist.skill.cooldown - m.meteorCdFlat, 9);
    expect(b.skills.guardian.maxCooldown).toBe(HEROES.guardian.skill.cooldown);
  });

  it('cooldownMult (Hourglass of Ash) shortens every skill', () => {
    const save = makeSave({ heroes: 'all', prestige: 1, relics: ['hourglass_ash'] });
    const m = computeMods(save);
    expect(m.cooldownMult).toBeLessThan(1);
    const b = new Battle({ save, areaId: 'ashwood', seed: 1 });
    for (const hero of HERO_ORDER) expect(b.skills[hero].maxCooldown).toBeCloseTo(Math.max(2, HEROES[hero].skill.cooldown * m.cooldownMult), 9);
  });

  it('cooldowns never drop below 2 seconds', () => {
    const mods = defaultMods();
    mods.cooldownMult = 0.01;
    mods.bashCdFlat = 50;
    const b = new Battle({ save: makeSave({ heroes: 'all' }), areaId: 'ashwood', seed: 1, mods });
    for (const hero of HERO_ORDER) expect(b.skills[hero].maxCooldown).toBe(2);
  });

  it('Overdrive doubles cooldown recovery', () => {
    const h = staged(makeSave({ level: 5 }));
    h.b.cast('guardian');
    const s = h.b.skills.guardian;
    h.b.overdriveActive = 30;
    h.tick(1);
    expect(s.cooldown).toBeCloseTo(s.maxCooldown - 2, 2);
  });
});

describe('Shield Bash', () => {
  it('interrupts an orange windup: interrupt + stagger, BREAK damage, PERFECT refund', () => {
    const h = staged(makeSave({ level: 5 }));
    const g = h.hero('guardian');
    const e = front(h);
    h.giveWindup(e, testAbility());
    expect(h.b.cast('guardian')).toBe(true);
    h.tick(0.25);
    expect(e.windup).toBeNull();
    expect(h.of('interrupt')).toEqual([{ type: 'interrupt', id: e.id, by: g.id }]);
    expect(h.of('stagger').some((x) => x.id === e.id && x.duration > 0)).toBe(true);
    expect(e.stagger).toBeGreaterThan(0);
    expect(e.stun).toBeGreaterThan(0);
    expect(damageTo(h.log, e.id, 'skill')).toBeGreaterThanOrEqual(g.atk * BAL.bashBreakMult * (1 - e.armor) * 0.999);
    expect(h.b.interrupts).toBe(1);
    expect(h.of('perfect')).toEqual([expect.objectContaining({ hero: 'guardian' })]);
    const s = h.b.skills.guardian;
    expect(s.cooldown).toBeLessThan(s.maxCooldown * (1 - BAL.perfectRefund) + 1e-6);
    expect(s.cooldown).toBeGreaterThan(s.maxCooldown * (1 - BAL.perfectRefund) - 0.5);
    // the interrupted ability never lands
    h.tick(6);
    expect(h.of('ability').filter((a) => a.id === e.id && a.name === 'Test Smash')).toEqual([]);
  });

  it('a BREAK hits far harder than a plain bash', () => {
    const plain = staged(makeSave({ level: 5 }));
    const broke = staged(makeSave({ level: 5 }));
    const p = front(plain);
    const b = front(broke);
    broke.giveWindup(b, testAbility());
    plain.b.cast('guardian');
    broke.b.cast('guardian');
    plain.tick(0.25);
    broke.tick(0.25);
    const g = plain.hero('guardian');
    const plainDmg = damageTo(plain.log, p.id, 'skill');
    expect(plainDmg).toBeCloseTo(g.atk * BAL.bashMult * (1 - p.armor), 6);
    expect(damageTo(broke.log, b.id, 'skill') / plainDmg).toBeGreaterThanOrEqual((BAL.bashBreakMult / BAL.bashMult) * 0.999);
    expect(plain.of('stun').some((x) => x.id === p.id)).toBe(true);
    expect(plain.of('interrupt')).toEqual([]);
    expect(plain.of('perfect')).toEqual([]);
  });

  it('AUTO bash interrupts too, but is never PERFECT', () => {
    const h = staged(makeSave({ level: 5 }));
    const e = front(h);
    h.giveWindup(e, testAbility());
    expect(h.b.cast('guardian', false)).toBe(true);
    h.tick(0.25);
    expect(h.of('interrupt').length).toBe(1);
    expect(h.of('perfect')).toEqual([]);
    expect(h.of('skill')[0].auto).toBe(true);
    expect(h.b.skills.guardian.cooldown).toBeCloseTo(h.b.skills.guardian.maxCooldown - 0.25, 1);
  });

  it('prefers the enemy that is winding up over the front enemy', () => {
    const h = staged(makeSave({ level: 5 }), MULTI);
    const e = back(h);
    expect(e).not.toBe(front(h));
    h.giveWindup(e, testAbility());
    h.b.cast('guardian');
    h.tick(0.25);
    expect(h.of('interrupt').map((x) => x.id)).toEqual([e.id]);
    expect(damageTo(h.log, front(h).id, 'skill')).toBe(0);
  });

  it('cannot interrupt a purple (unstoppable) windup', () => {
    const h = staged(makeSave({ level: 5 }));
    const e = front(h);
    h.giveWindup(e, testAbility({ interruptible: false, name: 'Test Nova', effect: { kind: 'nova', mult: 1 } }));
    h.b.cast('guardian');
    h.tick(0.25);
    expect(h.of('interrupt')).toEqual([]);
    expect(e.windup).not.toBeNull();
    expect(e.windup!.weakened).toBe(false);
    expect(h.of('text').some((t) => t.id === e.id && t.text === 'IMMUNE')).toBe(true);
    expect(h.of('stun').filter((x) => x.id === e.id)).toEqual([]);
    expect(h.of('perfect')).toEqual([]);
    expect(damageTo(h.log, e.id, 'skill')).toBeGreaterThan(0); // the bash still hits
  });

  it('Ascendant Guardian weakens purple windups instead', () => {
    const h = staged(makeSave({ level: 5, prestige: 1, nodes: ['ascendant_guardian'] }));
    const e = front(h);
    h.giveWindup(e, testAbility({ interruptible: false, effect: { kind: 'nova', mult: 1 } }));
    h.b.cast('guardian');
    h.tick(0.25);
    expect(h.of('interrupt')).toEqual([]);
    expect(e.windup?.weakened).toBe(true);
  });

  it('Shockwave Bash interrupts every windup at once', () => {
    const h = staged(makeSave({ level: 5, nodes: ['shockwave_bash'] }), MULTI);
    const foes = h.aliveEnemies();
    for (const e of foes) h.giveWindup(e, testAbility());
    h.b.cast('guardian');
    h.tick(0.25);
    expect(h.of('interrupt').map((x) => x.id).sort()).toEqual(foes.map((e) => e.id).sort());
    for (const e of foes) expect(e.windup).toBeNull();
  });

  it('an ignored windup lands and is recorded as missed', () => {
    const h = staged(makeSave({ level: 5 }));
    const e = front(h);
    const g = h.hero('guardian');
    h.giveWindup(e, testAbility({ windup: 0.5 }));
    h.tick(1);
    expect(h.of('ability')).toContainEqual({ type: 'ability', id: e.id, name: 'Test Smash', effect: 'strike' });
    expect(h.of('damage').some((d) => d.dst === g.id && d.big)).toBe(true);
    h.b.retreat();
    expect(h.b.result!.missed['Test Smash']).toBe(1);
  });
});

describe('statuses', () => {
  it('Burn ticks every 0.5 s for its duration, then expires', () => {
    const h = staged(makeSave({ level: 5 }));
    const e = front(h);
    e.burnStacks = 3;
    e.burnPower = 10;
    e.burnTime = BAL.burnDuration;
    e.burnTick = 0;
    h.tick(BAL.burnDuration + 1);
    const ticks = h.of('damage').filter((d) => d.dst === e.id && d.tag === 'burn');
    const expected = BAL.burnDuration / 0.5;
    expect(ticks.length).toBeGreaterThanOrEqual(expected - 1);
    expect(ticks.length).toBeLessThanOrEqual(expected + 1);
    for (const t of ticks) {
      expect(t.amount).toBeCloseTo(3 * 10 * 0.5, 6);
      expect(t.dmgType).toBe('magic');
    }
    expect(e.burnStacks).toBe(0);
    expect(e.hp).toBeCloseTo(1e9 - ticks.length * 15, 0);
  });

  it('Ember Bolts apply Burn', () => {
    const h = staged(makeSave({ heroes: ['arcanist'], level: 5 }));
    h.hero('arcanist').atkTimer = 0.01;
    h.tick(0.6);
    expect(h.aliveEnemies().some((e) => e.burnStacks >= 1)).toBe(true);
    expect(h.of('damage').some((d) => d.src === h.hero('arcanist').id && d.dmgType === 'magic')).toBe(true);
  });

  it('a focus Mark increases damage taken', () => {
    const h = staged(makeSave({ heroes: ['ranger'], level: 5 }), MULTI);
    const [a, c] = h.aliveEnemies();
    expect(h.b.setFocus(a.id)).toBe(true);
    h.flush();
    expect(a.mark).toBe(Infinity);
    expect(h.b.focusId).toBe(a.id);
    expect(h.of('mark')).toContainEqual({ type: 'mark', id: a.id, on: true });
    for (const e of [a, c]) {
      e.burnStacks = 2;
      e.burnPower = 10;
      e.burnTime = 3;
      e.burnTick = 0;
    }
    h.tick(0.6);
    const first = (u: Unit) => h.of('damage').find((d) => d.dst === u.id && d.tag === 'burn')!.amount;
    expect(first(a) / first(c)).toBeCloseTo(1 + h.b.mods.markBonus, 6);
    expect(first(a)).toBeGreaterThan(first(c));
    // clicking the focused enemy again clears the Mark
    expect(h.b.setFocus(a.id)).toBe(true);
    expect(a.mark).toBe(0);
    expect(h.b.focusId).toBeNull();
  });

  it('the whole party attacks the marked enemy', () => {
    const h = staged(makeSave({ heroes: ['ranger'], level: 5 }), MULTI);
    const target = back(h);
    h.b.setFocus(target.id);
    const g = h.hero('guardian');
    g.atkTimer = 0.01;
    h.tick(2.5);
    const hits = h.of('damage').filter((d) => d.src === g.id);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((d) => d.dst === target.id)).toBe(true);
  });

  // BUG (src/core/battle.ts killEnemy, phoenix branch): when the focused enemy is a phoenix
  // (Cinder Phoenix, The Ember Heart) its "death" goes through the early `return` for the rebirth, which
  // skips `if (this.focusId === t.id) this.focusId = null`, while afterEnemyDeathEffects() zeroes
  // `t.mark`. After the rebirth the whole party still focuses it (focusId) but it shows no Mark and takes
  // no Mark bonus; the player's next click on it then *clears* the stale focus instead of marking it.
  // Expected: either clear focusId on the rebirth death or keep/restore the Mark when it revives.
  it('a focused phoenix stays consistently marked (or unfocused) after its rebirth', () => {
    const stage = AREAS.heart.stages.findIndex((st) => st.variants.every((v) => v.some((id) => ENEMIES[id]?.phoenix)));
    expect(stage).toBeGreaterThanOrEqual(0);
    const h = staged(makeSave({ heroes: 'all', level: 40, prestige: 1 }), stage, 'heart');
    const ph = h.aliveEnemies().find((e) => e.def?.phoenix)!;
    expect(h.b.setFocus(ph.id)).toBe(true);
    h.finish([ph]); // first death -> rebirth timer
    expect(h.until(() => ph.alive, 5)).toBe(true);
    h.holdFire();
    const focused = h.b.focusId === ph.id;
    expect(focused ? ph.mark > 0 : true).toBe(true);
    // a click on the (visibly unmarked) phoenix must mark it
    h.b.setFocus(ph.id);
    expect(ph.mark).toBe(Infinity);
  });

  it('Mark needs the Ranger', () => {
    const h = staged(makeSave({ level: 5 }));
    expect(h.b.canFocus()).toBe(false);
    expect(h.b.setFocus(front(h).id)).toBe(false);
  });

  it('Barrier absorbs damage before HP, then breaks', () => {
    const h = staged(makeSave({ level: 5 }));
    const g = h.hero('guardian');
    const hp = g.hp;
    g.barrier = 100;
    g.barrierTime = 30;
    g.doom = { time: 0.05, total: 1, dmg: 60 };
    h.tick(0.2);
    expect(g.hp).toBe(hp);
    expect(g.barrier).toBeCloseTo(40, 6);
    expect(h.of('damage')).toContainEqual(expect.objectContaining({ dst: g.id, absorbed: 60, tag: 'doom' }));
    g.doom = { time: 0.05, total: 1, dmg: 100 };
    h.tick(0.2);
    expect(g.barrier).toBe(0);
    expect(g.hp).toBeCloseTo(hp - 60, 6);
    expect(h.of('barrierBreak')).toContainEqual({ type: 'barrierBreak', dst: g.id });
  });

  it('Doom detonates on its timer', () => {
    const h = staged(makeSave({ level: 5 }));
    const g = h.hero('guardian');
    const hp = g.hp;
    g.doom = { time: 0.5, total: 5, dmg: 30 };
    h.tick(0.3);
    expect(g.hp).toBe(hp);
    h.tick(0.4);
    expect(g.doom).toBeNull();
    expect(g.hp).toBeCloseTo(hp - 30, 6);
  });

  it('Sanctuary shields the party and cleanses Doom and Freeze (PERFECT)', () => {
    const h = staged(makeSave({ heroes: ['oracle'], level: 5 }));
    const g = h.hero('guardian');
    const o = h.hero('oracle');
    g.doom = { time: 2, total: 5, dmg: 1e12 };
    g.frozen = 3;
    expect(h.b.cast('oracle')).toBe(true);
    h.flush();
    expect(g.doom).toBeNull();
    expect(g.frozen).toBe(0);
    for (const u of [g, o]) {
      expect(u.barrier).toBeCloseTo(u.maxHp * BAL.sanctuaryBarrier * h.b.mods.barrierMult, 6);
      expect(u.barrierTime).toBeGreaterThan(0);
    }
    expect(h.of('perfect')).toEqual([expect.objectContaining({ hero: 'oracle' })]);
    expect(h.of('text').some((t) => t.id === g.id && t.text === 'CLEANSE')).toBe(true);
    h.tick(3);
    expect(g.alive).toBe(true);
    expect(h.of('damage').filter((d) => d.tag === 'doom')).toEqual([]);
  });

  it('Sanctuary without a reason is not PERFECT', () => {
    const h = staged(makeSave({ heroes: ['oracle'], level: 5 }));
    expect(h.b.cast('oracle')).toBe(true);
    h.flush();
    expect(h.of('perfect')).toEqual([]);
    expect(h.b.skills.oracle.cooldown).toBe(h.b.skills.oracle.maxCooldown);
  });
});
