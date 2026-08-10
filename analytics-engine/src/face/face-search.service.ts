/**
 * Face Search Service
 * Performs vector similarity search using PostgreSQL pgvector
 */

import type { Pool } from 'pg';
import type { FaceSearchCandidate, PersonCandidate } from './face.types.js';

export interface FaceSearchConfig {
  searchLimit: number;
  includeDisabled: boolean;
  respectValidity: boolean;
}

export interface FaceSearchQuery {
  tenantId: string;
  embedding: Float32Array;
  watchlistIds?: string[];
  limit?: number;
  threshold?: number;
}

export class FaceSearchService {
  private db: Pool;
  private config: FaceSearchConfig;

  constructor(db: Pool, config?: Partial<FaceSearchConfig>) {
    this.db = db;
    this.config = {
      searchLimit: 10,
      includeDisabled: false,
      respectValidity: true,
      ...config,
    };
  }

  /**
   * Search for similar faces in the database
   * Returns raw embedding-level matches
   */
  async searchSimilarFaces(query: FaceSearchQuery): Promise<FaceSearchCandidate[]> {
    const limit = query.limit ?? this.config.searchLimit;
    
    // Convert Float32Array to PostgreSQL vector format
    const embeddingVector = this.formatVectorForPostgres(query.embedding);

    const sql = `
      SELECT
        fe.id AS embedding_id,
        fe.person_id,
        fp.full_name AS display_name,
        fw.id AS watchlist_id,
        fw.name AS watchlist_name,
        1 - (fe.embedding <=> $1::vector) AS similarity,
        fe.quality_score,
        fe.metadata
      FROM face_embeddings fe
      JOIN face_watchlist_persons fp
        ON fp.id = fe.person_id
      JOIN face_watchlists fw
        ON fw.id = fp.watchlist_id
      WHERE fe.tenant_id = $2
        AND fp.tenant_id = $2
        AND fw.tenant_id = $2
        ${!this.config.includeDisabled ? 'AND fp.archived_at IS NULL' : ''}
        ${!this.config.includeDisabled ? 'AND fw.enabled = TRUE' : ''}
        ${query.watchlistIds ? 'AND fw.id = ANY($4::uuid[])' : ''}
        ${this.config.respectValidity ? `
          AND (fp.enrolled_at IS NULL OR fp.enrolled_at <= NOW())
        ` : ''}
      ORDER BY fe.embedding <=> $1::vector
      LIMIT $3
    `;

    const params: any[] = [embeddingVector, query.tenantId, limit];
    if (query.watchlistIds) {
      params.push(query.watchlistIds);
    }

    try {
      const result = await this.db.query(sql, params);

      return result.rows.map((row) => ({
        embeddingId: row.embedding_id,
        personId: row.person_id,
        displayName: row.display_name,
        watchlistId: row.watchlist_id,
        watchlistName: row.watchlist_name,
        similarity: parseFloat(row.similarity),
        metadata: row.metadata || {},
      }));
    } catch (error) {
      console.error('Face search query failed:', error);
      throw new Error(`Face search unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search and aggregate by person
   * Groups multiple embeddings per person and returns best/mean scores
   */
  async searchPersons(query: FaceSearchQuery): Promise<PersonCandidate[]> {
    const embeddingMatches = await this.searchSimilarFaces(query);

    if (embeddingMatches.length === 0) {
      return [];
    }

    // Group by person
    const personMap = new Map<string, {
      displayName: string;
      watchlistId: string;
      watchlistName: string;
      embeddings: Array<{ embeddingId: string; similarity: number }>;
    }>();

    for (const match of embeddingMatches) {
      if (!personMap.has(match.personId)) {
        personMap.set(match.personId, {
          displayName: match.displayName,
          watchlistId: match.watchlistId,
          watchlistName: match.watchlistName,
          embeddings: [],
        });
      }

      personMap.get(match.personId)!.embeddings.push({
        embeddingId: match.embeddingId,
        similarity: match.similarity,
      });
    }

    // Calculate aggregate scores
    const persons: PersonCandidate[] = [];

    for (const [personId, data] of personMap.entries()) {
      const similarities = data.embeddings.map((e) => e.similarity);
      const bestSimilarity = Math.max(...similarities);
      const meanTopKSimilarity =
        similarities.slice(0, 3).reduce((sum, s) => sum + s, 0) /
        Math.min(3, similarities.length);

      persons.push({
        personId,
        displayName: data.displayName,
        watchlistId: data.watchlistId,
        watchlistName: data.watchlistName,
        bestSimilarity,
        meanTopKSimilarity,
        supportingEmbeddings: data.embeddings.length,
        embeddingMatches: data.embeddings,
      });
    }

    // Sort by best similarity
    persons.sort((a, b) => b.bestSimilarity - a.bestSimilarity);

    return persons;
  }

  /**
   * Check for duplicate enrollments
   * Searches for existing persons with high similarity
   */
  async findDuplicates(
    tenantId: string,
    watchlistId: string,
    embedding: Float32Array,
    threshold: number = 0.90,
  ): Promise<PersonCandidate[]> {
    const candidates = await this.searchPersons({
      tenantId,
      embedding,
      watchlistIds: [watchlistId],
      limit: 5,
      threshold,
    });

    return candidates.filter((c) => c.bestSimilarity >= threshold);
  }

  /**
   * Search across all watchlists for a tenant
   */
  async searchAllWatchlists(
    tenantId: string,
    embedding: Float32Array,
    limit?: number,
  ): Promise<PersonCandidate[]> {
    return this.searchPersons({
      tenantId,
      embedding,
      limit,
    });
  }

  /**
   * Get person embeddings for re-embedding or analysis
   */
  async getPersonEmbeddings(
    tenantId: string,
    personId: string,
  ): Promise<Array<{
    id: string;
    embedding: Float32Array;
    quality: number;
    modelName: string;
    modelVersion: string;
  }>> {
    const sql = `
      SELECT
        id,
        embedding,
        quality_score,
        model_name,
        model_version
      FROM face_embeddings
      WHERE tenant_id = $1
        AND person_id = $2
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
    `;

    const result = await this.db.query(sql, [tenantId, personId]);

    return result.rows.map((row) => ({
      id: row.id,
      embedding: this.parseVectorFromPostgres(row.embedding),
      quality: parseFloat(row.quality_score) || 0,
      modelName: row.model_name,
      modelVersion: row.model_version,
    }));
  }

  /**
   * Get watchlist statistics
   */
  async getWatchlistStats(
    tenantId: string,
    watchlistId: string,
  ): Promise<{
    personCount: number;
    embeddingCount: number;
    avgEmbeddingsPerPerson: number;
    avgQuality: number;
  }> {
    const sql = `
      SELECT
        COUNT(DISTINCT fp.id) AS person_count,
        COUNT(fe.id) AS embedding_count,
        AVG(fe.quality_score) AS avg_quality
      FROM face_watchlist_persons fp
      LEFT JOIN face_embeddings fe ON fe.person_id = fp.id
      WHERE fp.tenant_id = $1
        AND fp.watchlist_id = $2
        AND fp.archived_at IS NULL
    `;

    const result = await this.db.query(sql, [tenantId, watchlistId]);
    const row = result.rows[0];

    const personCount = parseInt(row.person_count) || 0;
    const embeddingCount = parseInt(row.embedding_count) || 0;

    return {
      personCount,
      embeddingCount,
      avgEmbeddingsPerPerson: personCount > 0 ? embeddingCount / personCount : 0,
      avgQuality: parseFloat(row.avg_quality) || 0,
    };
  }

  /**
   * Format Float32Array for PostgreSQL vector type
   */
  private formatVectorForPostgres(embedding: Float32Array): string {
    // pgvector expects format: '[1.0, 2.0, 3.0, ...]'
    return `[${Array.from(embedding).join(',')}]`;
  }

  /**
   * Parse PostgreSQL vector to Float32Array
   */
  private parseVectorFromPostgres(pgVector: string): Float32Array {
    // Remove brackets and parse
    const values = pgVector
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((v) => parseFloat(v.trim()));
    return new Float32Array(values);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FaceSearchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): FaceSearchConfig {
    return { ...this.config };
  }
}
