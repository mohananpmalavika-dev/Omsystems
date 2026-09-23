const fs = require('fs');
const p = '/app/dist/src/analytics/rule-engine.js';
if (fs.existsSync(p)) {
  let c = fs.readFileSync(p, 'utf8');
  const t = '    const types = [event.detectionType];';
  const r = '    const types = [event.detectionType];\n    if (event.detectionType === "helmet" || event.detectionType === "helmet-worn") { types.push("helmet", "helmet-worn"); }';
  if (c.includes(t) && !c.includes('types.push("helmet"')) {
    c = c.replace(t, r);
    fs.writeFileSync(p, c, 'utf8');
    console.log('PATCHED_RULE_ENGINE');
  } else {
    console.log('ALREADY_PATCHED_OR_NOT_FOUND');
  }
}
