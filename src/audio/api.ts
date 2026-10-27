// Contract between the app shell and the procedural audio engine (Web Audio API, no asset files).
import type { Battle } from '../core/battle.ts';
import type { AreaId, BattleEvent } from '../core/types.ts';

export type SfxName =
  | 'hit' | 'crit' | 'block' | 'arrow' | 'bolt' | 'chain' | 'heal' | 'barrier' | 'barrierBreak'
  | 'bash' | 'interrupt' | 'break' | 'perfect' | 'arrowRain' | 'meteorFall' | 'meteorImpact' | 'sanctuary'
  | 'coin' | 'ember' | 'shard' | 'levelUp' | 'milestone' | 'nodeBuy' | 'relic' | 'recruit'
  | 'bossIntro' | 'bossPhase' | 'bossDefeat' | 'eliteDefeat' | 'heroDeath' | 'enemyDeath'
  | 'windup' | 'unstoppable' | 'nova' | 'doom' | 'freeze' | 'summon' | 'wardBreak' | 'rout'
  | 'overdrive' | 'emberNova' | 'vow' | 'descent' | 'lastLight' | 'lanternLow'
  | 'uiClick' | 'uiHover' | 'uiError' | 'runStart' | 'victory' | 'defeat' | 'rekindle';

export type MusicTrack = 'title' | 'camp' | AreaId | 'boss' | 'finalBoss' | 'ending' | null;

export interface AudioSettings {
  sfx: boolean;
  music: boolean;
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
}

export interface IAudio {
  /** Must be called from a user gesture (click / keydown) to start the AudioContext. Safe to call repeatedly. */
  unlock(): void;
  setSettings(s: AudioSettings): void;
  play(name: SfxName, opts?: { volume?: number; pitch?: number }): void;
  /** Map battle events to sounds (rate-limited internally so swarms don't clip). */
  handleEvents(events: BattleEvent[], battle: Battle): void;
  /** Crossfade to a music track (procedural chiptune loop). null = silence. */
  setMusic(track: MusicTrack): void;
}
