// Esc pause menu during a run: 再開 / 設定 / 撤退.
import { AREAS } from '../data/areas.ts';
import type { Battle } from '../core/battle.ts';
import { h } from './dom.ts';
import type { ModalHandle, Modals } from './modal.ts';

export interface PauseHost {
  modals: Modals;
  openSettings(): void;
  retreat(): void;
}

export function openPause(host: PauseHost, b: Battle): ModalHandle {
  const resume = h('button', { class: 'btn primary big' }, h('span', { text: '再開' }), h('span', { class: 'key-badge', text: 'Esc' }));
  const settings = h('button', { class: 'btn big', text: '設定' });
  const retreat = h('button', { class: 'btn big danger-soft', text: '撤退する' });
  const area = AREAS[b.area.id];
  const content = h(
    'div',
    { class: 'pause' },
    h('div', { class: 'pause-kicker', text: 'PAUSED' }),
    h('h2', { class: 'modal-title', text: '一時停止' }),
    h('p', { class: 'pause-where', text: `${area.name}・ステージ ${Math.min(10, b.stage + 1)} / 10` }),
    h('div', { class: 'pause-menu' }, resume, settings, retreat),
    h('p', { class: 'pause-note', text: '撤退しても、ここまでの獲得物はすべて持ち帰れる。' }),
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
