import { describe, expect, it } from 'vitest';
import { deleteSave, exportSave, hasSave, importSave, loadSave, sanitizeSave, SAVE_KEY, writeSave } from '../src/core/save.ts';
import { newSave, SAVE_VERSION } from '../src/core/state.ts';
import { AREA_ORDER, HERO_ORDER, type SaveData } from '../src/core/types.ts';
import { MemoryKV } from './helpers/kv.ts';
import { saveProblems } from './helpers/invariants.ts';
import { clone, makeSave } from './helpers/saves.ts';

/** A save with something non-default in every section. */
function richSave(): SaveData {
  const s = makeSave({
    heroes: 'all',
    level: { guardian: 42, ranger: 37, arcanist: 30, oracle: 28 },
    nodes: { kindling: 2, tempered_steel: 3, fletching: 1, grace: 1 },
    prestige: 1,
    unlocked: ['ruins', 'glimmer'],
    gold: 123456,
    embers: 17,
    shards: 9,
    relics: ['gale_quiver'],
  });
  s.relicsOwned.push('ember_crown');
  s.peakLevels = { guardian: 60, ranger: 55, arcanist: 50, oracle: 45 };
  s.areas.ashwood = { ...s.areas.ashwood, cleared: true, everCleared: true, best: 10, bestEver: 10, attempts: 3, bossFirstTime: 41.5, bossBestTime: 12.25, stars: 2 };
  s.areas.ruins = { ...s.areas.ruins, cleared: true, everCleared: true, best: 10, bestEver: 10, attempts: 5, bossFails: 0, stars: 1, bossFirstTime: 50, bossBestTime: 50 };
  s.areas.glimmer = { ...s.areas.glimmer, best: 6, bestEver: 9, attempts: 2, bossFails: 1 };
  s.selectedArea = 'glimmer';
  s.autoCast = { guardian: true, ranger: false, arcanist: true, oracle: false };
  s.settings = { sfx: false, music: true, sfxVolume: 0.25, musicVolume: 0.9, screenShake: false, damageNumbers: false };
  s.tutorial = { intro: true, mark: false, 'ボス': true };
  s.stats = { runs: 30, kills: 900, bossKills: 4, goldEarned: 999999, embersEarned: 120, deaths: 7, interrupts: 55, perfects: 21, bestHit: 31337.5, vowsKept: 2 };
  s.vows = ['steel', 'lone'];
  s.vowBest = { steel: 1500.5, horde: 1800 };
  s.playTime = 3600.5;
  s.cycleTime = 600;
  s.endingSeen = true;
  return s;
}

describe('newSave', () => {
  it('starts a fresh expedition', () => {
    const s = newSave(1234);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.createdAt).toBe(1234);
    expect(s.savedAt).toBe(1234);
    expect([s.gold, s.embers, s.shards, s.playTime, s.cycleTime, s.prestige]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.heroes.guardian).toEqual({ recruited: true, level: 1 });
    for (const h of HERO_ORDER.slice(1)) expect(s.heroes[h]).toEqual({ recruited: false, level: 1 });
    expect(s.tree).toEqual({ core: 1 });
    expect(s.selectedArea).toBe('ashwood');
    for (const a of AREA_ORDER) {
      expect(s.areas[a].unlocked).toBe(a === 'ashwood');
      expect(s.areas[a]).toMatchObject({ cleared: false, everCleared: false, best: 0, bestEver: 0, attempts: 0, bossFails: 0, stars: 0 });
    }
    expect(s.relicsOwned).toEqual([]);
    expect(s.relicsEquipped).toEqual([]);
    expect(Object.values(s.autoCast).every((v) => v === false)).toBe(true);
    expect(Object.values(s.stats).every((v) => v === 0)).toBe(true);
    expect(s.endingSeen).toBe(false);
    expect(s.trueEndingSeen).toBe(false);
    expect(saveProblems(s)).toEqual([]);
  });

  it('returns independent objects', () => {
    const a = newSave(0);
    const b = newSave(0);
    a.heroes.guardian.level = 9;
    a.areas.ruins.unlocked = true;
    a.tree.kindling = 1;
    expect(b.heroes.guardian.level).toBe(1);
    expect(b.areas.ruins.unlocked).toBe(false);
    expect(b.tree.kindling).toBeUndefined();
  });
});

describe('sanitizeSave', () => {
  const fresh = (s: SaveData) => ({ ...s, createdAt: 0, savedAt: 0 });

  it.each([null, undefined, 42, 'save', true, [], [1, 2, 3]])('turns garbage %j into a valid default save', (raw) => {
    const s = sanitizeSave(raw);
    expect(saveProblems(s)).toEqual([]);
    expect(fresh(s)).toEqual(fresh(newSave(0)));
  });

  it('is the identity on a valid save (JSON round trip)', () => {
    const s = richSave();
    expect(saveProblems(s)).toEqual([]);
    expect(sanitizeSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('rejects negative, NaN, infinite and non-numeric currencies and counters', () => {
    const s = sanitizeSave({
      gold: -50, embers: NaN, shards: Infinity, playTime: -1, cycleTime: 'x', prestige: -3,
      stats: { runs: -4, kills: NaN, bestHit: '9' },
    });
    expect([s.gold, s.embers, s.shards, s.playTime, s.cycleTime, s.prestige]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.stats.runs).toBe(0);
    expect(s.stats.kills).toBe(0);
    expect(s.stats.bestHit).toBe(0);
    expect(saveProblems(s)).toEqual([]);
  });

  it('floors fractional prestige and levels, and clamps levels to >= 1', () => {
    const s = sanitizeSave({
      prestige: 2.9,
      heroes: { guardian: { recruited: false, level: 7.8 }, ranger: { recruited: true, level: -5 }, arcanist: { recruited: 'yes', level: 'high' }, oracle: { recruited: true, level: NaN } },
      peakLevels: { guardian: -1, ranger: 12.7 },
    });
    expect(s.prestige).toBe(2);
    expect(s.heroes.guardian).toEqual({ recruited: true, level: 7 }); // Guardian can never be un-recruited
    expect(s.heroes.ranger).toEqual({ recruited: true, level: 1 });
    expect(s.heroes.arcanist).toEqual({ recruited: false, level: 1 });
    expect(s.heroes.oracle).toEqual({ recruited: true, level: 1 });
    expect(s.peakLevels).toEqual({ guardian: 0, ranger: 12, arcanist: 0, oracle: 0 });
  });

  it('drops unknown tree nodes, clamps ranks to [0, maxRank] and forces the core', () => {
    const s = sanitizeSave({ tree: { bogus_node: 3, tempered_steel: 99, kindling: -2, fletching: 1.7, grace: 'max', core: 0 } });
    expect(s.tree.bogus_node).toBeUndefined();
    expect(s.tree.tempered_steel).toBe(3);
    expect(s.tree.kindling ?? 0).toBe(0);
    expect(s.tree.fletching).toBe(1);
    expect(s.tree.grace).toBeUndefined();
    expect(s.tree.core).toBe(1);
    expect(saveProblems(s)).toEqual([]);
  });

  it('drops unknown / duplicate / non-string relics and un-owned equipped relics', () => {
    const s = sanitizeSave({
      relicsOwned: ['nope', 'gale_quiver', 'gale_quiver', 5, null, 'ember_crown'],
      relicsEquipped: ['ember_crown', 'twin_fang', 'nope', 'ember_crown'],
    });
    expect(s.relicsOwned).toEqual(['gale_quiver', 'ember_crown']);
    expect(s.relicsEquipped).toEqual(['ember_crown']);
  });

  it('drops unknown / duplicate vows and records for unknown vows', () => {
    const s = sanitizeSave({ prestige: 1, vows: ['steel', 'nope', 'steel', 3, 'constructor', 'fury'], vowBest: { steel: 900, nope: 50, horde: -1, fury: 'x' } });
    expect(s.vows).toEqual(['steel', 'fury']);
    expect(s.vowBest).toEqual({ steel: 900 });
  });

  // Regression: inherited Object.prototype members must not pass the known-id check.
  it('rejects ids that only exist on Object.prototype (constructor, toString, ...)', () => {
    const s = sanitizeSave(JSON.parse('{"tree":{"constructor":1,"toString":2,"hasOwnProperty":1},"relicsOwned":["constructor","toString","gale_quiver"],"relicsEquipped":["constructor"]}'));
    expect(Object.keys(s.tree)).toEqual(['core']);
    expect(s.relicsOwned).toEqual(['gale_quiver']);
    expect(s.relicsEquipped).toEqual([]);
  });

  it('keeps ashwood unlocked and only selects unlocked areas', () => {
    const s = sanitizeSave({ areas: { ashwood: { unlocked: false } }, selectedArea: 'hollow' });
    expect(s.areas.ashwood.unlocked).toBe(true);
    expect(s.selectedArea).toBe('ashwood');
    const t = sanitizeSave({ areas: { ruins: { unlocked: true } }, selectedArea: 'ruins' });
    expect(t.selectedArea).toBe('ruins');
    expect(sanitizeSave({ selectedArea: 'atlantis' }).selectedArea).toBe('ashwood');
  });

  it('clamps area progress', () => {
    const s = sanitizeSave({ areas: { ruins: { unlocked: true, cleared: 'no', best: 25, bestEver: 3, stars: 9, attempts: -2, bossFails: 2.5, bossFirstTime: -4 } } });
    const r = s.areas.ruins;
    expect(r.cleared).toBe(false);
    expect(r.best).toBe(10);
    expect(r.bestEver).toBe(10); // bestEver can never be below best
    expect(r.stars).toBe(3);
    expect(r.attempts).toBe(0);
    expect(r.bossFails).toBe(2);
    expect(r.bossFirstTime).toBe(0);
  });

  it('clamps settings and ignores non-boolean flags', () => {
    const s = sanitizeSave({ settings: { sfx: 0, music: false, sfxVolume: 3, musicVolume: -1, screenShake: 'no' }, autoCast: { guardian: 1, ranger: true }, endingSeen: 'yes', tutorial: { a: true, b: 1, c: false } });
    expect(s.settings.sfx).toBe(true);
    expect(s.settings.music).toBe(false);
    expect(s.settings.sfxVolume).toBe(1);
    expect(s.settings.musicVolume).toBe(0);
    expect(s.settings.screenShake).toBe(true);
    expect(s.autoCast).toEqual({ guardian: false, ranger: true, arcanist: false, oracle: false });
    expect(s.endingSeen).toBe(false);
    expect(s.tutorial).toEqual({ a: true, c: false });
  });

  it('always stamps the current version', () => {
    expect(sanitizeSave({ version: 999 }).version).toBe(SAVE_VERSION);
    expect(sanitizeSave({ version: -1 }).version).toBe(SAVE_VERSION);
  });
});

describe('localStorage persistence (in-memory KV)', () => {
  it('writeSave / loadSave round trip', () => {
    const kv = new MemoryKV();
    const s = richSave();
    expect(hasSave(kv)).toBe(false);
    expect(loadSave(kv)).toBeNull();
    expect(writeSave(s, kv)).toBe(true);
    expect(kv.data.has(SAVE_KEY)).toBe(true);
    expect(hasSave(kv)).toBe(true);
    expect(s.savedAt).toBeGreaterThan(0); // stamped on write
    expect(loadSave(kv)).toEqual(s);
  });

  it('deleteSave removes the save', () => {
    const kv = new MemoryKV();
    writeSave(newSave(0), kv);
    deleteSave(kv);
    expect(hasSave(kv)).toBe(false);
    expect(loadSave(kv)).toBeNull();
  });

  it('survives corrupt JSON and sanitizes hostile content', () => {
    const kv = new MemoryKV();
    kv.setItem(SAVE_KEY, '{not json');
    expect(loadSave(kv)).toBeNull();
    kv.setItem(SAVE_KEY, JSON.stringify({ gold: -1e9, heroes: { guardian: { level: -3 } }, tree: { nope: 1 } }));
    const s = loadSave(kv)!;
    expect(s).not.toBeNull();
    expect(saveProblems(s)).toEqual([]);
    expect(s.gold).toBe(0);
  });

  it('never throws when storage is missing or failing', () => {
    expect(writeSave(newSave(0), null)).toBe(false);
    expect(loadSave(null)).toBeNull();
    expect(hasSave(null)).toBe(false);
    expect(() => deleteSave(null)).not.toThrow();
    const kv = new MemoryKV();
    kv.failSet = true;
    expect(writeSave(newSave(0), kv)).toBe(false);
    kv.failSet = false;
    writeSave(newSave(0), kv);
    kv.failGet = true;
    expect(loadSave(kv)).toBeNull();
    expect(hasSave(kv)).toBe(false);
    kv.failRemove = true;
    expect(() => deleteSave(kv)).not.toThrow();
  });
});

describe('exportSave / importSave', () => {
  it('round trips a full save, including non-ASCII text', () => {
    const s = richSave();
    const code = exportSave(s);
    expect(code).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(importSave(code)).toEqual(s);
    expect(importSave(`  \n${code}\n `)).toEqual(s); // pasted with whitespace
  });

  it('returns null for codes that are not base64 JSON', () => {
    expect(importSave('')).toBeNull();
    expect(importSave('!!!not base64!!!')).toBeNull();
    expect(importSave(Buffer.from('{broken').toString('base64'))).toBeNull();
  });

  it('sanitizes decoded content', () => {
    const code = Buffer.from(JSON.stringify({ gold: -5, embers: 3, tree: { tempered_steel: 50 } })).toString('base64');
    const s = importSave(code)!;
    expect(s.gold).toBe(0);
    expect(s.embers).toBe(3);
    expect(s.tree.tempered_steel).toBe(3);
    expect(saveProblems(s)).toEqual([]);
  });

  it('does not mutate the exported save', () => {
    const s = richSave();
    const before = clone(s);
    exportSave(s);
    expect(s).toEqual(before);
  });
});
