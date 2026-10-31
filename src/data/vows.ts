import type { VowDef } from '../core/types.ts';

// Vows (誓約): handicaps chosen at a Rekindle for the next cycle. Each one asks a different question of the
// party, so a different relic answers it; each pays back in Relic Shards at the Rekindle that ends the cycle.

const list: VowDef[] = [
  {
    id: 'steel', name: '鋼の誓い', shards: 4, icon: 'crown',
    desc: 'エリートとボスのHP +50%。',
    hint: '硬い大物を削りきる火力が要る。',
    apply: (m) => { m.enemyHpMultElite *= 1.5; },
  },
  {
    id: 'horde', name: '群れの誓い', shards: 4, icon: 'skull',
    desc: '通常の敵のHP +80%。',
    hint: '敵全体をまとめて削る手段が要る。',
    apply: (m) => { m.enemyHpMultNormal *= 1.8; },
  },
  {
    id: 'lone', name: '孤高の誓い', shards: 4, icon: 'hero_oracle',
    desc: 'Oracleを野営地に残し、3人で遠征する。',
    hint: '回復なしで持ちこたえる守りが要る。',
    bench: 'oracle',
    apply: () => {},
  },
  {
    id: 'fury', name: '激昂の誓い', shards: 2, icon: 'sword',
    desc: 'オレンジの技（中断できる技）のダメージ ×3。',
    hint: '中断を外したときの一撃が重い。',
    apply: (m) => { m.orangeDmgMult *= 3; },
  },
];

export const VOWS: Record<string, VowDef> = Object.fromEntries(list.map((v) => [v.id, v]));
export const VOW_LIST = list;
