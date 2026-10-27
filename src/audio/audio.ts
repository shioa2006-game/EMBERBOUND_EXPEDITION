// Procedural audio engine (Web Audio API only — no asset files).
//
// Graph:  voices ─► sfxBus ─┐
//         music tracks ─► musicBus ─► duck ─┴─► glue compressor ─► limiter ─► master ─► destination
//
// * The AudioContext is created lazily in unlock() (and on the first pointer / key gesture).
// * Every call is a silent no-op where Web Audio is unavailable (Node, tests, old browsers).
// * SFX are rate-limited per sound, spaced by a minimum gap (cascading coins instead of a wall
//   of noise), capped at VOICE_CAP simultaneous voices with priority-based stealing, and softly
//   attenuated when the mix gets dense. Big stingers duck the music.
import type { Battle } from '../core/battle.ts';
import type { BattleEvent } from '../core/types.ts';
import type { AudioSettings, IAudio, MusicTrack, SfxName } from './api.ts';
import { BattleSoundMapper, type PlayOpts, type SoundSink } from './events.ts';
import { MusicPlayer } from './music.ts';
import { SFX, type AnySfx } from './sfx.ts';
import { createKit, Layer, type Kit } from './synth.ts';

export { bossTrackFor, musicForBattle } from './events.ts';
export type { PlayOpts } from './events.ts';

const VOICE_CAP = 24;
const TICK_MS = 25;
const MUSIC_BASE = 1.0; // track mixes are authored to sit well under the SFX at equal slider values
const COMBO_RESET = 0.6; // seconds without a coin before the pitch ladder resets
const COIN_LADDER = [0, 2, 4, 5, 7, 9, 11, 12]; // major-scale climb for consecutive coins

interface Voice {
  name: AnySfx;
  prio: number;
  start: number;
  end: number;
  gain: GainNode;
  pan: StereoPannerNode | null;
}

type AudioCtor = new (opts?: AudioContextOptions) => AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const volCurve = (v: number): number => Math.pow(clamp01(v), 1.5);

export class AudioEngine implements IAudio {
  private ctx: AudioContext | null = null;
  private kit: Kit | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private music: MusicPlayer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private failed = false;
  private hidden = false;

  private settings: AudioSettings = { sfx: true, music: true, sfxVolume: 0.7, musicVolume: 0.45 };
  private desiredTrack: MusicTrack = null;

  private voices: Voice[] = [];
  private lastStart = new Map<AnySfx, number>();
  private history = new Map<AnySfx, number[]>();
  private coinCombo = 0;
  private coinLast = -Infinity;
  private duckDepth = 1;
  private duckUntil = 0;
  private cleanupTick = 0;

  private mapper = new BattleSoundMapper();
  private sink: SoundSink = {
    sfx: (name, o) => this.fire(name, o),
    music: (track) => this.setMusic(track),
  };

  constructor() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const gesture = (): void => {
      this.unlock();
      if (this.ctx?.state === 'running' || this.failed) {
        window.removeEventListener('pointerdown', gesture, true);
        window.removeEventListener('keydown', gesture, true);
        window.removeEventListener('touchend', gesture, true);
      }
    };
    window.addEventListener('pointerdown', gesture, true);
    window.addEventListener('keydown', gesture, true);
    window.addEventListener('touchend', gesture, true);
    if (typeof document !== 'undefined') {
      this.hidden = document.visibilityState === 'hidden';
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.visibilityState === 'hidden';
        const ctx = this.ctx;
        if (!ctx) return;
        try {
          if (this.hidden) void ctx.suspend().catch(() => undefined);
          else void ctx.resume().catch(() => undefined);
        } catch {
          // ignore
        }
      });
    }
  }

  /** Automatic battle music (default on): boss track on bossIntro, silence under the boss fanfare, next area on Descent. */
  get autoMusic(): boolean {
    return this.mapper.autoMusic;
  }

  set autoMusic(on: boolean) {
    this.mapper.autoMusic = on;
  }

  /** Currently requested music track. */
  get track(): MusicTrack {
    return this.desiredTrack;
  }

  // ───────────────────────────── IAudio ─────────────────────────────

  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const Ctor = audioCtor();
        if (!Ctor) {
          this.failed = true;
          return;
        }
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.build(this.ctx);
      }
      const ctx = this.ctx;
      if (ctx.state !== 'running' && !this.hidden) {
        void ctx.resume().catch(() => undefined);
        // older WebKit only unlocks output once a source starts inside the gesture
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch {
      this.failed = true;
      this.ctx = null;
    }
  }

  setSettings(s: AudioSettings): void {
    const prevMusic = this.settings.music;
    this.settings = {
      sfx: !!s.sfx,
      music: !!s.music,
      sfxVolume: clamp01(s.sfxVolume),
      musicVolume: clamp01(s.musicVolume),
    };
    if (!this.ctx) return;
    try {
      this.applyBusGains(false);
      if (this.music) {
        if (!this.settings.music && prevMusic) this.music.stopAll(0.4);
        else if (this.settings.music && !prevMusic) this.music.play(this.desiredTrack);
      }
    } catch {
      // never let audio break the game
    }
  }

  play(name: SfxName, opts?: { volume?: number; pitch?: number }): void {
    this.fire(name, opts);
  }

  handleEvents(events: BattleEvent[], battle: Battle): void {
    if (!events.length) return;
    try {
      this.mapper.map(events, battle, this.sink);
    } catch {
      // a malformed event must never stop the game loop
    }
  }

  setMusic(track: MusicTrack): void {
    if (track === this.desiredTrack) return;
    this.desiredTrack = track;
    if (!this.music || !this.settings.music) return;
    try {
      this.music.play(track);
    } catch {
      // ignore
    }
  }

  // ───────────────────────────── extras ─────────────────────────────

  /** Play any sound, including internal ones, with pan / delay. */
  fire(name: AnySfx, o: PlayOpts = {}): void {
    const ctx = this.ctx;
    const kit = this.kit;
    const bus = this.sfxBus;
    if (!ctx || !kit || !bus || !this.settings.sfx || this.settings.sfxVolume <= 0.001) return;
    // A context that is still resuming after the unlock gesture plays the sound a moment later;
    // while the tab is hidden (context suspended on purpose) nothing is queued.
    if (this.hidden || ctx.state === 'closed') return;
    const sp = SFX[name];
    if (!sp) return;
    try {
      const now = ctx.currentTime;
      let t = now + 0.004 + Math.max(0, o.delay ?? 0);

      // minimum gap: push slightly later (cascade) or drop
      const last = this.lastStart.get(name) ?? -Infinity;
      if (t < last + sp.gap) {
        const pushed = last + sp.gap;
        if (pushed - t > sp.delay) return;
        t = pushed;
      }
      // per-second budget
      let hist = this.history.get(name);
      if (!hist) {
        hist = [];
        this.history.set(name, hist);
      }
      while (hist.length && hist[0] <= t - 1) hist.shift();
      if (hist.length >= sp.perSec) return;

      // global voice cap with priority stealing
      this.cleanup(now);
      if (this.voices.length >= VOICE_CAP) {
        let victim: Voice | null = null;
        for (const v of this.voices) {
          if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.start < victim.start)) victim = v;
        }
        if (!victim || victim.prio > sp.prio) return;
        this.kill(victim, now);
      }

      let pitch = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * sp.vary);
      if (name === 'coin') pitch *= this.coinPitch(t);
      const density = 1 / (1 + Math.max(0, this.voices.length - 10) * 0.05);
      const vol = sp.vol * (o.volume ?? 1) * density;

      const g = ctx.createGain();
      let pan: StereoPannerNode | null = null;
      if (o.pan && typeof ctx.createStereoPanner === 'function') {
        pan = ctx.createStereoPanner();
        pan.pan.value = Math.max(-1, Math.min(1, o.pan));
        g.connect(pan);
        pan.connect(bus);
      } else {
        g.connect(bus);
      }
      const layer = new Layer(kit, g, t, pitch, vol);
      sp.fn(layer);
      this.voices.push({ name, prio: sp.prio, start: t, end: layer.end + 0.05, gain: g, pan });
      hist.push(t);
      this.lastStart.set(name, t);
      if (sp.duck) this.duck(sp.duck[0], sp.duck[1], t - now);
    } catch {
      // ignore synthesis failures (e.g. context closed)
    }
  }

  /** Temporarily lower the music (0..1) for `seconds`, starting after `delay`. */
  duck(depth: number, seconds: number, delay = 0): void {
    const ctx = this.ctx;
    const dg = this.duckGain;
    if (!ctx || !dg) return;
    const now = ctx.currentTime;
    const start = now + Math.max(0, delay);
    const active = this.duckUntil > now;
    const d = active ? Math.min(depth, this.duckDepth) : depth;
    const until = Math.max(start + seconds, active ? this.duckUntil : 0);
    if (active && d === this.duckDepth && until === this.duckUntil) return;
    const p = dg.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(d, Math.max(now + 0.06, start + 0.06));
    p.setValueAtTime(d, until);
    p.linearRampToValueAtTime(1, until + 0.9);
    this.duckDepth = d;
    this.duckUntil = until;
  }

  /** Stop the timer and close the context (e.g. on hot reload). The engine stays silent afterwards. */
  dispose(): void {
    this.failed = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.music?.disposeAll();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.kit = null;
    this.music = null;
    this.sfxBus = this.musicBus = this.duckGain = null;
    this.voices = [];
  }

  // ───────────────────────────── internals ─────────────────────────────

  private build(ctx: AudioContext): void {
    this.kit = createKit(ctx);

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 10;
    glue.ratio.value = 4;
    glue.attack.value = 0.004;
    glue.release.value = 0.2;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;

    const master = ctx.createGain();
    master.gain.value = 0.92;

    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.sfxBus.connect(glue);
    this.musicBus.connect(this.duckGain);
    this.duckGain.connect(glue);
    glue.connect(limiter);
    limiter.connect(master);
    master.connect(ctx.destination);

    this.applyBusGains(true);
    this.music = new MusicPlayer(this.kit, this.musicBus);
    if (this.settings.music && this.desiredTrack) this.music.play(this.desiredTrack);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private applyBusGains(immediate: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.musicBus) return;
    const sfx = this.settings.sfx ? volCurve(this.settings.sfxVolume) : 0;
    const music = this.settings.music ? volCurve(this.settings.musicVolume) * MUSIC_BASE : 0;
    if (immediate) {
      this.sfxBus.gain.value = sfx;
      this.musicBus.gain.value = music;
    } else {
      const now = ctx.currentTime;
      this.sfxBus.gain.setTargetAtTime(sfx, now, 0.03);
      this.musicBus.gain.setTargetAtTime(music, now, 0.05);
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try {
      this.music?.tick();
      if (++this.cleanupTick >= 20) {
        this.cleanupTick = 0;
        this.cleanup(ctx.currentTime);
      }
    } catch {
      // keep ticking
    }
  }

  private cleanup(now: number): void {
    if (!this.voices.length) return;
    let keep = 0;
    for (const v of this.voices) {
      if (v.end < now) this.disconnect(v);
      else this.voices[keep++] = v;
    }
    this.voices.length = keep;
  }

  private kill(v: Voice, now: number): void {
    const p = v.gain.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(0, now + 0.03);
    this.voices = this.voices.filter((x) => x !== v);
    setTimeout(() => this.disconnect(v), 80);
  }

  private disconnect(v: Voice): void {
    try {
      v.gain.disconnect();
      v.pan?.disconnect();
    } catch {
      // already gone
    }
  }

  private coinPitch(t: number): number {
    if (t - this.coinLast > COMBO_RESET) this.coinCombo = 0;
    else this.coinCombo++;
    this.coinLast = t;
    const step = COIN_LADDER[Math.min(this.coinCombo, COIN_LADDER.length - 1)];
    return Math.pow(2, step / 12);
  }
}
