// Esc pause menu during a run: 再開 / 設定 / 撤退, and the party's skills in full
// (the battle HUD only shows a one-line hint, so the complete texts are read here).
import { AREAS } from '../data/areas.ts';
import { HEROES } from '../data/heroes.ts';
import { BAL } from '../core/balance.ts';
import type { Battle } from '../core/battle.ts';
import { HERO_ORDER } from '../core/types.ts';
import type { IconKey } from '../render/sprites/index.ts';
import { h, icon } from './dom.ts';
import type { ModalHandle, Modals } from './modal.ts';
import { skillDescription } from './skill-description.ts';

export interface PauseHost {
  modals: Modals;
  openSettings(): void;
  retreat(): void;
}

function skillCards(b: Battle): HTMLElement {
  const refund = Math.round(BAL.perfectRefund * 100);
  return h(
    'section',
    { class: 'pause-skills', attrs: { 'aria-label': 'スキル' } },
    h('h3', { class: 'pause-skills-title', text: 'スキル' }),
    h(
      'div',
      { class: 'pause-skill-list' },
      HERO_ORDER.filter((hero) => b.party.includes(hero)).map((hero) => {
        const def = HEROES[hero], sk = def.skill, cd = b.skills[hero].maxCooldown;
        return h(
          'article',
          { class: 'pause-skill', style: `--hc: ${def.color}` },
          h(
            'div',
            { class: 'ps-head' },
            icon(`skill_${sk.id}` as IconKey, 2, 'ps-icon'),
            h('b', { class: 'ps-name', text: sk.name }),
            h('span', { class: 'key-badge', text: sk.key }),
            h('span', { class: 'ps-cd', text: `CD ${cd.toFixed(cd % 1 ? 1 : 0)}秒` }),
          ),
          h('p', { class: 'ps-desc', text: skillDescription(hero, b.mods) }),
          h('p', { class: 'ps-perfect' }, h('span', { class: 'ps-tag', text: 'PERFECT' }), `${sk.perfect}（クールダウン${refund}%回復）`),
        );
      }),
    ),
  );
}

export function openPause(host: PauseHost, b: Battle): ModalHandle {
  const resume = h('button', { class: 'btn primary big' }, h('span', { text: '再開' }), h('span', { class: 'key-badge', text: 'Esc' }));
  const settings = h('button', { class: 'btn big', text: '設定' });
  const retreat = h('button', { class: 'btn big danger-soft', text: '撤退する' });
  const area = AREAS[b.area.id];
  const content = h(
    'div',
    { class: 'pause' },
    h(
      'div',
      { class: 'pause-main' },
      h('div', { class: 'pause-kicker', text: 'PAUSED' }),
      h('h2', { class: 'modal-title', text: '一時停止' }),
      h('p', { class: 'pause-where', text: `${area.name}・ステージ ${Math.min(10, b.stage + 1)} / 10` }),
      h('div', { class: 'pause-menu' }, resume, settings, retreat),
      h('p', { class: 'pause-note', text: '撤退しても、ここまでの獲得物はすべて持ち帰れる。' }),
    ),
    skillCards(b),
  );
  const m = host.modals.open(content, { className: 'modal-pause', label: '一時停止', focus: resume });
  resume.addEventListener('click', () => m.close());
  settings.addEventListener('click', () => host.openSettings());
  retreat.addEventListener('click', () => {
    m.close();
    host.retreat();
  });
  return m;
}
