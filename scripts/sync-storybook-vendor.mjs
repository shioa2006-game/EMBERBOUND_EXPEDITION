// Copy the reviewed Studio drawings into the standalone game. The Studio stays untouched.
// Run from the game root: node scripts/sync-storybook-vendor.mjs [path-to-studio]
import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || path.join(game, '../Storybook_Character_Studio_Side_Scroller'));
const target = path.join(game, 'src/render/storybook/vendor');
await mkdir(target, { recursive: true });
await cp(path.join(source, 'src'), path.join(target, 'src'), { recursive: true });
await cp(path.join(source, 'characters/shared'), path.join(target, 'characters/shared'), { recursive: true });
const ids = (await readdir(path.join(source, 'characters'))).filter(id => id.startsWith('eb-')).sort();
if (ids.length !== 44) throw new Error(`Expected 44 reviewed EMBERBOUND drawings, found ${ids.length}`);
for (const id of ids) await cp(path.join(source, 'characters', id), path.join(target, 'characters', id), { recursive: true });

// Expose only equipment material palettes in the vendored copy. Drawing geometry and timings stay intact.
for (const id of ['guardian', 'arcanist', 'oracle', 'ranger']) {
  const file = path.join(target, 'characters', `eb-${id}`, 'character.js');
  let text = await readFile(file, 'utf8');
  if (id === 'guardian') {
    const original = text;
    text = text.replace(/const C = Object\.freeze\(\{([\s\S]*?)\}\);/, 'const C = {$1};');
    if (text === original) throw new Error('Guardian palette definition changed; review the palette adapter');
  }
  text += `\n// Game adapter: palette is restored after each synchronous sprite bake.\nexport { ${id === 'ranger' ? 'ARC' : 'C'} as gearColors };\n`;
  await writeFile(file, text);
}

const registry = ids.map((id, i) => `import { character as c${i} } from './characters/${id}/character.js';`).join('\n')
  + '\n' + ['guardian', 'arcanist', 'oracle', 'ranger'].map(id => `import { gearColors as ${id} } from './characters/eb-${id}/character.js';`).join('\n')
  + `\nexport const definitions = [${ids.map((_, i) => `c${i}`).join(', ')}];\nexport const gearPalettes = { guardian, arcanist, oracle, ranger };\nexport { isolateDrawing } from './src/core/settings.js';\n`;
await writeFile(path.join(target, 'registry.js'), registry);
await writeFile(path.join(target, 'source-manifest.json'), JSON.stringify({
  source: 'Storybook_Character_Studio_Side_Scroller',
  characters: ids,
  modifications: ['Expose four hero equipment palettes', 'Make Guardian equipment palette mutable during isolated frame baking'],
}, null, 2) + '\n');
console.log(`Copied ${ids.length} character definitions into ${path.relative(game, target)}`);
