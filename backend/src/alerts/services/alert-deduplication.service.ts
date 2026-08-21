/**
 * Backend alert deduplication adapter.
 *
 * RedisAlertDeduplicationService is the single distributed implementation.
 * This adapter exists only to preserve the alert-operations API; it does not
 * maintain a process-local suppression window.
 */

import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import type { OperationalAlert } from "../domain/operational-alert.types.js";
import type { NormalizedAlertCandidate } from "./alert-normalizer.service.js";
import { RedisAlertDeduplicationService, type DeduplicationResult } from "../../services/redis-alert-deduplication.service.js";

export interface BackendDeduplicationResult {
  isDuplicate: boolean;
  existingAlert?: OperationalAlert;
  dedupResult?: DeduplicationResult;
}

export class AlertDeduplicationService {
  private readonly redisService: RedisAlertDeduplicationService | undefined;
  private readonly standalone = process.env.NODE_ENV !== "production";

  constructor(redisService?: RedisAlertDeduplicationService) {
    if (redisService) {
      this.redisService = redisService;
    } else if (process.env.REDIS_URL) {
      this.redisService = new RedisAlertDeduplicationService(new Redis(process.env.REDIS_URL, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        lazyConnect: false,
      }));
    }
  }

  async checkDuplicate(
    candidate: NormalizedAlertCandidate,
    activeAlerts: Map<string, OperationalAlert>,
    candidateAlertId = `alert-candidate-${randomUUID()}`,
  ): Promise<BackendDeduplicationResult> {
    const service = this.requireRedisOrStandalone();
    if (!service) return { isDuplicate: false };

    const result = await service.checkAndRecord(this.toFingerprint(candidate), candidateAlertId);
    if (!result.isDuplicate) return { isDuplicate: false, dedupResult: result };

    return {
      isDuplicate: true,
      existingAlert: activeAlerts.get(result.existingAlertId),
      dedupResult: result,
    };
  }

  async registerWindow(alert: OperationalAlert): Promise<DeduplicationResult | undefined> {
    const service = this.requireRedisOrStandalone();
    if (!service) return undefined;
    return service.checkAndRecord(this.toFingerprint(alert), alert.id);
  }

  private toFingerprint(value: NormalizedAlertCandidate | OperationalAlert) {
    return {
      cameraId: value.camera?.id,
      branchId: value.branch.id,
      alertType: value.detection.type,
      severity: value.severity,
    };
  }

  private requireRedisOrStandalone(): RedisAlertDeduplicationService | undefined {
    if (this.redisService) return this.redisService;
    if (this.standalone) return undefined;
    throw new Error("REDIS_DEDUPLICATION_UNAVAILABLE: REDIS_URL is required in production");
  }
}
