// Pooled particle system (structure of arrays, swap-remove). Zero allocations per frame.
// All coordinates are world pixels (400 x 180). Drawn crisp (integer rects) or as additive glows.
import { glowSprite, pxLine, pxStar, pxEllipse } from './pixel.ts';

export const P_SQUARE = 0; // solid pixel square, fades out
export const P_GLOW = 1; // additive soft glow (embers, motes)
export const P_STREAK = 2; // short line along velocity (sparks, rain)
export const P_TWINKLE = 3; // plus-shaped sparkle that blinks
export const P_LIGHT = 4; // additive solid pixel (bright sparks)

export class Particles {
  readonly cap: number;
  n = 0;
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private floor: Float32Array;
  private delay: Float32Array;
  private kind: Uint8Array;
  private col: string[];

  constructor(cap = 640) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.floor = new Float32Array(cap);
    this.delay = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.col = new Array<string>(cap).fill('#fff');
  }

  get free(): number {
    return this.cap - this.n;
  }

  clear(): void {
    this.n = 0;
  }

  /** Spawn one particle. Returns false when the pool is full (the spawn is dropped). */
  spawn(x: number, y: number, vx: number, vy: number, life: number, color: string, size = 1, kind = P_SQUARE, gravity = 0, drag = 0, floor = 1e9, delay = 0): boolean {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.floor[i] = floor;
    this.delay[i] = delay;
    this.kind[i] = kind;
    this.col[i] = color;
    return true;
  }

  /** Radial burst helper. */
  burst(x: number, y: number, count: number, speedMin: number, speedMax: number, life: number, color: string, size = 1, kind = P_SQUARE, gravity = 0, drag = 0, floor = 1e9): void {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speedMin + Math.random() * (speedMax - speedMin);
      if (!this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), color, size, kind, gravity, drag, floor)) return;
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    let i = 0;
    while (i < this.n) {
      if (this.delay[i] > 0) {
        this.delay[i] -= dt;
        i++;
        continue;
      }
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.remove(i);
        continue;
      }
      const d = this.drag[i];
      if (d > 0) {
        const f = Math.max(0, 1 - d * dt);
        this.vx[i] *= f;
        this.vy[i] *= f;
      }
      this.vy[i] += this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      if (this.y[i] > this.floor[i] && this.vy[i] > 0) {
        this.y[i] = this.floor[i];
        this.vy[i] *= -0.32;
        this.vx[i] *= 0.6;
        if (this.vy[i] > -12) {
          this.vy[i] = 0;
          this.grav[i] = 0;
          this.vx[i] *= 0.5;
        }
      }
      i++;
    }
  }

  private remove(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.size[i] = this.size[j];
    this.grav[i] = this.grav[j];
    this.drag[i] = this.drag[j];
    this.floor[i] = this.floor[j];
    this.delay[i] = this.delay[j];
    this.kind[i] = this.kind[j];
    this.col[i] = this.col[j];
  }

  draw(g: CanvasRenderingContext2D, time: number): void {
    if (this.n === 0) return;
    let last = '';
    // pass 1: normal blending
    for (let i = 0; i < this.n; i++) {
      if (this.delay[i] > 0) continue;
      const k = this.kind[i];
      if (k === P_GLOW || k === P_LIGHT) continue;
      const f = this.life[i] / this.max[i];
      g.globalAlpha = f < 0.45 ? f / 0.45 : 1;
      const c = this.col[i];
      if (c !== last) {
        g.fillStyle = c;
        last = c;
      }
      const s = this.size[i];
      const x = Math.round(this.x[i] - s / 2);
      const y = Math.round(this.y[i] - s / 2);
      if (k === P_SQUARE) {
        pxEllipse(g, x, y, s * .65, s * .45);
      } else if (k === P_STREAK) {
        const vx = this.vx[i];
        const vy = this.vy[i];
        const sp = Math.sqrt(vx * vx + vy * vy) || 1;
        const len = Math.min(7, sp * 0.03 + 1);
        const ux = vx / sp;
        const uy = vy / sp;
        pxLine(g, this.x[i], this.y[i], this.x[i] - ux * len, this.y[i] - uy * len, s);
      } else if (k === P_TWINKLE) {
        const blink = Math.sin(time * 24 + i * 1.7) > -0.3;
        if (!blink) continue;
        pxStar(g, x, y, f > .35 ? s : .5);
      }
    }
    // pass 2: additive light
    g.globalCompositeOperation = 'lighter';
    last = '';
    for (let i = 0; i < this.n; i++) {
      if (this.delay[i] > 0) continue;
      const k = this.kind[i];
      if (k !== P_GLOW && k !== P_LIGHT) continue;
      const f = this.life[i] / this.max[i];
      g.globalAlpha = f < 0.5 ? f / 0.5 : 1;
      const s = this.size[i];
      if (k === P_GLOW) {
        const spr = glowSprite(this.col[i], s);
        g.drawImage(spr, Math.round(this.x[i] - (spr.width >> 1)), Math.round(this.y[i] - (spr.height >> 1)));
      } else {
        const c = this.col[i];
        if (c !== last) {
          g.fillStyle = c;
          last = c;
        }
        pxEllipse(g, this.x[i], this.y[i], s * .6, s * .6);
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
}
