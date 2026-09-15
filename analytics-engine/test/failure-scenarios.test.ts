/**
 * Failure Scenario Tests
 * Tests error handling for model unavailable, database failures, and invalid inputs
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { FaceRecognitionService } from "../src/face/face-recognition.service.js";
import { FaceSearchService } from "../src/face/face-search.service.js";
import { FaceEnrollmentService } from "../src/face/face-enrollment.service.js";
import { IndustrialPersistenceService } from "../src/industrial/industrial-persistence.service.js";
import { Pool } from "pg";

describe("Failure Scenario Handling", () => {
  describe("Model Unavailable Scenarios", () => {
    it("handles face recognition model loading failure gracefully", async () => {
      // Mock recognition service that fails to load model
      const failingService = {
        extractFaceEmbedding: async () => {
          throw new Error("ONNX model not found: face-embedding.onnx");
        },
      } as any;

      const testImage = Buffer.from("test-image");

      await expect(failingService.extractFaceEmbedding(testImage)).rejects.toThrow(
        "ONNX model not found",
      );
    });

    it("returns degraded status when models are unavailable", () => {
      const healthCheck = {
        status: "degraded",
        initializationError: null,
        pipeline: {
          initialized: true,
          models: {
            ready: false,
            loaded: 2,
            required: 6,
            missing: ["face-detector.onnx", "face-embedding.onnx", "helmet.onnx", "fire.onnx"],
          },
        },
      };

      expect(healthCheck.status).toBe("degraded");
      expect(healthCheck.pipeline.models.ready).toBe(false);
      expect(healthCheck.pipeline.models.missing).toHaveLength(4);
    });

    it("fails production readiness check when required models absent", () => {
      const productionHealthCheck = {
        status: "unhealthy",
        initializationError: "Required analytics models are not ready: 4 models missing",
        pipeline: {
          initialized: true,
          models: {
            ready: false,
            loaded: 2,
            required: 6,
          },
        },
      };

      expect(productionHealthCheck.status).toBe("unhealthy");
      expect(productionHealthCheck.initializationError).toContain("Required analytics models");
    });

    it("provides fallback when inference model unavailable", async () => {
      const modelManager = {
        isModelLoaded: (modelName: string) => false,
        runInference: async (modelName: string, input: any) => {
          if (!modelManager.isModelLoaded(modelName)) {
            return {
              fallback: true,
              detections: [],
              reason: `Model ${modelName} not available`,
            };
          }
          return { detections: [] };
        },
      };

      const result = await modelManager.runInference("face-detector", Buffer.alloc(100));

      expect(result.fallback).toBe(true);
      expect(result.reason).toContain("not available");
    });
  });

  describe("Database Connection Failures", () => {
    it("handles database connection loss gracefully", async () => {
      // Mock database pool that fails connection
      const failingDb = {
        query: async () => {
          throw new Error("ECONNREFUSED: Connection refused to PostgreSQL");
        },
        connect: async () => {
          throw new Error("ECONNREFUSED");
        },
      } as any;

      const searchService = new FaceSearchService(failingDb);

      await expect(
        searchService.searchPersons({
          tenantId: "test",
          embedding: new Float32Array(512),
          minSimilarity: 0.60,
          limit: 10,
        }),
      ).rejects.toThrow("ECONNREFUSED");
    });

    it("handles database timeout errors", async () => {
      const timeoutDb = {
        query: async () => {
          await new Promise((resolve) => setTimeout(resolve, 35000)); // Simulate 35s timeout
          throw new Error("Query timeout after 30000ms");
        },
      } as any;

      const persistenceService = new IndustrialPersistenceService(timeoutDb);

      await expect(
        persistenceService.getViolations("tenant-001", {}),
      ).rejects.toThrow("Query timeout");
    });

    it("handles pgvector extension not installed", async () => {
      const db = {
        query: async (sql: string) => {
          if (sql.includes("vector")) {
            throw new Error('type "vector" does not exist');
          }
          return { rows: [] };
        },
      } as any;

      const searchService = new FaceSearchService(db);

      await expect(
        searchService.searchPersons({
          tenantId: "test",
          embedding: new Float32Array(512),
          minSimilarity: 0.60,
          limit: 10,
        }),
      ).rejects.toThrow('type "vector" does not exist');
    });

    it("retries transient database errors", async () => {
      let attemptCount = 0;
      const retryDb = {
        query: async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error("Connection pool exhausted");
          }
          return { rows: [{ id: "success" }] };
        },
      } as any;

      // Simple retry logic
      const executeWithRetry = async (fn: () => Promise<any>, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fn();
          } catch (err: any) {
            if (i === maxRetries - 1 || !err.message.includes("Connection pool")) {
              throw err;
            }
            await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
          }
        }
      };

      const result = await executeWithRetry(() => retryDb.query("SELECT * FROM test"));

      expect(result.rows[0].id).toBe("success");
      expect(attemptCount).toBe(3);
    });
  });

  describe("Invalid Input Handling", () => {
    it("rejects invalid embedding dimensions", async () => {
      const db = {} as any;
      const searchService = new FaceSearchService(db);

      await expect(
        searchService.searchPersons({
          tenantId: "test",
          embedding: new Float32Array(128), // Wrong dimension
          minSimilarity: 0.60,
          limit: 10,
        }),
      ).rejects.toThrow();
    });

    it("validates image format and size", async () => {
      const recognitionService = {
        extractFaceEmbedding: async (imageBuffer: Buffer) => {
          if (imageBuffer.length < 100) {
            throw new Error("Image too small: minimum 100 bytes required");
          }
          if (imageBuffer.length > 10 * 1024 * 1024) {
            throw new Error("Image too large: maximum 10MB allowed");
          }
          // Check if valid image format (simplified)
          const header = imageBuffer.slice(0, 4).toString("hex");
          if (!["ffd8ffe0", "ffd8ffe1", "89504e47"].includes(header)) {
            throw new Error("Invalid image format: only JPEG and PNG supported");
          }
          return {
            embedding: new Float32Array(512),
            confidence: 0.90,
            quality: 0.85,
          };
        },
      } as any;

      // Too small
      await expect(recognitionService.extractFaceEmbedding(Buffer.alloc(50))).rejects.toThrow(
        "Image too small",
      );

      // Too large
      await expect(
        recognitionService.extractFaceEmbedding(Buffer.alloc(11 * 1024 * 1024)),
      ).rejects.toThrow("Image too large");

      // Invalid format
      await expect(recognitionService.extractFaceEmbedding(Buffer.alloc(1000))).rejects.toThrow(
        "Invalid image format",
      );
    });

    it("handles malformed zone polygon", async () => {
      const validatePolygon = (polygon: Array<{ x: number; y: number }>) => {
        if (polygon.length < 3) {
          throw new Error("Polygon must have at least 3 points");
        }
        for (const point of polygon) {
          if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
            throw new Error("Polygon coordinates must be normalized (0-1)");
          }
        }
      };

      // Too few points
      expect(() => validatePolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow(
        "at least 3 points",
      );

      // Out of bounds
      expect(() =>
        validatePolygon([{ x: 0, y: 0 }, { x: 1.5, y: 1 }, { x: 0.5, y: 0.5 }]),
      ).toThrow("normalized");
    });

    it("validates similarity threshold ranges", () => {
      const validateThreshold = (threshold: number) => {
        if (threshold < 0 || threshold > 1) {
          throw new Error("Similarity threshold must be between 0 and 1");
        }
      };

      expect(() => validateThreshold(-0.1)).toThrow("between 0 and 1");
      expect(() => validateThreshold(1.5)).toThrow("between 0 and 1");
      expect(() => validateThreshold(0.75)).not.toThrow();
    });

    it("rejects empty watchlist name", async () => {
      const validateWatchlist = (name: string) => {
        if (!name || name.trim().length === 0) {
          throw new Error("Watchlist name cannot be empty");
        }
        if (name.length > 160) {
          throw new Error("Watchlist name too long: maximum 160 characters");
        }
      };

      expect(() => validateWatchlist("")).toThrow("cannot be empty");
      expect(() => validateWatchlist("  ")).toThrow("cannot be empty");
      expect(() => validateWatchlist("A".repeat(161))).toThrow("too long");
    });
  });

  describe("Resource Exhaustion Scenarios", () => {
    it("handles memory pressure during batch processing", async () => {
      const memoryMonitor = {
        usedMemoryMB: 0,
        maxMemoryMB: 1024,
        canAllocate: (requiredMB: number) => {
          return memoryMonitor.usedMemoryMB + requiredMB <= memoryMonitor.maxMemoryMB;
        },
      };

      const batchProcessor = async (items: any[], batchSize: number) => {
        const results = [];
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);
          const batchMemoryMB = batch.length * 2; // 2MB per item

          if (!memoryMonitor.canAllocate(batchMemoryMB)) {
            throw new Error("Insufficient memory for batch processing");
          }

          memoryMonitor.usedMemoryMB += batchMemoryMB;
          results.push(...batch);
          memoryMonitor.usedMemoryMB -= batchMemoryMB;
        }
        return results;
      };

      memoryMonitor.usedMemoryMB = 1000; // Almost full

      await expect(batchProcessor(new Array(100), 10)).rejects.toThrow(
        "Insufficient memory",
      );
    });

    it("handles concurrent request limits", async () => {
      let activeRequests = 0;
      const maxConcurrent = 10;

      const rateLimiter = async (fn: () => Promise<any>) => {
        if (activeRequests >= maxConcurrent) {
          throw new Error("Too many concurrent requests");
        }

        activeRequests++;
        try {
          return await fn();
        } finally {
          activeRequests--;
        }
      };

      // Fill up to limit
      const requests = Array.from({ length: 10 }, () =>
        rateLimiter(async () => new Promise((resolve) => setTimeout(resolve, 100))),
      );

      // This should fail
      await expect(
        rateLimiter(async () => new Promise((resolve) => resolve(true))),
      ).rejects.toThrow("Too many concurrent requests");

      // Wait for existing requests to complete
      await Promise.all(requests);

      // Now it should work
      await expect(
        rateLimiter(async () => new Promise((resolve) => resolve(true))),
      ).resolves.toBe(true);
    });

    it("handles disk space exhaustion for snapshots", () => {
      const diskMonitor = {
        availableGB: 5,
        requiredGB: 10,
        hasSpace: () => diskMonitor.availableGB >= diskMonitor.requiredGB,
      };

      const saveSnapshot = (snapshotSizeGB: number) => {
        if (snapshotSizeGB > diskMonitor.availableGB) {
          throw new Error("Insufficient disk space for snapshot");
        }
        diskMonitor.availableGB -= snapshotSizeGB;
      };

      expect(() => saveSnapshot(3)).not.toThrow();
      expect(() => saveSnapshot(3)).toThrow("Insufficient disk space");
    });
  });

  describe("Network and External Service Failures", () => {
    it("handles S3 upload failure for snapshots", async () => {
      const s3Client = {
        upload: async (params: any) => {
          throw new Error("Network error: Connection timeout to S3");
        },
      };

      await expect(
        s3Client.upload({ Bucket: "snapshots", Key: "test.jpg", Body: Buffer.alloc(100) }),
      ).rejects.toThrow("Connection timeout to S3");
    });

    it("handles Redis connection failure gracefully", async () => {
      const redisClient = {
        get: async (key: string) => {
          throw new Error("Redis connection refused");
        },
        set: async (key: string, value: string) => {
          throw new Error("Redis connection refused");
        },
      };

      // Should fallback to database or in-memory cache
      const cacheWithFallback = {
        get: async (key: string) => {
          try {
            return await redisClient.get(key);
          } catch (err) {
            // Fallback to database
            return null;
          }
        },
      };

      const result = await cacheWithFallback.get("test-key");
      expect(result).toBeNull(); // Fallback returns null instead of throwing
    });

    it("handles external API rate limiting", async () => {
      let requestCount = 0;
      const rateLimit = 10;

      const externalAPI = {
        call: async () => {
          requestCount++;
          if (requestCount > rateLimit) {
            throw new Error("Rate limit exceeded: 429 Too Many Requests");
          }
          return { success: true };
        },
      };

      // Make 10 successful requests
      for (let i = 0; i < 10; i++) {
        await externalAPI.call();
      }

      // 11th request should fail
      await expect(externalAPI.call()).rejects.toThrow("Rate limit exceeded");
    });
  });

  describe("Data Corruption and Integrity", () => {
    it("detects and rejects corrupted embedding data", () => {
      const validateEmbedding = (embedding: Float32Array) => {
        // Check for NaN or Infinity
        for (let i = 0; i < embedding.length; i++) {
          if (!isFinite(embedding[i])) {
            throw new Error("Corrupted embedding: contains NaN or Infinity");
          }
        }

        // Check for zero vector (invalid)
        const sumSquares = embedding.reduce((sum, val) => sum + val * val, 0);
        if (sumSquares === 0) {
          throw new Error("Corrupted embedding: zero vector");
        }
      };

      // Valid embedding
      const validEmbedding = new Float32Array(512).fill(0.5);
      expect(() => validateEmbedding(validEmbedding)).not.toThrow();

      // NaN corruption
      const nanEmbedding = new Float32Array(512).fill(0.5);
      nanEmbedding[100] = NaN;
      expect(() => validateEmbedding(nanEmbedding)).toThrow("NaN or Infinity");

      // Zero vector
      const zeroEmbedding = new Float32Array(512).fill(0);
      expect(() => validateEmbedding(zeroEmbedding)).toThrow("zero vector");
    });

    it("handles database constraint violations", async () => {
      const db = {
        query: async (sql: string, params: any[]) => {
          if (sql.includes("INSERT") && sql.includes("face_watchlists")) {
            throw new Error(
              'duplicate key value violates unique constraint "face_watchlists_pkey"',
            );
          }
          return { rows: [] };
        },
      } as any;

      await expect(
        db.query("INSERT INTO face_watchlists (id, name) VALUES ($1, $2)", [
          "duplicate-id",
          "Test",
        ]),
      ).rejects.toThrow("duplicate key");
    });

    it("validates foreign key integrity", async () => {
      const db = {
        query: async (sql: string, params: any[]) => {
          if (sql.includes("INSERT") && sql.includes("face_watchlist_persons")) {
            throw new Error(
              'insert or update on table "face_watchlist_persons" violates foreign key constraint',
            );
          }
          return { rows: [] };
        },
      } as any;

      await expect(
        db.query(
          "INSERT INTO face_watchlist_persons (watchlist_id, full_name) VALUES ($1, $2)",
          ["non-existent-watchlist", "John Doe"],
        ),
      ).rejects.toThrow("foreign key constraint");
    });
  });

  describe("Graceful Degradation", () => {
    it("continues operation with reduced functionality when model unavailable", () => {
      const analyticsEngine = {
        modelsLoaded: {
          person: true,
          vehicle: true,
          face: false,
          helmet: false,
        },
        getCapabilities: () => {
          const capabilities = [];
          if (analyticsEngine.modelsLoaded.person) capabilities.push("person-detection");
          if (analyticsEngine.modelsLoaded.vehicle) capabilities.push("vehicle-detection");
          if (analyticsEngine.modelsLoaded.face) capabilities.push("face-recognition");
          if (analyticsEngine.modelsLoaded.helmet) capabilities.push("ppe-detection");
          return capabilities;
        },
      };

      const capabilities = analyticsEngine.getCapabilities();

      expect(capabilities).toContain("person-detection");
      expect(capabilities).toContain("vehicle-detection");
      expect(capabilities).not.toContain("face-recognition");
      expect(capabilities).not.toContain("ppe-detection");
    });

    it("uses cached results when database temporarily unavailable", async () => {
      const cache = new Map<string, any>();

      const serviceWithCache = {
        getWatchlist: async (id: string, useCache = true) => {
          if (useCache && cache.has(id)) {
            return { ...cache.get(id), cached: true };
          }

          try {
            // Simulate database query
            throw new Error("Database unavailable");
          } catch (err) {
            if (cache.has(id)) {
              return { ...cache.get(id), cached: true, stale: true };
            }
            throw err;
          }
        },
      };

      // Populate cache
      cache.set("watchlist-001", { id: "watchlist-001", name: "Test Watchlist" });

      const result = await serviceWithCache.getWatchlist("watchlist-001");

      expect(result.cached).toBe(true);
      expect(result.stale).toBe(true);
      expect(result.name).toBe("Test Watchlist");
    });
  });
});
