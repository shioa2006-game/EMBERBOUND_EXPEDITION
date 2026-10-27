// Balance simulation: `npm run sim` (or `node scripts/sim.ts --log [--seed=N] [--profile=casual]`).
// For the multi-seed / multi-profile table use `node scripts/report.ts`.
import { newSave } from '../src/core/state.ts';
import { DEFAULT_SKILL, fmt, playthrough, PROFILES, type ProfileId } from './bot.ts';
import { applyOverridesFromArgv } from './overrides.ts';

const __overrides = applyOverridesFromArgv(process.argv.slice(2));
if (__overrides.length) console.log('overrides:', __overrides.join(' '));

const log = process.argv.includes('--log');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const seed = arg('seed') ? Number(arg('seed')) : 12345;
const profileId = arg('profile') as ProfileId | undefined;
const skill = profileId ? PROFILES[profileId] : DEFAULT_SKILL;
if (profileId && !skill) throw new Error(`unknown profile ${profileId} (expert | casual | noskill)`);
const relics = arg('relics')?.split(',');
const pursue = arg('pursue')?.split(',');

const rep = playthrough(newSave(0), { seed, log, skill, maxTime: 3 * 3600, relics, pursue });
console.log('\n=== TIMELINE ===');
let prev = 0;
for (const e of rep.timeline) {
  const gap = e.t - prev;
  console.log(`${fmt(e.t)}  (+${Math.round(gap)}s)  ${e.what}`);
  prev = e.t;
}
console.log('\n=== SUMMARY ===');
console.log('profile:', skill.name ?? 'default', ' seed:', seed);
console.log('first clear (Hollow Sovereign):', rep.firstClearTime ? fmt(rep.firstClearTime) : 'NOT REACHED');
console.log('true ending:', rep.trueEndTime ? fmt(rep.trueEndTime) : 'NOT REACHED');
console.log('runs:', rep.runs.length, ' max runs stuck on one stage:', rep.maxRunsOnAStage);
console.log('boss attempts:', JSON.stringify(rep.attemptsPerBoss));
if (rep.treeAtFirstClear !== null) console.log(`tree at first clear: ${(rep.treeAtFirstClear * 100).toFixed(0)}% of cycle-1 embers, ${((rep.treeNodesAtFirstClear ?? 0) * 100).toFixed(0)}% of nodes`);
