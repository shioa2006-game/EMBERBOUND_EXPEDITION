// Battle / camp / title renderer (implements src/render/api.ts).
//
// Three canvases:
//  (a) world   — high-resolution backing store, with a stable 400 x 180 game coordinate system
//  (b) overlay — same CSS box at devicePixelRatio: damage numbers, labels, banners (crisp text)
//  (c) loot    — fixed full-window overlay where loot flies into the HUD counters
//
// Simulation-synced visuals (projectiles, lunges, particles, deaths) advance on SIM time
// (battle.time deltas), so they slow down with hit-stop / slow-mo; UI-ish layers (texts, banners,
// loot flights, shake, flashes) advance on REAL time.
import { prewarmStorySprites } from './storybook/characters.ts';
import { gearTier } from '../core/balance.ts';
import { HERO_ORDER } from '../core/types.ts';
import { BAL, formatNum } from '../core/balance.ts';
import { GROUND_Y, SIZE_BOX, WORLD_H, WORLD_W, type Battle } from '../core/battle.ts';
import type { BattleEvent, SaveData } from '../core/types.ts';
import { AREAS } from '../data/areas.ts';
import type { IRenderer, LootTargets, RenderSettings, ScreenRect } from './api.ts';
import { COL, HERO_COLOR } from './fx/palette.ts';
import { Effects, LAYER_BACK, LAYER_FRONT } from './fx/effects.ts';
import { Hud } from './fx/hud.ts';
import { LootLayer } from './fx/loot.ts';
import { P_GLOW, P_LIGHT, P_STREAK, P_TWINKLE } from './fx/particles.ts';
import { clearMeasureCache, T_ARC, T_CENTER, T_RISE, T_STAMP } from './fx/text.ts';
import { UnitPainter } from './fx/units.ts';
import { clamp, clamp01, rand } from './fx/util.ts';
import { FxWorld, type UnitVis } from './fx/world.ts';
import { drawAreaBackground, drawAreaForeground, drawCampScene, drawTitleScene, iconCanvas, type IconKey } from './sprites/index.ts';

type Mode = 'none' | 'battle' | 'camp' | 'title';
/** Vertical anchor when the camp scene is cropped: keeps the party at the fire in view. */
const CAMP_FOCUS_Y = 0.8;
/** The camp frame is close-cropped around the fire so the party reads at small sizes. */
const CAMP_ZOOM = 1.3;

const SKIP_TEXT = new Set(['PERFECT', 'LAST LIGHT', '中断可能！']);

export class Renderer implements IRenderer {
  private container: HTMLElement | null = null;
  private world: HTMLCanvasElement | null = null;
  private wctx: CanvasRenderingContext2D | null = null;
  private buf: HTMLCanvasElement | null = null; // offscreen world buffer (shake is applied when presenting)
  private bctx: CanvasRenderingContext2D | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private octx: CanvasRenderingContext2D | null = null;
  private ro: ResizeObserver | null = null;

  private readonly W = new FxWorld();
  private readonly fx: Effects;
  private readonly units: UnitPainter;
  private readonly hud: Hud;
  private readonly loot = new LootLayer();

  private artSignature = "";
  private artWarmup: AbortController | null = null;
  private worldDensity = 4;
  private k = 3; // overlay device px per world px
  private dpr = 1;
  private mode: Mode = 'none';
  private overlayDirty = true;
  private battle: Battle | null = null;
  private lastSimTime = 0;
  private scroll = 0;
  private sceneTime = 0;
  private modeFade = 0; // black fade-in after switching scenes
  private introDark = 0;
  /** Lantern Flare afterglow for the scenery (1 → 0). */
  private flareGlow = 0;
  private endDark = 0;
  private endDarkTarget = 0;
  private endColor = '#000000';
  private overkill = new Set<number>();
  private burnPending: UnitVis[] = [];

  constructor() {
    this.fx = new Effects(this.W);
    this.units = new UnitPainter(this.W, this.fx);
    this.hud = new Hud(this.W);
  }

  // ───────────────────────────── setup ─────────────────────────────

  mount(container: HTMLElement): void {
    if (this.container) return;
    this.container = container;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const world = document.createElement('canvas');
    world.width = WORLD_W;
    world.height = WORLD_H;
    world.className = 'emb-world';
    this.styleLayer(world, 1);
    world.style.imageRendering = 'auto';
    world.style.imageRendering = 'auto';
    const overlay = document.createElement('canvas');
    overlay.className = 'emb-overlay';
    this.styleLayer(overlay, 2);
    container.appendChild(world);
    container.appendChild(overlay);
    this.world = world;
    this.overlay = overlay;
    this.wctx = world.getContext('2d', { alpha: false }) ?? world.getContext('2d');
    this.octx = overlay.getContext('2d');
    if (this.wctx) this.wctx.imageSmoothingEnabled = true;
    const buf = document.createElement('canvas');
    buf.width = WORLD_W;
    buf.height = WORLD_H;
    this.buf = buf;
    this.bctx = buf.getContext('2d');

    this.loot.mount();
    this.loot.worldRect = () => (this.world ? this.world.getBoundingClientRect() : null);

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(container);
    }
    window.addEventListener('resize', () => this.resize());
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts) {
      fonts.ready.then(() => clearMeasureCache()).catch(() => undefined);
    }
    this.resize();
  }

  private styleLayer(c: HTMLCanvasElement, z: number): void {
    const s = c.style;
    s.position = 'absolute';
    s.left = '0px';
    s.top = '0px';
    s.display = 'block';
    s.pointerEvents = 'none';
    s.zIndex = String(z);
  }

  resize(): void {
    const ct = this.container;
    const world = this.world;
    const overlay = this.overlay;
    if (!ct || !world || !overlay) return;
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    const cw = ct.clientWidth;
    const ch = ct.clientHeight;
    // The camp illustration fills its frame (cropping toward the campfire line); battles always show the whole stage.
    const cover = this.mode === 'camp';
    let cssW = WORLD_W;
    let cssH = WORLD_H;
    if (cw > 0 && ch > 0) {
      const fit = cover ? Math.max(cw / WORLD_W, ch / WORLD_H) * CAMP_ZOOM : Math.min(cw / WORLD_W, ch / WORLD_H);
      cssW = WORLD_W * fit;
      cssH = WORLD_H * fit;
    }
    const left = Math.round(((cw - cssW) / 2) * dpr) / dpr;
    const top = Math.round(((ch - cssH) * (cover ? CAMP_FOCUS_Y : 0.5)) * dpr) / dpr;
    for (const c of [world, overlay]) {
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
      c.style.left = `${cover ? left : Math.max(0, left)}px`;
      c.style.top = `${cover ? top : Math.max(0, top)}px`;
    }
    const ow = Math.max(1, Math.round(cssW * dpr));
    const oh = Math.max(1, Math.round(cssH * dpr));
    if (overlay.width !== ow || overlay.height !== oh) {
      overlay.width = ow;
      overlay.height = oh;
    }
    this.k = ow / WORLD_W;
    this.worldDensity = Math.max(2, Math.min(4, this.k));
    const ww = Math.round(WORLD_W * this.worldDensity);
    const wh = Math.round(WORLD_H * this.worldDensity);
    if (world.width !== ww || world.height !== wh) { world.width = ww; world.height = wh; }
    if (this.buf && (this.buf.width !== ww || this.buf.height !== wh)) { this.buf.width = ww; this.buf.height = wh; }
    this.overlayDirty = true;
    this.loot.resize();
  }

  /** Scene switches change how the canvas fits its frame (see resize). */
  private setMode(m: Mode): void {
    const refit = (m === 'camp') !== (this.mode === 'camp');
    this.mode = m;
    if (refit) this.resize();
  }

  setSettings(s: RenderSettings): void {
    this.W.settings = { screenShake: !!s.screenShake, damageNumbers: !!s.damageNumbers };
    this.W.camera.enabled = !!s.screenShake;
  }

  setLootTargets(t: LootTargets): void {
    this.loot.setTargets(t);
  }

  private prepareArt(area: keyof typeof AREAS, heroes: { key: string; tier: number }[]): void {
    const signature = area + heroes.map(h => h.key + h.tier).join('|');
    if (signature === this.artSignature) return;
    this.artSignature = signature;
    this.artWarmup?.abort();
    this.artWarmup = new AbortController();
    const enemies = [...new Set(AREAS[area].stages.flatMap(stage => stage.variants.flat()))];
    if (area === 'ashwood') enemies.push('cinder_sapling');
    void prewarmStorySprites([...heroes, ...enemies.map(key => ({ key, tier: 0 }))], undefined, this.artWarmup.signal)
      .catch(error => console.error('Storybook artwork preparation failed', error));
  }

  beginBattle(battle: Battle): void {
    this.prepareArt(battle.area.id, battle.heroes.map(h => ({ key: h.sprite, tier: gearTier(h.level) })));
    const settings = this.W.settings;
    this.battle = battle;
    this.W.reset();
    this.W.settings = settings;
    this.W.camera.enabled = settings.screenShake;
    this.W.battle = battle;
    this.W.index(battle);
    this.fx.clear();
    this.units.clear();
    this.hud.reset();
    this.overkill.clear();
    this.burnPending.length = 0;
    this.lastSimTime = battle.time;
    this.scroll = 0;
    this.introDark = 0;
    this.flareGlow = 0;
    this.endDark = 0;
    this.endDarkTarget = 0;
    if (this.mode !== 'battle') {
      this.modeFade = 1;
      this.setMode('battle');
    }
  }

  timeScale(): number {
    return this.W.camera.timeScale();
  }

  worldScale(): number {
    return this.world ? this.world.getBoundingClientRect().width / WORLD_W : 0;
  }

  // ───────────────────────────── coordinates ─────────────────────────────

  clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.world) return null;
    const r = this.world.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const x = ((clientX - r.left) / r.width) * WORLD_W;
    const y = ((clientY - r.top) / r.height) * WORLD_H;
    if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return null;
    return { x, y };
  }

  unitClientRect(battle: Battle, unitId: number): ScreenRect | null {
    if (!this.world) return null;
    const u = battle.unitById(unitId);
    if (!u) return null;
    const r = this.world.getBoundingClientRect();
    const kx = r.width / WORLD_W;
    const ky = r.height / WORLD_H;
    const v = this.W.vis.get(unitId);
    let left: number;
    let top: number;
    let w: number;
    let h: number;
    if (v && v.ready) {
      left = v.cx - v.w / 2;
      top = v.top;
      w = v.w;
      h = Math.max(4, v.y - v.top);
    } else {
      const b = SIZE_BOX[u.size];
      left = u.x - b.w / 2;
      top = u.y - b.h;
      w = b.w;
      h = b.h;
    }
    return { x: r.left + left * kx, y: r.top + top * ky, w: w * kx, h: h * ky };
  }

  // ───────────────────────────── events ─────────────────────────────

  pushEvents(events: BattleEvent[], battle: Battle): void {
    if (this.battle !== battle) this.beginBattle(battle);
    if (!events.length) return;
    this.W.index(battle);
    for (let i = 0; i < events.length; i++) this.handle(events[i], battle);
    this.overkill.clear();
  }

  private handle(e: BattleEvent, b: Battle): void {
    const W = this.W;
    const fx = this.fx;
    const pt = W.particles;
    switch (e.type) {
      case 'attack':
        this.onAttack(e.src, e.dst, e.fx, e.travel);
        break;
      case 'damage':
        this.onDamage(e);
        break;
      case 'heal': {
        const u = W.unit(e.dst);
        if (!u) break;
        const v = W.visOf(e.dst);
        if (W.settings.damageNumbers && e.amount >= 1) {
          const t = W.texts.spawn('+' + formatNum(Math.round(e.amount)), v.cx + rand(-3, 3), v.top - 3 - this.stack(v) * 5, COL.heal, 6, T_RISE);
          t.vy = -14;
        }
        if (e.amount > u.maxHp * 0.05) pt.burst(v.cx, v.cy, 5, 8, 26, 0.6, COL.heal, 1, P_TWINKLE, -30, 1);
        break;
      }
      case 'barrier': {
        const u = W.unit(e.dst);
        if (!u) break;
        const v = W.visOf(e.dst);
        if (e.amount > u.maxHp * 0.04 && v.barrierPop > 0.3) {
          v.barrierPop = 0;
          fx.ring(v.cx, v.cy, 4, Math.max(v.w, v.h) * 0.6 + 4, 1, COL.barrier, 0.35);
        }
        break;
      }
      case 'barrierBreak': {
        const v = W.vis.get(e.dst);
        if (!v) break;
        for (let i = 0; i < 14; i++) {
          const a = rand(0, Math.PI * 2);
          const s = rand(40, 110);
          pt.spawn(v.cx + Math.cos(a) * v.w * 0.6, v.cy + Math.sin(a) * v.h * 0.6, Math.cos(a) * s, Math.sin(a) * s - 30, rand(0.3, 0.6), i % 2 ? COL.barrier : COL.white, 1, P_STREAK, 200, 1);
        }
        fx.ring(v.cx, v.cy, Math.max(v.w, v.h) * 0.6, Math.max(v.w, v.h) * 0.9 + 6, 1, COL.barrierHi, 0.3);
        break;
      }
      case 'wardBreak': {
        const v = W.visOf(e.dst);
        fx.hex(e.dst, true);
        v.flashT = 0;
        W.shake(2.2);
        W.camera.flash(COL.ward, 0.18, 0.25);
        break;
      }
      case 'death':
        this.onDeath(e.id, e.side, e.rank, b);
        break;
      case 'revive': {
        const v = W.visOf(e.id);
        v.deathT = 0;
        v.flashT = 0;
        v.trailFrac = v.hpFrac;
        break;
      }
      case 'loot': {
        // spawn at the unit's drawn position (it may still be mid slide-in / knocked back)
        const v = W.vis.get(e.from);
        const lx = v && v.ready ? v.x : e.x;
        this.loot.spawn(e.kind, e.amount, lx, e.y);
        if (e.kind !== 'gold') pt.burst(lx, e.y, 10, 20, 70, 0.5, e.kind === 'ember' ? COL.ember : COL.shard, 2, P_GLOW, -20, 2);
        break;
      }
      case 'skill': {
        const v = W.vis.get(e.src);
        if (!v) break;
        v.castT = 0;
        v.skillT = 0;
        const col = HERO_COLOR[e.hero] ?? COL.gold;
        fx.ring(v.cx, v.cy, 4, Math.max(v.w, v.h) * 0.8 + 6, 1, col, 0.4, LAYER_FRONT, 2);
        pt.burst(v.cx, v.cy, 12, 20, 70, 0.5, col, 1, P_LIGHT, -40, 2);
        const m = Math.max(1, Math.round((this.k * 9) / 16));
        const t = W.texts.spawn(e.auto ? 'AUTO' : '', v.cx, v.top - 12, COL.cream, 4, T_STAMP);
        t.icon = iconCanvas(('skill_' + e.skill) as IconKey, m);
        t.dur = e.auto ? 0.7 : 0.9;
        t.pop = 0.5;
        t.screen = false;
        break;
      }
      case 'perfect': {
        const v = W.vis.get(e.src);
        if (!v) break;
        v.perfectT = 0;
        const t = W.texts.spawn('PERFECT', v.cx, v.top - 27, COL.gold, 9, T_STAMP);
        t.glow = true;
        t.dur = 1.3;
        t.pop = 1.1;
        fx.rays(v.cx, v.cy, COL.goldHi, 12, 26, 0.55);
        fx.ring(v.cx, v.cy, 6, 34, 0.9, COL.gold, 0.5, LAYER_FRONT, 2);
        pt.burst(v.cx, v.cy - 6, 18, 30, 110, 0.7, COL.goldHi, 1, P_TWINKLE, 40, 1.5);
        break;
      }
      case 'emberPip': {
        if (!e.on) break;
        const h = b.heroUnit(e.hero);
        const v = h ? W.vis.get(h.id) : undefined;
        if (!v) break;
        pt.burst(v.cx, v.top - 4, 12, 20, 60, 0.6, COL.ember, 2, P_GLOW, -40, 2);
        fx.ring(v.cx, v.top - 4, 2, 12, 1, HERO_COLOR[e.hero] ?? COL.ember, 0.35);
        break;
      }
      case 'fx':
        this.onFx(e, b);
        break;
      case 'interrupt': {
        const u = W.unit(e.id);
        const v = W.vis.get(e.id);
        W.camera.freeze(0.085);
        W.shake(3);
        W.camera.flash(COL.white, 0.16, 0.18);
        if (u && v) {
          const bar = { x: 0, y: 0, w: 0 };
          const ok = this.hud.windupBarRect(u, bar);
          fx.interrupt(v.cx, v.cy, ok ? bar.y : v.top - 10, ok ? bar.w : 28, v.windupInt ? COL.orange : COL.purple);
          v.flashT = 0;
          v.windupAbility = null;
        }
        break;
      }
      case 'stagger': {
        W.camera.freeze(0.08);
        const v = W.vis.get(e.id);
        if (v) {
          v.flashT = 0;
          fx.ring(v.cx, v.cy, 6, Math.max(v.w, v.h) * 0.8 + 8, 1, COL.gold, 0.4, LAYER_FRONT, 2);
        }
        break;
      }
      case 'stun': {
        const v = W.vis.get(e.id);
        if (v) pt.burst(v.cx, v.top, 8, 20, 60, 0.4, COL.goldHi, 1, P_TWINKLE, 30, 2);
        break;
      }
      case 'windup': {
        const v = W.visOf(e.id);
        const col = e.interruptible ? COL.orange : COL.purple;
        v.windupAge = 0;
        v.windupInt = e.interruptible;
        const t = W.texts.spawn('!', v.cx, Math.max(14, v.top - 36), col, 12, T_STAMP);
        t.dur = 0.65;
        t.pop = 1.2;
        t.glow = true;
        fx.ring(v.cx, v.cy, Math.max(v.w, v.h) * 0.9 + 8, 4, 1, col, 0.35, LAYER_FRONT, 2);
        if (!e.interruptible && (e.kind === 'nova' || e.kind === 'drainLantern')) {
          W.camera.flash('#7a2ad0', 0.14, 0.4);
        }
        break;
      }
      case 'windupChange': {
        const v = W.visOf(e.id);
        v.windupFlash = 0;
        v.windupInt = e.interruptible;
        fx.ring(v.cx, v.cy, 6, Math.max(v.w, v.h) + 10, 1, COL.orange, 0.5, LAYER_FRONT, 2);
        W.shake(1.5);
        W.camera.flash(COL.orange, 0.15, 0.25);
        break;
      }
      case 'ability': {
        const v = W.vis.get(e.id);
        if (v) v.castT = 0;
        break;
      }
      case 'text':
        this.onText(e.id, e.text, e.color, e.size ?? 1);
        break;
      case 'wave': {
        if (e.boss) break;
        const stage = `STAGE ${e.stage + 1}/10`;
        if (e.elite) {
          W.banners.show('elite', 'ELITE!', stage, { accent: '#ff6a3d' });
          W.shake(1.5);
        } else if (e.routed) {
          W.banners.show('stage', stage, '', { dur: 0.7, accent: '#ff7a3d' });
        } else {
          W.banners.show('stage', stage, e.stage === 0 ? `${b.area.name} ― ${b.area.subtitle}` : '', { accent: b.area.palette.accent, dur: e.stage === 0 ? 1.8 : 1.15 });
        }
        break;
      }
      case 'rout':
        W.banners.show('rout', `ROUT ×${e.chain}`, e.chain >= 3 ? '圧倒！' : '', { accent: '#ff8a3d' });
        W.camera.kick(3, 0);
        break;
      case 'bossIntro': {
        const pct = Math.round(e.pity * 100);
        W.banners.show('bossIntro', e.name, e.title, {
          sub2: pct > 0 ? `ランタンの記憶: ボスのHP・攻撃力 -${pct}%` : '',
          accent: b.area.palette.accent,
          flag: b.area.id === 'hollow' || b.area.id === 'heart',
        });
        this.hud.bossIntroT = 0;
        this.introDark = 1.8;
        W.shake(2.5);
        break;
      }
      case 'bossPhase': {
        W.banners.show('phase', e.text || 'PHASE SHIFT', `PHASE ${e.phase + 1}`);
        W.shake(4);
        W.camera.flash('#8a3aff', 0.3, 0.45);
        W.camera.freeze(0.1);
        const v = W.vis.get(e.id);
        if (v) v.flashT = 0;
        break;
      }
      case 'bossDefeated':
        this.onBossDefeated(e.id, e.final, e.time, b);
        break;
      case 'eliteDefeated':
        W.banners.show('eliteDown', 'ELITE DEFEATED', '');
        W.shake(2.5);
        W.camera.freeze(0.06);
        break;
      case 'mark': {
        if (!e.on) break;
        const v = W.visOf(e.id);
        v.markT = 0;
        const u = W.unit(e.id);
        if (u && u.mark === Infinity) fx.ring(v.cx, v.cy, Math.max(v.w, v.h) + 10, 3, 1, COL.gold, 0.3);
        break;
      }
      case 'lantern':
        if (e.low) W.banners.show('warn', 'ランタンが消えかけている！', '');
        break;
      case 'flare':
        this.flareGlow = 1;
        W.banners.show('flare', 'LANTERN FLARE', `灯火が燃え上がる ― 残り ${Math.round(e.lantern)}秒`);
        fx.glow(106, GROUND_Y - 30, 46, COL.ember, 1.5, 0.9);
        pt.burst(106, GROUND_Y - 30, 30, 30, 120, 1.0, COL.emberHi, 2, P_GLOW, -60, 1.5);
        W.camera.flash(COL.emberHi, 0.25, 0.5);
        break;
      case 'lastLight':
        W.banners.show('lastLight', 'LAST LIGHT', '最後の灯火 ― 8秒間 ダメージ +40%');
        W.camera.flash(COL.goldHi, 0.6, 0.6);
        W.shake(2);
        break;
      case 'descent': {
        const a = AREAS[e.area];
        W.banners.show('descent', `DESCENT ▸ ${a.name}`, a.subtitle);
        W.camera.fadeOut(1.3);
        break;
      }
      case 'overdrive':
        if (e.on) {
          W.banners.show('overdrive', 'OVERDRIVE!', '攻撃速度×2 ・ ダメージ+50%');
          W.shake(2);
        }
        break;
      case 'vow': {
        if (!e.ready) break;
        const g = b.heroUnit('guardian');
        const v = g ? W.vis.get(g.id) : undefined;
        if (v) {
          fx.ring(v.cx, v.cy, 4, 26, 1, COL.goldHi, 0.5, LAYER_FRONT, 2);
          pt.burst(v.cx, v.cy, 16, 20, 80, 0.7, COL.goldHi, 2, P_GLOW, -30, 2);
        }
        break;
      }
      case 'emberNova':
        W.banners.show('emberNova', 'EMBER NOVA', '四つの灯が一つに');
        break;
      case 'heavySwing':
        break;
      case 'runEnd':
        if (e.reason === 'wiped') {
          this.endColor = '#2a0006';
          this.endDarkTarget = 0.45;
        } else if (e.reason === 'lantern') {
          this.endColor = '#000000';
          this.endDarkTarget = 0.6;
        }
        break;
    }
  }

  private stack(v: UnitVis): number {
    const now = this.W.realTime;
    if (now - v.stackT < 0.22) v.stack = (v.stack + 1) % 4;
    else v.stack = 0;
    v.stackT = now;
    return v.stack;
  }

  private lunge(srcId: number, dstId: number, travel: number, mult: number, hop: number): void {
    const W = this.W;
    const s = W.unit(srcId);
    const d = W.unit(dstId);
    if (!s || !d) return;
    const v = W.visOf(srcId);
    const gap = Math.abs(d.x - s.x);
    const sw = SIZE_BOX[s.size].w;
    const dw = SIZE_BOX[d.size].w;
    v.lungeDir = d.x >= s.x ? 1 : -1;
    v.lungeDist = clamp((gap - (sw + dw) / 2) * 0.6, 4, 42) * mult;
    v.lungeTravel = Math.max(0.06, travel);
    v.lungeT = 0;
    v.lungeHop = hop;
  }

  private onAttack(src: number, dst: number, kind: string, travel: number): void {
    const W = this.W;
    const fx = this.fx;
    switch (kind) {
      case 'slash':
      case 'heavySlash': {
        const heavy = kind === 'heavySlash';
        this.lunge(src, dst, travel, heavy ? 1.2 : 1, heavy ? 3 : 0);
        fx.slash(dst, travel, heavy, 1);
        break;
      }
      case 'bash':
        this.lunge(src, dst, travel, 1.35, 2);
        fx.impact(dst, travel, '#cfe8ff', 1.25);
        break;
      case 'shockwave': {
        this.lunge(src, dst, travel, 1.2, 4);
        fx.impact(dst, travel, COL.white, 1);
        const s = W.unit(src);
        if (s) fx.groundWave(s.x + 30, GROUND_Y, 2.6, COL.cream, travel);
        break;
      }
      case 'vowbreaker':
        this.lunge(src, dst, travel, 1.5, 12);
        fx.slam(dst, travel);
        break;
      case 'counter':
        this.lunge(src, dst, travel, 0.4, 0);
        fx.counter(src, dst, travel);
        break;
      case 'arrow':
        W.visOf(src).recoilT = 0;
        fx.arrow(src, dst, travel);
        break;
      case 'bolt':
        W.visOf(src).castT = 0.1;
        fx.bolt(src, dst, travel);
        break;
      case 'chain':
        fx.chain(src, dst, true);
        break;
      case 'heal':
        fx.heal(src, dst, travel);
        break;
      case 'smite':
        fx.smite(src, dst, travel);
        break;
      case 'enemyMelee': {
        this.lunge(src, dst, travel, 1, 0);
        fx.claw(dst, travel, false);
        break;
      }
      case 'enemyShot':
        W.visOf(src).recoilT = 0;
        fx.shot(src, dst, travel);
        break;
      case 'enemyMagic':
        W.visOf(src).castT = 0.05;
        fx.orb(src, dst, travel);
        break;
      case 'arrowRain':
        fx.rainArrow(dst, travel);
        break;
    }
  }

  private onDamage(e: Extract<BattleEvent, { type: 'damage' }>): void {
    const W = this.W;
    const u = W.unit(e.dst);
    if (!u) return;
    const v = W.visOf(e.dst);
    const pt = W.particles;
    v.trailHold = 0.45;
    v.knock = e.big || e.crit ? 2 : 1;
    if (e.overkill) this.overkill.add(e.dst);
    const nums = W.settings.damageNumbers;
    if (u.side === 'enemy') {
      if (e.tag !== 'burn') {
        if (e.crit) {
          pt.burst(v.cx, v.cy, 8, 40, 120, 0.3, COL.gold, 1, P_STREAK, 80, 2);
          if (e.big) W.shake(1.8);
        } else if (e.big) {
          W.shake(1);
        }
        if (e.toWard > 0) pt.burst(v.cx, v.cy, 5, 30, 80, 0.3, COL.ward, 1, P_LIGHT, 0, 2);
        if (e.tag === 'emberNova' || e.tag === 'vow') pt.burst(v.cx, v.cy, 12, 40, 140, 0.5, COL.goldHi, 2, P_GLOW, 0, 2);
      }
      if (!nums || e.amount <= 0) return;
      if (e.tag === 'burn') {
        if (v.burnAcc <= 0) {
          v.burnT = 0.5;
          this.burnPending.push(v);
        }
        v.burnAcc += e.amount;
        v.burnCrit = v.burnCrit || e.crit;
        return;
      }
      const txt = formatNum(Math.max(1, Math.round(e.amount))) + (e.crit ? '!' : '');
      let color: string = e.dmgType === 'magic' ? '#ffdcb8' : COL.white;
      let size = 6.2;
      let style = T_RISE;
      if (e.tag === 'chain') color = '#d8ccff';
      else if (e.tag === 'counter' || e.tag === 'reflect') {
        color = '#a8c8ff';
        size = 5.4;
      } else if (e.tag === 'splash' || e.tag === 'explode') size = 5.4;
      if (e.toWard > 0 && e.toWard >= e.amount * 0.5) color = COL.ward;
      if (e.big) {
        size = 8;
        if (color === COL.white) color = '#fff3c8';
      }
      if (e.tag === 'meteor') color = e.toWard > 0 ? COL.wardHi : '#ffb870';
      if (e.crit) {
        size = e.big ? 10.5 : 8.8;
        color = COL.gold;
        style = T_ARC;
      }
      if (e.tag === 'emberNova' || e.tag === 'vow') {
        size = 11;
        color = COL.goldHi;
        style = T_STAMP;
      }
      const t = W.texts.spawn(txt, v.cx + rand(-4, 4), v.top - 2 - this.stack(v) * 5, color, size, style);
      if (e.crit && e.big) t.glow = true;
      if (style === T_STAMP) t.glow = true;
    } else {
      const hpDmg = e.amount - e.absorbed;
      if (e.big && hpDmg > u.maxHp * 0.08) {
        W.shake(2.4);
        W.camera.flash('#ff2020', 0.1, 0.2);
      } else if (hpDmg > u.maxHp * 0.15) {
        W.shake(1.2);
      }
      if (e.absorbed > 0) pt.burst(v.cx, v.cy, 5, 20, 60, 0.3, COL.barrier, 1, P_LIGHT, 0, 2);
      if (e.blocked) {
        // shield clang: blue-white sparks off the guardian's front
        for (let i = 0; i < 7; i++) pt.spawn(v.cx + v.w * 0.4, v.cy + rand(-4, 4), rand(20, 110), rand(-90, 10), rand(0.15, 0.3), i % 2 ? '#9cc8ff' : COL.white, 1, P_STREAK, 220, 2);
        this.fx.ring(v.cx + v.w * 0.4, v.cy, 2, 9, 1.3, '#cfe8ff', 0.18);
      }
      if (!nums) return;
      const sy = v.top - 2 - this.stack(v) * 5;
      if (hpDmg >= 0.5) {
        const col = e.blocked ? '#a8a4b4' : e.big ? '#ff4a4a' : '#ff7a6a';
        const size = e.blocked ? 5.2 : e.big ? 8 : 6;
        W.texts.spawn(formatNum(Math.max(1, Math.round(hpDmg))), v.cx + rand(-3, 3), sy, col, size, e.big ? T_ARC : T_RISE);
      }
      if (e.absorbed >= 0.5) {
        const t = W.texts.spawn(formatNum(Math.round(e.absorbed)), v.cx + 7, sy - 3, COL.barrier, 5, T_RISE);
        t.outline = '#3a3010';
      }
    }
  }

  private onDeath(id: number, side: 'hero' | 'enemy', rank: string, b: Battle): void {
    const W = this.W;
    const u = W.unit(id);
    if (!u) return;
    if (side === 'hero') {
      this.units.onHeroDeath(u);
      W.shake(2.5);
      W.camera.flash('#c01020', 0.16, 0.35);
      return;
    }
    const overkill = this.overkill.has(id);
    const final = rank === 'boss' && (b.area.id === 'hollow' || b.area.id === 'heart');
    this.units.onEnemyDeath(u, overkill && rank !== 'boss', final);
    const v = W.visOf(id);
    if (overkill && rank !== 'boss') {
      const t = W.texts.spawn('粉砕', v.cx, v.top - 8, COL.white, 8, T_STAMP);
      t.outline = '#5a1a10';
      t.glow = true;
      t.dur = 0.9;
    }
    if (rank === 'normal') {
      W.particles.burst(v.cx, v.cy, 6, 20, 60, 0.4, COL.emberHi, 1, P_LIGHT, -20, 2);
    }
    if (rank === 'boss' && b.enemies.some((e) => e.rank === 'boss' && (e.alive || e.reviveTimer > 0) && e.id !== id)) {
      // one of several bosses fell (4-boss final)
      W.shake(4);
      W.camera.flash(COL.white, 0.35, 0.3);
      W.camera.freeze(0.12);
      this.fx.rays(v.cx, v.cy, COL.goldHi, 14, 50, 0.8);
    }
  }

  private onBossDefeated(id: number, final: boolean, time: number, b: Battle): void {
    const W = this.W;
    const fx = this.fx;
    const v = W.vis.get(id);
    const x = v ? v.cx : 318;
    const y = v ? v.cy : 110;
    W.camera.slowmo(1.2, 0.25);
    W.camera.flash(final ? COL.goldHi : COL.white, 0.95, final ? 1.0 : 0.7);
    W.shake(final ? 6 : 5);
    fx.rays(x, y, final ? COL.gold : COL.white, final ? 28 : 22, final ? 180 : 130, final ? 2.0 : 1.5);
    fx.ring(x, y, 8, 220, 0.7, final ? COL.gold : COL.white, 1.0, LAYER_FRONT, 3);
    fx.ring(x, y, 4, 150, 0.6, final ? COL.goldHi : COL.ember, 1.2, LAYER_FRONT, 2);
    fx.glow(x, y, 48, final ? COL.gold : COL.ember, 1.6, 1);
    W.particles.burst(x, y, final ? 80 : 50, 60, 260, 1.2, final ? COL.goldHi : COL.emberHi, 2, P_GLOW, 40, 1.2);
    W.banners.show('bossDown', 'BOSS DEFEATED', `討伐タイム ${time.toFixed(1)}s`, { flag: final });
    this.loot.rain(x, final ? 40 : 26);
    void b;
  }

  private onFx(e: Extract<BattleEvent, { type: 'fx' }>, b: Battle): void {
    const W = this.W;
    const fx = this.fx;
    const pt = W.particles;
    switch (e.fx) {
      case 'meteor':
        fx.meteor(e.x, BAL.meteorDelay);
        break;
      case 'meteorite':
        if (e.dst !== undefined) fx.meteorite(e.x, e.y, e.dst, 0.5);
        break;
      case 'explosion':
        fx.explosion(e.x, e.y, e.scale ?? 1);
        break;
      case 'sanctuary':
        fx.sanctuary(e.x, e.y, e.scale ?? 1);
        break;
      case 'nova':
        if (e.src !== undefined) fx.nova(e.src, e.scale ?? 1);
        break;
      case 'emberNova':
        fx.emberNova(e.x, e.y);
        break;
      case 'summon': {
        const u = e.dst !== undefined ? W.unit(e.dst) : undefined;
        fx.portal(e.x, e.y + (u?.def?.flying ? 18 : 0));
        break;
      }
      case 'ward':
        if (e.dst !== undefined) fx.hex(e.dst, false);
        break;
      case 'submerge':
        fx.splash(e.x, e.y, 1.3);
        W.shake(1.5);
        break;
      case 'emerge': {
        fx.splash(e.x, e.y, 1.9);
        W.shake(3);
        if (e.dst !== undefined) W.visOf(e.dst).flashT = 0;
        break;
      }
      case 'drain':
        fx.drain(e.src ?? 0, e.x, e.y, e.scale ?? 1);
        if ((e.scale ?? 1) >= 2) {
          W.shake(2.5);
          W.camera.flash(COL.lanternGreen, 0.2, 0.4);
        }
        break;
      case 'revive':
        fx.pillar(e.x, e.y, COL.gold);
        break;
      case 'benediction': {
        fx.ring(e.x, e.y - 2, 4, 96, 0.22, '#c8ff8a', 0.6, LAYER_BACK, 2);
        for (const h of b.heroes) {
          if (!h.alive) continue;
          const v = W.vis.get(h.id);
          if (!v) continue;
          for (let i = 0; i < 3; i++) pt.spawn(v.cx + rand(-5, 5), v.cy + rand(0, 8), 0, rand(-40, -20), rand(0.5, 0.8), i % 2 ? '#c8ff8a' : COL.goldHi, 1, P_TWINKLE);
        }
        break;
      }
      case 'overdrive':
        fx.rays(e.x, e.y, COL.gold, 16, 70, 0.8);
        fx.ring(e.x, e.y, 6, 120, 0.5, COL.goldHi, 0.6, LAYER_FRONT, 2);
        W.camera.flash(COL.gold, 0.4, 0.4);
        break;
      case 'phase': {
        const v = e.dst !== undefined ? W.vis.get(e.dst) : undefined;
        const cx = v ? v.cx : e.x;
        const cy = v ? v.cy : e.y - 30;
        fx.ring(cx, cy, 10, 120, 0.8, COL.purple, 0.7, LAYER_FRONT, 3);
        fx.rays(cx, cy, COL.purpleHi, 16, 60, 0.8);
        pt.burst(cx, cy, 40, 40, 180, 0.9, COL.purple, 2, P_GLOW, 0, 1.5);
        break;
      }
      case 'intercede':
        if (e.src !== undefined && e.dst !== undefined) fx.beam(e.src, e.dst, COL.goldHi);
        break;
      case 'shockwave':
        fx.groundWave(e.x, GROUND_Y, e.scale ?? 1, COL.goldHi);
        W.shake(2 * (e.scale ?? 1));
        break;
      case 'freeze':
        if (e.dst !== undefined) fx.freeze(e.dst);
        pt.burst(e.x, e.y - 12, 16, 30, 90, 0.5, COL.ice, 1, P_STREAK, 40, 2);
        W.shake(1.2);
        break;
      case 'doom':
        fx.doom(e.x, e.y);
        break;
      case 'chain':
        if (e.src !== undefined && e.dst !== undefined) fx.chain(e.src, e.dst, false);
        break;
      case 'arrowRain':
        if (e.src !== undefined) fx.volley(e.src);
        break;
      case 'heal':
        if (e.src !== undefined && e.dst !== undefined) fx.heal(e.src, e.dst, 0.3, true);
        break;
      default:
        break;
    }
  }

  private onText(id: number | null, text: string, color: string, size: number): void {
    const W = this.W;
    if (SKIP_TEXT.has(text)) return;
    if (id === null) {
      const t = W.texts.spawn(text, 200, 84, color, 7 * size, T_CENTER);
      t.glow = size >= 1.5;
      return;
    }
    const v = W.vis.get(id);
    const u = W.unit(id);
    if (!v && !u) return;
    const x = v ? v.cx : u!.x;
    const y = v ? v.top : u!.y - 20;
    const big = size >= 1.3;
    const t = W.texts.spawn(text, x, y - (big ? 14 : 9), color, 5.4 * size, big ? T_STAMP : T_RISE);
    if (big) {
      t.glow = true;
      t.dur = 1.1;
    } else {
      t.vy = -12;
      t.dur = 0.9;
    }
  }

  // ───────────────────────────── frame ─────────────────────────────

  renderBattle(battle: Battle, dt: number, simLead?: number): void {
    const out = this.wctx;
    const g = this.bctx;
    const o = this.octx;
    if (!out || !g || !o || !this.buf) return;
    if (this.battle !== battle) this.beginBattle(battle);
    if (this.mode !== 'battle') {
      this.setMode('battle');
      this.modeFade = 1;
    }
    const W = this.W;
    const realDt = clamp(dt, 0, 0.1);
    // Sim-time visuals follow the interpolated sim clock (battle.time + the app's un-ticked
    // accumulator) so they advance every frame instead of only on frames where a 1/60 tick ran.
    const simNow = battle.time + Math.max(0, simLead ?? 0);
    let simDt = simNow - this.lastSimTime;
    this.lastSimTime = simNow;
    if (battle.ended) simDt = realDt;
    simDt = clamp(simDt, 0, 0.1);
    W.realTime += realDt;
    W.simTime += simDt;
    W.frame++;
    W.index(battle);

    // ── update
    W.camera.update(realDt);
    this.hud.update(realDt);
    if (battle.phase === 'walk') this.scroll += simDt * (battle.descending ? 75 : battle.routed ? 130 : 44);
    this.units.layout(battle, simDt);
    this.units.updateCorpses(simDt);
    this.fx.update(simDt);
    W.particles.update(simDt);
    W.texts.update(realDt);
    W.banners.update(realDt);
    this.flushBurns(realDt);
    if (this.introDark > 0) this.introDark = Math.max(0, this.introDark - realDt);
    if (this.flareGlow > 0) this.flareGlow = Math.max(0, this.flareGlow - realDt * .45);
    if (this.modeFade > 0) this.modeFade = Math.max(0, this.modeFade - realDt * 2.5);
    this.endDark += (this.endDarkTarget - this.endDark) * Math.min(1, realDt * 2);

    // ── world (into the offscreen buffer, no shake)
    const sx = W.camera.sx;
    const sy = W.camera.sy;
    const pal = battle.area.palette;
    g.setTransform(this.worldDensity, 0, 0, this.worldDensity, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = true;
    // The party's lantern lights the scenery; the dark closes in as it burns down.
    let lightX = 0, carriers = 0;
    for (const h of battle.heroes) if (h.alive) { lightX += h.x; carriers++; }
    drawAreaBackground(g, battle.area.id, this.scroll, W.simTime, {
      lantern: battle.lanternMax > 0 ? battle.lantern / battle.lanternMax : 1,
      flare: this.flareGlow,
      lightX: carriers ? lightX / carriers : 106,
      overdrive: battle.overdriveActive > 0,
    });
    g.setTransform(this.worldDensity, 0, 0, this.worldDensity, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = true;
    if (this.introDark > 0) {
      g.globalAlpha = 0.5 * clamp01(this.introDark / 0.8);
      g.fillStyle = '#05020a';
      g.fillRect(-4, -4, WORLD_W + 8, WORLD_H + 8);
      g.globalAlpha = 1;
    }
    this.hud.drawTelegraphGround(g, battle);
    this.fx.draw(g, LAYER_BACK, W.realTime);
    this.units.drawShadows(g);
    this.units.drawCorpses(g);
    this.units.drawUnits(g, battle);
    this.hud.drawTargetLines(g, battle);
    this.units.drawOverlays(g);
    this.fx.draw(g, LAYER_FRONT, W.realTime);
    W.particles.draw(g, W.realTime);
    drawAreaForeground(g, battle.area.id, this.scroll, W.simTime);
    g.setTransform(this.worldDensity, 0, 0, this.worldDensity, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this.hud.drawUnitBars(g, battle);

    // ── present with shake, then screen-space layers
    out.setTransform(this.worldDensity, 0, 0, this.worldDensity, 0, 0);
    out.globalAlpha = 1;
    out.globalCompositeOperation = 'source-over';
    out.imageSmoothingEnabled = true;
    if (sx !== 0 || sy !== 0) {
      out.fillStyle = pal.sky;
      out.fillRect(0, 0, WORLD_W, GROUND_Y);
      out.fillStyle = pal.ground;
      out.fillRect(0, GROUND_Y, WORLD_W, WORLD_H - GROUND_Y);
    }
    out.drawImage(this.buf, sx, sy, WORLD_W, WORLD_H);
    this.hud.drawScreenFx(out, battle);
    this.hud.drawBossBars(out, battle, realDt);
    this.drawScreenOverlays(out);

    // ── overlay (text)
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, o.canvas.width, o.canvas.height);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    const k = this.k;
    this.hud.drawOverlay(o, k, battle, sx, sy);
    W.texts.draw(o, k, sx, sy);
    this.hud.drawBossOverlay(o, k, battle);
    W.banners.draw(o, k, W.realTime);
    this.overlayDirty = true;

    // ── loot flights
    this.loot.update(realDt);
    this.loot.draw();
  }

  private drawScreenOverlays(g: CanvasRenderingContext2D): void {
    const cam = this.W.camera;
    if (cam.flashAlpha > 0.01) {
      g.globalAlpha = cam.flashAlpha;
      g.fillStyle = cam.flashColor;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (this.endDark > 0.01) {
      g.globalAlpha = this.endDark;
      g.fillStyle = this.endColor;
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (cam.fade > 0.01) {
      g.globalAlpha = cam.fade;
      g.fillStyle = '#000000';
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (this.modeFade > 0.01) {
      g.globalAlpha = this.modeFade;
      g.fillStyle = '#05030a';
      g.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    g.globalAlpha = 1;
  }

  /** Aggregated burn ticks → one orange number per target every ~0.5 s. */
  private flushBurns(dt: number): void {
    const list = this.burnPending;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      v.burnT -= dt;
      if (v.burnT > 0) {
        list[n++] = v;
        continue;
      }
      if (v.burnAcc > 0 && this.W.settings.damageNumbers) {
        const t = this.W.texts.spawn(formatNum(Math.max(1, Math.round(v.burnAcc))) + (v.burnCrit ? '!' : ''), v.cx + rand(-5, 5), v.top + 2, v.burnCrit ? COL.fire : COL.ember, v.burnCrit ? 6.4 : 5.2, T_RISE);
        t.vy = -10;
        t.dur = 0.8;
      }
      v.burnAcc = 0;
      v.burnCrit = false;
    }
    list.length = n;
  }

  private clearOverlay(): void {
    const o = this.octx;
    if (!o || !this.overlayDirty) return;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, o.canvas.width, o.canvas.height);
    this.overlayDirty = false;
  }

  renderCamp(save: SaveData, dt: number): void {
    this.prepareArt(save.selectedArea, HERO_ORDER.filter(h => save.heroes[h].recruited).map(key => ({ key, tier: gearTier(save.heroes[key].level) })));
    const g = this.wctx;
    if (!g) return;
    if (this.mode !== 'camp') {
      this.setMode('camp');
      this.modeFade = 1;
      this.sceneTime = 0;
    }
    const realDt = clamp(dt, 0, 0.1);
    this.sceneTime += realDt;
    if (this.modeFade > 0) this.modeFade = Math.max(0, this.modeFade - realDt * 2.2);
    g.setTransform(this.worldDensity, 0, 0, this.worldDensity, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = true;
    drawCampScene(g, save, this.sceneTime);
    g.setTransform(this.worldDensity, 0, 0, this.worldDensity, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (this.modeFade > 0.01) {
      g.globalAlpha = this.modeFade;
      g.fillStyle = '#05030a';
      g.fillRect(0, 0, WORLD_W, WORLD_H);
      g.globalAlpha = 1;
    }
    this.clearOverlay();
    this.loot.update(realDt);
    this.loot.draw();
  }

  renderTitle(dt: number): void {
    const g = this.wctx;
    if (!g) return;
    if (this.mode !== 'title') {
      this.setMode('title');
      this.modeFade = 1;
      this.sceneTime = 0;
    }
    const realDt = clamp(dt, 0, 0.1);
    this.sceneTime += realDt;
    if (this.modeFade > 0) this.modeFade = Math.max(0, this.modeFade - realDt * 1.5);
    g.setTransform(this.worldDensity, 0, 0, this.worldDensity, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = true;
    drawTitleScene(g, this.sceneTime);
    g.setTransform(this.worldDensity, 0, 0, this.worldDensity, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (this.modeFade > 0.01) {
      g.globalAlpha = this.modeFade;
      g.fillStyle = '#000000';
      g.fillRect(0, 0, WORLD_W, WORLD_H);
      g.globalAlpha = 1;
    }
    this.clearOverlay();
    this.loot.update(realDt);
    this.loot.draw();
  }
}
