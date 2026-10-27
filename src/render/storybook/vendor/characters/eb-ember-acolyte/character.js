/**
 * EMBERBOUND EXPEDITION — Ember Acolyte (game id `ember_acolyte`), the dark mage's hooded body (by way of the Gloom
 * Caster) after the user's reference image: a deep red hood with a long tip and a gold-trimmed opening, a smooth
 * golden mask with dark almond eye holes, a red capelet pinned with a gold brooch, a long red robe with gold
 * borders, a leather belt, wide gold-cuffed sleeves, brown gloves and boots, and a small golden oil lamp with a
 * flame, held in both hands before the chest.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle, attack (a spark flicked from the lamp — the game fires it at the
 * start, so it leaves the flame at u = .15, 0.045 s), `cast` = Kindle, the support spell the game loops (the lamp
 * raised high, its flame swelling, embers and rings of light rising), and the shared hurt.
 * Anatomical −b (right) and +b (left) hands both hold the lamp.
 */
import {
  TAU, LW, LAYER, PAL, rigFrame, renderRig,
  ik2, keyframes, bodyLayerKey, legParts2, mittenHand,
  paint, paintA, ellipsePts, taperPts, cLine,
} from '../../src/authoring.js';
import { hurtAction, phase, sample, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';
import { flame } from '../shared/emberbound/creature.js';

const C={cloth:'#b0402f',dark:'#82291f',light:'#c95c45',edge:'#d6b46a',void:'#1a0f0c',mask:'#d9b04e',maskDark:'#a9822f',
  glove:'#5a3e2c',leather:'#6b4a32',buckle:'#c9a45c',boot:'#6e5038',lamp:'#d8ac4a',lampDark:'#9a7530',rune:'#ffd27a'};
const FIRE={outer:'#ec7d33',mid:'#f6a948',core:'#ffe08c'};
// Both hands hold the lamp before the chest: the right hand under its bowl, the left steadying its far side.
const IDLE_T=3.6,HAND_REST=[13,-5,33],CLAW_REST=[13,5,33];
export const ACOLYTE_ATTACK_T=.3;   // the spark leaves the lamp at u = .15 (0.045 s)
export const ACOLYTE_KINDLE_T=.6;   // Kindle: a loop
const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const shape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:LW.part,depth:1.8,
  light:.2,speck:.65,speckScale:.3,amp:.22,...o});
const oval=(ctx,x,y,rx,ry,fill,o={})=>paint(ctx,ellipsePts(x,y,rx,ry,24),
  {fill,w:1,depth:1,speck:.3,speckScale:.3,amp:.15,...o});

export function acolytePose(action,t) {
  const P={body:[0,0,0],footL:[0,6,0],footR:[0,-6,0],hand:HAND_REST.slice(),claw:CLAW_REST.slice(),
    sway:0,fire:1,mark:-1,doom:-1,t};
  if(action==='attack') {
    // A spark flicked from the lamp: it is drawn back, thrust forward, the spark leaving the flame at u .15.
    const u=phase(t,ACOLYTE_ATTACK_T);
    P.hand=keyframes([[0,HAND_REST],[.08,[8,-5,36]],[.15,[19,-5,36]],[.5,[18,-5,35]],[1,HAND_REST]],u);
    P.claw=keyframes([[0,CLAW_REST],[.08,[8,5,36]],[.15,[19,5,36]],[.5,[18,5,35]],[1,CLAW_REST]],u);
    P.fire=sample([[0,[1]],[.08,[1.3]],[.15,[.7]],[.5,[.75]],[1,[1]]],u);
    P.body[0]=sample([[0,[0]],[.08,[-1.2]],[.15,[2]],[.5,[1.6]],[1,[0]]],u);P.sway=P.body[0]*.3;
    P.mark=u>=.15&&u<.75?(u-.15)/.6:-1;
  } else if(action==='cast') {
    // Kindle: the lamp raised high in both hands, the flame swelling, embers and rings rising; periodic in u.
    const u=phase(t,ACOLYTE_KINDLE_T),w=Math.sin(TAU*u);
    P.hand=[12,-5,46+w*.6];P.claw=[12,5,46+w*.6];P.fire=1.4+.2*w;P.doom=u;P.body[2]=.4*w;
  } else if(action==='hurt') {
    const k=hurtAmount(t);
    P.body=[-2.5*k,0,-1.2*k];P.hand=[HAND_REST[0]-3*k,HAND_REST[1],HAND_REST[2]+4*k];P.claw=[CLAW_REST[0]-2*k,CLAW_REST[1],CLAW_REST[2]+3*k];P.fire=1-.4*k;
  } else {
    P.body[2]=Math.sin(t/IDLE_T*TAU)*.4;P.sway=Math.sin(t/IDLE_T*TAU-.5)*.25;
  }
  return P;
}

function robe(ctx,rf,P) {
  const c=rf.U(0,0,0),s=P.sway;
  ctx.save();ctx.translate(c.x,c.y);
  // A ragged robe: jagged hem, worn brown edges along it.
  // A long robe flaring to a smooth hem with a gold border, a gold-edged opening down the front.
  const hem=[[-26+s,-5],[-14+s,-3],[0+s,-4],[12+s,-3],[24+s,-5]];
  shape(ctx,[[-12,-50],[-17,-43],[-16,-33],[-22+s,-16],...hem,[21+s,-18],[15,-35],[16,-44],[11,-50]],C.cloth,{w:LW.outline,depth:2.5});
  shape(ctx,[...hem,[23+s,-9],[12+s,-8],[0+s,-9],[-14+s,-8],[-25+s,-10]],C.edge,{w:.9,depth:.4,speck:.5});
  const fb=rf.U(10,0,20),fx=fb.x-c.x;
  for(const dx of [-2,2])shape(ctx,[[fx+dx-1.2,-31],[fx+dx+1.2,-31],[fx+dx*1.6+1.2+s,-6],[fx+dx*1.6-1.2+s,-6]],C.edge,{w:.7,depth:.2,speck:0});
  for(const [x0,x1] of [[-10,-16],[12,17]])cLine(ctx,[[x0,-30],[x1+s,-10]],.55);
  // The belt with a square buckle and a strap hanging from it.
  const b=rf.U(10,0,33),bx=b.x-c.x;
  shape(ctx,[[-14,-35],[14,-35],[14,-31],[-14,-31]],C.leather,{w:1,depth:.6});
  shape(ctx,[[bx-3.6,-36],[bx+3.6,-36],[bx+3.6,-30],[bx-3.6,-30]],C.buckle,{w:.9,depth:.3,speck:0});
  shape(ctx,[[bx-2,-35],[bx+2,-35],[bx+2,-31],[bx-2,-31]],C.leather,{w:.5,depth:0,speck:0});

  ctx.restore();
}

function mantle(ctx,rf) {
  const p=rf.U(0,0,48);
  ctx.save();ctx.translate(p.x,p.y);
  // The cowl wrapped round the neck in two loose folds.
  shape(ctx,[[-11,-6],[-19,-2],[-23,6],[-16,10],[-7,8],[0,5],[8,9],[17,10],[23,5],[17,-2],[10,-6]],C.dark,{w:1.8,depth:2});
  shape(ctx,[[-12,-5],[-20,0],[-17,4],[-8,5],[0,1],[9,5],[18,4],[21,0],[11,-5],[0,-2]],C.cloth,{w:1.2,depth:1.3});
  shape(ctx,[[-20,1],[-17,5],[-8,6],[0,2],[9,6],[18,5],[21,1],[18,3],[9,3],[0,-.5],[-8,3],[-17,3]],C.edge,{w:.8,depth:.3,speck:.3});
  oval(ctx,8,-1,3.4,3.4,C.buckle,{w:1,depth:.4});oval(ctx,8,-1,1.7,1.7,C.lampDark,{w:.4,depth:0});
  ctx.restore();
}

function hood(ctx,rf,P) {
  const h=rf.U(1.5,0,71);
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx,1);
  // The long tip flops back behind the crown, its end torn.
  shape(ctx,[[-8,-27],[-16,-36],[-28,-39],[-40,-35],[-50+P.sway,-24],[-45+P.sway,-23],[-48+P.sway,-15],[-38,-21],[-26,-25],[-20,-16]],C.cloth,{w:LW.outline,depth:2});
  cLine(ctx,[[-14,-31],[-28,-33],[-40,-29]],.6);
  shape(ctx,[[-23,14],[-25,0],[-22,-16],[-12,-27],[2,-30],[14,-24],[22,-10],[24,6],[25,16],[12,22],[-2,23],[-14,20]],C.cloth,{w:LW.outline,depth:2.7});
  // The opening edged in gold, the shadow, the smooth golden mask with dark almond eye holes.
  shape(ctx,[[8,-21],[16,-16],[22,-6],[24,6],[22,15],[14,20],[1,21],[-11,15],[-6,4],[-4,-8],[2,-17]],C.edge,{w:1.1,depth:.6,speck:.4});
  shape(ctx,[[10,-17],[18,-9],[21,9],[13,17],[0,17],[-9,11],[-3,0],[3,-10]],C.void,{w:1,depth:0,light:0,speck:0,amp:.12});
  shape(ctx,[[9,-12],[17,-6],[20,6],[16,15],[9,19],[2,14],[0,2],[3,-7]],C.mask,{w:1.1,depth:1,light:.35,speck:.3,amp:.1});
  for(const [x,y,d] of [[6,1,-1],[15,0,1]]) shape(ctx,[[x-3,y+1],[x-.5,y-3],[x+3,y-1.5*d-.5],[x+.5,y+2.5]],C.void,{w:.5,depth:0,speck:0,amp:.04});
  cLine(ctx,[[11,-5],[11,12]],.5);
  cLine(ctx,[[-20,9],[-14,-6],[-4,-18],[6,-25]],.7);
  ctx.restore();
}

/** The small golden oil lamp held between the hands: a round bowl, a curled handle, a spout with the flame. */
function lamp(ctx,rf,P) {
  // Drawn a little ahead of and above the hands, so it reads over them.
  const a=rf.U(...P.hand),b=rf.U(...P.claw),sx=rf.sx,c={x:(a.x+b.x)/2+3*sx,y:(a.y+b.y)/2-5},K=1.5,Q=(px,py)=>[c.x+px*K*sx,c.y+py*K];
  shape(ctx,[Q(-9,-2),Q(9,-2),Q(7,3),Q(0,5),Q(-7,3)],C.lamp,{w:1.2,depth:.6,light:.35,speck:0});
  shape(ctx,[Q(7,-2),Q(13,-4),Q(13,-2.4),Q(8,.5)],C.lamp,{w:1,depth:.3,speck:0});
  cLine(ctx,[Q(-9,-1),Q(-13,-2),Q(-13,-6),Q(-10,-6)],1);
  oval(ctx,c.x,c.y-2*K,7*K,1.6*K,C.lampDark,{w:.6,depth:0,speck:0});
  const sp=Q(12.5,-4);return {x:sp[0],y:sp[1]};
}

function sleeve(ctx,rf,S,E,H) {
  const s=rf.U(...S),e=rf.U(...E),h=rf.U(...H);
  paint(ctx,taperPts(s,e,6,5),{fill:C.cloth,w:LW.part,depth:2,speck:.6,speckScale:.3});
  const dx=h.x-e.x,dy=h.y-e.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  const q=(along,across)=>({x:h.x+dx/len*along+nx*across,y:h.y+dy/len*along+ny*across});
  // A wide bell sleeve ending in a ragged, worn cuff that hangs low.
  paint(ctx,[{x:e.x+nx*5,y:e.y+ny*5},q(-2,9),q(1,6),q(-2,3),q(2,0),q(-1,-3),q(2,-6),q(-1,-9),{x:e.x-nx*5,y:e.y-ny*5}],{fill:C.cloth,w:LW.part,depth:2,speck:.6,speckScale:.3});
  paint(ctx,[q(-5,9.5),q(-2,9),q(1,6),q(-2,3),q(2,0),q(-1,-3),q(2,-6),q(-1,-9),q(-5,-9.5)],{fill:C.edge,w:0,depth:.3,speck:.7});
  const a=q(-9,1);cLine(ctx,[[e.x,e.y],[a.x,a.y]],.65);
}

function magic(ctx,rf,P) {
  const sx=rf.sx,h=lamp(ctx,rf,P);
  // The lamp's flame on its spout, a few embers drifting up.
  if(P.fire>.05) {
    const k=P.fire,t=P.t;
    flame(ctx,1,h.x,h.y+1,10*k,19*k,t,.1*sx,1,FIRE);
    for(let i=0;i<4;i++){const u=(t*.9+i/4)%1;oval(ctx,h.x+Math.sin(i*2.3+u*4)*6*k,h.y-6-u*18*k,1.3,1.3,FIRE.mid,{w:.5,depth:0,speck:0});}
  }
  if(P.mark>=0) {
    // A spark flicked from the flame, flying forward and fading.
    const u=P.mark,c={x:h.x+sx*(8+u*40),y:h.y-8-u*6};
    ctx.save();ctx.globalAlpha=1-u*.7;
    flame(ctx,1,c.x,c.y+5,7,11,P.t,-1.1*sx,4,{...FIRE,tongues:false});
    ctx.restore();
  }
  if(P.doom>=0) {
    // Kindle: rings of warm light rising from the lamp and widening, embers climbing (cycles with the loop).
    for(let i=0;i<2;i++){const u=(P.doom+i/2)%1,r=8+u*16,c={x:h.x,y:h.y-14-u*22};
      ctx.save();ctx.globalAlpha=(1-u)*.8;const ring=ellipsePts(c.x,c.y,r,r*.35,24);
      for(let k=0;k<ring.length;k++){const p=ring[k],q=ring[(k+1)%ring.length];cLine(ctx,[[p.x,p.y],[q.x,q.y]],1.1);}
      ctx.restore();}
    for(let i=0;i<5;i++){const u=(P.doom*1.5+i/5)%1;ctx.save();ctx.globalAlpha=1-u;oval(ctx,h.x+Math.sin(i*2.1)*10,h.y-10-u*34,1.5,1.5,C.rune,{w:.4,depth:0,speck:0});ctx.restore();}
  }
}

export function drawAcolyte(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=acolytePose(action,t),rf=rigFrame(direction,P.body);
  const key=p=>bodyLayerKey(rf,...p);
  const parts=legParts2(ctx,rf,P,{pants:C.dark,boot:C.boot,sole:C.leather,footR:4,soleR:3.6});
  parts.push({id:'robe',d:LAYER.torso,draw:()=>robe(ctx,rf,P)});
  parts.push({id:'mantle',d:LAYER.cape,draw:()=>mantle(ctx,rf)});
  parts.push({id:'hood',d:LAYER.head,draw:()=>hood(ctx,rf,P)});
  for(const [side,H] of [[1,P.claw],[-1,P.hand]]) {
    const S=[0,side*13,47],E=ik2(S,H,14,15,[-4,side*3,-12]);
    const d=Math.min(key(mid(S,H)),LAYER.cape-1);
    parts.push({id:'sleeve'+side,d,draw:()=>sleeve(ctx,rf,S,E,H)});
    parts.push({id:'hand'+side,d:key(H)+.02,draw:()=>{
      const h=rf.U(...H),e=rf.U(...E);
      mittenHand(ctx,h,h.x-e.x,h.y-e.y,3.4,C.glove,{thumbSide:side*rf.sx});

    }});
  }
  parts.push({id:'magic',d:LAYER.head+5,draw:()=>magic(ctx,rf,P)});
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),false,
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-ember-acolyte',boil:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-ember-acolyte',label:'Ember Acolyte — EMBERBOUND',kind:'humanoid',directional:true,draw:drawAcolyte,
  actions:{idle:{period:IDLE_T,frames:16},
    attack:{period:ACOLYTE_ATTACK_T,keys:[0,.08,.15,.25,.35,.5,.7,.85],once:true,releaseAt:.15},
    cast:{period:ACOLYTE_KINDLE_T,frames:8},
    hurt:hurtAction},
  frameBox:{x0:-110,x1:110,y0:-150,y1:25},
  equipment:{leftHand:'free',rightHand:'free'},
  emberbound:{gameId:'ember_acolyte',heightPx:22,facing:'L'},
});
export const studio=Object.freeze({order:39,name:"Ember Acolyte（灯火の侍祭）",category:"EMBERBOUND 第6エリア",
  description:"金の縁取りの赤いフードと長衣、金の仮面。両手で小さな金の灯火を持つ。Kindle で仲間を強める支援役。",
  preview:{direction:'L',phase:0}});
