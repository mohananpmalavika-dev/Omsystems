#!/usr/bin/env node

/**
 * Automated Scanner Setup
 * This script:
 * 1. Generates a new scanner ID
 * 2. Registers it in the database
 * 3. Creates the .env configuration file
 * 4. Starts the scanner automatically
 */

import pg from 'pg';
import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { spawn } from 'child_process';

const { Client } = pg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';
const BRANCH_ID = '00000000-0000-4000-8000-000000000104';
const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const SCANNER_NAME = 'Main Scanner';

async function main() {
  console.log('🚀 Automated Scanner Setup Starting...\n');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✓ Connected to production database\n');

    // Generate new scanner ID
    const scannerId = randomUUID();
    const sharedKey = 'WBRrQzol9gGTuIEAVd08kvMFP5pfyNDj1m32qZ7YsShOcxHa'; // Production shared key

    console.log('📝 Registering new scanner...');
    console.log(`   Name: ${SCANNER_NAME}`);
    console.log(`   ID: ${scannerId}\n`);

    // Register scanner in database
    await client.query(
      `INSERT INTO edge_agents (id, name, branch_node_id, tenant_id, status, version, created_at, last_seen_at)
       VALUES ($1, $2, $3, $4, 'offline', '0.1.0', NOW(), NOW())`,
      [scannerId, SCANNER_NAME, BRANCH_ID, TENANT_ID]
    );

    console.log('✅ Scanner registered in database\n');

    // Create .env configuration
    const envConfig = `CONTROL_PLANE_URL=https://sentinel-grid-control-plane1.onrender.com
EDGE_BRIDGE_SHARED_KEY=${sharedKey}
EDGE_AGENT_ID=${scannerId}
EDGE_AGENT_NAME=${SCANNER_NAME}
EDGE_AGENT_VERSION=0.1.0
BRANCH_ID=${BRANCH_ID}
LOG_LEVEL=info
DATA_DIRECTORY=C:/Omsystems/edge-agent/data
LOG_DIRECTORY=C:/Omsystems/edge-agent/logs
EDGE_LOG_PATH=C:/Omsystems/edge-agent/logs/edge-agent.log
CAMERA_DISCOVERY_ENABLED=true
CAMERA_DISCOVERY_INTERVAL_SECONDS=60
LIVE_MEDIA_ENABLED=true
HEARTBEAT_INTERVAL_SECONDS=30
EDGE_MEDIA_SHARED_KEY=secure-media-key-2026-v1-edge-gateway-stream
STREAM_SECRET_STORE_PATH=C:/Omsystems/edge-agent/data/stream-secrets.json
STREAM_SECRET_PROVIDER_HOST=127.0.0.1
STREAM_SECRET_PROVIDER_PORT=8093
EDGE_LIVE_GATEWAY_HOST=127.0.0.1
EDGE_LIVE_GATEWAY_PORT=8090
PUBLIC_MEDIA_GATEWAY_URL=http://127.0.0.1:8090
MEDIAMTX_PATH=C:/Omsystems/edge-agent/release/runtime/mediamtx.exe
MEDIAMTX_API_URL=http://127.0.0.1:9997
MEDIAMTX_HLS_URL=http://127.0.0.1:8888
MEDIA_TUNNEL_MODE=disabled
CLOUDFLARED_PATH=C:/Omsystems/edge-agent/vendor/windows/cloudflared.exe
MEDIA_ACCESS_TTL_SECONDS=300
FFPROBE_PATH=C:/Omsystems/edge-agent/release/runtime/ffmpeg-n8.1.2-32-gcfa62de001-win64-lgpl-shared-8.1/bin/ffprobe.exe
FFMPEG_PATH=C:/Omsystems/edge-agent/release/runtime/ffmpeg-n8.1.2-32-gcfa62de001-win64-lgpl-shared-8.1/bin/ffmpeg.exe
CAMERA_USERNAME=admin
CAMERA_PASSWORD=admin
ONVIF_ENDPOINTS=
`;

    writeFileSync('c:\\Omsystems\\edge-agent\\.env', envConfig, 'utf8');
    console.log('✅ Configuration file created at: c:\\Omsystems\\edge-agent\\.env\n');

    // Save configuration for reference
    writeFileSync(
      `c:\\Omsystems\\edge-agent\\config\\scanner-${SCANNER_NAME.replace(/\s+/g, '-').toLowerCase()}.env`,
      envConfig,
      'utf8'
    );
    console.log('✅ Backup configuration saved\n');

    console.log('🎉 Setup Complete!\n');
    console.log('📋 Scanner Details:');
    console.log(`   Name: ${SCANNER_NAME}`);
    console.log(`   ID: ${scannerId}`);
    console.log(`   Branch: ${BRANCH_ID}\n`);

    console.log('💡 Next steps:');
    console.log('   1. Run: START_SCANNER.bat');
    console.log('   2. Refresh your dashboard');
    console.log('   3. Scanner should show as "Running" within 30 seconds\n');

    console.log('✅ Done! Scanner is ready to start.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('   Error code:', error.code);
    if (error.detail) console.error('   Detail:', error.detail);
    process.exit(1);
  } finally {
    await client.end();
  }
}

function generateSecureKey(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

main();
