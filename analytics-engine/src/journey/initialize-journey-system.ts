/**
 * Journey System Initialization
 * 
 * Initialize all journey system tables and services.
 * Run this once on deployment or when setting up a new database.
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initializeJourneySystem(pool: Pool): Promise<void> {
  console.log('🚀 Initializing Journey System...\n');

  try {
    // 1. Run database migrations
    console.log('📊 Creating database tables...');
    const migrationPath = join(__dirname, '../../migrations/001_journey_tables.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    
    await pool.query(migrationSql);
    console.log('✓ Database tables created\n');

    // 2. Verify tables exist
    console.log('🔍 Verifying tables...');
    const tables = [
      'global_person',
      'person_observation',
      'person_transition',
      'camera_transition_rule',
      'person_journey_session'
    ];

    for (const table of tables) {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [table]
      );
      
      if (result.rows[0].exists) {
        console.log(`  ✓ ${table}`);
      } else {
        throw new Error(`Table ${table} not found`);
      }
    }
    console.log('');

    // 3. Verify reid_embeddings extensions
    console.log('🔍 Verifying reid_embeddings extensions...');
    const columns = await pool.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'reid_embeddings' 
       AND column_name IN ('observation_id', 'model_name', 'model_version', 'quality_score')`
    );
    
    if (columns.rows.length === 4) {
      console.log('  ✓ observation_id');
      console.log('  ✓ model_name');
      console.log('  ✓ model_version');
      console.log('  ✓ quality_score');
    } else {
      console.warn('  ⚠ Some reid_embeddings columns missing');
    }
    console.log('');

    // 4. Verify indexes
    console.log('🔍 Verifying indexes...');
    const indexes = await pool.query(
      `SELECT indexname 
       FROM pg_indexes 
       WHERE schemaname = 'public' 
       AND (
         tablename LIKE '%person%' OR 
         tablename LIKE '%transition%' OR
         tablename LIKE '%journey%'
       )`
    );
    console.log(`  ✓ ${indexes.rows.length} indexes created\n`);

    // 5. Initialize services (just verify they can be imported)
    console.log('🔧 Initializing services...');
    const { getObservationRepository } = await import('./observation.repository.js');
    const { getCameraTopologyService } = await import('./topology.service.js');
    const { getReIdVectorRepository } = await import('./reid-vector.repository.js');
    const { getGlobalIdentityResolver } = await import('./global-identity-resolver.js');
    const { getPersonTransitionCorrelator } = await import('./transition-correlator.js');
    const { getJourneyService } = await import('./journey.service.js');

    const observations = getObservationRepository(pool);
    const topology = getCameraTopologyService(pool);
    const vectors = getReIdVectorRepository(pool);
    const identityResolver = getGlobalIdentityResolver(pool, observations, topology, vectors);
    const transitionCorrelator = getPersonTransitionCorrelator(pool, observations, topology, vectors);
    const journeyService = getJourneyService(
      pool,
      observations,
      topology,
      vectors,
      identityResolver,
      transitionCorrelator
    );

    console.log('  ✓ ObservationRepository');
    console.log('  ✓ CameraTopologyService');
    console.log('  ✓ ReIdVectorRepository');
    console.log('  ✓ GlobalIdentityResolver');
    console.log('  ✓ PersonTransitionCorrelator');
    console.log('  ✓ JourneyService');
    console.log('');

    // 6. Show statistics
    console.log('📊 Current Statistics:');
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM global_person) as global_persons,
        (SELECT COUNT(*) FROM person_observation) as observations,
        (SELECT COUNT(*) FROM person_transition) as transitions,
        (SELECT COUNT(*) FROM camera_transition_rule) as topology_rules
    `);

    const s = stats.rows[0];
    console.log(`  Global Persons: ${s.global_persons}`);
    console.log(`  Observations: ${s.observations}`);
    console.log(`  Transitions: ${s.transitions}`);
    console.log(`  Topology Rules: ${s.topology_rules}`);
    console.log('');

    console.log('✅ Journey System Initialized Successfully!\n');
    console.log('Next Steps:');
    console.log('  1. Configure topology rules for your cameras');
    console.log('  2. Integrate with human-analytics.ts (see human-analytics-integration.ts)');
    console.log('  3. Test with real camera streams');
    console.log('  4. Calibrate confidence thresholds');
    console.log('');

  } catch (error) {
    console.error('❌ Initialization Failed:', error);
    throw error;
  }
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  initializeJourneySystem(pool)
    .then(() => {
      console.log('🎉 Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Fatal Error:', error);
      process.exit(1);
    });
}
