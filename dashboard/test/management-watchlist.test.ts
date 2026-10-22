import { describe, expect, it } from 'vitest';
import { buildManagementWatchlist, managementExportRows, DEFAULT_REVIEW_TARGETS, type ExecutiveBranchRow } from '../lib/management-watchlist';
import { reportCsv } from '../lib/report-export';

const branch = (overrides: Partial<ExecutiveBranchRow> = {}): ExecutiveBranchRow => ({
  branchId:'one', dimension:'Branch one', totalCameras:10, onlineCameras:10,
  p1Threats:0, totalAlerts:0, slaPercent:100, retentionDays:90, ...overrides,
});
describe('management watchlist decisions', () => {
  it('prioritizes critical incidents and complete coverage loss before measured shortfalls and data gaps', () => {
    const rows = [branch(), branch({branchId:'missing',slaPercent:null,retentionDays:null}),
      branch({branchId:'sla',slaPercent:92}), branch({branchId:'coverage',onlineCameras:0}),
      branch({branchId:'critical',p1Threats:2})];
    const result = buildManagementWatchlist(rows, DEFAULT_REVIEW_TARGETS);
    expect(result.map(row=>row.branchId)).toEqual(['critical','coverage','sla','missing','one']);
    expect(result.map(row=>row.priority)).toEqual(['Critical','Critical','Review','Data check','Clear']);
    expect(rows[0]!.branchId).toBe('one');
  });
  it('treats missing values and no inventory as data gaps while preserving measured zero', () => {
    const missing = buildManagementWatchlist([branch({totalCameras:0,onlineCameras:0,slaPercent:null,retentionDays:null})],DEFAULT_REVIEW_TARGETS)[0]!;
    expect(missing).toMatchObject({priority:'Data check',availability:null,slaPercent:null,retentionDays:null});
    const zero = buildManagementWatchlist([branch({slaPercent:0,retentionDays:0})],DEFAULT_REVIEW_TARGETS)[0]!;
    expect(zero.priority).toBe('Review');
    expect(zero.reasons).toContain('SLA 0.0% below 95%');
    expect(buildManagementWatchlist([branch({slaPercent:NaN,retentionDays:-1})],DEFAULT_REVIEW_TARGETS)[0]).toMatchObject({priority:'Data check',slaPercent:null,retentionDays:null});
  });
  it('re-evaluates benchmarks at exact boundaries without asserting statutory compliance', () => {
    const row = branch({slaPercent:95,retentionDays:90});
    expect(buildManagementWatchlist([row],DEFAULT_REVIEW_TARGETS)[0]!.priority).toBe('Clear');
    expect(buildManagementWatchlist([row],{sla:98,retention:180})[0]!.priority).toBe('Review');
  });
  it('exports every supplied row with period, findings, benchmarks and unavailable values intact', () => {
    const rows = Array.from({length:27},(_,index)=>branch({branchId:String(index),dimension:index===0?'=unsafe':'Branch '+index,slaPercent:null}));
    const exported = managementExportRows(buildManagementWatchlist(rows,DEFAULT_REVIEW_TARGETS),'1–7 October',DEFAULT_REVIEW_TARGETS,'2026-10-07T12:00:00Z');
    expect(exported).toHaveLength(27);
    expect(exported[0]).toMatchObject({Period:'1–7 October','SLA review target (%)':95,'Reported P1 SLA (%)':null,'Generated at':'2026-10-07T12:00:00Z'});
    expect(reportCsv(exported)).toContain("\"'=unsafe\"");
  });
});
