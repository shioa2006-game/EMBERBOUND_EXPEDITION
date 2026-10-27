import {
  getStorySprite, getStoryFrameCount, getStoryDefinition, getStoryBounds, getStoryCacheStats,
  storyCharacterKeys, getStoryFrameIndex, getStoryProjectileOrigin, getStoryReleaseTime,
  type StoryPose, type StorySprite,
} from '../../src/render/storybook/characters.ts';

const status = document.querySelector<HTMLElement>('#status')!;
const output = document.querySelector<HTMLElement>('#results')!;
const failures: string[] = [];
const heroes = ['guardian', 'ranger', 'arcanist', 'oracle'];
const poses: StoryPose[] = ['idle', 'walk', 'attack', 'cast', 'hurt', 'dead'];
const roster = document.querySelector<HTMLCanvasElement>('#roster')!.getContext('2d')!;
const tiers = document.querySelector<HTMLCanvasElement>('#tiers')!.getContext('2d')!;
const tierNames = ['青銅・革', '銀', '金', '青銀', '深紅', '白金'];
const keys = [...heroes, ...storyCharacterKeys().filter(key => !heroes.includes(key))];
let checkedFrames = 0, checkedAppearances = 0;
const start = performance.now();

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number) {
  g.fillStyle = '#483b2f'; g.font = '14px system-ui'; g.fillText(text, x, y);
}
function place(g: CanvasRenderingContext2D, sprite: StorySprite, x: number, y: number, scale: number) {
  g.drawImage(sprite.canvas, x - sprite.ax * scale, y - sprite.ay * scale, sprite.width * scale, sprite.height * scale);
}
function floor(g: CanvasRenderingContext2D, x: number, y: number, width: number) {
  g.strokeStyle = '#c9bda4'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + width, y); g.stroke();
}
function inspectFrame(key: string, pose: StoryPose, frame: number, tier: number, facing?: 'R' | 'L') {
  const f = getStorySprite(key, pose, frame, tier, facing), id = `${key}/${pose}/${frame}/tier${tier}/${facing || getStoryDefinition(key).emberbound.facing}`;
  if (![f.ax, f.ay, f.width, f.height, f.density].every(Number.isFinite)) failures.push(`${id}: non-finite dimensions`);
  if (f.canvas.width < 1 || f.canvas.height < 1 || f.width !== f.canvas.width / f.density || f.height !== f.canvas.height / f.density) failures.push(`${id}: inconsistent canvas dimensions`);
  const ctx = f.canvas.getContext('2d')!;
  // A cropped frame always retains a transparent margin. Ink touching the edge means source frameBox clipping.
  const w = f.canvas.width, h = f.canvas.height;
  const borders = [ctx.getImageData(0, 0, w, 1), ctx.getImageData(0, h - 1, w, 1), ctx.getImageData(0, 0, 1, h), ctx.getImageData(w - 1, 0, 1, h)];
  if (borders.some(({ data }) => data.some((value, i) => i % 4 === 3 && value > 40))) failures.push(`${id}: ink touches frame edge`);
  checkedFrames++;
}

async function run() {
  let slice = performance.now();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i], def = getStoryDefinition(key);
    const x = (i % 6) * 208, y = Math.floor(i / 6) * 285;
    label(roster, key, x + 10, y + 22);
    floor(roster, x + 8, y + 252, 192);
    place(roster, getStorySprite(key, 'idle', 0), x + 104, y + 252, 3);
    const bounds = getStoryBounds(key);
    if (![bounds.left, bounds.right, bounds.top, bounds.w, bounds.h].every(Number.isFinite)) failures.push(`${key}: invalid body bounds`);
    for (const tier of heroes.includes(key) ? [0, 1, 2, 3, 4, 5] : [0]) {
      checkedAppearances++;
      for (const pose of poses) {
        if (!def.actions[pose]) continue;
        for (let frame = 0; frame < getStoryFrameCount(key, pose); frame++) {
          try {
            inspectFrame(key, pose, frame, tier);
            if (heroes.includes(key)) inspectFrame(key, pose, frame, tier, 'L');
          } catch (error) { failures.push(`${key}/${pose}/${frame}/tier${tier}: ${String(error)}`); }
          if (performance.now() - slice > 8) {
            status.textContent = `検証中: ${key} / ${checkedFrames}コマ / 問題 ${failures.length}件`;
            await new Promise<void>(resolve => setTimeout(resolve, 0)); slice = performance.now();
          }
        }
      }
      if (heroes.includes(key)) {
        const tx = tier * 190, ty = heroes.indexOf(key) * 180;
        label(tiers, `${key} / ${tierNames[tier]}`, tx + 8, ty + 22);
        floor(tiers, tx + 7, ty + 156, 176);
        place(tiers, getStorySprite(key, 'idle', 0, tier), tx + 95, ty + 156, 4);
        if (getStoryFrameIndex(key, 'dead', 120) !== getStoryFrameCount(key, 'dead') - 1) failures.push(`${key}: death is not held`);
      }
    }
  }
  const projectiles = ['ranger', 'drowned_archer', 'rime_archer', 'shadow_ranger'].map(key => ({ key,
    attack: getStoryProjectileOrigin(key), cast: getStoryProjectileOrigin(key, 'cast'), release: getStoryReleaseTime(key) }));
  for (const { key, attack } of projectiles) if (!attack || ![attack.x, attack.y].every(Number.isFinite)) failures.push(`${key}: invalid arrow origin`);
  const result = { characters: keys.length, appearances: checkedAppearances, heroFacings: ['R', 'L'], checkedFrames, elapsedMs: Math.round(performance.now() - start),
    failures, projectiles, cache: getStoryCacheStats() };
  (window as unknown as { __storybookCharacters: typeof result }).__storybookCharacters = result;
  output.textContent = JSON.stringify(result, null, 2);
  status.dataset.result = failures.length ? 'failed' : 'passed';
  status.textContent = `${failures.length ? '要修正' : '合格'}: ${keys.length}種 / ${checkedAppearances}外見 / ${checkedFrames}コマ / 問題 ${failures.length}件`;
}
run().catch(error => {
  status.dataset.result = 'failed'; status.textContent = String(error); output.textContent = String((error as Error).stack);
});
