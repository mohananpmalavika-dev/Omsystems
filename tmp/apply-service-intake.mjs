import fs from 'node:fs';
const path='dashboard/app/maintenance/workorders/new/page.tsx';
let s=fs.readFileSync(path,'utf8').replaceAll('\r\n','\n');
s=s.replace('import { FieldVisual } from "@/components/field-visual";\n','');
s=s.replace('<header className="record-form-hero workspace-heading">','<header className="service-intake-heading">').replace('      <FieldVisual /></header>','      </header>');
s=s.replace('<form className="work-order-form"', '<form className="work-order-form service-intake-composer"');
s=s.replace('<div className="work-order-form-grid">','<div className="work-order-form-grid service-intake-grid">\n          <section className="service-intake-context"><p className="workflow-kicker">01 / DESCRIBE & LOCATE</p><h2>What needs attention?</h2>');
const severity=s.indexOf('          <label className="work-order-field">\n            <span>Severity</span>');
const severityEnd=s.indexOf('          </label>',severity)+'          </label>'.length;
if(severity<0)throw Error('Severity input missing');
s=s.slice(0,severity)+`          </section><aside className="service-intake-response"><p className="workflow-kicker">02 / PLAN THE RESPONSE</p><h2>Set the service window.</h2><div className="service-urgency" role="radiogroup" aria-label="Service severity">{(["low","medium","high","critical"] as WorkOrder["severity"][]).map(level=><button type="button" role="radio" aria-checked={severity===level} key={level} onClick={()=>handleSeverityChange(level)}><strong>{level}</strong><span>{level==="critical"?4:level==="high"?12:level==="medium"?24:72}h recommended SLA</span></button>)}</div>
`+s.slice(severityEnd);
const gridEnd=s.indexOf('        </div>\n\n        {error &&',severity);
s=s.slice(0,gridEnd)+`          <div className="service-window-note"><strong>{slaWindowHours} hour response window</strong><p>Changing severity updates the suggested SLA deadline. Adjust the date if the agreed service window differs.</p></div></aside>
`+s.slice(gridEnd);
fs.writeFileSync(path,s);
