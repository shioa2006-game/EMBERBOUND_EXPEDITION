// Overlay text: font/measure caches, an outlined-label helper and the pooled floating-text layer
// (damage numbers, heals, status callouts). Drawn on the DPR-resolution overlay canvas.
import { COL, JP_FONT, NUM_FONT } from './palette.ts';
import { clamp01, easeOutCubic } from './util.ts';

type Ctx = CanvasRenderingContext2D;

const fontCache = new Map<number, string>();

/** Cached CSS font string. `jp` uses the Japanese book-text font stack. */
export function fontFor(px: number, jp: boolean): string {
  const p = Math.max(6, Math.round(px));
  const key = p * 2 + (jp ? 1 : 0);
  let f = fontCache.get(key);
  if (!f) {
    f = `${p}px ${jp ? JP_FONT : NUM_FONT}`;
    fontCache.set(key, f);
  }
  return f;
}

const measureCache = new Map<string, Map<string, number>>();

export function measure(o: Ctx, text: string, font: string): number {
  let m = measureCache.get(font);
  if (!m) {
    m = new Map();
    measureCache.set(font, m);
  }
  let w = m.get(text);
  if (w === undefined) {
    if (o.font !== font) o.font = font;
    w = o.measureText(text).width;
    if (m.size > 400) m.clear();
    m.set(text, w);
  }
  return w;
}

/** Fonts may finish loading after the first measurements: drop cached widths. */
export function clearMeasureCache(): void {
  measureCache.clear();
}

const JP_RE = /[^\x00-\x7f]/;
export function isJp(text: string): boolean {
  return JP_RE.test(text);
}

/** Outlined text in device pixels. Assumes identity transform on `o`. */
export function label(o: Ctx, text: string, x: number, y: number, px: number, color: string, jp: boolean, align: CanvasTextAlign = 'center', outline: string = COL.ink, alpha = 1): void {
  if (alpha <= 0.01) return;
  const f = fontFor(px, jp);
  if (o.font !== f) o.font = f;
  o.textAlign = align;
  o.textBaseline = 'middle';
  o.globalAlpha = clamp01(alpha);
  o.lineJoin = 'round';
  o.lineWidth = Math.max(2, Math.round(px * 0.24));
  o.strokeStyle = outline;
  o.strokeText(text, Math.round(x), Math.round(y));
  o.fillStyle = color;
  o.fillText(text, Math.round(x), Math.round(y));
  o.globalAlpha = 1;
}

// ───────────────────────────── floating texts ─────────────────────────────

export const T_RISE = 0; // drifts upward, fades
export const T_ARC = 1; // pops up and falls (crits)
export const T_STAMP = 2; // stays, pops in (callouts)
export const T_CENTER = 3; // screen-space centre callout

export class FloatText {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  grav = 0;
  t = 0;
  dur = 1;
  delay = 0;
  text = '';
  color: string = COL.white;
  outline: string = COL.ink;
  size = 6; // world px
  jp = false;
  style = T_RISE;
  pop = 0; // scale overshoot at spawn
  screen = false; // not affected by camera shake
  icon: HTMLCanvasElement | null = null;
  glow = false;
}

export class TextLayer {
  private live: FloatText[] = [];
  private pool: FloatText[] = [];
  private readonly cap = 90;

  clear(): void {
    for (const t of this.live) this.pool.push(t);
    this.live.length = 0;
  }

  get count(): number {
    return this.live.length;
  }

  spawn(text: string, x: number, y: number, color: string, size: number, style = T_RISE): FloatText {
    let t: FloatText;
    if (this.live.length >= this.cap) {
      // recycle the oldest
      t = this.live.shift()!;
    } else {
      t = this.pool.pop() ?? new FloatText();
    }
    t.text = text;
    t.x = x;
    t.y = y;
    t.vx = 0;
    t.vy = -18;
    t.grav = 0;
    t.t = 0;
    t.dur = 0.95;
    t.delay = 0;
    t.color = color;
    t.outline = COL.ink;
    t.size = size;
    t.jp = isJp(text);
    t.style = style;
    t.pop = 0;
    t.screen = false;
    t.icon = null;
    t.glow = false;
    if (style === T_ARC) {
      t.vx = (Math.random() - 0.5) * 30;
      t.vy = -62;
      t.grav = 150;
      t.dur = 1.05;
      t.pop = 0.9;
    } else if (style === T_STAMP) {
      t.vy = -4;
      t.dur = 1.2;
      t.pop = 0.7;
    } else if (style === T_CENTER) {
      t.vy = -6;
      t.dur = 1.6;
      t.pop = 0.6;
      t.screen = true;
    }
    this.live.push(t);
    return t;
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.live.length; i++) {
      const t = this.live[i];
      if (t.delay > 0) {
        t.delay -= dt;
        this.live[w++] = t;
        continue;
      }
      t.t += dt;
      if (t.t >= t.dur) {
        this.pool.push(t);
        continue;
      }
      if (t.style === T_RISE) {
        t.vy *= Math.exp(-dt * 2.2);
      } else if (t.style === T_ARC) {
        t.vy += t.grav * dt;
        t.vx *= Math.exp(-dt * 2);
        if (t.vy > 25) t.vy = 25;
      } else {
        t.vy *= Math.exp(-dt * 3);
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      this.live[w++] = t;
    }
    this.live.length = w;
  }

  /** k = overlay device px per world px; (sx, sy) = camera shake in world px. */
  draw(o: Ctx, k: number, sx: number, sy: number): void {
    if (!this.live.length) return;
    for (let i = 0; i < this.live.length; i++) {
      const t = this.live[i];
      if (t.delay > 0) continue;
      const p = t.t / t.dur;
      let alpha = p > 0.72 ? (1 - p) / 0.28 : 1;
      if (t.t < 0.04) alpha *= t.t / 0.04;
      let scale = 1;
      if (t.pop > 0) scale = 1 + t.pop * (1 - easeOutCubic(clamp01(t.t / 0.14)));
      const ox = t.screen ? 0 : sx;
      const oy = t.screen ? 0 : sy;
      const x = (t.x + ox) * k;
      const y = (t.y + oy) * k;
      const px = t.size * k * scale;
      if (t.glow) {
        o.globalCompositeOperation = 'lighter';
        label(o, t.text, x, y, px, t.color, t.jp, 'center', t.color, alpha * 0.35);
        o.globalCompositeOperation = 'source-over';
      }
      if (t.icon) {
        const iw = t.icon.width;
        const ih = t.icon.height;
        o.globalAlpha = clamp01(alpha);
        o.imageSmoothingEnabled = true;
        o.drawImage(t.icon, Math.round(x - iw / 2), Math.round(y - ih / 2));
        o.globalAlpha = 1;
        if (t.text) label(o, t.text, x, y + ih / 2 + px * 0.55, px, t.color, t.jp, 'center', t.outline, alpha);
      } else {
        label(o, t.text, x, y, px, t.color, t.jp, 'center', t.outline, alpha);
      }
    }
  }
}
