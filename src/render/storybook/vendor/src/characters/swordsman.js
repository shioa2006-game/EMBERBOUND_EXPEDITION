/** Inkstone storybook swordsman. Body a = forward, b = anatomical LEFT.
 * Sword RIGHT (-b), shield LEFT (+b); only the face's view changes with sx.
 * Head: 44 px high, crown ~92 px above ground, matching the humanoid guide.
 */
import { DRAW } from '../core/settings.js';
import { TAU, ellipsePts, lerp } from '../core/geometry.js';
import { PAL } from '../core/palette.js';
import { clipPath, inkLine, inkShape, fillPath, strokePath } from '../core/ink.js';
import { LW, paint, paintA, taperPts } from '../core/paint.js';
import { KX, KY, WALK_HZ, bodyToWorld, chestToLegs, cLine, keyframes, nrm3, renderRig, rigFrame, travelDir, vlerp, walkFeet, ik2 } from './rig.js';
import { legParts2, mittenHand } from './painting.js';

export const ATTACK_T = 1.15;
// Upright guard shared by idle, walking and both ends of the attack.
const REST = [7,-23,33,.06,-.58,.81];
// Existing anticipation / quick cut / recovery timing, retargeted to the right.
export const SWING = [
  [0,REST],[.28,[-4,-19,52,-.75,-.2,.62]],
  [.4,[10,-22,66,.45,-.05,.9]],[.5,[17,-8,30,.85,.25,-.45]],
  [.64,[15,-6,29,.6,.45,-.65]],[1,REST],
];
// The side views use a forward ready guard in front of the chest. Facing right
// the right hand is the near one and sits on the far side of the body at its side,
// where the upright REST blade would point backward (docs/SIDE_VIEW_GUIDE.md 2.9).
const SIDE_READY=[14,-10,33,.8,0,.6];
export function computePose(action,t) {
  const P={body:[0,0,0],footL:[0,6,0],footR:[0,-6,0],
    sword:{hand:REST.slice(0,3),dir:nrm3(REST.slice(3))},
    shield:{hand:[7,24,33]},mouth:0,blink:t%3.1>2.98,trail:null,tail:0};
  if(action==='idle') {
    const br=Math.sin(t*2.4);
    P.body=[0,0,br*.65];P.shield.hand[2]+=br*.3;
    P.sword.dir=nrm3([REST[3]+Math.sin(t*1.7)*.035,REST[4],REST[5]]);
    P.tail=Math.sin(t*1.3)*.7;
  } else if(action==='walk') {
    const wf=walkFeet(t),s=wf.s;
    P.footL=wf.footL;P.footR=wf.footR;P.body=[1.2,0,wf.bob*.7];
    P.sword.hand=[REST[0]+4*s,REST[1],REST[2]+Math.abs(s)*.6];
    P.sword.dir=nrm3([REST[3]+.07*s,REST[4],REST[5]]);
    P.shield.hand=[7-2*s,24,33];P.tail=-s*2;
  } else if(action==='attack') {
    const u=((t%ATTACK_T)+ATTACK_T)%ATTACK_T/ATTACK_T,k=keyframes(SWING,u);
    P.sword={hand:k.slice(0,3),dir:nrm3(k.slice(3))};
    const lean=keyframes([[0,[0]],[.28,[-2.5]],[.5,[4]],[.64,[4]],[1,[0]]],u)[0];
    P.body=[lean,0,keyframes([[0,[0]],[.28,[1]],[.5,[-1]],[1,[0]]],u)[0]];
    P.footR=[keyframes([[0,[0]],[.3,[0]],[.5,[6]],[.72,[6]],[1,[0]]],u)[0],-6,
      keyframes([[0,[0]],[.32,[0]],[.42,[3]],[.5,[0]],[1,[0]]],u)[0]];
    // Maintain clearance from the torso: the shield rises, never pulls inward.
    P.shield.hand=[7,24,keyframes([[0,[33]],[.28,[36]],[.66,[36]],[1,[33]]],u)[0]];
    P.mouth=u>.4&&u<.66?1:0;P.tail=-lean*.6;
    if(u>.42&&u<.7) {
      const pts=[],start=Math.max(.4,u-.1),end=Math.min(u,.64);
      for(let i=0;i<=8;i++) {
        const q=keyframes(SWING,lerp(start,end,i/8));
        pts.push({hand:q.slice(0,3),dir:nrm3(q.slice(3))});
      }
      P.trail={pts,alpha:u<.56?1:Math.max(0,1-(u-.56)/.14)};
    }
  }
  return P;
}
export const SW={
  green:'#858963',greenDark:'#525b40',hair:'#98704e',hairDark:'#614832',skin:'#f5dfb8',
  cream:'#eee5ce',leather:'#805d40',brass:'#b49a62',steel:'#cfcec2',
  iron:'#999b91',wood:'#997650',woodDark:'#624b35',
};
export const SWORD_LEGS={pants:'#6c6853',boot:SW.leather,cuff:'#96734e',bootH:.48,
  legR0:4.6,legR1:3.7,footR:4.2,soleR:3.8};
const flat=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:1.6,depth:1.6,
  light:.15,speck:.65,speckScale:.35,amp:.3,step:4,...o});
const oval=(ctx,x,y,rx,ry,fill,o={})=>paint(ctx,ellipsePts(x,y,rx,ry,24),
  {fill,w:1.5,depth:1,speck:.2,speckScale:.3,amp:.2,...o});
export const pLineE=(ctx,pts,w=.75)=>inkLine(ctx,pts,{w:w*DRAW.lw,amp:.2,double:0});

// Broad, soft hood without the former long pointed elf-cap or pointed ears.
export const SHEAD={
  hoodF:[[-22,14],[-25,8],[-23,-4],[-26,-13],[-20,-23],[-9,-27],[6,-25],[18,-20],[22,-14],[19,-8],[20,10],[14,16]],
  fringeF:[[-20,1],[-17,-9],[-10,-16],[0,-19],[10,-16],[17,-12],[23,-12],[19,-8],[25,-3],[19,-4],[22,4],[17,0],[19,10],[14,5],[12,-4],[7,3],[8,-7],[1,5],[2,-9],[-6,2],[-4,-10],[-12,7],[-13,0],[-15,10]],
};
export function drawSwordHead(ctx,c,sx,P) {
  ctx.save();ctx.translate(c.x,c.y);ctx.scale(sx*.96,.96);
  flat(ctx,SHEAD.hoodF,SW.green,{w:2.1,depth:2.4,speck:1.4});
  flat(ctx,[[-20,12],[-22,4],[-18,-9],[-6,-20],[10,-18],[20,-10],[18,13],[8,17],[-9,17]],SW.greenDark,{w:1,depth:0});
  // Small rounded ear and broad cheek; large clean eyes remain readable at 1.25x.
  oval(ctx,-15,6,5.2,5.8,SW.skin,{speck:0});
  cLine(ctx,[[-17,5],[-14,3],[-13,7]],.7);
  flat(ctx,[[-14,-10],[-4,-16],[9,-14],[17,-7],[19,4],[17,12],[10,17],[0,19],[-10,15],[-14,8]],SW.skin,{w:1.7,depth:1.2,speck:0,round:3});
  flat(ctx,SHEAD.fringeF,SW.hair,{w:1.5,depth:1.8,speck:.35});
  for(const line of [[[-11,-11],[-15,-2]],[[-3,-15],[-8,-3]],[[5,-16],[2,-6]],[[12,-12],[15,-2]]])
    cLine(ctx,line,.65);
  for(const line of [[[-7,-14],[-10,-8]],[[2,-16],[0,-11]],[[10,-13],[12,-7]]])
    inkLine(ctx,line.map(([x,y])=>({x,y})),{color:'#c19b72',w:1.3,amp:.2});
  for(const [x,rx] of [[1,1.7],[12,1.5]]) {
    if(P.blink)cLine(ctx,[[x-1.8,5],[x+1.8,5]],1);
    else oval(ctx,x,5,rx,4.5,'#26271f',{w:0,depth:0,speck:0});
  }
  cLine(ctx,[[0,-1],[3,-2]],.7);cLine(ctx,[[11,-2],[14,-1]],.7);
  for(const x of [-7,-5,14,16])inkLine(ctx,[{x,y:10},{x:x+.7,y:11.5}],{color:'#cb976e',w:.65,amp:.1});
  if(P.mouth)oval(ctx,7,13,1.3,1.1,'#7a4e35',{w:.6,depth:0,speck:0});
  else cLine(ctx,[[6,13.6],[8,13.6]],.55);
  // Thick folded edge curves over the forehead, rather than a rigid helmet brim.
  flat(ctx,[[-23,8],[-19,-4],[-9,-15],[3,-21],[17,-18],[21,-14],[18,-17],[4,-18],[-7,-12],[-17,0],[-20,12]],
    SW.green,{w:1.3,depth:.8,speck:.7});
  cLine(ctx,[[-22,-12],[-18,-20],[-9,-24]],.65);
  cLine(ctx,[[-19,-9],[-17,-14]],.55);
  ctx.restore();
}

/** Broad iron blade, dark fuller, aged brass guard and leather grip. */
export function drawSword2(ctx,hx,hy,dx,dy,len=32) {
  const L=Math.hypot(dx,dy)||1;dx/=L;dy/=L;
  const P=(a,b)=>[hx+dx*a-dy*b,hy+dy*a+dx*b];
  flat(ctx,[P(5,-3.4),P(len-3,-2.6),P(len+8,0),P(len-3,2.6),P(5,3.4)],SW.steel,{w:1.6,depth:1.1,speck:.7});
  flat(ctx,[P(7,-2),P(len-4,-1.8),P(len+6,0),P(7,.3)],'#e9e5d6',{w:0,depth:0,speck:.25});
  cLine(ctx,[P(8,.4),P(len-2,.1)],.65);
  cLine(ctx,[P(len*.55,-2),P(len*.59,0),P(len*.63,-.5)],.5);
  flat(ctx,[P(2,-7),P(4,-8),P(6,-7),P(4,-5),P(4,5),P(6,7),P(4,8),P(2,7),P(1,2)],SW.brass,{w:1.3,depth:.7,speck:.3});
  flat(ctx,[P(-7,-2),P(2,-2),P(2,2),P(-7,2)],SW.leather,{w:1,depth:.6,speck:0});
  for(const a of [-5,-2,1])cLine(ctx,[P(a,-1.8),P(a+1,1.8)],.65);
  oval(ctx,...P(-9,0),2.6,2.6,SW.brass,{w:1,speck:.2});
}
export function drawShield2(ctx, c, h, thick, r = 16) {
  const disk = (o) => { const pts = []; for (let i = 0; i < 26; i++) { const a = TAU * i / 26; pts.push({ x: c.x + o.x + h.x * r * Math.cos(a), y: c.y + o.y + h.y * r * Math.cos(a) - r * 1.04 * Math.sin(a) }); } return pts; };
  inkShape(ctx, disk(thick), { fill: SW.woodDark, w: LW.part * DRAW.lw, amp: 0.3, step: 6 });       // 厚み
  const outer = disk({ x: 0, y: 0 });
  paint(ctx, outer, { fill: SW.iron, w: LW.outline, depth: 2.4, speck: 0.8, light: 0.25 });
  const wood = paint(ctx, outer.map(p => ({ x: c.x + (p.x - c.x) * 0.8, y: c.y + (p.y - c.y) * 0.8 })), { fill: SW.wood, w: LW.detail, depth: 3, speck: 1.2 });
  ctx.save(); clipPath(ctx, wood);
  for (let k = -2; k <= 2; k++) { const o = k * r * 0.32; cLine(ctx, [[c.x + h.x * o, c.y + h.y * o - r], [c.x + h.x * o, c.y + h.y * o + r]], LW.detail); }
  for (const [k, y0] of [[-1.5, -5], [0.6, 4], [1.6, -8]]) { const o = k * r * 0.32; cLine(ctx, [[c.x + h.x * (o - 1.5), c.y + y0], [c.x + h.x * (o + 1.2), c.y + y0 + 3], [c.x + h.x * (o - 0.6), c.y + y0 + 6]], LW.fine); }   // 木目
  ctx.restore();
  ctx.fillStyle = PAL.ink;
  for (let k = 0; k < 8; k++) { const a = TAU * k / 8 + 0.3; ctx.beginPath(); ctx.arc(c.x + h.x * r * 0.9 * Math.cos(a), c.y + h.y * r * 0.9 * Math.cos(a) - r * 0.94 * Math.sin(a), 1.0, 0, TAU); ctx.fill(); }
  paint(ctx, ellipsePts(c.x, c.y, Math.max(2.2, Math.abs(h.x) * r * 0.3), r * 0.3, 14), { fill: SW.iron, w: LW.part, depth: 1.4, speck: 0, light: 0.45 });
}

/** Ivory tunic, diagonal leather harness and short shoulder mantle. */
export function drawSwordTorso(ctx,rf,P) {
  const {U}=rf;
  const Q=(arr,a=2)=>arr.map(([b,z])=>U(a,b,z));
  paint(ctx,Q([[12,50],[-12,50],[-14,36],[-17,19],[-4,17],[-2,24],[0,17],[16,19],[14,36]]),
    {fill:SW.cream,w:1.8,depth:2,speck:.7,speckScale:.35,amp:.3});
  for(const l of [[[-9,26],[-11,20]],[[8,27],[11,20]],[[-3,44],[-4,37]]])
    pLineE(ctx,Q(l,3),.65);
  paint(ctx,Q([[-10,49],[-6,50],[13,32],[10,29]],5),{fill:SW.leather,w:1.1,depth:1,speck:.4});
  const b=U(5,-1,40);
  flat(ctx,[[b.x,b.y-3],[b.x+3,b.y],[b.x,b.y+3],[b.x-3,b.y]],SW.brass,{w:1,depth:.6,speck:0});
  cLine(ctx,[[b.x-1,b.y],[b.x+1,b.y]],.7);
  paint(ctx,Q([[15,33],[-15,33],[-15,27],[15,27]],5),{fill:SW.leather,w:1.4,depth:1,speck:.3});
  const k=U(6,0,30);   // belt buckle
  flat(ctx,[[k.x-3.5,k.y-3],[k.x+3.5,k.y-3],[k.x+3.5,k.y+3],[k.x-3.5,k.y+3]],SW.brass,{w:1,depth:.4,speck:0});
  flat(ctx,[[k.x-2,k.y-1.7],[k.x+2,k.y-1.7],[k.x+2,k.y+1.7],[k.x-2,k.y+1.7]],SW.leather,{w:.6,depth:0,speck:0});
  paint(ctx,Q([[10,29],[18,29],[18,21],[11,20]],6),{fill:SW.leather,w:1.1,depth:1,speck:.3});
  pLineE(ctx,Q([[11,27],[14,25],[17,27]],6),.65);
}
function cape(ctx,rf,P) {
  const U=rf.U,Q=arr=>arr.map(([b,z])=>U(-7,b,z));
  paint(ctx,Q([[-13,52],[-19,42],[-23,18+P.tail],[-20,14+P.tail],[-16,16],[-13,12],
    [-8,15],[-4,12],[3,14],[8,12],[12,15],[17,12-P.tail],[23,17-P.tail],[19,42],[13,52]]),
    {fill:SW.greenDark,w:1.8,depth:2,speck:.9,speckScale:.35,amp:.3});
}
function mantle(ctx,rf) {
  const U=rf.U,Q=(arr,a=3)=>arr.map(([b,z])=>U(a,b,z));
  paint(ctx,Q([[-14,52],[-22,48],[-27,37],[-17,39],[0,46],[17,39],[27,38],[22,48],[12,53],[0,50]]),
    {fill:SW.green,w:1.7,depth:1.5,speck:.7,speckScale:.35,amp:.3});
  pLineE(ctx,Q([[-23,41],[-8,45],[0,47],[12,44],[23,41]],4),.7);
  const b=U(6,0,46);
  oval(ctx,b.x,b.y,2.9,2.9,SW.brass,{w:1,speck:.2});
  oval(ctx,b.x,b.y,1.6,1.6,SW.brass,{w:.6,depth:0,speck:0});
}
/** Retained authoring helper; the character itself now uses elbow IK. */
export function drawArmE(ctx,s,h,fill,cuff) {
  paint(ctx,taperPts(s,h,4.3,3.1),{fill,w:1.4,depth:1.5,speck:.4});
  if(cuff)oval(ctx,h.x,h.y,3.5,2,cuff,{w:1});
  return {ux:h.x-s.x,uy:h.y-s.y};
}
/** Side views: ready guard, far-hand draw-back facing left, strike along the travel direction. */
function sideSword(P,rf,dirKey,action,t) {
  const readyDir=nrm3(SIDE_READY.slice(3)),restDir=nrm3(REST.slice(3));
  const toReady=(sw,rest)=>{
    sw.hand=sw.hand.map((v,i)=>v+(SIDE_READY[i]-REST[i])*rest);
    sw.dir=nrm3(sw.dir.map((v,i)=>v+(readyDir[i]-restDir[i])*rest));
  };
  // The guard and the whole swing point along the travel direction, not toward the camera.
  if(action!=='attack') { toReady(P.sword,1); P.sword.dir=travelDir(rf,P.sword.dir); return; }
  const adjust=(sw,q)=>{
    // SWING leaves REST by .28 and rejoins it from .64.
    toReady(sw,keyframes([[0,[1]],[.28,[0]],[.64,[0]],[1,[1]]],q)[0]);
    if(dirKey==='L') {
      // Facing left the sword hand is far: the overhead wind-up hides behind the
      // head. Draw it back behind the shoulders so the blade shows past the back.
      const w=keyframes([[0,[0]],[.12,[0]],[.24,[1]],[.34,[1]],[.4,[0]],[1,[0]]],q)[0];
      sw.hand=vlerp(sw.hand,[-20,-17,46],w);sw.dir=nrm3(vlerp(sw.dir,[-.95,0,.3],w));
    }
    sw.dir=travelDir(rf,sw.dir);
  };
  const u=((t%ATTACK_T)+ATTACK_T)%ATTACK_T/ATTACK_T;
  adjust(P.sword,u);
  if(P.trail) {
    const start=Math.max(.4,u-.1),end=Math.min(u,.64);
    P.trail.pts.forEach((q,i)=>adjust(q,lerp(start,end,i/8)));
  }
}
function armJoints(P,right) {
  const S=[0,right?-13:13,48],H=right?P.sword.hand:P.shield.hand;
  // Let the sword elbow hang below the shoulder instead of flaring sideways.
  // Keep the same fixed bone lengths and hand target throughout the swing.
  const bend=right?[-3,-2,-16]:[1,12,-5];
  return {S,E:ik2(S,H,13,14,bend),H};
}
function clothedArm(ctx,rf,j,part) {
  const S=rf.U(...j.S),E=rf.U(...j.E),H=rf.U(...j.H);
  if(part==='upper') {
    paint(ctx,taperPts(S,E,4.9,3.8),{fill:SW.cream,w:1.5,depth:1.5,speck:.65,speckScale:.3});
    const w={x:lerp(S.x,E.x,.85),y:lerp(S.y,E.y,.85)};
    cLine(ctx,[[w.x-2,w.y],[w.x+1,w.y+1],[w.x+3,w.y-1]],.65);
  } else {
    paint(ctx,taperPts(E,H,3.6,2.7),{fill:SW.leather,w:1.5,depth:1.4,speck:.5,speckScale:.3});
    const dx=H.x-E.x,dy=H.y-E.y,L=Math.hypot(dx,dy)||1;
    for(const t of [.35,.68]) {
      const x=lerp(E.x,H.x,t),y=lerp(E.y,H.y,t);
      cLine(ctx,[[x-dy/L*3,y+dx/L*3],[x+dy/L*3,y-dx/L*3]],1);
      oval(ctx,x-dy/L*2,y+dx/L*2,.7,.7,SW.brass,{w:.4,depth:0,speck:0});
    }
  }
}
export function drawHeroRig(ctx,x,y,dirKey,action,t,scale=1,opts={}) {
  const P=computePose(action,t),rf=rigFrame(dirKey,P.body),{dir,U,sx}=rf;
  sideSword(P,rf,dirKey,action,t);
  const parts=[],R=armJoints(P,true),L=armJoints(P,false);
  const hand=U(...R.H),sHand=U(...L.H),hc=U(1.5,0,67);
  const tipOf=(h,d,len)=>U(...h.map((v,i)=>v+d[i]*len));
  const tip=tipOf(P.sword.hand,P.sword.dir,38);
  // Blade, hand and sleeve layer against the head sphere: behind it, between it and the torso, or in front.
  const layer=p=>{
    const q=U(...p),depth=q.d-hc.d,dx=q.x-hc.x,dz=Math.max(0,Math.abs(p[2]-67)-3);
    const surface=Math.SQRT2*Math.sqrt(Math.max(0,22*22-dx*dx-dz*dz));
    return (depth>surface?110:depth>0?10:-20)+depth*.01;
  };
  const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
  parts.push(...legParts2(ctx,rf,P,SWORD_LEGS));
  // Cape behind the torso. Feet remain unobscured.
  parts.push({id:'cape',d:-80,draw:()=>cape(ctx,rf,P)});
  parts.push({id:'torso',d:0,draw:()=>drawSwordTorso(ctx,rf,P)});
  parts.push({id:'mantle',d:25,draw:()=>mantle(ctx,rf)});
  parts.push({id:'head',d:100,draw:()=>drawSwordHead(ctx,hc,sx,P)});
  for(const [part,point] of [['upper',mid(R.S,R.E)],['fore',mid(R.E,R.H)]])
    parts.push({id:'sword-'+part,d:part==='upper'?Math.min(24,layer(point)):layer(point),draw:()=>clothedArm(ctx,rf,R,part)});
  parts.push({id:'swordArm',d:layer(R.H)+.001,draw:()=>{
    // The short pen arc shares the sword's depth, never overlays a nearer shield.
    if(P.trail) {
      const edge=P.trail.pts.map(q=>tipOf(q.hand,q.dir,38));
      ctx.save();ctx.globalAlpha=.22*P.trail.alpha;
      strokePath(ctx,edge,1.4,false,SW.cream);ctx.restore();
    }
    drawSword2(ctx,hand.x,hand.y,tip.x-hand.x,tip.y-hand.y,Math.max(9,Math.hypot(tip.x-hand.x,tip.y-hand.y)-8));
    mittenHand(ctx,hand,tip.x-hand.x,tip.y-hand.y,3.3,SW.leather,{thumbSide:-sx});
  }});
  // A constant shield plane and fixed body clearance avoid view-dependent swaps.
  // The shield turns with the chest (rf.turn).
  const normal=bodyToWorld(dir,...chestToLegs(rf.turn,1,.12)),tan=bodyToWorld(dir,...chestToLegs(rf.turn,-.12,1));
  const hAxis={x:(tan.X-tan.Y)*KX,y:(tan.X+tan.Y)*KY};
  const thick={x:-(normal.X-normal.Y)*KX*2,y:-(normal.X+normal.Y)*KY*2};
  // Facing left the shield arm is near; facing right it is far.
  const nearShield=dirKey==='L';
  const shieldDepth=nearShield?30:-40,leftDepth=nearShield?20:-41;
  parts.push({id:'shield',d:shieldDepth,draw:()=>drawShield2(ctx,sHand,hAxis,thick,20)});
  parts.push({id:'shieldArm',d:leftDepth,draw:()=>{
    clothedArm(ctx,rf,L,'upper');clothedArm(ctx,rf,L,'fore');
    mittenHand(ctx,sHand,sHand.x-U(...L.E).x,sHand.y-U(...L.E).y,3.2,SW.leather);
    // Asymmetric leather shoulder guard is always on the anatomical left.
    const s=U(...L.S);
    flat(ctx,[[s.x-6,s.y],[s.x-5,s.y-6],[s.x+2,s.y-7],[s.x+7,s.y-2],[s.x+5,s.y+4]],
      SW.leather,{w:1.3,depth:1,speck:.4});
    oval(ctx,s.x+3,s.y,.8,.8,SW.brass,{w:.5,depth:0,speck:0});
  }});
  renderRig(ctx,x,y,scale,parts,{prefix:'hero',boil:0,shadow:opts.shadow});
  const screen=p=>({x:x+p.x*scale,y:y+p.y*scale});
  return {swordHand:screen(hand),shieldHand:screen(sHand),order:parts.map(p=>p.id),pose:P};
}
export const swordsman=Object.freeze({
  id:'swordsman',label:'剣士',kind:'humanoid',draw:drawHeroRig,
  actions:{idle:{period:TAU/2.4,frames:16},walk:{period:1/WALK_HZ,frames:10},
    attack:{period:ATTACK_T,frames:14,once:true}},
  frameBox:{x0:-82,x1:82,y0:-126,y1:24},
  equipment:{rightHand:'sword',leftHand:'shield'},
});
