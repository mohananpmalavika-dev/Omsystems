import { runSSM } from './run-ssm.mjs';

const s = `
python3 -c "
import subprocess
proc = subprocess.run(['docker', 'logs', '--tail', '1000', 'sentinel-aws-control-plane'], capture_output=True, text=True, errors='ignore')
lines = proc.stdout.splitlines() + proc.stderr.splitlines()
for l in lines:
    if any(k in l.lower() for k in ['500', 'error', 'exception', 'stack', 'cannot read', 'typeerror', 'failed']):
        if len(l) < 300 and not l.startswith('AA') and not l.startswith('//'):
            print(l)
"
`;

runSSM(s);
