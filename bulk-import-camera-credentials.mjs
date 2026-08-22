#!/usr/bin/env node
/**
 * Bulk import camera credentials for 400+ locations / 4000+ cameras
 * Usage: node bulk-import-camera-credentials.mjs credentials.csv
 */

import pg from 'pg';
import { readFileSync } from 'node:fs';

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const csvFile = process.argv[2];
  
  if (!csvFile) {
    console.log('📋 Bulk Camera Credential Import Tool\n');
    console.log('Usage: node bulk-import-camera-credentials.mjs <csv-file>\n');
    console.log('CSV Format (with header):');
    console.log('branch_id,edge_agent_id,ip_address,username,password,location_name\n');
    console.log('Example:');
    console.log('branch_id,edge_agent_id,ip_address,username,password,location_name');
    console.log('branch-uuid,edge-agent-uuid,192.0.2.10,admin,<password-from-secret-manager>,Branch-001\n');
    console.log('💡 Leave ip_address empty for branch-wide default credentials');
    process.exit(0);
  }

  if (!DATABASE_URL) throw new Error('DATABASE_URL must be provided through the environment or secret manager');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const csvContent = readFileSync(csvFile, 'utf-8');
    const lines = csvContent.trim().split('\n');
    const header = lines[0].split(',');
    
    await client.connect();
    console.log('✅ Connected to database\n');

    let imported = 0;
    let failed = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const record = {};
      
      header.forEach((key, index) => {
        record[key.trim()] = values[index]?.trim() || null;
      });

      try {
        await client.query(`
          INSERT INTO camera_credentials (
            branch_id, edge_agent_id, ip_address, username, password, scope
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          record.branch_id,
          record.edge_agent_id || null,
          record.ip_address || null,
          record.username,
          record.password,
          record.ip_address ? 'host-specific' : 'default'
        ]);
        
        console.log(`✅ Line ${i}: ${record.location_name || record.ip_address || 'default'}`);
        imported++;
      } catch (error) {
        console.error(`❌ Line ${i}: ${error.message}`);
        failed++;
      }
    }

    console.log(`\n📊 Import Summary:`);
    console.log(`   ✅ Imported: ${imported}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📝 Total: ${lines.length - 1}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
