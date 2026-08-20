#!/usr/bin/env node
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

console.log('\n🔍 CAMERA DISCOVERY STATUS CHECK\n');
console.log('═'.repeat(80));

try {
  // Check discovered cameras
  const discovered = await pool.query(`
    SELECT 
      id,
      display_name,
      vendor,
      model,
      ip_address,
      source_type,
      status,
      stream_verified,
      credentials_required,
      duplicate_status,
      compatibility_status,
      discovered_at
    FROM discovered_cameras 
    ORDER BY discovered_at DESC 
    LIMIT 20
  `);

  console.log(`\n📡 DISCOVERED CAMERAS (${discovered.rows.length}):\n`);
  
  if (discovered.rows.length === 0) {
    console.log('   ❌ No cameras discovered yet');
  } else {
    discovered.rows.forEach((cam, idx) => {
      console.log(`\n${idx + 1}. ${cam.display_name || cam.model || 'Unknown'}`);
      console.log(`   IP: ${cam.ip_address}`);
      console.log(`   Type: ${cam.source_type}`);
      console.log(`   Status: ${cam.status}`);
      console.log(`   Stream Verified: ${cam.stream_verified ? '✓' : '✗'}`);
      console.log(`   Credentials Required: ${cam.credentials_required ? 'YES ⚠️' : 'NO'}`);
      console.log(`   Duplicate Status: ${cam.duplicate_status || 'unique'}`);
      console.log(`   Compatibility: ${cam.compatibility_status || 'unknown'}`);
      
      // Check what's blocking auto-provision
      const blockers = [];
      if (cam.status !== 'pending') blockers.push(`status is '${cam.status}'`);
      if (!cam.stream_verified) blockers.push('stream not verified');
      if (cam.credentials_required) blockers.push('credentials required');
      if (cam.duplicate_status === 'duplicate') blockers.push('marked as duplicate');
      if (cam.duplicate_status === 'review-required') blockers.push('needs review');
      if (cam.compatibility_status === 'review-required') blockers.push('compatibility review needed');
      
      if (blockers.length > 0) {
        console.log(`   ⚠️  NOT AUTO-PROVISIONED: ${blockers.join(', ')}`);
      } else {
        console.log(`   ✓ READY FOR AUTO-PROVISION`);
      }
    });
  }

  // Check provisioned cameras
  const cameras = await pool.query(`
    SELECT 
      id,
      name,
      status,
      source_type,
      ip_address,
      recorder_id,
      recorder_channel,
      created_at
    FROM cameras 
    ORDER BY created_at DESC 
    LIMIT 20
  `);

  console.log(`\n\n📹 PROVISIONED CAMERAS (${cameras.rows.length}):\n`);
  
  if (cameras.rows.length === 0) {
    console.log('   ❌ No cameras provisioned yet');
  } else {
    cameras.rows.forEach((cam, idx) => {
      console.log(`\n${idx + 1}. ${cam.name}`);
      console.log(`   ID: ${cam.id}`);
      console.log(`   IP: ${cam.ip_address || 'N/A'}`);
      console.log(`   Type: ${cam.source_type}`);
      console.log(`   Status: ${cam.status}`);
      if (cam.recorder_id) {
        console.log(`   Recorder: ${cam.recorder_id}, Channel: ${cam.recorder_channel}`);
      }
    });
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n✅ Diagnostic complete\n');

} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error('\nMake sure DATABASE_URL is set in your .env file\n');
} finally {
  await pool.end();
}
