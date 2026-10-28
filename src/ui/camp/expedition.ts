// 遠征 / Expedition tab: the descending route of the six areas, details of the selected area
// and (after the Hollow Sovereign falls) the Rekindle panel. The 出発 control lives in the camp shell.
import { BAL, formatTime } from '../../core/balance.ts';
import { bossPity, bossShardsFor, canDescendFrom, canRekindle, rekindleShards } from '../../core/state.ts';
import type { Notice } from '../../core/state.ts';
import { AREA_ORDER, type AreaId } from '../../core/types.ts';
import { AREAS } from '../../data/areas.ts';
import { HEROES } from '../../data/heroes.ts';
import { append, clear, fmt, h, icon, keycap } from './dom.ts';
import { departureArea, noticeAreas, type CampHost, type TabView } from './host.ts';
import { shake } from './juice.ts';
import { openRekindle } from './rekindle.ts';

type AreaState = 'open' | 'locked' | 'sealed';

/** Ten stage marks (elite at 5, boss at 10) for a route entry or the departure bar. */
export function areaPips(best: number, bestEver: number): HTMLElement {
  const pips = h('span', 'camp-area-pips');
  for (let s = 1; s <= 10; s++) {
    const kind = s === 10 ? 'boss' : s === 5 ? 'elite' : 'n';
    const on = s <= best ? ' is-on' : s <= bestEver ? ' is-ghost' : '';
    pips.appendChild(h('i', `camp-mpip camp-mpip--${kind}${on}`));
  }
  return pips;
}

export function areaStars(n: number, size: number): HTMLElement {
  const wrap = h('span', {
    class: 'camp-stars',
    attrs: { 'aria-label': `ランタンの星 ${n}/3` },
    data: { tip: `ランタンの星 ${n}/3|ボス撃破時のランタン残量で獲得\n★1 撃破／★2 残量50%以上／★3 残量75%以上\n新しい星ごとに +${BAL.starEmbers} Ember` },
  });
  for (let i = 0; i < 3; i++) wrap.appendChild(icon('star', size, i < n ? 'is-on' : 'is-off'));
  return wrap;
}

export class ExpeditionTab implements TabView {
  readonly el: HTMLElement;
  private host: CampHost;
  private rekindleSlot: HTMLElement;
  private route: HTMLElement;
  private detail: HTMLElement;
  private shownArea: AreaId | null = null;
  private noticeRef: readonly Notice[] | null = null;
  private noticeAt = 0;
  /** Notice highlights (flashes) only animate right after returning from a run. */
  private animNotices = false;

  constructor(host: CampHost) {
    this.host = host;
    this.rekindleSlot = h('div', 'camp-rekindle-slot');
    this.route = h('nav', { class: 'camp-route', attrs: { 'aria-label': '遠征ルート' } });
    this.detail = h('section', { class: 'camp-exp-detail', attrs: { 'aria-label': '遠征先の詳細' } });
    this.el = h('div', 'camp-page camp-page--expedition', this.rekindleSlot, h('div', 'camp-exp', this.route, this.detail));
  }

  // ─────────────────────────── TabView ───────────────────────────

  update(): void {
    const notices = this.host.notices();
    if (notices !== this.noticeRef) {
      this.noticeRef = notices;
      this.noticeAt = performance.now();
    }
    this.animNotices = notices.length > 0 && performance.now() - this.noticeAt < 1500;
    this.renderRekindle();
    this.renderRoute();
    const sel = this.selected();
    this.renderDetail(sel, sel !== this.shownArea);
    this.shownArea = sel;
  }

  // The Rekindle banner itself explains the trade (its details open the full breakdown).
  onShow(): void {}

  onHide(): void {}

  onKey(e: KeyboardEvent): boolean {
    const k = e.key;
    if (k === ' ' || k === 'Enter') {
      this.host.depart();
      return true;
    }
    if (k === 'ArrowUp' || k === 'w' || k === 'W') {
      this.step(-1);
      return true;
    }
    if (k === 'ArrowDown' || k === 's' || k === 'S') {
      this.step(1);
      return true;
    }
    return false;
  }

  hasAction(): boolean {
    return canRekindle(this.host.save());
  }

  // ─────────────────────────── Actions ───────────────────────────

  private selected(): AreaId {
    return departureArea(this.host.save());
  }

  private areaState(id: AreaId): AreaState {
    const save = this.host.save();
    if (save.areas[id].unlocked) return 'open';
    return (AREAS[id].requiresPrestige ?? 0) > save.prestige ? 'sealed' : 'locked';
  }

  private select(id: AreaId, fromKey = false): void {
    const save = this.host.save();
    if (!save.areas[id].unlocked) {
      this.host.sfx('uiError');
      const card = this.route.querySelector(`[data-area="${id}"]`);
      if (card) shake(card);
      return;
    }
    if (save.selectedArea === id && this.shownArea === id) return;
    save.selectedArea = id;
    this.host.sfx('uiClick', { pitch: fromKey ? 1.1 : 1 });
    this.host.commit();
  }

  private step(dir: number): void {
    const save = this.host.save();
    const open = AREA_ORDER.filter((a) => save.areas[a].unlocked);
    const i = open.indexOf(this.selected());
    const next = open[Math.max(0, Math.min(open.length - 1, i + dir))];
    if (next && next !== this.selected()) this.select(next, true);
  }

  // ─────────────────────────── Rendering ───────────────────────────

  private renderRekindle(): void {
    const save = this.host.save();
    clear(this.rekindleSlot);
    if (!canRekindle(save)) return;
    const shards = rekindleShards(save);
    const banner = h(
      'div',
      'camp-rekindle-banner',
      h('div', 'camp-rekindle-flame', h('span', 'camp-rekindle-flame-core')),
      h(
        'div',
        'camp-rekindle-text',
        h('div', 'camp-rekindle-title', 'REKINDLE', h('span', 'camp-rekindle-title-ja', '残り火を、もう一度')),
        h(
          'div',
          'camp-rekindle-sub',
          save.prestige === 0
            ? 'Gold・レベル・エリア進行と引き換えに、より強く深く。スキルツリーとEmberは引き継がれる。'
            : '再び深淵を越えた。さらなる周回へ炎を灯し直そう。',
        ),
        h('div', 'camp-rekindle-gain', icon('shard', 20), `Relic Shard +${fmt(shards)}`, h('span', 'camp-dim', ' ほか多数の解放')),
      ),
      h(
        'button',
        {
          class: 'camp-btn camp-btn--rekindle',
          attrs: { type: 'button' },
          on: { click: () => openRekindle(this.host) },
        },
        'Rekindleの詳細',
      ),
    );
    if (this.animNotices && this.host.notices().some((n) => n.kind === 'rekindleReady')) banner.classList.add('is-new');
    this.rekindleSlot.appendChild(banner);
  }

  private renderRoute(): void {
    const save = this.host.save();
    const sel = this.selected();
    const fresh = noticeAreas(this.host.notices(), ['areaUnlock']);
    const flashed = noticeAreas(this.host.notices(), ['star', 'bossRecord', 'newRecord', 'firstClear']);
    clear(this.route);
    this.route.appendChild(
      h(
        'div',
        'camp-route-head',
        h('span', 'camp-route-title', '遠征ルート'),
        save.prestige > 0 ? h('span', 'camp-chip camp-chip--shard', `CYCLE ${save.prestige + 1}`) : null,
        h('span', 'camp-route-keys', keycap('↑'), keycap('↓')),
      ),
    );
    const list = h('ol', 'camp-route-list');
    AREA_ORDER.forEach((id, i) => {
      const def = AREAS[id];
      const a = save.areas[id];
      const st = this.areaState(id);
      const isSel = id === sel;
      const cls = ['camp-area', `is-${st}`];
      if (isSel) cls.push('is-selected');
      if (a.cleared) cls.push('is-cleared');
      if (this.animNotices && fresh.has(id)) cls.push('is-new');
      if (this.animNotices && flashed.has(id)) cls.push('is-flash');
      const btn = h('button', {
        class: cls.join(' '),
        style: `--accent:${def.palette.accent};--sky:${def.palette.sky};--mid:${def.palette.mid}`,
        attrs: { type: 'button', 'aria-pressed': isSel ? 'true' : 'false', 'aria-disabled': st !== 'open' ? 'true' : null },
        data: { area: id },
        on: { click: () => this.select(id) },
      });
      const depth = h('span', 'camp-area-depth', st === 'open' ? String(i + 1) : icon('lock', 16));
      let body: HTMLElement;
      if (st === 'open') {
        body = h(
          'span',
          'camp-area-body',
          h('span', 'camp-area-title', h('span', 'camp-area-name', def.name), h('span', 'camp-area-sub', def.subtitle)),
          h('span', 'camp-area-meta', areaPips(a.best, a.bestEver), areaStars(a.stars, 14)),
        );
      } else if (st === 'sealed') {
        body = h(
          'span',
          'camp-area-body',
          h('span', 'camp-area-name', '？？？'),
          h('span', 'camp-area-sub', '封印された炎 ― Rekindleで解放'),
        );
      } else {
        const hint = id === 'heart' ? 'The Hollowを再び踏破すると解放' : '前のエリアのボスを倒すと解放';
        body = h('span', 'camp-area-body', h('span', 'camp-area-name', '???'), h('span', 'camp-area-sub', hint));
      }
      const tags = h('span', 'camp-area-tags');
      if (fresh.has(id) && st === 'open') tags.appendChild(h('span', 'camp-chip camp-chip--new', 'NEW'));
      else if (a.cleared) tags.appendChild(h('span', 'camp-chip camp-chip--clear', '踏破'));
      else if (st === 'open' && a.bossFails > 0) {
        tags.appendChild(
          h('span', { class: 'camp-chip camp-chip--warn', data: { tip: 'ボス未撃破|挑戦に失敗するたび、ボスのHPが5%減る（最大20%）' } }, 'BOSS'),
        );
      }
      btn.append(depth, body, tags);
      list.appendChild(h('li', `camp-route-item${a.unlocked ? ' is-lit' : ''}`, btn));
    });
    this.route.appendChild(list);
  }

  private renderDetail(id: AreaId, animate: boolean): void {
    const save = this.host.save();
    const mods = this.host.mods();
    const def = AREAS[id];
    const a = save.areas[id];
    const flashed = noticeAreas(this.host.notices(), ['star', 'bossRecord', 'newRecord', 'firstClear']);
    clear(this.detail);
    this.detail.setAttribute(
      'style',
      `--accent:${def.palette.accent};--sky:${def.palette.sky};--far:${def.palette.far};--mid:${def.palette.mid};--ground:${def.palette.ground}`,
    );
    if (animate) {
      this.detail.classList.remove('is-enter');
      void this.detail.offsetWidth;
      this.detail.classList.add('is-enter');
    }

    // The scene in the stage column carries the mood; the heading only names the area.
    const head = h(
      'header',
      'camp-exp-head',
      h('span', 'camp-exp-no', `AREA ${def.index + 1}`),
      h('h2', 'camp-exp-name', def.name),
      h('span', 'camp-exp-sub', def.subtitle),
      a.cleared ? h('span', 'camp-chip camp-chip--clear', '踏破済み') : null,
    );

    // Stage track (best / 10).
    const track = h('div', 'camp-track');
    for (let s = 1; s <= 10; s++) {
      const kind = s === 10 ? 'boss' : s === 5 ? 'elite' : 'n';
      const st = s <= a.best ? ' is-on' : s <= a.bestEver ? ' is-ghost' : '';
      const tip = `ステージ${s}|${kind === 'boss' ? 'ボス戦（ランタンのフレアで時間が回復）' : kind === 'elite' ? 'エリート（Emberを落とす）' : '通常ウェーブ'}${s <= a.best ? '\n到達済み' : ''}`;
      const pip = h('span', { class: `camp-pip camp-pip--${kind}${st}`, data: { tip } });
      if (kind === 'boss') pip.appendChild(icon('skull', 16));
      track.appendChild(pip);
    }
    const trackBox = h(
      'div',
      `camp-exp-track${this.animNotices && flashed.has(id) ? ' is-flash' : ''}`,
      h(
        'div',
        'camp-exp-track-head',
        h('span', 'camp-label', '最高到達'),
        h('span', 'camp-exp-best', h('b', null, String(a.best)), ' / 10'),
        a.bestEver > a.best ? h('span', 'camp-dim', `（過去最高 ${a.bestEver}）`) : null,
      ),
      track,
    );

    const lantern = BAL.lanternBase + mods.lanternBonus;
    const tiles = h(
      'div',
      'camp-exp-tiles',
      this.tile('ランタンの星', areaStars(a.stars, 22), '残量50%・75%以上でボスを倒すと星'),
      this.tile('挑戦回数', h('b', 'camp-num', fmt(a.attempts)), save.prestige > 0 ? 'このサイクル' : '出発した回数'),
      this.tile('ランタン', h('b', 'camp-num', `${fmt(lantern)}s`), `ボス戦でフレア ${def.flare}s`),
    );

    const bossRec = a.bossBestTime > 0
      ? h(
          'div',
          'camp-boss-rec',
          h('span', null, icon('clock', 16), '最速 ', h('b', 'camp-num', formatTime(a.bossBestTime))),
          a.bossFirstTime > 0 ? h('span', 'camp-dim', `初討伐 ${formatTime(a.bossFirstTime)}`) : null,
        )
      : h('div', 'camp-boss-rec camp-dim', '未討伐');
    const pity = bossPity(save, id);
    const boss = h(
      'div',
      'camp-boss',
      h('div', 'camp-boss-icon', icon('skull', 32)),
      h(
        'div',
        'camp-boss-body',
        h('div', 'camp-label', 'BOSS'),
        h('div', 'camp-boss-name', def.bossName),
        bossRec,
        pity > 0 ? h('div', 'camp-boss-pity', `ランタンの記憶：ボスのHP・攻撃力 -${Math.round(pity * 100)}%`) : null,
      ),
    );

    const perks = h('ul', 'camp-perks');
    if (def.recruit && !save.heroes[def.recruit].recruited) {
      perks.appendChild(h('li', 'camp-perk camp-perk--hero', icon(`hero_${def.recruit}`, 24), h('span', null, 'ボス撃破で ', h('b', null, HEROES[def.recruit].name), ' が仲間に！')));
    }
    if (!a.cleared) {
      perks.appendChild(h('li', 'camp-perk', icon('ember', 20), h('span', null, '初踏破ボーナス ', h('b', 'camp-ember', `+${def.firstClearEmbers} Ember`))));
    }
    const shardGain = bossShardsFor(save, id, mods);
    if (shardGain > 0) {
      perks.appendChild(h('li', 'camp-perk', icon('shard', 20), h('span', null, 'ボス初撃破で ', h('b', 'camp-shard', `+${shardGain} Relic Shard`))));
    }
    if (a.stars < 3) {
      perks.appendChild(h('li', 'camp-perk', icon('star', 20), h('span', null, '新しい星ごとに ', h('b', 'camp-ember', `+${BAL.starEmbers} Ember`))));
    }
    if (canDescendFrom(save, id)) {
      perks.appendChild(
        h('li', 'camp-perk', icon('lantern', 20), h('span', null, h('b', null, 'Descent'), `：ランタン${BAL.descentMinLantern}秒以上残してボスを倒すと次のエリアへ`)),
      );
    }

    append(this.detail, [
      head,
      h('p', 'camp-exp-intro', def.intro),
      trackBox,
      tiles,
      h('div', 'camp-exp-goal', boss, perks.childElementCount ? perks : null),
    ]);
  }

  private tile(label: string, value: Node, note: string): HTMLElement {
    return h('div', 'camp-tile', h('div', 'camp-label', label), h('div', 'camp-tile-val', value), h('div', 'camp-tile-note', note));
  }
}
