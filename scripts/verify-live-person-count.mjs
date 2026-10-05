import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=process.cwd();
const bundle=await build({stdin:{contents:`import {createRoot} from 'react-dom/client';import {LivePersonCountReportView} from './components/reports/live-person-count-report';createRoot(document.getElementById('root')).render(<LivePersonCountReportView/>);`,resolveDir:resolve(root,'dashboard'),loader:'tsx'},bundle:true,write:false,outdir:'qa',jsx:'automatic',platform:'browser',plugins:[{name:'qa-boundaries',setup(builder){
  builder.onResolve({filter:/^@\/components\/app-layout$|^next\/link$|^@\/lib\/api-client$/},args=>({path:args.path,namespace:'qa'}));
  builder.onLoad({filter:/.*/,namespace:'qa'},args=>({loader:'jsx',resolveDir:resolve(root,'dashboard'),contents:args.path==='next/link'?`export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`:args.path.includes('app-layout')?`export function AppLayout({children}){return <>{children}</>}`:`export const reportsApi={getLivePersonCount:async(filters)=>{window.requests.push(filters);if(window.failReport)throw new Error('Live connection unavailable');return window.makeReport(filters)}};`}));
}}]});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1450,height:950}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2026-10-06T09:00:00.000Z')});
  await page.setContent(`<style>body{margin:0;background:#f4f7fc;font:14px Arial,sans-serif}*{box-sizing:border-box}button,select{font:inherit}button{cursor:pointer}h1,h2,p{margin:0}a{text-decoration:none}button:focus,select:focus{outline:2px solid #345cad;outline-offset:2px}</style><div id="root"></div>`);
  await page.evaluate(()=>{
    window.requests=[];
    window.makeReport=(filters)=>{
      const rows=[{id:'b1',name:'Hajipur',regionId:'r1',regionName:'Bihar',zoneId:'z1',zoneName:'East',personCount:5,totalCameras:8,reportingCameras:8,coverage:'complete'},
        {id:'b2',name:'Bettaih',regionId:'r1',regionName:'Bihar',zoneId:'z1',zoneName:'East',personCount:0,totalCameras:8,reportingCameras:8,coverage:'complete'},
        {id:'b3',name:'Rajkot',regionId:'r2',regionName:'Gujarat',zoneId:'z2',zoneName:'West',personCount:3,totalCameras:8,reportingCameras:3,coverage:'partial'},
        {id:'b4',name:'PERAVARUNI',regionId:'r3',regionName:'Tamil Nadu',zoneId:'z3',zoneName:'South',personCount:null,totalCameras:9,reportingCameras:0,coverage:'unavailable'}].filter(row=>(!filters.branchId||row.id===filters.branchId)&&(!filters.regionId||row.regionId===filters.regionId)&&(!filters.zoneId||row.zoneId===filters.zoneId));
      rows.forEach(row=>{row.onlineCameras=row.id==='b3'?6:row.id==='b4'?0:8;row.notWorkingCameras=row.totalCameras-row.onlineCameras;});
      const reportTime=new Date().toISOString();
      return {reportTime,freshnessSeconds:90,groupBy:filters.groupBy,rows:rows.map(row=>({...row,reportTime,oldestObservationAt:row.personCount===null?null:reportTime,latestObservationAt:row.personCount===null?null:reportTime})),summary:{branches:rows.length,personCount:rows.some(row=>row.personCount!==null)?rows.reduce((sum,row)=>sum+(row.personCount??0),0):null,totalCameras:rows.reduce((sum,row)=>sum+row.totalCameras,0),onlineCameras:rows.reduce((sum,row)=>sum+row.onlineCameras,0),notWorkingCameras:rows.reduce((sum,row)=>sum+row.notWorkingCameras,0),reportingCameras:rows.reduce((sum,row)=>sum+row.reportingCameras,0)},filters:{branches:[{id:'b1',name:'Hajipur',regionId:'r1',zoneId:'z1'},{id:'b2',name:'Bettaih',regionId:'r1',zoneId:'z1'},{id:'b3',name:'Rajkot',regionId:'r2',zoneId:'z2'},{id:'b4',name:'PERAVARUNI',regionId:'r3',zoneId:'z3'}],regions:[{id:'r1',name:'Bihar',zoneId:'z1'},{id:'r2',name:'Gujarat',zoneId:'z2'},{id:'r3',name:'Tamil Nadu',zoneId:'z3'}],zones:[{id:'z1',name:'East'},{id:'z2',name:'West'},{id:'z3',name:'South'}]}};
    };
  });
  for(const file of bundle.outputFiles.filter(file=>file.path.endsWith('.css')))await page.addStyleTag({content:file.text});
  await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')).text});
  await page.getByRole('cell',{name:'Hajipur',exact:true}).waitFor();
  await page.getByRole('columnheader',{name:'Cameras online',exact:true}).waitFor();
  await page.getByRole('columnheader',{name:'Cameras not working',exact:true}).waitFor();
  const summary=page.getByRole('region',{name:'Live report summary'});
  assert.match(await summary.innerText(),/Cameras online\s+22\b/);
  assert.match(await summary.innerText(),/Cameras not working\s+11\b/);
  const rajkot=page.getByRole('row').filter({has:page.getByRole('cell',{name:'Rajkot',exact:true})});
  assert.equal(await rajkot.getByRole('cell').nth(6).innerText(),'6');
  assert.equal(await rajkot.getByRole('cell').nth(7).innerText(),'2');
  assert.match(await page.locator('main').innerText(),/\* Branch totals will be estimates from camera views; overlapping views can count the same person more than once\./);
  assert.equal(await page.evaluate(()=>window.requests.length),1);
  await page.clock.runFor(59000);
  assert.equal(await page.evaluate(()=>window.requests.length),1,'No refresh before one minute');
  await page.clock.runFor(1000);
  await page.waitForFunction(()=>window.requests.length===2);
  await mkdir(resolve(root,'tmp/person-count-qa'),{recursive:true});
  await page.screenshot({path:resolve(root,'tmp/person-count-qa/desktop.png'),fullPage:true});
  await page.getByLabel('Zone',{exact:true}).selectOption('z1');
  await page.getByRole('cell',{name:'Hajipur',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===2);
  assert.equal(await page.getByLabel('Region',{exact:true}).locator('option').count(),2);
  await page.getByLabel('Branch',{exact:true}).selectOption('b2');
  await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===1);
  assert.match(await page.locator('tbody').innerText(),/\b0\b/,'A real zero stays visible');
  await page.getByRole('button',{name:'Clear filters'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===4);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.waitForFunction(()=>document.body.innerText.includes('Refresh paused'));
  const beforePause=await page.evaluate(()=>window.requests.length);
  await page.clock.runFor(91000);
  assert.equal(await page.evaluate(()=>window.requests.length),beforePause);
  assert.match(await page.locator('tbody').innerText(),/Stale/);
  assert.match(await summary.innerText(),/Cameras online\s+—/);
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('tbody').innerText.includes('Live'));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(root,'tmp/person-count-qa/mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'No page-wide mobile overflow');
  await page.evaluate(()=>{window.failReport=true;});
  await page.getByRole('button',{name:'Refresh now'}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('tbody tr').count(),0,'Failure must not retain old live counts');
  assert.deepEqual(errors,[]);
  console.log('PASS: camera health totals/rows, 60-second refresh, exact starred note, scope filters, zero/partial/unavailable states, pause/staleness, error clearing, desktop and mobile layout');
} finally {await browser.close();}
