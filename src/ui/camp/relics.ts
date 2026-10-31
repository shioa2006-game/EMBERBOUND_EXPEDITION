// レリック / Relics tab: buy relics with Relic Shards and equip them into the limited slots,
// and see (or give up) the vows binding this cycle.
import { activeVows } from '../../core/mods.ts';
import { abandonVow, bossShardsFor, buyRelic, equipRelic, relicSlots, swapRelic, unequipRelic } from '../../core/state.ts';
import { AREA_ORDER, type RelicDef, type VowDef } from '../../core/types.ts';
import { AREAS } from '../../data/areas.ts';
import { RELIC_LIST, RELICS } from '../../data/relics.ts';
import type { IconKey } from '../../render/sprites/index.ts';
import { tapWord } from '../dom.ts';
import { clear, fmt, h, icon } from './dom.ts';
import type { CampHost, TabView } from './host.ts';
import { burst, centerIn, floatText, shake } from './juice.ts';

const BUILD_HUE: Record<string, string> = {
  攻撃速度: '#5fd068',
  クリティカル: '#ffd84a',
  魔法連鎖: '#c070ff',
  バリア反撃: '#5aa0ff',
  燃焼: '#ff8a3d',
  不死鳥: '#ff6a6a',
  スキル連打: '#7fe0e8',
  持久: '#ffb35a',
  財宝: '#ffd84a',
  連射: '#5fd068',
  反射: '#b9c8ff',
  聖杯: '#fff1b8',
};

function relicIcon(r: RelicDef, size: number): HTMLImageElement {
  return icon(r.icon as IconKey, size, 'camp-relic-img');
}

export class RelicsTab implements TabView {
  readonly el: HTMLElement;
  private host: CampHost;
  private hints: HTMLElement;
  private shardVal: HTMLElement;
  private slotsEl: HTMLElement;
  private slotsLabel: HTMLElement;
  private slotNote: HTMLElement;
  private info: HTMLElement;
  private vowBox: HTMLElement;
  private grid: HTMLElement;

  constructor(host: CampHost) {
    this.host = host;
    this.hints = h('div', 'camp-hints');
    this.shardVal = h('span', 'camp-purse-val camp-num camp-shard', '0');
    this.slotsLabel = h('span', 'camp-num', '');
    this.slotsEl = h('div', 'camp-slots');
    this.slotNote = h('span', 'camp-slot-note');
    this.info = h('div', 'camp-relic-info');
    this.vowBox = h('div', 'camp-vow-box');
    this.grid = h('div', 'camp-relic-grid');
    this.el = h(
      'div',
      'camp-page camp-page--relics',
      this.hints,
      h(
        'div',
        'camp-relic-head',
        h('div', 'camp-purse camp-purse--shard', icon('shard', 32), h('div', null, h('div', 'camp-label', 'Relic Shard'), this.shardVal)),
        h('div', 'camp-slot-box', h('div', 'camp-slot-title', h('span', 'camp-label', '装備枠 ', this.slotsLabel), this.slotNote), this.slotsEl),
      ),
      this.info,
      this.vowBox,
      this.grid,
    );
  }

  // ─────────────────────────── TabView ───────────────────────────

  update(): void {
    const save = this.host.save();
    const slots = relicSlots(save, this.host.mods());
    this.shardVal.textContent = fmt(save.shards);
    this.slotsLabel.textContent = `${Math.min(save.relicsEquipped.length, slots)} / ${slots}`;

    // slots
    clear(this.slotsEl);
    for (let i = 0; i < slots; i++) {
      const id = save.relicsEquipped[i];
      const r = id ? RELICS[id] : undefined;
      if (r) {
        this.slotsEl.appendChild(
          h(
            'button',
            {
              class: 'camp-slot is-filled',
              attrs: { type: 'button' },
              data: { relic: r.id, tip: `${r.name}|${r.desc}\n${tapWord()}で外す` },
              on: { click: () => this.unequip(r.id) },
            },
            relicIcon(r, 48),
            h('span', 'camp-slot-name', r.name),
          ),
        );
      } else {
        this.slotsEl.appendChild(h('div', 'camp-slot is-empty', h('span', 'camp-slot-name', '空き')));
      }
    }

    // how to earn shards
    clear(this.info);
    const remain = AREA_ORDER.filter((a) => save.areas[a].unlocked || a !== 'heart')
      .map((a) => ({ a, n: bossShardsFor(save, a, this.host.mods()) }))
      .filter((x) => x.n > 0);
    this.info.append(
      h('div', 'camp-relic-info-title', icon('shard', 20), 'Relic Shardの入手'),
      h(
        'ul',
        null,
        h('li', null, h('b', null, 'Rekindle（転生）'), 'するたびにまとめて獲得'),
        h('li', null, '各サイクルで、各エリアのボスを', h('b', null, '初めて'), '倒したとき'),
        h('li', null, h('b', null, '誓約'), 'を守り通してRekindleしたとき'),
      ),
      remain.length
        ? h(
            'div',
            'camp-relic-remain',
            h('span', 'camp-label', 'このサイクルの残り'),
            remain.map((x) => h('span', 'camp-chip camp-chip--shard', `${AREAS[x.a].name} +${x.n}`)),
          )
        : h('div', 'camp-relic-remain camp-dim', 'このサイクルのボスShardはすべて獲得済み'),
    );

    // vows of this cycle
    clear(this.vowBox);
    const vows = activeVows(save);
    this.vowBox.classList.toggle('is-empty', vows.length === 0);
    this.vowBox.appendChild(h('div', 'camp-vow-title', icon('crown', 20), 'このサイクルの誓約'));
    if (!vows.length) this.vowBox.appendChild(h('span', 'camp-dim', 'なし（次のRekindleで立てられる）'));
    for (const v of vows) {
      this.vowBox.appendChild(
        h(
          'div',
          { class: 'camp-vow', data: { vow: v.id, tip: `${v.name}|${v.desc}\n${v.hint}` } },
          icon(v.icon as IconKey, 20),
          h('b', 'camp-vow-name', v.name),
          h('span', 'camp-vow-desc', v.desc),
          h('span', 'camp-chip camp-chip--shard', `Rekindleで +${v.shards}`),
          h('button', { class: 'camp-btn camp-btn--ghost camp-vow-drop', attrs: { type: 'button' }, on: { click: () => this.abandon(v) } }, '破棄'),
        ),
      );
    }

    // cards
    clear(this.grid);
    const full = save.relicsEquipped.length >= slots;
    this.slotNote.textContent = full ? '満杯：カードの「入れ替える」で交換できる' : '購入したレリックは空き枠に自動で装備される';
    for (const r of RELIC_LIST) {
      const isOwned = save.relicsOwned.includes(r.id);
      const isEq = save.relicsEquipped.includes(r.id);
      const poor = !isOwned && save.shards < r.cost;
      let action: HTMLButtonElement;
      if (!isOwned) {
        action = h(
          'button',
          { class: `camp-btn camp-relic-action${poor ? ' is-poor' : ' camp-btn--primary'}`, attrs: { type: 'button', 'aria-disabled': poor ? 'true' : 'false' }, on: { click: (e) => this.buy(r, e.currentTarget as HTMLElement) } },
          '購入',
          h('span', 'camp-relic-cost camp-num', icon('shard', 16), fmt(r.cost)),
        );
      } else if (isEq) {
        action = h('button', { class: 'camp-btn camp-relic-action camp-btn--ghost', attrs: { type: 'button' }, on: { click: () => this.unequip(r.id) } }, '外す');
      } else {
        action = h(
          'button',
          { class: 'camp-btn camp-relic-action camp-btn--primary', attrs: { type: 'button' }, on: { click: (e) => full ? this.swap(r) : this.equip(r, e.currentTarget as HTMLElement) } },
          full ? '入れ替える' : '装備する',
        );
      }
      const cls = ['camp-relic'];
      if (isOwned) cls.push('is-owned');
      if (isEq) cls.push('is-equipped');
      if (poor) cls.push('is-poor');
      this.grid.appendChild(
        h(
          'article',
          { class: cls.join(' '), style: `--bc:${BUILD_HUE[r.build] ?? '#ffb35a'}`, data: { relic: r.id } },
          h('div', 'camp-relic-icon', relicIcon(r, 48), isEq ? h('span', 'camp-relic-eq', 'E') : null),
          h(
            'div',
            'camp-relic-body',
            h('div', 'camp-relic-name', r.name),
            h('span', 'camp-chip camp-chip--build', r.build),
            h('p', 'camp-relic-desc', r.desc),
          ),
          h('div', 'camp-relic-foot', isOwned ? h('span', 'camp-relic-state', isEq ? '装備中' : '所持') : h('span', 'camp-dim', '未所持'), action),
        ),
      );
    }
  }

  onShow(): void {
    this.host.hint(
      this.hints,
      'campRelics',
      'レリックで戦い方を変える',
      'Relic Shardでレリックを購入し、装備枠にセットしよう。組み合わせ次第でビルドが大きく変わる。装備はいつでも付け替え自由。',
    );
  }

  onHide(): void {}

  onKey(_e: KeyboardEvent): boolean {
    return false;
  }

  hasAction(): boolean {
    const save = this.host.save();
    if (save.prestige < 1) return false;
    const slots = relicSlots(save, this.host.mods());
    if (RELIC_LIST.some((r) => !save.relicsOwned.includes(r.id) && save.shards >= r.cost)) return true;
    return save.relicsEquipped.length < slots && save.relicsOwned.some((id) => !save.relicsEquipped.includes(id));
  }

  // ─────────────────────────── actions ───────────────────────────

  private cardEl(id: string): HTMLElement | null {
    return this.grid.querySelector(`[data-relic="${id}"]`);
  }

  private buy(r: RelicDef, btn: HTMLElement): void {
    const save = this.host.save();
    if (save.shards < r.cost || save.relicsOwned.includes(r.id)) {
      this.host.sfx('uiError');
      shake(btn);
      if (save.shards < r.cost) this.host.ctx.toast(`Relic Shardが足りない（あと ${fmt(r.cost - save.shards)}）`, 'warn');
      return;
    }
    if (!buyRelic(save, r.id)) {
      this.host.sfx('uiError');
      return;
    }
    const autoEquip = save.relicsEquipped.length < relicSlots(save, this.host.mods()) && equipRelic(save, r.id);
    this.host.commit();
    this.host.sfx('relic');
    this.celebrate(r.id, autoEquip ? '入手＆装備！' : '入手！');
    this.host.ctx.toast(autoEquip ? `${r.name}を入手して装備した！` : `${r.name}を入手！`, 'good');
  }

  private equip(r: RelicDef, btn: HTMLElement): void {
    const save = this.host.save();
    if (!equipRelic(save, r.id)) {
      this.host.sfx('uiError');
      shake(btn);
      this.host.ctx.toast('装備枠がいっぱい。先にどれかを外そう', 'warn');
      return;
    }
    this.host.commit();
    this.host.sfx('uiClick', { pitch: 1.2 });
    this.celebrate(r.id, '装備');
  }

  private unequip(id: string): void {
    const save = this.host.save();
    if (!unequipRelic(save, id)) return;
    this.host.commit();
    this.host.sfx('uiClick', { pitch: 0.85 });
  }

  /** Give up a vow (after a confirmation): the rule lifts at once, its Shards are lost. */
  private abandon(v: VowDef): void {
    const cancel = h('button', { class: 'camp-btn camp-btn--ghost', attrs: { type: 'button' } }, 'やめる');
    const ok = h('button', { class: 'camp-btn camp-btn--danger', attrs: { type: 'button' } }, '破棄する');
    const panel = h('div', { class: 'camp-modal camp-vow-confirm', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': '誓約を破棄する' } },
      h('div', { class: 'dialog-scroll', attrs: { tabindex: '0' } },
        h('h2', null, `${v.name}を破棄する？`),
        h('p', null, `「${v.desc}」の縛りはすぐに解ける。このサイクルを守り通した報酬（Relic Shard +${v.shards}）はもらえなくなる。`)),
      h('footer', 'dialog-footer', cancel, ok));
    const close = this.host.openModal(panel);
    cancel.addEventListener('click', close);
    ok.addEventListener('click', () => {
      close();
      if (!abandonVow(this.host.save(), v.id)) return;
      this.host.commit();
      this.host.sfx('uiClick', { pitch: 0.7 });
      this.host.ctx.toast(`${v.name}を破棄した`, 'info');
    });
  }

  private swap(incoming: RelicDef): void {
    const choices = h('div', 'camp-swap-choices');
    const cancel = h('button', { class: 'camp-btn camp-btn--ghost', attrs: { type: 'button' } }, 'やめる');
    const panel = h('div', { class: 'camp-modal camp-swap', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'レリックを入れ替える' } },
      h('div', { class: 'dialog-scroll', attrs: { tabindex: '0', 'aria-label': '交換するレリック' } },
        h('h2', null, 'レリックを入れ替える'),
        h('p', 'camp-swap-intro', `${incoming.name}を装備します。外すレリックを選んでください。Shardは消費しません。`),
        choices),
      h('footer', 'dialog-footer', cancel));
    const close = this.host.openModal(panel);
    cancel.addEventListener('click', close);
    for (const outgoing of this.host.save().relicsEquipped) {
      const r = RELICS[outgoing];
      if (!r) continue;
      const choose = h('button', { class: 'camp-btn camp-swap-choice', attrs: { type: 'button' }, data: { outgoing } },
        relicIcon(r, 32), h('span', null, h('b', null, r.name), h('span', null, r.desc)), h('span', 'camp-swap-label', 'これと交換'));
      choose.addEventListener('click', () => {
        if (!swapRelic(this.host.save(), outgoing, incoming.id)) {
          this.host.ctx.toast('装備が変わりました。もう一度選んでください', 'warn');
          close();
          return;
        }
        close();
        this.host.commit();
        this.host.sfx('relic');
        this.celebrate(incoming.id, '装備');
        this.host.ctx.toast(`${r.name} → ${incoming.name} に入れ替えた`, 'good');
        this.cardEl(incoming.id)?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
      });
      choices.appendChild(choose);
    }
  }

  private celebrate(id: string, text: string): void {
    const card = this.cardEl(id);
    if (!card) return;
    const layer = this.host.fxLayer();
    const iconEl = card.querySelector('.camp-relic-icon') ?? card;
    const p = centerIn(layer, iconEl);
    burst(layer, p.x, p.y, '#6fe3ff', 16, 64);
    floatText(layer, text, p.x, p.y - 24, 'camp-float--shard');
    card.classList.add('is-flash');
    const slot = this.slotsEl.querySelector(`[data-relic="${id}"]`);
    if (slot) slot.classList.add('is-flash');
  }
}
