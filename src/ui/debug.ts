// Debug helpers (only installed with ?debug in the URL): window.__eb and an fps / time-scale readout.
import * as state from '../core/state.ts';
import type { Battle } from '../core/battle.ts';
import { AREA_ORDER, HERO_ORDER, type AreaId, type RunResult, type SaveData, type Unit } from '../core/types.ts';
import type { Notice } from '../core/state.ts';
import { h } from './dom.ts';

export interface DebugHost {
  getSave(): SaveData;
  getBattle(): Battle | null;
  speed(): number;
  setSpeed(x: number): void;
  /** Persist + refresh camp/header. */
  commit(): void;
  /** Run the normal Rekindle flow (cinematic + camp refresh). */
  rekindleNow(): void;
  showNotices(notices: Notice[]): void;
  /** Drive the frame loop manually (QA when requestAnimationFrame is throttled). */
  advance(seconds: number, fps: number): void;
}

export interface DebugReadout {
  update(realDt: number, simScale: number, steps: number): void;
}

interface HitAccess {
  hitEnemy(src: Unit | null, t: Unit, base: number, o: { type: 'true'; tag: string; big?: boolean }): number;
}

function kill(b: Battle, filter: (u: Unit) => boolean): number {
  const access = b as unknown as HitAccess;
  let n = 0;
  for (const e of [...b.enemies]) {
    if (!e.alive || !filter(e)) continue;
    e.untargetable = 0;
    access.hitEnemy(null, e, (e.hp + e.ward) * 10 + 1, { type: 'true', tag: 'skill', big: true });
    n++;
  }
  return n;
}

export function installDebug(host: DebugHost, root: HTMLElement): DebugReadout {
  const api = {
    get save() {
      return host.getSave();
    },
    get battle() {
      return host.getBattle();
    },
    state,
    give(gold = 0, embers = 0, shards = 0) {
      const s = host.getSave();
      s.gold += gold;
      s.embers += embers;
      s.shards += shards;
      host.commit();
      return { gold: s.gold, embers: s.embers, shards: s.shards };
    },
    unlockAll() {
      const s = host.getSave();
      for (const hero of HERO_ORDER) {
        if (!s.heroes[hero].recruited) {
          s.heroes[hero].recruited = true;
          s.heroes[hero].level = state.recruitLevel(s);
        }
      }
      for (const a of AREA_ORDER) s.areas[a].unlocked = true;
      host.commit();
      return 'heroes recruited, areas unlocked';
    },
    clearArea(id: AreaId) {
      const s = host.getSave();
      if (!s.areas[id]) return `unknown area ${id}`;
      s.areas[id].unlocked = true;
      const r: RunResult = {
        areaId: id,
        reason: 'victory',
        stageReached: 10,
        stagesCleared: 10,
        segments: [{ areaId: id, stageReached: 10, stagesCleared: 10, bossDefeated: true, bossTime: 30, lanternFrac: 0.8 }],
        kills: 0,
        eliteKills: 0,
        bossDefeated: true,
        loot: { gold: 0, embers: 0, shards: 0 },
        duration: 0,
        bestHit: 0,
        interrupts: 0,
        perfects: 0,
        routs: 0,
        emberNovas: 0,
        killedBy: null,
        firstDown: null,
        missed: {},
      };
      const notices = state.applyRunResult(s, r);
      host.commit();
      host.showNotices(notices);
      return notices;
    },
    setLevel(n: number) {
      const s = host.getSave();
      for (const hero of HERO_ORDER) if (s.heroes[hero].recruited) s.heroes[hero].level = Math.max(1, Math.floor(n));
      host.commit();
      return n;
    },
    speed(x: number) {
      host.setSpeed(Math.max(0, x));
      return host.speed();
    },
    killWave() {
      const b = host.getBattle();
      return b ? kill(b, (e) => e.rank !== 'boss') : 0;
    },
    killBoss() {
      const b = host.getBattle();
      return b ? kill(b, () => true) : 0;
    },
    /** Advance the whole app by `seconds` of real time at `fps` (automated QA). */
    advance(seconds = 1, fps = 30) {
      host.advance(seconds, fps);
      const b = host.getBattle();
      return b ? { t: +b.time.toFixed(2), phase: b.phase, stage: b.stage + 1, lantern: +b.lantern.toFixed(1), ended: b.ended } : null;
    },
    rekindle() {
      const s = host.getSave();
      if (!state.canRekindle(s)) s.areas.hollow.cleared = true;
      host.rekindleNow();
      return s.prestige;
    },
  };
  (window as unknown as { __eb: typeof api }).__eb = api;

  const el = h('div', { class: 'debug-readout', attrs: { 'aria-hidden': 'true' } });
  root.appendChild(el);
  let acc = 0;
  let frames = 0;
  let fps = 0;
  console.info('[EMBERBOUND] debug mode: window.__eb', api);
  return {
    update(realDt: number, simScale: number, steps: number) {
      acc += realDt;
      frames++;
      if (acc >= 0.5) {
        fps = frames / acc;
        acc = 0;
        frames = 0;
        el.textContent = `FPS ${fps.toFixed(0)} | sim ×${simScale.toFixed(2)} | steps ${steps} | speed ×${host.speed()}`;
      }
    },
  };
}
