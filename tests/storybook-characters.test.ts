import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies.ts';
import { HEROES } from '../src/data/heroes.ts';
import {
  getStoryActionDuration, getStoryDefinition, getStoryFrameCount, getStoryFrameIndex,
  getStoryGearPalette, getStoryReleaseTime, storyCharacterKeys,
} from '../src/render/storybook/characters.ts';

describe('Storybook character integration', () => {
  it('covers the complete live hero and enemy roster with authored directions and body heights', () => {
    const expected = [...Object.keys(HEROES), ...Object.values(ENEMIES).map(enemy => enemy.sprite)].sort();
    expect(storyCharacterKeys().sort()).toEqual(expected);
    expect(expected).toHaveLength(44);
    for (const key of expected) {
      const def = getStoryDefinition(key);
      expect(def.emberbound.facing).toBe(key in HEROES ? 'R' : 'L');
      expect(def.emberbound.heightPx).toBeGreaterThan(0);
      expect(getStoryFrameCount(key, 'idle')).toBeGreaterThan(1);
      expect(getStoryFrameCount(key, 'attack')).toBeGreaterThan(1);
      expect(getStoryFrameCount(key, 'hurt')).toBeGreaterThan(1);
    }
  });

  it('honours uneven attack keys, actual release times and holds the final fallen frame', () => {
    expect(getStoryReleaseTime('ranger')).toBeCloseTo(.15);
    expect(getStoryReleaseTime('drowned_archer')).toBeCloseTo(.15);
    expect(getStoryReleaseTime('rime_archer')).toBeCloseTo(.15);
    expect(getStoryReleaseTime('ranger', 'cast')).toBeCloseTo(.2);
    expect(getStoryFrameIndex('guardian', 'attack', .125)).toBe(5);
    expect(getStoryFrameIndex('guardian', 'attack', .126)).toBe(6);
    for (const key of Object.keys(HEROES)) {
      expect(getStoryFrameIndex(key, 'dead', 60)).toBe(getStoryFrameCount(key, 'dead') - 1);
      expect(getStoryFrameIndex(key, 'dead', 60, { loop: true })).toBe(0);
      expect(getStoryFrameIndex(key, 'idle', getStoryActionDuration(key, 'idle'))).toBe(0);
    }
  });

  it('gives each hero six material palettes without recolouring their skin or hair', () => {
    for (const key of Object.keys(HEROES)) {
      const base = getStoryGearPalette(key, 0)!;
      const palettes = Array.from({ length: 6 }, (_, tier) => getStoryGearPalette(key, tier)!);
      expect(new Set(palettes.map(palette => JSON.stringify(palette))).size).toBe(6);
      for (const palette of palettes) for (const field of Object.keys(base)) {
        if (/skin|hair/i.test(field)) expect(palette[field]).toBe(base[field]);
      }
      expect(getStoryGearPalette(key, -1)).toEqual(base);
      expect(getStoryGearPalette(key, 10)).toEqual(palettes[5]);
    }
    expect(getStoryGearPalette('guardian', 0)!.steel).toBe('#8a6040');
    expect(getStoryGearPalette('guardian', 0)!.red).toBe('#927256');
    expect(getStoryGearPalette('shadow_guardian', 5)).toBeUndefined();
    expect(getStoryDefinition('shadow_guardian').emberbound.heightPx).toBe(44);
  });

  it('reuses idle for unimplemented enemy walks but rejects unmapped character IDs', () => {
    expect(getStoryFrameCount('ash_crawler', 'walk')).toBe(getStoryFrameCount('ash_crawler', 'idle'));
    expect(() => getStoryDefinition('missing-character')).toThrow('Missing Storybook character');
  });
});
