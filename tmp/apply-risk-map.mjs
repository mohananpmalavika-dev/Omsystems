import fs from 'node:fs';
const path='dashboard/app/compliance/risks/page.tsx';
let s=fs.readFileSync(path,'utf8').replaceAll('\r\n','\n');
s=s.replace('import { FieldVisual } from "@/components/field-visual";', 'import { RiskMap } from "@/components/compliance/risk-map";');
const header=s.indexOf('        {/* Header */}');
const headerEnd=s.indexOf('        {error &&',header);
s=s.slice(0,header)+`        <header className="risk-map-heading"><div><p className="workflow-kicker">ASSURANCE / EXPOSURE ATLAS</p><h1>Risk, in perspective.</h1><p>Move from the exposure map to the decisions that reduce it.</p></div><Link href="/compliance/risks/new" className="btn-primary"><Plus size={16}/>Add risk</Link></header>
`+s.slice(headerEnd);
const stats=s.indexOf('        {/* Stats Cards */}');
const statsEnd=s.indexOf('        {/* Filters */}',stats);
s=s.slice(0,stats)+s.slice(statsEnd);
const grid=s.indexOf('        {/* Risks Grid */}');
const tail=s.lastIndexOf('\n      </div>\n    </div>');
if(grid<0||tail<grid)throw Error('Risk layout boundary missing');
s=s.slice(0,grid)+`        <RiskMap records={risks.filter(risk=>{const q=searchTerm.toLowerCase();return [risk.title,risk.riskCode,risk.description].some(value=>value.toLowerCase().includes(q))&&(statusFilter==="all"||risk.status===statusFilter);})} filtered={filteredRisks} likelihood={likelihoodFilter} impact={impactFilter} onCell={(likelihood,impact)=>{setLikelihoodFilter(likelihood);setImpactFilter(impact);}}/>
`+s.slice(tail);
s=s.replace('<input\n                  type="text"','<input\n                  aria-label="Search compliance risks"\n                  type="text"');
s=s.replace('<select\n                value={likelihoodFilter}', '<select\n                aria-label="Risk likelihood"\n                value={likelihoodFilter}').replace('<select\n                value={impactFilter}', '<select\n                aria-label="Risk impact"\n                value={impactFilter}').replace('<select\n                value={statusFilter}', '<select\n                aria-label="Risk stage"\n                value={statusFilter}');
// Old card-specific display maps are replaced by the exposure map and its review brief.
const obsolete=s.indexOf('  const getRiskLevel =');
const obsoleteEnd=s.indexOf('  if (loading)',obsolete);
s=s.slice(0,obsolete)+s.slice(obsoleteEnd);
fs.writeFileSync(path,s);
