/**
 * Re-ID Vector Store Service
 * PostgreSQL + pgvector for persistent cross-camera person/vehicle tracking
 * 
 * Replaces in-memory Map with scalable, persistent vector database
 * Supports:
 * - Cosine similarity search
 * - Persistent global identities
 * - Historical tracking
 * - Service restart resilience
 * - Multi-tenant isolation
 */

import { Pool } from 'pg';

export interface ReIdEmbedding {
  globalId: string;
  tenantId: string;
  objectType: 'person' | 'vehicle' | 'face';
  embedding: number[];
  firstSeen: Date;
  lastSeen: Date;
  appearances: number;
  cameraIds: string[]; // Cameras where this identity appeared
  metadata?: Record<string, any>;
}

export interface ReIdMatch {
  globalId: string;
  similarity: number;
  lastSeen: Date;
  appearances: number;
  cameraIds: string[];
}

export interface ReIdSearchResult {
  matched: boolean;
  globalId: string;
  similarity: number;
  isNewIdentity: boolean;
}

export class VectorStoreService {
  private pool: Pool;
  private readonly SIMILARITY_THRESHOLD = 0.7;
  private readonly MAX_RESULTS = 10;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize pgvector extension and create tables
   */
  async initialize(): Promise<void> {
    try {
      // Enable pgvector extension
      await this.pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);

      // Create Re-ID embeddings table with vector support
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS reid_embeddings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          global_id TEXT NOT NULL UNIQUE,
          tenant_id UUID NOT NULL,
          object_type TEXT NOT NULL CHECK (object_type IN ('person', 'vehicle', 'face')),
          embedding vector(512) NOT NULL,
          first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          appearances INTEGER NOT NULL DEFAULT 1,
          camera_ids TEXT[] NOT NULL DEFAULT '{}',
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create indexes for efficient search
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reid_tenant 
        ON reid_embeddings(tenant_id)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reid_object_type 
        ON reid_embeddings(object_type)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reid_last_seen 
        ON reid_embeddings(last_seen DESC)
      `);

      // Create vector index for similarity search (HNSW - Hierarchical Navigable Small World)
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reid_embedding_hnsw
        ON reid_embeddings 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);

      // Create tracking history table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS reid_tracking_history (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          global_id TEXT NOT NULL,
          tenant_id UUID NOT NULL,
          camera_id UUID NOT NULL,
          track_id TEXT NOT NULL,
          object_type TEXT NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          confidence NUMERIC(4,3),
          bounding_box JSONB,
          snapshot_path TEXT,
          metadata JSONB
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_tracking_history_global_id 
        ON reid_tracking_history(global_id)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_tracking_history_camera 
        ON reid_tracking_history(camera_id)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_tracking_history_timestamp 
        ON reid_tracking_history(timestamp DESC)
      `);

      console.log('✓ Re-ID Vector Store initialized with pgvector');
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      throw error;
    }
  }

  /**
   * Search for matching identity using vector similarity
   */
  async searchSimilar(
    embedding: number[],
    tenantId: string,
    objectType: 'person' | 'vehicle' | 'face',
    threshold: number = this.SIMILARITY_THRESHOLD,
    maxResults: number = this.MAX_RESULTS
  ): Promise<ReIdMatch[]> {
    try {
      // Convert embedding to pgvector format
      const embeddingStr = `[${embedding.join(',')}]`;

      // Use cosine similarity for matching (1 - cosine distance)
      const result = await this.pool.query(
        `SELECT 
          global_id,
          1 - (embedding <=> $1::vector) as similarity,
          last_seen,
          appearances,
          camera_ids
        FROM reid_embeddings
        WHERE tenant_id = $2::uuid
          AND object_type = $3
          AND 1 - (embedding <=> $1::vector) >= $4
        ORDER BY embedding <=> $1::vector
        LIMIT $5`,
        [embeddingStr, tenantId, objectType, threshold, maxResults]
      );

      return result.rows.map(row => ({
        globalId: row.global_id,
        similarity: parseFloat(row.similarity),
        lastSeen: new Date(row.last_seen),
        appearances: parseInt(row.appearances),
        cameraIds: row.camera_ids || []
      }));
    } catch (error) {
      console.error('Vector search failed:', error);
      return [];
    }
  }

  /**
   * Find or create global identity
   */
  async findOrCreateIdentity(
    embedding: number[],
    tenantId: string,
    cameraId: string,
    trackId: string,
    objectType: 'person' | 'vehicle' | 'face',
    metadata?: Record<string, any>
  ): Promise<ReIdSearchResult> {
    try {
      // Search for existing identity
      const matches = await this.searchSimilar(embedding, tenantId, objectType);

      if (matches.length > 0 && matches[0].similarity >= this.SIMILARITY_THRESHOLD) {
        // Found existing identity - update it
        const match = matches[0];
        await this.updateIdentity(match.globalId, cameraId, embedding);

        return {
          matched: true,
          globalId: match.globalId,
          similarity: match.similarity,
          isNewIdentity: false
        };
      }

      // No match found - create new global identity
      const globalId = await this.createIdentity(
        embedding,
        tenantId,
        cameraId,
        objectType,
        metadata
      );

      return {
        matched: false,
        globalId,
        similarity: 1.0,
        isNewIdentity: true
      };
    } catch (error) {
      console.error('Find or create identity failed:', error);
      throw error;
    }
  }

  /**
   * Create new global identity
   */
  async createIdentity(
    embedding: number[],
    tenantId: string,
    cameraId: string,
    objectType: 'person' | 'vehicle' | 'face',
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const globalId = `${objectType}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const embeddingStr = `[${embedding.join(',')}]`;

      await this.pool.query(
        `INSERT INTO reid_embeddings (
          global_id, tenant_id, object_type, embedding,
          first_seen, last_seen, appearances, camera_ids, metadata
        ) VALUES ($1, $2::uuid, $3, $4::vector, NOW(), NOW(), 1, $5, $6)`,
        [
          globalId,
          tenantId,
          objectType,
          embeddingStr,
          [cameraId],
          metadata ? JSON.stringify(metadata) : null
        ]
      );

      console.log(`✓ Created new ${objectType} identity: ${globalId}`);
      return globalId;
    } catch (error) {
      console.error('Failed to create identity:', error);
      throw error;
    }
  }

  /**
   * Update existing identity with new appearance
   */
  async updateIdentity(
    globalId: string,
    cameraId: string,
    newEmbedding?: number[]
  ): Promise<void> {
    try {
      if (newEmbedding) {
        // Update embedding with exponential moving average (EMA)
        // New embedding = 0.9 * old + 0.1 * new (helps handle appearance variations)
        const embeddingStr = `[${newEmbedding.join(',')}]`;

        await this.pool.query(
          `UPDATE reid_embeddings
          SET embedding = (0.9 * embedding + 0.1 * $1::vector)::vector(512),
              last_seen = NOW(),
              appearances = appearances + 1,
              camera_ids = array_append(camera_ids, $2),
              updated_at = NOW()
          WHERE global_id = $3`,
          [embeddingStr, cameraId, globalId]
        );
      } else {
        // Just update metadata without changing embedding
        await this.pool.query(
          `UPDATE reid_embeddings
          SET last_seen = NOW(),
              appearances = appearances + 1,
              camera_ids = array_append(camera_ids, $1),
              updated_at = NOW()
          WHERE global_id = $2`,
          [cameraId, globalId]
        );
      }
    } catch (error) {
      console.error('Failed to update identity:', error);
      throw error;
    }
  }

  /**
   * Record tracking event in history
   */
  async recordTrackingEvent(
    globalId: string,
    tenantId: string,
    cameraId: string,
    trackId: string,
    objectType: 'person' | 'vehicle' | 'face',
    confidence: number,
    boundingBox?: { x: number; y: number; width: number; height: number },
    snapshotPath?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO reid_tracking_history (
          global_id, tenant_id, camera_id, track_id, object_type,
          timestamp, confidence, bounding_box, snapshot_path, metadata
        ) VALUES ($1, $2::uuid, $3::uuid, $4, $5, NOW(), $6, $7, $8, $9)`,
        [
          globalId,
          tenantId,
          cameraId,
          trackId,
          objectType,
          confidence,
          boundingBox ? JSON.stringify(boundingBox) : null,
          snapshotPath,
          metadata ? JSON.stringify(metadata) : null
        ]
      );
    } catch (error) {
      console.error('Failed to record tracking event:', error);
      // Non-critical - don't throw
    }
  }

  /**
   * Get identity by global ID
   */
  async getIdentity(globalId: string): Promise<ReIdEmbedding | null> {
    try {
      const result = await this.pool.query(
        `SELECT 
          global_id,
          tenant_id::text,
          object_type,
          embedding::text,
          first_seen,
          last_seen,
          appearances,
          camera_ids,
          metadata
        FROM reid_embeddings
        WHERE global_id = $1`,
        [globalId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      // Parse embedding from pgvector text format: "[0.1,0.2,...]"
      const embeddingStr = row.embedding.slice(1, -1); // Remove [ and ]
      const embedding = embeddingStr.split(',').map(Number);

      return {
        globalId: row.global_id,
        tenantId: row.tenant_id,
        objectType: row.object_type,
        embedding,
        firstSeen: new Date(row.first_seen),
        lastSeen: new Date(row.last_seen),
        appearances: parseInt(row.appearances),
        cameraIds: row.camera_ids || [],
        metadata: row.metadata
      };
    } catch (error) {
      console.error('Failed to get identity:', error);
      return null;
    }
  }

  /**
   * Get tracking history for an identity
   */
  async getTrackingHistory(
    globalId: string,
    limit: number = 100
  ): Promise<Array<{
    cameraId: string;
    trackId: string;
    timestamp: Date;
    confidence: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
    snapshotPath?: string;
  }>> {
    try {
      const result = await this.pool.query(
        `SELECT 
          camera_id::text,
          track_id,
          timestamp,
          confidence,
          bounding_box,
          snapshot_path
        FROM reid_tracking_history
        WHERE global_id = $1
        ORDER BY timestamp DESC
        LIMIT $2`,
        [globalId, limit]
      );

      return result.rows.map(row => ({
        cameraId: row.camera_id,
        trackId: row.track_id,
        timestamp: new Date(row.timestamp),
        confidence: parseFloat(row.confidence),
        boundingBox: row.bounding_box,
        snapshotPath: row.snapshot_path
      }));
    } catch (error) {
      console.error('Failed to get tracking history:', error);
      return [];
    }
  }

  /**
   * Get all identities for a tenant (with pagination)
   */
  async getIdentities(
    tenantId: string,
    objectType?: 'person' | 'vehicle' | 'face',
    limit: number = 100,
    offset: number = 0
  ): Promise<ReIdEmbedding[]> {
    try {
      const query = objectType
        ? `SELECT * FROM reid_embeddings 
           WHERE tenant_id = $1::uuid AND object_type = $2 
           ORDER BY last_seen DESC 
           LIMIT $3 OFFSET $4`
        : `SELECT * FROM reid_embeddings 
           WHERE tenant_id = $1::uuid 
           ORDER BY last_seen DESC 
           LIMIT $2 OFFSET $3`;

      const params = objectType
        ? [tenantId, objectType, limit, offset]
        : [tenantId, limit, offset];

      const result = await this.pool.query(query, params);

      return result.rows.map(row => {
        const embeddingStr = row.embedding.slice(1, -1);
        const embedding = embeddingStr.split(',').map(Number);

        return {
          globalId: row.global_id,
          tenantId: row.tenant_id,
          objectType: row.object_type,
          embedding,
          firstSeen: new Date(row.first_seen),
          lastSeen: new Date(row.last_seen),
          appearances: parseInt(row.appearances),
          cameraIds: row.camera_ids || [],
          metadata: row.metadata
        };
      });
    } catch (error) {
      console.error('Failed to get identities:', error);
      return [];
    }
  }

  /**
   * Delete old identities (cleanup)
   */
  async deleteOldIdentities(
    olderThanDays: number = 90,
    objectType?: 'person' | 'vehicle' | 'face'
  ): Promise<number> {
    try {
      const query = objectType
        ? `DELETE FROM reid_embeddings 
           WHERE last_seen < NOW() - INTERVAL '${olderThanDays} days'
             AND object_type = $1
           RETURNING global_id`
        : `DELETE FROM reid_embeddings 
           WHERE last_seen < NOW() - INTERVAL '${olderThanDays} days'
           RETURNING global_id`;

      const params = objectType ? [objectType] : [];
      const result = await this.pool.query(query, params);

      console.log(`✓ Deleted ${result.rowCount || 0} old ${objectType || 'all'} identities`);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Failed to delete old identities:', error);
      return 0;
    }
  }

  /**
   * Get statistics
   */
  async getStatistics(tenantId?: string): Promise<{
    totalIdentities: number;
    personIdentities: number;
    vehicleIdentities: number;
    faceIdentities: number;
    totalAppearances: number;
    avgAppearancesPerIdentity: number;
  }> {
    try {
      const query = tenantId
        ? `SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE object_type = 'person') as persons,
            COUNT(*) FILTER (WHERE object_type = 'vehicle') as vehicles,
            COUNT(*) FILTER (WHERE object_type = 'face') as faces,
            SUM(appearances) as total_appearances,
            AVG(appearances) as avg_appearances
          FROM reid_embeddings
          WHERE tenant_id = $1::uuid`
        : `SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE object_type = 'person') as persons,
            COUNT(*) FILTER (WHERE object_type = 'vehicle') as vehicles,
            COUNT(*) FILTER (WHERE object_type = 'face') as faces,
            SUM(appearances) as total_appearances,
            AVG(appearances) as avg_appearances
          FROM reid_embeddings`;

      const params = tenantId ? [tenantId] : [];
      const result = await this.pool.query(query, params);

      const row = result.rows[0] || {};

      return {
        totalIdentities: parseInt(row.total || 0),
        personIdentities: parseInt(row.persons || 0),
        vehicleIdentities: parseInt(row.vehicles || 0),
        faceIdentities: parseInt(row.faces || 0),
        totalAppearances: parseInt(row.total_appearances || 0),
        avgAppearancesPerIdentity: parseFloat(row.avg_appearances || 0)
      };
    } catch (error) {
      console.error('Failed to get statistics:', error);
      return {
        totalIdentities: 0,
        personIdentities: 0,
        vehicleIdentities: 0,
        faceIdentities: 0,
        totalAppearances: 0,
        avgAppearancesPerIdentity: 0
      };
    }
  }
}

/**
 * Global instance
 */
let vectorStoreService: VectorStoreService | null = null;

/**
 * Get or create vector store service
 */
export function getVectorStoreService(pool: Pool): VectorStoreService {
  if (!vectorStoreService) {
    vectorStoreService = new VectorStoreService(pool);
  }
  return vectorStoreService;
}
