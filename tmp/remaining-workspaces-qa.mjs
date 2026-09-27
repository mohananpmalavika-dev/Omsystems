import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
await context.addCookies([{name:'sentinel_access',value:'qa',domain:'localhost',path:'/'}]);
await context.addInitScript(()=>{localStorage.setItem('accessToken','qa');sessionStorage.setItem('user',JSON.stringify({id:'qa',role:'superadmin'}));});
const submissions=[], errors=[], results=[];
let unavailable=false, rules=[];
const health=status=>Object.fromEntries(['camera','recording','storage','network','ups','edgeAgent'].map(key=>[key,{status,score:status==='critical'?24:98,lastUpdated:'2026-09-27T08:00:00Z'}]));
const branches=[{id:'branch-1',name:'Kochi branch',code:'KOC',region:'Kerala',components:health('healthy'),onlineCameras:12,totalCameras:12},{id:'branch-2',name:'Calicut branch',code:'CLT',region:'Kerala',components:health('critical'),onlineCameras:3,totalCameras:12}];
await context.route(/\/(api|v1)\//,async route=>{
 const req=route.request(),u=new URL(req.url()),p=u.pathname;
 if(p.includes('/auth/me'))return route.fulfill({json:{id:'qa',role:'superadmin'}});
 if(['POST','PATCH','DELETE'].includes(req.method())){
 const body=req.postDataJSON();submissions.push({path:p,body});
  if(p.endsWith('/analytics/rules'))rules=[{...body,id:'rule-1',cameraId:'cam-1',severity:'P3'}];
  if(p.endsWith('/analytics/rules/rule-1'))rules[0].enabled=body.enabled;
  return route.fulfill({status:200,json:{id:'created-1',data:{id:'created-1'}}});
 }
 if(unavailable)return route.fulfill({status:503,json:{message:'Telemetry unavailable fixture'}});
 let body={data:[]};
 if(p.endsWith('/health/branches'))body={success:true,data:{branches}};
 else if(p.endsWith('/maintenance/vendors'))body={data:[{id:'vendor-1',name:'Fleet Care'}]};
 else if(p.endsWith('/nodes')||p.endsWith('/branches'))body={data:[{id:'branch-1',name:'Kochi branch'}]};
 else if(p.endsWith('/compliance/frameworks'))body={data:[{id:'framework-1',name:'ISO assurance'}]};
 else if(p.endsWith('/compliance/controls'))body={data:[{id:'ctrl-1',controlCode:'CTRL-01',title:'Recording continuity',implementationStatus:'implemented',effectiveness:'not_tested',owner:'Field assurance'},{id:'ctrl-2',controlCode:'CTRL-02',title:'Visitor access policy',implementationStatus:'not_implemented',effectiveness:'ineffective'}]};
 else if(p.endsWith('/compliance/requirements'))body={data:[{id:'req-1',requirementCode:'REQ-01',title:'Retention obligation',category:'Recording',isMandatory:true,status:'active',controlCount:0},{id:'req-2',requirementCode:'REQ-02',title:'Visitor obligation',category:'Access',status:'draft'}]};
 else if(p.endsWith('/compliance/assessments'))body={data:['incomplete','non-compliant','exception','compliant'].map((status,i)=>({id:'assessment-'+i,status,frameworkName:'Assurance '+i,summary:{compliancePercentage:0,criticalFindings:0}})).filter(r=>!u.searchParams.get('status')||r.status===u.searchParams.get('status'))};
 else if(p.endsWith('/privacy/purposes'))body={data:[{id:'purpose-1',name:'Loss prevention',lawfulBasis:'legitimate_interest',riskLevel:'medium',dataCategories:['video'],active:true}]};
 else if(p.endsWith('/analytics/capabilities'))body={domains:['human','vehicle','industrial','face'].map(id=>({id,capabilities:[{id:'counting',name:'People counting',description:'Count people crossing the camera.',stage:'core',defaultSeverity:'P3'}]}))};
 else if(p.endsWith('/analytics/engine-health'))body={status:'online'};
 else if(p.endsWith('/cameras'))body={data:[{id:'cam-1',name:'Entrance camera'}]};
 else if(p.endsWith('/analytics/rules'))body={data:rules};
 return route.fulfill({status:200,json:body});
});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.on('console',msg=>{if(msg.type()==='error'&&/hydration|didn't match|does not match/i.test(msg.text()))errors.push(msg.text());});
async function open(path,selector){await page.goto('http://localhost:3000'+path,{waitUntil:'domcontentloaded',timeout:120000});await page.locator(selector||'h1').first().waitFor({timeout:30000});if(selector==='.record-composer')await page.locator('.record-composer[aria-busy="false"]').waitFor({timeout:30000});await page.waitForTimeout(500);}
async function responsive(name){for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark');},theme);await page.setViewportSize({width,height:1000});await page.waitForTimeout(400);const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(size.scroll<=size.width,`${name} ${theme} ${width} overflow ${size.scroll}`);if(theme==='light'&&width===1440||theme==='dark'&&width===390)await page.screenshot({path:`tmp/experience-qa/remaining-${name}-${theme}-${width}.png`});}await page.setViewportSize({width:1440,height:1000});results.push(name);console.log('PASS',name);}
try {
 if(!process.argv.includes('--tail')){
 // Guided registration: required validation, persistent values and real payload review.
 await open('/maintenance/assets/new','.record-composer');
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('alert').filter({hasText:'Asset type'}).waitFor();assert.equal(await page.locator('[data-chapter="0"]').isVisible(),true);
 await page.getByLabel(/Asset type/).fill('Dome camera');await page.getByLabel('Serial number').fill('SER-QA-001');
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Physical location').fill('North entrance');
 await responsive('asset-deployment');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Review record',exact:true}).click();
 await page.locator('.composer-review').getByText('SER-QA-001',{exact:true}).waitFor();await page.locator('.composer-review').getByText('North entrance',{exact:true}).waitFor();await responsive('asset-review');
 await page.getByRole('button',{name:'Register asset',exact:true}).click();await page.waitForURL('**/maintenance/assets');assert.equal(submissions.findLast(item=>item.path.endsWith('/maintenance/assets')).body.serialNumber,'SER-QA-001');
 // Contract date constraints and zero cost survive every stage.
 await open('/maintenance/amc/new','.record-composer');await page.getByLabel('Contract number').fill('AMC-QA');await page.getByLabel('Vendor',{exact:false}).selectOption('vendor-1');await page.getByLabel('Start date').fill('2026-09-01');await page.getByLabel('End date').fill('2026-08-01');await page.getByLabel('Cost',{exact:true}).fill('0');await page.getByRole('button',{name:'Continue',exact:true}).click();assert.equal(await page.locator('[data-chapter="0"]').isVisible(),true);await page.getByLabel('End date').fill('2027-09-01');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Coverage',{exact:false}).fill('Fleet cameras and recorders');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Review record',exact:true}).click();await responsive('amc-review');await page.getByRole('button',{name:'Create AMC contract',exact:true}).click();await page.waitForURL('**/maintenance/amc');assert.equal(submissions.findLast(item=>item.path.endsWith('/maintenance/amc')).body.cost,0);
 for(const [path,name] of [['/maintenance/vendors/new','vendor'],['/maintenance/privacy/purposes/new','privacy-purpose'],['/maintenance/privacy/breaches/new','privacy-breach'],['/compliance/requirements/new','requirement'],['/compliance/risks/new','risk'],['/incidents/create','incident-intake']]){await open(path,'.record-composer');await responsive(name);}
 // Requirements use actual categories, controls use implementation lanes.
 await open('/compliance/controls','.inspection-records button');await page.getByRole('button',{name:/To verify/}).click();assert.equal(await page.locator('.inspection-records>button').count(),1);await page.locator('.inspection-brief').getByText('Field assurance',{exact:true}).waitFor();await responsive('controls');
 await open('/compliance/requirements','.inspection-records button');await page.getByRole('button',{name:/Recording/}).click();assert.equal(await page.locator('.inspection-records>button').count(),1);await page.locator('.inspection-brief').getByText('Yes',{exact:true}).waitFor();await responsive('requirements');
 await open('/compliance/assessments','.assessment-lane');assert.equal(await page.locator('.assessment-lane').count(),4);await responsive('assessments');await page.getByRole('button',{name:'Action required',exact:true}).click();await page.locator('.assessment-lane').waitFor();assert.equal(await page.locator('.assessment-lane').count(),1);await page.getByRole('button',{name:'New assessment',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await open('/maintenance/privacy/purposes','.inspection-records button');await responsive('purpose-library');
 for(const component of ['cameras','recording','storage','network']){await open('/operations/'+component,'.inspection-records button');assert.match(await page.locator('.inspection-brief h2').innerText(),/Calicut/);assert.equal(await page.getByText('Ping OK (14ms)').count(),0);await page.getByRole('button',{name:/Healthy/}).click();assert.equal(await page.locator('.inspection-records>button').count(),1);await responsive('telemetry-'+component);}
 unavailable=true;await open('/operations/cameras','.inspection-desk');await page.getByRole('alert').filter({hasText:'Telemetry unavailable'}).waitFor();await responsive('telemetry-unavailable');unavailable=false;
 }
 await open('/analytics/people','.analytics-task-workspace');await page.getByRole('button',{name:'Enable',exact:true}).first().click();await page.getByText(/is now enabled/).waitFor();assert.equal(submissions.findLast(item=>item.path.endsWith('/analytics/rules')).body.detectionType,'counting');await page.getByRole('button',{name:/Manage policy/}).click();await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByText(/paused/).waitFor();assert.equal(submissions.findLast(item=>item.path.endsWith('/analytics/rules/rule-1')).body.enabled,false);await responsive('analytics-policy');await page.getByRole('button',{name:/Read signals/}).click();await responsive('analytics-signals');assert.equal(await page.getByLabel('Camera',{exact:false}).first().inputValue(),'cam-1');
 await open('/support','.support-panel');await page.getByText('Check platform health',{exact:true}).waitFor();await page.getByRole('button',{name:'Find a page workflow',exact:true}).click();await page.getByRole('heading',{name:'What each page is for'}).waitFor();await responsive('support-guide');await page.getByRole('button',{name:'Prepare an escalation',exact:true}).click();await page.getByRole('heading',{name:'Include the page, time, and affected branch'}).waitFor();
 await open('/account/security','.account-security-page');await page.locator('#refresh-sessions-btn:not([disabled])').waitFor();await page.getByRole('button',{name:'Devices & sessions',exact:true}).click();await page.getByRole('heading',{name:'Active Devices & Sessions'}).waitFor();await responsive('account-sessions');await page.getByRole('button',{name:'Password & protection',exact:true}).click();await page.locator('.personal-task-panel:not([hidden]) input[type="password"]').first().waitFor();await responsive('account-protection');
 assert.deepEqual(errors,[]);fs.writeFileSync('tmp/experience-qa/remaining-results.json',JSON.stringify({passed:true,views:results,submissions,errors},null,2));console.log('All remaining workspace checks passed');
} finally {await browser.close();}

