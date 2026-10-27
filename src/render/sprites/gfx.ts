// Minimal drawing surface used by the scene painters (backgrounds, camp, title).
// Two back-ends implement it: SoftGfx (DOM-free, draws into a Pix — used to pre-bake static layers and by the
// preview script) and CanvasGfx in index.ts (draws into a CanvasRenderingContext2D every frame).
import { addPx, blendPx, blit, blitAdd, makePix, parseColor, type Pix } from './pix.ts';

export interface Gfx {
  readonly w: number;
  readonly h: number;
  /** Axis-aligned rectangle. Coordinates are rounded to whole pixels. `add` = additive (light). */
  rect(x: number, y: number, w: number, h: number, color: string, alpha?: number, add?: boolean): void;
  /** Draw a baked pixel image with its top-left at (x, y). */
  image(p: Pix, x: number, y: number, alpha?: number, add?: boolean): void;
}

export class SoftGfx implements Gfx {
  readonly w: number;
  readonly h: number;
  readonly pix: Pix;

  constructor(w: number, h: number, target?: Pix) {
    this.w = w;
    this.h = h;
    this.pix = target ?? makePix(w, h);
  }

  rect(x: number, y: number, w: number, h: number, color: string, alpha = 1, add = false): void {
    const c = parseColor(color);
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.pix.w, Math.round(x) + Math.round(w));
    const y1 = Math.min(this.pix.h, Math.round(y) + Math.round(h));
    if (x1 <= x0 || y1 <= y0) return;
    if (!add && alpha >= 1 && c.a === 255) {
      const d = this.pix.d;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * this.pix.w + xx) * 4;
          d[i] = c.r;
          d[i + 1] = c.g;
          d[i + 2] = c.b;
          d[i + 3] = 255;
        }
      }
      return;
    }
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        if (add) addPx(this.pix, xx, yy, c, alpha);
        else blendPx(this.pix, xx, yy, c, alpha);
      }
    }
  }

  image(p: Pix, x: number, y: number, alpha = 1, add = false): void {
    if (add) blitAdd(this.pix, p, x, y, alpha);
    else blit(this.pix, p, x, y, alpha);
  }
}

/** Draw a horizontally tiling layer (width = layer width) scrolled by `offset` pixels. */
export function drawTiled(g: Gfx, layer: Pix, offset: number, y: number, alpha = 1): void {
  const w = layer.w;
  let x = -(((Math.round(offset) % w) + w) % w);
  while (x < g.w) {
    g.image(layer, x, y, alpha);
    x += w;
  }
}

/** Filled pixel circle (scanline spans). */
export function disc(g: Gfx, cx: number, cy: number, r: number, color: string, alpha = 1, add = false): void {
  const rr = r * r;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    const span = Math.sqrt(Math.max(0, rr - dy * dy));
    if (span <= 0 && dy !== 0) continue;
    const x0 = Math.round(cx - span);
    const x1 = Math.round(cx + span);
    g.rect(x0, Math.round(cy) + dy, Math.max(1, x1 - x0), 1, color, alpha, add);
  }
}

/** Soft light as concentric banded discs (pixel-art friendly glow). */
export function glow(g: Gfx, cx: number, cy: number, r: number, color: string, intensity = 0.5, bands = 4): void {
  for (let i = 0; i < bands; i++) {
    const rr = r * (1 - i / bands);
    disc(g, cx, cy, rr, color, intensity / bands, true);
  }
}
