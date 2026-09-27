import fs from 'node:fs';
const path='dashboard/components/live-operations-stage.tsx';
let source=fs.readFileSync(path,'utf8').replaceAll('\r\n','\n');
function edit(oldText,newText){if(!source.includes(oldText))throw new Error('Missing stage target '+oldText.slice(0,90));source=source.replace(oldText,newText);}
edit('import { EnhancedCameraGrid, type GridLayout }','import { fleetCameraPage, operationalStageAlerts } from "./live-stage-model";\nimport { EnhancedCameraGrid, type GridLayout, type GridSize }');
edit('"respond" | "overview"','"respond" | "overview" | "fleet"');
edit('{ id: "overview", label: "Overview", icon: LayoutDashboard }]','{ id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "fleet", label: "Fleet wall", icon: CameraIcon }]');
edit('  const [sceneId, setSceneId]',`  const [fleetColumns, setFleetColumns] = useState(4);
  const [fleetPage, setFleetPage] = useState(0);
  const [fleetBranch, setFleetBranch] = useState("all");
  const [fleetRotating, setFleetRotating] = useState(false);
  const [sceneId, setSceneId]`);
edit('alerts.filter(alert => scopedIds.has(alert.cameraId) && alert.severity !== "P4" && alert.severity !== "P5")','operationalStageAlerts(alerts, scopedIds)');
edit('  const stageCameras = useMemo(',`  const fleet = useMemo(() => fleetCameraPage(scoped, fleetBranch, fleetColumns ** 2, fleetPage), [scoped, fleetBranch, fleetColumns, fleetPage]);
  useEffect(() => {
    if (mode !== "fleet" || !fleetRotating || fleet.pageCount < 2) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setFleetPage(page => (page + 1) % fleet.pageCount); }, 15_000);
    return () => window.clearInterval(timer);
  }, [mode, fleetRotating, fleet.pageCount]);
  useEffect(() => { if (fleetBranch !== "all" && !branches.some(branch => branch.id === fleetBranch)) { setFleetBranch("all"); setFleetPage(0); } }, [branches, fleetBranch]);
  const stageCameras = useMemo(`);
edit('() => mode === "overview" ? branches.slice(0, 4).map(branch => branch.members[0]) : active ? [active] : [], [mode, active, branches]','() => mode === "fleet" ? fleet.cameras : mode === "overview" ? branches.slice(0, 4).map(branch => branch.members[0]) : active ? [active] : [], [mode, active, branches, fleet]');
edit('gridSize: mode === "overview" && stageCameras.length > 1 ? "2x2" : "1x1"','gridSize: mode === "fleet" ? `${fleetColumns}x${fleetColumns}` as GridSize : mode === "overview" && stageCameras.length > 1 ? "2x2" : "1x1"');
edit('stream: mode === "overview" ? "sub" : "main"','stream: mode === "overview" || mode === "fleet" ? "sub" : "main"');
edit('[mode, stageCameras]);','[mode, stageCameras, fleetColumns]);');
edit('{mode === "overview" ? "BRANCH SCENES / UP TO 4 LIVE FEEDS"','{mode === "fleet" ? "FLEET / MULTI-CAMERA VIEW" : mode === "overview" ? "BRANCH SCENES / UP TO 4 LIVE FEEDS"');
edit('{mode === "overview" ? "Across your scope"','{mode === "fleet" ? "Your fleet, in view." : mode === "overview" ? "Across your scope"');
edit('{mode === "overview" ? "Expand a branch scene to take focus."','{mode === "fleet" ? `${fleet.total} cameras in scope · ${stageCameras.length} tiles on this page · up to ${Math.min(maxConcurrentStreams, stageCameras.length)} simultaneous streams` : mode === "overview" ? "Expand a branch scene to take focus."');
edit('active && mode !== "overview" &&','active && mode !== "overview" && mode !== "fleet" &&');
edit('        <div className={`los-video-stage',`        {mode === "fleet" && <div className="los-fleet-toolbar">
          <label>Branch<select aria-label="Fleet branch" value={fleetBranch} onChange={event => { setFleetBranch(event.target.value); setFleetPage(0); }}>{[{ id: "all", name: "All branches" }, ...branches].map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label>Tiles<select aria-label="Fleet tile layout" value={fleetColumns} onChange={event => { setFleetColumns(Number(event.target.value)); setFleetPage(0); }}>{[4,6,8,12].map(columns => <option key={columns} value={columns}>{columns} × {columns} ({columns ** 2} tiles)</option>)}</select></label>
          <button type="button" disabled={busy || fleet.currentPage === 0} onClick={() => setFleetPage(fleet.currentPage - 1)}>Previous feeds</button>
          <span role="status">Page {fleet.currentPage + 1} / {fleet.pageCount}</span>
          <button type="button" disabled={busy || fleet.currentPage + 1 === fleet.pageCount} onClick={() => setFleetPage(fleet.currentPage + 1)}>Next feeds</button>
          <button type="button" aria-pressed={fleetRotating} onClick={() => setFleetRotating(!fleetRotating)}>{fleetRotating ? "Pause rotation" : "Rotate every 15s"}</button>
          <small>Substreams use the configured viewer capacity. Select a camera in the dock to investigate it.</small>
        </div>}
        <div className={\`los-video-stage`);
edit('key={mode === "overview" ? "overview" : active?.id}','key={mode === "fleet" ? `fleet:${fleetBranch}:${fleetColumns}:${fleet.currentPage}` : mode === "overview" ? "overview" : active?.id}');
edit('maxConcurrentStreams={mode === "overview" ? Math.min(4, maxConcurrentStreams) : 1}','maxConcurrentStreams={mode === "fleet" ? maxConcurrentStreams : mode === "overview" ? Math.min(4, maxConcurrentStreams) : 1}');
// Selecting a related camera exits the fleet to an operator focus view.
edit('function selectCamera(id: string) { if (busy) return;','function selectCamera(id: string) { if (busy) return; if (mode === "fleet") setMode("watch");');
fs.writeFileSync(path,source);
