import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import ts from 'typescript';
const stage=resolve('tmp/live-person-report-package');mkdirSync(stage,{recursive:true});
const changes=[];
function patch(path,before,after,runtimeBefore,runtimeAfter){changes.push({path,before,after,runtimeBefore,runtimeAfter});}
patch('src/app.ts','import { registerReportsRoutes } from "./routes/reports.routes.js";', 'import { registerReportsRoutes } from "./routes/reports.routes.js";\nimport { registerLivePersonCountRoutes } from "./routes/live-person-count.routes.js";\nimport { LivePersonCountService } from "./analytics/live-person-count.service.js";');
patch('src/app.ts','const analyticsFrameRedis = redisModule.getClient();','const analyticsFrameRedis = redisModule.getClient();\n  const livePersonCountService = analyticsFrameRedis ? new LivePersonCountService(analyticsFrameRedis) : null;',undefined,'const analyticsFrameRedis = redisModule.getClient();\n    const livePersonCountService = analyticsFrameRedis ? new LivePersonCountService(analyticsFrameRedis) : null;');
patch('src/app.ts','analyticsEnabled: analyticsEnabledByCamera.get(camera.id) === true,','analyticsEnabled: analyticsEnabledByCamera.get(camera.id) === true || Boolean(options?.analyticsEngineUrl),');
patch('src/app.ts','    if (rules.length === 0) {\n      return reply.code(202).send({ accepted: false, reason: "no_enabled_camera_ai_rules" });\n    }\n','', '        if (rules.length === 0) {\n            return reply.code(202).send({ accepted: false, reason: "no_enabled_camera_ai_rules" });\n        }\n','');
const captureBlock=`      if (livePersonCountService && result.personCount) {
        // Only the authenticated engine result for this capture can update the report.
        if (Date.parse(result.personCount.observedAt) === Date.parse(input.capturedAt)) {
          await livePersonCountService.record(branch.tenantId, camera.id, result.personCount)
            .catch(error => request.log.warn({ error, cameraId: camera.id }, "Live person count could not be saved"));
        }
      }
`;
patch('src/app.ts','      if (typeof result.failed === "number" && result.failed > 0) {',captureBlock+'      if (typeof result.failed === "number" && result.failed > 0) {','        if (typeof result.failed === "number" && result.failed > 0) {',captureBlock.split('\n').map(line=>'  '+line).join('\n')+'        if (typeof result.failed === "number" && result.failed > 0) {');
patch('src/app.ts','await registerReportsRoutes(app, store);','await registerReportsRoutes(app, store);\n  await registerLivePersonCountRoutes(app, store, livePersonCountService);',undefined,'await registerReportsRoutes(app, store);\n    await registerLivePersonCountRoutes(app, store, livePersonCountService);');
patch('analytics-engine/src/app.ts','import type { AnalyticsRule } from "./analytics-pipeline.js";','import type { AnalyticsRule } from "./analytics-pipeline.js";\nimport type { PersonCountObservation } from "../../packages/contracts/src/live-person-count.js";','','');
patch('analytics-engine/src/app.ts','    const events = await pipeline.processFrame({','    let personCount: PersonCountObservation | null = null;\n    const events = await pipeline.processFrame({','        const events = await pipeline.processFrame({','        let personCount = null;\n        const events = await pipeline.processFrame({');
patch('analytics-engine/src/app.ts','}, input.rules as AnalyticsRule[]);','}, input.rules as AnalyticsRule[], observation => { personCount = observation; });','}, input.rules);','}, input.rules, observation => { personCount = observation; });');
patch('analytics-engine/src/app.ts','      inferenceMode: input.detections === undefined ? "local-onnx" : "normalized-observation",','      inferenceMode: input.detections === undefined ? "local-onnx" : "normalized-observation",\n      personCount,','            inferenceMode: input.detections === undefined ? "local-onnx" : "normalized-observation",','            inferenceMode: input.detections === undefined ? "local-onnx" : "normalized-observation",\n            personCount,');
patch('analytics-engine/src/analytics-pipeline.ts','import type { detectionSchema } from "./app.js";','import type { detectionSchema } from "./app.js";\nimport { PERSON_COUNT_CONFIDENCE, type PersonCountObservation } from "../../packages/contracts/src/live-person-count.js";','import { randomUUID } from "node:crypto";','import { randomUUID } from "node:crypto";\nimport { PERSON_COUNT_CONFIDENCE } from "../../packages/contracts/src/live-person-count.js";');
patch('analytics-engine/src/analytics-pipeline.ts','    rules: AnalyticsRule[],\n  ): Promise<Array<z.infer<typeof detectionSchema>>> {','    rules: AnalyticsRule[],\n    observePersonCount?: (observation: PersonCountObservation) => void,\n  ): Promise<Array<z.infer<typeof detectionSchema>>> {','async processFrame(frame, rules) {','async processFrame(frame, rules, observePersonCount) {');
patch('analytics-engine/src/analytics-pipeline.ts','const shouldDetectObjects = hasMotion || this.needsObjectDetection(rules);','const shouldDetectObjects = Boolean(observePersonCount) || hasMotion || this.needsObjectDetection(rules);');
const countBlock=`    if (observePersonCount) {
      const available = !localInferenceRequested || this.objectDetector.getHealth().status === "healthy";
      observePersonCount({ observedAt: frame.timestamp.toISOString(),
        count: available ? detectedObjects.filter(object => object.label === "person" && object.confidence >= PERSON_COUNT_CONFIDENCE).length : null,
        status: available ? "observed" : "unavailable" });
    }
`;
patch('analytics-engine/src/analytics-pipeline.ts','    const hasObservedObjects = detectedObjects.length > 0;',countBlock+'    const hasObservedObjects = detectedObjects.length > 0;','        const hasObservedObjects = detectedObjects.length > 0;',countBlock.split('\n').map(line=>'    '+line).join('\n')+'        const hasObservedObjects = detectedObjects.length > 0;');
patch('src/analytics/rule-engine.ts','rule.enabled && rule.detectionType !== "no-helmet" && detectionTypes.has(rule.detectionType)','rule.enabled && !["no-helmet", "person-counting", "occupancy-counting"].includes(rule.detectionType) && detectionTypes.has(rule.detectionType)');
const apiMethod=readFileSync('dashboard/lib/api-client.ts','utf8').match(/  getLivePersonCount:[\s\S]*?\n  },/)[0];
patch('dashboard/lib/api-client.ts','export const reportsApi = {','export const reportsApi = {\n'+apiMethod);
patch('dashboard/components/app-layout.tsx','      { label: "Report studio", href: "/reports", icon: FileText },','      { label: "Report studio", href: "/reports", icon: FileText },\n      { label: "Live person count", href: "/reports/live-person-count", icon: BarChart3 },');
patch('dashboard/components/live-wall-windows.tsx','import { ExternalLink, MonitorUp, X } from "lucide-react";','import { ExternalLink, MonitorUp, X } from "lucide-react";\nimport Link from "next/link";');
patch('dashboard/components/live-wall-windows.tsx','      <div><strong>Live Wall windows</strong><p>Combine your selected locations in a new window. Change the selection to open another wall.</p></div>','      <div><strong>Live Wall windows</strong><p>Combine your selected locations in a new window. Change the selection to open another wall.</p></div>\n      <Link className={styles.open} href="/reports/live-person-count">Live person count report <ExternalLink size={14}/></Link>');
patch('dashboard/app/reports/page.tsx','<div className="workflow-heading-actions"><Link href="/reports/mis"','<div className="workflow-heading-actions"><Link href="/reports/live-person-count" className="btn-secondary"><BarChart3 size={16}/>Live person count</Link><Link href="/reports/mis"');
const newFiles=['packages/contracts/src/live-person-count.ts','src/analytics/live-person-count.service.ts','src/routes/live-person-count.routes.ts','dashboard/app/reports/live-person-count/page.tsx','dashboard/components/reports/live-person-count-report.tsx','dashboard/components/reports/live-person-count-report.module.css'];
for(const path of newFiles){const dest=resolve(stage,'source',path);mkdirSync(dirname(dest),{recursive:true});const contents=readFileSync(path,'utf8');writeFileSync(dest,contents);
  if(!path.startsWith('dashboard/')&&path.endsWith('.ts')){const dest=resolve(stage,'dist',path.replace(/\.ts$/,'.js'));mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,ts.transpileModule(contents,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,esModuleInterop:true}}).outputText);}}
writeFileSync(resolve(stage,'patches.json'),JSON.stringify({changes,newFiles},null,2));
execFileSync('tar',['-czf',resolve('tmp/live-person-report-20261006.tar.gz'),'-C',stage,'.']);
console.log('Prepared minimal source patches and three new runtime modules');
