// Procedural chiptune music: a lookahead step sequencer (driven by the engine's ~25 ms timer,
// scheduling ~120 ms ahead on the audio clock) playing compiled scores from tracks.ts.
// Each playing track owns its own gain (for crossfades), part buses and a tempo-synced echo.
import type { MusicTrack } from './api.ts';
import { compileTrack, MODES, type CompiledTrack, type DrumName, type InstDef } from './score.ts';
import { midiHz, noise, setWave, tone, type Kit } from './synth.ts';
import { TRACKS, type TrackName } from './tracks.ts';

export const LOOKAHEAD = 0.12;
const GATE = 0.94;

const compiled = new Map<TrackName, CompiledTrack>();

export function getCompiledTrack(name: TrackName): CompiledTrack {
  let c = compiled.get(name);
  if (!c) {
    c = compileTrack(TRACKS[name]);
    compiled.set(name, c);
  }
  return c;
}

/** Schedule one instrument note. */
function playNote(k: Kit, dest: AudioNode, inst: InstDef, midi: number, t: number, dur: number, vel: number): void {
  const ctx = k.ctx;
  const f = midiHz(midi);
  const peak = Math.max(0.0002, inst.vol * vel);
  const g = ctx.createGain();
  const gp = g.gain;
  const a = Math.max(0.002, inst.a);
  let end: number;
  gp.setValueAtTime(0, t);
  gp.linearRampToValueAtTime(peak, t + a);
  if (inst.s <= 0) {
    end = t + a + inst.d;
    gp.exponentialRampToValueAtTime(0.0001, end);
  } else {
    const relStart = Math.max(t + a + 0.005, t + dur);
    const sus = Math.max(0.0001, peak * inst.s);
    gp.exponentialRampToValueAtTime(sus, Math.min(t + a + inst.d, relStart));
    gp.setValueAtTime(sus, relStart);
    end = relStart + inst.r;
    gp.exponentialRampToValueAtTime(0.0001, end);
  }
  gp.setValueAtTime(0, end + 0.001);

  let input: AudioNode = g;
  if (inst.cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = inst.q ?? 0.8;
    const top = Math.min(18000, inst.cutoff * (inst.fenv ?? 1));
    lp.frequency.setValueAtTime(top, t);
    if (inst.fenv && inst.fenv > 1) lp.frequency.exponentialRampToValueAtTime(inst.cutoff, t + a + inst.d);
    lp.connect(g);
    input = lp;
  }
  g.connect(dest);

  const sources: OscillatorNode[] = [];
  const voices = inst.detune ? [-inst.detune, inst.detune] : [0];
  const share = inst.detune ? 0.62 : 1;
  const oscGain = ctx.createGain();
  oscGain.gain.value = share;
  oscGain.connect(input);
  for (const det of voices) {
    const o = ctx.createOscillator();
    setWave(o, inst.wave, k);
    o.frequency.setValueAtTime(f, t);
    if (det) o.detune.setValueAtTime(det, t);
    o.connect(oscGain);
    sources.push(o);
  }
  if (inst.vib && dur > (inst.vibDelay ?? 0) + 0.05) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = inst.vibRate ?? 5.5;
    const depth = ctx.createGain();
    const vd = t + (inst.vibDelay ?? 0.15);
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, vd);
    depth.gain.linearRampToValueAtTime(inst.vib, vd + 0.25);
    lfo.connect(depth);
    for (const o of sources) depth.connect(o.detune);
    sources.push(lfo);
  }
  if (inst.sub) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f / 2, t);
    const sg = ctx.createGain();
    sg.gain.value = inst.sub;
    o.connect(sg);
    sg.connect(g);
    sources.push(o);
  }
  for (const o of sources) {
    o.start(t);
    o.stop(end + 0.02);
  }
  if (inst.bell) {
    tone(k, dest, t, { w: 'sine', f: f * (inst.bellRatio ?? 3), d: Math.max(0.08, inst.d * 0.45), v: peak * inst.bell });
  }
}

function playDrum(k: Kit, dest: AudioNode, drum: DrumName, t: number, vel: number, c: CompiledTrack): void {
  switch (drum) {
    case 'kick':
      tone(k, dest, t, { w: 'sine', f: 150, f2: 42, g: 0.12, d: 0.24, v: 0.55 * vel });
      noise(k, dest, t, { type: 'highpass', f: 3000, d: 0.012, v: 0.08 * vel });
      break;
    case 'snare':
      noise(k, dest, t, { type: 'bandpass', f: 1800, q: 0.8, d: 0.16, v: 0.26 * vel });
      tone(k, dest, t, { w: 'triangle', f: 190, f2: 150, d: 0.08, v: 0.16 * vel });
      break;
    case 'hat':
      noise(k, dest, t, { type: 'highpass', f: 7500, d: 0.035, v: 0.09 * vel });
      break;
    case 'open':
      noise(k, dest, t, { type: 'highpass', f: 7000, d: 0.16, v: 0.08 * vel });
      break;
    case 'crash':
      noise(k, dest, t, { type: 'highpass', f: 4500, d: 1.2, v: 0.09 * vel });
      noise(k, dest, t, { type: 'bandpass', f: 6000, q: 0.8, d: 0.6, v: 0.05 * vel });
      break;
    case 'tom':
      tone(k, dest, t, { w: 'sine', f: 160, f2: 90, d: 0.25, v: 0.38 * vel });
      noise(k, dest, t, { type: 'lowpass', f: 800, d: 0.05, v: 0.08 * vel });
      break;
    case 'clap':
      noise(k, dest, t, { type: 'bandpass', f: 2500, q: 2, d: 0.04, v: 0.18 * vel });
      tone(k, dest, t, { w: 'square', f: 800, d: 0.015, v: 0.035 * vel });
      break;
    case 'shaker':
      noise(k, dest, t, { type: 'bandpass', f: 6000, q: 1.2, a: 0.012, d: 0.07, v: 0.07 * vel });
      break;
    case 'perc': {
      const kind = c.def.drums?.percSound ?? 'tick';
      if (kind === 'drop') {
        const f = 700 + Math.random() * 500;
        tone(k, dest, t, { w: 'sine', f, f2: f * 2.1, g: 0.05, d: 0.1, v: 0.1 * vel });
      } else if (kind === 'chime') {
        const mode = MODES[c.def.mode];
        const deg = [0, 2, 4, 7][Math.floor(Math.random() * 4)];
        const m = 84 + c.def.key + (deg >= 7 ? 12 : mode[deg]);
        tone(k, dest, t, { w: 'sine', f: midiHz(m), d: 0.6, v: 0.045 * vel });
        tone(k, dest, t, { w: 'sine', f: midiHz(m) * 2.76, d: 0.25, v: 0.015 * vel });
      } else if (kind === 'bongo') {
        tone(k, dest, t, { w: 'sine', f: 420, f2: 300, d: 0.12, v: 0.2 * vel });
      } else {
        tone(k, dest, t, { w: 'square', f: 3000, d: 0.012, v: 0.03 * vel });
      }
      break;
    }
  }
}

/** One playing (or fading-out) track. */
class TrackPlayer {
  readonly name: TrackName;
  private k: Kit;
  private c: CompiledTrack;
  private out: GainNode;
  private partIn: GainNode[] = [];
  private drumIn: GainNode;
  private echo: DelayNode;
  private extra: AudioNode[] = [];
  private step = 0;
  private nextTime: number;
  private stopAt = Infinity;
  dead = false;

  constructor(k: Kit, dest: AudioNode, name: TrackName, start: number, fadeIn: number) {
    const ctx = k.ctx;
    this.k = k;
    this.name = name;
    this.c = getCompiledTrack(name);
    const def = this.c.def;
    this.nextTime = start;

    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(def.gain, start + Math.max(0.05, fadeIn));
    this.out.connect(dest);

    // tempo-synced echo: delay → lowpass → feedback
    this.echo = ctx.createDelay(2);
    this.echo.delayTime.value = Math.min(1.9, (def.echoSteps ?? 3) * this.c.stepDur);
    const fb = ctx.createGain();
    fb.gain.value = def.echoFeedback ?? 0.32;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.echo.connect(lp);
    lp.connect(fb);
    fb.connect(this.echo);
    lp.connect(wet);
    wet.connect(this.out);
    this.extra.push(fb, lp, wet);

    def.parts.forEach((p) => {
      const g = ctx.createGain();
      g.gain.value = p.vol ?? 1;
      if (p.pan && typeof (ctx as AudioContext).createStereoPanner === 'function') {
        const pn = (ctx as AudioContext).createStereoPanner();
        pn.pan.value = p.pan;
        g.connect(pn);
        pn.connect(this.out);
        this.extra.push(pn);
      } else {
        g.connect(this.out);
      }
      if (p.echo) {
        const send = ctx.createGain();
        send.gain.value = p.echo;
        g.connect(send);
        send.connect(this.echo);
        this.extra.push(send);
      }
      this.partIn.push(g);
    });
    this.drumIn = ctx.createGain();
    this.drumIn.gain.value = def.drums?.vol ?? 1;
    this.drumIn.connect(this.out);
  }

  fadeOut(now: number, dur: number): void {
    const g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + dur);
    this.stopAt = now + dur;
  }

  private swingOffset(step: number): number {
    const sw = this.c.def.swing ?? 0;
    const div = this.c.def.div;
    if (!sw || div % 2 !== 0) return 0;
    const pos = step % div;
    if (pos === div / 2) return sw * this.c.stepDur;
    if (pos % 2 === 1) return sw * 0.5 * this.c.stepDur;
    return 0;
  }

  schedule(now: number, until: number): void {
    if (this.dead) return;
    const c = this.c;
    if (now > this.stopAt + 0.5) {
      this.dispose();
      return;
    }
    // Fell behind (tab throttled / context suspended): skip ahead, keeping the musical position.
    if (this.nextTime < now - 0.1) {
      const missed = Math.ceil((now - this.nextTime) / c.stepDur);
      this.nextTime += missed * c.stepDur;
      this.step = (this.step + missed) % c.totalSteps;
    }
    while (this.nextTime < until && this.nextTime < this.stopAt) {
      const t = this.nextTime + this.swingOffset(this.step);
      for (const n of c.notes[this.step]) {
        playNote(this.k, this.partIn[n.part], c.insts[n.part], n.midi, t, n.len * c.stepDur * GATE, n.vel);
      }
      for (const d of c.drums[this.step]) playDrum(this.k, this.drumIn, d.drum, t, d.vel, c);
      this.nextTime += c.stepDur;
      this.step = (this.step + 1) % c.totalSteps;
    }
  }

  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    try {
      this.out.disconnect();
      this.echo.disconnect();
      this.drumIn.disconnect();
      for (const g of this.partIn) g.disconnect();
      for (const n of this.extra) n.disconnect();
    } catch {
      // already disconnected
    }
  }
}

/** Crossfading music player. `tick()` must be called every ~25 ms. */
export class MusicPlayer {
  private k: Kit;
  private dest: AudioNode;
  private players: TrackPlayer[] = [];
  private current: TrackPlayer | null = null;

  constructor(k: Kit, dest: AudioNode) {
    this.k = k;
    this.dest = dest;
  }

  get playing(): MusicTrack {
    return this.current?.name ?? null;
  }

  /** Crossfade to `track` (null = fade to silence). Same track = no-op. */
  play(track: MusicTrack, fade = 0.8): void {
    if (track === this.playing) return;
    const now = this.k.ctx.currentTime;
    if (this.current) this.current.fadeOut(now, fade);
    this.current = null;
    if (track) {
      const p = new TrackPlayer(this.k, this.dest, track, now + 0.08, fade);
      this.players.push(p);
      this.current = p;
      p.schedule(now, now + LOOKAHEAD);
    }
  }

  tick(): void {
    const now = this.k.ctx.currentTime;
    for (const p of this.players) p.schedule(now, now + LOOKAHEAD);
    if (this.players.some((p) => p.dead)) this.players = this.players.filter((p) => !p.dead);
  }

  stopAll(fade = 0.3): void {
    this.play(null, fade);
  }

  disposeAll(): void {
    for (const p of this.players) p.dispose();
    this.players = [];
    this.current = null;
  }
}
