// Shape invariants of the balance curves (never exact tuning numbers: balance is tuned elsewhere).
import { describe, expect, it } from 'vitest';
import {
  affordableLevels,
  BAL,
  enemyDmgAt,
  enemyGoldAt,
  enemyHpAt,
  formatNum,
  formatTime,
  gearTier,
  heroLevelMult,
  levelCost,
  levelCostN,
  nextMilestone,
} from '../src/core/balance.ts';
import { Rng } from '../src/core/rng.ts';

describe('level costs', () => {
  it('are positive integers that never decrease', () => {
    let prev = 0;
    for (let lv = 1; lv <= 150; lv++) {
      const c = levelCost(lv);
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it('scale down with a cost multiplier', () => {
    for (const lv of [1, 5, 20, 60]) expect(levelCost(lv, 0.8)).toBeLessThanOrEqual(levelCost(lv));
    expect(levelCost(40, 0.5)).toBeLessThan(levelCost(40));
  });

  it('levelCostN is the sum of single level costs', () => {
    for (const [lv, n] of [[1, 0], [1, 1], [3, 7], [24, 12], [80, 5]]) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += levelCost(lv + i);
      expect(levelCostN(lv, n)).toBe(sum);
    }
  });

  it('affordableLevels buys exactly what the gold allows', () => {
    const rng = new Rng(77);
    for (let i = 0; i < 300; i++) {
      const lv = 1 + rng.int(90);
      const gold = Math.floor(rng.next() ** 3 * levelCostN(lv, 40));
      const mult = rng.chance(0.5) ? 1 : 0.8;
      const n = affordableLevels(lv, gold, mult);
      expect(levelCostN(lv, n, mult)).toBeLessThanOrEqual(gold);
      expect(levelCostN(lv, n + 1, mult)).toBeGreaterThan(gold);
    }
    expect(affordableLevels(1, 0)).toBe(0);
  });
});

describe('hero level multiplier', () => {
  it('starts at 1 and grows every level, with a jump at each milestone', () => {
    expect(heroLevelMult(1)).toBe(1);
    for (let lv = 2; lv <= 120; lv++) expect(heroLevelMult(lv)).toBeGreaterThan(heroLevelMult(lv - 1));
    for (const ms of BAL.milestones) {
      const normal = heroLevelMult(ms - 1) * BAL.heroGrowth;
      expect(heroLevelMult(ms) / normal).toBeCloseTo(BAL.milestoneMult, 9);
    }
  });

  it('gearTier counts reached milestones; nextMilestone points at the next one', () => {
    expect(gearTier(1)).toBe(0);
    BAL.milestones.forEach((ms, i) => {
      expect(gearTier(ms - 1)).toBe(i);
      expect(gearTier(ms)).toBe(i + 1);
      expect(nextMilestone(ms - 1)).toBe(ms);
    });
    expect(gearTier(10_000)).toBe(BAL.milestones.length);
    expect(nextMilestone(BAL.milestones[BAL.milestones.length - 1])).toBeNull();
  });
});

describe('enemy curves', () => {
  it('grow with the global stage index', () => {
    for (let s = 1; s < 70; s++) {
      expect(enemyHpAt(s)).toBeGreaterThan(enemyHpAt(s - 1));
      expect(enemyDmgAt(s)).toBeGreaterThan(enemyDmgAt(s - 1));
      expect(enemyGoldAt(s)).toBeGreaterThan(enemyGoldAt(s - 1));
    }
  });
});

describe('formatting', () => {
  it('formatNum', () => {
    expect(formatNum(0)).toBe('0');
    expect(formatNum(9999.7)).toBe('9999');
    expect(formatNum(12345)).toBe('12.3K');
    expect(formatNum(1_000_000)).toBe('1.00M');
    expect(formatNum(250_000_000)).toBe('250M');
    expect(formatNum(-12345)).toBe('-12.3K');
    expect(formatNum(Infinity)).toBe('∞');
    expect(formatNum(1e40)).toMatch(/Sp$/); // largest unit, never undefined
  });

  it('formatTime', () => {
    expect(formatTime(12.34)).toBe('12.3s');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(3600)).toBe('60:00');
  });
});
