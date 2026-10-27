import { describe, expect, it } from 'vitest';
import { computeMods, defaultMods } from '../src/core/mods.ts';
import { allNodeViews, buyNode, nodeView, ownedSynergies, prereqsMet } from '../src/core/state.ts';
import { HERO_ORDER, type Mods } from '../src/core/types.ts';
import { SYNERGY_IDS, TREE, TREE_BY_ID } from '../src/data/tree.ts';
import { nonFinitePaths } from './helpers/invariants.ts';
import { makeSave } from './helpers/saves.ts';

const applied = (id: string, rank: number): Mods => {
  const m = defaultMods();
  TREE_BY_ID[id].apply(m, rank);
  return m;
};

describe('tree data integrity', () => {
  it('has unique ids and a single root', () => {
    expect(new Set(TREE.map((n) => n.id)).size).toBe(TREE.length);
    expect(TREE.filter((n) => n.kind === 'root').map((n) => n.id)).toEqual(['core']);
    expect(Object.keys(TREE_BY_ID).length).toBe(TREE.length);
  });

  it.each(TREE.map((n) => [n.id, n] as const))('%s: costs match ranks and are positive', (_id, n) => {
    expect(n.maxRank).toBeGreaterThanOrEqual(1);
    expect(n.costs.length).toBe(n.maxRank);
    for (const c of n.costs) {
      expect(Number.isInteger(c)).toBe(true);
      if (n.id !== 'core') expect(c).toBeGreaterThan(0);
    }
    expect(n.name.length).toBeGreaterThan(0);
    expect(n.desc.length).toBeGreaterThan(0);
  });

  it('every requirement references an existing node (and never itself)', () => {
    for (const n of TREE) {
      for (const id of [...(n.req.anyOf ?? []), ...(n.req.allOf ?? [])]) {
        expect(TREE_BY_ID[id], `${n.id} requires unknown node ${id}`).toBeDefined();
        expect(id).not.toBe(n.id);
      }
      for (const h of n.req.hero ?? []) expect(HERO_ORDER).toContain(h);
    }
  });

  it('synergy nodes declare their class pair and build family', () => {
    for (const n of TREE.filter((x) => x.branch === 'synergy')) {
      expect(n.pair?.length, n.id).toBeGreaterThanOrEqual(2);
      expect(n.build, n.id).toBeTruthy();
    }
    expect(SYNERGY_IDS.length).toBeGreaterThanOrEqual(TREE_BY_ID.emberbond.req.synergyCount ?? 0);
  });

  it('rekindled nodes require prestige', () => {
    for (const n of TREE.filter((x) => x.branch === 'rekindled')) expect(n.req.prestige, n.id).toBeGreaterThanOrEqual(1);
  });

  it('layout fits the 1200 x 800 canvas', () => {
    for (const n of TREE) {
      expect(n.x, n.id).toBeGreaterThanOrEqual(0);
      expect(n.x, n.id).toBeLessThanOrEqual(1200);
      expect(n.y, n.id).toBeGreaterThanOrEqual(0);
      expect(n.y, n.id).toBeLessThanOrEqual(800);
    }
  });

  it('no two nodes are closer than 50 px', () => {
    const close: string[] = [];
    for (let i = 0; i < TREE.length; i++) {
      for (let j = i + 1; j < TREE.length; j++) {
        const a = TREE[i];
        const b = TREE[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 50) close.push(`${a.id} <-> ${b.id}: ${d.toFixed(1)}px`);
      }
    }
    expect(close).toEqual([]);
  });

  it('every node can be maxed with unlimited embers, the full party and prestige', () => {
    const s = makeSave({ heroes: 'all', prestige: 1, embers: 1e9 });
    for (let guard = 0; guard < 1000; guard++) {
      const v = allNodeViews(s).find((x) => x.affordable);
      if (!v) break;
      expect(buyNode(s, v.node.id)).toBe(true);
    }
    const notMaxed = TREE.filter((n) => (s.tree[n.id] ?? 0) < n.maxRank).map((n) => `${n.id}:${nodeView(s, n.id).status}`);
    expect(notMaxed).toEqual([]);
  });
});

describe('node effects (Mods)', () => {
  it.each(TREE.filter((n) => n.id !== 'core').map((n) => [n.id] as const))('%s changes at least one Mods field at every rank', (id) => {
    const node = TREE_BY_ID[id];
    const base = defaultMods();
    for (let r = 1; r <= node.maxRank; r++) {
      const m = applied(id, r);
      expect(m, `rank ${r} has no effect`).not.toEqual(base);
      if (r > 1) expect(m, `rank ${r} is identical to rank ${r - 1}`).not.toEqual(applied(id, r - 1));
      expect(nonFinitePaths(m)).toEqual([]);
    }
  });

  it('core has no effect', () => {
    expect(applied('core', 1)).toEqual(defaultMods());
  });

  it('Tempered Steel rank 3: Guardian attack x1.75 and a 40% cleave (cleave only at rank 3)', () => {
    const m = computeMods(makeSave({ nodes: { tempered_steel: 3 } }));
    expect(m.atkMult.guardian).toBeCloseTo(1.75, 9);
    expect(m.hpMult.guardian).toBeGreaterThan(1);
    expect(m.cleave).toBeCloseTo(0.4, 9);
    expect(m.atkMult.ranger).toBe(1);
    const r2 = computeMods(makeSave({ nodes: { tempered_steel: 2 } }));
    expect(r2.atkMult.guardian).toBeGreaterThan(1);
    expect(r2.atkMult.guardian).toBeLessThan(m.atkMult.guardian);
    expect(r2.cleave).toBe(0);
  });

  it('a fully bought tree yields finite modifiers', () => {
    const s = makeSave({ heroes: 'all', prestige: 2, nodes: TREE.map((n) => n.id) });
    expect(nonFinitePaths(computeMods(s))).toEqual([]);
  });

  it('relics only apply after Rekindle, and only in available slots', () => {
    const p0 = makeSave({ relics: ['gale_quiver'] });
    expect(computeMods(p0).atkSpeedMult).toBe(1);
    const p1 = makeSave({ prestige: 1, relics: ['gale_quiver'] });
    expect(computeMods(p1).atkSpeedMult).toBeGreaterThan(1);
    const crowded = makeSave({ prestige: 1, relics: ['lantern_eternity', 'gilded_idol', 'gale_quiver'] });
    expect(computeMods(crowded).relicSlots).toBe(2);
    expect(computeMods(crowded).atkSpeedMult).toBe(1); // third relic is not in a slot
  });

  it('prestige grants Overdrive, relic slots and Ember Memory', () => {
    expect(computeMods(makeSave()).overdrive).toBe(false);
    expect(computeMods(makeSave()).memoryMult).toBe(1);
    const s = makeSave({ prestige: 1 });
    s.peakLevels = { guardian: 50, ranger: 40, arcanist: 30, oracle: 20 };
    const m = computeMods(s);
    expect(m.overdrive).toBe(true);
    expect(m.relicSlots).toBe(2);
    expect(m.memoryMult).toBeGreaterThan(1);
    s.peakLevels.guardian = 80;
    expect(computeMods(s).memoryMult).toBeGreaterThan(m.memoryMult);
    expect(computeMods(makeSave({ prestige: 2 })).relicSlots).toBe(3);
  });
});

describe('requirements and node status', () => {
  it('core is owned and maxed from the start', () => {
    expect(nodeView(makeSave(), 'core').status).toBe('maxed');
  });

  it('anyOf: one listed node is enough', () => {
    const s = makeSave({ embers: 999 });
    expect(nodeView(s, 'retaliation').status).toBe('locked');
    s.tree.tempered_steel = 1;
    expect(nodeView(s, 'retaliation').status).toBe('available');
    const a = makeSave({ nodes: { tempered_steel: 1, retaliation: 1, shield_wall: 1 } });
    const b = makeSave({ nodes: { tempered_steel: 1, shockwave_bash: 1 } });
    expect(nodeView(makeSave({ nodes: { tempered_steel: 1 } }), 'iron_resolve').status).toBe('locked');
    expect(nodeView(a, 'iron_resolve').status).toBe('available');
    expect(nodeView(b, 'iron_resolve').status).toBe('available');
  });

  it('allOf: every listed node is required', () => {
    const s = makeSave({ heroes: ['ranger'], nodes: { shield_wall: 1 } });
    expect(nodeView(s, 'covering_fire').status).toBe('locked');
    s.tree.shield_wall = 0;
    s.tree.hunters_instinct = 1;
    expect(nodeView(s, 'covering_fire').status).toBe('locked');
    s.tree.shield_wall = 1;
    expect(prereqsMet(s, TREE_BY_ID.covering_fire)).toBe(true);
    expect(nodeView(s, 'covering_fire').status).toBe('available');
  });

  it('synergyCount: Emberbond needs enough owned synergies', () => {
    const need = TREE_BY_ID.emberbond.req.synergyCount!;
    const s = makeSave({ heroes: 'all' });
    for (let i = 0; i < need - 1; i++) s.tree[SYNERGY_IDS[i]] = 1;
    expect(ownedSynergies(s)).toBe(need - 1);
    expect(nodeView(s, 'emberbond').status).toBe('locked');
    s.tree[SYNERGY_IDS[need - 1]] = 1;
    expect(nodeView(s, 'emberbond').status).toBe('available');
  });

  it('hero: class branches are sealed until the hero joins', () => {
    const s = makeSave();
    const v = nodeView(s, 'fletching');
    expect(v.status).toBe('sealed');
    expect(v.sealReason).toContain('Ranger');
    expect(v.affordable).toBe(false);
    s.heroes.ranger.recruited = true;
    expect(nodeView(s, 'fletching').status).toBe('available');
    expect(nodeView(s, 'fletching').sealReason).toBeNull();
  });

  it('hero: synergies are sealed until both classes joined; Emberbond needs all four', () => {
    const s = makeSave();
    expect(nodeView(s, 'covering_fire').status).toBe('sealed');
    s.heroes.ranger.recruited = true;
    expect(nodeView(s, 'covering_fire').status).toBe('locked');
    s.heroes.arcanist.recruited = true;
    expect(nodeView(s, 'emberbond').status).toBe('sealed');
    s.heroes.oracle.recruited = true;
    expect(nodeView(s, 'emberbond').status).toBe('locked');
  });

  it('prestige: rekindled nodes are sealed before the first Rekindle', () => {
    const s = makeSave({ embers: 999 });
    const v = nodeView(s, 'veteran_wisdom');
    expect(v.status).toBe('sealed');
    expect(v.sealReason).toBeTruthy();
    s.prestige = 1;
    expect(nodeView(s, 'veteran_wisdom').status).toBe('available');
    // prestige + anyOf: sealed first, then locked until the prerequisite is owned
    s.prestige = 0;
    expect(nodeView(s, 'tactical_instinct').status).toBe('sealed');
    s.prestige = 1;
    expect(nodeView(s, 'tactical_instinct').status).toBe('locked');
    s.tree.battle_instinct = 1;
    expect(nodeView(s, 'tactical_instinct').status).toBe('available');
  });

  it('sealed takes priority over locked', () => {
    const s = makeSave(); // ranger not recruited, Deadeye prerequisites missing
    expect(nodeView(s, 'deadeye').status).toBe('sealed');
    s.heroes.ranger.recruited = true;
    expect(nodeView(s, 'deadeye').status).toBe('locked');
  });

  it('available -> upgradable -> maxed, cost null at max rank', () => {
    const node = TREE_BY_ID.kindling;
    const s = makeSave({ embers: node.costs.reduce((a, b) => a + b, 0) });
    expect(nodeView(s, 'kindling').status).toBe('available');
    buyNode(s, 'kindling');
    if (node.maxRank > 1) expect(nodeView(s, 'kindling').status).toBe('upgradable');
    while (buyNode(s, 'kindling'));
    const v = nodeView(s, 'kindling');
    expect(v.rank).toBe(node.maxRank);
    expect(v.status).toBe('maxed');
    expect(v.cost).toBeNull();
    expect(v.affordable).toBe(false);
  });

  it('affordable reflects current embers', () => {
    const s = makeSave();
    const cost = nodeView(s, 'kindling').cost!;
    s.embers = cost - 1;
    expect(nodeView(s, 'kindling').affordable).toBe(false);
    s.embers = cost;
    expect(nodeView(s, 'kindling').affordable).toBe(true);
  });
});
