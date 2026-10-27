// Loot fountains: coins / embers / shards burst out of a defeated enemy (world space, gravity +
// bounce), then fly on a curve across a fixed full-window overlay canvas into the HUD counters
// (LootTargets) and sparkle on arrival. Boss kills add a coin rain from the sky.
import { GROUND_Y, WORLD_W } from '../../core/battle.ts';
import type { LootTargets } from '../api.ts';
import { glowSprite, patternCanvas } from './pixel.ts';
import { clamp01, rand } from './util.ts';

type Kind = 'gold' | 'ember' | 'shard';

const COIN_FRAMES: readonly (readonly string[])[] = [
  ['.yyyy.', 'yhhyyo', 'yhyyyo', 'yyyyyo', 'yyyyoo', '.oooo.'],
  ['..yy..', '.yhyo.', '.yhyo.', '.yyyo.', '.yyoo.', '..oo..'],
  ['..y...', '..ho..', '..yo..', '..yo..', '..yo..', '..o...'],
  ['..yy..', '.oyhy.', '.oyhy.', '.oyyy.', '.ooyy.', '..oo..'],
];
const COIN_COLS = { y: '#ffd84a', h: '#fff6c0', o: '#b8862a' };
const COIN_IDS = ['coin0', 'coin1', 'coin2', 'coin3'] as const;
const SHARD_ROWS = ['..c..', '.chc.', '.chc.', 'ccccb', '.cbb.', '..b..'];
const SHARD_COLS = { c: '#6fe3ff', h: '#e8fdff', b: '#2a8ab0' };

class Piece {
  kind: Kind = 'gold';
  phase = 0; // 0 burst (world), 1 flight (client), 2 done
  delay = 0;
  t = 0;
  dur = 0.5;
  // world (burst)
  wx = 0;
  wy = 0;
  vx = 0;
  vy = 0;
  floor = GROUND_Y;
  // client (flight)
  sx = 0;
  sy = 0;
  cx = 0;
  cy = 0;
  x = 0;
  y = 0;
  spin = 0;
}

interface TargetCache {
  x: number;
  y: number;
  at: number;
}

export class LootLayer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private pieces: Piece[] = [];
  private pool: Piece[] = [];
  private readonly cap = 180;
  private targets: LootTargets = {};
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private dirty = false;
  private time = 0;
  private cache: Record<Kind, TargetCache> = {
    gold: { x: 0, y: 0, at: -9 },
    ember: { x: 0, y: 0, at: -9 },
    shard: { x: 0, y: 0, at: -9 },
  };
  // sparkles (client css px), SoA
  private readonly sparkCap = 220;
  private sn = 0;
  private spx = new Float32Array(220);
  private spy = new Float32Array(220);
  private svx = new Float32Array(220);
  private svy = new Float32Array(220);
  private sl = new Float32Array(220);
  private sm = new Float32Array(220);
  private sc: string[] = new Array<string>(220).fill('#fff');
  /** World canvas client rect provider (set by the renderer). */
  worldRect: () => DOMRect | null = () => null;

  mount(): void {
    if (this.canvas || typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.className = 'emb-loot-overlay';
    const st = c.style;
    st.position = 'fixed';
    st.left = '0';
    st.top = '0';
    st.pointerEvents = 'none';
    st.zIndex = '9000';
    st.imageRendering = 'auto';
    document.body.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.resize();
  }

  setTargets(t: LootTargets): void {
    this.targets = t;
    this.cache.gold.at = this.cache.ember.at = this.cache.shard.at = -9;
  }

  resize(): void {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this.cssW && h === this.cssH && dpr === this.dpr) return;
    this.dpr = dpr;
    this.cssW = w;
    this.cssH = h;
    // CSS box == innerWidth x innerHeight exactly, so the backing store maps 1:1 to client px
    // (100vw/100vh can differ from innerWidth/innerHeight, e.g. with scrollbars or mobile toolbars).
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.dirty = true;
  }

  get active(): boolean {
    return this.pieces.length > 0 || this.sn > 0;
  }

  /** Spawn a loot fountain at world (x, y). */
  spawn(kind: Kind, amount: number, x: number, y: number): void {
    const n = Math.max(2, Math.min(10, Math.round(Math.log2(Math.max(1, amount))) + 2));
    for (let i = 0; i < n; i++) {
      const p = this.alloc();
      if (!p) return;
      p.kind = kind;
      p.phase = 0;
      p.delay = i * 0.018;
      p.t = 0;
      p.dur = rand(0.38, 0.55);
      p.wx = x + rand(-3, 3);
      p.wy = y + rand(-3, 3);
      const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
      const s = rand(60, 130);
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.floor = GROUND_Y + rand(-2, 8);
      p.spin = rand(0, 4);
    }
  }

  /** Celebratory coin rain over world x (boss kills). */
  rain(x: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) return;
      p.kind = i % 9 === 4 ? 'ember' : 'gold';
      p.phase = 0;
      p.delay = rand(0, 0.7);
      p.t = 0;
      p.dur = rand(0.9, 1.3);
      p.wx = x + rand(-90, 90);
      p.wy = rand(-40, -6);
      p.vx = rand(-20, 20);
      p.vy = rand(10, 60);
      p.floor = GROUND_Y + rand(-2, 10);
      p.spin = rand(0, 4);
    }
  }

  clear(): void {
    for (const p of this.pieces) this.pool.push(p);
    this.pieces.length = 0;
    this.sn = 0;
  }

  private alloc(): Piece | null {
    if (this.pieces.length >= this.cap) return null;
    const p = this.pool.pop() ?? new Piece();
    this.pieces.push(p);
    return p;
  }

  private target(kind: Kind): TargetCache {
    const c = this.cache[kind];
    if (this.time - c.at > 0.2) {
      c.at = this.time;
      const fn = kind === 'gold' ? this.targets.gold : kind === 'ember' ? this.targets.ember : this.targets.shard;
      let r: DOMRect | null = null;
      try {
        r = fn ? fn() : null;
      } catch {
        r = null;
      }
      if (r && (r.width > 0 || r.height > 0)) {
        c.x = r.left + r.width / 2;
        c.y = r.top + r.height / 2;
      } else {
        c.x = 18;
        c.y = 18;
      }
    }
    return c;
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.pieces.length && !this.sn) return;
    const wr = this.worldRect();
    const kx = wr ? wr.width / WORLD_W : 1;
    let n = 0;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.delay > 0) {
        p.delay -= dt;
        this.pieces[n++] = p;
        continue;
      }
      p.t += dt;
      p.spin += dt * 10;
      if (p.phase === 0) {
        p.vy += 420 * dt;
        p.wx += p.vx * dt;
        p.wy += p.vy * dt;
        if (p.wy > p.floor && p.vy > 0) {
          p.wy = p.floor;
          p.vy *= -0.42;
          p.vx *= 0.65;
        }
        if (wr) {
          p.x = wr.left + p.wx * kx;
          p.y = wr.top + p.wy * kx;
        }
        if (p.t >= p.dur) {
          p.phase = 1;
          p.t = 0;
          p.dur = rand(0.5, 0.75);
          p.sx = p.x;
          p.sy = p.y;
          const tg = this.target(p.kind);
          p.cx = p.sx + (tg.x - p.sx) * 0.25 + rand(-80, 80);
          p.cy = Math.min(p.sy, tg.y) - rand(50, 150);
        }
      } else if (p.phase === 1) {
        const tg = this.target(p.kind);
        const q = clamp01(p.t / p.dur);
        const e = q * q * 0.7 + q * 0.3;
        const u = 1 - e;
        p.x = u * u * p.sx + 2 * u * e * p.cx + e * e * tg.x;
        p.y = u * u * p.sy + 2 * u * e * p.cy + e * e * tg.y;
        if (q >= 1) {
          this.arrive(p.kind, tg.x, tg.y);
          this.pool.push(p);
          continue;
        }
      }
      this.pieces[n++] = p;
    }
    this.pieces.length = n;
    // sparks
    let j = 0;
    while (j < this.sn) {
      this.sl[j] -= dt;
      if (this.sl[j] <= 0) {
        const last = --this.sn;
        this.spx[j] = this.spx[last];
        this.spy[j] = this.spy[last];
        this.svx[j] = this.svx[last];
        this.svy[j] = this.svy[last];
        this.sl[j] = this.sl[last];
        this.sm[j] = this.sm[last];
        this.sc[j] = this.sc[last];
        continue;
      }
      this.svy[j] += 260 * dt;
      this.spx[j] += this.svx[j] * dt;
      this.spy[j] += this.svy[j] * dt;
      j++;
    }
  }

  private arrive(kind: Kind, x: number, y: number): void {
    const col = kind === 'gold' ? '#fff3a0' : kind === 'ember' ? '#ffb35a' : '#a8f4ff';
    for (let i = 0; i < 6; i++) {
      if (this.sn >= this.sparkCap) return;
      const k = this.sn++;
      const a = rand(0, Math.PI * 2);
      const s = rand(40, 140);
      this.spx[k] = x;
      this.spy[k] = y;
      this.svx[k] = Math.cos(a) * s;
      this.svy[k] = Math.sin(a) * s - 60;
      this.sl[k] = this.sm[k] = rand(0.25, 0.45);
      this.sc[k] = i % 2 ? '#ffffff' : col;
    }
  }

  draw(): void {
    const g = this.ctx;
    const c = this.canvas;
    if (!g || !c) return;
    if (!this.pieces.length && !this.sn) {
      if (this.dirty) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, c.width, c.height);
        this.dirty = false;
      }
      return;
    }
    this.dirty = true;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true;
    const wr = this.worldRect();
    const dpr = this.dpr;
    const ws = Math.max(1, Math.round(((wr ? wr.width : 800) / WORLD_W) * dpr)); // device px per art pixel
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.delay > 0) continue;
      const x = p.x * dpr;
      const y = p.y * dpr;
      let scale = 1;
      if (p.phase === 1) scale = 1 - 0.35 * clamp01(p.t / p.dur);
      const s = Math.max(1, Math.round(ws * scale));
      g.globalAlpha = 1;
      if (p.kind === 'gold') {
        const fi = Math.floor(p.spin) & 3;
        const pc = patternCanvas(COIN_IDS[fi], COIN_FRAMES[fi], COIN_COLS);
        g.drawImage(pc, Math.round(x - 3 * s), Math.round(y - 3 * s), 6 * s, 6 * s);
      } else if (p.kind === 'ember') {
        const gl = glowSprite('#ff8a3d', 5);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.85;
        g.drawImage(gl, Math.round(x - 5.5 * s), Math.round(y - 5.5 * s), 11 * s, 11 * s);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.fillStyle = '#ff8a3d';
        g.fillRect(Math.round(x - s), Math.round(y - s), 2 * s, 2 * s);
        g.fillStyle = '#fff3a0';
        g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      } else {
        const pc = patternCanvas('shard', SHARD_ROWS, SHARD_COLS);
        g.drawImage(pc, Math.round(x - 2.5 * s), Math.round(y - 3 * s), 5 * s, 6 * s);
        if (Math.sin(p.spin * 2) > 0.6) {
          g.fillStyle = '#ffffff';
          g.fillRect(Math.round(x + 2 * s), Math.round(y - 3 * s), s, s);
        }
      }
    }
    let last = '';
    for (let i = 0; i < this.sn; i++) {
      g.globalAlpha = clamp01(this.sl[i] / this.sm[i]);
      if (this.sc[i] !== last) {
        last = this.sc[i];
        g.fillStyle = last;
      }
      g.fillRect(Math.round(this.spx[i] * dpr), Math.round(this.spy[i] * dpr), ws, ws);
    }
    g.globalAlpha = 1;
  }
}
