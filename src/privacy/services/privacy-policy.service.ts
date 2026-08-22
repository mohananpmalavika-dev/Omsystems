/**
 * Privacy Policy Service
 * 
 * Manages versioned privacy policies, static masking zones, and hierarchical resolution
 */

import { randomUUID } from 'node:crypto';
import type {
  PrivacyPolicy,
  PrivacyZone,
} from '../domain/privacy.types.js';

export class PrivacyPolicyService {
  private policies: Map<string, PrivacyPolicy> = new Map();
  private cameraZones: Map<string, PrivacyZone[]> = new Map();

  constructor() {
    this.createDefaultPolicies();
  }

  private createDefaultPolicies(): void {
    const defaultPolicy: PrivacyPolicy = {
      id: 'POLICY-BANK-DEFAULT-01',
      tenantId: 'default-bank-tenant',
      name: 'Standard Banking Privacy Policy',
      description: 'Default privacy protection for ATMs, customer halls, and employee areas',
      scope: {
        tenantId: 'default-bank-tenant',
      },
      staticZones: [],
      dynamicRedaction: {
        faceBlur: 'BLUR',
        personBlur: 'NONE',
        licensePlateBlur: 'BLUR',
      },
      audio: {
        liveMute: false,
        playbackMute: false,
        exportAction: 'REMOVE_TRACK',
      },
      unmaskingPolicy: {
        requirePermission: true,
        requireReason: true,
        requireCaseNumber: true,
        requireApproval: false,
        maxSessionMinutes: 15,
      },
      version: 1,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.policies.set(defaultPolicy.id, defaultPolicy);
  }

  /**
   * Adds or updates a static privacy zone for a camera
   */
  async setStaticZone(zone: Omit<PrivacyZone, 'id'> & { id?: string }): Promise<PrivacyZone> {
    const id = zone.id || `ZONE-${randomUUID().substring(0, 8).toUpperCase()}`;
    const fullZone: PrivacyZone = {
      ...zone,
      id,
      enabled: zone.enabled ?? true,
    };

    const zones = this.cameraZones.get(zone.cameraId) || [];
    const existingIndex = zones.findIndex((z) => z.id === id);
    if (existingIndex >= 0) {
      zones[existingIndex] = fullZone;
    } else {
      zones.push(fullZone);
    }

    this.cameraZones.set(zone.cameraId, zones);
    return fullZone;
  }

  getStaticZones(cameraId: string): PrivacyZone[] {
    return (this.cameraZones.get(cameraId) || []).filter((z) => z.enabled);
  }

  /**
   * Resolves active privacy policy for a given context (Camera -> Branch -> Region -> Tenant)
   */
  resolvePolicy(context: { tenantId: string; branchId?: string; cameraId?: string }): PrivacyPolicy {
    // Return matching tenant policy or default
    for (const policy of this.policies.values()) {
      if (policy.active && (policy.tenantId === context.tenantId || policy.scope.tenantId === context.tenantId)) {
        return policy;
      }
    }
    return Array.from(this.policies.values())[0]!;
  }
}

export const privacyPolicyService = new PrivacyPolicyService();
