import { hashPassword } from '../src/security/password.ts';
import { runSSM } from './run-ssm.mjs';

async function main() {
  console.log('🚀 Creating user "test" with role "admin" under "Unimoni"...\n');

  const username = 'test';
  const password = 'test@123';
  const displayName = 'Test Admin';
  const email = 'test@unimoni.com';
  const role = 'company_admin';
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const unimoniOrgId = 'bdaaa612-3fff-4e17-8a9d-e71f11d9bbce';
  const customRoleId = 'f9e5141f-d8d6-46a6-97cc-e6abbb99dd21'; // 'Admin' custom role
  const assignedByUserId = 'fd64ea0d-2860-4467-a9b3-41ee0de52669'; // mgdhanyamohan

  // 1. Hash password
  console.log('1️⃣ Hashing password with scrypt...');
  const passwordHash = await hashPassword(password);
  console.log('   Hash generated:', passwordHash.substring(0, 30) + '...\n');

  // 2. Prepare SQL
  const sql = `
BEGIN;

-- Check if user already exists and delete if so, or upsert
DELETE FROM access_grants WHERE user_id IN (SELECT id FROM users WHERE lower(username) = lower('${username}'));
DELETE FROM user_organizational_assignments WHERE user_id IN (SELECT id FROM users WHERE lower(username) = lower('${username}'));
DELETE FROM users WHERE lower(username) = lower('${username}');

-- Insert new user
INSERT INTO users (
  id,
  tenant_id,
  identity_subject,
  display_name,
  email,
  username,
  password_hash,
  role,
  status,
  must_change_password,
  active,
  custom_role_id,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '${tenantId}'::uuid,
  '${username}',
  '${displayName}',
  '${email}',
  '${username}',
  '${passwordHash}',
  '${role}'::user_role,
  'active',
  false,
  true,
  '${customRoleId}'::uuid,
  NOW(),
  NOW()
);

-- Insert organizational assignment
INSERT INTO user_organizational_assignments (
  user_id,
  tenant_id,
  scope_node_id,
  is_primary,
  assigned_at,
  assigned_by_user_id
)
SELECT
  u.id,
  u.tenant_id,
  '${unimoniOrgId}'::uuid,
  true,
  NOW(),
  '${assignedByUserId}'::uuid
FROM users u
WHERE lower(u.username) = lower('${username}');

-- Insert access grants
INSERT INTO access_grants (
  tenant_id,
  user_id,
  scope_node_id,
  action,
  effect,
  grant_source
)
SELECT
  u.tenant_id,
  u.id,
  '${unimoniOrgId}'::uuid,
  rp.action,
  'allow',
  'role'
FROM users u
JOIN role_permissions rp ON rp.role = u.role
WHERE lower(u.username) = lower('${username}')
ON CONFLICT DO NOTHING;

COMMIT;

-- Verification queries
SELECT u.id, u.username, u.email, u.role, u.status, u.must_change_password, cr.name as custom_role_name, rn.name as primary_org
FROM users u
LEFT JOIN custom_roles cr ON cr.id = u.custom_role_id
LEFT JOIN user_organizational_assignments uoa ON uoa.user_id = u.id AND uoa.is_primary = true
LEFT JOIN resource_nodes rn ON rn.id = uoa.scope_node_id
WHERE lower(u.username) = lower('${username}');

SELECT count(*) as grant_count FROM access_grants 
WHERE user_id = (SELECT id FROM users WHERE lower(username) = lower('${username}'));
`;

  console.log('2️⃣ Executing SQL on PostgreSQL container...');
  const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
  const result = await runSSM(cmd);

  // 3. Test HTTP login
  console.log('\n3️⃣ Testing HTTP login via Control Plane API...');
  const loginRes = await fetch('http://3.7.216.169:8080/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'test',
      password: 'test@123',
    }),
  });

  console.log(`   Login status: ${loginRes.status} ${loginRes.statusText}`);
  const loginData = await loginRes.json();
  if (loginRes.ok) {
    console.log('   ✅ Login successful!');
    console.log('   Access Token:', loginData.accessToken ? `${loginData.accessToken.substring(0, 15)}...` : 'N/A');
    console.log('   User:', JSON.stringify(loginData.user, null, 2));

    // Test /v1/auth/me with the token
    console.log('\n4️⃣ Verifying /v1/auth/me with access token...');
    const meRes = await fetch('http://3.7.216.169:8080/v1/auth/me', {
      headers: {
        Authorization: `Bearer ${loginData.accessToken}`,
      },
    });
    console.log(`   /v1/auth/me status: ${meRes.status}`);
    const meData = await meRes.json();
    console.log('   User profile from /v1/auth/me:', JSON.stringify(meData, null, 2));
  } else {
    console.error('   ❌ Login failed:', loginData);
  }
}

main().catch(console.error);
