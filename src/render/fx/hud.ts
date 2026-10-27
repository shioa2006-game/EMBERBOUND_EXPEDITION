// In-world HUD: enemy HP/ward bars, hero mini bars, WINDUP TELEGRAPHS (orange = interruptible,
// purple = unstoppable), target lines & reticles, boss bars (single / 4-boss final), status icons,
// screen vignettes (unstoppable nova, lantern low, last light) and the Overdrive frame.
import { GROUND_Y, type Battle } from '../../core/battle.ts';
import type { Unit } from '../../core/types.ts';
import { ENEMIES } from '../../data/enemies.ts';
import { iconCanvas, type IconKey } from '../sprites/index.ts';
import { COL } from './palette.ts';
import { patternCanvas, pxDashed, pxEllipse, vignette } from './pixel.ts';
import { fontFor, label, measure } from './text.ts';
import { clamp01, easeOutCubic } from './util.ts';
import type { FxWorld, UnitVis } from './world.ts';

type Ctx = CanvasRenderingContext2D;

const ARMOR_ROWS = ['.###.', '#ooo#', '#ooo#', '.#o#.', '..#..'];
const ARMOR_COLS = { '#': '#1a1420', o: COL.armor };
const SUNDER_ROWS = ['.##..', '#oo.#', '#.oo#', '.#o#.', '..#..'];
const SUNDER_COLS = { '#': '#1a1420', o: '#ff7a5a' };

const NUM_STR: string[] = [];
for (let i = 0; i <= 100; i++) NUM_STR.push(String(i));
const PCT_STR = NUM_STR.map((n) => n + '%');
function numStr(n: number): string {
  return n >= 0 && n <= 100 ? NUM_STR[n] : String(n);
}

/** Enemy HP bar width by size. */
const BAR_W: Record<string, number> = { small: 14, medium: 18, large: 26, huge: 40 };
const WIND_W: Record<string, number> = { small: 26, medium: 28, large: 36, huge: 58 };

export class Hud {
  private readonly w: FxWorld;
  bossIntroT = 9; // seconds since the boss intro started (bar sweep)
  bossFade = 0; // 0..1 boss bar visibility
  private iconScale = 1;

  constructor(w: FxWorld) {
    this.w = w;
  }

  reset(): void {
    this.bossIntroT = 9;
    this.bossFade = 0;
  }

  update(dt: number): void {
    if (this.bossIntroT < 9) this.bossIntroT += dt;
  }

  // ───────────────────────────── geometry ─────────────────────────────

  private hpBarY(v: UnitVis): number {
    return Math.round(v.top) - 5;
  }

  private windBarY(u: Unit, v: UnitVis): number {
    const y = u.rank === 'boss' ? Math.round(v.top) - 8 : this.hpBarY(v) - 7;
    return Math.max(30, y);
  }

  /** Where the windup bar of a unit is (used by the interrupt shatter effect). */
  windupBarRect(u: Unit, out: { x: number; y: number; w: number }): boolean {
    const v = this.w.vis.get(u.id);
    if (!v) return false;
    const ww = WIND_W[u.size] ?? 28;
    out.x = v.cx;
    out.y = this.windBarY(u, v);
    out.w = ww;
    return true;
  }

  // ───────────────────────────── world layer ─────────────────────────────

  /** Danger zones & dashed target lines (drawn under units). */
  drawTelegraphGround(g: Ctx, b: Battle): void {
    const w = this.w;
    const t = w.realTime;
    for (let i = 0; i < b.enemies.length; i++) {
      const e = b.enemies[i];
      const wu = e.windup;
      if (!e.alive || !wu) continue;
      const kind = wu.ability.effect.kind;
      if (kind === 'nova' || kind === 'drainLantern') {
        const urg = 1 - clamp01(wu.remaining / Math.max(0.01, wu.total));
        const col = wu.interruptible ? COL.orange : COL.purple;
        g.globalAlpha = 0.12 + 0.18 * urg + 0.08 * Math.sin(t * (8 + urg * 16));
        g.fillStyle = col;
        pxEllipse(g, 106, GROUND_Y + 1, 74, 6);
        g.globalAlpha = 0.6 + 0.3 * urg;
        pxDashed(g, 32, GROUND_Y + 1, 180, GROUND_Y + 1, 4, 3, -t * 30);
        g.globalAlpha = 1;
      }
    }
  }

  drawTargetLines(g: Ctx, b: Battle): void {
    const w = this.w;
    const t = w.realTime;
    for (let i = 0; i < b.enemies.length; i++) {
      const e = b.enemies[i];
      const wu = e.windup;
      if (!e.alive || !wu || wu.targetId === null) continue;
      const h = w.units.get(wu.targetId);
      if (!h || !h.alive) continue;
      const ev = w.vis.get(e.id);
      const hv = w.vis.get(h.id);
      if (!ev || !hv) continue;
      const col = wu.interruptible ? COL.orange : COL.purple;
      const urg = 1 - clamp01(wu.remaining / Math.max(0.01, wu.total));
      g.globalAlpha = 0.55 + 0.35 * urg;
      g.fillStyle = col;
      pxDashed(g, ev.cx - ev.w * 0.3, ev.cy, hv.cx, hv.top - 3, 3, 3, -t * 24);
      // reticle on the target hero
      const pulse = Math.round(2 + 2 * Math.abs(Math.sin(t * (6 + urg * 10))));
      const x0 = Math.round(hv.cx - hv.w / 2 - pulse - 1);
      const x1 = Math.round(hv.cx + hv.w / 2 + pulse + 1);
      const y0 = Math.round(hv.top - pulse - 1);
      const y1 = Math.round(hv.y + 1);
      g.globalAlpha = 0.9;
      g.fillRect(x0, y0, 3, 1);
      g.fillRect(x0, y0, 1, 3);
      g.fillRect(x1 - 2, y0, 3, 1);
      g.fillRect(x1, y0, 1, 3);
      g.fillRect(x0, y1, 3, 1);
      g.fillRect(x0, y1 - 2, 1, 3);
      g.fillRect(x1 - 2, y1, 3, 1);
      g.fillRect(x1, y1 - 2, 1, 3);
      // crosshair pip over the head
      g.fillStyle = COL.white;
      g.fillRect(Math.round(hv.cx), y0 - 3, 1, 2);
      g.globalAlpha = 1;
    }
  }

  /** Bars anchored to units (shake with the world). */
  drawUnitBars(g: Ctx, b: Battle): void {
    const w = this.w;
    const t = w.realTime;
    for (let i = 0; i < b.enemies.length; i++) {
      const e = b.enemies[i];
      if (!e.alive || e.untargetable > 0) continue;
      const v = w.vis.get(e.id);
      if (!v || !v.ready) continue;
      if (v.appear === 3) continue;
      if (e.rank !== 'boss') this.enemyHpBar(g, e, v);
      if (e.windup) this.windupBar(g, e, v, t);
    }
    for (let i = 0; i < b.heroes.length; i++) {
      const h = b.heroes[i];
      if (!h.alive) continue;
      const v = w.vis.get(h.id);
      if (!v) continue;
      this.heroBar(g, h, v);
    }
  }

  private enemyHpBar(g: Ctx, e: Unit, v: UnitVis): void {
    const bw = BAR_W[e.size] ?? 18;
    const x = Math.round(v.cx - bw / 2);
    const y = this.hpBarY(v);
    const elite = e.rank === 'elite';
    if (elite) {
      g.fillStyle = COL.goldDeep;
      g.fillRect(x - 2, y - 2, bw + 4, 6);
    }
    g.fillStyle = COL.ink;
    g.fillRect(x - 1, y - 1, bw + 2, 4);
    g.fillStyle = COL.hpBg;
    g.fillRect(x, y, bw, 2);
    const tw = Math.round(bw * v.trailFrac);
    if (tw > 0) {
      g.fillStyle = '#ffe0d0';
      g.fillRect(x, y, tw, 2);
    }
    const hw = Math.round(bw * v.hpFrac);
    if (hw > 0) {
      g.fillStyle = e.mark === Infinity ? '#ff9a3a' : COL.hp;
      g.fillRect(x, y, hw, 2);
      g.fillStyle = e.mark === Infinity ? COL.gold : COL.hpHi;
      g.fillRect(x, y, hw, 1);
    }
    if (e.ward > 0 && e.maxHp > 0) {
      const ww = Math.max(1, Math.round(bw * clamp01(e.ward / e.maxHp)));
      g.fillStyle = COL.ink;
      g.fillRect(x - 1, y - 3, ww + 2, 3);
      g.fillStyle = COL.ward;
      g.fillRect(x, y - 2, ww, 1);
      g.fillStyle = COL.wardHi;
      g.fillRect(x, y - 2, Math.max(1, ww >> 2), 1);
    }
    armorIcon(g, e, x - 7, y - 2);
  }

  private heroBar(g: Ctx, h: Unit, v: UnitVis): void {
    const bw = 16;
    const x = Math.round(h.x - bw / 2);
    const y = Math.round(h.y + 3);
    g.fillStyle = COL.ink;
    g.fillRect(x - 1, y - 1, bw + 2, 4);
    g.fillStyle = '#1a2a1a';
    g.fillRect(x, y, bw, 2);
    const tw = Math.round(bw * v.trailFrac);
    if (tw > 0) {
      g.fillStyle = '#ffd0c0';
      g.fillRect(x, y, tw, 2);
    }
    const f = v.hpFrac;
    const hw = Math.round(bw * f);
    if (hw > 0) {
      const low = f < 0.3;
      g.fillStyle = low ? (Math.sin(this.w.realTime * 12) > 0 ? COL.heroHpLow : '#c03030') : f < 0.55 ? COL.heroHpMid : COL.heroHp;
      g.fillRect(x, y, hw, 2);
      g.fillStyle = low ? '#ff9a9a' : f < 0.55 ? '#fff0a0' : COL.heroHpHi;
      g.fillRect(x, y, hw, 1);
    }
    if (v.barrierFrac > 0) {
      const bwid = Math.max(1, Math.round(bw * v.barrierFrac));
      g.fillStyle = COL.ink;
      g.fillRect(x - 1, y - 3, Math.min(bw, bwid) + 2, 3);
      g.fillStyle = COL.barrier;
      g.fillRect(x, y - 2, Math.min(bw, bwid), 1);
    }
  }

  private windupBar(g: Ctx, e: Unit, v: UnitVis, t: number): void {
    const wu = e.windup!;
    const bw = WIND_W[e.size] ?? 28;
    const bh = e.rank === 'boss' ? 4 : 3;
    const x = Math.round(v.cx - bw / 2);
    const y = this.windBarY(e, v);
    const prog = clamp01(1 - wu.remaining / Math.max(0.01, wu.total));
    const orange = wu.interruptible;
    const last = wu.remaining < 0.4;
    const blink = last && Math.floor(t * 16) % 2 === 0;
    // frame
    g.fillStyle = COL.ink;
    g.fillRect(x - 2, y - 2, bw + 4, bh + 4);
    g.fillStyle = orange ? COL.orange : COL.purple;
    g.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * (last ? 20 : 6)));
    g.fillRect(x - 2, y - 2, bw + 4, 1);
    g.fillRect(x - 2, y + bh + 1, bw + 4, 1);
    g.fillRect(x - 2, y - 2, 1, bh + 4);
    g.fillRect(x + bw + 1, y - 2, 1, bh + 4);
    g.globalAlpha = 1;
    g.fillStyle = orange ? COL.orangeBg : COL.purpleBg;
    g.fillRect(x, y, bw, bh);
    const fw = Math.round(bw * prog);
    if (fw > 0) {
      g.fillStyle = blink ? COL.white : orange ? COL.orange : COL.purple;
      g.fillRect(x, y, fw, bh);
      g.fillStyle = blink ? COL.white : orange ? COL.orangeHi : COL.purpleHi;
      g.fillRect(x, y, fw, 1);
      // leading edge spark
      g.fillStyle = COL.white;
      g.fillRect(x + fw - 1, y, 1, bh);
    }
    // weakened → cracked bar
    if (wu.weakened) {
      g.fillStyle = COL.ink;
      for (let k = 0; k < 3; k++) {
        const cx = x + Math.round(((k + 1) * bw) / 4);
        g.fillRect(cx, y, 1, 1);
        g.fillRect(cx + 1, y + 1, 1, 1);
        g.fillRect(cx, y + 2, 1, bh - 2);
      }
    }
    // purple → orange flip flash
    const v2 = v;
    if (v2.windupFlash < 0.45) {
      const a = 1 - v2.windupFlash / 0.45;
      g.globalAlpha = a;
      g.fillStyle = COL.white;
      g.fillRect(x - 3, y - 3, bw + 6, bh + 6);
      g.globalAlpha = 1;
    }
    // channel break meter
    const bf = wu.ability.breakFrac;
    if (bf && bf > 0) {
      const need = e.maxHp * bf;
      const q = clamp01(wu.dealt / Math.max(1, need));
      const by = y + bh + 3;
      g.fillStyle = COL.ink;
      g.fillRect(x - 1, by - 1, bw + 2, 4);
      g.fillStyle = '#2a2418';
      g.fillRect(x, by, bw, 2);
      const qw = Math.round(bw * q);
      if (qw > 0) {
        g.fillStyle = q > 0.8 && Math.floor(t * 14) % 2 ? COL.white : COL.gold;
        g.fillRect(x, by, qw, 2);
        g.fillStyle = COL.goldHi;
        g.fillRect(x, by, qw, 1);
      }
    }
  }

  // ───────────────────────────── screen layer ─────────────────────────────

  /** Boss HP bar(s) across the top of the world (screen space, no shake). */
  drawBossBars(g: Ctx, b: Battle, dt: number): void {
    const show = b.isBossStage && b.enemies.length > 0 && b.enemies.some(isBoss) && b.phase !== 'ended';
    const target = show && b.phase !== 'victory' ? 1 : 0;
    this.bossFade += (target - this.bossFade) * Math.min(1, dt * (target ? 8 : 2.5));
    if (this.bossFade < 0.02) return;
    const ids = b.area.bossId;
    const count = Array.isArray(ids) ? ids.length : 1;
    const sweep = this.bossIntroT < 9 ? easeOutCubic(clamp01((this.bossIntroT - 0.3) / 1.1)) : 1;
    g.globalAlpha = this.bossFade;
    if (count <= 1) {
      const e = b.enemies.find(isBoss);
      if (e) this.bigBossBar(g, e, sweep);
    } else {
      for (let k = 0; k < count; k++) this.compactBossBar(g, bossInSlot(b, k), k, count, sweep);
    }
    g.globalAlpha = 1;
  }

  private bigBossBar(g: Ctx, e: Unit, sweep: number): void {
    const t = this.w.realTime;
    const x = 70;
    const bw = 260;
    const y = 13;
    const bh = 5;
    const v = this.w.vis.get(e.id);
    const a0 = g.globalAlpha;
    // frame
    g.fillStyle = COL.ink;
    g.fillRect(x - 3, y - 3, bw + 6, bh + 6);
    g.fillStyle = e.enraged ? (Math.sin(t * 10) > 0 ? '#ff4040' : '#8a1a1a') : COL.goldDeep;
    g.fillRect(x - 2, y - 2, bw + 4, 1);
    g.fillRect(x - 2, y + bh + 1, bw + 4, 1);
    g.fillRect(x - 2, y - 2, 1, bh + 4);
    g.fillRect(x + bw + 1, y - 2, 1, bh + 4);
    g.fillStyle = COL.hpBg;
    g.fillRect(x, y, bw, bh);
    const frac = e.alive ? clamp01(e.hp / e.maxHp) : 0;
    const trail = v ? v.trailFrac : frac;
    const tw = Math.round(bw * Math.min(trail, sweep));
    if (tw > 0) {
      g.fillStyle = '#ffd8c8';
      g.fillRect(x, y, tw, bh);
    }
    const fw = Math.round(bw * Math.min(frac, sweep));
    if (fw > 0) {
      g.fillStyle = e.stagger > 0 ? '#ff9a3a' : COL.hp;
      g.fillRect(x, y, fw, bh);
      g.fillStyle = e.stagger > 0 ? COL.gold : COL.hpHi;
      g.fillRect(x, y, fw, 1);
      g.fillStyle = '#8a1a24';
      g.fillRect(x, y + bh - 1, fw, 1);
    }
    // ward overlay (hatched teal)
    if (e.ward > 0 && e.maxHp > 0) {
      const ww = Math.round(bw * clamp01(e.ward / e.maxHp) * sweep);
      g.fillStyle = COL.ward;
      g.globalAlpha = a0 * 0.9;
      g.fillRect(x, y, ww, 2);
      g.fillStyle = COL.wardHi;
      for (let i = (Math.floor(t * 12) % 4); i < ww; i += 4) g.fillRect(x + i, y, 1, 2);
      g.globalAlpha = a0;
    }
    // phase ticks
    const phases = e.def?.phases;
    if (phases) {
      for (let i = 0; i < phases.length; i++) {
        const px = x + Math.round(bw * phases[i]);
        const passed = e.phase > i;
        g.fillStyle = COL.ink;
        g.fillRect(px, y - 1, 1, bh + 2);
        g.fillStyle = passed ? '#6a5a7a' : COL.purpleHi;
        g.fillRect(px - 1, y - 3, 3, 1);
        g.fillRect(px, y - 2, 1, 1);
      }
      // pips (left of bar)
      const n = phases.length + 1;
      for (let i = 0; i < n; i++) {
        const cx = x - 8 - (n - 1 - i) * 6;
        const cy = y + 2;
        const on = e.phase >= i;
        g.fillStyle = COL.ink;
        g.fillRect(cx - 2, cy - 1, 5, 3);
        g.fillRect(cx - 1, cy - 2, 3, 5);
        g.fillStyle = on ? (e.phase === i ? COL.purple : '#5a4070') : '#241a2e';
        g.fillRect(cx - 1, cy - 1, 3, 3);
        if (e.phase === i) {
          g.fillStyle = COL.purpleHi;
          g.fillRect(cx, cy - 1, 1, 1);
        }
      }
    }
    // armor / sunder: right of the frame, above the % label (phase pips own the left side)
    armorIcon(g, e, x + bw + 4, y - 6);
  }

  private compactBossBar(g: Ctx, e: Unit | null, k: number, count: number, sweep: number): void {
    const slotW = 400 / count;
    const bw = Math.round(slotW - 18);
    const x = Math.round(k * slotW + 9);
    const y = 15;
    const bh = 3;
    const v = e ? this.w.vis.get(e.id) : undefined;
    const alive = !!e && e.alive;
    g.fillStyle = COL.ink;
    g.fillRect(x - 2, y - 2, bw + 4, bh + 4);
    g.fillStyle = alive && e ? (e.enraged ? '#a02020' : COL.goldDeep) : '#3a3040';
    g.fillRect(x - 1, y - 1, bw + 2, 1);
    g.fillRect(x - 1, y + bh, bw + 2, 1);
    g.fillStyle = COL.hpBg;
    g.fillRect(x, y, bw, bh);
    if (!alive || !e) {
      // defeated: a crossed-out slot
      g.fillStyle = '#5a4a60';
      for (let i = 0; i < bw; i += 3) g.fillRect(x + i, y + 1, 2, 1);
      return;
    }
    const frac = clamp01(e.hp / e.maxHp);
    const tw = Math.round(bw * Math.min(v ? v.trailFrac : frac, sweep));
    if (tw > 0) {
      g.fillStyle = '#ffd8c8';
      g.fillRect(x, y, tw, bh);
    }
    const fw = Math.round(bw * Math.min(frac, sweep));
    if (fw > 0) {
      g.fillStyle = e.stagger > 0 ? '#ff9a3a' : COL.hp;
      g.fillRect(x, y, fw, bh);
      g.fillStyle = COL.hpHi;
      g.fillRect(x, y, fw, 1);
    }
    if (e.ward > 0) {
      g.fillStyle = COL.ward;
      g.fillRect(x, y, Math.round(bw * clamp01(e.ward / e.maxHp) * sweep), 1);
    }
    // armor / sunder in the slot's left gutter
    armorIcon(g, e, x - 8, y - 1);
  }

  /** Screen-edge vignettes and tints (screen space). */
  drawScreenFx(g: Ctx, b: Battle): void {
    const w = this.w;
    const t = w.realTime;
    // unstoppable party-wide nuke incoming
    let purple = 0;
    let orange = 0;
    for (let i = 0; i < b.enemies.length; i++) {
      const e = b.enemies[i];
      const wu = e.windup;
      if (!e.alive || !wu) continue;
      const k = wu.ability.effect.kind;
      if (k !== 'nova' && k !== 'drainLantern') continue;
      const urg = 1 - clamp01(wu.remaining / Math.max(0.01, wu.total));
      if (wu.interruptible) orange = Math.max(orange, urg);
      else purple = Math.max(purple, urg);
    }
    if (purple > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(t * (6 + purple * 12));
      g.globalAlpha = clamp01(0.3 + 0.45 * purple) * (0.55 + 0.45 * pulse);
      g.drawImage(vignette('#9a3cff', 400, 180), 0, 0);
    } else if (orange > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 8);
      g.globalAlpha = (0.15 + 0.25 * orange) * (0.6 + 0.4 * pulse);
      g.drawImage(vignette('#ff8a20', 400, 180), 0, 0);
    }
    // lantern about to go out
    const lanternLow = b.lantern < 10 && !b.lanternFrozen && b.lastLightActive <= 0 && (b.phase === 'fight' || b.phase === 'walk');
    if (lanternLow) {
      const danger = 1 - clamp01(b.lantern / 10);
      const flicker = 0.7 + 0.2 * Math.sin(t * 9) + (Math.random() < 0.08 ? 0.15 : 0);
      g.globalAlpha = clamp01((0.22 + 0.4 * danger) * flicker);
      g.drawImage(vignette('#e01818', 400, 180), 0, 0);
    }
    if (b.lastLightActive > 0) {
      g.globalAlpha = 0.35 + 0.15 * Math.sin(t * 5);
      g.drawImage(vignette('#ffd24a', 400, 180), 0, 0);
    }
    // overdrive: golden tint + pulsing border
    if (b.overdriveActive > 0) {
      const fade = clamp01(b.overdriveActive / 0.4);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.07 * fade;
      g.fillStyle = COL.gold;
      g.fillRect(0, 0, 400, 180);
      g.globalCompositeOperation = 'source-over';
      const pulse = 0.6 + 0.4 * Math.sin(t * 10);
      g.globalAlpha = pulse * fade;
      g.fillStyle = COL.gold;
      g.fillRect(0, 0, 400, 2);
      g.fillRect(0, 178, 400, 2);
      g.fillRect(0, 0, 2, 180);
      g.fillRect(398, 0, 2, 180);
      g.fillStyle = COL.goldHi;
      const run = (t * 160) % 400;
      g.fillRect(Math.round(run), 0, 24, 2);
      g.fillRect(Math.round(400 - run - 24), 178, 24, 2);
      g.globalAlpha = 0.25 * fade;
      g.drawImage(vignette('#ffc23a', 400, 180), 0, 0);
    }
    g.globalAlpha = 1;
  }

  // ───────────────────────────── overlay labels ─────────────────────────────

  private pityKey = -1;
  private pityStr = '';
  private pityText(f: number): string {
    const pct = Math.round(f * 100);
    if (pct !== this.pityKey) {
      this.pityKey = pct;
      this.pityStr = `ランタンの記憶: HP・攻撃 -${pct}%`;
    }
    return this.pityStr;
  }

  private iconCache = new Map<IconKey, HTMLCanvasElement>();
  private iconCacheScale = 0;

  private icon(key: IconKey): HTMLCanvasElement {
    if (this.iconCacheScale !== this.iconScale) {
      this.iconCache.clear();
      this.iconCacheScale = this.iconScale;
    }
    let c = this.iconCache.get(key);
    if (!c) {
      c = iconCanvas(key, this.iconScale);
      this.iconCache.set(key, c);
    }
    return c;
  }

  /** Text & icons on the DPR overlay. k = device px per world px, (sx, sy) = shake. */
  drawOverlay(o: Ctx, k: number, b: Battle, sx: number, sy: number): void {
    const w = this.w;
    const t = w.realTime;
    this.iconScale = Math.max(1, Math.round((k * 6.5) / 16));
    const isz = 16 * this.iconScale; // icon size, device px
    o.imageSmoothingEnabled = true;
    for (let i = 0; i < b.enemies.length; i++) {
      const e = b.enemies[i];
      if (!e.alive || e.untargetable > 0) continue;
      const v = w.vis.get(e.id);
      if (!v || !v.ready || v.appear === 3) continue;
      const hpY = this.hpBarY(v);
      // status icons, right of the HP bar
      let ix = (v.cx + (BAR_W[e.size] ?? 18) / 2 + 2 + sx) * k;
      const iy = (hpY + 1 + sy) * k - isz / 2;
      if (e.rank === 'boss') ix = (v.cx + v.w / 2 + 2 + sx) * k;
      if (e.burnStacks > 0) {
        o.drawImage(this.icon('status_burn'), Math.round(ix), Math.round(iy));
        label(o, numStr(e.burnStacks), ix + isz * 0.95, iy + isz * 0.72, 5 * k, COL.fire, false, 'center');
        ix += isz + 3 * k;
      }
      if (e.mark > 0 && e.mark !== Infinity) {
        o.drawImage(this.icon('status_mark'), Math.round(ix), Math.round(iy));
        ix += isz;
      }
      if (e.stun > 0) {
        o.drawImage(this.icon('status_stun'), Math.round(ix), Math.round(iy));
        ix += isz;
      }
      // windup label
      const wu = e.windup;
      if (wu) {
        const by = this.windBarY(e, v);
        const orange = wu.interruptible;
        const col = orange ? COL.orangeHi : COL.purpleHi;
        const cx = (v.cx + sx) * k;
        const nameY = (by - 6 + sy) * k;
        const pop = v.windupAge < 0.15 ? 1 + 0.5 * (1 - v.windupAge / 0.15) : 1;
        const big = e.rank === 'boss' ? 1.2 : 1;
        label(o, wu.ability.name, cx, nameY, 6.2 * k * pop * big, col, false, 'center');
        const tag = wu.weakened ? '弱体化' : orange ? '中断可能' : '中断不可';
        const tagY = nameY - 6.6 * k * big;
        const nameW = measure(o, wu.ability.name, fontFor(6.2 * k * big, false));
        label(o, tag, cx, tagY, 4.6 * k, orange ? COL.orange : COL.purple, true, 'center');
        // hint icon: which skill answers this telegraph
        const hint: IconKey | null = orange ? (b.party.includes('guardian') ? 'skill_shieldBash' : null) : wu.ability.effect.kind === 'nova' || wu.ability.effect.kind === 'drainLantern' || wu.ability.effect.kind === 'strike' ? (b.party.includes('oracle') ? 'skill_sanctuary' : 'status_barrier') : null;
        const barLeft = (v.cx - (WIND_W[e.size] ?? 28) / 2 + sx) * k;
        if (hint) {
          const ic = this.icon(hint);
          const bob = Math.round(Math.sin(t * 8) * k * 0.6);
          o.drawImage(ic, Math.round(barLeft - ic.width - 3 * k), Math.round((by + 1.5 + sy) * k - ic.height / 2) + bob);
        }
        if (wu.ability.channelDrain) {
          const ic = this.icon('lantern');
          const flick = Math.sin(t * 20) > -0.3 ? 1 : 0.4;
          o.globalAlpha = flick;
          o.drawImage(ic, Math.round(cx + nameW / 2 + 3 * k), Math.round(nameY - ic.height / 2));
          o.globalAlpha = 1;
          label(o, '-ランタン', cx + nameW / 2 + 3 * k + ic.width + 2 * k, nameY, 4.6 * k, COL.lanternGreen, true, 'left');
        }
        if (wu.ability.breakFrac) {
          label(o, 'BREAK', barLeft - 2 * k, (by + 4 + 4 + sy) * k, 4.2 * k, COL.gold, false, 'right');
        }
        if (v.windupFlash < 0.8) {
          label(o, '中断可能！', cx, tagY - 7 * k, 6 * k * (1 + 0.3 * (1 - v.windupFlash / 0.8)), COL.orange, true, 'center', COL.ink, 1 - v.windupFlash / 0.8);
        }
      } else if (e.rank === 'elite') {
        label(o, e.name, (v.cx + sx) * k, (hpY - 5 + sy) * k, 4.8 * k, COL.gold, false, 'center');
      }
    }
    // heroes: doom countdown, frozen, stun
    for (let i = 0; i < b.heroes.length; i++) {
      const h = b.heroes[i];
      if (!h.alive) continue;
      const v = w.vis.get(h.id);
      if (!v) continue;
      let ix = (v.cx + sx) * k;
      const iy = (v.top - 9 + sy) * k;
      let n = 0;
      if (h.doom) n++;
      if (h.frozen > 0) n++;
      if (h.dot) n++;
      if (n === 0) continue;
      ix -= ((n - 1) * (isz + 2 * k)) / 2;
      if (h.doom) {
        const urgent = h.doom.time < 1.5;
        const scale = urgent ? 1 + 0.15 * Math.abs(Math.sin(t * 14)) : 1;
        o.drawImage(this.icon('status_doom'), Math.round(ix - (isz * scale) / 2), Math.round(iy - (isz * scale) / 2), Math.round(isz * scale), Math.round(isz * scale));
        label(o, numStr(Math.max(1, Math.ceil(h.doom.time))), ix + isz * 0.55, iy + isz * 0.35, 6.5 * k, urgent ? '#ff6aff' : COL.doom, false, 'center');
        ix += isz + 2 * k;
      }
      if (h.frozen > 0) {
        o.drawImage(this.icon('status_frozen'), Math.round(ix - isz / 2), Math.round(iy - isz / 2));
        ix += isz + 2 * k;
      }
      if (h.dot) {
        label(o, '毒', ix, iy, 5 * k, COL.venom, true, 'center');
      }
    }
    void t;
  }

  /** Boss names, pity note, percentages (screen space). */
  drawBossOverlay(o: Ctx, k: number, b: Battle): void {
    if (this.bossFade < 0.02) return;
    const a = this.bossFade;
    const ids = b.area.bossId;
    const count = Array.isArray(ids) ? ids.length : 1;
    if (!b.enemies.some(isBoss)) return;
    if (count === 1) {
      const e = b.enemies.find(isBoss)!;
      label(o, b.area.bossName, 200 * k, 6.5 * k, 6.5 * k, e.enraged ? '#ffb0a0' : COL.cream, false, 'center', COL.ink, a);
      const pct = e.alive ? Math.ceil((e.hp / e.maxHp) * 100) : 0;
      label(o, PCT_STR[Math.max(0, Math.min(100, pct))], 333 * k, 15.5 * k, 4.8 * k, COL.cream, false, 'left', COL.ink, a);
      let tagX = 67 * k;
      if (e.def?.phases) tagX -= ((e.def.phases.length + 1) * 6 + 4) * k;
      if (e.untargetable > 0) label(o, '潜航中', 200 * k, 23.5 * k, 5 * k, '#9fe8ff', true, 'center', COL.ink, a * (0.6 + 0.4 * Math.sin(this.w.realTime * 8)));
      else if (e.stagger > 0) label(o, 'BREAK!', tagX, 15.5 * k, 5 * k, COL.gold, false, 'right', COL.ink, a);
      if (b.bossPityFrac > 0) {
        label(o, this.pityText(b.bossPityFrac), 330 * k, 23.5 * k, 4.6 * k, COL.gold, true, 'right', COL.ink, a * 0.95);
      }
      return;
    }
    const slots = count;
    const slotW = 400 / slots;
    for (let s = 0; s < slots; s++) {
      const e = bossInSlot(b, s);
      const cx = (s * slotW + slotW / 2) * k;
      const name = e ? e.name : (ENEMIES[Array.isArray(ids) ? ids[s] : ids]?.name ?? '');
      const alive = !!e && e.alive;
      label(o, name, cx, 9 * k, 4.8 * k, alive ? (e.enraged ? '#ffb0a0' : COL.cream) : '#6d5f70', false, 'center', COL.ink, a * (alive ? 1 : 0.75));
      if (alive && e.stagger > 0) label(o, 'BREAK!', cx, 22.5 * k, 4.4 * k, COL.gold, false, 'center', COL.ink, a);
    }
    if (b.bossPityFrac > 0) {
      label(o, this.pityText(b.bossPityFrac), 200 * k, 28 * k, 4.6 * k, COL.gold, true, 'center', COL.ink, a * 0.95);
    }
  }
}

/** Armor (or Sunder, while armor is broken) indicator, 5x5 at (x, y). Nothing if unarmored. */
function armorIcon(g: Ctx, e: Unit, x: number, y: number): void {
  if (e.armor <= 0) return;
  const icon = e.sunder > 0 ? patternCanvas('sunder', SUNDER_ROWS, SUNDER_COLS) : patternCanvas('armor', ARMOR_ROWS, ARMOR_COLS);
  g.drawImage(icon, x, y);
}

function isBoss(e: Unit): boolean {
  return e.rank === 'boss';
}

/** The boss occupying multi-boss slot k (spawn order), if still present. */
function bossInSlot(b: Battle, k: number): Unit | null {
  for (let i = 0; i < b.enemies.length; i++) {
    const e = b.enemies[i];
    if (e.rank === 'boss' && e.slot === k && !e.summoned) return e;
  }
  return null;
}
