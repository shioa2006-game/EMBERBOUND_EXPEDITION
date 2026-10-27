/**
 * EMBERBOUND EXPEDITION — Oracle (game id `oracle`), built on the mage body (via eb-arcanist) after the
 * user's reference image: a floating gold halo, long wavy gold hair with a gold ornament, a cream robe and
 * capelet trimmed in gold, a blue front panel with a sun, a leather belt and pouch, an open free hand, and a
 * vine-wrapped staff crowned with a gold crescent cradling a glowing orb.
 * Actions follow the game's timing (plan/EMBERBOUND_PRODUCTION.md): `attack` is the holy strike (a quick
 * staff thrust with a flash; the game fires it when the attack starts), `cast` is healing / Sanctuary (staff
 * and palm raised while the light swells); `hurt` and `dead` use the shared tilt.
 * This file is a copy, not an import, so the Oracle exports on its own.
 * Anatomical +b is LEFT (staff), -b RIGHT (open hand).
 */
import {
  TAU, WALK_HZ, rigFrame, renderRig, walkFeet, ik2, keyframes, nrm3, travelDir,
  paint, paintA, ellipsePts, taperPts, cLine, mittenHand, legParts2,
  strokePath, DRAW, PAL,
} from '../../src/authoring.js';
import { hurtAction, deadAction, phase, sample, hurtAmount, deadPhase, fallTilt, withTilt } from '../shared/emberbound/actions.js';

const C = {
  cloth:'#f1ead7', clothShade:'#d9ceb4', trim:'#cfa955', sash:'#8496b5', sashDark:'#5f7193',
  hair:'#ecd18f', hairShade:'#c9a862', hairLight:'#fff0bd', skin:'#f3dbb3',
  leather:'#7a5638', leatherDark:'#5b3f29', gold:'#d4ad58', goldLight:'#f2d68c',
  wood:'#6e4d32', vine:'#a08a5c', orb:'#fff4d0', glow:'#ffe6a0', ink:PAL.ink,
};
const IDLE_T=3.2;
// Game timing (seconds).
export const ORACLE_ATTACK_T=.3;   // holy strike: the thrust peaks at u = .12 (0.036 s); the game hits at 0.25 s
export const ORACLE_HEAL_T=.6;     // healing / Sanctuary: the light peaks at u = .35 (0.21 s)
const KEYS=Object.freeze({
  attack:[0,.06,.12,.2,.3,.45,.6,.8],
  cast:[0,.1,.2,.28,.35,.45,.6,.75,.9],
});
const blend=(keys,u)=>keyframes(keys,u);
const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const shape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:1.5,depth:1.7,
  speck:.55,speckScale:.3,amp:.22,...o});
const oval=(ctx,x,y,rx,ry,fill,o={})=>paint(ctx,ellipsePts(x,y,rx,ry,28),
  {fill,w:1.2,depth:1,speck:.35,speckScale:.3,amp:.2,...o});

// The free right hand rests open in front of the chest, palm up.
const REST={staff:[0,39,43],palm:[11,-19,31]};
export function oraclePose(action,t) {
  const P={body:[0,0,0],footL:[0,6,0],footR:[0,-6,0],
    staff:REST.staff.slice(),palm:REST.palm.slice(),pitch:.07,sway:0,glow:0,halo:0,t,blink:false};
  if(action==='walk') {
    const w=walkFeet(t);
    P.footL=w.footL;P.footR=w.footR;P.body=[0,0,w.bob*.45];
    P.sway=w.s*1.3;P.staff[2]+=w.s*.65;P.palm[2]-=w.s*.5;
  } else if(action==='attack') {
    // Holy strike: a quick thrust that points the orb ahead, a flash, then back to rest.
    const u=phase(t,ORACLE_ATTACK_T);
    P.staff=blend([[0,REST.staff],[.12,[25,20,42]],[.45,[24,21,42]],[1,REST.staff]],u);
    P.palm=blend([[0,REST.palm],[.12,[13,-17,37]],[.45,[13,-17,37]],[1,REST.palm]],u);
    const a=blend([[0,[0,.07,0]],[.12,[2,2.4,1.2]],[.45,[2,2.4,1.2]],[1,[0,.07,0]]],u);
    P.body=[a[0],0,0];P.pitch=a[1];P.sway=a[2];
    P.glow=sample([[0,[.3]],[.1,[1]],[.3,[.6]],[.6,[0]],[1,[0]]],u);
  } else if(action==='cast') {
    // Healing / Sanctuary: lift the staff (held out to the side so it clears the robe) and hold the open palm
    // out in front of the chest while the light and the halo swell, then lower both. A palm raised higher would
    // hide behind the large head.
    const u=phase(t,ORACLE_HEAL_T);
    P.staff=blend([[0,REST.staff],[.28,[4,30,68]],[.6,[4,30,69]],[1,REST.staff]],u);
    P.palm=blend([[0,REST.palm],[.28,[22,-23,45]],[.6,[22,-23,46]],[1,REST.palm]],u);
    const a=blend([[0,[0,.07,0]],[.28,[-1,-.15,-.5]],[.6,[-1,-.15,-.5]],[1,[0,.07,0]]],u);
    P.body=[a[0],0,a[0]<0?.5:0];P.pitch=a[1];P.sway=a[2];
    P.glow=sample([[0,[.2]],[.28,[.8]],[.35,[1]],[.6,[.8]],[1,[0]]],u);
    P.halo=sample([[0,[0]],[.35,[1]],[.6,[.7]],[1,[0]]],u);
  } else if(action==='hurt') {
    const k=hurtAmount(t);
    P.body=[-2.5*k,0,-1.2*k];P.staff=[REST.staff[0]-2*k,REST.staff[1],REST.staff[2]+3*k];
    P.palm=[REST.palm[0]-2*k,REST.palm[1],REST.palm[2]+5*k];P.sway=1.5*k;P.blink=k>.5;
  } else if(action==='dead') {
    const u=deadPhase(t);
    P.body=[sample([[0,[0]],[.15,[-2]],[1,[-2]]],u),0,sample([[0,[0]],[.15,[-1.5]],[1,[-1]]],u)];
    P.staff=[REST.staff[0]-3,REST.staff[1],REST.staff[2]-4*sample([[0,[0]],[.7,[1]],[1,[1]]],u)];
    P.palm=[REST.palm[0]-4,REST.palm[1]-2,REST.palm[2]-6*sample([[0,[0]],[.7,[1]],[1,[1]]],u)];
    P.sway=sample([[0,[0]],[.2,[2]],[.7,[-2.5]],[1,[0]]],u);P.blink=u>.12;
  } else {
    const s=Math.sin(TAU*phase(t,IDLE_T));P.body[2]=s*.55;P.sway=s*.45;
    P.glow=.35+.12*Math.sin(t*2.6);
  }
  return P;
}

function robe(ctx,rf,P) {
  const p=rf.U(0,0,0),sw=P.sway;
  ctx.save();ctx.translate(p.x,p.y);
  // Long cream robe, gold trim along the hem.
  const robeShape=[[-12,-51],[-17,-44],[-15,-34],[-20+sw,-16],[-23+sw,-10],
    [-13,-8],[0,-10],[11,-8],[23+sw,-11],[18+sw,-25],[15,-43],[11,-51]];
  shape(ctx,robeShape,C.cloth,{w:1.8,depth:1.4});
  strokePath(ctx,[[-23+sw,-11],[-13,-9.5],[0,-11.5],[11,-9.5],[23+sw,-12]].map(([x,y])=>({x,y})),2.2,false,C.trim);
  const Q=pts=>pts.map(([b,z])=>{const q=rf.U(9,b,z);return[q.x-p.x,q.y-p.y];});
  // Blue front panel with a sun and a star, edged in gold.
  shape(ctx,Q([[-5.5,33],[-6.5,20],[-7,11],[0,9],[7,11],[6.5,20],[5.5,33]]),C.sash,{w:1.1,depth:1});
  const sun=rf.U(9.5,0,21);
  oval(ctx,sun.x-p.x,sun.y-p.y,2.2,2.2,C.gold,{w:.6,depth:0,speck:0});
  for(let i=0;i<8;i++){const a=i*TAU/8;cLine(ctx,[[sun.x-p.x+Math.cos(a)*3,sun.y-p.y+Math.sin(a)*3],[sun.x-p.x+Math.cos(a)*4.6,sun.y-p.y+Math.sin(a)*4.6]],.45);}
  const star=rf.U(9.5,0,14);
  shape(ctx,[[star.x-p.x,star.y-p.y-2.6],[star.x-p.x+1.2,star.y-p.y],[star.x-p.x,star.y-p.y+2.6],[star.x-p.x-1.2,star.y-p.y]],C.goldLight,{w:.4,depth:0,speck:0});
  // Leather belt with a brass buckle, and a pouch on the right hip.
  shape(ctx,[[-14,-36],[14,-36],[14,-32],[-14,-32]],C.leather,{w:1,depth:.7});
  const buckle=rf.U(10,0,34);ctx.save();ctx.translate(buckle.x-p.x,buckle.y-p.y);
  shape(ctx,[[-3,-2.5],[3,-2.5],[3,2.5],[-3,2.5]],C.gold,{w:.8,depth:0});
  shape(ctx,[[-1.6,-1.2],[1.6,-1.2],[1.6,1.2],[-1.6,1.2]],C.leatherDark,{w:.5,depth:0});ctx.restore();
  const pouch=rf.U(5,-11,30);
  shape(ctx,[[pouch.x-p.x-3.4,pouch.y-p.y-1],[pouch.x-p.x+3.4,pouch.y-p.y-1],[pouch.x-p.x+3.8,pouch.y-p.y+6.5],[pouch.x-p.x-3.6,pouch.y-p.y+6.5]],C.leather,{w:.9,depth:.8});
  cLine(ctx,[[pouch.x-p.x-3.4,pouch.y-p.y+1.6],[pouch.x-p.x+3.4,pouch.y-p.y+1.6]],.45);
  // Capelet over the shoulders: a soft hood-like collar with gold trim and a round brooch.
  shape(ctx,[[-15,-51],[-20,-44],[-19,-38],[-8,-40],[0,-38],[8,-40],[19,-38],[20,-44],[15,-51],[0,-47]],C.cloth,{w:1.4,depth:1.6});
  strokePath(ctx,[[-19,-38.5],[-8,-40.5],[0,-38.5],[8,-40.5],[19,-38.5]].map(([x,y])=>({x,y})),1.6,false,C.trim);
  const brooch=rf.U(10,3,45);
  oval(ctx,brooch.x-p.x,brooch.y-p.y,2.8,2.8,C.gold,{w:.8});
  oval(ctx,brooch.x-p.x,brooch.y-p.y,1.1,1.1,C.goldLight,{w:0,depth:0,speck:0});
  cLine(ctx,[[-16+sw,-17],[-11,-29],[-8,-35]],.6);
  cLine(ctx,[[17+sw,-16],[12,-28],[10,-34]],.6);
  ctx.restore();
}

/** Long wavy hair falling behind the shoulders: its own part, drawn behind the robe and capelet. */
function backHair(ctx,h,rf) {
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx,1);
  shape(ctx,[[-21,-8],[-25,6],[-24,18],[-27,28],[-22,36],[-15,33],[-9,38],[-2,34],[3,30],
    [10,33],[16,28],[20,30],[23,20],[22,6],[18,-6]],C.hair,{w:1.6,depth:1.4});
  for(const pts of [[[-22,14],[-24,24],[-21,32]],[[-15,18],[-14,28],[-10,35]],[[14,16],[17,24],[15,29]]]) cLine(ctx,pts,.55);
  ctx.restore();
}

function head(ctx,h,rf,P) {
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx,1);
  shape(ctx,[[-19,-19],[-11,-23],[7,-23],[18,-17],[22,-4],[21,15],[15,22],
    [12,17],[7,23],[-1,21],[-9,23],[-14,18],[-20,20],[-23,9],[-21,-4]],C.hair,{w:1.7});
  // Side locks, face and ear, then the wavy fringe.
  shape(ctx,[[-18,-2],[-15,6],[-16,16],[-12,25],[-18,23],[-22,14],[-21,3]],C.hair,{w:1});
  shape(ctx,[[19,-4],[22,9],[19,19],[16,22],[18,11],[15,2]],C.hair,{w:1});
  oval(ctx,2,1,18.4,20,C.skin,{w:1.6,speck:0,depth:1.1});
  oval(ctx,-15,8,4.8,5.4,C.skin,{w:1,speck:0});
  cLine(ctx,[[-17,7],[-14,6],[-13,10]],.6);
  if(P.blink) for(const x of [-2,12]) cLine(ctx,[[x-2,5],[x+2,5]],.9);
  else for(const [x,y] of [[-2,5],[12,3]])oval(ctx,x,y,1.5,4.4,C.ink,{w:.5,depth:0,speck:0});
  cLine(ctx,[[4,15],[6,15.4]],.65);
  for(const x of [-8,-6,15,17])cLine(ctx,[[x,12],[x+.5,13.4]],.4);
  shape(ctx,[[-21,-8],[-14,-20],[1,-24],[15,-19],[21,-9],[23,4],[17,-3],
    [19,9],[13,4],[10,-7],[6,1],[4,-12],[-2,-1],[-2,-14],[-9,-3],[-14,2],[-13,-9],[-20,5]],C.hair,{w:1.2});
  cLine(ctx,[[-12,-16],[-16,-6],[-18,2]],.55);
  cLine(ctx,[[3,-20],[1,-13],[-3,-7]],.55);
  // A small braid across the crown, pinned by a round gold ornament.
  for(let i=0;i<4;i++) oval(ctx,-15+i*4,-17-i*1.3,2.6,2,C.hairShade,{w:.7,depth:.5,speck:0});
  oval(ctx,-17,-13,3.2,3.2,C.gold,{w:.8});
  oval(ctx,-17,-13,1.2,1.2,C.goldLight,{w:0,depth:0,speck:0});
  // Halo floating above the head; it brightens while healing.
  const hy=-33-1.5*P.halo;
  if(P.halo>0) { ctx.save();ctx.globalAlpha=.35*P.halo;oval(ctx,0,hy,22,7,C.glow,{w:0,depth:0,speck:0});ctx.restore(); }
  strokePath(ctx,ellipsePts(0,hy,15.5,4.4,40),3.6*DRAW.lw,true,C.ink);
  strokePath(ctx,ellipsePts(0,hy,15.5,4.4,40),2.1,true,C.gold);
  strokePath(ctx,ellipsePts(0,hy-.5,14,3.7,40).slice(22,38),.8,false,C.goldLight);
  if(P.halo>.3) for(let i=0;i<5;i++){const a=-Math.PI*(.15+i*.175);cLine(ctx,[[Math.cos(a)*19,hy+Math.sin(a)*7],[Math.cos(a)*23,hy+Math.sin(a)*9.5]],.55);}
  ctx.restore();
}

function sleeve(ctx,rf,j) {
  const s=rf.U(...j.S),e=rf.U(...j.E),h=rf.U(...j.H);
  paint(ctx,taperPts(s,e,5.8,5.3),{fill:C.cloth,w:1.5,depth:1.6,speck:.5,speckScale:.3});
  const dx=h.x-e.x,dy=h.y-e.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
  const cuff={x:h.x-dx/L*3,y:h.y-dy/L*3};
  paint(ctx,[{x:e.x+nx*5,y:e.y+ny*5},{x:cuff.x+nx*7,y:cuff.y+ny*7},
    {x:cuff.x-nx*6,y:cuff.y-ny*6},{x:e.x-nx*4,y:e.y-ny*4}],
    {fill:C.cloth,w:1.5,depth:1.8,speck:.5,speckScale:.3});
  // Wide cuff edged in gold.
  paint(ctx,taperPts({x:cuff.x-nx*6,y:cuff.y-ny*6},{x:cuff.x+nx*7,y:cuff.y+ny*7},1.6,1.6),
    {fill:C.trim,w:.8,depth:.4,speck:.2});
  cLine(ctx,[[e.x,e.y+2],[cuff.x-dx/L*5,cuff.y-dy/L*5]],.6);
}

function staff(ctx,rf,P) {
  const axis=P.staffAxis,at=z=>rf.U(...P.staff.map((v,i)=>v+axis[i]*z));
  const shaft=[-38,-30,-22,-14,-6,2,10,18,26,33].map((z,i)=>{
    const q=at(z);return{x:q.x+(i%2?1:-1),y:q.y};});
  strokePath(ctx,shaft,5*DRAW.lw,false,C.ink);strokePath(ctx,shaft,3.1,false,C.wood);
  // A vine winds around the shaft.
  for(let z=-30;z<26;z+=7){const a=at(z),b=at(z+4);cLine(ctx,[[a.x-2.6,a.y+1],[b.x+2.6,b.y-1]],.9);
    strokePath(ctx,[{x:a.x-2.2,y:a.y+.8},{x:b.x+2.2,y:b.y-.8}],1.1,false,C.vine);}
  for(const z of [27,30]) { const p=at(z);strokePath(ctx,[{x:p.x-2.6,y:p.y+1.3},{x:p.x+2.6,y:p.y-1.3}],2.2,false,C.gold);cLine(ctx,[[p.x-2.6,p.y+1.3],[p.x+2.6,p.y-1.3]],.5); }
  const base=at(33),tip=at(55),dx=tip.x-base.x,dy=tip.y-base.y,L=Math.hypot(dx,dy),nx=-dy/L,ny=dx/L;
  const q=(s,w)=>({x:base.x+dx*s+nx*w,y:base.y+dy*s+ny*w});
  // Gold crescent cradling a glowing orb. Its thick, closed bottom (a = −π/2, s ≈ 0) sits on the end of the
  // shaft and it opens upward; the inner edge is set higher, so the horns taper toward the opening.
  const glow=P.glow,orb=q(.6,0);
  if(glow>0) { ctx.save();ctx.globalAlpha=glow*.35;oval(ctx,orb.x,orb.y,9+glow*5,9+glow*5,C.glow,{w:0,depth:0,speck:0});ctx.restore(); }
  const outer=[],inner=[];
  for(let i=0;i<=14;i++){const a=-1.2*Math.PI+i/14*1.4*Math.PI;outer.push(q(.55+.5*Math.sin(a),-8*Math.cos(a)));inner.push(q(.66+.36*Math.sin(a),-5.2*Math.cos(a)));}
  paint(ctx,[...outer,...inner.reverse()],{fill:C.gold,w:1.2,depth:1.2,speck:.25,amp:.15});
  // A gold collar joins the crescent to the shaft.
  const c0=at(31.5),c1=at(34.5);
  strokePath(ctx,[c0,c1],5*DRAW.lw,false,C.ink);strokePath(ctx,[c0,c1],3.4,false,C.gold);
  oval(ctx,orb.x,orb.y,3.6,3.6,C.orb,{w:1,depth:.4,speck:0});
  oval(ctx,orb.x-1,orb.y-1,1.2,1.2,'#ffffff',{w:0,depth:0,speck:0});
  if(glow>.5) for(let i=0;i<6;i++){const a=i*TAU/6+.3;cLine(ctx,[[orb.x+Math.cos(a)*6,orb.y+Math.sin(a)*6],[orb.x+Math.cos(a)*9,orb.y+Math.sin(a)*9]],.55);}
}

/** The open right hand, palm up (a mitten tilted toward the viewer). */
function openHand(ctx,h,e,sx) {
  mittenHand(ctx,h,h.x-e.x,h.y-e.y-4,3.4,C.skin,{thumbSide:-sx});
}

export function drawOracle(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=oraclePose(action,t),rf=rigFrame(direction,P.body),U=rf.U;
  // Facing left (staff hand near) the forward point aims the staff at the viewer: turn it back to the travel
  // direction while it strikes (SIDE_VIEW_GUIDE.md 2.3). Facing right it already points ahead.
  P.staffAxis=nrm3([P.pitch,.35,1]);
  if(direction==='L'&&action==='attack') P.staffAxis=travelDir(rf,P.staffAxis,
    keyframes([[0,[0]],[.08,[1]],[.45,[1]],[.7,[0]],[1,[0]]],phase(t,ORACLE_ATTACK_T))[0]);
  const parts=legParts2(ctx,rf,P,{pants:C.clothShade,boot:C.leather,cuff:C.leatherDark,footR:3.7,soleR:3.3});
  const headCenter=U(1.5,0,71);
  const layer=p=>U(...p).d>0?40:-20;
  parts.push({id:'hairBack',d:-5,draw:()=>backHair(ctx,headCenter,rf)});
  parts.push({id:'robe',d:0,draw:()=>robe(ctx,rf,P)});
  parts.push({id:'head',d:100,draw:()=>head(ctx,headCenter,rf,P)});
  for(const [side,H] of [[1,P.staff],[-1,P.palm]]) {
    const S=[0,side*13,49],E=ik2(S,H,14,15,[-3,side*4,-14]),j={S,E,H};
    const d=side===-1?25:layer(mid(S,H));
    // Facing left the left-hand staff is nearest; raised for healing it passes beside the head in both facings.
    const staffInFront=side===1&&(direction==='L'||H[2]>58);
    parts.push({id:'sleeve'+side,d,draw:()=>sleeve(ctx,rf,j)});
    if(side===1) parts.push({id:'staff',d:staffInFront?101:d+1,draw:()=>staff(ctx,rf,P)});
    parts.push({id:'hand'+side,d:staffInFront?102:d+(side===-1?.5:2),draw:()=>{
      const h=U(...H),e=U(...E);
      if(side===1) mittenHand(ctx,h,h.x-e.x,h.y-e.y,3.2,C.skin,{thumbSide:side*rf.sx});
      else openHand(ctx,h,e,rf.sx);
    }});
  }
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),action==='dead',
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-oracle',boil:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-oracle',label:'Oracle — EMBERBOUND',kind:'humanoid',directional:true,draw:drawOracle,
  actions:{idle:{period:IDLE_T,frames:16},walk:{period:1/WALK_HZ,frames:16},
    attack:{period:ORACLE_ATTACK_T,keys:KEYS.attack,once:true,releaseAt:.12},
    cast:{period:ORACLE_HEAL_T,keys:KEYS.cast,once:true,releaseAt:.35},
    hurt:hurtAction,dead:deadAction},
  frameBox:{x0:-110,x1:110,y0:-150,y1:40},
  equipment:{leftHand:'staff',rightHand:'open hand'},
  emberbound:{gameId:'oracle',heightPx:25,facing:'R'},
});
export const studio=Object.freeze({order:4,name:"Oracle（暁の巫女）",category:"EMBERBOUND 味方",
  description:"EMBERBOUND EXPEDITION の回復役。金色の光輪、波打つ金髪、白い法衣に青い前掛け、三日月と光の珠を頂く杖。聖撃、回復と聖域（Sanctuary）、被弾、戦闘不能の動きを持つ。",
  preview:{direction:'R',phase:0}});

// Game adapter: palette is restored after each synchronous sprite bake.
export { C as gearColors };
