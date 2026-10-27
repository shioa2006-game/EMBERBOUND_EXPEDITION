// Timed visual effects in world space: projectiles synced to the simulation's travel times,
// slashes, beams, lightning, meteors, explosions, domes, waves, portals, pillars...
// Effects are pooled; each one is a small record interpreted by type in update()/draw().
import { GROUND_Y } from '../../core/battle.ts';
import type { AreaId } from '../../core/types.ts';
import { COL } from './palette.ts';
import { P_GLOW, P_LIGHT, P_SQUARE, P_STREAK, P_TWINKLE } from './particles.ts';
import { glowSprite, pxArc, pxEllipse, pxHex, pxLightning, pxLine, pxRing, pxStar } from './pixel.ts';
import { TAU, bump, clamp01, easeInQuad, easeOutBack, easeOutCubic, easeOutQuad, hash01, lerp, rand } from './util.ts';
import type { FxWorld, Vec } from './world.ts';

import { paintCanvas } from '../storybook/surface.ts';
import { getStoryReleaseTime } from '../storybook/characters.ts';

type Ctx = CanvasRenderingContext2D;

export type FxType =
  | 'arrow' | 'bolt' | 'shot' | 'orb' | 'heal' | 'smite' | 'slash' | 'claw' | 'impact' | 'chain' | 'rainArrow' | 'volley'
  | 'meteor' | 'meteorite' | 'reticle' | 'explosion' | 'sanctuary' | 'nova' | 'emberNova' | 'portal' | 'hex' | 'splash'
  | 'drain' | 'pillar' | 'ring' | 'groundWave' | 'beam' | 'freeze' | 'doom' | 'slam' | 'rays' | 'ghost' | 'interrupt'
  | 'glow';

export const LAYER_BACK = 0;
export const LAYER_FRONT = 1;

export class Fx {
  type: FxType = 'ring';
  layer = LAYER_FRONT;
  t = 0;
  dur = 1;
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;
  src = 0;
  dst = 0;
  scale = 1;
  color: string = COL.white;
  color2: string = COL.white;
  seed = 0;
  a = 0;
  b = 0;
  c = 0;
  hit = false;
  track = false;
  canvas: HTMLCanvasElement | null = null;
}

/** Per-area palette for enemy magic & party-wide novas: [main, deep, light]. */
const AREA_FX: Record<AreaId, readonly [string, string, string]> = {
  ashwood: ['#ff7a3d', '#4a140a', '#ffd25a'],
  ruins: ['#4fd8d0', '#0a3440', '#d0fff8'],
  glimmer: ['#b88bff', '#24104a', '#8fe8ff'],
  rimeholt: ['#a8dcff', '#18365a', '#ffffff'],
  hollow: ['#a85cff', '#16061f', '#b4ff6a'],
  heart: ['#ff9a3d', '#4a1408', '#fff3a0'],
};

const FIRE = ['#fff3a0', '#ffd25a', '#ffb35a', '#ff8a3d', '#e2461e'] as const;
const tmp: Vec = { x: 0, y: 0 };

export class Effects {
  private live: Fx[] = [];
  private pool: Fx[] = [];
  private readonly scratch = new Fx();
  private readonly w: FxWorld;

  constructor(w: FxWorld) {
    this.w = w;
  }

  clear(): void {
    for (const f of this.live) this.pool.push(f);
    this.live.length = 0;
  }

  get count(): number {
    return this.live.length;
  }

  private add(type: FxType, dur: number, layer = LAYER_FRONT): Fx {
    // hard cap: extra effects are written into a scratch record that is never updated or drawn
    // (safe even when called while update() is iterating the live list)
    const f = this.live.length >= 240 ? this.scratch : (this.pool.pop() ?? new Fx());
    f.type = type;
    f.layer = layer;
    f.t = 0;
    f.dur = dur;
    f.x0 = f.y0 = f.x1 = f.y1 = 0;
    f.src = f.dst = 0;
    f.scale = 1;
    f.color = COL.white;
    f.color2 = COL.white;
    f.seed = (Math.random() * 1e9) | 0;
    f.a = f.b = f.c = 0;
    f.hit = false;
    f.track = false;
    f.canvas = null;
    if (f !== this.scratch) this.live.push(f);
    return f;
  }

  private areaFx(): readonly [string, string, string] {
    const id = this.w.battle?.area.id ?? 'ashwood';
    return AREA_FX[id];
  }

  // ───────────────────────────── spawners: attacks ─────────────────────────────

  private projectile(type: FxType, src: number, dst: number, travel: number): Fx | null {
    const w = this.w;
    if (!w.hand(src, tmp)) return null;
    const f = this.add(type, Math.max(0.05, travel));
    f.x0 = tmp.x;
    f.y0 = tmp.y;
    if (!w.center(dst, tmp)) {
      tmp.x = f.x0 + 60;
      tmp.y = f.y0;
    }
    f.x1 = tmp.x;
    f.y1 = tmp.y;
    f.src = src;
    f.dst = dst;
    f.track = true;
    if (type === 'arrow' || type === 'shot') {
      const unit = w.unit(src);
      const release = unit ? getStoryReleaseTime(unit.sprite) : null;
      const delay = Math.max(0, Math.min(release ?? 0, travel - .025));
      // The bow releases at its authored pose; flight still ends on the simulation's hit timestamp.
      f.t = -delay;
      f.dur = Math.max(.025, travel - delay);
    }
    return f;
  }

  arrow(src: number, dst: number, travel: number): void {
    const f = this.projectile('arrow', src, dst, travel);
    if (f) f.a = Math.min(10, Math.abs(f.x1 - f.x0) * 0.06);
  }

  shot(src: number, dst: number, travel: number): void {
    const f = this.projectile('shot', src, dst, travel);
    if (!f) return;
    f.a = Math.min(12, Math.abs(f.x1 - f.x0) * 0.07);
    f.color = this.areaFx()[0];
  }

  bolt(src: number, dst: number, travel: number): void {
    const f = this.projectile('bolt', src, dst, travel);
    if (f) f.a = rand(-4, 4);
  }

  orb(src: number, dst: number, travel: number): void {
    const f = this.projectile('orb', src, dst, travel);
    if (!f) return;
    const p = this.areaFx();
    f.color = p[0];
    f.color2 = p[2];
    f.a = rand(-6, 6);
  }

  heal(src: number, dst: number, travel: number, enemy = false): void {
    const w = this.w;
    if (!w.center(src, tmp)) return;
    const f = this.add('heal', Math.max(0.1, travel));
    f.x0 = tmp.x;
    f.y0 = tmp.y - 3;
    if (!w.center(dst, tmp)) return;
    f.x1 = tmp.x;
    f.y1 = tmp.y;
    f.src = src;
    f.dst = dst;
    f.track = true;
    f.color = enemy ? '#5fe0d0' : COL.heal;
  }

  smite(src: number, dst: number, travel: number): void {
    const w = this.w;
    if (!w.center(src, tmp)) return;
    const f = this.add('smite', travel + 0.24);
    f.a = travel;
    f.x0 = tmp.x + 3;
    f.y0 = tmp.y - 6;
    if (!w.center(dst, tmp)) return;
    f.x1 = tmp.x;
    f.y1 = tmp.y;
    f.dst = dst;
    f.track = true;
  }

  /** Melee slash arc landing on `dst` after `delay` seconds. */
  slash(dst: number, delay: number, heavy: boolean, dir = 1, color: string = COL.white): void {
    const f = this.add('slash', heavy ? 0.26 : 0.17);
    f.t = -delay;
    f.dst = dst;
    f.track = true;
    f.scale = heavy ? 1.5 : 1;
    f.a = dir;
    f.color = color;
    f.color2 = heavy ? COL.goldHi : '#cfe8ff';
    if (this.w.center(dst, tmp)) {
      f.x1 = tmp.x;
      f.y1 = tmp.y;
    }
  }

  claw(dst: number, delay: number, big: boolean): void {
    const f = this.add('claw', 0.2);
    f.t = -delay;
    f.dst = dst;
    f.track = true;
    f.scale = big ? 1.5 : 1;
    if (this.w.center(dst, tmp)) {
      f.x1 = tmp.x;
      f.y1 = tmp.y;
    }
  }

  impact(dst: number, delay: number, color: string, scale: number): void {
    const f = this.add('impact', 0.24);
    f.t = -delay;
    f.dst = dst;
    f.track = true;
    f.color = color;
    f.scale = scale;
    if (this.w.center(dst, tmp)) {
      f.x1 = tmp.x;
      f.y1 = tmp.y;
    }
  }

  counter(src: number, dst: number, delay: number): void {
    this.slash(dst, delay, false, 1, '#9cc8ff');
    void src;
  }

  chain(src: number, dst: number, fromHand: boolean): void {
    const w = this.w;
    const ok = fromHand ? w.hand(src, tmp) : w.center(src, tmp);
    if (!ok) return;
    const f = this.add('chain', 0.24);
    f.x0 = tmp.x;
    f.y0 = tmp.y;
    if (!w.center(dst, tmp)) return;
    f.x1 = tmp.x;
    f.y1 = tmp.y;
    f.dst = dst;
    const pt = this.w.particles;
    for (let i = 0; i < 6; i++) pt.spawn(tmp.x, tmp.y, rand(-60, 60), rand(-60, 40), rand(0.15, 0.3), i % 2 ? '#c8b8ff' : COL.white, 1, P_STREAK);
  }

  rainArrow(dst: number, travel: number): void {
    const w = this.w;
    if (!w.center(dst, tmp)) return;
    const f = this.add('rainArrow', Math.max(0.06, travel));
    const jx = rand(-5, 5);
    f.x1 = tmp.x + jx;
    f.y1 = tmp.y + rand(-4, 4);
    f.x0 = f.x1 - rand(10, 22);
    f.y0 = -6;
    f.dst = dst;
  }

  volley(src: number): void {
    if (!this.w.hand(src, tmp)) return;
    const f = this.add('volley', 0.5);
    f.x0 = tmp.x;
    f.y0 = tmp.y - 2;
  }

  // ───────────────────────────── spawners: spells ─────────────────────────────

  meteor(x: number, fall: number): void {
    const f = this.add('meteor', fall + 0.6);
    f.a = fall;
    f.x1 = x;
    f.y1 = GROUND_Y - 10;
    f.x0 = x - 120;
    f.y0 = -40;
    const r = this.add('reticle', fall, LAYER_BACK);
    r.x0 = x;
    r.y0 = GROUND_Y + 1;
    r.scale = 1;
  }

  meteorite(x: number, y: number, dst: number, fall: number): void {
    const f = this.add('meteorite', fall);
    f.dst = dst;
    f.track = true;
    if (this.w.center(dst, tmp)) {
      x = tmp.x;
      y = tmp.y;
    }
    f.x1 = x;
    f.y1 = y;
    f.x0 = x - rand(40, 70);
    f.y0 = -20;
    const r = this.add('reticle', fall, LAYER_BACK);
    r.x0 = x;
    r.y0 = GROUND_Y + 1;
    r.scale = 0.4;
  }

  explosion(x: number, y: number, scale: number, palette: readonly string[] = FIRE): void {
    const f = this.add('explosion', 0.42 + 0.08 * scale);
    f.x0 = x;
    f.y0 = y;
    f.scale = scale;
    const pt = this.w.particles;
    const n = Math.round(10 + 10 * scale);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(30, 90) * (0.7 + scale * 0.3);
      pt.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s - 20, rand(0.25, 0.55), palette[i % palette.length], rand(2, 4) * (0.6 + scale * 0.25), P_GLOW, -20, 3);
    }
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(60, 160) * (0.6 + scale * 0.3);
      pt.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s - 30, rand(0.2, 0.45), i % 3 ? COL.fire : COL.white, 1, P_STREAK, 120, 1);
    }
    for (let i = 0; i < Math.round(4 + 4 * scale); i++) {
      pt.spawn(x + rand(-6, 6) * scale, y + rand(-4, 4), rand(-12, 12), rand(-26, -10), rand(0.6, 1.1), i % 2 ? COL.smoke : '#2e2430', 2, P_SQUARE, -6, 1.5);
    }
    for (let i = 0; i < Math.round(5 * scale); i++) {
      pt.spawn(x, y, rand(-90, 90), rand(-150, -60), rand(0.6, 1.0), i % 2 ? '#3a2a24' : COL.fireDeep, 1, P_SQUARE, 380, 0, GROUND_Y + rand(0, 8));
    }
    this.w.shake(1 + scale * 1.2);
  }

  sanctuary(x: number, y: number, scale: number): void {
    const f = this.add('sanctuary', 1.7);
    f.x0 = x;
    f.y0 = y;
    f.scale = scale;
    this.w.camera.flash(COL.goldHi, 0.18 * scale, 0.35);
  }

  nova(src: number, scale: number): void {
    const f = this.add('nova', 0.7);
    if (this.w.center(src, tmp)) {
      f.x0 = tmp.x;
      f.y0 = tmp.y;
    } else {
      f.x0 = 300;
      f.y0 = GROUND_Y - 30;
    }
    f.x1 = 106;
    f.y1 = GROUND_Y - 24;
    f.scale = Math.max(0.8, Math.min(3, scale));
    const p = this.areaFx();
    f.color = p[0];
    f.color2 = p[1];
    f.canvas = null;
    f.b = 0.13; // travel
  }

  emberNova(x: number, y: number): void {
    const f = this.add('emberNova', 1.1);
    f.x0 = x;
    f.y0 = y;
    this.w.camera.flash(COL.goldHi, 0.9, 0.7);
    this.w.shake(4.5);
    const pt = this.w.particles;
    for (let i = 0; i < 70; i++) {
      const a = rand(0, TAU);
      const s = rand(60, 260);
      pt.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.5, 1.1), i % 3 ? COL.ember : COL.goldHi, rand(2, 4), P_GLOW, 0, 1.5);
    }
    this.rays(x, y, COL.goldHi, 18, 160, 0.9);
  }

  portal(x: number, y: number): void {
    const f = this.add('portal', 0.95, LAYER_BACK);
    f.x0 = x;
    f.y0 = y + 1;
    const p = this.areaFx();
    f.color = p[0];
    f.color2 = p[2];
  }

  hex(dst: number, expand: boolean): void {
    const f = this.add('hex', expand ? 0.45 : 0.55);
    f.dst = dst;
    f.track = true;
    f.c = expand ? 1 : 0;
    const v = this.w.vis.get(dst);
    f.a = v ? Math.max(v.w, v.h) * 0.62 + 4 : 16;
    if (this.w.center(dst, tmp)) {
      f.x1 = tmp.x;
      f.y1 = tmp.y;
    }
    const pt = this.w.particles;
    for (let i = 0; i < 12; i++) {
      const a = rand(0, TAU);
      const s = expand ? rand(50, 120) : rand(10, 30);
      pt.spawn(f.x1 + Math.cos(a) * f.a * 0.8, f.y1 + Math.sin(a) * f.a * 0.8, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.6), i % 2 ? COL.ward : COL.wardHi, expand ? 2 : 1, expand ? P_SQUARE : P_TWINKLE, expand ? 160 : 0, 1);
    }
  }

  splash(x: number, y: number, scale: number): void {
    const f = this.add('splash', 0.75, LAYER_BACK);
    f.x0 = x;
    f.y0 = y + 1;
    f.scale = scale;
    const pt = this.w.particles;
    const n = Math.round(16 * scale);
    for (let i = 0; i < n; i++) {
      pt.spawn(x + rand(-8, 8) * scale, y, rand(-50, 50) * scale, rand(-150, -60) * Math.sqrt(scale), rand(0.4, 0.8), i % 3 ? '#5fe0d0' : COL.white, i % 4 ? 1 : 2, P_SQUARE, 340, 0, y + rand(0, 3));
    }
    if (scale > 1.2) this.w.shake(2);
  }

  drain(src: number, x: number, y: number, scale: number): void {
    const f = this.add('drain', scale >= 2 ? 1.0 : 0.75);
    f.src = src;
    f.x0 = x;
    f.y0 = y;
    f.scale = scale;
    if (this.w.center(src, tmp)) {
      f.x1 = tmp.x;
      f.y1 = tmp.y;
    } else {
      f.x1 = 320;
      f.y1 = 110;
    }
    f.track = true;
  }

  pillar(x: number, y: number, color: string = COL.gold): void {
    const f = this.add('pillar', 1.0);
    f.x0 = x;
    f.y0 = y;
    f.color = color;
    this.ring(x, y, 4, 22, 0.25, color, 0.6, LAYER_BACK);
  }

  ring(x: number, y: number, r0: number, r1: number, squash: number, color: string, dur: number, layer = LAYER_FRONT, thick = 1): void {
    const f = this.add('ring', dur, layer);
    f.x0 = x;
    f.y0 = y;
    f.a = r0;
    f.b = r1;
    f.c = squash;
    f.color = color;
    f.scale = thick;
  }

  groundWave(x: number, y: number, scale: number, color: string, delay = 0): void {
    const f = this.add('groundWave', 0.5, LAYER_BACK);
    f.t = -delay;
    f.x0 = x;
    f.y0 = y;
    f.scale = scale;
    f.color = color;
    const pt = this.w.particles;
    for (let i = 0; i < Math.round(12 * scale); i++) {
      const dir = i % 2 ? 1 : -1;
      pt.spawn(x + rand(-4, 4), y - 1, dir * rand(30, 110) * scale, rand(-40, -10), rand(0.35, 0.7), i % 3 ? '#6a5446' : '#9a8470', i % 4 ? 1 : 2, P_SQUARE, 160, 1, y + rand(0, 4));
    }
  }

  beam(src: number, dst: number, color: string): void {
    const w = this.w;
    if (!w.center(src, tmp)) return;
    const f = this.add('beam', 0.42);
    f.x0 = tmp.x;
    f.y0 = tmp.y;
    if (!w.center(dst, tmp)) return;
    f.x1 = tmp.x;
    f.y1 = tmp.y;
    f.dst = dst;
    f.track = true;
    f.color = color;
    w.particles.burst(tmp.x, tmp.y, 10, 20, 60, 0.5, COL.goldHi, 1, P_TWINKLE, -10, 2);
  }

  freeze(dst: number): void {
    const f = this.add('freeze', 0.45);
    f.dst = dst;
    f.track = true;
    if (this.w.center(dst, tmp)) {
      f.x1 = tmp.x;
      f.y1 = tmp.y;
    }
  }

  doom(x: number, y: number): void {
    const f = this.add('doom', 0.6);
    f.x0 = x;
    f.y0 = y;
    this.w.particles.burst(x, y, 26, 30, 110, 0.6, COL.doom, 2, P_GLOW, -20, 2);
    this.w.particles.burst(x, y, 14, 40, 120, 0.5, '#1a0626', 2, P_SQUARE, 60, 2);
    this.w.shake(2.5);
    this.w.camera.flash('#5a1a7a', 0.25, 0.3);
  }

  /** Golden Vowbreaker slam on the primary target, wave across the enemy line. */
  slam(dst: number, delay: number): void {
    const f = this.add('slam', 0.75);
    f.t = -delay;
    f.dst = dst;
    if (this.w.center(dst, tmp)) {
      f.x1 = tmp.x;
      f.y1 = GROUND_Y;
    } else {
      f.x1 = 260;
      f.y1 = GROUND_Y;
    }
  }

  rays(x: number, y: number, color: string, n: number, len: number, dur: number): void {
    const f = this.add('rays', dur);
    f.x0 = x;
    f.y0 = y;
    f.color = color;
    f.a = n;
    f.b = len;
  }

  ghost(canvas: HTMLCanvasElement, x: number, y: number): void {
    const f = this.add('ghost', 1.8);
    f.canvas = canvas;
    f.x0 = x;
    f.y0 = y;
  }

  interrupt(x: number, y: number, barY: number, barW: number, color: string): void {
    const f = this.add('interrupt', 0.36);
    f.x0 = x;
    f.y0 = y;
    f.color = color;
    const pt = this.w.particles;
    // the windup bar shatters into shards
    for (let i = 0; i < 18; i++) {
      const bx = x - barW / 2 + (i / 17) * barW;
      pt.spawn(bx, barY + rand(0, 3), (bx - x) * rand(2, 5) + rand(-20, 20), rand(-110, -40), rand(0.5, 0.9), i % 3 ? color : COL.white, i % 2 ? 2 : 1, P_SQUARE, 300, 0, GROUND_Y + rand(0, 10));
    }
    pt.burst(x, y, 14, 60, 160, 0.3, COL.white, 1, P_STREAK, 0, 3);
  }

  glow(x: number, y: number, r: number, color: string, dur: number, alpha = 0.9): void {
    const f = this.add('glow', dur);
    f.x0 = x;
    f.y0 = y;
    f.a = r;
    f.b = alpha;
    f.color = color;
  }

  // ───────────────────────────── update ─────────────────────────────

  update(dt: number): void {
    const w = this.w;
    const pt = w.particles;
    let n = 0;
    for (let i = 0; i < this.live.length; i++) {
      const f = this.live[i];
      const prevT = f.t;
      f.t += dt;
      if (prevT < 0 && f.t >= 0 && (f.type === 'arrow' || f.type === 'shot') && w.hand(f.src, tmp)) {
        f.x0 = tmp.x; f.y0 = tmp.y;
      }
      if (f.track && f.dst) {
        const u = w.units.get(f.dst);
        if (u && (u.alive || f.type === 'heal') && w.center(f.dst, tmp)) {
          f.x1 = tmp.x;
          f.y1 = tmp.y;
        }
      }
      if (f.type === 'drain' && f.src && w.center(f.src, tmp)) {
        f.x1 = tmp.x;
        f.y1 = tmp.y;
      }
      if (f.t >= 0) this.tick(f, dt, prevT, pt);
      if (f.t >= f.dur) {
        this.finish(f);
        this.pool.push(f);
        continue;
      }
      this.live[n++] = f;
    }
    this.live.length = n;
  }

  /** Per-frame behaviour: trails, impacts at precise moments. */
  private tick(f: Fx, dt: number, prevT: number, pt: FxWorld['particles']): void {
    const p = clamp01(f.t / f.dur);
    switch (f.type) {
      case 'bolt': {
        this.projPos(f, p, tmp);
        if (Math.random() < 0.9) pt.spawn(tmp.x, tmp.y, rand(-14, 14), rand(-18, 6), rand(0.15, 0.3), Math.random() < 0.5 ? COL.ember : COL.fire, 2, P_GLOW, -20, 2);
        if (Math.random() < 0.5) pt.spawn(tmp.x, tmp.y, rand(-20, 20), rand(-20, 20), rand(0.1, 0.25), COL.fire, 1, P_LIGHT);
        break;
      }
      case 'orb': {
        this.projPos(f, p, tmp);
        if (Math.random() < 0.8) pt.spawn(tmp.x, tmp.y, rand(-10, 10), rand(-10, 10), rand(0.15, 0.3), f.color, 2, P_GLOW, 0, 2);
        break;
      }
      case 'heal': {
        if (Math.random() < 0.5) {
          this.projPos(f, p, tmp);
          pt.spawn(tmp.x + rand(-2, 2), tmp.y + rand(-2, 2), 0, rand(-12, -4), rand(0.2, 0.4), f.color, 1, P_TWINKLE);
        }
        break;
      }
      case 'meteor': {
        if (f.t < f.a) {
          const q = easeInQuad(f.t / f.a);
          const x = lerp(f.x0, f.x1, q);
          const y = lerp(f.y0, f.y1, q);
          for (let k = 0; k < 3; k++) pt.spawn(x + rand(-3, 3), y + rand(-3, 3), rand(-20, 10), rand(-30, -5), rand(0.25, 0.5), FIRE[k + 1], rand(3, 5), P_GLOW, -10, 2);
          if (Math.random() < 0.7) pt.spawn(x + rand(-2, 2), y + rand(-2, 2), rand(-10, 10), rand(-14, -4), rand(0.5, 0.9), COL.smoke, 2, P_SQUARE, -8, 1);
        } else if (!f.hit) {
          f.hit = true;
          this.meteorImpact(f.x1, GROUND_Y - 4);
        }
        break;
      }
      case 'meteorite': {
        const q = easeInQuad(p);
        const x = lerp(f.x0, f.x1, q);
        const y = lerp(f.y0, f.y1, q);
        pt.spawn(x, y, rand(-10, 10), rand(-20, 0), rand(0.2, 0.35), Math.random() < 0.5 ? COL.ember : COL.fire, 2, P_GLOW, 0, 2);
        break;
      }
      case 'smite': {
        if (!f.hit && f.t >= f.a) {
          f.hit = true;
          pt.burst(f.x1, f.y1, 12, 30, 90, 0.4, COL.goldHi, 1, P_TWINKLE, 20, 2);
          pt.burst(f.x1, f.y1, 8, 40, 120, 0.25, COL.white, 1, P_STREAK, 0, 2);
        }
        break;
      }
      case 'sanctuary': {
        if (f.t < 1.25) {
          const rx = 74 * (0.8 + 0.2 * f.scale);
          for (let k = 0; k < 2; k++) {
            if (Math.random() < 0.7) pt.spawn(f.x0 + rand(-rx, rx) * 0.9, f.y0 - rand(0, 6), rand(-4, 4), rand(-50, -20), rand(0.6, 1.1), k ? COL.goldHi : COL.barrier, 1, P_TWINKLE, -10, 0.5);
          }
        }
        break;
      }
      case 'nova': {
        if (!f.hit && f.t >= f.b) {
          f.hit = true;
          const s = f.scale;
          pt.burst(f.x1, f.y1, Math.round(26 * s), 40, 150, 0.6, f.color, 2, P_GLOW, 0, 2);
          pt.burst(f.x1, f.y1, Math.round(16 * s), 60, 180, 0.4, COL.white, 1, P_STREAK, 60, 2);
          this.w.shake(2 + s * 1.1);
          this.w.camera.flash(f.color, 0.22 + 0.06 * s, 0.35);
        }
        break;
      }
      case 'portal': {
        if (f.t < 0.7 && Math.random() < 0.8) pt.spawn(f.x0 + rand(-8, 8), f.y0, rand(-6, 6), rand(-60, -25), rand(0.3, 0.6), Math.random() < 0.5 ? f.color : f.color2, 1, P_LIGHT, 0, 1);
        break;
      }
      case 'pillar': {
        if (f.t < 0.8) {
          for (let k = 0; k < 2; k++) pt.spawn(f.x0 + rand(-6, 6), f.y0 - rand(0, 30), rand(-6, 6), rand(-60, -20), rand(0.4, 0.8), k ? COL.goldHi : COL.white, 1, P_TWINKLE);
        }
        break;
      }
      case 'drain': {
        if (Math.random() < 0.5) this.drainSpark(f, pt);
        break;
      }
      case 'slam': {
        if (!f.hit) {
          f.hit = true;
          this.w.shake(4.5);
          this.w.camera.flash(COL.goldHi, 0.45, 0.4);
          this.groundWave(f.x1, GROUND_Y, 2.4, COL.gold);
          this.rays(f.x1, GROUND_Y - 20, COL.goldHi, 14, 50, 0.6);
          pt.burst(f.x1, GROUND_Y - 10, 30, 50, 200, 0.7, COL.gold, 2, P_GLOW, 60, 2);
        }
        break;
      }
      case 'slash':
      case 'claw':
      case 'impact': {
        if (!f.hit && prevT < 0.0001) {
          f.hit = true;
          this.meleeSparks(f);
        }
        break;
      }
      case 'emberNova': {
        if (f.t < 0.6 && Math.random() < 0.9) {
          const a = rand(0, TAU);
          const r = easeOutCubic(f.t / 1.1) * 300;
          pt.spawn(f.x0 + Math.cos(a) * r, f.y0 + Math.sin(a) * r * 0.6, rand(-20, 20), rand(-40, -10), rand(0.4, 0.8), COL.ember, 2, P_GLOW);
        }
        break;
      }
    }
    void dt;
  }

  private finish(f: Fx): void {
    const pt = this.w.particles;
    switch (f.type) {
      case 'arrow':
      case 'shot':
      case 'rainArrow':
        pt.burst(f.x1, f.y1, 4, 30, 80, 0.2, f.type === 'shot' ? '#d8d0c8' : COL.white, 1, P_STREAK, 60, 2);
        break;
      case 'bolt':
        pt.burst(f.x1, f.y1, 12, 30, 110, 0.35, COL.ember, 2, P_GLOW, -30, 3);
        pt.burst(f.x1, f.y1, 6, 50, 130, 0.25, COL.fire, 1, P_STREAK, 0, 2);
        this.ring(f.x1, f.y1, 2, 9, 1, COL.fire, 0.18);
        break;
      case 'orb':
        pt.burst(f.x1, f.y1, 10, 30, 100, 0.35, f.color, 2, P_GLOW, 0, 3);
        this.ring(f.x1, f.y1, 2, 8, 1, f.color2, 0.18);
        break;
      case 'heal':
        for (let i = 0; i < 6; i++) pt.spawn(f.x1 + rand(-6, 6), f.y1 + rand(-6, 6), rand(-6, 6), rand(-30, -12), rand(0.4, 0.7), i % 2 ? f.color : COL.white, 1, P_TWINKLE);
        this.ring(f.x1, f.y1, 3, 11, 1, f.color, 0.25);
        break;
      case 'meteorite':
        this.explosion(f.x1, f.y1, 0.7);
        break;
    }
  }

  private meleeSparks(f: Fx): void {
    const pt = this.w.particles;
    const s = f.scale;
    const col = f.type === 'claw' ? '#ff9a8a' : f.type === 'impact' ? f.color : COL.white;
    const dir = f.type === 'claw' ? -1 : 1;
    for (let i = 0; i < Math.round(5 * s); i++) {
      pt.spawn(f.x1, f.y1, dir * rand(20, 120), rand(-90, 40), rand(0.12, 0.28), i % 2 ? col : COL.fire, 1, P_STREAK, 200, 2);
    }
    if (f.type === 'impact') {
      this.w.shake(1.5 * s);
      this.w.camera.kick(2 * s, 0);
    } else if (f.type === 'slash' && s > 1) {
      this.w.shake(1.1);
      this.w.camera.kick(1, 0);
    }
  }

  private meteorImpact(x: number, y: number): void {
    const w = this.w;
    const pt = w.particles;
    w.shake(5.5);
    w.camera.flash('#ffd29a', 0.55, 0.45);
    this.groundWave(x, GROUND_Y, 2.8, COL.ember);
    this.ring(x, GROUND_Y - 2, 6, 80, 0.3, COL.fire, 0.45, LAYER_BACK, 2);
    for (let i = 0; i < 46; i++) {
      pt.spawn(x + rand(-12, 12), y, rand(-170, 170), rand(-240, -70), rand(0.7, 1.3), i % 3 ? '#3a2a24' : i % 2 ? COL.fireDeep : '#6a4a3a', i % 4 ? 1 : 2, P_SQUARE, 420, 0, GROUND_Y + rand(0, 12));
    }
    for (let i = 0; i < 30; i++) {
      const a = rand(Math.PI, TAU);
      const s = rand(40, 170);
      pt.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 0.9), FIRE[i % FIRE.length], rand(3, 6), P_GLOW, -30, 2.5);
    }
    for (let i = 0; i < 14; i++) pt.spawn(x + rand(-30, 30), y - rand(0, 10), rand(-15, 15), rand(-30, -10), rand(0.9, 1.6), i % 2 ? COL.smoke : '#2e2430', 3, P_SQUARE, -8, 1);
    this.glow(x, GROUND_Y - 6, 40, COL.ember, 0.8, 0.8);
  }

  private drainSpark(f: Fx, pt: FxWorld['particles']): void {
    const b = this.w.battle;
    let ox = f.x0;
    let oy = f.y0;
    if (f.scale >= 2 && b) {
      const hs = b.heroes;
      const h = hs[(Math.random() * hs.length) | 0];
      if (h && h.alive && this.w.center(h.id, tmp)) {
        ox = tmp.x;
        oy = tmp.y;
      }
    }
    const t = 0.5;
    pt.spawn(ox, oy, (f.x1 - ox) / t + rand(-20, 20), (f.y1 - oy) / t + rand(-30, 10), t, COL.lanternGreen, 1, P_LIGHT);
  }

  /** Arc projectile position at progress p. */
  private projPos(f: Fx, p: number, out: Vec): void {
    out.x = lerp(f.x0, f.x1, p);
    out.y = lerp(f.y0, f.y1, p);
    if (f.type === 'arrow' || f.type === 'shot') out.y -= f.a * 4 * p * (1 - p);
    else if (f.type === 'bolt' || f.type === 'orb') out.y += Math.sin(p * Math.PI) * f.a;
    else if (f.type === 'heal') out.y -= 16 * 4 * p * (1 - p);
  }

  // ───────────────────────────── draw ─────────────────────────────

  draw(g: Ctx, layer: number, time: number): void {
    for (let i = 0; i < this.live.length; i++) {
      const f = this.live[i];
      if (f.layer !== layer || f.t < 0) continue;
      this.drawOne(g, f, time);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  private drawOne(g: Ctx, f: Fx, time: number): void {
    const p = clamp01(f.t / f.dur);
    switch (f.type) {
      case 'arrow':
      case 'shot':
      case 'rainArrow': {
        let x: number;
        let y: number;
        let dx: number;
        let dy: number;
        if (f.type === 'rainArrow') {
          x = lerp(f.x0, f.x1, p);
          y = lerp(f.y0, f.y1, p);
          dx = f.x1 - f.x0;
          dy = f.y1 - f.y0;
        } else {
          this.projPos(f, p, tmp);
          x = tmp.x;
          y = tmp.y;
          dx = f.x1 - f.x0;
          dy = f.y1 - f.y0 - f.a * 4 * (1 - 2 * p);
        }
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        g.globalAlpha = 1;
        g.fillStyle = f.type === 'shot' ? '#6a5a5a' : '#c8a070';
        pxLine(g, x - ux * 6, y - uy * 6, x - ux * 1, y - uy * 1);
        g.fillStyle = f.type === 'shot' ? f.color : COL.white;
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
        g.fillStyle = f.type === 'shot' ? '#2a1a20' : '#e8e0d0';
        g.fillRect(Math.round(x - ux * 6), Math.round(y - uy * 6) - 1, 1, 1);
        g.fillRect(Math.round(x - ux * 6), Math.round(y - uy * 6) + 1, 1, 1);
        if (f.type !== 'shot') {
          g.globalAlpha = 0.35;
          g.fillStyle = COL.white;
          pxLine(g, x - ux * 12, y - uy * 12, x - ux * 7, y - uy * 7);
        }
        break;
      }
      case 'bolt': {
        this.projPos(f, p, tmp);
        g.globalCompositeOperation = 'lighter';
        const gl = glowSprite(COL.ember, 6);
        g.globalAlpha = 0.9;
        g.drawImage(gl, Math.round(tmp.x - 6), Math.round(tmp.y - 6));
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.fillStyle = COL.ember;
        g.fillRect(Math.round(tmp.x) - 2, Math.round(tmp.y) - 1, 4, 3);
        g.fillStyle = COL.goldHi;
        g.fillRect(Math.round(tmp.x) - 1, Math.round(tmp.y) - 1, 2, 2);
        break;
      }
      case 'orb': {
        this.projPos(f, p, tmp);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.85;
        g.drawImage(glowSprite(f.color, 5), Math.round(tmp.x - 5), Math.round(tmp.y - 5));
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.fillStyle = f.color;
        g.fillRect(Math.round(tmp.x) - 1, Math.round(tmp.y) - 1, 3, 3);
        g.fillStyle = f.color2;
        g.fillRect(Math.round(tmp.x), Math.round(tmp.y), 1, 1);
        break;
      }
      case 'heal': {
        g.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 3; k++) {
          const q = clamp01(p * 1.2 - k * 0.1);
          tmp.x = lerp(f.x0, f.x1, q) + Math.sin(q * 9 + k * 2) * 2;
          tmp.y = lerp(f.y0, f.y1, q) - (14 + k * 4) * 4 * q * (1 - q);
          g.globalAlpha = 0.8;
          g.drawImage(glowSprite(f.color, 3), Math.round(tmp.x - 3), Math.round(tmp.y - 3));
          g.fillStyle = COL.white;
          g.fillRect(Math.round(tmp.x), Math.round(tmp.y), 1, 1);
        }
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'smite': {
        if (f.t < f.a) {
          const q = f.t / f.a;
          const x = lerp(f.x0, f.x1, q);
          const y = lerp(f.y0, f.y1 - 26, easeOutQuad(q)) - 10 * Math.sin(q * Math.PI);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.9;
          g.drawImage(glowSprite(COL.gold, 4), Math.round(x - 4), Math.round(y - 4));
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = COL.white;
          g.fillRect(Math.round(x), Math.round(y), 1, 1);
        } else {
          const q = clamp01((f.t - f.a) / (f.dur - f.a));
          const wdt = Math.max(1, Math.round(6 * (1 - q * 0.7)));
          const x = Math.round(f.x1);
          const yb = Math.round(f.y1 + 5);
          g.globalAlpha = (1 - q) * 0.55;
          g.fillStyle = COL.gold;
          g.fillRect(x - Math.ceil(wdt / 2) - 1, 0, wdt + 2, yb);
          g.globalAlpha = 1 - q;
          g.fillStyle = COL.white;
          g.fillRect(x - Math.floor(wdt / 4), 0, Math.max(1, Math.round(wdt / 2)), yb);
          g.fillStyle = COL.goldHi;
          pxEllipse(g, x, yb, 7 * (1 - q) + 2, 2);
        }
        break;
      }
      case 'slash': {
        const s = f.scale;
        const r = 9 * s;
        const head = lerp(-2.1, 1.3, easeOutCubic(p));
        const cx = f.x1 - 3 * f.a;
        const cy = f.y1;
        const fade = p > 0.6 ? (1 - p) / 0.4 : 1;
        for (let k = 0; k < 4; k++) {
          g.globalAlpha = fade * (1 - k * 0.24);
          g.fillStyle = k === 0 ? f.color : f.color2;
          const a1 = head - k * 0.32;
          const a0 = a1 - 0.34;
          const th = k === 0 ? (s > 1 ? 3 : 2) : k === 1 && s > 1 ? 2 : 1;
          if (f.a > 0) pxArc(g, cx, cy, r - k * 0.6, r * 0.85, a0, a1, th);
          else pxArc(g, cx, cy, r - k * 0.6, r * 0.85, Math.PI - a1, Math.PI - a0, th);
        }
        break;
      }
      case 'claw': {
        const s = f.scale;
        const grow = easeOutCubic(clamp01(p * 2.2));
        const fade = p > 0.5 ? (1 - p) / 0.5 : 1;
        g.globalAlpha = fade;
        for (let k = 0; k < 3; k++) {
          g.fillStyle = p < 0.35 ? COL.white : k === 1 ? '#ff6a6a' : '#ffb0a0';
          const ox = (k - 1) * 3 * s;
          const x0 = f.x1 + 5 * s + ox;
          const y0 = f.y1 - 7 * s;
          pxLine(g, x0, y0, x0 - 9 * s * grow, y0 + 13 * s * grow, s > 1 ? 2 : 1);
        }
        break;
      }
      case 'impact': {
        const s = f.scale;
        const fade = 1 - p;
        g.globalAlpha = fade;
        g.fillStyle = f.color;
        const r0 = 3 + p * 6 * s;
        const r1 = 6 + easeOutCubic(p) * 15 * s;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + 0.2;
          pxLine(g, f.x1 + Math.cos(a) * r0, f.y1 + Math.sin(a) * r0, f.x1 + Math.cos(a) * r1, f.y1 + Math.sin(a) * r1, p < 0.3 ? 2 : 1);
        }
        g.fillStyle = COL.white;
        pxRing(g, f.x1, f.y1, 3 + p * 12 * s, 3 + p * 12 * s);
        if (p < 0.25) {
          g.globalAlpha = 1;
          pxEllipse(g, f.x1, f.y1, 4 * s, 4 * s);
        }
        break;
      }
      case 'chain': {
        const seed = f.seed + Math.floor(f.t / 0.035);
        const flick = Math.floor(f.t / 0.03) % 2 ? 1 : 0.55;
        g.globalAlpha = flick * (1 - p * 0.6);
        g.fillStyle = '#8a6bff';
        pxLightning(g, f.x0, f.y0, f.x1, f.y1, seed, 6, 2);
        g.fillStyle = '#e8e0ff';
        pxLightning(g, f.x0, f.y0, f.x1, f.y1, seed, 6, 1);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.6 * (1 - p);
        g.drawImage(glowSprite('#8a6bff', 6), Math.round(f.x1 - 6), Math.round(f.y1 - 6));
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'volley': {
        g.fillStyle = '#e8dcc0';
        for (let k = 0; k < 7; k++) {
          const q = clamp01((f.t - k * 0.04) / 0.22);
          if (q <= 0 || q >= 1) continue;
          const tx = f.x0 + 30 + k * 10;
          const x = lerp(f.x0, tx, q);
          const y = lerp(f.y0, -12, easeInQuad(q));
          const dx = tx - f.x0;
          const dy = -12 - f.y0;
          const l = Math.sqrt(dx * dx + dy * dy);
          g.globalAlpha = 1;
          pxLine(g, x, y, x - (dx / l) * 6, y - (dy / l) * 6);
        }
        break;
      }
      case 'meteor': {
        if (f.t < f.a) {
          const q = easeInQuad(f.t / f.a);
          const x = lerp(f.x0, f.x1, q);
          const y = lerp(f.y0, f.y1, q);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.95;
          const gl = glowSprite(COL.ember, 16);
          g.drawImage(gl, Math.round(x - 16), Math.round(y - 16));
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
          g.fillStyle = '#4a2418';
          pxEllipse(g, x - 1, y - 1, 6, 6);
          g.fillStyle = COL.fireDeep;
          pxEllipse(g, x + 1, y + 1, 5, 5);
          g.fillStyle = COL.fire;
          pxEllipse(g, x + 2, y + 2, 3, 3);
          g.fillStyle = COL.goldHi;
          g.fillRect(Math.round(x) + 2, Math.round(y) + 1, 2, 2);
        }
        break;
      }
      case 'meteorite': {
        const q = easeInQuad(p);
        const x = lerp(f.x0, f.x1, q);
        const y = lerp(f.y0, f.y1, q);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.9;
        g.drawImage(glowSprite(COL.ember, 7), Math.round(x - 7), Math.round(y - 7));
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.fillStyle = COL.fireDeep;
        g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
        g.fillStyle = COL.goldHi;
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
        break;
      }
      case 'reticle': {
        const s = f.scale;
        const rx = 34 * s + 4;
        const pulse = 0.55 + 0.45 * Math.sin(time * 22);
        g.globalAlpha = 0.5 + 0.4 * pulse;
        g.fillStyle = '#ff5a3d';
        pxRing(g, f.x0, f.y0, rx, rx * 0.2);
        g.fillStyle = COL.fire;
        const inner = lerp(rx, 3, easeInQuad(p));
        pxRing(g, f.x0, f.y0, inner, inner * 0.2);
        g.globalAlpha = 0.18 + 0.12 * pulse;
        g.fillStyle = '#ff5a3d';
        pxEllipse(g, f.x0, f.y0, rx, rx * 0.2);
        break;
      }
      case 'explosion': {
        const s = f.scale;
        const r = (5 + 10 * s) * easeOutCubic(clamp01(p * 2.4));
        const col = p < 0.12 ? COL.white : p < 0.3 ? COL.goldHi : p < 0.55 ? COL.fire : COL.ember;
        g.globalAlpha = (1 - p) * 0.9;
        g.fillStyle = col;
        pxEllipse(g, f.x0, f.y0, r, r * 0.85);
        g.globalAlpha = 1 - p;
        g.fillStyle = COL.ember;
        pxRing(g, f.x0, f.y0, r * 1.25, r * 1.05);
        if (p < 0.2) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 1 - p / 0.2;
          const gr = Math.round(10 + 10 * s);
          g.drawImage(glowSprite(COL.fire, gr), Math.round(f.x0 - gr), Math.round(f.y0 - gr));
          g.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'sanctuary':
        this.drawSanctuary(g, f, p, time);
        break;
      case 'nova':
        this.drawNova(g, f, time);
        break;
      case 'emberNova': {
        const r = easeOutCubic(p) * 430;
        g.globalAlpha = 1 - p;
        g.fillStyle = COL.gold;
        pxRing(g, f.x0, f.y0, r, r * 0.62, 3);
        g.fillStyle = COL.white;
        pxRing(g, f.x0, f.y0, r * 0.82, r * 0.5, 1);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (1 - p) * 0.8;
        const gl = glowSprite(COL.gold, 48);
        g.drawImage(gl, Math.round(f.x0 - 48), Math.round(f.y0 - 48));
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'portal': {
        const open = f.t < 0.2 ? easeOutBack(f.t / 0.2) : f.t > 0.7 ? 1 - (f.t - 0.7) / 0.25 : 1;
        const rx = 12 * open;
        const ry = 3.2 * open;
        g.globalAlpha = 0.85;
        g.fillStyle = '#12061a';
        pxEllipse(g, f.x0, f.y0, rx, ry);
        g.globalAlpha = 1;
        g.fillStyle = f.color;
        pxRing(g, f.x0, f.y0, rx, ry);
        g.fillStyle = f.color2;
        const a = time * 8;
        g.fillRect(Math.round(f.x0 + Math.cos(a) * rx), Math.round(f.y0 + Math.sin(a) * ry), 2, 1);
        g.fillRect(Math.round(f.x0 - Math.cos(a) * rx), Math.round(f.y0 - Math.sin(a) * ry), 2, 1);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.45 * open;
        g.drawImage(glowSprite(f.color, 10), Math.round(f.x0 - 10), Math.round(f.y0 - 14));
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'hex': {
        const expand = f.c > 0;
        const k = expand ? 1 + easeOutCubic(p) * 0.8 : 1.7 - 0.7 * easeOutCubic(p);
        const r = f.a * k;
        g.globalAlpha = expand ? 1 - p : bump(p) * 0.9 + 0.1;
        g.fillStyle = expand ? COL.wardHi : COL.ward;
        pxHex(g, f.x1, f.y1, r, r * 1.05, time * (expand ? 0 : 1.5));
        g.fillStyle = COL.wardHi;
        pxHex(g, f.x1, f.y1, r * 0.82, r * 0.86, -time * 1.2);
        break;
      }
      case 'splash': {
        const s = f.scale;
        for (let k = 0; k < 2; k++) {
          const q = clamp01((f.t - k * 0.15) / (f.dur - 0.15));
          if (q <= 0) continue;
          const rx = (5 + q * 24) * s;
          g.globalAlpha = (1 - q) * 0.9;
          g.fillStyle = k ? '#5fe0d0' : COL.white;
          pxRing(g, f.x0, f.y0, rx, rx * 0.22);
        }
        break;
      }
      case 'drain': {
        g.globalCompositeOperation = 'lighter';
        const b = this.w.battle;
        const origins = f.scale >= 2 && b ? b.heroes.length : 1;
        for (let o = 0; o < origins; o++) {
          let ox = f.x0;
          let oy = f.y0;
          if (f.scale >= 2 && b) {
            const h = b.heroes[o];
            if (!h || !h.alive || !this.w.center(h.id, tmp)) continue;
            ox = tmp.x;
            oy = tmp.y;
          }
          for (let k = 0; k < 3; k++) {
            const q = clamp01((f.t - k * 0.09 - o * 0.05) / (f.dur * 0.72));
            if (q <= 0 || q >= 1) continue;
            const mx = (ox + f.x1) / 2;
            const my = Math.min(oy, f.y1) - 26 - k * 7;
            const u = 1 - q;
            const x = u * u * ox + 2 * u * q * mx + q * q * f.x1;
            const y = u * u * oy + 2 * u * q * my + q * q * f.y1;
            g.globalAlpha = 0.9 * (1 - q * 0.5);
            g.drawImage(glowSprite(COL.lanternGreen, 3), Math.round(x - 3), Math.round(y - 3));
            g.fillStyle = COL.white;
            g.fillRect(Math.round(x), Math.round(y), 1, 1);
          }
        }
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'pillar': {
        const wdt = Math.max(1, Math.round(10 * (1 - p * 0.75)));
        const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
        const x = Math.round(f.x0);
        g.globalAlpha = a * 0.5;
        g.fillStyle = f.color;
        g.fillRect(x - Math.ceil(wdt / 2) - 1, 0, wdt + 2, Math.round(f.y0));
        g.globalAlpha = a;
        g.fillStyle = COL.white;
        g.fillRect(x - Math.floor(wdt / 4), 0, Math.max(1, Math.round(wdt / 2)), Math.round(f.y0));
        break;
      }
      case 'ring': {
        const r = lerp(f.a, f.b, easeOutCubic(p));
        g.globalAlpha = 1 - p;
        g.fillStyle = f.color;
        pxRing(g, f.x0, f.y0, r, r * f.c, Math.max(1, Math.round(f.scale * (1 - p * 0.5))));
        break;
      }
      case 'groundWave': {
        const s = f.scale;
        const q = easeOutCubic(p);
        const rx = 4 + q * 62 * s;
        const ry = 1 + q * 6 * s;
        g.globalAlpha = 1 - p;
        g.fillStyle = f.color;
        pxArc(g, f.x0, f.y0, rx, ry, Math.PI, TAU, p < 0.4 ? 2 : 1);
        g.globalAlpha = (1 - p) * 0.5;
        pxArc(g, f.x0, f.y0, rx * 0.8, ry * 0.8, Math.PI, TAU, 1);
        g.globalAlpha = (1 - p) * 0.35;
        g.fillStyle = COL.white;
        pxArc(g, f.x0, f.y0, rx, ry, 0, Math.PI, 1);
        break;
      }
      case 'beam': {
        const a = 1 - p;
        g.globalAlpha = a * 0.6;
        g.fillStyle = f.color;
        pxLine(g, f.x0, f.y0, f.x1, f.y1, 3);
        g.globalAlpha = a;
        g.fillStyle = COL.white;
        pxLine(g, f.x0, f.y0, f.x1, f.y1, 1);
        break;
      }
      case 'freeze': {
        g.globalAlpha = 1;
        g.fillStyle = COL.ice;
        const r = lerp(18, 4, easeInQuad(p));
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + 0.3;
          pxLine(g, f.x1 + Math.cos(a) * (r + 4), f.y1 + Math.sin(a) * (r + 4), f.x1 + Math.cos(a) * r, f.y1 + Math.sin(a) * r);
        }
        if (p > 0.7) {
          g.globalAlpha = (1 - p) / 0.3;
          g.fillStyle = COL.white;
          pxEllipse(g, f.x1, f.y1, 9, 11);
        }
        break;
      }
      case 'doom': {
        const r = 3 + 15 * easeOutCubic(p);
        g.globalAlpha = (1 - p) * 0.9;
        g.fillStyle = COL.doomDeep;
        pxEllipse(g, f.x0, f.y0, r, r);
        g.fillStyle = COL.doom;
        pxRing(g, f.x0, f.y0, r * 1.15, r * 1.15, p < 0.3 ? 2 : 1);
        if (p < 0.5) {
          g.globalAlpha = 1 - p * 2;
          g.fillStyle = '#f0d0ff';
          // tiny skull
          const x = Math.round(f.x0) - 2;
          const y = Math.round(f.y0) - 3;
          g.fillRect(x, y, 5, 3);
          g.fillRect(x + 1, y + 3, 3, 2);
          g.fillStyle = COL.doomDeep;
          g.fillRect(x + 1, y + 1, 1, 1);
          g.fillRect(x + 3, y + 1, 1, 1);
        }
        break;
      }
      case 'slam': {
        const wdt = Math.max(2, Math.round(14 * (1 - p)));
        g.globalAlpha = (1 - p) * 0.6;
        g.fillStyle = COL.gold;
        g.fillRect(Math.round(f.x1 - wdt / 2) - 2, 0, wdt + 4, Math.round(f.y1));
        g.globalAlpha = 1 - p;
        g.fillStyle = COL.goldHi;
        g.fillRect(Math.round(f.x1 - wdt / 4), 0, Math.max(1, Math.round(wdt / 2)), Math.round(f.y1));
        break;
      }
      case 'rays': {
        const n = f.a;
        const len = f.b;
        g.fillStyle = f.color;
        g.globalAlpha = 1 - p;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + f.t * 0.5 + hash01(f.seed + k) * 0.3;
          const r0 = 5 + p * 22;
          const r1 = r0 + len * easeOutCubic(clamp01(p * 3)) * (0.6 + 0.4 * hash01(f.seed * 3 + k));
          pxLine(g, f.x0 + Math.cos(a) * r0, f.y0 + Math.sin(a) * r0, f.x0 + Math.cos(a) * r1, f.y0 + Math.sin(a) * r1, k % 3 === 0 && p < 0.4 ? 2 : 1);
        }
        break;
      }
      case 'ghost': {
        if (!f.canvas) break;
        const y = f.y0 - 18 * easeOutQuad(p);
        const x = f.x0 + Math.sin(f.t * 4) * 2;
        g.globalAlpha = 0.55 * (1 - p);
        paintCanvas(g, f.canvas, x, y);
        break;
      }
      case 'interrupt': {
        const r0 = 4 + p * 10;
        const r1 = 10 + easeOutCubic(p) * 26;
        g.globalAlpha = 1 - p;
        g.fillStyle = f.color;
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU;
          pxLine(g, f.x0 + Math.cos(a) * r0, f.y0 + Math.sin(a) * r0, f.x0 + Math.cos(a) * r1, f.y0 + Math.sin(a) * r1, p < 0.35 ? 2 : 1);
        }
        g.fillStyle = COL.white;
        pxRing(g, f.x0, f.y0, 3 + p * 20, 3 + p * 20, p < 0.3 ? 2 : 1);
        if (p < 0.2) {
          g.globalAlpha = 1;
          pxStar(g, f.x0, f.y0, 4);
        }
        break;
      }
      case 'glow': {
        const r = Math.round(f.a);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = f.b * (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85);
        g.drawImage(glowSprite(f.color, r), Math.round(f.x0 - r), Math.round(f.y0 - r));
        g.globalCompositeOperation = 'source-over';
        break;
      }
    }
    g.globalAlpha = 1;
  }

  private drawSanctuary(g: Ctx, f: Fx, p: number, time: number): void {
    const grow = easeOutBack(clamp01(f.t / 0.35));
    const fade = f.t > f.dur - 0.55 ? clamp01((f.dur - f.t) / 0.55) : 1;
    const s = 0.75 + 0.25 * f.scale;
    const rx = 76 * grow * s;
    const ry = 56 * grow * s;
    const cx = f.x0;
    const cy = f.y0;
    // translucent dome (upper half only)
    g.globalAlpha = 0.13 * fade;
    g.fillStyle = COL.barrier;
    const iy = Math.ceil(ry);
    for (let dy = -iy; dy <= 0; dy++) {
      const q = 1 - (dy * dy) / (ry * ry || 1);
      if (q <= 0) continue;
      const span = rx * Math.sqrt(q);
      g.fillRect(Math.round(cx - span), Math.round(cy) + dy, Math.round(span * 2), 1);
    }
    // outline + inner rim
    g.globalAlpha = 0.85 * fade;
    g.fillStyle = COL.barrierHi;
    pxArc(g, cx, cy, rx, ry, Math.PI, TAU, 1);
    g.globalAlpha = 0.35 * fade;
    g.fillStyle = COL.gold;
    pxArc(g, cx, cy, rx - 3, ry - 3, Math.PI, TAU, 1);
    // moving shimmer
    const sh = Math.PI + ((time * 0.9) % 1) * Math.PI;
    g.globalAlpha = 0.9 * fade;
    g.fillStyle = COL.white;
    pxArc(g, cx, cy, rx, ry, sh, sh + 0.32, 2);
    // ground sigil
    g.globalAlpha = 0.75 * fade;
    g.fillStyle = COL.gold;
    pxRing(g, cx, cy + 1, rx * 0.95, 5);
    g.fillStyle = COL.goldHi;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + time * 1.2;
      g.fillRect(Math.round(cx + Math.cos(a) * rx * 0.95), Math.round(cy + 1 + Math.sin(a) * 5), 2, 1);
    }
    // light columns over each hero
    const b = this.w.battle;
    if (b && f.t < 1.1) {
      const a = bump(f.t / 1.1) * 0.35 * fade;
      for (const h of b.heroes) {
        if (!h.alive) continue;
        g.globalAlpha = a;
        g.fillStyle = COL.goldHi;
        g.fillRect(Math.round(h.x) - 3, Math.round(cy - ry), 7, Math.round(ry + 2));
        g.globalAlpha = a * 1.6;
        g.fillStyle = COL.white;
        g.fillRect(Math.round(h.x) - 1, Math.round(cy - ry), 2, Math.round(ry + 2));
      }
    }
    void p;
  }

  private drawNova(g: Ctx, f: Fx, time: number): void {
    const travel = f.b;
    const s = f.scale;
    const ground = GROUND_Y + 3;
    const height = 60 + 18 * s;
    if (f.t < travel + 0.12) {
      const q = clamp01(f.t / travel);
      const front = lerp(f.x0 - 6, 40, easeInQuad(q));
      const fadeTail = f.t > travel ? 1 - (f.t - travel) / 0.12 : 1;
      for (let c = 0; c < 46; c++) {
        const x = Math.round(front + c);
        if (x < 0 || x > 400) continue;
        const jag = hash01(x * 7 + Math.floor(time * 30)) * 10;
        const top = Math.round(ground - height + jag + c * 0.6);
        g.globalAlpha = fadeTail * (c < 2 ? 1 : 0.75 * (1 - c / 46));
        g.fillStyle = c < 2 ? COL.white : c < 6 ? f.color : f.color2;
        g.fillRect(x, top, 1, ground - top);
      }
    }
    if (f.t >= travel) {
      const q = clamp01((f.t - travel) / (f.dur - travel));
      const r = 18 + easeOutCubic(q) * 56 * (0.7 + 0.3 * s);
      g.globalAlpha = (1 - q) * 0.55;
      g.fillStyle = f.color2;
      pxEllipse(g, f.x1, f.y1, r, r * 0.6);
      g.globalAlpha = 1 - q;
      g.fillStyle = f.color;
      pxRing(g, f.x1, f.y1, r, r * 0.6, 2);
      g.fillStyle = COL.white;
      pxRing(g, f.x1, f.y1, r * 0.7, r * 0.42, 1);
    }
  }
}
