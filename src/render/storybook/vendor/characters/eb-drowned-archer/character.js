/**
 * EMBERBOUND EXPEDITION — Drowned Archer (game id `drowned_archer`), the skeleton archer after the user's
 * reference image: an angry bare skull with a little red coral growing on top, a ragged teal skirt, seaweed
 * hanging from the cloth and the bow, and the same leather belt, wraps, quiver and bow.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): the attack plays the second half of the archer's shot, so the draw
 * reads before the arrow leaves (nocked arrow drawn back → full draw → release at 0.15 s → lower); the shared hurt.
 * Unlike the skeleton archer, the RIGHT hand holds the bow and the LEFT draws: the archer's pose is mirrored
 * across the body (b → −b) in drownedPose, and the arms are swapped in the drawing.
 */
import {
  LW, LAYER, DRAW, PAL, KX, rigFrame, renderRig, bodyToWorld, chestToLegs,
  groundDirScreen, footProj, ik2, nrm3, vlerp, yawToBody, bodyLayerKey,
  paint, paintA, ellipsePts, taperPts, cLine, mittenHand,
} from '../../src/authoring.js';
import { bone, boneStroke } from '../../src/characters/skeleton.js';
import {
  AIM_YAW, QUIVER_TOP, ARCHER_ATTACK_T, ARCHER_IDLE_PERIOD, ARCHER_RELEASE_U,
  ARROW_LEN, archerPose, bowCantSign, bowGeometry, drawArrowShape,
} from '../../src/characters/archer-pose.js';
import { drawBow, drawQuiver, bandAcross, polyStroke } from '../../src/characters/archer-parts.js';
import { hurtAction, phase, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';

const C={bone:'#f5e7cd',hollow:'#29241d',
  leather:'#88603f',dark:'#60442f',gold:'#bc9861',
  cloth:'#4f9a98',clothDark:'#356f70',weed:'#5f7a45',coral:'#d9573f'};
// Game timing: the archer's 1.7 s shot from the nocked arrow (SHOT_FROM of the way in), squeezed into 0.3 s.
export const DROWNED_ATTACK_T=.3;
const SHOT_FROM=.5;
export const DROWNED_RELEASE_U=(ARCHER_RELEASE_U-SHOT_FROM)/(1-SHOT_FROM);
// The shared cache's modulo can round the release phase down by a few ulps.
// Use a boundary a billionth early in the pose, so the release frame never shows the held arrow.
const RELEASE_FRAME=DROWNED_RELEASE_U-1e-9;
const ATTACK_KEYS=Object.freeze([0,.1,.2,.3,.4,DROWNED_RELEASE_U,.6,.7,.8,.9]);
const xy=p=>[p.x,p.y];
const shape=(ctx,pts,fill,o={})=>paintA(ctx,pts,{fill,w:LW.part,depth:1.3,
  light:.2,speck:.65,speckScale:.3,amp:.22,step:3,...o});
const oval=(ctx,x,y,rx,ry,fill,o={})=>paint(ctx,ellipsePts(x,y,rx,ry,24),
  {fill,w:1.2,depth:.7,speck:.2,speckScale:.3,amp:.16,...o});

export function drownedPose(action,t) {
  let P;
  if(action==='attack') {
    const u=phase(t,DROWNED_ATTACK_T);
    P=archerPose('attack',(SHOT_FROM+(1-SHOT_FROM)*u)*ARCHER_ATTACK_T);
    if(u>=RELEASE_FRAME) {
      // The held arrow must be absent once the game's arrow is in flight.
      P.arrow=null;P.draw=0;
      P.released=(u-DROWNED_RELEASE_U)*DROWNED_ATTACK_T;
      P.vib=Math.sin(P.released*70)*Math.exp(-P.released*18)*4;
    }
  } else if(action==='hurt') {
    const k=hurtAmount(t);P=archerPose('idle',0);
    P.body=[-2.5*k,0,-1.2*k];P.grip=[P.grip[0]-2*k,P.grip[1],P.grip[2]+3*k];P.quiverSway=2*k;
  } else {
    P=archerPose('idle',t);P.body[2]*=.45;P.quiverSway*=.5;
  }
  // Mirror across the body so the right hand holds the bow: every sideways (b) component changes sign, the
  // aim twist turns the right shoulder to the target, and the forward foot swaps.
  const nb=v=>[v[0],-v[1],v[2]];
  P.grip=nb(P.grip);P.rHand=nb(P.rHand);P.elbowL=nb(P.elbowL);P.elbowR=nb(P.elbowR);
  P.bowUp=nb(P.bowUp);P.bowFwd=nb(P.bowFwd);P.body=nb(P.body);P.yaw=-P.yaw;
  if(P.arrow?.dir)P.arrow={...P.arrow,dir:nb(P.arrow.dir)};
  const fl=P.footL,fr=P.footR;P.footL=[fr[0],9,fr[2]];P.footR=[fl[0],-9,fl[2]];
  return P;
}

/** Where the game's arrow starts (the nock at the release), for the mirrored pose. */
export function drownedReleaseInfo(dirKey) {
  const P=drownedPose('attack',RELEASE_FRAME*DROWNED_ATTACK_T-1e-4),rf=rigFrame(dirKey,[0,0,0],0);
  const w=bodyToWorld(rf.dir,...chestToLegs(rf.dir.turn,P.rHand[0]+P.body[0],P.rHand[1]+P.body[1]));
  return {nock:{x:(w.X-w.Y)*KX,y:(w.X+w.Y)*groundDirScreen(1,0).y-(P.rHand[2]+P.body[2])},f:rf.dir.f};
}

/** A strand of seaweed hanging from p, swaying a little. */
function weed(ctx,p,len,sway=0) {
  const m={x:p.x+sway*.5+1,y:p.y+len*.5},q={x:p.x+sway,y:p.y+len};
  paint(ctx,taperPts(p,m,1.5,1.1),{fill:C.weed,w:.9,depth:.4,speck:.2});
  paint(ctx,taperPts(m,q,1.1,.5),{fill:C.weed,w:.9,depth:.3,speck:.2});
}

function skull(ctx,rf) {
  const h=rf.U(1.5,0,69.5);
  ctx.save();ctx.translate(h.x,h.y);ctx.scale(rf.sx*.94,.94);
  // 47 * .94 = 44px head, top z=94; no hood or oversized accessory.
  shape(ctx,[[-23,4],[-25,-5],[-22,-16],[-14,-23],[-3,-26],[10,-24],
    [20,-17],[24,-6],[23,5],[19,11],[12,13],[7,17],[-5,17],[-14,13],[-21,10]],
    C.bone,{w:LW.outline,depth:2.2,speck:1.2});
  shape(ctx,[[-9,10],[-3,13],[6,14],[17,9],[16,17],[12,18],[11,21],
    [7,21],[6,19],[3,21],[0,21],[-1,18],[-4,20],[-7,18]],C.bone,{w:1.4,depth:.8,speck:.15});
  for(const [x,y] of [[-3,16],[2,17],[7,16],[12,14]])cLine(ctx,[[x,y-1],[x,y+3]],.75);
  shape(ctx,[[-12,-1],[-10,-7],[-3,-6],[1,-3],[1,4],[-3,8],[-10,7],[-13,3]],
    C.hollow,{w:1.2,depth:0,speck:0});
  shape(ctx,[[12,-5],[16,-10],[20,-11],[21,-5],[20,2],[17,5],[13,4]],
    C.hollow,{w:1.1,depth:0,speck:0});
  shape(ctx,[[6,4],[8,8],[7,11],[4,11],[3,9]],C.hollow,{w:.7,depth:0,speck:0});
  // Angry brow ridges sloping down toward the nose.
  cLine(ctx,[[-14,-9],[-6,-8],[2,-4]],1.5);
  cLine(ctx,[[11,-4],[16,-10],[22,-12]],1.4);
  cLine(ctx,[[-20,7],[-15,8],[-14,11],[-9,12]],.75);
  cLine(ctx,[[-10,-22],[-12,-17],[-8,-13],[-10,-9]],.65);
  cLine(ctx,[[-12,-17],[-16,-16]],.5);
  // A little red coral growing on the crown (as on the Reef Lurker's shell).
  const coral=(pts,w)=>{for(let i=0;i<pts.length-1;i++){const [ax,ay]=pts[i],[bx,by]=pts[i+1];
    paint(ctx,taperPts({x:ax,y:ay},{x:bx,y:by},w*(1-i*.18),w*(1-(i+1)*.18)),{fill:C.coral,w:1.2,depth:.8,speck:.4,speckScale:.3,amp:.15});}};
  ctx.save();ctx.translate(3,-24);ctx.scale(.68,.68);ctx.translate(-3,24);   // kept small, rooted on the crown
  coral([[0,-24],[-1,-33],[2,-40],[0,-46]],2.6);coral([[-1,-32],[-7,-36],[-8,-42]],1.8);
  coral([[1,-39],[6,-43]],1.4);coral([[6,-23],[11,-29],[11,-35]],1.9);
  for(const [x,y] of [[0,-46],[-8,-42],[6,-43],[11,-35]])oval(ctx,x,y,1.4,1.4,C.coral,{w:.9,depth:0,speck:0});
  ctx.restore();
  ctx.restore();
}

function torso(ctx,rf) {
  const U=rf.UY,Q=pts=>pts.map(p=>U(...p));
  for(let i=0;i<5;i++) {
    const p=U(-3,0,28+i*4.5);oval(ctx,p.x,p.y,2.8,1.6,C.bone,{w:.9,speck:0});
  }
  for(let i=0;i<3;i++) {
    const z=46-i*5,b=11-i;
    boneStroke(ctx,Q([[-2,-b,z],[4,-b,z-2],[7,-b*.5,z-4],[7,0,z-3],
      [7,b*.5,z-4],[4,b,z-2],[-2,b,z]]).map(xy),2.1);
  }
  boneStroke(ctx,Q([[8,0,46],[8,0,32]]).map(xy),2.5);
  boneStroke(ctx,Q([[0,-14,47],[3,-6,49],[2,0,48],[3,6,49],[0,14,47]]).map(xy),2.3);
  for(const z of [49,52]) {const p=U(0,0,z);oval(ctx,p.x,p.y,3,1.7,C.bone,{w:1,speck:0});}
  const a=9;
  // Ragged teal skirt with seaweed caught in the hem.
  paint(ctx,Q([[0,-13,27],[0,13,27],[2,17,14],[2,12,17],[2,10,9],[2,6,15],[2,2,7],
    [2,-2,14],[2,-6,8],[2,-9,15],[2,-12,10],[2,-17,15]]),
    {fill:C.cloth,w:1.6,depth:1.4,speck:.7,amp:.25});
  paint(ctx,Q([[2,-10,24],[2,8,24],[2,6,18],[2,-8,18]]),{fill:C.clothDark,w:0,depth:0,speck:.4,amp:.2});
  for(const [b,z,len] of [[11,14,9],[-4,12,11]])weed(ctx,U(2,b,z),len,1.5);
  paint(ctx,Q([[a,-14,30],[a,14,30],[a,14,26],[a,-14,26]]),
    {fill:C.dark,w:1.2,depth:.6,speck:.3,amp:.2});
  const p=U(10,0,28);
  shape(ctx,[[p.x-3,p.y-2.8],[p.x+3,p.y-2.8],[p.x+3,p.y+2.8],[p.x-3,p.y+2.8]],C.gold,{w:.8,depth:.3});
  shape(ctx,[[p.x-1.6,p.y-1.4],[p.x+1.6,p.y-1.4],[p.x+1.6,p.y+1.4],[p.x-1.6,p.y+1.4]],C.dark,{w:.5,depth:0});
}

function legs(ctx,rf,P) {
  return [1,-1].map((side,i)=>{
    const ft=i===0?P.footL:P.footR,hip=rf.W(P.body[0]*.3,side*8,24+P.body[2]*.4);
    const ankle=footProj(rf.dir,ft[0],ft[1],ft[2]+5);
    const outward=rf.W(0,side,0);
    const knee3=ik2([hip.x,hip.y,0],[ankle.x,ankle.y,0],12,13,[outward.x,-.1,0]);
    const knee={x:knee3[0],y:knee3[1]};
    return {id:'leg'+side,d:hip.d,draw:()=>{
      bone(ctx,...xy(hip),...xy(knee),2.6);bone(ctx,...xy(knee),...xy(ankle),2.2);
      const f=(a,b,z)=>footProj(rf.dir,ft[0]+a,ft[1]+b,ft[2]+z);
      const heel=f(-2,0,2),ball=f(4,0,2);
      paint(ctx,taperPts(heel,ball,3,3.4),{fill:C.bone,w:1.2,depth:.6,speck:.15});
      for(const b of [-2.5,0,2.5]) {
        const p=f(4,b,2),q=f(9-Math.abs(b)*.35,b,1.5);
        paint(ctx,taperPts(p,q,1.3,1.5),{fill:C.bone,w:.9,depth:.3,speck:0});
      }
      const cuff={x:ankle.x*.8+knee.x*.2,y:ankle.y*.8+knee.y*.2};
      bandAcross(ctx,cuff,ankle.x-knee.x,ankle.y-knee.y,3.4,2.2,C.leather);
      bandAcross(ctx,ankle,ankle.x-knee.x,ankle.y-knee.y,3.2,1.1,C.dark);
    }};
  });
}

export function drawDrownedArcher(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=drownedPose(action,t),rf=rigFrame(direction,P.body,P.yaw),U=rf.U;
  // Match the existing archer's ground-plane projection for both hands, bow and arrow.
  const groundY=groundDirScreen(1,0).y;
  // Same upper-body frame as U (side views turn the chest by rf.turn), so the bow stays in the hand.
  const UG=(a,b,z)=>{const w=bodyToWorld(rf.dir,...chestToLegs(rf.turn,a+P.body[0],b+P.body[1]));
    return {x:(w.X-w.Y)*KX,y:(w.X+w.Y)*groundY-z-P.body[2],d:w.X+w.Y};};
  const key=p=>bodyLayerKey(rf,...p);
  // The bow's cant away from the head, mirrored: the skeleton archer facing the other way, with b reversed.
  P.bowUp=nrm3([P.bowUp[0],P.bowUp[1]-bowCantSign(direction==='R'?'L':'R')*(.12+.62*-P.yaw/AIM_YAW),P.bowUp[2]]);
  const geo=bowGeometry(P),parts=legs(ctx,rf,P);
  const joints=Object.fromEntries(['L','R'].map(side=>{
    // 'L' is the bow arm and 'R' the drawing arm, as in the skeleton archer; the bow arm is now the right shoulder (b −14).
    const a=yawToBody(rf,0,side==='L'?-14:14),S=[...a,47],H=side==='L'?P.grip:P.rHand;
    return [side,{S,H,E:ik2(S,H,13.5,13.5,side==='L'?P.elbowL:P.elbowR)}];
  }));
  // Facing right the bow hand (now the right) is near.
  const nearBow=direction==='R'&&geo.nocked;
  const nockedDepth=Math.min(key(joints.L.E),key(geo.G)-.02)-.04;
  const armDepth=(side,d)=>nearBow&&side==='R'?Math.min(d,nockedDepth-.02):d;
  parts.push({id:'torso',d:LAYER.torso,draw:()=>torso(ctx,rf)});
  parts.push({id:'skull',d:LAYER.head,draw:()=>skull(ctx,rf)});
  const qa=yawToBody(rf,QUIVER_TOP[0],QUIVER_TOP[1]);
  parts.push({id:'quiver',d:Math.min(key([...qa,QUIVER_TOP[2]]),LAYER.head-1),draw:()=>drawQuiver(ctx,rf,P)});
  for(const side of ['L','R']) {
    const {S,E,H}=joints[side],s=U(...S),e=U(...E),h=UG(...H);
    const handKey=side==='R'&&H[0]>-2?[H[0]+10,H[1],H[2]]:H;
    const wrist={x:e.x+(h.x-e.x)*.8,y:e.y+(h.y-e.y)*.8};
    const m={x:(e.x+wrist.x)/2,y:(e.y+wrist.y)/2};
    parts.push({id:'upper'+side,d:Math.min(armDepth(side,key(E)),LAYER.head-.6),
      draw:()=>bone(ctx,...xy(s),...xy(e),2.4)});
    // Split forearms: the drawing elbow can be behind the body while its hand meets the string.
    for(const [id,a,b,d] of [['E',e,m,key(E)],['H',m,wrist,key(handKey)]]) {
      parts.push({id:'fore'+id+side,d:Math.min(armDepth(side,d),LAYER.head-.6),draw:()=>{
        bone(ctx,...xy(a),...xy(b),2.1);
        if(id==='H')bandAcross(ctx,wrist,h.x-e.x,h.y-e.y,3.3,2,C.leather);
      }});
    }
    const d=side==='R'&&nearBow?nockedDepth+.01:key(handKey);
    parts.push({id:'hand'+side,d,draw:()=>{
      mittenHand(ctx,h,h.x-e.x,h.y-e.y,3.5,C.bone,{thumbSide:side==='L'?rf.sx:-rf.sx});
      cLine(ctx,[[h.x-1.5,h.y],[h.x+1.5,h.y+.3]],.55);
    }});
  }
  parts.push({id:'bow',d:key(geo.G)-.02,draw:()=>{
    drawBow(ctx,UG,geo);
    // Seaweed tangled on the bow limbs.
    for(const [p,len] of [[vlerp(geo.G,geo.tipT,.7),9],[vlerp(geo.G,geo.tipB,.6),7]])weed(ctx,UG(...p),len,1);
  }});
  parts.push({id:'stringUpper',d:Math.min(key(vlerp(geo.tipT,geo.stringMid,.5)),LAYER.head-.5),
    draw:()=>polyStroke(ctx,[UG(...geo.tipT),UG(...geo.stringMid)],DRAW.lw,PAL.ink)});
  parts.push({id:'stringLower',d:key(vlerp(geo.G,geo.stringMid,.5)),
    draw:()=>polyStroke(ctx,[UG(...geo.stringMid),UG(...geo.tipB)],DRAW.lw,PAL.ink)});
  // Exactly one held arrow before release; after release only the shared projectile draws it.
  if(P.arrow) {
    const nock=UG(...P.rHand),forward=groundDirScreen(...rf.dir.f);
    let d=nrm3([forward.x,forward.y,0]),len=ARROW_LEN;
    if(P.arrow.mode==='hand') {
      const q=UG(...P.rHand.map((v,i)=>v+P.arrow.dir[i])),vx=q.x-nock.x,vy=q.y-nock.y;
      const l=Math.hypot(vx,vy)||1;d=[vx/l,vy/l,0];len*=Math.min(1,l);
    }
    const ha=P.rHand[0]>-2?[P.rHand[0]+10,P.rHand[1],P.rHand[2]]:P.rHand;
    parts.push({id:'arrow',d:nearBow?nockedDepth:(P.arrow.mode==='nock'?key(geo.G):key(ha))+.02,
      draw:()=>drawArrowShape(ctx,nock,{x:d[0],y:d[1]},len,DRAW.lw)});
  }
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),false,
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-drowned-archer',boil:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-drowned-archer',label:'Drowned Archer — EMBERBOUND',kind:'humanoid',directional:true,draw:drawDrownedArcher,
  actions:{idle:{period:ARCHER_IDLE_PERIOD,frames:16},
    attack:{period:DROWNED_ATTACK_T,keys:ATTACK_KEYS,once:true,releaseAt:DROWNED_RELEASE_U},
    hurt:hurtAction},
  frameBox:{x0:-86,x1:86,y0:-126,y1:28},
  equipment:{leftHand:'bow',rightHand:'string',back:'quiver'},
  emberbound:{gameId:'drowned_archer',heightPx:25,facing:'L'},
  projectile:{type:'arrow',releaseAt:DROWNED_RELEASE_U,origin:drownedReleaseInfo,draw:drawArrowShape,length:ARROW_LEN},
});
export const studio=Object.freeze({order:14,name:"Drowned Archer（溺れた弓兵）",category:"EMBERBOUND 第2エリア",
  description:"青緑のぼろ布と海藻をまとった骸骨の弓兵。後衛を狙う遠距離の敵。",
  preview:{direction:'L',phase:0}});
