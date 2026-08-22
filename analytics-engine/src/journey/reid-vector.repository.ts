/**
 * ReID Vector Repository
 * 
 * Wraps the existing VectorStoreService with journey-specific interfaces
 * and adds tenant-aware search, model version filtering, and observation linking.
 */

import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { getVectorStoreService, type VectorStoreService } from '../reid/vector-store.service.js';

export interface ReIdEmbeddingRecord {
  id: string;
  tenantId: string;
  observationId: string;
  model: string;
  modelVersion: string;
  dimensions: number;
  embedding: Float32Array;
  qualityScore: number;
  createdAt: Date;
}

export interface VectorSearchOptions {
  tenantId: string;
  branchId?: string;
  embedding: Float32Array;
  modelVersion?: string;
  limit?: number;
  minSimilarity?: number;
  recentSeconds?: number;  // Only search recent embeddings
}

export interface VectorSearchResult {
  observationId: string;
  globalPersonId: string;
  similarity: number;
  qualityScore: number;
  cameraId: string;
  exitedAt: Date;
}

/**
 * ReID Vector Repository
 * Manages embeddings with observation linking and journey-specific queries
 */
export class ReIdVectorRepository {
  private vectorStore: VectorStoreService;

  constructor(private pool: Pool) {
    this.vectorStore = getVectorStoreService(pool);
  }

  /**
   * Initialize tables (extends existing reid_embeddings)
   */
  async initialize(): Promise<void> {
    try {
      // Extend reid_embeddings table with journey-specific columns
      await this.pool.query(`
        DO $$ BEGIN
          ALTER TABLE reid_embeddings 
          ADD COLUMN IF NOT EXISTS observation_id UUID,
          ADD COLUMN IF NOT EXISTS model_name TEXT,
          ADD COLUMN IF NOT EXISTS model_version TEXT,
          ADD COLUMN IF NOT EXISTS dimensions INTEGER,
          ADD COLUMN IF NOT EXISTS quality_score NUMERIC(4,3);
        EXCEPTION
          WHEN duplicate_column THEN NULL;
        END $$;
      `);

      // Add indexes for journey queries
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reid_observation 
        ON reid_embeddings(observation_id)
        WHERE observation_id IS NOT NULL
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reid_model_version 
        ON reid_embeddings(tenant_id, model_name, model_version)
      `);

      console.log('✓ ReID vector repository initialized');
    } catch (error) {
      console.error('Failed to initialize ReID vector repository:', error);
      throw error;
    }
  }

  /**
   * Store embedding for an observation
   */
  async storeEmbedding(
    tenantId: string,
    observationId: string,
    embedding: Float32Array,
    model: string,
    modelVersion: string,
    qualityScore: number
  ): Promise<string> {
    const id = randomUUID();
    const embeddingStr = `[${Array.from(embedding).join(',')}]`;

    await this.pool.query(
      `INSERT INTO reid_embeddings (
        id, tenant_id, observation_id,
        model_name, model_version, dimensions,
        embedding, quality_score,
        object_type, global_id,
        first_seen, last_seen, appearances
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid,
        $4, $5, $6,
        $7::vector, $8,
        'person', $9,
        NOW(), NOW(), 1
      )`,
      [
        id,
        tenantId,
        observationId,
        model,
        modelVersion,
        embedding.length,
        embeddingStr,
        qualityScore,
        `temp_${id}` // Temporary global_id, will be updated with real one
      ]
    );

    return id;
  }

  /**
   * Update global person ID on embedding
   */
  async linkToGlobalPerson(embeddingId: string, globalPersonId: string): Promise<void> {
    await this.pool.query(
      `UPDATE reid_embeddings
       SET global_id = $2
       WHERE id = $1::uuid`,
      [embeddingId, globalPersonId]
    );
  }

  /**
   * Search for similar embeddings with journey-specific constraints
   */
  async searchSimilar(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const {
      tenantId,
      branchId,
      embedding,
      modelVersion,
      limit = 20,
      minSimilarity = 0.7,
      recentSeconds
    } = options;

    // Build dynamic query with constraints
    const embeddingStr = `[${Array.from(embedding).join(',')}]`;
    const conditions: string[] = [
      're.tenant_id = $1::uuid',
      '1 - (re.embedding <=> $2::vector) >= $3',
      're.observation_id IS NOT NULL'
    ];
    const params: any[] = [tenantId, embeddingStr, minSimilarity];
    let paramIndex = 4;

    if (modelVersion) {
      conditions.push(`re.model_version = $${paramIndex}`);
      params.push(modelVersion);
      paramIndex++;
    }

    if (branchId) {
      conditions.push(`po.branch_id = $${paramIndex}::uuid`);
      params.push(branchId);
      paramIndex++;
    }

    if (recentSeconds) {
      conditions.push(`po.exited_at >= NOW() - INTERVAL '${recentSeconds} seconds'`);
    }

    const result = await this.pool.query(
      `SELECT 
        po.id as observation_id,
        po.global_person_id,
        po.camera_id,
        po.exited_at,
        re.quality_score,
        1 - (re.embedding <=> $2::vector) as similarity
       FROM reid_embeddings re
       JOIN person_observation po ON re.observation_id = po.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY re.embedding <=> $2::vector
       LIMIT $${paramIndex}`,
      [...params, limit]
    );

    return result.rows.map(row => ({
      observationId: row.observation_id,
      globalPersonId: row.global_person_id,
      similarity: parseFloat(row.similarity),
      qualityScore: row.quality_score ? parseFloat(row.quality_score) : 0.5,
      cameraId: row.camera_id,
      exitedAt: new Date(row.exited_at)
    }));
  }

  /**
   * Get embedding by observation ID
   */
  async getByObservation(observationId: string): Promise<ReIdEmbeddingRecord | null> {
    const result = await this.pool.query(
      `SELECT 
        id,
        tenant_id::text,
        observation_id::text,
        model_name,
        model_version,
        dimensions,
        embedding::text,
        quality_score,
        created_at
       FROM reid_embeddings
       WHERE observation_id = $1::uuid`,
      [observationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    
    // Parse embedding from pgvector text format: "[0.1,0.2,...]"
    const embeddingStr = row.embedding.slice(1, -1);
    const embeddingArray = embeddingStr.split(',').map(Number);
    const embedding = new Float32Array(embeddingArray);

    return {
      id: row.id,
      tenantId: row.tenant_id,
      observationId: row.observation_id,
      model: row.model_name,
      modelVersion: row.model_version,
      dimensions: parseInt(row.dimensions),
      embedding,
      qualityScore: row.quality_score ? parseFloat(row.quality_score) : 0.5,
      createdAt: new Date(row.created_at)
    };
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  async compareSimilarity(embeddingId1: string, embeddingId2: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT 
        1 - (e1.embedding <=> e2.embedding) as similarity
       FROM reid_embeddings e1, reid_embeddings e2
       WHERE e1.id = $1::uuid AND e2.id = $2::uuid`,
      [embeddingId1, embeddingId2]
    );

    if (result.rows.length === 0) {
      return 0;
    }

    return parseFloat(result.rows[0].similarity);
  }

  /**
   * Delete old embeddings for retention policy
   */
  async deleteOlderThan(tenantId: string, olderThanDays: number): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM reid_embeddings
       WHERE tenant_id = $1::uuid
         AND observation_id IS NOT NULL
         AND created_at < NOW() - INTERVAL '${olderThanDays} days'`,
      [tenantId]
    );

    return result.rowCount || 0;
  }

  /**
   * Get statistics
   */
  async getStatistics(tenantId: string): Promise<{
    totalEmbeddings: number;
    averageQuality: number;
    uniqueModels: number;
    linkedObservations: number;
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        AVG(quality_score) as avg_quality,
        COUNT(DISTINCT model_name || ':' || model_version) as unique_models,
        COUNT(observation_id) as linked_observations
       FROM reid_embeddings
       WHERE tenant_id = $1::uuid`,
      [tenantId]
    );

    const row = result.rows[0] || {};

    return {
      totalEmbeddings: parseInt(row.total || '0'),
      averageQuality: parseFloat(row.avg_quality || '0'),
      uniqueModels: parseInt(row.unique_models || '0'),
      linkedObservations: parseInt(row.linked_observations || '0')
    };
  }

  /**
   * Validate embedding compatibility
   */
  static validateCompatibility(
    embedding1: Float32Array,
    embedding2: Float32Array,
    model1: string,
    model2: string,
    version1: string,
    version2: string
  ): boolean {
    // Check dimensions match
    if (embedding1.length !== embedding2.length) {
      return false;
    }

    // Check models are compatible (same model and version)
    if (model1 !== model2 || version1 !== version2) {
      return false;
    }

    return true;
  }
}

/**
 * Global singleton
 */
let reIdVectorRepositoryInstance: ReIdVectorRepository | null = null;

/**
 * Get or create ReID vector repository
 */
export function getReIdVectorRepository(pool: Pool): ReIdVectorRepository {
  if (!reIdVectorRepositoryInstance) {
    reIdVectorRepositoryInstance = new ReIdVectorRepository(pool);
  }
  return reIdVectorRepositoryInstance;
}
