// Vows (誓約): taken at a Rekindle, binding one cycle, paid back in Relic Shards at the Rekindle that ends it.
import { describe, expect, it } from 'vitest';
import { Battle } from '../src/core/battle.ts';
import { activeVows, computeMods } from '../src/core/mods.ts';
import { abandonVow, buyLevelsEvenly, canTakeVow, expeditionParty, rekindle, rekindleShards, vowShards } from '../src/core/state.ts';
import type { SaveData } from '../src/core/types.ts';
import { VOWS } from '../src/data/vows.ts';
import { Harness, testAbility } from './helpers/harness.ts';
import { saveProblems } from './helpers/invariants.ts';
import { makeSave } from './helpers/saves.ts';

/** A save that can Rekindle (The Hollow cleared) in `prestige`. */
function ready(prestige = 0, vows: string[] = []): SaveData {
  const s = makeSave({ heroes: 'all', level: 30, prestige });
  s.areas.hollow.cleared = true;
  s.vows = vows;
  return s;
}

describe('taking vows at a Rekindle', () => {
  it('binds the next cycle only, and never before the first Rekindle', () => {
    const s = ready(0, ['steel']);
    expect(activeVows(s)).toEqual([]); // cycle 1 has no vows, whatever the save says
    expect(computeMods(s).enemyHpMultElite).toBe(1);
    rekindle(s, ['steel', 'fury']);
    expect(s.vows).toEqual(['steel', 'fury']);
    const m = computeMods(s);
    expect(m.enemyHpMultElite).toBe(1.5);
    expect(m.orangeDmgMult).toBe(3);
    expect(m.enemyHpMultNormal).toBe(1);
    expect(saveProblems(s)).toEqual([]);
  });

  it('drops unknown vows and vows that cannot be taken; the next Rekindle clears them unless retaken', () => {
    const s = ready(1);
    s.heroes.oracle.recruited = false;
    expect(canTakeVow(s, 'lone')).toBe(false);
    expect(canTakeVow(s, 'horde')).toBe(true);
    rekindle(s, ['lone', 'nope', 'horde']);
    expect(s.vows).toEqual(['horde']);
    s.areas.hollow.cleared = true;
    rekindle(s);
    expect(s.vows).toEqual([]);
  });
});

describe('vow rewards and records', () => {
  it('pays the Shards of the vows kept through the cycle with the Rekindle that ends it', () => {
    const plain = ready(1);
    const vowed = ready(1, ['steel', 'fury']);
    expect(vowShards(vowed)).toBe(VOWS.steel.shards + VOWS.fury.shards);
    expect(rekindleShards(vowed)).toBe(rekindleShards(plain) + vowShards(vowed));
    const shards = vowed.shards;
    expect(rekindle(vowed)).toBe(rekindleShards(plain) + VOWS.steel.shards + VOWS.fury.shards);
    expect(vowed.shards).toBe(shards + rekindleShards(plain) + 6);
  });

  it('records the fastest cycle kept under each vow and counts kept vows', () => {
    const s = ready(1, ['steel']);
    s.cycleTime = 1500;
    rekindle(s, ['steel', 'horde']);
    expect(s.vowBest).toEqual({ steel: 1500 });
    expect(s.stats.vowsKept).toBe(1);
    s.areas.hollow.cleared = true;
    s.cycleTime = 1800;
    rekindle(s);
    expect(s.vowBest).toEqual({ steel: 1500, horde: 1800 }); // a slower steel cycle does not replace the record
    expect(s.stats.vowsKept).toBe(3);
  });

  it('abandoning a vow lifts its rule at once and forfeits its Shards', () => {
    const s = ready(1, ['steel', 'horde']);
    const before = rekindleShards(s);
    expect(abandonVow(s, 'steel')).toBe(true);
    expect(s.vows).toEqual(['horde']);
    expect(computeMods(s).enemyHpMultElite).toBe(1);
    expect(rekindleShards(s)).toBe(before - VOWS.steel.shards);
    expect(abandonVow(s, 'steel')).toBe(false);
    s.cycleTime = 900;
    rekindle(s);
    expect(s.vowBest).toEqual({ horde: 900 });
  });
});

describe('vow rules in battle', () => {
  it('the lone vow leaves the Oracle at camp: no Oracle in the party, no gold spent on her', () => {
    const s = ready(1, ['lone']);
    expect(expeditionParty(s)).toEqual(['guardian', 'ranger', 'arcanist']);
    const b = new Battle({ save: s, areaId: 'ashwood', seed: 1 });
    expect(b.party).not.toContain('oracle');
    expect(b.heroes.some((h) => h.key === 'oracle')).toBe(false);
    s.gold = 1e9;
    buyLevelsEvenly(s);
    expect(s.heroes.oracle.level).toBe(30);
    expect(s.heroes.guardian.level).toBeGreaterThan(30);
  });

  it('steel and horde raise elite/boss and normal enemy HP', () => {
    const at = (vows: string[], stage: number) => {
      const h = new Harness({ save: ready(1, vows), areaId: 'ashwood', seed: 7 });
      h.b.stage = stage;
      h.toFight();
      return h.b.enemies.map((e) => ({ rank: e.rank, hp: e.maxHp }));
    };
    const ranks = new Set<string>();
    for (const stage of [0, 4, 9]) {
      const base = at([], stage);
      const steel = at(['steel'], stage);
      const horde = at(['horde'], stage);
      expect(steel.length).toBe(base.length);
      base.forEach((e, i) => {
        ranks.add(e.rank!);
        expect(steel[i].hp).toBeCloseTo(e.hp * (e.rank === 'normal' ? 1 : 1.5), 6);
        expect(horde[i].hp).toBeCloseTo(e.hp * (e.rank === 'normal' ? 1.8 : 1), 6);
      });
    }
    expect([...ranks].sort()).toEqual(['boss', 'elite', 'normal']);
  });

  it('fury triples orange (interruptible) strikes and leaves purple ones alone', () => {
    const hit = (vows: string[], interruptible: boolean) => {
      const h = new Harness({ save: ready(1, vows), areaId: 'ashwood', seed: 3 });
      h.toFight();
      h.b.routed = false;
      h.pacifyEnemies();
      h.holdFire();
      const g = h.hero('guardian');
      g.maxHp = g.hp = 1e12;
      const e = h.aliveEnemies()[0];
      h.clearLog();
      h.giveWindup(e, testAbility({ interruptible, effect: { kind: 'strike', mult: 3, target: 'front' } }), 0.01);
      h.tick(1);
      return h.of('damage').filter((d) => d.dst === g.id && d.src === e.id).reduce((a, d) => a + d.amount, 0);
    };
    expect(hit(['fury'], true) / hit([], true)).toBeCloseTo(3, 1);
    expect(hit(['fury'], false) / hit([], false)).toBeCloseTo(1, 1);
  });
});
