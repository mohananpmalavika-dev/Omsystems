#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function showDevices() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('\n' + '═'.repeat(80));
    console.log('📡 YOUR CAMERA DEVICES - COMPLETE SCAN REPORT');
    console.log('═'.repeat(80) + '\n');
    
    // Get discovered devices
    const discoveries = await pool.query(`
      SELECT 
        id,
        display_name,
        manufacturer,
        model,
        ip_address,
        source_type,
        status,
        recorder_id,
        recorder_channel,
        stream_verified,
        credentials_required,
        duplicate_status,
        compatibility_status,
        discovered_at
      FROM camera_discoveries 
      ORDER BY discovered_at DESC
    `);
    
    console.log(`📋 DISCOVERED DEVICES: ${discoveries.rows.length}\n`);
    
    discoveries.rows.forEach((d, i) => {
      const deviceName = d.display_name || `${d.manufacturer || 'Unknown'} ${d.model || 'Device'}`;
      const deviceType = d.source_type === 'analog-dvr-channel' ? '📹 DVR Channel' :
                        d.source_type === 'nvr-channel' ? '📹 NVR Channel' :
                        '📷 IP Camera';
      
      console.log(`${i + 1}. ${deviceType} ${deviceName}`);
      console.log(`   IP: ${d.ip_address}`);
      if (d.recorder_id) {
        console.log(`   DVR/NVR: ${d.recorder_id}, Channel: ${d.recorder_channel}`);
      }
      console.log(`   Status: ${d.status}`);
      console.log(`   Stream Verified: ${d.stream_verified ? '✅ YES' : '❌ NO'}`);
      console.log(`   Credentials: ${d.credentials_required ? '⚠️  Required' : '✅ OK'}`);
      console.log(`   Compatibility: ${d.compatibility_status || 'compatible'}`);
      console.log(`   Discovered: ${new Date(d.discovered_at).toLocaleString()}`);
      console.log('');
    });
    
    // Get provisioned cameras
    const cameras = await pool.query(`
      SELECT 
        c.id,
        c.name,
        c.ip_address,
        c.source_type,
        c.status,
        c.recorder_id,
        c.recorder_channel,
        c.manufacturer,
        c.model,
        rj.enabled as recording_enabled,
        rj.mode as recording_mode,
        COUNT(ar.id) as analytics_rules
      FROM cameras c
      LEFT JOIN recording_jobs rj ON c.id = rj.camera_id
      LEFT JOIN analytics_rules ar ON c.id = ar.camera_id AND ar.enabled = true
      GROUP BY c.id, c.name, c.ip_address, c.source_type, c.status, c.recorder_id, 
               c.recorder_channel, c.manufacturer, c.model, rj.enabled, rj.mode
      ORDER BY c.created_at DESC
    `);
    
    console.log('\n' + '─'.repeat(80));
    console.log(`📹 PROVISIONED & ACTIVE CAMERAS: ${cameras.rows.length}\n`);
    
    if (cameras.rows.length === 0) {
      console.log('   ⚠️  No cameras are provisioned yet\n');
    } else {
      cameras.rows.forEach((c, i) => {
        const deviceType = c.source_type === 'analog-dvr-channel' ? '📹 DVR Channel' :
                          c.source_type === 'nvr-channel' ? '📹 NVR Channel' :
                          '📷 IP Camera';
        
        console.log(`${i + 1}. ${deviceType} ${c.name}`);
        console.log(`   ID: ${c.id}`);
        console.log(`   IP: ${c.ip_address || 'N/A'}`);
        if (c.recorder_id) {
          console.log(`   DVR: ${c.recorder_id}, Channel: ${c.recorder_channel}`);
        }
        console.log(`   Status: ${c.status === 'online' ? '🟢 ONLINE' : c.status === 'offline' ? '🔴 OFFLINE' : '🟡 ' + c.status.toUpperCase()}`);
        console.log(`   Recording: ${c.recording_enabled ? `✅ ${c.recording_mode || 'continuous'}` : '❌ Disabled'}`);
        console.log(`   AI Rules: ${c.analytics_rules > 0 ? `✅ ${c.analytics_rules} active` : '⚠️  None'}`);
        console.log('');
      });
    }
    
    // Summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(80));
    
    const ipCameras = cameras.rows.filter(c => c.source_type === 'ip-camera');
    const dvrChannels = cameras.rows.filter(c => 
      c.source_type === 'analog-dvr-channel' || c.source_type === 'nvr-channel'
    );
    const onlineCameras = cameras.rows.filter(c => c.status === 'online');
    const recordingEnabled = cameras.rows.filter(c => c.recording_enabled);
    const withAI = cameras.rows.filter(c => c.analytics_rules > 0);
    
    console.log(`\n✅ Total Provisioned: ${cameras.rows.length}`);
    console.log(`   📷 IP Cameras: ${ipCameras.length}`);
    console.log(`   📹 DVR/NVR Channels: ${dvrChannels.length}`);
    console.log(`\n🟢 Online: ${onlineCameras.length}/${cameras.rows.length}`);
    console.log(`📼 Recording Active: ${recordingEnabled.length}/${cameras.rows.length}`);
    console.log(`🤖 AI Analytics Active: ${withAI.length}/${cameras.rows.length}`);
    console.log('\n' + '═'.repeat(80) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

showDevices();
