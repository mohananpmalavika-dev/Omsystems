import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';
import {chromium,type Browser,type Page} from 'playwright';
import {build} from 'esbuild';
import {resolve} from 'node:path';

let browser:Browser,page:Page,bundle:string;
beforeAll(async()=>{
 const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';
 import {GlobalAlertCenter} from './dashboard/components/global-alert-center';
 import {AlertAudioIndicator} from './dashboard/components/alerts/alert-audio-indicator';
 createRoot(document.getElementById('root')).render(<><AlertAudioIndicator/><GlobalAlertCenter/></>);`,resolveDir:resolve('.'),loader:'tsx'},
 bundle:true,write:false,format:'iife',jsx:'automatic',alias:{'@':resolve('dashboard')},plugins:[{name:'notification-boundaries',setup(builder){
  builder.onResolve({filter:/next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
  builder.onResolve({filter:/alert-audio\.service$/},()=>({path:'audio',namespace:'fixture'}));
  builder.onResolve({filter:/live-client$/},()=>({path:'live',namespace:'fixture'}));
  builder.onResolve({filter:/(hls-player|incident-image-modal|alert-audio-activation-modal)$/},args=>({path:args.path.split('/').at(-1)!,namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='navigation'?
   `export const usePathname=()=>'/control-room';`:args.path==='audio'?
   `const status={state:'READY',enabled:true,muted:false,volume:.9,speechEnabled:false,activeP1Count:0,activeP2Count:0};
    export const alertAudioService={getAudioStatus:()=>({...status}),onStatusChange:fn=>{fn({...status});return()=>{}},init:async()=>{},playAlert:async value=>{window.playedAlerts.push(value)},stopAlert:()=>{},testSeverity:async()=>{}};`:args.path==='live'?
   `export const startLiveFromBrowser=async()=>({hlsUrl:'/fixture-live.m3u8'});`:args.path==='hls-player'?
   `export const HlsPlayer=()=>null;`:args.path==='incident-image-modal'?
   `export const IncidentImageModal=()=>null;`:`export const AlertAudioActivationModal=()=>null;`}));
 }}]});
 bundle=result.outputFiles[0]!.text;
 browser=await chromium.launch({headless:true});
});
afterEach(async()=>{await page?.close();});
afterAll(async()=>{await browser?.close();});

async function mount(useClock=false){
 page=await browser.newPage();page.setDefaultTimeout(5000);
 await page.route('http://localhost:3207/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
 await page.goto('http://localhost:3207');
 if(useClock){await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));}
 await page.evaluate(()=>{
  const w=window as any;w.playedAlerts=[];w.preferenceWrites=[];w.alerts=[];
  const listeners=new Map<string,Function>();
  w.EventSource=class {onopen?:()=>void;constructor(){w.currentEventSource=this;}addEventListener(name:string,fn:Function){listeners.set(name,fn)}close(){}};
  w.emitAlert=(name:string,data:unknown)=>listeners.get(name)?.({data:JSON.stringify(data)});
  const json=(body:unknown)=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
  w.fetch=async(url:string,options:any={})=>{
   if(url.includes('preferences')){
    if(options.method==='POST')w.preferenceWrites.push(JSON.parse(options.body));
    return json({preferences:{alertPopupEnabled:false,alertToastEnabled:true}});
   }
   if(url.includes('alert-center')){
    w.pollCalls=(w.pollCalls??0)+1;
    const response=json({data:w.alerts});
    if(w.holdPoll)return new Promise(resolve=>{w.releasePoll=()=>resolve(response);});
    return response;
   }
   if(url.includes('command-center/'))return json({data:w.alerts.filter((a:any)=>url.endsWith(a.id))});
   return json({});
  };
 });
 await page.addScriptTag({content:bundle});
 await page.getByText('POPUPS OFF',{exact:true}).waitFor();
}
const helmet=()=>({id:'helmet-fixture',cameraId:'kollam-channel8',branchId:'kollam',branchName:'KOLLAM',cameraName:'CP PLUS DVR - Channel 8',
 title:'Helmet worn detected',severity:'P2',status:'new',confidence:.9672,detectionType:'helmet-worn',version:1,
 firstDetectedAt:new Date().toISOString(),lastDetectedAt:new Date().toISOString(),createdAt:new Date().toISOString()});

describe('helmet popup delivery with independent audio and popup preferences',()=>{
 it('recovers a missed helmet event within five seconds without overlapping slow polling requests',async()=>{
  await mount(true);
  await page.evaluate(alert=>{const w=window as any;w.alerts=[alert];w.holdPoll=true;},helmet());
  await page.clock.runFor(4999);
  expect(await page.evaluate(()=>(window as any).playedAlerts.length)).toBe(0);
  await page.clock.runFor(1);
  expect(await page.evaluate(()=>(window as any).pollCalls)).toBe(2);
  await page.clock.runFor(10000);
  expect(await page.evaluate(()=>(window as any).pollCalls)).toBe(2);
  await page.evaluate(()=>{const w=window as any;w.holdPoll=false;w.releasePoll();});
  await page.waitForFunction(()=>(window as any).playedAlerts.some((a:any)=>a.alertId==='helmet-fixture'));
 });
 it('reconciles immediately when the event connection reopens and browser focus returns',async()=>{
  await mount(true);
  await page.evaluate(alert=>{const w=window as any;w.alerts=[alert];w.currentEventSource.onopen();},helmet());
  await page.waitForFunction(()=>(window as any).playedAlerts.length>0);
  const second={...helmet(),id:'second-helmet'};
  await page.evaluate(alert=>{const w=window as any;w.alerts=[...w.alerts,alert];window.dispatchEvent(new Event('focus'));},second);
  await page.waitForFunction(()=>(window as any).playedAlerts.some((a:any)=>a.alertId==='second-helmet'));
 });
 it('does not erase a new streamed helmet alert when an older polling response finishes',async()=>{
  await mount(true);
  await page.evaluate(()=>{(window as any).holdPoll=true;});
  await page.clock.runFor(5000);
  await page.evaluate(alert=>{const w=window as any;w.alerts=[alert];w.emitAlert('alert.created',{alertId:alert.id});},helmet());
  await page.waitForFunction(()=>(window as any).playedAlerts.length>0);
  await page.evaluate(()=>{const w=window as any;w.holdPoll=false;w.releasePoll();});
  await page.getByRole('button',{name:'Alert controls: audio on, popups off',exact:true}).click();
  await page.getByTitle('Enable incident modal popups',{exact:true}).click();
  await page.getByRole('button',{name:'Acknowledge & Stop Alarm',exact:true}).waitFor();
 });
 it('makes disabled popups visible even while alert audio is on',async()=>{
  await mount();
  expect(await page.getByRole('button',{name:'Alert controls: audio on, popups off',exact:true}).count()).toBe(1);
  await page.evaluate(alert=>{const w=window as any;w.alerts=[alert];w.emitAlert('alert.created',{alertId:alert.id});},helmet());
  await page.waitForFunction(()=>(window as any).playedAlerts.some((a:any)=>a.alertId==='helmet-fixture'));
  expect(await page.getByRole('button',{name:'Acknowledge & Stop Alarm',exact:true}).count()).toBe(0);
 });
 it('shows the real helmet popup and persists the operator choice when popups are enabled',async()=>{
  await mount();
  await page.evaluate(alert=>{const w=window as any;w.alerts=[alert];w.emitAlert('alert.created',{alertId:alert.id});},helmet());
  await page.waitForFunction(()=>(window as any).playedAlerts.length>0);
  await page.getByRole('button',{name:'Alert controls: audio on, popups off',exact:true}).click();
  await page.getByTitle('Enable incident modal popups',{exact:true}).click();
  await page.getByRole('button',{name:'Acknowledge & Stop Alarm',exact:true}).waitFor();
  expect(await page.getByRole('heading',{name:/Helmet worn detected\s*P2/}).count()).toBe(1);
  expect(await page.getByText('POPUPS OFF',{exact:true}).count()).toBe(0);
  await page.waitForFunction(()=>(window as any).preferenceWrites.some((p:any)=>p.preferences?.alertPopupEnabled===true));
 });
});
