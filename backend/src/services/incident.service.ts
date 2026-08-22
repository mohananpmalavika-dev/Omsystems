/**
 * Incident Service
 * 
 * Business logic layer for incident management.
 * Handles Redis correlation incidents and PostgreSQL persistence.
 */

import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { IncidentRepository } from '../repositories/incident.repository.js';
import { getAlertCorrelationService, type Incident as RedisIncident } from './alert-correlation.service.js';
import {
  Incident,
  IncidentListItem,
  IncidentDetails,
  IncidentListFilters,
  IncidentStatisticsFilters,
  IncidentStatistics,
  IncidentListResult,
  CreateIncidentInput,
  UpdateIncidentInput,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
} from '../types/incident.types.js';

export class IncidentService {
  private readonly repository: IncidentRepository;

  constructor(
    private readonly pool: Pool,
    private readonly redis: Redis,
  ) {
    this.repository = new IncidentRepository(pool);
  }

  /**
   * List incidents with filtering and pagination
   */
  async listIncidents(filters: IncidentListFilters): Promise<IncidentListResult> {
    return this.repository.list(filters);
  }

  /**
   * Get incident by ID
   */
  async getIncidentById(tenantId: string, incidentId: string): Promise<IncidentDetails | null> {
    // Try PostgreSQL first
    const dbIncident = await this.repository.getById(tenantId, incidentId);
    if (dbIncident) {
      return dbIncident;
    }

    // Fallback to Redis (for very recent incidents not yet persisted)
    const correlationService = getAlertCorrelationService(this.redis);
    const redisIncident = await correlationService.getIncident(incidentId);

    if (redisIncident) {
      // Map Redis incident to IncidentDetails format
      return this.mapRedisIncidentToDetails(redisIncident, tenantId);
    }

    return null;
  }

  /**
   * Create new incident
   */
  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    return this.repository.create(input);
  }

  /**
   * Update incident
   */
  async updateIncident(
    tenantId: string,
    incidentId: string,
    input: UpdateIncidentInput,
  ): Promise<Incident | null> {
    return this.repository.update(tenantId, incidentId, input);
  }

  /**
   * Acknowledge incident
   */
  async acknowledgeIncident(
    tenantId: string,
    incidentId: string,
    userId: string,
  ): Promise<Incident | null> {
    return this.repository.update(tenantId, incidentId, {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      acknowledgedBy: userId,
    });
  }

  /**
   * Assign incident to user
   */
  async assignIncident(
    tenantId: string,
    incidentId: string,
    userId: string,
  ): Promise<Incident | null> {
    return this.repository.update(tenantId, incidentId, {
      assignedTo: userId,
    });
  }

  /**
   * Resolve incident
   */
  async resolveIncident(
    tenantId: string,
    incidentId: string,
    userId: string,
  ): Promise<Incident | null> {
    return this.repository.update(tenantId, incidentId, {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedBy: userId,
    });
  }

  /**
   * Get statistics
   */
  async getStatistics(filters: IncidentStatisticsFilters): Promise<IncidentStatistics> {
    return this.repository.getStatistics(filters);
  }

  /**
   * Persist Redis incident to PostgreSQL
   * 
   * Called when correlation service creates new incidents
   */
  async persistRedisIncident(
    redisIncident: RedisIncident,
    tenantId: string,
  ): Promise<Incident> {
    const input: CreateIncidentInput = {
      tenantId,
      title: redisIncident.title,
      description: redisIncident.description,
      incidentType: this.mapRedisIncidentType(redisIncident.type),
      severity: this.mapRedisSeverity(redisIncident.severity),
      branchId: redisIncident.affectedBranches[0] ?? undefined,
      cameraId: redisIncident.affectedCameras[0] ?? undefined,
      alertCount: redisIncident.childAlerts.length,
      firstDetectedAt: redisIncident.detectedAt,
      lastDetectedAt: redisIncident.detectedAt,
      metadata: {
        redisIncidentId: redisIncident.id,
        pattern: redisIncident.pattern,
        affectedBranches: redisIncident.affectedBranches,
        affectedCameras: redisIncident.affectedCameras,
        ...redisIncident.metadata,
      },
    };

    const incident = await this.repository.create(input);

    // Add associated alerts
    if (redisIncident.childAlerts.length > 0) {
      await this.repository.addAlerts(
        incident.id,
        redisIncident.childAlerts.map(alertId => ({
          alertId,
          alertType: redisIncident.type,
          alertSeverity: redisIncident.severity,
          cameraId: null, // Would need to get from alert details
          detectedAt: redisIncident.detectedAt,
        })),
      );
    }

    return incident;
  }

  /**
   * Sync recent Redis incidents to PostgreSQL
   * 
   * Background job to ensure all incidents are persisted
   */
  async syncRedisIncidents(tenantId: string): Promise<number> {
    const correlationService = getAlertCorrelationService(this.redis);
    
    // Get all incidents from Redis
    const pattern = `correlation:incidents:*`;
    let cursor = '0';
    let syncedCount = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        try {
          const data = await this.redis.get(key);
          if (!data) continue;

          const redisIncident: RedisIncident = JSON.parse(data);
          const incidentId = redisIncident.id;

          // Check if already in DB
          const exists = await this.repository.getById(tenantId, incidentId);
          if (exists) continue;

          // Persist to DB
          await this.persistRedisIncident(redisIncident, tenantId);
          syncedCount++;
        } catch (error) {
          console.error('[IncidentService] Error syncing Redis incident:', error);
        }
      }
    } while (cursor !== '0');

    return syncedCount;
  }

  /**
   * Map Redis incident type to database enum
   */
  private mapRedisIncidentType(
    redisType: 'regional_outage' | 'infrastructure_failure' | 'cascade_failure' | 'mass_event',
  ): IncidentType {
    const typeMap: Record<string, IncidentType> = {
      regional_outage: 'regional_outage',
      infrastructure_failure: 'infrastructure_failure',
      cascade_failure: 'cascade_failure',
      mass_event: 'mass_event',
    };

    return typeMap[redisType] ?? 'other';
  }

  /**
   * Map Redis severity to database enum
   */
  private mapRedisSeverity(redisSeverity: 'P1' | 'P2' | 'P3'): IncidentSeverity {
    const severityMap: Record<string, IncidentSeverity> = {
      P1: 'CRITICAL',
      P2: 'HIGH',
      P3: 'MEDIUM',
    };

    return severityMap[redisSeverity] ?? 'LOW';
  }

  /**
   * Map Redis incident to IncidentDetails format
   */
  private mapRedisIncidentToDetails(
    redisIncident: RedisIncident,
    tenantId: string,
  ): IncidentDetails {
    return {
      id: redisIncident.id,
      tenantId,
      title: redisIncident.title,
      description: redisIncident.description,
      incidentType: this.mapRedisIncidentType(redisIncident.type),
      severity: this.mapRedisSeverity(redisIncident.severity),
      status: 'OPEN',
      branchId: redisIncident.affectedBranches[0] ?? null,
      cameraId: redisIncident.affectedCameras[0] ?? null,
      deviceId: null,
      assignedTo: null,
      alertCount: redisIncident.childAlerts.length,
      firstDetectedAt: redisIncident.detectedAt,
      lastDetectedAt: redisIncident.detectedAt,
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      createdAt: redisIncident.detectedAt,
      updatedAt: redisIncident.detectedAt,
      metadata: redisIncident.metadata,
      branch: null,
      camera: null,
      assignedUser: null,
      acknowledgedByUser: null,
      resolvedByUser: null,
      alerts: redisIncident.childAlerts.map(alertId => ({
        id: alertId,
        type: redisIncident.type,
        severity: redisIncident.severity,
        cameraId: null,
        timestamp: redisIncident.detectedAt,
      })),
    };
  }

  /**
   * Delete incident
   */
  async deleteIncident(tenantId: string, incidentId: string): Promise<boolean> {
    return this.repository.delete(tenantId, incidentId);
  }
}

/**
 * Singleton factory
 */
let serviceInstance: IncidentService | null = null;

export function getIncidentService(pool: Pool, redis: Redis): IncidentService {
  if (!serviceInstance) {
    serviceInstance = new IncidentService(pool, redis);
  }
  return serviceInstance;
}
