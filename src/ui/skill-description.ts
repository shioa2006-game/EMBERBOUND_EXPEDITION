// Current skill descriptions shared by camp and battle. Conditional effects stay separate.
import { BAL } from '../core/balance.ts';
import type { HeroId, Mods } from '../core/types.ts';
import { HEROES } from '../data/heroes.ts';

const pct = (v: number) => `${+(v * 100).toFixed(2)}%`;

export function skillDescription(hero: HeroId, m: Mods): string {
  const lines: string[] = [];
  if (hero === 'guardian') {
    lines.push(`溜め攻撃中の敵を優先して強打（${pct(BAL.bashMult)}）。オレンジの溜めを中断するとBREAK（${pct(BAL.bashBreakMult * BAL.staggerMult)}・スタン・被ダメージ${BAL.staggerMult}倍）。`);
    lines.push(`通常スタン${BAL.bashStun + m.bashStunBonus}秒（ボスは${pct(BAL.bossStunMult)}の時間）。`);
    if (m.shockwaveBash) lines.push('全体に命中し中断。他の敵への通常打撃は50%・スタン0.75秒。');
    if (m.ironResolve) lines.push('中断成功：残りCD半減・自身のHP10%回復。');
    if (m.sunder) lines.push(`命中：装甲を${m.sunder}秒間0に。`);
    if (m.moltenBash) lines.push('命中：Burn3を付与。');
    if (m.bashWeakens) lines.push('中断できない溜め攻撃を弱体化。');
    if (m.unbrokenVow) lines.push('誓い満タン：全体に蓄積量＋攻撃力300%の確定ダメージを追加。');
  } else if (hero === 'ranger') {
    lines.push(`敵にランダムで${BAL.arrowRainArrows + m.arrowRainExtra}本${m.arrowRainExtra ? `（基礎${BAL.arrowRainArrows}＋強化${m.arrowRainExtra}）` : ''}、各${pct(BAL.arrowRainMult)}。クリティカル可。集団に有効。`);
    if (m.pinningVolley) lines.push('スタン中の敵には必ずクリティカル。');
    if (m.arrowRainMarks) lines.push('命中：4秒のMarkを付与。');
    if (m.burnAll) lines.push('命中：Burn1を付与。');
    if (m.kindledArrows) lines.push('クリティカル時：Burn1を追加。');
  } else if (hero === 'arcanist') {
    lines.push(`${BAL.meteorDelay}秒後、敵全体に${pct(BAL.meteorMult)}の魔法ダメージ＋Burn2。シールドに${BAL.meteorWardMult}倍。`);
    if (m.meteorExtra) lines.push(`小隕石${m.meteorExtra}発を追加（各100%＋Burn1）。`);
    if (m.meteorBurningGround) lines.push('4秒間、0.5秒ごとに敵全体へBurn1。');
    if (m.radiantMeteor) lines.push(`命中した敵1体につき味方全員に最大HP${pct(0.1 * m.barrierMult)}のBarrier（最大${pct(Math.min(1, 0.4 * m.barrierMult))}・8秒）。`);
  } else {
    lines.push(`味方全員に最大HP${pct(Math.min(1.5, BAL.sanctuaryBarrier * m.barrierMult))}のBarrier（${BAL.sanctuaryDuration * (m.sanctuaryLasting ? 3 : 1)}秒）＋最大HP${pct((m.hallowed ? 0.25 : BAL.sanctuaryHeal) * m.healMult)}分の回復。状態異常を解除。`);
    if (m.hallowed) lines.push('6秒間、味方の与ダメージ＋30%。');
    if (m.bulwarkOfFaith) lines.push(`GuardianのBarrierは${pct(Math.min(1.5, BAL.sanctuaryBarrier * m.barrierMult * 1.5))}。Shield BashのCDを解消し4秒挑発。`);
    if (m.divineEcho) lines.push('4秒後、Oracleが生存・戦闘中なら50%の効果で再発動。');
    if (m.overflowCap) lines.push(`余剰回復はBarrierへ変換（最大HP${pct(m.overflowCap)}まで）。`);
  }
  return lines.join('\n');
}

export function heroMechanic(hero: HeroId, m: Mods): string {
  if (hero === 'ranger') return `高速の矢とクリティカル。敵をクリックしてMark（被ダメージ＋${pct(m.markBonus)}・全員で集中攻撃）。`;
  return HEROES[hero].mechanic;
}
