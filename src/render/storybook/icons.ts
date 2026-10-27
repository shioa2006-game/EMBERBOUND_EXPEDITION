/** Small, painted marginal illustrations. Drawn once at the requested display density. */
type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];
const CACHE = new Map<string, HTMLCanvasElement>();
const INK = '#302b2b';
const IVORY = '#f2e3bd';
const GOLD = '#d6b573';
const BLUE = '#9bc9d4';
const EMBER = '#eaa36a';
const PURPLE = '#c2a3d6';

function line(g: Ctx, points: readonly Pt[], color = IVORY, width = 1.2): void {
  g.beginPath();
  points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.strokeStyle = color; g.lineWidth = width; g.stroke();
}
function shape(g: Ctx, points: readonly Pt[], color: string): void {
  g.beginPath();
  points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
  g.closePath(); g.fillStyle = color; g.fill();
  g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
}
function path(g: Ctx, d: string, color: string, outline = INK, width = 1.3): void {
  const p = new Path2D(d); g.fillStyle = color; g.fill(p);
  g.strokeStyle = outline; g.lineWidth = width; g.stroke(p);
}
function oval(g: Ctx, x: number, y: number, rx: number, ry: number, color: string, outline = INK): void {
  g.beginPath(); g.ellipse(x, y, rx, ry, -.05, 0, Math.PI * 2);
  g.fillStyle = color; g.fill(); g.strokeStyle = outline; g.lineWidth = 1.2; g.stroke();
}
function ring(g: Ctx, x: number, y: number, r: number, color = GOLD, width = 1.1): void {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.strokeStyle = color; g.lineWidth = width; g.stroke();
}
function star(g: Ctx, x: number, y: number, r: number, color = IVORY): void {
  const points: Pt[] = [];
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, d = i % 2 ? r * .25 : r; points.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); }
  shape(g, points, color);
}
function flame(g: Ctx, x = 0, y = 0, k = 1): void {
  g.save(); g.translate(x, y); g.scale(k, k);
  path(g, 'M16 2 C20 9 15 11 22 9 C23 14 29 19 26 25 C23 32 8 31 6 23 C4 17 12 15 11 10 C14 11 15 8 16 2Z', '#c3714e');
  path(g, 'M17 11 C18 17 24 19 22 24 C20 29 11 28 10 23 C9 19 15 17 17 11Z', '#f2bf76');
  path(g, 'M17 19 C18 23 20 24 18 26 C15 28 12 25 14 23Z', '#fff0bf', '#e0ae70', .65);
  g.restore();
}
function shield(g: Ctx, color = BLUE): void {
  path(g, 'M5 6 Q16 1 27 6 L25 20 Q22 27 16 30 Q8 26 6 19Z', color);
  path(g, 'M8 8 Q16 5 24 8 L22 19 Q20 24 16 27 Q11 23 9 18Z', '#596d79', '#e8d5a1', .8);
  line(g, [[16,7],[16,25]], '#cfdfd5', .7);
}
function arrow(g: Ctx, x = 0, y = 0, rotation = 0, color = IVORY): void {
  g.save(); g.translate(x, y); g.rotate(rotation);
  line(g, [[8,26],[23,6]], '#74624a', 2.3);
  line(g, [[8.6,25.5],[22.5,7]], color, .85);
  shape(g, [[19,7],[25,3],[24,11],[22,8]], '#ccdbd4');
  line(g, [[6,21],[9,25],[13,25]], GOLD, 1.3);
  line(g, [[8,18],[11,22],[15,22]], GOLD, 1.2);
  g.restore();
}
function lantern(g: Ctx): void {
  ring(g, 16, 5.5, 3.6, GOLD, 1.5);
  shape(g, [[9,8],[23,8],[26,12],[24,27],[8,27],[6,12]], '#886b47');
  path(g, 'M9 12 L23 12 L21 24 Q16 26 11 24Z', '#e3b868');
  flame(g, 9.4, 12, .42);
  line(g, [[9,11],[11,26]], '#6b533c', 1.5); line(g, [[23,11],[21,26]], '#6b533c', 1.5);
  line(g, [[7,28],[25,28]], '#d7bd83', 1.5);
  line(g, [[9,9],[22,9]], '#efdbab', .8);
}
function gem(g: Ctx, color = BLUE): void {
  shape(g, [[15,2],[25,11],[23,23],[14,30],[5,20],[7,8]], color);
  line(g, [[15,2],[12,12],[14,30]], '#f2ead3', 1);
  line(g, [[7,8],[12,12],[25,11]], '#e2e7df', .8);
  line(g, [[12,12],[23,23]], '#527c99', 1.2);
  line(g, [[7,17],[10,20]], '#d7f0e8', .7);
}
function heart(g: Ctx, color = '#cb7b77'): void {
  path(g, 'M16 8 C8 -1 0 9 5 17 Q8 23 16 29 Q25 22 28 15 C32 4 21 0 16 8Z', color);
  line(g, [[6,12],[7,9],[10,7]], '#ffe1c7', 1);
  line(g, [[20,23],[24,18],[25,14]], '#8b4f55', .9);
}
function crown(g: Ctx, color = GOLD): void {
  shape(g, [[4,8],[10,14],[16,4],[22,14],[28,8],[25,27],[7,27]], color);
  line(g, [[8,23],[24,23]], '#f5dfaa', 1);
  shape(g, [[16,14],[19,18],[16,22],[13,18]], '#bd6953');
  for (const x of [4,16,28]) oval(g, x, x === 16 ? 4 : 8, 1.6, 1.6, IVORY);
}
function skull(g: Ctx): void {
  path(g, 'M9 23 C0 19 3 5 12 3 C24 0 31 9 27 19 L23 23 L22 29 L10 29Z', '#dfd7be');
  oval(g, 11, 15, 3.5, 4, '#544d4b'); oval(g, 22, 14, 3, 4, '#544d4b');
  shape(g, [[16,18],[13.8,22],[18,22]], '#71645a');
  for (const x of [13,17,20]) line(g, [[x,25],[x,29]], '#7e7566', .8);
  line(g, [[10,6],[13,8],[12,11]], '#a39a83', .8);
}
function snow(g: Ctx): void {
  for (let i = 0; i < 6; i++) {
    g.save(); g.translate(16,16); g.rotate(i * Math.PI / 3);
    line(g, [[0,0],[0,-13]], '#b8dfe6', 1.9);
    line(g, [[-4,-8],[0,-5],[4,-8]], '#d7eff0', 1.1);
    line(g, [[-3,-12],[0,-10],[3,-12]], '#86b4d3', .9); g.restore();
  }
  gem(g, '#b3d6e4');
}

function draw(g: Ctx, key: string): void {
  switch (key) {
    case 'gold':
      oval(g, 18, 21, 11, 7, '#ae8445'); oval(g, 15, 15, 11, 10, '#d8b66c');
      g.save(); g.scale(1, .9); ring(g, 15, 16.5, 7.4, '#f3dfa8', .8); g.restore();
      line(g, [[16,8],[12,15],[17,14],[13,22]], '#886532', 1.7);
      line(g, [[23,23],[25,22]], '#f4db9a', .7); break;
    case 'ember': case 'status_burn': flame(g); break;
    case 'shard': gem(g); break;
    case 'lantern': case 'relic_lantern': lantern(g); break;
    case 'star': star(g,16,16,14,GOLD); star(g,16,16,7,IVORY); break;
    case 'skull': case 'status_doom': skull(g); if (key === 'status_doom') { ring(g,16,16,14,PURPLE,.9); line(g,[[3,5],[7,7]],PURPLE,1); } break;
    case 'crown': crown(g); break;
    case 'lock':
      path(g, 'M9 15 L9 9 C9 0 23 0 23 9 L23 15 L19 15 L19 9 C19 5 13 5 13 9 L13 15Z', '#b8b9ad');
      path(g, 'M6 14 Q16 12 26 14 L25 28 Q16 30 7 28Z', '#c3a266');
      oval(g,16,20,2.2,2.5,INK); line(g,[[16,21],[16,25]],INK,1.8); break;
    case 'sword':
      shape(g,[[23,2],[27,3],[26,8],[13,22],[9,18]],'#c7d7d7');
      line(g,[[24,5],[12,19]],'#f4efd4',1);
      line(g,[[6,17],[16,25]],GOLD,3); line(g,[[9,23],[5,28]],'#b88e5b',3.5);
      oval(g,4.5,28,2,2,GOLD); break;
    case 'heart': heart(g); break;
    case 'clock':
      oval(g,16,17,13,13,GOLD); oval(g,16,17,10.5,10.5,'#323d45');
      line(g,[[16,9],[16,17],[22,20]],IVORY,1.6);
      for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]) line(g,[[16+Math.cos(a)*8,17+Math.sin(a)*8],[16+Math.cos(a)*9,17+Math.sin(a)*9]],GOLD,1);
      line(g,[[13,2],[19,2]],GOLD,2); break;
    case 'skill_shieldBash':
      shield(g); star(g,25,8,5,IVORY); line(g,[[1,16],[5,16]],EMBER,1.5); line(g,[[2,23],[6,21]],EMBER,1.1); break;
    case 'skill_arrowRain':
      arrow(g,-6,3); arrow(g,1,-3); arrow(g,7,3); break;
    case 'skill_meteor':
      path(g,'M29 2 L25 19 L15 28 L5 28 L4 18 L14 7 L14 15 L23 4 L21 13Z','#b9684e');
      path(g,'M24 8 L20 22 L12 27 L5 23 L10 16 L11 21 L19 12 L18 20Z','#eeb775');
      oval(g,10,23,6,5.6,'#f7dba0'); line(g,[[6,22],[10,20],[14,24]],'#b58a58',1); break;
    case 'skill_sanctuary':
      path(g,'M3 26 C3 2 29 2 29 26Z','#637b80','#b7d7c8',1.3);
      g.save(); g.globalAlpha=.55; oval(g,16,26,13,3,'#dcdba5','#a8d6c6'); g.restore();
      path(g,'M21 9 C9 7 10 23 22 20 C17 28 5 22 7 15 C8 7 16 4 21 9Z',IVORY,INK,.9); star(g,24,8,4,GOLD); break;
    case 'overdrive':
      ring(g,16,16,13.4,GOLD); flame(g,5,3,.7); star(g,4,12,3,IVORY); star(g,27,21,3,IVORY); break;
    case 'status_mark':
      ring(g,16,16,9,'#b1c995',1.7); ring(g,16,16,4,'#e7e6ba',1.2);
      for(const [a,b] of [[[16,1],[16,8]],[[16,24],[16,31]],[[1,16],[8,16]],[[24,16],[31,16]]] as const) line(g,[a,b],'#dce4ae',1.4); break;
    case 'status_stun': star(g,11,13,9,GOLD); star(g,24,20,6,IVORY); line(g,[[4,25],[11,28],[19,28]],'#b99c60',1); break;
    case 'status_frozen': snow(g); break;
    case 'status_ward':
      shape(g,[[16,2],[28,9],[28,23],[16,30],[4,23],[4,9]],'#538e95');
      line(g,[[16,6],[24,11],[24,21],[16,26],[8,21],[8,11],[16,6]],'#c8e2d9',1); star(g,16,16,7,IVORY); break;
    case 'status_barrier': shield(g,'#e4d8a4'); star(g,16,15,6,'#fff1be'); break;
    case 'relic_quiver':
      arrow(g,-4,-6); arrow(g,2,-6);
      path(g,'M10 12 L24 16 L18 29 L6 25Z','#9c7656'); line(g,[[10,15],[22,18]],GOLD,1.5); line(g,[[9,20],[17,23]],'#dcc399',.7); break;
    case 'relic_eye':
      path(g,'M2 16 Q16 1 30 16 Q16 31 2 16Z','#ded5b5'); oval(g,16,16,7,8,'#8aa5aa'); oval(g,16,16,2.4,6,INK); oval(g,13,12,1.5,1.5,IVORY,IVORY);
      line(g,[[3,9],[8,11]],GOLD,1.4); line(g,[[24,11],[29,9]],GOLD,1.4); break;
    case 'relic_prism': gem(g,PURPLE); line(g,[[2,6],[6,8]],GOLD,1); line(g,[[25,22],[30,25]],BLUE,1.4); break;
    case 'relic_heart': shield(g,'#afbfc2'); g.save(); g.translate(7,8); g.scale(.57,.57); heart(g); g.restore(); break;
    case 'relic_crown': crown(g); flame(g,11,-2,.34); break;
    case 'relic_plume':
      path(g,'M5 29 C5 16 11 1 27 3 C27 12 22 21 11 25 L5 29Z','#d79560');
      line(g,[[4,30],[24,6]],IVORY,1.2);
      for(let i=0;i<5;i++) { const x=9+i*2.3,y=25-i*3.1; line(g,[[x,y],[x+7,y-1]],'#f0c58b',.8); line(g,[[x,y],[x,y-7]],'#98624b',.7); } break;
    case 'relic_hourglass':
      shape(g,[[7,5],[25,5],[24,10],[19,16],[24,22],[25,28],[7,28],[8,22],[13,16],[8,10]],'#9ab8b6');
      path(g,'M10 9 L22 9 L16 15Z','#e2c183'); path(g,'M10 25 L16 19 L22 25Z','#e2c183');
      line(g,[[6,3],[26,3]],GOLD,2.5); line(g,[[6,29],[26,29]],GOLD,2.5); line(g,[[16,16],[16,19]],GOLD,.7); break;
    case 'relic_idol':
      path(g,'M11 5 Q16 1 21 5 L23 14 L27 19 L24 27 L8 27 L5 19 L9 14Z','#ceab67');
      shape(g,[[12,8],[15,11],[11,12]],INK); shape(g,[[20,8],[17,11],[21,12]],INK);
      line(g,[[13,17],[19,17]],'#6c5437',1.3); line(g,[[12,21],[20,21]],'#f4daa1',.8); break;
    case 'relic_fang':
      path(g,'M4 5 Q12 2 14 7 Q13 21 5 29 Q8 13 4 5Z','#e6ddc0');
      path(g,'M18 5 Q26 2 28 7 Q27 21 19 29 Q22 13 18 5Z','#e6ddc0');
      line(g,[[5,8],[12,9]],GOLD,1.5); line(g,[[19,8],[26,9]],GOLD,1.5); break;
    case 'relic_mirror':
      oval(g,16,15,11,12,GOLD); oval(g,16,15,8.3,9.5,'#87acb7');
      line(g,[[11,19],[20,9]],'#dfe9d8',1.6); line(g,[[14,21],[22,12]],'#dfe9d8',.8); line(g,[[16,27],[16,30]],GOLD,3); break;
    case 'relic_chalice':
      path(g,'M7 4 L25 4 L23 14 Q21 19 18 20 L18 26 L24 28 L24 30 L8 30 L8 28 L14 26 L14 20 Q9 18 8 13Z',GOLD);
      oval(g,16,5,8,2.6,'#ddcbab'); oval(g,16,6,6,1.5,'#966879','#65464c'); line(g,[[12,9],[13,14]],IVORY,.8); break;
    default:
      // Visible fallback for future relics; existing catalogue icons all have individual drawings above.
      gem(g,key.startsWith('hero_') ? '#acbeab' : GOLD); star(g,16,14,5,IVORY);
  }
}

export function storyIconCanvas(key: string, scale = 2): HTMLCanvasElement {
  const density = Math.max(1, Math.round(scale));
  const id = `${key}|${density}`;
  const cached = CACHE.get(id); if (cached) return cached;
  const c = document.createElement('canvas'); c.width = c.height = 16 * density;
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale(c.width / 32, c.height / 32); g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g,key);
  CACHE.set(id,c); return c;
}
