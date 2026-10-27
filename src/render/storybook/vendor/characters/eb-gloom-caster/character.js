/**
 * EMBERBOUND EXPEDITION — Gloom Caster (game id `gloom_caster`), the dark mage's hooded body after the user's
 * reference image: a deep, dark-purple hood whose long tip flops back, a pitch-dark face with two glowing
 * yellow-green eyes, a wrapped cowl, a ragged robe with worn brown edges and a jagged hem, a leather belt with a
 * square buckle and a hanging strap, wide ragged sleeves, grey gloves and brown boots. No staff: a yellow-green
 * flame of dark magic burns over the open forward hand, the other hand raised and clawed.
 * The reference has no staff, so (unlike the other casters, plan/EMBERBOUND_PRODUCTION.md 6.6) the spell is cast
 * from the hand; the flame is drawn large and the throw is a clear thrust so it reads at game size.
 * Actions: idle, attack (the Doom mark thrown from the flame: the hand pulls back and thrusts forward, the mark
 * leaving it at u = .15, 0.045 s), `cast` = the Doom wind-up the game loops (both hands raised, the flame swelling,
 * a ring of runes turning over it), and the shared hurt.
 * Anatomical −b (right) is the flame hand, held forward; +b (left) is the clawed hand.
 */
import {
  TAU, LW, LAYER, PAL, rigFrame, renderRig,
  ik2, keyframes, bodyLayerKey, legParts2, mittenHand,
  paint, paintA, ellipsePts, taperPts, cLine,
} from '../../src/authoring.js';
import { hurtAction, phase, sample, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';
import { flame } from '../shared/emberbound/creature.js';

const C={cloth:'#5a4266',dark:'#3d2b47',light:'#7a6186',edge:'#8d6a58',void:'#100c14',eye:'#e2f26a',
  glove:'#8a8784',leather:'#7a5638',buckle:'#b99a5c',boot:'#6e5038',rune:'#d6ef5c'};
const FIRE={outer:'#8fc236',mid:'#c9e65e',core:'#f4ffc6'};
const IDLE_T=3.6,HAND_REST=[16,-14,37],CLAW_REST=[9,14,38];
export const GLOOM_ATTACK_T=.3;   // the Doom mark leaves the hand at u = .15 (0.045 s)
export const GLOOM_DOOM_T=.6;     // Doom wind-up: a loop
const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
const shape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:LW.part,depth:1.8,
  light:.2,speck:.65,speckScale:.3,amp:.22,...o});
const oval=(ctx,x,y,rx,ry,fill,o={})=>paint(ctx,ellipsePts(x,y,rx,ry,24),
  {fill,w:1,depth:1,speck:.3,speckScale:.3,amp:.15,...o});

export function gloomPose(action,t) {
  const P={body:[0,0,0],footL:[0,6,0],footR:[0,-6,0],hand:HAND_REST.slice(),claw:CLAW_REST.slice(),
    sway:0,fire:1,mark:-1,doom:-1,t};
  if(action==='attack') {
    // The Doom mark: the flame hand pulls back, thrusts forward and the mark flies from it at u .15.
    const u=phase(t,GLOOM_ATTACK_T);
    P.hand=keyframes([[0,HAND_REST],[.08,[8,-16,41]],[.15,[21,-11,39]],[.5,[20,-11,38]],[1,HAND_REST]],u);
    P.claw=keyframes([[0,CLAW_REST],[.15,[5,14,42]],[.6,[5,14,41]],[1,CLAW_REST]],u);
    P.fire=sample([[0,[1]],[.08,[1.45]],[.15,[.55]],[.5,[.6]],[1,[1]]],u);
    P.body[0]=sample([[0,[0]],[.08,[-1.2]],[.15,[2]],[.5,[1.6]],[1,[0]]],u);P.sway=P.body[0]*.3;
    P.mark=u>=.15&&u<.75?(u-.15)/.6:-1;
  } else if(action==='cast') {
    // Doom wind-up: both hands raised, the flame swelling, runes turning over it; every term periodic in u.
    const u=phase(t,GLOOM_DOOM_T),w=Math.sin(TAU*u);
    P.hand=[15,-13,46+w*.6];P.claw=[10,12,45+w*.6];P.fire=1.35+.2*w;P.doom=u;P.body[2]=.4*w;
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
  const hem=[[-25+s,-8],[-20+s,-12],[-16+s,-4],[-11+s,-10],[-6+s,-3],[-1+s,-9],[4+s,-3],[9+s,-9],[14+s,-4],[18+s,-10],[23+s,-5]];
  shape(ctx,[[-12,-50],[-16,-43],[-14,-33],[-19+s,-18],...hem,[19+s,-21],[14,-35],[16,-44],[11,-50]],C.cloth,{w:LW.outline,depth:2.5});
  shape(ctx,[...hem,[22+s,-11],[12+s,-12],[2+s,-11],[-8+s,-13],[-20+s,-14]],C.edge,{w:0,depth:.4,speck:.8});
  for(const [x0,x1] of [[-10,-15],[3,1],[12,16]])cLine(ctx,[[x0,-30],[x1+s,-12]],.55);
  // The belt with a square buckle and a strap hanging from it.
  const b=rf.U(10,0,33),bx=b.x-c.x;
  shape(ctx,[[-14,-35],[14,-35],[14,-31],[-14,-31]],C.leather,{w:1,depth:.6});
  shape(ctx,[[bx-3.6,-36],[bx+3.6,-36],[bx+3.6,-30],[bx-3.6,-30]],C.buckle,{w:.9,depth:.3,speck:0});
  shape(ctx,[[bx-2,-35],[bx+2,-35],[bx+2,-31],[bx-2,-31]],C.leather,{w:.5,depth:0,speck:0});
  shape(ctx,[[bx+1,-31],[bx+4,-31],[bx+5+s*.5,-17],[bx+2+s*.5,-17]],C.leather,{w:.9,depth:.4});
  ctx.restore();
}

function mantle(ctx,rf) {
  const p=rf.U(0,0,48);
  ctx.save();ctx.translate(p.x,p.y);
  // The cowl wrapped round the neck in two loose folds.
  shape(ctx,[[-11,-6],[-19,-2],[-23,6],[-16,10],[-7,8],[0,5],[8,9],[17,10],[23,5],[17,-2],[10,-6]],C.dark,{w:1.8,depth:2});
  shape(ctx,[[-12,-5],[-20,0],[-17,4],[-8,5],[0,1],[9,5],[18,4],[21,0],[11,-5],[0,-2]],C.cloth,{w:1.2,depth:1.3});
  cLine(ctx,[[-17,3],[-7,2],[2,4],[16,3]],.55);
  ctx.restore();
}

function hood(ctx,rf,P) {
  const h=rf.U(1.5,0,71);
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx,1);
  // The long tip flops back behind the crown, its end torn.
  shape(ctx,[[-8,-27],[-16,-36],[-28,-39],[-40,-35],[-50+P.sway,-24],[-45+P.sway,-23],[-48+P.sway,-15],[-38,-21],[-26,-25],[-20,-16]],C.cloth,{w:LW.outline,depth:2});
  cLine(ctx,[[-14,-31],[-28,-33],[-40,-29]],.6);
  shape(ctx,[[-23,14],[-25,0],[-22,-16],[-12,-27],[2,-30],[14,-24],[22,-10],[24,6],[25,16],[12,22],[-2,23],[-14,20]],C.cloth,{w:LW.outline,depth:2.7});
  // A deep opening: a dark rim, the shadow, two glowing yellow-green eyes.
  shape(ctx,[[8,-21],[16,-16],[22,-6],[24,6],[22,15],[14,20],[1,21],[-11,15],[-6,4],[-4,-8],[2,-17]],C.dark,{w:1.1,depth:.8,speck:.4});
  shape(ctx,[[10,-15],[17,-8],[20,10],[12,16],[0,16],[-8,10],[-2,0],[3,-9]],C.void,{w:1,depth:0,light:0,speck:0,amp:.12});
  for(const [x,y] of [[3,2],[13,1]]) {
    ctx.save();ctx.globalAlpha=.25;oval(ctx,x,y,3.8,5,C.eye,{w:0,depth:0,speck:0});ctx.restore();
    oval(ctx,x,y,1.9,3.1,C.eye,{w:0,depth:0,speck:0,amp:.05});
  }
  cLine(ctx,[[-20,9],[-14,-6],[-4,-18],[6,-25]],.7);
  ctx.restore();
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
  const h=rf.U(...P.hand.map((v,i)=>v+[1.5,0,3][i])),sx=rf.sx;
  // The yellow-green flame over the open palm, a few motes drifting up.
  if(P.fire>.05) {
    const k=P.fire,t=P.t;
    flame(ctx,1,h.x,h.y-1,11*k,19*k,t,.1*sx,1,FIRE);
    for(let i=0;i<4;i++){const u=(t*.9+i/4)%1;oval(ctx,h.x+Math.sin(i*2.3+u*4)*6*k,h.y-6-u*18*k,1.3,1.3,FIRE.mid,{w:.5,depth:0,speck:0});}
  }
  if(P.mark>=0) {
    // The Doom mark flying from the hand: a ring of runes that grows and fades.
    const u=P.mark,c={x:h.x+sx*(10+u*36),y:h.y-6-u*4},r=7+u*9;
    ctx.save();ctx.globalAlpha=1-u*.7;
    oval(ctx,c.x,c.y,r,r,C.void,{w:1.1,depth:0,speck:0});
    oval(ctx,c.x,c.y,r*.62,r*.62,C.rune,{w:.8,depth:0,speck:0});
    for(let i=0;i<4;i++){const a=i/4*TAU+u*3;cLine(ctx,[[c.x+Math.cos(a)*r*.62,c.y+Math.sin(a)*r*.62],[c.x+Math.cos(a)*(r+3),c.y+Math.sin(a)*(r+3)]],.8);}
    ctx.restore();
  }
  if(P.doom>=0) {
    // Doom wind-up: a ring of runes turning above the flame (it cycles with the loop).
    const c={x:h.x,y:h.y-26},a0=TAU*P.doom;
    ctx.save();ctx.globalAlpha=.85;
    oval(ctx,c.x,c.y,14,5,C.rune,{w:.9,depth:0,speck:0});
    oval(ctx,c.x,c.y,10,3.4,C.void,{w:0,depth:0,speck:0});
    for(let i=0;i<5;i++){const a=a0+i/5*TAU,x=c.x+Math.cos(a)*14,y=c.y+Math.sin(a)*5;oval(ctx,x,y,1.8,2.4,C.rune,{w:.6,depth:0,speck:0});}
    ctx.restore();
  }
}

export function drawGloomCaster(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=gloomPose(action,t),rf=rigFrame(direction,P.body);
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
      // Bent fingers on the raised claw hand.
      if(side===1)for(const d2 of [-2.2,0,2.2])cLine(ctx,[[h.x+d2,h.y-3],[h.x+d2+rf.sx*1.5,h.y-6.5]],.7);
    }});
  }
  parts.push({id:'magic',d:LAYER.head+5,draw:()=>magic(ctx,rf,P)});
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),false,
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-gloom-caster',boil:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-gloom-caster',label:'Gloom Caster — EMBERBOUND',kind:'humanoid',directional:true,draw:drawGloomCaster,
  actions:{idle:{period:IDLE_T,frames:16},
    attack:{period:GLOOM_ATTACK_T,keys:[0,.08,.15,.25,.35,.5,.7,.85],once:true,releaseAt:.15},
    cast:{period:GLOOM_DOOM_T,frames:8},
    hurt:hurtAction},
  frameBox:{x0:-110,x1:110,y0:-150,y1:25},
  equipment:{leftHand:'free',rightHand:'free'},
  emberbound:{gameId:'gloom_caster',heightPx:21,facing:'L'},
});
export const studio=Object.freeze({order:31,name:'Gloom Caster（陰りの術師）',category:'EMBERBOUND 第5エリア',
  description:'ぼろぼろの濃紫のフードとローブの術師。フードの奥の目と手の魔力が黄緑に光る。遅れて炸裂する刻印 Doom を付ける。',
  preview:{direction:'L',phase:0}});
