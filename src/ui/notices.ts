// Cinematic notice cards (recruit / area unlocked / ending / true ending / rekindle / run intro).
// Shown one at a time in a full-screen layer; the app shell pauses the simulation while active.
import { AREAS } from '../data/areas.ts';
import { HEROES } from '../data/heroes.ts';
import { gearTier } from '../core/balance.ts';
import { activeVows, computeMods } from '../core/mods.ts';
import { AREA_ORDER, type AreaId, type HeroId, type SaveData } from '../core/types.ts';
import type { IAudio, MusicTrack, SfxName } from '../audio/api.ts';
import { getStoryFrameIndex } from '../render/storybook/characters.ts';
import { drawAreaBackground, drawAreaForeground, frameCount, getUnitSprite, type IconKey } from '../render/sprites/index.ts';
import { fmt, fmtDuration, h, icon, tapWord } from './dom.ts';

export interface NoticeCard {
  kind: string;
  build(): HTMLElement;
  music?: MusicTrack;
  sfx?: SfxName;
  /** Milliseconds before the card can be dismissed (prevents accidental skips). */
  lockMs?: number;
  button?: string;
  onDone?(): void;
}

export interface NoticeHost {
  audio: IAudio;
  setMusic(track: MusicTrack): void;
}

interface Current {
  card: NoticeCard;
  layer: HTMLElement;
  shownAt: number;
  done: () => void;
}

export class NoticePlayer {
  private root: HTMLElement;
  private host: NoticeHost;
  private queue: { card: NoticeCard; resolve?: () => void }[] = [];
  private current: Current | null = null;

  constructor(root: HTMLElement, host: NoticeHost) {
    this.root = root;
    this.host = host;
  }

  get active(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  /** Queue cards; resolves once they've all been dismissed. */
  play(cards: NoticeCard[]): Promise<void> {
    if (!cards.length) return Promise.resolve();
    return new Promise((resolve) => {
      cards.forEach((card, i) => this.queue.push({ card, resolve: i === cards.length - 1 ? resolve : undefined }));
      if (!this.current) this.next();
    });
  }

  handleKey(e: KeyboardEvent): void {
    if (!this.current) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      this.dismiss();
    }
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.current = null;
      return;
    }
    const { card } = item;
    // Music set by a card (endings) keeps playing until the shell changes screens.
    if (card.music !== undefined) this.host.setMusic(card.music);
    if (card.sfx) this.host.audio.play(card.sfx);
    const btn = h('button', { class: 'btn primary big nt-continue' }, card.button ?? 'つづける', h('span', { class: 'key-badge', text: 'Enter' }));
    const body = card.build();
    const panel = h('div', { class: `notice notice-${card.kind}` }, emberField(14),
      h('div', { class: 'dialog-scroll', attrs: { tabindex: '0', 'aria-label': 'お知らせの詳細' } }, body),
      h('footer', { class: 'nt-actions dialog-footer' }, btn));
    const layer = h('div', { class: 'notice-layer', attrs: { role: 'dialog', 'aria-modal': 'true' } }, h('div', { class: 'notice-backdrop' }), panel);
    this.root.appendChild(layer);
    requestAnimationFrame(() => layer.classList.add('in'));
    const cur: Current = {
      card,
      layer,
      shownAt: performance.now(),
      done: () => {
        card.onDone?.();
        item.resolve?.();
      },
    };
    this.current = cur;
    const lock = card.lockMs ?? 700;
    btn.disabled = true;
    window.setTimeout(() => {
      btn.disabled = false;
      btn.focus({ preventScroll: true });
    }, lock);
    btn.addEventListener('click', () => this.dismiss());
  }

  private dismiss(): void {
    const cur = this.current;
    if (!cur) return;
    if (performance.now() - cur.shownAt < (cur.card.lockMs ?? 700)) return;
    this.host.audio.play('uiClick');
    cur.layer.classList.remove('in');
    cur.layer.classList.add('out');
    window.setTimeout(() => cur.layer.remove(), 260);
    this.current = null;
    cur.done();
    this.next();
  }
}

// ─────────────────────────── visual helpers ───────────────────────────

/** CSS-animated rising embers behind a card. */
export function emberField(n: number, cls = 'ember-field'): HTMLElement {
  const f = h('div', { class: cls, attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < n; i++) {
    const left = (i * 37 + 11) % 100;
    const delay = ((i * 0.73) % 4).toFixed(2);
    const dur = (3.2 + ((i * 1.31) % 2.6)).toFixed(2);
    const size = 2 + (i % 3);
    f.appendChild(h('span', { class: 'ember-p', style: `left:${left}%;animation-delay:-${delay}s;animation-duration:${dur}s;width:${size * 2}px;height:${size * 2}px` }));
  }
  return f;
}

/** Hand-drawn portrait, using authored seconds and a stable feet anchor. Stops when detached. */
export function spriteCanvas(key: string, box: number, tier = 0): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'px-canvas sprite-canvas' });
  canvas.width = canvas.height = Math.round(box * 2);
  canvas.style.width = canvas.style.height = `${box}px`;
  const g = canvas.getContext('2d');
  const base = getUnitSprite(key, 'idle', 0, tier);
  const scale = canvas.height * .88 / Math.max(base.width, base.height);
  let started = false, previous = -1;
  const draw = (now: number) => {
    if (!g || (started && !canvas.isConnected)) return;
    if (canvas.isConnected) started = true;
    const frame = getStoryFrameIndex(key, 'idle', now / 1000);
    if (frame !== previous) {
      previous = frame;
      const spr = getUnitSprite(key, 'idle', frame, tier);
      g.imageSmoothingEnabled = true;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(spr.canvas, canvas.width / 2 - spr.ax * scale, canvas.height * .94 - spr.ay * scale, spr.width * scale, spr.height * scale);
    }
    requestAnimationFrame(draw);
  };
  draw(performance.now());
  return canvas;
}

/** Animated area backdrop preview (400x180 world, scaled by CSS). */
export function areaPreview(areaId: AreaId): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'px-canvas area-preview' });
  canvas.width = 1200;
  canvas.height = 540;
  const g = canvas.getContext('2d');
  let started = false;
  const t0 = performance.now();
  const loop = (now: number) => {
    if (started && !canvas.isConnected) return;
    if (canvas.isConnected) started = true;
    if (g) {
      const t = (now - t0) / 1000;
      try {
        g.imageSmoothingEnabled = true;
        g.setTransform(3, 0, 0, 3, 0, 0);
        drawAreaBackground(g, areaId, t * 14, t);
        drawAreaForeground(g, areaId, t * 14, t);
      } catch {
        /* renderer art not ready */
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return canvas;
}

// ─────────────────────────── card builders ───────────────────────────

export function recruitCard(hero: HeroId, level: number): NoticeCard {
  const def = HEROES[hero];
  const sk = def.skill;
  return {
    kind: 'recruit',
    sfx: 'recruit',
    lockMs: 900,
    build: () =>
      h(
        'div',
        { class: 'nt-body', style: `--hc:${def.color}` },
        h('div', { class: 'nt-kicker', text: 'NEW HERO' }),
        h('h2', { class: 'nt-head', text: '新たな仲間が加わった！' }),
        h(
          'div',
          { class: 'nt-recruit' },
          h('div', { class: 'nt-portrait' }, h('div', { class: 'nt-portrait-glow' }), spriteCanvas(hero, 176, gearTier(level))),
          h(
            'div',
            { class: 'nt-info' },
            h('div', { class: 'nt-name', text: def.name }),
            h('div', { class: 'nt-title' }, h('span', { text: def.title }), h('span', { class: 'nt-lv', text: `Lv ${level} で参戦` })),
            h('div', { class: 'nt-box' }, h('div', { class: 'nt-box-h', text: '新メカニクス' }), h('p', { text: def.mechanic.replace('クリック', tapWord()) })),
            h(
              'div',
              { class: 'nt-box nt-skill' },
              h('div', { class: 'nt-skill-icon' }, icon(`skill_${sk.id}` as IconKey, 3)),
              h(
                'div',
                { class: 'nt-skill-text' },
                h('div', { class: 'nt-skill-name' }, h('span', { class: 'key-badge', text: sk.key }), h('span', { text: sk.name }), h('span', { class: 'nt-cd', text: `CD ${sk.cooldown}秒` })),
                h('p', { text: sk.desc }),
                h('p', { class: 'nt-perfect', text: `PERFECT：${sk.perfect}` }),
              ),
            ),
          ),
        ),
      ),
  };
}

export function areaCard(areaId: AreaId): NoticeCard {
  const a = AREAS[areaId];
  return {
    kind: 'area',
    sfx: 'descent',
    lockMs: 800,
    build: () =>
      h(
        'div',
        { class: 'nt-body', style: `--sky:${a.palette.sky};--mid:${a.palette.mid};--accent:${a.palette.accent}` },
        h('div', { class: 'nt-kicker', text: 'NEW AREA' }),
        h('h2', { class: 'nt-head', text: '新たな地が開かれた' }),
        h(
          'div',
          { class: 'nt-preview' },
          areaPreview(areaId),
          h('div', { class: 'nt-preview-label' }, h('div', { class: 'nt-area-idx', text: `AREA ${a.index + 1}` }), h('div', { class: 'nt-area-name', text: a.name }), h('div', { class: 'nt-area-sub', text: a.subtitle })),
        ),
        h('p', { class: 'nt-text', text: a.intro }),
        h('div', { class: 'nt-meta' }, icon('crown', 2), h('span', { text: `ボス：${a.bossName}` })),
      ),
  };
}

export function endingCard(): NoticeCard {
  return {
    kind: 'ending',
    music: 'ending',
    lockMs: 1800,
    build: () =>
      h(
        'div',
        { class: 'nt-body' },
        h('div', { class: 'nt-kicker', text: 'ENDING' }),
        h('h2', { class: 'nt-head big', text: '虚ろの王、斃る' }),
        h(
          'div',
          { class: 'nt-story' },
          h('p', { text: 'The Hollow Sovereign が崩れ落ち、深淵に一筋の光が差した。' }),
          h('p', { text: 'だが残り火はまだ弱く、闇は世界の縁に潜んだままだ。' }),
          h('p', { text: 'ランタンの炎を、もう一度灯せ――より強く、より深く。' }),
        ),
        h(
          'div',
          { class: 'nt-unlock' },
          h('div', { class: 'nt-unlock-h', text: 'Rekindle（転生）解放！' }),
          h('p', { text: '野営地からRekindleできるようになった。Goldとレベル・エリア進行をリセットする代わりに、Relic Shards・Relic・Overdrive・Descent・新たなスキルノードを得る。スキルツリーとEmberは引き継がれる。' }),
        ),
      ),
  };
}

export function trueEndingCard(save: SaveData): NoticeCard {
  const s = save.stats;
  const rows: [string, string][] = [
    ['総プレイ時間', fmtDuration(save.playTime)],
    ['遠征回数', `${fmt(s.runs)}回`],
    ['撃破数', fmt(s.kills)],
    ['ボス撃破', fmt(s.bossKills)],
    ['全滅', `${fmt(s.deaths)}回`],
    ['中断（INTERRUPT）', fmt(s.interrupts)],
    ['PERFECT', fmt(s.perfects)],
    ['最大ダメージ', fmt(s.bestHit)],
    ['Rekindle', `${save.prestige}回`],
  ];
  if (s.vowsKept > 0) rows.push(['守り通した誓約', `${fmt(s.vowsKept)}回`]);
  const credits: [string, string][] = [
    ['EMBERBOUND EXPEDITION', ''],
    ['ゲームデザイン・プログラム', 'Emberbound Team'],
    ['キャラクター', 'Inkstone Character Studio'],
    ['背景・演出', '手描きの線画と光のエフェクト'],
    ['音楽・効果音', 'Web Audio シンセサイザー'],
    ['フォント', 'OS標準の明朝体・セリフ体'],
    ['Special Thanks', 'ここまで遊んでくれた、あなた'],
  ];
  return {
    kind: 'trueEnding',
    music: 'ending',
    lockMs: 2500,
    button: 'エピローグへ',
    build: () =>
      h(
        'div',
        { class: 'nt-body' },
        h('div', { class: 'nt-kicker', text: 'TRUE ENDING' }),
        h('h2', { class: 'nt-head big', text: '残り火は、ふたたび世界を照らす' }),
        h(
          'div',
          { class: 'nt-story' },
          h('p', { text: '影の一行――かつての自分たちの残響が、静かに灰へと還っていく。' }),
          h('p', { text: 'The Ember Heart はふたたび脈打ち、凍えた世界に朝が戻ってきた。' }),
          h('p', { text: 'Emberbound の遠征はここに終わる。……あるいは、また始まる。' }),
        ),
        h(
          'div',
          { class: 'nt-columns' },
          h('div', { class: 'nt-stats' }, h('div', { class: 'nt-box-h', text: 'あなたの遠征記録' }), ...rows.map(([k, v]) => h('div', { class: 'nt-stat' }, h('span', { text: k }), h('b', { text: v })))),
          h(
            'div',
            { class: 'nt-credits' },
            h('div', { class: 'nt-credits-roll' }, ...credits.map(([k, v]) => h('div', { class: 'nt-credit' }, h('div', { class: 'nt-credit-k', text: k }), v ? h('div', { class: 'nt-credit-v', text: v }) : null))),
          ),
        ),
        h('p', { class: 'nt-foot', text: '遊んでくれてありがとう！ 遠征はこのまま続けられます。' }),
      ),
  };
}

export function rekindleCard(shards: number, save: SaveData): NoticeCard {
  const mods = computeMods(save);
  const vows = activeVows(save);
  const unlocks: [string, string][] = [
    ['Relic', `Relic Shardsで購入し装備（スロット ${mods.relicSlots}）`],
    ['Overdrive', 'ゲージ満タンで[Space]：6秒間の超強化'],
    ['Descent', 'ボスをランタン10秒以上残して倒すと、次のエリアへ連続踏破'],
    ['Ember Memory', `過去の最高レベルに応じて全能力 ×${mods.memoryMult.toFixed(2)}`],
    ['Rekindled ノード', 'スキルツリーの外周に新たなノードが灯る'],
  ];
  if (save.prestige === 1 && !save.areas[AREA_ORDER[AREA_ORDER.length - 1]].everCleared) unlocks.push(['The Ember Heart', 'The Hollowを再び踏破すると、最後の地が開く']);
  return {
    kind: 'rekindle',
    sfx: 'rekindle',
    lockMs: 1200,
    build: () =>
      h(
        'div',
        { class: 'nt-body' },
        h('div', { class: 'nt-kicker', text: `REKINDLE ・ 周回 ${save.prestige + 1}` }),
        h('h2', { class: 'nt-head big', text: '炎は、ふたたび灯る' }),
        h('div', { class: 'nt-flame', attrs: { 'aria-hidden': 'true' } }, h('span'), h('span'), h('span')),
        h('div', { class: 'nt-gain' }, icon('shard', 3), h('span', { text: `+${fmt(shards)} Relic Shards` })),
        h('div', { class: 'nt-unlocks' }, ...unlocks.map(([k, v]) => h('div', { class: 'nt-unlock-row' }, h('b', { text: k }), h('span', { text: v })))),
        vows.length
          ? h('div', { class: 'nt-vows' }, h('b', { text: 'この周回の誓約' }), ...vows.map((v) => h('span', { class: 'nt-vow', text: `${v.name}：${v.desc}` })))
          : null,
      ),
  };
}

export function introCard(): NoticeCard {
  return {
    kind: 'intro',
    lockMs: 600,
    button: '出発！',
    build: () =>
      h(
        'div',
        { class: 'nt-body' },
        h('div', { class: 'nt-kicker', text: 'EXPEDITION 1' }),
        h('h2', { class: 'nt-head', text: '最後の残り火を携えて' }),
        h(
          'div',
          { class: 'nt-story' },
          h('p', { text: '世界を照らしていた聖なる炎「Ember」は、いま消えかけている。' }),
          h('p', { text: 'ランタンに火を移し、闇「The Hollow」の奥へ――遠征の時だ。' }),
        ),
        h(
          'div',
          { class: 'nt-tips' },
          h('div', { class: 'nt-tip' }, icon('sword', 2), h('span', { text: 'Guardianは自動で戦う。敵を倒してGoldを集めよう。' })),
          h('div', { class: 'nt-tip' }, icon('lantern', 2), h('span', { text: 'ランタンが尽きると帰還。獲得物はすべて持ち帰れる。' })),
          h('div', { class: 'nt-tip' }, icon('gold', 2), h('span', { text: '帰還したらGoldでレベルアップ。何度でも挑もう！' })),
        ),
      ),
  };
}

/** Shown after the true ending: what became of the four, the player's records and what is left to chase. */
export function epilogueCard(save: SaveData): NoticeCard {
  const lines: Record<HeroId, string> = {
    guardian: '盾は、もう誰かを守るためだけにある。焚き火のそばで、守護者はようやく深く眠った。',
    ranger: '風の匂いが変わった。矢筒を空にした射手は、朝焼けの向こうへ駆けていく。',
    arcanist: '残り火の研究は終わらない。魔導士はランタンの炎に、新しい星図を描き始めた。',
    oracle: '祈りは届いた。巫女は灯を高く掲げ、帰らなかった者たちの名をひとりずつ呼んだ。',
  };
  const stars = AREA_ORDER.reduce((a, id) => a + save.areas[id].stars, 0);
  const maxStars = AREA_ORDER.length * 3;
  const relics = save.relicsOwned.length;
  const bossRows = AREA_ORDER.filter((id) => save.areas[id].bossBestTime > 0).map((id) => {
    const a = save.areas[id];
    const first = a.bossFirstTime;
    const best = a.bossBestTime;
    const ratio = best > 0 ? first / best : 1;
    return h(
      'div',
      { class: 'nt-stat' },
      h('span', { text: AREAS[id].bossName }),
      h('b', { text: `${best.toFixed(1)}s${ratio >= 1.5 ? `（初討伐の×${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}速）` : ''}` }),
    );
  });
  const goals: string[] = [];
  if (stars < maxStars) goals.push(`ランタンスターを集めよう（★ ${stars} / ${maxStars}）`);
  if (relics < 12) goals.push(`Relicをすべて揃えよう（${relics} / 12）`);
  goals.push('Rekindleを重ねると Relic の装備枠が増える');
  goals.push('ボス討伐タイムを縮めよう');
  return {
    kind: 'epilogue',
    lockMs: 1500,
    button: 'つづける',
    build: () =>
      h(
        'div',
        { class: 'nt-body' },
        h('div', { class: 'nt-kicker', text: 'EPILOGUE' }),
        h('h2', { class: 'nt-head', text: '灯の守り手たち' }),
        h(
          'div',
          { class: 'nt-unlocks' },
          ...(['guardian', 'ranger', 'arcanist', 'oracle'] as HeroId[]).map((hero) =>
            h(
              'div',
              { class: 'nt-unlock-row' },
              h('b', null, icon(`hero_${hero}` as IconKey, 2), ` ${HEROES[hero].name}  Lv${save.heroes[hero].level}`),
              h('span', { text: lines[hero] }),
            ),
          ),
        ),
        h(
          'div',
          { class: 'nt-columns' },
          h('div', { class: 'nt-stats' }, h('div', { class: 'nt-box-h', text: 'ボス最速討伐' }), ...bossRows),
          h('div', { class: 'nt-stats' }, h('div', { class: 'nt-box-h', text: 'これからの目標' }), ...goals.map((g) => h('div', { class: 'nt-stat' }, h('span', { text: g })))),
        ),
        h('p', { class: 'nt-foot', text: 'ランタンの火は消えない。遠征はいつでも続けられます。' }),
      ),
  };
}
