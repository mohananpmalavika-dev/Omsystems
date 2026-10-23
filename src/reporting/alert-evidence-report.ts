import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import type { AnalyticsAlert } from '../domain/models.js';
import type { ControlPlaneStore } from '../control-plane-store.js';
import { isManagedAlertEvidenceReference, type AlertEvidenceClient } from '../alerts/evidence-capture.js';

export type AlertReportRow = { alert: AnalyticsAlert; photo?: Buffer; photoStatus: string };
export type AlertReportContext = { generatedAt: string; filters: string };
const ink = '#172b49';
export const alertReportTime = (value?: string) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', hour12:true }) + ' IST' : 'Unavailable';
const confidence = (value: number) => Number.isFinite(value) ? `${Math.round(value <= 1 ? value * 100 : value)}%` : 'Unavailable';
const hierarchy = (alert: AnalyticsAlert) => [alert.zoneName,alert.regionName,alert.areaName].filter(Boolean).join(' / ') || 'Unavailable';

export async function normalizeReportPhoto(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { limitInputPixels:40_000_000 }).rotate().resize({width:960,height:640,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();
}

// Use captured alert evidence only. A current camera still would misrepresent the event.
export async function loadAlertReportPhoto(alert: AnalyticsAlert, store: ControlPlaneStore, options: {
  alertEvidenceClient?: AlertEvidenceClient; analyticsEngineUrl?: string; analyticsEngineSharedKey?: string;
}): Promise<AlertReportRow> {
  const ready = async (bytes: Buffer): Promise<AlertReportRow> => ({alert,photo:await normalizeReportPhoto(bytes),photoStatus:'Captured alert photo'});
  const pool = (store as ControlPlaneStore & {pool?:{query:(sql:string,params:unknown[])=>Promise<{rows:Array<{metadata:Record<string,unknown>}>}>}}).pool;
  if (pool && alert.eventId) {
    try {
      const result = await pool.query('SELECT metadata FROM analytics_events WHERE id = $1',[alert.eventId]);
      const meta = result.rows[0]?.metadata;
      const base64 = meta?.annotatedSnapshotBase64 || meta?.snapshotBase64;
      if (typeof base64 === 'string' && base64.length < 12_000_000) return await ready(Buffer.from(base64.replace(/^data:image\/[^;]+;base64,/,''),'base64'));
    } catch { /* Try preserved evidence if event metadata is unavailable or invalid. */ }
  }
  if (options.alertEvidenceClient && isManagedAlertEvidenceReference(alert.id,alert.snapshotReference)) {
    try {
      const response = await options.alertEvidenceClient.asset(alert.id,'snapshot');
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length <= 8_000_000) return await ready(bytes);
      }
    } catch { /* Try the analytics capture. */ }
  }
  try {
    const response = await fetch(new URL(`/internal/analytics/snapshots/${encodeURIComponent(alert.eventId || alert.id)}`,options.analyticsEngineUrl || process.env.ANALYTICS_ENGINE_URL || 'http://analytics-engine:8092'),{
      headers:{'x-analytics-engine-key':options.analyticsEngineSharedKey || process.env.ANALYTICS_ENGINE_SHARED_KEY || ''},signal:AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length <= 8_000_000) return await ready(bytes);
    }
  } catch { /* Preserve the alert row even when its photo cannot be loaded. */ }
  return {alert,photoStatus:'Photo unavailable'};
}

export async function renderAlertReportXlsx(rows: AlertReportRow[], context: AlertReportContext): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KryptonVision';
  workbook.created = new Date(context.generatedAt);
  const sheet = workbook.addWorksheet('Alert evidence',{views:[{state:'frozen',ySplit:6}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:6'}});
  sheet.columns = [
    {header:'Photo',width:40},{header:'Zone',width:18},{header:'Region / Area',width:24},{header:'Branch',width:24},
    {header:'Camera',width:27},{header:'Alert details',width:42},{header:'Severity',width:12},{header:'Alert status',width:20},
    {header:'Incident / status',width:28},{header:'First detected (IST)',width:27},{header:'Last detected (IST)',width:27},
    {header:'Confidence',width:13},{header:'Occurrences',width:13},{header:'Photo status',width:25},{header:'Alert ID',width:40},
  ];
  const headers=sheet.getRow(1).values;
  sheet.getRow(1).values=[];
  sheet.mergeCells('A1:O1');sheet.getCell('A1').value='AI ALERTS | EVIDENCE REPORT';sheet.getRow(1).height=34;
  sheet.getCell('A1').font={name:'Calibri',size:20,bold:true,color:{argb:'FF172B49'}};
  sheet.mergeCells('A2:O2');sheet.getCell('A2').value=`Generated: ${alertReportTime(context.generatedAt)} | ${rows.length} alerts | ${rows.filter(row=>row.photo).length} photos embedded`;
  sheet.mergeCells('A3:O3');sheet.getCell('A3').value=`Filters: ${context.filters}`;sheet.getRow(3).height=32;
  sheet.mergeCells('A4:O4');sheet.getCell('A4').value='Photos are captured alert evidence. Unavailable images are marked; all selected alerts remain in the report.';
  for(let row=2;row<=4;row++) {sheet.getRow(row).font={size:11,color:{argb:'FF5C6C82'}};sheet.getRow(row).alignment={wrapText:true,vertical:'middle'};}
  sheet.getRow(6).values=headers;sheet.getRow(6).height=28;
  sheet.getRow(6).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF172B49'}};cell.font={bold:true,color:{argb:'FFFFFFFF'},size:11};cell.alignment={vertical:'middle',wrapText:true};});
  for (const [index,{alert,photo,photoStatus}] of rows.entries()) {
    const rowIndex=index+7;
    const row=sheet.getRow(rowIndex);
    row.values=[photo?'':photoStatus,alert.zoneName || 'Unavailable',[alert.regionName,alert.areaName].filter(Boolean).join(' / ') || 'Unavailable',alert.branchName || alert.branchId || 'Unavailable',alert.cameraName || alert.cameraId,
      [alert.title,alert.description,alert.falseAlarmReason && `False alarm reason: ${alert.falseAlarmReason}`].filter(Boolean).join('\n'),alert.severity,alert.status,
      [alert.incidentNumber || alert.incidentId || 'Not converted',alert.incidentStatus].filter(Boolean).join('\n'),alertReportTime(alert.firstDetectedAt),alertReportTime(alert.lastDetectedAt),confidence(alert.confidence),alert.occurrenceCount,photoStatus,alert.id];
    row.height=142;
    row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Calibri',size:11,color:{argb:'FF172B49'}};cell.alignment={vertical:'middle',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:index%2?'FFF2F6FB':'FFFFFFFF'}};cell.border={bottom:{style:'thin',color:{argb:'FFDCE5F1'}}};});
    if(photo) {
      const imageId=workbook.addImage({buffer:photo as unknown as ExcelJS.Buffer,extension:'jpeg'});
      const meta=await sharp(photo).metadata();const scale=Math.min(260/(meta.width || 260),170/(meta.height || 170));
      sheet.addImage(imageId,{tl:{col:.12,row:rowIndex-1+.08},ext:{width:Math.round((meta.width || 260)*scale),height:Math.round((meta.height || 170)*scale)},editAs:'oneCell'});
    }
  }
  sheet.autoFilter={from:{row:6,column:1},to:{row:rows.length+6,column:15}};
  sheet.headerFooter.oddFooter='&LAI alerts evidence report&CPage &P of &N&RIST';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function renderAlertReportPdf(rows: AlertReportRow[], context: AlertReportContext): Promise<Buffer> {
  const doc = new PDFDocument({size:'A4',margin:36,bufferPages:true,info:{Title:'AI Alerts - Evidence Report',Author:'KryptonVision'}});
  const chunks:Buffer[]=[];
  const done = new Promise<Buffer>((resolve,reject)=>{doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const text=(value:string,x:number,y:number,width:number,height:number,size=9,bold=false,color=ink)=>{doc.font(bold?'Helvetica-Bold':'Helvetica').fontSize(size).fillColor(color).text(value,x,y,{width,height,ellipsis:true,lineGap:2});};
  for(let offset=0;offset<Math.max(1,rows.length);offset+=2) {
    if(offset)doc.addPage();
    text('KRYPTONVISION / SECURITY OPERATIONS',36,27,520,16,8,true,'#2679AB');
    text('AI alerts - evidence report',36,49,520,28,21,true);
    text(`${rows.length} alerts | ${rows.filter(row=>row.photo).length} photos | Generated ${alertReportTime(context.generatedAt)}`,36,81,520,16,8);
    text(`Filters: ${context.filters}`,36,101,520,33,8,false,'#5C6C82');
    rows.slice(offset,offset+2).forEach(({alert,photo,photoStatus},index)=>{
      const y=145+index*306;
      doc.roundedRect(36,y,523,292,8).lineWidth(.6).strokeColor('#DCE5F1').stroke();
      text(`${offset+index+1}. ${alert.severity} | ${alert.status.toUpperCase()}`,49,y+12,490,16,9,true,'#2679AB');
      text(alert.title,49,y+33,490,33,13,true);
      doc.roundedRect(49,y+77,236,154,5).fillColor('#F2F6FB').fill();
      if(photo)doc.image(photo,54,y+82,{fit:[226,144],align:'center',valign:'center'});
      else text(photoStatus,66,y+143,200,35,11,false,'#5C6C82');
      const fields=[['Branch',alert.branchName || alert.branchId || 'Unavailable'],['Camera',alert.cameraName || alert.cameraId],['Zone / Region / Area',hierarchy(alert)],['Last detected',alertReportTime(alert.lastDetectedAt)],['Confidence / Occurrences',`${confidence(alert.confidence)} / ${alert.occurrenceCount}`],['Incident',`${alert.incidentNumber || alert.incidentId || 'Not converted'}${alert.incidentStatus ? ' / '+alert.incidentStatus : ''}`]];
      fields.forEach(([label,value],field)=>{text(label!,300,y+74+field*28,245,11,7,true,'#5C6C82');text(value!,300,y+85+field*28,245,17,9);});
      text(`First detected: ${alertReportTime(alert.firstDetectedAt)}`,49,y+241,490,13,8);
      text(alert.falseAlarmReason ? `False alarm reason: ${alert.falseAlarmReason}` : alert.description || photoStatus,49,y+257,490,17,8,false,'#5C6C82');
      text(`Alert ID: ${alert.id}`,49,y+277,490,10,7,false,'#5C6C82');
    });
  }
  const range=doc.bufferedPageRange();
  for(let page=0;page<range.count;page++){doc.switchToPage(page);text('Captured alert photos only. Unavailable evidence is marked.',36,790,410,15,7,false,'#5C6C82');text(`${page+1} / ${range.count}`,509,790,50,15,8);}
  doc.end();return done;
}
