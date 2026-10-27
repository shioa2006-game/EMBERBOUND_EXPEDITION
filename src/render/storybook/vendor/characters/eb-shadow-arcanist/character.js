/**
 * EMBERBOUND EXPEDITION — Shadow Arcanist (game id `shadow_arcanist`), one of the Hollow Emberbound, the final bosses:
 * the shadow of the hero Arcanist (characters/eb-arcanist), with the same body, gear and actions so the pairing
 * reads at a glance (plan/CHARACTER_CATALOG.md), but
 * in purple-black robes and hat with orange lines, a shadowed face with glowing pink eyes, and pink magic in the
 * staff and the bolts.
 * It faces left as an enemy; the game draws it at boss size. It keeps the hero's attack and skill (`cast`) and the
 * shared hurt; as an enemy it neither walks nor needs a death pose.
 * This file is a copy of the hero, not an import, so it exports on its own.
 */
import {
  TAU, WALK_HZ, rigFrame, renderRig, walkFeet, ik2, keyframes, nrm3, travelDir,
  paint, paintA, ellipsePts, taperPts, cLine, mittenHand, legParts2,
  strokePath, DRAW, PAL, seed, R,
} from '../../src/authoring.js';
import { FALL, hurtAction, deadAction, phase, sample, hurtAmount, deadPhase, fallTilt, withTilt } from '../shared/emberbound/actions.js';

// The Arcanist's colour names are kept: "lining", "gold" are the orange lines, "flame" the pink magic.
const C = {
  cloth:'#3e2c4e', dark:'#2a1e36', light:'#57426a', lining:'#e8873a', diamond:'#e8873a',
  hair:'#2c2236', hairShade:'#3a2d48', skin:'#2e2438',
  leather:'#4a3530', leatherDark:'#33241f', book:'#2a1f2a', gold:'#e8873a', wood:'#3a2a30', woodLight:'#54404a',
  flame:'#ff7ac0', flameIn:'#ffc6e6', flameOut:'#d94a9a', ember:'#ff8fcb', eye:'#ff8fcb', ink:PAL.ink,
};
const IDLE_T=3.2;
// Game timing (seconds).
export const ARCANIST_ATTACK_T=.3;   // bolt: the thrust peaks at u = .12 (0.036 s)
export const ARCANIST_METEOR_T=.6;   // Meteor: raise, gather, sweep forward at u = .62
const KEYS=Object.freeze({
  attack:[0,.06,.12,.2,.3,.45,.6,.8],
  cast:[0,.1,.2,.3,.4,.5,.56,.62,.7,.8,.9],
});
// The tall hat makes the fallen figure longer, so it slides a little farther forward than the shared fall.
const ARCANIST_FALL={...FALL,shift:80};
const blend=(keys,u)=>keyframes(keys,u);
const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const shape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:1.5,depth:1.7,
  speck:.55,speckScale:.3,amp:.22,...o});
const oval=(ctx,x,y,rx,ry,fill,o={})=>paint(ctx,ellipsePts(x,y,rx,ry,28),
  {fill,w:1.2,depth:1,speck:.35,speckScale:.3,amp:.2,...o});

const REST={staff:[0,39,43],book:[10,-17,27]};
export function arcanistPose(action,t) {
  const P={body:[0,0,0],footL:[0,6,0],footR:[0,-6,0],
    staff:REST.staff.slice(),book:REST.book.slice(),pitch:.07,sway:0,glow:0,t,blink:false};
  if(action==='walk') {
    const w=walkFeet(t);
    P.footL=w.footL;P.footR=w.footR;P.body=[0,0,w.bob*.45];
    P.sway=w.s*1.3;P.staff[2]+=w.s*.65;P.book[2]-=w.s*.4;
  } else if(action==='attack') {
    // A quick thrust that points the crystal ahead, a flash, then back to rest.
    const u=phase(t,ARCANIST_ATTACK_T);
    P.staff=blend([[0,REST.staff],[.12,[25,20,42]],[.45,[24,21,42]],[1,REST.staff]],u);
    P.book=blend([[0,REST.book],[.12,[14,-9,34]],[.45,[14,-9,34]],[1,REST.book]],u);
    const a=blend([[0,[0,.07,0]],[.12,[2,2.4,1.2]],[.45,[2,2.4,1.2]],[1,[0,.07,0]]],u);
    P.body=[a[0],0,0];P.pitch=a[1];P.sway=a[2];
    P.glow=sample([[0,[.3]],[.1,[1]],[.3,[.6]],[.6,[0]],[1,[0]]],u);
  } else if(action==='cast') {
    // Meteor: lift the staff overhead while the ember gathers, then sweep it forward and down. The raised
    // staff is held out to the side (b 30) and the sweep passes an in-between pose (u .59), so the butt of
    // the staff stays outside the robe (tests/node/side-clearance.test.mjs).
    const u=phase(t,ARCANIST_METEOR_T);
    P.staff=blend([[0,REST.staff],[.3,[4,30,68]],[.56,[4,30,70]],[.59,[15,28,60]],[.62,[24,22,48]],[.8,[24,22,46]],[1,REST.staff]],u);
    P.book=blend([[0,REST.book],[.3,[14,-9,34]],[.8,[14,-9,34]],[1,REST.book]],u);
    const a=blend([[0,[0,.07,0]],[.3,[-1.5,-.15,-.6]],[.56,[-1.5,-.18,-.6]],[.59,[.5,.9,.4]],[.62,[2.5,2.2,1.4]],[.8,[2,2.2,1.2]],[1,[0,.07,0]]],u);
    P.body=[a[0],0,a[0]<0?.6:0];P.pitch=a[1];P.sway=a[2];
    P.glow=sample([[0,[0]],[.3,[.6]],[.56,[1]],[.62,[1]],[.75,[.5]],[1,[0]]],u);
  } else if(action==='hurt') {
    const k=hurtAmount(t);
    P.body=[-2.5*k,0,-1.2*k];P.staff=[REST.staff[0]-2*k,REST.staff[1],REST.staff[2]+3*k];
    P.book=[REST.book[0]-2*k,REST.book[1],REST.book[2]+3*k];P.sway=1.5*k;P.blink=k>.5;
  } else if(action==='dead') {
    const u=deadPhase(t);
    P.body=[sample([[0,[0]],[.15,[-2]],[1,[-2]]],u),0,sample([[0,[0]],[.15,[-1.5]],[1,[-1]]],u)];
    P.staff=[REST.staff[0]-3,REST.staff[1],REST.staff[2]-4*sample([[0,[0]],[.7,[1]],[1,[1]]],u)];
    P.sway=sample([[0,[0]],[.2,[2]],[.7,[-2.5]],[1,[0]]],u);P.blink=u>.12;
  } else {
    const s=Math.sin(TAU*phase(t,IDLE_T));P.body[2]=s*.55;P.sway=s*.45;
    P.glow=.25+.1*Math.sin(t*3.1);
  }
  return P;
}

function robe(ctx,rf,P) {
  const p=rf.U(0,0,0),sw=P.sway;
  ctx.save();ctx.translate(p.x,p.y);
  shape(ctx,[[-12,-51],[-17,-44],[-15,-34],[-20+sw,-16],[-23+sw,-11],
    [-13,-9],[0,-11],[11,-9],[23+sw,-12],[18+sw,-25],[15,-43],[11,-51]],C.cloth,{w:1.8});
  const Q=pts=>pts.map(([b,z])=>{const q=rf.U(9,b,z);return[q.x-p.x,q.y-p.y];});
  // Cream front panel from the belt to the hem, with three plum diamonds near the hem.
  shape(ctx,Q([[-5,31],[-8,20],[-11,11],[0,10],[11,11],[8,20],[5,31]]),C.lining,{w:1,depth:.7,speck:.35});
  for(const [b,z] of [[-4,17],[4,17],[0,14]]) {
    const q=rf.U(9.5,b,z);shape(ctx,[[q.x-p.x,q.y-p.y-2.6],[q.x-p.x+1.8,q.y-p.y],
      [q.x-p.x,q.y-p.y+2.6],[q.x-p.x-1.8,q.y-p.y]],C.diamond,{w:.5,depth:0,speck:0});
  }
  shape(ctx,[[-12,-50],[-3,-45],[0,-41],[3,-45],[12,-50],[8,-40],[0,-37],[-8,-41]],C.dark,{w:1});
  // Strap from the left shoulder to the right hip, crossing the chest, with a round brass medallion.
  shape(ctx,Q([[11,47],[14,45],[-9,33],[-12,35]]),C.leather,{w:1,depth:.7});
  shape(ctx,[[-14,-36],[14,-36],[14,-32],[-14,-32]],C.leather,{w:1,depth:.7});
  const buckle=rf.U(10,0,34);ctx.save();ctx.translate(buckle.x-p.x,buckle.y-p.y);
  shape(ctx,[[-3,-2.5],[3,-2.5],[3,2.5],[-3,2.5]],C.gold,{w:.8,depth:0});
  shape(ctx,[[-1.6,-1.2],[1.6,-1.2],[1.6,1.2],[-1.6,1.2]],C.book,{w:.5,depth:0});ctx.restore();
  const medal=rf.U(10,3,41);
  oval(ctx,medal.x-p.x,medal.y-p.y,2.8,2.8,C.gold,{w:.8});
  oval(ctx,medal.x-p.x,medal.y-p.y,1.2,1.2,C.flame,{w:0,depth:0,speck:0});
  // A small pouch hangs from the belt on the left hip.
  const pouch=rf.U(5,11,30);
  shape(ctx,[[pouch.x-p.x-3,pouch.y-p.y-1],[pouch.x-p.x+3,pouch.y-p.y-1],[pouch.x-p.x+3.4,pouch.y-p.y+6],[pouch.x-p.x-3.2,pouch.y-p.y+6]],C.leather,{w:.9,depth:.8});
  cLine(ctx,[[pouch.x-p.x-3,pouch.y-p.y+1.5],[pouch.x-p.x+3,pouch.y-p.y+1.5]],.45);
  cLine(ctx,[[-16+sw,-17],[-11,-29],[-8,-35]],.65);
  cLine(ctx,[[17+sw,-16],[12,-28],[10,-34]],.65);
  ctx.restore();
}

function head(ctx,h,rf,P) {
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx,1);
  // A long braid hangs behind the shoulder, tied with a leather band (drawn first, behind the hair).
  for(let i=0;i<4;i++) {
    const y=14+i*6.2,x=-17-i*1.1;
    shape(ctx,[[x-4,y-3],[x,y-4.5],[x+3.6,y-2],[x+2.6,y+3.5],[x-1.4,y+4.4],[x-4.6,y+1.2]],C.hair,{w:1.1,depth:1});
    cLine(ctx,[[x-3,y-1],[x+2,y+2]],.45);
  }
  shape(ctx,[[-23.5,37],[-18,36.5],[-18.5,40],[-23.5,40.5]],C.leather,{w:.9,depth:.6});
  shape(ctx,[[-23,40.5],[-18.5,40.5],[-17,47],[-19.5,44.5],[-21,48],[-22,44.5],[-25,46.5]],C.hair,{w:1,depth:.8});
  shape(ctx,[[-19,-19],[-11,-23],[7,-23],[18,-17],[22,-4],[21,15],[15,22],
    [12,17],[7,23],[-1,21],[-9,23],[-14,18],[-20,20],[-23,9],[-21,-4]],C.hair,{w:1.7});
  // Back-to-front: hanging side locks, face/ears, then the fringe.
  shape(ctx,[[-18,-2],[-15,6],[-15,16],[-11,24],[-17,22],[-21,14],[-21,3]],C.hair,{w:1});
  shape(ctx,[[19,-4],[21,9],[18,19],[15,21],[17,11],[15,2]],C.hair,{w:1});
  oval(ctx,2,1,18.4,20,C.skin,{w:1.6,speck:0,depth:1.1});
  oval(ctx,-15,8,4.8,5.4,C.skin,{w:1,speck:0});
  cLine(ctx,[[-17,7],[-14,6],[-13,10]],.6);
  if(P.blink) for(const x of [-2,12]) cLine(ctx,[[x-2,5],[x+2,5]],.9);
  else for(const [x,y] of [[-2,5],[12,3]]){ctx.save();ctx.globalAlpha=.35;oval(ctx,x,y,3,5.6,C.eye,{w:0,depth:0,speck:0});ctx.restore();oval(ctx,x,y,1.5,4.4,C.eye,{w:0,depth:0,speck:0});}
  cLine(ctx,[[4,15],[6,15.4]],.65);
  for(const x of [-8,-6,15,17])cLine(ctx,[[x,12],[x+.5,13.4]],.4);
  shape(ctx,[[-20,-8],[-13,-19],[1,-23],[15,-18],[20,-9],[23,4],[16,-2],
    [19,10],[13,5],[9,-7],[5,0],[4,-12],[-2,-2],[-1,-14],[-9,-4],[-14,1],[-12,-9],[-19,4]],C.hair,{w:1.2});
  cLine(ctx,[[-11,-15],[-15,-5],[-17,2]],.55);
  cLine(ctx,[[3,-19],[1,-13],[-3,-7]],.55);
  // Floppy crown and broad tilted brim with a leather band and brass buckle. Only this head accessory mirrors.
  ctx.translate(0,8);
  const bend=P.sway;
  shape(ctx,[[-24,-21],[-21,-39],[-26+bend,-40],[-32+bend,-33],[-43+bend,-29],
    [-37+bend,-39],[-30+bend,-48],[-23,-56],[-11,-62],[0,-58],[10,-51],[16,-35],[21,-21]],C.cloth,{w:1.8});
  cLine(ctx,[[-25,-46],[-17,-44],[-12,-39]],.65);
  cLine(ctx,[[-10,-56],[-5,-50],[-2,-47]],.65);
  shape(ctx,[[-23,-31],[-5,-36],[15,-34],[18,-27],[-3,-28],[-25,-24]],C.leather,{w:1.2,depth:1});
  shape(ctx,[[2,-37],[12,-37],[14,-28],[4,-27]],C.gold,{w:1,depth:0});
  shape(ctx,[[5,-34],[10,-34],[11,-30],[6,-30]],C.leatherDark,{w:.6,depth:0});
  shape(ctx,[[-22,-26],[-10,-28],[7,-28],[22,-24],[31,-19],[35,-12],[30,-12],
    [22,-17],[11,-18],[1,-14],[-14,-9],[-29,-4],[-35,-7],[-30,-16]],C.cloth,{w:1.7});
  shape(ctx,[[-29,-6],[-14,-11],[1,-16],[11,-20],[22,-19],[30,-14],[22,-17],[11,-18],[1,-14],[-14,-9],[-29,-4]],C.dark,{w:0,depth:0,speck:.3});
  cLine(ctx,[[-30,-10],[-17,-15],[-5,-20],[12,-23],[24,-20]],.7);
  ctx.restore();
}

function sleeve(ctx,rf,j) {
  const s=rf.U(...j.S),e=rf.U(...j.E),h=rf.U(...j.H);
  paint(ctx,taperPts(s,e,5.8,5.3),{fill:C.cloth,w:1.5,depth:1.8,speck:.55,speckScale:.3});
  const dx=h.x-e.x,dy=h.y-e.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
  const cuff={x:h.x-dx/L*3,y:h.y-dy/L*3};
  paint(ctx,[{x:e.x+nx*5,y:e.y+ny*5},{x:cuff.x+nx*7,y:cuff.y+ny*7},
    {x:cuff.x-nx*6,y:cuff.y-ny*6},{x:e.x-nx*4,y:e.y-ny*4}],
    {fill:C.cloth,w:1.5,depth:2,speck:.6,speckScale:.3});
  // Broad cream cuff.
  paint(ctx,taperPts({x:cuff.x-nx*6,y:cuff.y-ny*6},{x:cuff.x+nx*7,y:cuff.y+ny*7},2,2),
    {fill:C.lining,w:.8,depth:.4,speck:.2});
  cLine(ctx,[[e.x,e.y+2],[cuff.x-dx/L*5,cuff.y-dy/L*5]],.7);
}

function staff(ctx,rf,P) {
  const axis=P.staffAxis,at=z=>rf.U(...P.staff.map((v,i)=>v+axis[i]*z));
  // Twisted, knotted shaft: the wobble alternates more than the mage's straight staff.
  const shaft=[-38,-30,-22,-14,-6,2,10,18,26,33].map((z,i)=>{
    const q=at(z);return{x:q.x+(i%2?1.2:-1.2),y:q.y};});
  strokePath(ctx,shaft,5*DRAW.lw,false,C.ink);strokePath(ctx,shaft,3.1,false,C.wood);
  strokePath(ctx,shaft.map((q,i)=>({x:q.x+(i%2?-.6:.6),y:q.y})),1,false,C.woodLight);
  const base=at(33),tip=at(54),dx=tip.x-base.x,dy=tip.y-base.y,L=Math.hypot(dx,dy),nx=-dy/L,ny=dx/L;
  const q=(s,w)=>({x:base.x+dx*s+nx*w,y:base.y+dy*s+ny*w});
  // Wrapped neck under the crown.
  for(const z of [26,29,32]) { const p=at(z);cLine(ctx,[[p.x-2.4,p.y+1.2],[p.x+2.4,p.y-1.2]],1.1); }
  // Ember crystal: an orange flame-shaped gem with a bright core.
  const glow=P.glow;
  if(glow>0) {
    const g=q(.55,0);ctx.save();ctx.globalAlpha=glow*.3;
    oval(ctx,g.x,g.y,10+glow*4,11+glow*4,'#ffb25a',{w:0,depth:0,speck:0});ctx.restore();
  }
  const gem=[q(0,0),q(.2,-4.5),q(.5,-5),q(.78,-2.6),q(1.1,0),q(.75,2.2),q(.55,5),q(.2,4.4)];
  paint(ctx,gem,{fill:C.flame,w:1.2,depth:1.4,speck:.2,amp:.18});
  paint(ctx,[q(.15,0),q(.35,-2.2),q(.75,-1),q(.6,1.8),q(.3,2)],{fill:C.flameIn,w:0,depth:0,speck:0});
  paint(ctx,[q(.05,1),q(.3,4.2),q(.55,4.6),q(.4,2.5)],{fill:C.flameOut,w:0,depth:0,speck:0});
  // Gnarled branches cradle the crystal.
  for(const s of [-1,1]) {
    const branch=[q(-.15,0),q(0,s*5.5),q(.32,s*7.5),q(.58,s*5.5),q(.7,s*3.2)];
    strokePath(ctx,branch,3.8*DRAW.lw,false,C.ink);strokePath(ctx,branch,2.1,false,C.wood);
  }
  // Drifting embers around the crown (stable positions that flicker with time).
  seed('eb-shadow-arcanist-embers');
  const n=glow>.5?7:4;
  for(let i=0;i<n;i++) {
    const s=R(.1,1.3),w=R(-13,13),f=.5+.5*Math.sin(P.t*6+i*1.7);
    if(f<.25) continue;
    const e=q(s,w);ctx.save();ctx.globalAlpha=Math.min(1,f+.2);
    oval(ctx,e.x,e.y,.9+glow*.5,.9+glow*.5,C.ember,{w:0,depth:0,speck:0});ctx.restore();
  }
}

function book(ctx,rf,P) {
  const h=rf.U(...P.book),angle=rf.sx*.14;
  // The right palm supports the lower edge, including the book's tilt.
  ctx.save();ctx.translate(h.x+Math.sin(angle)*14,h.y-Math.cos(angle)*14);ctx.rotate(angle);
  shape(ctx,[[-10,-13],[8,-13],[11,-10],[11,14],[-10,14]],C.leatherDark,{w:1.6});
  shape(ctx,[[6,-11],[10,-10],[10,11],[6,12]],C.lining,{w:.8,depth:.5});
  for(const x of [7.2,8.5])cLine(ctx,[[x,-8],[x,9]],.45);
  shape(ctx,[[-9,-13],[6,-12],[6,13],[-9,12]],C.book,{w:1.2});
  // Flame emblem in a brass ring.
  strokePath(ctx,ellipsePts(-1.5,0,6,6.2,24),.7,false,C.gold);
  paint(ctx,[{x:-1.5,y:-5},{x:1.5,y:-1},{x:2,y:2.5},{x:-1.5,y:4.5},{x:-5,y:2.5},{x:-4.5,y:-1},{x:-3,y:.5}],{fill:C.flame,w:.6,depth:0,speck:0,amp:.1});
  ctx.restore();
}

export function drawArcanist(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=arcanistPose(action,t),rf=rigFrame(direction,P.body),U=rf.U;
  // Facing left (staff hand near) the forward point aims the staff at the viewer: turn it back to the
  // travel direction while it strikes (SIDE_VIEW_GUIDE.md 2.3). Facing right it already points ahead.
  P.staffAxis=nrm3([P.pitch,.35,1]);
  if(direction==='L'&&action==='attack') P.staffAxis=travelDir(rf,P.staffAxis,
    keyframes([[0,[0]],[.08,[1]],[.45,[1]],[.7,[0]],[1,[0]]],phase(t,ARCANIST_ATTACK_T))[0]);
  if(direction==='L'&&action==='cast') P.staffAxis=travelDir(rf,P.staffAxis,
    keyframes([[0,[0]],[.56,[0]],[.62,[1]],[.8,[1]],[.95,[0]],[1,[0]]],phase(t,ARCANIST_METEOR_T))[0]);
  const parts=legParts2(ctx,rf,P,{pants:C.dark,boot:C.leather,cuff:C.leatherDark,footR:3.7,soleR:3.3});
  const headCenter=U(1.5,0,71);
  // Near-side left arm and staff pass in front of the chest-held right-hand book.
  const layer=p=>U(...p).d>0?40:-20;
  parts.push({id:'robe',d:0,draw:()=>robe(ctx,rf,P)});
  parts.push({id:'head',d:100,draw:()=>head(ctx,headCenter,rf,P)});
  for(const [side,H] of [[1,P.staff],[-1,P.book]]) {
    const S=[0,side*13,49],E=ik2(S,H,14,15,[-3,side*4,-14]),j={S,E,H};
    // Sleeves stay below the head layer.
    const d=side===-1?25:layer(mid(S,H));
    // Facing left the left-hand staff is nearest: the crystal and its branches cover the hat brim.
    // Raised overhead for Meteor, the staff passes beside the hat in both facings: keep it in front.
    const staffInFront=side===1&&(direction==='L'||H[2]>58);
    parts.push({id:'sleeve'+side,d,draw:()=>sleeve(ctx,rf,j)});
    parts.push({id:'equipment'+side,d:staffInFront?101:d+1,draw:()=>side===1?staff(ctx,rf,P):book(ctx,rf,P)});
    parts.push({id:'hand'+side,d:staffInFront?102:d+(side===-1?.5:2),draw:()=>{
      const h=U(...H),e=U(...E);mittenHand(ctx,h,h.x-e.x,h.y-e.y,3.2,C.skin,{thumbSide:side*rf.sx});
    }});
  }
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),action==='dead',
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-shadow-arcanist',boil:0,shadow:opts.shadow}),ARCANIST_FALL);
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-shadow-arcanist',label:'Shadow Arcanist — EMBERBOUND',kind:'humanoid',directional:true,draw:drawArcanist,
  actions:{idle:{period:IDLE_T,frames:16},
    attack:{period:ARCANIST_ATTACK_T,keys:KEYS.attack,once:true,releaseAt:.12},
    cast:{period:ARCANIST_METEOR_T,keys:KEYS.cast,once:true,releaseAt:.62},
    hurt:hurtAction},
  // Fallen, the hat lies behind the head with its broad brim below the foot line (on the floor nearer the camera).
  frameBox:{x0:-120,x1:120,y0:-150,y1:40},
  equipment:{leftHand:'staff',rightHand:'spellbook'},
  emberbound:{gameId:'shadow_arcanist',heightPx:41,facing:'L'},
});
export const studio=Object.freeze({order:43,name:"Shadow Arcanist（影の魔導士）",category:"EMBERBOUND 影",
  description:"Arcanist の影。紫黒の帽子とローブに橙の線、桃色に光る杖。全体攻撃 Dark Meteor を詠唱する。",
  preview:{direction:'L',phase:0}});
