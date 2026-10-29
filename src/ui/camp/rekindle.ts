// Rekindle (prestige) panel: RESET / KEEP / GAIN with real numbers and a double confirmation.
import { BAL } from '../../core/balance.ts';
import { canRekindle, recruitedHeroes, rekindle, rekindleShards } from '../../core/state.ts';
import { AREA_ORDER, HERO_ORDER } from '../../core/types.ts';
import { AREAS } from '../../data/areas.ts';
import { HEROES } from '../../data/heroes.ts';
import { TREE } from '../../data/tree.ts';
import { isTouch } from '../dom.ts';
import { fmt, h, icon, type Child } from './dom.ts';
import type { CampHost } from './host.ts';

const ARM_SECONDS = 4;

function row(label: Child, value: Child, cls = ''): HTMLElement {
  return h('li', `camp-rk-row ${cls}`.trim(), h('span', 'camp-rk-label', label), h('span', 'camp-rk-value', value));
}

function arrow(from: string, to: string): HTMLElement {
  return h('span', 'camp-rk-arrow', h('s', null, from), ' → ', h('b', null, to));
}

/** Open the Rekindle panel as a modal over the camp. */
export function openRekindle(host: CampHost): void {
  const save = host.save();
  if (!canRekindle(save)) return;
  const mods = host.mods();
  host.sfx('uiClick');

  const shards = rekindleShards(save);
  const peakSum = HERO_ORDER.reduce(
    (acc, hId) => acc + Math.max(save.peakLevels[hId] ?? 0, save.heroes[hId].recruited ? save.heroes[hId].level : 0),
    0,
  );
  const memNow = save.prestige >= 1 ? mods.memoryMult : 1;
  const memNext = 1 + BAL.memoryPerLevel * peakSum;
  const cleared = AREA_ORDER.filter((a) => save.areas[a].cleared).length;
  const ownedNodes = TREE.filter((n) => n.kind !== 'root' && (save.tree[n.id] ?? 0) > 0).length;
  const totalNodes = TREE.filter((n) => n.kind !== 'root').length;
  const stars = AREA_ORDER.reduce((acc, a) => acc + save.areas[a].stars, 0);
  const heroes = recruitedHeroes(save);
  const nextCycle = save.prestige + 2;

  // RESET
  const reset = h('ul', 'camp-rk-list');
  reset.appendChild(row([icon('gold', 20), 'Gold'], arrow(fmt(save.gold), '0')));
  for (const hId of heroes) {
    reset.appendChild(row([icon(`hero_${hId}`, 20), HEROES[hId].name], arrow(`Lv${save.heroes[hId].level}`, 'Lv1')));
  }
  reset.appendChild(row([icon('lantern', 20), 'エリア進行'], arrow(`${cleared}エリア踏破`, AREAS.ashwood.name)));
  reset.appendChild(row([icon('skull', 20), 'ボス撃破'], h('span', null, '未撃破に戻る', h('small', 'camp-dim', '（最速記録・星は保持）'))));

  // KEEP
  const keep = h('ul', 'camp-rk-list');
  keep.appendChild(row([icon('ember', 20), 'スキルツリー'], h('b', null, `${ownedNodes} / ${totalNodes} ノード`)));
  keep.appendChild(row([icon('ember', 20), 'Ember'], h('b', 'camp-ember', fmt(save.embers))));
  keep.appendChild(row([icon('heart', 20), '仲間'], h('b', null, `${heroes.length}人`)));
  if (save.prestige >= 1) {
    keep.appendChild(row([icon('shard', 20), 'Relic'], h('b', null, `${save.relicsOwned.length}個`)));
    keep.appendChild(row([icon('shard', 20), 'Relic Shard'], h('b', 'camp-shard', fmt(save.shards))));
  }
  keep.appendChild(row([icon('star', 20), '記録'], h('b', null, `★${stars}・ボス最速タイム`)));

  // GAIN
  const gain = h('ul', 'camp-rk-list');
  gain.appendChild(
    row([icon('shard', 24), 'Relic Shard'], h('b', 'camp-rk-big camp-shard', `+${fmt(shards)}`), 'camp-rk-row--hero'),
  );
  gain.appendChild(
    row(
      [icon('heart', 20), 'Ember Memory'],
      h(
        'span',
        'camp-rk-mem',
        h('span', 'camp-rk-arrow', h('s', null, `×${memNow.toFixed(2)}`), ' → ', h('b', 'camp-good', `×${memNext.toFixed(2)}`)),
        h('small', null, `全能力（過去最高Lv合計 ${peakSum} × ${+(BAL.memoryPerLevel * 100).toFixed(2)}%）`),
      ),
    ),
  );
  if (save.prestige === 0) {
    const unlocks: [string, string][] = [
      ['Relic', 'ビルドを決める秘宝（装備2枠）'],
      ['Overdrive', `${isTouch() ? 'ボタン' : 'Space'}で発動。攻撃速度×2・与ダメ+50%`],
      ['Descent', 'ボスを倒すとそのまま次のエリアへ'],
      ['The Ember Heart', '第6のエリア（The Hollow再踏破で）'],
      ['Rekindledノード', 'スキルツリー外周の強力なノード'],
    ];
    const ul = h('ul', 'camp-rk-unlocks');
    for (const [name, text] of unlocks) ul.appendChild(h('li', null, h('b', null, name), h('span', null, text)));
    gain.appendChild(h('li', 'camp-rk-row camp-rk-row--unlocks', h('span', 'camp-rk-label', icon('crown', 20), '新たに解放'), ul));
  } else if (save.prestige === 1) {
    gain.appendChild(row([icon('crown', 20), 'Relic装備枠'], h('b', 'camp-good', '+1')));
  }
  gain.appendChild(row([icon('skull', 20), 'ボス初撃破'], h('span', null, '各ボスが再び ', h('b', 'camp-shard', 'Relic Shard'), ' を落とす')));

  const confirm = h('button', { class: 'camp-btn camp-btn--rekindle camp-rk-confirm', attrs: { type: 'button' } }, 'Rekindleする');
  const cancel = h('button', { class: 'camp-btn camp-btn--ghost', attrs: { type: 'button' } }, 'やめる');
  const note = h('div', 'camp-rk-note', '※ 2回押して確定します');

  const panel = h(
    'div',
    { class: 'camp-modal camp-rk', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Rekindle' } },
    h('div', { class: 'dialog-scroll', attrs: { tabindex: '0', 'aria-label': 'Rekindleで失うもの・引き継ぐもの・得るもの' } },
    h(
      'header',
      'camp-rk-head',
      h('div', 'camp-rk-flame', h('span', 'camp-rekindle-flame-core')),
      h('div', 'camp-rk-title', 'REKINDLE'),
      h('div', 'camp-rk-sub', '残り火を再び灯し、新たなサイクルへ'),
      h('div', 'camp-rk-cycle', `CYCLE ${save.prestige + 1} → `, h('b', null, `CYCLE ${nextCycle}`)),
    ),
    h(
      'div',
      'camp-rk-cols',
      h('section', 'camp-rk-col camp-rk-col--reset', h('h3', null, 'RESET', h('small', null, '失うもの')), reset),
      h('section', 'camp-rk-col camp-rk-col--keep', h('h3', null, 'KEEP', h('small', null, '引き継ぐもの')), keep),
      h('section', 'camp-rk-col camp-rk-col--gain', h('h3', null, 'GAIN', h('small', null, '得るもの')), gain),
    ),
    ),
    h('footer', 'camp-rk-foot dialog-footer', note, h('div', 'camp-rk-btns', cancel, confirm)),
  );

  let armed = false;
  let armTimer = 0;
  let left = ARM_SECONDS;
  const disarm = () => {
    armed = false;
    window.clearInterval(armTimer);
    confirm.classList.remove('is-armed');
    confirm.textContent = 'Rekindleする';
    note.textContent = '※ 2回押して確定します';
  };
  const close = host.openModal(panel, () => window.clearInterval(armTimer));

  cancel.addEventListener('click', () => {
    host.sfx('uiClick');
    close();
  });
  confirm.addEventListener('click', () => {
    if (!canRekindle(host.save())) {
      close();
      return;
    }
    if (!armed) {
      armed = true;
      left = ARM_SECONDS;
      confirm.classList.add('is-armed');
      confirm.textContent = `本当に灯し直す？（${left}）`;
      note.textContent = 'もう一度押すとRekindleを実行します';
      host.sfx('uiClick', { pitch: 0.8 });
      armTimer = window.setInterval(() => {
        left -= 1;
        if (left <= 0) disarm();
        else confirm.textContent = `本当に灯し直す？（${left}）`;
      }, 1000);
      return;
    }
    disarm();
    const live = host.save();
    const gained = rekindle(live);
    host.clearNotices();
    close();
    host.sfx('rekindle');
    host.commit();
    host.switchTab('expedition');
    host.ctx.onRekindled(gained);
  });
}
