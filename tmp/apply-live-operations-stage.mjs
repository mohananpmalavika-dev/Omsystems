import fs from 'node:fs';
import ts from '../dashboard/node_modules/typescript/lib/typescript.js';
const path='dashboard/app/control-room/page.tsx';let source=fs.readFileSync(path,'utf8');
if(source.includes('import { LiveOperationsStage }'))throw Error('Already applied');
const tree=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const nodes=[];function visit(n){if(ts.isJsxElement(n))nodes.push(n);ts.forEachChild(n,visit)}visit(tree);
const find=cls=>nodes.find(n=>n.openingElement.getText().includes(`className="${cls}"`));
const header=find('control-room-nav-hub'),scope=find('hierarchy-filter-bar'),patrol=find('patrol-tour-bar');
const edits=[{start:header.getStart(),end:header.end,text:`<header className="los-page-heading"><div><span className="los-eyebrow">KRYPTONVISION / LIVE OPERATIONS</span><h1>Live Operations Stage</h1><p>A situation-first workspace. Choose a scene, follow an event, coordinate the response.</p></div><div className="los-page-actions"><span className={"los-data-state " + dataMode}><i />{dataMode === "live" ? "Inventory connected" : dataMode === "partial" ? "Partial service availability" : "Services unavailable"}</span><Link href="/operations/alerts">Alert centre <ArrowUpRight size={15} /></Link><button type="button" onClick={() => void loadData()} disabled={refreshing}><RefreshCw size={15} />{refreshing ? "Refreshing…" : "Refresh scope"}</button></div></header>`},
{start:scope.getStart(),end:scope.end,text:`<details className="los-scope-sheet"><summary><span><Globe2 size={17} />Wall scope & filters</span><strong>{activeSingleBranch?.branchName ?? "Across branches"} · {filteredCameras.length} cameras</strong><ChevronRight size={16} /></summary>${scope.getText()}</details>`},
{start:patrol.getStart(),end:patrol.end,text:`<details className="los-patrol-sheet"><summary><span><Compass size={16} />Patrol & advanced operations</span><small>{isPatrolActive ? PATROL_STAGES[patrolStageIndex].name : "Manual operator focus"}</small><ChevronRight size={16} /></summary>${patrol.getText()}<div className="los-advanced-actions"><button type="button" onClick={() => setEmergencyLockdownOpen(true)}><Siren size={14} />Panic / lockdown cockpit</button><button type="button" onClick={() => setAudioDeterrenceOpen(true)}><Megaphone size={14} />Audio broadcast console</button></div></details>`}];
const section=find('control-room-content');
const grid=section.children.find(n=>ts.isJsxExpression(n));
const expression=grid.expression;
if(!ts.isConditionalExpression(expression))throw Error('Camera wall branch missing');
const oldGrid=expression.whenTrue;
edits.push({start:oldGrid.getStart(),end:oldGrid.end,text:`<LiveOperationsStage cameras={filteredCameras} alerts={liveAi.alerts} aiByCamera={aiByCamera} showAiOverlay={showAiOverlays} focusCameraId={focusCameraId} maxConcurrentStreams={CONTROL_ROOM_MAX_CONCURRENT_STREAMS} analyticsError={liveAi.error} analyticsLoading={liveAi.loading} onRefresh={liveAi.refresh} onActiveStreamsChange={setActiveStreams} onMonitoredCamerasChange={handleMonitoredCamerasChange} onOpenCameraAi={cameraId => { setSelectedAiCameraId(cameraId); setFocusCameraId(cameraId); setAiPanelOpen(true); }} />`});
for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
source=source.replace('import Link','import { LiveOperationsStage } from "@/components/live-operations-stage";\nimport Link').replace('  Activity,','  ArrowUpRight,\n  Activity,').replace('<div className="control-room">','<div className="control-room operations-stage-room">');
fs.writeFileSync(path,source);
const component='dashboard/components/live-operations-stage.tsx';let stage=fs.readFileSync(component,'utf8').replace('useRef<string>()','useRef<string | undefined>(undefined)').replace('onClick={() => setPinned(!pinned)}','onClick={() => { if (active) setCameraId(active.id); setPinned(!pinned); }}');fs.writeFileSync(component,stage);
const layout='dashboard/app/layout.tsx';let l=fs.readFileSync(layout,'utf8');l=l.replace('import "./workflow-experience.css";','import "./workflow-experience.css";\nimport "./live-operations-stage.css";');fs.writeFileSync(layout,l);
