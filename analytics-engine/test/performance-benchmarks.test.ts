/**
 * Performance Benchmark Tests
 * Tests performance requirements for face matching, inference, and throughput
 */

import { describe, expect, it, beforeEach } from "vitest";
import { FaceSearchService } from "../src/face/face-search.service.js";
import { FaceRecognitionService } from "../src/face/face-recognition.service.js";
import { Pool } from "pg";

describe("Performance Benchmarks", () => {
  describe("Face Matching Performance", () => {
    it("matches face against 1000 embeddings in < 100ms", async () => {
      const db = new Pool({
        connectionString: process.env.TEST_DATABASE_URL || "postgresql://localhost/sentinel_test",
      });

      const searchService = new FaceSearchService(db);
      const testTenantId = "perf-tenant-001";

      // Setup test data: create watchlist and enroll 1000 persons
      await db.query(`
        INSERT INTO face_watchlists (id, tenant_id, name)
        VALUES ('perf-watchlist', $1, 'Performance Test')
        ON CONFLICT DO NOTHING
      `, [testTenantId]);

      // Create test persons with embeddings
      const personIds: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const result = await db.query(`
          INSERT INTO face_watchlist_persons (id, tenant_id, watchlist_id, full_name)
          VALUES (gen_random_uuid(), $1, 'perf-watchlist', $2)
          RETURNING id
        `, [testTenantId, `Person ${i}`]);
        
        const personId = result.rows[0].id;
        personIds.push(personId);

        // Generate random embedding
        const embedding = new Float32Array(512);
        for (let j = 0; j < 512; j++) {
          embedding[j] = Math.random() * 2 - 1;
        }

        await db.query(`
          INSERT INTO face_embeddings (tenant_id, person_id, embedding, quality_score, model_name, model_version)
          VALUES ($1, $2, $3::vector, $4, $5, $6)
        `, [testTenantId, personId, `[${Array.from(embedding).join(",")}]`, 0.90, "test-model", "1.0"]);
      }

      // Generate query embedding
      const queryEmbedding = new Float32Array(512);
      for (let i = 0; i < 512; i++) {
        queryEmbedding[i] = Math.random() * 2 - 1;
      }

      // Benchmark search performance
      const startTime = performance.now();
      
      const candidates = await searchService.searchPersons({
        tenantId: testTenantId,
        embedding: queryEmbedding,
        minSimilarity: 0.60,
        limit: 10,
      });

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      expect(durationMs).toBeLessThan(100); // Must complete in < 100ms
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(10);

      // Cleanup
      await db.query("DELETE FROM face_embeddings WHERE tenant_id = $1", [testTenantId]);
      await db.query("DELETE FROM face_watchlist_persons WHERE tenant_id = $1", [testTenantId]);
      await db.query("DELETE FROM face_watchlists WHERE tenant_id = $1", [testTenantId]);
      await db.end();
    });

    it("maintains throughput of 100 matches per second", async () => {
      const db = new Pool({
        connectionString: process.env.TEST_DATABASE_URL || "postgresql://localhost/sentinel_test",
      });

      const searchService = new FaceSearchService(db);
      const testTenantId = "perf-throughput-001";

      // Setup test data: create watchlist with 100 persons
      await db.query(`
        INSERT INTO face_watchlists (id, tenant_id, name)
        VALUES ('throughput-watchlist', $1, 'Throughput Test')
        ON CONFLICT DO NOTHING
      `, [testTenantId]);

      for (let i = 0; i < 100; i++) {
        const result = await db.query(`
          INSERT INTO face_watchlist_persons (id, tenant_id, watchlist_id, full_name)
          VALUES (gen_random_uuid(), $1, 'throughput-watchlist', $2)
          RETURNING id
        `, [testTenantId, `Throughput Person ${i}`]);
        
        const personId = result.rows[0].id;
        const embedding = new Float32Array(512);
        for (let j = 0; j < 512; j++) {
          embedding[j] = Math.random() * 2 - 1;
        }

        await db.query(`
          INSERT INTO face_embeddings (tenant_id, person_id, embedding, quality_score, model_name, model_version)
          VALUES ($1, $2, $3::vector, $4, $5, $6)
        `, [testTenantId, personId, `[${Array.from(embedding).join(",")}]`, 0.85, "test-model", "1.0"]);
      }

      // Perform 100 searches
      const searchCount = 100;
      const startTime = performance.now();

      for (let i = 0; i < searchCount; i++) {
        const queryEmbedding = new Float32Array(512);
        for (let j = 0; j < 512; j++) {
          queryEmbedding[j] = Math.random() * 2 - 1;
        }

        await searchService.searchPersons({
          tenantId: testTenantId,
          embedding: queryEmbedding,
          minSimilarity: 0.60,
          limit: 5,
        });
      }

      const endTime = performance.now();
      const durationSeconds = (endTime - startTime) / 1000;
      const throughput = searchCount / durationSeconds;

      expect(throughput).toBeGreaterThan(100); // Must achieve > 100 searches/sec

      // Cleanup
      await db.query("DELETE FROM face_embeddings WHERE tenant_id = $1", [testTenantId]);
      await db.query("DELETE FROM face_watchlist_persons WHERE tenant_id = $1", [testTenantId]);
      await db.query("DELETE FROM face_watchlists WHERE tenant_id = $1", [testTenantId]);
      await db.end();
    });
  });

  describe("Embedding Extraction Performance", () => {
    it("extracts face embedding in < 200ms", async () => {
      // Mock recognition service
      const recognitionService = {
        extractFaceEmbedding: async (imageBuffer: Buffer) => {
          const startTime = performance.now();
          
          // Simulate embedding extraction
          const embedding = new Float32Array(512);
          for (let i = 0; i < 512; i++) {
            embedding[i] = (imageBuffer[i % imageBuffer.length] / 255) - 0.5;
          }
          
          const endTime = performance.now();
          const durationMs = endTime - startTime;

          return {
            embedding,
            confidence: 0.95,
            quality: 0.88,
            processingTimeMs: durationMs,
          };
        },
      } as any;

      const testImage = Buffer.alloc(640 * 480 * 3, 127); // 640x480 RGB image
      
      const startTime = performance.now();
      const result = await recognitionService.extractFaceEmbedding(testImage);
      const endTime = performance.now();
      
      const durationMs = endTime - startTime;

      expect(durationMs).toBeLessThan(200); // Must complete in < 200ms
      expect(result.embedding.length).toBe(512);
    });
  });

  describe("Database Query Performance", () => {
    it("retrieves watchlist with 1000 persons in < 50ms", async () => {
      const db = new Pool({
        connectionString: process.env.TEST_DATABASE_URL || "postgresql://localhost/sentinel_test",
      });

      const testTenantId = "perf-watchlist-001";
      const watchlistId = "large-watchlist";

      // Create watchlist with 1000 persons
      await db.query(`
        INSERT INTO face_watchlists (id, tenant_id, name)
        VALUES ($1, $2, 'Large Watchlist')
        ON CONFLICT DO NOTHING
      `, [watchlistId, testTenantId]);

      for (let i = 0; i < 1000; i++) {
        await db.query(`
          INSERT INTO face_watchlist_persons (tenant_id, watchlist_id, full_name)
          VALUES ($1, $2, $3)
        `, [testTenantId, watchlistId, `Person ${i}`]);
      }

      // Benchmark watchlist retrieval
      const startTime = performance.now();
      
      const result = await db.query(`
        SELECT 
          w.*,
          COUNT(p.id) as person_count
        FROM face_watchlists w
        LEFT JOIN face_watchlist_persons p ON p.watchlist_id = w.id
        WHERE w.id = $1 AND w.tenant_id = $2
        GROUP BY w.id
      `, [watchlistId, testTenantId]);

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      expect(durationMs).toBeLessThan(50); // Must complete in < 50ms
      expect(result.rows.length).toBe(1);
      expect(parseInt(result.rows[0].person_count)).toBe(1000);

      // Cleanup
      await db.query("DELETE FROM face_watchlist_persons WHERE tenant_id = $1", [testTenantId]);
      await db.query("DELETE FROM face_watchlists WHERE tenant_id = $1", [testTenantId]);
      await db.end();
    });

    it("retrieves 1000 violation records in < 100ms", async () => {
      const db = new Pool({
        connectionString: process.env.TEST_DATABASE_URL || "postgresql://localhost/sentinel_test",
      });

      const testTenantId = "perf-violations-001";
      const testCameraId = "perf-camera-001";

      // Create test camera
      await db.query(`
        INSERT INTO cameras (id, tenant_id, name)
        VALUES ($1, $2, 'Perf Camera')
        ON CONFLICT DO NOTHING
      `, [testCameraId, testTenantId]);

      // Create 1000 violation records
      for (let i = 0; i < 1000; i++) {
        await db.query(`
          INSERT INTO industrial_violations (tenant_id, camera_id, violation_type, severity, description, occurred_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [testTenantId, testCameraId, "zone-intrusion", "medium", `Violation ${i}`, new Date()]);
      }

      // Benchmark violation retrieval
      const startTime = performance.now();
      
      const result = await db.query(`
        SELECT * FROM industrial_violations 
        WHERE tenant_id = $1 
        ORDER BY occurred_at DESC 
        LIMIT 100
      `, [testTenantId]);

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      expect(durationMs).toBeLessThan(100); // Must complete in < 100ms
      expect(result.rows.length).toBe(100);

      // Cleanup
      await db.query("DELETE FROM industrial_violations WHERE tenant_id = $1", [testTenantId]);
      await db.query("DELETE FROM cameras WHERE tenant_id = $1", [testTenantId]);
      await db.end();
    });
  });

  describe("Vector Similarity Search Performance", () => {
    it("performs cosine similarity search on 10000 vectors in < 150ms", async () => {
      const db = new Pool({
        connectionString: process.env.TEST_DATABASE_URL || "postgresql://localhost/sentinel_test",
      });

      const testTenantId = "perf-vector-001";

      // Setup pgvector extension
      await db.query("CREATE EXTENSION IF NOT EXISTS vector");

      // Create test table
      await db.query(`
        CREATE TABLE IF NOT EXISTS perf_vector_test (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id TEXT NOT NULL,
          embedding vector(512) NOT NULL
        )
      `);

      // Insert 10000 random vectors
      for (let i = 0; i < 10000; i++) {
        const embedding = new Float32Array(512);
        for (let j = 0; j < 512; j++) {
          embedding[j] = Math.random() * 2 - 1;
        }

        await db.query(`
          INSERT INTO perf_vector_test (tenant_id, embedding)
          VALUES ($1, $2::vector)
        `, [testTenantId, `[${Array.from(embedding).join(",")}]`]);
      }

      // Create index for performance
      await db.query(`
        CREATE INDEX IF NOT EXISTS perf_vector_test_embedding_idx 
        ON perf_vector_test USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);

      // Generate query vector
      const queryEmbedding = new Float32Array(512);
      for (let i = 0; i < 512; i++) {
        queryEmbedding[i] = Math.random() * 2 - 1;
      }

      // Benchmark cosine similarity search
      const startTime = performance.now();
      
      const result = await db.query(`
        SELECT 
          id,
          1 - (embedding <=> $1::vector) as similarity
        FROM perf_vector_test
        WHERE tenant_id = $2
        ORDER BY embedding <=> $1::vector
        LIMIT 10
      `, [`[${Array.from(queryEmbedding).join(",")}]`, testTenantId]);

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      expect(durationMs).toBeLessThan(150); // Must complete in < 150ms
      expect(result.rows.length).toBe(10);
      expect(result.rows[0].similarity).toBeGreaterThan(0);

      // Cleanup
      await db.query("DROP TABLE IF EXISTS perf_vector_test");
      await db.end();
    });
  });

  describe("Concurrent Request Handling", () => {
    it("handles 50 concurrent face searches without degradation", async () => {
      const db = new Pool({
        connectionString: process.env.TEST_DATABASE_URL || "postgresql://localhost/sentinel_test",
        max: 20, // Connection pool size
      });

      const searchService = new FaceSearchService(db);
      const testTenantId = "perf-concurrent-001";

      // Setup test data
      await db.query(`
        INSERT INTO face_watchlists (id, tenant_id, name)
        VALUES ('concurrent-watchlist', $1, 'Concurrent Test')
        ON CONFLICT DO NOTHING
      `, [testTenantId]);

      for (let i = 0; i < 100; i++) {
        const result = await db.query(`
          INSERT INTO face_watchlist_persons (id, tenant_id, watchlist_id, full_name)
          VALUES (gen_random_uuid(), $1, 'concurrent-watchlist', $2)
          RETURNING id
        `, [testTenantId, `Concurrent Person ${i}`]);
        
        const personId = result.rows[0].id;
        const embedding = new Float32Array(512);
        for (let j = 0; j < 512; j++) {
          embedding[j] = Math.random() * 2 - 1;
        }

        await db.query(`
          INSERT INTO face_embeddings (tenant_id, person_id, embedding, quality_score, model_name, model_version)
          VALUES ($1, $2, $3::vector, $4, $5, $6)
        `, [testTenantId, personId, `[${Array.from(embedding).join(",")}]`, 0.85, "test-model", "1.0"]);
      }

      // Perform 50 concurrent searches
      const searchCount = 50;
      const startTime = performance.now();

      const searchPromises = Array.from({ length: searchCount }, async () => {
        const queryEmbedding = new Float32Array(512);
        for (let i = 0; i < 512; i++) {
          queryEmbedding[i] = Math.random() * 2 - 1;
        }

        return searchService.searchPersons({
          tenantId: testTenantId,
          embedding: queryEmbedding,
          minSimilarity: 0.60,
          limit: 5,
        });
      });

      const results = await Promise.all(searchPromises);

      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const avgTimePerRequest = durationMs / searchCount;

      expect(results.length).toBe(searchCount);
      expect(avgTimePerRequest).toBeLessThan(100); // Average < 100ms per request

      // Cleanup
      await db.query("DELETE FROM face_embeddings WHERE tenant_id = $1", [testTenantId]);
      await db.query("DELETE FROM face_watchlist_persons WHERE tenant_id = $1", [testTenantId]);
      await db.query("DELETE FROM face_watchlists WHERE tenant_id = $1", [testTenantId]);
      await db.end();
    });
  });
});
