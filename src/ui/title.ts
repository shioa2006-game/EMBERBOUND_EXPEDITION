// Title screen: pixel logo with ember glow, continue / new game / delete save, sound toggle.
import { AREAS } from '../data/areas.ts';
import { frontierArea } from '../core/state.ts';
import type { SaveData } from '../core/types.ts';
import type { IAudio } from '../audio/api.ts';
import { clear, fmtClock, h } from './dom.ts';
import { speakerSvg } from './header.ts';
import type { Modals } from './modal.ts';
import { emberField } from './notices.ts';

export interface TitleHost {
  modals: Modals;
  audio: IAudio;
  /** Existing save on disk (null = none). */
  storedSave(): SaveData | null;
  continueGame(): void;
  newGame(): void;
  deleteSave(): void;
  soundOn(): boolean;
  toggleSound(): void;
}

export class TitleScreen {
  readonly el: HTMLElement;
  private host: TitleHost;
  private continueBtn: HTMLButtonElement;
  private newBtn: HTMLButtonElement;
  private deleteBtn: HTMLButtonElement;
  private summary: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private busy = false;

  constructor(host: TitleHost) {
    this.host = host;
    this.continueBtn = h('button', { class: 'btn primary big title-btn', on: { click: () => this.onContinue() } }, h('span', { text: 'つづきから' }));
    this.newBtn = h('button', { class: 'btn big title-btn', on: { click: () => void this.onNew() } }, h('span', { text: 'はじめから' }));
    this.deleteBtn = h('button', { class: 'btn small ghost title-delete', text: 'セーブ削除', on: { click: () => void this.onDelete() } });
    this.summary = h('div', { class: 'title-summary' });
    this.soundBtn = h('button', { class: 'btn small ghost title-sound', on: { click: () => this.toggleSound() } });

    const logo = h(
      'h1',
      { class: 'logo', attrs: { 'aria-label': 'EMBERBOUND EXPEDITION' } },
      h('span', { class: 'logo-top', text: 'EMBERBOUND', attrs: { 'data-text': 'EMBERBOUND' } }),
      h('span', { class: 'logo-rule' }, h('span', { class: 'logo-flame' })),
      h('span', { class: 'logo-bottom', text: 'EXPEDITION', attrs: { 'data-text': 'EXPEDITION' } }),
    );

    this.el = h(
      'section',
      { class: 'title-screen', attrs: { 'aria-label': 'タイトル' } },
      h('div', { class: 'title-vignette' }),
      emberField(26, 'ember-field title-embers'),
      h(
        'div',
        { class: 'title-center' },
        logo,
        h('p', { class: 'title-sub', text: '消えゆく残り火を携え、闇の底へ――' }),
        h('div', { class: 'title-menu' }, this.continueBtn, this.summary, this.newBtn),
      ),
      h(
        'div',
        { class: 'title-foot' },
        this.soundBtn,
        this.deleteBtn,
        h('span', { class: 'title-hint' }, h('span', { class: 'key-badge', text: 'Enter' }), h('span', { text: '開始' })),
        h('span', { class: 'title-ver', text: 'v1.0' }),
      ),
    );
  }

  refresh(): void {
    const save = this.host.storedSave();
    this.continueBtn.disabled = !save;
    this.deleteBtn.classList.toggle('hidden', !save);
    clear(this.summary);
    if (save) {
      const area = AREAS[frontierArea(save)];
      const heroes = Object.values(save.heroes).filter((x) => x.recruited).length;
      this.summary.append(
        h('span', { text: `プレイ時間 ${fmtClock(save.playTime)}` }),
        h('span', { class: 'dot', text: '・' }),
        h('span', { text: `到達：${area.name}` }),
        h('span', { class: 'dot', text: '・' }),
        h('span', { text: `仲間 ${heroes}人` }),
      );
      if (save.prestige > 0) this.summary.append(h('span', { class: 'dot', text: '・' }), h('span', { class: 'title-cycle', text: `周回 ${save.prestige + 1}` }));
    } else {
      this.summary.append(h('span', { class: 'faint', text: 'セーブデータなし' }));
    }
    this.syncSound();
  }

  show(): void {
    this.busy = false;
    this.refresh();
    this.el.classList.add('show');
    requestAnimationFrame(() => (this.host.storedSave() ? this.continueBtn : this.newBtn).focus({ preventScroll: true }));
  }

  hide(): void {
    this.el.classList.remove('show');
  }

  handleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.repeat) {
      // let a focused button handle Enter natively
      if (document.activeElement instanceof HTMLButtonElement && this.el.contains(document.activeElement)) return;
      e.preventDefault();
      if (this.host.storedSave()) this.onContinue();
      else void this.onNew();
    }
  }

  syncSound(): void {
    const on = this.host.soundOn();
    this.soundBtn.replaceChildren(speakerSvg(on), h('span', { text: on ? 'サウンド ON' : 'サウンド OFF' }));
    this.soundBtn.classList.toggle('is-off', !on);
  }

  private toggleSound(): void {
    this.host.toggleSound();
    this.syncSound();
  }

  private onContinue(): void {
    if (this.busy || !this.host.storedSave()) return;
    this.busy = true;
    this.host.continueGame();
  }

  private async onNew(): Promise<void> {
    if (this.busy) return;
    if (this.host.storedSave()) {
      const ok = await this.host.modals.confirm({
        title: 'はじめから',
        body: '現在のセーブデータは上書きされ、元に戻せません。新しく遠征を始めますか？',
        ok: '上書きして始める',
        danger: true,
      });
      if (!ok) return;
    }
    this.busy = true;
    this.host.newGame();
  }

  private async onDelete(): Promise<void> {
    if (this.busy) return;
    const ok = await this.host.modals.confirm({ title: 'セーブ削除', body: 'セーブデータを削除します。この操作は取り消せません。', ok: '削除する', danger: true });
    if (!ok) return;
    this.host.deleteSave();
    this.refresh();
    this.newBtn.focus({ preventScroll: true });
  }
}
