/**
 * EMBERBOUND EXPEDITION — Ash Brute (game id `ash_brute`), built on the goblin's crouched rig after the
 * user's reference image: stony grey skin, a big round head with three horn bumps, large pointed ears,
 * angry eyes and upward fangs, a torn brown vest with a gold-buckled belt, wrist wraps, ember spots on the
 * shoulder and a thick club with dark iron studs.
 * Actions follow the game (plan/EMBERBOUND_PRODUCTION.md): a short club smash (impact at 0.15 s, the
 * game's enemy melee), `cast` = the Heavy Swing wind-up, which the game loops while it charges, and the
 * shared hurt. Enemies do not walk in the game. +b = anatomical left (club).
 */
import {
  TAU, TH, TW, KX, KY, rigFrame, renderRig, footProj,
  bodyToWorld, ik2, keyframes, nrm3, travelDir, paint, paintA, ellipsePts, taperPts,
  capsulePts, mittenHand, cLine, PAL,
} from '../../src/authoring.js';
import { hurtAction, phase, sample, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';

const C={skin:'#9b968c',shade:'#76716a',ear:'#8f7d79',leather:'#7b5034',
  dark:'#583926',cloth:'#875837',wrap:'#6d4a30',bone:'#efe3c2',
  wood:'#76492c',grain:'#a07650',iron:'#5d5c59',gold:'#c9a35a',ember:'#e8742e',ink:PAL.ink};
const IDLE_T=3.1;
// Game timing (seconds).
export const BRUTE_ATTACK_T=.3;   // smash: impact at u = .5 (0.15 s)
export const BRUTE_WINDUP_T=.5;   // Heavy Swing wind-up: a loop (starts and ends at the same pose)
const xy=p=>[p.x,p.y];
const shape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:1.5,depth:1.6,
  light:.16,speck:.7,speckScale:.3,amp:.25,...o});
const oval=(ctx,p,rx,ry,fill,o={})=>paint(ctx,ellipsePts(p.x,p.y,rx,ry,26),
  {fill,w:1.2,depth:1,speck:.5,speckScale:.3,amp:.2,...o});
const between=(a,b,u)=>({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u});
const REST=[7,28,32,...nrm3([.1,.4,.91])];
// The goblin's overhead smash, retimed for the game: raise, top, smash at u .5, hold, back.
const SWING=[
  [0,REST],[.25,[-1,24,56,...nrm3([-.5,.2,.85])]],
  [.36,[3,22,63,...nrm3([.25,.2,.95])]],
  [.5,[24,14,30,...nrm3([.88,.15,-.45])]],
  [.66,[22,15,27,...nrm3([.8,.2,-.5])]],
  [.86,[9,26,30,...nrm3([.4,.3,.85])]],[1,REST],
];
const WINDUP=[-2,24,58,...nrm3([-.5,.2,.85])];

export function brutePose(action,t) {
  const P={body:[0,0,0],footL:[0,10,0],footR:[0,-10,0],
    club:REST.slice(0,3),axis:REST.slice(3),free:[5,-23,22],ear:0,hem:0,glare:0};
  if(action==='attack') {
    const u=phase(t,BRUTE_ATTACK_T),a=keyframes(SWING,u);
    P.club=a.slice(0,3);P.axis=nrm3(a.slice(3));
    const b=keyframes([[0,[0,0,0]],[.36,[-1,.7,-.6]],[.5,[2.5,-.8,.9]],
      [.66,[2.5,-.8,.9]],[1,[0,0,0]]],u);
    P.body=[b[0],0,b[1]];P.ear=b[2];P.hem=b[2];P.glare=u>.3&&u<.7?1:0;
    P.free=keyframes([[0,P.free],[.36,[5,-26,22]],[.6,[6,-25,22]],[1,P.free]],u);
  } else if(action==='cast') {
    // Heavy Swing: the club held high behind the shoulder, the body coiled and shaking with effort.
    // Every term is periodic in u, so the loop has no seam.
    const u=phase(t,BRUTE_WINDUP_T),s=Math.sin(TAU*u*2),c=Math.cos(TAU*u);
    P.club=[WINDUP[0]+s*.6,WINDUP[1],WINDUP[2]+c*.8];P.axis=nrm3([WINDUP[3]+s*.04,WINDUP[4],WINDUP[5]]);
    P.body=[-1.6+s*.3,0,-1+c*.3];P.footL=[2,10,0];P.footR=[-2,-10,0];
    P.free=[7,-26,25+s*.5];P.ear=-1+s*.4;P.glare=1;
  } else if(action==='hurt') {
    const k=hurtAmount(t);
    P.body=[-2.5*k,0,-1.2*k];P.club=[REST[0]-2*k,REST[1],REST[2]+3*k];P.free=[5-2*k,-23,22+4*k];P.ear=2*k;
  } else {
    const s=Math.sin(TAU*phase(t,IDLE_T));P.body[2]=s*.5;P.ear=s*.6;
  }
  return P;
}

function bandage(ctx,a,b,r) {
  paint(ctx,taperPts(a,b,r,r*.92),{fill:C.wrap,w:1.2,depth:1,speck:.6,speckScale:.3});
  const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,nx=-dy/L*r,ny=dx/L*r;
  for(const u of [.18,.47,.77]) {
    const p=between(a,b,u);cLine(ctx,[[p.x-nx,p.y-ny+1],[p.x+nx,p.y+ny-1]],.65);
  }
}

/** A few small ember spots smouldering on the skin. */
function embers(ctx,center,spots) {
  for(const [dx,dy,r] of spots) paint(ctx,ellipsePts(center.x+dx,center.y+dy,r,r*.8,12),{fill:C.ember,w:0,depth:0,speck:0,amp:.2});
}

function legs(ctx,rf,P) {
  const out=[];
  for(const side of [1,-1]) {
    const ft=side===1?P.footL:P.footR,world=bodyToWorld(rf.dir,ft[0],ft[1]);
    const ankleZ=ft[2]+4-(world.X+world.Y)*((TH/TW)*KX-KY);
    const hip=[-4+P.body[0]*.5,side*8,23+P.body[2]*.5],ank=[ft[0],ft[1],ankleZ];
    const knee=ik2(hip,ank,14,15,[8,side*5,0]);
    const h=rf.W(...hip),k=rf.W(...knee),a=rf.W(...ank);
    out.push({id:'leg'+side,d:1+a.d*.01,draw:()=>{
      // Stockier than the goblin: thick thighs and calves.
      paint(ctx,taperPts(h,k,6.6,5.4),{fill:C.skin,w:1.6,depth:1.6,speck:.8,speckScale:.3});
      paint(ctx,taperPts(k,a,5.2,4.3),{fill:C.skin,w:1.6,depth:1.3,speck:.7,speckScale:.3});
      oval(ctx,k,5.2,4.6,C.skin,{w:1});
      const f=(da,db,z=2.2)=>footProj(rf.dir,ft[0]+da,ft[1]+db,ft[2]+z);
      paint(ctx,capsulePts(f(-3,0),f(7,0),5.2),{fill:C.skin,w:1.8,depth:1.4,speck:.7,speckScale:.3});
      for(const b of [-3.5,0,3.5]) {
        const p=f(8,b),q=f(11,b,1.4),dx=q.x-p.x,dy=q.y-p.y,L=Math.hypot(dx,dy)||1;
        shape(ctx,[[p.x-dy/L*1.2,p.y+dx/L*1.2],[q.x,q.y],
          [p.x+dy/L*1.2,p.y-dx/L*1.2]],C.bone,{w:.65,depth:.3,speck:0});
      }
    }});
  }
  return out;
}

const waistSurface=(rf,P)=>-4-P.body[0]*.5+5;
function torso(ctx,rf,P) {
  const U=rf.U,waist=waistSurface(rf,P);
  const Q=pts=>pts.map(([b,z])=>{
    const u=Math.max(0,Math.min(1,(z-27)/16));
    return xy(U(waist+(7-waist)*u,b,z));
  });
  // Broad grey chest and shoulders, then a torn leather vest with a jagged hem.
  shape(ctx,Q([[-15,44],[-18,37],[-12,27],[-16,21],[0,17],[16,21],[12,28],[17,39],[11,45]]),C.skin,{w:1.8});
  shape(ctx,Q([[-12,46],[-16,40],[-12,33],[-15,26],[-11,22],[-8,25],[-5,20],[-1,24],[3,19],[6,24],[10,20],[12,25],
    [15,27],[12,35],[16,42],[10,45],[5,38],[0,35],[-5,39]]),C.leather,{w:1.6});
  shape(ctx,Q([[-13,45],[-9,46],[14,28],[11,25]]),C.dark,{w:1});
  cLine(ctx,Q([[-8,40],[-10,30]]),.55);cLine(ctx,Q([[8,40],[11,31]]),.55);
}

function loincloth(ctx,rf,P,central=false) {
  const waist=waistSurface(rf,P);
  const Q=pts=>pts.map(([b,z])=>xy(rf.U(waist+(central?(28-z)*.18:0),b,z)));
  if(central) {
    shape(ctx,Q([[-8,28],[8,28],[7,18],[4,13],[2,16],[0,10],[-2,15],[-5,11],[-8,18]]),C.cloth,{w:1.5});
    cLine(ctx,Q([[-3,25],[-4,19],[-3,16]]),.65);
  } else {
    for(const side of [-1,1])shape(ctx,Q([[side*6,28],[side*14,28],[side*20,17],
      [side*15,19],[side*16,12],[side*10,16],[side*7,21]]),C.cloth,{w:1.5});
  }
}

function belt(ctx,rf,P) {
  const U=rf.U,a=waistSurface(rf,P)+.7;
  const Q=pts=>pts.map(([b,z])=>xy(U(a,b,z)));
  shape(ctx,Q([[-15,30],[15,30],[15,25],[-15,25]]),C.dark,{w:1.2,depth:1});
  const p=U(a+.5,0,27.5);shape(ctx,[[p.x-3.6,p.y-3],[p.x+3.6,p.y-3],[p.x+3.6,p.y+3],[p.x-3.6,p.y+3]],C.gold,{w:.9,depth:0});
  shape(ctx,[[p.x-2,p.y-1.4],[p.x+2,p.y-1.4],[p.x+2,p.y+1.4],[p.x-2,p.y+1.4]],C.dark,{w:.4,depth:0});
}

function head(ctx,rf,P) {
  const h=rf.U(9,0,63);
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx,1);
  // Big pointed ears with a dusky inner ear.
  for(const side of [-1,1]) {
    const near=side===-1?1:.83,tip=P.ear;
    shape(ctx,[[side*17,-10],[side*(42*near),-24+tip],[side*34*near,-9],[side*26,2],[side*19,6],[side*15,0]],C.skin,{w:1.7});
    shape(ctx,[[side*19,-7],[side*34*near,-18+tip],[side*27,-5],[side*20,0]],C.ear,{w:.8,depth:.6});
  }
  // Big round head with three blunt horn bumps on top.
  for(const [x,y,s] of [[-8,-26,1],[5,-29,1.1],[17,-22,.9]])
    shape(ctx,[[x-4*s,y+4],[x,y-4*s],[x+4*s,y+4]],C.skin,{w:1.3,depth:.8});
  shape(ctx,[[-23,-6],[-22,-16],[-15,-24],[-4,-28],[9,-27],[19,-21],[25,-11],
    [25,3],[21,16],[12,22],[-2,22],[-15,19],[-23,9]],C.skin,{w:2,depth:2.2,round:7});
  // Heavy, angry brows over large dark eyes; a blunt nose; fangs pointing up from the lower jaw.
  oval(ctx,{x:-3,y:1},3.2,5.4,C.ink,{w:.6,depth:0,speck:0});
  oval(ctx,{x:14,y:2},2.8,5,C.ink,{w:.6,depth:0,speck:0});
  shape(ctx,[[-11,-8],[-4,-6],[3,-2],[4,-7],[-4,-10]],C.shade,{w:0,depth:0,speck:0});
  cLine(ctx,[[-11,-8],[-4,-5],[3,-2]],1.4);
  cLine(ctx,[[10,-2],[14,-3],[20,-8]],1.3);
  oval(ctx,{x:9,y:9},4,2.5,C.skin,{w:.8,depth:.7,speck:0});
  cLine(ctx,[[7,9],[8,8.6]],.65);cLine(ctx,[[11,9],[12,9.5]],.65);
  cLine(ctx,[[-9,15],[-4,13.5],[6,14],[15,16]],1);
  shape(ctx,[[-6,14.5],[-4,8.5],[-2,14]],C.bone,{w:.8,depth:.2,speck:0});
  shape(ctx,[[11,15.5],[13.5,9.5],[15.5,16.5]],C.bone,{w:.8,depth:.2,speck:0});
  for(const [x,y] of [[-15,4],[-12,10],[18,-14],[-8,-18]]) cLine(ctx,[[x,y],[x+1.5,y+.6]],.45);
  ctx.restore();
}

function arm(ctx,rf,j,part,near) {
  const s=rf.U(...j.S),e=rf.U(...j.E),h=rf.U(...j.H);
  if(part==='upper') {
    paint(ctx,taperPts(s,e,6.2,4.8),{fill:C.skin,w:1.6,depth:1.4,speck:.75,speckScale:.3});
    if(near) embers(ctx,between(s,e,.3),[[-1,-2,1.4],[2,1,1],[0,3,.8],[-3,1,.7]]);
  } else {
    paint(ctx,taperPts(e,h,5,4),{fill:C.skin,w:1.5,depth:1.3,speck:.7,speckScale:.3});
    bandage(ctx,between(e,h,.45),between(e,h,.9),5);
  }
}

function club(ctx,rf,P) {
  const hand=rf.U(...P.club),end=rf.U(...P.club.map((v,i)=>v+P.axis[i]*40));
  const dx=end.x-hand.x,dy=end.y-hand.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
  const q=(s,w)=>[hand.x+ux*s-uy*w,hand.y+uy*s+ux*w];
  const len=L;
  shape(ctx,[q(-11,-3),q(5,-2.6),q(len-12,-7.5),q(len-2,-8),q(len+2,-4),
    q(len+3,0),q(len+2,4.5),q(len-3,7.5),q(len-14,6.5),q(4,2.6),q(-11,3.2)],C.wood,{w:1.9,depth:1.8});
  cLine(ctx,[q(5,-.4),q(len-14,-2.5),q(len-5,-3.5)],.7);
  cLine(ctx,[q(8,1),q(len-13,2.5),q(len-4,3.5)],.65);
  for(const s of [-8,-4,0,4])cLine(ctx,[q(s,-2.4),q(s+1,2.4)],.6);
  // Round dark iron studs, each with a small highlight.
  for(const [a,b,r] of [[len-4,0,2.8],[len-15,1,2.3],[len-8,-6.5,2.2],[len-14,6,2.1],[len-2,5.5,1.8]]) {
    const p=q(a,b);paint(ctx,ellipsePts(p[0],p[1],r,r,14),{fill:C.iron,w:.9,depth:.8,speck:.2});
    paint(ctx,ellipsePts(p[0]-r*.35,p[1]-r*.35,r*.35,r*.35,8),{fill:'#9c9a94',w:0,depth:0,speck:0});
  }
}

export function drawBrute(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=brutePose(action,t),rf=rigFrame(direction,P.body),U=rf.U;
  // The chest faces the camera, but the club keeps the travel direction (SIDE_VIEW_GUIDE.md 2.3).
  P.axis=travelDir(rf,P.axis);
  const parts=legs(ctx,rf,P);
  parts.push({id:'torso',d:0,draw:()=>torso(ctx,rf,P)});
  parts.push({id:'sideCloth',d:.5,draw:()=>loincloth(ctx,rf,P)});
  parts.push({id:'frontCloth',d:2.5,draw:()=>loincloth(ctx,rf,P,true)});
  parts.push({id:'belt',d:3,draw:()=>belt(ctx,rf,P)});
  parts.push({id:'neck',d:5,draw:()=>paint(ctx,taperPts(U(4,0,40),U(8,0,51),8,8.5),
    {fill:C.skin,w:1.2,depth:1,speck:.4,speckScale:.3})});
  parts.push({id:'head',d:100,draw:()=>head(ctx,rf,P)});
  for(const side of [1,-1]) {
    const S=[3,side*14,43],H=side===1?P.club:P.free;
    const E=ik2(S,H,13,14,side===1?[-3,5,-12]:[0,-12,-8]);
    const j={S,E,H},near=rf.vt*side>0,d=near?30:-30;
    parts.push({id:'upper'+side,d,draw:()=>arm(ctx,rf,j,'upper',near)});
    parts.push({id:'fore'+side,d:d+1,draw:()=>arm(ctx,rf,j,'fore',near)});
    const heldDepth=side===1?(near?110:-20):d+2;
    if(side===1)parts.push({id:'club',d:heldDepth,draw:()=>club(ctx,rf,P)});
    parts.push({id:'hand'+side,d:heldDepth+1,draw:()=>{
      const h=U(...H),e=U(...E);mittenHand(ctx,h,h.x-e.x,h.y-e.y,side===1?4.4:5,C.skin,{thumbSide:side*rf.sx});
    }});
  }
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),false,
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-ash-brute',boil:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-ash-brute',label:'Ash Brute — EMBERBOUND',kind:'humanoid',directional:true,draw:drawBrute,
  actions:{idle:{period:IDLE_T,frames:16},
    attack:{period:BRUTE_ATTACK_T,keys:[0,.1,.2,.3,.36,.43,.5,.58,.66,.8],once:true},
    cast:{period:BRUTE_WINDUP_T,frames:6},
    hurt:hurtAction},
  frameBox:{x0:-95,x1:95,y0:-125,y1:30},equipment:{leftHand:'club',rightHand:'free'},
  emberbound:{gameId:'ash_brute',heightPx:24,facing:'L'},
});
export const studio=Object.freeze({order:8,name:"Ash Brute（灰の荒くれ）",category:"EMBERBOUND 第1エリア",
  description:"灰色の肌のずんぐりした人型。頭の突起、大きな耳、牙、破れた革の上着、鋲付きの棍棒。溜め攻撃 Heavy Swing を使う。",
  preview:{direction:'L',phase:0}});
