/**
 * EMBERBOUND EXPEDITION — Tideling (game id `tideling`), built on the goblin's crouched rig (by way of the Ash
 * Brute) after the user's reference image: pale aqua skin with light spots, a big round fish head with large
 * dark eyes and a small frown, coral fins (a spiky crest on the head, cheek fins, elbow and ankle fins),
 * webbed feet, a rope belt with a torn loincloth and a spear with a knapped stone head lashed on with rope.
 * Actions follow the game (plan/EMBERBOUND_PRODUCTION.md): a short spear jab (impact at 0.15 s) and the
 * shared hurt. Enemies do not walk in the game. +b = anatomical left (spear).
 */
import {
  TAU, TH, TW, KX, KY, rigFrame, renderRig, footProj,
  bodyToWorld, ik2, keyframes, nrm3, travelDir, paint, paintA, ellipsePts, taperPts,
  capsulePts, mittenHand, cLine, PAL,
} from '../../src/authoring.js';
import { hurtAction, phase, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';

const C={skin:'#a3d6d2',shade:'#7fb6b5',spot:'#c4e6e1',belly:'#e4efdc',fin:'#e98c6f',finDark:'#c96a52',
  rope:'#b88f5a',cloth:'#5f7158',clothDark:'#4a5944',wood:'#7a5233',stone:'#8a8580',stoneDark:'#5f5b57',ink:PAL.ink};
const IDLE_T=2.4;
export const TIDELING_ATTACK_T=.3;   // jab: the spear point lands at u = .5 (0.15 s)
const SHAFT_BACK=24,SHAFT_FWD=44,TIP=14;   // spear along its axis from the hand (local px)
const xy=p=>[p.x,p.y];
const shape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:1.5,depth:1.6,
  light:.16,speck:.7,speckScale:.3,amp:.25,...o});
const oval=(ctx,p,rx,ry,fill,o={})=>paint(ctx,ellipsePts(p.x,p.y,rx,ry,26),
  {fill,w:1.2,depth:1,speck:.5,speckScale:.3,amp:.2,...o});
const between=(a,b,u)=>({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u});
// Spear hand [a, b, z] and spear axis: held at the side, point raised forward.
const REST=[10,27,25,...nrm3([.93,.04,.36])];
// Jab: pull back, thrust level at the target (u .5), hold, recover.
const JAB=[
  [0,REST],[.25,[-2,25,35,...nrm3([.97,-.05,.2])]],
  [.5,[21,26,37,...nrm3([1,-.03,.04])]],
  [.68,[19,26,37,...nrm3([1,-.03,.06])]],
  [.88,[12,27,32,...nrm3([.85,0,.5])]],[1,REST],
];

export function tidelingPose(action,t) {
  const P={body:[0,0,0],footL:[0,10,0],footR:[0,-10,0],
    spear:REST.slice(0,3),axis:REST.slice(3),free:[6,-22,22],fin:0,blink:false};
  if(action==='attack') {
    const u=phase(t,TIDELING_ATTACK_T),a=keyframes(JAB,u);
    P.spear=a.slice(0,3);P.axis=nrm3(a.slice(3));
    const b=keyframes([[0,[0,0,0]],[.25,[-1.5,.5,-.6]],[.5,[3,-.6,.8]],[.68,[2.6,-.5,.8]],[1,[0,0,0]]],u);
    P.body=[b[0],0,b[1]];P.fin=b[2];
    P.free=keyframes([[0,P.free],[.25,[4,-24,23]],[.5,[9,-22,21]],[1,P.free]],u);
  } else if(action==='hurt') {
    const k=hurtAmount(t);
    P.body=[-2.5*k,0,-1.2*k];P.spear=[REST[0]-2*k,REST[1],REST[2]+3*k];P.free=[6-2*k,-22,22+4*k];P.fin=2*k;P.blink=k>.5;
  } else {
    const s=Math.sin(TAU*phase(t,IDLE_T));P.body[2]=s*.5;P.fin=s*.8;
  }
  return P;
}

/** A coral fin: a fan from the base along `pts`, with ray lines from the first point. */
function fin(ctx,pts,o={}) {
  shape(ctx,pts,C.fin,{w:1.2,depth:1,speck:.3,...o});
  const [x0,y0]=pts[0];
  for(let i=2;i<pts.length-1;i++)cLine(ctx,[[x0,y0],[x0+(pts[i][0]-x0)*.8,y0+(pts[i][1]-y0)*.8]],.45);
}

function legs(ctx,rf,P) {
  const out=[];
  for(const side of [1,-1]) {
    const ft=side===1?P.footL:P.footR,world=bodyToWorld(rf.dir,ft[0],ft[1]);
    const ankleZ=ft[2]+4-(world.X+world.Y)*((TH/TW)*KX-KY);
    const hip=[-4+P.body[0]*.5,side*7,23+P.body[2]*.5],ank=[ft[0],ft[1],ankleZ];
    const knee=ik2(hip,ank,14,15,[8,side*5,0]);
    const h=rf.W(...hip),k=rf.W(...knee),a=rf.W(...ank);
    out.push({id:'leg'+side,d:1+a.d*.01,draw:()=>{
      // Slim legs with a small coral fin behind the ankle, then a webbed foot.
      paint(ctx,taperPts(h,k,4.6,3.8),{fill:C.skin,w:1.5,depth:1.4,speck:.7,speckScale:.3});
      paint(ctx,taperPts(k,a,3.7,3.1),{fill:C.skin,w:1.5,depth:1.2,speck:.6,speckScale:.3});
      const f=(da,db,z=2.2)=>footProj(rf.dir,ft[0]+da,ft[1]+db,ft[2]+z);
      const back=f(-4,0,6),dir=rf.sx;
      shape(ctx,[[back.x,back.y-3],[back.x-dir*8,back.y-1],[back.x-dir*6,back.y+3],[back.x,back.y+3]],C.fin,{w:.9,depth:.4,speck:0});
      // Webbing between three long toes.
      const toes=[-3.5,0,3.5].map(b=>xy(f(12,b,1.2)));
      shape(ctx,[xy(f(4,-3.4,1.8)),...toes,xy(f(4,3.4,1.8))],C.fin,{w:1,depth:.5,speck:.2});
      paint(ctx,capsulePts(f(-3,0),f(5,0),3.8),{fill:C.skin,w:1.5,depth:1.2,speck:.6,speckScale:.3});
      for(const b of [-3.5,0,3.5])paint(ctx,taperPts(f(4,b*.6),f(12,b,1.2),1.5,1),{fill:C.skin,w:.9,depth:.4,speck:0});
    }});
  }
  return out;
}

const waistSurface=(rf,P)=>-4-P.body[0]*.5+4;
function torso(ctx,rf,P) {
  const U=rf.U,waist=waistSurface(rf,P);
  const Q=pts=>pts.map(([b,z])=>{
    const u=Math.max(0,Math.min(1,(z-27)/16));
    return xy(U(waist+(6-waist)*u,b,z));
  });
  // A slim body with a pale belly.
  shape(ctx,Q([[-11,44],[-13,37],[-10,27],[-12,21],[0,18],[12,21],[10,28],[13,38],[9,45]]),C.skin,{w:1.7});
  shape(ctx,Q([[-6,40],[-7,31],[-5,24],[6,24],[7,31],[5,40]]),C.belly,{w:0,depth:.6,speck:.3});
  cLine(ctx,Q([[-4,36],[4,36]]),.45);cLine(ctx,Q([[-4,31],[4,31]]),.45);
}

function loincloth(ctx,rf,P,central=false) {
  const waist=waistSurface(rf,P);
  const Q=pts=>pts.map(([b,z])=>xy(rf.U(waist+(central?(28-z)*.18:0),b,z)));
  if(central) {
    shape(ctx,Q([[-8,27],[8,27],[8,18],[5,12],[3,16],[0,9],[-2,14],[-5,10],[-8,17]]),C.cloth,{w:1.4});
    cLine(ctx,Q([[-3,24],[-4,18],[-3,14]]),.6);
  } else {
    for(const side of [-1,1])shape(ctx,Q([[side*5,27],[side*12,27],[side*16,16],
      [side*12,18],[side*12,12],[side*8,16],[side*6,21]]),C.clothDark,{w:1.4});
  }
}

function belt(ctx,rf,P) {
  const U=rf.U,a=waistSurface(rf,P)+.7;
  const Q=pts=>pts.map(([b,z])=>xy(U(a,b,z)));
  // Twisted rope with a knot and a hanging end.
  shape(ctx,Q([[-12,29],[12,29],[12,25.5],[-12,25.5]]),C.rope,{w:1.1,depth:.8});
  for(const b of [-9,-5,-1,3,7,11])cLine(ctx,Q([[b,29],[b+2,25.5]]),.5);
  const p=U(a+.6,4,27);oval(ctx,p,3,2.6,C.rope,{w:1,depth:.5,speck:.2});
  cLine(ctx,[[p.x,p.y+2],[p.x+1,p.y+7],[p.x,p.y+10]],1.6);
}

function head(ctx,rf,P) {
  const h=rf.U(7,0,62);
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx,1);
  // Spiky coral crest running over the back of the head.
  const f=P.fin;
  fin(ctx,[[-8,-22],[-2,-30],[-8,-42+f],[-16,-39+f],[-22,-36+f],[-28,-28+f],[-33,-20+f],[-34,-10],[-26,-8]]);
  // Back cheek fin, behind the head.
  fin(ctx,[[-20,8],[-34,0+f],[-40,8+f],[-37,16+f],[-30,20],[-20,14]]);
  // Big round fish head with pale spots and a cream chin.
  shape(ctx,[[-26,-2],[-24,-18],[-14,-28],[0,-31],[14,-27],[24,-16],[28,-2],[26,12],[18,20],[4,23],[-10,21],[-22,12]],C.skin,{w:2,depth:2.2,round:7});
  shape(ctx,[[0,9],[14,6],[26,4],[24,14],[14,21],[2,22],[-6,16]],C.belly,{w:0,depth:.6,speck:.3});
  for(const [x,y,r] of [[-12,-18,4],[-4,-24,2.6],[-18,-6,2.4],[6,-20,2],[-14,4,1.8]])oval(ctx,{x,y},r,r*.8,C.spot,{w:0,depth:0,speck:0});
  // Large dark eyes with a glint, a small frown.
  for(const [x,rx,ry] of [[4,3.4,6],[19,3,5.4]]) {
    if(P.blink){cLine(ctx,[[x-3,0],[x+3,0]],1.2);continue;}
    oval(ctx,{x,y:-1},rx,ry,C.ink,{w:.6,depth:0,speck:0});
    oval(ctx,{x:x-1,y:-3.5},1,1.3,'#ffffff',{w:0,depth:0,speck:0});
  }
  cLine(ctx,[[10,14],[14,12],[18,14]],1);
  // Near cheek fin over the gill.
  fin(ctx,[[-6,10],[-16,6+f],[-20,13+f],[-16,19+f],[-8,18]]);
  cLine(ctx,[[-2,4],[-4,10],[-2,16]],.6);
  ctx.restore();
}

function arm(ctx,rf,j,part,near) {
  const s=rf.U(...j.S),e=rf.U(...j.E),h=rf.U(...j.H);
  if(part==='upper') {
    paint(ctx,taperPts(s,e,4.4,3.6),{fill:C.skin,w:1.5,depth:1.3,speck:.7,speckScale:.3});
  } else {
    paint(ctx,taperPts(e,h,3.7,3.1),{fill:C.skin,w:1.4,depth:1.2,speck:.6,speckScale:.3});
    // A small fin trailing from the elbow.
    const dx=e.x-h.x,dy=e.y-h.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L;
    shape(ctx,[[e.x-uy*2,e.y+ux*2],[e.x+ux*7-uy*3,e.y+uy*7+ux*3],[e.x+ux*3+uy*3,e.y+uy*3-ux*3]],C.fin,{w:.9,depth:.4,speck:0});
  }
}

function spear(ctx,rf,P) {
  const hand=rf.U(...P.spear),end=rf.U(...P.spear.map((v,i)=>v+P.axis[i]*SHAFT_FWD));
  const dx=end.x-hand.x,dy=end.y-hand.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,k=L/SHAFT_FWD;
  const q=(s,w)=>[hand.x+ux*s*k-uy*w,hand.y+uy*s*k+ux*w];
  shape(ctx,[q(-SHAFT_BACK,-1.6),q(SHAFT_FWD,-1.6),q(SHAFT_FWD,1.6),q(-SHAFT_BACK,1.6)],C.wood,{w:1.3,depth:.8,speck:.3});
  // Knapped stone head, lashed with rope.
  const b=SHAFT_FWD-3;
  shape(ctx,[q(b,-4.5),q(b+TIP*.55,-3.8),q(b+TIP+3,0),q(b+TIP*.55,3.8),q(b,4.5),q(b-2,0)],C.stone,{w:1.3,depth:1,speck:.4});
  cLine(ctx,[q(b+1,-2),q(b+TIP*.6,0),q(b+1,2.2)],.5);
  cLine(ctx,[q(b+TIP*.3,-3.2),q(b+TIP*.75,1)],.45);
  for(const s of [b-6,b-4,b-2])cLine(ctx,[q(s,-2.4),q(s+1.2,2.4)],1.1);
}

export function drawTideling(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=tidelingPose(action,t),rf=rigFrame(direction,P.body),U=rf.U;
  // The chest faces the camera, but the spear keeps the travel direction (SIDE_VIEW_GUIDE.md 2.3).
  P.axis=travelDir(rf,P.axis);
  const parts=legs(ctx,rf,P);
  parts.push({id:'torso',d:0,draw:()=>torso(ctx,rf,P)});
  parts.push({id:'sideCloth',d:.5,draw:()=>loincloth(ctx,rf,P)});
  parts.push({id:'frontCloth',d:2.5,draw:()=>loincloth(ctx,rf,P,true)});
  parts.push({id:'belt',d:3,draw:()=>belt(ctx,rf,P)});
  parts.push({id:'neck',d:5,draw:()=>paint(ctx,taperPts(U(4,0,40),U(7,0,50),6,7),
    {fill:C.skin,w:1.2,depth:1,speck:.4,speckScale:.3})});
  parts.push({id:'head',d:100,draw:()=>head(ctx,rf,P)});
  for(const side of [1,-1]) {
    const S=[3,side*11,43],H=side===1?P.spear:P.free;
    const E=ik2(S,H,13,14,side===1?[-3,5,-12]:[0,-12,-8]);
    const j={S,E,H},near=rf.vt*side>0,d=near?30:-30;
    parts.push({id:'upper'+side,d,draw:()=>arm(ctx,rf,j,'upper',near)});
    parts.push({id:'fore'+side,d:d+1,draw:()=>arm(ctx,rf,j,'fore',near)});
    const heldDepth=side===1?(near?110:-20):d+2;
    if(side===1)parts.push({id:'spear',d:heldDepth,draw:()=>spear(ctx,rf,P)});
    parts.push({id:'hand'+side,d:heldDepth+1,draw:()=>{
      const h=U(...H),e=U(...E);mittenHand(ctx,h,h.x-e.x,h.y-e.y,3.8,C.skin,{thumbSide:side*rf.sx});
    }});
  }
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),false,
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-tideling',boil:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-tideling',label:'Tideling — EMBERBOUND',kind:'humanoid',directional:true,draw:drawTideling,
  actions:{idle:{period:IDLE_T,frames:12},
    attack:{period:TIDELING_ATTACK_T,keys:[0,.12,.25,.38,.5,.6,.68,.8,.9],once:true},
    hurt:hurtAction},
  frameBox:{x0:-110,x1:110,y0:-130,y1:30},equipment:{leftHand:'spear',rightHand:'free'},
  emberbound:{gameId:'tideling',heightPx:15,facing:'L'},
});
export const studio=Object.freeze({order:13,name:"Tideling（潮の子）",category:"EMBERBOUND 第2エリア",
  description:"水色の小さな魚人。丸い魚の頭、珊瑚色のひれ、石の穂先の槍。群れで現れる。",
  preview:{direction:'L',phase:0}});
