// Run Result modal: headline, stage reached, stats, loot count-up, records, death recap, next goal.
import { AREAS } from '../data/areas.ts';
import type { Notice } from '../core/state.ts';
import type { RunEndReason, RunResult, SaveData } from '../core/types.ts';
import type { IAudio } from '../audio/api.ts';
import type { CampTab } from './contracts.ts';
import { affordableLevelCount, killedByAdvice, missedLines, nextGoal, reasonAdvice, type RecapLine } from './advice.ts';
import { clamp, countUp, fmt, fmtSec, h, icon, wait } from './dom.ts';
import type { Modals } from './modal.ts';

export type ResultAction = 'upgrade' | 'again';

export interface ResultHost {
  modals: Modals;
  audio: IAudio;
  getSave(): SaveData;
  /** Persisted one-time flag (tutorial). */
  firstTime(key: string): boolean;
}

export interface ResultChoice {
  action: ResultAction;
  /** Suggested camp tab for "強化する". */
  tab: CampTab;
}

const HEADLINE: Record<RunEndReason, { text: string; sub: string; cls: string }> = {
  wiped: { text: '全滅', sub: 'パーティは倒れた……だが獲得物はすべて持ち帰った。', cls: 'r-wiped' },
  lantern: { text: 'ランタン切れ', sub: 'ランタンの火が尽きた。獲得物を持って帰還した。', cls: 'r-lantern' },
  victory: { text: '踏破！', sub: '', cls: 'r-victory' },
  retreat: { text: '撤退', sub: '無事に帰還した。獲得物はすべて持ち帰った。', cls: 'r-retreat' },
};

function stageTrack(r: RunResult): HTMLElement {
  const wrap = h('div', { class: 'res-track' });
  r.segments.forEach((seg, i) => {
    const a = AREAS[seg.areaId];
    const pips = h('div', { class: 'res-pips' });
    for (let s = 0; s < 10; s++) {
      const kind = s === 9 ? 'boss' : s === 4 ? 'elite' : 'normal';
      const cleared = s < seg.stagesCleared || (s === 9 && seg.bossDefeated);
      const reached = s < seg.stageReached;
      pips.appendChild(
        h('span', { class: `res-pip pip-${kind}${cleared ? ' cleared' : reached ? ' reached' : ''}`, style: `--i:${i * 10 + s}` }, kind === 'boss' ? icon('crown', 1) : kind === 'elite' ? icon('skull', 1) : null),
      );
    }
    wrap.appendChild(
      h(
        'div',
        { class: 'res-seg' },
        h('div', { class: 'res-seg-name' }, h('span', { text: a.name }), h('span', { class: 'res-seg-stage', text: seg.bossDefeated ? '踏破' : `ステージ ${seg.stageReached}` })),
        pips,
      ),
    );
  });
  return wrap;
}

function recapRow(l: RecapLine): HTMLElement {
  return h(
    'div',
    { class: 'res-recap-row' },
    h('span', { class: 'res-recap-text', text: l.text }),
    h('span', { class: 'res-recap-arrow', text: '→' }),
    h('span', { class: 'res-recap-tip' }, l.key ? h('span', { class: 'key-badge', text: l.key }) : null, h('span', { text: l.tip })),
  );
}

export function showResult(host: ResultHost, r: RunResult, notices: Notice[]): Promise<ResultChoice> {
  const save = host.getSave();
  const head = HEADLINE[r.reason];
  const lastSeg = r.segments[r.segments.length - 1];
  const area = AREAS[lastSeg?.areaId ?? r.areaId];
  const bossesBeaten = r.segments.filter((s) => s.bossDefeated);
  let headText = head.text;
  let headCls = head.cls;
  let sub = r.reason === 'victory' ? `${area.bossName} を撃破した！` : head.sub;
  if (r.reason === 'victory' && bossesBeaten.length > 1) headText = `連続踏破 ×${bossesBeaten.length}`;
  if (r.reason !== 'victory' && bossesBeaten.length > 0) {
    // a Descent run that beat bosses and then fell deeper is a win, not a wipe
    headText = bossesBeaten.length > 1 ? `連続踏破 ×${bossesBeaten.length}` : '踏破！';
    headCls = 'r-victory';
    const names = bossesBeaten.map((s) => AREAS[s.areaId].bossName).join('・');
    sub = `${names} を撃破し、${area.name} ステージ${lastSeg.stageReached}まで進んだ（${head.text}）`;
  }

  // ── loot
  const firstClears = notices.filter((n): n is Extract<Notice, { kind: 'firstClear' }> => n.kind === 'firstClear');
  const stars = notices.filter((n): n is Extract<Notice, { kind: 'star' }> => n.kind === 'star');
  const records = notices.filter((n): n is Extract<Notice, { kind: 'bossRecord' }> => n.kind === 'bossRecord');
  const newRecord = notices.find((n): n is Extract<Notice, { kind: 'newRecord' }> => n.kind === 'newRecord');
  const depths = notices.filter((n): n is Extract<Notice, { kind: 'depth' }> => n.kind === 'depth');
  const bonusEmbers = firstClears.reduce((a, n) => a + n.embers, 0) + stars.reduce((a, n) => a + n.embers, 0) + depths.reduce((a, n) => a + n.embers, 0);

  const goldVal = h('b', { class: 'res-loot-val', text: '0' });
  const emberVal = h('b', { class: 'res-loot-val', text: '0' });
  const shardVal = h('b', { class: 'res-loot-val', text: '0' });
  const lootItems = [
    h('div', { class: 'res-loot-item gold' }, icon('gold', 2), h('span', { class: 'res-loot-plus', text: '+' }), goldVal, h('span', { class: 'res-loot-name', text: 'Gold' })),
  ];
  const totalEmbers = r.loot.embers + bonusEmbers;
  if (totalEmbers > 0 || save.stats.embersEarned > 0) {
    lootItems.push(h('div', { class: 'res-loot-item ember' }, icon('ember', 2), h('span', { class: 'res-loot-plus', text: '+' }), emberVal, h('span', { class: 'res-loot-name', text: 'Ember' })));
  }
  if (r.loot.shards > 0) {
    lootItems.push(h('div', { class: 'res-loot-item shard' }, icon('shard', 2), h('span', { class: 'res-loot-plus', text: '+' }), shardVal, h('span', { class: 'res-loot-name', text: 'Shard' })));
  }
  const bonusRows: HTMLElement[] = [];
  for (const n of depths) bonusRows.push(h('div', { class: 'res-bonus' }, icon('ember', 1), h('span', { text: `深部到達ボーナス（${AREAS[n.area].name} ステージ${n.stage}）` }), h('b', { text: `+${n.embers}` })));
  for (const n of firstClears) bonusRows.push(h('div', { class: 'res-bonus' }, icon('ember', 1), h('span', { text: `初回踏破ボーナス（${AREAS[n.area].name}）` }), h('b', { text: `+${n.embers}` })));
  for (const n of stars) {
    bonusRows.push(
      h(
        'div',
        { class: 'res-bonus star' },
        h('span', { class: 'res-stars' }, ...[0, 1, 2].map((i) => h('span', { class: `res-star${i < n.stars ? ' on' : ''}` }, icon('star', 1)))),
        h('span', { text: `ランタンスター（${AREAS[n.area].name}）` }),
        h('b', { text: `+${n.embers}` }),
      ),
    );
  }

  // ── records
  const recordRows: HTMLElement[] = [];
  for (const n of records) {
    const ratio = n.now > 0 ? n.first / n.now : 1;
    recordRows.push(
      h(
        'div',
        { class: 'res-record' },
        icon('clock', 1),
        h('span', { text: `${AREAS[n.area].bossName}：` }),
        h('span', { class: 'res-rec-first', text: `初討伐 ${fmtSec(n.first)}` }),
        h('span', { class: 'res-recap-arrow', text: '→' }),
        h('b', { class: 'res-rec-now', text: `今回 ${fmtSec(n.now)}` }),
        ratio >= 1.15 ? h('span', { class: 'res-rec-ratio', text: `（×${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}）` }) : null,
      ),
    );
  }
  for (const seg of bossesBeaten) {
    if (records.some((n) => n.area === seg.areaId) || seg.bossTime === null) continue;
    const st = save.areas[seg.areaId];
    const firstKill = firstClears.some((n) => n.area === seg.areaId) && st.bossFirstTime === seg.bossTime;
    recordRows.push(
      h(
        'div',
        { class: 'res-record' },
        icon('clock', 1),
        h('span', { text: `${AREAS[seg.areaId].bossName}：` }),
        h('b', { class: 'res-rec-now', text: `${firstKill ? '初討伐' : '討伐'} ${fmtSec(seg.bossTime)}` }),
        !firstKill && st.bossBestTime > 0 ? h('span', { class: 'res-rec-first', text: `（記録 ${fmtSec(st.bossBestTime)}）` }) : null,
      ),
    );
  }

  // ── recap
  const recap: RecapLine[] = [];
  if (r.reason === 'wiped' && r.killedBy) recap.push(killedByAdvice(r.killedBy, save));
  recap.push(...missedLines(r, save));
  if (!recap.length) {
    const ra = reasonAdvice(r, save);
    if (ra) recap.push(ra);
  }

  // ── next goal
  const goal = nextGoal(save);
  const lv = affordableLevelCount(save);
  const goalEl = goal
    ? h(
        'div',
        { class: `res-goal${goal.affordable ? ' ready' : ''}` },
        h(
          'div',
          { class: 'res-goal-top' },
          h('span', { class: 'res-goal-label', text: '次の目標' }),
          h('b', { class: 'res-goal-name', text: goal.view.node.name }),
          goal.affordable ? h('span', { class: 'res-goal-badge', text: '習得できる！' }) : null,
        ),
        h('p', { class: 'res-goal-desc', text: goal.view.node.desc }),
        h(
          'div',
          { class: 'res-goal-bar' },
          h('div', { class: 'res-goal-fill', style: `--f:${clamp(save.embers / Math.max(1, goal.cost), 0, 1).toFixed(3)}` }),
          h('span', { class: 'res-goal-num' }, icon('ember', 1), h('span', { text: `${fmt(save.embers)} / ${fmt(goal.cost)}` })),
        ),
      )
    : null;
  const lvEl = h(
    'div',
    { class: `res-levels${lv > 0 ? ' ready' : ''}` },
    icon('gold', 1),
    h('span', { text: `${fmt(save.gold)} Gold` }),
    h('b', { text: lv > 0 ? `Lv+${lv} 可能` : 'レベルアップにはGoldが不足' }),
  );

  // ── stats
  const stat = (label: string, value: string, cls = '') => h('div', { class: `res-stat ${cls}` }, h('span', { class: 'res-stat-k', text: label }), h('b', { class: 'res-stat-v', text: value }));
  const stats = h(
    'div',
    { class: 'res-stats' },
    stat('撃破', fmt(r.kills)),
    stat('中断', fmt(r.interrupts), r.interrupts > 0 ? 'hl-orange' : ''),
    stat('PERFECT', fmt(r.perfects), r.perfects > 0 ? 'hl-gold' : ''),
    stat('ROUT', fmt(r.routs), r.routs > 0 ? 'hl-ember' : ''),
    stat('時間', fmtSec(r.duration)),
    stat('最大ダメージ', fmt(r.bestHit)),
    r.emberNovas > 0 ? stat('Ember Nova', fmt(r.emberNovas), 'hl-gold') : null,
  );

  // ── buttons
  const upgradeBtn = h('button', { class: 'btn primary big res-upgrade' }, h('span', { text: '強化する' }), h('span', { class: 'key-badge', text: 'Enter' }));
  const againBtn = h('button', { class: 'btn big res-again' }, h('span', { text: 'もう一度出発' }), h('span', { class: 'key-badge', text: 'Space' }));

  const content = h(
    'div',
    { class: `result ${headCls}` },
    h('div', { class: 'res-head' }, h('div', { class: 'res-kicker', text: 'EXPEDITION RESULT' }), h('h2', { class: 'res-title', text: headText }), h('p', { class: 'res-sub', text: sub })),
    newRecord ? h('div', { class: 'res-newrecord', text: `新記録！ ${AREAS[newRecord.area].name} ステージ ${newRecord.stage} に到達` }) : null,
    stageTrack(r),
    stats,
    h('div', { class: 'res-section' }, h('div', { class: 'res-section-h', text: '獲得' }), h('div', { class: 'res-loot' }, ...lootItems), bonusRows.length ? h('div', { class: 'res-bonuses' }, ...bonusRows) : null),
    recordRows.length ? h('div', { class: 'res-section' }, h('div', { class: 'res-section-h', text: 'ボス記録' }), ...recordRows) : null,
    recap.length ? h('div', { class: 'res-section res-recap' }, h('div', { class: 'res-section-h', text: r.reason === 'wiped' ? '敗因と対策' : 'ふりかえり' }), ...recap.map(recapRow)) : null,
    h('div', { class: 'res-section res-next' }, goalEl, lvEl),
    h('div', { class: 'res-actions' }, againBtn, upgradeBtn),
  );

  // Levels are the core loop: open the party tab when Gold buys something, else the tree if a node is affordable.
  const tab: CampTab = lv === 0 && goal?.affordable ? 'tree' : 'party';

  return new Promise((resolve) => {
    let done = false;
    const shownAt = performance.now();
    const LOCK_MS = 600; // absorbs leftover Overdrive / card-dismiss key presses so results can't be skipped by accident
    const choose = (action: ResultAction) => {
      if (done || performance.now() - shownAt < LOCK_MS) return;
      done = true;
      host.audio.play('uiClick');
      resolve({ action, tab });
      modal.close();
    };
    const modal = host.modals.open(content, {
      className: 'modal-result',
      closable: false,
      label: '遠征結果',
      onKey: (e) => {
        if (e.repeat) return true;
        if (e.key === 'Enter' || e.key === 'Escape') {
          choose('upgrade');
          return true;
        }
        if (e.key === ' ' || e.code === 'Space') {
          choose('again');
          return true;
        }
        return false;
      },
    });
    upgradeBtn.addEventListener('click', () => choose('upgrade'));
    againBtn.addEventListener('click', () => choose('again'));

    // first result: point the player at 強化する
    if (host.firstTime('battle.upgrade')) {
      upgradeBtn.classList.add('tut-pulse');
      upgradeBtn.appendChild(h('span', { class: 'tut-bubble-inline', text: 'Goldでヒーローを強化しよう！' }));
    }

    // loot count-up
    void (async () => {
      await wait(220);
      if (r.loot.gold > 0) host.audio.play('coin');
      const jobs = [countUp(goldVal, 0, r.loot.gold, 750)];
      if (totalEmbers > 0) {
        jobs.push(
          (async () => {
            await countUp(emberVal, 0, r.loot.embers, 600);
            if (bonusEmbers > 0) {
              await wait(120);
              host.audio.play('ember');
              await countUp(emberVal, r.loot.embers, totalEmbers, 450);
            } else if (r.loot.embers > 0) host.audio.play('ember');
          })(),
        );
      } else emberVal.textContent = '0';
      if (r.loot.shards > 0) jobs.push(countUp(shardVal, 0, r.loot.shards, 700).then(() => host.audio.play('shard')));
      await Promise.all(jobs);
    })();
  });
}
