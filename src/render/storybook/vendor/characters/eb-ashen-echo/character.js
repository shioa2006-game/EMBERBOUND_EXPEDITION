/**
 * EMBERBOUND EXPEDITION — Ashen Echo (game id `ashen_echo`), the Guardian's body (by way of the Frost Revenant)
 * after the user's reference image: the lingering echo of a past adventurer — a deep ash-grey hood with a dark
 * face and two glowing orange eyes, an amber brooch, a short ash cloak whose torn hem burns away into embers and
 * sparks (and is a little see-through there), a grey-brown tunic with a leather belt and a strap across the chest,
 * leather bracers, dark breeches and tall brown boots, and a plain steel sword with a bronze guard.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): a short overhead chop (impact at 0.135 s) and the shared hurt.
 * Equipment is anatomical: +b = LEFT sword hand; −b = RIGHT free hand.
 */
import {
  TAU, DRAW, LW, LAYER,
  rigFrame, renderRig, legParts2, ik2, keyframes,
  nrm3, yawToBody, bodyLayerKey,
  paint, paintA, taperPts, ellipsePts, cLine, mittenHand,
} from '../../src/authoring.js';
import { hurtAction, phase, sample, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';

// Game timing (seconds).
export const ECHO_ATTACK_T = .3;   // chop: the blade lands at u = .45 (0.135 s)
const KEYS = Object.freeze({ attack: [0, .1, .2, .28, .36, .45, .52, .62, .75, .88] });

const C = Object.freeze({
  ash: '#cdc4b7', ashDark: '#a59b8e', ashLight: '#e6dfd4', tunic: '#7b6b5e', tunicDark: '#5e5148', pants: '#4b3f37',
  leather: '#6b4a32', leatherLight: '#8d6a4c', boot: '#6e5038', steel: '#bab9b3', steelDark: '#8c8b86', bronze: '#b08a4e',
  void: '#120e0c', eye: '#ffb347', ember: '#f2903a', emberLight: '#ffd27a', amber: '#e9a23b',
});
const BLADE = 44, HILT = 9;   // sword along its axis from the hand (local px): blade forward, grip and pommel back
// Ready stance: the sword held low and forward (chest UY coordinates: hand a, b, z, blade direction).
const READY = [12, 22, 30, .7, .05, -.2];
// Chop: raise the blade back over the shoulder, bring it down forward at u .45, follow through, recover.
const CHOP = [[0, READY], [.25, [2, 23, 52, -.2, .05, .98]], [.45, [20, 23, 36, .8, -.02, -.6]],
  [.62, [18, 23, 34, .7, -.02, -.7]], [.85, [14, 22, 31, .7, .05, -.1]], [1, READY]];
const cloth = (ctx, points, fill, o = {}) => paint(ctx, points, { fill, w: LW.part, depth: 2, light: .2, speck: 1, amp: .3, ...o });
const clothA = (ctx, points, fill, o = {}) => cloth(ctx, points.map(([x, y]) => ({ x, y })), fill, o);
const line = (ctx, points, width = LW.fine) => cLine(ctx, points.map(p => Array.isArray(p) ? p : [p.x, p.y]), width);
const dot = (ctx, x, y, r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };

export function echoPose(action, t) {
  const P = {
    body: [0, 0, 0], yaw: 0, footL: [0, 6, 0], footR: [0, -6, 0],
    sword: { hand: READY.slice(0, 3), dir: nrm3(READY.slice(3)) },
    free: [6, -23, 29], cape: 0, travel: 0, t,
  };
  if (action === 'attack') {
    const u = phase(t, ECHO_ATTACK_T), k = keyframes(CHOP, u);
    P.sword = { hand: k.slice(0, 3), dir: nrm3(k.slice(3)) };
    const lean = sample([[0,[0]],[.25,[-2]],[.45,[4.5]],[.62,[3.5]],[1,[0]]],u);
    P.body = [lean, 0, sample([[0,[0]],[.25,[.8]],[.45,[-1.4]],[.62,[-1]],[1,[0]]],u)];
    P.footL = [sample([[0,[0]],[.3,[0]],[.45,[5]],[.7,[5]],[1,[0]]],u), 6, sample([[0,[0]],[.3,[0]],[.38,[2.5]],[.45,[0]],[1,[0]]],u)];
    P.free = keyframes([[0,[6,-23,29]],[.25,[10,-22,34]],[.45,[2,-24,30]],[1,[6,-23,29]]],u);
    P.cape = -lean * .6;
    // The chop travels along the walking direction, not toward the camera.
    P.travel = sample([[0,[0]],[.3,[0]],[.42,[1]],[.75,[1]],[.95,[0]],[1,[0]]],u);
  } else if (action === 'hurt') {
    const k = hurtAmount(t);
    P.body = [-2.5 * k, 0, -1.2 * k]; P.yaw = .12 * k;
    P.free = [6 - 2 * k, -22, 29 + 4 * k];
    P.sword.hand = [READY[0] - 2 * k, READY[1], READY[2] + 2 * k];
    P.cape = 3 * k;
  } else {
    const u = phase(t, TAU / 2), breathe = Math.sin(u * TAU);
    P.body[2] = breathe * .65; P.sword.hand[2] += breathe * .15; P.free[2] += breathe * .25;
    P.cape = Math.sin(u * TAU - .7) * 1.4;
  }
  return P;
}

/** Dark breeches and tall boots with a turned-down cuff. */
function legs(ctx, rf, P) {
  return legParts2(ctx, rf, P, { pants: C.pants, boot: C.boot, sole: C.leather, bootH: .55, legR0: 4.2, legR1: 3.7, footR: 4.2, soleR: 3.7 });
}

/** The ash cloak streaming back from the shoulders; its torn hem burns away into a glowing edge, embers and sparks. */
function drawCape(ctx, rf, P) {
  // Lower points trail further back (a), so the cloak flows behind the walker facing either way.
  const Q = arr => arr.map(([b, z]) => { const k = Math.max(0, (48 - z) / 40); return rf.UY(-8 - (48 - z) * .4 - P.cape * k * 2, b, z); });
  const hem = [[-30, 10], [-26, 2], [-21, 9], [-15, 0], [-9, 8], [-3, -1], [3, 7], [9, 1], [15, 9], [21, 2], [27, 10], [32, 5]];
  cloth(ctx, Q([[-14, 50], [-26, 36], ...hem, [34, 14], [24, 36], [14, 50]]), C.ash, { depth: 2, speck: .8 });
  for (const b of [-16, -6, 8, 20]) line(ctx, Q([[b * .6, 42], [b, 18]]), .6);
  // The burning edge: a band of orange glow along the hem, a little see-through.
  ctx.save(); ctx.globalAlpha = .75;
  paint(ctx, Q([...hem, ...hem.slice().reverse().map(([b, z]) => [b * .98, z + 6])]), { fill: C.ember, w: 0, depth: .4, speck: .5, amp: .3 });
  ctx.restore();
  // Embers drifting up and away from the hem (positions cycle with time).
  for (let i = 0; i < 6; i++) {
    const u = (P.t * .7 + i / 6) % 1, h = hem[(i * 2 + 1) % hem.length], p = rf.UY(-10 - u * 6, h[0] - u * 10, h[1] + 2 + u * 14);
    ctx.save(); ctx.globalAlpha = 1 - u; dot(ctx, p.x, p.y, 1.4 - u * .6, i % 2 ? C.emberLight : C.ember); ctx.restore();
  }
}

function drawTorso(ctx, rf, P) {
  const U = rf.UY, Q = arr => arr.map(([b,z]) => U(0,b,z));
  // The tunic: a long skirt split at the front, the body above.
  cloth(ctx, Q([[14,46],[-14,46],[-18,30],[-20,14],[-10,12],[-2,16],[2,12],[12,16],[20,13],[17,30]]), C.tunic, { w: LW.outline, depth: 3 });
  for (const [b0,b1] of [[-8,-10],[6,8]]) line(ctx, Q([[b0,26],[b1,14]]), .6);
  cloth(ctx, Q([[13,47],[-13,47],[-16,38],[-14,29],[14,29],[16,38]]), C.tunicDark, { depth: 2.4 });
  // The belt with a square buckle, the strap across the chest.
  paint(ctx, Q([[16,30],[-16,30],[-16,26],[16,26]]), { fill: C.leather, w: LW.part, depth: .9, speck: .5 });
  const b = U(3,1,28);
  paintA(ctx, [[b.x-2.8,b.y-2.4],[b.x+2.8,b.y-2.4],[b.x+2.8,b.y+2.4],[b.x-2.8,b.y+2.4]], { fill: C.bronze, w: LW.detail, depth: .4, speck: 0 });
  paintA(ctx, [[b.x-1.4,b.y-1.2],[b.x+1.4,b.y-1.2],[b.x+1.4,b.y+1.2],[b.x-1.4,b.y+1.2]], { fill: C.leather, w: 0, depth: 0, speck: 0 });
  paint(ctx, Q([[-12,45],[-9,46],[13,30],[10,29]]), { fill: C.leather, w: LW.detail, depth: .6, speck: .4 });
}

/** The cowl wrapping the neck: the head-side rim follows the head, the lower rim follows the chest. */
function drawCowl(ctx, rf, head) {
  const U = rf.UY, side = Math.sign(U(0,1,48).x-U(0,0,48).x);
  const Q = (b,z,a=0) => U(a,b*side,z), H = (x,y) => ({x:head.x+x, y:head.y+y});
  cloth(ctx, [H(-12,12),H(12,12),Q(15,48),Q(10,42),Q(-10,42),Q(-15,48)], C.ashDark, { depth: 1.5 });
  line(ctx, [Q(-12,46),Q(0,44,2),Q(12,46)], .6);
}

function drawHood(ctx, c, sx, P) {
  const M = points => points.map(([x,y]) => [c.x+x*sx,c.y+y]);
  const fill = (points, col, o = {}) => clothA(ctx, M(points), col, o);
  // The deep hood: its tip flops back, singed orange at the end.
  fill([[-8,-24],[-18,-29],[-30,-27],[-40,-19],[-45,-8],[-39,-10],[-36,-2],[-29,-12],[-18,-15],[-14,-10]], C.ash);
  ctx.save(); ctx.globalAlpha = .8; fill([[-40,-19],[-45,-8],[-39,-10],[-36,-2],[-34,-13]], C.ember, { w: 0, depth: 0, speck: 0 }); ctx.restore();
  fill([[-21,12],[-24,-2],[-20,-16],[-10,-26],[4,-28],[16,-22],[23,-8],[25,6],[24,14],[12,19],[-2,20],[-14,18]], C.ash, { w: LW.outline, depth: 2.7 });
  fill([[-16,-14],[-8,-22],[2,-24],[0,-14],[-8,-8]], C.ashLight, { w: 0, depth: 0, speck: .5 });
  // The dark face: a shadowed rim, the void, two glowing orange eyes.
  fill([[9,-19],[17,-14],[22,-4],[23,7],[20,15],[12,18],[1,18],[-9,13],[-5,2],[-3,-9],[3,-16]], C.ashDark, { w: LW.detail, depth: .6 });
  fill([[10,-13],[17,-6],[19,9],[12,14],[0,14],[-7,9],[-1,-1],[4,-9]], C.void, { w: LW.detail, depth: 0, light: 0, speck: 0 });
  for (const [x,y] of [[4,1],[14,0]]) {
    const p = M([[x,y]])[0];
    ctx.save(); ctx.globalAlpha = .3; paint(ctx, ellipsePts(p[0],p[1],3.6,4.6,12), { fill: C.eye, w: 0, depth: 0, speck: 0 }); ctx.restore();
    paint(ctx, ellipsePts(p[0],p[1],1.7,2.8,12), { fill: C.eye, w: 0, depth: 0, speck: 0, amp: .05 });
  }
  line(ctx, M([[-18,8],[-12,-6],[-2,-17],[8,-22]]), .7);
  // The amber brooch under the chin.
  const br = M([[8,19]])[0];
  paint(ctx, ellipsePts(br[0],br[1],3.6,3.6,14), { fill: C.bronze, w: LW.detail, depth: .4, speck: 0 });
  paint(ctx, ellipsePts(br[0],br[1],2,2,12), { fill: C.amber, w: 0, depth: 0, speck: 0 });
}

/** A plain steel sword with a bronze guard and pommel, held at the centre of the left glove. */
function drawSword(ctx, hand, tip, back) {
  const dx=tip.x-hand.x,dy=tip.y-hand.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux,k=L/BLADE;
  const Q=(a,b)=>[hand.x+ux*a*k+nx*b,hand.y+uy*a*k+ny*b];
  const bx=back.x-hand.x,by=back.y-hand.y;
  paintA(ctx,[[hand.x-nx*1.8,hand.y-ny*1.8],[hand.x+bx-nx*1.6,hand.y+by-ny*1.6],[hand.x+bx+nx*1.6,hand.y+by+ny*1.6],[hand.x+nx*1.8,hand.y+ny*1.8]],{fill:C.leather,w:LW.detail,depth:.6,speck:0,amp:.1});
  paint(ctx,ellipsePts(hand.x+bx*1.1,hand.y+by*1.1,2.6,2.6,10),{fill:C.bronze,w:LW.detail,depth:.6,speck:0,amp:.08});
  paintA(ctx,[Q(5,-3.6),Q(BLADE-7,-3.2),Q(BLADE,0),Q(BLADE-7,3.2),Q(5,3.6)],{fill:C.steel,w:LW.part,depth:.9,light:.45,speck:.3,amp:.08});
  paintA(ctx,[Q(6,0),Q(BLADE-2,0),Q(BLADE-7,3),Q(6,3.4)],{fill:C.steelDark,w:0,depth:0,speck:0,amp:.06});
  line(ctx,[Q(7,0),Q(BLADE-5,0)],.55);
  paintA(ctx,[Q(2,-7.5),Q(5,-8),Q(6,-3),Q(6,3),Q(5,8),Q(2,7.5),Q(3,0)],{fill:C.bronze,w:LW.part,depth:.8,speck:.2,amp:.08});
}

function armParts(ctx,rf,P,side) {
  const sb=side==='L'?16:-16, S=[0,sb,44], H=side==='L'?P.sword.hand:P.free;
  const E=ik2(S,H,11.8,12.3,[-.45,side==='L'?1:-1,-.7]);
  const U=rf.UY, key=p=>{const a=yawToBody(rf,p[0],p[1]);return bodyLayerKey(rf,a[0],a[1],p[2]);};
  const s=U(...S),e=U(...E),h=U(...H), mid={x:e.x*.5+h.x*.5,y:e.y*.5+h.y*.5};
  // The tunic sleeve, a fold of the cloak over the shoulder.
  const upper = ()=>{
    paint(ctx,taperPts(s,e,5.2,4.4),{fill:C.tunic,w:LW.part,depth:1.8,speck:1});
    const dx=e.x-s.x,dy=e.y-s.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux;
    const Q=(a,b)=>({x:s.x+ux*a+nx*b,y:s.y+uy*a+ny*b});
    cloth(ctx,[Q(-5,-4),Q(-2,-8),Q(4,-8),Q(8,-5),Q(9,3),Q(3,6),Q(-3,5)],C.ash,{w:LW.outline,depth:2});
  };
  // The forearm in a leather bracer.
  const fore=(a,b)=>{
    paint(ctx,taperPts(a,b,4.4,3.6),{fill:C.tunic,w:LW.part,depth:1,speck:.7});
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,c={x:a.x*.35+b.x*.65,y:a.y*.35+b.y*.65};
    paint(ctx,taperPts(c,b,4.1,3.7),{fill:C.leather,w:LW.part,depth:1.2,speck:.5});
    line(ctx,[[c.x+nx*3.6,c.y+ny*3.6],[c.x-nx*3.6,c.y-ny*3.6]],.6);
  };
  const parts=[{id:'upper'+side,d:key(E),draw:upper}];
  const boundary=Math.round(key(E)/1000)!==Math.round(key(H)/1000);
  if(boundary) {
    parts.push({id:'foreElbow'+side,d:key(E)+.05,draw:()=>fore(e,mid)});
    parts.push({id:'foreHand'+side,d:key(H),draw:()=>fore(mid,h)});
  } else parts.push({id:'fore'+side,d:key(H),draw:()=>fore(e,h)});
  const glove=()=>mittenHand(ctx,h,h.x-e.x,h.y-e.y,3.8,C.leatherLight,{thumbSide:side==='L'?rf.sx:-rf.sx});
  return {parts,S,E,H,hand:h,key:key(H),glove};
}

export function drawAshenEcho(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=echoPose(action,t);
  const rf=rigFrame(direction,P.body,P.yaw),U=rf.UY;
  if(P.travel) {
    // Turn only the blade back by the chest's turn, so the chop goes along the walking direction.
    const k=P.travel*(rf.turn+rf.yaw),c=Math.cos(k),s=Math.sin(k),[a,b,z]=P.sword.dir;
    P.sword.dir=[a*c-b*s,a*s+b*c,z];
  }
  const parts=legs(ctx,rf,P);
  parts.push({id:'cape',d:-200,draw:()=>drawCape(ctx,rf,P)});
  parts.push({id:'torso',d:LAYER.torso,draw:()=>drawTorso(ctx,rf,P)});
  const head=rf.U(1.5,0,67);
  parts.push({id:'cowl',d:LAYER.torso+1,draw:()=>drawCowl(ctx,rf,head)});
  parts.push({id:'hood',d:LAYER.head,draw:()=>{
    ctx.save();ctx.translate(head.x,head.y);ctx.scale(.9,.9);
    drawHood(ctx,{x:0,y:0},rf.sx,P);ctx.restore();
  }});
  const left=armParts(ctx,rf,P,'L'),right=armParts(ctx,rf,P,'R');
  parts.push(...left.parts,...right.parts);
  const along=(hand,dir,length)=>U(hand[0]+dir[0]*length,hand[1]+dir[1]*length,hand[2]+dir[2]*length);
  const tip=along(P.sword.hand,P.sword.dir,BLADE),back=along(P.sword.hand,P.sword.dir,-HILT);
  parts.push({id:'sword',d:left.key+.02,draw:()=>drawSword(ctx,left.hand,tip,back)});
  parts.push({id:'leftGlove',d:left.key+.04,draw:left.glove});
  parts.push({id:'rightGlove',d:right.key+.04,draw:right.glove});
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),false,
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-ashen-echo',boil:DRAW.boil?Math.floor(t*5)%3:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-ashen-echo',label:'Ashen Echo — EMBERBOUND',kind:'humanoid',directional:true,draw:drawAshenEcho,
  actions:{idle:{period:TAU/2,frames:20},
    attack:{period:ECHO_ATTACK_T,keys:KEYS.attack,once:true},
    hurt:hurtAction},
  frameBox:{x0:-110,x1:110,y0:-150,y1:29},
  equipment:{leftHand:'sword',rightHand:'free'},
  emberbound:{gameId:'ashen_echo',heightPx:20,facing:'L'},
});
export const studio=Object.freeze({order:36,name:'Ashen Echo（灰の残響）',category:'EMBERBOUND 第6エリア',
  description:'灰色のフードとマントの剣士の残影。フードの奥に橙の目、マントの裾が燃えて火の粉になる。過去の冒険者の残響。',
  preview:{direction:'L',phase:0}});
