import type { Pool } from "pg";
import type { RedisClientType } from "redis";
import type { CameraCapabilitiesDurable } from "../domain/distributed-lease.types.js";
import type { CameraCapabilityRepository } from "../domain/camera-capability-repository.contract.js";

const REDIS_CACHE_TTL_SECONDS = 3600; // 1 hour distributed cache
const LOCAL_CACHE_TTL_MS = 300_000; // 5 minutes local process cache

interface LocalCacheEntry {
  capabilities: CameraCapabilitiesDurable;
  cachedAt: number;
}

export class PostgresCameraCapabilityRepository implements CameraCapabilityRepository {
  private readonly localCache = new Map<string, LocalCacheEntry>();

  constructor(
    private readonly pool?: Pool,
    private readonly redis?: RedisClientType | any,
    private readonly keyPrefix = "media:camera-capabilities:",
  ) {}

  private getCacheKey(cameraId: string): string {
    return `${this.keyPrefix}${cameraId}`;
  }

  async getCapabilities(cameraId: string): Promise<CameraCapabilitiesDurable | null> {
    const now = Date.now();

    // 1. Tier 1: Process-local Map cache (<1ms)
    const local = this.localCache.get(cameraId);
    if (local && (now - local.cachedAt) < LOCAL_CACHE_TTL_MS) {
      return local.capabilities;
    }

    // 2. Tier 2: Redis Distributed Cache (~1-2ms)
    if (this.redis) {
      try {
        const raw = await this.redis.get(this.getCacheKey(cameraId));
        if (raw) {
          const parsed: CameraCapabilitiesDurable = JSON.parse(raw);
          this.localCache.set(cameraId, { capabilities: parsed, cachedAt: now });
          return parsed;
        }
      } catch (err) {
        console.warn("[CameraCapabilityRepo] Redis cache read error:", err);
      }
    }

    // 3. Tier 3: PostgreSQL Database Query (~5ms)
    if (this.pool) {
      try {
        // Query camera specifications & resource nodes
        const result = await this.pool.query(
          `SELECT cs.camera_id::text, cs.resolution_mp, cs.resolution_width,
                  cs.resolution_height, cs.frame_rate, cs.video_codec, cs.bitrate_kbps,
                  cs.has_night_vision, cs.has_two_way_audio, cs.has_motion_detection,
                  cs.has_analytics, rn.name as camera_name, rn.metadata as node_metadata
           FROM camera_specifications cs
           LEFT JOIN resource_nodes rn ON rn.id = cs.camera_id
           WHERE cs.camera_id = $1::uuid
           LIMIT 1`,
          [cameraId],
        );

        if (result.rows[0]) {
          const row = result.rows[0];
          const width = Number(row.resolution_width) || 1920;
          const height = Number(row.resolution_height) || 1080;
          const fps = Number(row.frame_rate) || 25;
          const codec = (row.video_codec || "H264").toUpperCase();

          const caps: CameraCapabilitiesDurable = {
            cameraId,
            codecs: [codec as any, "H264"],
            supportsMainStream: true,
            supportsSubStream: true,
            supportsPtz: Boolean(row.node_metadata?.ptz),
            supportsAudio: Boolean(row.has_two_way_audio),
            supportsOnvif: true,
            supportsRtsp: true,
            supportsWebRtc: true,
            maxWidth: width,
            maxHeight: height,
            maxFps: fps,
            profiles: [
              {
                name: "main",
                width,
                height,
                fps,
                codec,
                bitrateKbps: Number(row.bitrate_kbps) || 2048,
              },
              {
                name: "sub",
                width: Math.round(width / 4) || 640,
                height: Math.round(height / 4) || 360,
                fps: Math.min(fps, 15),
                codec: "H264",
                bitrateKbps: 512,
              },
              {
                name: "preview",
                width: 320,
                height: 180,
                fps: 5,
                codec: "H264",
                bitrateKbps: 128,
              },
            ],
            discoveredAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Cache in Redis & Local
          await this.cacheCapabilities(caps);
          return caps;
        }
      } catch (err) {
        console.warn("[CameraCapabilityRepo] PostgreSQL query error:", err);
      }
    }

    // Default synthetic capabilities if camera is registered without custom specs
    const defaultCaps: CameraCapabilitiesDurable = {
      cameraId,
      codecs: ["H264", "H265"],
      supportsMainStream: true,
      supportsSubStream: true,
      supportsPtz: false,
      supportsAudio: false,
      supportsOnvif: true,
      supportsRtsp: true,
      supportsWebRtc: true,
      maxWidth: 1920,
      maxHeight: 1080,
      maxFps: 25,
      profiles: [
        {
          name: "main",
          width: 1920,
          height: 1080,
          fps: 25,
          codec: "H264",
          bitrateKbps: 2048,
        },
        {
          name: "sub",
          width: 640,
          height: 360,
          fps: 15,
          codec: "H264",
          bitrateKbps: 512,
        },
        {
          name: "preview",
          width: 320,
          height: 180,
          fps: 5,
          codec: "H264",
          bitrateKbps: 128,
        },
      ],
      discoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.cacheCapabilities(defaultCaps);
    return defaultCaps;
  }

  async saveCapabilities(capabilities: CameraCapabilitiesDurable): Promise<void> {
    if (this.pool) {
      try {
        const mainProfile = capabilities.profiles.find((p) => p.name === "main") || capabilities.profiles[0];
        await this.pool.query(
          `INSERT INTO camera_specifications (
             id, camera_id, resolution_mp, resolution_width, resolution_height,
             frame_rate, video_codec, bitrate_kbps, has_two_way_audio, updated_at
           ) VALUES (
             gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, $7, $8, now()
           )
           ON CONFLICT (camera_id) DO UPDATE SET
             resolution_width = EXCLUDED.resolution_width,
             resolution_height = EXCLUDED.resolution_height,
             frame_rate = EXCLUDED.frame_rate,
             video_codec = EXCLUDED.video_codec,
             bitrate_kbps = EXCLUDED.bitrate_kbps,
             has_two_way_audio = EXCLUDED.has_two_way_audio,
             updated_at = now()`,
          [
            capabilities.cameraId,
            ((capabilities.maxWidth * capabilities.maxHeight) / 1_000_000).toFixed(1),
            capabilities.maxWidth,
            capabilities.maxHeight,
            capabilities.maxFps,
            mainProfile?.codec || "H264",
            mainProfile?.bitrateKbps || 2048,
            capabilities.supportsAudio,
          ],
        );
      } catch (err) {
        console.warn("[CameraCapabilityRepo] PostgreSQL save error:", err);
      }
    }

    await this.cacheCapabilities(capabilities);
  }

  async invalidateCache(cameraId: string): Promise<void> {
    this.localCache.delete(cameraId);
    if (this.redis) {
      try {
        await this.redis.del(this.getCacheKey(cameraId));
      } catch (err) {
        console.warn("[CameraCapabilityRepo] Redis invalidateCache error:", err);
      }
    }
  }

  private async cacheCapabilities(caps: CameraCapabilitiesDurable): Promise<void> {
    this.localCache.set(caps.cameraId, {
      capabilities: caps,
      cachedAt: Date.now(),
    });

    if (this.redis) {
      try {
        await this.redis.set(this.getCacheKey(caps.cameraId), JSON.stringify(caps), {
          EX: REDIS_CACHE_TTL_SECONDS,
        });
      } catch (err) {
        // ignore cache write failures
      }
    }
  }
}
