// Unit presentation: pose selection, animation offsets (slide-in, lunges, knockback, bob),
// status visuals (stagger glow, windup charge, haste afterimages, chill/venom tints, ice blocks,
// barrier bubbles, ward hexes, stun stars, mark reticles, doom rings, submerge ripples),
// death animations (pixel dissolve, overkill shatter, boss collapse, hero ghost) and ambient emitters.
import { BAL, gearTier } from '../../core/balance.ts';
import { GROUND_Y, type Battle } from '../../core/battle.ts';
import type { Unit } from '../../core/types.ts';
import { frameCount, getUnitSprite, getUnitWhite, type SpritePose } from '../sprites/index.ts';
import type { Effects } from './effects.ts';
import { COL } from './palette.ts';
import { P_GLOW, P_LIGHT, P_SQUARE, P_TWINKLE } from './particles.ts';
import { glowSprite, pxArc, pxEllipse, pxHex, pxLine, pxRing, pxStar, silhouette, spriteBounds, spritePixels } from './pixel.ts';
import { TAU, clamp01, easeInOutCubic, easeOutCubic, easeOutQuad, rand } from './util.ts';
import type { FxWorld, UnitVis } from './world.ts';

import { canvasWidth, canvasHeight, paintCanvas } from '../storybook/surface.ts';
import { getStoryFrameIndex, getStoryActionDuration } from '../storybook/characters.ts';

type Ctx = CanvasRenderingContext2D;

const C_NORMAL = 0;
const C_ELITE = 1;
const C_OVERKILL = 2;
const C_BOSS = 3;

class Corpse {
  kind = C_NORMAL;
  final = false;
  spr: HTMLCanvasElement | null = null;
  x = 0; // top-left draw position
  y = 0;
  cx = 0;
  cy = 0;
  t = 0;
  dur = 0.6;
  cursor = 0; // dissolve progress (pixel index)
  stride = 1;
  boomT = 0;
}

function byDepth(a: Unit, b: Unit): number {
  return a.y - b.y || a.id - b.id;
}

const STAR_COLORS = [COL.goldHi, COL.white, COL.gold] as const;
const BOSS_FIRE = ['#ffffff', '#fff3a0', '#ffd25a', '#ff8a3d', '#e2461e'] as const;
const FINAL_FIRE = ['#ffffff', '#fff3a0', '#ffe9a0', '#ffd84a', '#ffb347'] as const;

export class UnitPainter {
  private readonly w: FxWorld;
  private readonly fx: Effects;
  private order: Unit[] = [];
  private corpses: Corpse[] = [];
  private corpsePool: Corpse[] = [];

  constructor(w: FxWorld, fx: Effects) {
    this.w = w;
    this.fx = fx;
  }

  clear(): void {
    for (const c of this.corpses) this.corpsePool.push(c);
    this.corpses.length = 0;
    this.order.length = 0;
  }

  // ───────────────────────────── layout ─────────────────────────────

  /** Compute poses, offsets and geometry for every visible unit; run ambient emitters. */
  layout(b: Battle, dt: number): void {
    const w = this.w;
    this.order.length = 0;
    for (let i = 0; i < b.heroes.length; i++) this.order.push(b.heroes[i]);
    for (let i = 0; i < b.enemies.length; i++) {
      const e = b.enemies[i];
      if (e.alive) this.order.push(e);
      else w.visOf(e.id).alivePrev = false;
    }
    this.order.sort(byDepth);
    for (let i = 0; i < this.order.length; i++) this.layoutUnit(b, this.order[i], dt);
  }

  private initVis(b: Battle, u: Unit, v: UnitVis): void {
    const tier = u.side === 'hero' ? gearTier(u.level) : 0;
    const base = getUnitSprite(u.sprite, 'idle', 0, tier);
    const bb = spriteBounds(base.canvas);
    v.offTop = bb.top - base.ay;
    v.offL = bb.left - base.ax;
    v.offR = bb.right - base.ax;
    v.side = u.side;
    v.hpFrac = v.trailFrac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    v.ready = true;
    if (u.side === 'enemy') {
      if (u.rank === 'boss' && b.phase === 'bossIntro') {
        v.appear = 3;
        v.appearT = 0;
      } else if (u.summoned) {
        v.appear = 2;
        v.appearT = 0;
      } else {
        v.appear = 1;
        v.appearT = -Math.max(0, u.slot) * 0.05;
      }
    }
  }

  private poseOf(b: Battle, u: Unit): SpritePose {
    if (u.side === 'hero') {
      if (!u.alive) return 'dead';
      if (u.frozen > 0 || u.stun > 0) return 'hurt';
      const vis = this.w.vis.get(u.id);
      if (vis && vis.skillT < getStoryActionDuration(u.sprite, 'cast')) return 'cast';
      if (u.actFlash < getStoryActionDuration(u.sprite, 'attack')) return 'attack';
      if (u.hitFlash < 0.14) return 'hurt';
      if (b.phase === 'walk') return 'walk';
      return 'idle';
    }
    if (u.stun > 0) return 'hurt';
    if (u.actFlash < getStoryActionDuration(u.sprite, 'attack')) return 'attack';
    if (u.windup) return 'cast';
    if (u.hitFlash < 0.14) return 'hurt';
    return 'idle';
  }

  private layoutUnit(b: Battle, u: Unit, dt: number): void {
    const w = this.w;
    const v = w.visOf(u.id);
    if (!v.ready) this.initVis(b, u, v);
    v.frame = w.frame;
    const t = w.simTime;
    const tier = u.side === 'hero' ? gearTier(u.level) : 0;
    const pose = this.poseOf(b, u);
    let elapsed = t + u.id * .13;
    if (pose === 'attack') elapsed = u.actFlash;
    else if (pose === 'cast') elapsed = u.side === 'hero' ? v.skillT : v.windupAge;
    else if (pose === 'hurt') elapsed = u.hitFlash;
    else if (pose === 'dead') elapsed = v.deathT;
    let fi = getStoryFrameIndex(u.sprite, pose, elapsed, { loop: pose === 'idle' || pose === 'walk' || (pose === 'cast' && u.side === 'enemy') });
    if (u.frozen > 0 || u.stun > 0) fi = getStoryFrameIndex(u.sprite, 'hurt', .05);

    // offsets
    let dx = 0;
    let dy = 0;
    if (v.appear === 1) {
      v.appearT += dt;
      const q = clamp01(v.appearT / 0.4);
      dx += (1 - easeOutCubic(q)) * 84;
      if (q >= 1) v.appear = 0;
    } else if (v.appear === 3) {
      v.appearT += dt;
      dx += (1 - easeOutCubic(clamp01(v.appearT / 1.2))) * 120;
      if (v.appearT > 1.6 && b.phase !== 'bossIntro') v.appear = 0;
    } else if (v.appear === 2) {
      v.appearT += dt;
      dy += Math.round((1 - easeOutCubic(clamp01(v.appearT / 0.4))) * 6);
      if (v.appearT > 0.45) v.appear = 0;
    }
    if (u.alive) {
      const lt = v.lungeT;
      const back = 0.17;
      if (lt < v.lungeTravel + back) {
        v.lungeT += dt;
        let lp = 0;
        if (lt < v.lungeTravel) lp = easeOutQuad(lt / v.lungeTravel);
        else lp = 1 - easeInOutCubic((lt - v.lungeTravel) / back);
        dx += v.lungeDir * v.lungeDist * lp;
        if (v.lungeHop > 0) dy -= v.lungeHop * Math.sin(clamp01(lt / (v.lungeTravel + back)) * Math.PI);
      }
      if (v.recoilT < 0.12) {
        v.recoilT += dt;
        dx -= (u.side === 'hero' ? 1 : -1) * (v.recoilT < 0.06 ? 2 : 1);
      }
      if (u.hitFlash < 0.09) dx += (u.side === 'enemy' ? 1 : -1) * v.knock;
      if (u.stagger > 0) dx += Math.sin(t * 85) > 0 ? 1 : -1;
      if (u.def?.flying && u.stun <= 0) dy += Math.round(Math.sin(t * 3.2 + u.id) * 2);
      if (u.side === 'hero' && b.phase === 'victory') dy -= Math.round(Math.abs(Math.sin(t * 6.5 + u.slot * 0.9)) * 3);
      v.deathT = 0;
    } else {
      v.deathT += dt;
    }
    if (v.castT < 9) v.castT += dt;
    if (v.skillT < 9) v.skillT += dt;
    if (v.flashT < 9) v.flashT += dt;
    if (v.markT < 9) v.markT += dt;
    if (v.barrierPop < 9) v.barrierPop += dt;
    if (v.windupFlash < 9) v.windupFlash += dt;
    if (v.perfectT < 9) v.perfectT += dt;

    const spr = getUnitSprite(u.sprite, pose, fi, tier);
    v.lastSpr = spr.canvas;
    v.lastWhite = u.hitFlash < 0.09 && u.alive ? getUnitWhite(u.sprite, pose, fi, tier).canvas : null;
    v.x = u.x + dx;
    v.y = u.y + dy;
    v.drawX = v.x - spr.ax;
    v.drawY = v.y - spr.ay;
    if (pose === 'dead') {
      const bb = spriteBounds(spr.canvas);
      v.top = v.drawY + bb.top;
      v.cx = v.drawX + (bb.left + bb.right) / 2;
      v.w = bb.right - bb.left;
      v.h = bb.bottom - bb.top;
    } else {
      v.top = v.y + v.offTop;
      v.cx = v.x + (v.offL + v.offR) / 2;
      v.w = v.offR - v.offL;
      v.h = -v.offTop;
    }
    v.cy = v.top + v.h / 2;

    // bars
    const frac = u.maxHp > 0 ? clamp01(u.hp / u.maxHp) : 0;
    v.hpFrac = frac;
    if (frac < v.trailFrac) {
      if (v.trailHold > 0) v.trailHold -= dt;
      else v.trailFrac = Math.max(frac, v.trailFrac - dt * 0.9);
    } else {
      v.trailFrac = frac;
    }
    v.barrierFrac = u.barrier > 0 ? clamp01(u.barrier / u.maxHp) : 0;

    // windup tracking (purple → orange flip detection is event-driven; here: age)
    if (u.windup) {
      if (v.windupAbility !== u.windup.ability) {
        v.windupAbility = u.windup.ability;
        v.windupInt = u.windup.interruptible;
        v.windupAge = 0;
      }
      v.windupAge += dt;
    } else {
      v.windupAbility = null;
    }

    if (u.alive) this.emit(b, u, v, dt);
    v.alivePrev = u.alive;
  }

  /** Ambient status particles (rate-based, sim time). */
  private emit(b: Battle, u: Unit, v: UnitVis, dt: number): void {
    const pt = this.w.particles;
    if (dt <= 0) return;
    const hw = v.w / 2;
    if (u.untargetable > 0) {
      if (Math.random() < 6 * dt) pt.spawn(u.x + rand(-10, 10), u.y - 1, rand(-3, 3), rand(-22, -10), rand(0.4, 0.8), '#9fe8ff', 1, P_TWINKLE);
      return;
    }
    if (u.burnStacks > 0 && Math.random() < (3 + u.burnStacks * 3) * dt) {
      pt.spawn(v.cx + rand(-hw, hw), v.cy + rand(-v.h * 0.2, v.h * 0.4), rand(-4, 4), rand(-34, -18), rand(0.3, 0.5), Math.random() < 0.5 ? COL.ember : COL.fire, 1, P_LIGHT);
    }
    if (u.windup) {
      const col = u.windup.interruptible ? COL.orange : COL.purple;
      const urgency = 1 - clamp01(u.windup.remaining / Math.max(0.01, u.windup.total));
      if (Math.random() < (10 + 26 * urgency) * dt) {
        const a = rand(0, TAU);
        const r = Math.max(v.w, v.h) * 0.6 + 8;
        pt.spawn(v.cx + Math.cos(a) * r, v.cy + Math.sin(a) * r, -Math.cos(a) * r * 3.2, -Math.sin(a) * r * 3.2, 0.28, col, 1, P_LIGHT);
      }
      if (u.windup.ability.channelDrain && Math.random() < 14 * dt) {
        const hs = b.heroes;
        const h = hs[(Math.random() * hs.length) | 0];
        if (h && h.alive) {
          const tt = 0.7;
          const hy = h.y - 12;
          pt.spawn(h.x + rand(-4, 4), hy, (v.cx - h.x) / tt + rand(-10, 10), (v.cy - hy) / tt + rand(-20, 0), tt, COL.lanternGreen, 2, P_GLOW);
        }
      }
    }
    if (u.stagger > 0 && Math.random() < 14 * dt) {
      pt.spawn(v.cx + rand(-hw, hw), v.cy + rand(-v.h / 2, v.h / 2), rand(-10, 10), rand(-30, -10), rand(0.3, 0.6), COL.gold, 1, P_TWINKLE);
    }
    if (u.enraged && Math.random() < 7 * dt) {
      pt.spawn(v.cx + rand(-hw, hw), v.top + rand(0, 6), rand(-6, 6), rand(-26, -12), rand(0.4, 0.7), '#ff4040', 2, P_GLOW, -10, 1);
    }
    if (u.chill > 0 && Math.random() < 5 * dt) {
      pt.spawn(v.cx + rand(-hw - 2, hw + 2), v.top - 2, rand(-4, 4), rand(8, 18), rand(0.5, 0.9), COL.white, 1, P_SQUARE);
    }
    if (u.frozen > 0 && Math.random() < 4 * dt) {
      pt.spawn(v.cx + rand(-hw, hw), v.cy + rand(-v.h / 2, v.h / 2), 0, 0, rand(0.3, 0.6), COL.white, 1, P_TWINKLE);
    }
    if (u.dot && Math.random() < 6 * dt) {
      pt.spawn(v.cx + rand(-hw, hw), v.cy + rand(0, v.h / 2), rand(-3, 3), rand(-20, -8), rand(0.4, 0.7), COL.venom, 1, P_SQUARE);
    }
    if (u.doom && Math.random() < 8 * dt) {
      pt.spawn(v.cx + rand(-hw, hw), v.cy + rand(-v.h / 2, v.h / 2), rand(-5, 5), rand(-26, -10), rand(0.4, 0.8), COL.doom, 2, P_GLOW);
    }
    if (u.side === 'hero') {
      if (b.overdriveActive > 0 && Math.random() < 9 * dt) {
        pt.spawn(v.cx + rand(-hw, hw), v.y - rand(0, 4), rand(-6, 6), rand(-50, -26), rand(0.3, 0.6), COL.gold, 1, P_LIGHT);
      }
      if (b.lastLightActive > 0 && Math.random() < 6 * dt) {
        pt.spawn(v.cx + rand(-hw, hw), v.cy + rand(-4, 8), rand(-5, 5), rand(-30, -12), rand(0.5, 0.9), COL.goldHi, 2, P_GLOW);
      }
      if (u.key === 'guardian' && b.mods.unbrokenVow && u.vow >= u.maxHp * BAL.vowThreshold && Math.random() < 8 * dt) {
        pt.spawn(v.cx + rand(-hw - 2, hw + 2), v.cy + rand(-v.h / 2, v.h / 2), rand(-4, 4), rand(-30, -14), rand(0.4, 0.8), COL.goldHi, 2, P_GLOW);
      }
      if (u.dmgBuff > 0 && u.dmgBuffMult > 1 && Math.random() < 3 * dt) {
        pt.spawn(v.cx + rand(-hw, hw), v.cy + rand(-v.h / 2, v.h / 2), 0, rand(-14, -6), rand(0.3, 0.5), COL.goldHi, 1, P_TWINKLE);
      }
    } else if (u.dmgBuff > 0 && u.dmgBuffMult > 1 && Math.random() < 6 * dt) {
      pt.spawn(v.cx + rand(-hw, hw), v.cy + rand(-v.h / 2, v.h / 2), rand(-4, 4), rand(-26, -10), rand(0.3, 0.6), '#ff7a3d', 1, P_LIGHT);
    }
  }

  // ───────────────────────────── drawing ─────────────────────────────

  drawShadows(g: Ctx): void {
    const w = this.w;
    g.fillStyle = '#000000';
    for (let i = 0; i < this.order.length; i++) {
      const u = this.order[i];
      const v = w.vis.get(u.id);
      if (!v) continue;
      if (u.untargetable > 0 && u.alive) {
        this.drawRipples(g, u.x, u.y + 1);
        continue;
      }
      const flying = !!u.def?.flying;
      const gy = u.y + (flying ? 18 : 0) + 1;
      const rx = Math.max(4, v.w * (flying ? 0.3 : 0.42));
      g.globalAlpha = flying ? 0.18 : u.alive ? 0.32 : 0.2;
      g.fillStyle = '#000000';
      pxEllipse(g, v.x, gy, rx, flying ? 1.2 : 1.8);
    }
    g.globalAlpha = 1;
  }

  private drawRipples(g: Ctx, x: number, y: number): void {
    const t = this.w.simTime;
    for (let k = 0; k < 3; k++) {
      const q = (t * 0.8 + k / 3) % 1;
      const rx = 4 + q * 22;
      g.globalAlpha = (1 - q) * 0.8;
      g.fillStyle = k % 2 ? '#9fe8ff' : COL.white;
      pxRing(g, x, y, rx, rx * 0.22);
    }
    g.globalAlpha = 0.5;
    g.fillStyle = '#0a2a34';
    pxEllipse(g, x, y, 10, 2);
    g.globalAlpha = 1;
  }

  drawUnits(g: Ctx, b: Battle): void {
    const w = this.w;
    const t = w.simTime;
    for (let i = 0; i < this.order.length; i++) {
      const u = this.order[i];
      const v = w.vis.get(u.id);
      if (!v || !v.lastSpr) continue;
      if (u.alive && u.untargetable > 0) continue;
      const spr = v.lastSpr;
      const x = v.drawX;
      const y = v.drawY;
      const alive = u.alive;

      // ── back auras
      if (alive) {
        if (u.side === 'hero' && gearTier(u.level) >= 3) {
          const tier = gearTier(u.level);
          const color = tier === 3 ? '#9ed6f6' : tier === 4 ? '#ffb36c' : '#fff0c4';
          this.glowAt(g, v.cx, v.cy, v.h * .58, color, tier === 5 ? .2 : .09);
          if (tier === 5) {
            g.globalAlpha = .35; g.fillStyle = color;
            pxRing(g, v.x, v.y - 1, v.w * .65, 2.3, .65);
            g.globalAlpha = 1;
          }
        }
        if (u.stagger > 0) this.glowAt(g, v.cx, v.cy, Math.max(v.w, v.h) * 0.7 + 4, COL.gold, 0.55 + 0.25 * Math.sin(t * 20));
        if (u.windup) {
          const urg = 1 - clamp01(u.windup.remaining / Math.max(0.01, u.windup.total));
          const col = u.windup.interruptible ? COL.orange : COL.purple;
          this.glowAt(g, v.cx, v.cy, Math.max(v.w, v.h) * 0.6 + 4 + urg * 4, col, 0.3 + 0.35 * urg + 0.15 * Math.sin(t * (10 + urg * 20)));
        }
        if (u.side === 'hero' && b.overdriveActive > 0) this.glowAt(g, v.cx, v.cy, v.h * 0.7 + 2, COL.gold, 0.3);
        if (u.key === 'guardian' && u.side === 'hero' && b.mods.unbrokenVow && u.vow >= u.maxHp * BAL.vowThreshold) {
          this.glowAt(g, v.cx, v.cy, v.h * 0.75 + 3, COL.goldHi, 0.4 + 0.2 * Math.sin(t * 6));
        }
        if (v.perfectT < 0.6) this.glowAt(g, v.cx, v.cy, v.h * 0.9 + 4, COL.gold, 0.8 * (1 - v.perfectT / 0.6));
        // haste afterimages
        const hasted = (u.haste > 0 && u.hasteMult > 1.01) || (u.side === 'hero' && b.overdriveActive > 0);
        if (hasted) {
          const dir = u.side === 'hero' ? -1 : 1;
          const col = u.side === 'enemy' ? '#ff7a5a' : b.overdriveActive > 0 ? COL.goldHi : '#9cd8ff';
          const ghost = silhouette(spr, col);
          const flick = Math.sin(t * 30) > -0.5 ? 1 : 0.6;
          g.globalAlpha = 0.32 * flick;
          paintCanvas(g, ghost, x + dir * 4, y);
          g.globalAlpha = 0.14 * flick;
          paintCanvas(g, ghost, x + dir * 8, y);
          g.globalAlpha = 1;
        }
      }

      // ── body
      let alpha = 1;
      if (!alive && u.side === 'hero') alpha = v.deathT < 0.5 ? 1 : Math.max(0.42, 1 - (v.deathT - 0.5) * 0.8);
      if (v.appear === 2) alpha = clamp01(v.appearT / 0.35);
      g.globalAlpha = alpha;
      paintCanvas(g, v.lastWhite ?? spr, x, y);
      if (v.appear === 3) {
        // boss reveal: starts as a black silhouette, colour bleeds in
        const reveal = clamp01((v.appearT - 0.55) / 0.8);
        if (reveal < 1) {
          g.globalAlpha = 1 - reveal;
          paintCanvas(g, silhouette(spr, '#05020a'), x, y);
          if (reveal > 0 && reveal < 0.4) {
            g.globalAlpha = (0.4 - reveal) * 2;
            paintCanvas(g, silhouette(spr, COL.white), x, y);
          }
        }
      }
      // ── tints
      if (alive && !v.lastWhite) {
        if (u.frozen > 0) this.tint(g, spr, x, y, '#cfefff', 0.45);
        else if (u.chill > 0) this.tint(g, spr, x, y, '#7cc8ff', 0.38);
        if (u.dot) this.tint(g, spr, x, y, COL.venom, 0.22 + 0.12 * Math.sin(t * 8));
        if (u.doom) this.tint(g, spr, x, y, '#9a40d0', 0.18 + 0.18 * Math.sin(t * 10));
        if (u.stagger > 0 && Math.sin(t * 24) > 0) this.tint(g, spr, x, y, COL.goldHi, 0.35);
        if (u.enraged) this.tint(g, spr, x, y, '#ff3030', 0.12 + 0.1 * Math.sin(t * 7));
        if (u.side === 'enemy' && u.dmgBuff > 0 && u.dmgBuffMult > 1) this.tint(g, spr, x, y, '#ff8a3d', 0.15 + 0.1 * Math.sin(t * 9));
        if (u.mark === Infinity) this.tint(g, spr, x, y, COL.gold, 0.08 + 0.06 * Math.sin(t * 5));
        if (v.flashT < 0.12) this.tint(g, spr, x, y, COL.white, 1 - v.flashT / 0.12);
        if (v.castT < 0.25) this.tint(g, spr, x, y, u.side === 'hero' ? COL.goldHi : COL.white, 0.5 * (1 - v.castT / 0.25));
      } else if (!alive && u.side === 'hero') {
        this.tint(g, spr, x, y, '#a8c4ff', clamp01(v.deathT - 0.3) * 0.35);
      }
      g.globalAlpha = 1;
    }
  }

  /** Front overlays: ice blocks, barrier bubbles, ward hexes, stun stars, reticles, doom rings. */
  drawOverlays(g: Ctx): void {
    const w = this.w;
    const t = w.simTime;
    for (let i = 0; i < this.order.length; i++) {
      const u = this.order[i];
      if (!u.alive || u.untargetable > 0) continue;
      const v = w.vis.get(u.id);
      if (!v) continue;
      const hw = v.w / 2;
      if (u.frozen > 0) {
        const fade = u.frozen < 0.4 ? u.frozen / 0.4 : 1;
        const x0 = Math.round(v.cx - hw - 3);
        const y0 = Math.round(v.top - 3);
        const bw = Math.round(v.w + 6);
        const bh = Math.round(v.y - v.top + 4);
        g.globalAlpha = 0.32 * fade;
        g.fillStyle = COL.ice;
        g.fillRect(x0, y0, bw, bh);
        g.globalAlpha = 0.85 * fade;
        g.fillStyle = '#e8f8ff';
        g.fillRect(x0, y0, bw, 1);
        g.fillRect(x0, y0, 1, bh);
        g.fillStyle = COL.iceDeep;
        g.fillRect(x0, y0 + bh - 1, bw, 1);
        g.fillRect(x0 + bw - 1, y0, 1, bh);
        g.fillStyle = COL.white;
        pxLine(g, x0 + 2, y0 + 6, x0 + 6, y0 + 2);
        pxLine(g, x0 + 3, y0 + 10, x0 + 10, y0 + 3);
        g.globalAlpha = 1;
      }
      if (u.barrier > 0) {
        const frac = clamp01(u.barrier / u.maxHp);
        const rx = hw + 4;
        const ry = v.h / 2 + 4;
        const pop = v.barrierPop < 0.3 ? 1 + (1 - v.barrierPop / 0.3) * 0.25 : 1;
        g.globalAlpha = 0.22 + 0.35 * frac;
        g.fillStyle = COL.barrier;
        pxRing(g, v.cx, v.cy, rx * pop, ry * pop);
        g.globalAlpha = 0.07 + 0.08 * frac;
        pxEllipse(g, v.cx, v.cy, rx * pop, ry * pop);
        const a = ((t * 1.7 + u.id) % TAU);
        g.globalAlpha = 0.9;
        g.fillStyle = COL.white;
        pxArc(g, v.cx, v.cy, rx * pop, ry * pop, a, a + 0.5);
        g.globalAlpha = 1;
      }
      if (u.ward > 0) {
        const r = Math.max(v.w, v.h) * 0.58 + 3;
        const pulse = 0.5 + 0.2 * Math.sin(t * 4 + u.id);
        g.globalAlpha = pulse;
        g.fillStyle = COL.ward;
        pxHex(g, v.cx, v.cy, r, r * 1.04, t * 0.4);
        g.globalAlpha = 0.9;
        g.fillStyle = COL.wardHi;
        const k = Math.floor(t * 5) % 6;
        const a0 = t * 0.4 + (k / 6) * TAU;
        const a1 = a0 + TAU / 6;
        pxLine(g, v.cx + Math.cos(a0) * r, v.cy + Math.sin(a0) * r * 1.04, v.cx + Math.cos(a1) * r, v.cy + Math.sin(a1) * r * 1.04);
        g.globalAlpha = 1;
      }
      if (u.stun > 0) {
        const r = Math.max(6, hw + 1);
        for (let k = 0; k < 3; k++) {
          const a = t * 6 + (k * TAU) / 3;
          g.fillStyle = STAR_COLORS[k];
          pxStar(g, v.cx + Math.cos(a) * r, v.top - 2 + Math.sin(a) * 2, 1);
        }
      }
      if (u.side === 'enemy' && u.mark > 0) {
        const focus = u.mark === Infinity;
        const pop = v.markT < 0.25 ? (1 - easeOutCubic(v.markT / 0.25)) * 10 : 0;
        const pad = 3 + pop + (focus ? Math.round(Math.sin(t * 6)) : 0);
        const x0 = Math.round(v.cx - hw - pad);
        const x1 = Math.round(v.cx + hw + pad);
        const y0 = Math.round(v.top - pad);
        const y1 = Math.round(v.y + 1 + pad * 0.5);
        const L = focus ? 4 : 2;
        g.globalAlpha = 1;
        g.fillStyle = focus ? COL.gold : '#ff4a4a';
        if (focus) {
          g.fillRect(x0, y0, L, 1);
          g.fillRect(x0, y0, 1, L);
          g.fillRect(x1 - L + 1, y0, L, 1);
          g.fillRect(x1, y0, 1, L);
          g.fillRect(x0, y1, L, 1);
          g.fillRect(x0, y1 - L + 1, 1, L);
          g.fillRect(x1 - L + 1, y1, L, 1);
          g.fillRect(x1, y1 - L + 1, 1, L);
          // centre pip
          g.fillStyle = COL.goldHi;
          g.fillRect(Math.round(v.cx), Math.round(v.cy), 1, 1);
        } else {
          g.fillRect(x0, y0, L, 1);
          g.fillRect(x0, y0, 1, L);
          g.fillRect(x1 - L + 1, y0, L, 1);
          g.fillRect(x1, y0, 1, L);
        }
      }
      if (u.doom) {
        const f = clamp01(u.doom.time / Math.max(0.01, u.doom.total));
        const r = 5 + 11 * f;
        const urgent = u.doom.time < 1.5;
        g.globalAlpha = urgent ? (Math.sin(t * 30) > 0 ? 1 : 0.4) : 0.8;
        g.fillStyle = COL.doom;
        pxRing(g, v.cx, v.cy, r, r);
        g.globalAlpha = 1;
      }
    }
    g.globalAlpha = 1;
  }

  private glowAt(g: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
    const s = glowSprite(color, r);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = clamp01(alpha);
    paintCanvas(g, s, Math.round(x - (s.width >> 1)), Math.round(y - (s.height >> 1)));
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  private tint(g: Ctx, spr: HTMLCanvasElement, x: number, y: number, color: string, alpha: number): void {
    if (alpha <= 0.01) return;
    g.globalAlpha = clamp01(alpha);
    paintCanvas(g, silhouette(spr, color), x, y);
    g.globalAlpha = 1;
  }

  // ───────────────────────────── deaths ─────────────────────────────

  onHeroDeath(u: Unit): void {
    const v = this.w.vis.get(u.id);
    if (!v || !v.lastSpr) return;
    v.deathT = 0;
    const idle = getUnitSprite(u.sprite, 'idle', 0, gearTier(u.level));
    this.fx.ghost(silhouette(idle.canvas, '#d8ecff'), u.x - idle.ax, u.y - idle.ay);
    this.w.particles.burst(v.cx, v.cy, 10, 20, 60, 0.6, '#c8dcff', 1, P_TWINKLE, -20, 2);
  }

  onEnemyDeath(u: Unit, overkill: boolean, final: boolean): void {
    const v = this.w.visOf(u.id);
    let spr = v.lastSpr;
    let x = v.drawX;
    let y = v.drawY;
    if (!spr) {
      const s = getUnitSprite(u.sprite, 'hurt', 0, 0);
      spr = s.canvas;
      x = u.x - s.ax;
      y = u.y - s.ay;
    }
    const c = this.corpsePool.pop() ?? new Corpse();
    c.kind = u.rank === 'boss' ? C_BOSS : overkill ? C_OVERKILL : u.rank === 'elite' ? C_ELITE : C_NORMAL;
    c.final = final;
    c.spr = spr;
    c.x = x;
    c.y = y;
    c.cx = v.cx;
    c.cy = v.cy;
    c.t = 0;
    c.cursor = 0;
    c.boomT = 0;
    c.dur = c.kind === C_BOSS ? 2.3 : c.kind === C_ELITE ? 0.85 : c.kind === C_OVERKILL ? 0.3 : 0.55;
    const px = spritePixels(spr);
    const budget = c.kind === C_BOSS ? 260 : c.kind === C_OVERKILL ? 140 : c.kind === C_ELITE ? 150 : 90;
    const avail = Math.max(20, Math.min(budget, this.w.particles.free - 40));
    c.stride = Math.max(1, Math.ceil(px.n / avail));
    this.corpses.push(c);
    if (c.kind === C_ELITE) {
      this.w.shake(2);
      this.w.particles.burst(v.cx, v.cy, 18, 40, 120, 0.6, COL.ember, 2, P_GLOW, -20, 2);
    }
    if (c.kind === C_OVERKILL) this.w.shake(1.5);
  }

  /** Corpses advance on sim time (boss collapse slows with the slow-mo). */
  updateCorpses(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.corpses.length; i++) {
      const c = this.corpses[i];
      c.t += dt;
      this.stepCorpse(c, dt);
      if (c.t >= c.dur) {
        this.corpsePool.push(c);
        continue;
      }
      this.corpses[n++] = c;
    }
    this.corpses.length = n;
  }

  private stepCorpse(c: Corpse, dt: number): void {
    if (!c.spr) return;
    const pt = this.w.particles;
    const px = spritePixels(c.spr);
    const h = canvasHeight(c.spr);
    if (c.kind === C_OVERKILL) {
      if (c.t >= 0.05 && c.cursor === 0) {
        c.cursor = px.n;
        for (let i = 0; i < px.n; i += c.stride) {
          const x = c.x + px.xs[i];
          const y = c.y + px.ys[i];
          const dx = x - c.cx;
          const dy = y - c.cy;
          const s = rand(4, 9);
          pt.spawn(x, y, dx * s + rand(-30, 30), dy * s - rand(40, 120), rand(0.6, 1.2), px.cols[i], c.stride > 2 ? 2 : 1, P_SQUARE, 330, 0.5, GROUND_Y + rand(0, 10));
        }
      }
      return;
    }
    if (c.kind === C_BOSS) {
      const collapse = 1.55;
      if (c.t < collapse) {
        c.boomT -= dt;
        if (c.boomT <= 0) {
          c.boomT = rand(0.07, 0.14) * (1 - c.t / collapse * 0.5);
          if (px.n > 0) {
            const k = (Math.random() * px.n) | 0;
            const ex = c.x + px.xs[k];
            const ey = c.y + px.ys[k];
            this.fx.explosion(ex, ey, rand(0.4, 0.8), c.final ? FINAL_FIRE : BOSS_FIRE);
          }
        }
        return;
      }
      // disintegrate bottom → top, drifting upward
      const q = clamp01((c.t - collapse) / (c.dur - collapse - 0.1));
      const target = Math.floor(px.n * q);
      const sink = Math.round(collapse * 5);
      let i = c.cursor;
      for (; i < target; i += c.stride) {
        const j = px.n - 1 - i;
        if (j < 0) break;
        pt.spawn(c.x + px.xs[j], c.y + sink + px.ys[j], rand(-25, 25), rand(-70, -20), rand(0.6, 1.3), c.final && Math.random() < 0.5 ? COL.goldHi : px.cols[j], 1, Math.random() < 0.2 ? P_LIGHT : P_SQUARE, -20, 1);
      }
      c.cursor = Math.max(c.cursor, i);
      return;
    }
    // normal / elite: white blink, then dissolve top → bottom
    const blink = c.kind === C_ELITE ? 0.14 : 0.08;
    if (c.t < blink) return;
    const span = c.dur - blink - 0.05;
    const q = clamp01((c.t - blink) / span);
    const line = q * h;
    while (c.cursor < px.n && px.ys[c.cursor] < line) {
      const i = c.cursor;
      pt.spawn(c.x + px.xs[i], c.y + px.ys[i], rand(-12, 12), rand(-30, -6), rand(0.45, 0.9), i % 7 === 0 ? COL.emberHi : px.cols[i], 1, i % 7 === 0 ? P_LIGHT : P_SQUARE, 70, 0.5, GROUND_Y + rand(0, 6));
      c.cursor += c.stride;
    }
  }

  drawCorpses(g: Ctx): void {
    for (let i = 0; i < this.corpses.length; i++) {
      const c = this.corpses[i];
      if (!c.spr) continue;
      const spr = c.spr;
      if (c.kind === C_OVERKILL) {
        if (c.t < 0.05) paintCanvas(g, silhouette(spr, COL.white), c.x, c.y);
        continue;
      }
      if (c.kind === C_BOSS) {
        const collapse = 1.55;
        if (c.t < collapse) {
          const shake = Math.round(Math.sin(c.t * 70) * (1 + c.t));
          const sink = Math.round(c.t * 5);
          const sh = Math.max(1, canvasHeight(spr) - sink);
          paintCanvas(g, spr, 0, 0, canvasWidth(spr), sh, c.x + shake, c.y + sink, canvasWidth(spr), sh);
          const rate = 6 + c.t * 14;
          if (Math.sin(c.t * rate * Math.PI) > 0.3) {
            g.globalAlpha = 0.75;
            paintCanvas(g, silhouette(spr, c.final ? COL.goldHi : COL.white), 0, 0, canvasWidth(spr), sh, c.x + shake, c.y + sink, canvasWidth(spr), sh);
            g.globalAlpha = 1;
          }
        } else {
          const px = spritePixels(spr);
          const q = px.n > 0 ? c.cursor / px.n : 1;
          const keep = Math.max(0, Math.round(canvasHeight(spr) * (1 - q)));
          if (keep > 0) {
            g.globalAlpha = 0.9;
            paintCanvas(g, silhouette(spr, c.final ? COL.goldHi : COL.white), 0, 0, canvasWidth(spr), keep, c.x, c.y + Math.round(collapse * 5), canvasWidth(spr), keep);
            g.globalAlpha = 1;
          }
        }
        continue;
      }
      const blink = c.kind === C_ELITE ? 0.14 : 0.08;
      if (c.t < blink) {
        paintCanvas(g, silhouette(spr, COL.white), c.x, c.y);
        continue;
      }
      const span = c.dur - blink - 0.05;
      const q = clamp01((c.t - blink) / span);
      const line = Math.floor(q * canvasHeight(spr));
      const rest = canvasHeight(spr) - line;
      if (rest <= 0) continue;
      paintCanvas(g, spr, 0, line, canvasWidth(spr), rest, c.x, c.y + line, canvasWidth(spr), rest);
      // glowing dissolve front
      g.globalAlpha = 0.9;
      paintCanvas(g, silhouette(spr, c.kind === C_ELITE ? COL.fire : COL.emberHi), 0, line, canvasWidth(spr), 1, c.x, c.y + line, canvasWidth(spr), 1);
      g.globalAlpha = 0.35;
      paintCanvas(g, silhouette(spr, '#2a1020'), 0, line, canvasWidth(spr), rest, c.x, c.y + line, canvasWidth(spr), rest);
      g.globalAlpha = 1;
    }
  }
}
