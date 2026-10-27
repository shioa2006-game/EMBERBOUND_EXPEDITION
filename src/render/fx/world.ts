// Shared state for every effect module: particle pool, camera, text/banner layers, per-unit
// visual state (UnitVis) and fast unit lookups. Owned by the Renderer, rebuilt per battle.
import { getStoryProjectileOrigin } from '../storybook/characters.ts';
import { SIZE_BOX, type Battle } from '../../core/battle.ts';
import type { AbilityDef, Unit } from '../../core/types.ts';
import type { RenderSettings } from '../api.ts';
import { Banners } from './banners.ts';
import { Camera } from './camera.ts';
import { Particles } from './particles.ts';
import { TextLayer } from './text.ts';

export interface Vec {
  x: number;
  y: number;
}

/** Visual (render-only) state of one unit. Survives the unit leaving `battle.enemies`. */
export class UnitVis {
  id = 0;
  side: 'hero' | 'enemy' = 'enemy';
  frame = -1; // render frame this vis was last laid out
  ready = false; // base geometry computed

  // base geometry relative to the feet (from the idle sprite; stable across poses)
  offTop = -16;
  offL = -8;
  offR = 8;
  // laid-out geometry (world px, includes animation offsets)
  x = 0;
  y = 0;
  cx = 0;
  cy = 0;
  top = 0;
  w = 16;
  h = 16;
  drawX = 0;
  drawY = 0;
  lastSpr: HTMLCanvasElement | null = null;
  lastWhite: HTMLCanvasElement | null = null;

  // appear animation
  appearT = 0;
  appear = 0; // 0 none, 1 slide-in, 2 portal, 3 boss reveal

  // action animation
  lungeT = 9;
  lungeTravel = 0.12;
  lungeDist = 0;
  lungeDir = 1;
  lungeHop = 0;
  recoilT = 9;
  knock = 1;
  castT = 9;
  skillT = 9;

  // bars
  hpFrac = 1;
  trailFrac = 1;
  trailHold = 0;
  barrierFrac = 0;

  // windup tracking
  windupAbility: AbilityDef | null = null;
  windupInt = false;
  windupFlash = 9; // seconds since purple→orange flip
  windupAge = 0;

  // numbers
  stack = 0;
  stackT = 0;
  burnAcc = 0;
  burnT = 0;
  burnCrit = false;

  // misc
  markT = 9;
  deathT = 0;
  alivePrev = true;
  flashT = 9; // generic white flash (ward break / phase)
  barrierPop = 9;
  perfectT = 9;
}

export class FxWorld {
  battle: Battle | null = null;
  readonly particles = new Particles(640);
  readonly camera = new Camera();
  readonly texts = new TextLayer();
  readonly banners = new Banners();
  settings: RenderSettings = { screenShake: true, damageNumbers: true };
  simTime = 0;
  realTime = 0;
  frame = 0;
  readonly vis = new Map<number, UnitVis>();
  readonly units = new Map<number, Unit>();

  reset(): void {
    this.particles.clear();
    this.camera.reset();
    this.texts.clear();
    this.banners.clear();
    this.vis.clear();
    this.units.clear();
  }

  /** Rebuild the id → unit index (call whenever battle arrays may have changed). */
  index(b: Battle): void {
    this.units.clear();
    for (let i = 0; i < b.heroes.length; i++) this.units.set(b.heroes[i].id, b.heroes[i]);
    for (let i = 0; i < b.enemies.length; i++) this.units.set(b.enemies[i].id, b.enemies[i]);
  }

  unit(id: number | null | undefined): Unit | undefined {
    if (id === null || id === undefined) return undefined;
    return this.units.get(id);
  }

  visOf(id: number): UnitVis {
    let v = this.vis.get(id);
    if (!v) {
      v = new UnitVis();
      v.id = id;
      const u = this.units.get(id);
      if (u) {
        v.side = u.side;
        const b = SIZE_BOX[u.size];
        v.offTop = -b.h;
        v.offL = -b.w / 2;
        v.offR = b.w / 2;
        v.x = u.x;
        v.y = u.y;
        v.cx = u.x;
        v.cy = u.y - b.h / 2;
        v.top = u.y - b.h;
        v.w = b.w;
        v.h = b.h;
      }
      this.vis.set(id, v);
    }
    return v;
  }

  /** Visual centre of a unit (falls back to its logical box). */
  center(id: number, out: Vec): boolean {
    const v = this.vis.get(id);
    if (v) {
      out.x = v.cx;
      out.y = v.cy;
      return true;
    }
    const u = this.units.get(id);
    if (!u) return false;
    const b = SIZE_BOX[u.size];
    out.x = u.x;
    out.y = u.y - b.h / 2;
    return true;
  }

  /** Point a projectile leaves from (weapon hand). */
  hand(id: number, out: Vec): boolean {
    if (!this.center(id, out)) return false;
    const v = this.vis.get(id);
    const u = this.units.get(id);
    if (u) {
      const origin = getStoryProjectileOrigin(u.sprite);
      if (origin) {
        out.x = (v?.x ?? u.x) + origin.x;
        out.y = (v?.y ?? u.y) + origin.y;
        return true;
      }
    }
    const w = v ? v.w : 12;
    const dir = (u ? u.side : v?.side) === 'hero' ? 1 : -1;
    out.x += dir * w * 0.32;
    out.y -= 2;
    return true;
  }

  head(id: number, out: Vec): boolean {
    const v = this.vis.get(id);
    if (v) {
      out.x = v.cx;
      out.y = v.top;
      return true;
    }
    const u = this.units.get(id);
    if (!u) return false;
    out.x = u.x;
    out.y = u.y - SIZE_BOX[u.size].h;
    return true;
  }

  feet(id: number, out: Vec): boolean {
    const v = this.vis.get(id);
    const u = this.units.get(id);
    if (u) {
      out.x = v ? v.x : u.x;
      out.y = u.y + (u.def?.flying ? 18 : 0);
      return true;
    }
    if (v) {
      out.x = v.x;
      out.y = v.y;
      return true;
    }
    return false;
  }

  shake(amount: number): void {
    this.camera.shake(amount);
  }
}
