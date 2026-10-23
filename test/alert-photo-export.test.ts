import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAnalyticsRoutes } from '../src/routes/analytics.routes.js';
import { MemoryStore } from '../src/store.js';
import type { AnalyticsAlert } from '../src/domain/models.js';
import { loadAlertReportPhoto, renderAlertReportPdf, renderAlertReportXlsx } from '../src/reporting/alert-evidence-report.js';

const makeAlert=(overrides:Partial<AnalyticsAlert>={}):AnalyticsAlert=>({
  id:randomUUID(),tenantId:'omsystems',cameraId:'cam-001',branchId:'A005',branchName:'Rajkot',zoneName:'West Zone',regionName:'Gujarat',areaName:'Central',cameraName:'Rajkot - Channel 6',
  ruleId:randomUUID(),eventId:randomUUID(),title:'Helmet worn detected',severity:'P2',status:'acknowledged',confidence:.92,objectClasses:['person'],modelVersion:'test',
  firstDetectedAt:'2026-10-23T10:00:00Z',lastDetectedAt:'2026-10-23T10:15:00Z',occurrenceCount:3,version:1,createdAt:'2026-10-23T10:00:00Z',updatedAt:'2026-10-23T10:15:00Z',...overrides,
});
const context={generatedAt:'2026-10-23T12:00:00Z',filters:'Zone: West Zone | All recorded dates (IST)'};
let photo:Buffer;
beforeEach(async()=>{photo=await sharp({create:{width:640,height:360,channels:3,background:'#246a8d'}}).jpeg().toBuffer();});

describe('native alert evidence documents',()=>{
  it('prefers saved annotated event photos and preserves unavailable evidence without a fresh camera capture',async()=>{
    const store=new MemoryStore();
    Object.assign(store,{pool:{query:async()=>({rows:[{metadata:{annotatedSnapshotBase64:photo.toString('base64')}}]})}});
    const saved=await loadAlertReportPhoto(makeAlert(),store,{});
    expect(saved.photoStatus).toBe('Captured alert photo');expect((await sharp(saved.photo!).metadata()).format).toBe('jpeg');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:404})));
    try {
      const missing=await loadAlertReportPhoto(makeAlert(),new MemoryStore(),{});
      expect(missing).toMatchObject({photoStatus:'Photo unavailable'});expect(missing.photo).toBeUndefined();
    } finally {vi.unstubAllGlobals();}
  });
  it('embeds photos in a real XLSX and preserves every row, unavailable photo and literal formula-like title',async()=>{
    const rows=Array.from({length:27},(_,i)=>({alert:makeAlert({title:i===0?'=SUM(A1:A2)':'Helmet worn detected'}),...(i===0?{photo}:{}),photoStatus:i===0?'Captured alert photo':'Photo unavailable'}));
    const bytes=await renderAlertReportXlsx(rows,context);
    const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as never);
    const sheet=book.getWorksheet('Alert evidence')!;
    expect(sheet.rowCount).toBe(33);
    expect(sheet.getCell('F7').value).toBe('=SUM(A1:A2)');
    expect(sheet.getCell('A8').value).toBe('Photo unavailable');
    expect(sheet.getCell('D33').value).toBe('Rajkot');
    expect(sheet.getImages()).toHaveLength(1);
    expect(book.getImage(0).buffer).toBeTruthy();
    expect(sheet.getCell('K7').value).toContain('3:45:00 pm IST');
    await mkdir('tmp/alert-photo-export',{recursive:true});await writeFile('tmp/alert-photo-export/alerts-with-photos.xlsx',bytes);
  });
  it('creates paginated PDF photo cards including missing and lengthy evidence details',async()=>{
    const rows=Array.from({length:3},(_,i)=>({alert:makeAlert({title:i===2?'Helmet worn detected - '.repeat(10):'Helmet worn detected',description:'Review the captured camera evidence.',incidentNumber:i===0?'INC-AI-2026-271219':undefined}),...(i!==1?{photo}:{}),photoStatus:i===1?'Photo unavailable':'Captured alert photo'}));
    const bytes=await renderAlertReportPdf(rows,context);
    expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('/Subtype /Image');
    await mkdir('tmp/alert-photo-export',{recursive:true});await writeFile('tmp/alert-photo-export/alerts-with-photos.pdf',bytes);
  });
});

describe('authorized alert photo export route',()=>{
  let app:FastifyInstance;
  let store:MemoryStore;
  const asset=vi.fn();
  beforeEach(async()=>{
    store=new MemoryStore();asset.mockReset();
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:404})));
    asset.mockImplementation(async()=>new Response(new Uint8Array(photo),{headers:{'content-type':'image/jpeg'}}));
    app=Fastify();
    app.addHook('onRequest',async(request,reply)=>{
      const user=await store.getUser(String(request.headers['x-user-id'] || ''));
      if(!user)return reply.code(401).send({error:'unauthorized'});
      request.currentUser=user;
    });
    await registerAnalyticsRoutes(app,store,{alertEvidenceClient:{asset,status:async()=>new Response(null,{status:404}),capture:async()=>{throw new Error('Export must not request a fresh capture');}}});
  });
  afterEach(async()=>{await app.close();vi.unstubAllGlobals();});
  it('exports authoritative alert data with embedded captured evidence and audit metadata',async()=>{
    const alert=makeAlert();alert.snapshotReference=`/v1/alerts/${alert.id}/evidence/snapshot`;store.analyticsAlerts.push(alert);
    const response=await app.inject({method:'POST',url:'/v1/analytics/alerts/export',headers:{'x-user-id':'user-global-admin'},payload:{format:'xlsx',alertIds:[alert.id,alert.id],filters:context.filters}});
    expect(response.statusCode).toBe(200);expect(response.headers['x-report-rows']).toBe('1');expect(response.headers['x-report-photos']).toBe('1');
    expect(response.headers['cache-control']).toBe('private, no-store');expect(response.headers['content-disposition']).toContain('.xlsx');
    const book=new ExcelJS.Workbook();await book.xlsx.load(response.rawPayload as never);
    expect(book.getWorksheet(1)!.getCell('F7').value).toBe('Helmet worn detected');
    expect(asset).toHaveBeenCalledOnce();
  });
  it('rejects an inaccessible branch before fetching any photos',async()=>{
    const own=makeAlert();const denied=makeAlert({cameraId:'cam-a008-01',branchId:'A008'});store.analyticsAlerts.push(own,denied);
    const response=await app.inject({method:'POST',url:'/v1/analytics/alerts/export',headers:{'x-user-id':'user-branch-manager'},payload:{format:'pdf',alertIds:[own.id,denied.id]}});
    expect(response.statusCode).toBe(403);expect(asset).not.toHaveBeenCalled();
  });
  it('does not expose another tenant or silently truncate an oversized selection',async()=>{
    const alert=makeAlert({tenantId:'other-tenant'});store.analyticsAlerts.push(alert);
    const response=await app.inject({method:'POST',url:'/v1/analytics/alerts/export',headers:{'x-user-id':'user-global-admin'},payload:{format:'pdf',alertIds:[alert.id]}});
    expect(response.statusCode).toBe(404);
    const tooMany=await app.inject({method:'POST',url:'/v1/analytics/alerts/export',headers:{'x-user-id':'user-global-admin'},payload:{format:'xlsx',alertIds:Array.from({length:501},()=>randomUUID())}});
    expect(tooMany.statusCode).toBe(400);expect(tooMany.json().message).toContain('500');expect(asset).not.toHaveBeenCalled();
  });
});
