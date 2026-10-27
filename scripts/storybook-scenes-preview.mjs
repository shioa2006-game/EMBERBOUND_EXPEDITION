// Optional offline art review. Pass an installed @napi-rs/canvas package directory as argv[2].
// This renders the same Canvas paths as the browser without starting a browser or touching saves.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { createCanvas, Path2D } = require(process.argv[2] || '@napi-rs/canvas');
globalThis.Path2D = Path2D;
globalThis.document = { createElement(name) { if (name !== 'canvas') throw new Error(name); return createCanvas(1, 1); } };
const { drawStoryAreaBackground, drawStoryAreaForeground, drawStoryCampBackground, drawStoryTitleBackground } = await import('../src/render/storybook/scenes.ts');
const { getStorySprite } = await import('../src/render/storybook/characters.ts');
const areas = ['ashwood','ruins','glimmer','rimeholt','hollow','heart'];
const bosses = ['gnarlwood','coilscale','geode_colossus','rimequeen','hollow_sovereign','shadow_guardian'];
const out = resolve('docs/art/storybook-review'); await mkdir(out, {recursive:true});
const unit = (g,key,x,y) => { const s=getStorySprite(key,'idle',0,1);g.fillStyle='rgba(12,10,18,.35)';g.beginPath();g.ellipse(x,y,7,1.8,0,0,Math.PI*2);g.fill();g.drawImage(s.canvas,x-s.ax,y-s.ay,s.width,s.height); };
const contact = createCanvas(1600, 1568), cg = contact.getContext('2d');cg.fillStyle='#201f28';cg.fillRect(0,0,1600,1568);
for (let i=0;i<8;i++) {
  const c=createCanvas(1600,720), g=c.getContext('2d');g.scale(4,4);
  const label=areas[i] || (i===6?'camp':'title');
  if(i<6){drawStoryAreaBackground(g,label,0,7);for(const [key,x,y] of [['guardian',152,150],['ranger',120,146],['arcanist',90,151],['oracle',60,147]])unit(g,key,x,y);unit(g,bosses[i],318,152);drawStoryAreaForeground(g,label,0,7);}
  else if(i===6){drawStoryCampBackground(g,{selectedArea:'ashwood'},7);for(const [key,x] of [['guardian',164],['ranger',140],['arcanist',238],['oracle',262]])unit(g,key,x,150);}
  else drawStoryTitleBackground(g,7);
  await writeFile(resolve(out,label+'.png'),c.toBuffer('image/png'));
  const x=i%2*800,y=Math.floor(i/2)*392;cg.fillStyle='#d6c8b8';cg.font='18px sans-serif';cg.fillText(label,x+14,y+23);cg.drawImage(c,x,y+32,800,360);
}
await writeFile(resolve(out,'contact.png'),contact.toBuffer('image/png'));
// Exercise fractional scroll while the ground layer crosses its 480-world-pixel wrap.
const metrics=[];
for(const id of areas){
  const c=createCanvas(1600,720),g=c.getContext('2d');g.scale(4,4);
  let start=performance.now();drawStoryAreaBackground(g,id,0,7);drawStoryAreaForeground(g,id,0,7);const first=g.getImageData(0,0,1600,720).data;
  const cold=performance.now()-start;start=performance.now();
  for(let i=0;i<30;i++){drawStoryAreaBackground(g,id,477+i*.2,7+i/60);drawStoryAreaForeground(g,id,477+i*.2,7+i/60);}
  const average=(performance.now()-start)/30;
  // Ground and foreground cross their tile wrap while scroll increases around 480.
  await writeFile(resolve(out,id+'-scroll.png'),c.toBuffer('image/png'));
  metrics.push({id,coldMs:+cold.toFixed(1),warmFrameMs:+average.toFixed(2),sampledPixels:first.length/4});
}
await writeFile(resolve(out,'metrics.json'),JSON.stringify(metrics,null,2));
console.log(JSON.stringify({out,metrics},null,2));
