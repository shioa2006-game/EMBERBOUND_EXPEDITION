// One-time in-battle tutorial: run intro card, freeze-frame spotlights (interrupt / Sanctuary / Mark)
// and anchored hint bubbles (AUTO / Overdrive). Flags persist in save.tutorial ("battle.*").
// Rules: never in the first 3 s of a run, at most one hint per wave.
import { HEROES } from '../data/heroes.ts';
import type { Battle } from '../core/battle.ts';
import type { BattleEvent, HeroId, SaveData } from '../core/types.ts';
import type { IAudio } from '../audio/api.ts';
import type { IRenderer } from '../render/api.ts';
import { h, isTouch, tapWord } from './dom.ts';
import type { BattleHud } from './hud.ts';
import { introCard, type NoticePlayer } from './notices.ts';

/** "[1] " before a skill name for keyboards; nothing on touch screens. */
function keyHint(key: string): string {
  return isTouch() ? '' : `[${key}] `;
}

export interface TutorialHost {
  getSave(): SaveData;
  persist(): void;
  renderer: IRenderer;
  hud: BattleHud;
  notices: NoticePlayer;
  audio: IAudio;
  viewport: HTMLElement;
  /** True while any modal/notice blocks the battle. */
  blocked(): boolean;
}

type FreezeKind = 'interrupt' | 'sanctuary' | 'mark';

interface Freeze {
  kind: FreezeKind;
  enemyId: number | null;
  castHero: HeroId | null;
  targets: (() => DOMRect | null)[];
  el: HTMLElement;
  svg: SVGSVGElement;
  holes: SVGRectElement[];
  rings: HTMLElement[];
  bubble: HTMLElement;
  age: number;
}

interface Bubble {
  el: HTMLElement;
  anchor: HTMLElement;
  ttl: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const FLAG = {
  intro: 'battle.intro',
  interrupt: 'battle.interrupt',
  sanctuary: 'battle.sanctuary',
  mark: 'battle.mark',
  auto: 'battle.auto',
  overdrive: 'battle.overdrive',
};

const DANGEROUS_PURPLE = new Set(['nova', 'drainLantern', 'strike', 'doom']);

export class Tutorial {
  private host: TutorialHost;
  private layer: HTMLElement;
  private freeze: Freeze | null = null;
  private bubble: Bubble | null = null;
  private battle: Battle | null = null;
  private lastHintWave = '';
  private orangeCandidate: number | null = null;
  private purpleCandidate: number | null = null;
  private maskSeq = 0;

  constructor(host: TutorialHost, layer: HTMLElement) {
    this.host = host;
    this.layer = layer;
    // Any click resumes a freeze-frame (after the click itself was handled: cast / mark).
    document.addEventListener(
      'pointerdown',
      () => {
        if (this.freeze && this.freeze.age > 0.25) window.setTimeout(() => this.resolveFreeze(), 0);
      },
      true,
    );
  }

  /** Simulation time scale contributed by the tutorial (0 while a freeze-frame is shown). */
  scale(): number {
    return this.freeze ? 0 : 1;
  }

  get frozen(): boolean {
    return this.freeze !== null;
  }

  private seen(key: string): boolean {
    return !!this.host.getSave().tutorial[key];
  }

  private mark(key: string): void {
    this.host.getSave().tutorial[key] = true;
    this.host.persist();
  }

  onRunStart(b: Battle): void {
    this.battle = b;
    this.lastHintWave = '';
    this.orangeCandidate = null;
    this.purpleCandidate = null;
    this.clearAll();
    const save = this.host.getSave();
    if (!this.seen(FLAG.intro) && save.stats.runs === 0) {
      this.mark(FLAG.intro);
      void this.host.notices.play([introCard()]);
    }
  }

  onRunEnd(): void {
    this.clearAll();
    this.battle = null;
  }

  onEvents(events: BattleEvent[], b: Battle): void {
    for (const e of events) {
      if (e.type === 'windup') {
        if (e.interruptible && !this.seen(FLAG.interrupt)) this.orangeCandidate = e.id;
        else if (!e.interruptible && !this.seen(FLAG.sanctuary) && b.party.includes('oracle') && DANGEROUS_PURPLE.has(e.kind)) this.purpleCandidate = e.id;
      } else if (e.type === 'mark' && e.on && this.freeze?.kind === 'mark') {
        this.resolveFreeze();
      }
    }
  }

  /** The player cast a skill manually. */
  onCast(hero: HeroId): void {
    if (this.freeze && (this.freeze.castHero === hero || this.freeze.castHero === null)) this.resolveFreeze();
  }

  update(b: Battle, dt: number): void {
    if (this.freeze) {
      this.freeze.age += dt;
      this.layoutFreeze();
      return;
    }
    if (this.bubble) {
      this.bubble.ttl -= dt;
      this.layoutBubble();
      if (this.bubble.ttl <= 0 || !this.bubble.anchor.isConnected) this.closeBubble();
    }
    if (b.ended || b.phase !== 'fight' || b.time < 3 || this.host.blocked()) return;
    const waveKey = `${b.segments.length}:${b.stage}`;
    if (waveKey === this.lastHintWave || this.bubble) return;

    // 1) first ORANGE windup → interrupt freeze
    if (this.orangeCandidate !== null) {
      const e = b.enemies.find((u) => u.id === this.orangeCandidate);
      if (!e || !e.alive || !e.windup || !e.windup.interruptible) this.orangeCandidate = null;
      else if (b.skillReady('guardian') && e.windup.remaining > 0.35) {
        this.lastHintWave = waveKey;
        this.mark(FLAG.interrupt);
        this.orangeCandidate = null;
        this.startFreeze('interrupt', e.id, 'guardian', 'オレンジのゲージ＝溜め攻撃。', `${keyHint('1')}${HEROES.guardian.skill.name}で中断！`, `中断するとBREAK！ 大ダメージ＋スタン。（${tapWord()}で再開）`);
        return;
      }
    }
    // 2) first PURPLE windup with the Oracle → Sanctuary freeze
    if (this.purpleCandidate !== null) {
      const e = b.enemies.find((u) => u.id === this.purpleCandidate);
      if (!e || !e.alive || !e.windup || e.windup.interruptible) this.purpleCandidate = null;
      else if (b.skillReady('oracle') && e.windup.remaining > 0.35) {
        this.lastHintWave = waveKey;
        this.mark(FLAG.sanctuary);
        this.purpleCandidate = null;
        this.startFreeze('sanctuary', e.id, 'oracle', '紫のゲージは中断できない。', `${keyHint('4')}${HEROES.oracle.skill.name}で防げ！`, `Barrierが大技を吸収する。直前に張ればPERFECT。（${tapWord()}で再開）`);
        return;
      }
    }
    // 3) Mark (first battle after the Ranger joins)
    if (b.canFocus() && !this.seen(FLAG.mark) && b.focusId === null) {
      const ts = b.targetableEnemies();
      if (ts.length >= 2) {
        const pick = [...ts].sort((x, y) => y.maxHp - x.maxHp)[0];
        this.lastHintWave = waveKey;
        this.mark(FLAG.mark);
        this.startFreeze('mark', pick.id, null, `敵を${tapWord()}してMark！`, '（集中攻撃）', `Markした敵は被ダメージ+20%、パーティ全員が狙う。もう一度${tapWord()}で解除。`);
        return;
      }
    }
    // 4) AUTO unlocked
    if (b.mods.autoCast && !this.seen(FLAG.auto)) {
      this.lastHintWave = waveKey;
      this.mark(FLAG.auto);
      this.showBubble(this.host.hud.autoEl('guardian'), 'AUTO解放！', 'ONにすると準備でき次第スキルを自動発動。（自動発動はPERFECTにならない）');
      return;
    }
    // 5) Overdrive ready for the first time
    if (b.mods.overdrive && !this.seen(FLAG.overdrive) && b.canOverdrive()) {
      this.lastHintWave = waveKey;
      this.mark(FLAG.overdrive);
      this.showBubble(this.host.hud.overdriveEl(), 'Overdrive 準備完了！', `${isTouch() ? 'タップ' : '[Space]'}で6秒間、攻撃速度×2・ダメージ+50%！`);
    }
  }

  // ─────────────────────────── freeze-frame spotlight ───────────────────────────

  private startFreeze(kind: FreezeKind, enemyId: number | null, castHero: HeroId | null, line1: string, line2: string, sub: string): void {
    const targets: (() => DOMRect | null)[] = [];
    if (enemyId !== null) {
      targets.push(() => {
        const b = this.battle;
        if (!b) return null;
        const r = this.host.renderer.unitClientRect(b, enemyId);
        if (!r) return null;
        // include the windup bar + its label above the unit (drawn in world px, so scale the padding)
        const k = this.host.renderer.worldScale() || 1;
        const padTop = 30 * k;
        const padSide = 18 * k;
        const padBottom = 2 * k;
        return new DOMRect(r.x - padSide, r.y - padTop, r.w + padSide * 2, r.h + padTop + padBottom);
      });
    }
    if (castHero) {
      const el = this.host.hud.skillEl(castHero);
      targets.push(() => (el.isConnected ? el.getBoundingClientRect() : null));
    }
    const id = `tut-mask-${++this.maskSeq}`;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'tut-dim');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const mask = document.createElementNS(SVG_NS, 'mask');
    mask.setAttribute('id', id);
    const full = document.createElementNS(SVG_NS, 'rect');
    full.setAttribute('width', '100%');
    full.setAttribute('height', '100%');
    full.setAttribute('fill', 'white');
    mask.appendChild(full);
    const holes = targets.map(() => {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('fill', 'black');
      r.setAttribute('rx', '6');
      mask.appendChild(r);
      return r;
    });
    defs.appendChild(mask);
    svg.appendChild(defs);
    const dim = document.createElementNS(SVG_NS, 'rect');
    dim.setAttribute('width', '100%');
    dim.setAttribute('height', '100%');
    dim.setAttribute('class', 'tut-dim-fill');
    dim.setAttribute('mask', `url(#${id})`);
    svg.appendChild(dim);
    const rings = targets.map(() => h('div', { class: `tut-ring tut-ring-${kind}` }));
    const bubble = h(
      'div',
      { class: `tut-card tut-${kind}` },
      h('div', { class: 'tut-kicker', text: 'HINT' }),
      h('div', { class: 'tut-line1', text: line1 }),
      h('div', { class: 'tut-line2', text: line2 }),
      h('div', { class: 'tut-sub', text: sub }),
    );
    const el = h('div', { class: 'tut-freeze' }, svg, ...rings, bubble);
    this.layer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    this.freeze = { kind, enemyId, castHero, targets, el, svg, holes, rings, bubble, age: 0 };
    this.host.audio.play('uiHover');
    this.layoutFreeze();
  }

  private layoutFreeze(): void {
    const f = this.freeze;
    if (!f) return;
    f.targets.forEach((get, i) => {
      const r = get();
      const hole = f.holes[i];
      const ring = f.rings[i];
      if (!r || r.width <= 0) {
        hole.setAttribute('width', '0');
        ring.style.display = 'none';
        return;
      }
      const pad = 6;
      hole.setAttribute('x', String(r.x - pad));
      hole.setAttribute('y', String(r.y - pad));
      hole.setAttribute('width', String(r.width + pad * 2));
      hole.setAttribute('height', String(r.height + pad * 2));
      ring.style.display = '';
      ring.style.transform = `translate(${Math.round(r.x - pad)}px, ${Math.round(r.y - pad)}px)`;
      ring.style.width = `${Math.round(r.width + pad * 2)}px`;
      ring.style.height = `${Math.round(r.height + pad * 2)}px`;
    });
    const vp = this.host.viewport.getBoundingClientRect();
    const bw = f.bubble.offsetWidth;
    const x = vp.left + vp.width / 2 - bw / 2;
    const y = vp.top + Math.max(12, vp.height * 0.08);
    f.bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  private resolveFreeze(): void {
    const f = this.freeze;
    if (!f) return;
    this.freeze = null;
    f.el.classList.remove('in');
    f.el.classList.add('out');
    window.setTimeout(() => f.el.remove(), 260);
  }

  // ─────────────────────────── anchored bubble ───────────────────────────

  private showBubble(anchor: HTMLElement, title: string, text: string): void {
    if (!anchor.isConnected || anchor.offsetParent === null) return;
    const el = h('div', { class: 'tut-bubble' }, h('div', { class: 'tut-bubble-title', text: title }), h('div', { class: 'tut-bubble-text', text }), h('span', { class: 'tut-bubble-arrow' }));
    this.layer.appendChild(el);
    anchor.classList.add('tut-pulse');
    const onClick = () => this.closeBubble();
    anchor.addEventListener('click', onClick, { once: true });
    el.addEventListener('click', onClick, { once: true });
    this.bubble = { el, anchor, ttl: 8 };
    requestAnimationFrame(() => el.classList.add('in'));
    this.layoutBubble();
  }

  private layoutBubble(): void {
    const bb = this.bubble;
    if (!bb) return;
    const r = bb.anchor.getBoundingClientRect();
    const w = bb.el.offsetWidth;
    const hh = bb.el.offsetHeight;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const y = r.top - hh - 14;
    bb.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    const arrow = bb.el.querySelector('.tut-bubble-arrow') as HTMLElement | null;
    if (arrow) arrow.style.left = `${Math.round(r.left + r.width / 2 - x - 7)}px`;
  }

  private closeBubble(): void {
    const bb = this.bubble;
    if (!bb) return;
    this.bubble = null;
    bb.anchor.classList.remove('tut-pulse');
    bb.el.classList.remove('in');
    bb.el.classList.add('out');
    window.setTimeout(() => bb.el.remove(), 260);
  }

  private clearAll(): void {
    this.resolveFreeze();
    this.closeBubble();
  }
}
