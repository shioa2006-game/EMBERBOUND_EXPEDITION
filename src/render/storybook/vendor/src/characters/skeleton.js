/** Skeleton-specific proportions; shared Inkstone projection, ink and part sorting.
 * Body coordinates: a = forward, b = anatomical LEFT, z = up.
 * Never mirror the assembled character: sword R (b < 0), shield L (b > 0).
 */
import { seed } from '../core/random.js';
import { DRAW } from '../core/settings.js';
import { TAU, V, ellipsePts } from '../core/geometry.js';
import { PAL } from '../core/palette.js';
import { clipPath, roughen, strokePath } from '../core/ink.js';
import { paint, paintA, taperPts } from '../core/paint.js';
import { DIRS, cLine, chestToLegs, footProj, rigFrame, renderRig, travelDir, vlerp, walkFeet, WALK_HZ, ik2, keyframes, nrm3 } from './rig.js';

const C = { bone: '#f5e7cd', light: '#fff1d3', hollow: '#29241d', steel: '#99988e',
  edge: '#c3beb0', rust: '#80684e', wood: '#94704d', leather: '#765039', cloth: '#9a6749' };
const shape = (ctx, pts, fill, o = {}) => paintA(ctx, pts, { fill, w: 1.6, depth: 1.4, light: .15, speck: .7, speckScale:.4, amp: .25, step:3, ...o });
const oval = (ctx, x, y, rx, ry, fill, o = {}) => paint(ctx, ellipsePts(x,y,rx,ry,24), {fill,w:1.4,depth:1, speck:.25,amp:.2,...o});
const xy = p => [p.x,p.y];

// Cinder Guard standard: ~2.2 heads, ~90 px crown above the ground at scale 1.
// Re-space authored joints (not the finished canvas): round skull, joint caps,
// shield and pen widths retain their shapes. This mapping is constant in time.
const statureZ = z => z <= 6 ? z : z <= 40 ? 6 + (z-6)*20/34 : 26 + (z-40)*5/6;
const SKULL_SCALE = .95;
const WAIST_Z = statureZ(40);
function skeletonFrame(direction, P) {
  const base=rigFrame(direction,[0,0,0]);
  const J=(a,b,z)=>{const p=base.W(a+(P.lean??0),b,z);return {...p,y:p.y+P.bob};};
  // Upper body (ribs, skull, arms, shield): side views turn it toward the camera by
  // base.turn like the shared U; pelvis and legs keep J / W. Identical when turn = 0.
  const JU=(a,b,z)=>{const p=base.W(...chestToLegs(base.turn,a+(P.lean??0),b),z);return {...p,y:p.y+P.bob};};
  return {...base,J,W:(a,b,z)=>J(a,b,statureZ(z)),JU,WU:(a,b,z)=>JU(a,b,statureZ(z))};
}

/** Preserve the previous helper signatures for direct module users. */
export function bone(ctx,x1,y1,x2,y2,r=2.2) {
  const a={x:x1,y:y1},b={x:x2,y:y2};
  paint(ctx,taperPts(a,b,r*.65,r*.65),{fill:C.bone,w:1.35,depth:.6,speck:.12,amp:.15});
  for(const p of [a,b]) oval(ctx,p.x,p.y,r*1.12,r*.85,C.light,{w:1.1,depth:.5,speck:0});
}
export function boneStroke(ctx,arr,w=2.4) {
  const pts=roughen(V(arr),false,.16,4);
  strokePath(ctx,pts,w+1.8*DRAW.lw,false,PAL.ink);
  strokePath(ctx,pts,w,false,C.bone);
}

/** A chipped broad blade, guard, leather grip and ring pommel; grip is origin. */
export function drawSword(ctx,hx,hy,dx,dy,len=43) {
  const L=Math.hypot(dx,dy)||1, ux=dx/L,uy=dy/L,nx=-uy,ny=ux;
  const P=(a,b)=>[hx+ux*a+nx*b,hy+uy*a+ny*b];
  shape(ctx,[P(5,-3.8),P(len-7,-3),P(len+5,0),P(len-5,3.5),P(len-13,3.8),
    P(len-15,1.9),P(len-18,3.8),P(19,4),P(17,2.3),P(14,4),P(5,3.8)],C.steel,{w:1.8,depth:1.3,speck:.65});
  shape(ctx,[P(7,-2.3),P(len-6,-1.8),P(len+3,0),P(8,.5)],C.edge,{w:0,depth:0,speck:.25});
  cLine(ctx,[P(9,.5),P(len-5,.2)],.6);
  cLine(ctx,[P(len-10,-2),P(len-12,0),P(len-9,1.2)],.7);
  shape(ctx,[P(3,-8),P(6,-8.5),P(6,8.5),P(3,8)],C.rust,{w:1.5});
  shape(ctx,[P(-9,-2.2),P(3,-2),P(3,2),P(-9,2.2)],C.leather,{w:1.3});
  for(let i=-7;i<2;i+=3)cLine(ctx,[P(i,-1.8),P(i+1.8,1.8)],.65);
  oval(ctx,...P(-11,0),3,3,C.rust,{w:1.3});
  oval(ctx,...P(-11,0),1.1,1.1,C.hollow,{w:.5,depth:0,speck:0});
}

export function drawRoundShield(ctx,cx,cy,rx,ry) {
  const shell=oval(ctx,cx,cy,rx,ry,C.steel,{w:2,depth:2,speck:.7});
  const inner=oval(ctx,cx,cy,rx-3,ry-3,C.wood,{w:1,depth:1.4,speck:.65});
  ctx.save();clipPath(ctx,inner);
  for(let k=-2;k<=2;k++){
    const xx=cx+k*(rx-3)*.37;
    cLine(ctx,[[xx,cy-ry],[xx+1,cy+ry]],.8);
    cLine(ctx,[[xx+2,cy-ry*.6],[xx+3,cy],[xx+2,cy+ry*.5]],.45);
  }
  ctx.restore();
  for(let i=0;i<8;i++){const a=i*TAU/8;oval(ctx,cx+Math.cos(a)*(rx-1.5),cy+Math.sin(a)*(ry-1.5),.95,1,C.edge,{w:.65,depth:.3,speck:0});}
  oval(ctx,cx,cy,rx*.29,ry*.27,C.edge,{w:1.4,depth:1.8,speck:.8});
  cLine(ctx,[[cx-rx*.13,cy-ry*.11],[cx-rx*.08,cy-ry*.2],[cx+rx*.06,cy-ry*.19]],.65);
  // A few stable gouges, not a noise field.
  cLine(ctx,[[cx-rx*.6,cy+4],[cx-rx*.45,cy+8]],.8);
  void shell;
}

export const SKELETON_ATTACK_T = 1.2;
export const SKELETON_ATTACK_KEYS = Object.freeze([0,.08,.18,.28,.36,.4,.44,.48,.52,.58,.66,.76,.88,.96]);
// Swordsman's overhead cut, retargeted to the RIGHT arm's actual short bones.
// Each key couples a reachable hand position with a unit blade direction.
// These z values are already physical: never apply statureZ to them again.
const REST_BLADE = nrm3([3,-29,40]);
const SLASH = [[0,[9,-29,33.5,...REST_BLADE]],
  [.28,[-4,-27,57,...nrm3([-.75,-.2,.62])]],
  [.4,[2,-25,64,...nrm3([.45,-.05,.9])]],
  [.52,[15,-11,34,...nrm3([.85,.25,-.45])]],
  [.66,[12,-6,29,...nrm3([.8,.45,-.48])]],
  [.86,[8,-23,31,...nrm3([.25,-.45,.86])]],
  [1,[9,-29,33.5,...REST_BLADE]]];
const rotatePitch = ([a,b,z],angle) => [a*Math.cos(angle)+z*Math.sin(angle),b,-a*Math.sin(angle)+z*Math.cos(angle)];
const plus = (a,b) => a.map((v,i)=>v+b[i]);
const minus = (a,b) => a.map((v,i)=>v-b[i]);
const actual = ([a,b,z]) => [a,b,statureZ(z)];
// Physical z: a forward ready guard in front of the chest, with the
// blade tilted forward and up in both facings (docs/SIDE_VIEW_GUIDE.md 2.9). At its side the
// right hand projects behind the body facing right, where the resting blade pointed backward.
const SIDE_READY = [16,-12,33.5,.8,0,.6];
/** Side views: the attack eases out of and back into SIDE_READY, draws back behind the
 * shoulders facing left (far sword hand), and keeps the blade on the travel direction. */
function sideSlash(P,direction) {
  const A=P.attack,readyDir=nrm3(SIDE_READY.slice(3));
  const rest=keyframes([[0,[1]],[.28,[0]],[.66,[0]],[1,[1]]],A.u)[0];
  A.hand=vlerp(A.hand,SIDE_READY.slice(0,3),rest);A.dir=nrm3(vlerp(A.dir,readyDir,rest));
  if(direction==='L') {
    const w=keyframes([[0,[0]],[.12,[0]],[.24,[1]],[.36,[1]],[.44,[0]],[1,[0]]],A.u)[0];
    A.hand=vlerp(A.hand,[-16,-24,40],w);A.dir=nrm3(vlerp(A.dir,[-.95,0,.3],w));
  }
  // Facing right the travel turn swings this right-hand blade inward, toward the skull:
  // pause it while the sword passes overhead so the blade goes beside the skull, not through it.
  const k=direction==='R'?keyframes([[0,[1]],[.3,[1]],[.38,[0]],[.48,[0]],[.54,[1]],[1,[1]]],A.u)[0]:1;
  A.dir=travelDir({turn:DIRS[direction].turn,yaw:0},A.dir,k);
}

/** Existing one-argument idle entry remains valid; articulated actions are opt-in. */
export function skeletonPose(t=0,action='idle') {
  const phase=t*3.1;
  const P={ rock:Math.sin(phase)*.012, jaw:Math.max(0,Math.sin(phase))*.45,
    bob:0, footL:[0,0,0],footR:[0,0,0],pitchL:0,pitchR:0,elbowPitchR:0,bladePitch:0,
    hipL:[0,8,37],hipR:[0,-8,37],kneeL:[1,12,21],kneeR:[1,-12,21],
    ankleL:[0,13,6],ankleR:[0,-13,6],
    shoulderL:[0,13,64],elbowL:[2,22,54],handL:[10,25,47],
    shoulderR:[0,-13,64],elbowR:[1,-23,52],handR:[9,-29,49] };
  if(action==='walk') {
    const feet=walkFeet(t);
    P.footL=[feet.footL[0],0,feet.footL[2]*.6];
    P.footR=[feet.footR[0],0,feet.footR[2]*.6];
    P.rock=Math.sin(feet.ph)*.018;P.jaw=0;
    P.pitchR=Math.sin(feet.ph)*.13;P.pitchL=-Math.sin(feet.ph)*.07;
    P.elbowPitchR=P.pitchR;P.bladePitch=P.pitchR;
  } else if(action==='attack') {
    const u=((t%SKELETON_ATTACK_T)+SKELETON_ATTACK_T)%SKELETON_ATTACK_T/SKELETON_ATTACK_T;
    const k=keyframes(SLASH,u);
    P.attack={u,hand:k.slice(0,3),dir:nrm3(k.slice(3)),
      weight:keyframes([[0,[0]],[.08,[1]],[.92,[1]],[1,[0]]],u)[0],
      shield:keyframes([[0,actual(P.handL)],[.28,[9,24,39]],
        [.52,[2,18,39]],[.7,[2,18,39]],[1,actual(P.handL)]],u)};
    P.lean=keyframes([[0,[0]],[.28,[-1.2]],[.52,[2.5]],[.7,[2.5]],[1,[0]]],u)[0];
    P.footR=keyframes([[0,[0,0,0]],[.28,[0,0,0]],[.42,[2,0,1.5]],
      [.52,[4,0,0]],[.7,[4,0,0]],[1,[0,0,0]]],u);
    P.rock=0;P.jaw=0;
  }
  return P;
}

// Fixed projected bone lengths, with the same foot-ground correction as the room.
// Lower the pelvis only enough for both ankle targets to remain reachable. The
// two-bone solve then bends each knee instead of stretching a bone toward a foot.
function walkingLegs(rf,P) {
  const rest={};
  const base=P.attack?skeletonFrame(rf.dir.key,{bob:0}):rf;
  for(const side of ['L','R']) {
    const h=rf.W(...P['hip'+side]),restHip=base.W(...P['hip'+side]),k=base.W(...P['knee'+side]);
    const a=footProj(rf.dir,...P['ankle'+side]);
    const foot=P['foot'+side],target=footProj(rf.dir,foot[0],side==='L'?13:-13,6+foot[2]);
    const l1=Math.hypot(k.x-restHip.x,k.y-restHip.y),l2=Math.hypot(a.x-k.x,a.y-k.y);
    rest[side]={h,target,l1,l2};
  }
  for(const {h,target,l1,l2} of Object.values(rest)) {
    const reach=(l1+l2)*.985,dx=target.x-h.x;
    P.bob=Math.max(P.bob,target.y-Math.sqrt(Math.max(0,reach*reach-dx*dx))-h.y);
  }
  if(P.attack)P.bob*=P.attack.weight;
  P.legs={};
  const f=rf.J(8,0,0),o=rf.J(0,0,0);
  for(const side of ['L','R']) {
    const {h,target,l1,l2}=rest[side],hip={...h,y:h.y+P.bob};
    const knee=ik2([hip.x,hip.y,0],[target.x,target.y,0],l1,l2,[f.x-o.x,f.y-o.y-1,0]);
    P.legs[side]={hip,knee:{x:knee[0],y:knee[1]},ankle:target};
  }
}

function leg(ctx,rf,P,side) {
  const hip=P.legs?.[side].hip??rf.W(...P['hip'+side]),knee=P.legs?.[side].knee??rf.W(...P['knee'+side]);
  // Both ankle and toes use the same ground projection as the room.
  const sign=side==='L'?1:-1,ankle=P.legs?.[side].ankle??footProj(rf.dir,...P['ankle'+side]);
  const offset=P['foot'+side],F=(a,b,z)=>footProj(rf.dir,a+offset[0],b,z+offset[2]);
  bone(ctx,...xy(hip),...xy(knee),2.7);bone(ctx,...xy(knee),...xy(ankle),2.3);
  const heel=F(-2,13*sign,2),toe=F(5,13*sign,2);
  paint(ctx,taperPts(heel,toe,3.1,3.6),{fill:C.bone,w:1.4,depth:.7,speck:.2,amp:.2});
  for(let k=-1;k<=1;k++){
    const p=F(5,13*sign+k*2.5,2),q=F(10-Math.abs(k)*1.5,13*sign+k*2.5,1.5);
    paint(ctx,taperPts(p,q,1.5,1.7),{fill:C.bone,w:1,depth:.4,speck:0,amp:.15});
    const mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};
    cLine(ctx,[[mid.x-.8,mid.y-.4],[mid.x+.8,mid.y+.4]],.5);
  }
  const k=knee;
  shape(ctx,[[k.x-4.5,k.y-3],[k.x,k.y-5.5],[k.x+4.5,k.y-2],[k.x+3.8,k.y+4],[k.x-3.4,k.y+4]],C.steel,{w:1.3,speck:.55});
  oval(ctx,k.x,k.y,1,1,C.edge,{w:.6,speck:0});
  const a=ankle,m={x:(a.x+k.x)/2,y:(a.y+k.y)/2};
  shape(ctx,[[m.x-3.2,m.y-3],[m.x+3.2,m.y-2],[m.x+3,m.y+1],[m.x-3.2,m.y]],C.leather,{w:1});
  // Left shin has a small iron plate; right remains strapped bone.
  if(side==='L')shape(ctx,[[m.x-2.6,m.y],[m.x+2.8,m.y],[a.x+3.4,a.y-1],[a.x-3.4,a.y-1]],C.steel,{w:1.1,speck:.5});
}

function pelvis(ctx,rf) {
  const W=rf.W, poly=(arr,color,o)=>paint(ctx,arr.map(p=>W(...p)),{fill:color,w:1.3,depth:.8,speck:.2,amp:.2,...o});
  poly([[0,-10,40],[0,10,40],[2,10,34],[2,5,32],[2,0,35],[2,-5,32],[2,-10,34]],C.bone);
  // Torn leather skirt, with actual leg gaps instead of a solid robe.
  poly([[5,-12,38],[5,12,38],[5,14,29],[5,9,31],[5,7,25],[5,4,29],[5,0,23],[5,-4,27],[5,-8,24],[5,-10,31],[5,-14,28]],C.cloth,{speck:.6});
  poly([[-5,-11,38],[-5,11,38],[-5,13,29],[-5,7,31],[-5,4,26],[-5,-2,30],[-5,-7,27],[-5,-12,31]],C.leather);
  poly([[6,-12,41],[6,12,41],[6,12,37],[6,-12,37]],C.leather,{w:1.6});
  poly([[7,-3,41.5],[7,3,41.5],[7,3,36.8],[7,-3,36.8]],C.edge,{w:1});
  poly([[7.1,-1.8,40.4],[7.1,1.8,40.4],[7.1,1.8,38],[7.1,-1.8,38]],C.leather,{w:.7});
}

function torso(ctx,rf) {
  const W=rf.WU;
  // Back arch of ribs first. Foreground ribs then join the sternum or spine.
  for(let i=0;i<4;i++){
    const z=61-i*4.8,b=12-i*.8;
    const arc=[[-3,-b,z],[-6,-b*.7,z-2],[-6,0,z-3],[-6,b*.7,z-2],[-3,b,z]];
    boneStroke(ctx,arc.map(p=>xy(W(...p))),2.2);
  }
  for(let i=0;i<6;i++){
    const p=W(-3,0,43+i*4);oval(ctx,p.x,p.y,2.8,1.8,C.bone,{w:1,depth:.6,speck:0});
  }
  for(let i=0;i<4;i++){
    const z=61-i*4.8,b=12-i*.8;
    const arc=[[-2,-b,z],[4,-b,z-2],[7,-b*.55,z-4],[7,0,z-3],[7,b*.55,z-4],[4,b,z-2],[-2,b,z]];
    boneStroke(ctx,arc.map(p=>xy(W(...p))),2.3);
  }
  boneStroke(ctx,[xy(W(8,0,64)),xy(W(8,0,48))],3);
  boneStroke(ctx,[[0,-13,64],[3,-6,65],[2,0,64],[3,6,65],[0,13,64]].map(p=>xy(W(...p))),2.5);
  for(let i=0;i<3;i++){const p=W(0,0,66+i*2.8);oval(ctx,p.x,p.y,3,1.5,C.bone,{w:1,speck:0});}
  const a=8;
  paint(ctx,[[a,11,65],[a,14,62],[a,-10,42],[a,-13,45]].map(p=>W(...p)),{fill:C.leather,w:1.4,depth:.7,speck:.3,amp:.2});
  const p=W(a,3,56);
  shape(ctx,[[p.x-3,p.y-2],[p.x,p.y-5],[p.x+4,p.y-1],[p.x+1,p.y+2]],C.edge,{w:1,depth:.5,speck:0});
}

function skull(ctx,rf,jaw) {
  const h=rf.WU(0,0,88);
  ctx.save();ctx.translate(h.x,h.y);
  // Only the symmetric skull/face view uses sx. Limbs and equipment are projected independently.
  ctx.scale(rf.sx*SKULL_SCALE,SKULL_SCALE);
  seed('skeleton-skull');
  const outline=[[-23,4],[-25,-5],[-22,-16],[-14,-23],[-3,-26],[10,-24],[20,-17],[24,-6],[23,5],[19,11],[12,13],[7,17],[-5,17],[-14,13],[-21,10]];
  shape(ctx,outline,C.bone,{w:2.3,depth:2.5,light:.3,speck:2,amp:.3});
  for(let i=0;i<4;i++)cLine(ctx,[[-22+i*1.4,4+i*.8],[-20+i*1.4,7+i*.8]],.45);
  // Separate chin and four broad teeth; cheek notches shape the silhouette.
  seed('skeleton-jaw');ctx.save();ctx.translate(0,jaw);
  shape(ctx,[[-9,10],[-3,13],[6,14],[17,9],[16,17],[12,18],[11,21],[7,21],
    [6,19],[3,21],[0,21],[-1,18],[-4,20],[-7,18]],C.bone,{w:1.6,depth:1,speck:.15});
  for(const [xx,yy] of [[-3,16],[2,17],[7,16],[12,14]]) cLine(ctx,[[xx,yy-1],[xx,yy+3]],.85);
  ctx.restore();seed('skeleton-face');
  // Large uneven sockets, no cute white pupils: skull, not a masked human.
  shape(ctx,[[-12,-1],[-9,-7],[-3,-8],[1,-4],[1,4],[-3,8],[-10,7],[-13,3]],C.hollow,{w:1.4,depth:0,speck:0});
  shape(ctx,[[12,-6],[16,-11],[20,-10],[21,-5],[20,2],[17,5],[13,4]],C.hollow,{w:1.2,depth:0,speck:0});
  shape(ctx,[[6,4],[8,8],[7,11],[4,11],[3,9]],C.hollow,{w:.8,depth:0,speck:0});
  cLine(ctx,[[-20,7],[-15,8],[-14,11],[-9,12]],.9);
  cLine(ctx,[[-9,-22],[-11,-17],[-7,-13],[-9,-9]],.75);
  cLine(ctx,[[-11,-17],[-15,-16]],.6);
  ctx.restore();
}

function armPose(P,side,direction) {
  const S=actual(P['shoulder'+side]),restE=actual(P['elbow'+side]),restH=actual(P['hand'+side]);
  if(P.attack) {
    const H=side==='R'?P.attack.hand:P.attack.shield;
    const length=v=>Math.hypot(...v);
    const E=ik2(S,H,length(minus(restE,S)),length(minus(restH,restE)),minus(restE,S));
    return {S,E,H,tip:plus(H,P.attack.dir.map(v=>v*length([3,-29,40])))};
  }
  if(side==='R') {
    const H=plus(SIDE_READY.slice(0,3),[P.pitchR*6,0,0]),length=v=>Math.hypot(...v);
    const E=ik2(S,H,length(minus(restE,S)),length(minus(restH,restE)),minus(restE,S));
    const dir=travelDir({turn:DIRS[direction].turn,yaw:0},nrm3(SIDE_READY.slice(3)));
    return {S,E,H,tip:plus(H,dir.map(v=>v*length([3,-29,40])))};
  }
  const pitch=P['pitch'+side],E=plus(S,rotatePitch(minus(restE,S),pitch));
  const H=plus(E,rotatePitch(minus(restH,restE),side==='R'?P.elbowPitchR:pitch));
  const tip=plus(H,rotatePitch(minus(actual([12,-58,97]),actual(P.handR)),P.bladePitch));
  return {S,E,H,tip};
}
function shieldAtHand(ctx,rf,H) {
  // Fixed body plane, following the same grip as the left arm.
  const v=rf.WU(-.12,1,0),o=rf.WU(0,0,0),tangent={x:v.x-o.x,y:v.y-o.y},k=Math.hypot(tangent.x,tangent.y);
  ctx.save();ctx.translate(H.x,H.y+1);
  ctx.transform(tangent.x/k,tangent.y/k,0,1,0,0);
  drawRoundShield(ctx,0,0,15.5,21.5);ctx.restore();
}
function arm(ctx,rf,P,side,part='all') {
  const joints=armPose(P,side,rf.dir.key),S=rf.JU(...joints.S),E=rf.JU(...joints.E),H=rf.JU(...joints.H);
  if(part==='all'||part==='upper')bone(ctx,...xy(S),...xy(E),2.3);
  if(part==='all'||part==='fore') {
    bone(ctx,...xy(E),...xy(H),2);
    // Paired radius/ulna line reads as bone at normal scale.
    if(P.attack) {
      const dx=H.x-E.x,dy=H.y-E.y,L=Math.hypot(dx,dy)||1;
      cLine(ctx,[[E.x-dy/L*.7,E.y+dx/L*.7],[H.x-dy/L*.7,H.y+dx/L*.7]],.6);
    } else cLine(ctx,[[E.x+.7,E.y+1],[H.x+.7,H.y-1]],.6);
  }
  if(side==='L'&&(part==='all'||part==='upper'))shape(ctx,[[S.x-7,S.y+1],[S.x-5,S.y-7],[S.x+1,S.y-10],[S.x+7,S.y-5],[S.x+9,S.y+2],[S.x+1,S.y+4]],C.steel,{w:1.8,depth:1.5,speck:.7});
  if(part==='upper'||part==='fore')return;
  const cuff={x:H.x*.75+E.x*.25,y:H.y*.75+E.y*.25};
  oval(ctx,cuff.x,cuff.y,3.5,3.3,C.leather,{w:1.2,speck:.2});
  if(side==='R'){
    const tip=rf.JU(...joints.tip);
    drawSword(ctx,H.x,H.y,tip.x-H.x,tip.y-H.y,Math.hypot(tip.x-H.x,tip.y-H.y)-5);
  }
  if(P.attack&&side==='R') {
    ctx.save();ctx.translate(H.x,H.y);
    const tip=rf.JU(...joints.tip);
    let angle=Math.atan2(tip.y-H.y,tip.x-H.x)+Math.PI/2;
    if(angle>Math.PI)angle-=TAU;
    ctx.rotate(angle*P.attack.weight);
    oval(ctx,0,0,3.6,3.1,C.bone,{w:1.3,speck:.1});
    for(let k=-1;k<=1;k++)cLine(ctx,[[-2,k*1.6],[1,k*1.6+.4]],.6);
    ctx.restore();
  } else {
    oval(ctx,H.x,H.y,3.6,3.1,C.bone,{w:1.3,speck:.1});
    for(let k=-1;k<=1;k++)cLine(ctx,[[H.x-2,H.y+k*1.6],[H.x+1,H.y+k*1.6+.4]],.6);
  }
  if(side==='L') shieldAtHand(ctx,rf,H);
}

export function drawSkeletonRig(ctx,x,y,direction='R',action='idle',t=0,scale=1,opts={}) {
  const P=skeletonPose(t,action),rf=skeletonFrame(direction,P),parts=[];
  if(P.attack) sideSlash(P,direction);
  if(action==='walk'||(P.attack&&P.attack.weight>0))walkingLegs(rf,P);
  const pivot=WAIST_Z-P.bob;
  const rotateUpper=()=>{ctx.translate(0,-pivot);ctx.rotate(P.rock);ctx.translate(0,pivot);};
  for(const side of ['L','R'])parts.push({id:'leg'+side,d:rf.W(...P['hip'+side]).d,draw:()=>leg(ctx,rf,P,side)});
  parts.push({id:'pelvis',d:40,draw:()=>pelvis(ctx,rf)});
  renderRig(ctx,x,y,scale,parts,{prefix:'skeleton-legs',boil:0,shadow:opts.shadow});
  const upper=[{id:'ribs',d:0,draw:()=>torso(ctx,rf)},{id:'skull',d:100,draw:()=>skull(ctx,rf,P.jaw)}];
  for(const side of ['L','R']) {
    const joints=armPose(P,side,direction);
    if(P.attack&&P.attack.weight>0) {
      // Split the sword arm so its hand can pass in front of the skull even
      // when its elbow is farther away. Keep the left arm and its shield in one assembly.
      const layer=p=>{
        const q=rf.JU(...p),center=rf.JU(0,0,66),depth=q.d-center.d;
        const dz=Math.max(0,Math.abs(p[2]-66)-3),dx=q.x-center.x;
        const headSurface=Math.SQRT2*Math.sqrt(Math.max(0,24*24-dx*dx-dz*dz));
        return (depth>headSurface?110:depth>0?10:-10)+depth*.01;
      };
      const mid=(a,b)=>a.map((v,i)=>(v+b[i])/2);
      if(side==='L') upper.push({id:'armL',d:layer(joints.H),draw:()=>arm(ctx,rf,P,'L')});
      else for(const [part,point] of [['upper',mid(joints.S,joints.E)],['fore',mid(joints.E,joints.H)],['gear',joints.H]])
        upper.push({id:part+side,d:layer(point),draw:()=>arm(ctx,rf,P,side,part)});
    } else upper.push({id:'arm'+side,d:rf.JU(...joints.E).d,draw:()=>arm(ctx,rf,P,side)});
  }
  // A rigid upper assembly rotates around the seated lumbar joint. No scaling or
  // changing bone lengths, no independently floating shield, no time-based seeds.
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);rotateUpper();
  renderRig(ctx,0,0,1,upper,{prefix:'skeleton-upper',boil:0,shadow:false});ctx.restore();
  const screen=p=>({x:x+p.x*scale,y:y+p.y*scale});
  const upperPoint=p=>{const q=rf.JU(...p),c=Math.cos(P.rock),s=Math.sin(P.rock);return screen({x:q.x*c-(q.y+pivot)*s,y:q.x*s+(q.y+pivot)*c-pivot});};
  const right=armPose(P,'R',direction),left=armPose(P,'L',direction);
  return {pose:P,rightHand:upperPoint(right.H),leftHand:upperPoint(left.H),
    swordGrip:upperPoint(right.H),shieldGrip:upperPoint(left.H),
    feet:['L','R'].map(side=>screen(footProj(rf.dir,P['foot'+side][0],side==='L'?13:-13,P['foot'+side][2]))),
    order:[...parts,...upper].map(p=>p.id)};
}
// Keep the original direct-draw entry point; default view faces right.
export function drawSkeleton(ctx,x,y,t=0,scale=1) { return drawSkeletonRig(ctx,x,y,'R','idle',t,scale); }
export const skeleton=Object.freeze({
  id:'skeleton',label:'骸骨',kind:'humanoid',directional:true,draw:drawSkeletonRig,
  actions:{idle:{period:TAU/3.1,frames:16,index:'floor'},
    walk:{period:1/WALK_HZ,frames:24},
    attack:{period:SKELETON_ATTACK_T,keys:SKELETON_ATTACK_KEYS,once:true}},
  frameBox:{x0:-86,x1:86,y0:-124,y1:26},
  equipment:{rightHand:'sword',leftHand:'shield',leftShoulder:'pauldron'},
});
