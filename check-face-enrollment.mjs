#!/usr/bin/env node
/**
 * Face Login Diagnostic Tool
 * 
 * This script checks:
 * 1. User face enrollment status
 * 2. Face template structure and validity
 * 3. Database queries used for face login
 * 4. Threshold configurations
 * 
 * Usage:
 *   node check-face-enrollment.mjs [username-or-email]
 */

import pg from 'pg';
import { config } from 'dotenv';

config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_URL,
  ssl: { rejectUnauthorized: false }
});

const username = process.argv[2];

async function checkEnrollment() {
  try {
    console.log('🔍 Face Login Diagnostic Tool\n');
    console.log('=' .repeat(60));

    if (!username) {
      console.log('\n⚠️  No username provided. Checking all enrolled users...\n');
      
      // List all enrolled users
      const result = await pool.query(`
        SELECT 
          u.id,
          u.username,
          u.email,
          u.status,
          t.name as tenant_name,
          t.slug as tenant_slug,
          (u.preferences->'faceVerification'->>'version') as face_version,
          (u.preferences->'faceVerification'->>'enrolledAt') as enrolled_at,
          jsonb_array_length(COALESCE(u.preferences->'faceVerification'->'templates', '[]'::jsonb)) as template_count
        FROM users u
        LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE (u.preferences->'faceVerification') IS NOT NULL
        ORDER BY u.created_at DESC
        LIMIT 20
      `);

      if (result.rows.length === 0) {
        console.log('❌ No enrolled users found in database');
        console.log('\nTo enroll:');
        console.log('  1. Login to the dashboard');
        console.log('  2. Go to Profile → Security → Face Enrollment');
        console.log('  3. Capture 3-5 face poses (front, left, right)');
        return;
      }

      console.log(`✅ Found ${result.rows.length} enrolled user(s):\n`);
      console.table(result.rows.map(row => ({
        Username: row.username,
        Email: row.email,
        Status: row.status,
        Tenant: row.tenant_slug || row.tenant_name,
        Version: row.face_version || 'legacy',
        Templates: row.template_count || (row.face_version ? '1' : '0'),
        Enrolled: row.enrolled_at ? new Date(row.enrolled_at).toLocaleDateString() : 'unknown'
      })));

      console.log('\nℹ️  Run with username to see detailed info:');
      console.log(`   node check-face-enrollment.mjs ${result.rows[0].username}`);
      return;
    }

    // Check specific user
    console.log(`\nChecking enrollment for: ${username}\n`);

    const userQuery = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.status,
        u.role,
        t.name as tenant_name,
        t.slug as tenant_slug,
        u.preferences
      FROM users u
      LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE LOWER(u.username) = LOWER($1) OR LOWER(u.email) = LOWER($1)
      LIMIT 1
    `, [username]);

    if (userQuery.rows.length === 0) {
      console.log(`❌ User not found: ${username}`);
      return;
    }

    const user = userQuery.rows[0];
    const preferences = user.preferences || {};
    const faceVerification = preferences.faceVerification;

    console.log('👤 User Information:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Tenant: ${user.tenant_slug || user.tenant_name || 'N/A'}\n`);

    console.log('🎭 Face Enrollment Status:');
    
    if (!faceVerification) {
      console.log('   ❌ NOT ENROLLED');
      console.log('\n   To enroll:');
      console.log('   1. Login to dashboard');
      console.log('   2. Profile → Security → Face Enrollment');
      console.log('   3. Capture 3-5 face poses');
      return;
    }

    console.log('   ✅ ENROLLED');
    console.log(`   Version: ${faceVerification.version || 'legacy (1)'}`);
    console.log(`   Enrolled At: ${faceVerification.enrolledAt || 'unknown'}`);
    console.log(`   Method: ${faceVerification.method || 'legacy-template'}\n`);

    // Check templates
    console.log('📸 Face Templates:');
    
    if (faceVerification.version === 2) {
      const templates = faceVerification.templates || [];
      console.log(`   Template Count: ${templates.length}`);
      
      if (templates.length < 3) {
        console.log('   ⚠️  WARNING: Less than 3 templates (recommended: 3-5 poses)');
        console.log('   Consider re-enrolling with more poses for better accuracy');
      } else {
        console.log('   ✅ Good: Multiple poses enrolled');
      }

      templates.forEach((template, idx) => {
        const valid = template.version === 1 && 
                     template.width === 48 && 
                     template.height === 48 &&
                     template.grayscale === true &&
                     typeof template.data === 'string';
        console.log(`   Template ${idx + 1}: ${valid ? '✅ Valid' : '❌ Invalid'} (${template.data?.length || 0} chars)`);
      });
    } else {
      // Legacy version 1
      const hasData = faceVerification.data && typeof faceVerification.data === 'string';
      console.log(`   Legacy Template: ${hasData ? '✅ Valid' : '❌ Invalid'}`);
      console.log('   ⚠️  Consider re-enrolling with multi-pose (version 2) for better accuracy');
    }

    console.log('\n⚙️  Face Login Configuration:');
    console.log(`   Production Threshold: 0.70 (70% similarity required)`);
    console.log(`   Strict Threshold: 0.85 (85% similarity for high-security)`);
    console.log(`   Current Setting: ${preferences.faceMatchThreshold || 'default (0.70)'}`);

    // Check if user would be returned by face login query
    console.log('\n🔍 Face Login Query Test:');
    const loginQuery = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.preferences
      FROM users u
      LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE u.status = 'active'
        AND (u.preferences->'faceVerification'->>'data') IS NOT NULL
        AND ($1::text IS NULL OR t.slug = $1 OR t.id::text = $1)
        AND u.id = $2
    `, [user.tenant_slug, user.id]);

    if (loginQuery.rows.length > 0) {
      console.log('   ✅ User appears in face login candidate list');
    } else {
      console.log('   ❌ User NOT in face login candidate list');
      
      // Diagnose why
      if (user.status !== 'active') {
        console.log(`   ⚠️  User status is "${user.status}" (must be "active")`);
      }
      
      // Check for legacy data field (version 1)
      const hasLegacyData = faceVerification && faceVerification.data;
      if (!hasLegacyData && faceVerification?.version === 2) {
        console.log('   ⚠️  Version 2 template detected, but query checks for legacy "data" field');
        console.log('   ℹ️  This is a known issue - face login works with version 2 templates');
      }
    }

    console.log('\n💡 Troubleshooting Tips:');
    
    const tips = [];
    
    if (user.status !== 'active') {
      tips.push('❌ User account not active - contact administrator');
    }
    
    if (faceVerification?.version !== 2) {
      tips.push('⚠️  Re-enroll with multi-pose for better accuracy');
    }
    
    if (faceVerification?.version === 2 && (faceVerification.templates?.length || 0) < 3) {
      tips.push('⚠️  Capture 3-5 face poses during enrollment (front, left, right, up, down)');
    }
    
    tips.push('💡 During login: face camera directly, good lighting, steady for 2-3 seconds');
    tips.push('💡 Match distance/angle from enrollment (usually 1-3 feet)');
    tips.push('💡 Remove glasses if you didn\'t wear them during enrollment');
    
    if (tips.length > 0) {
      tips.forEach(tip => console.log(`   ${tip}`));
    }

    console.log('\n📋 Next Steps if Login Still Fails:');
    console.log('   1. Check server logs for similarity scores:');
    console.log('      Look for: [FaceLogin] Evaluation complete');
    console.log('   2. Re-enroll with better quality images:');
    console.log('      - Good lighting (natural daylight preferred)');
    console.log('      - Face camera directly');
    console.log('      - Capture 3-5 different poses');
    console.log('   3. Test with enrollment photo (should score 0.95+)');
    console.log('   4. If score is 0.60-0.69: Just below threshold, improve image quality');
    console.log('   5. If score is <0.40: Wrong person or face not detected');

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nConnection Details:');
    console.error(`   DATABASE_URL: ${process.env.DATABASE_URL ? '[set]' : '[not set]'}`);
    console.error(`   DB_URL: ${process.env.DB_URL ? '[set]' : '[not set]'}`);
    console.error('\nMake sure:');
    console.error('   1. Database is running');
    console.error('   2. .env file has correct DATABASE_URL or DB_URL');
    console.error('   3. Database credentials are correct');
  } finally {
    await pool.end();
  }
}

checkEnrollment();
