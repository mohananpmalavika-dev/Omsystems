#!/usr/bin/env node
/**
 * Check Edge Agent Telemetry
 * Verifies if telemetry is being stored and how recent it is
 */

import pkg from 'pg';
const { Client } = pkg;

const DATABASE_URL = 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';
const EDGE_AGENT_ID = 'e89264b4-9168-4b1b-8438-d61f7029668f';

async function checkTelemetry() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to database...\n');
    await client.connect();

    // Check edge agent basic info
    const agentInfo = await client.query(`
      SELECT 
        id, name, status, version,
        last_seen_at,
        created_at
      FROM edge_agents
      WHERE id = $1
    `, [EDGE_AGENT_ID]);

    if (agentInfo.rows.length === 0) {
      console.log('❌ Edge agent not found!');
      return;
    }

    const agent = agentInfo.rows[0];
    console.log('📊 Edge Agent Info:');
    console.log('='.repeat(80));
    console.log(`  Name:          ${agent.name}`);
    console.log(`  ID:            ${agent.id}`);
    console.log(`  Status:        ${agent.status}`);
    console.log(`  Version:       ${agent.version}`);
    console.log(`  Last Seen:     ${agent.last_seen_at}`);
    console.log(`  Created:       ${agent.created_at}`);

    // Calculate how old last_seen_at is
    const now = new Date();
    const lastSeen = new Date(agent.last_seen_at);
    const ageSeconds = Math.floor((now - lastSeen) / 1000);
    const ageMinutes = Math.floor(ageSeconds / 60);
    
    console.log(`\n  Age of last_seen_at: ${ageSeconds}s (${ageMinutes}m ago)`);
    
    if (ageSeconds > 300) {
      console.log('  ⚠️  WARNING: Last seen is > 5 minutes old (offlineAfterSeconds = 300)');
      console.log('  ⚠️  This will cause the edge agent to show as OFFLINE!');
    } else if (ageSeconds > 90) {
      console.log('  ⚠️  WARNING: Last seen is > 90 seconds old (staleAfterSeconds = 90)');
      console.log('  ⚠️  This will cause the edge agent to show as UNKNOWN!');
    } else {
      console.log('  ✅ Last seen is recent - should show as ONLINE');
    }

    // Check if operational_telemetry table exists and has edge agent data
    console.log('\n\n📈 Checking operational_telemetry table...');
    console.log('='.repeat(80));
    
    const telemetryCheck = await client.query(`
      SELECT 
        device_type,
        device_id,
        observed_at,
        metrics,
        quality,
        reason_codes,
        created_at
      FROM operational_telemetry
      WHERE edge_agent_id = $1
        AND device_type = 'edge-agent'
      ORDER BY observed_at DESC
      LIMIT 5
    `, [EDGE_AGENT_ID]);

    if (telemetryCheck.rows.length === 0) {
      console.log('❌ NO TELEMETRY RECORDS FOUND!');
      console.log('\n🔍 This is the problem!');
      console.log('   The edge agent is sending heartbeats (updating last_seen_at)');
      console.log('   but NOT submitting telemetry records to operational_telemetry table.');
      console.log('\n   The dashboard uses operational_telemetry to determine online status,');
      console.log('   NOT the last_seen_at field from edge_agents table!');
    } else {
      console.log(`\n✅ Found ${telemetryCheck.rows.length} telemetry record(s):\n`);
      
      telemetryCheck.rows.forEach((record, index) => {
        const observedAt = new Date(record.observed_at);
        const telemetryAge = Math.floor((now - observedAt) / 1000);
        const telemetryAgeMin = Math.floor(telemetryAge / 60);
        
        console.log(`Record #${index + 1}:`);
        console.log(`  Device Type:   ${record.device_type}`);
        console.log(`  Device ID:     ${record.device_id}`);
        console.log(`  Observed At:   ${record.observed_at}`);
        console.log(`  Age:           ${telemetryAge}s (${telemetryAgeMin}m ago)`);
        console.log(`  Quality:       ${record.quality}`);
        console.log(`  Metrics:       ${JSON.stringify(record.metrics).substring(0, 100)}...`);
        console.log(`  Reason Codes:  ${record.reason_codes}`);
        console.log(`  Created:       ${record.created_at}`);
        
        if (telemetryAge > 300) {
          console.log(`  ⚠️  OFFLINE (> 300s)`);
        } else if (telemetryAge > 90) {
          console.log(`  ⚠️  STALE (> 90s)`);
        } else {
          console.log(`  ✅ FRESH (< 90s)`);
        }
        console.log('');
      });
    }

    // Check all telemetry types for this edge agent
    console.log('\n📊 All telemetry device types for this edge agent:');
    console.log('='.repeat(80));
    
    const deviceTypes = await client.query(`
      SELECT 
        device_type,
        COUNT(*) as record_count,
        MAX(observed_at) as latest_observation
      FROM operational_telemetry
      WHERE edge_agent_id = $1
      GROUP BY device_type
      ORDER BY device_type
    `, [EDGE_AGENT_ID]);

    if (deviceTypes.rows.length === 0) {
      console.log('❌ NO TELEMETRY RECORDS AT ALL!');
    } else {
      console.log('');
      deviceTypes.rows.forEach(row => {
        const latestObs = new Date(row.latest_observation);
        const ageSeconds = Math.floor((now - latestObs) / 1000);
        console.log(`  ${row.device_type.padEnd(20)} - ${row.record_count} records, latest: ${ageSeconds}s ago`);
      });
    }

    // Check the policy settings
    console.log('\n\n⚙️  Operational Health Policy Settings:');
    console.log('='.repeat(80));
    console.log('  Default policy:');
    console.log('    staleAfterSeconds:   90 seconds');
    console.log('    offlineAfterSeconds: 300 seconds (5 minutes)');
    console.log('');
    console.log('  To show as ONLINE, telemetry must be:');
    console.log('    - Less than 90 seconds old, AND');
    console.log('    - Have metrics.status = "online" or "healthy"');

    // Summary
    console.log('\n\n📋 SUMMARY:');
    console.log('='.repeat(80));
    
    if (telemetryCheck.rows.length === 0) {
      console.log('❌ PROBLEM FOUND: No telemetry records!');
      console.log('');
      console.log('Root Cause:');
      console.log('  - Edge agent is connected (last_seen_at is recent)');
      console.log('  - Edge agent is NOT submitting telemetry to operational_telemetry table');
      console.log('  - Dashboard reads from operational_telemetry, NOT last_seen_at');
      console.log('');
      console.log('Solution:');
      console.log('  - Check edge agent heartbeat function');
      console.log('  - Verify telemetry submission API endpoint is working');
      console.log('  - Check for errors in edge agent logs during telemetry submission');
    } else {
      const mostRecent = telemetryCheck.rows[0];
      const mostRecentAge = Math.floor((now - new Date(mostRecent.observed_at)) / 1000);
      
      if (mostRecentAge > 300) {
        console.log('❌ PROBLEM: Telemetry is too old (> 5 minutes)');
        console.log('  Status will show as: OFFLINE');
      } else if (mostRecentAge > 90) {
        console.log('⚠️  PROBLEM: Telemetry is stale (> 90 seconds)');
        console.log('  Status will show as: UNKNOWN');
      } else {
        console.log('✅ Telemetry is fresh and recent');
        console.log('  Status should show as: ONLINE');
        console.log('');
        console.log('  If dashboard still shows offline, check:');
        console.log('  - Dashboard cache (refresh page)');
        console.log('  - Branch health calculation logic');
        console.log('  - API response for branch health');
      }
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed\n');
  }
}

checkTelemetry();
