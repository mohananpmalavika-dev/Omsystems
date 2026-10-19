import { execSync } from 'child_process';
import { hashPassword, verifyPassword } from '../src/security/password.ts';
import { runSSM } from './run-ssm.mjs';

async function main() {
  console.log('🔒 Generating password hash for "test@1234"...');
  const newPassword = 'test@1234';
  const newHash = await hashPassword(newPassword);
  console.log(`Generated hash: ${newHash}`);

  const verifyCheck = await verifyPassword(newPassword, newHash);
  if (!verifyCheck) {
    throw new Error('Self-verification of new password hash failed!');
  }
  console.log('✅ Hash verified successfully against "test@1234".\n');

  const updateSql = `UPDATE users SET password_hash = '${newHash}', must_change_password = false WHERE lower(username) = 'test';`;
  const b64 = Buffer.from(updateSql).toString('base64');

  // 1. Update AWS PostgreSQL via base64 pipeline to prevent $ expansion
  console.log('1️⃣ Updating AWS PostgreSQL (with base64)...');
  const awsCmd = `echo "${b64}" | base64 -d | docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid`;
  await runSSM(awsCmd);

  // 2. Update GCP PostgreSQL via base64 pipeline
  console.log('2️⃣ Updating GCP PostgreSQL (with base64)...');
  const gcpCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
  const gcpRes = execSync(gcpCmd, { encoding: 'utf8' });
  console.log('GCP Output:', gcpRes.trim());

  // 3. Test Logins
  console.log('\n3️⃣ Testing logins across endpoints...');
  const endpoints = [
    { name: 'AWS Direct', url: 'http://3.7.216.169:8080/v1/auth/login' },
    { name: 'AWS Domain', url: 'https://3-7-216-169.sslip.io/v1/auth/login' },
    { name: 'GCP Domain', url: 'https://35-200-130-81.sslip.io/v1/auth/login' },
  ];

  for (const ep of endpoints) {
    console.log(`\nTesting ${ep.name} (${ep.url}):`);
    
    // Test old password (should fail)
    try {
      const oldRes = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test', password: 'test@123' }),
      });
      console.log(`  Old password 'test@123' status: ${oldRes.status} (expected 401)`);
    } catch (e) {
      console.log(`  Old password test error: ${e.message}`);
    }

    // Test new password (should succeed)
    try {
      const newRes = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test', password: 'test@1234' }),
      });
      const data = await newRes.json();
      console.log(`  New password 'test@1234' status: ${newRes.status} ${newRes.statusText}`);
      if (newRes.ok && data.accessToken) {
        console.log(`  ✅ SUCCESS! Token acquired for user: ${data.user?.username || 'test'} (${data.user?.displayName || ''})`);
      } else {
        console.log(`  ❌ Failed:`, data);
      }
    } catch (e) {
      console.log(`  New password test error: ${e.message}`);
    }
  }
}

main().catch(console.error);
