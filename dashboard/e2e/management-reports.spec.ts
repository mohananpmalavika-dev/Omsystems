import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const branches = Array.from({length:24}, (_,index)=>({
  branchId:`branch-${index}`, dimension:`Branch ${String(index+1).padStart(2,'0')}`,
  organization:'Example organization', zone:'South', region:'Kerala', area:'Central',
  totalCameras:10, onlineCameras:index===0 ? 0 : index<5 ? 8 : 10,
  p1Threats:index===1 ? 3 : 0, totalAlerts:index+2, slaPercent:index===2 ? null : index<6 ? 85 : 100,
  retentionDays:index===2 ? null : index<8 ? 30 : 180,
  footfall:null, attendancePercent:null, avgWaitMin:null,
}));

test.beforeEach(async ({page,context})=>{
  await context.addCookies([{name:'sentinel_access',value:'mis-ui-fixture',domain:'127.0.0.1',path:'/'}]);
  await page.addInitScript(()=>{
    sessionStorage.setItem('user',JSON.stringify({id:'mis-test',username:'mis-reviewer',role:'admin'}));
    sessionStorage.setItem('sentinel_browser_session','active');
  });
  await page.route(/\/(?:api|v1)\//,async route=>{
    const url = new URL(route.request().url());
    let payload: unknown = {data:[],success:true};
    if(url.pathname.endsWith('/auth/me')) payload={id:'mis-test',username:'mis-reviewer',role:'admin'};
    if(url.pathname.endsWith('/reports/mis')) {
      const rows = branches.filter(row=>!url.searchParams.has('branchId') || row.branchId===url.searchParams.get('branchId'));
      payload={
        branchMatrix:rows,matrix:[],summary:null,
        dateWiseBreakdown:[{dimension:'2026-10-21',alerts:12,p1Threats:3},{dimension:'2026-10-22',alerts:8,p1Threats:1}],
        filterOptions:{organizations:['Example organization'],zones:['South'],regions:['Kerala'],areas:['Central'],branches:branches.map(row=>({id:row.branchId,name:row.dimension}))},
        metadata:{startDate:'2026-10-16T00:00:00Z',endDate:'2026-10-22T12:00:00Z',generatedAt:'2026-10-22T12:00:00Z'},
      };
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
  });
});

test('management reports switch graphs, review targets, paginate, export and drill into a branch', async ({page})=>{
  test.setTimeout(120_000);
  const errors: string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/reports/mis');
  const report=page.getByRole('region',{name:'Executive management overview'});
  await expect(report.getByRole('heading',{name:'See the risk. Decide the next move.'})).toBeVisible();
  await expect(report.locator('tbody tr')).toHaveCount(10);
  await expect(report.locator('tbody tr').first()).toContainText('Branch 02');
  await report.screenshot({path:'qa-artifacts/mis-management-desktop.png',style:'.topbar, nextjs-portal { visibility: hidden !important; }'});
  await report.getByRole('button',{name:'Next management page'}).click();
  await expect(report.getByText('11–20 of 24 branches')).toBeVisible();
  const downloadPromise=page.waitForEvent('download');
  await report.getByRole('button',{name:'Export scorecards',exact:true}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('management-branch-scorecards.csv');
  const csv=await readFile((await download.path())!,'utf8');
  expect(csv.trim().split('\r\n')).toHaveLength(25);
  expect(csv).toContain('Branch 24');
  await report.getByLabel('Search management branches').fill('Branch 03');
  await expect(report.locator('tbody tr')).toHaveCount(1);
  await expect(report.locator('tbody tr')).toContainText('Unavailable');
  await report.getByLabel('Search management branches').fill('');
  await report.getByRole('button',{name:'Camera coverage Availability',exact:false}).click();
  await expect(report.getByRole('heading',{name:'Lowest camera availability'})).toBeVisible();
  await report.getByRole('button',{name:'Incident response P1',exact:false}).click();
  await expect(report.getByRole('heading',{name:'P1 response performance by branch'})).toBeVisible();
  await report.getByLabel('P1 SLA review target').selectOption('100');
  await report.getByRole('button',{name:'Retention review Configuration',exact:false}).click();
  await expect(report.getByRole('heading',{name:'Lowest configured retention by branch'})).toBeVisible();
  await report.getByLabel('Configured retention review target').selectOption('365');
  await report.getByLabel('Search management branches').fill('Branch 24');
  await expect(report.locator('tbody tr')).toContainText('Review');
  const request=page.waitForRequest(req=>req.url().includes('/reports/mis?') && new URL(req.url()).searchParams.get('branchId')==='branch-23');
  await report.getByRole('button',{name:'Branch 24',exact:false}).click();
  await request;
  await expect(report.getByText('1–1 of 1 branches')).toBeVisible();
  expect(errors).toEqual([]);
});

test('management graphs fit a mobile viewport and show empty search results',async ({page})=>{
  test.setTimeout(120_000);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/reports/mis');
  const report=page.getByRole('region',{name:'Executive management overview'});
  await expect(report.getByRole('heading',{name:'See the risk. Decide the next move.'})).toBeVisible();
  await report.scrollIntoViewIfNeeded();
  const box=await report.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  await report.getByLabel('Search management branches').fill('No such branch');
  await expect(report.getByText('No branches match these filters.')).toBeVisible();
  await expect(report.getByRole('button',{name:'Export 0 rows'})).toBeDisabled();
  await report.getByLabel('Search management branches').fill('Branch 01');
  await report.screenshot({path:'qa-artifacts/mis-management-mobile.png',style:'.topbar, nextjs-portal { visibility: hidden !important; }'});
});
