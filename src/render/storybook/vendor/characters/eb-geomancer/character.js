/**
 * EMBERBOUND EXPEDITION — Geomancer (game id `geomancer`), the dark mage's hooded body after the user's reference
 * image: a tall purple hood with a floppy tip and a pale notched trim, a shadowed face with glowing cyan eyes,
 * a wrapped purple cowl with a cyan diamond brooch, a purple robe with pale trim and teal accents, a leather belt
 * with a ring buckle, wide trimmed sleeves studded with small crystals, brown boots, and a twisted wooden staff
 * crowned with a big cyan crystal and smaller lilac ones. Brighter purples and cyan than the Gloom Caster.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle, attack (a spell cast with the staff: raised back, swung forward
 * at 0.135 s as light bursts from the crystal), `cast` = Crystal Ward, the shield spell the game loops while she
 * channels (staff raised, crystal glowing, shards circling), and the shared hurt.
 * Anatomical +b is left (staff); −b is the open casting hand.
 */
import {
  TAU, LW, LAYER, DRAW, PAL, rigFrame, renderRig,
  ik2, keyframes, nrm3, travelDir, bodyLayerKey, legParts2, mittenHand,
  paint, paintA, ellipsePts, taperPts, cLine, strokePath,
} from '../../src/authoring.js';
import { hurtAction, phase, sample, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';
import { crystal, CRYSTAL } from '../shared/emberbound/creature.js';

const C={cloth:'#7a5f9c',dark:'#584377',light:'#9d84bc',trim:'#d9cdb3',teal:'#8fd3cc',
  void:'#141118',eye:'#8ff2ea',glove:'#4a3d55',leather:'#7a5638',gold:'#c8a45c',
  wood:'#7d6048',woodLight:'#a78a68',boot:'#7a5534'};
const IDLE_T=3.8,STAFF_REST=[1,33,39],HAND_REST=[6,-18,25];
export const GEO_ATTACK_T=.3;   // the staff swings through at u = .45 (0.135 s)
export const GEO_WARD_T=.6;     // Crystal Ward: a loop
const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const shape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:LW.part,depth:1.8,
  light:.2,speck:.65,speckScale:.3,amp:.22,...o});
const oval=(ctx,x,y,rx,ry,fill,o={})=>paint(ctx,ellipsePts(x,y,rx,ry,24),
  {fill,w:1,depth:1,speck:.3,speckScale:.3,amp:.15,...o});

export function geoPose(action,t) {
  const P={body:[0,0,0],footL:[0,6,0],footR:[0,-6,0],staff:STAFF_REST.slice(),
    hand:HAND_REST.slice(),pitch:.04,travel:0,sway:0,glow:0,spell:-1,ward:-1};
  if(action==='attack') {
    // A spell with the staff: raise it back, swing the crystal forward at u .45 as the spell bursts from it,
    // hold, recover; the free hand lifts open for the incantation.
    const u=phase(t,GEO_ATTACK_T);
    P.staff=keyframes([[0,STAFF_REST],[.25,[-2,31,46]],[.45,[17,28,34]],[.7,[16,28,34]],[1,STAFF_REST]],u);
    P.pitch=sample([[0,[.04]],[.25,[-.35]],[.45,[2.4]],[.7,[2.2]],[1,[.04]]],u);
    P.travel=sample([[0,[0]],[.3,[0]],[.45,[1]],[.75,[1]],[.9,[0]],[1,[0]]],u);
    const k=sample([[0,[0]],[.2,[1]],[.75,[1]],[1,[0]]],u);
    P.hand=[HAND_REST[0]+8*k,HAND_REST[1]+2*k,HAND_REST[2]+12*k];
    P.body[0]=sample([[0,[0]],[.25,[-1]],[.45,[2]],[.7,[1.6]],[1,[0]]],u);P.sway=P.body[0]*.3;
    P.glow=sample([[0,[.2]],[.25,[.5]],[.45,[1]],[.7,[.6]],[1,[.2]]],u);
    P.spell=u>=.42&&u<.85?(u-.42)/.43:-1;
  } else if(action==='cast') {
    // Crystal Ward: the staff raised and glowing, the free hand open; every term periodic in u.
    const u=phase(t,GEO_WARD_T),w=Math.sin(TAU*u);
    P.staff=[5,29,47+w*.5];P.pitch=.12;P.hand=[16,-16,34+w*.5];P.glow=.7+.3*w;P.ward=u;P.body[2]=.4*w;
  } else if(action==='hurt') {
    const k=hurtAmount(t);
    P.body=[-2.5*k,0,-1.2*k];P.staff=[STAFF_REST[0]-2*k,STAFF_REST[1],STAFF_REST[2]+3*k];P.hand=[HAND_REST[0]-2*k,HAND_REST[1],HAND_REST[2]+4*k];
  } else {
    P.body[2]=Math.sin(t/IDLE_T*TAU)*.4;
    P.sway=Math.sin(t/IDLE_T*TAU-.5)*.25;P.glow=.15+.1*Math.sin(t*2);
  }
  return P;
}

function robe(ctx,rf,P) {
  const c=rf.U(0,0,0),s=P.sway;
  ctx.save();ctx.translate(c.x,c.y);
  shape(ctx,[[-12,-50],[-16,-43],[-14,-33],[-19+s,-18],[-24+s,-10],
    [-14+s,-7],[-6+s,-10],[1+s,-7],[11+s,-10],[22+s,-8],
    [18+s,-23],[14,-35],[16,-44],[11,-50]],C.cloth,{w:LW.outline,depth:2.5});
  // Pale ragged trim along the hem, a teal stripe above it.
  shape(ctx,[[-24+s,-10],[-14+s,-7],[-6+s,-10],[1+s,-7],[11+s,-10],[22+s,-8],[21+s,-13],[10+s,-15],[0+s,-12],[-8+s,-15],[-22+s,-15]],C.trim,{w:1.1,depth:.6,speck:.4});
  cLine(ctx,[[-21+s,-17],[-8+s,-17],[2+s,-14],[20+s,-15]],.1);
  shape(ctx,[[-21+s,-18],[20+s,-17],[19+s,-15.5],[-21+s,-16.5]],C.teal,{w:0,depth:0,speck:0});
  // A front panel with a teal diamond.
  const b=rf.U(10,0,33),bx=b.x-c.x;
  shape(ctx,[[bx-5,-31],[bx+5,-31],[bx+6,-12],[bx,-8],[bx-6,-12]],C.dark,{w:1.2,depth:1});
  shape(ctx,[[bx,-24],[bx+3,-18],[bx,-12],[bx-3,-18]],C.teal,{w:.8,depth:.2,speck:0});
  shape(ctx,[[-14,-35],[14,-35],[14,-31],[-14,-31]],C.leather,{w:1,depth:.6});
  oval(ctx,bx,-33,3.2,3.2,C.gold,{w:.9,depth:.3});oval(ctx,bx,-33,1.7,1.7,C.leather,{w:.5,depth:0});
  ctx.restore();
}

function mantle(ctx,rf) {
  const p=rf.U(0,0,48);
  ctx.save();ctx.translate(p.x,p.y);
  shape(ctx,[[-11,-6],[-19,-2],[-23,6],[-16,10],[-7,8],[0,5],
    [8,9],[17,10],[23,5],[17,-2],[10,-6]],C.dark,{w:1.8,depth:2});
  shape(ctx,[[-12,-5],[-20,0],[-17,4],[-8,5],[0,1],[9,5],
    [18,4],[21,0],[11,-5],[0,-2]],C.cloth,{w:1.2,depth:1.3});
  shape(ctx,[[-20,1],[-17,5],[-8,6],[0,2],[9,6],[18,5],[21,1],[18,3],[9,3],[0,-.5],[-8,3],[-17,3]],C.trim,{w:.8,depth:.3,speck:.3});
  ctx.restore();
}

function hood(ctx,rf,P) {
  const h=rf.U(1.5,0,71);
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx,1);
  // The tall tip flops backward behind the crown.
  shape(ctx,[[-8,-27],[-12,-38],[-20,-45],[-31,-45],[-41+P.sway,-38],[-36+P.sway,-35],[-28,-37],[-22,-33],[-22,-22]],C.cloth,{w:LW.outline,depth:2});
  cLine(ctx,[[-14,-34],[-22,-40],[-32,-40]],.6);
  shape(ctx,[[-23,14],[-25,0],[-22,-16],[-12,-27],[2,-29],[14,-23],[21,-10],[23,6],[24,16],[12,22],[-2,23],[-14,20]],C.cloth,{w:LW.outline,depth:2.7});
  // Pale notched trim around the face opening, then the shadow and the glowing eyes.
  shape(ctx,[[9,-20],[13,-22],[14,-17],[19,-13],[22,-6],[20,-2],[23,4],[22,14],[16,20],[3,21],[-12,16],[-9,12],[-14,6],[-6,0],[-6,-7],[1,-12],[3,-18]],C.trim,{w:1.1,depth:.8,speck:.5});
  shape(ctx,[[11,-14],[17,-8],[19,11],[11,16],[-1,16],[-10,10],[-4,0],[3,-8]],C.void,{w:1,depth:0,light:0,speck:0,amp:.12});
  for(const [x,y] of [[2,3],[12,1.5]]) {
    ctx.save();ctx.globalAlpha=.2;
    oval(ctx,x,y,3.4,4.4,C.eye,{w:0,depth:0,speck:0});ctx.restore();
    oval(ctx,x,y,1.8,2.9,C.eye,{w:0,depth:0,speck:0,amp:.05});
  }
  cLine(ctx,[[-20,9],[-14,-6],[-4,-18],[6,-24]],.7);
  // Wrapped cowl under the chin, pinned with a cyan diamond.
  shape(ctx,[[-20,12],[-8,18],[6,19],[20,15],[22,22],[10,28],[-6,27],[-18,22]],C.dark,{w:1.4,depth:1.4});
  cLine(ctx,[[-14,20],[-2,23],[12,22]],.6);
  shape(ctx,[[10,18],[14,23],[10,28],[6,23]],C.teal,{w:1,depth:.3,speck:0});
  shape(ctx,[[10,19.5],[12,23],[10,24.5],[8,23]],'#e6fbf8',{w:0,depth:0,speck:0});
  ctx.restore();
}

function sleeve(ctx,rf,S,E,H) {
  const s=rf.U(...S),e=rf.U(...E),h=rf.U(...H);
  paint(ctx,taperPts(s,e,6,5),{fill:C.cloth,w:LW.part,depth:2,speck:.6,speckScale:.3});
  const dx=h.x-e.x,dy=h.y-e.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  const q=(along,across)=>({x:h.x+dx/len*along+nx*across,y:h.y+dy/len*along+ny*across});
  // A wide bell sleeve with a pale cuff and two small crystals on it.
  paint(ctx,[{x:e.x+nx*5,y:e.y+ny*5},q(-2,8),q(-2,-7),{x:e.x-nx*5,y:e.y-ny*5}],{fill:C.cloth,w:LW.part,depth:2,speck:.6,speckScale:.3});
  paint(ctx,[q(-6,8.5),q(-2,8),q(-2,-7),q(-6,-7.5)],{fill:C.trim,w:.9,depth:.5,speck:.3});
  for(const [a,b,l] of [[-5,6,6],[-4,-5,5]]){const p=q(a,b);crystal(ctx,1,p.x,p.y,Math.atan2(ny,nx)*(b>0?1:-1)-Math.PI/2+(b>0?-.6:.6),l,3.4,CRYSTAL.lilac,{w:.8});}
  const a=q(-9,1);cLine(ctx,[[e.x,e.y],[a.x,a.y]],.65);
}

function staff(ctx,rf,P) {
  const axis=P.staffAxis,at=z=>rf.U(...P.staff.map((v,i)=>v+axis[i]*z));
  // Twisted wood: two strands winding around each other through the grip.
  for(const [ph,col] of [[0,C.wood],[Math.PI,C.woodLight]]) {
    const pts=[];for(let z=-36;z<=30;z+=3){const q=at(z),o=Math.sin(z*.35+ph)*1.6;pts.push({x:q.x+o,y:q.y});}
    strokePath(ctx,pts,4.4*DRAW.lw,false,PAL.ink);strokePath(ctx,pts,2.6,false,col);
  }
  for(const z of [-30,-14,10]){const p=at(z);crystal(ctx,1,p.x,p.y,z<0?-2.6:-.6,5,3,CRYSTAL.lilac,{w:.8});}
  // The crown: wooden claws holding a big cyan crystal, smaller lilac ones around it.
  const base=at(30),tip=at(54),ang=Math.atan2(tip.y-base.y,tip.x-base.x);
  for(const d of [-.7,.8])crystal(ctx,1,base.x,base.y,ang+d,12,6,CRYSTAL.lilac,{w:1,glow:P.glow*.5});
  crystal(ctx,1,base.x,base.y,ang,24,11,CRYSTAL.blue,{w:1.3,glow:P.glow});
  for(const d of [-1,1]){const c1=at(31),c2=at(37);const o=d*5;
    strokePath(ctx,[{x:c1.x,y:c1.y},{x:c2.x+o,y:c2.y}],3.6*DRAW.lw,false,PAL.ink);strokePath(ctx,[{x:c1.x,y:c1.y},{x:c2.x+o,y:c2.y}],2,false,C.wood);}
  if(P.glow>.2) {
    const p=at(42);ctx.save();ctx.globalAlpha=(P.glow-.2)*.3;
    oval(ctx,p.x,p.y,12,14,'#d9fbff',{w:0,depth:0,speck:0});ctx.restore();
  }
}

function magic(ctx,rf,P) {
  if(P.spell>=0) {
    // The spell bursting from the staff's crystal: a ring of light and rays spreading, sparkles drifting off.
    const c=rf.U(...P.staff.map((v,i)=>v+P.staffAxis[i]*50)),u=P.spell,r=6+u*14;
    ctx.save();ctx.globalAlpha=(1-u)*.85;
    oval(ctx,c.x,c.y,r,r,'#d9fbff',{w:.9,depth:0,speck:0});
    for(let i=0;i<8;i++){const a=i/8*TAU+.2,r0=r+2,r1=r+5+(i%2?3:7);
      cLine(ctx,[[c.x+Math.cos(a)*r0,c.y+Math.sin(a)*r0],[c.x+Math.cos(a)*r1,c.y+Math.sin(a)*r1]],.8);}
    for(const [dx,dy,s] of [[10,-12,2],[-12,-8,1.6],[16,6,1.4],[-6,14,1.8]])oval(ctx,c.x+dx*(1+u),c.y+dy*(1+u)-u*6,s,s,C.teal,{w:.6,depth:0,speck:0});
    ctx.restore();
  }
  if(P.ward>=0) {
    // Crystal Ward: three shards circling the body (positions cycle with the loop).
    const c=rf.U(2,0,40);
    for(let i=0;i<3;i++){const a=TAU*(P.ward+i/3),x=c.x+Math.cos(a)*26,y=c.y+Math.sin(a)*8-4;
      ctx.save();ctx.globalAlpha=.55+.45*Math.max(0,Math.sin(a));crystal(ctx,1,x,y+6,-1.57,12,6,CRYSTAL.blue,{w:1,glow:.7});ctx.restore();}
  }
}

export function drawGeomancer(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=geoPose(action,t),rf=rigFrame(direction,P.body);
  P.staffAxis=nrm3([P.pitch,.32*(1-P.travel),1]);
  // While the staff swings, its forward tilt follows the travel direction rather than turning toward the camera.
  if(P.travel)P.staffAxis=travelDir(rf,P.staffAxis,P.travel);
  // Facing left the staff hand is near: the staff passes beside the hood on the camera side.
  const nearStaff=direction==='L';
  const key=p=>bodyLayerKey(rf,...p);
  const parts=legParts2(ctx,rf,P,{pants:C.dark,boot:C.boot,sole:C.leather,footR:4,soleR:3.6});
  parts.push({id:'robe',d:LAYER.torso,draw:()=>robe(ctx,rf,P)});
  parts.push({id:'mantle',d:LAYER.cape,draw:()=>mantle(ctx,rf)});
  parts.push({id:'hood',d:LAYER.head,draw:()=>hood(ctx,rf,P)});
  for(const [side,H] of [[1,P.staff],[-1,P.hand]]) {
    const S=[0,side*13,47],E=ik2(S,H,14,15,[-4,side*3,-12]);
    const d=Math.min(key(mid(S,H)),LAYER.cape-1);
    parts.push({id:'sleeve'+side,d,draw:()=>sleeve(ctx,rf,S,E,H)});
    if(side===1)parts.push({id:'staff',d:nearStaff?LAYER.head+1:key(H)+.01,draw:()=>staff(ctx,rf,P)});
    parts.push({id:'hand'+side,d:nearStaff&&side===1?LAYER.head+2:key(H)+.02,draw:()=>{
      const h=rf.U(...H),e=rf.U(...E);
      mittenHand(ctx,h,h.x-e.x,h.y-e.y,3.4,C.glove,{thumbSide:side*rf.sx});
    }});
  }
  parts.push({id:'magic',d:LAYER.head+5,draw:()=>magic(ctx,rf,P)});
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),false,
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-geomancer',boil:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-geomancer',label:'Geomancer — EMBERBOUND',kind:'humanoid',directional:true,draw:drawGeomancer,
  actions:{idle:{period:IDLE_T,frames:16},
    attack:{period:GEO_ATTACK_T,keys:[0,.1,.25,.35,.45,.55,.7,.85],once:true},
    cast:{period:GEO_WARD_T,frames:8},
    hurt:hurtAction},
  frameBox:{x0:-110,x1:110,y0:-150,y1:25},
  equipment:{leftHand:'staff',rightHand:'free'},
  emberbound:{gameId:'geomancer',heightPx:23,facing:'L'},
});
export const studio=Object.freeze({order:21,name:"Geomancer（結晶術師）",category:"EMBERBOUND 第3エリア",
  description:"紫のフードとローブの術師。影の顔に水色の目、結晶の杖。Crystal Ward で仲間に結晶の盾を張る。",
  preview:{direction:'L',phase:0}});
