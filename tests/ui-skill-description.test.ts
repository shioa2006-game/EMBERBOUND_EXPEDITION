import { describe, expect, it } from 'vitest';
import { skillDescription } from '../src/ui/skill-description.ts';
import { swapRelic } from '../src/core/state.ts';
import { makeSave } from './helpers/saves.ts';
import { Harness } from './helpers/harness.ts';

describe('current skill descriptions agree with combat', () => {
  it.each([ [[], 10], [['arrow_storm'], 16], [['arrow_storm', 'ascendant_ranger'], 20] ] as [string[], number][])(
    'Arrow Rain reflects %j in its description and emitted arrows', (nodes, count) => {
      const h = new Harness({ save: makeSave({ heroes: 'all', nodes, prestige: 1 }), areaId: 'ashwood' });
      h.toFight(); h.b.routed = false; h.pacifyEnemies(); h.holdFire(); h.clearLog();
      expect(h.b.cast('ranger')).toBe(true); h.tick(2);
      expect(h.of('attack').filter(e => e.fx === 'arrowRain')).toHaveLength(count);
      expect(skillDescription('ranger', h.b.mods)).toContain(`${count}本`);
    });
  it('Sanctuary describes the actual heal, barrier and duration with late upgrades and relics', () => {
    const h = new Harness({ save: makeSave({ heroes: 'all', prestige: 1,
      nodes: ['grace', 'hallowed_ground', 'ascendant_oracle', 'divine_echo'], relics: ['soulbound_chalice', 'bastion_heart'] }), areaId: 'ashwood' });
    h.toFight(); h.b.routed = false; h.pacifyEnemies(); h.holdFire();
    const g = h.hero('guardian'); g.hp = 1; g.barrier = 0; g.barrierTime = 0; h.clearLog();
    expect(h.b.cast('oracle')).toBe(true); h.flush();
    const desc = skillDescription('oracle', h.b.mods);
    expect(desc).toContain('最大HP56.88%のBarrier（24秒）');
    expect(desc).toContain('最大HP131.25%分の回復');
    expect(h.of('barrier').find(e => e.dst === g.id)!.amount / g.maxHp).toBeCloseTo(.56875, 6);
    expect(desc).toContain('余剰回復はBarrierへ変換（最大HP80%まで）');
    expect(g.barrier / g.maxHp).toBeCloseTo(.8, 6);
    expect(g.barrierTime).toBe(24); expect(g.hp).toBe(g.maxHp);
  });
});

describe('relic replacement', () => {
  it('keeps the slot, ownership and currency while replacing its effect', () => {
    const s = makeSave({ prestige: 1, shards: 8, relics: ['gilded_idol', 'phoenix_plume'] });
    s.relicsOwned.push('bastion_heart');
    expect(swapRelic(s, 'gilded_idol', 'bastion_heart')).toBe(true);
    expect(s.relicsEquipped).toEqual(['bastion_heart', 'phoenix_plume']);
    expect(s.shards).toBe(8); expect(s.relicsOwned).toContain('gilded_idol');
    const before = structuredClone(s);
    for (const [outgoing, incoming] of [['bastion_heart', 'phoenix_plume'], ['gilded_idol', 'bastion_heart'], ['bastion_heart', 'hourglass_ash']]) {
      expect(swapRelic(s, outgoing, incoming)).toBe(false); expect(s).toEqual(before);
    }
  });
});
