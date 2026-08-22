/**
 * PTZ Priority Manager Service
 * Manages operator ownership locks with hierarchical priority preemption:
 * GUARD (10) < SUPERVISOR (20) < INCIDENT_RESPONSE (50) < SYSTEM_ADMIN (100)
 */

import { randomUUID } from 'node:crypto';
import {
  PtzPriorityRole,
  PtzLockState,
  PTZ_PRIORITY_LEVELS,
} from '../domain/ptz.types.js';

export interface RequestLockInput {
  cameraId: string;
  operatorId: string;
  operatorName: string;
  role: PtzPriorityRole;
  durationSeconds?: number; // Default 30s
}

export interface LockAcquisitionResult {
  granted: boolean;
  lock?: PtzLockState;
  preemptedExistingLock?: boolean;
  error?: string;
  currentOwner?: {
    operatorName: string;
    role: PtzPriorityRole;
    priority: number;
    expiresInSeconds: number;
  };
}

export class PtzPriorityManagerService {
  private locks = new Map<string, PtzLockState>();
  private onIdleReturnCallbacks: Array<(cameraId: string) => void> = [];

  /**
   * Registers a callback invoked when a lock is released/expired so the camera can auto-return to Home.
   */
  onIdle(callback: (cameraId: string) => void): void {
    this.onIdleReturnCallbacks.push(callback);
  }

  /**
   * Requests an exclusive PTZ control lock with priority preemption.
   */
  requestLock(input: RequestLockInput): LockAcquisitionResult {
    const requestedPriority = PTZ_PRIORITY_LEVELS[input.role];
    const durationMs = (input.durationSeconds || 30) * 1000;
    const now = Date.now();

    const existingLock = this.locks.get(input.cameraId);

    if (existingLock && existingLock.expiresAt > now && existingLock.status === 'ACTIVE') {
      // 1. Same operator renewing their own lock
      if (existingLock.operatorId === input.operatorId) {
        existingLock.expiresAt = now + durationMs;
        return { granted: true, lock: existingLock, preemptedExistingLock: false };
      }

      // 2. Higher priority preemption
      if (requestedPriority > existingLock.priority) {
        // Mark existing lock as preempted
        existingLock.status = 'PREEMPTED';
        existingLock.preemptedBy = {
          operatorId: input.operatorId,
          operatorName: input.operatorName,
          role: input.role,
          priority: requestedPriority,
        };

        const newLock: PtzLockState = {
          cameraId: input.cameraId,
          operatorId: input.operatorId,
          operatorName: input.operatorName,
          role: input.role,
          priority: requestedPriority,
          token: `ptz-tok-${randomUUID().slice(0, 8)}`,
          acquiredAt: now,
          expiresAt: now + durationMs,
          status: 'ACTIVE',
        };

        this.locks.set(input.cameraId, newLock);
        return { granted: true, lock: newLock, preemptedExistingLock: true };
      }

      // 3. Collision with equal or higher priority operator -> Reject
      const remainingSeconds = Math.max(0, Math.ceil((existingLock.expiresAt - now) / 1000));
      return {
        granted: false,
        error: 'PTZ_LOCKED_BY_HIGHER_OR_EQUAL_PRIORITY_OPERATOR',
        currentOwner: {
          operatorName: existingLock.operatorName,
          role: existingLock.role,
          priority: existingLock.priority,
          expiresInSeconds: remainingSeconds,
        },
      };
    }

    // 4. No active lock -> Grant immediately
    const newLock: PtzLockState = {
      cameraId: input.cameraId,
      operatorId: input.operatorId,
      operatorName: input.operatorName,
      role: input.role,
      priority: requestedPriority,
      token: `ptz-tok-${randomUUID().slice(0, 8)}`,
      acquiredAt: now,
      expiresAt: now + durationMs,
      status: 'ACTIVE',
    };

    this.locks.set(input.cameraId, newLock);
    return { granted: true, lock: newLock, preemptedExistingLock: false };
  }

  /**
   * Validates if the operator currently holds active PTZ control over the camera.
   */
  assertControl(cameraId: string, operatorId: string, token?: string): boolean {
    const now = Date.now();
    const lock = this.locks.get(cameraId);

    if (!lock || lock.expiresAt <= now || lock.status !== 'ACTIVE') {
      return false;
    }

    if (lock.operatorId !== operatorId) {
      return false;
    }

    if (token && lock.token !== token) {
      return false;
    }

    return true;
  }

  /**
   * Releases PTZ control lock and notifies listeners to trigger idle auto-return to Home.
   */
  releaseLock(cameraId: string, operatorId: string): boolean {
    const lock = this.locks.get(cameraId);
    if (!lock || lock.operatorId !== operatorId) {
      return false;
    }

    lock.status = 'RELEASED';
    this.locks.delete(cameraId);

    // Trigger auto-return to Home position
    for (const cb of this.onIdleReturnCallbacks) {
      try {
        cb(cameraId);
      } catch {
        // Safe callback execution
      }
    }

    return true;
  }

  getLock(cameraId: string): PtzLockState | null {
    const now = Date.now();
    const lock = this.locks.get(cameraId);
    if (!lock || lock.expiresAt <= now || lock.status !== 'ACTIVE') {
      return null;
    }
    return lock;
  }
}

export const ptzPriorityManager = new PtzPriorityManagerService();
