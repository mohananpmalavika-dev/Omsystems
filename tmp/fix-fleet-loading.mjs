import fs from 'node:fs';
function edit(path,oldText,newText){const text=fs.readFileSync(path,'utf8').replaceAll('\r\n','\n');if(!text.includes(oldText))throw new Error('Missing target '+path);fs.writeFileSync(path,text.replace(oldText,newText));}
edit('dashboard/app/control-room/page.tsx','import { LiveOperationsStage }','import { loadCameraInventory } from "@/lib/fleet-loading";\nimport { LiveOperationsStage }');
edit('dashboard/app/control-room/page.tsx','requestJson("/api/control/v1/cameras?limit=500&action=live%3Aview", controller.signal),',`loadCameraInventory(async (offset, limit) => {
          const body = await requestJson(\`/api/control/v1/cameras?limit=\${limit}&offset=\${offset}&action=live%3Aview\`, controller.signal);
          const total = body && typeof body === "object" ? (body as { total?: number }).total : undefined;
          return { cameras: parseCameras(body), total: typeof total === "number" ? total : undefined };
        }),`);
edit('dashboard/hooks/use-live-ai-wall.ts','import { analyticsApi }','import { loadCameraBatches } from "@/lib/fleet-loading";\nimport { analyticsApi }');
edit('dashboard/hooks/use-live-ai-wall.ts','() => cameras.slice(0, 144).map((camera) => camera.id)','() => cameras.map((camera) => camera.id)');
edit('dashboard/hooks/use-live-ai-wall.ts',`      const response = await analyticsApi.liveWall(cameraIds, 500);
      if (requestSequence !== requestSequenceRef.current) return;
      setRules(response.data.rules);
      setAlerts(response.data.alerts);
      setCorrelations(response.data.correlations ?? []);
      setSummary(response.data.summary);
      setLastUpdatedAt(response.data.sampledAt);`, `      const responses = await loadCameraBatches(cameraIds, ids => analyticsApi.liveWall(ids, 500));
      if (requestSequence !== requestSequenceRef.current) return;
      const rules = [...new Map(responses.flatMap(response => response.data.rules).map(rule => [rule.id, rule])).values()];
      const alerts = [...new Map(responses.flatMap(response => response.data.alerts).map(alert => [alert.id, alert])).values()];
      const open = alerts.filter(alert => !TERMINAL_ALERT_STATUSES.has(alert.status) && !["P4", "P5"].includes(alert.severity));
      setRules(rules);
      setAlerts(alerts);
      setCorrelations(responses.flatMap(response => response.data.correlations ?? []));
      setSummary({ total: alerts.length, open: open.length, new: open.filter(alert => alert.status === "new").length, critical: open.filter(alert => alert.severity === "P1").length, highPriority: open.filter(alert => ["P1", "P2"].includes(alert.severity)).length });
      setLastUpdatedAt(responses.map(response => response.data.sampledAt).sort()[0]);`);
edit('src/routes/analytics.routes.ts','[...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))].slice(0, 144)\n  ),','[...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))]\n  ).refine(ids => ids.length <= 144, "Request at most 144 cameras per batch"),');
