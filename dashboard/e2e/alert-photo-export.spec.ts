import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { renderAlertReportPdf, renderAlertReportXlsx } from '../../src/reporting/alert-evidence-report';

const alerts=Array.from({length:27},(_,i)=>({
  id:randomUUID(),tenantId:'omsystems',cameraId:'camera-1',branchId:'branch-1',branchName:'Rajkot',cameraName:'Rajkot - Channel 6',zoneName:i===26?'East Zone':'West Zone',
  ruleId:randomUUID(),eventId:randomUUID(),title:'Helmet worn detected',status:'acknowledged' as const,severity:'P2' as const,confidence:.92,
  firstDetectedAt:'2026-10-23T10:00:00Z',lastDetectedAt:'2026-10-23T10:15:00Z',createdAt:'2026-10-23T10:00:00Z',updatedAt:'2026-10-23T10:15:00Z',
  objectClasses:['person'],modelVersion:'fixture',occurrenceCount:1,version:1,
}));

test('downloads filtered Excel and PDF with embedded photos, including rows beyond the visible page',async({page,context})=>{
  test.setTimeout(180_000);
  await context.addCookies([{name:'sentinel_access',value:'photo-export-test',domain:'127.0.0.1',path:'/'}]);
  await page.addInitScript(()=>{sessionStorage.setItem('user',JSON.stringify({id:'qa',role:'admin',username:'qa'}));sessionStorage.setItem('sentinel_browser_session','active');});
  const photo=await sharp({create:{width:640,height:360,channels:3,background:'#246a8d'}}).jpeg().toBuffer();
  let requestedIds:string[]=[];
  let deny=false;
  await page.route(/\/(?:api|v1)\//,async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/analytics/alerts/export')){
      if(deny)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'forbidden'})});
      const body=route.request().postDataJSON();requestedIds=body.alertIds;
      const rows=alerts.filter(alert=>requestedIds.includes(alert.id)).map((alert,i)=>({alert,...(i===0?{photo}:{}),photoStatus:i===0?'Captured alert photo':'Photo unavailable'}));
      const scope={generatedAt:'2026-10-23T12:00:00Z',filters:body.filters};
      const bytes=body.format==='xlsx'?await renderAlertReportXlsx(rows,scope):await renderAlertReportPdf(rows,scope);
      return route.fulfill({status:200,headers:{'content-type':body.format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf','x-report-rows':String(rows.length),'x-report-photos':'1'},body:bytes});
    }
    const body=url.pathname.endsWith('/analytics/alerts')?{data:alerts}:url.pathname.endsWith('/auth/me')?{id:'qa',role:'admin',username:'qa'}:{data:[],success:true};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/analytics/alerts');
  const excel=page.getByRole('button',{name:'Excel with photos',exact:true});
  await expect(excel).toBeEnabled();
  await page.getByRole('combobox').filter({has:page.getByRole('option',{name:'West Zone',exact:true})}).selectOption('West Zone');
  await expect(page.getByText('All 26 filtered alerts · captured photos embedded where available')).toBeVisible();
  const excelEvent=page.waitForEvent('download');await excel.click();const excelFile=await excelEvent;
  expect(requestedIds).toHaveLength(26);expect(requestedIds).toContain(alerts[25]!.id);expect(requestedIds).not.toContain(alerts[26]!.id);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await readFile((await excelFile.path())!) as never);
  expect(workbook.getWorksheet(1)!.rowCount).toBe(32);expect(workbook.getWorksheet(1)!.getImages()).toHaveLength(1);
  await expect(page.getByText('Downloaded 26 alerts with 1 photo. 25 unavailable photos are marked in the report.')).toBeVisible();
  const pdfEvent=page.waitForEvent('download');await page.getByRole('button',{name:'PDF with photos',exact:true}).click();const pdfFile=await pdfEvent;
  expect((await readFile((await pdfFile.path())!)).subarray(0,5).toString()).toBe('%PDF-');
  deny=true;await excel.click();await expect(page.getByRole('alert').filter({hasText:'You do not have permission to export these alerts.'})).toBeVisible();
  await expect(excel).toBeEnabled();expect(errors).toEqual([]);
});
