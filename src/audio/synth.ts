// Low-level Web Audio synthesis helpers shared by the SFX recipes and the music sequencer.
// Everything is procedural: oscillators (incl. NES-style pulse waves built from Fourier series)
// and a looping white-noise buffer pushed through filters and envelopes.

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'pulse12' | 'pulse25';

/** Per-AudioContext shared resources. */
export interface Kit {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
  pulse12: PeriodicWave;
  pulse25: PeriodicWave;
}

/** Fourier coefficients of a pulse wave with the given duty cycle (0..1). */
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    real[k] = Math.sin(2 * Math.PI * k * duty) / (Math.PI * k);
    imag[k] = (2 * Math.sin(Math.PI * k * duty) ** 2) / (Math.PI * k);
  }
  return ctx.createPeriodicWave(real, imag);
}

export function createKit(ctx: BaseAudioContext): Kit {
  const len = Math.floor(ctx.sampleRate * 1.0);
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return { ctx, noise, pulse12: pulseWave(ctx, 0.125), pulse25: pulseWave(ctx, 0.25) };
}

export function midiHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function setWave(osc: OscillatorNode, w: Wave, k: Kit): void {
  if (w === 'pulse12') osc.setPeriodicWave(k.pulse12);
  else if (w === 'pulse25') osc.setPeriodicWave(k.pulse25);
  else osc.type = w;
}

const FLOOR = 0.0001;

/** Percussive / held envelope: 0 → peak (attack) → [hold] → exponential decay to silence at `end`. */
export function envelope(p: AudioParam, t0: number, peak: number, attack: number, hold: number, end: number): void {
  const a = Math.max(0.001, Math.min(attack, (end - t0) * 0.6));
  const pk = Math.max(FLOOR * 2, peak);
  p.setValueAtTime(0, t0);
  p.linearRampToValueAtTime(pk, t0 + a);
  const hEnd = Math.min(end - 0.005, t0 + a + Math.max(0, hold));
  if (hEnd > t0 + a) p.setValueAtTime(pk, hEnd);
  p.exponentialRampToValueAtTime(FLOOR, end);
  p.setValueAtTime(0, end + 0.001);
}

export interface ToneOpts {
  w?: Wave; // default square
  f: number; // start frequency (Hz)
  f2?: number; // end frequency (exponential glide unless `lin`)
  g?: number; // glide time (default: whole duration)
  lin?: boolean;
  at?: number; // start offset (s)
  d: number; // duration (s)
  v: number; // peak gain
  a?: number; // attack (s)
  h?: number; // hold before the decay (s)
  det?: number; // detune (cents)
  vib?: [number, number]; // vibrato [rate Hz, depth cents]
  trem?: [number, number]; // tremolo [rate Hz, depth 0..1]
  lp?: number; // lowpass cutoff (Hz)
  lp2?: number; // lowpass sweep target
  hp?: number; // highpass cutoff (Hz)
  q?: number;
  pan?: number;
}

export interface NoiseOpts {
  at?: number;
  d: number;
  v: number;
  a?: number;
  h?: number;
  type?: BiquadFilterType; // default bandpass
  f?: number; // filter frequency
  f2?: number; // filter sweep target
  q?: number;
  rate?: number; // playback rate (lower = grainier / darker)
  pan?: number;
}

function connectPan(k: Kit, node: AudioNode, out: AudioNode, pan: number | undefined): void {
  if (pan && typeof (k.ctx as AudioContext).createStereoPanner === 'function') {
    const p = (k.ctx as AudioContext).createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    p.connect(out);
  } else {
    node.connect(out);
  }
}

/** One oscillator through an optional filter and an envelope. Returns the end time. */
export function tone(k: Kit, out: AudioNode, t: number, o: ToneOpts): number {
  const ctx = k.ctx;
  const t0 = t + (o.at ?? 0);
  const d = Math.max(0.012, o.d);
  const end = t0 + d;
  const osc = ctx.createOscillator();
  setWave(osc, o.w ?? 'square', k);
  const f = Math.max(1, o.f);
  osc.frequency.setValueAtTime(f, t0);
  if (o.f2 !== undefined) {
    const gEnd = t0 + Math.max(0.005, Math.min(o.g ?? d, d));
    if (o.lin) osc.frequency.linearRampToValueAtTime(Math.max(1, o.f2), gEnd);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), gEnd);
  }
  if (o.det) osc.detune.setValueAtTime(o.det, t0);
  const nodes: AudioScheduledSourceNode[] = [osc];
  if (o.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vib[0];
    const depth = ctx.createGain();
    depth.gain.value = o.vib[1];
    lfo.connect(depth);
    depth.connect(osc.detune);
    nodes.push(lfo);
  }
  let node: AudioNode = osc;
  if (o.hp) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = o.hp;
    node.connect(hp);
    node = hp;
  }
  if (o.lp) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(o.lp, t0);
    if (o.lp2) lp.frequency.exponentialRampToValueAtTime(Math.max(20, o.lp2), end);
    lp.Q.value = o.q ?? 0.7;
    node.connect(lp);
    node = lp;
  }
  const g = ctx.createGain();
  envelope(g.gain, t0, o.v, o.a ?? 0.002, o.h ?? 0, end);
  node.connect(g);
  let last: AudioNode = g;
  if (o.trem) {
    const tg = ctx.createGain();
    tg.gain.value = 1 - o.trem[1] / 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.trem[0];
    const depth = ctx.createGain();
    depth.gain.value = o.trem[1] / 2;
    lfo.connect(depth);
    depth.connect(tg.gain);
    g.connect(tg);
    last = tg;
    nodes.push(lfo);
  }
  connectPan(k, last, out, o.pan);
  for (const n of nodes) {
    n.start(t0);
    n.stop(end + 0.03);
  }
  return end;
}

/** Filtered white noise burst. Returns the end time. */
export function noise(k: Kit, out: AudioNode, t: number, o: NoiseOpts): number {
  const ctx = k.ctx;
  const t0 = t + (o.at ?? 0);
  const d = Math.max(0.01, o.d);
  const end = t0 + d;
  const src = ctx.createBufferSource();
  src.buffer = k.noise;
  src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;
  const flt = ctx.createBiquadFilter();
  flt.type = o.type ?? 'bandpass';
  const f = Math.max(20, Math.min(20000, o.f ?? 2000));
  flt.frequency.setValueAtTime(f, t0);
  if (o.f2) flt.frequency.exponentialRampToValueAtTime(Math.max(20, Math.min(20000, o.f2)), end);
  flt.Q.value = o.q ?? (flt.type === 'bandpass' ? 1.2 : 0.7);
  const g = ctx.createGain();
  envelope(g.gain, t0, o.v, o.a ?? 0.001, o.h ?? 0, end);
  src.connect(flt);
  flt.connect(g);
  connectPan(k, g, out, o.pan);
  src.start(t0, Math.random() * 0.8);
  src.stop(end + 0.03);
  return end;
}

/**
 * Per-play drawing context for SFX recipes: start time, pitch multiplier and volume multiplier
 * are applied to every layer, and `end` tracks when the last layer stops.
 */
export class Layer {
  k: Kit;
  out: AudioNode;
  t: number;
  p: number;
  v: number;
  end: number;

  constructor(k: Kit, out: AudioNode, t: number, p: number, v: number) {
    this.k = k;
    this.out = out;
    this.t = t;
    this.p = p;
    this.v = v;
    this.end = t;
  }

  /** Oscillator layer; frequencies scale with pitch. */
  tn(o: ToneOpts): void {
    const p = this.p;
    const e = tone(this.k, this.out, this.t, {
      ...o,
      f: o.f * p,
      f2: o.f2 !== undefined ? o.f2 * p : undefined,
      v: o.v * this.v,
      lp: o.lp ? Math.min(20000, o.lp * Math.sqrt(p)) : undefined,
      lp2: o.lp2 ? Math.min(20000, o.lp2 * Math.sqrt(p)) : undefined,
    });
    if (e > this.end) this.end = e;
  }

  /** Musical note layer (MIDI number, pitch scaled). */
  note(m: number, o: Omit<ToneOpts, 'f'>): void {
    this.tn({ ...o, f: midiHz(m) });
  }

  /** Noise layer; the filter frequency follows pitch gently. */
  nz(o: NoiseOpts): void {
    const s = Math.sqrt(this.p);
    const e = noise(this.k, this.out, this.t, {
      ...o,
      f: o.f !== undefined ? o.f * s : undefined,
      f2: o.f2 !== undefined ? o.f2 * s : undefined,
      v: o.v * this.v,
    });
    if (e > this.end) this.end = e;
  }
}
