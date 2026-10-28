// パーティ / Party tab: one row per hero with stats, milestone and Gold level purchases.
// Skill texts show beside the row on wide panels, or below it when 「スキル説明」 is toggled.
import { BAL, gearTier, nextMilestone } from '../../core/balance.ts';
import {
  buyLevels,
  buyLevelsEvenly,
  heroLevelCost,
  heroStats,
  maxAffordableLevels,
  recruitedHeroes,
  skillCooldown,
  type HeroStats,
} from '../../core/state.ts';
import { AREA_ORDER, HERO_ORDER, type AreaId, type HeroId, type SaveData } from '../../core/types.ts';
import { AREAS } from '../../data/areas.ts';
import { HEROES } from '../../data/heroes.ts';
import { getStoryFrameIndex, getStoryActionDuration } from '../../render/storybook/characters.ts';
import type { SpritePose } from '../../render/sprites/index.ts';
import { drawSprite, fmt, fmtPct, fmtStat, h, icon, setText } from './dom.ts';
import { HERO_COLOR, MILESTONE_TEXT, type CampHost, type TabView } from './host.ts';
import { burst, centerIn, floatText, pop, shake } from './juice.ts';
import { heroMechanic, skillDescription } from '../skill-description.ts';

type BuyKind = 'one' | 'ten' | 'max';
type StatKey = 'atk' | 'hp' | 'spd' | 'crit';

interface StatCell {
  val: HTMLElement;
  next: HTMLElement;
}

interface BuyButton {
  el: HTMLButtonElement;
  label: HTMLElement;
  cost: HTMLElement;
}

interface HeroCard {
  hero: HeroId;
  recruited: true;
  el: HTMLElement;
  portrait: HTMLCanvasElement;
  lvWrap: HTMLElement;
  lv: HTMLElement;
  lvNext: HTMLElement;
  tier: HTMLElement[];
  stats: Record<StatKey, StatCell>;
  msLabel: HTMLElement;
  msLeft: HTMLElement;
  msFill: HTMLElement;
  cdMeta: HTMLElement;
  skillDesc: HTMLElement;
  mechanic: HTMLElement;
  buys: Record<BuyKind, BuyButton>;
  pose: SpritePose;
  poseUntil: number;
  poseStarted: number;
}

interface LockedCard {
  hero: HeroId;
  recruited: false;
  el: HTMLElement;
  portrait: HTMLCanvasElement;
  hint: HTMLElement;
}

type Card = HeroCard | LockedCard;

type Preview = { kind: 'hero'; hero: HeroId; buy: BuyKind } | { kind: 'even' } | null;

function withLevel(save: SaveData, hero: HeroId, level: number): SaveData {
  return { ...save, heroes: { ...save.heroes, [hero]: { ...save.heroes[hero], level } } };
}

function simSave(save: SaveData): SaveData {
  const heroes = {} as SaveData['heroes'];
  for (const hId of HERO_ORDER) heroes[hId] = { ...save.heroes[hId] };
  return { ...save, heroes };
}

function estDps(st: HeroStats): number {
  return (st.atk / Math.max(0.05, st.interval)) * (1 + st.critChance * (st.critMult - 1));
}

function crossedMilestones(from: number, to: number): number[] {
  return BAL.milestones.filter((m) => from < m && to >= m);
}

function recruitArea(hero: HeroId): AreaId | null {
  for (const id of AREA_ORDER) if (AREAS[id].recruit === hero) return id;
  return null;
}

export class PartyTab implements TabView {
  readonly el: HTMLElement;
  private host: CampHost;
  private hints: HTMLElement;
  private grid: HTMLElement;
  private goldVal: HTMLElement;
  private power: HTMLElement;
  private evenBtn: HTMLButtonElement;
  private evenSub: HTMLElement;
  private detailBtn: HTMLButtonElement;
  private cards = new Map<HeroId, Card>();
  private signature = '';
  private preview: Preview = null;
  private frame = 0;
  private timer = 0;

  constructor(host: CampHost) {
    this.host = host;
    this.hints = h('div', 'camp-hints');
    this.goldVal = h('span', 'camp-purse-val camp-num', '0');
    this.power = h('div', 'camp-party-power');
    this.evenSub = h('span', 'camp-btn-sub', '');
    this.evenBtn = h(
      'button',
      {
        class: 'camp-btn camp-btn--primary camp-even',
        attrs: { type: 'button' },
        data: { tip: '均等に強化|レベルの低い仲間から順に、Goldが尽きるまでレベルアップ' },
        on: {
          click: () => this.buyEven(),
          mouseenter: () => this.setPreview({ kind: 'even' }),
          mouseleave: () => this.setPreview(null),
          focus: () => this.setPreview({ kind: 'even' }),
          blur: () => this.setPreview(null),
        },
      },
      h('span', 'camp-btn-main', '均等に強化'),
      this.evenSub,
    );
    this.grid = h('div', 'camp-party-grid');
    this.detailBtn = h(
      'button',
      {
        class: 'camp-btn camp-btn--small camp-party-detail',
        attrs: { type: 'button', 'aria-pressed': 'false' },
        on: { click: () => this.toggleDetail() },
      },
      'スキル説明',
    );
    this.el = h(
      'div',
      'camp-page camp-page--party',
      this.hints,
      h(
        'div',
        'camp-party-head',
        h('div', 'camp-purse camp-purse--gold', icon('gold', 32), h('div', null, h('div', 'camp-label', '所持Gold'), this.goldVal)),
        this.power,
        this.detailBtn,
        this.evenBtn,
      ),
      this.grid,
    );
  }

  private toggleDetail(): void {
    const on = !this.grid.classList.contains('is-detailed');
    this.grid.classList.toggle('is-detailed', on);
    this.detailBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.host.sfx('uiClick');
  }

  // ─────────────────────────── TabView ───────────────────────────

  update(): void {
    const save = this.host.save();
    const sig = HERO_ORDER.map((hId) => (save.heroes[hId].recruited ? '1' : '0')).join('');
    if (sig !== this.signature) {
      this.signature = sig;
      this.buildCards();
    }
    setText(this.goldVal, fmt(save.gold));
    const fresh = new Set(this.host.notices().flatMap((n) => (n.kind === 'recruit' ? [n.hero] : [])));
    for (const card of this.cards.values()) {
      card.el.classList.toggle('is-new', fresh.has(card.hero));
      if (card.recruited) this.updateCard(card);
      else this.updateLocked(card);
    }
    this.applyPreview();
  }

  onShow(): void {
    this.host.hint(
      this.hints,
      'campParty',
      'Goldでレベルアップ！',
      '×1／×10／MAXで個別に、「均等に強化」で全員まとめて強化できる。Lv10・25・50・75・100のマイルストーンでは全能力×1.5＋新装備！',
    );
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.animate(), 50);
    this.drawPortraits();
  }

  onHide(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.preview = null;
  }

  onKey(_e: KeyboardEvent): boolean {
    return false;
  }

  hasAction(): boolean {
    const save = this.host.save();
    const mods = this.host.mods();
    return recruitedHeroes(save).some((hId) => heroLevelCost(save, hId, 1, mods) <= save.gold);
  }

  // ─────────────────────────── Building ───────────────────────────

  private buildCards(): void {
    this.grid.replaceChildren();
    this.cards.clear();
    const save = this.host.save();
    for (const hId of HERO_ORDER) {
      const card = save.heroes[hId].recruited ? this.buildHero(hId) : this.buildLocked(hId);
      this.cards.set(hId, card);
      this.grid.appendChild(card.el);
    }
    this.drawPortraits();
  }

  private portraitCanvas(): HTMLCanvasElement {
    const c = h('canvas', { class: 'camp-portrait-canvas', attrs: { width: 112, height: 112 } });
    return c;
  }

  private buildHero(hero: HeroId): HeroCard {
    const def = HEROES[hero];
    const portrait = this.portraitCanvas();
    const lv = h('span', 'camp-hero-lv-num camp-num', '1');
    const lvNext = h('span', 'camp-hero-lv-next camp-num', '');
    const lvWrap = h('div', 'camp-hero-lv', h('span', 'camp-hero-lv-label', 'Lv'), lv, lvNext);
    const tier: HTMLElement[] = [];
    const tierWrap = h(
      'div',
      { class: 'camp-hero-tier', data: { tip: '装備ランク|Lv10・25・50・75・100のマイルストーンで装備が新しくなり、全能力×1.5' } },
      h('span', 'camp-label', '装備'),
    );
    for (let i = 0; i < BAL.milestones.length; i++) {
      const pip = h('i', 'camp-tier-pip');
      tier.push(pip);
      tierWrap.appendChild(pip);
    }
    const mkStat = (key: StatKey, label: string, ic: Parameters<typeof icon>[0], tip: string): [StatKey, StatCell, HTMLElement] => {
      const val = h('span', 'camp-stat-val camp-num', '');
      const next = h('span', 'camp-stat-next camp-num', '');
      const row = h('div', { class: `camp-stat camp-stat--${key}`, data: { tip } }, icon(ic, 16), h('span', 'camp-stat-label', label), val, next);
      return [key, { val, next }, row];
    };
    const statDefs = [
      mkStat('atk', 'ATK', 'sword', '攻撃力|通常攻撃・スキルのダメージの基準'),
      mkStat('hp', 'HP', 'heart', '最大HP|0になると戦闘不能'),
      mkStat('spd', '攻撃間隔', 'clock', '攻撃間隔|通常攻撃の間隔（秒）。短いほど速い'),
      mkStat('crit', '会心', 'star', '会心|クリティカル率 と クリティカル倍率'),
    ];
    const stats = Object.fromEntries(statDefs.map(([k, c]) => [k, c])) as Record<StatKey, StatCell>;
    const msLabel = h('span', 'camp-ms-label', '');
    const msLeft = h('span', 'camp-ms-left', '');
    const msFill = h('i', 'camp-ms-fill');
    const mkBuy = (kind: BuyKind): BuyButton => {
      const label = h('span', 'camp-buy-label', '');
      const cost = h('span', 'camp-buy-cost camp-num', '');
      const el = h(
        'button',
        {
          class: `camp-btn camp-buy camp-buy--${kind}`,
          attrs: { type: 'button' },
          on: {
            click: () => this.buy(hero, kind),
            mouseenter: () => this.setPreview({ kind: 'hero', hero, buy: kind }),
            mouseleave: () => this.setPreview(null),
            focus: () => this.setPreview({ kind: 'hero', hero, buy: kind }),
            blur: () => this.setPreview(null),
          },
        },
        label,
        h('span', 'camp-buy-price', icon('gold', 16), cost),
      );
      return { el, label, cost };
    };
    const buys: Record<BuyKind, BuyButton> = { one: mkBuy('one'), ten: mkBuy('ten'), max: mkBuy('max') };
    const sk = def.skill;
    const cdMeta = h('span', 'camp-skill-meta', '');
    const skillDesc = h('p', 'camp-skill-desc');
    const mechanic = h('p', 'camp-hero-mech');
    const el = h(
      'article',
      { class: 'camp-hero', style: `--hc:${HERO_COLOR[hero]}`, data: { hero } },
      h('div', 'camp-hero-ribbon', 'NEW'),
      h(
        'div',
        'camp-hero-top',
        h('div', 'camp-portrait', portrait),
        h(
          'div',
          'camp-hero-id',
          h('div', 'camp-hero-name', def.name),
          h('div', 'camp-hero-title', def.title),
          lvWrap,
          tierWrap,
        ),
      ),
      h(
        'div',
        'camp-hero-core',
        h('div', 'camp-stats', statDefs.map(([, , row]) => row)),
        h(
          'div',
          'camp-ms',
          h('div', 'camp-ms-head', icon('crown', 16), msLabel, msLeft),
          h('div', 'camp-ms-bar', msFill),
        ),
      ),
      h(
        'div',
        'camp-hero-info',
        mechanic,
        h(
          'div',
          'camp-skill',
          h(
            'div',
            'camp-skill-head',
            icon(`skill_${sk.id}` as Parameters<typeof icon>[0], 32, 'camp-skill-icon'),
            h('div', 'camp-skill-name', sk.name, cdMeta),
          ),
          skillDesc,
          h('p', 'camp-skill-perfect', h('span', 'camp-perfect-tag', 'PERFECT'), sk.perfect),
        ),
      ),
      h('div', 'camp-buys', buys.one.el, buys.ten.el, buys.max.el),
    );
    return {
      hero,
      recruited: true,
      el,
      portrait,
      lvWrap,
      lv,
      lvNext,
      tier,
      stats,
      msLabel,
      msLeft,
      msFill,
      cdMeta,
      skillDesc,
      mechanic,
      buys,
      pose: 'idle',
      poseUntil: 0,
      poseStarted: 0,
    };
  }

  private buildLocked(hero: HeroId): LockedCard {
    const portrait = this.portraitCanvas();
    const hint = h('div', 'camp-hero-lockhint', '');
    const el = h(
      'article',
      { class: 'camp-hero is-locked', data: { hero } },
      h('div', 'camp-hero-top', h('div', 'camp-portrait', portrait), h('div', 'camp-hero-id', h('div', 'camp-hero-name', '???'), h('div', 'camp-hero-title', '未加入の仲間'))),
      h('div', 'camp-hero-lockbox', icon('lock', 32), hint),
    );
    return { hero, recruited: false, el, portrait, hint };
  }

  // ─────────────────────────── Updating ───────────────────────────

  private buyCount(hero: HeroId, kind: BuyKind): number {
    if (kind === 'one') return 1;
    if (kind === 'ten') return 10;
    return maxAffordableLevels(this.host.save(), hero, this.host.mods());
  }

  private updateLocked(card: LockedCard): void {
    const save = this.host.save();
    const area = recruitArea(card.hero);
    const name = area && save.areas[area].unlocked ? AREAS[area].name : '???';
    setText(card.hint, `${name}のボスを倒すと加入`);
  }

  private updateCard(card: HeroCard): void {
    const save = this.host.save();
    const mods = this.host.mods();
    const hero = card.hero;
    const cd = skillCooldown(mods, hero);
    setText(card.skillDesc, skillDescription(hero, mods));
    setText(card.mechanic, heroMechanic(hero, mods));
    setText(card.cdMeta, `[${HEROES[hero].skill.key}] CD ${cd % 1 ? cd.toFixed(1) : cd}s`);
    const level = save.heroes[hero].level;
    setText(card.lv, String(level));
    const t = gearTier(level);
    card.tier.forEach((p, i) => p.classList.toggle('is-on', i < t));

    const ms = nextMilestone(level);
    let prev = 1;
    for (const m of BAL.milestones) if (m <= level) prev = m;
    if (ms !== null) {
      setText(card.msLabel, `Lv${ms}: ${MILESTONE_TEXT}`);
      setText(card.msLeft, `あと${ms - level}`);
      card.msFill.style.width = `${Math.max(2, Math.min(100, ((level - prev) / (ms - prev)) * 100)).toFixed(1)}%`;
    } else {
      setText(card.msLabel, '全マイルストーン達成！');
      setText(card.msLeft, '');
      card.msFill.style.width = '100%';
    }

    const gold = save.gold;
    const c1 = heroLevelCost(save, hero, 1, mods);
    const c10 = heroLevelCost(save, hero, 10, mods);
    const nMax = maxAffordableLevels(save, hero, mods);
    const cMax = nMax > 0 ? heroLevelCost(save, hero, nMax, mods) : c1;
    this.setBuy(card.buys.one, '×1', c1, gold >= c1);
    this.setBuy(card.buys.ten, '×10', c10, gold >= c10);
    this.setBuy(card.buys.max, nMax > 0 ? `MAX +${nMax}` : 'MAX', cMax, nMax > 0);
  }

  private setBuy(b: BuyButton, label: string, cost: number, ok: boolean): void {
    setText(b.label, label);
    setText(b.cost, fmt(cost));
    b.el.classList.toggle('is-poor', !ok);
    b.el.setAttribute('aria-disabled', ok ? 'false' : 'true');
  }

  private setPreview(p: Preview): void {
    this.preview = p;
    this.applyPreview();
  }

  /** Show stat deltas for the hovered purchase (ATK 22→25). */
  private applyPreview(): void {
    const save = this.host.save();
    const mods = this.host.mods();
    const add: Partial<Record<HeroId, number>> = {};
    const p = this.preview;
    if (p?.kind === 'hero') {
      add[p.hero] = this.buyCount(p.hero, p.buy);
    } else if (p?.kind === 'even') {
      const sim = simSave(save);
      buyLevelsEvenly(sim);
      for (const hId of HERO_ORDER) add[hId] = sim.heroes[hId].level - save.heroes[hId].level;
    }
    let dpsNow = 0;
    let dpsNext = 0;
    let hpNow = 0;
    let hpNext = 0;
    for (const card of this.cards.values()) {
      if (!card.recruited) continue;
      const hero = card.hero;
      const level = save.heroes[hero].level;
      const cur = heroStats(save, mods, hero);
      const n = add[hero] ?? 0;
      const nxt = n > 0 ? heroStats(withLevel(save, hero, level + n), mods, hero) : cur;
      dpsNow += estDps(cur);
      dpsNext += estDps(nxt);
      hpNow += cur.maxHp;
      hpNext += nxt.maxHp;
      setText(card.stats.atk.val, fmtStat(cur.atk));
      setText(card.stats.hp.val, fmtStat(cur.maxHp));
      setText(card.stats.spd.val, `${cur.interval.toFixed(2)}s`);
      setText(card.stats.crit.val, `${fmtPct(cur.critChance)} ×${cur.critMult.toFixed(1)}`);
      setText(card.stats.atk.next, n > 0 ? `→ ${fmtStat(nxt.atk)}` : '');
      setText(card.stats.hp.next, n > 0 ? `→ ${fmtStat(nxt.maxHp)}` : '');
      setText(card.stats.spd.next, '');
      setText(card.stats.crit.next, '');
      setText(card.lvNext, n > 0 ? `→ ${level + n}` : '');
      card.el.classList.toggle('is-preview', n > 0);
      card.el.classList.toggle('is-preview-ms', n > 0 && crossedMilestones(level, level + n).length > 0);
    }
    this.power.replaceChildren(
      h('div', { class: 'camp-power-item', data: { tip: '推定DPS|通常攻撃による秒間ダメージの目安（スキル・Burnは含まない）' } }, h('span', 'camp-label', '推定DPS'), h('b', 'camp-num', fmtStat(dpsNow)), dpsNext > dpsNow + 1e-9 ? h('span', 'camp-power-next camp-num', `→ ${fmtStat(dpsNext)}`) : null),
      h('div', 'camp-power-item', h('span', 'camp-label', '総HP'), h('b', 'camp-num', fmtStat(hpNow)), hpNext > hpNow + 1e-9 ? h('span', 'camp-power-next camp-num', `→ ${fmtStat(hpNext)}`) : null),
    );
    // even button
    const sim = simSave(save);
    const evenN = buyLevelsEvenly(sim);
    setText(this.evenSub, evenN > 0 ? `+${evenN} Lv` : 'Gold不足');
    this.evenBtn.classList.toggle('is-poor', evenN === 0);
    this.evenBtn.setAttribute('aria-disabled', evenN === 0 ? 'true' : 'false');
  }

  // ─────────────────────────── Purchases ───────────────────────────

  private buy(hero: HeroId, kind: BuyKind): void {
    const save = this.host.save();
    const mods = this.host.mods();
    const card = this.cards.get(hero);
    if (!card || !card.recruited) return;
    const n = this.buyCount(hero, kind);
    const btn = card.buys[kind].el;
    if (n <= 0 || heroLevelCost(save, hero, n, mods) > save.gold) {
      this.host.sfx('uiError');
      shake(btn);
      return;
    }
    const from = save.heroes[hero].level;
    const spent = heroLevelCost(save, hero, n, mods);
    if (!buyLevels(save, hero, n)) {
      this.host.sfx('uiError');
      shake(btn);
      return;
    }
    this.host.commit();
    const ms = this.celebrate(card, from, save.heroes[hero].level, btn, spent);
    this.levelSfx(ms.length > 0, save.heroes[hero].level - from);
  }

  private buyEven(): void {
    const save = this.host.save();
    const before = Object.fromEntries(HERO_ORDER.map((hId) => [hId, save.heroes[hId].level])) as Record<HeroId, number>;
    const n = buyLevelsEvenly(save);
    if (n <= 0) {
      this.host.sfx('uiError');
      shake(this.evenBtn);
      return;
    }
    this.host.commit();
    let anyMs = false;
    for (const card of this.cards.values()) {
      if (!card.recruited) continue;
      const to = save.heroes[card.hero].level;
      if (to > before[card.hero]) anyMs = this.celebrate(card, before[card.hero], to, null, 0).length > 0 || anyMs;
    }
    this.levelSfx(anyMs, n);
  }

  private levelSfx(milestone: boolean, levels: number): void {
    if (milestone) this.host.sfx('milestone');
    else this.host.sfx('levelUp', { pitch: 1 + Math.min(0.3, (levels - 1) * 0.015) });
  }

  /** Level-up juice. Returns crossed milestones. */
  private celebrate(card: HeroCard, from: number, to: number, anchor: HTMLElement | null, spent: number): number[] {
    const layer = this.host.fxLayer();
    pop(card.lvWrap);
    const lvPos = centerIn(layer, card.lvWrap);
    floatText(layer, `+${to - from} Lv`, lvPos.x, lvPos.y - 8, 'camp-float--lv');
    if (anchor && spent > 0) {
      const p = centerIn(layer, anchor);
      floatText(layer, `-${fmt(spent)}`, p.x, p.y - 18, 'camp-float--gold');
    }
    const pp = centerIn(layer, card.portrait);
    burst(layer, pp.x, pp.y + 10, HERO_COLOR[card.hero], 10, 46);
    card.pose = 'cast';
    card.poseStarted = performance.now();
    card.poseUntil = card.poseStarted + getStoryActionDuration(card.hero, 'cast') * 1000;
    this.drawPortrait(card);
    const ms = crossedMilestones(from, to);
    if (ms.length) {
      const top = ms[ms.length - 1];
      card.el.classList.remove('is-milestone');
      void card.el.offsetWidth;
      card.el.classList.add('is-milestone');
      window.setTimeout(() => card.el.classList.remove('is-milestone'), 1600);
      const cardCenter = centerIn(layer, card.el);
      floatText(layer, `Lv${top} 装備更新！`, cardCenter.x, cardCenter.y - 6, 'camp-float--ms');
      burst(layer, pp.x, pp.y, '#ffd84a', 22, 90);
      this.host.ctx.toast(`${HEROES[card.hero].name} Lv${top}到達！ ${MILESTONE_TEXT}`, 'good');
    }
    return ms;
  }

  // ─────────────────────────── Portraits ───────────────────────────

  private animate(): void {
    this.frame++;
    this.drawPortraits();
  }

  private drawPortraits(): void {
    for (const card of this.cards.values()) this.drawPortrait(card);
  }

  private drawPortrait(card: Card): void {
    const save = this.host.save();
    if (!card.recruited) {
      drawSprite(card.portrait, card.hero, 'idle', 0, 0, true);
      return;
    }
    if (card.pose !== 'idle' && performance.now() > card.poseUntil) card.pose = 'idle';
    const seconds = card.pose === 'idle' ? performance.now() / 1000 : (performance.now() - card.poseStarted) / 1000;
    const frame = getStoryFrameIndex(card.hero, card.pose, seconds);
    drawSprite(card.portrait, card.hero, card.pose, frame, gearTier(save.heroes[card.hero].level));
  }
}
