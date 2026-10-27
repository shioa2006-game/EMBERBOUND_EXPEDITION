// Screen-space banners on the overlay canvas: stage cards, ELITE, boss intro card, phase ribbons,
// BOSS DEFEATED, ROUT stamp, DESCENT, LAST LIGHT, FLARE, OVERDRIVE, EMBER NOVA, warnings.
import { COL } from './palette.ts';
import { fontFor, isJp, label, measure } from './text.ts';
import { clamp01, easeOutBack, easeOutCubic } from './util.ts';

type Ctx = CanvasRenderingContext2D;

export type BannerKind =
  | 'stage' | 'elite' | 'bossIntro' | 'phase' | 'bossDown' | 'rout' | 'descent' | 'lastLight'
  | 'flare' | 'overdrive' | 'emberNova' | 'warn' | 'eliteDown' | 'perfectChain';

type Slot = 'center' | 'card' | 'phase' | 'rout' | 'top';

const SLOT: Record<BannerKind, Slot> = {
  stage: 'center',
  elite: 'center',
  bossIntro: 'card',
  phase: 'phase',
  bossDown: 'center',
  rout: 'rout',
  descent: 'center',
  lastLight: 'center',
  flare: 'top',
  overdrive: 'center',
  emberNova: 'center',
  warn: 'top',
  eliteDown: 'center',
  perfectChain: 'rout',
};

const DUR: Record<BannerKind, number> = {
  stage: 1.15,
  elite: 1.6,
  bossIntro: 2.9,
  phase: 2.7,
  bossDown: 3.6,
  rout: 1.15,
  descent: 2.6,
  lastLight: 2.5,
  flare: 2.0,
  overdrive: 1.4,
  emberNova: 1.9,
  warn: 2.1,
  eliteDown: 1.5,
  perfectChain: 1.2,
};

export class Banner {
  kind: BannerKind = 'stage';
  text = '';
  sub = '';
  sub2 = '';
  accent: string = COL.gold;
  flag = false; // bossDown: final, bossIntro: multi
  t = 0;
  dur = 1;
}

export class Banners {
  private list: Banner[] = [];

  clear(): void {
    this.list.length = 0;
  }

  show(kind: BannerKind, text: string, sub = '', opts: { sub2?: string; accent?: string; flag?: boolean; dur?: number } = {}): Banner {
    const slot = SLOT[kind];
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (SLOT[this.list[i].kind] === slot) this.list.splice(i, 1);
    }
    const b = new Banner();
    b.kind = kind;
    b.text = text;
    b.sub = sub;
    b.sub2 = opts.sub2 ?? '';
    b.accent = opts.accent ?? COL.gold;
    b.flag = !!opts.flag;
    b.dur = opts.dur ?? DUR[kind];
    this.list.push(b);
    return b;
  }

  has(kind: BannerKind): boolean {
    return this.list.some((b) => b.kind === kind);
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      b.t += dt;
      if (b.t < b.dur) this.list[w++] = b;
    }
    this.list.length = w;
  }

  draw(o: Ctx, k: number, time: number): void {
    for (const b of this.list) {
      switch (b.kind) {
        case 'stage':
          this.drawStage(o, k, b);
          break;
        case 'elite':
          this.drawElite(o, k, b, time);
          break;
        case 'bossIntro':
          this.drawBossIntro(o, k, b, time);
          break;
        case 'phase':
          this.drawPhase(o, k, b);
          break;
        case 'bossDown':
          this.drawBossDown(o, k, b, time);
          break;
        case 'rout':
        case 'perfectChain':
          this.drawStamp(o, k, b);
          break;
        case 'descent':
          this.drawBig(o, k, b, 60, 11, COL.emberHi, time);
          break;
        case 'lastLight':
          this.drawBig(o, k, b, 64, 15, COL.goldHi, time);
          break;
        case 'overdrive':
          this.drawOverdrive(o, k, b, time);
          break;
        case 'emberNova':
          this.drawBig(o, k, b, 62, 16, COL.goldHi, time);
          break;
        case 'eliteDown':
          this.drawBig(o, k, b, 50, 10, COL.emberHi, time);
          break;
        case 'flare':
          this.drawTop(o, k, b, COL.emberHi, 9);
          break;
        case 'warn':
          this.drawTop(o, k, b, COL.bad, 7);
          break;
      }
    }
    o.globalAlpha = 1;
  }

  // ───────────────────────────── styles ─────────────────────────────

  private alphaOf(b: Banner, fadeIn: number, fadeOut: number, t = b.t): number {
    if (t < fadeIn) return clamp01(t / fadeIn);
    const rem = b.dur - t;
    if (rem < fadeOut) return clamp01(rem / fadeOut);
    return 1;
  }

  private band(o: Ctx, k: number, cy: number, h: number, alpha: number, color = 'rgba(8,5,12,0.62)'): void {
    o.globalAlpha = alpha;
    o.fillStyle = color;
    o.fillRect(0, Math.round((cy - h / 2) * k), Math.round(400 * k), Math.round(h * k));
    o.globalAlpha = 1;
  }

  private glowText(o: Ctx, text: string, x: number, y: number, px: number, color: string, alpha: number): void {
    const jp = isJp(text);
    o.globalCompositeOperation = 'lighter';
    const f = fontFor(px, jp);
    o.font = f;
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.lineJoin = 'round';
    o.globalAlpha = alpha * 0.28;
    o.strokeStyle = color;
    o.lineWidth = Math.max(4, px * 0.5);
    o.strokeText(text, Math.round(x), Math.round(y));
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 1;
    label(o, text, x, y, px, color, jp, 'center', COL.ink, alpha);
  }

  private drawStage(o: Ctx, k: number, b: Banner): void {
    const a = this.alphaOf(b, 0.12, 0.35);
    const cy = 46;
    this.band(o, k, cy, 17, a * 0.8);
    const s = 1 + 0.25 * (1 - easeOutCubic(clamp01(b.t / 0.18)));
    const px = 10 * k * s;
    const x = 200 * k;
    label(o, b.text, x, cy * k, px, COL.cream, false, 'center', COL.ink, a);
    const w = measure(o, b.text, fontFor(px, false));
    const lw = 42 * k * easeOutCubic(clamp01(b.t / 0.3));
    o.globalAlpha = a * 0.8;
    o.fillStyle = b.accent;
    o.fillRect(Math.round(x - w / 2 - 8 * k - lw), Math.round(cy * k), Math.round(lw), Math.max(1, Math.round(k * 0.67)));
    o.fillRect(Math.round(x + w / 2 + 8 * k), Math.round(cy * k), Math.round(lw), Math.max(1, Math.round(k * 0.67)));
    o.globalAlpha = 1;
    if (b.sub) label(o, b.sub, x, (cy + 11) * k, 5.5 * k, COL.grey, isJp(b.sub), 'center', COL.ink, a);
  }

  private drawElite(o: Ctx, k: number, b: Banner, time: number): void {
    const a = this.alphaOf(b, 0.08, 0.4);
    const cy = 48;
    this.band(o, k, cy, 26, a * 0.85, 'rgba(40,6,6,0.7)');
    o.globalAlpha = a;
    o.fillStyle = '#ff5a3d';
    o.fillRect(0, Math.round((cy - 13) * k), Math.round(400 * k), Math.max(1, Math.round(k)));
    o.fillRect(0, Math.round((cy + 13) * k) - Math.max(1, Math.round(k)), Math.round(400 * k), Math.max(1, Math.round(k)));
    o.globalAlpha = 1;
    const pop = b.t < 0.2 ? 1 + 0.9 * (1 - easeOutBack(clamp01(b.t / 0.2))) : 1;
    const jx = b.t < 0.45 ? Math.sin(time * 90) * 1.2 * k * (1 - b.t / 0.45) : 0;
    this.glowText(o, b.text, 200 * k + jx, (cy - 2) * k, 15 * k * pop, '#ff6a3d', a);
    if (b.sub) label(o, b.sub, 200 * k, (cy + 9) * k, 5.5 * k, COL.cream, isJp(b.sub), 'center', COL.ink, a);
  }

  private drawBossIntro(o: Ctx, k: number, b: Banner, time: number): void {
    const a = this.alphaOf(b, 0.05, 0.45);
    const cy = 76;
    const h = b.sub2 ? 54 : 46;
    const slide = 1 - easeOutCubic(clamp01(b.t / 0.32));
    const W = 400 * k;
    // backdrop band
    o.globalAlpha = a * 0.82;
    o.fillStyle = 'rgba(6,3,10,0.86)';
    o.fillRect(Math.round(-slide * W), Math.round((cy - h / 2) * k), Math.round(W), Math.round(h * k));
    // accent lines
    o.globalAlpha = a;
    o.fillStyle = b.accent;
    const lt = Math.max(1, Math.round(k));
    o.fillRect(Math.round(slide * W), Math.round((cy - h / 2) * k), Math.round(W), lt);
    o.fillRect(Math.round(-slide * W), Math.round((cy + h / 2) * k) - lt, Math.round(W), lt);
    // hazard stripes on the left/right
    o.globalAlpha = a * 0.5;
    for (let i = 0; i < 6; i++) {
      const sx = (((time * 40 + i * 14) % 84) - 6) * k;
      o.fillRect(Math.round(sx), Math.round((cy - h / 2 + 2) * k), Math.round(5 * k), lt);
      o.fillRect(Math.round(W - sx - 5 * k), Math.round((cy + h / 2 - 3) * k), Math.round(5 * k), lt);
    }
    o.globalAlpha = 1;
    const x = 200 * k + slide * 60 * k;
    const blink = Math.sin(time * 10) > -0.2 ? 1 : 0.55;
    label(o, b.flag ? '― FINAL BATTLE ―' : '― BOSS ―', x, (cy - h / 2 + 7) * k, 6 * k, '#ff5a5a', false, 'center', COL.ink, a * blink);
    // name (shrinks to fit)
    let px = 13 * k;
    const maxW = 380 * k;
    const wName = measure(o, b.text, fontFor(px, isJp(b.text)));
    if (wName > maxW) px *= maxW / wName;
    this.glowText(o, b.text, x, (cy - 5) * k, px, b.accent, a);
    if (b.sub) {
      let spx = 5.5 * k;
      const ws = measure(o, b.sub, fontFor(spx, true));
      if (ws > maxW) spx *= maxW / ws;
      label(o, b.sub, x, (cy + 8) * k, spx, COL.cream, true, 'center', COL.ink, a);
    }
    if (b.sub2) label(o, b.sub2, x, (cy + 18) * k, 5.5 * k, COL.gold, true, 'center', COL.ink, a * (0.75 + 0.25 * Math.sin(time * 6)));
  }

  private drawPhase(o: Ctx, k: number, b: Banner): void {
    const a = this.alphaOf(b, 0.1, 0.5);
    const cy = 44;
    const grow = easeOutCubic(clamp01(b.t / 0.25));
    o.globalAlpha = a * 0.85;
    o.fillStyle = 'rgba(30,8,44,0.8)';
    const hh = 24 * grow;
    o.fillRect(0, Math.round((cy - hh / 2) * k), Math.round(400 * k), Math.round(hh * k));
    o.fillStyle = COL.purple;
    const lt = Math.max(1, Math.round(k));
    o.fillRect(0, Math.round((cy - hh / 2) * k), Math.round(400 * k), lt);
    o.fillRect(0, Math.round((cy + hh / 2) * k) - lt, Math.round(400 * k), lt);
    o.globalAlpha = 1;
    if (grow < 0.6) return;
    label(o, b.sub, 200 * k, (cy - 6) * k, 6 * k, COL.purpleHi, false, 'center', COL.ink, a);
    let px = 7.5 * k;
    const maxW = 384 * k;
    const w = measure(o, b.text, fontFor(px, true));
    if (w > maxW) px *= maxW / w;
    label(o, b.text, 200 * k, (cy + 4) * k, px, COL.white, true, 'center', COL.ink, a);
  }

  private drawBossDown(o: Ctx, k: number, b: Banner, time: number): void {
    const t = b.t - 0.25; // let the flash land first
    if (t < 0) return;
    const a = this.alphaOf(b, 0.05, 0.6, t + 0.25);
    const cy = 64;
    const final = b.flag;
    this.band(o, k, cy, final ? 40 : 32, a * 0.7, final ? 'rgba(40,24,4,0.75)' : 'rgba(8,5,12,0.7)');
    const pop = t < 0.22 ? 1 + 1.3 * (1 - easeOutBack(clamp01(t / 0.22))) : 1;
    const col = final ? COL.gold : COL.white;
    const px = (final ? 20 : 16) * k * pop;
    this.glowText(o, b.text, 200 * k, (cy - 3) * k, px, col, a);
    if (final) {
      // twinkles around the title
      o.globalAlpha = a;
      o.fillStyle = COL.goldHi;
      for (let i = 0; i < 8; i++) {
        const ph = time * 3 + i * 0.8;
        if (Math.sin(ph * 4) < 0.2) continue;
        const sx = (200 + Math.cos(i * 0.785 + time * 0.6) * (70 + (i % 3) * 14)) * k;
        const sy = (cy - 3 + Math.sin(i * 1.7 + time) * 12) * k;
        const s = Math.max(1, Math.round(k));
        o.fillRect(Math.round(sx), Math.round(sy), s, s);
        o.fillRect(Math.round(sx - s), Math.round(sy), s * 3, s);
        o.fillRect(Math.round(sx), Math.round(sy - s), s, s * 3);
      }
      o.globalAlpha = 1;
    }
    if (b.sub) label(o, b.sub, 200 * k, (cy + (final ? 13 : 11)) * k, 6 * k, final ? COL.goldHi : COL.cream, true, 'center', COL.ink, a);
  }

  private drawStamp(o: Ctx, k: number, b: Banner): void {
    const a = this.alphaOf(b, 0.02, 0.3);
    const s = b.t < 0.12 ? 1 + 1.6 * (1 - easeOutCubic(b.t / 0.12)) : 1;
    const cx = 316 * k;
    const cy = 68 * k;
    o.save();
    o.translate(Math.round(cx), Math.round(cy));
    o.rotate(-0.13);
    o.scale(s, s);
    const px = 11 * k;
    const f = fontFor(px, false);
    const w = measure(o, b.text, f) + 8 * k;
    const h = px * 1.35;
    o.globalAlpha = a;
    o.fillStyle = 'rgba(30,6,4,0.55)';
    o.fillRect(Math.round(-w / 2), Math.round(-h / 2), Math.round(w), Math.round(h));
    o.strokeStyle = b.accent;
    o.lineWidth = Math.max(2, Math.round(k * 0.9));
    o.strokeRect(Math.round(-w / 2), Math.round(-h / 2), Math.round(w), Math.round(h));
    o.globalAlpha = 1;
    label(o, b.text, 0, 0, px, b.accent, false, 'center', COL.ink, a);
    if (b.sub) label(o, b.sub, 0, h * 0.5 + 4 * k, 5 * k, COL.cream, isJp(b.sub), 'center', COL.ink, a);
    o.restore();
  }

  private drawBig(o: Ctx, k: number, b: Banner, cy: number, size: number, color: string, time: number): void {
    const a = this.alphaOf(b, 0.08, 0.5);
    this.band(o, k, cy, size * 1.9 + (b.sub ? 8 : 0), a * 0.7);
    const pop = b.t < 0.18 ? 1 + 0.8 * (1 - easeOutBack(clamp01(b.t / 0.18))) : 1;
    const wob = Math.sin(time * 5) * 0.03;
    this.glowText(o, b.text, 200 * k, (cy - (b.sub ? 3 : 0)) * k, size * k * (pop + wob * (b.kind === 'lastLight' ? 1 : 0)), color, a);
    if (b.sub) label(o, b.sub, 200 * k, (cy + size * 0.55 + 2) * k, 6 * k, COL.cream, isJp(b.sub), 'center', COL.ink, a);
  }

  private drawOverdrive(o: Ctx, k: number, b: Banner, time: number): void {
    const a = this.alphaOf(b, 0.05, 0.45);
    const cy = 58;
    // speed streaks
    o.globalAlpha = a * 0.7;
    o.fillStyle = COL.gold;
    for (let i = 0; i < 10; i++) {
      const y = cy - 10 + ((i * 37) % 21);
      const len = 30 + ((i * 53) % 40);
      const x = ((time * 520 + i * 97) % 520) - 60;
      o.fillRect(Math.round(x * k), Math.round(y * k), Math.round(len * k), Math.max(1, Math.round(k * 0.67)));
    }
    o.globalAlpha = 1;
    const s = b.t < 0.15 ? 1 + 0.7 * (1 - easeOutBack(b.t / 0.15)) : 1;
    this.glowText(o, b.text, 200 * k, cy * k, 15 * k * s, COL.gold, a);
    if (b.sub) label(o, b.sub, 200 * k, (cy + 11) * k, 5.5 * k, COL.cream, true, 'center', COL.ink, a);
  }

  private drawTop(o: Ctx, k: number, b: Banner, color: string, size: number): void {
    const a = this.alphaOf(b, 0.1, 0.5);
    const cy = 30;
    const blink = b.kind === 'warn' ? (Math.sin(b.t * 18) > -0.4 ? 1 : 0.4) : 1;
    label(o, b.text, 200 * k, cy * k, size * k, color, isJp(b.text), 'center', COL.ink, a * blink);
    if (b.sub) label(o, b.sub, 200 * k, (cy + size * 0.5 + 4) * k, 5.5 * k, COL.cream, isJp(b.sub), 'center', COL.ink, a);
  }
}
