// Tiny score format for the procedural chiptune tracks + its compiler (pure data, no Web Audio).
//
// A track is a loop of N bars over a chord progression in a key/mode:
//   * chords: one token per bar ("1", "6", "5M", "b7M", or "4 5" to split a bar), scale-degree based.
//   * melodic parts (`notes`): scale-degree tokens "deg[',][:len]" ("5:4" = 5th degree, 4 steps),
//     "#7," = raised 7th one octave down, "-:2" = rest, "~:2" = tie, "|" = bar line (auto-aligns).
//     Degrees above 7 continue upwards (8 = tonic an octave up). A line shorter than the loop repeats.
//   * chord parts (`pattern`): one char per step, relative to the current chord:
//     1 3 5 7 = chord tones, 8 a b c = root/3rd/5th/root an octave (two) up, l m = root/5th an octave
//     down, C = strummed triad, D = triad an octave up, '-' = tie, '.' = rest.
//   * pad parts sustain the chord triad for each chord.
//   * drums: per-lane strings ('x' hit, 'X' accent, 'g' ghost, '.' rest), cycled over the loop.
import type { Wave } from './synth.ts';

export type ModeName = 'ionian' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian' | 'harmonic';

export const MODES: Record<ModeName, readonly number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};

export interface InstDef {
  wave: Wave;
  vol: number;
  a: number; // attack (s)
  d: number; // decay (s)
  s: number; // sustain level (0..1)
  r: number; // release (s)
  cutoff?: number; // lowpass (Hz)
  q?: number;
  fenv?: number; // filter envelope: cutoff starts at cutoff*fenv and falls to cutoff over `d`
  detune?: number; // second oscillator detuned by ± cents (chorus)
  sub?: number; // sine one octave below (relative volume)
  bell?: number; // inharmonic sine partial (relative volume) — bells / music box
  bellRatio?: number;
  vib?: number; // vibrato depth (cents)
  vibRate?: number;
  vibDelay?: number;
}

export const INSTRUMENTS = {
  lead: { wave: 'pulse25', vol: 0.12, a: 0.006, d: 0.15, s: 0.65, r: 0.12, vib: 14, vibRate: 5.2, vibDelay: 0.18, cutoff: 4200 },
  leadSq: { wave: 'square', vol: 0.085, a: 0.004, d: 0.12, s: 0.7, r: 0.1, vib: 12, vibRate: 6, vibDelay: 0.12, cutoff: 3200 },
  leadSoft: { wave: 'pulse12', vol: 0.1, a: 0.03, d: 0.25, s: 0.7, r: 0.25, vib: 16, vibRate: 4.6, vibDelay: 0.25, cutoff: 3000 },
  flute: { wave: 'triangle', vol: 0.22, a: 0.04, d: 0.2, s: 0.75, r: 0.18, vib: 18, vibRate: 4.8, vibDelay: 0.2 },
  bell: { wave: 'sine', vol: 0.17, a: 0.002, d: 0.9, s: 0, r: 0.5, bell: 0.3, bellRatio: 3.01 },
  musicBox: { wave: 'triangle', vol: 0.16, a: 0.002, d: 0.7, s: 0, r: 0.4, bell: 0.22, bellRatio: 4.0 },
  pluck: { wave: 'pulse25', vol: 0.08, a: 0.002, d: 0.2, s: 0, r: 0.08, cutoff: 2400, fenv: 2.2 },
  arp: { wave: 'pulse12', vol: 0.055, a: 0.002, d: 0.12, s: 0.25, r: 0.06, cutoff: 3200 },
  arpSoft: { wave: 'triangle', vol: 0.09, a: 0.004, d: 0.16, s: 0.2, r: 0.1 },
  glass: { wave: 'sine', vol: 0.08, a: 0.002, d: 0.35, s: 0, r: 0.25, bell: 0.4, bellRatio: 2.76 },
  bassTri: { wave: 'triangle', vol: 0.28, a: 0.004, d: 0.2, s: 0.75, r: 0.06 },
  bassSaw: { wave: 'sawtooth', vol: 0.1, a: 0.004, d: 0.15, s: 0.6, r: 0.06, cutoff: 650, fenv: 3, q: 3 },
  bassSq: { wave: 'square', vol: 0.075, a: 0.003, d: 0.12, s: 0.6, r: 0.05, cutoff: 900, sub: 0.7 },
  bassPulse: { wave: 'pulse25', vol: 0.08, a: 0.003, d: 0.1, s: 0.7, r: 0.05, cutoff: 1400, sub: 0.6 },
  pad: { wave: 'triangle', vol: 0.06, a: 0.35, d: 0.5, s: 0.8, r: 0.6, detune: 9 },
  padSaw: { wave: 'sawtooth', vol: 0.03, a: 0.4, d: 0.6, s: 0.8, r: 0.8, cutoff: 1100, detune: 12 },
  brass: { wave: 'sawtooth', vol: 0.05, a: 0.03, d: 0.2, s: 0.7, r: 0.15, cutoff: 2000, fenv: 1.8, detune: 6 },
} satisfies Record<string, InstDef>;

export type InstName = keyof typeof INSTRUMENTS;

export interface PartDef {
  inst: InstName | InstDef;
  oct: number; // octave of the tonic for degree 1 / chord root (4 → tonic in the 4th octave)
  vol?: number;
  pan?: number;
  echo?: number; // send to the track's echo (0..1)
  notes?: string;
  /** Harmony for `notes`: a diatonic shift (7 = octave up), or 'below' = nearest chord tone a 3rd–6th under the melody. */
  harmony?: number | 'below';
  pattern?: string | string[]; // chord-relative per bar (array = alternate per bar)
  pad?: boolean;
  /** Bars where this part is silent (e.g. [0, 1] for an intro). */
  mute?: number[];
}

export type DrumName = 'kick' | 'snare' | 'hat' | 'open' | 'crash' | 'tom' | 'clap' | 'shaker' | 'perc';
export type PercSound = 'drop' | 'chime' | 'tick' | 'bongo';
export type DrumLanes = Partial<Record<DrumName, string>>;

export interface DrumDef extends DrumLanes {
  vol?: number;
  percSound?: PercSound;
  fill?: DrumLanes;
  fillEvery?: number; // bars
  /** Bars without drums. */
  mute?: number[];
}

export interface TrackDef {
  bpm: number;
  key: number; // pitch class of the tonic, 0 = C
  mode: ModeName;
  beats: number; // beats per bar
  div: number; // steps per beat
  swing?: number; // delay of off-beat steps (fraction of a step)
  chords: string[];
  parts: PartDef[];
  drums?: DrumDef;
  gain: number;
  echoSteps?: number; // echo delay in steps (default 3)
  echoFeedback?: number;
}

export interface NoteEv {
  part: number;
  midi: number;
  len: number; // steps
  vel: number;
}

export interface DrumEv {
  drum: DrumName;
  vel: number;
}

export interface CompiledTrack {
  def: TrackDef;
  stepsPerBar: number;
  bars: number;
  totalSteps: number;
  stepDur: number;
  insts: InstDef[]; // per part
  notes: NoteEv[][]; // by step
  drums: DrumEv[][]; // by step
  warnings: string[];
}

interface Chord {
  root: number; // semitones from the tonic, wrapped to -5..6
  tones: number[]; // [0, 3rd, 5th, 7th] semitones from the chord root
}

const QUALITY: Record<string, number[]> = {
  M: [0, 4, 7, 10],
  m: [0, 3, 7, 10],
  d: [0, 3, 6, 9],
  s: [0, 5, 7, 10],
  '+': [0, 4, 8, 10],
};

function parseChord(tok: string, mode: readonly number[], warn: string[]): Chord {
  const m = /^([#b]?)([1-7])([Mmds+]?)$/.exec(tok);
  if (!m) {
    warn.push(`bad chord "${tok}"`);
    return { root: 0, tones: [0, 4, 7, 11] };
  }
  const acc = m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0;
  const idx = Number(m[2]) - 1;
  let root = mode[idx] + acc;
  let tones: number[];
  if (m[3]) {
    tones = QUALITY[m[3]];
  } else if (acc !== 0) {
    tones = QUALITY.M;
  } else {
    tones = [0, 2, 4, 6].map((k) => mode[(idx + k) % 7] + 12 * Math.floor((idx + k) / 7) - mode[idx]);
  }
  if (root > 6) root -= 12;
  return { root, tones };
}

function degreeSemi(mode: readonly number[], deg: number): number {
  const n = deg - 1;
  const o = Math.floor(n / 7);
  const i = ((n % 7) + 7) % 7;
  return mode[i] + 12 * o;
}

const NOTE_RE = /^([#b]?)(-?\d+)([',]*)(?::(\d+))?$/;
const REST_RE = /^-(?::(\d+))?$/;
const TIE_RE = /^~(?::(\d+))?$/;

interface RawNote {
  at: number;
  len: number;
  semi: number;
}

/** Parse a scale-degree melody into notes (steps relative to the start of the line). */
function parseNotes(src: string, mode: readonly number[], spb: number, harmony: number, warn: string[]): { notes: RawNote[]; length: number } {
  const notes: RawNote[] = [];
  let cur = 0;
  let barStart = 0;
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') {
      const expect = barStart + spb;
      if (cur !== expect) warn.push(`bar at step ${barStart} has ${cur - barStart}/${spb} steps`);
      if (cur > expect) {
        const last = notes[notes.length - 1];
        if (last && last.at + last.len > expect) last.len = Math.max(1, expect - last.at);
      }
      cur = expect;
      barStart = expect;
      continue;
    }
    let m = REST_RE.exec(tok);
    if (m) {
      cur += Number(m[1] ?? 1);
      continue;
    }
    m = TIE_RE.exec(tok);
    if (m) {
      const n = Number(m[1] ?? 1);
      const last = notes[notes.length - 1];
      if (last) last.len += n;
      cur += n;
      continue;
    }
    m = NOTE_RE.exec(tok);
    if (!m) {
      warn.push(`bad note "${tok}"`);
      continue;
    }
    // accidentals belong to the melody's harmonic context; a diatonic harmony line drops them
    const acc = harmony !== 0 ? 0 : m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0;
    const deg = Number(m[2]) + harmony;
    const marks = m[3] ?? '';
    let oct = 0;
    for (const c of marks) oct += c === "'" ? 1 : -1;
    const len = Number(m[4] ?? 1);
    notes.push({ at: cur, len, semi: degreeSemi(mode, deg) + acc + 12 * oct });
    cur += len;
  }
  const length = Math.max(spb, Math.ceil(cur / spb) * spb);
  return { notes, length };
}

const PATTERN_TONE: Record<string, (c: Chord) => number[]> = {
  '1': (c) => [c.tones[0]],
  '3': (c) => [c.tones[1]],
  '5': (c) => [c.tones[2]],
  '7': (c) => [c.tones[3]],
  '8': (c) => [c.tones[0] + 12],
  a: (c) => [c.tones[1] + 12],
  b: (c) => [c.tones[2] + 12],
  c: (c) => [c.tones[0] + 24],
  l: (c) => [c.tones[0] - 12],
  m: (c) => [c.tones[2] - 12],
  C: (c) => [c.tones[0], c.tones[1], c.tones[2]],
  D: (c) => [c.tones[0] + 12, c.tones[1] + 12, c.tones[2] + 12],
};

/** Highest chord-triad tone at least a minor third below `midi` (auto-harmoniser). */
function chordToneBelow(midi: number, key: number, c: Chord): number {
  const pcs = c.tones.slice(0, 3).map((t) => (((key + c.root + t) % 12) + 12) % 12);
  for (let m = midi - 3; m > midi - 12; m--) {
    if (pcs.includes(((m % 12) + 12) % 12)) return m;
  }
  return midi - 12;
}

function resolveInst(i: InstName | InstDef): InstDef {
  return typeof i === 'string' ? INSTRUMENTS[i] : i;
}

const DRUM_VEL: Record<string, number> = { x: 0.8, X: 1, g: 0.4 };
const DRUM_LANES: DrumName[] = ['kick', 'snare', 'hat', 'open', 'crash', 'tom', 'clap', 'shaker', 'perc'];

export function compileTrack(def: TrackDef): CompiledTrack {
  const warnings: string[] = [];
  const mode = MODES[def.mode];
  const spb = def.beats * def.div;
  const bars = def.chords.length;
  const total = bars * spb;
  const stepDur = 60 / def.bpm / def.div;
  const notes: NoteEv[][] = Array.from({ length: total }, () => []);
  const drums: DrumEv[][] = Array.from({ length: total }, () => []);

  // chord map
  const chordAt: Chord[] = new Array(total);
  const chordStarts: { at: number; len: number; chord: Chord }[] = [];
  def.chords.forEach((bar, b) => {
    const toks = bar.trim().split(/\s+/);
    const span = spb / toks.length;
    toks.forEach((t, i) => {
      const c = parseChord(t, mode, warnings);
      const at = b * spb + Math.round(i * span);
      const end = b * spb + Math.round((i + 1) * span);
      chordStarts.push({ at, len: end - at, chord: c });
      for (let s = at; s < end; s++) chordAt[s] = c;
    });
  });

  const insts = def.parts.map((p) => resolveInst(p.inst));
  def.parts.forEach((p, pi) => {
    const base = def.key + 12 * (p.oct + 1);
    const muted = (step: number) => !!p.mute?.includes(Math.floor(step / spb));
    if (p.notes) {
      const shift = typeof p.harmony === 'number' ? p.harmony : 0;
      const { notes: raw, length } = parseNotes(p.notes, mode, spb, shift, warnings);
      for (let off = 0; off < total; off += length) {
        for (const n of raw) {
          const at = off + n.at;
          if (at >= total || muted(at)) continue;
          let midi = base + n.semi;
          if (p.harmony === 'below') midi = chordToneBelow(midi, def.key, chordAt[at]);
          notes[at].push({ part: pi, midi, len: n.len, vel: 1 });
        }
      }
    }
    if (p.pattern) {
      const pats = Array.isArray(p.pattern) ? p.pattern : [p.pattern];
      for (let b = 0; b < bars; b++) {
        const pat = pats[b % pats.length];
        for (let i = 0; i < spb; i++) {
          const ch = pat[i % pat.length];
          const fn = PATTERN_TONE[ch];
          const step = b * spb + i;
          if (!fn || muted(step)) continue;
          let len = 1;
          while (i + len < spb && pat[(i + len) % pat.length] === '-') len++;
          const c = chordAt[step];
          const vel = i % def.div === 0 ? 1 : 0.82;
          for (const t of fn(c)) notes[step].push({ part: pi, midi: base + c.root + t, len, vel });
        }
      }
    }
    if (p.pad) {
      for (const cs of chordStarts) {
        if (muted(cs.at)) continue;
        for (const t of cs.chord.tones.slice(0, 3)) notes[cs.at].push({ part: pi, midi: base + cs.chord.root + t, len: cs.len, vel: 1 });
      }
    }
  });

  const d = def.drums;
  if (d) {
    for (let step = 0; step < total; step++) {
      const bar = Math.floor(step / spb);
      if (d.mute?.includes(bar)) continue;
      const inBar = step % spb;
      const isFill = !!d.fill && !!d.fillEvery && (bar + 1) % d.fillEvery === 0;
      for (const lane of DRUM_LANES) {
        const fillLane = isFill ? d.fill?.[lane] : undefined;
        const pat = fillLane ?? d[lane];
        if (!pat) continue;
        const ch = fillLane ? pat[inBar % pat.length] : pat[step % pat.length];
        const vel = DRUM_VEL[ch];
        if (vel) drums[step].push({ drum: lane, vel });
      }
    }
  }

  return { def, stepsPerBar: spb, bars, totalSteps: total, stepDur, insts, notes, drums, warnings };
}
