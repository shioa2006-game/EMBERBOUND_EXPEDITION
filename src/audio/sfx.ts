// Procedural SFX recipes. Every public SfxName (src/audio/api.ts) plus a few internal extras used by
// the battle-event mapper. Retro / chiptune palette: pulse & triangle tones, filtered noise
// transients, sine "thumps" underneath impacts. Each recipe draws into a Layer (start time, pitch
// and volume already applied) and the engine handles routing, rate limits and the voice cap.
import type { SfxName } from './api.ts';
import { midiHz, type Layer, type ToneOpts } from './synth.ts';

export type ExtraSfx =
  | 'hitMagic' | 'hitHeavy' | 'hurt' | 'absorb' | 'wardHit' | 'burnTick' | 'swing' | 'heavyWhoosh'
  | 'stun' | 'mark' | 'pip' | 'revive' | 'smallBoom' | 'drain' | 'splash' | 'enemyHeal' | 'empower'
  | 'eliteWarn' | 'windupFlip' | 'benediction' | 'intercede' | 'shockwave' | 'meteorite' | 'flare'
  | 'doomBlast' | 'eliteCrunch' | 'wardUp' | 'overdriveEnd' | 'lanternOut' | 'retreat';

export type AnySfx = SfxName | ExtraSfx;

export interface SfxSpec {
  fn: (s: Layer) => void;
  /** Base volume multiplier. */
  vol: number;
  /** Random pitch variation (± fraction). */
  vary: number;
  /** Max starts per second. */
  perSec: number;
  /** Minimum spacing between two starts (s). */
  gap: number;
  /** How far a start may be pushed back to respect `gap` (0 = drop instead). */
  delay: number;
  /** Voice-steal priority (higher wins). */
  prio: number;
  /** Duck the music [depth 0..1, seconds]. */
  duck?: [number, number];
}

type NoteSpec = [midi: number, at: number, dur: number];

function seq(s: Layer, notes: NoteSpec[], o: Omit<ToneOpts, 'f' | 'at' | 'd'>): void {
  for (const [m, at, d] of notes) s.note(m, { ...o, at, d });
}

function chord(s: Layer, notes: number[], o: Omit<ToneOpts, 'f'>): void {
  for (const m of notes) s.note(m, o);
}

/** Inharmonic bell / anvil partials. */
function partials(s: Layer, base: number, ratios: number[], decays: number[], vols: number[], at = 0, w: ToneOpts['w'] = 'sine'): void {
  ratios.forEach((r, i) => s.tn({ w: i === 0 ? 'triangle' : w, f: base * r, at, d: decays[i] ?? 0.3, v: vols[i] ?? 0.02 }));
}

function sparkle(s: Layer, notes: number[], at: number, step: number, v: number, d = 0.4): void {
  notes.forEach((m, i) => s.note(m, { w: 'sine', at: at + i * step, d, v }));
}

function crackle(s: Layer, n: number, from: number, span: number, v: number): void {
  for (let i = 0; i < n; i++) {
    s.nz({ type: 'bandpass', f: 2500 + Math.random() * 4000, q: 3, at: from + Math.random() * span, d: 0.02 + Math.random() * 0.02, v });
  }
}

/** spec(recipe, volume, pitchVary, maxPerSecond, minGap, maxDelay, priority, duck?) — see SfxSpec. */
function spec(fn: (s: Layer) => void, vol: number, vary: number, perSec: number, gap: number, delay: number, prio: number, duck?: [number, number]): SfxSpec {
  return { fn, vol, vary, perSec, gap, delay, prio, duck };
}

export const SFX: Record<AnySfx, SfxSpec> = {
  // ───────────── combat: hits ─────────────
  hit: spec((s) => {
    s.nz({ type: 'highpass', f: 1800, d: 0.045, v: 0.2 });
    s.tn({ w: 'square', f: 520, f2: 150, d: 0.07, v: 0.075, lp: 2400 });
    s.tn({ w: 'sine', f: 150, f2: 55, d: 0.09, v: 0.28 });
  }, 0.75, 0.12, 18, 0.022, 0, 2),

  hitMagic: spec((s) => {
    s.nz({ type: 'bandpass', f: 3000, q: 1.2, d: 0.06, v: 0.12 });
    s.tn({ w: 'triangle', f: 900, f2: 420, d: 0.08, v: 0.11 });
    s.tn({ w: 'sine', f: 1600, f2: 2400, d: 0.06, v: 0.04 });
    s.tn({ w: 'sine', f: 130, f2: 60, d: 0.08, v: 0.18 });
  }, 0.75, 0.12, 14, 0.025, 0, 2),

  hitHeavy: spec((s) => {
    s.nz({ type: 'highpass', f: 3500, d: 0.03, v: 0.12 });
    s.nz({ type: 'lowpass', f: 2500, f2: 400, d: 0.14, v: 0.3 });
    s.tn({ w: 'square', f: 300, f2: 70, d: 0.14, v: 0.1, lp: 1600 });
    s.tn({ w: 'sine', f: 110, f2: 38, d: 0.22, v: 0.45 });
  }, 0.85, 0.08, 10, 0.04, 0.03, 4),

  crit: spec((s) => {
    s.nz({ type: 'highpass', f: 3000, d: 0.04, v: 0.24 });
    s.tn({ w: 'square', f: 1100, f2: 320, d: 0.07, v: 0.08, lp: 5000 });
    s.tn({ w: 'sine', f: 160, f2: 50, d: 0.12, v: 0.34 });
    s.tn({ w: 'triangle', f: 2093, at: 0.015, d: 0.14, v: 0.055 });
    s.tn({ w: 'sine', f: 3136, at: 0.045, d: 0.18, v: 0.045 });
    s.tn({ w: 'sine', f: 4186, at: 0.075, d: 0.2, v: 0.03 });
  }, 0.85, 0.06, 10, 0.03, 0.02, 4),

  hurt: spec((s) => {
    s.nz({ type: 'lowpass', f: 1400, f2: 500, d: 0.08, v: 0.24 });
    s.tn({ w: 'square', f: 260, f2: 80, d: 0.1, v: 0.07, lp: 900 });
    s.tn({ w: 'sine', f: 120, f2: 45, d: 0.14, v: 0.36 });
  }, 0.8, 0.1, 10, 0.04, 0, 4),

  block: spec((s) => {
    s.nz({ type: 'bandpass', f: 3200, q: 3, d: 0.04, v: 0.24 });
    s.tn({ w: 'triangle', f: 1180, d: 0.16, v: 0.1 });
    s.tn({ w: 'square', f: 1730, d: 0.1, v: 0.03, lp: 6000 });
    s.tn({ w: 'sine', f: 2650, d: 0.2, v: 0.04 });
    s.tn({ w: 'sine', f: 140, f2: 70, d: 0.08, v: 0.24 });
  }, 0.8, 0.06, 8, 0.05, 0, 5),

  absorb: spec((s) => {
    s.tn({ w: 'sine', f: 520, f2: 380, d: 0.16, v: 0.12, vib: [30, 40] });
    s.tn({ w: 'triangle', f: 1040, f2: 760, d: 0.12, v: 0.045 });
    s.nz({ type: 'bandpass', f: 1800, q: 4, d: 0.08, v: 0.06 });
  }, 0.7, 0.08, 8, 0.05, 0, 3),

  wardHit: spec((s) => {
    s.tn({ w: 'sine', f: 2400, d: 0.09, v: 0.07 });
    s.tn({ w: 'triangle', f: 1600, f2: 1500, d: 0.07, v: 0.06 });
    s.nz({ type: 'highpass', f: 5000, d: 0.03, v: 0.1 });
  }, 0.7, 0.1, 10, 0.04, 0, 2),

  burnTick: spec((s) => {
    s.nz({ type: 'bandpass', f: 2600, q: 2, d: 0.03, v: 0.07 });
    s.nz({ type: 'highpass', f: 6000, at: 0.015, d: 0.02, v: 0.05 });
  }, 0.6, 0.15, 4, 0.1, 0, 1),

  // ───────────── combat: projectiles & swings ─────────────
  arrow: spec((s) => {
    s.nz({ type: 'bandpass', f: 2200, f2: 5200, q: 2.5, d: 0.09, v: 0.09 });
    s.tn({ w: 'triangle', f: 760, f2: 560, d: 0.045, v: 0.04 });
  }, 0.5, 0.1, 10, 0.04, 0, 1),

  bolt: spec((s) => {
    s.nz({ type: 'lowpass', f: 700, f2: 2800, d: 0.13, v: 0.08 });
    s.tn({ w: 'sine', f: 520, f2: 1040, d: 0.12, v: 0.06, vib: [18, 30] });
    s.tn({ w: 'triangle', f: 260, f2: 520, d: 0.1, v: 0.04 });
  }, 0.5, 0.1, 8, 0.05, 0, 1),

  chain: spec((s) => {
    s.tn({ w: 'sawtooth', f: 1400, f2: 300, d: 0.12, v: 0.05, lp: 4000, vib: [42, 300] });
    s.tn({ w: 'square', f: 2600, f2: 1800, d: 0.05, v: 0.022 });
    s.nz({ type: 'highpass', f: 4000, d: 0.02, v: 0.1 });
    s.nz({ type: 'highpass', f: 4500, at: 0.04, d: 0.02, v: 0.08 });
    s.nz({ type: 'highpass', f: 5000, at: 0.08, d: 0.02, v: 0.06 });
  }, 0.6, 0.12, 8, 0.05, 0.02, 2),

  swing: spec((s) => {
    s.nz({ type: 'bandpass', f: 400, f2: 1500, q: 1.5, d: 0.14, v: 0.08 });
  }, 0.6, 0.1, 6, 0.1, 0, 1),

  heavyWhoosh: spec((s) => {
    s.nz({ type: 'bandpass', f: 300, f2: 1200, q: 1, d: 0.22, v: 0.14 });
    s.tn({ w: 'sine', f: 140, f2: 60, d: 0.2, v: 0.15 });
  }, 0.8, 0.08, 6, 0.1, 0, 5),

  // ───────────── support ─────────────
  heal: spec((s) => {
    seq(s, [[72, 0, 0.2], [76, 0.045, 0.2], [79, 0.09, 0.24]], { w: 'triangle', v: 0.055 });
    s.tn({ w: 'sine', f: 1318, f2: 1760, at: 0.05, d: 0.28, v: 0.025 });
  }, 0.65, 0.04, 6, 0.08, 0, 3),

  barrier: spec((s) => {
    s.tn({ w: 'sine', f: 660, f2: 990, d: 0.35, v: 0.08, a: 0.03, vib: [9, 25] });
    s.tn({ w: 'sine', f: 664, f2: 996, d: 0.35, v: 0.06, a: 0.03 });
    s.tn({ w: 'triangle', f: 1320, at: 0.05, d: 0.2, v: 0.03 });
    s.nz({ type: 'highpass', f: 6000, a: 0.1, d: 0.3, v: 0.03 });
  }, 0.7, 0.04, 4, 0.15, 0, 3),

  barrierBreak: spec((s) => {
    s.nz({ type: 'highpass', f: 3500, f2: 5000, d: 0.28, v: 0.2 });
    s.tn({ w: 'triangle', f: 900, f2: 220, d: 0.2, v: 0.08 });
    for (let i = 0; i < 4; i++) s.tn({ w: 'sine', f: 2400 + Math.random() * 1800, at: i * 0.025, d: 0.12 + Math.random() * 0.08, v: 0.04 });
    s.tn({ w: 'sine', f: 180, f2: 60, d: 0.15, v: 0.18 });
  }, 0.8, 0.06, 6, 0.08, 0.05, 5),

  // ───────────── hero actives ─────────────
  bash: spec((s) => {
    s.nz({ type: 'bandpass', f: 600, f2: 2000, q: 1.5, d: 0.09, v: 0.1 });
    s.nz({ type: 'lowpass', f: 3000, f2: 500, at: 0.09, d: 0.14, v: 0.36 });
    s.tn({ w: 'square', f: 240, f2: 60, at: 0.09, d: 0.16, v: 0.11, lp: 1400 });
    s.tn({ w: 'sine', f: 130, f2: 40, at: 0.09, d: 0.28, v: 0.5 });
    s.tn({ w: 'triangle', f: 523, at: 0.09, d: 0.25, v: 0.05 });
    s.tn({ w: 'triangle', f: 784, at: 0.09, d: 0.2, v: 0.035 });
  }, 0.9, 0.05, 6, 0.1, 0, 7),

  interrupt: spec((s) => {
    s.nz({ type: 'bandpass', f: 2500, q: 2, d: 0.06, v: 0.3 });
    s.nz({ type: 'highpass', f: 6000, d: 0.1, v: 0.12 });
    s.tn({ w: 'square', f: 1174, d: 0.08, v: 0.045, lp: 6000 });
    partials(s, 587, [1, 2.066, 3.048, 4.278, 5.656], [0.9, 0.7, 0.5, 0.4, 0.3], [0.12, 0.075, 0.055, 0.04, 0.028]);
    s.tn({ w: 'sine', f: 180, f2: 38, d: 0.5, v: 0.5 });
    s.tn({ w: 'triangle', f: 90, f2: 30, d: 0.45, v: 0.24 });
  }, 0.95, 0.04, 6, 0.08, 0.05, 9),

  break: spec((s) => {
    s.nz({ type: 'bandpass', f: 1400, f2: 500, q: 1.5, d: 0.3, v: 0.28 });
    s.nz({ type: 'highpass', f: 5000, d: 0.05, v: 0.18 });
    partials(s, 392, [1, 2.117, 3.29, 4.87], [0.7, 0.5, 0.4, 0.3], [0.1, 0.065, 0.048, 0.034]);
    s.tn({ w: 'sine', f: 150, f2: 32, d: 0.6, v: 0.5 });
    s.tn({ w: 'sawtooth', f: 300, f2: 60, d: 0.25, v: 0.05, lp: 900 });
  }, 0.9, 0.04, 6, 0.1, 0.05, 8),

  perfect: spec((s) => {
    sparkle(s, [88, 95, 100, 104], 0, 0.045, 0.065, 0.45);
    seq(s, [[76, 0, 0.3], [83, 0.045, 0.3], [88, 0.09, 0.32]], { w: 'triangle', v: 0.035 });
    seq(s, [[76, 0, 0.07], [83, 0.03, 0.07], [88, 0.06, 0.08]], { w: 'pulse12', v: 0.025 });
    s.nz({ type: 'highpass', f: 8000, a: 0.02, d: 0.5, v: 0.04 });
  }, 0.85, 0.02, 4, 0.12, 0.2, 9),

  arrowRain: spec((s) => {
    for (let i = 0; i < 6; i++) {
      s.nz({ type: 'bandpass', f: 2000 + i * 400, f2: 5000, q: 2, at: i * 0.035, d: 0.08, v: 0.07 });
      s.tn({ w: 'triangle', f: 700 + i * 60, f2: 520, at: i * 0.035, d: 0.04, v: 0.035 });
    }
    s.tn({ w: 'sine', f: 1500, f2: 3200, at: 0.05, d: 0.35, v: 0.035 });
  }, 0.85, 0.04, 4, 0.2, 0, 7),

  meteorFall: spec((s) => {
    s.tn({ w: 'sine', f: 2200, f2: 260, d: 0.82, v: 0.065, vib: [14, 40] });
    s.tn({ w: 'triangle', f: 1100, f2: 130, d: 0.82, v: 0.035 });
    s.nz({ type: 'lowpass', f: 300, f2: 1800, a: 0.6, d: 0.82, v: 0.17 });
    s.nz({ type: 'bandpass', f: 900, q: 1, a: 0.5, d: 0.8, v: 0.07 });
  }, 0.85, 0.03, 4, 0.2, 0, 7),

  meteorImpact: spec((s) => {
    s.nz({ type: 'lowpass', f: 4000, f2: 150, d: 1.0, v: 0.52 });
    s.nz({ type: 'highpass', f: 2500, d: 0.12, v: 0.24 });
    s.tn({ w: 'sine', f: 95, f2: 28, d: 0.75, v: 0.62 });
    s.tn({ w: 'square', f: 180, f2: 40, d: 0.3, v: 0.1, lp: 1200 });
    s.tn({ w: 'sawtooth', f: 120, f2: 35, d: 0.5, v: 0.05, lp: 600 });
    crackle(s, 6, 0.1, 0.5, 0.06);
  }, 0.95, 0.04, 4, 0.15, 0, 8),

  sanctuary: spec((s) => {
    for (const m of [72, 76, 79, 84]) {
      s.note(m, { w: 'triangle', a: 0.08, h: 0.3, d: 1.3, v: 0.04, det: -7 });
      s.note(m, { w: 'triangle', a: 0.08, h: 0.3, d: 1.3, v: 0.03, det: 7 });
    }
    s.note(48, { w: 'sine', a: 0.1, d: 1.2, v: 0.1 });
    sparkle(s, [96, 100, 103], 0.1, 0.12, 0.035, 0.8);
    s.nz({ type: 'highpass', f: 7000, a: 0.3, d: 1.2, v: 0.03 });
  }, 0.85, 0.02, 3, 0.2, 0, 7),

  // ───────────── loot ─────────────
  coin: spec((s) => {
    s.tn({ w: 'pulse25', f: 988, d: 0.055, h: 0.035, v: 0.085 });
    s.tn({ w: 'pulse25', f: 1319, at: 0.05, d: 0.16, h: 0.02, v: 0.085 });
    s.tn({ w: 'sine', f: 2637, at: 0.05, d: 0.1, v: 0.02 });
  }, 0.6, 0.0, 12, 0.05, 0.35, 4),

  ember: spec((s) => {
    seq(s, [[79, 0, 0.18], [86, 0.04, 0.18], [91, 0.08, 0.22]], { w: 'triangle', v: 0.065 });
    s.tn({ w: 'sine', f: 1568, f2: 2093, at: 0.05, d: 0.3, v: 0.03 });
    s.nz({ type: 'bandpass', f: 3000, q: 1, d: 0.1, v: 0.04 });
  }, 0.75, 0.03, 8, 0.07, 0.3, 5),

  shard: spec((s) => {
    s.tn({ w: 'sine', f: 2637, d: 0.6, v: 0.07 });
    s.tn({ w: 'sine', f: 3951, at: 0.04, d: 0.55, v: 0.05 });
    s.tn({ w: 'sine', f: 5274, at: 0.08, d: 0.4, v: 0.03 });
    s.tn({ w: 'triangle', f: 1318, d: 0.25, v: 0.05 });
    s.nz({ type: 'highpass', f: 7000, d: 0.15, v: 0.05 });
  }, 0.8, 0.03, 6, 0.1, 0.4, 6),

  // ───────────── meta / camp ─────────────
  levelUp: spec((s) => {
    seq(s, [[72, 0, 0.1], [76, 0.06, 0.1], [79, 0.12, 0.1], [84, 0.18, 0.12]], { w: 'pulse25', v: 0.065, h: 0.05 });
    chord(s, [84, 88, 91], { w: 'triangle', at: 0.24, d: 0.4, v: 0.04 });
    s.note(84, { w: 'pulse25', at: 0.24, d: 0.35, v: 0.035, vib: [6, 12] });
  }, 0.75, 0.0, 8, 0.07, 0, 6),

  milestone: spec((s) => {
    seq(s, [[72, 0, 0.1], [76, 0.05, 0.1], [79, 0.1, 0.1], [84, 0.15, 0.1], [88, 0.2, 0.1], [91, 0.25, 0.1], [96, 0.3, 0.14]], { w: 'pulse25', v: 0.06, h: 0.05 });
    chord(s, [84, 88, 91, 96], { w: 'triangle', at: 0.36, d: 1.0, h: 0.3, v: 0.045 });
    chord(s, [60, 67], { w: 'sawtooth', at: 0.36, d: 1.0, h: 0.3, v: 0.022, lp: 3000 });
    s.tn({ w: 'sine', f: 65, f2: 40, at: 0.36, d: 0.4, v: 0.3 });
    s.nz({ type: 'highpass', f: 7000, at: 0.36, a: 0.1, d: 0.9, v: 0.04 });
    sparkle(s, [100, 103, 108], 0.42, 0.08, 0.03);
  }, 0.85, 0.0, 3, 0.3, 0, 8, [0.55, 1.2]),

  nodeBuy: spec((s) => {
    s.nz({ type: 'lowpass', f: 400, f2: 2400, a: 0.08, d: 0.3, v: 0.12 });
    s.tn({ w: 'sine', f: 300, f2: 900, d: 0.25, v: 0.08 });
    s.tn({ w: 'triangle', f: 1568, at: 0.16, d: 0.45, v: 0.055 });
    s.tn({ w: 'sine', f: 2349, at: 0.2, d: 0.4, v: 0.035 });
    crackle(s, 3, 0.05, 0.25, 0.04);
  }, 0.8, 0.02, 6, 0.1, 0, 6),

  relic: spec((s) => {
    s.tn({ w: 'sine', f: 147, a: 0.15, d: 1.0, v: 0.14 });
    s.tn({ w: 'sine', f: 220, a: 0.15, d: 0.9, v: 0.06 });
    partials(s, 1175, [1, 1.503, 2.245, 2.83], [1.0, 0.8, 0.6, 0.5], [0.065, 0.045, 0.032, 0.022], 0.05);
    s.nz({ type: 'highpass', f: 6000, a: 0.2, d: 0.8, v: 0.03 });
  }, 0.8, 0.02, 4, 0.2, 0, 7),

  recruit: spec((s) => {
    seq(s, [[67, 0, 0.11], [72, 0.12, 0.11], [76, 0.24, 0.11], [79, 0.36, 0.3], [76, 0.68, 0.1], [79, 0.8, 0.1], [84, 0.92, 0.6]], { w: 'pulse25', v: 0.075, h: 0.06, vib: [5.5, 10] });
    seq(s, [[48, 0, 0.3], [43, 0.36, 0.3], [48, 0.92, 0.6]], { w: 'triangle', v: 0.2, h: 0.15 });
    chord(s, [76, 79], { w: 'pulse12', at: 0.92, d: 0.6, h: 0.25, v: 0.035 });
    for (let i = 0; i < 6; i++) s.nz({ type: 'bandpass', f: 1800, at: i * 0.05, d: 0.05, v: 0.025 + i * 0.006 });
    s.nz({ type: 'highpass', f: 5000, at: 0.92, d: 0.9, v: 0.06 });
    s.tn({ w: 'sine', f: 110, f2: 45, at: 0.92, d: 0.3, v: 0.3 });
  }, 0.85, 0.0, 2, 0.5, 0, 10, [0.35, 1.6]),

  rekindle: spec((s) => {
    s.nz({ type: 'bandpass', f: 200, f2: 5000, q: 0.8, a: 1.4, d: 1.6, v: 0.2 });
    s.tn({ w: 'sawtooth', f: 110, f2: 880, a: 0.2, d: 1.6, v: 0.055, lp: 300, lp2: 5000 });
    s.tn({ w: 'sine', f: 220, f2: 1760, a: 0.3, d: 1.6, v: 0.05, vib: [6, 30] });
    crackle(s, 10, 0.2, 1.3, 0.05);
    s.tn({ w: 'sine', f: 110, f2: 35, at: 1.55, d: 0.9, v: 0.55 });
    s.nz({ type: 'lowpass', f: 3000, f2: 200, at: 1.55, d: 0.8, v: 0.3 });
    chord(s, [72, 76, 79, 84, 88], { w: 'pulse25', at: 1.55, a: 0.02, d: 1.3, h: 0.4, v: 0.035, vib: [5, 10] });
    chord(s, [60, 67], { w: 'triangle', at: 1.55, d: 1.3, h: 0.4, v: 0.08 });
    sparkle(s, [96, 100, 103, 108, 112], 1.6, 0.07, 0.03, 0.5);
    s.nz({ type: 'highpass', f: 6000, at: 1.55, a: 0.1, d: 1.1, v: 0.05 });
  }, 0.9, 0.0, 2, 1, 0, 10, [0.2, 3.0]),

  uiClick: spec((s) => {
    s.tn({ w: 'square', f: 1800, d: 0.018, v: 0.05 });
    s.tn({ w: 'triangle', f: 900, f2: 600, d: 0.035, v: 0.09 });
  }, 0.7, 0.03, 20, 0.03, 0, 9),

  uiHover: spec((s) => {
    s.tn({ w: 'sine', f: 2400, d: 0.022, v: 0.022 });
  }, 0.6, 0.04, 12, 0.05, 0, 2),

  uiError: spec((s) => {
    s.tn({ w: 'square', f: 160, d: 0.08, h: 0.05, v: 0.07, lp: 700 });
    s.tn({ w: 'square', f: 150, at: 0.1, d: 0.12, h: 0.06, v: 0.07, lp: 700 });
  }, 0.8, 0.0, 6, 0.12, 0, 9),

  runStart: spec((s) => {
    s.nz({ type: 'lowpass', f: 300, f2: 2500, a: 0.08, d: 0.35, v: 0.13 });
    seq(s, [[67, 0.1, 0.2], [72, 0.18, 0.2], [79, 0.26, 0.24]], { w: 'triangle', v: 0.07 });
    s.note(84, { w: 'pulse25', at: 0.34, d: 0.3, h: 0.08, v: 0.045, vib: [6, 10] });
    crackle(s, 4, 0.05, 0.3, 0.04);
  }, 0.8, 0.0, 2, 0.3, 0, 9),

  // ───────────── enemies & bosses ─────────────
  windup: spec((s) => {
    s.tn({ w: 'pulse25', f: 1046, d: 0.05, h: 0.03, v: 0.085 });
    s.tn({ w: 'pulse25', f: 1397, at: 0.08, d: 0.06, h: 0.03, v: 0.085 });
    s.tn({ w: 'sine', f: 2093, at: 0.08, d: 0.04, v: 0.03 });
  }, 0.8, 0.02, 6, 0.08, 0.06, 8),

  unstoppable: spec((s) => {
    s.tn({ w: 'sine', f: 55, f2: 52, a: 0.05, d: 0.7, v: 0.42, trem: [7, 0.8] });
    s.tn({ w: 'square', f: 110, a: 0.05, d: 0.6, v: 0.045, lp: 420, trem: [7, 0.8] });
    s.tn({ w: 'sine', f: 155.6, a: 0.1, d: 0.6, v: 0.07 });
    s.tn({ w: 'triangle', f: 233, f2: 220, a: 0.1, d: 0.5, v: 0.04 });
    s.nz({ type: 'lowpass', f: 300, a: 0.1, d: 0.6, v: 0.1 });
  }, 0.85, 0.02, 4, 0.15, 0.1, 8),

  windupFlip: spec((s) => {
    s.nz({ type: 'highpass', f: 4000, d: 0.05, v: 0.18 });
    s.tn({ w: 'pulse25', f: 1397, d: 0.06, h: 0.03, v: 0.08 });
    s.tn({ w: 'pulse25', f: 1760, at: 0.06, d: 0.08, h: 0.03, v: 0.08 });
  }, 0.85, 0.0, 4, 0.1, 0, 8),

  nova: spec((s) => {
    s.nz({ type: 'bandpass', f: 400, f2: 3000, q: 0.8, d: 0.5, v: 0.32 });
    s.tn({ w: 'sine', f: 80, f2: 28, d: 0.8, v: 0.55 });
    s.tn({ w: 'sawtooth', f: 240, f2: 60, d: 0.45, v: 0.065, lp: 1200 });
    s.nz({ type: 'lowpass', f: 2000, f2: 200, at: 0.05, d: 0.7, v: 0.28 });
    s.tn({ w: 'square', f: 466, f2: 233, d: 0.3, v: 0.035, lp: 2000 });
  }, 0.9, 0.05, 4, 0.2, 0, 8),

  doom: spec((s) => {
    s.tn({ w: 'sine', f: 466, f2: 233, d: 0.8, v: 0.09 });
    s.tn({ w: 'sine', f: 494, f2: 247, d: 0.8, v: 0.075 });
    s.tn({ w: 'sine', f: 58, a: 0.1, d: 0.8, v: 0.25, trem: [5, 0.8] });
    for (const at of [0.45, 0.6, 0.75]) s.tn({ w: 'square', f: 1760, at, d: 0.02, v: 0.03 });
  }, 0.85, 0.03, 4, 0.2, 0, 7),

  doomBlast: spec((s) => {
    s.tn({ w: 'sine', f: 120, f2: 30, d: 0.5, v: 0.5 });
    s.nz({ type: 'lowpass', f: 1800, f2: 150, d: 0.5, v: 0.32 });
    s.tn({ w: 'sawtooth', f: 233, f2: 58, d: 0.4, v: 0.055, lp: 900 });
    s.tn({ w: 'sine', f: 494, f2: 247, d: 0.4, v: 0.055 });
  }, 0.85, 0.05, 6, 0.1, 0, 6),

  freeze: spec((s) => {
    s.nz({ type: 'bandpass', f: 6000, q: 2, d: 0.25, v: 0.12 });
    for (const at of [0.05, 0.12, 0.2]) s.nz({ type: 'highpass', f: 4000, at, d: 0.02, v: 0.14 });
    s.tn({ w: 'sine', f: 2000, f2: 3600, d: 0.25, v: 0.05 });
    s.tn({ w: 'sine', f: 3100, f2: 4200, at: 0.08, d: 0.3, v: 0.04 });
    s.tn({ w: 'triangle', f: 1568, at: 0.15, d: 0.4, v: 0.04 });
    s.tn({ w: 'sine', f: 180, f2: 90, d: 0.12, v: 0.2 });
  }, 0.85, 0.04, 4, 0.15, 0, 7),

  summon: spec((s) => {
    s.tn({ w: 'sine', f: 200, f2: 640, a: 0.1, d: 0.55, v: 0.09, vib: [11, 80] });
    s.tn({ w: 'triangle', f: 100, f2: 320, a: 0.1, d: 0.55, v: 0.06 });
    s.nz({ type: 'bandpass', f: 300, f2: 2400, q: 3, a: 0.2, d: 0.55, v: 0.14 });
    s.tn({ w: 'sine', f: 640, at: 0.5, d: 0.2, v: 0.05 });
  }, 0.8, 0.05, 4, 0.2, 0, 6),

  wardUp: spec((s) => {
    s.tn({ w: 'sine', f: 880, f2: 1320, a: 0.08, d: 0.4, v: 0.05, vib: [12, 20] });
    s.tn({ w: 'sine', f: 1320, f2: 1980, a: 0.08, d: 0.35, v: 0.03 });
    s.nz({ type: 'highpass', f: 5000, a: 0.1, d: 0.35, v: 0.04 });
  }, 0.7, 0.05, 4, 0.2, 0, 4),

  wardBreak: spec((s) => {
    s.nz({ type: 'highpass', f: 3000, f2: 6000, d: 0.45, v: 0.26 });
    for (let i = 0; i < 7; i++) s.tn({ w: 'sine', f: 2000 + Math.random() * 3000, at: i * 0.03, d: 0.18 + Math.random() * 0.12, v: 0.042 });
    s.tn({ w: 'triangle', f: 1200, f2: 300, d: 0.3, v: 0.07 });
    s.tn({ w: 'sine', f: 210, f2: 45, d: 0.55, v: 0.48 });
    s.nz({ type: 'bandpass', f: 800, f2: 300, q: 1, at: 0.02, d: 0.3, v: 0.14 });
  }, 0.9, 0.04, 6, 0.1, 0.05, 8),

  enemyHeal: spec((s) => {
    seq(s, [[69, 0, 0.2], [72, 0.05, 0.2], [76, 0.1, 0.24]], { w: 'triangle', v: 0.045 });
    s.tn({ w: 'sine', f: 880, f2: 660, at: 0.05, d: 0.3, v: 0.025, vib: [7, 30] });
  }, 0.7, 0.04, 4, 0.15, 0, 4),

  empower: spec((s) => {
    s.tn({ w: 'sawtooth', f: 110, f2: 165, d: 0.4, v: 0.06, lp: 900, vib: [8, 40] });
    s.nz({ type: 'lowpass', f: 600, d: 0.35, v: 0.12 });
    s.tn({ w: 'sine', f: 82, d: 0.35, v: 0.2 });
  }, 0.75, 0.05, 4, 0.2, 0, 4),

  drain: spec((s) => {
    s.tn({ w: 'sine', f: 1200, f2: 150, a: 0.2, d: 0.35, v: 0.06 });
    s.nz({ type: 'bandpass', f: 4000, f2: 400, q: 2, a: 0.25, d: 0.35, v: 0.08 });
  }, 0.75, 0.06, 4, 0.2, 0, 5),

  splash: spec((s) => {
    s.nz({ type: 'bandpass', f: 900, f2: 300, q: 0.8, d: 0.35, v: 0.2 });
    s.tn({ w: 'sine', f: 300, f2: 900, d: 0.12, v: 0.06 });
    s.tn({ w: 'sine', f: 1200, f2: 1800, at: 0.12, d: 0.05, v: 0.03 });
    s.tn({ w: 'sine', f: 1500, f2: 2200, at: 0.2, d: 0.05, v: 0.025 });
  }, 0.8, 0.06, 4, 0.15, 0, 5),

  smallBoom: spec((s) => {
    s.nz({ type: 'lowpass', f: 2500, f2: 200, d: 0.35, v: 0.3 });
    s.tn({ w: 'sine', f: 110, f2: 35, d: 0.3, v: 0.4 });
    s.tn({ w: 'square', f: 200, f2: 50, d: 0.15, v: 0.055, lp: 1000 });
  }, 0.75, 0.1, 8, 0.06, 0.05, 4),

  shockwave: spec((s) => {
    s.nz({ type: 'lowpass', f: 2000, f2: 200, d: 0.4, v: 0.33 });
    s.tn({ w: 'sine', f: 90, f2: 30, d: 0.5, v: 0.5 });
    s.tn({ w: 'square', f: 180, f2: 45, d: 0.2, v: 0.065, lp: 900 });
  }, 0.85, 0.05, 6, 0.1, 0, 6),

  meteorite: spec((s) => {
    s.tn({ w: 'sine', f: 1800, f2: 400, d: 0.5, v: 0.035 });
    s.nz({ type: 'lowpass', f: 300, f2: 1200, a: 0.35, d: 0.5, v: 0.07 });
    s.nz({ type: 'lowpass', f: 2500, f2: 200, at: 0.5, d: 0.25, v: 0.2 });
    s.tn({ w: 'sine', f: 100, f2: 35, at: 0.5, d: 0.25, v: 0.28 });
  }, 0.7, 0.1, 8, 0.08, 0.1, 3),

  stun: spec((s) => {
    s.tn({ w: 'sine', f: 2000, f2: 2400, d: 0.06, v: 0.025 });
    s.tn({ w: 'sine', f: 2400, f2: 2000, at: 0.09, d: 0.06, v: 0.025 });
  }, 0.6, 0.05, 4, 0.15, 0, 2),

  mark: spec((s) => {
    s.tn({ w: 'sine', f: 1320, d: 0.05, v: 0.05 });
    s.tn({ w: 'sine', f: 1760, at: 0.055, d: 0.08, v: 0.05 });
    s.tn({ w: 'square', f: 2640, at: 0.055, d: 0.02, v: 0.015 });
  }, 0.7, 0.02, 3, 0.2, 0, 4),

  pip: spec((s) => {
    s.tn({ w: 'triangle', f: 1046, d: 0.3, v: 0.06 });
    s.tn({ w: 'sine', f: 2093, d: 0.25, v: 0.03 });
    s.nz({ type: 'highpass', f: 6000, d: 0.1, v: 0.03 });
  }, 0.8, 0.0, 6, 0.08, 0.2, 7),

  revive: spec((s) => {
    seq(s, [[72, 0, 0.25], [76, 0.06, 0.25], [79, 0.12, 0.25], [84, 0.18, 0.25], [88, 0.24, 0.3]], { w: 'triangle', v: 0.05 });
    s.tn({ w: 'sine', f: 523, f2: 1046, a: 0.2, d: 0.5, v: 0.05 });
  }, 0.8, 0.02, 4, 0.15, 0.1, 7),

  benediction: spec((s) => {
    s.tn({ w: 'sine', f: 1568, d: 0.6, v: 0.04 });
    s.tn({ w: 'sine', f: 2349, at: 0.05, d: 0.5, v: 0.025 });
    s.tn({ w: 'triangle', f: 784, d: 0.3, v: 0.03 });
  }, 0.65, 0.02, 2, 0.4, 0, 3),

  intercede: spec((s) => {
    s.note(84, { w: 'sine', d: 0.3, v: 0.05 });
    s.note(91, { w: 'sine', at: 0.06, d: 0.3, v: 0.05 });
    s.nz({ type: 'highpass', f: 6000, d: 0.15, v: 0.03 });
  }, 0.8, 0.02, 4, 0.15, 0, 6),

  flare: spec((s) => {
    s.nz({ type: 'lowpass', f: 300, f2: 4000, a: 0.1, d: 0.45, v: 0.2 });
    s.tn({ w: 'sine', f: 220, f2: 660, d: 0.4, v: 0.06 });
    crackle(s, 5, 0.05, 0.35, 0.05);
  }, 0.8, 0.03, 2, 0.3, 0, 7),

  eliteWarn: spec((s) => {
    chord(s, [45, 52], { w: 'sawtooth', a: 0.06, h: 0.25, d: 0.7, v: 0.05, lp: 700 });
    s.tn({ w: 'sine', f: 55, a: 0.04, d: 0.6, v: 0.2 });
  }, 0.8, 0.0, 2, 0.5, 0, 6),

  enemyDeath: spec((s) => {
    s.tn({ w: 'square', f: 620, f2: 110, d: 0.07, v: 0.075, lp: 3000 });
    s.nz({ type: 'bandpass', f: 1200, q: 1, d: 0.06, v: 0.17 });
    s.tn({ w: 'sine', f: 300, f2: 70, d: 0.1, v: 0.24 });
    s.tn({ w: 'triangle', f: 1200, f2: 1800, at: 0.03, d: 0.05, v: 0.03 });
  }, 0.75, 0.1, 10, 0.035, 0.04, 3),

  eliteCrunch: spec((s) => {
    s.nz({ type: 'lowpass', f: 3000, f2: 300, d: 0.25, v: 0.34 });
    s.tn({ w: 'square', f: 200, f2: 50, d: 0.2, v: 0.09, lp: 1500 });
    s.tn({ w: 'sine', f: 100, f2: 35, d: 0.3, v: 0.45 });
    crackle(s, 3, 0.03, 0.15, 0.05);
  }, 0.85, 0.06, 4, 0.1, 0, 6),

  eliteDefeat: spec((s) => {
    s.nz({ type: 'lowpass', f: 3000, f2: 300, d: 0.25, v: 0.32 });
    s.tn({ w: 'square', f: 200, f2: 50, d: 0.2, v: 0.09, lp: 1500 });
    s.tn({ w: 'sine', f: 100, f2: 35, d: 0.3, v: 0.42 });
    seq(s, [[79, 0.15, 0.1], [83, 0.22, 0.1], [86, 0.29, 0.1]], { w: 'pulse25', v: 0.06, h: 0.05 });
    s.note(91, { w: 'pulse25', at: 0.36, d: 0.4, h: 0.1, v: 0.06, vib: [6, 12] });
    s.note(79, { w: 'triangle', at: 0.36, d: 0.4, v: 0.06 });
  }, 0.85, 0.0, 3, 0.2, 0, 8),

  heroDeath: spec((s) => {
    s.tn({ w: 'sine', f: 110, f2: 40, d: 0.3, v: 0.4 });
    s.nz({ type: 'lowpass', f: 1200, f2: 200, d: 0.25, v: 0.2 });
    seq(s, [[76, 0.1, 0.2], [72, 0.28, 0.2]], { w: 'triangle', v: 0.07, h: 0.1 });
    s.tn({ w: 'triangle', f: midiHz(69), f2: midiHz(68), at: 0.46, d: 0.5, h: 0.15, v: 0.07 });
    seq(s, [[88, 0.1, 0.15], [84, 0.28, 0.15], [81, 0.46, 0.35]], { w: 'pulse12', v: 0.025 });
  }, 0.85, 0.02, 4, 0.15, 0.1, 8),

  bossIntro: spec((s) => {
    s.tn({ w: 'sine', f: 70, f2: 30, d: 1.4, v: 0.55 });
    s.nz({ type: 'lowpass', f: 800, f2: 100, d: 1.5, v: 0.3 });
    s.nz({ type: 'highpass', f: 3000, d: 0.08, v: 0.15 });
    partials(s, 110, [1, 1.565, 2.1, 2.81, 3.61], [2.0, 1.6, 1.4, 1.1, 0.9], [0.1, 0.07, 0.05, 0.04, 0.03], 0, 'sine');
    for (const m of [38, 45, 50]) {
      s.note(m, { w: 'sawtooth', a: 0.04, h: 0.5, d: 1.6, v: 0.045, lp: 400, lp2: 1400, det: -8 });
      s.note(m, { w: 'sawtooth', a: 0.04, h: 0.5, d: 1.6, v: 0.04, lp: 400, lp2: 1400, det: 8 });
    }
    s.note(51, { w: 'sawtooth', at: 0.7, a: 0.2, d: 1.1, v: 0.03, lp: 900 });
  }, 0.95, 0.0, 2, 0.5, 0, 10, [0.4, 1.8]),

  bossPhase: spec((s) => {
    s.tn({ w: 'sawtooth', f: 420, f2: 70, d: 0.8, v: 0.075, lp: 1800, vib: [7, 60] });
    s.tn({ w: 'square', f: 210, f2: 50, d: 0.7, v: 0.045, lp: 900 });
    s.tn({ w: 'sine', f: 80, f2: 30, d: 0.8, v: 0.48 });
    s.nz({ type: 'bandpass', f: 900, f2: 200, q: 1, d: 0.9, v: 0.24 });
  }, 0.9, 0.03, 3, 0.3, 0, 9, [0.5, 1.0]),

  bossDefeat: spec((s) => {
    s.tn({ w: 'sine', f: 90, f2: 30, d: 0.8, v: 0.5 });
    s.nz({ type: 'lowpass', f: 3000, f2: 150, d: 1.0, v: 0.38 });
    s.nz({ type: 'highpass', f: 3000, d: 0.12, v: 0.2 });
    seq(s, [[67, 0.25, 0.12], [72, 0.32, 0.12], [76, 0.39, 0.12], [79, 0.46, 0.12]], { w: 'pulse25', v: 0.065, h: 0.06 });
    s.note(84, { w: 'pulse25', at: 0.55, a: 0.01, h: 0.8, d: 1.7, v: 0.06, vib: [5.5, 14] });
    chord(s, [72, 76, 79], { w: 'triangle', at: 0.55, h: 0.8, d: 1.7, v: 0.045 });
    chord(s, [48, 55, 60], { w: 'sawtooth', at: 0.55, h: 0.8, d: 1.7, v: 0.026, lp: 2500, lp2: 900 });
    s.note(36, { w: 'triangle', at: 0.55, h: 0.6, d: 1.6, v: 0.2 });
    s.nz({ type: 'highpass', f: 7000, at: 0.5, a: 0.2, d: 1.4, v: 0.04 });
    sparkle(s, [96, 100, 103, 108], 0.6, 0.12, 0.03, 0.5);
  }, 0.95, 0.0, 2, 0.5, 0, 10, [0.15, 3.0]),

  rout: spec((s) => {
    s.nz({ type: 'bandpass', f: 500, f2: 4500, q: 1, d: 0.3, v: 0.12 });
    seq(s, [[79, 0, 0.09], [84, 0.05, 0.09], [88, 0.1, 0.12]], { w: 'pulse25', v: 0.055, h: 0.04 });
    s.tn({ w: 'sine', f: 2637, at: 0.15, d: 0.2, v: 0.03 });
  }, 0.8, 0.0, 4, 0.2, 0, 7),

  overdrive: spec((s) => {
    s.tn({ w: 'sawtooth', f: 110, f2: 880, d: 0.7, v: 0.065, lp: 400, lp2: 6000 });
    s.tn({ w: 'square', f: 55, f2: 440, d: 0.7, v: 0.045, lp: 2000 });
    s.nz({ type: 'bandpass', f: 200, f2: 6000, q: 1, a: 0.5, d: 0.75, v: 0.12 });
    chord(s, [69, 76, 81], { w: 'pulse25', at: 0.7, d: 0.35, h: 0.1, v: 0.055 });
    s.tn({ w: 'sine', f: 110, f2: 40, at: 0.7, d: 0.4, v: 0.4 });
    s.nz({ type: 'highpass', f: 4000, at: 0.7, d: 0.2, v: 0.1 });
  }, 0.9, 0.0, 2, 0.5, 0, 9),

  overdriveEnd: spec((s) => {
    s.tn({ w: 'sawtooth', f: 660, f2: 110, d: 0.4, v: 0.045, lp: 2000 });
    s.nz({ type: 'lowpass', f: 3000, f2: 200, d: 0.3, v: 0.06 });
  }, 0.7, 0.0, 2, 0.5, 0, 5),

  emberNova: spec((s) => {
    s.nz({ type: 'bandpass', f: 300, f2: 5000, q: 1, a: 0.25, d: 0.3, v: 0.15 });
    s.tn({ w: 'sine', f: 100, f2: 28, at: 0.25, d: 1.0, v: 0.6 });
    s.nz({ type: 'lowpass', f: 5000, f2: 150, at: 0.25, d: 1.2, v: 0.42 });
    s.nz({ type: 'highpass', f: 3000, at: 0.25, d: 0.15, v: 0.24 });
    for (const m of [69, 73, 76, 81, 85]) s.note(m, { w: 'triangle', at: 0.3, a: 0.05, h: 0.4, d: 1.2, v: 0.04, det: m % 2 ? 6 : -6 });
    chord(s, [57, 64], { w: 'sawtooth', at: 0.3, h: 0.4, d: 1.2, v: 0.028, lp: 2500 });
    sparkle(s, [93, 97, 100, 105], 0.35, 0.09, 0.035);
    crackle(s, 8, 0.3, 0.9, 0.05);
  }, 0.95, 0.0, 2, 0.5, 0, 10, [0.5, 1.4]),

  vow: spec((s) => {
    partials(s, 220, [1, 2.012, 2.985, 4.25, 6.18], [1.4, 1.1, 0.9, 0.7, 0.5], [0.12, 0.07, 0.05, 0.035, 0.025], 0, 'sine');
    s.tn({ w: 'sine', f: 110, a: 0.1, d: 1.2, v: 0.12 });
    s.nz({ type: 'highpass', f: 6000, d: 0.2, v: 0.04 });
  }, 0.85, 0.0, 2, 0.3, 0, 8),

  descent: spec((s) => {
    s.nz({ type: 'lowpass', f: 3000, f2: 200, d: 1.2, v: 0.17 });
    s.tn({ w: 'sine', f: 880, f2: 110, d: 1.0, v: 0.045 });
    s.tn({ w: 'triangle', f: 55, a: 0.2, h: 0.4, d: 1.4, v: 0.24 });
    seq(s, [[81, 0.2, 0.5], [76, 0.34, 0.5], [72, 0.48, 0.5], [69, 0.62, 0.8]], { w: 'triangle', v: 0.06 });
    seq(s, [[93, 0.2, 0.4], [88, 0.34, 0.4], [84, 0.48, 0.4], [81, 0.62, 0.6]], { w: 'sine', v: 0.02 });
  }, 0.85, 0.0, 2, 0.5, 0, 9, [0.5, 1.4]),

  lastLight: spec((s) => {
    s.tn({ w: 'sine', f: 70, f2: 40, d: 0.14, v: 0.5 });
    s.tn({ w: 'sine', f: 66, f2: 38, at: 0.22, d: 0.14, v: 0.4 });
    s.tn({ w: 'sine', f: 440, f2: 1760, at: 0.3, a: 0.6, d: 1.0, v: 0.055 });
    s.nz({ type: 'highpass', f: 4000, at: 0.3, a: 0.7, d: 1.0, v: 0.06 });
    chord(s, [74, 78, 81, 86], { w: 'pulse25', at: 0.9, d: 0.6, h: 0.15, v: 0.04, vib: [6, 10] });
    s.tn({ w: 'sine', f: 2349, at: 0.95, d: 0.5, v: 0.03 });
  }, 0.9, 0.0, 2, 0.5, 0, 10, [0.5, 1.4]),

  lanternLow: spec((s) => {
    seq(s, [[81, 0, 0.14], [76, 0.18, 0.14], [81, 0.36, 0.14], [76, 0.54, 0.24]], { w: 'triangle', v: 0.075, h: 0.06 });
    seq(s, [[93, 0, 0.08], [88, 0.18, 0.08], [93, 0.36, 0.08], [88, 0.54, 0.12]], { w: 'pulse12', v: 0.02 });
    crackle(s, 3, 0.1, 0.6, 0.04);
  }, 0.85, 0.0, 2, 0.5, 0, 8),

  victory: spec((s) => {
    seq(s, [[67, 0, 0.1], [72, 0.12, 0.1], [76, 0.24, 0.1], [74, 0.36, 0.22], [79, 0.6, 0.22]], { w: 'pulse25', v: 0.07, h: 0.06 });
    s.note(84, { w: 'pulse25', at: 0.84, h: 0.5, d: 1.3, v: 0.07, vib: [5.5, 14] });
    chord(s, [76, 79], { w: 'pulse12', at: 0.84, h: 0.5, d: 1.2, v: 0.03 });
    chord(s, [72, 76, 79], { w: 'triangle', at: 0.84, h: 0.5, d: 1.2, v: 0.035 });
    seq(s, [[48, 0, 0.3], [43, 0.36, 0.44]], { w: 'triangle', v: 0.18, h: 0.12 });
    s.note(36, { w: 'triangle', at: 0.84, h: 0.5, d: 1.2, v: 0.2 });
    for (const at of [0.36, 0.6]) s.nz({ type: 'bandpass', f: 1800, at, d: 0.12, v: 0.08 });
    s.tn({ w: 'sine', f: 120, f2: 45, at: 0.84, d: 0.25, v: 0.3 });
    s.nz({ type: 'highpass', f: 5000, at: 0.84, d: 1.0, v: 0.06 });
  }, 0.9, 0.0, 2, 0.5, 0, 10, [0.3, 2.4]),

  defeat: spec((s) => {
    seq(s, [[76, 0, 0.3], [74, 0.32, 0.3], [72, 0.64, 0.3], [71, 0.96, 0.4]], { w: 'triangle', v: 0.07, h: 0.12 });
    seq(s, [[76, 0, 0.26], [74, 0.32, 0.26], [72, 0.64, 0.26], [71, 0.96, 0.36]], { w: 'pulse12', v: 0.025, det: 8 });
    s.note(69, { w: 'triangle', at: 1.4, h: 0.3, d: 1.0, v: 0.07, vib: [4.5, 12] });
    chord(s, [57, 60, 64], { w: 'sawtooth', at: 1.4, a: 0.1, h: 0.3, d: 1.0, v: 0.022, lp: 900 });
    s.note(45, { w: 'triangle', at: 1.4, h: 0.3, d: 1.0, v: 0.15 });
  }, 0.85, 0.0, 2, 0.5, 0, 10, [0.3, 2.4]),

  lanternOut: spec((s) => {
    s.nz({ type: 'lowpass', f: 2000, f2: 150, d: 0.6, v: 0.12 });
    seq(s, [[79, 0, 0.3], [74, 0.16, 0.3], [71, 0.32, 0.3], [67, 0.48, 0.6]], { w: 'triangle', v: 0.055, h: 0.08 });
    s.tn({ w: 'sine', f: 55, at: 0.64, a: 0.05, d: 0.8, v: 0.15 });
    crackle(s, 3, 0.0, 0.4, 0.035);
  }, 0.85, 0.0, 2, 0.5, 0, 10, [0.4, 1.8]),

  retreat: spec((s) => {
    seq(s, [[72, 0, 0.2], [67, 0.14, 0.3]], { w: 'triangle', v: 0.06, h: 0.06 });
    s.nz({ type: 'lowpass', f: 1500, f2: 300, d: 0.3, v: 0.06 });
  }, 0.85, 0.0, 2, 0.5, 0, 9),
};
