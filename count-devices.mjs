#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function checkDevices() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('\n🔍 Checking your devices...\n');
    
    // Count discovered cameras
    const discoveredCount = await pool.query('SELECT COUNT(*) FROM discovered_cameras');
    console.log(`📡 Discovered Cameras: ${discoveredCount.rows[0].count}`);
    
    // Count provisioned cameras
    const camerasCount = await pool.query('SELECT COUNT(*) FROM cameras');
    console.log(`📹 Provisioned Cameras: ${camerasCount.rows[0].count}`);
    
    // Get discovered camera details
    if (parseInt(discoveredCount.rows[0].count) > 0) {
      const discovered = await pool.query(`
        SELECT 
          ip_address,
          manufacturer,
          model,
          source_type,
          status,
          stream_verified,
          credentials_required,
          duplicate_status
        FROM discovered_cameras 
        ORDER BY discovered_at DESC
      `);
      
      console.log('\n📋 Discovered Devices:\n');
      discovered.rows.forEach((d, i) => {
        console.log(`${i + 1}. ${d.manufacturer || 'Unknown'} ${d.model || 'Camera'}`);
        console.log(`   IP: ${d.ip_address}`);
        console.log(`   Type: ${d.source_type || 'ip-camera'}`);
        console.log(`   Status: ${d.status}`);
        console.log(`   Stream Verified: ${d.stream_verified ? 'YES ✓' : 'NO ✗'}`);
        console.log(`   Needs Credentials: ${d.credentials_required ? 'YES ⚠️' : 'NO'}`);
        console.log(`   Duplicate: ${d.duplicate_status || 'unique'}`);
        console.log('');
      });
    }
    
    // Get provisioned camera details
    if (parseInt(camerasCount.rows[0].count) > 0) {
      const cameras = await pool.query(`
        SELECT 
          name,
          ip_address,
          source_type,
          status,
          recorder_id,
          recorder_channel
        FROM cameras 
        ORDER BY created_at DESC
      `);
      
      console.log('\n📹 Provisioned Cameras:\n');
      cameras.rows.forEach((c, i) => {
        console.log(`${i + 1}. ${c.name}`);
        console.log(`   IP: ${c.ip_address || 'N/A'}`);
        console.log(`   Type: ${c.source_type}`);
        console.log(`   Status: ${c.status}`);
        if (c.recorder_id) {
          console.log(`   DVR Channel: ${c.recorder_channel}`);
        }
        console.log('');
      });
    }
    
    console.log('✅ Scan complete\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDevices();
