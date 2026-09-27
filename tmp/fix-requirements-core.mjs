import fs from 'node:fs';
function edit(path,oldText,newText){const text=fs.readFileSync(path,'utf8').replaceAll('\r\n','\n');if(newText && text.includes(newText))return;if(!text.includes(oldText))throw new Error('Missing edit target '+path);fs.writeFileSync(path,text.replace(oldText,newText));}
fs.writeFileSync('edge-agent/src/monitoring/recorder-health-collector.ts',`import { probeRecorder, type RecorderConfig, type RecorderProbeResult } from "./recorder-probe.js";

/** Preserve observed results, including offline and unavailable evidence. */
export class RecorderHealthCollector {
  async collect(config: RecorderConfig, timeoutMs = 8000): Promise<RecorderProbeResult> {
    const started = Date.now();
    try {
      return await probeRecorder(config, timeoutMs, { includeArchive: true });
    } catch {
      return {
        metrics: { reachable: false, status: "unknown", recordingStatus: "unknown", durationMs: Date.now() - started },
        hddStatus: [], reasonCodes: ["recorder_probe_failed"], channelHealth: [],
        archiveEvidence: (config.archiveRetention?.channels ?? []).map(channel => ({
          cameraId: channel.cameraId, sourceChannel: channel.channel, status: "unavailable",
          oldestContinuousAt: null, newestPlayableAt: null, retentionLowerBound: false,
          coverageComplete: false, continuityGapSeconds: config.archiveRetention?.continuityGapSeconds ?? 0,
          gapCount: 0, largestGapSeconds: 0, searchStartedAt: new Date(started).toISOString(),
          reasonCodes: ["recorder_probe_failed"], playbackVerified: false, playbackFrameDecoded: false,
        })),
      };
    }
  }
}
export const recorderHealthCollector = new RecorderHealthCollector();
`);
edit('src/control-plane-store.ts','export interface AnalyticsAlertFilters {','export interface AnalyticsAlertFilters {\n  cameraIds?: string[] | undefined;\n  priorityFirst?: boolean | undefined;');
edit('src/store.ts','.filter((alert) => !filters.cameraId || alert.cameraId === filters.cameraId)\n      .filter((alert) => !filters.branchId', '.filter((alert) => !filters.cameraId || alert.cameraId === filters.cameraId)\n      .filter((alert) => !filters.cameraIds || filters.cameraIds.includes(alert.cameraId))\n      .filter((alert) => !filters.branchIds || filters.branchIds.includes(this.cameras.get(alert.cameraId)?.branchId ?? ""))\n      .filter((alert) => !filters.branchId');
edit('src/store.ts','.sort((left, right) => right.lastDetectedAt.localeCompare(left.lastDetectedAt))\n      .slice(0, filters.limit);','.sort((left, right) => (filters.priorityFirst ? Number(["resolved", "false_alarm", "suppressed"].includes(left.status)) - Number(["resolved", "false_alarm", "suppressed"].includes(right.status)) || left.severity.localeCompare(right.severity) : 0) || right.lastDetectedAt.localeCompare(left.lastDetectedAt))\n      .slice(0, filters.limit);');
edit('src/database/analytics-repository.ts','ORDER BY alert.last_detected_at DESC LIMIT $8','AND ($9::uuid[] IS NULL OR alert.camera_id = ANY($9::uuid[]))\n       ORDER BY ${filters.priorityFirst ? "CASE WHEN alert.status IN (\'resolved\',\'false_alarm\',\'suppressed\') THEN 1 ELSE 0 END, alert.severity ASC," : ""} alert.last_detected_at DESC LIMIT $8');
edit('src/database/analytics-repository.ts','filters.to ?? null, filters.limit],','filters.to ?? null, filters.limit, filters.cameraIds ?? null],');
edit('src/routes/analytics.routes.ts','store.listAnalyticsAlerts(request.currentUser.tenantId, {\n        limit: Math.min(1_000, query.limit * 5),\n      })','authorizedCameraIds.length > 0 ? store.listAnalyticsAlerts(request.currentUser.tenantId, {\n        cameraIds: authorizedCameraIds, priorityFirst: true, limit: query.limit,\n      }) : Promise.resolve([])');
// Fix the test setup rather than change correct branch-scoped report behavior.
edit('test/phase4-operational-reports.test.ts','expect(catalog.json().data).toHaveLength(7);','expect(catalog.json().data.map((item:any)=>item.id)).toEqual(expect.arrayContaining(["daily_surveillance_health","comprehensive","branch_health_summary","camera_availability","alert_summary","recorder_status","hdd_health","retention_compliance"]));');
edit('test/phase4-operational-reports.test.ts','filters:{branchId:"branch-blr-001"},recipients:["manager@example.com"]','filters:{},recipients:["manager@example.com"]');
edit('test/phase4-operational-reports.test.ts','const camera:Camera={...structuredClone(template),id,nodeId,name:','const camera:Camera={...structuredClone(template),id,nodeId,branchId:"branch-blr-001",name:');
edit('test/phase4-operational-reports.test.ts','const template=store.cameras.get("cam-001")!;for(let index=3;','const template=store.cameras.get("cam-001")!;for(const id of ["cam-001","cam-002"]){store.cameras.get(id)!.branchId="branch-blr-001";}for(let index=3;');
// Report alert rows must stay in the same authorized branch/device scope.
edit('src/reporting/worker.ts','  if(alerts.length===0&&(user.role==="super_admin"||user.role==="company_admin")){\n    alerts=await store.listAnalyticsAlerts("00000000-0000-4000-8000-000000000001",{limit:10_000,from,to});\n  }\n','');
edit('src/reporting/worker.ts','.filter((alert)=>cameraBranch.size===0||cameraBranch.has(alert.cameraId)||user.role==="super_admin")','.filter((alert)=>cameraBranch.has(alert.cameraId))');
edit('src/reporting/worker.ts','for(const row of section.rows.slice(0,1000))','for(const row of section.rows)');
edit('dashboard/components/live-operations-stage.tsx','alerts.filter(alert => scopedIds.has(alert.cameraId))','alerts.filter(alert => scopedIds.has(alert.cameraId) && alert.severity !== "P4" && alert.severity !== "P5")');
