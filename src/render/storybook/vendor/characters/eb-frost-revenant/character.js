/**
 * EMBERBOUND EXPEDITION — Frost Revenant (game id `frost_revenant`), the Guardian's armoured body (by way of the
 * Coral Knight) after the user's reference image: blue-grey plate crusted with frost and icicles, silver star
 * medallions, a closed helm with a dark visor, glowing cyan eyes and two jagged ice horns, a blue scarf, a long
 * tattered blue cloak, a blue tabard with a pale frost-tree pattern, and a sword with a clear ice blade.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): a short overhead chop (impact at 0.135 s) and the shared hurt.
 * Equipment is anatomical: +b = LEFT sword hand; −b = RIGHT free hand.
 */
import {
  TAU, DRAW, PAL, LW, LAYER,
  rigFrame, renderRig, footProj, legParts2, ik2, keyframes,
  nrm3, yawToBody, bodyLayerKey,
  paint, paintA, taperPts, ellipsePts, cLine, mittenHand, bbox,
  clipPath, stipplePoly, rimWeight,
} from '../../src/authoring.js';
import { hurtAction, phase, sample, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';

// Game timing (seconds).
export const REVENANT_ATTACK_T = .3;   // chop: the blade lands at u = .45 (0.135 s)
const KEYS = Object.freeze({ attack: [0, .1, .2, .28, .36, .45, .52, .62, .75, .88] });

const C = Object.freeze({
  steel: '#b4bfcf', light: '#e2e8f0', mid: '#8a97ad', dark: '#5d687d',
  black: '#1f2430', cloth: '#4a5468', leather: '#5f4a3e', leatherLight: '#86695a',
  blue: '#45679a', blueDark: '#2e4a75', frost: '#f3f7fb', silver: '#cfd7e2', silverDark: '#8d97a6',
  ice: '#cde9f6', iceDark: '#86b9d8', glow: '#86f2ea',
});
const BLADE = 46, HILT = 9;   // sword along its axis from the hand (local px): blade forward, grip and pommel back
// Ready stance: the sword held up and forward (chest UY coordinates: hand a, b, z, blade direction).
const READY = [12, 22, 32, .55, .05, .83];
// Chop: raise the blade back over the shoulder, bring it down forward at u .45, follow through, recover.
const CHOP = [[0, READY], [.25, [2, 23, 52, -.2, .05, .98]], [.45, [20, 23, 36, .8, -.02, -.6]],
  [.62, [18, 23, 34, .7, -.02, -.7]], [.85, [14, 22, 32, .6, .05, .6]], [1, READY]];
const metal = (ctx, points, o = {}) => {
  const shape = paint(ctx, points, {
    fill: C.steel, w: LW.part, depth: 2, light: .48, speck: 1.15, amp: .3, ...o,
  });
  // Fine pen grain inside the plate, strongest near its rim (the Guardian's engraved texture).
  stipplePoly(ctx, shape, 6.4, { color: '#3e4656', scale: .29, wfn: rimWeight(shape, .35, .5) });
  const bb = bbox(shape), w = bb.x1-bb.x0, h = bb.y1-bb.y0;
  if (w*h > 350) {
    ctx.save(); clipPath(ctx,shape);
    for (const [a,b,sl] of [[.23,.43,.08],[.72,.62,-.07],[.6,.2,.055]]) {
      const x=bb.x0+w*a,y=bb.y0+h*b;
      cLine(ctx,[[x,y],[x+w*sl,y+h*.07]],.4);
    }
    ctx.restore();
  }
  return shape;
};
const metalA = (ctx, points, o = {}) => metal(ctx, points.map(([x, y]) => ({ x, y })), o);
const line = (ctx, points, width = LW.fine) => cLine(ctx, points.map(p => Array.isArray(p) ? p : [p.x, p.y]), width);
/** A silver medallion with a four-pointed star. */
function medallion(ctx, x, y, r) {
  paint(ctx, ellipsePts(x, y, r, r, 16), { fill: C.silver, w: LW.detail, depth: .8, speck: .2, amp: .12 });
  paint(ctx, ellipsePts(x, y, r * .62, r * .62, 14), { fill: C.blueDark, w: .6, depth: 0, speck: 0, amp: .1 });
  const star = []; for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4, k = i % 2 ? r * .16 : r * .55; star.push([x + Math.cos(a) * k, y + Math.sin(a) * k]); }
  paintA(ctx, star, { fill: C.silver, w: .5, depth: 0, speck: 0, amp: .05 });
}
/** Frost crusted along the top of a plate: a white cap from p to q (screen points) with icicles hanging below. */
function frostCap(ctx, p, q, thick, drips = 3) {
  const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, pts = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push({ x: p.x + dx * u - nx * thick * .3, y: p.y + dy * u - ny * thick * .3 }); }
  for (let i = 8; i >= 0; i--) {
    const u = i / 8, drip = i % Math.max(1, Math.round(8 / drips)) === 1 ? thick * 1.9 : thick * (.6 + .2 * Math.sin(i * 2.1));
    pts.push({ x: p.x + dx * u + nx * drip, y: p.y + dy * u + ny * drip });
  }
  paint(ctx, pts, { fill: C.frost, w: .9, depth: .5, speck: .3, amp: .35, step: 3 });
}

export function revenantPose(action, t) {
  const P = {
    body: [0, 0, 0], yaw: 0, footL: [0, 6, 0], footR: [0, -6, 0],
    sword: { hand: READY.slice(0, 3), dir: nrm3(READY.slice(3)) },
    free: [6, -23, 29], cape: 0, scarf: 0, travel: 0,
  };
  if (action === 'attack') {
    const u = phase(t, REVENANT_ATTACK_T), k = keyframes(CHOP, u);
    P.sword = { hand: k.slice(0, 3), dir: nrm3(k.slice(3)) };
    const lean = sample([[0,[0]],[.25,[-2]],[.45,[4.5]],[.62,[3.5]],[1,[0]]],u);
    P.body = [lean, 0, sample([[0,[0]],[.25,[.8]],[.45,[-1.4]],[.62,[-1]],[1,[0]]],u)];
    P.footL = [sample([[0,[0]],[.3,[0]],[.45,[5]],[.7,[5]],[1,[0]]],u), 6, sample([[0,[0]],[.3,[0]],[.38,[2.5]],[.45,[0]],[1,[0]]],u)];
    P.free = keyframes([[0,[6,-23,29]],[.25,[10,-22,34]],[.45,[2,-24,30]],[1,[6,-23,29]]],u);
    P.cape = -lean * .6; P.scarf = -lean * .55;
    // The chop travels along the walking direction, not toward the camera.
    P.travel = sample([[0,[0]],[.3,[0]],[.42,[1]],[.75,[1]],[.95,[0]],[1,[0]]],u);
  } else if (action === 'hurt') {
    const k = hurtAmount(t);
    P.body = [-2.5 * k, 0, -1.2 * k]; P.yaw = .12 * k;
    P.free = [6 - 2 * k, -22, 29 + 4 * k];
    P.sword.hand = [READY[0] - 2 * k, READY[1], READY[2] + 2 * k];
    P.cape = 3 * k; P.scarf = 1.5 * k;
  } else {
    const u = phase(t, TAU / 2), breathe = Math.sin(u * TAU);
    P.body[2] = breathe * .65; P.sword.hand[2] += breathe * .15; P.free[2] += breathe * .25;
    P.cape = Math.sin(u * TAU - .7) * 1.4; P.scarf = Math.sin(u * TAU - 1) * .5;
  }
  return P;
}

/** The Guardian's legs (legParts2) with frosted knee and greave plates over dark mail. */
function armoredLegs(ctx, rf, P) {
  const legs = legParts2(ctx, rf, P, {
    pants: C.cloth, boot: C.mid, sole: C.dark, bootH: .46,
    legR0: 4.5, legR1: 3.9, footR: 4, soleR: 3.5,
  });
  return legs.map((leg, i) => {
    const base = leg.draw, ft = i === 0 ? P.footL : P.footR, sign = i === 0 ? 1 : -1;
    return { ...leg, draw: () => {
      base();
      const hip = rf.W(P.body[0] * .5, sign * 6.5, 21 + P.body[2] * .6);
      const ankle = footProj(rf.dir, ft[0], ft[1], ft[2] + 5);
      const knee = { x: hip.x * .52 + ankle.x * .48, y: hip.y * .52 + ankle.y * .48 };
      metal(ctx, taperPts(knee, ankle, 3.9, 3), { fill: C.mid, depth: 1.5, speck: .7 });
      metalA(ctx, [[knee.x-4.8,knee.y-2.7],[knee.x,knee.y-4.7],[knee.x+4.8,knee.y-2],
        [knee.x+4.1,knee.y+2.7],[knee.x,knee.y+4.1],[knee.x-4.5,knee.y+2]], { depth: 1.3 });
      frostCap(ctx, { x: knee.x - 4.5, y: knee.y - 3 }, { x: knee.x + 4.5, y: knee.y - 2.5 }, 1.6, 2);
    } };
  });
}

/** Long tattered blue cloak behind the body. */
function drawCape(ctx, rf, P) {
  const Q = arr => arr.map(([b, z]) => { const k = Math.max(0, (48 - z) / 40); return rf.UY(-8, b + P.cape * k * 2, z); });
  paint(ctx, Q([[-14, 50], [-22, 38], [-30, 10], [-26, 2], [-20, 8], [-16, 0], [-10, 7], [-4, -1], [2, 7], [8, 0], [14, 7], [20, 1], [26, 8], [30, 3], [32, 12], [22, 38], [14, 50]]),
    { fill: C.blueDark, w: 1.8, depth: 2, speck: .8, speckScale: .32, amp: .35 });
  for (const b of [-16, -6, 8, 20]) line(ctx, Q([[b * .6, 42], [b, 12]]), .6);
}

function drawTorso(ctx, rf, P) {
  const U = rf.UY, Q = arr => arr.map(([b,z]) => U(0,b,z));
  paint(ctx, Q([[14,46],[-14,46],[-17,29],[-19,19],[-10,16],[0,18],[10,16],[19,19],[16,30]]),
    { fill:C.cloth, w:LW.outline, depth:3, speck:1.5 });
  for (const [b,z] of [[-12,23],[-6,23],[0,23],[6,23],[12,23],[-9,20],[-3,20],[3,20],[9,20]]) {
    const a=U(0,b,z); line(ctx,[[a.x-2,a.y-.6],[a.x,a.y+1.2],[a.x+2,a.y-.6]],.5);
  }
  metal(ctx,Q([[13,47],[-13,47],[-17,40],[-13,29],[-5,27],[5,27],[13,29],[17,40]]),
    {w:LW.outline,depth:3.4,light:.65});
  paint(ctx,Q([[11,44],[-1,46],[-1,30],[8,31],[13,39]]),{fill:C.light,w:0,depth:0,speck:.35,amp:.2});
  line(ctx,Q([[0,45],[0,33],[-2,29]]),.75);
  // A silver star-diamond on the breastplate.
  const sc=U(1,2,38);
  paintA(ctx,[[sc.x,sc.y-5],[sc.x+3.2,sc.y],[sc.x,sc.y+5],[sc.x-3.2,sc.y]],{fill:C.silver,w:LW.detail,depth:.4,speck:0,amp:.06});
  paintA(ctx,[[sc.x,sc.y-2.6],[sc.x+1.6,sc.y],[sc.x,sc.y+2.6],[sc.x-1.6,sc.y]],{fill:C.ice,w:0,depth:0,speck:0,amp:.04});
  frostCap(ctx, U(0,-13,47), U(0,13,47), 2.4, 4);
  metal(ctx,Q([[15,29],[-15,29],[-17,24],[0,22],[17,24]]),{fill:C.mid,depth:1.8});
  for (const sign of [-1,1]) {
    metal(ctx,Q([[sign*3,21],[sign*16,22],[sign*18,15],[sign*7,13],[sign*4,15]]),{depth:1.7,speck:.9});
    line(ctx,Q([[sign*6,17],[sign*15,18]]),.65);
  }
  paint(ctx,Q([[16,29],[-16,29],[-16,25.3],[16,25.3]]),{fill:C.leather,w:LW.part,depth:.9,speck:.5});
  const b=U(3,1,27.1);
  medallion(ctx,b.x,b.y,3.6);
  // Blue tabard hanging in front, with a pale frost-tree pattern.
  const T=(db,z)=>U(3,db,z);
  paint(ctx,[T(-5,26),T(5,26),T(6,6),T(3,9),T(0,5),T(-3,9),T(-6,6)],{fill:C.blue,w:LW.part,depth:1.4,speck:.8,amp:.25});
  line(ctx,[T(0,22),T(0,9)],.6);for(const z of [19,15,11])line(ctx,[T(-3,z-2),T(0,z),T(3,z-2)],.55);
  // Scarf drapes beneath the helmet.
  paint(ctx,[U(-2,-12,48),U(-4,-8,46),U(-8,-11,32),U(-7,-18,34+P.scarf),U(-5,-14,39)],
    {fill:C.blueDark,w:LW.part,depth:2,speck:1});
}

/** The Guardian's gorget: the head-side rim follows the head, the lower rim follows the chest. */
function drawGorget(ctx, rf, head) {
  const U = rf.UY;
  const side = Math.sign(U(0,1,48).x-U(0,0,48).x);
  const Q = (b,z,a=0) => U(a,b*side,z);
  const H = (x,y) => ({x:head.x+x, y:head.y+y});
  paint(ctx,[H(-10,14),H(10,14),Q(12,49),Q(8,44),Q(-8,44),Q(-12,49)],
    {fill:C.blueDark,w:LW.part,depth:1.5,speck:1});
  metal(ctx,[H(-9,19),H(9,19),Q(15,49),Q(12,45),Q(5,43,2),
    Q(-5,43,2),Q(-12,45),Q(-15,49)],{w:LW.part,depth:2,light:.55,speck:.8});
  line(ctx,[Q(-12,47),Q(-5,45,2),Q(5,45,2),Q(12,47)],.65);
}

function drawHelmet(ctx, c, sx, P) {
  const M = points => points.map(([x,y]) => [c.x+x*sx,c.y+y]);
  const steel = (points,o={}) => metalA(ctx,M(points),o);
  const cloth = (points,fill,o={}) => paintA(ctx,M(points),{fill,w:LW.part,depth:2,speck:1,...o});
  // Two jagged ice horns rising from the sides of the helm (drawn first, behind it).
  const horn = (pts, fill) => paintA(ctx, M(pts), { fill, w: LW.part, depth: 1, light: .35, speck: .3, amp: .08 });
  horn([[-16,-18],[-22,-30],[-20,-38],[-26,-46],[-18,-42],[-14,-50],[-10,-38],[-8,-24]], C.ice);
  horn([[-17,-30],[-20,-38],[-16,-36],[-13,-44],[-11,-34]], '#eef8fd');
  horn([[8,-24],[10,-36],[6,-44],[14,-40],[18,-48],[20,-34],[16,-20]], C.ice);
  horn([[10,-30],[12,-38],[16,-36],[18,-42],[18,-30]], '#eef8fd');
  // Blue scarf above the breastplate.
  cloth([[-16,13],[-9,12],[10,12],[18,16],[13,24],[3,27],[-8,22],[-17,20]],C.blueDark);
  cloth([[-15,14],[-4,18],[10,16],[17,14],[14,21],[3,24],[-9,19]],C.blue,{w:LW.detail,depth:1.2});
  line(ctx,M([[-7,17],[3,20],[11,18]]),.75);
  // Closed helm: dome, a beaked visor over a dark slit, two glowing eyes.
  steel([[-22,-5],[-20,-18],[-10,-27],[3,-29],[15,-23],[22,-12],[24,-2],[25,8],[19,15],[8,18],[-6,18],[-16,14],[-22,6]],{w:LW.outline,depth:3.2,light:.65});
  cloth([[-17,-16],[-9,-24],[-1,-26],[1,-16],[-6,-10]],C.light,{w:0,depth:0,speck:.5});
  line(ctx,M([[-3,-27],[-4,-18],[-8,-10]]),.8);
  cloth([[0,-4],[25,-6],[26,2],[20,5],[2,4]],C.black,{w:LW.detail,depth:0,speck:0});
  for (const [x,y] of [[10,-.5],[20,-1]]) {
    const p=M([[x,y]])[0];
    paint(ctx,ellipsePts(p[0],p[1],2.6,1.6,10),{fill:C.glow,w:0,depth:0,speck:0,amp:.05});
    ctx.fillStyle='#e8fffb';ctx.beginPath();ctx.arc(p[0],p[1],.7,0,TAU);ctx.fill();
  }
  line(ctx,M([[0,-5],[13,-8],[26,-6.5]]),.9);
  steel([[2,6],[24,4],[26,9],[18,15],[6,16]],{fill:C.mid,w:LW.detail,depth:1});
  for (const x of [9,13,17]) line(ctx,M([[x,9],[x+.5,13]]),.6);
  // Cheek hinge with a star medallion, frost on the brow.
  steel([[-21,-1],[-15,2],[-12,11],[-16,16],[-24,12],[-20,6]],{depth:1.8});
  const md=M([[-17,6]])[0]; medallion(ctx,md[0],md[1],4.2);
  const fc=M([[-20,-16],[16,-16]]).map(([x,y])=>({x,y})); frostCap(ctx, fc[0], fc[1], 2.2, 4);
}

/** A sword with a clear ice blade, a silver guard and a wrapped grip, held at the centre of the left gauntlet. */
function drawSword(ctx, hand, tip, back) {
  const dx=tip.x-hand.x,dy=tip.y-hand.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux,k=L/BLADE;
  const Q=(a,b)=>[hand.x+ux*a*k+nx*b,hand.y+uy*a*k+ny*b];
  // Grip and pommel behind the hand (toward `back`).
  const bx=back.x-hand.x,by=back.y-hand.y;
  paintA(ctx,[[hand.x-nx*1.8,hand.y-ny*1.8],[hand.x+bx-nx*1.6,hand.y+by-ny*1.6],[hand.x+bx+nx*1.6,hand.y+by+ny*1.6],[hand.x+nx*1.8,hand.y+ny*1.8]],{fill:C.leather,w:LW.detail,depth:.6,speck:0,amp:.1});
  paint(ctx,ellipsePts(hand.x+bx*1.1,hand.y+by*1.1,2.6,2.6,10),{fill:C.silver,w:LW.detail,depth:.6,speck:0,amp:.08});
  // The ice blade: a long faceted crystal with a lighter edge, tapering to a point.
  paintA(ctx,[Q(5,-4),Q(BLADE-8,-3.6),Q(BLADE,0),Q(BLADE-8,3.6),Q(5,4)],{fill:C.ice,w:LW.part,depth:.8,light:.4,speck:.2,amp:.08});
  paintA(ctx,[Q(6,0),Q(BLADE-2,0),Q(BLADE-8,3.4),Q(6,3.8)],{fill:C.iceDark,w:0,depth:0,speck:0,amp:.06});
  for(const a of [14,24,34])line(ctx,[Q(a,-3),Q(a+5,0),Q(a,3)],.45);
  line(ctx,[Q(7,0),Q(BLADE-4,0)],.55);
  // Silver cross-guard with curled ends.
  paintA(ctx,[Q(2,-8),Q(5,-9),Q(6,-3),Q(6,3),Q(5,9),Q(2,8),Q(3,0)],{fill:C.silver,w:LW.part,depth:.8,speck:.2,amp:.08});
}

function armParts(ctx,rf,P,side) {
  const sb=side==='L'?16:-16, S=[0,sb,44], H=side==='L'?P.sword.hand:P.free;
  const E=ik2(S,H,11.8,12.3,[-.45,side==='L'?1:-1,-.7]);
  const U=rf.UY, key=p=>{const a=yawToBody(rf,p[0],p[1]);return bodyLayerKey(rf,a[0],a[1],p[2]);};
  const s=U(...S),e=U(...E),h=U(...H), mid={x:e.x*.5+h.x*.5,y:e.y*.5+h.y*.5};
  const upper = ()=>{
    paint(ctx,taperPts(s,e,5,4),{fill:C.cloth,w:LW.part,depth:1.8,speck:1});
    // Domed pauldrons crusted with frost and icicles, a star medallion.
    const dx=e.x-s.x,dy=e.y-s.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux;
    const Q=(a,b)=>({x:s.x+ux*a+nx*b,y:s.y+uy*a+ny*b});
    metal(ctx,[Q(-5,-3),Q(-3,-8),Q(3,-9),Q(9,-6),Q(10,5),Q(3,8),Q(-3,6)],{w:LW.outline,depth:2.6,light:.6});
    metal(ctx,[Q(6,-7),Q(10,-5.5),Q(12,-1),Q(11,5),Q(7,7),Q(7,2)],{fill:C.mid,w:LW.detail,depth:1.2});
    frostCap(ctx, Q(-4,-6), Q(9,-6), 1.8, 3);
    const q=Q(2,1); medallion(ctx,q.x,q.y,2.6);
  };
  const fore=(a,b)=>{
    paint(ctx,taperPts(a,b,4.5,3.7),{fill:C.cloth,w:LW.part,depth:1,speck:.7});
    metal(ctx,taperPts(a,b,4.2,3.5),{depth:1.7,speck:.8});
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
    line(ctx,[[b.x+nx*3,b.y+ny*3],[b.x-nx*3,b.y-ny*3]],.8);
  };
  const parts=[{id:'upper'+side,d:key(E),draw:upper}];
  const boundary=Math.round(key(E)/1000)!==Math.round(key(H)/1000);
  if(boundary) {
    parts.push({id:'foreElbow'+side,d:key(E)+.05,draw:()=>fore(e,mid)});
    parts.push({id:'foreHand'+side,d:key(H),draw:()=>fore(mid,h)});
  } else parts.push({id:'fore'+side,d:key(H),draw:()=>fore(e,h)});
  const gauntlet=()=>{
    mittenHand(ctx,h,h.x-e.x,h.y-e.y,3.9,C.steel,{thumbSide:side==='L'?rf.sx:-rf.sx});
    line(ctx,[[h.x-1.7,h.y-1],[h.x+1.4,h.y-1]],.6);
  };
  return {parts,S,E,H,hand:h,key:key(H),gauntlet};
}

export function drawFrostRevenant(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=revenantPose(action,t);
  const rf=rigFrame(direction,P.body,P.yaw),U=rf.UY;
  if(P.travel) {
    // Turn only the blade back by the chest's turn, so the chop goes along the walking direction.
    const k=P.travel*(rf.turn+rf.yaw),c=Math.cos(k),s=Math.sin(k),[a,b,z]=P.sword.dir;
    P.sword.dir=[a*c-b*s,a*s+b*c,z];
  }
  const parts=armoredLegs(ctx,rf,P);
  parts.push({id:'cape',d:-200,draw:()=>drawCape(ctx,rf,P)});
  parts.push({id:'torso',d:LAYER.torso,draw:()=>drawTorso(ctx,rf,P)});
  const head=rf.U(1.5,0,66);
  parts.push({id:'gorget',d:LAYER.torso+1,draw:()=>drawGorget(ctx,rf,head)});
  parts.push({id:'helmet',d:LAYER.head,draw:()=>{
    ctx.save();ctx.translate(head.x,head.y);ctx.scale(.9,.9);
    drawHelmet(ctx,{x:0,y:0},rf.sx,P);ctx.restore();
  }});
  const left=armParts(ctx,rf,P,'L'),right=armParts(ctx,rf,P,'R');
  parts.push(...left.parts,...right.parts);
  const along=(hand,dir,length)=>U(hand[0]+dir[0]*length,hand[1]+dir[1]*length,hand[2]+dir[2]*length);
  const tip=along(P.sword.hand,P.sword.dir,BLADE),back=along(P.sword.hand,P.sword.dir,-HILT);
  parts.push({id:'sword',d:left.key+.02,draw:()=>drawSword(ctx,left.hand,tip,back)});
  parts.push({id:'leftGauntlet',d:left.key+.04,draw:left.gauntlet});
  parts.push({id:'rightGauntlet',d:right.key+.04,draw:right.gauntlet});
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),false,
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-frost-revenant',boil:DRAW.boil?Math.floor(t*5)%3:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-frost-revenant',label:'Frost Revenant — EMBERBOUND',kind:'humanoid',directional:true,draw:drawFrostRevenant,
  actions:{idle:{period:TAU/2,frames:20},
    attack:{period:REVENANT_ATTACK_T,keys:KEYS.attack,once:true},
    hurt:hurtAction},
  frameBox:{x0:-110,x1:110,y0:-150,y1:29},
  equipment:{leftHand:'sword',rightHand:'free'},
  emberbound:{gameId:'frost_revenant',heightPx:23,facing:'L'},
});
export const studio=Object.freeze({order:24,name:"Frost Revenant（霜の亡霊騎士）",category:"EMBERBOUND 第4エリア",
  description:"霜に覆われた青灰色の鎧の騎士。氷の角の兜、光る目、青いマント、氷の剣。装甲を備えた前衛の敵。",
  preview:{direction:'L',phase:0}});
