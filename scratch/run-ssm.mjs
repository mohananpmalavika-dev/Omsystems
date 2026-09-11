import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

export async function runSSM(script) {
  const param = JSON.stringify({ commands: [script] });
  writeFileSync('scratch/_ssm_param.json', param, 'utf-8');
  try {
    const cmdId = execSync(
      'aws ssm send-command --instance-ids "i-03fda9a80e75865fd" --document-name "AWS-RunShellScript" --parameters file://scratch/_ssm_param.json --region ap-south-1 --query "Command.CommandId" --output text',
      { encoding: 'utf-8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } }
    ).trim();

    // Poll for completion
    let attempts = 0;
    while (attempts < 15) {
      await new Promise((r) => setTimeout(r, 2000));
      const resJson = execSync(
        `aws ssm get-command-invocation --command-id "${cmdId}" --instance-id "i-03fda9a80e75865fd" --region ap-south-1 --output json`,
        { encoding: 'utf-8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } }
      );
      const res = JSON.parse(resJson);
      if (res.Status === 'Success' || res.Status === 'Failed' || res.Status === 'Cancelled') {
        console.log('Status:', res.Status);
        if (res.StandardOutputContent) console.log('STDOUT:\n' + res.StandardOutputContent);
        if (res.StandardErrorContent) console.error('STDERR:\n' + res.StandardErrorContent);
        return res;
      }
      attempts++;
    }
  } finally {
    try { unlinkSync('scratch/_ssm_param.json'); } catch {}
  }
}

if (process.argv[2]) {
  runSSM(process.argv[2]);
}
