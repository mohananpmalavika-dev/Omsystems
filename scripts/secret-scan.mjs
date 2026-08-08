#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const gitFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const allowedExtensions = ['.js', '.ts', '.mjs', '.tsx', '.jsx', '.json', '.yaml', '.yml', '.env', '.env.example'];
const secretPatterns = [
  /(?:API[_-]?KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|EDGE_BRIDGE_SHARED_KEY|JWT[_-]?SECRET|CLOUDFLARE_API_TOKEN|OPENAI_API_KEY|EMAIL_API_KEY|PASSWORD_ENCRYPTION_KEY|VAULT_ENCRYPTION_KEY|POLICE_API_SECRET|VIDEO_ENCRYPTION_KEY|DB_PASSWORD|POSTGRES_PASSWORD)\s*(?:=|:)\s*['"`]([A-Za-z0-9\/\+_=.-]{16,})['"`]?/i,
  /(?:-----BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY-----)/,
  /(?:ssh-rsa|ssh-ed25519)/,
  /(?:AIza[0-9A-Za-z\-_]{35})/, // Google API key pattern
  /(?:ghp_[A-Za-z0-9_]{36})/, // GitHub token
  /(?:xox[baprs]-[A-Za-z0-9-]{10,48})/, // Slack token
];

const ignorePaths = [
  'package-lock.json',
  '.github/workflows/release-baseline.yml',
  'scripts/secret-scan.mjs',
];

const findings = [];
for (const filePath of gitFiles) {
  if (ignorePaths.some((ignore) => filePath.endsWith(ignore))) continue;
  if (filePath.startsWith('node_modules/') || filePath.startsWith('.git/')) continue;
  if (!allowedExtensions.some((ext) => filePath.endsWith(ext))) continue;

  const content = readFileSync(join(process.cwd(), filePath), 'utf8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    if (/process\.env|env\.|process\.env\[/i.test(line)) continue;

    for (const pattern of secretPatterns) {
      if (pattern.test(line)) {
        // Exclude common benign placeholders
        if (/change-me|change-in-production|example|localhost|00000000-0000-0000-0000-000000000000|your[-_ ]?secure[-_ ]?token|your[-_ ]?openai[-_ ]?api[-_ ]?key|default[-_ ]?secret|default[-_ ]?key|test[-_ ]?api[-_ ]?key/i.test(line)) continue;

        findings.push({ file: filePath, line: i + 1, text: line.trim() });
        break;
      }
    }
  }
}

if (findings.length === 0) {
  console.log('Secret scan passed. No high-risk patterns found in tracked files.');
  process.exit(0);
}

console.error('Secret scan found potential sensitive values:');
for (const finding of findings) {
  console.error(`- ${finding.file}:${finding.line}: ${finding.text}`);
}
console.error('\nReview the findings and remove any committed secrets.');
process.exit(1);
