// Bottom battle HUD: lantern, stage pips, run loot, retreat, party panel, skill buttons, Overdrive.
import { AREAS } from '../data/areas.ts';
import { HEROES } from '../data/heroes.ts';
import { BAL } from '../core/balance.ts';
import type { Battle } from '../core/battle.ts';
import { activeVows } from '../core/mods.ts';
import { benchingVow } from '../core/state.ts';
import { AREA_ORDER, HERO_ORDER, type BattleEvent, type HeroId, type SaveData, type Unit } from '../core/types.ts';
import type { IconKey } from '../render/sprites/index.ts';
import { clamp, clear, flash, fmt, h, icon, isTouch, setAttr, setText, setVar, toggleClass, touchHold } from './dom.ts';
import { heroMechanic, perfectShort } from './skill-description.ts';

export interface HudHost {
  getSave(): SaveData;
  castSkill(h: HeroId): void;
  toggleAuto(h: HeroId): void;
  activateOverdrive(): void;
  retreat(): void;
}

const SKILL_ICON: Record<HeroId, IconKey> = {
  guardian: 'skill_shieldBash',
  ranger: 'skill_arrowRain',
  arcanist: 'skill_meteor',
  oracle: 'skill_sanctuary',
};

interface HeroCard {
  hero: HeroId;
  root: HTMLElement;
  lv: HTMLElement;
  fill: HTMLElement;
  ghost: HTMLElement;
  barrier: HTMLElement;
  hpText: HTMLElement;
  chips: HTMLElement;
  state: HTMLElement;
  vow: HTMLElement | null;
  ghostFrac: number;
  ghostHold: number;
  chipSig: string;
}

interface SkillSlot {
  hero: HeroId;
  root: HTMLElement;
  btn: HTMLButtonElement;
  cdText: HTMLElement;
  auto: HTMLButtonElement;
  pip: HTMLElement;
  vow: HTMLElement;
  locked: boolean;
  /** Name of the vow keeping this (recruited) hero at camp, when locked for that reason. */
  benchedBy: string | null;
}

interface Chip {
  key: string;
  label: string;
  icon?: IconKey;
  cls: string;
  tip: string;
}

function recruitHint(hero: HeroId): string {
  const area = AREA_ORDER.map((a) => AREAS[a]).find((a) => a.recruit === hero);
  return area ? `${area.name}のボス（${area.bossName}）を倒すと加入` : 'まだ仲間になっていない';
}

export class BattleHud {
  readonly el: HTMLElement;
  private host: HudHost;
  private b: Battle | null = null;

  // strip
  private lanternEl: HTMLElement;
  private lanternFill: HTMLElement;
  private lanternFlare: HTMLElement;
  private lanternSec: HTMLElement;
  private lanternTag: HTMLElement;
  private segChips: HTMLElement;
  private pipsEl: HTMLElement;
  private pips: HTMLElement[] = [];
  private bossTimer: HTMLElement;
  private lootGold: HTMLElement;
  private lootEmber: HTMLElement;
  private lootShard: HTMLElement;
  private lootEmberWrap: HTMLElement;
  private lootShardWrap: HTMLElement;
  private retreatBtn: HTMLButtonElement;
  private retreatArmed = 0;
  private strip: HTMLElement;
  private areaEl: HTMLElement;
  private areaName: HTMLElement;
  private areaVows: HTMLElement;
  /** Lantern, stage pips and (phones) the area name: see dock(). */
  readonly topEl: HTMLElement;

  // main
  private partyEl: HTMLElement;
  private skillsEl: HTMLElement;
  private odWrap: HTMLElement;
  private odBtn: HTMLButtonElement;
  private hint: HTMLElement;
  private odVal: HTMLElement;
  private cards: HeroCard[] = [];
  private slots = {} as Record<HeroId, SkillSlot>;
  private unitHero = new Map<number, HeroId>();

  private pipSig = '';
  private segSig = '';
  private recordStage = 0;
  private lastLoot = { gold: -1, embers: -1, shards: -1 };

  constructor(host: HudHost) {
    this.host = host;

    // ── lantern
    this.lanternFill = h('div', { class: 'lantern-fill' });
    this.lanternFlare = h('div', { class: 'lantern-flare' });
    this.lanternSec = h('span', { class: 'lantern-sec', text: '60.0' });
    this.lanternTag = h('span', { class: 'lantern-tag' });
    this.lanternEl = h(
      'div',
      { class: 'lantern', tip: 'ランタン|遠征の残り時間。移動中も戦闘中も燃え続け、尽きると帰還する。\nボス戦の開始時はFlareで一定値まで回復する（炎のマーク）。' },
      h('div', { class: 'lantern-icon' }, icon('lantern', 2)),
      h('div', { class: 'lantern-bar' }, this.lanternFill, this.lanternFlare, h('div', { class: 'lantern-shine' })),
      h('div', { class: 'lantern-read' }, this.lanternSec, h('span', { class: 'lantern-unit', text: 's' })),
      this.lanternTag,
    );

    // ── stages
    this.segChips = h('div', { class: 'seg-chips' });
    this.pipsEl = h('div', { class: 'pips' });
    this.bossTimer = h('div', { class: 'boss-timer hidden' });
    const stages = h('div', { class: 'stages' }, this.segChips, this.pipsEl, this.bossTimer);
    // The area's name repeats the top bar's; only phones show it (their top bar has no room).
    this.areaName = h('span', { class: 'hud-area-name' });
    this.areaVows = h('span', { class: 'hud-area-vows' });
    this.areaEl = h('div', { class: 'hud-area' }, this.areaName, this.areaVows);
    this.topEl = h('div', { class: 'hud-top' }, this.lanternEl, stages, this.areaEl);

    // ── run loot
    this.lootGold = h('span', { class: 'rl-val', text: '0' });
    this.lootEmber = h('span', { class: 'rl-val', text: '0' });
    this.lootShard = h('span', { class: 'rl-val', text: '0' });
    this.lootEmberWrap = h('span', { class: 'rl-item rl-ember hidden' }, icon('ember', 1), this.lootEmber);
    this.lootShardWrap = h('span', { class: 'rl-item rl-shard hidden' }, icon('shard', 1), this.lootShard);
    const runLoot = h(
      'div',
      { class: 'run-loot', tip: '今回の獲得|撤退・全滅・ランタン切れでも、獲得したものはすべて持ち帰れる。' },
      h('span', { class: 'rl-label', text: '今回' }),
      h('span', { class: 'rl-item rl-gold' }, icon('gold', 1), this.lootGold),
      this.lootEmberWrap,
      this.lootShardWrap,
    );

    this.retreatBtn = h('button', {
      class: 'btn small retreat',
      text: '撤退',
      tip: '撤退|ここで遠征を終えて野営地へ戻る。獲得物はすべて持ち帰れる。',
      on: { click: () => this.onRetreatClick() },
    });

    this.strip = h('div', { class: 'hud-strip' }, this.topEl, runLoot, this.retreatBtn);

    // ── main row
    this.partyEl = h('div', { class: 'party' });
    this.skillsEl = h('div', { class: 'skills' });
    this.odVal = h('span', { class: 'od-val', text: '0%' });
    let odHeld = () => false;
    this.odBtn = h(
      'button',
      {
        class: 'overdrive',
        on: {
          click: () => {
            if (!odHeld()) this.host.activateOverdrive();
          },
          pointerenter: (e: PointerEvent) => {
            if (e.pointerType !== 'touch') this.showOverdriveHint();
          },
          pointerleave: (e: PointerEvent) => {
            if (e.pointerType !== 'touch') this.hideHint();
          },
          focus: (e: Event) => {
            if ((e.currentTarget as HTMLElement).matches(':focus-visible')) this.showOverdriveHint();
          },
          blur: () => this.hideHint(),
        },
      },
      h('span', { class: 'od-ring' }),
      h('span', { class: 'od-core' }, h('span', { class: 'od-label', text: 'OVER\nDRIVE' }), this.odVal),
      h('span', { class: 'key-badge od-key', text: 'Space' }),
    );
    odHeld = touchHold(this.odBtn, () => this.showOverdriveHint(), () => this.hideHint());
    this.odWrap = h('div', { class: 'od-wrap hidden' }, this.odBtn);

    for (const hero of HERO_ORDER) this.slots[hero] = this.makeSlot(hero);

    // While fighting, skills explain themselves in one line over the floor, not in a tooltip over the field.
    this.hint = h('div', { class: 'skill-hint', attrs: { 'aria-hidden': 'true' } });
    // Other HUD tooltips wait a moment, so a mouse passing by does not cover the field.
    this.el = h('section', { class: 'hud', attrs: { 'aria-label': 'バトルHUD' }, dataset: { tipDelay: '450' } }, this.strip, h('div', { class: 'hud-main' }, this.partyEl, this.skillsEl, this.odWrap), this.hint);
  }

  /** Lantern and stage progress live in the HUD's strip, or (phones) in `slot` above the stage. */
  dock(slot: HTMLElement | null): void {
    const parent = slot ?? this.strip;
    if (this.topEl.parentElement === parent) return;
    if (slot) slot.appendChild(this.topEl);
    else this.strip.prepend(this.topEl);
  }

  // ─────────────────────────── public ───────────────────────────

  skillEl(hero: HeroId): HTMLElement {
    return this.slots[hero].root;
  }

  autoEl(hero: HeroId): HTMLElement {
    return this.slots[hero].auto;
  }

  overdriveEl(): HTMLElement {
    return this.odBtn;
  }

  /** Attach to a new battle. */
  bind(b: Battle): void {
    this.b = b;
    const save = this.host.getSave();
    this.unitHero.clear();
    for (const u of b.heroes) this.unitHero.set(u.id, u.key as HeroId);
    this.recordStage = save.areas[b.area.id].best;
    this.pipSig = '';
    this.segSig = '';
    this.lastLoot = { gold: -1, embers: -1, shards: -1 };
    this.retreatArmed = 0;
    this.retreatBtn.textContent = '撤退';
    this.retreatBtn.classList.remove('armed');
    this.retreatBtn.disabled = false;

    // party cards
    clear(this.partyEl);
    this.cards = b.heroes.map((u) => this.makeCard(u, b));
    for (const c of this.cards) this.partyEl.appendChild(c.root);
    toggleClass(this.partyEl, 'solo', this.cards.length === 1);
    toggleClass(this.partyEl, 'duo', this.cards.length === 2);

    // skills
    clear(this.skillsEl);
    for (const hero of HERO_ORDER) {
      const recruited = b.party.includes(hero);
      const benchedBy = recruited ? null : (benchingVow(this.host.getSave(), hero)?.name ?? null);
      const slot = this.slots[hero];
      if (slot.locked === recruited || slot.benchedBy !== benchedBy) {
        this.slots[hero] = this.makeSlot(hero, recruited, benchedBy);
      }
      const s = this.slots[hero];
      toggleClass(s.auto, 'hidden', !(recruited && b.mods.autoCast));
      toggleClass(s.pip, 'hidden', !(recruited && b.mods.emberbond));
      toggleClass(s.vow, 'hidden', !(hero === 'guardian' && b.mods.unbrokenVow));
      this.skillsEl.appendChild(s.root);
    }
    toggleClass(this.odWrap, 'hidden', !b.mods.overdrive);
    this.hideHint();
    this.update(0);
  }

  // ─────────────────────────── one-line hint ───────────────────────────

  private showSkillHint(hero: HeroId, anchor: HTMLElement): void {
    const b = this.b;
    if (!b || !b.party.includes(hero)) return;
    const sk = HEROES[hero].skill, cd = b.skills[hero].maxCooldown;
    this.showHint(anchor, isTouch() ? sk.name : `${sk.name} [${sk.key}]`, `CD ${cd.toFixed(cd % 1 ? 1 : 0)}秒`, 'PERFECT', perfectShort(hero));
  }

  private showOverdriveHint(): void {
    const b = this.b;
    if (!b) return;
    this.showHint(this.odBtn, isTouch() ? 'Overdrive' : 'Overdrive [Space]',`${+b.overdriveMax.toFixed(1)}秒間`, '効果', '攻撃速度×2・CD回復×2・与ダメ+50%');
  }

  /** Name, a short fact and a tagged condition, centred over `anchor` just above the HUD (on the floor). */
  private showHint(anchor: HTMLElement, name: string, meta: string, tag: string, text: string): void {
    const el = this.hint;
    el.replaceChildren(
      h('b', { class: 'sh-name', text: name }),
      h('span', { class: 'sh-meta', text: meta }),
      h('span', { class: 'sh-tag', text: tag }),
      h('span', { class: 'sh-text', text }),
    );
    const hud = this.el.getBoundingClientRect(), a = anchor.getBoundingClientRect();
    const half = el.offsetWidth / 2, margin = 8;
    const x = clamp(a.left + a.width / 2 - hud.left, half + margin, Math.max(half + margin, hud.width - half - margin));
    el.style.left = `${Math.round(x)}px`;
    el.classList.add('show');
  }

  private hideHint(): void {
    this.hint.classList.remove('show');
  }

  update(dt: number): void {
    const b = this.b;
    if (!b) return;
    if (this.retreatArmed > 0) {
      this.retreatArmed -= dt;
      if (this.retreatArmed <= 0) this.disarmRetreat();
    }
    this.retreatBtn.disabled = b.ended;
    this.updateLantern(b);
    this.updateStages(b);
    this.updateLoot(b);
    for (const c of this.cards) this.updateCard(c, b, dt);
    for (const hero of HERO_ORDER) this.updateSlot(this.slots[hero], b);
    if (b.mods.overdrive) this.updateOverdrive(b);
  }

  onEvents(events: BattleEvent[]): void {
    const b = this.b;
    if (!b) return;
    for (const e of events) {
      switch (e.type) {
        case 'perfect':
          flash(this.slots[e.hero].root, 'perfect', 900);
          break;
        case 'skill':
          flash(this.slots[e.hero].root, e.auto ? 'cast-auto' : 'cast', 380);
          break;
        case 'emberPip':
          if (e.on) flash(this.slots[e.hero].pip, 'lit-flash', 600);
          break;
        case 'emberNova':
          for (const hero of HERO_ORDER) flash(this.slots[hero].root, 'nova', 900);
          break;
        case 'vow':
          if (e.ready) flash(this.slots.guardian.root, 'vow-ready', 900);
          break;
        case 'damage': {
          const card = this.cardFor(e.dst);
          if (card) {
            const u = b.unitById(e.dst);
            if (u && (e.big || e.amount >= u.maxHp * 0.12)) flash(card.root, 'hit-big', 420);
            else if (e.amount > 0) flash(card.root, 'hit', 220);
            if (e.blocked) flash(card.root, 'blocked', 300);
          }
          break;
        }
        case 'heal': {
          const card = this.cardFor(e.dst);
          if (card && e.amount > 0) flash(card.root, 'healed', 500);
          break;
        }
        case 'barrier': {
          const card = this.cardFor(e.dst);
          if (card) flash(card.root, 'shielded', 500);
          break;
        }
        case 'barrierBreak': {
          const card = this.cardFor(e.dst);
          if (card) flash(card.root, 'barrier-break', 450);
          break;
        }
        case 'death':
          if (e.side === 'hero') {
            const card = this.cardFor(e.id);
            if (card) flash(card.root, 'down', 700);
          }
          break;
        case 'revive': {
          const card = this.cardFor(e.id);
          if (card) flash(card.root, 'revived', 900);
          break;
        }
        case 'lantern':
          if (e.low) flash(this.lanternEl, 'warn', 1200);
          break;
        case 'flare':
          flash(this.lanternEl, 'flare', 1200);
          break;
        case 'lastLight':
          flash(this.lanternEl, 'flare', 1200);
          break;
        case 'overdrive':
          if (e.on) flash(this.odBtn, 'burst', 700);
          break;
        case 'wave':
          this.pipSig = '';
          break;
        case 'descent':
          this.segSig = '';
          this.pipSig = '';
          this.recordStage = this.host.getSave().areas[e.area].best;
          break;
      }
    }
  }

  /** Feedback when a skill key is pressed but can't fire. */
  denied(hero: HeroId): void {
    flash(this.slots[hero].root, 'denied', 320);
  }

  // ─────────────────────────── builders ───────────────────────────

  private makeSlot(hero: HeroId, recruited = false, benchedBy: string | null = null): SkillSlot {
    const def = HEROES[hero];
    const sk = def.skill;
    const cdText = h('span', { class: 'skill-cd-text' });
    const pip = h('span', { class: 'skill-pip hidden', tip: 'Emberbond|PERFECTで点灯（15秒）。4つ全て灯るとEmber Nova！' });
    const vow = h('span', { class: 'skill-vow hidden', tip: 'Unbroken Vow|防いだダメージを蓄積。満タンで次のShield BashがVowbreakerに。' });
    const auto = h('button', {
      class: 'skill-auto hidden',
      text: 'AUTO',
      attrs: { 'aria-pressed': 'false', 'aria-label': `${sk.name} 自動発動` },
      tip: 'AUTO|ONにすると準備でき次第自動で発動する。\n（自動発動はPERFECTにならない）',
      on: {
        click: (e: MouseEvent) => {
          e.stopPropagation();
          this.host.toggleAuto(hero);
        },
      },
    });
    let btn: HTMLButtonElement;
    if (recruited) {
      // Mouse: the hint follows the pointer. Keyboard: focus. Finger: hold the button (that press does not cast).
      let wasHeld = () => false;
      btn = h(
        'button',
        {
          class: 'skill',
          attrs: { 'aria-label': `${sk.name}（${sk.key}）PERFECT：${sk.perfect}` },
          on: {
            click: () => {
              if (!wasHeld()) this.host.castSkill(hero);
            },
            pointerenter: (e: PointerEvent) => {
              if (e.pointerType !== 'touch') this.showSkillHint(hero, e.currentTarget as HTMLElement);
            },
            pointerleave: (e: PointerEvent) => {
              if (e.pointerType !== 'touch') this.hideHint();
            },
            focus: (e: Event) => {
              const el = e.currentTarget as HTMLElement;
              if (el.matches(':focus-visible')) this.showSkillHint(hero, el);
            },
            blur: () => this.hideHint(),
          },
        },
        h('span', { class: 'skill-face' }, icon(SKILL_ICON[hero], 2, 'skill-icon')),
        h('span', { class: 'skill-name', text: sk.name }),
        h('span', { class: 'skill-sweep' }),
        cdText,
        h('span', { class: 'key-badge skill-key', text: sk.key }),
        h('span', { class: 'skill-perfect', text: 'PERFECT!' }),
      );
      const skillBtn = btn;
      wasHeld = touchHold(skillBtn, () => this.showSkillHint(hero, skillBtn), () => this.hideHint());
    } else if (benchedBy) {
      // recruited, but a vow left them at camp this cycle
      btn = h(
        'button',
        { class: 'skill', disabled: true, attrs: { 'aria-label': `${benchedBy}で不参加` }, tip: `${benchedBy}|${def.name}はこのサイクル野営地に残る` },
        h('span', { class: 'skill-face' }, icon(SKILL_ICON[hero], 2, 'skill-icon')),
        h('span', { class: 'skill-name', text: '待機' }),
        h('span', { class: 'key-badge skill-key', text: sk.key }),
      );
    } else {
      btn = h(
        'button',
        { class: 'skill', disabled: true, attrs: { 'aria-label': '未加入' }, tip: `？？？|${recruitHint(hero)}` },
        h('span', { class: 'skill-face' }, h('span', { class: 'skill-q', text: '?' })),
        h('span', { class: 'skill-name', text: '???' }),
        h('span', { class: 'key-badge skill-key', text: sk.key }),
      );
    }
    const root = h('div', { class: `skill-slot hero-${hero}${recruited ? '' : ' locked'}`, style: `--hc: ${def.color}` }, btn, auto, pip, vow);
    return { hero, root, btn, cdText, auto, pip, vow, locked: !recruited, benchedBy };
  }

  private makeCard(u: Unit, b: Battle): HeroCard {
    const hero = u.key as HeroId;
    const def = HEROES[hero];
    const lv = h('span', { class: 'hc-lv' });
    const fill = h('div', { class: 'hc-hp-fill' });
    const ghost = h('div', { class: 'hc-hp-ghost' });
    const barrier = h('div', { class: 'hc-barrier' });
    const hpText = h('span', { class: 'hc-hp-text' });
    const chips = h('span', { class: 'hc-chips' });
    const state = h('div', { class: 'hc-state' });
    const vow = hero === 'guardian' && b.mods.unbrokenVow ? h('div', { class: 'hc-vow' }, h('div', { class: 'hc-vow-fill' })) : null;
    const root = h(
      'div',
      { class: `hero-card hero-${hero}`, style: `--hc: ${def.color}`, tip: `${def.name}｜${def.title}|${heroMechanic(hero, b.mods)}` },
      h('div', { class: 'hc-portrait' }, icon(`hero_${hero}` as IconKey, 2)),
      h(
        'div',
        { class: 'hc-body' },
        h('div', { class: 'hc-top' }, h('span', { class: 'hc-name', text: def.name }), lv, chips),
        h('div', { class: 'hc-hp' }, ghost, fill, barrier, hpText),
        vow,
      ),
      state,
    );
    return { hero, root, lv, fill, ghost, barrier, hpText, chips, state, vow, ghostFrac: 1, ghostHold: 0, chipSig: '' };
  }

  private cardFor(unitId: number): HeroCard | null {
    const hero = this.unitHero.get(unitId);
    if (!hero) return null;
    return this.cards.find((c) => c.hero === hero) ?? null;
  }

  // ─────────────────────────── per-frame ───────────────────────────

  private updateLantern(b: Battle): void {
    const last = b.lastLightActive > 0;
    const frac = last ? clamp(b.lastLightActive / BAL.lastLightTime, 0, 1) : clamp(b.lantern / b.lanternMax, 0, 1);
    setVar(this.lanternFill, '--f', frac.toFixed(4));
    const sec = last ? b.lastLightActive : b.lantern;
    setText(this.lanternSec, sec.toFixed(1));
    const frozen = !last && b.lanternFrozen && !b.ended;
    const low = !last && !frozen && b.lantern <= 10 && !b.ended;
    toggleClass(this.lanternEl, 'frozen', frozen);
    toggleClass(this.lanternEl, 'low', low);
    toggleClass(this.lanternEl, 'critical', low && b.lantern <= 5);
    toggleClass(this.lanternEl, 'lastlight', last);
    toggleClass(this.lanternEl, 'over', !last && b.lantern > b.lanternMax);
    setText(this.lanternTag, last ? 'LAST LIGHT' : frozen ? '停止中' : low ? '残りわずか' : '');
    // Flare marker: the lantern floor at the boss intro (only useful before the boss)
    const flare = b.area.flare;
    const showFlare = !b.isBossStage && flare < b.lanternMax && !last;
    toggleClass(this.lanternFlare, 'hidden', !showFlare);
    if (showFlare) setVar(this.lanternFlare, '--x', (flare / b.lanternMax).toFixed(4));
  }

  private updateStages(b: Battle): void {
    const segSig = b.segments.map((s) => `${s.areaId}${s.bossDefeated ? '+' : ''}`).join(',');
    if (segSig !== this.segSig) {
      this.segSig = segSig;
      clear(this.segChips);
      b.segments.slice(0, -1).forEach((s) => {
        const a = AREAS[s.areaId];
        this.segChips.appendChild(
          h('span', { class: `seg-chip${s.bossDefeated ? ' done' : ''}`, tip: `${a.name}|${s.bossDefeated ? '踏破済み（Descent）' : `ステージ${s.stageReached}`}` }, s.bossDefeated ? icon('crown', 1) : null, h('span', { text: `${a.index + 1}` })),
        );
      });
      toggleClass(this.segChips, 'hidden', b.segments.length <= 1);
      if (b.segments.length > 1) this.segChips.appendChild(h('span', { class: 'seg-arrow', text: '▸' }));
    }
    const ended = b.ended;
    const sig = `${b.area.id}|${b.stage}|${b.stagesCleared}|${ended}`;
    if (sig !== this.pipSig) {
      const first = this.pipSig === '';
      this.pipSig = sig;
      setText(this.areaName, b.area.name);
      // phones have no top bar: the vows binding this cycle ride along with the area name (never cut off)
      const vows = activeVows(this.host.getSave());
      setText(this.areaVows, vows.length === 1 ? vows[0].name : vows.length ? `誓約×${vows.length}` : '');
      if (first || this.pips.length !== 10) this.buildPips();
      for (let i = 0; i < 10; i++) {
        const p = this.pips[i];
        toggleClass(p, 'cleared', i < b.stagesCleared);
        toggleClass(p, 'current', i === b.stage && !ended && b.stagesCleared <= i);
        toggleClass(p, 'record', i === this.recordStage - 1 && this.recordStage > 0 && this.recordStage < 10);
      }
      const cur = this.pips[Math.min(9, b.stage)];
      if (cur && !first) flash(cur, 'enter', 600);
      setAttr(this.pipsEl, 'data-tip', `${b.area.name}|ステージ ${Math.min(10, b.stage + 1)} / 10\n5：エリート　10：ボス${this.recordStage > 0 ? `\nこれまでの最高到達：${this.recordStage}` : ''}`);
    }
    // boss timer
    const bossFight = b.isBossStage && (b.phase === 'fight' || b.phase === 'victory') && b.bossFightStart > 0;
    toggleClass(this.bossTimer, 'hidden', !bossFight);
    if (bossFight) {
      const seg = b.segments[b.segments.length - 1];
      const t = seg.bossTime ?? b.time - b.bossFightStart;
      const best = this.host.getSave().areas[b.area.id].bossBestTime;
      setText(this.bossTimer, `BOSS ${t.toFixed(1)}s${best > 0 ? `　記録 ${best.toFixed(1)}s` : ''}`);
      toggleClass(this.bossTimer, 'beat', best > 0 && t < best && seg.bossDefeated);
    }
  }

  private buildPips(): void {
    clear(this.pipsEl);
    this.pips = [];
    for (let i = 0; i < 10; i++) {
      const kind = i === 9 ? 'boss' : i === 4 ? 'elite' : 'normal';
      const p = h('span', { class: `pip pip-${kind}` }, kind === 'boss' ? icon('crown', 1) : kind === 'elite' ? icon('skull', 1) : h('span', { class: 'pip-dot' }));
      this.pips.push(p);
      this.pipsEl.appendChild(p);
    }
  }

  private updateLoot(b: Battle): void {
    const l = b.loot;
    if (l.gold !== this.lastLoot.gold) {
      if (this.lastLoot.gold >= 0 && l.gold > this.lastLoot.gold) flash(this.lootGold.parentElement!, 'bump', 240);
      this.lastLoot.gold = l.gold;
      setText(this.lootGold, fmt(l.gold));
    }
    if (l.embers !== this.lastLoot.embers) {
      if (this.lastLoot.embers >= 0 && l.embers > this.lastLoot.embers) flash(this.lootEmberWrap, 'bump', 300);
      this.lastLoot.embers = l.embers;
      setText(this.lootEmber, fmt(l.embers));
    }
    if (l.shards !== this.lastLoot.shards) {
      if (this.lastLoot.shards >= 0 && l.shards > this.lastLoot.shards) flash(this.lootShardWrap, 'bump', 300);
      this.lastLoot.shards = l.shards;
      setText(this.lootShard, fmt(l.shards));
    }
    toggleClass(this.lootEmberWrap, 'hidden', l.embers <= 0);
    toggleClass(this.lootShardWrap, 'hidden', l.shards <= 0);
  }

  private updateCard(c: HeroCard, b: Battle, dt: number): void {
    const u = b.heroUnit(c.hero);
    if (!u) return;
    const frac = u.alive ? clamp(u.hp / u.maxHp, 0, 1) : 0;
    // damage trail: hold briefly, then drain toward the real value
    if (frac >= c.ghostFrac) {
      c.ghostFrac = frac;
      c.ghostHold = 0.35;
    } else if (c.ghostHold > 0) {
      c.ghostHold -= dt;
    } else {
      c.ghostFrac = Math.max(frac, c.ghostFrac - dt * 0.9);
    }
    setVar(c.fill, '--f', frac.toFixed(4));
    setVar(c.ghost, '--f', c.ghostFrac.toFixed(4));
    const bar = u.alive ? clamp(u.barrier / u.maxHp, 0, 1) : 0;
    setVar(c.barrier, '--f', bar.toFixed(4));
    toggleClass(c.root, 'has-barrier', bar > 0);
    setText(c.hpText, u.alive ? `${fmt(Math.ceil(u.hp))}${u.barrier > 0.5 ? ` +${fmt(Math.ceil(u.barrier))}` : ''} / ${fmt(Math.ceil(u.maxHp))}` : '');
    setText(c.lv, `Lv ${u.level}`);
    toggleClass(c.root, 'dead', !u.alive);
    toggleClass(c.root, 'low', u.alive && frac <= 0.3);
    toggleClass(c.root, 'targeted', u.alive && b.enemies.some((e) => e.alive && e.windup && e.windup.targetId === u.id));
    setText(c.state, u.alive ? '' : u.reviveTimer > 0 ? `復活まで ${u.reviveTimer.toFixed(1)}s` : '戦闘不能');
    if (c.vow) {
      const cap = u.maxHp * BAL.vowThreshold;
      const vf = cap > 0 ? clamp(u.vow / cap, 0, 1) : 0;
      setVar(c.vow, '--f', vf.toFixed(3));
      toggleClass(c.vow, 'ready', vf >= 1);
    }
    this.updateChips(c, u);
  }

  private updateChips(c: HeroCard, u: Unit): void {
    const chips: Chip[] = [];
    if (u.alive) {
      if (u.doom) chips.push({ key: 'doom', label: u.doom.time.toFixed(1), icon: 'status_doom', cls: 'bad', tip: 'Doom|時間切れで大ダメージ。SanctuaryかBarrierで防げ！' });
      if (u.frozen > 0) chips.push({ key: 'frozen', label: u.frozen.toFixed(1), icon: 'status_frozen', cls: 'bad', tip: '凍結|行動できない。Sanctuaryで解除できる。' });
      if (u.stun > 0) chips.push({ key: 'stun', label: '', icon: 'status_stun', cls: 'bad', tip: 'スタン|行動できない。' });
      if (u.dot) chips.push({ key: 'dot', label: '毒', cls: 'bad poison', tip: '毒|継続ダメージ。Sanctuaryで解除できる。' });
      if (u.chill > 0) chips.push({ key: 'chill', label: '鈍', cls: 'bad chill', tip: 'Chill|攻撃速度 -30%。' });
      if (u.taunt > 0) chips.push({ key: 'taunt', label: '挑', cls: 'good', tip: '挑発|敵の攻撃を引きつけている。' });
      if (u.haste > 0 && u.hasteMult > 1) chips.push({ key: 'haste', label: '速', cls: 'good', tip: '加速|攻撃速度アップ中。' });
      if (u.dmgBuff > 0 && u.dmgBuffMult > 1) chips.push({ key: 'buff', label: '強', cls: 'good', tip: '強化|与ダメージアップ中。' });
    }
    // Only rebuild the DOM when the set of chips changes; update numbers in place.
    const sig = chips.map((x) => x.key).join(',');
    if (sig !== c.chipSig) {
      c.chipSig = sig;
      clear(c.chips);
      for (const x of chips) {
        c.chips.appendChild(h('span', { class: `chip ${x.cls}`, dataset: { k: x.key }, tip: x.tip }, x.icon ? icon(x.icon, 1) : null, h('span', { class: 'chip-label', text: x.label })));
      }
    } else {
      chips.forEach((x, i) => {
        const el = c.chips.children[i]?.querySelector('.chip-label');
        if (el) setText(el, x.label);
      });
    }
  }

  private updateSlot(s: SkillSlot, b: Battle): void {
    if (s.locked) return;
    const st = b.skills[s.hero];
    const u = b.heroUnit(s.hero);
    const alive = !!u && u.alive;
    const ready = b.skillReady(s.hero);
    const cdFrac = st.maxCooldown > 0 ? clamp(st.cooldown / st.maxCooldown, 0, 1) : 0;
    setVar(s.root, '--cd', cdFrac.toFixed(4));
    setText(s.cdText, st.cooldown > 0.05 ? (st.cooldown < 10 ? st.cooldown.toFixed(1) : st.cooldown.toFixed(0)) : '');
    toggleClass(s.root, 'ready', ready);
    toggleClass(s.root, 'cooling', st.cooldown > 0.05);
    toggleClass(s.root, 'unavailable', !alive || (!!u && (u.frozen > 0 || u.stun > 0)));
    toggleClass(s.root, 'idle', !ready && st.cooldown <= 0.05);
    if (b.mods.autoCast) {
      toggleClass(s.auto, 'on', st.auto);
      setAttr(s.auto, 'aria-pressed', st.auto ? 'true' : 'false');
      toggleClass(s.root, 'auto-on', st.auto);
    }
    if (b.mods.emberbond) toggleClass(s.pip, 'lit', st.pip > 0);
    if (s.hero === 'guardian' && b.mods.unbrokenVow && u) {
      const cap = u.maxHp * BAL.vowThreshold;
      const vf = cap > 0 ? clamp(u.vow / cap, 0, 1) : 0;
      setVar(s.vow, '--f', vf.toFixed(3));
      toggleClass(s.root, 'vow-full', vf >= 1);
    }
    // Interrupt cue: Guardian glows when an orange windup is on screen and Bash is ready.
    if (s.hero === 'guardian') {
      const threat = ready && b.enemies.some((e) => e.alive && e.windup && e.windup.interruptible);
      toggleClass(s.root, 'cue', threat);
    } else if (s.hero === 'oracle') {
      const threat = ready && b.enemies.some((e) => e.alive && e.windup && !e.windup.interruptible && (e.windup.ability.effect.kind === 'nova' || e.windup.ability.effect.kind === 'drainLantern'));
      toggleClass(s.root, 'cue', threat);
      toggleClass(s.root, 'cue-purple', threat);
    }
  }

  private updateOverdrive(b: Battle): void {
    const active = b.overdriveActive > 0;
    const g = active ? b.overdriveActive / Math.max(0.001, b.overdriveMax) : b.overdriveGauge / 100;
    setVar(this.odBtn, '--g', clamp(g, 0, 1).toFixed(4));
    const ready = b.canOverdrive();
    toggleClass(this.odBtn, 'ready', ready);
    toggleClass(this.odBtn, 'active', active);
    setText(this.odVal, active ? `${b.overdriveActive.toFixed(1)}s` : ready ? 'READY' : `${Math.floor(b.overdriveGauge)}%`);
  }

  // ─────────────────────────── retreat ───────────────────────────

  private onRetreatClick(): void {
    if (!this.b || this.b.ended) return;
    if (this.retreatArmed > 0) {
      this.disarmRetreat();
      this.host.retreat();
      return;
    }
    this.retreatArmed = 2.5;
    this.retreatBtn.textContent = '本当に撤退？';
    this.retreatBtn.classList.add('armed');
  }

  private disarmRetreat(): void {
    this.retreatArmed = 0;
    this.retreatBtn.textContent = '撤退';
    this.retreatBtn.classList.remove('armed');
  }
}
