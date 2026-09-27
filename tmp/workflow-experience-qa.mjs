import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({headless:true});
const submissions=[];
const orders=[{id:'wo-01',workOrderNumber:'WO-01',problem:'Restore recording in the Kochi branch',severity:'critical',status:'in_progress',assetId:'cam-01',technician:'Field team',slaDueAt:'2026-09-28T12:00:00Z',createdAt:'2026-09-27T08:00:00Z'}, {id:'wo-02',workOrderNumber:'WO-02',problem:'Inspect camera mounting',severity:'low',status:'open',createdAt:'2026-09-27T08:00:00Z'}, {id:'wo-03',workOrderNumber:'WO-03',problem:'Replace recorder drive',severity:'high',status:'resolved',createdAt:'2026-09-27T08:00:00Z'}];
const assets=[{id:'cam-01',assetType:'Camera',make:'Axis',model:'M20',branchNodeId:'branch-01',status:'degraded',createdAt:'2026-09-27T08:00:00Z'}, {id:'rec-02',assetType:'Recorder',category:'recorder',make:'Bosch',model:'R2',serialNumber:'SER-002',status:'offline'}];
const partners=[{id:'vendor-01',name:'Fleet Care',contact:'Service desk',phone:'0484000000',email:'service@example.com'}];
const risks=[{id:'risk-01',riskCode:'R-01',title:'Recording retention below policy',description:'Storage capacity is below the required retention window.',likelihood:'very_high',impact:'high',inherentRiskScore:20,residualRiskScore:12,riskResponse:'mitigate',status:'assessed',owner:'Audit team'}, {id:'risk-02',riskCode:'R-02',title:'Service coverage renewal',description:'Renew the service agreement.',likelihood:'medium',impact:'low',inherentRiskScore:6,residualRiskScore:3,riskResponse:'transfer',status:'identified'}];
const evidence=[{id:'proof-01',title:'Branch retention audit',evidenceType:'audit_report',description:'Retention review for the branch recorder.',fileUrl:'https://example.com/audit.pdf',requirementId:'requirement-01',controlId:'control-01',collectionDate:'2026-09-26T08:00:00Z',sensitivity:'confidential',validated:false}, {id:'proof-02',title:'Access control certificate',evidenceType:'certificate',sensitivity:'internal',validated:true}, {id:'proof-03',title:'Expired service certificate',evidenceType:'certificate',expiryDate:'2020-01-01T00:00:00Z',validated:false}];
try {
  const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block'});
  await context.addCookies([{name:'sentinel_access',value:'qa',domain:'localhost',path:'/'}]);
  await context.addInitScript(()=>{localStorage.setItem('accessToken','qa');sessionStorage.setItem('user',JSON.stringify({id:'qa',role:'superadmin'}));});
  let partial=false;
  await context.route(/\/(api|v1)\//,async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(path.includes('/auth/me'))return route.fulfill({status:200,json:{id:'qa',role:'superadmin'}});
    if(request.method()==='POST'){submissions.push({path,body:request.postDataJSON()});if(path.endsWith('/proof-01/validate'))evidence[0].validated=true;return route.fulfill({status:200,json:{id:'qa-run',status:'queued',targetAssets:['cam-01'],safetyChecks:{blockers:[],warnings:[]}}});}
    if(path.endsWith('/compliance/risks'))return route.fulfill({status:200,json:{data:risks}});
    if(path.endsWith('/compliance/evidence'))return route.fulfill({status:200,json:{data:evidence}});
    if(path.endsWith('/maintenance/vendors'))return route.fulfill({status:200,json:{data:partners}});
    if(path.endsWith('/maintenance/amc'))return route.fulfill({status:200,json:{data:[{id:'amc-01',contractNumber:'AMC-2026-01',vendorId:'vendor-01',status:'active',startDate:'2026-01-01',endDate:'2027-01-01',cost:0}]}});
    if(path.includes('/reports/operational/')){
      const data=path.endsWith('/delivery-configuration')?{configured:true,provider:'smtp'}:[];
      return route.fulfill({status:200,json:{data}});
    }
    if(path.endsWith('/maintenance/dashboard/status'))return route.fulfill({status:200,json:{totalAssets:12,workOrdersOpen:2,amcContractsActive:3,visitsPending:2,amcContractsExpiring:1,predictiveAlerts:[{id:'alert-01',alertType:'Recorder drive temperature rising',score:.91,status:'open',assetId:'cam-01',details:{summary:'Temperature trend needs investigation before recording continuity is affected.'}}],workOrders:orders}});
    if(path.endsWith('/maintenance/dashboard/health'))return partial?route.fulfill({status:503,json:{message:'Health service unavailable'}}):route.fulfill({status:200,json:{healthPercentage:84,overdueVisits:1,openWorkOrders:2}});
    if(path.endsWith('/maintenance/assets'))return route.fulfill({status:200,json:{data:assets}});
    if(path.endsWith('/maintenance/workorders'))return route.fulfill({status:200,json:{data:orders}});
    if(path.endsWith('/branches'))return route.fulfill({status:200,json:{data:[{id:'branch-01',name:'Kochi branch'}]}});
    if(path.endsWith('/firmware/versions'))return route.fulfill({status:200,json:{data:[{id:'fw-01',vendor:'Axis',model:'M20',version:'2.4',status:'verified'}]}});
    if(path.endsWith('/firmware/updates-required'))return route.fulfill({status:200,json:{data:[{id:'cam-01',deviceType:'Camera',currentVersion:'2.3',latestVersion:'2.4'}]}});
    if(path.endsWith('/predictive/high-risk'))return route.fulfill({status:200,json:{data:[]}});
    if(path.endsWith('/spare-parts/low-stock'))return route.fulfill({status:200,json:{data:[{id:'part-01',partName:'Recorder drive',quantity:2,reorderLevel:5}]}});
    if(path.includes('/maintenance/reports/metrics')||path.includes('/device-management/'))return route.fulfill({status:200,json:{data:[]}});
    return route.fulfill({status:503,json:{message:'QA unavailable fixture'}});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error'&&/hydration|didn't match|does not match/i.test(msg.text()))errors.push(msg.text());});
  async function open(path){await page.goto('http://localhost:3000'+path,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('h1').first().waitFor({timeout:20000});await page.waitForTimeout(1000);const ready=path==='/maintenance/workorders'?'.service-board':(['/maintenance/assets','/maintenance/vendors','/maintenance/amc'].includes(path)?'.record-browser':path==='/compliance/risks'?'.risk-map-grid':path==='/compliance/evidence'?'.evidence-review-index button':null);if(ready)await page.locator(ready).first().waitFor({timeout:20000});}
  async function responsive(name){
    await page.setViewportSize({width:1440,height:1050});
    await page.mouse.move(0,0);
    await page.screenshot({path:`tmp/experience-qa/workflow-${name}.png`});
    for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('dark',theme!=='light');},theme);
      await page.setViewportSize({width,height:1000});await page.waitForTimeout(200);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      if(overflow)console.log(name,theme,width,await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+3&&getComputedStyle(el).position!=='fixed';}).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right}))),await page.evaluate(()=>[...document.querySelectorAll('.module-table-wrap,.work-order-board-page,.module-panel,table')].map(el=>({cls:el.className,display:getComputedStyle(el).display,width:getComputedStyle(el).width,min:getComputedStyle(el).minWidth,overflow:getComputedStyle(el).overflowX,scroll:el.scrollWidth,client:el.clientWidth,rect:el.getBoundingClientRect().width}))));
      if(overflow)console.log(await page.evaluate(()=>({doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,ancestors:[...document.querySelectorAll('.module-table-wrap,.module-table-wrap table,.module-table-wrap .sr-only')].map(el=>({tag:el.tagName,cls:el.className,position:getComputedStyle(el).position,clip:getComputedStyle(el).clip,overflow:getComputedStyle(el).overflow,transform:getComputedStyle(el).transform,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,offsetParent:el.offsetParent?.className})),all:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+3;}).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right})).slice(-20)})));
      assert.equal(overflow,false,`${name} ${theme} ${width}`);
      if(theme==='dark'&&width===390)await page.screenshot({path:`tmp/experience-qa/workflow-${name}-mobile.png`});
    }
    await page.setViewportSize({width:1440,height:1050});
    await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.classList.remove('dark');});
  }
  if(!process.argv.includes('--extended')){
  await open('/reports');
  await page.getByRole('radio').filter({hasText:'Camera Availability'}).click();
  await responsive('reports-story');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Region',{exact:true}).fill('Kerala');
  await page.getByLabel('Branch ID',{exact:true}).fill('branch-01');
  await responsive('reports-scope');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:/Every day/}).click();
  await page.getByLabel('Schedule name',{exact:true}).fill('Branch assurance');
  await page.getByLabel('Recipients (email)',{exact:true}).fill('soc@example.com');
  await page.getByRole('button',{name:'xlsx',exact:true}).click();
  await responsive('reports-delivery');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await responsive('reports-review');
  await page.getByRole('button',{name:'Save daily schedule',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Daily schedule saved.'}).waitFor();
  assert.equal(submissions.at(-1).body.template,'camera_availability');
  assert.deepEqual(submissions.at(-1).body.filters,{region:'Kerala',branchId:'branch-01'});
  assert.deepEqual(submissions.at(-1).body.formats,['pdf','csv']);
  assert.equal(submissions.at(-1).body.name,'Branch assurance');
  await page.getByRole('button',{name:'Compose',exact:true}).click();
  await page.getByRole('button',{name:'03 Delivery'}).click();
  await page.getByRole('button',{name:/Generate once/}).click();
  assert.equal(await page.getByLabel('Schedule name',{exact:true}).isVisible(),false);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Generate report',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Report queued'}).waitFor();
  assert.equal(submissions.at(-1).path.endsWith('/runs'),true);
  await responsive('reports-history');
  console.log('Reports: steps, preserved scope, modes, schedule and run payload passed');

  await open('/maintenance');
  await page.getByRole('button').filter({hasText:'Restore recording in the Kochi branch'}).click();
  assert.equal(await page.getByRole('link',{name:'Open service order'}).getAttribute('href'),'/maintenance/workorders/wo-01');
  await responsive('maintenance-queue');
  await page.getByRole('button',{name:'Urgent',exact:true}).click();
  assert.equal(await page.getByRole('button').filter({hasText:'Inspect camera mounting'}).count(),0);
  await page.getByRole('button',{name:'All tasks',exact:true}).click();
  await page.getByRole('button').filter({hasText:'Recorder drive temperature rising'}).click();
  const followup=page.getByRole('link',{name:'Create a work order for this issue'});
  assert.equal(await followup.getAttribute('href'),'/maintenance/workorders/new?assetId=cam-01');
  await followup.click();
  await page.getByLabel('Affected asset').waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.getByLabel('Affected asset').inputValue(),'cam-01');
  assert.equal(await page.getByLabel('Branch location').inputValue(),'branch-01');
  await page.getByRole('radio').filter({hasText:'critical'}).click();
  await page.getByText('4 hour response window',{exact:true}).waitFor();
  const suggestedDue=Date.parse(await page.getByLabel('SLA Due Date').inputValue());
  assert.ok(suggestedDue>Date.now()+3.9*3600000&&suggestedDue<Date.now()+4.1*3600000);
  await responsive('service-intake');
  await open('/maintenance');
  for(const [label,name] of [['Fleet pulse','maintenance-pulse'],['Firmware lab','maintenance-firmware'],['Parts & coverage','maintenance-parts']]){
    await page.getByRole('button',{name:label,exact:true}).click();await responsive(name);
  }
  await page.getByRole('button',{name:'Firmware lab',exact:true}).click();
  assert.equal(await page.getByLabel('No active incidents',{exact:true}).isChecked(),true);
  await page.getByLabel('Target assets',{exact:true}).fill('cam-01');
  await page.getByRole('button',{name:'Create upgrade plan',exact:true}).click();
  await page.getByText('Plan status: queued').waitFor();
  assert.equal(submissions.at(-1).body.safetyContext.activeIncidentsPresent,false);
  partial=true;
  await open('/maintenance');
  await page.getByRole('alert').filter({hasText:'1 maintenance feeds'}).waitFor();
  assert.equal(await page.getByRole('button').filter({hasText:'Recorder drive temperature rising'}).isVisible(),true);
  partial=false;
  console.log('Maintenance: queue, urgency, action links, asset context, all views, safety payload and partial service failure passed');

  await open('/modules');
  await page.getByRole('button').filter({hasText:'Follow an event'}).click();
  assert.equal(await page.locator('.mission-route').getByRole('link').first().getAttribute('href'),'/video-search');
  await responsive('modules-missions');
  await page.getByRole('textbox',{name:'Search available modules'}).fill('coverage');
  assert.equal(await page.getByRole('link',{name:'Live branch coverage',exact:true}).last().isVisible(),true);
  await responsive('modules-tools');
  await page.getByRole('textbox',{name:'Search available modules'}).fill('xyz-no-tool');
  assert.equal(await page.getByText('No modules found',{exact:true}).isVisible(),true);
  console.log('Modules: mission routing, global search, catalog and empty state passed');
  }

  if(!process.argv.includes('--evidence-only')){
  await open('/maintenance/workorders');
  assert.equal(await page.locator('.service-board-working').getByRole('link').count(),1);
  assert.equal(await page.locator('.service-board-complete').getByRole('link').count(),1);
  await responsive('workorders-board');
  await page.getByRole('textbox',{name:'Search work orders'}).fill('mounting');
  await page.waitForFunction(()=>document.querySelectorAll('.service-board a').length===1);
  assert.equal(await page.locator('.service-board').getByRole('link').count(),1);
  await page.getByRole('button',{name:'Record view',exact:true}).click();
  assert.equal(await page.locator('tbody tr').count(),1);
  await responsive('workorders-records');
  await open('/maintenance/assets');
  await page.getByRole('button').filter({hasText:'Bosch R2'}).click();
  assert.equal(await page.getByRole('link',{name:'Plan service for this asset'}).getAttribute('href'),'/maintenance/workorders/new?assetId=rec-02');
  await responsive('assets-explorer');
  await page.getByRole('textbox',{name:'Search asset registry'}).fill('SER-002');
  assert.equal(await page.locator('.record-browser-index button').count(),1);
  await page.getByRole('button',{name:'Record view',exact:true}).click();
  assert.equal(await page.locator('tbody tr').count(),1);
  await responsive('assets-records');
  await open('/maintenance/vendors');
  await page.getByRole('textbox',{name:'Search service partners'}).fill('Service');
  assert.equal(await page.locator('.record-browser-detail').getByText('service@example.com',{exact:true}).isVisible(),true);
  await responsive('vendors-directory');
  await open('/maintenance/amc');
  assert.equal(await page.locator('.record-browser-detail').getByText('0',{exact:true}).isVisible(),true);
  await responsive('coverage-explorer');
  console.log('Registries: service board, search parity, asset action context, provider details and zero contract value passed');

  await open('/compliance/risks');
  assert.equal(await page.locator('.risk-map-grid button').count(),25);
  await page.getByRole('button',{name:'very high likelihood, high impact: 1 risks',exact:true}).click();
  assert.equal(await page.locator('.risk-review-list button').count(),1);
  assert.equal(await page.getByRole('link',{name:'Open assessment & treatment'}).getAttribute('href'),'/compliance/risks/risk-01');
  await responsive('risk-exposure');
  await page.getByRole('button',{name:'Show all intersections',exact:true}).click();
  assert.equal(await page.locator('.risk-review-list button').count(),2);
  await page.getByRole('button').filter({hasText:'Service coverage renewal'}).click();
  assert.equal(await page.getByRole('link',{name:'Open assessment & treatment'}).getAttribute('href'),'/compliance/risks/risk-02');
  await page.getByRole('textbox',{name:'Search compliance risks'}).fill('xyz');
  assert.equal(await page.locator('.risk-review-list button').count(),0);
  console.log('Risk: 25-cell map, intersection drilldown, selection, assessment link and empty search passed');
  }

  await open('/compliance/evidence');
  assert.equal(await page.getByRole('link',{name:'Open source',exact:true}).getAttribute('href'),'https://example.com/audit.pdf');
  await responsive('evidence-review');
  await page.getByRole('button',{name:/Expired 1/}).click();
  assert.equal(await page.getByRole('button',{name:'Mark verified',exact:true}).count(),0);
  await page.getByRole('button',{name:/Needs review 1/}).click();
  await page.getByRole('button',{name:'Mark verified',exact:true}).click();
  await page.getByRole('button',{name:/Needs review 0/}).waitFor();
  assert.equal(submissions.at(-1).path.endsWith('/proof-01/validate'),true);
  assert.deepEqual(submissions.at(-1).body,{validated:true});
  await page.getByRole('button',{name:'Register evidence',exact:true}).click();
  await page.getByLabel('Title',{exact:true}).fill('Draft evidence');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  console.log('Evidence: source context, expired restriction, verification payload, stage refresh and registration modal passed');
  assert.deepEqual(errors,[]);
  fs.writeFileSync('tmp/experience-qa/workflow-results.json',JSON.stringify({passed:true,submissions,errors,fixture:'Mocked API data; no production writes'},null,2));
  console.log('All workflow checks passed. Screenshots saved. No runtime or hydration errors.');
} finally {await browser.close();}
