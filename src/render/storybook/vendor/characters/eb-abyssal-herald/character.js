/**
 * EMBERBOUND EXPEDITION — Abyssal Herald (game id `abyssal_herald`, elite), the dark mage's hooded body after the
 * user's reference image: a deep dark-purple hood with two long curved black horns rising from it, a pitch-dark face
 * with slanted glowing yellow-green eyes, a wrapped cowl pinned with a round gold brooch set with a green gem,
 * spiked black shoulder plates, a long ragged robe with worn brown edges, a leather belt and a strap across the
 * chest, wide ragged sleeves, dark gloves, brown boots, and a gnarled wooden staff bound with cord and crowned with
 * a glowing yellow-green crystal.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle, attack = Abyssal Rend (the staff raised back and swung down
 * forward at 0.135 s, a dark rending arc and green sparks bursting from the crystal), `cast` = the Shadow Pulse
 * wind-up the game loops (staff raised, crystal blazing, dark rings pulsing out), and the shared hurt.
 * Anatomical +b is left (staff); −b is the open hand.
 */
import {
  TAU, LW, LAYER, DRAW, PAL, rigFrame, renderRig,
  ik2, keyframes, nrm3, travelDir, bodyLayerKey, legParts2, mittenHand,
  paint, paintA, ellipsePts, taperPts, cLine, strokePath,
} from '../../src/authoring.js';
import { hurtAction, phase, sample, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';
import { crystal } from '../shared/emberbound/creature.js';

const C={cloth:'#4f3b5d',dark:'#34263f',light:'#6c5680',trim:'#8d6a58',teal:'#cfe25a',
  void:'#0f0b13',eye:'#e6f56a',glove:'#57525e',leather:'#6f5034',gold:'#bf9c58',
  wood:'#6b4b35',woodLight:'#94704f',boot:'#6e5038',horn:'#3a3036',hornLight:'#5c4f55',spike:'#2c2530'};
const GEM={fill:'#d6ee66',glow:'#f2ffc2'};
const IDLE_T=3.8,STAFF_REST=[1,33,39],HAND_REST=[6,-18,25];
export const HERALD_ATTACK_T=.3;   // Abyssal Rend: the staff swings through at u = .45 (0.135 s)
export const HERALD_PULSE_T=.6;    // Shadow Pulse wind-up: a loop
const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const shape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:LW.part,depth:1.8,
  light:.2,speck:.65,speckScale:.3,amp:.22,...o});
const oval=(ctx,x,y,rx,ry,fill,o={})=>paint(ctx,ellipsePts(x,y,rx,ry,24),
  {fill,w:1,depth:1,speck:.3,speckScale:.3,amp:.15,...o});

export function heraldPose(action,t) {
  const P={body:[0,0,0],footL:[0,6,0],footR:[0,-6,0],staff:STAFF_REST.slice(),
    hand:HAND_REST.slice(),pitch:.04,travel:0,sway:0,glow:0,spell:-1,ward:-1};
  if(action==='attack') {
    // Abyssal Rend: raise the staff back, bring the crystal down forward at u .45 as the dark arc bursts from
    // it, hold, recover; the free hand lifts open.
    const u=phase(t,HERALD_ATTACK_T);
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
    const u=phase(t,HERALD_PULSE_T),w=Math.sin(TAU*u);
    P.staff=[5,29,47+w*.5];P.pitch=.12;P.hand=[16,-16,34+w*.5];P.glow=.7+.3*w;P.ward=u;P.body[2]=.4*w;   // ward = the Shadow Pulse phase
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
  // A long ragged robe trailing behind: a jagged hem with worn brown edges, deep folds.
  const hem=[[-30+s,-6],[-24+s,-11],[-20+s,-3],[-14+s,-9],[-8+s,-2],[-2+s,-8],[4+s,-2],[10+s,-8],[16+s,-3],[21+s,-9],[25+s,-4]];
  shape(ctx,[[-12,-50],[-17,-43],[-16,-33],[-23+s,-18],...hem,[21+s,-22],[15,-35],[16,-44],[11,-50]],C.cloth,{w:LW.outline,depth:2.5});
  shape(ctx,[...hem,[24+s,-10],[12+s,-12],[0+s,-10],[-12+s,-13],[-26+s,-12]],C.trim,{w:0,depth:.4,speck:.8});
  for(const [x0,x1] of [[-11,-18],[2,0],[11,15]])cLine(ctx,[[x0,-30],[x1+s,-10]],.55);
  const b=rf.U(10,0,33),bx=b.x-c.x;
  shape(ctx,[[-15,-35],[15,-35],[15,-31],[-15,-31]],C.leather,{w:1,depth:.6});
  shape(ctx,[[bx-3.6,-36],[bx+3.6,-36],[bx+3.6,-30],[bx-3.6,-30]],C.gold,{w:.9,depth:.3,speck:0});
  shape(ctx,[[bx-2,-35],[bx+2,-35],[bx+2,-31],[bx-2,-31]],C.leather,{w:.5,depth:0,speck:0});
  // The strap across the chest, from the right hip up over the left shoulder.
  shape(ctx,[[bx-6,-35],[bx-3,-35],[bx+6,-50],[bx+3,-50]],C.leather,{w:.9,depth:.4});
  ctx.restore();
}

function mantle(ctx,rf) {
  const p=rf.U(0,0,48);
  ctx.save();ctx.translate(p.x,p.y);
  shape(ctx,[[-11,-6],[-19,-2],[-23,6],[-16,10],[-7,8],[0,5],
    [8,9],[17,10],[23,5],[17,-2],[10,-6]],C.dark,{w:1.8,depth:2});
  shape(ctx,[[-12,-5],[-20,0],[-17,4],[-8,5],[0,1],[9,5],
    [18,4],[21,0],[11,-5],[0,-2]],C.cloth,{w:1.2,depth:1.3});
  // Spiked black shoulder plates on both shoulders.
  for(const d of [-1,1]) {
    shape(ctx,[[d*6,-7],[d*20,-9],[d*28,-2],[d*26,5],[d*12,4],[d*6,0]],C.spike,{w:1.4,depth:1.2,speck:.5});
    for(const [x0,len,a] of [[11,14,-.45],[18,18,-.2],[25,13,.2]]){const bx0=d*x0,ang=-Math.PI/2+d*a;
      shape(ctx,[[bx0-2.2,-5],[bx0+Math.cos(ang)*len,-5+Math.sin(ang)*len],[bx0+2.2,-5]],C.spike,{w:1.1,depth:.4,speck:0,amp:.05});}
  }
  oval(ctx,0,4,3.6,3.6,C.gold,{w:1,depth:.4});oval(ctx,0,4,1.9,1.9,GEM.fill,{w:.5,depth:0,speck:0});
  ctx.restore();
}

function hood(ctx,rf,P) {
  const h=rf.U(1.5,0,71);
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx,1);
  // Two long curved horns rising back from the hood, the far one first, then the hood's floppy tip.
  for(const [ox,k,col] of [[-7,1.3,C.horn],[3,1.45,C.hornLight]]) {
    const H=(px,py)=>[ox+px*k,-22+py*k];
    shape(ctx,[H(-5,4),H(-9,-12),H(-10,-26),H(-17,-38),H(-28,-44),H(-18,-34),H(-4,-24),H(2,-10),H(4,4)],col,{w:1.4,depth:1.2,speck:.5});
  }
  shape(ctx,[[-10,-24],[-18,-30],[-30,-30],[-38+P.sway,-24],[-30,-22],[-22,-18]],C.cloth,{w:LW.outline,depth:2});
  shape(ctx,[[-23,14],[-25,0],[-22,-16],[-12,-27],[2,-29],[14,-23],[21,-10],[23,6],[24,16],[12,22],[-2,23],[-14,20]],C.cloth,{w:LW.outline,depth:2.7});
  // A deep opening: a dark rim, the shadow, slanted glowing eyes.
  shape(ctx,[[8,-21],[16,-16],[22,-6],[24,6],[22,15],[14,20],[1,21],[-11,15],[-6,4],[-4,-8],[2,-17]],C.dark,{w:1.1,depth:.8,speck:.4});
  shape(ctx,[[11,-14],[17,-8],[19,11],[11,16],[-1,16],[-10,10],[-4,0],[3,-8]],C.void,{w:1,depth:0,light:0,speck:0,amp:.12});
  for(const [x,y,d] of [[2,3,1],[12,1.5,-1]]) {
    ctx.save();ctx.globalAlpha=.25;oval(ctx,x,y,4,4,C.eye,{w:0,depth:0,speck:0});ctx.restore();
    shape(ctx,[[x-3,y+1.5*d],[x,y-2],[x+3,y-1.5*d],[x,y+2]],C.eye,{w:0,depth:0,speck:0,amp:.04});
  }
  cLine(ctx,[[-20,9],[-14,-6],[-4,-18],[6,-24]],.7);
  // Wrapped cowl under the chin, pinned with a cyan diamond.
  shape(ctx,[[-20,12],[-8,18],[6,19],[20,15],[22,22],[10,28],[-6,27],[-18,22]],C.dark,{w:1.4,depth:1.4});
  cLine(ctx,[[-14,20],[-2,23],[12,22]],.6);

  ctx.restore();
}

function sleeve(ctx,rf,S,E,H) {
  const s=rf.U(...S),e=rf.U(...E),h=rf.U(...H);
  paint(ctx,taperPts(s,e,6,5),{fill:C.cloth,w:LW.part,depth:2,speck:.6,speckScale:.3});
  const dx=h.x-e.x,dy=h.y-e.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  const q=(along,across)=>({x:h.x+dx/len*along+nx*across,y:h.y+dy/len*along+ny*across});
  // A wide bell sleeve ending in a ragged, worn cuff.
  paint(ctx,[{x:e.x+nx*5,y:e.y+ny*5},q(-2,9),q(1,6),q(-2,3),q(2,0),q(-1,-3),q(2,-6),q(-1,-9),{x:e.x-nx*5,y:e.y-ny*5}],{fill:C.cloth,w:LW.part,depth:2,speck:.6,speckScale:.3});
  paint(ctx,[q(-5,9.5),q(-2,9),q(1,6),q(-2,3),q(2,0),q(-1,-3),q(2,-6),q(-1,-9),q(-5,-9.5)],{fill:C.trim,w:0,depth:.3,speck:.7});
  const a=q(-9,1);cLine(ctx,[[e.x,e.y],[a.x,a.y]],.65);
}

function staff(ctx,rf,P) {
  const axis=P.staffAxis,at=z=>rf.U(...P.staff.map((v,i)=>v+axis[i]*z));
  // Twisted wood: two strands winding around each other through the grip.
  for(const [ph,col] of [[0,C.wood],[Math.PI,C.woodLight]]) {
    const pts=[];for(let z=-36;z<=30;z+=3){const q=at(z),o=Math.sin(z*.35+ph)*1.6;pts.push({x:q.x+o,y:q.y});}
    strokePath(ctx,pts,4.4*DRAW.lw,false,PAL.ink);strokePath(ctx,pts,2.6,false,col);
  }
  // Cord bindings below the head.
  for(const z of [22,25,28]){const p=at(z),q2=at(z+1.5);strokePath(ctx,[{x:p.x-3,y:p.y},{x:q2.x+3,y:q2.y}],1.6,false,C.leather);}
  // The crown: wooden claws holding a big glowing yellow-green crystal.
  const base=at(30),tip=at(54),ang=Math.atan2(tip.y-base.y,tip.x-base.x);
  crystal(ctx,1,base.x,base.y,ang,24,11,GEM.fill,{w:1.3,glow:P.glow});
  for(const d of [-1,1]){const c1=at(31),c2=at(37);const o=d*5;
    strokePath(ctx,[{x:c1.x,y:c1.y},{x:c2.x+o,y:c2.y}],3.6*DRAW.lw,false,PAL.ink);strokePath(ctx,[{x:c1.x,y:c1.y},{x:c2.x+o,y:c2.y}],2,false,C.wood);}
  if(P.glow>.2) {
    const p=at(42);ctx.save();ctx.globalAlpha=(P.glow-.2)*.3;
    oval(ctx,p.x,p.y,12,14,GEM.glow,{w:0,depth:0,speck:0});ctx.restore();
  }
}

function magic(ctx,rf,P) {
  if(P.spell>=0) {
    // Abyssal Rend: a dark crescent torn forward from the crystal, green sparks scattering.
    const c=rf.U(...P.staff.map((v,i)=>v+P.staffAxis[i]*50)),u=P.spell,sx=rf.sx,r=10+u*16;
    ctx.save();ctx.globalAlpha=(1-u)*.9;
    const arc=[];for(let i=0;i<=10;i++){const a=-1.2+i/10*2.4;arc.push([c.x+sx*Math.cos(a)*r,c.y+Math.sin(a)*r]);}
    const inner=arc.map(([px,py])=>[c.x+(px-c.x)*.62+sx*3,c.y+(py-c.y)*.62]).reverse();
    shape(ctx,[...arc,...inner],C.void,{w:1,depth:0,speck:0,amp:.06});
    for(const [dx,dy,s2] of [[12,-12,2],[16,4,1.6],[8,14,1.8],[20,-4,1.4]])oval(ctx,c.x+sx*dx*(1+u),c.y+dy*(1+u),s2,s2,C.teal,{w:.6,depth:0,speck:0});
    ctx.restore();
  }
  if(P.ward>=0) {
    // Shadow Pulse: dark rings swelling out from the body and fading (two per loop, so it cycles).
    const c=rf.U(2,0,36);
    for(let i=0;i<2;i++){const u=(P.ward+i/2)%1,r=14+u*40;
      ctx.save();ctx.globalAlpha=(1-u)*.8;const ring=ellipsePts(c.x,c.y,r,r*.4,32);strokePath(ctx,[...ring,ring[0]],3.2,false,C.void);strokePath(ctx,[...ring,ring[0]],1.2,false,C.teal);ctx.restore();}
    for(let i=0;i<4;i++){const a=TAU*(P.ward+i/4);oval(ctx,c.x+Math.cos(a)*30,c.y+Math.sin(a)*10-8,1.6,1.6,C.teal,{w:.5,depth:0,speck:0});}
  }
}

export function drawHerald(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=heraldPose(action,t),rf=rigFrame(direction,P.body);
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
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-abyssal-herald',boil:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-abyssal-herald',label:'Abyssal Herald — EMBERBOUND',kind:'humanoid',directional:true,draw:drawHerald,
  actions:{idle:{period:IDLE_T,frames:16},
    attack:{period:HERALD_ATTACK_T,keys:[0,.1,.25,.35,.45,.55,.7,.85],once:true},
    cast:{period:HERALD_PULSE_T,frames:8},
    hurt:hurtAction},
  frameBox:{x0:-110,x1:110,y0:-200,y1:25},
  equipment:{leftHand:'staff',rightHand:'free'},
  emberbound:{gameId:'abyssal_herald',heightPx:44,facing:'L'},
});
export const studio=Object.freeze({order:34,name:"Abyssal Herald（深淵の先触れ）",category:"EMBERBOUND 第5エリア",
  description:"長い角と棘の肩当てを持つ濃紫のフードの術師（エリート）。結晶の杖。強打 Abyssal Rend、Voidspawn の召喚、全体攻撃 Shadow Pulse を使う。",
  preview:{direction:'L',phase:0}});
