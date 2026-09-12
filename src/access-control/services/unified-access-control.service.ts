import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type DoorLocationType = "ENTRANCE" | "VAULT" | "SERVER_ROOM" | "CASH_CABIN" | "GENERAL";
export type DoorState = "LOCKED" | "UNLOCKED" | "FORCED_OPEN" | "HELD_OPEN" | "FAULT";
export type CredentialType = "BADGE" | "BIOMETRIC" | "PIN" | "REMOTE_OVERRIDE";
export type AccessDirection = "ENTRY" | "EXIT";

export interface DoorRegistrationInput {
  tenantId: string;
  branchId: string;
  doorCode: string;
  name: string;
  locationType: DoorLocationType;
  antiPassbackEnabled?: boolean;
}

export interface DoorCameraBindingInput {
  tenantId: string;
  doorId: string;
  cameraId: string;
  direction: "IN" | "OUT" | "BOTH";
  preEventSeconds?: number;
  postEventSeconds?: number;
}

export interface AccessEventInput {
  tenantId: string;
  branchId: string;
  doorId: string;
  credentialType: CredentialType;
  badgeId: string;
  userId?: string;
  userName?: string;
  direction: AccessDirection;
  timestamp?: Date;
  detectedPersonCount?: number;
  confidence?: number;
}

export interface AccessEvaluationResult {
  eventId: string;
  granted: boolean;
  denialReason?: string;
  tailgatingDetected: boolean;
  tailgatingIncidentId?: string;
  boundCameraIds: string[];
  bookmarkCreated: boolean;
  timestamp: Date;
}

export class UnifiedAccessControlService {
  private readonly memoryDoors = new Map<string, any>();
  private readonly memoryBindings = new Map<string, any[]>();
  private readonly memoryPassbackState = new Map<string, AccessDirection>();
  private readonly memoryEvents = new Map<string, any>();
  private readonly memoryTailgating = new Map<string, any>();

  constructor(private readonly pool?: Pool) {}

  async registerDoor(input: DoorRegistrationInput): Promise<any> {
    const doorId = randomUUID();
    const door = {
      id: doorId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      doorCode: input.doorCode,
      name: input.name,
      locationType: input.locationType,
      state: "LOCKED" as DoorState,
      antiPassbackEnabled: input.antiPassbackEnabled ?? true,
      lastStateChange: new Date(),
    };

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `INSERT INTO access_control_doors (
            id, tenant_id, branch_id, door_code, name, location_type, state, anti_passback_enabled
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (tenant_id, branch_id, door_code) DO UPDATE SET
            name = EXCLUDED.name,
            location_type = EXCLUDED.location_type,
            anti_passback_enabled = EXCLUDED.anti_passback_enabled
          RETURNING *`,
          [door.id, door.tenantId, door.branchId, door.doorCode, door.name, door.locationType, door.state, door.antiPassbackEnabled]
        );
        return res.rows[0];
      } catch {
        // memory fallback
      }
    }

    this.memoryDoors.set(doorId, door);
    return door;
  }

  async bindDoorToCamera(input: DoorCameraBindingInput): Promise<any> {
    const bindingId = randomUUID();
    const binding = {
      id: bindingId,
      tenantId: input.tenantId,
      doorId: input.doorId,
      cameraId: input.cameraId,
      direction: input.direction,
      preEventSeconds: input.preEventSeconds ?? 15,
      postEventSeconds: input.postEventSeconds ?? 30,
      createdAt: new Date(),
    };

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `INSERT INTO door_camera_bindings (
            id, tenant_id, door_id, camera_id, direction, pre_event_seconds, post_event_seconds
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
          [binding.id, binding.tenantId, binding.doorId, binding.cameraId, binding.direction, binding.preEventSeconds, binding.postEventSeconds]
        );
        return res.rows[0];
      } catch {
        // memory fallback
      }
    }

    const list = this.memoryBindings.get(input.doorId) || [];
    list.push(binding);
    this.memoryBindings.set(input.doorId, list);
    return binding;
  }

  async evaluateAndRecordAccess(input: AccessEventInput): Promise<AccessEvaluationResult> {
    const eventId = randomUUID();
    const timestamp = input.timestamp || new Date();
    const passbackKey = `${input.tenantId}:${input.badgeId}`;

    const door = this.memoryDoors.get(input.doorId) || {
      id: input.doorId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      antiPassbackEnabled: true,
      state: "LOCKED",
    };

    let granted = true;
    let denialReason: string | undefined;

    // 1. Anti-passback validation
    if (door.antiPassbackEnabled) {
      const lastDir = this.memoryPassbackState.get(passbackKey);
      if (lastDir === input.direction && input.direction === "ENTRY") {
        granted = false;
        denialReason = "ANTI_PASSBACK";
      } else {
        this.memoryPassbackState.set(passbackKey, input.direction);
      }
    }

    // 2. Bound cameras
    const bindings = this.memoryBindings.get(input.doorId) || [];
    const boundCameraIds = bindings.map((b: any) => b.cameraId);

    // 3. Tailgating Detection
    let tailgatingDetected = false;
    let tailgatingIncidentId: string | undefined;

    if (granted && input.direction === "ENTRY" && input.detectedPersonCount !== undefined) {
      if (input.detectedPersonCount > 1) {
        tailgatingDetected = true;
        tailgatingIncidentId = randomUUID();

        const incident = {
          id: tailgatingIncidentId,
          tenantId: input.tenantId,
          branchId: input.branchId,
          doorId: input.doorId,
          cameraIds: boundCameraIds,
          accessEventId: eventId,
          badgesGrantedCount: 1,
          detectedPersonsCount: input.detectedPersonCount,
          confidence: (input as any).confidence ?? (input.detectedPersonCount > 1 ? 0.95 : 0.85),
          timestamp,
          status: "DETECTED",
        };

        this.memoryTailgating.set(tailgatingIncidentId, incident);

        if (this.pool) {
          try {
            await this.pool.query(
              `INSERT INTO tailgating_incidents (
                id, tenant_id, branch_id, door_id, camera_id, access_event_id,
                badges_granted_count, detected_persons_count, confidence, timestamp, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                incident.id,
                incident.tenantId,
                incident.branchId,
                incident.doorId,
                boundCameraIds[0] || "CAM-DEFAULT",
                incident.accessEventId,
                incident.badgesGrantedCount,
                incident.detectedPersonsCount,
                incident.confidence,
                incident.timestamp,
                incident.status,
              ]
            );
          } catch {
            // memory fallback
          }
        }
      }
    }

    const eventRecord = {
      id: eventId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      doorId: input.doorId,
      credentialType: input.credentialType,
      badgeId: input.badgeId,
      userId: input.userId,
      userName: input.userName,
      direction: input.direction,
      granted,
      denialReason,
      timestamp,
      tailgatingSuspected: tailgatingDetected,
    };

    this.memoryEvents.set(eventId, eventRecord);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO access_control_events (
            id, tenant_id, branch_id, door_id, credential_type, badge_id,
            user_id, user_name, direction, granted, denial_reason, timestamp, tailgating_suspected
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            eventRecord.id,
            eventRecord.tenantId,
            eventRecord.branchId,
            eventRecord.doorId,
            eventRecord.credentialType,
            eventRecord.badgeId,
            eventRecord.userId,
            eventRecord.userName,
            eventRecord.direction,
            eventRecord.granted,
            eventRecord.denialReason,
            eventRecord.timestamp,
            eventRecord.tailgatingSuspected,
          ]
        );
      } catch {
        // memory fallback
      }
    }

    return {
      eventId,
      granted,
      denialReason,
      tailgatingDetected,
      tailgatingIncidentId,
      boundCameraIds,
      bookmarkCreated: boundCameraIds.length > 0,
      timestamp,
    };
  }

  async getDoorState(doorId: string): Promise<DoorState> {
    const door = this.memoryDoors.get(doorId);
    return door?.state || "LOCKED";
  }

  async setDoorState(doorId: string, state: DoorState): Promise<void> {
    const door = this.memoryDoors.get(doorId);
    if (door) {
      door.state = state;
      door.lastStateChange = new Date();
    }

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE access_control_doors SET state = $1, last_state_change = NOW() WHERE id = $2`,
          [state, doorId]
        );
      } catch {
        // memory fallback
      }
    }
  }
}
