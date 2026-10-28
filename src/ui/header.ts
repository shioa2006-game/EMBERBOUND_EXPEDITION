// Top bar shared by battle and camp: area name, currencies (loot targets), playtime, sound & settings.
import type { Loot, SaveData } from '../core/types.ts';
import type { LootTargets } from '../render/api.ts';
import { flash, fmt, fmtClock, h, icon, setText, toggleClass } from './dom.ts';

export interface TopBarHost {
  getSave(): SaveData;
  /** Live area while a run is active (null in camp). */
  runArea(): { name: string; subtitle: string; index: number } | null;
  /** Unbanked loot of the active run (null when no run or already applied). */
  liveLoot(): Loot | null;
  /** Seconds to add to save.playTime for display (the active run's elapsed time). */
  livePlayTime(): number;
  soundOn(): boolean;
  toggleSound(): void;
  openSettings(): void;
  openPause?(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Tiny pixel-art SVG from a list of rects (8x8 grid). */
function pixelSvg(rects: [number, number, number, number][], cls: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 8 8');
  svg.setAttribute('class', cls);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  for (const [x, y, w, hh] of rects) {
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('y', String(y));
    r.setAttribute('width', String(w));
    r.setAttribute('height', String(hh));
    svg.appendChild(r);
  }
  return svg;
}

export function gearSvg(): SVGSVGElement {
  return pixelSvg(
    [[3, 0, 2, 1], [1, 1, 1, 1], [6, 1, 1, 1], [2, 1, 4, 1], [1, 2, 6, 1], [0, 3, 2, 2], [6, 3, 2, 2], [1, 5, 6, 1], [2, 6, 4, 1], [1, 6, 1, 1], [6, 6, 1, 1], [3, 7, 2, 1], [2, 3, 1, 2], [5, 3, 1, 2]],
    'svg-icon',
  );
}

export function speakerSvg(on: boolean): SVGSVGElement {
  const base: [number, number, number, number][] = [[0, 3, 2, 2], [2, 2, 1, 4], [3, 1, 1, 6]];
  const waves: [number, number, number, number][] = on
    ? [[5, 3, 1, 2], [6, 1, 1, 1], [7, 2, 1, 4], [6, 6, 1, 1]]
    : [[5, 2, 1, 1], [7, 2, 1, 1], [6, 3, 1, 2], [5, 5, 1, 1], [7, 5, 1, 1]];
  return pixelSvg([...base, ...waves], 'svg-icon');
}

interface Counter {
  root: HTMLElement;
  value: HTMLElement;
  last: number;
}

export class TopBar {
  readonly el: HTMLElement;
  private host: TopBarHost;
  private areaName: HTMLElement;
  private areaSub: HTMLElement;
  private cycleChip: HTMLElement;
  private gold: Counter;
  private ember: Counter;
  private shard: Counter;
  private time: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private soundState: boolean | null = null;

  constructor(host: TopBarHost) {
    this.host = host;
    const mkCounter = (kind: 'gold' | 'ember' | 'shard', tip: string): Counter => {
      const value = h('span', { class: 'cur-value', text: '0' });
      const root = h('div', { class: `cur cur-${kind}`, tip }, icon(kind, 2, 'cur-icon'), value);
      return { root, value, last: -1 };
    };
    this.gold = mkCounter('gold', 'Gold|敵を倒すと手に入る。\nヒーローのレベルアップに使う。');
    this.ember = mkCounter('ember', 'Ember|エリート・ボス・初回踏破で手に入る。\nスキルツリーの習得に使う。');
    this.shard = mkCounter('shard', 'Relic Shard|Rekindle（転生）と周回ボスで手に入る。\nRelicの購入に使う。');
    this.areaName = h('div', { class: 'tb-area-name' });
    this.areaSub = h('div', { class: 'tb-area-sub' });
    this.cycleChip = h('span', { class: 'tb-cycle', tip: '周回|現在の周回（Rekindle（転生）するたびに+1）' });
    this.time = h('span', { class: 'tb-time-value', text: '0:00:00' });
    this.soundBtn = h('button', {
      class: 'icon-btn tb-sound',
      attrs: { 'aria-label': 'サウンド切替' },
      tip: 'サウンド|効果音とBGMをまとめてON/OFF',
      on: { click: () => this.host.toggleSound() },
    });
    const settingsBtn = h('button', {
      class: 'icon-btn tb-settings',
      attrs: { 'aria-label': '設定' },
      tip: '設定|サウンド・表示・セーブデータ',
      on: { click: () => this.host.openSettings() },
    }, gearSvg());
    this.pauseBtn = h('button', { class: 'btn small tb-pause hidden',
      attrs: { 'aria-label': '一時停止（Esc）' },
      on: { click: () => this.host.openPause?.() },
    }, '一時停止 ', h('span', { class: 'key-badge', text: 'Esc' }));

    this.el = h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'tb-area' },
        h('div', { class: 'tb-area-icon' }, icon('lantern', 2)),
        h('div', { class: 'tb-area-text' }, h('div', { class: 'tb-area-line' }, this.areaName, this.cycleChip), this.areaSub),
      ),
      h('div', { class: 'tb-currencies' }, this.gold.root, this.ember.root, this.shard.root),
      h(
        'div',
        { class: 'tb-right' },
        this.pauseBtn,
        h('div', { class: 'tb-time', tip: 'プレイ時間' }, icon('clock', 2, 'tb-time-icon'), this.time),
        this.soundBtn,
        settingsBtn,
      ),
    );
  }

  /** Loot fly-to targets for the renderer overlay. */
  lootTargets(): LootTargets {
    const rectOf = (c: Counter) => () => {
      if (!c.root.isConnected || c.root.classList.contains('hidden')) return this.gold.root.isConnected ? this.gold.root.querySelector('img')!.getBoundingClientRect() : null;
      const img = c.root.querySelector('img');
      return (img ?? c.root).getBoundingClientRect();
    };
    return { gold: rectOf(this.gold), ember: rectOf(this.ember), shard: rectOf(this.shard) };
  }

  /** Per-frame refresh (cheap: only writes when values change). */
  update(): void {
    const save = this.host.getSave();
    const live = this.host.liveLoot();
    const run = this.host.runArea();
    toggleClass(this.pauseBtn, 'hidden', !run || !this.host.openPause);
    if (run) {
      setText(this.areaName, run.name);
      setText(this.areaSub, `${run.subtitle}・第${run.index + 1}の地`);
    } else {
      // the camp's departure bar names the destination; no second copy up here
      setText(this.areaName, '野営地');
      setText(this.areaSub, '');
    }
    toggleClass(this.cycleChip, 'hidden', save.prestige < 1);
    if (save.prestige >= 1) setText(this.cycleChip, `周回 ${save.prestige + 1}`);

    const gold = save.gold + (live?.gold ?? 0);
    const embers = save.embers + (live?.embers ?? 0);
    const shards = save.shards + (live?.shards ?? 0);
    this.setCounter(this.gold, gold, true);
    this.setCounter(this.ember, embers, embers > 0 || save.stats.embersEarned > 0 || Object.keys(save.tree).length > 1);
    this.setCounter(this.shard, shards, shards > 0 || save.prestige > 0);
    setText(this.time, fmtClock(save.playTime + this.host.livePlayTime()));

    const on = this.host.soundOn();
    if (on !== this.soundState) {
      this.soundState = on;
      this.soundBtn.replaceChildren(speakerSvg(on));
      toggleClass(this.soundBtn, 'is-off', !on);
    }
  }

  private setCounter(c: Counter, v: number, visible: boolean): void {
    const wasHidden = c.root.classList.contains('hidden');
    toggleClass(c.root, 'hidden', !visible);
    if (visible && wasHidden && c.last >= 0) flash(c.root, 'reveal', 900);
    if (v !== c.last) {
      if (c.last >= 0 && v > c.last) flash(c.root, 'bump', 260);
      c.last = v;
      setText(c.value, fmt(v));
    }
  }
}
