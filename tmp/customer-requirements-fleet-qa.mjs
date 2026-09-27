import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
const cameras=[{id:'cam-entry',name:'Main entrance',branchId:'branch-kochi',branchName:'Kochi branch'},{id:'cam-cash',name:'Cash counter',branchId:'branch-kochi',branchName:'Kochi branch'},{id:'cam-vault',name:'Gold vault',branchId:'branch-calicut',branchName:'Calicut branch'},{id:'cam-rear',name:'Rear perimeter',branchId:'branch-thrissur',branchName:'Thrissur branch'}].map((camera,i)=>({...camera,channel:i+1,status:'online',vendor:'other',model:'QA fixture',capabilities:{ptz:false,audio:false,events:true},sourceType:'ip-camera'}));
cameras.push(...Array.from({length:616},(_,i)=>({...cameras[0],id:'fleet-'+i,name:'Camera '+i,branchId:'branch-'+Math.floor(i/16),branchName:'Fleet branch '+Math.floor(i/16),channel:i+5})));
const inventoryPages=[],aiBatches=[];
const event=(id,cameraId,title,severity,when)=>({id,cameraId,title,severity,status:'new',description:'Fixture event for reviewing this branch situation.',confidence:.91,occurrenceCount:2,ruleId:'rule-1',firstDetectedAt:when,lastDetectedAt:when,createdAt:when,updatedAt:when,objectClasses:['person'],modelVersion:'qa'});
const alerts=[event('evt-entry','cam-entry','After-hours entrance activity','P2','2026-09-27T16:00:00Z'),event('evt-vault','cam-vault','Vault access needs verification','P1','2026-09-27T16:02:00Z'),event('evt-cash','cam-cash','Cash area dwell alert','P3','2026-09-27T16:01:00Z')];
alerts.push(event('evt-log','cam-entry','Log-only maintenance','P4','2026-09-27T16:04:00Z'));
let analyticsUnavailable=false,recordingEmpty=false,cameraUnavailable=false,mutationFails=false;
const submissions=[],playbackRequests=[],liveRequests=[],errors=[],views=[];
try {
 const context=await browser.newContext({viewport:{width:1600,height:1100},serviceWorkers:'block'});
 await context.addCookies([{name:'sentinel_access',value:'qa',domain:'localhost',path:'/'}]);
 await context.addInitScript(()=>{localStorage.setItem('accessToken','qa');sessionStorage.setItem('user',JSON.stringify({id:'qa',role:'superadmin'}));localStorage.setItem('sentinel-grid-active-theme','dark');});
 await context.route(/\/(api|v1)\//,async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path.includes('/auth/me'))return route.fulfill({json:{id:'qa',role:'superadmin'}});
  if(path==='/api/live'){liveRequests.push({method:req.method(),body:req.postData()});return route.fulfill({status:503,json:{message:'QA camera gateway offline'}});}
  if(path.endsWith('/analytics/live-wall')){aiBatches.push(url.searchParams.get('cameraIds')?.split(',')??[]);return analyticsUnavailable?route.fulfill({status:503,json:{message:'QA analytics unavailable'}}):route.fulfill({json:{data:{cameraIds:cameras.map(c=>c.id),rules:[],alerts,correlations:[],summary:{total:alerts.length,open:alerts.filter(a=>a.status!=='resolved').length,new:alerts.filter(a=>a.status==='new').length,critical:1,highPriority:2},sampledAt:'2026-09-27T16:03:00Z'}}});}
  if(path.endsWith('/analytics/engine-health'))return route.fulfill({json:{status:'online'}});
  if(path.endsWith('/analytics/capabilities'))return route.fulfill({json:{domains:[],summary:{capabilities:0}}});
  if(path.endsWith('/cameras')){const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??500);inventoryPages.push(offset);return route.fulfill({json:{data:cameras.slice(offset,offset+limit),total:cameras.length}});}
  if(path.endsWith('/health/summary'))return route.fulfill({json:{data:{totalCameras:4,onlineCameras:4,offlineCameras:0,openIncidents:1,unacknowledgedAlerts:3,storageUsagePercent:42}}});
  if(path.endsWith('/alert-center'))return route.fulfill({json:{data:[]}});
  if(path.endsWith('/playback')&&req.method()==='GET'){
   playbackRequests.push({path,from:url.searchParams.get('from'),to:url.searchParams.get('to')});
   const cameraId=path.split('/').at(-2), anchor=alerts.find(a=>a.cameraId===cameraId)?.firstDetectedAt ?? '2026-09-27T16:00:00Z';const t=Date.parse(anchor);
   return route.fulfill({json:{segments:recordingEmpty?[]:[{id:'segment-'+cameraId,cameraId,startedAt:new Date(t-60000).toISOString(),endedAt:new Date(t+60000).toISOString(),status:'ready'}]}});
  }
  if(path==='/api/recordings/play')return route.fulfill({status:200,contentType:'video/mp4',body:Buffer.alloc(0)});
  if(path.includes('/analytics/alerts/')&&['POST','PATCH'].includes(req.method())){
   submissions.push({path,method:req.method(),body:req.postDataJSON()});
   if(mutationFails)return route.fulfill({status:403,json:{message:'QA action denied'}});
   const alert=alerts.find(a=>path.includes('/'+a.id));if(path.endsWith('/acknowledge'))alert.status='acknowledged';else if(path.endsWith('/incidents'))alert.incidentId='incident-qa';else alert.status=req.postDataJSON().status;
   return route.fulfill({json:{id:alert?.incidentId ?? alert?.id}});
  }
  return route.fulfill({json:{data:[],success:true}});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error'&&/hydration|didn't match|does not match|maximum update depth/i.test(msg.text()))errors.push(msg.text());});
 async function open(){await page.goto('http://localhost:3000/control-room',{waitUntil:'domcontentloaded',timeout:120000});await page.locator('.live-operations-stage').waitFor({timeout:30000});await page.locator('.los-event-track button').first().waitFor({timeout:30000});}
 async function responsive(name){for(const theme of ['dark','light'])for(const width of [1600,1200,768,390,320]){await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t!=='light');},theme);await page.setViewportSize({width,height:1100});await page.waitForTimeout(400);await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);for(const el of document.querySelectorAll("*")){if(el.scrollHeight>el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))el.scrollTop=0;}});const geometry=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,width:innerWidth,wide:[...document.querySelectorAll('.live-operations-stage *')].filter(el=>el.getBoundingClientRect().right>innerWidth+2).slice(0,8).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right}))}));assert.ok(geometry.doc<=geometry.width,`${name} ${theme} ${width} ${JSON.stringify(geometry)}`);if(theme==='dark'&&(width===1600||width===390))await page.screenshot({path:`tmp/experience-qa/live-stage-${name}-${width}.png`});}await page.setViewportSize({width:1600,height:1100});views.push(name);console.log('PASS',name);}

 await open();
 assert.ok(inventoryPages.includes(500), 'The inventory must fetch its second page');
 await page.waitForFunction(()=>document.querySelector('.los-event-track')?.textContent.includes('After-hours entrance activity'));
 assert.equal(await page.locator('.los-event-track button').filter({hasText:'Log-only maintenance'}).count(),0);
 assert.equal(new Set(aiBatches.flat()).size,620);assert.ok(aiBatches.every(batch=>batch.length<=144));
 await page.getByRole('button',{name:'Fleet wall',exact:true}).click();
 await page.locator('.los-fleet-toolbar').waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.los-video-stage .grid-camera-slot').length===16);
 await page.getByRole('button',{name:'Next feeds',exact:true}).click();
 await page.locator('[data-activity-camera-id="fleet-12"]').waitFor();
 assert.equal(await page.locator('.los-fleet-toolbar [role="status"]').innerText(),'Page 2 / 39');
 await page.getByLabel('Fleet branch',{exact:true}).selectOption('branch-kochi');
 await page.locator('[data-activity-camera-id="cam-entry"]').waitFor();
 assert.equal(await page.locator('.los-video-stage .grid-camera-slot').count(),2);
 assert.equal(await page.getByRole('button',{name:'Next feeds',exact:true}).isDisabled(),true);
 await page.getByLabel('Fleet branch',{exact:true}).selectOption('all');
 await page.getByLabel('Fleet tile layout',{exact:true}).selectOption('8');
 await page.waitForFunction(()=>document.querySelectorAll('.los-video-stage .grid-camera-slot').length===64);
 await responsive('fleet-64');
 await page.getByLabel('Fleet tile layout',{exact:true}).selectOption('4');
 await page.clock.install();
 await page.getByRole('button',{name:'Rotate every 15s',exact:true}).click();
 await page.clock.fastForward(15001);
 await page.waitForFunction(()=>document.querySelector('.los-fleet-toolbar [role="status"]')?.textContent==='Page 2 / 39');
 await page.getByRole('button',{name:'Pause rotation',exact:true}).click();
 await page.locator('.los-feed-dock button').filter({hasText:'Gold vault'}).click();
 assert.equal(await page.getByRole('button',{name:'Watch',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.los-stage-heading h3').innerText(),'Gold vault');
 assert.deepEqual(errors,[]);
 fs.writeFileSync('reports/customer-requirements-fleet-qa.json',JSON.stringify({passed:true,cameraCount:cameras.length,inventoryPages,aiBatchSizes:aiBatches.map(ids=>ids.length),views,errors},null,2));
 console.log('Fleet wall, 620-camera inventory, all AI batches, P4 exclusion, branch scope and rotation passed. Real camera gateway was offline in this fixture.');
}finally{await browser.close();}
