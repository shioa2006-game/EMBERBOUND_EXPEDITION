// Deterministic late-game UI regressions. In-memory save only; no player storage access.
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/hud.css';
import '../../src/styles/screens.css';
import '../../src/styles/camp.css';
import '../../src/styles/storybook.css';
import '../../src/styles/phone.css';
import { CampView } from '../../src/ui/camp/index.ts';
import { TopBar } from '../../src/ui/header.ts';
import { Modals } from '../../src/ui/modal.ts';
import { openSettings } from '../../src/ui/settings.ts';
import { openPause } from '../../src/ui/pause.ts';
import { BattleHud } from '../../src/ui/hud.ts';
import { NoticePlayer, areaCard, endingCard, trueEndingCard, epilogueCard, rekindleCard } from '../../src/ui/notices.ts';
import { showResult } from '../../src/ui/result.ts';
import { Renderer } from '../../src/render/renderer.ts';
import { Battle } from '../../src/core/battle.ts';
import { AREA_ORDER, type RunResult } from '../../src/core/types.ts';
import { TREE } from '../../src/data/tree.ts';
import { campSceneHeight, isPhoneLayout } from '../../src/ui/layout.ts';
import { perfectShort, skillDescription } from '../../src/ui/skill-description.ts';
import { makeSave } from '../helpers/saves.ts';
import type { IAudio } from '../../src/audio/api.ts';

const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') ?? 'review-settings';
const preview = params.has('preview');
const save = makeSave({heroes:'all', level:76, prestige:1, unlocked:'all', gold:52300000, embers:123, shards:8,
  nodes: TREE.filter(n=>n.kind!=='root').map(n=>n.id), relics:['gilded_idol','conduit_prism','phoenix_plume']});
save.relicsOwned.push('bastion_heart'); save.stats.runs=58; save.playTime=9020;
save.stats.kills=1620; save.stats.deaths=41; save.stats.bestHit=71700000;
save.stats.bossKills=11;save.stats.interrupts=64;save.stats.perfects=116;
save.selectedArea='heart';
for(const a of AREA_ORDER){Object.assign(save.areas[a],{unlocked:true,cleared:true,everCleared:true,best:10,bestEver:10,stars:3,bossFirstTime:31.1,bossBestTime:6.8});}
if(scenario==='review-tree-purchase'){save.tree={core:1,tempered_steel:1,retaliation:1,shield_wall:2};save.embers=5;}
if(scenario==='review-milestone'){for(const h of Object.values(save.heroes))h.level=24;save.gold=1e6;}
if(scenario==='review-first-rekindle'){
  save.prestige=0;save.relicsEquipped=[];save.relicsOwned=[];
  for(const n of TREE)if(n.branch==='rekindled')delete save.tree[n.id];
}
const battleMode=['review-pause','review-battle'].includes(scenario);
const root=document.querySelector<HTMLElement>('#app')!;
root.dataset.screen=battleMode?'battle':'camp';
root.style.setProperty('--camp-strip',`${campSceneHeight(innerHeight)}px`);
const audio:IAudio={unlock(){},setSettings(){},play(){},handleEvents(){},setMusic(){}};
const viewportWrap=document.createElement('div');viewportWrap.className='viewport-wrap';
const viewport=document.createElement('div');viewport.className='viewport';viewportWrap.append(viewport);
const modalRoot=document.createElement('div');modalRoot.className='layer layer-modal';
const noticeRoot=document.createElement('div');noticeRoot.className='layer layer-notice';
const modals=new Modals(modalRoot);
const notices=new NoticePlayer(noticeRoot,{audio,setMusic(){}});
const camp=new CampView();
const campRoot=document.createElement('section');campRoot.className='camp-root';
let paused=0;
const battle=new Battle({save,areaId:'heart',seed:1234});
const settings=()=>openSettings({modals,audio,getSave:()=>save,applySettings(){},replaceSave(){throw Error('Fixture must not import');},resetSave(){throw Error('Fixture must not delete');},toast(){}});
const pause=()=>{paused++;return openPause({modals,openSettings:settings,retreat(){}},battle);};
const topbar=new TopBar({getSave:()=>save,runArea:()=>battleMode?battle.area:null,liveLoot:()=>null,livePlayTime:()=>0,soundOn:()=>false,toggleSound(){},openSettings:settings,openPause:pause});
const battleTop=document.createElement('div');battleTop.className='battle-top';
root.append(topbar.el,battleTop,viewportWrap,campRoot,modalRoot,noticeRoot);
window.addEventListener('keydown',e=>{if(notices.active){notices.handleKey(e);e.stopImmediatePropagation();}else if(modals.isOpen()){modals.handleKey(e);e.stopImmediatePropagation();}},true);
camp.mount(campRoot,{getSave:()=>save,audio,firstTime:()=>false,commit:()=>{camp.refresh();topbar.update();},startRun(){},onRekindled(){},toast(){}});
const tab=scenario==='review-swap'?'relics':scenario==='review-tree-purchase'?'tree':['review-party','review-milestone'].includes(scenario)?'party':'expedition';
camp.show(tab);topbar.update();
const renderer=new Renderer();renderer.mount(viewport);
let hud:BattleHud|null=null;
if(battleMode){
  camp.hide();campRoot.hidden=true;
  for(let i=0;i<300&&battle.phase!=='fight';i++)battle.tick(1/60);
  hud=new BattleHud({getSave:()=>save,castSkill:h=>{battle.cast(h);},toggleAuto(){},activateOverdrive(){battle.activateOverdrive();},retreat(){}});
  root.insertBefore(hud.el,modalRoot);hud.dock(isPhoneLayout()?battleTop:null);hud.bind(battle);renderer.beginBattle(battle);
}
function paint(){if(battleMode){renderer.renderBattle(battle,1/60);hud?.update(0);}else renderer.renderCamp(save,1/60);requestAnimationFrame(paint);}
requestAnimationFrame(paint);
let chosen='';
const result:RunResult={areaId:'heart',reason:'wiped',stageReached:10,stagesCleared:9,segments:[],kills:33,eliteKills:1,bossDefeated:false,loot:{gold:35000000,embers:43,shards:0},duration:108,bestHit:69900000,interrupts:11,perfects:0,routs:3,emberNovas:1,missed:{},killedBy:'The Hollow Emberbound'};
function click(selector:string){const el=document.querySelector<HTMLElement>(selector);if(!el)throw Error(`Missing ${selector}`);el.click();}
if(scenario==='review-settings')settings();
if(scenario==='review-area')void notices.play([areaCard('heart')]);
if(scenario==='review-ending')void notices.play([endingCard()]);
if(scenario==='review-true-ending')void notices.play([trueEndingCard(save)]);
if(scenario==='review-epilogue')void notices.play([epilogueCard(save)]);
if(scenario==='review-rekindled')void notices.play([rekindleCard(13,save)]);
if(scenario==='review-rekindle'||scenario==='review-first-rekindle')click('.camp-btn--rekindle');
if(scenario==='review-swap')click('.camp-relic[data-relic="bastion_heart"] button');
if(scenario==='review-pause')click('.tb-pause');
if(scenario==='review-result-keys')void showResult({modals,audio,getSave:()=>save,firstTime:()=>false},result,[]).then(r=>{chosen=r.action;});

const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const failures:string[]=[];
const measurements:Record<string,unknown>={viewport:[innerWidth,innerHeight]};
function check(ok:unknown,msg:string){if(!ok)failures.push(msg);}
function visible(el:Element,name:string,interactive=true){
  const r=el.getBoundingClientRect();
  check(r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,`${name} outside viewport`);
  const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  if(interactive)check(hit&&el.contains(hit),`${name} obscured`);
  return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};
}
async function audit(){
  await delay(2800);renderer.resize();
  const scroll=document.querySelector<HTMLElement>('.dialog-scroll');
  if(scroll){
    const footer=scroll.parentElement!.querySelector<HTMLElement>('.dialog-footer')!;
    const buttons=[...footer.querySelectorAll('button')];
    measurements.actions=buttons.map(b=>visible(b,b.textContent??'action'));
    const y=footer.getBoundingClientRect().y;
    scroll.scrollTop=scroll.scrollHeight;await delay(40);
    check(Math.abs(footer.getBoundingClientRect().y-y)<1,'Footer moved with content');
    buttons.forEach(b=>visible(b,b.textContent??'action'));
    check(scroll.lastElementChild!.getBoundingClientRect().bottom<=scroll.getBoundingClientRect().bottom+1,'Last content is clipped');
    scroll.scrollTop=0;
  }
  if(scenario==='review-party'){
    const desc=document.querySelector('.camp-hero[data-hero="ranger"] .camp-skill-desc')!;
    check(desc.textContent?.includes('20本'),'Late Ranger description stale');
    const pages=document.querySelector<HTMLElement>('.camp-pages')!;
    // every node learned = the longest skill texts: four heroes still fit at 1280x720 and up (animations settled)
    const still=document.head.appendChild(document.createElement('style'));
    still.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';
    measurements.partyScroll=[pages.scrollHeight,pages.clientHeight];
    if(innerWidth>=1280&&innerHeight>=720)check(pages.scrollHeight<=pages.clientHeight+1,`Party needs scrolling: ${pages.scrollHeight}/${pages.clientHeight}`);
    still.remove();
    for(const b of document.querySelectorAll('.camp-buy--one')){b.scrollIntoView({block:'center'});await delay(30);visible(b,'Level up');}
    pages.scrollTop=0;
  }
  if(scenario==='review-battle'){
    visible(document.querySelector('.tb-pause')!,'Pause');
    document.querySelectorAll('.skill').forEach(b=>visible(b,'Battle skill'));
    // Every control and readout on screen at once, nothing covering another (phones included).
    visible(document.querySelector('.btn.retreat')!,'Retreat');
    visible(document.querySelector('.overdrive')!,'Overdrive');
    visible(document.querySelector('.run-loot')!,'Run loot');
    visible(document.querySelector('.lantern')!,'Lantern');
    document.querySelectorAll('.cur:not(.hidden) .cur-value').forEach(v=>visible(v,'Currency'));
    const cards=[...document.querySelectorAll('.hero-card')];
    measurements.heroCards=cards.map(c=>visible(c,'Hero card'));
    check(cards.every(c=>c.getBoundingClientRect().width>=120),'Hero cards squeezed');
    // Skills no longer open a full tooltip over the field: a one-line hint sits on the floor band instead.
    const ranger=[...document.querySelectorAll<HTMLElement>('.skill')].find(e=>e.getAttribute('aria-label')?.startsWith('Arrow Rain'))!;
    check(!ranger.dataset.tip,'Battle skill still opens a full tooltip');
    ranger.dispatchEvent(new PointerEvent('pointerenter'));
    const hint=document.querySelector<HTMLElement>('.skill-hint')!;
    check(hint.classList.contains('show')&&!!hint.textContent?.includes('Arrow Rain')&&!!hint.textContent?.includes(perfectShort('ranger')),'Skill hint missing');
    const hr=hint.getBoundingClientRect(),stage=document.querySelector('.viewport canvas')!.getBoundingClientRect();
    measurements.skillHint={top:hr.top,bottom:hr.bottom,stageTop:stage.top,stageBottom:stage.bottom};
    // It may reach into the letterbox under the stage, but never above the floor band (the lowest fifth).
    check(hr.top>=stage.top+stage.height*.8,'Skill hint covers the field');
    check(hr.left>=-1&&hr.right<=innerWidth+1,'Skill hint outside the window');
    ranger.dispatchEvent(new PointerEvent('pointerleave'));
    check(!hint.classList.contains('show'),'Skill hint stays after leaving');
  }
  if(!preview){
    if(scenario==='review-result-keys'){
      const key=(key:string,code:string,repeat=false)=>window.dispatchEvent(new KeyboardEvent('keydown',{key,code,repeat,bubbles:true,cancelable:true}));
      document.querySelector<HTMLButtonElement>('.res-again')!.focus();
      key(' ','Space');key(' ','Space',true);await delay(40);check(chosen==='','Space retried');
      key('r','KeyR',true);await delay(30);check(chosen==='','Repeated R retried');
      key('r','KeyR');await delay(40);check(chosen==='again','Fresh R did not retry');
    }
    if(scenario==='review-tree-purchase'){
      const node=document.querySelector('.camp-node[data-id="shield_wall"]')!;
      node.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      check(document.querySelector('.camp-tree-tip')?.textContent?.includes('強化可能'),'No available-rank tooltip');
      click('.camp-td-buy');await delay(50);
      check(save.tree.shield_wall===3&&save.embers===0,'Purchase did not apply');
      check(document.querySelector('.camp-tree-tip')?.textContent?.includes('習得済み'),'Stale purchased tooltip');
      check(!document.querySelector('.camp-tree-tip')?.textContent?.includes('Ember'),'Maxed tooltip still has a price');
    }
    if(scenario==='review-swap'){
      const before=JSON.stringify(save.relicsEquipped);
      click('.camp-swap footer button');await delay(250);
      check(JSON.stringify(save.relicsEquipped)===before,'Cancel changed equipment');
      click('.camp-relic[data-relic="bastion_heart"] button');
      click('[data-outgoing="gilded_idol"]');await delay(250);
      check(save.relicsEquipped.join(',')==='bastion_heart,conduit_prism,phoenix_plume','Wrong replacement');
      check(save.shards===8&&save.relicsOwned.includes('gilded_idol'),'Swap spent currency or removed ownership');
    }
    if(scenario==='review-rekindle'||scenario==='review-first-rekindle'){
      const beforePrestige=save.prestige;
      click('.camp-rk-confirm');await delay(50);
      check(save.prestige===beforePrestige,'Rekindle happened on first click');
      visible(document.querySelector('.camp-rk-confirm')!,'Armed Rekindle');
      await delay(4100);check(!document.querySelector('.camp-rk-confirm')!.classList.contains('is-armed'),'Rekindle did not disarm');
      click('.camp-rk-btns .camp-btn--ghost');
      check(save.prestige===beforePrestige&&save.gold===52300000,'Cancel changed progress');
    }
    if(scenario==='review-milestone'){
      const shown=[...document.querySelectorAll<HTMLButtonElement>('.camp-buy--one')].filter(b=>{const r=b.closest('.camp-hero')!.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});
      shown.forEach(b=>b.click());await delay(250);
      const texts=[...document.querySelectorAll('.camp-float--ms')];
      check(texts.length===shown.length,'Missing visible milestone effects');
      const rects=texts.map(e=>visible(e,'Milestone',false));
      const apart=(a:{x:number;y:number;width:number;height:number},b:typeof a)=>a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y;
      check(rects.every((r,i)=>rects.slice(0,i).every(q=>apart(q,r))),'Milestone labels overlap');
      measurements.milestones=rects;
    }
    if(scenario==='review-pause'){
      check(paused===1&&modals.isOpen(),'Visible pause button did not open pause');
      // The full, upgrade-aware skill texts are read in the pause menu.
      const text=document.querySelector('.pause-skills')?.textContent??'';
      check(text.includes(skillDescription('ranger',battle.mods).split('\n')[0])&&text.includes('4体以上、またはスタン中の敵に命中させる'),'Pause lacks the full skill text');
      visible(document.querySelector('.pause-menu .btn')!,'Resume');
      // Narrow modals: the skill texts read by scrolling down only.
      const modal=document.querySelector<HTMLElement>('.modal-pause')!;
      check(modal.scrollWidth<=modal.clientWidth+1,`Pause scrolls sideways: ${modal.scrollWidth}/${modal.clientWidth}`);
      const right=modal.getBoundingClientRect().right;
      check([...document.querySelectorAll('.pause-skill')].every(c=>c.getBoundingClientRect().right<=right+1),'Pause skill card clipped');
    }
  }
  check(document.documentElement.scrollWidth<=innerWidth,'Horizontal overflow');
  parent.postMessage({type:'ui-layout-result',report:{scenario,measurements,failures}},location.origin);
}
void audit().catch(e=>parent.postMessage({type:'ui-layout-result',report:{scenario,measurements,failures:[...failures,String(e.stack??e)]}},location.origin));
