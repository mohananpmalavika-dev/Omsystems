/**
 * Face Search Service
 * Performs vector similarity search using PostgreSQL pgvector
 */
export class FaceSearchService {
    db;
    config;
    constructor(db, config) {
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
    async searchSimilarFaces(query) {
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
        const params = [embeddingVector, query.tenantId, limit];
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
        }
        catch (error) {
            console.error('Face search query failed:', error);
            throw new Error(`Face search unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Search and aggregate by person
     * Groups multiple embeddings per person and returns best/mean scores
     */
    async searchPersons(query) {
        const embeddingMatches = await this.searchSimilarFaces(query);
        if (embeddingMatches.length === 0) {
            return [];
        }
        // Group by person
        const personMap = new Map();
        for (const match of embeddingMatches) {
            if (!personMap.has(match.personId)) {
                personMap.set(match.personId, {
                    displayName: match.displayName,
                    watchlistId: match.watchlistId,
                    watchlistName: match.watchlistName,
                    embeddings: [],
                });
            }
            personMap.get(match.personId).embeddings.push({
                embeddingId: match.embeddingId,
                similarity: match.similarity,
            });
        }
        // Calculate aggregate scores
        const persons = [];
        for (const [personId, data] of personMap.entries()) {
            const similarities = data.embeddings.map((e) => e.similarity);
            const bestSimilarity = Math.max(...similarities);
            const meanTopKSimilarity = similarities.slice(0, 3).reduce((sum, s) => sum + s, 0) /
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
    async findDuplicates(tenantId, watchlistId, embedding, threshold = 0.90) {
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
    async searchAllWatchlists(tenantId, embedding, limit) {
        return this.searchPersons({
            tenantId,
            embedding,
            limit,
        });
    }
    /**
     * Get person embeddings for re-embedding or analysis
     */
    async getPersonEmbeddings(tenantId, personId) {
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
    async getWatchlistStats(tenantId, watchlistId) {
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
    formatVectorForPostgres(embedding) {
        // pgvector expects format: '[1.0, 2.0, 3.0, ...]'
        return `[${Array.from(embedding).join(',')}]`;
    }
    /**
     * Parse PostgreSQL vector to Float32Array
     */
    parseVectorFromPostgres(pgVector) {
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
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
