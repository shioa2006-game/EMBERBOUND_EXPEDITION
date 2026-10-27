// Char-grid helpers used to author sprite maps (lines for weapons, stamping parts, moving pieces).
// Works on ASCII rows so the result is still a plain map that goes through the normal palette pipeline.

export class CharCanvas {
  rows: string[][];

  constructor(src: readonly string[] | number, h = 0) {
    if (typeof src === 'number') {
      this.rows = Array.from({ length: h }, () => Array.from({ length: src }, () => '.'));
    } else {
      const w = Math.max(...src.map((r) => r.length));
      this.rows = src.map((r) => r.padEnd(w, '.').split(''));
    }
  }

  get w(): number {
    return this.rows[0]?.length ?? 0;
  }

  get h(): number {
    return this.rows.length;
  }

  /** Grow the canvas (new rows/cols are transparent). Content moves by (left, top). */
  grow(left: number, top: number, right: number, bottom: number): this {
    const w = this.w + left + right;
    const blank = (): string[] => Array.from({ length: w }, () => '.');
    this.rows = [
      ...Array.from({ length: top }, blank),
      ...this.rows.map((r) => [...Array.from({ length: left }, () => '.'), ...r, ...Array.from({ length: right }, () => '.')]),
      ...Array.from({ length: bottom }, blank),
    ];
    return this;
  }

  get(x: number, y: number): string {
    return this.rows[y]?.[x] ?? '.';
  }

  plot(x: number, y: number, ch: string): this {
    x = Math.round(x);
    y = Math.round(y);
    if (y < 0 || y >= this.h || x < 0 || x >= this.w) return this;
    this.rows[y][x] = ch;
    return this;
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.plot(x0, y0, ch);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /** Quadratic curve sampled densely. */
  curve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, ch: string): this {
    const n = Math.ceil(Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy)) * 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      this.plot(x, y, ch);
    }
    return this;
  }

  /** Stamp rows at (x, y): '.' keeps, ',' erases, anything else paints. */
  stamp(rows: readonly string[], x: number, y: number): this {
    rows.forEach((r, dy) => {
      for (let dx = 0; dx < r.length; dx++) {
        const ch = r[dx];
        if (ch === '.') continue;
        this.plot(x + dx, y + dy, ch === ',' ? '.' : ch);
      }
    });
    return this;
  }

  /** Erase a rectangle (only chars in `chars` when given). */
  erase(x0: number, y0: number, x1: number, y1: number, chars?: string): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        if (!chars || chars.includes(this.rows[y][x])) this.rows[y][x] = '.';
      }
    }
    return this;
  }

  /** Move chars of the given set inside a rectangle by (dx, dy). */
  move(chars: string, dx: number, dy: number, x0 = 0, y0 = 0, x1 = 9999, y1 = 9999): this {
    const moved: [number, number, string][] = [];
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        const ch = this.rows[y][x];
        if (!chars.includes(ch)) continue;
        moved.push([x + dx, y + dy, ch]);
        this.rows[y][x] = '.';
      }
    }
    for (const [x, y, ch] of moved) this.plot(x, y, ch);
    return this;
  }

  /** Replace chars (a → b) everywhere or inside a rectangle. */
  swap(map: Record<string, string>, x0 = 0, y0 = 0, x1 = 9999, y1 = 9999): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) {
        const r = map[this.rows[y][x]];
        if (r !== undefined) this.rows[y][x] = r;
      }
    }
    return this;
  }

  /**
   * Filled ellipse with volumetric shading. `shades` = chars light → dark. Light comes from the top-right
   * by default (enemies face left).
   */
  blob(cx: number, cy: number, rx: number, ry: number, shades: string, lx = 0.45, ly = -0.9, onlyEmpty = false): this {
    const n = shades.length;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx - 0.5) / (rx + 0.35);
        const ny = (y + 0.5 - cy - 0.5) / (ry + 0.35);
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        if (onlyEmpty && this.get(x, y) !== '.') continue;
        const nz = Math.sqrt(Math.max(0, 1 - d));
        const v = (nx * lx + ny * ly) * 0.75 + nz * 0.45 - 0.2; // ~ -1..1
        const idx = Math.max(0, Math.min(n - 1, Math.floor(((1 - v) / 2) * n)));
        this.plot(x, y, shades[idx]);
      }
    }
    return this;
  }

  /**
   * Shaded tube along a quadratic curve (p0 → p2, control p1) with radius r0 → r1.
   * Used for tails, branches, roots and tentacles.
   */
  sweep(
    p0: readonly [number, number], p1: readonly [number, number], p2: readonly [number, number],
    r0: number, r1: number, shades: string, lx = 0.45, ly = -0.9,
  ): this {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len * 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
      const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
      const r = r0 + (r1 - r0) * t;
      if (r < 0.75) this.plot(x, y, shades[Math.min(1, shades.length - 1)]);
      else this.blob(x, y, r, r, shades, lx, ly);
    }
    return this;
  }

  /** Radial fill: chars from the centre outwards (glowing cores, geodes, eyes). */
  radial(cx: number, cy: number, rx: number, ry: number, chars: string): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = Math.hypot((x - cx) / (rx + 0.35), (y - cy) / (ry + 0.35));
        if (d > 1) continue;
        this.plot(x, y, chars[Math.min(chars.length - 1, Math.floor(d * chars.length))]);
      }
    }
    return this;
  }

  /** Texture pass: chars of `mat` for which pred(x, y) holds become `ch`. */
  pattern(mat: string, ch: string, pred: (x: number, y: number) => boolean): this {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) if (mat.includes(this.rows[y][x]) && pred(x, y)) this.rows[y][x] = ch;
    }
    return this;
  }

  /** Polygon fill (even-odd) with one char. */
  poly(pts: readonly (readonly [number, number])[], ch: string): this {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.plot(x, y, ch);
      }
    }
    return this;
  }

  /**
   * Pointed crystal shard standing on (x .. x+w-1, baseY), tip `h` rows up, leaning `lean` px.
   * `chars` = [light face, dark face, highlight edge].
   */
  crystal(x: number, baseY: number, w: number, h: number, chars: string, lean = 0): this {
    const [L, D, E] = [chars[0], chars[1], chars[2] ?? chars[0]];
    for (let i = 0; i <= h; i++) {
      const t = i / h; // 0 at tip, 1 at base
      const y = baseY - h + i;
      const half = Math.max(0.5, (w / 2) * Math.min(1, t * 1.6));
      const cx = x + w / 2 - 0.5 + lean * (1 - t);
      const x0 = Math.round(cx - half + 0.5);
      const x1 = Math.round(cx + half - 0.5);
      for (let xx = x0; xx <= x1; xx++) {
        const mid = Math.round(cx);
        this.plot(xx, y, xx === mid && i < h ? E : xx < mid ? L : D);
      }
    }
    return this;
  }

  rect(x0: number, y0: number, w: number, h: number, ch: string): this {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.plot(x, y, ch);
    return this;
  }

  /** Re-shade existing chars of one material by height: top rows light, bottom rows dark. */
  shadeV(mat: string, shades: string, y0: number, y1: number): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      const idx = Math.min(shades.length - 1, Math.floor(((y - y0) / Math.max(1, y1 - y0 + 1)) * shades.length));
      for (let x = 0; x < this.w; x++) if (this.rows[y][x] === mat) this.rows[y][x] = shades[idx];
    }
    return this;
  }

  /** Light rim: chars of `mat` whose neighbour in direction (dx, dy) is empty become `rim`. */
  rim(mat: string, rimCh: string, dx: number, dy: number): this {
    const marks: [number, number][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!mat.includes(this.rows[y][x])) continue;
        if (this.get(x + dx, y + dy) === '.') marks.push([x, y]);
      }
    }
    for (const [x, y] of marks) this.rows[y][x] = rimCh;
    return this;
  }

  out(): string[] {
    return this.rows.map((r) => r.join(''));
  }
}

export function cc(src: readonly string[] | number, h = 0): CharCanvas {
  return new CharCanvas(src, h);
}

/** Rotate a char grid 90° (cw = clockwise). */
export function rotateRows(rows: readonly string[], cw: boolean): string[] {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const out: string[][] = Array.from({ length: w }, () => Array.from({ length: h }, () => '.'));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? '.';
      if (cw) out[x][h - 1 - y] = ch;
      else out[w - 1 - x][y] = ch;
    }
  }
  return out.map((r) => r.join(''));
}

/** Crop a char grid to its non-transparent bounding box. */
export function cropRows(rows: readonly string[]): string[] {
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      if (r[x] === '.' || r[x] === ' ') continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  });
  if (x1 < 0) return ['.'];
  return rows.slice(y0, y1 + 1).map((r) => r.padEnd(x1 + 1, '.').slice(x0, x1 + 1));
}

/** Mirror rows horizontally (for symmetric parts authored as halves). */
export function mirrorRows(rows: readonly string[], swapChars: Record<string, string> = {}): string[] {
  return rows.map((r) =>
    r
      .split('')
      .reverse()
      .map((ch) => swapChars[ch] ?? ch)
      .join(''),
  );
}

/** Left half + mirrored right half. `mid` = include the centre column once (odd width). */
export function symmetric(left: readonly string[], mid = true, swapChars: Record<string, string> = {}): string[] {
  return left.map((r) => {
    const right = r
      .slice(0, mid ? r.length - 1 : r.length)
      .split('')
      .reverse()
      .map((ch) => swapChars[ch] ?? ch)
      .join('');
    return r + right;
  });
}
