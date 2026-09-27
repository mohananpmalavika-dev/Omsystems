import fs from 'node:fs';
let path='dashboard/components/compliance/risk-map.tsx';
let s=fs.readFileSync(path,'utf8');
s=s.replace('onCell }: { records:', 'onCell, unavailable = false }: { unavailable?:boolean; records:').replace('<strong>{count}</strong>','<strong>{unavailable?"—":count}</strong>').replace('className={`risk-cell risk-cell-', 'disabled={unavailable} className={`risk-cell risk-cell-').replace('No risks in this intersection or filter.', '{unavailable?"Risk feed unavailable. Restore the connection to review exposure.":"No risks in this intersection or filter."}');
fs.writeFileSync(path,s);
path='dashboard/app/compliance/risks/page.tsx';s=fs.readFileSync(path,'utf8').replace('<RiskMap records=', '<RiskMap unavailable={Boolean(error)} records=');fs.writeFileSync(path,s);
path='dashboard/components/compliance/evidence-review-desk.tsx';s=fs.readFileSync(path,'utf8').replace('count:items.length','count:unavailable?undefined:items.length').replace('count:items.filter','count:unavailable?undefined:items.filter');fs.writeFileSync(path,s);
