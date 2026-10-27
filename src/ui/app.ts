// App shell: screen state machine (title / battle / camp), main loop, input routing, saving, music.
import { AREAS } from '../data/areas.ts';
import { Battle } from '../core/battle.ts';
import { deleteSave, hasSave, loadSave, writeSave } from '../core/save.ts';
import { applyRunResult, frontierArea, newSave, rekindle, type Notice } from '../core/state.ts';
import { AREA_ORDER, HERO_ORDER, type AreaId, type BattleEvent, type HeroId, type SaveData } from '../core/types.ts';
import type { MusicTrack } from '../audio/api.ts';
import { AudioEngine } from '../audio/audio.ts';
import { Renderer } from '../render/renderer.ts';
import { CampView } from './camp/index.ts';
import type { CampContext, CampTab, ICampView } from './contracts.ts';
import { installDebug, type DebugReadout } from './debug.ts';
import { flash, h, installTooltips, setVar } from './dom.ts';
import { TopBar } from './header.ts';
import { BattleHud } from './hud.ts';
import { Modals, type ModalHandle } from './modal.ts';
import { areaCard, endingCard, epilogueCard, NoticePlayer, recruitCard, rekindleCard, trueEndingCard, type NoticeCard } from './notices.ts';
import { openPause } from './pause.ts';
import { showResult } from './result.ts';
import { openSettings } from './settings.ts';
import { TitleScreen } from './title.ts';
import { Toasts, type ToastKind } from './toast.ts';
import { Tutorial } from './tutorial.ts';
import { campSceneHeight } from './layout.ts';

export type Screen = 'title' | 'battle' | 'camp';

const STEP = 1 / 60;
const MAX_STEPS = 8;
const MAX_REAL_DT = 0.1;
const END_BEAT = 0.8;
const CAMP_AUTOSAVE = 15;
const FINAL_AREAS = new Set<AreaId>(['hollow', 'heart']);

const DIGIT_CODES: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

export class App {
  save: SaveData;
  battle: Battle | null = null;
  readonly renderer = new Renderer();
  readonly audio = new AudioEngine();
  readonly modals: Modals;
  readonly toasts: Toasts;
  readonly notices: NoticePlayer;
  readonly hud: BattleHud;
  readonly topbar: TopBar;
  readonly title: TitleScreen;
  readonly tutorial: Tutorial;

  private root: HTMLElement;
  private viewport: HTMLElement;
  private viewportWrap: HTMLElement;
  private campRoot: HTMLElement;
  private fxLayer: HTMLElement;
  private camp: ICampView | null = null;
  private screen: Screen = 'title';

  private runFinalized = false;
  private exitFinalized = false;
  private endTimer = 0;
  private acc = 0;
  private lastNow = 0;
  private hidden = false;
  private pauseModal: ModalHandle | null = null;
  private music: MusicTrack = null;
  private audioUnlocked = false;
  private campSaveTimer = 0;
  private soundMemory: { sfx: boolean; music: boolean } | null = null;
  private errorAt = 0;
  private errorCount = 0;
  private hintAt = 0;

  private debugSpeed = 1;
  private debug: DebugReadout | null = null;
  private lastSteps = 0;
  private lastSimScale = 1;

  constructor(root: HTMLElement) {
    this.root = root;
    this.save = newSave();

    // ── DOM skeleton
    root.replaceChildren();
    root.classList.add('app');
    root.dataset.screen = 'title';
    this.viewport = h('div', { class: 'viewport', attrs: { 'aria-label': 'バトル画面' } });
    const viewportWrap = h('div', { class: 'viewport-wrap' }, this.viewport);
    this.viewportWrap = viewportWrap;
    this.campRoot = h('section', { class: 'camp-root', attrs: { 'aria-label': '野営地' } });
    const modalLayer = h('div', { class: 'layer layer-modal' });
    const noticeLayer = h('div', { class: 'layer layer-notice' });
    const tutorialLayer = h('div', { class: 'layer layer-tutorial' });
    const toastLayer = h('div', { class: 'layer layer-toast' });
    this.fxLayer = h('div', { class: 'layer layer-fx' });

    this.modals = new Modals(modalLayer);
    this.toasts = new Toasts(toastLayer);
    this.notices = new NoticePlayer(noticeLayer, {
      audio: this.audio,
      setMusic: (t) => this.setMusic(t),
    });
    this.topbar = new TopBar({
      getSave: () => this.save,
      runArea: () => (this.screen === 'battle' && this.battle ? this.battle.area : null),
      liveLoot: () => (this.battle && !this.runFinalized ? this.battle.loot : null),
      livePlayTime: () => (this.battle && !this.runFinalized ? this.battle.time : 0),
      soundOn: () => this.soundOn(),
      toggleSound: () => this.toggleSound(),
      openSettings: () => this.openSettings(),
      openPause: () => this.openPauseMenu(),
    });
    this.hud = new BattleHud({
      getSave: () => this.save,
      castSkill: (hero) => this.castSkill(hero),
      toggleAuto: (hero) => this.toggleAuto(hero),
      activateOverdrive: () => this.tryOverdrive(),
      retreat: () => this.retreat(),
    });
    this.title = new TitleScreen({
      modals: this.modals,
      audio: this.audio,
      storedSave: () => (hasSave() ? this.save : null),
      continueGame: () => this.continueGame(),
      newGame: () => this.newGame(),
      deleteSave: () => this.deleteStoredSave(),
      soundOn: () => this.soundOn(),
      toggleSound: () => this.toggleSound(),
    });
    this.tutorial = new Tutorial(
      {
        getSave: () => this.save,
        persist: () => writeSave(this.save),
        renderer: this.renderer,
        hud: this.hud,
        notices: this.notices,
        audio: this.audio,
        viewport: this.viewport,
        blocked: () => this.modals.isOpen() || this.notices.active,
      },
      tutorialLayer,
    );

    root.append(this.topbar.el, viewportWrap, this.hud.el, this.campRoot, this.title.el, tutorialLayer, this.fxLayer, modalLayer, noticeLayer, toastLayer);
    installTooltips(root);

    // keep shell-chrome buttons from stealing keyboard focus on mouse click (Space/Enter must stay game keys)
    const noMouseFocus = (e: Event): void => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    };
    this.hud.el.addEventListener('mousedown', noMouseFocus);
    this.topbar.el.addEventListener('mousedown', noMouseFocus);
  }

  // ─────────────────────────── boot ───────────────────────────

  start(): void {
    const params = new URLSearchParams(location.search);
    const speed = Number(params.get('speed'));
    if (isFinite(speed) && speed > 0) this.debugSpeed = speed;

    const stored = loadSave();
    if (stored) this.save = stored;

    this.renderer.mount(this.viewport);
    this.renderer.setLootTargets(this.topbar.lootTargets());
    this.applySettings(false);
    this.updateCampStrip();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.renderer.resize()).observe(this.viewport);
    window.addEventListener('resize', () => {
      this.updateCampStrip();
      this.renderer.resize();
    });

    this.bindInput();
    this.bindLifecycle();
    if (params.has('debug')) this.installDebug();

    this.showTitle();
    this.lastNow = performance.now();
    requestAnimationFrame(this.frame);
  }

  private installDebug(): void {
    this.debug = installDebug(
      {
        getSave: () => this.save,
        getBattle: () => this.battle,
        speed: () => this.debugSpeed,
        setSpeed: (x) => (this.debugSpeed = x),
        commit: () => {
          this.commit();
          this.camp?.refresh();
        },
        rekindleNow: () => {
          const shards = rekindle(this.save);
          this.onRekindled(shards);
        },
        showNotices: (notices) => void this.notices.play(this.noticeCards(notices)),
        advance: (seconds, fps) => {
          const frames = Math.max(1, Math.round(seconds * fps));
          const wasHidden = this.hidden;
          this.hidden = false; // QA override: the browser pane may report the page as hidden
          for (let i = 0; i < frames; i++) this.step(this.lastNow + 1000 / fps);
          this.hidden = wasHidden;
        },
      },
      this.root,
    );
  }

  // ─────────────────────────── main loop ───────────────────────────

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    this.step(now);
  };

  /** One frame of app logic + rendering (also driven manually by the debug `advance` hook). */
  private step(now: number): void {
    let realDt = (now - this.lastNow) / 1000;
    this.lastNow = now;
    if (!(realDt > 0)) realDt = 0;
    realDt = Math.min(MAX_REAL_DT, realDt);
    if (this.hidden) realDt = 0;

    try {
      switch (this.screen) {
        case 'title':
          this.renderer.renderTitle(realDt);
          this.updateTitleCover();
          break;
        case 'camp':
          this.addPlayTime(realDt);
          this.campSaveTimer += realDt;
          if (this.campSaveTimer >= CAMP_AUTOSAVE) {
            this.campSaveTimer = 0;
            writeSave(this.save);
          }
          this.renderer.renderCamp(this.save, realDt);
          break;
        case 'battle':
          this.updateBattle(realDt);
          break;
      }
    } catch (err) {
      if (this.errorCount++ < 5) console.error(err);
    }
    if (this.screen !== 'title') {
      this.topbar.update();
      this.updateBackdrop();
    }
    this.debug?.update(realDt, this.lastSimScale, this.lastSteps);
  }

  private updateBattle(realDt: number): void {
    const b = this.battle;
    if (!b) return;
    const blocked = !b.ended && (this.modals.isOpen() || this.notices.active);
    const paused = this.hidden || blocked;
    const scale = this.renderer.timeScale() * this.tutorial.scale() * (paused ? 0 : 1) * this.debugSpeed;
    this.lastSimScale = scale;
    let steps = 0;
    if (!b.ended && scale > 0) {
      this.acc += realDt * scale;
      const max = MAX_STEPS * Math.max(1, Math.ceil(this.debugSpeed));
      while (this.acc >= STEP && steps < max) {
        b.tick(STEP);
        this.acc -= STEP;
        steps++;
        if (b.ended) break;
      }
      if (steps >= max) this.acc = 0; // drop backlog instead of spiralling
    }
    if (b.ended) this.acc = 0;
    this.lastSteps = steps;

    const events = b.drainEvents();
    if (events.length) {
      this.renderer.pushEvents(events, b);
      this.audio.handleEvents(events, b);
      this.onBattleEvents(events, b);
      this.hud.onEvents(events);
      this.tutorial.onEvents(events, b);
    }
    const visualDt = paused ? 0 : realDt;
    this.renderer.renderBattle(b, visualDt, b.ended ? 0 : this.acc);
    this.hud.update(realDt);
    this.tutorial.update(b, visualDt);

    if (b.ended) {
      if (!this.runFinalized) {
        this.endTimer += realDt;
        if (this.endTimer >= END_BEAT) void this.finalizeRun();
      } else {
        this.addPlayTime(realDt); // reading results counts as camp time
      }
    }
  }

  /** Reserve space for camp controls on short screens; storybook art supports fractional scaling. */
  private updateCampStrip(): void {
    setVar(this.root, '--camp-strip', `${campSceneHeight(window.innerHeight)}px`);
  }

  /** Tint the letterbox around the canvas with the current area's palette. */
  private updateBackdrop(): void {
    const area = this.screen === 'battle' && this.battle ? this.battle.area : AREAS[this.save.selectedArea];
    const p = area.palette;
    const w = this.viewportWrap;
    setVar(w, '--area-sky', p.sky);
    setVar(w, '--area-mid', p.mid);
    setVar(w, '--area-ground', p.ground);
    setVar(w, '--area-accent', p.accent);
  }

  /** Title backdrop: scale the renderer's canvas up to cover the whole window. */
  private updateTitleCover(): void {
    const c = this.viewport.querySelector('canvas');
    if (!c) return;
    const cw = c.offsetWidth;
    const ch = c.offsetHeight;
    if (!cw || !ch) return;
    const k = Math.max(1, this.viewport.clientWidth / cw, this.viewport.clientHeight / ch);
    setVar(this.viewport, '--cover', k.toFixed(3));
  }

  private addPlayTime(dt: number): void {
    if (dt <= 0) return;
    this.save.playTime += dt;
    this.save.cycleTime += dt;
  }

  private onBattleEvents(events: BattleEvent[], b: Battle): void {
    for (const e of events) {
      switch (e.type) {
        // The audio engine also switches music on these events (autoMusic); requesting the same
        // track is a no-op there, so this only matters if auto switching is disabled.
        case 'bossIntro':
          this.setMusic(FINAL_AREAS.has(b.area.id) ? 'finalBoss' : 'boss');
          break;
        case 'bossDefeated':
          this.music = null; // engine lets the fanfare ring alone
          break;
        case 'descent':
          this.setMusic(e.area);
          break;
        case 'runEnd':
          this.tutorial.onRunEnd();
          if (this.pauseModal && !this.pauseModal.closed) this.pauseModal.close();
          break;
      }
    }
  }

  // ─────────────────────────── screens ───────────────────────────

  private setScreen(s: Screen): void {
    const changed = s !== this.screen;
    this.screen = s;
    this.root.dataset.screen = s;
    if (changed) {
      if (s === 'battle') flash(this.hud.el, 'enter', 450);
      else if (s === 'camp') flash(this.campRoot, 'enter', 450);
      if (s !== 'title') flash(this.topbar.el, 'enter', 450);
    }
    if (s !== 'camp') this.camp?.hide();
    if (s !== 'title') this.title.hide();
    this.renderer.resize();
    requestAnimationFrame(() => this.renderer.resize());
  }

  showTitle(): void {
    this.abortRun();
    this.modals.closeAll();
    this.setScreen('title');
    this.title.show();
    this.setMusic('title');
  }

  private continueGame(): void {
    if (this.save.stats.runs === 0) this.startRun(this.save.selectedArea);
    else this.enterCamp();
  }

  private newGame(): void {
    const settings = { ...this.save.settings };
    this.save = newSave();
    this.save.settings = settings;
    writeSave(this.save);
    this.camp?.refresh();
    this.applySettings(false);
    this.startRun('ashwood');
  }

  private deleteStoredSave(): void {
    const settings = { ...this.save.settings };
    deleteSave();
    this.save = newSave();
    this.save.settings = settings;
    this.camp?.refresh();
    this.toasts.show('セーブデータを削除した', 'info');
  }

  enterCamp(tab?: CampTab, notices?: Notice[]): void {
    this.abortRun();
    this.setScreen('camp');
    const camp = this.ensureCamp();
    let t = tab;
    if (t) {
      const tabs = camp.availableTabs();
      if (!tabs.includes(t)) t = tabs.includes('party') ? 'party' : undefined;
    }
    camp.show(t, notices);
    this.setMusic('camp');
    this.campSaveTimer = 0;
    this.replayMissedEndings();
  }

  /** Ending cards interrupted by a reload / tab close are shown again on the next camp visit. */
  private replayMissedEndings(): void {
    if (this.notices.active) return;
    const s = this.save;
    const missed: Notice[] = [];
    if (s.areas.hollow.cleared && !s.endingSeen) missed.push({ kind: 'ending' });
    if (s.areas.heart.cleared && !s.trueEndingSeen) missed.push({ kind: 'trueEnding' });
    if (!missed.length) return;
    void this.notices.play(this.noticeCards(missed)).then(() => {
      if (this.screen === 'camp') this.setMusic('camp');
    });
  }

  private ensureCamp(): ICampView {
    if (!this.camp) {
      this.camp = new CampView();
      this.camp.mount(this.campRoot, this.campContext());
    }
    return this.camp;
  }

  private campContext(): CampContext {
    return {
      getSave: () => this.save,
      commit: () => this.commit(),
      startRun: (area: AreaId) => this.startRun(area),
      onRekindled: (shards: number) => this.onRekindled(shards),
      toast: (text: string, kind?: ToastKind) => this.toasts.show(text, kind),
      firstTime: (key: string) => this.firstTime(key),
      audio: this.audio,
    };
  }

  private commit(): void {
    writeSave(this.save);
    this.topbar.update();
  }

  private firstTime(key: string): boolean {
    if (this.save.tutorial[key]) return false;
    this.save.tutorial[key] = true;
    writeSave(this.save);
    return true;
  }

  private onRekindled(shards: number): void {
    writeSave(this.save);
    this.topbar.update();
    this.camp?.refresh();
    void this.notices.play([rekindleCard(shards, this.save)]).then(() => {
      if (this.screen === 'camp') this.camp?.refresh();
    });
  }

  // ─────────────────────────── runs ───────────────────────────

  startRun(area: AreaId): void {
    if (this.notices.active) return;
    const save = this.save;
    let id = area;
    if (!save.areas[id] || !save.areas[id].unlocked) id = frontierArea(save);
    save.selectedArea = id;
    this.modals.closeAll();
    this.pauseModal = null;
    this.tutorial.onRunEnd();

    const b = new Battle({ save, areaId: id });
    this.battle = b;
    this.runFinalized = false;
    this.exitFinalized = false;
    this.endTimer = 0;
    this.acc = 0;
    this.renderer.beginBattle(b);
    this.hud.bind(b);
    this.setScreen('battle');
    this.audio.play('runStart');
    this.setMusic(id);
    this.tutorial.onRunStart(b);
  }

  /** Drop the current battle without applying it (screen change / reset / import). */
  private abortRun(): void {
    this.exitFinalized = false;
    if (!this.battle) return;
    this.tutorial.onRunEnd();
    this.battle = null;
    this.runFinalized = true;
  }

  private async finalizeRun(): Promise<void> {
    if (this.runFinalized) return;
    this.runFinalized = true;
    const b = this.battle;
    const r = b?.result;
    if (!b || !r) return;
    this.tutorial.onRunEnd();
    if (this.pauseModal && !this.pauseModal.closed) this.pauseModal.close();

    const endingSeenBefore = this.save.endingSeen;
    const everBefore = new Set(AREA_ORDER.filter((a) => this.save.areas[a].everCleared));
    const notices = applyRunResult(this.save, r);
    this.addPlayTime(r.duration);
    writeSave(this.save);
    this.topbar.update();

    await this.notices.play(this.noticeCards(notices, everBefore));
    if (this.battle !== b) return;
    if (endingSeenBefore && notices.some((n) => n.kind === 'rekindleReady')) this.toasts.show('Rekindle（転生）できるようになった！', 'good', 4200);

    const choice = await showResult(
      { modals: this.modals, audio: this.audio, getSave: () => this.save, firstTime: (k) => this.firstTime(k) },
      r,
      notices,
    );
    if (this.battle !== b) return;
    if (choice.action === 'again') this.startRun(r.areaId);
    else this.enterCamp(choice.tab, notices);
  }

  private noticeCards(notices: Notice[], everBefore?: ReadonlySet<AreaId>): NoticeCard[] {
    const cards: NoticeCard[] = [];
    for (const n of notices) {
      if (n.kind === 'recruit') cards.push(recruitCard(n.hero, n.level));
      else if (n.kind === 'areaUnlock') {
        // Areas already explored in a previous cycle re-open quietly (Descent blitzes would otherwise spam cards).
        const seen = everBefore ? everBefore.has(n.area) : this.save.areas[n.area].everCleared;
        if (seen) this.toasts.show(`${AREAS[n.area].name} への道が再び開いた`, 'good');
        else cards.push(areaCard(n.area));
      }
      else if (n.kind === 'ending') {
        cards.push({
          ...endingCard(),
          onDone: () => {
            this.save.endingSeen = true;
            writeSave(this.save);
          },
        });
      } else if (n.kind === 'trueEnding') {
        cards.push({
          ...trueEndingCard(this.save),
          onDone: () => {
            this.save.trueEndingSeen = true;
            writeSave(this.save);
          },
        });
        cards.push(epilogueCard(this.save));
      }
    }
    return cards;
  }

  // ─────────────────────────── battle actions ───────────────────────────

  private inputBlocked(): boolean {
    return !this.battle || this.battle.ended || this.modals.isOpen() || this.notices.active || this.screen !== 'battle';
  }

  private castSkill(hero: HeroId): void {
    const b = this.battle;
    if (!b || this.inputBlocked()) return;
    if (!b.party.includes(hero)) {
      this.hud.denied(hero);
      this.errorSound();
      return;
    }
    if (b.cast(hero, true)) {
      this.tutorial.onCast(hero);
    } else {
      this.hud.denied(hero);
      this.errorSound();
    }
  }

  private toggleAuto(hero: HeroId): void {
    const b = this.battle;
    if (!b || !b.mods.autoCast || !b.party.includes(hero)) return;
    const on = !b.skills[hero].auto;
    b.setAuto(hero, on);
    this.save.autoCast[hero] = b.skills[hero].auto;
    writeSave(this.save);
  }

  private tryOverdrive(): void {
    const b = this.battle;
    if (!b || this.inputBlocked() || !b.mods.overdrive) return;
    if (!b.activateOverdrive() && b.overdriveActive <= 0) this.errorSound();
  }

  private retreat(): void {
    const b = this.battle;
    if (!b || b.ended) return;
    b.retreat();
  }

  private errorSound(): void {
    const now = performance.now();
    if (now - this.errorAt < 180) return;
    this.errorAt = now;
    this.audio.play('uiError');
  }

  private openPauseMenu(): void {
    const b = this.battle;
    if (!b || b.ended || this.modals.isOpen()) return;
    this.pauseModal = openPause({ modals: this.modals, openSettings: () => this.openSettings(), retreat: () => this.retreat() }, b);
  }

  // ─────────────────────────── settings & sound ───────────────────────────

  openSettings(): void {
    openSettings({
      modals: this.modals,
      audio: this.audio,
      getSave: () => this.save,
      applySettings: () => this.applySettings(true),
      replaceSave: (s) => this.replaceSave(s),
      resetSave: () => this.resetSave(),
      toast: (t, k) => this.toasts.show(t, k),
    });
  }

  private applySettings(persist: boolean): void {
    const s = this.save.settings;
    this.audio.setSettings({ sfx: s.sfx, music: s.music, sfxVolume: s.sfxVolume, musicVolume: s.musicVolume });
    this.renderer.setSettings({ screenShake: s.screenShake, damageNumbers: s.damageNumbers });
    if (persist && (hasSave() || this.screen !== 'title')) writeSave(this.save);
    this.title.syncSound();
  }

  private soundOn(): boolean {
    const s = this.save.settings;
    return s.sfx || s.music;
  }

  private toggleSound(): void {
    const s = this.save.settings;
    if (s.sfx || s.music) {
      this.soundMemory = { sfx: s.sfx, music: s.music };
      s.sfx = false;
      s.music = false;
    } else {
      s.sfx = this.soundMemory?.sfx ?? true;
      s.music = this.soundMemory?.music ?? true;
      if (!s.sfx && !s.music) s.sfx = s.music = true;
    }
    this.applySettings(true);
  }

  private setMusic(track: MusicTrack): void {
    // The engine treats the same track as a no-op, so always forward (keeps us robust to its auto switches).
    this.music = track;
    this.audio.setMusic(track);
  }

  private replaceSave(data: SaveData): void {
    this.modals.closeAll();
    this.abortRun();
    this.save = data;
    writeSave(this.save);
    this.applySettings(false);
    this.camp?.refresh();
    this.toasts.show('セーブデータを読み込んだ', 'good');
    if (this.save.stats.runs === 0) this.showTitle();
    else this.enterCamp();
  }

  private resetSave(): void {
    this.modals.closeAll();
    this.abortRun();
    const settings = { ...this.save.settings };
    deleteSave();
    this.save = newSave();
    this.save.settings = settings;
    this.camp?.refresh();
    this.showTitle();
    this.toasts.show('セーブデータを削除した', 'info');
  }

  // ─────────────────────────── input ───────────────────────────

  private bindInput(): void {
    const unlock = () => {
      if (this.audioUnlocked) return;
      this.audioUnlocked = true;
      this.audio.unlock();
      this.audio.setMusic(this.music);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    // UI feedback sounds for shell controls (the camp plays its own).
    let hoverEl: Element | null = null;
    let hoverAt = 0;
    const SOUND_SEL = '.btn, .icon-btn, .toggle, .skill-auto, .overdrive';
    this.root.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const t = (e.target as Element | null)?.closest?.(`${SOUND_SEL}, .skill`) ?? null;
      if (t === hoverEl) return;
      hoverEl = t;
      if (!t || (t as HTMLButtonElement).disabled || this.campRoot.contains(t)) return;
      const now = performance.now();
      if (now - hoverAt < 60) return;
      hoverAt = now;
      this.audio.play('uiHover', { volume: 0.45 });
    });
    this.root.addEventListener('click', (e) => {
      const t = (e.target as Element | null)?.closest?.(SOUND_SEL) ?? null;
      if (!t || (t as HTMLButtonElement).disabled || this.campRoot.contains(t) || t.closest('.notice, .modal-result')) return;
      this.audio.play('uiClick');
    });

    this.viewport.addEventListener('pointerdown', (e) => this.onViewportPointer(e));
    this.viewport.addEventListener('pointermove', (e) => this.onViewportMove(e));
    this.viewport.addEventListener('pointerleave', () => this.viewport.classList.remove('can-mark'));
  }

  private onKeyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox'));
    // While a shell overlay is up, no other window-level handler (e.g. the camp's hotkeys) may react.
    if (this.notices.active) {
      e.stopImmediatePropagation();
      if (!typing) this.notices.handleKey(e);
      return;
    }
    if (this.modals.isOpen()) {
      e.stopImmediatePropagation();
      if (typing && e.key !== 'Escape') return;
      this.modals.handleKey(e);
      return;
    }
    if (typing) return;
    if (this.screen === 'title') {
      this.title.handleKey(e);
      return;
    }
    if (this.screen === 'battle') this.onBattleKey(e);
  }

  private onBattleKey(e: KeyboardEvent): void {
    const b = this.battle;
    if (!b) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!b.ended) this.openPauseMenu();
      return;
    }
    let idx = DIGIT_CODES[e.code];
    if (idx === undefined && e.key >= '1' && e.key <= '4' && e.key.length === 1) idx = Number(e.key) - 1;
    if (idx !== undefined) {
      e.preventDefault();
      if (!e.repeat) this.castSkill(HERO_ORDER[idx]);
      return;
    }
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) this.tryOverdrive();
    }
  }

  private onViewportPointer(e: PointerEvent): void {
    if (this.screen !== 'battle' || e.button !== 0) return;
    const b = this.battle;
    if (!b || b.ended || this.modals.isOpen() || this.notices.active) return;
    const p = this.renderer.clientToWorld(e.clientX, e.clientY);
    if (!p) return;
    const u = b.enemyAt(p.x, p.y);
    if (!u) return;
    if (b.canFocus()) {
      if (b.setFocus(u.id)) this.audio.play('uiClick');
    } else {
      this.floatHint(e.clientX, e.clientY, 'Rangerが仲間になるとMarkできる');
    }
  }

  private onViewportMove(e: PointerEvent): void {
    const b = this.battle;
    if (this.screen !== 'battle' || !b || b.ended) {
      this.viewport.classList.remove('can-mark');
      return;
    }
    const p = this.renderer.clientToWorld(e.clientX, e.clientY);
    const over = !!p && !!b.enemyAt(p.x, p.y);
    this.viewport.classList.toggle('can-mark', over && b.canFocus());
    this.viewport.classList.toggle('over-enemy', over);
  }

  private floatHint(x: number, y: number, text: string): void {
    const now = performance.now();
    if (now - this.hintAt < 1200) return;
    this.hintAt = now;
    const el = h('div', { class: 'float-hint', text, style: `left:${Math.round(x)}px;top:${Math.round(y)}px` });
    this.fxLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 1600);
  }

  // ─────────────────────────── lifecycle ───────────────────────────

  private bindLifecycle(): void {
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (this.hidden) this.persist();
      this.lastNow = performance.now();
    });
    window.addEventListener('beforeunload', () => this.persistOnExit());
    window.addEventListener('pagehide', () => this.persistOnExit());
    window.addEventListener('pageshow', (e) => {
      if (!e.persisted || !this.exitFinalized) return;
      this.modals.closeAll();
      this.pauseModal = null;
      this.enterCamp();
    });
  }

  private persist(): void {
    if (hasSave() || this.screen !== 'title') writeSave(this.save);
  }

  /** Leaving the page mid-run: bank the run as a retreat so no loot is lost. */
  private persistOnExit(): void {
    const b = this.battle;
    if (b && !this.runFinalized) {
      if (!b.ended) b.retreat();
      const r = b.result;
      if (r) {
        this.runFinalized = true;
        this.exitFinalized = true;
        applyRunResult(this.save, r);
        this.addPlayTime(r.duration);
      }
    }
    this.persist();
  }
}
