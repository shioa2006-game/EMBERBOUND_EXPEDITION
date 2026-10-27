/**
 * EMBERBOUND EXPEDITION — Coral Knight (game id `coral_knight`, elite), the Guardian's armoured body (from the
 * Cinder Guard, characters/warrior) after the user's reference image: coral-red plate with gold trim and star
 * medallions, a closed helm with glowing teal eyes and a crest of branching coral, a teal scarf, scale mail
 * and tabard, a scallop-shell shield with a gold coral device and a golden trident with teal streamers.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): a short trident thrust (impact at 0.135 s), `cast` = the Tidebreaker
 * wind-up the game loops (trident raised high behind the shoulder, shield forward, trembling), and the shared
 * hurt. Equipment is anatomical: +b = LEFT trident hand; -b = RIGHT shield hand.
 */
import {
  TAU, DRAW, PAL, LW, KX, KY, LAYER,
  rigFrame, renderRig, footProj, legParts2, ik2, keyframes,
  nrm3, yawToBody, bodyLayerKey, bodyToWorld,
  paint, paintA, taperPts, ellipsePts, cLine, mittenHand, bbox,
  clipPath, stipplePoly, rimWeight,
} from '../../src/authoring.js';
import { hurtAction, phase, sample, hurtAmount, fallTilt, withTilt } from '../shared/emberbound/actions.js';

// Game timing (seconds).
export const CORAL_ATTACK_T = .3;    // thrust: the points land at u = .45 (0.135 s)
export const CORAL_WINDUP_T = .5;    // Tidebreaker wind-up: a loop
const KEYS = Object.freeze({ attack: [0, .1, .2, .28, .36, .45, .52, .62, .75, .88] });

const C = Object.freeze({
  steel: '#d98670', light: '#f0b39c', mid: '#c06a55', dark: '#8b4637',
  black: '#2b2b2e', cloth: '#4c8b86', clothDark: '#346763', leather: '#6b4d3e', leatherLight: '#947058',
  teal: '#3f8d8a', tealDark: '#2c6664', gold: '#cfa956', goldDark: '#9c7a35', shell: '#f1e7cf', shellDark: '#d9c9a6',
  coral: '#e07862', coralLight: '#f0a08a', iron: '#5c5a55', glow: '#7ff0e6',
});
const SHAFT_BACK = 26, SHAFT_FWD = 44, PRONG = 15;   // trident along its axis from the hand (local px)
// Upright beside the body, butt near the ground (chest UY coordinates: hand a, b, z, axis).
const READY = [12, 19, 30, .16, .05, .99];
// Thrust: draw back level, drive the points forward at u .45, hold, recover.
const THRUST = [[0, READY], [.25, [-1, 25, 38, .96, .02, .28]], [.45, [21, 25, 37, 1, -.02, .04]],
  [.62, [19, 25, 37, 1, -.02, .06]], [.85, [13, 22, 33, .55, .03, .84]], [1, READY]];
// Tidebreaker: raised high beside the shoulder, the points leaning back, away from the face.
const WINDUP = [-2, 22, 54, -.4, .05, .92];
const metal = (ctx, points, o = {}) => {
  const shape = paint(ctx, points, {
    fill: C.steel, w: LW.part, depth: 2, light: .48, speck: 1.15, amp: .3, ...o,
  });
  // Fine pen grain inside the plate, strongest near its rim (the Guardian's engraved texture).
  stipplePoly(ctx, shape, 6.4, { color: '#5a3a30', scale: .29, wfn: rimWeight(shape, .35, .5) });
  const bb = bbox(shape), w = bb.x1-bb.x0, h = bb.y1-bb.y0;
  if (w*h > 350) {
    ctx.save(); clipPath(ctx,shape);
    for (const [a,b,sl] of [[.23,.43,.08],[.72,.62,-.07],[.6,.2,.055]]) {
      const x=bb.x0+w*a,y=bb.y0+h*b;
      cLine(ctx,[[x,y],[x+w*sl,y+h*.07]],.4);
    }
    ctx.restore();
  }
  return shape;
};
const metalA = (ctx, points, o = {}) => metal(ctx, points.map(([x, y]) => ({ x, y })), o);
const line = (ctx, points, width = LW.fine) => cLine(ctx, points.map(p => Array.isArray(p) ? p : [p.x, p.y]), width);
const dot = (ctx, x, y, r = .75, fill = PAL.ink) => {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
};
/** A gold medallion with a five-pointed star. */
function medallion(ctx, x, y, r) {
  paint(ctx, ellipsePts(x, y, r, r, 16), { fill: C.gold, w: LW.detail, depth: .8, speck: .2, amp: .12 });
  paint(ctx, ellipsePts(x, y, r * .62, r * .62, 14), { fill: C.teal, w: .6, depth: 0, speck: 0, amp: .1 });
  const star = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? r * .22 : r * .5; star.push([x + Math.cos(a) * k, y + Math.sin(a) * k]); }
  paintA(ctx, star, { fill: C.gold, w: .5, depth: 0, speck: 0, amp: .05 });
}

export function coralPose(action, t) {
  const P = {
    body: [0, 0, 0], yaw: 0, footL: [0, 6, 0], footR: [0, -6, 0],
    trident: { hand: READY.slice(0, 3), dir: nrm3(READY.slice(3)) },
    shield: { hand: [8, -24, 31] }, crest: 0, scarf: 0, exert: false, travel: 0,
  };
  if (action === 'attack') {
    const u = phase(t, CORAL_ATTACK_T), k = keyframes(THRUST, u);
    P.trident = { hand: k.slice(0, 3), dir: nrm3(k.slice(3)) };
    const lean = sample([[0,[0]],[.25,[-2]],[.45,[4.5]],[.62,[3.5]],[1,[0]]],u);
    P.body = [lean, 0, sample([[0,[0]],[.25,[.8]],[.45,[-1.4]],[.62,[-1]],[1,[0]]],u)];
    P.footL = [sample([[0,[0]],[.3,[0]],[.45,[5]],[.7,[5]],[1,[0]]],u), 6, sample([[0,[0]],[.3,[0]],[.38,[2.5]],[.45,[0]],[1,[0]]],u)];
    P.shield.hand = keyframes([[0,[8,-24,31]],[.25,[9,-23,33]],[.45,[5,-24,32]],[1,[8,-24,31]]],u);
    P.crest = sample([[0,[0]],[.25,[2]],[.47,[-3]],[.7,[1]],[1,[0]]],u);
    P.scarf = -lean * .55; P.exert = u > .3 && u < .65;
    // The thrust travels along the walking direction, not toward the camera.
    P.travel = sample([[0,[0]],[.2,[1]],[.75,[1]],[.95,[0]],[1,[0]]],u);
  } else if (action === 'cast') {
    // Tidebreaker: coiled with the trident high, shield forward; every term periodic in u.
    const u = phase(t, CORAL_WINDUP_T), s = Math.sin(TAU * u * 2), c = Math.cos(TAU * u);
    P.trident = { hand: [WINDUP[0] + s * .5, WINDUP[1], WINDUP[2] + c * .6], dir: nrm3([WINDUP[3] + s * .03, WINDUP[4], WINDUP[5]]) };
    P.body = [-1.5 + s * .3, 0, -.8 + c * .3]; P.shield.hand = [14, -21, 34 + s * .4];
    P.crest = 1.5 + s; P.scarf = 1 + c * .5; P.exert = true;
  } else if (action === 'hurt') {
    const k = hurtAmount(t);
    P.body = [-2.5 * k, 0, -1.2 * k]; P.yaw = .12 * k;
    P.shield.hand = [8 - 2 * k, -23, 31 + 4 * k];
    P.trident.hand = [READY[0] - 2 * k, READY[1], READY[2] + 2 * k];
    P.crest = 3 * k; P.scarf = 1.5 * k; P.exert = k > .5;
  } else {
    const u = phase(t, TAU / 2), breathe = Math.sin(u * TAU);
    P.body[2] = breathe * .65; P.trident.hand[2] += breathe * .15; P.shield.hand[2] += breathe * .25;
    P.crest = Math.sin(u * TAU - .7) * .8; P.scarf = Math.sin(u * TAU - 1) * .5;
  }
  return P;
}

/** The Guardian's legs (legParts2) with coral knee and greave plates over teal scale leggings. */
function armoredLegs(ctx, rf, P) {
  const legs = legParts2(ctx, rf, P, {
    pants: C.cloth, boot: C.mid, sole: C.leather, bootH: .46,
    legR0: 4.5, legR1: 3.9, footR: 4, soleR: 3.5,
  });
  return legs.map((leg, i) => {
    const base = leg.draw, ft = i === 0 ? P.footL : P.footR, sign = i === 0 ? 1 : -1;
    return { ...leg, draw: () => {
      base();
      const hip = rf.W(P.body[0] * .5, sign * 6.5, 21 + P.body[2] * .6);
      const ankle = footProj(rf.dir, ft[0], ft[1], ft[2] + 5);
      const knee = { x: hip.x * .52 + ankle.x * .48, y: hip.y * .52 + ankle.y * .48 };
      metal(ctx, taperPts(knee, ankle, 3.9, 3), { fill: C.mid, depth: 1.5, speck: .7 });
      metalA(ctx, [[knee.x-4.8,knee.y-2.7],[knee.x,knee.y-4.7],[knee.x+4.8,knee.y-2],
        [knee.x+4.1,knee.y+2.7],[knee.x,knee.y+4.1],[knee.x-4.5,knee.y+2]], { depth: 1.3 });
      // A small gold scallop on the knee.
      paintA(ctx, [[knee.x-2.2,knee.y+1],[knee.x-1.6,knee.y-1.6],[knee.x,knee.y-2.4],[knee.x+1.6,knee.y-1.6],[knee.x+2.2,knee.y+1]], { fill: C.gold, w: .5, depth: 0, speck: 0, amp: .05 });
    } };
  });
}

function drawTorso(ctx, rf, P) {
  const U = rf.UY, Q = arr => arr.map(([b,z]) => U(0,b,z));
  paint(ctx, Q([[14,46],[-14,46],[-17,29],[-19,19],[-10,16],[0,18],[10,16],[19,19],[16,30]]),
    { fill:C.cloth, w:LW.outline, depth:3, speck:1.5 });
  // Scale mail at the waist: small arcs.
  for (const [b,z] of [[-12,23],[-6,23],[0,23],[6,23],[12,23],[-9,20],[-3,20],[3,20],[9,20]]) {
    const a=U(0,b,z); line(ctx,[[a.x-2,a.y-.6],[a.x,a.y+1.2],[a.x+2,a.y-.6]],.5);
  }
  metal(ctx,Q([[13,47],[-13,47],[-17,40],[-13,29],[-5,27],[5,27],[13,29],[17,40]]),
    {w:LW.outline,depth:3.4,light:.65});
  paint(ctx,Q([[11,44],[-1,46],[-1,30],[8,31],[13,39]]),{fill:C.light,w:0,depth:0,speck:.35,amp:.2});
  line(ctx,Q([[0,45],[0,33],[-2,29]]),.75);
  // A gold scallop shell on the breastplate.
  const sc=U(1,2,38);
  paintA(ctx,[[sc.x-4,sc.y+2],[sc.x-3.6,sc.y-1.5],[sc.x-1.8,sc.y-3.6],[sc.x,sc.y-4.2],[sc.x+1.8,sc.y-3.6],[sc.x+3.6,sc.y-1.5],[sc.x+4,sc.y+2],[sc.x,sc.y+3]],{fill:C.gold,w:LW.detail,depth:.6,speck:0,amp:.08});
  for(const dx of [-2,0,2]) line(ctx,[[sc.x,sc.y+2.6],[sc.x+dx*1.3,sc.y-3]],.45);
  metal(ctx,Q([[15,29],[-15,29],[-17,24],[0,22],[17,24]]),{fill:C.mid,depth:1.8});
  for (const sign of [-1,1]) {
    metal(ctx,Q([[sign*3,21],[sign*16,22],[sign*18,15],[sign*7,13],[sign*4,15]]),{depth:1.7,speck:.9});
    line(ctx,Q([[sign*6,17],[sign*15,18]]),.65);
  }
  paint(ctx,Q([[16,29],[-16,29],[-16,25.3],[16,25.3]]),{fill:C.leather,w:LW.part,depth:.9,speck:.5});
  const b=U(3,1,27.1);
  medallion(ctx,b.x,b.y,3.6);
  // Teal tabard hanging in front, with a pale coral pattern near its hem.
  const tab=U(3,0,0), T=(db,z)=>U(3,db,z);
  paint(ctx,[T(-5,26),T(5,26),T(6,8),T(3,10),T(0,7),T(-3,10),T(-6,8)],{fill:C.teal,w:LW.part,depth:1.4,speck:.8,amp:.25});
  line(ctx,[T(0,13),T(0,18),T(-2,21)],.55);line(ctx,[T(0,16),T(2,19)],.5);
  void tab;
  // Scarf drapes beneath the helmet.
  paint(ctx,[U(-2,-12,48),U(-4,-8,46),U(-8,-11,32),U(-7,-18,34+P.scarf),U(-5,-14,39)],
    {fill:C.tealDark,w:LW.part,depth:2,speck:1});
}

/** The Guardian's gorget: the head-side rim follows the head, the lower rim follows the chest. */
function drawGorget(ctx, rf, head) {
  const U = rf.UY;
  const side = Math.sign(U(0,1,48).x-U(0,0,48).x);
  const Q = (b,z,a=0) => U(a,b*side,z);
  const H = (x,y) => ({x:head.x+x, y:head.y+y});
  paint(ctx,[H(-10,14),H(10,14),Q(12,49),Q(8,44),Q(-8,44),Q(-12,49)],
    {fill:C.tealDark,w:LW.part,depth:1.5,speck:1});
  metal(ctx,[H(-9,19),H(9,19),Q(15,49),Q(12,45),Q(5,43,2),
    Q(-5,43,2),Q(-12,45),Q(-15,49)],{w:LW.part,depth:2,light:.55,speck:.8});
  line(ctx,[Q(-12,47),Q(-5,45,2),Q(5,45,2),Q(12,47)],.65);
}

function drawHelmet(ctx, c, sx, P) {
  const M = points => points.map(([x,y]) => [c.x+x*sx,c.y+y]);
  const steel = (points,o={}) => metalA(ctx,M(points),o);
  const cloth = (points,fill,o={}) => paintA(ctx,M(points),{fill,w:LW.part,depth:2,speck:1,...o});
  // Crest of branching coral rising from the crown, swaying a little.
  const sw = (pts, k=1) => pts.map(([x,y]) => [x + P.crest * k * Math.max(0, -y - 26) / 24, y]);
  const branch = (pts, w0) => {
    const q = M(sw(pts));
    for (let i = 0; i < q.length - 1; i++) {
      const r0 = w0 * (1 - i / q.length * .55), r1 = w0 * (1 - (i + 1) / q.length * .55);
      paint(ctx, taperPts({x:q[i][0],y:q[i][1]}, {x:q[i+1][0],y:q[i+1][1]}, r0, r1), { fill: C.coral, w: LW.part, depth: 1.2, speck: .6, amp: .2 });
    }
  };
  branch([[-4,-24],[-6,-36],[-3,-46],[-6,-54]],3.4); branch([[-5,-38],[-12,-44],[-14,-52]],2.4);
  branch([[-3,-46],[2,-52]],1.8); branch([[-8,-22],[-16,-30],[-24,-36],[-26,-44]],3);
  branch([[-18,-31],[-22,-28],[-30,-30]],2); branch([[-24,-37],[-31,-40]],1.6);
  branch([[4,-26],[9,-34],[8,-41]],2.4);
  // Teal scarf above the breastplate.
  cloth([[-16,13],[-9,12],[10,12],[18,16],[13,24],[3,27],[-8,22],[-17,20]],C.tealDark);
  cloth([[-15,14],[-4,18],[10,16],[17,14],[14,21],[3,24],[-9,19]],C.teal,{w:LW.detail,depth:1.2});
  line(ctx,M([[-7,17],[3,20],[11,18]]),.75);
  // Closed helm: dome, a beaked visor over a dark slit, two glowing teal eyes.
  steel([[-22,-5],[-20,-18],[-10,-27],[3,-29],[15,-23],[22,-12],[24,-2],[25,8],[19,15],[8,18],[-6,18],[-16,14],[-22,6]],{w:LW.outline,depth:3.2,light:.65});
  cloth([[-17,-16],[-9,-24],[-1,-26],[1,-16],[-6,-10]],C.light,{w:0,depth:0,speck:.5});
  line(ctx,M([[-3,-27],[-4,-18],[-8,-10]]),.8);
  cloth([[0,-4],[25,-6],[26,2],[20,5],[2,4]],C.black,{w:LW.detail,depth:0,speck:0});
  for (const [x,y] of [[10,-.5],[20,-1]]) {
    const p=M([[x,y]])[0];
    paint(ctx,ellipsePts(p[0],p[1],2.6,1.6,10),{fill:C.glow,w:0,depth:0,speck:0,amp:.05});
    dot(ctx,p[0],p[1],.7,'#e8fffb');
  }
  line(ctx,M([[0,-5],[13,-8],[26,-6.5]]),.9);
  steel([[2,6],[24,4],[26,9],[18,15],[6,16]],{fill:C.mid,w:LW.detail,depth:1});
  for (const x of [9,13,17]) line(ctx,M([[x,9],[x+.5,13]]),.6);
  // Cheek hinge with a star medallion, and gold trim on the brow.
  steel([[-21,-1],[-15,2],[-12,11],[-16,16],[-24,12],[-20,6]],{depth:1.8});
  const md=M([[-17,6]])[0]; medallion(ctx,md[0],md[1],4.2);
  line(ctx,M([[-20,-14],[-8,-22],[6,-22],[18,-14]]),1.4);
  line(ctx,M([[-19,-14],[-8,-21],[6,-21],[18,-13]]),.1);
  paintA(ctx,M([[-20,-12],[-8,-20],[6,-20],[18,-12],[18,-10],[6,-18],[-8,-18],[-20,-10]]),{fill:C.gold,w:.6,depth:.3,speck:0,amp:.08});
}

/** Golden trident on a dark iron shaft, gripped at the centre of the left gauntlet. */
function drawTrident(ctx, hand, fwd, back, P) {
  const dx=fwd.x-hand.x,dy=fwd.y-hand.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux,k=L/SHAFT_FWD;
  const Q=(a,b)=>[hand.x+ux*a*k+nx*b,hand.y+uy*a*k+ny*b];
  const bx=back.x-hand.x,by=back.y-hand.y;
  const B=f=>[hand.x+bx*f,hand.y+by*f];
  paintA(ctx,[B(1).map((v,i)=>v+(i?ny:nx)*1.6),Q(SHAFT_FWD,-1.6),Q(SHAFT_FWD,1.6),B(1).map((v,i)=>v-(i?ny:nx)*1.6)],{fill:C.iron,w:LW.part,depth:.8,speck:.4,amp:.12});
  for (const a of [SHAFT_FWD-10,-4,6]) paintA(ctx,[Q(a,-2.3),Q(a+2.4,-2.3),Q(a+2.4,2.3),Q(a,2.3)],{fill:C.gold,w:LW.detail,depth:.4,speck:0,amp:.05});
  const butt=B(1); paint(ctx,ellipsePts(butt[0],butt[1],2.4,2.4,10),{fill:C.gold,w:LW.detail,depth:.5,speck:0,amp:.08});
  // Teal streamers tied below the head, trailing back.
  const s0=Q(SHAFT_FWD-7,0), tr=P.scarf;
  paintA(ctx,[s0,[s0[0]-ux*4+nx*3,s0[1]-uy*4+ny*3],[s0[0]-ux*16+nx*(5+tr),s0[1]-uy*16+ny*(5+tr)],[s0[0]-ux*20+nx*(2+tr),s0[1]-uy*20+ny*(2+tr)],[s0[0]-ux*12+nx*1,s0[1]-uy*12+ny*1]],{fill:C.teal,w:LW.detail,depth:.8,speck:.4,amp:.2});
  paintA(ctx,[s0,[s0[0]-ux*14-nx*(3-tr),s0[1]-uy*14-ny*(3-tr)],[s0[0]-ux*17-nx*(1-tr),s0[1]-uy*17-ny*(1-tr)],[s0[0]-ux*8,s0[1]-uy*8]],{fill:C.tealDark,w:LW.detail,depth:.6,speck:.3,amp:.2});
  // Head: a crossbar and three barbed prongs.
  const h0=SHAFT_FWD;
  paintA(ctx,[Q(h0-2,-7),Q(h0+2,-7.5),Q(h0+3,0),Q(h0+2,7.5),Q(h0-2,7),Q(h0-3,0)],{fill:C.gold,w:LW.part,depth:.8,speck:.2,amp:.08});
  for (const b of [-6.5,0,6.5]) {
    const len = b ? PRONG - 3 : PRONG;
    paintA(ctx,[Q(h0+1,b-1.4),Q(h0+len-3,b-1.2),Q(h0+len,b),Q(h0+len-3,b+1.2),Q(h0+1,b+1.4)],{fill:C.gold,w:LW.part,depth:.6,speck:.1,amp:.06});
    if (b) paintA(ctx,[Q(h0+len-5,b),Q(h0+len-3,b+Math.sign(b)*2.6),Q(h0+len-2,b)],{fill:C.gold,w:LW.detail,depth:0,speck:0,amp:.04});
  }
  paintA(ctx,[Q(h0-1,-1.6),Q(h0+3,-1),Q(h0+3,1),Q(h0-1,1.6)],{fill:C.goldDark,w:0,depth:0,speck:0,amp:.04});
}

function shieldGeometry(rf,P) {
  // The Guardian's strapped shield: a modest cant, turned with the chest.
  const c=Math.cos(rf.turn),s=Math.sin(rf.turn);
  const candidates=[[.87,-.5],[.87,.5]].map(([a,b])=>({a,b,w:bodyToWorld(rf.dir,a*c+b*s,-a*s+b*c)}));
  const n=candidates.reduce((a,b)=>Math.abs(b.w.X+b.w.Y)>Math.abs(a.w.X+a.w.Y)?b:a);
  const hx=-n.w.Y,hy=n.w.X,hl=Math.hypot(hx,hy);
  const h={x:(hx-hy)/hl*KX,y:(hx+hy)/hl*KY};
  const hand=rf.UY(...P.shield.hand), centre={x:hand.x+(n.w.X-n.w.Y)*KX*3,y:hand.y+(n.w.X+n.w.Y)*KY*3};
  return {c:centre,h,front:n.w.X+n.w.Y>0,thick:{x:-(n.w.X-n.w.Y)*KX*2.5,y:-(n.w.X+n.w.Y)*KY*2.5}};
}

function drawShield(ctx,geo) {
  // A scallop shell: a wide fluted top narrowing to the hinge at the bottom.
  const {c,h,thick}=geo, shape=[[-21,-12],[-17,-20],[-9,-25],[0,-26],[9,-25],[17,-20],[21,-12],[20,2],[13,15],[5,22],[0,24],[-5,22],[-13,15],[-20,2]];
  const Q=([a,z],factor=1,offset={x:0,y:0})=>({x:c.x+h.x*a*factor+offset.x,y:c.y+h.y*a*factor+z*factor+offset.y});
  paint(ctx,shape.map(p=>Q(p,1,thick)),{fill:C.goldDark,w:LW.outline,depth:2,speck:1});
  paint(ctx,shape.map(p=>Q(p)),{fill:C.gold,w:LW.outline,depth:2.4,light:.4,speck:.8});
  const inner=shape.map(p=>Q(p,.86));
  const panel=paint(ctx,inner,{fill:geo.front?C.shell:C.shellDark,w:LW.detail,depth:2.4,light:.25,speck:1.4,amp:.35});
  ctx.save();clipPath(ctx,panel);
  // Fluted ribs fanning from the hinge.
  for(const a of [-16,-10,-5,0,5,10,16]) line(ctx,[Q([0,22]),Q([a*1.15,-24])],.6);
  if(geo.front) {
    // A gold branching-coral device.
    const tw=(pts,w)=>{for(let i=0;i<pts.length-1;i++)paint(ctx,taperPts(Q(pts[i]),Q(pts[i+1]),w,w*.75),{fill:C.gold,w:LW.detail,depth:.5,speck:.2,amp:.12});};
    tw([[0,18],[1,6],[-1,-6],[1,-16]],2);tw([[1,6],[8,0],[11,-9]],1.5);tw([[-1,-2],[-8,-8],[-9,-16]],1.4);
    tw([[8,0],[13,1]],1);tw([[-8,-8],[-13,-6]],1);
    const md=Q([12,10]); medallion(ctx,md.x,md.y,3.4);
  } else {
    for(const z of [-9,9]) paint(ctx,[Q([-15,z-1.6]),Q([15,z-1.6]),Q([15,z+1.6]),Q([-15,z+1.6])],{fill:C.leather,w:LW.detail,depth:.8,speck:.5});
    paint(ctx,[Q([-5,-6]),Q([-1,-7]),Q([4,-4]),Q([5,4]),Q([1,7]),Q([-4,5])],{fill:C.leatherLight,w:LW.part,depth:1.5,speck:.5});
  }
  ctx.restore();
}

function armParts(ctx,rf,P,side) {
  const sb=side==='L'?16:-16, S=[0,sb,44], H=side==='L'?P.trident.hand:P.shield.hand;
  const E=ik2(S,H,11.8,12.3,[-.45,side==='L'?1:-1,-.7]);
  const U=rf.UY, key=p=>{const a=yawToBody(rf,p[0],p[1]);return bodyLayerKey(rf,a[0],a[1],p[2]);};
  const s=U(...S),e=U(...E),h=U(...H), mid={x:e.x*.5+h.x*.5,y:e.y*.5+h.y*.5};
  const upper = ()=>{
    paint(ctx,taperPts(s,e,5,4),{fill:C.cloth,w:LW.part,depth:1.8,speck:1});
    // Fluted shell pauldrons with gold rims.
    const dx=e.x-s.x,dy=e.y-s.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux;
    const Q=(a,b)=>({x:s.x+ux*a+nx*b,y:s.y+uy*a+ny*b});
    metal(ctx,[Q(-5,-3),Q(-3,-8),Q(3,-9),Q(9,-6),Q(10,5),Q(3,8),Q(-3,6)],{w:LW.outline,depth:2.6,light:.6});
    for(const b of [-5,-1,3]) line(ctx,[Q(-2,b*.5),Q(8,b)],.55);
    metal(ctx,[Q(6,-7),Q(10,-5.5),Q(12,-1),Q(11,5),Q(7,7),Q(7,2)],{fill:C.mid,w:LW.detail,depth:1.2});
    const q=Q(2,1); medallion(ctx,q.x,q.y,2.6);
  };
  const fore=(a,b)=>{
    paint(ctx,taperPts(a,b,4.5,3.7),{fill:C.cloth,w:LW.part,depth:1,speck:.7});
    metal(ctx,taperPts(a,b,4.2,3.5),{depth:1.7,speck:.8});
    const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L;
    line(ctx,[[b.x+nx*3,b.y+ny*3],[b.x-nx*3,b.y-ny*3]],.8);
  };
  const parts=[{id:'upper'+side,d:key(E),draw:upper}];
  const boundary=Math.round(key(E)/1000)!==Math.round(key(H)/1000);
  if(boundary) {
    parts.push({id:'foreElbow'+side,d:key(E)+.05,draw:()=>fore(e,mid)});
    parts.push({id:'foreHand'+side,d:key(H),draw:()=>fore(mid,h)});
  } else parts.push({id:'fore'+side,d:key(H),draw:()=>fore(e,h)});
  const gauntlet=()=>{
    mittenHand(ctx,h,h.x-e.x,h.y-e.y,3.9,C.steel,{thumbSide:side==='L'?rf.sx:-rf.sx});
    line(ctx,[[h.x-1.7,h.y-1],[h.x+1.4,h.y-1]],.6);
  };
  return {parts,S,E,H,hand:h,key:key(H),gauntlet};
}

export function drawCoralKnight(ctx,x,y,direction,action,t,scale=1,opts={}) {
  const P=coralPose(action,t);
  const rf=rigFrame(direction,P.body,P.yaw),U=rf.UY;
  if(P.travel) {
    // Turn only the trident back by the chest's turn, so the thrust goes along the walking direction.
    const k=P.travel*(rf.turn+rf.yaw),c=Math.cos(k),s=Math.sin(k),[a,b,z]=P.trident.dir;
    P.trident.dir=[a*c-b*s,a*s+b*c,z];
  }
  const parts=armoredLegs(ctx,rf,P);
  parts.push({id:'torso',d:LAYER.torso,draw:()=>drawTorso(ctx,rf,P)});
  const head=rf.U(1.5,0,66);
  parts.push({id:'gorget',d:LAYER.torso+1,draw:()=>drawGorget(ctx,rf,head)});
  parts.push({id:'helmet',d:LAYER.head,draw:()=>{
    ctx.save();ctx.translate(head.x,head.y);ctx.scale(.9,.9);
    drawHelmet(ctx,{x:0,y:0},rf.sx,P);ctx.restore();
  }});
  const left=armParts(ctx,rf,P,'L'),right=armParts(ctx,rf,P,'R');
  parts.push(...left.parts,...right.parts);
  const along=(hand,dir,length)=>U(hand[0]+dir[0]*length,hand[1]+dir[1]*length,hand[2]+dir[2]*length);
  const fwd=along(P.trident.hand,P.trident.dir,SHAFT_FWD),back=along(P.trident.hand,P.trident.dir,-SHAFT_BACK);
  parts.push({id:'trident',d:left.key+.02,draw:()=>drawTrident(ctx,left.hand,fwd,back,P)});
  parts.push({id:'leftGauntlet',d:left.key+.04,draw:left.gauntlet});
  const shield=shieldGeometry(rf,P);
  parts.push({id:'shield',d:right.key+(shield.front?.12:-.12),draw:()=>drawShield(ctx,shield)});
  parts.push({id:'rightGauntlet',d:right.key+.04,draw:right.gauntlet});
  withTilt(ctx,x,y,scale,rf.sx,fallTilt(action,t),false,
    ()=>renderRig(ctx,x,y,scale,parts,{prefix:'eb-coral-knight',boil:DRAW.boil?Math.floor(t*5)%3:0,shadow:opts.shadow}));
  return {pose:P,order:parts.map(p=>p.id)};
}

export const character=Object.freeze({
  id:'eb-coral-knight',label:'Coral Knight — EMBERBOUND',kind:'humanoid',directional:true,draw:drawCoralKnight,
  actions:{idle:{period:TAU/2,frames:20},
    attack:{period:CORAL_ATTACK_T,keys:KEYS.attack,once:true},
    cast:{period:CORAL_WINDUP_T,frames:6},
    hurt:hurtAction},
  frameBox:{x0:-110,x1:110,y0:-150,y1:29},
  equipment:{leftHand:'trident',rightHand:'shield'},
  emberbound:{gameId:'coral_knight',heightPx:42,facing:'L'},
});
export const studio=Object.freeze({order:16,name:"Coral Knight（珊瑚の騎士）",category:"EMBERBOUND 第2エリア",
  description:"珊瑚色の鎧の騎士（エリート）。珊瑚の兜飾り、青緑のマント、貝殻の盾、金色の三叉槍。強打 Tidebreaker を溜める。",
  preview:{direction:'L',phase:0}});
