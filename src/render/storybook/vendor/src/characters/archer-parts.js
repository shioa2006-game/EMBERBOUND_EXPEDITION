/**
 * Inkstone — 弓使い — 造形の部品: 頭 (房の髪・顔)・胴 (革の胴着)・ケープ・矢筒・弓・線の補助
 */
import { DRAW } from '../core/settings.js';
import { TAU, ellipsePts, lerp } from '../core/geometry.js';
import { PAL } from '../core/palette.js';
import { inkLine, inkShape, roughen, strokePath } from '../core/ink.js';
import { LW, lightOf, paint, paintA, taperPts } from '../core/paint.js';
import { cLine } from './rig.js';
import { ARC, QUIVER_TOP } from './archer-pose.js';

export const ARCHER_LEGS = { pants: ARC.pants, boot: ARC.boot, cuff: ARC.bootCuff, bootH: .5, legR0:4.5, legR1:3.6, footR:4.2, soleR:3.8 };

// Head shell: 46 × .96 = 44px high, matching the studio humanoid guide.
export const AH = {
  hoodF: [[-23,15],[-27,4],[-25,-9],[-31,-13],[-25,-23],[-11,-27],[5,-25],[19,-20],[23,-13],[20,3],[17,15],[0,19]],
  fringe: [[-20,1],[-18,-10],[-9,-18],[4,-21],[16,-15],[19,-7],[26,-3],[19,-3],[21,4],[15,0],[14,-8],[9,-1],[5,5],[6,-9],[-1,0],[-8,6],[-6,-5],[-15,5],[-14,-1]],
};
const elfShape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:1.5,depth:1.5,
  speck:.55,speckScale:.32,amp:.25,step:4,...o});
export function drawArcherHead(ctx,c,sx,P) {
  ctx.save();ctx.translate(c.x,c.y);ctx.scale(sx*.96,.96);
  const line=(pts,w=.65)=>cLine(ctx,pts,w);
  const ear=side=>{
    elfShape(ctx,[[-17*side,-1],[-32*side,-3],[-26*side,4],[-18*side,9]],ARC.skin,{w:1.3,depth:.8,speck:0});
    line([[-20*side,2],[-27*side,0],[-23*side,4]],.65);
  };
  elfShape(ctx,AH.hoodF,ARC.cape,{w:2.1,depth:2.1,speck:1.1});
  elfShape(ctx,[[-21,9],[-20,-5],[-10,-19],[5,-21],[20,-12],[20,12],[10,21],[-10,20]],ARC.capeDark,{w:1,depth:0});
  ear(-1);
  // The far sideburn hangs behind the face; only its tip shows past the cheek.
  elfShape(ctx,[[17,-3],[20,5],[20,16],[16,25],[12,27],[15,17],[13,8]],ARC.hair,{depth:1});
  elfShape(ctx,[[-17,-5],[-13,-15],[2,-18],[15,-11],[19,1],[18,11],[11,17],[1,19],[-11,15],[-16,8]],ARC.skin,{w:1.7,depth:1,speck:0});
  ear(1);
  elfShape(ctx,[[-17,-5],[-12,1],[-15,11],[-15,23],[-11,28],[-20,23],[-22,15],[-20,6]],ARC.hair,{depth:1});
  elfShape(ctx,AH.fringe,ARC.hair,{w:1.4,depth:1.4,speck:.25});
  for(const pts of [[[1,-18],[-4,-9],[-14,-1]],[[7,-17],[9,-9],[6,-1]],[[13,-13],[17,-4]],[[-18,10],[-18,20]]])line(pts,.6);
  inkLine(ctx,[{x:-12,y:-9},{x:-5,y:-15},{x:1,y:-18}],{color:ARC.hairLight,w:1.4,amp:.2});
  for(const [ex,rx] of [[1,1.7],[13,1.5]]) {
    const x=ex+P.look*.5,y=5;
    if(P.blink||(P.focus&&ex===1))line([[x-1.8,y],[x+1.8,y-.3]],1);
    else {ctx.fillStyle=PAL.ink;ctx.beginPath();ctx.ellipse(x,y,rx,P.focus?2.6:4.1,0,0,TAU);ctx.fill();}
  }
  line([[-1,-1],[3,-2]],.7);line([[11,-2],[15,-1]],.7);
  for(const x of [-8,-6,15])inkLine(ctx,[{x,y:10},{x:x+.6,y:11}],{color:'#c69b76',w:.6,amp:.1});
  if(P.mouth)elfShape(ctx,[[6,13],[9,13],[8,15],[6,14]],'#80553e',{w:.6,depth:0,speck:0});
  else line([[6,14],[8,13.8]],.55);
  // Folded hood edge frames the hair; the pointed ear remains outside it.
  elfShape(ctx,[[-24,7],[-20,-6],[-9,-18],[5,-24],[19,-19],[22,-14],[17,-16],[5,-20],[-7,-13],[-17,-2],[-20,13]],ARC.cape,{w:1.3,depth:.9,speck:.6});
  line([[-25,-13],[-21,-21],[-12,-24]],.7);
  ctx.restore();
}
/** Cream tunic, split leather jerkin, broad belt and one hip pouch. */
export function drawArcherTorso(ctx,rf,P) {
  const Q=(arr,a=0)=>arr.map(([b,z])=>rf.UY(a,b,z));
  paint(ctx,Q([[-13,47],[13,47],[15,30],[18,16],[5,14],[0,16],[-7,14],[-18,16],[-15,30]]),
    {fill:ARC.linen,w:1.7,depth:1.8,speck:.6,speckScale:.32,amp:.25});
  for(const side of [-1,1]) {
    paint(ctx,Q([[side*2,48],[side*13,47],[side*15,33],[side*18,20],[side*5,18],[side*2,29]],1),
      {fill:ARC.leather,w:1.4,depth:1.8,speck:.8,speckScale:.3,amp:.25});
    dashedStroke(ctx,Q([[side*11,44],[side*12,33],[side*15,22]],2),.6,[1.3,2]);
  }
  for(const z of [42,36]) {
    const b=rf.UY(2,0,z);
    paint(ctx,ellipsePts(b.x,b.y,1,1,10),{fill:ARC.brass,w:.6,depth:0,speck:0});
  }
  paint(ctx,Q([[-11,49],[-7,50],[14,31],[11,28]],3),{fill:ARC.leatherDark,w:1,depth:.7,speck:.2});
  const b=rf.UY(4,0,40);
  elfShape(ctx,[[b.x,b.y-2.5],[b.x+2.5,b.y],[b.x,b.y+2.5],[b.x-2.5,b.y]],ARC.brass,{w:.8,depth:0,speck:0});
  paint(ctx,Q([[-17,31],[17,31],[17,26],[-17,26]],4),{fill:ARC.leatherDark,w:1.4,depth:1,speck:.3});
  const k=rf.UY(5,0,28.5);   // belt buckle
  elfShape(ctx,[[k.x-3,k.y-2.6],[k.x+3,k.y-2.6],[k.x+3,k.y+2.6],[k.x-3,k.y+2.6]],ARC.brass,{w:1,depth:.4,speck:0});
  elfShape(ctx,[[k.x-1.8,k.y-1.4],[k.x+1.8,k.y-1.4],[k.x+1.8,k.y+1.4],[k.x-1.8,k.y+1.4]],ARC.leatherDark,{w:.5,depth:0,speck:0});
  paint(ctx,Q([[-8,29],[-17,29],[-18,20],[-9,19]],5),{fill:ARC.leather,w:1.2,depth:1,speck:.3,round:1});
  pLine(ctx,Q([[-9,26],[-13,24],[-17,26]],6),.65);
}
/** Long ragged cloak behind the body. */
export function drawArcherCape(ctx,rf,P) {
  const Q=arr=>arr.map(([b,z])=>{
    const k=Math.max(0,(48-z)/36);
    return rf.UY(-7,b+P.capeSway*k,z-Math.abs(P.capeSway)*.1*k);
  });
  paint(ctx,Q([[-12,52],[-21,39],[-30,13],[-26,7],[-22,11],[-18,9],[-13,12],[-7,9],
    [0,12],[8,9],[14,12],[20,9],[24,12],[28,8],[30,15],[21,39],[12,52]]),
    {fill:ARC.capeDark,w:1.8,depth:2,speck:.8,speckScale:.32,amp:.3});
  for(const b of [-17,-7,10,20])pLine(ctx,Q([[b*.6,43],[b,17]]),.65);
}
/** Shoulder folds with a round clasp in front. */
export function drawArcherMantle(ctx,rf) {
  const Q=arr=>arr.map(([b,z])=>rf.UY(3,b,z));
  paint(ctx,Q([[-12,53],[-21,48],[-26,38],[-17,40],[0,46],[17,40],[26,38],[21,48],[12,53],[0,50]]),
    {fill:ARC.cape,w:1.7,depth:1.5,speck:.65,speckScale:.32,amp:.25});
  pLine(ctx,Q([[-22,41],[-9,46],[0,48],[10,45],[22,41]]),.7);
  const c=rf.UY(4,0,48);
  paint(ctx,ellipsePts(c.x,c.y,3,3,18),{fill:ARC.brass,w:1.1,depth:.6,speck:0});
  paint(ctx,ellipsePts(c.x,c.y,1.7,1.7,14),{fill:ARC.brass,w:.6,depth:0,speck:0});
}
/** 背中の矢筒: 筒 (革の帯2本)・ケープの上から留める革帯・口の縁・矢羽 (生成り / くすんだ赤 / 緑) */
export function drawQuiver(ctx, rf, P) {
  const { UY } = rf, sw = P.quiverSway;
  const B = UY(-9, 2, 27 + sw), T = UY(QUIVER_TOP[0], QUIVER_TOP[1], QUIVER_TOP[2] + sw);
  const dx = T.x - B.x, dy = T.y - B.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hw = 4;
  const at = (p, a, n) => ({ x: p.x + ux * a + nx * n, y: p.y + uy * a + ny * n });
  const arrows = [[-3.2, 18], [-.8, 22], [1.8, 20], [3.8, 17]], fl = [ARC.fletch, ARC.accent, ARC.fletch2, ARC.fletch];
  for (const [o, l] of arrows) { const sh = [at(T, -6, o), at(T, l, o * 1.25)]; strokePath(ctx, sh, 2.5 * DRAW.lw, false, PAL.ink); strokePath(ctx, sh, 1.2 * DRAW.lw, false, ARC.wood); }
  paint(ctx, [at(B, 0, hw * 0.85), at(T, 0, hw), at(T, 0, -hw), at(B, 0, -hw * 0.85)], { fill: ARC.leather, w: LW.outline, depth: 2.6, light: 0.25, speck: 1 });
  for (const k of [0.2, 0.8]) { const p = { x: lerp(B.x, T.x, k), y: lerp(B.y, T.y, k) }; paint(ctx, [at(p, -1.3, hw + 0.5), at(p, 1.3, hw + 0.5), at(p, 1.3, -hw - 0.5), at(p, -1.3, -hw - 0.5)], { fill: ARC.leatherDark, w: LW.detail, depth: 0, speck: 0 }); }
  const bt = { x: lerp(B.x, T.x, 0.8), y: lerp(B.y, T.y, 0.8) };                                   // 留め具 (ベルトへつなぐ)
  paint(ctx, ellipsePts(bt.x + nx * hw * 1.2, bt.y + ny * hw * 1.2, 1.7, 1.7, 8), { fill: ARC.brass, w: LW.detail, depth: 0, speck: 0, light: 0.4 });
  const rim = []; for (let i = 0; i < 14; i++) { const th = TAU * i / 14; rim.push(at(T, Math.sin(th) * 1.8, Math.cos(th) * hw * 1.05)); }
  paint(ctx, rim, { fill: ARC.leatherDark, w: LW.part, depth: 0, speck: 0 });
  arrows.forEach(([o, l], i) => {
    for (const s of [1, -1]) inkShape(ctx, [at(T, l - 6.5, o * 1.25), at(T, l - 5, o * 1.25 + 2.8 * s), at(T, l + 0.6, o * 1.25 + 2.3 * s), at(T, l, o * 1.25)], { fill: fl[i], w: 0.9 * DRAW.lw, amp: 0.2, step: 4 });
  });
}

/** 弓: 大きく厚みのある弓 (腹側に明るい木口の筋)・握りの革巻き・角の弭 */
export function drawBow(ctx, UG, geo) {
  const N = 18, pts = [];
  for (let i = 0; i <= N; i++) pts.push(UG(...geo.pt(-1 + 2 * i / N)));
  const left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const p = pts[i], q = pts[Math.min(N, i + 1)], r = pts[Math.max(0, i - 1)];
    const tx = q.x - r.x, ty = q.y - r.y, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
    const s = -1 + 2 * i / N, w = 1.6 + 3.0 * Math.pow(1 - Math.abs(s), 0.75);
    left.push({ x: p.x + nx * w / 2, y: p.y + ny * w / 2 }); right.push({ x: p.x - nx * w / 2, y: p.y - ny * w / 2 });
  }
  paint(ctx, left.concat(right.reverse()), { fill: ARC.wood, w: LW.part, depth: 1.2, speck: 0, amp: 0.15, step: 4 });
  strokePath(ctx, pts.slice(2, N - 1), 0.9 * DRAW.lw, false, lightOf(ARC.wood, 0.45), 0.95);   // 木口の筋
  const g0 = UG(...geo.pt(-0.14)), g1 = UG(...geo.pt(0.14));
  strokePath(ctx, [g0, g1], 6.2 * DRAW.lw, false, PAL.ink); strokePath(ctx, [g0, g1], 4.2 * DRAW.lw, false, ARC.grip);   // 握りの革巻き
  for (let k = 1; k < 5; k++) { const m = { x: lerp(g0.x, g1.x, k / 5), y: lerp(g0.y, g1.y, k / 5) }; strokePath(ctx, [{ x: m.x - 1.6, y: m.y - 1.2 }, { x: m.x + 1.6, y: m.y + 1.2 }], 0.6 * DRAW.lw, false, PAL.ink, 0.7); }
  for (const tp of [geo.tipT, geo.tipB]) { const q = UG(...tp); inkShape(ctx, ellipsePts(q.x, q.y, 1.7, 1.7, 8), { fill: ARC.fletch, w: 0.9 * DRAW.lw, amp: 0.1, step: 4 }); }
}

/** 画面座標の点 {x,y} 用の線 / 角の折れる線 (弦) / 縫い目の破線 */
export const pLine = (ctx, pts, w = 1.1) => inkLine(ctx, pts, { w: w * DRAW.lw, amp: 0.2, double: 0 });

export function polyStroke(ctx, pts, w, color) {
  ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
}

export function dashedStroke(ctx, pts, w = 0.8, dash = [2.2, 2]) {
  ctx.save(); ctx.setLineDash(dash.map(v => v * DRAW.lw)); strokePath(ctx, roughen(pts, false, 0.2, 5), w * DRAW.lw, false, ARC.leatherDark, 0.9); ctx.restore();
}

/** 前腕に直交する帯 (籠手の革帯・袖口) */
export function bandAcross(ctx, p, ux, uy, half, thick, fill) {
  const ul = Math.hypot(ux, uy) || 1, nx = -uy / ul * half, ny = ux / ul * half;
  paint(ctx, taperPts({ x: p.x - nx, y: p.y - ny }, { x: p.x + nx, y: p.y + ny }, thick, thick, 4), { fill, w: LW.detail, depth: 0.6, speck: 0 });
}
