// Runtime balance overrides for experiments: `--set=BAL.levelCostGrowth=1.18,AREAS.ruins.stageOffset=5`.
// Arrays use ';' between elements: `BAL.eliteEmbers=[2;3;5;7;9;12]`.
// Paths start at BAL | AREAS | ENEMIES | HEROES | TREE | RELICS. Enemy ability fields can be addressed by
// ability id: `ENEMIES.gnarlwood.abilities.rootCrush.effect.mult=15`. Values are parsed as JSON when possible.
import { BAL } from '../src/core/balance.ts';
import { AREAS } from '../src/data/areas.ts';
import { ENEMIES } from '../src/data/enemies.ts';
import { HEROES } from '../src/data/heroes.ts';
import { RELICS } from '../src/data/relics.ts';
import { TREE_BY_ID } from '../src/data/tree.ts';

const ROOTS: Record<string, unknown> = { BAL, AREAS, ENEMIES, HEROES, TREE: TREE_BY_ID, RELICS };

export function applyOverride(spec: string): void {
  const eq = spec.indexOf('=');
  if (eq < 0) throw new Error(`bad override ${spec}`);
  const path = spec.slice(0, eq).split('.');
  const raw = spec.slice(eq + 1).replace(/;/g, ','); // arrays: [2;3;5]
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }
  let obj = ROOTS[path[0]] as Record<string, unknown>;
  if (!obj) throw new Error(`unknown root ${path[0]}`);
  for (let i = 1; i < path.length - 1; i++) {
    const k = path[i];
    let next: unknown = obj[k];
    if (next === undefined && Array.isArray(obj)) next = (obj as { id?: string }[]).find((x) => x.id === k);
    if (next === undefined || next === null) throw new Error(`bad path ${spec} at ${k}`);
    obj = next as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  if (!(last in obj)) console.warn(`(override adds new field ${spec})`);
  obj[last] = value;
}

/** Apply every `--set=a=b,c=d` argument (also `--set a=b`). */
export function applyOverridesFromArgv(argv: string[]): string[] {
  const specs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--set=')) specs.push(...a.slice(6).split(','));
    else if (a === '--set' && argv[i + 1]) specs.push(...argv[++i].split(','));
  }
  for (const s of specs) applyOverride(s);
  return specs;
}
