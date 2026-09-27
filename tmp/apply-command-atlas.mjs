import fs from 'node:fs';
const file = 'dashboard/components/operations/command-center-view.tsx';
let source = fs.readFileSync(file, 'utf8');
source = source.replace('import { StatusBadge }', 'import { CommandNetworkCanvas } from "./command-network-canvas";\nimport { StatusBadge }');
source = source.replace('className="command-center-page space-y-6 pb-12"', 'className="command-center-page command-atlas pb-12"');
const start = source.indexOf('      {/* Top Banner & Header */}');
const end = source.indexOf('      <div className="dashboard-action-grid">', start);
if (start < 0 || end < 0) throw new Error('Hero boundaries not found');
source = source.slice(0, start) + `      <section className="atlas-stage" aria-label="Command Center overview">
        <header className="atlas-stage-header">
          <span className="atlas-wordmark"><span /><strong>COMMAND / CENTER</strong><small>SECURITY OPERATIONS</small></span>
          <span className={\`telemetry-truth-badge \${freshness.state}\`} aria-label={\`\${freshness.label}. \${freshness.detail}\`}><span className="telemetry-truth-dot" />{freshness.label}</span>
          <button type="button" onClick={loadData} disabled={loading} className="atlas-refresh" aria-label="Refresh fleet telemetry"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /><span>{loading ? "Syncing" : "Sync fleet"}</span></button>
        </header>
        <div className="atlas-stage-body">
          <div className="atlas-intro">
            <p className="atlas-eyebrow"><span>01 /</span> THE BIG PICTURE</p>
            <h1>See everything.<br /><em>Act ahead.</em></h1>
            <p className="atlas-intro-description">Every branch. Every signal.<br />One place to make your next move.</p>
            <Link href="/control-room" onClick={navigateTo("/control-room")} className="atlas-live-link"><span><Play size={17} /></span> Enter live wall <ArrowUpRight size={17} /></Link>
            <div className="atlas-intro-foot"><ShieldCheck size={16} /><span>{freshness.detail}</span></div>
          </div>
          <CommandNetworkCanvas branches={branches} confirmed={hasBranchData} onSelect={setSelectedBranchWorkspace} />
          <aside className="atlas-coverage" aria-label="Camera coverage">
            <span className="atlas-eyebrow">COVERAGE</span>
            <div className="atlas-coverage-instrument" style={{ "--coverage": \`\${hasCameraCountData && !cameraTelemetryUnavailable && totalCamerasCount > 0 ? Math.round(workingCamerasCount / totalCamerasCount * 100) : 0}%\` } as React.CSSProperties}>
              <div className="atlas-coverage-bars" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} className={hasCameraCountData && !cameraTelemetryUnavailable && totalCamerasCount > 0 && i < Math.round(workingCamerasCount / totalCamerasCount * 24) ? "is-lit" : ""} />)}</div>
              <strong>{hasCameraCountData && !cameraTelemetryUnavailable && totalCamerasCount > 0 ? Math.round(workingCamerasCount / totalCamerasCount * 100) : "—"}<small>{totalCamerasCount > 0 && !cameraTelemetryUnavailable ? "%" : ""}</small></strong>
              <span>CAMERAS WORKING</span>
            </div>
            <p>{hasCameraCountData && !cameraTelemetryUnavailable ? \`\${workingCamerasCount.toLocaleString()} / \${totalCamerasCount.toLocaleString()} confirmed\` : "No confirmed telemetry"}</p>
            <Link href="/operations/cameras" onClick={navigateTo("/operations/cameras")}>Inspect fleet <ArrowUpRight size={15} /></Link>
          </aside>
        </div>
        <div className="atlas-metric-strip" aria-label="Operations at a glance">
          {[
            { label: "Connected branches", value: hasBranchCountData ? totalBranchesCount.toLocaleString() : "—", detail: hasHealthyBranchData ? \`\${healthyBranchesCount} healthy\` : "Awaiting telemetry", icon: Building2, href: "/operations/branches", tone: "blue" },
            { label: "Camera estate", value: hasCameraCountData ? totalCamerasCount.toLocaleString() : "—", detail: hasCameraCountData ? \`\${workingCamerasCount.toLocaleString()} working\` : "Awaiting telemetry", icon: Camera, href: "/operations/cameras", tone: "cyan" },
            { label: "Branches at risk", value: hasRiskData ? atRiskBranchesCount.toLocaleString() : "—", detail: hasRiskData ? "High + medium risk" : "Awaiting assessment", icon: ShieldAlert, href: "/operations/branches", tone: "rose" },
            { label: "Camera issues", value: hasCameraCountData ? knownCameraFailures.toLocaleString() : "—", detail: hasCameraCountData ? \`\${cameraTotals.unknown.toLocaleString()} unknown\` : "Awaiting diagnostics", icon: Activity, href: "/operations/cameras", tone: "amber" },
          ].map(({ label, value, detail, icon: Icon, href, tone }, index) => <Link key={label} href={href} onClick={navigateTo(href)} className={\`atlas-metric tone-\${tone}\`}><div><span>{String(index + 1).padStart(2, "0")}</span><Icon size={16} /><ArrowUpRight size={14} /></div><strong>{value}</strong><span>{label}</span><small>{detail}</small></Link>)}
        </div>
        <footer className="atlas-stage-footer"><span><Radio size={13} /> TELEMETRY REFRESHES EVERY 15 SECONDS</span><div><Link href="/admin/branch-onboarding"><PlusCircle size={14} /> Onboard branch</Link><button type="button" onClick={exportHealthCsv} disabled={branches.length === 0}><FileCheck2 size={14} /> Export health</button></div></footer>
      </section>

` + source.slice(end);
source = source.replace('>OPERATIONS PULSE<', '>OPERATIONS PULSE<').replace('>Focus now</h2>', '>Your next move.</h2>');
fs.writeFileSync(file, source);
