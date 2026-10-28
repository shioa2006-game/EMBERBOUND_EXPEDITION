// Stage column beside the tabs: the party at a glance and the departure control every tab shares.
// On narrow windows only the departure bar remains (the party summary is hidden by CSS).
import { BAL, gearTier, nextMilestone } from '../../core/balance.ts';
import { heroLevelCost } from '../../core/state.ts';
import { HERO_ORDER, type HeroId } from '../../core/types.ts';
import { AREAS } from '../../data/areas.ts';
import { HEROES } from '../../data/heroes.ts';
import type { IconKey } from '../../render/sprites/index.ts';
import { clear, h, icon, keycap, setText } from './dom.ts';
import { areaPips, areaStars } from './expedition.ts';
import { departureArea, HERO_COLOR, type CampHost } from './host.ts';

export class CampSide {
  /** Party summary (grid area "side"). */
  readonly el: HTMLElement;
  /** Departure bar (grid area "cta"). */
  readonly cta: HTMLElement;
  private host: CampHost;
  private party: HTMLButtonElement;
  private partyState: HTMLElement;
  private rows: HTMLElement;
  private destination: HTMLElement;
  private destSub: HTMLElement;
  private destMeta: HTMLElement;
  private departBtn: HTMLButtonElement;

  constructor(host: CampHost) {
    this.host = host;
    this.partyState = h('span', 'camp-side-state');
    this.rows = h('span', 'camp-side-rows');
    this.party = h(
      'button',
      {
        class: 'camp-side-party',
        attrs: { type: 'button', 'aria-label': 'パーティを開く' },
        on: {
          click: () => {
            host.sfx('uiClick');
            host.switchTab('party');
          },
        },
      },
      h('span', 'camp-side-head', h('span', 'camp-side-title', 'パーティ'), this.partyState),
      this.rows,
    );
    this.el = h('aside', { class: 'camp-side', attrs: { 'aria-label': 'パーティの状態' } }, this.party);

    this.destination = h('strong', 'camp-depart-destination');
    this.destSub = h('span', 'camp-cta-sub');
    this.destMeta = h('span', 'camp-cta-meta');
    this.departBtn = h(
      'button',
      { class: 'camp-btn camp-depart', attrs: { type: 'button' }, on: { click: () => this.depart() } },
      h('span', 'camp-depart-main', '出発'),
      keycap('Space'),
    );
    this.cta = h(
      'footer',
      { class: 'camp-cta', attrs: { 'aria-label': '遠征の出発操作' } },
      h('div', 'camp-cta-target', h('span', 'camp-label', '遠征先'), this.destination, this.destSub, this.destMeta),
      this.departBtn,
    );
  }

  update(): void {
    const save = this.host.save();
    const mods = this.host.mods();
    const id = departureArea(save);
    const def = AREAS[id];
    const a = save.areas[id];
    setText(this.destination, def.name);
    setText(this.destSub, def.subtitle);
    this.destMeta.replaceChildren(areaPips(a.best, a.bestEver), areaStars(a.stars, 14));
    this.cta.style.setProperty('--accent', def.palette.accent);
    this.departBtn.setAttribute('aria-label', `${def.name}へ出発`);
    this.departBtn.title = `${def.name}へ出発（Space）`;
    this.departBtn.classList.remove('is-launching');

    clear(this.rows);
    let upgradable = 0;
    for (const hero of HERO_ORDER) {
      const st = save.heroes[hero];
      if (!st.recruited) {
        this.rows.appendChild(h('span', 'camp-side-hero is-locked', icon('lock', 16, 'camp-side-lock'), h('span', 'camp-side-name', '未加入の仲間')));
        continue;
      }
      const ready = heroLevelCost(save, hero, 1, mods) <= save.gold;
      if (ready) upgradable++;
      this.rows.appendChild(this.heroRow(hero, st.level, ready));
    }
    setText(this.partyState, upgradable > 0 ? `${upgradable}人 強化できます` : '');
    this.party.classList.toggle('has-action', upgradable > 0);
  }

  depart(): void {
    const save = this.host.save();
    const id = departureArea(save);
    if (!save.areas[id].unlocked) {
      this.host.sfx('uiError');
      return;
    }
    if (save.selectedArea !== id) save.selectedArea = id;
    this.departBtn.classList.add('is-launching');
    this.host.ctx.startRun(id);
  }

  private heroRow(hero: HeroId, level: number, ready: boolean): HTMLElement {
    const tier = gearTier(level);
    const pips = h('span', 'camp-side-tier');
    for (let i = 0; i < BAL.milestones.length; i++) pips.appendChild(h('i', `camp-tier-pip${i < tier ? ' is-on' : ''}`));
    const ms = nextMilestone(level);
    let prev = 1;
    for (const m of BAL.milestones) if (m <= level) prev = m;
    const pct = ms === null ? 100 : Math.max(2, Math.min(100, ((level - prev) / (ms - prev)) * 100));
    return h(
      'span',
      { class: `camp-side-hero${ready ? ' is-ready' : ''}`, style: `--hc:${HERO_COLOR[hero]}` },
      icon(`hero_${hero}` as IconKey, 32, 'camp-side-face'),
      h('span', 'camp-side-name', HEROES[hero].name),
      h('span', 'camp-side-lv camp-num', h('small', null, 'Lv'), String(level)),
      pips,
      h('span', { class: 'camp-side-ms', attrs: { 'aria-hidden': 'true' } }, h('i', { style: `width:${pct.toFixed(1)}%` })),
      ready ? h('span', { class: 'camp-side-up', attrs: { 'aria-label': '強化できる' } }, '▲') : null,
    );
  }
}
