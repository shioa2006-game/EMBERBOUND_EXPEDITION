// Currency invariants: purchases cost exactly what they quote, fail when unaffordable,
// and never drive Gold / Embers / Relic Shards negative.
import { describe, expect, it } from 'vitest';
import { levelCost, levelCostN } from '../src/core/balance.ts';
import { computeMods } from '../src/core/mods.ts';
import { Rng } from '../src/core/rng.ts';
import {
  allNodeViews,
  buyLevels,
  buyLevelsEvenly,
  buyNode,
  buyRelic,
  equipRelic,
  heroLevelCost,
  maxAffordableLevels,
  nodeView,
  recruitedHeroes,
  relicSlots,
  unequipRelic,
} from '../src/core/state.ts';
import { HERO_ORDER, type HeroId } from '../src/core/types.ts';
import { RELIC_LIST, RELICS } from '../src/data/relics.ts';
import { TREE } from '../src/data/tree.ts';
import { saveProblems } from './helpers/invariants.ts';
import { clone, makeSave } from './helpers/saves.ts';

describe('buyLevels', () => {
  it('charges exactly the quoted cost', () => {
    const s = makeSave({ gold: 1_000_000, level: 5 });
    const cost = heroLevelCost(s, 'guardian', 4);
    expect(cost).toBe(levelCostN(5, 4));
    expect(buyLevels(s, 'guardian', 4)).toBe(true);
    expect(s.gold).toBe(1_000_000 - cost);
    expect(s.heroes.guardian.level).toBe(9);
  });

  it('can spend the last coin but never goes below zero', () => {
    const s = makeSave({ level: 3 });
    s.gold = levelCost(3);
    expect(buyLevels(s, 'guardian')).toBe(true);
    expect(s.gold).toBe(0);
    expect(buyLevels(s, 'guardian')).toBe(false);
    expect(s.gold).toBe(0);
    expect(s.heroes.guardian.level).toBe(4);
  });

  it('fails without side effects when unaffordable, unrecruited or n <= 0', () => {
    const s = makeSave({ level: 10 });
    s.gold = levelCost(10) - 1;
    const before = clone(s);
    expect(buyLevels(s, 'guardian')).toBe(false);
    expect(buyLevels(s, 'ranger')).toBe(false); // not recruited
    expect(buyLevels(s, 'guardian', 0)).toBe(false);
    expect(buyLevels(s, 'guardian', -3)).toBe(false);
    expect(s).toEqual(before);
    s.gold = 1e12;
    expect(buyLevels(s, 'ranger', 1)).toBe(false);
    expect(s.heroes.ranger.level).toBe(1);
  });

  it('maxAffordableLevels is exactly the largest successful purchase', () => {
    for (const gold of [0, 31, 500, 12_345, 9_999_999]) {
      const s = makeSave({ heroes: ['ranger'], level: 7, gold });
      const n = maxAffordableLevels(s, 'ranger');
      if (n > 0) {
        const probe = clone(s);
        expect(buyLevels(probe, 'ranger', n + 1)).toBe(false);
        expect(buyLevels(s, 'ranger', n)).toBe(true);
        expect(s.gold).toBeGreaterThanOrEqual(0);
      }
      expect(buyLevels(s, 'ranger', 1)).toBe(false);
    }
  });

  it("Veteran's Wisdom makes levels cheaper", () => {
    const plain = makeSave({ level: 30 });
    const wise = makeSave({ level: 30, prestige: 1, nodes: ['veteran_wisdom'] });
    expect(computeMods(wise).levelCostMult).toBeLessThan(1);
    expect(heroLevelCost(wise, 'guardian', 10)).toBeLessThan(heroLevelCost(plain, 'guardian', 10));
  });
});

describe('buyLevelsEvenly', () => {
  it('levels the lowest hero first and spends all it can', () => {
    const s = makeSave({ heroes: ['ranger', 'arcanist'], level: { guardian: 20, ranger: 5, arcanist: 12 }, gold: 0 });
    s.gold = levelCostN(5, 7); // exactly enough to bring the ranger from 5 to 12
    const bought = buyLevelsEvenly(s);
    expect(bought).toBe(7);
    expect(s.heroes.ranger.level).toBe(12);
    expect(s.heroes.guardian.level).toBe(20);
    expect(s.gold).toBe(0);
  });

  it('never overspends and leaves less gold than any next level costs', () => {
    const rng = new Rng(4242);
    for (let i = 0; i < 60; i++) {
      const s = makeSave({
        heroes: HERO_ORDER.filter((h) => h === 'guardian' || rng.chance(0.6)),
        level: Object.fromEntries(HERO_ORDER.map((h) => [h, 1 + rng.int(60)])) as Record<HeroId, number>,
        gold: Math.floor(rng.next() * 5e6),
        prestige: rng.chance(0.3) ? 1 : 0,
      });
      if (s.prestige && rng.chance(0.5)) s.tree.veteran_wisdom = 1;
      const levelsBefore = recruitedHeroes(s).reduce((a, h) => a + s.heroes[h].level, 0);
      const goldBefore = s.gold;
      const bought = buyLevelsEvenly(s);
      const levelsAfter = recruitedHeroes(s).reduce((a, h) => a + s.heroes[h].level, 0);
      expect(levelsAfter - levelsBefore).toBe(bought);
      expect(s.gold).toBeGreaterThanOrEqual(0);
      expect(s.gold).toBeLessThanOrEqual(goldBefore);
      const mult = computeMods(s).levelCostMult;
      for (const h of recruitedHeroes(s)) expect(levelCost(s.heroes[h].level, mult)).toBeGreaterThan(s.gold);
    }
  });

  it('does nothing when broke', () => {
    const s = makeSave({ heroes: 'all' });
    expect(buyLevelsEvenly(s)).toBe(0);
    expect(s.gold).toBe(0);
  });
});

describe('buyNode', () => {
  it('charges each rank exactly', () => {
    const node = TREE.find((n) => n.id === 'tempered_steel')!;
    const total = node.costs.reduce((a, b) => a + b, 0);
    const s = makeSave({ embers: total + 5 });
    for (let r = 0; r < node.maxRank; r++) {
      const v = nodeView(s, node.id);
      expect(v.cost).toBe(node.costs[r]);
      const before = s.embers;
      expect(buyNode(s, node.id)).toBe(true);
      expect(s.embers).toBe(before - node.costs[r]);
      expect(s.tree[node.id]).toBe(r + 1);
    }
    expect(s.embers).toBe(5);
    expect(buyNode(s, node.id)).toBe(false); // maxed
    expect(s.embers).toBe(5);
  });

  it('fails without side effects when unaffordable', () => {
    const s = makeSave({ embers: 0 });
    const cost = nodeView(s, 'kindling').cost!;
    s.embers = cost - 1;
    const before = clone(s);
    expect(nodeView(s, 'kindling').affordable).toBe(false);
    expect(buyNode(s, 'kindling')).toBe(false);
    expect(s).toEqual(before);
  });

  it('fails for locked and sealed nodes even with plenty of embers', () => {
    const s = makeSave({ embers: 1e6 });
    expect(nodeView(s, 'retaliation').status).toBe('locked');
    expect(buyNode(s, 'retaliation')).toBe(false);
    expect(nodeView(s, 'fletching').status).toBe('sealed');
    expect(buyNode(s, 'fletching')).toBe(false);
    expect(nodeView(s, 'veteran_wisdom').status).toBe('sealed');
    expect(buyNode(s, 'veteran_wisdom')).toBe(false);
    expect(s.embers).toBe(1e6);
  });
});

describe('relics', () => {
  const cheapest = [...RELIC_LIST].sort((a, b) => a.cost - b.cost)[0];

  it('cannot be bought before the first Rekindle', () => {
    const s = makeSave({ shards: 1000 });
    expect(buyRelic(s, cheapest.id)).toBe(false);
    expect(s.shards).toBe(1000);
    expect(s.relicsOwned).toEqual([]);
  });

  it('charges exactly, once, and never goes negative', () => {
    const s = makeSave({ prestige: 1, shards: cheapest.cost });
    expect(buyRelic(s, 'not_a_relic')).toBe(false);
    expect(buyRelic(s, cheapest.id)).toBe(true);
    expect(s.shards).toBe(0);
    expect(s.relicsOwned).toEqual([cheapest.id]);
    s.shards = 100;
    expect(buyRelic(s, cheapest.id)).toBe(false); // already owned
    expect(s.shards).toBe(100);
    const pricey = RELIC_LIST.find((r) => r.id !== cheapest.id)!;
    s.shards = pricey.cost - 1;
    expect(buyRelic(s, pricey.id)).toBe(false);
    expect(s.shards).toBe(pricey.cost - 1);
  });

  it('equip respects ownership, duplicates and slot count', () => {
    const s = makeSave({ prestige: 1 });
    s.relicsOwned = RELIC_LIST.map((r) => r.id);
    const slots = relicSlots(s);
    expect(slots).toBeGreaterThanOrEqual(1);
    expect(equipRelic(s, 'not_a_relic')).toBe(false);
    for (let i = 0; i < slots; i++) expect(equipRelic(s, RELIC_LIST[i].id)).toBe(true);
    expect(equipRelic(s, RELIC_LIST[0].id)).toBe(false); // duplicate
    expect(equipRelic(s, RELIC_LIST[slots].id)).toBe(false); // no free slot
    expect(s.relicsEquipped.length).toBe(slots);
    expect(unequipRelic(s, RELIC_LIST[0].id)).toBe(true);
    expect(unequipRelic(s, RELIC_LIST[0].id)).toBe(false);
    expect(equipRelic(s, RELIC_LIST[slots].id)).toBe(true);
    const unowned = makeSave({ prestige: 1 });
    expect(equipRelic(unowned, RELIC_LIST[0].id)).toBe(false);
  });

  it('Relic Socket adds a slot', () => {
    const s = makeSave({ prestige: 1 });
    const base = relicSlots(s);
    s.tree.relic_socket = 1;
    expect(relicSlots(s)).toBe(base + 1);
  });
});

describe('random purchase fuzz', () => {
  it('quoted prices are charged exactly and currencies never go negative', () => {
    const rng = new Rng(9001);
    const relicIds = RELIC_LIST.map((r) => r.id);
    for (let game = 0; game < 25; game++) {
      const s = makeSave({
        heroes: HERO_ORDER.filter((h) => h === 'guardian' || rng.chance(0.7)),
        prestige: rng.int(3),
        gold: Math.floor(rng.next() * 2e5),
        embers: rng.int(120),
        shards: rng.int(20),
      });
      for (let op = 0; op < 120; op++) {
        const roll = rng.int(6);
        if (roll === 0) {
          const h = rng.pick(HERO_ORDER);
          const n = 1 + rng.int(5);
          const recruited = s.heroes[h].recruited;
          const quote = recruited ? heroLevelCost(s, h, n) : Infinity;
          const g = s.gold;
          const ok = buyLevels(s, h, n);
          expect(ok).toBe(recruited && quote <= g);
          expect(s.gold).toBe(ok ? g - quote : g);
        } else if (roll === 1) {
          buyLevelsEvenly(s);
        } else if (roll === 2) {
          const views = allNodeViews(s);
          const v = rng.pick(views);
          const e = s.embers;
          const ok = buyNode(s, v.node.id);
          expect(ok).toBe(v.affordable);
          expect(s.embers).toBe(ok ? e - v.cost! : e);
        } else if (roll === 3) {
          const id = rng.pick(relicIds);
          const sh = s.shards;
          const ok = buyRelic(s, id);
          expect(s.shards).toBe(ok ? sh - RELICS[id].cost : sh);
        } else if (roll === 4) {
          if (s.relicsOwned.length) equipRelic(s, rng.pick(s.relicsOwned));
        } else {
          s.gold += rng.int(5000);
          s.embers += rng.int(10);
          s.shards += rng.int(3);
        }
        expect(s.gold).toBeGreaterThanOrEqual(0);
        expect(s.embers).toBeGreaterThanOrEqual(0);
        expect(s.shards).toBeGreaterThanOrEqual(0);
      }
      expect(saveProblems(s)).toEqual([]);
    }
  });
});
