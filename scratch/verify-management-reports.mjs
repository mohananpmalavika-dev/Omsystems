import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

await mkdir('tmp/management-reports-qa',{recursive:true});
const browser=await chromium.launch({headless:true});
const branches=Array.from({length:60},(_,i)=>({branchId:`b${i}`,dimension:`Branch ${String(i+1).padStart(2,'0')}`,zone:i<30?'North Zone':'South Zone',region:i%3?'Region A':'',area:'',organization:'Organization',branchCount:1,totalCameras:10,onlineCameras: i%5?10:7,uptimePercent:i%5?100:70,p1Threats:i%7===0?1:0,totalAlerts:i%6,footfall:i%4?i*2:null,avgWaitMin:null,attendancePercent:null,slaPercent:i%4?100:null,retentionDays:90,complianceStatus:i%5?'Available':'Attention'}));
const alerts=Array.from({length:260},(_,i)=>({id:`alert-${i}`,branchId:`b${i%60}`,branchName:branches[i%60].dimension,cameraId:`cam-${i}`,cameraName:'Entrance',zoneName:branches[i%60].zone,regionName:branches[i%60].region,areaName:'',title:'Intrusion detected',alertType:'intrusion',severity:`P${i%5+1}`,status:i%6===0?'resolved':i%6===1?'false_alarm':'new',confidence:.93,firstDetectedAt:`2026-10-${String(1+i%6).padStart(2,'0')}T08:00:00.000Z`,lastDetectedAt:`2026-10-${String(1+i%6).padStart(2,'0')}T08:00:00.000Z`,createdAt:'2026-10-01T08:00:00Z',incidentId:i%8===0?'incident-'+i:undefined,occurrenceCount:1}));
const options={organizations:['Organization'],zones:['North Zone','South Zone'],regions:['Region A'],areas:[],branches:branches.map(row=>({id:row.branchId,name:row.dimension}))};
const mis={summary:{avgUptime:94,totalBranches:60,totalCameras:600,onlineCameras:564,totalP1Threats:9,totalAlerts:150,totalFootfall:400,avgWaitMin:null,avgAttendance:null,avgSla:98,avgRetentionDays:90},matrix:branches,branchMatrix:branches,allBranches:branches.map(row=>({name:row.dimension,uptime:row.uptimePercent,attendancePercent:null,slaPercent:row.slaPercent,retentionDays:row.retentionDays})),filterOptions:options,dateWiseBreakdown:Array.from({length:6},(_,i)=>({dimension:`2026-10-0${i+1}`,alerts:i*4+2,p1Threats:i%3})),timeWiseBreakdown:[],metadata:{startDate:'2026-10-01T18:30:00Z',endDate:'2026-10-06T18:29:59.999Z',timezone:'Asia/Kolkata'}};
const results=[];
for(const width of [1600,390]) {
  const context=await browser.newContext({viewport:{width,height:1050},acceptDownloads:true});
  await context.addCookies([{name: 'sentinel_access',value: 'qa',domain: '127.0.0.1',path: '/'}]);
  await context.addInitScript(()=>{localStorage.setItem('accessToken','qa');sessionStorage.setItem('user',JSON.stringify({id: 'qa',role: 'superadmin'}));localStorage.setItem('userRole','superadmin');localStorage.setItem('sentinel-user',JSON.stringify({id:'qa',displayName:'QA',role:'superadmin',tenantId:'qa'}));});
  await context.route(/\/(api|v1)\//,async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    if(path.endsWith('/analytics/alerts')) {const offset=Number(url.searchParams.get('offset')||0);return route.fulfill({json:{data:alerts.slice(offset,offset+200),summary:{total:260}}});}
    if(path.endsWith('/reports/mis/hierarchy'))return route.fulfill({json:options});
    if(path.endsWith('/reports/mis')) {const selected=url.searchParams.get('branchId');return route.fulfill({json:selected?{...mis,matrix:branches.filter(row=>row.branchId===selected),branchMatrix:branches.filter(row=>row.branchId===selected)}:mis});}
    if(path.endsWith('/auth/me'))return route.fulfill({json:{id:'qa',displayName:'QA',role:'superadmin',tenantId:'qa'}});
    if(path.endsWith('/organization/nodes'))return route.fulfill({json:{data:[]}});
    return route.fulfill({json:{data:[]}});
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:3014/analytics/alerts',{waitUntil:'domcontentloaded',timeout:180000});
  const management=page.getByRole('region',{name:'Alert management analytics'});
  await management.waitFor({timeout:120000});
  await page.getByText('260',{exact:true}).first().waitFor({timeout:60000});
  await management.scrollIntoViewIfNeeded();
  await management.screenshot({path:`tmp/management-reports-qa/alerts-${width}.png`});
  assert.equal(await management.locator('tbody tr').count(),10);
  await management.getByRole('button',{name:'Next',exact:true}).click();
  assert.match(await management.locator('tbody tr').first().innerText(),/Branch/);
  const downloadPromise=page.waitForEvent('download');
  await management.getByRole('button',{name:'Export all alerts',exact:true}).click();
  const download=await downloadPromise,path=await download.path();
  assert.equal((await readFile(path,'utf8')).split('\r\n').length,261);
  await page.getByLabel('Report start date').fill('2026-10-06');
  await page.getByLabel('Report end date').fill('2026-10-06');
  await page.getByRole('button',{name:'Generate report',exact:true}).click();
  await page.waitForTimeout(1200);
  assert.ok(await page.getByText('2026-10-06 to 2026-10-06 · IST',{exact:true}).count());
  await page.goto('http://127.0.0.1:3014/reports/mis',{waitUntil:'domcontentloaded',timeout:180000});
  const executive=page.getByRole('region',{name:'Executive management overview'});
  await executive.waitFor({timeout:120000});
  await executive.scrollIntoViewIfNeeded();
  await executive.screenshot({path:`tmp/management-reports-qa/mis-${width}.png`});
  const table=page.getByRole('table').first();
  assert.equal(await table.locator('tbody tr').count(),25);
  await page.getByRole('navigation',{name:'Report pagination'}).getByRole('button',{name:'Next',exact:true}).click();
  assert.match(await table.locator('tbody tr').first().innerText(),/Branch 26/);
  const csvPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:/Export CSV/}).click();
  const csvDownload=await csvPromise;
  assert.equal((await readFile(await csvDownload.path(),'utf8')).split('\r\n').length,61);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  results.push({width,alertExportRows:260,misExportRows:60,pagination:true,overflow,errors});
  assert.equal(errors.length,0,JSON.stringify(errors));
  await context.close();
}
await browser.close();
console.log(JSON.stringify(results));
