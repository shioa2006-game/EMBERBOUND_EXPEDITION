import { describe, expect, it } from 'vitest';
import { BAL } from '../src/core/balance.ts';
import { AREA_ORDER, HERO_ORDER, type AbilityDef, type EnemyDef } from '../src/core/types.ts';
import { AREA_SHARDS, AREAS } from '../src/data/areas.ts';
import { ENEMIES, ENEMY_LIST } from '../src/data/enemies.ts';
import { HEROES } from '../src/data/heroes.ts';
import { RELIC_LIST, RELICS } from '../src/data/relics.ts';

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const bossIds = (a: (typeof AREAS)[keyof typeof AREAS]): string[] => (Array.isArray(a.bossId) ? a.bossId : [a.bossId]);

/** Every enemy id that can appear in battle: stage rosters plus summons. */
function reachableEnemies(): Set<string> {
  const ids = new Set<string>();
  for (const a of AREA_ORDER) for (const st of AREAS[a].stages) for (const v of st.variants) v.forEach((id) => ids.add(id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...ids]) {
      for (const ab of ENEMIES[id]?.abilities ?? []) {
        const fx = ab.effect;
        const extra = fx.kind === 'summon' ? fx.enemy : fx.kind === 'submerge' ? fx.summon?.enemy : undefined;
        if (extra && !ids.has(extra)) {
          ids.add(extra);
          grew = true;
        }
      }
    }
  }
  return ids;
}

describe('areas', () => {
  it('cover AREA_ORDER with matching ids and indices', () => {
    expect(Object.keys(AREAS).sort()).toEqual([...AREA_ORDER].sort());
    AREA_ORDER.forEach((id, i) => {
      expect(AREAS[id].id).toBe(id);
      expect(AREAS[id].index).toBe(i);
      expect(AREA_SHARDS[id]).toBeGreaterThan(0);
    });
  });

  it.each([...AREA_ORDER])('%s has 10 stages of known enemies', (id) => {
    const a = AREAS[id];
    expect(a.stages.length).toBe(10);
    a.stages.forEach((st, i) => {
      expect(st.variants.length, `stage ${i + 1}`).toBeGreaterThan(0);
      for (const v of st.variants) {
        expect(v.length, `stage ${i + 1} empty variant`).toBeGreaterThan(0);
        expect(v.length, `stage ${i + 1} too many enemies for the formation`).toBeLessThanOrEqual(6);
        for (const e of v) expect(has(ENEMIES, e), `stage ${i + 1}: unknown enemy ${e}`).toBe(true);
      }
    });
  });

  it.each([...AREA_ORDER])('%s: stage 5 has an elite, stage 10 is the boss, no bosses elsewhere', (id) => {
    const a = AREAS[id];
    for (const v of a.stages[4].variants) expect(v.some((e) => ENEMIES[e].rank === 'elite'), `stage 5 variant ${v.join(',')}`).toBe(true);
    for (const v of a.stages[9].variants) {
      expect(v.every((e) => ENEMIES[e].rank === 'boss'), `stage 10 variant ${v.join(',')}`).toBe(true);
      expect([...v].sort()).toEqual([...bossIds(a)].sort());
    }
    a.stages.slice(0, 9).forEach((st, i) => {
      for (const v of st.variants) expect(v.some((e) => ENEMIES[e].rank === 'boss'), `boss in stage ${i + 1}`).toBe(false);
    });
    expect(a.bossName.length).toBeGreaterThan(0);
    expect(a.flare).toBeGreaterThan(0);
    expect(a.flare).toBeLessThanOrEqual(BAL.lanternBase);
  });

  it('recruits each non-starting hero exactly once, in order', () => {
    const recruits = AREA_ORDER.map((a) => AREAS[a].recruit).filter(Boolean);
    expect(recruits).toEqual(HERO_ORDER.slice(1));
  });

  it('only The Ember Heart requires prestige; first-clear embers grow with depth', () => {
    for (const a of AREA_ORDER) expect(AREAS[a].requiresPrestige ?? 0).toBe(a === 'heart' ? 1 : 0);
    for (let i = 1; i < AREA_ORDER.length; i++) {
      expect(AREAS[AREA_ORDER[i]].firstClearEmbers).toBeGreaterThanOrEqual(AREAS[AREA_ORDER[i - 1]].firstClearEmbers);
      // difficulty (global stage index) of the first stage and of the boss never goes down area to area
      const s = (id: (typeof AREA_ORDER)[number], stage: number) => AREAS[id].index * 10 + AREAS[id].stageOffset + stage * (AREAS[id].stageScale ?? 1);
      expect(s(AREA_ORDER[i], 0)).toBeGreaterThan(s(AREA_ORDER[i - 1], 0));
      expect(s(AREA_ORDER[i], 9)).toBeGreaterThan(s(AREA_ORDER[i - 1], 9));
    }
  });

  it('per-area ember tables cover every area', () => {
    expect(BAL.eliteEmbers.length).toBeGreaterThanOrEqual(AREA_ORDER.length);
    expect(BAL.bossEmbers.length).toBeGreaterThanOrEqual(AREA_ORDER.length);
  });

  it('The Ember Heart final is the four-boss shadow party', () => {
    expect(bossIds(AREAS.heart).length).toBe(4);
  });
});

describe('enemies', () => {
  it('have unique ids matching the lookup table', () => {
    expect(new Set(ENEMY_LIST.map((e) => e.id)).size).toBe(ENEMY_LIST.length);
    for (const e of ENEMY_LIST) expect(ENEMIES[e.id]).toBe(e);
  });

  it.each(ENEMY_LIST.map((e) => [e.id, e] as const))('%s has sane stats', (_id, e: EnemyDef) => {
    for (const k of ['hp', 'dmg', 'gold', 'interval'] as const) {
      expect(Number.isFinite(e[k]) && e[k] > 0, `${k}=${e[k]}`).toBe(true);
    }
    if (e.armor !== undefined) {
      expect(e.armor).toBeGreaterThanOrEqual(0);
      expect(e.armor).toBeLessThan(1);
    }
    if (e.ward !== undefined) expect(e.ward).toBeGreaterThan(0);
    if (e.protector !== undefined) expect(e.protector).toBeLessThan(1);
    expect(e.sprite.length).toBeGreaterThan(0);
    expect(['small', 'medium', 'large', 'huge']).toContain(e.size);
    expect(['front', 'backline', 'lowest', 'random']).toContain(e.target);
  });

  it.each(ENEMY_LIST.map((e) => [e.id, e] as const))('%s: abilities reference existing abilities and enemies', (_id, e: EnemyDef) => {
    const abil: AbilityDef[] = e.abilities ?? [];
    const ids = new Set(abil.map((a) => a.id));
    expect(ids.size, 'duplicate ability ids').toBe(abil.length);
    if (e.opener) expect(ids.has(e.opener), `opener ${e.opener}`).toBe(true);
    if (e.phaseAbility) expect(ids.has(e.phaseAbility), `phaseAbility ${e.phaseAbility}`).toBe(true);
    const referenced = new Set([e.opener, e.phaseAbility].filter(Boolean));
    for (const a of abil) {
      expect(a.cooldown).toBeGreaterThan(0);
      expect(a.windup).toBeGreaterThanOrEqual(0);
      const fx = a.effect;
      if (fx.kind === 'submerge') {
        if (fx.then) {
          expect(ids.has(fx.then), `${a.id}.then -> ${fx.then}`).toBe(true);
          referenced.add(fx.then);
        }
        if (fx.summon) expect(has(ENEMIES, fx.summon.enemy), fx.summon.enemy).toBe(true);
      }
      if (fx.kind === 'summon') expect(has(ENEMIES, fx.enemy), fx.enemy).toBe(true);
      if ((fx.kind === 'strike' || fx.kind === 'nova') && fx.perAlly) expect(has(ENEMIES, fx.perAlly.enemy), fx.perAlly.enemy).toBe(true);
      if (a.minPhase !== undefined || a.maxPhase !== undefined) {
        const phases = (e.phases?.length ?? 0) + 1;
        expect(a.minPhase ?? 0, `${a.id} minPhase beyond the last phase`).toBeLessThan(phases);
        expect(a.minPhase ?? 0).toBeLessThanOrEqual(a.maxPhase ?? 99);
      }
      if (a.wardLinked) expect(a.interruptible, 'wardLinked windups start purple').toBe(false);
    }
    // manual abilities never fire on their own: something must start them
    for (const a of abil.filter((x) => x.manual)) expect(referenced.has(a.id), `manual ability ${a.id} is never started`).toBe(true);
  });

  it('boss phases descend and have a banner each', () => {
    for (const e of ENEMY_LIST.filter((x) => x.phases)) {
      const p = e.phases!;
      for (let i = 0; i < p.length; i++) {
        expect(p[i]).toBeGreaterThan(0);
        expect(p[i]).toBeLessThan(1);
        if (i > 0) expect(p[i]).toBeLessThan(p[i - 1]);
      }
      expect(e.phaseText?.length, e.id).toBe(p.length);
    }
  });

  it('every defined enemy can actually appear', () => {
    const reach = reachableEnemies();
    const orphan = ENEMY_LIST.map((e) => e.id).filter((id) => !reach.has(id));
    expect(orphan).toEqual([]);
  });

  it('area bosses have the boss rank', () => {
    for (const a of AREA_ORDER) for (const b of bossIds(AREAS[a])) expect(ENEMIES[b].rank).toBe('boss');
  });
});

describe('heroes', () => {
  it('define every class with a distinct hotkey 1-4', () => {
    expect(Object.keys(HEROES).sort()).toEqual([...HERO_ORDER].sort());
    expect(HERO_ORDER.map((h) => HEROES[h].skill.key)).toEqual(['1', '2', '3', '4']);
    for (const h of HERO_ORDER) {
      const d = HEROES[h];
      expect(d.id).toBe(h);
      for (const v of [d.hp, d.atk, d.interval, d.critMult, d.skill.cooldown]) expect(v).toBeGreaterThan(0);
      expect(d.critChance).toBeGreaterThanOrEqual(0);
      expect(d.critChance).toBeLessThanOrEqual(1);
    }
  });
});

describe('relics', () => {
  it('have unique ids, positive costs and relic_* icons', () => {
    expect(new Set(RELIC_LIST.map((r) => r.id)).size).toBe(RELIC_LIST.length);
    for (const r of RELIC_LIST) {
      expect(RELICS[r.id]).toBe(r);
      expect(r.icon, r.id).toMatch(/^relic_[a-z0-9_]+$/);
      expect(Number.isInteger(r.cost) && r.cost > 0, r.id).toBe(true);
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.desc.length).toBeGreaterThan(0);
    }
  });
});
