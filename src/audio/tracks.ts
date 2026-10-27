// Original procedural chiptune scores for every MusicTrack. Notation: see score.ts.
// Each track has its own key / mode / tempo / instrumentation:
//   title      D major 3/4 — gentle music-box lantern waltz
//   camp       G major shuffle — cozy campfire folk
//   ashwood    A minor (harmonic V) — warm minor folk with a fiddle-like lead
//   ruins      D dorian — watery, echoing, rippling arpeggios
//   glimmer    E lydian — sparkling crystal bells
//   rimeholt   B minor, slow — cold wind lead, ice-drop bells
//   hollow     E phrygian — ominous ostinato, dark brass
//   heart      D major / mixolydian — heroic finale with harmonised lead
//   boss       G minor 150 bpm — driving octave bass
//   finalBoss  C phrygian-dominant 168 bpm — intense
//   ending     F major with a borrowed iv — bittersweet, triumphant
import type { MusicTrack } from './api.ts';
import type { TrackDef } from './score.ts';

export type TrackName = Exclude<MusicTrack, null>;

const bars = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const TITLE_MELODY = `
  5:4 3:2 5:2 8:4 | 6:6 5:2 3:4 | 4:4 6:4 8:4 | 7:6 6:2 5:4 |
  3:4 5:2 8:2 10:4 | 7:6 6:2 5:4 | 6:4 8:4 6:2 5:2 | 5:8 -:4 |
  8:4 9:2 8:2 6:4 | 5:6 3:2 5:4 | 6:4 5:4 4:4 | 3:12 |
  2:4 4:4 6:4 | 5:6 7:2 9:4 | 8:12 | -:4 5,:4 7,:4 |`;

const CAMP_MELODY = `
  5:3 6:1 5:2 3:2 1:4 3:4 | 4:2 3:2 4:2 6:2 8:6 6:2 | 5:6 3:2 2:4 1:4 | 2:8 -:4 5,:2 7,:2 |
  3:3 5:1 6:4 5:2 3:2 6,:4 | 4:4 3:2 4:2 6:8 | 2:3 3:1 4:4 6:4 4:4 | 5:6 4:2 3:4 2:4 |
  8:4 6:2 5:2 4:4 3:4 | 2:4 4:2 6:2 5:8 | 3:3 2:1 3:4 5:4 7:4 | 6:12 -:4 |
  4:2 6:2 8:4 6:2 8:2 10:4 | 9:6 8:2 7:4 5:4 | 8:4 5:4 3:4 2:2 3:2 | 2:8 -:4 5,:2 7,:2 |`;

const ASHWOOD_MELODY = `
  1:2 3:2 5:4 3:2 5:2 8:4 | 8:3 6:1 5:4 3:4 1:4 | 7:4 5:2 7:2 9:4 7:4 | 8:12 -:4 |
  8:2 10:2 9:2 8:2 5:4 3:4 | 4:3 5:1 6:4 4:4 2:4 | #7,:4 2:4 5:4 #7:4 | 5:8 4:2 3:2 2:4 |
  1:4 3:4 6:6 5:2 | 4:4 7:4 9:6 8:2 | 10:8 9:4 8:4 | 8:4 5:4 3:8 |
  4:2 5:2 6:2 8:2 11:4 10:4 | 9:6 #7:2 5:8 | 8:4 5:2 3:2 1:8 | #7,:4 2:4 5:4 -:4 |`;

const RUINS_MELODY = `
  5:6 8:2 7:4 5:4 | 6:8 4:4 2:4 | 3:4 5:4 8:4 10:4 | 11:12 9:4 |
  10:6 8:2 12:8 | 11:4 10:4 9:4 7:4 | 6:8 7:4 5:4 | 4:8 -:8 |
  8:4 9:2 10:2 12:8 | 13:6 12:2 11:8 | 9:4 11:4 12:4 11:4 | 12:12 -:4 |
  10:6 8:2 5:8 | 7:4 9:4 11:8 | 13:8 12:4 11:4 | 12:8 -:4 7:2 6:2 |`;

const GLIMMER_MELODY = `
  5:2 8:2 7:2 5:2 3:4 5:4 | 4:6 2:2 6:8 | 3:2 5:2 8:2 10:2 9:4 8:4 | 9:12 -:4 |
  6:4 8:4 10:4 8:4 | 7:6 5:2 3:8 | 4:4 6:4 9:4 11:4 | 9:8 -:8 |
  8:2 7:2 8:2 10:2 12:4 10:4 | 11:6 9:2 6:8 | 8:4 6:4 5:4 3:4 | 5:12 -:4 |
  7:4 4:4 2:4 4:4 | 6:6 5:2 3:8 | 2:4 4:4 6:4 9:4 | 7:8 5:8 |`;

const RIMEHOLT_MELODY = `
  5:8 3:4 4:4 | 3:12 2:4 | 1:4 3:4 5:8 | 4:16 |
  8:8 7:4 5:4 | 6:12 4:4 | 5:8 3:4 2:4 | 2:8 #7,:8 |
  3:4 6:4 8:8 | 10:8 8:4 7:4 | 9:12 7:4 | 8:16 |
  6:4 8:4 11:8 | 10:8 8:4 6:4 | #7:8 9:8 | 5:16 |`;

const HOLLOW_MELODY = `
  1:6 2:2 1:8 | 3:4 2:4 6,:8 | 5:6 6:2 5:4 3:4 | 2:16 |
  6:6 5:2 3:4 6:4 | 7:8 6:4 4:4 | 6:4 5:4 2:8 | 5:8 2:8 |
  8:6 9:2 8:8 | 10:4 9:4 6:8 | 8:4 6:4 4:8 | 6:4 5:4 2:8 |
  3:4 6:4 8:8 | 7:6 6:2 5:8 | 6:8 9:8 | 8:12 -:4 |`;

const HEART_MELODY = `
  5:4 8:4 9:2 10:2 12:4 | 12:6 11:2 9:8 | 10:4 9:2 8:2 6:4 10:4 | 8:8 6:4 5:4 |
  5:2 5:2 8:4 10:4 12:4 | 14:6 12:2 9:8 | 11:4 13:4 15:4 13:4 | 12:12 -:4 |
  13:4 12:2 10:2 13:8 | 15:4 13:2 11:2 15:8 | 12:4 10:4 15:4 12:4 | 14:8 12:4 9:4 |
  11:6 10:2 9:4 8:4 | b7:4 9:4 11:8 | 13:6 12:2 11:4 13:4 | 12:4 14:4 12:4 9:4 |`;

const BOSS_MELODY = `
  1:2 1:2 5:2 1:2 6:3 5:3 4:2 | 3:4 5:4 6:6 5:2 | 4:2 4:2 8:2 4:2 7:3 6:3 5:2 | #7,:4 2:4 4:4 #7:4 |
  8:6 7:2 6:4 5:4 | 6:6 5:2 3:8 | 4:4 7:4 9:4 7:4 | 5:4 #7:4 9:8 |
  8:2 10:2 8:2 5:2 8:4 12:4 | 11:6 10:2 8:4 6:4 | 10:4 9:4 8:4 6:4 | 5:6 3:2 5:8 |
  6:2 6:2 10:4 9:4 8:4 | 7:4 6:4 4:8 | #7:4 9:4 12:4 9:4 | 12:8 #7:4 2:4 |`;

const FINAL_MELODY = `
  1:1 1:1 3:2 5:2 8:2 7:2 5:2 6:2 5:2 | 6:3 5:3 4:2 2:4 1:4 | 3:2 5:2 8:4 10:4 8:4 | #7,:4 2:4 4:4 #7:4 |
  8:4 6:4 3:4 6:4 | 9:6 8:2 6:8 | 5:2 #7,:2 2:2 4:2 5:2 #7:2 9:4 | #7:8 5:8 |
  8:2 8:2 7:2 8:2 10:4 12:4 | 11:6 10:2 8:4 6:4 | 9:4 8:4 6:4 4:4 | #7:6 9:2 #7:4 5:4 |
  6:2 8:2 10:4 8:2 6:2 3:4 | 5:4 7:4 10:8 | 9:4 8:2 6:2 4:4 2:4 | #7,:4 2:4 5:4 #7:4 |`;

const ENDING_MELODY = `
  5:4 8:6 7:2 8:4 | 9:6 8:2 7:4 5:4 | 6:4 8:4 10:6 9:2 | 8:12 -:4 |
  10:4 9:2 8:2 10:4 12:4 | 12:6 11:2 10:4 9:4 | 8:4 6:4 11:8 | b6:8 5:8 |
  6:4 8:4 10:4 8:4 | 7:6 5:2 3:8 | 4:4 6:4 8:4 11:4 | 10:12 -:4 |
  9:4 11:4 13:4 11:4 | 12:8 10:4 9:4 | 8:4 6:4 4:4 6:4 | 5:12 -:4 |`;

export const TRACKS: Record<TrackName, TrackDef> = {
  title: {
    bpm: 80, key: 2, mode: 'ionian', beats: 3, div: 4, gain: 0.95, echoSteps: 3, echoFeedback: 0.35,
    chords: ['1', '6', '4', '5', '1', '3', '4', '5', '6', '3', '4', '1', '2', '5', '1', '5'],
    parts: [
      { inst: 'musicBox', oct: 5, notes: TITLE_MELODY, echo: 0.4, vol: 0.9 },
      { inst: 'flute', oct: 4, notes: TITLE_MELODY, vol: 0.45, mute: bars(0, 7) },
      { inst: 'arpSoft', oct: 4, pattern: '1.5.8.a.8.5.', vol: 0.6, pan: -0.25, echo: 0.2 },
      { inst: 'bassTri', oct: 3, pattern: '1-----5-----', vol: 0.55 },
      { inst: 'pad', oct: 4, pad: true, vol: 0.55, pan: 0.2 },
    ],
    drums: { shaker: '....g...g...', vol: 0.5, mute: bars(0, 7) },
  },

  camp: {
    bpm: 92, key: 7, mode: 'ionian', beats: 4, div: 4, swing: 0.55, gain: 0.95,
    chords: ['1', '4', '1', '5', '6', '4', '2', '5', '4', '5', '3', '6', '4', '5', '1', '5'],
    parts: [
      { inst: 'flute', oct: 4, notes: CAMP_MELODY, vol: 0.9, echo: 0.15 },
      { inst: 'pluck', oct: 4, pattern: ['..C...C...C...C.', '..C...C...C.C.C.'], vol: 0.9, pan: 0.3 },
      { inst: 'arpSoft', oct: 5, pattern: '1...5...3...5...', vol: 0.45, pan: -0.35, echo: 0.3, mute: bars(0, 7) },
      { inst: 'bassTri', oct: 2, pattern: ['1...5...1...5...', '1...5...8...5.3.'], vol: 0.8 },
      { inst: 'pad', oct: 4, pad: true, vol: 0.35, pan: -0.3 },
    ],
    drums: { kick: 'g.......g.......', clap: '....g.......g...', shaker: '..g...g...g...g.', perc: '.'.repeat(128) + '......x.......x.'.repeat(8), percSound: 'bongo', vol: 0.7 },
  },

  ashwood: {
    bpm: 112, key: 9, mode: 'aeolian', beats: 4, div: 4, gain: 0.9,
    chords: ['1', '6', '7', '1', '1', '4', '5M', '5M', '6', '7', '3', '6', '4', '5M', '1', '5M'],
    parts: [
      { inst: 'lead', oct: 4, notes: ASHWOOD_MELODY, echo: 0.18 },
      { inst: 'flute', oct: 4, notes: ASHWOOD_MELODY, harmony: 'below', vol: 0.4, pan: -0.25, mute: bars(0, 7) },
      { inst: 'arp', oct: 4, pattern: ['1.3.5.3.8.5.3.5.', '1.3.5.8.a.8.5.3.'], vol: 0.85, pan: 0.3 },
      { inst: 'bassTri', oct: 2, pattern: '1-.1-.5.1-.1-.8.', vol: 0.85 },
      { inst: 'pad', oct: 3, pad: true, vol: 0.35 },
    ],
    drums: {
      kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.g.x.g.x.g.x.g.', vol: 0.75,
      fill: { snare: '....x.......xgxx' }, fillEvery: 4,
    },
  },

  ruins: {
    bpm: 100, key: 2, mode: 'dorian', beats: 4, div: 4, gain: 0.9, echoSteps: 3, echoFeedback: 0.42,
    chords: ['1', '4', '1', '4', '3', '7', '4', '4', '1', '4', '2', '5', '3', '7', '4', '5'],
    parts: [
      { inst: 'leadSoft', oct: 4, notes: RUINS_MELODY, echo: 0.4 },
      { inst: 'glass', oct: 4, pattern: '15a8b8a515a8b8a5', vol: 0.75, pan: 0.35, echo: 0.35 },
      { inst: 'bassTri', oct: 2, pattern: '1-....1.5-....3.', vol: 0.8 },
      { inst: 'pad', oct: 3, pad: true, vol: 0.5, pan: -0.3 },
    ],
    drums: {
      kick: 'x.........x.....', snare: '........g.......', hat: '..g...g...g...g.',
      perc: '.....x..........x.......x.......', percSound: 'drop', vol: 0.7,
    },
  },

  glimmer: {
    bpm: 120, key: 4, mode: 'lydian', beats: 4, div: 4, gain: 0.85, echoSteps: 3, echoFeedback: 0.38,
    chords: ['1', '2', '1', '2', '6', '3', '2', '2', '1', '2', '6', '3', '7', '6', '2', '5'],
    parts: [
      { inst: 'bell', oct: 4, notes: GLIMMER_MELODY, echo: 0.4 },
      { inst: 'leadSoft', oct: 4, notes: GLIMMER_MELODY, vol: 0.45, mute: bars(0, 7) },
      { inst: 'arp', oct: 5, pattern: ['1358135813581358', '8531853185318531'], vol: 0.65, pan: 0.35, echo: 0.3 },
      { inst: 'bassPulse', oct: 2, pattern: '1.1.8.1.5.1.8.5.', vol: 0.75 },
      { inst: 'padSaw', oct: 3, pad: true, vol: 0.7, pan: -0.25 },
    ],
    drums: {
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'g.g.g.g.g.g.g.g.',
      perc: '.......x..........x........x....', percSound: 'chime', vol: 0.65,
    },
  },

  rimeholt: {
    bpm: 76, key: 11, mode: 'aeolian', beats: 4, div: 4, gain: 0.95, echoSteps: 4, echoFeedback: 0.45,
    chords: ['1', '6', '3', '7', '1', '4', '5', '5M', '6', '3', '7', '1', '4', '6', '5M', '5M'],
    parts: [
      { inst: 'leadSoft', oct: 4, notes: RIMEHOLT_MELODY, echo: 0.45 },
      { inst: 'glass', oct: 4, pattern: ['8.......5.......', 'b.......8...a...'], vol: 0.8, pan: 0.4, echo: 0.55 },
      { inst: 'bassTri', oct: 2, pattern: '1---------------', vol: 0.75 },
      { inst: 'padSaw', oct: 3, pad: true, vol: 1.0, pan: -0.2 },
    ],
    drums: {
      kick: 'x...............', snare: '........g.......', hat: '....g.......g...',
      perc: '..........x.....................', percSound: 'chime', vol: 0.55, mute: bars(0, 3),
    },
  },

  hollow: {
    bpm: 92, key: 4, mode: 'phrygian', beats: 4, div: 4, gain: 0.9, echoSteps: 6, echoFeedback: 0.4,
    chords: ['1', '2', '1', '2', '6', '7', '2', '5', '1', '2', '4', '2', '6', '3', '2', '1'],
    parts: [
      { inst: 'brass', oct: 4, notes: HOLLOW_MELODY, vol: 1.1, echo: 0.25 },
      { inst: 'leadSoft', oct: 5, notes: HOLLOW_MELODY, vol: 0.4, mute: bars(0, 7), echo: 0.3 },
      { inst: 'bassSaw', oct: 2, notes: '1:2 1:2 1:2 2:2 1:2 1:2 5,:2 2:2', vol: 1.0 },
      { inst: 'glass', oct: 5, pattern: '......1.......5.', vol: 0.7, pan: 0.4, echo: 0.6 },
      { inst: 'padSaw', oct: 3, pad: true, vol: 0.9, pan: -0.2 },
    ],
    drums: {
      kick: 'X.......x.x.....', snare: '........X.......', hat: '..g...g...g...g.', vol: 0.75,
      fill: { tom: '..........x.x.xx' }, fillEvery: 4,
    },
  },

  heart: {
    bpm: 138, key: 2, mode: 'ionian', beats: 4, div: 4, gain: 0.85,
    chords: ['1', '5', '6', '4', '1', '5', '4', '5', '6', '4', '1', '5', '4', 'b7', '4', '5'],
    parts: [
      { inst: 'lead', oct: 4, notes: HEART_MELODY, echo: 0.15 },
      { inst: 'leadSq', oct: 4, notes: HEART_MELODY, harmony: 'below', vol: 0.55, pan: -0.3 },
      { inst: 'arp', oct: 5, pattern: '13581358a8531358', vol: 0.65, pan: 0.35 },
      { inst: 'bassSaw', oct: 2, pattern: '1.1.8.1.1.1.8.1.', vol: 0.95 },
      { inst: 'brass', oct: 4, pad: true, vol: 0.55, pan: 0.15 },
    ],
    drums: {
      kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', crash: 'x' + '.'.repeat(127), vol: 0.8,
      fill: { tom: '........x.x.x.xx', snare: '....x.......x...' }, fillEvery: 4,
    },
  },

  boss: {
    bpm: 150, key: 7, mode: 'aeolian', beats: 4, div: 4, gain: 0.85,
    chords: ['1', '6', '4', '5M', '1', '6', '7', '5M', '1', '4', '6', '3', '6', '4', '5M', '5M'],
    parts: [
      { inst: 'leadSq', oct: 4, notes: BOSS_MELODY, echo: 0.12 },
      { inst: 'lead', oct: 4, notes: BOSS_MELODY, harmony: 'below', vol: 0.5, pan: -0.3, mute: bars(0, 7) },
      { inst: 'arp', oct: 5, pattern: '1351351351351358', vol: 0.6, pan: 0.35 },
      { inst: 'bassSq', oct: 2, pattern: ['1.8.1.8.1.8.1.8.', '1.8.1.8.1.8.5.8.'], vol: 1.0 },
      { inst: 'padSaw', oct: 3, pad: true, vol: 0.5 },
    ],
    drums: {
      kick: 'X...x.x.X...x.x.', snare: '....X.......X...', hat: 'xgxgxgxgxgxgxgxg', crash: 'x' + '.'.repeat(127), vol: 0.8,
      fill: { snare: '....X.......XxXX', tom: '........x.x.....' }, fillEvery: 4,
    },
  },

  finalBoss: {
    bpm: 168, key: 0, mode: 'phrygian', beats: 4, div: 4, gain: 0.85,
    chords: ['1', '2', '1', '5M', '6', '2', '5M', '5M', '1', '4', '2', '5M', '6', '3', '2', '5M'],
    parts: [
      { inst: 'leadSq', oct: 5, notes: FINAL_MELODY, echo: 0.12 },
      { inst: 'lead', oct: 4, notes: FINAL_MELODY, vol: 0.55, pan: -0.3, mute: bars(0, 7) },
      { inst: 'arp', oct: 5, pattern: '1538153815381538', vol: 0.55, pan: 0.35 },
      { inst: 'bassSaw', oct: 2, pattern: '1.11.1.11.1.118.', vol: 1.0 },
      { inst: 'padSaw', oct: 3, pad: true, vol: 0.8, pan: 0.1 },
    ],
    drums: {
      kick: 'X.x...x.X.x...x.', snare: '....X.......X...', hat: 'XgxgXgxgXgxgXgxg', crash: 'x' + '.'.repeat(63), vol: 0.85,
      fill: { snare: '....X.....xxXXXX', tom: '........XxXx....' }, fillEvery: 4,
    },
  },

  ending: {
    bpm: 96, key: 5, mode: 'ionian', beats: 4, div: 4, gain: 0.9, echoSteps: 3, echoFeedback: 0.3,
    chords: ['1', '5', '6', '4', '1', '5', '4', '4m', '6', '3', '4', '1', '2', '5', '4', '5'],
    parts: [
      { inst: 'lead', oct: 4, notes: ENDING_MELODY, echo: 0.25 },
      { inst: 'flute', oct: 4, notes: ENDING_MELODY, harmony: 'below', vol: 0.45, pan: -0.3, mute: bars(0, 7) },
      { inst: 'arpSoft', oct: 4, pattern: '1.5.8.5.a.5.8.5.', vol: 0.7, pan: 0.3, echo: 0.2 },
      { inst: 'bassTri', oct: 2, pattern: '1-....1.5-....3.', vol: 0.8 },
      { inst: 'pad', oct: 4, pad: true, vol: 0.5 },
    ],
    drums: {
      kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'g.g.g.g.g.g.g.g.', crash: '.'.repeat(64) + 'x' + '.'.repeat(191), vol: 0.6,
      mute: bars(0, 3),
    },
  },
};
