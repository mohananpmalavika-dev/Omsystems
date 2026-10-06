import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const root=process.cwd(),before=path.join(root,'tmp/report-management-production-source'),stage=path.join(root,'tmp/report-management-release');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const existing=[
 'src/store.ts','src/database/analytics-repository.ts','src/routes/analytics.routes.ts','src/routes/operational-reports.routes.ts',
 'src/routes/reports/mis-unified.routes.ts','src/routes/reports/branch-benchmarking.routes.ts','src/routes/reports/compliance-scorecard.routes.ts','src/routes/reports/financial-tco.routes.ts',
 'src/control-plane-store.ts','src/reporting/worker.ts','src/reporting/types.ts','src/reporting/domain/daily-surveillance-report.types.ts',
 'src/reporting/services/daily-surveillance-collector.service.ts','src/reporting/renderers/daily-surveillance-csv.renderer.ts','src/reporting/renderers/daily-surveillance-xlsx.renderer.ts',
 'dashboard/app/analytics/alerts/page.tsx','dashboard/components/alerts/alerts-graphical-analytics.tsx','dashboard/app/reports/mis/page.tsx','dashboard/app/reports/page.tsx',
 'dashboard/app/reports/benchmarking/page.tsx','dashboard/app/reports/compliance/page.tsx','dashboard/app/reports/financial/page.tsx',
 'dashboard/components/app-layout.tsx','dashboard/lib/section-hubs.ts',
];
const additions=[
 'src/reporting/hierarchy.ts','packages/contracts/src/report-hierarchy.ts',
 'dashboard/lib/alert-report.ts','dashboard/lib/report-export.ts','dashboard/lib/branch-opening-csv.ts',
 'dashboard/components/alerts/management-alert-analytics.tsx','dashboard/components/reports/management-report.module.css',
 'dashboard/components/reports/executive-management-report.tsx','dashboard/components/reports/report-pagination.tsx','dashboard/components/reports/report-date-controls.tsx',
];
const manifest={files:[],backend:[],createdAt:new Date().toISOString()};
for(const file of [...existing,...additions]) {
 let source=await fs.readFile(path.join(root,file),'utf8');
 let original=null;try{original=await fs.readFile(path.join(before,file));}catch(error){if(existing.includes(file))throw error;}
 if(file==='src/store.ts') {
  // Preserve production device discovery changes; apply only report methods.
  let production=original.toString();
  for(const [start,end] of [['  async listAnalyticsAlerts(','  async countAnalyticsAlerts('],['  async getAnalyticsAlert(','  async updateAnalyticsAlertEvidence(']]) {
   const pStart=production.indexOf(start),pEnd=production.indexOf(end,pStart),sStart=source.indexOf(start),sEnd=source.indexOf(end,sStart);
   if([pStart,pEnd,sStart,sEnd].some(index=>index<0))throw new Error(`Report method anchor missing: ${start}`);
   production=production.slice(0,pStart)+source.slice(sStart,sEnd)+production.slice(pEnd);
  }
  source='import { resolveReportHierarchy } from "../packages/contracts/src/report-hierarchy.js";\n'+production;
 }
 if(file==='dashboard/app/reports/page.tsx')source=source.replace('<Link href="/reports/live-person-count" className="btn-secondary"><BarChart3 size={16}/>Live person count</Link>','');
 if(file==='dashboard/components/app-layout.tsx') {
  const start=source.indexOf('      { label: "Management overview"'),end=source.indexOf('      { label: "Cost & value analysis"',start);
  if(start<0||end<0)throw new Error('Report menu anchors missing');
  const anchor='      { label: "Executive reports", href: "/reports/mis", icon: FileSpreadsheet },';
  if(!original.toString().includes(anchor))throw new Error('Production report menu anchor missing');
  source=original.toString().replace(anchor,source.slice(start,end).trimEnd());
 }
 if(file==='dashboard/lib/section-hubs.ts') {
  const updated=source.split('\n').find(line=>line.includes('title: "Publish the picture"'));
  const old=original.toString().split('\n').find(line=>line.includes('title: "Publish the picture"'));
  if(!updated||!old)throw new Error('Report hub anchor missing');
  source=original.toString().replace(old,updated);
 }
 const target=path.join(stage,'source',file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,source);
 manifest.files.push({path:file,beforeSha256:original?hash(original):null,afterSha256:hash(source)});
 if(!file.startsWith('dashboard/')&&file.endsWith('.ts')) {
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,isolatedModules:true},fileName:file,reportDiagnostics:true});
  if(compiled.diagnostics?.some(item=>item.category===ts.DiagnosticCategory.Error))throw new Error(`Compile error: ${file}`);
  const runtime=file.replace(/\.ts$/,'.js'),destination=path.join(stage,'dist',runtime);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,compiled.outputText);manifest.backend.push(runtime);
 }
}
await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify(manifest,null,2));
await fs.copyFile(path.join(root,'scratch/verify-live-management-reports.mjs'),path.join(stage,'verify-live-management-reports.mjs'));
console.log(JSON.stringify({sourceFiles:manifest.files.length,runtimeFiles:manifest.backend.length,stage}));
