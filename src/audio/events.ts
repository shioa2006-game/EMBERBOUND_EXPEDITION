// BattleEvent → sound mapping. Pure logic over a SoundSink so it stays testable without Web Audio.
// See README.md for the full table.
import type { Battle } from '../core/battle.ts';
import type { AreaId, BattleEvent, HeroId, Unit, UnitSize } from '../core/types.ts';
import type { MusicTrack } from './api.ts';
import type { AnySfx } from './sfx.ts';

export interface PlayOpts {
  volume?: number;
  pitch?: number;
  /** Stereo position -1..1. */
  pan?: number;
  /** Start this many seconds later on the audio clock. */
  delay?: number;
}

export interface SoundSink {
  sfx(name: AnySfx, o?: PlayOpts): void;
  music(track: MusicTrack): void;
}

/** Boss music for an area: the two finales get the intense track. */
export function bossTrackFor(area: AreaId): MusicTrack {
  return area === 'hollow' || area === 'heart' ? 'finalBoss' : 'boss';
}

/** The track that fits the current battle state (for app shells that want to derive it). */
export function musicForBattle(b: Battle): MusicTrack {
  if (b.phase === 'victory' || b.phase === 'ended') return null; // let the fanfare / stinger ring alone
  const bossAlive = b.isBossStage && b.enemies.some((e) => e.rank === 'boss' && (e.alive || e.reviveTimer > 0));
  if (b.phase === 'bossIntro' || (b.phase === 'fight' && bossAlive)) return bossTrackFor(b.area.id);
  return b.area.id;
}

const PIP_PITCH: Record<HeroId, number> = { guardian: 1, ranger: 1.26, arcanist: 1.498, oracle: 2 };
const SIZE_PITCH: Record<UnitSize, number> = { small: 1.18, medium: 1, large: 0.84, huge: 0.7 };

function panOf(u: Unit | undefined | null): number {
  if (!u) return 0;
  return Math.max(-0.7, Math.min(0.7, ((u.x - 200) / 200) * 0.75));
}

function panX(x: number): number {
  return Math.max(-0.7, Math.min(0.7, ((x - 200) / 200) * 0.75));
}

export class BattleSoundMapper {
  /** Switch music automatically: boss track on bossIntro, silence under the boss fanfare, next area on Descent. */
  autoMusic = true;

  map(events: readonly BattleEvent[], b: Battle, out: SoundSink): void {
    if (!events.length) return;

    // Pre-pass: facts about this batch used to de-duplicate layered sounds.
    const interrupted = new Set<number>();
    const wardBroken = new Set<number>();
    const eliteDown = new Set<number>();
    const overkill = new Set<number>();
    let bossDown = false;
    let sanctuary = false;
    let partyWide = false; // a party-wide enemy ability resolved this frame (its own sound covers the hits)
    for (const e of events) {
      if (e.type === 'ability' && (e.effect === 'nova' || e.effect === 'drainLantern')) partyWide = true;
      if (e.type === 'interrupt') interrupted.add(e.id);
      else if (e.type === 'wardBreak') wardBroken.add(e.dst);
      else if (e.type === 'eliteDefeated') eliteDown.add(e.id);
      else if (e.type === 'bossDefeated') bossDown = true;
      else if (e.type === 'damage' && e.overkill) overkill.add(e.dst);
      else if (e.type === 'skill' && e.hero === 'oracle') sanctuary = true;
    }

    const unit = (id: number | null): Unit | undefined => (id === null ? undefined : b.unitById(id));

    for (const e of events) {
      switch (e.type) {
        case 'attack': {
          const pan = panOf(unit(e.src));
          switch (e.fx) {
            case 'arrow':
              out.sfx('arrow', { pan, volume: 0.8 });
              break;
            case 'arrowRain':
              out.sfx('arrow', { pan, volume: 0.35, pitch: 1.2 });
              break;
            case 'bolt':
              out.sfx('bolt', { pan });
              break;
            case 'smite':
              out.sfx('bolt', { pan, volume: 0.6, pitch: 1.4 });
              break;
            case 'chain':
              out.sfx('chain', { pan: panOf(unit(e.dst)) });
              break;
            case 'enemyShot':
              out.sfx('arrow', { pan, volume: 0.6, pitch: 0.8 });
              break;
            case 'enemyMagic':
              out.sfx('bolt', { pan, volume: 0.55, pitch: 0.7 });
              break;
            default:
              break; // melee swings / bash: the impact sounds carry them
          }
          break;
        }

        case 'damage': {
          const u = unit(e.dst);
          const pan = panOf(u);
          if (u && u.side === 'hero') {
            if (e.blocked) {
              out.sfx('block', { pan });
              break;
            }
            const fullyAbsorbed = e.absorbed > 0 && e.absorbed >= e.amount - 0.5;
            if (fullyAbsorbed) {
              out.sfx('absorb', { pan });
              break;
            }
            if (e.tag === 'doom' || e.tag === 'explode' || (e.tag === 'nova' && partyWide)) {
              out.sfx('hurt', { pan, volume: 0.5 }); // the nova / doom / explosion sound carries the hit
              break;
            }
            if (e.tag === 'nova') {
              out.sfx('hurt', { pan, volume: 1.3, pitch: 0.72 }); // a telegraphed single-target strike lands
              break;
            }
            const frac = Math.min(1, (e.amount - e.absorbed) / Math.max(1, u.maxHp));
            out.sfx('hurt', { pan, volume: Math.min(1.3, 0.6 + frac * 1.8), pitch: e.big ? 0.8 : 1 });
            break;
          }
          // enemy took damage
          switch (e.tag) {
            case 'burn':
              out.sfx('burnTick', { pan });
              break;
            case 'meteor':
            case 'explode':
            case 'emberNova':
            case 'splash':
            case 'reflect':
            case 'chain':
              break; // covered by meteorImpact / smallBoom / emberNova / main hit / chain zap
            case 'skill': {
              const src = unit(e.src);
              if (src?.key === 'guardian') break; // Shield Bash recipe already contains the slam
              if (e.crit) out.sfx('crit', { pan, volume: 0.6 });
              else out.sfx('hit', { pan, volume: 0.45, pitch: 1.25 });
              break;
            }
            case 'vow':
              out.sfx('hitHeavy', { pan, volume: 1.15, pitch: 0.8 });
              break;
            default: {
              if (e.toWard > 0 && e.toWard >= e.amount - 0.5) out.sfx('wardHit', { pan });
              else if (e.crit) out.sfx('crit', { pan });
              else if (e.big) out.sfx('hitHeavy', { pan });
              else if (e.dmgType === 'magic') out.sfx('hitMagic', { pan, volume: 0.8 });
              else out.sfx('hit', { pan, volume: e.tag === 'counter' ? 0.7 : 0.85 });
            }
          }
          break;
        }

        case 'heal': {
          const u = unit(e.dst);
          if (!u) break;
          if (u.side === 'hero') {
            const frac = e.amount / Math.max(1, u.maxHp);
            if (sanctuary || frac < 0.01) break;
            out.sfx('heal', { pan: panOf(u), volume: 0.45 + Math.min(0.55, frac * 3) });
          } else {
            out.sfx('enemyHeal', { pan: panOf(u) });
          }
          break;
        }

        case 'barrier':
          if (!sanctuary) out.sfx('barrier', { pan: panOf(unit(e.dst)) });
          break;

        case 'barrierBreak':
          out.sfx('barrierBreak', { pan: panOf(unit(e.dst)) });
          break;

        case 'wardBreak':
          out.sfx('wardBreak', { pan: panOf(unit(e.dst)) });
          break;

        case 'death': {
          const u = unit(e.id);
          const pan = panOf(u);
          if (e.side === 'hero') {
            out.sfx('heroDeath', { pan });
          } else if (e.rank === 'boss') {
            if (!bossDown) out.sfx('eliteCrunch', { pan, volume: 1.15, pitch: 0.8 });
          } else if (e.rank === 'elite') {
            if (!eliteDown.has(e.id)) out.sfx('eliteCrunch', { pan });
          } else {
            const p = u ? SIZE_PITCH[u.size] : 1;
            if (overkill.has(e.id)) out.sfx('enemyDeath', { pan, volume: 1.2, pitch: p * 0.88 });
            else out.sfx('enemyDeath', { pan, pitch: p });
          }
          break;
        }

        case 'revive': {
          const u = unit(e.id);
          out.sfx('revive', { pan: panOf(u), pitch: u && u.side === 'enemy' ? 0.75 : 1 });
          break;
        }

        case 'loot':
          if (e.kind === 'gold') out.sfx('coin', { pan: panX(e.x) * 0.6 });
          else if (e.kind === 'ember') out.sfx('ember', { pan: panX(e.x) * 0.6 });
          else out.sfx('shard', { pan: panX(e.x) * 0.6 });
          break;

        case 'skill': {
          const pan = panOf(unit(e.src));
          const volume = e.auto ? 0.8 : 1;
          if (e.hero === 'guardian') out.sfx('bash', { pan, volume });
          else if (e.hero === 'ranger') out.sfx('arrowRain', { pan, volume });
          else if (e.hero === 'arcanist') out.sfx('meteorFall', { volume }); // impact plays on the scale-2 explosion fx
          else out.sfx('sanctuary', { volume });
          break;
        }

        case 'perfect':
          out.sfx('perfect', { pan: panOf(unit(e.src)) * 0.5, delay: 0.04 });
          break;

        case 'emberPip':
          if (e.on) out.sfx('pip', { pitch: PIP_PITCH[e.hero], delay: 0.12 });
          break;

        case 'fx':
          switch (e.fx) {
            case 'explosion':
              // scale 2 = Meteor impact: played when the sim actually lands it (respects pause / slow-mo)
              if ((e.scale ?? 1) >= 2) out.sfx('meteorImpact', { pan: panX(e.x) });
              else out.sfx('smallBoom', { pan: panX(e.x) });
              break;
            case 'meteorite':
              out.sfx('meteorite', { pan: panX(e.x) });
              break;
            case 'chain':
              out.sfx('chain', { pan: panX(e.x), volume: 0.7, pitch: 1.15 });
              break;
            case 'doom':
              out.sfx('doomBlast', { pan: panX(e.x) });
              break;
            case 'drain':
              out.sfx('drain', { pan: panX(e.x), volume: (e.scale ?? 1) > 1 ? 1.2 : 0.7 });
              break;
            case 'shockwave':
              out.sfx('shockwave', { pan: panX(e.x) });
              break;
            case 'benediction':
              out.sfx('benediction', { pan: panX(e.x) });
              break;
            case 'intercede':
              out.sfx('intercede', { pan: panX(e.x) });
              break;
            case 'ward':
              out.sfx('wardUp', { pan: panX(e.x) });
              break;
            case 'emerge':
              out.sfx('splash', { pan: panX(e.x), pitch: 1.25 });
              break;
            default:
              break;
          }
          break;

        case 'interrupt':
          out.sfx('interrupt', { pan: panOf(unit(e.id)) });
          break;

        case 'stagger':
          if (!interrupted.has(e.id) && !wardBroken.has(e.id)) out.sfx('break', { pan: panOf(unit(e.id)) });
          break;

        case 'stun':
          if (!interrupted.has(e.id)) out.sfx('stun', { pan: panOf(unit(e.id)), delay: 0.05 });
          break;

        case 'windup': {
          const pan = panOf(unit(e.id));
          if (e.interruptible) out.sfx('windup', { pan });
          else out.sfx('unstoppable', { pan, volume: e.kind === 'nova' || e.kind === 'drainLantern' ? 1.15 : 0.9 });
          break;
        }

        case 'windupChange':
          if (e.interruptible) out.sfx('windupFlip', { pan: panOf(unit(e.id)) });
          break;

        case 'ability': {
          const pan = panOf(unit(e.id));
          switch (e.effect) {
            case 'strike':
              out.sfx('heavyWhoosh', { pan });
              break;
            case 'nova':
              out.sfx('nova');
              break;
            case 'doom':
              out.sfx('doom', { pan });
              break;
            case 'freeze':
              out.sfx('freeze', { pan: -0.3 });
              break;
            case 'summon':
              out.sfx('summon', { pan });
              break;
            case 'ward':
            case 'wardAllies':
              out.sfx('wardUp', { pan });
              break;
            case 'healAllies':
              out.sfx('enemyHeal', { pan });
              break;
            case 'submerge':
              out.sfx('splash', { pan });
              break;
            case 'drainLantern':
              out.sfx('drain', { volume: 1.3, pitch: 0.8 });
              break;
            case 'buffAllies':
              out.sfx('empower', { pan });
              break;
          }
          break;
        }

        case 'wave':
          if (e.elite && !e.routed) out.sfx('eliteWarn');
          break;

        case 'rout':
          out.sfx('rout', { pitch: Math.pow(2, (Math.min(e.chain, 8) - 1) / 12 * 2) });
          break;

        case 'bossIntro':
          out.sfx('bossIntro');
          if (this.autoMusic) out.music(bossTrackFor(b.area.id));
          break;

        case 'bossPhase':
          out.sfx('bossPhase', { pan: panOf(unit(e.id)) });
          break;

        case 'bossDefeated':
          out.sfx('bossDefeat', { volume: e.final ? 1.1 : 1 });
          if (this.autoMusic) out.music(null);
          break;

        case 'eliteDefeated':
          out.sfx('eliteDefeat', { pan: panOf(unit(e.id)) * 0.5 });
          break;

        case 'mark':
          if (e.on) out.sfx('mark', { pan: panOf(unit(e.id)) });
          break;

        case 'lantern':
          if (e.low) out.sfx('lanternLow');
          break;

        case 'flare':
          out.sfx('flare');
          break;

        case 'lastLight':
          out.sfx('lastLight');
          break;

        case 'descent':
          out.sfx('descent');
          if (this.autoMusic) out.music(e.area);
          break;

        case 'overdrive':
          out.sfx(e.on ? 'overdrive' : 'overdriveEnd');
          break;

        case 'vow':
          if (e.ready) out.sfx('vow', { pan: -0.3 });
          else out.sfx('break', { pan: 0.2, delay: 0.1, volume: 0.8, pitch: 0.85 }); // Vowbreaker
          break;

        case 'emberNova':
          out.sfx('emberNova');
          break;

        case 'heavySwing':
          out.sfx('swing', { pan: panOf(unit(e.src)) });
          break;

        case 'runEnd':
          if (e.reason === 'victory') out.sfx('victory');
          else if (e.reason === 'wiped') out.sfx('defeat');
          else if (e.reason === 'lantern') out.sfx('lanternOut');
          else out.sfx('retreat');
          break;

        default:
          break; // text, interrupt-adjacent flashes etc. are visual only
      }
    }
  }
}
