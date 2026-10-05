import { describe, expect, it } from 'vitest';
import { buildAlertReport, normalizeZone, normalizeRegion, normalizeArea } from '../lib/alert-report.js';
import { reportCsv } from '../lib/report-export.js';
import type { AnalyticsAlert } from '../lib/types.js';

const alert = (overrides: Partial<AnalyticsAlert> = {}): AnalyticsAlert => ({id:'one',branchId:'branch',branchName:'Hajipur',cameraId:'camera',title:'Vault intrusion',status:'new',severity:'P5',lastDetectedAt:'2026-10-05T20:00:00Z',createdAt:'2026-10-05T20:00:00Z',...overrides} as AnalyticsAlert);
describe('management report metrics and full exports',()=>{
  it('never invents organization locations from a title, camera or branch name',()=>{
    expect(normalizeZone(alert())).toBe('');
    expect(normalizeRegion(alert())).toBe('');
    expect(normalizeArea(alert())).toBe('');
    expect(buildAlertReport([alert()],'region')[0]).toMatchObject({name:'Hajipur',total:1,p4:0,p5:1});
  });
  it('keeps distinct branch IDs and counts all alerts including terminal statuses',()=>{
    const rows=buildAlertReport([alert(),alert({id:'two',branchId:'other',status:'resolved',severity:'P1'})],'branch');
    expect(rows).toHaveLength(2);
    expect(rows.reduce((total,row)=>total+row.total,0)).toBe(2);
    expect(rows.reduce((total,row)=>total+row.active,0)).toBe(1);
    expect(buildAlertReport([alert()],'date')[0]!.name).toBe('2026-10-06');
  });
  it('exports every supplied row and preserves missing values, commas, quotes and formulas',()=>{
    const rows=Array.from({length:60},(_,i)=>({Branch:i===0?'Branch, "one"':'Branch '+i,Region:'',Count:i===0?null:0,Note:'=SUM(A1:A2)'}));
    const csv=reportCsv(rows);
    expect(csv.split('\r\n')).toHaveLength(61);
    expect(csv).toContain('"Branch, ""one""","","","\'=SUM(A1:A2)"');
    expect(csv).toContain('"Branch 59"');
  });
});
