// Camp screens (between runs): 遠征 / パーティ / スキルツリー / レリック, beside a stage column
// (party summary + the 出発 control shared by every tab).
// Mounted by the app shell: campView.mount(rootEl, ctx) then show(tab?, notices?).
import '../../styles/camp.css';
import type { SfxName } from '../../audio/api.ts';
import type { Notice } from '../../core/state.ts';
import { computeMods } from '../../core/mods.ts';
import type { Mods, SaveData } from '../../core/types.ts';
import type { IconKey } from '../../render/sprites/index.ts';
import type { CampContext, CampTab, ICampView } from '../contracts.ts';
import { h, icon } from './dom.ts';
import { ExpeditionTab } from './expedition.ts';
import type { CampHost, TabView } from './host.ts';
import { PartyTab } from './party.ts';
import { RelicsTab } from './relics.ts';
import { CampSide } from './side.ts';
import { TreeTab } from './tree.ts';

const TAB_ORDER: CampTab[] = ['expedition', 'party', 'tree', 'relics'];

const TAB_META: Record<CampTab, { label: string; icon: IconKey }> = {
  expedition: { label: '遠征', icon: 'lantern' },
  party: { label: 'パーティ', icon: 'sword' },
  tree: { label: 'スキルツリー', icon: 'ember' },
  relics: { label: 'レリック', icon: 'shard' },
};

const DEPART_GUARD_MS = 600;

const HOVER_SELECTOR = '.camp-btn, .camp-tab, .camp-area, .camp-goal-btn, .camp-slot.is-filled, .camp-side-party';

export class CampView implements ICampView {
  private ctx: CampContext | null = null;
  private root: HTMLElement | null = null;
  private el: HTMLElement | null = null;
  private tabBar: HTMLElement | null = null;
  private pagesEl: HTMLElement | null = null;
  private side: CampSide | null = null;
  private fx: HTMLElement | null = null;
  private host: CampHost | null = null;
  private tabBtns = new Map<CampTab, HTMLButtonElement>();
  private pages = new Map<CampTab, TabView>();
  private current: CampTab = 'expedition';
  private visible = false;
  private known = new Set<CampTab>();
  private fresh = new Set<CampTab>();
  private notices: Notice[] = [];
  private modsCache: Mods | null = null;
  private modal: { layer: HTMLElement; close: () => void } | null = null;
  private bubble: { tab: CampTab; els: HTMLElement[] } | null = null;
  private treeBubbleChecked = false;
  private newChecked = new Set<CampTab>();
  private saveRef: SaveData | null = null;
  private hoverEl: Element | null = null;
  private hoverAt = 0;
  private refreshing = false;
  private refreshCount = 0;
  private shownAt = 0;

  // ─────────────────────────── ICampView ───────────────────────────

  mount(root: HTMLElement, ctx: CampContext): void {
    if (this.el) {
      // re-mount: drop the previous DOM and listeners
      this.el.remove();
      window.removeEventListener('keydown', this.onKeyDown);
      this.tabBtns.clear();
      this.pages.clear();
    }
    this.root = root;
    this.ctx = ctx;
    this.host = this.makeHost(ctx);

    this.tabBar = h('nav', { class: 'camp-tabs', attrs: { role: 'tablist', 'aria-label': 'キャンプ' } });
    this.tabBar.appendChild(h('span', { class: 'camp-tabs-key', attrs: { 'aria-hidden': 'true' } }, h('kbd', 'camp-kbd', 'Q')));
    for (const tab of TAB_ORDER) {
      const meta = TAB_META[tab];
      const btn = h(
        'button',
        {
          class: 'camp-tab',
          attrs: { type: 'button', role: 'tab', 'aria-selected': 'false' },
          data: { tab },
          on: { click: () => this.userSwitch(tab) },
        },
        icon(meta.icon, 32, 'camp-tab-icon'),
        h('span', 'camp-tab-label', meta.label),
        h('span', 'camp-tab-badge'),
      );
      this.tabBtns.set(tab, btn);
      this.tabBar.appendChild(btn);
    }
    this.tabBar.appendChild(h('span', { class: 'camp-tabs-key', attrs: { 'aria-hidden': 'true' } }, h('kbd', 'camp-kbd', 'E')));

    const host = this.host;
    this.pages.set('expedition', new ExpeditionTab(host));
    this.pages.set('party', new PartyTab(host));
    this.pages.set('tree', new TreeTab(host));
    this.pages.set('relics', new RelicsTab(host));

    this.pagesEl = h('div', 'camp-pages');
    for (const [tab, page] of this.pages) {
      page.el.hidden = true;
      page.el.setAttribute('role', 'tabpanel');
      page.el.dataset.tab = tab;
      this.pagesEl.appendChild(page.el);
    }
    this.fx = h('div', { class: 'camp-fx', attrs: { 'aria-hidden': 'true' } });
    this.side = new CampSide(host);
    this.el = h('div', 'camp', this.side.el, this.tabBar, this.pagesEl, this.side.cta, this.fx);
    this.el.hidden = true;
    root.appendChild(this.el);

    this.saveRef = null;
    this.syncSaveIdentity();

    window.addEventListener('keydown', this.onKeyDown);
    this.el.addEventListener('click', this.onClickBlur);
    this.el.addEventListener('pointerover', this.onPointerOver);
  }

  /** A replaced save (New Game / reset / import) restarts the camp's onboarding state. */
  private syncSaveIdentity(): void {
    if (!this.ctx) return;
    const s = this.ctx.getSave();
    if (s === this.saveRef) return;
    this.saveRef = s;
    this.known = new Set(this.availableTabs());
    this.fresh.clear();
    this.newChecked.clear();
    this.treeBubbleChecked = false;
    this.clearBubble();
    for (const btn of this.tabBtns.values()) btn.classList.remove('is-fresh', 'is-revealed');
  }

  show(tab?: CampTab, notices?: Notice[]): void {
    if (!this.el || !this.ctx) return;
    this.syncSaveIdentity();
    this.visible = true;
    this.shownAt = performance.now();
    this.el.hidden = false;
    this.notices = notices ? notices.slice() : [];
    if (this.notices.length) this.applyNotices();
    this.modsCache = null;
    this.syncTabs();
    this.side?.update();
    const avail = this.availableTabs();
    const target = tab && avail.includes(tab) ? tab : avail.includes(this.current) ? this.current : 'expedition';
    this.switchTo(target, 0, true);
  }

  hide(): void {
    if (!this.el) return;
    if (this.modal) this.modal.close();
    this.visible = false;
    this.el.hidden = true;
    this.pages.get(this.current)?.onHide();
  }

  refresh(): void {
    if (!this.el || !this.ctx || this.refreshing) return;
    this.syncSaveIdentity();
    this.refreshing = true;
    this.refreshCount++;
    try {
      this.modsCache = null;
      this.syncTabs();
      if (!this.availableTabs().includes(this.current)) this.switchTo('expedition', 0, true);
      else if (this.visible) this.pages.get(this.current)?.update();
      this.side?.update();
      this.syncBadges();
    } finally {
      this.refreshing = false;
    }
  }

  availableTabs(): CampTab[] {
    if (!this.ctx) return ['expedition'];
    const s = this.ctx.getSave();
    const tabs: CampTab[] = ['expedition'];
    if (s.stats.runs >= 1) tabs.push('party');
    if (s.embers > 0 || Object.entries(s.tree).some(([id, r]) => id !== 'core' && r > 0)) tabs.push('tree');
    if (s.prestige >= 1) tabs.push('relics');
    return tabs;
  }

  // ─────────────────────────── host for tab pages ───────────────────────────

  private makeHost(ctx: CampContext): CampHost {
    return {
      ctx,
      save: () => ctx.getSave(),
      mods: () => {
        if (!this.modsCache) this.modsCache = computeMods(ctx.getSave());
        return this.modsCache;
      },
      commit: () => {
        this.modsCache = null;
        const before = this.refreshCount;
        ctx.commit();
        // The shell usually calls refresh() from commit(); only refresh again if it did not.
        if (this.refreshCount === before) this.refresh();
      },
      sfx: (name: SfxName, opts?: { volume?: number; pitch?: number }) => {
        try {
          ctx.audio.play(name, opts);
        } catch {
          /* audio is optional */
        }
      },
      hint: (slot, key, title, text) => this.showHint(slot, key, title, text),
      notices: () => this.notices,
      clearNotices: () => {
        this.notices = [];
      },
      openModal: (panel, onClose) => this.openModal(panel, onClose),
      switchTab: (tab) => {
        if (this.availableTabs().includes(tab)) this.switchTo(tab, 0, false);
      },
      depart: () => this.side?.depart(),
      fxLayer: () => this.fx!,
    };
  }

  private showHint(slot: HTMLElement, key: string, title: string, text: string): boolean {
    if (!this.ctx) return false;
    // one hint at a time: a later hint waits (its first-time flag is not consumed) until this one is closed
    if (slot.querySelector('.camp-hint:not(.is-leaving)')) return false;
    if (!this.ctx.firstTime(key)) return false;
    const box = h('div', { class: 'camp-hint', attrs: { role: 'note' } });
    const close = () => {
      box.classList.add('is-leaving');
      window.setTimeout(() => box.remove(), 260);
    };
    box.append(
      h('div', 'camp-hint-icon', icon('lantern', 32)),
      h('div', 'camp-hint-body', h('div', 'camp-hint-title', title), h('div', 'camp-hint-text', text)),
      h('button', { class: 'camp-btn camp-btn--small', attrs: { type: 'button' }, on: { click: close } }, 'OK'),
    );
    slot.prepend(box);
    return true;
  }

  private openModal(panel: HTMLElement, onClose?: () => void): () => void {
    if (this.modal) this.modal.close();
    const layer = h('div', 'camp-modal-layer');
    const backdrop = h('div', 'camp-modal-backdrop');
    layer.append(backdrop, panel);
    document.body.appendChild(layer);
    const previousFocus = document.activeElement as HTMLElement | null;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      layer.classList.add('is-leaving');
      window.setTimeout(() => layer.remove(), 220);
      if (this.modal && this.modal.layer === layer) this.modal = null;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      onClose?.();
    };
    backdrop.addEventListener('click', close);
    this.modal = { layer, close };
    requestAnimationFrame(() => {
      if (closed) return;
      layer.classList.add('is-open');
      panel.querySelector<HTMLElement>('footer button')?.focus({ preventScroll: true });
    });
    return close;
  }

  // ─────────────────────────── tabs ───────────────────────────

  private applyNotices(): void {
    if (!this.ctx) return;
    const save = this.ctx.getSave();
    let changed = false;
    for (const n of this.notices) {
      if (n.kind === 'areaUnlock' && save.areas[n.area]?.unlocked && save.selectedArea !== n.area) {
        save.selectedArea = n.area;
        changed = true;
      }
    }
    if (changed) this.ctx.commit();
  }

  private syncTabs(): void {
    const avail = new Set(this.availableTabs());
    for (const tab of TAB_ORDER) {
      const btn = this.tabBtns.get(tab)!;
      const on = avail.has(tab);
      if (on && !this.known.has(tab)) {
        // revealed while the camp is alive: pop the tab in
        this.known.add(tab);
        btn.classList.add('is-revealed');
      }
      // "NEW" badge the first time a tab is ever offered (persisted via ctx.firstTime)
      if (on && this.visible && tab !== 'expedition' && !this.newChecked.has(tab)) {
        this.newChecked.add(tab);
        if (this.ctx!.firstTime(`campTabNew_${tab}`) && tab !== this.current) this.fresh.add(tab);
      }
      btn.hidden = !on;
      btn.classList.toggle('is-fresh', this.fresh.has(tab));
    }
    if (this.visible && avail.has('tree') && !this.treeBubbleChecked) {
      this.treeBubbleChecked = true;
      if (this.ctx!.firstTime('campTree')) this.showBubble('tree', 'Emberでスキルツリーを強化！');
    }
  }

  private syncBadges(): void {
    for (const tab of TAB_ORDER) {
      const btn = this.tabBtns.get(tab)!;
      if (btn.hidden) continue;
      let action = false;
      try {
        action = this.pages.get(tab)!.hasAction();
      } catch {
        action = false;
      }
      btn.classList.toggle('has-action', action);
    }
  }

  private showBubble(tab: CampTab, text: string): void {
    this.clearBubble();
    const btn = this.tabBtns.get(tab);
    if (!btn) return;
    // Wide windows show the nudge under the party summary (the tab row is busy with the
    // departure control); narrow windows show it in the tab row. CSS picks one.
    const make = (cls: string) => h('button', {
      class: cls,
      attrs: { type: 'button' },
      on: { click: () => this.userSwitch(tab) },
    }, text, ' →');
    const inTabs = make('camp-tabs-bubble'), inSide = make('camp-side-bubble');
    this.tabBar?.appendChild(inTabs);
    this.side?.el.appendChild(inSide);
    this.bubble = { tab, els: [inTabs, inSide] };
  }

  private clearBubble(): void {
    if (this.bubble) for (const el of this.bubble.els) el.remove();
    this.bubble = null;
  }

  private userSwitch(tab: CampTab): void {
    if (tab === this.current) return;
    const dir = TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(this.current) ? 1 : -1;
    this.host?.sfx('uiClick');
    this.switchTo(tab, dir, false);
  }

  private cycleTab(dir: number): void {
    const avail = this.availableTabs();
    if (avail.length < 2) return;
    const i = avail.indexOf(this.current);
    const next = avail[(i + dir + avail.length) % avail.length];
    this.host?.sfx('uiClick', { pitch: dir > 0 ? 1.08 : 0.94 });
    this.switchTo(next, dir, false);
  }

  private switchTo(tab: CampTab, dir: number, force: boolean): void {
    const next = this.pages.get(tab);
    if (!next) return;
    const prev = this.pages.get(this.current);
    const same = tab === this.current && !next.el.hidden;
    if (same && !force) return;
    if (prev && prev !== next && !prev.el.hidden) {
      prev.onHide();
      prev.el.hidden = true;
    }
    this.current = tab;
    // the shell collapses the camp scene strip on space-hungry tabs (skill tree)
    this.el?.closest('.app')?.setAttribute('data-camp-tab', tab);
    for (const [t, btn] of this.tabBtns) {
      const on = t === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if (this.fresh.delete(tab)) this.tabBtns.get(tab)?.classList.remove('is-fresh');
    if (this.bubble && this.bubble.tab === tab) this.clearBubble();
    next.el.hidden = false;
    next.update();
    if (!same) {
      next.el.classList.remove('is-enter-left', 'is-enter-right', 'is-enter');
      void next.el.offsetWidth;
      next.el.classList.add(dir > 0 ? 'is-enter-right' : dir < 0 ? 'is-enter-left' : 'is-enter');
      if (this.pagesEl) this.pagesEl.scrollTop = 0;
      next.el.scrollTop = 0;
    }
    if (this.visible) next.onShow();
    this.syncBadges();
  }

  // ─────────────────────────── input ───────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.visible || !this.el || !this.el.isConnected || e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.el.offsetParent === null) return; // camp panel hidden by the shell
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (this.modal) {
      if (e.key === 'Escape') {
        this.modal.close();
        e.preventDefault();
      }
      return;
    }
    if (e.repeat && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key;
    if (k === 'q' || k === 'Q' || k === 'ArrowLeft') {
      this.cycleTab(-1);
      e.preventDefault();
      return;
    }
    if (k === 'e' || k === 'E' || k === 'ArrowRight') {
      this.cycleTab(1);
      e.preventDefault();
      return;
    }
    // A focused button (keyboard navigation) keeps its native Space/Enter behaviour.
    if ((k === ' ' || k === 'Enter') && t && t.closest('button, a, [role="button"], summary')) return;
    // a Space still being mashed from the battle (Overdrive) right after arriving does not start a new run
    if (k === ' ' && performance.now() - this.shownAt < DEPART_GUARD_MS) {
      e.preventDefault();
      return;
    }
    const page = this.pages.get(this.current);
    if (page && page.onKey(e)) e.preventDefault();
    else if (k === ' ') {
      // 出発 works from every tab (the control is always on screen)
      this.side?.depart();
      e.preventDefault();
    }
  };

  /** Pointer clicks should not leave focus on camp buttons (keeps Space = 出発 working). */
  private onClickBlur = (e: MouseEvent): void => {
    if (e.detail === 0) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body && this.el?.contains(a) && a.tagName === 'BUTTON') a.blur();
  };

  private onPointerOver = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const target = (e.target as Element | null)?.closest?.(HOVER_SELECTOR) ?? null;
    if (target === this.hoverEl) return;
    this.hoverEl = target;
    if (!target || target.getAttribute('aria-disabled') === 'true') return;
    const now = performance.now();
    if (now - this.hoverAt < 60) return;
    this.hoverAt = now;
    this.host?.sfx('uiHover', { volume: 0.45 });
  };
}

export default CampView;
