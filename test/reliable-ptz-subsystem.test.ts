import { describe, it, expect } from 'vitest';
import {
  PtzPriorityManagerService,
  PtzOpticsControllerService,
  PtzPresetTourManagerService,
} from '../src/ptz/index.js';

describe('Enterprise Reliable PTZ Subsystem', () => {
  it('enforces priority-based ownership preemption (Guard 10 < Supervisor 20 < Incident Response 50 < Admin 100)', () => {
    const priorityManager = new PtzPriorityManagerService();
    const cameraId = 'CAM-PTZ-VAULT-01';

    // 1. Guard (Priority 10) acquires lock
    const guardRes = priorityManager.requestLock({
      cameraId,
      operatorId: 'guard-ravi',
      operatorName: 'Ravi Kumar (Guard)',
      role: 'GUARD',
      durationSeconds: 30,
    });
    expect(guardRes.granted).toBe(true);
    expect(guardRes.lock?.priority).toBe(10);
    expect(guardRes.lock?.status).toBe('ACTIVE');

    // 2. Another Guard (Priority 10) attempts acquisition -> Collision Rejected
    const rivalGuardRes = priorityManager.requestLock({
      cameraId,
      operatorId: 'guard-suresh',
      operatorName: 'Suresh Menon (Guard)',
      role: 'GUARD',
      durationSeconds: 30,
    });
    expect(rivalGuardRes.granted).toBe(false);
    expect(rivalGuardRes.error).toBe('PTZ_LOCKED_BY_HIGHER_OR_EQUAL_PRIORITY_OPERATOR');
    expect(rivalGuardRes.currentOwner?.operatorName).toBe('Ravi Kumar (Guard)');

    // 3. Supervisor (Priority 20) requests control -> Preempts Guard
    const supervisorRes = priorityManager.requestLock({
      cameraId,
      operatorId: 'supervisor-anita',
      operatorName: 'Anita Roy (Supervisor)',
      role: 'SUPERVISOR',
      durationSeconds: 30,
    });
    expect(supervisorRes.granted).toBe(true);
    expect(supervisorRes.preemptedExistingLock).toBe(true);
    expect(supervisorRes.lock?.priority).toBe(20);

    // Old Guard lock status changed to PREEMPTED
    expect(guardRes.lock?.status).toBe('PREEMPTED');

    // 4. Incident Response / P1 Auto-Tracker (Priority 50) preempts Supervisor
    const incidentRes = priorityManager.requestLock({
      cameraId,
      operatorId: 'incident-ir-01',
      operatorName: 'P1 Vault Alarm Auto-Tracker',
      role: 'INCIDENT_RESPONSE',
      durationSeconds: 60,
    });
    expect(incidentRes.granted).toBe(true);
    expect(incidentRes.preemptedExistingLock).toBe(true);
    expect(incidentRes.lock?.priority).toBe(50);
  });

  it('executes continuous Pan, Tilt, Zoom movement with coordinate bounds validation', () => {
    const priorityManager = new PtzPriorityManagerService();
    const opticsController = new PtzOpticsControllerService(priorityManager);
    const cameraId = 'CAM-PTZ-LOBBY-01';

    // Acquire lock
    const lockRes = priorityManager.requestLock({
      cameraId,
      operatorId: 'guard-ravi',
      operatorName: 'Ravi Kumar',
      role: 'GUARD',
    });

    // Move Pan Right, Tilt Up, Zoom In
    const newCoords = opticsController.move({
      cameraId,
      operatorId: 'guard-ravi',
      token: lockRes.lock?.token,
      operatorPermissions: ['camera.ptz.control'],
      movement: {
        panVelocity: 0.8,
        tiltVelocity: 0.5,
        zoomVelocity: 1.0,
      },
    });

    expect(newCoords.pan).toBe(8);
    expect(newCoords.tilt).toBe(2.5);
    expect(newCoords.zoom).toBe(3);

    // Unauthorized movement without valid lock throws error
    expect(() => {
      opticsController.move({
        cameraId,
        operatorId: 'unauthorized-user',
        operatorPermissions: ['camera.ptz.control'],
        movement: { panVelocity: 1.0 },
      });
    }).toThrow('PTZ_CONTROL_DENIED');
  });

  it('controls Focus and Iris precision optics', () => {
    const priorityManager = new PtzPriorityManagerService();
    const opticsController = new PtzOpticsControllerService(priorityManager);
    const cameraId = 'CAM-PTZ-VAULT-02';

    const lockRes = priorityManager.requestLock({
      cameraId,
      operatorId: 'supervisor-anita',
      operatorName: 'Anita Roy',
      role: 'SUPERVISOR',
    });

    // Adjust Focus FAR and Iris OPEN
    const coords1 = opticsController.controlOptics({
      cameraId,
      operatorId: 'supervisor-anita',
      token: lockRes.lock?.token,
      operatorPermissions: ['camera.ptz.control'],
      optics: {
        focus: { mode: 'MANUAL', action: 'FAR' },
        iris: { mode: 'MANUAL', action: 'OPEN' },
      },
    });
    expect(coords1.focus).toBe(0.6);
    expect(coords1.iris).toBe(0.6);

    // Reset Optics to AUTO
    const coords2 = opticsController.controlOptics({
      cameraId,
      operatorId: 'supervisor-anita',
      token: lockRes.lock?.token,
      operatorPermissions: ['camera.ptz.control'],
      optics: {
        focus: { mode: 'AUTO' },
        iris: { mode: 'AUTO' },
      },
    });
    expect(coords2.focus).toBe(0.5);
    expect(coords2.iris).toBe(0.5);
  });

  it('manages Presets, Patterns, and automated Guard Tours with dwell times', () => {
    const presetManager = new PtzPresetTourManagerService();
    const priorityManager = new PtzPriorityManagerService();
    const opticsController = new PtzOpticsControllerService(priorityManager, presetManager);
    const cameraId = 'CAM-PTZ-PERIMETER-01';

    // 1. Store Presets
    const p1 = presetManager.storePreset(cameraId, 1, 'Main Gate Entry', 45.0, 10.0, 4.0);
    const p2 = presetManager.storePreset(cameraId, 2, 'ATM Cash Loading Bay', -30.0, -5.0, 8.0);
    expect(p1.presetNumber).toBe(1);
    expect(presetManager.listPresets(cameraId).length).toBe(2);

    // 2. Goto Preset
    const lockRes = priorityManager.requestLock({
      cameraId,
      operatorId: 'guard-ravi',
      operatorName: 'Ravi Kumar',
      role: 'GUARD',
    });
    const gotoCoords = opticsController.gotoPreset(cameraId, 2, {
      operatorId: 'guard-ravi',
      token: lockRes.lock?.token,
      operatorPermissions: ['camera.ptz.control'],
    });
    expect(gotoCoords.pan).toBe(-30.0);
    expect(gotoCoords.tilt).toBe(-5.0);
    expect(gotoCoords.zoom).toBe(8.0);

    // 3. Record Pattern
    presetManager.createPattern(cameraId, 1, 'Perimeter Fence Scan');
    const trajectory = [
      { timestamp: 0, pan: 0, tilt: 0, zoom: 1 },
      { timestamp: 1000, pan: 20, tilt: 5, zoom: 2 },
      { timestamp: 2000, pan: 40, tilt: 10, zoom: 3 },
    ];
    const recordedPattern = presetManager.recordTrajectory(cameraId, 1, trajectory, 15);
    expect(recordedPattern?.status).toBe('READY');
    expect(recordedPattern?.durationSeconds).toBe(15);

    // 4. Configure & Start Guard Tour
    const tour = presetManager.configureTour(cameraId, 1, 'Night Perimeter Guard Patrol', [
      { presetNumber: 1, dwellSeconds: 10, speed: 0.8 },
      { presetNumber: 2, dwellSeconds: 15, speed: 0.9 },
    ]);
    expect(tour.status).toBe('IDLE');

    const started = presetManager.startTour(cameraId, 1);
    expect(started?.status).toBe('RUNNING');
  });

  it('triggers Home Position auto-return upon lock release / idle timeout', () => {
    const presetManager = new PtzPresetTourManagerService();
    const priorityManager = new PtzPriorityManagerService();
    const opticsController = new PtzOpticsControllerService(priorityManager, presetManager);
    const cameraId = 'CAM-PTZ-VAULT-AUTO';

    // 1. Store Preset 1 as Home
    presetManager.storePreset(cameraId, 1, 'Vault Door Neutral', 0.0, 0.0, 1.0);

    // 2. Set Home configuration
    opticsController.setHomePosition(cameraId, {
      cameraId,
      presetNumber: 1,
      autoReturnIdleTimeoutSeconds: 30,
    }, ['camera.ptz.admin']);

    // 3. Guard acquires lock and pans away to corner
    const lockRes = priorityManager.requestLock({
      cameraId,
      operatorId: 'guard-ravi',
      operatorName: 'Ravi Kumar',
      role: 'GUARD',
    });
    opticsController.move({
      cameraId,
      operatorId: 'guard-ravi',
      token: lockRes.lock?.token,
      operatorPermissions: ['camera.ptz.control'],
      movement: { panVelocity: 1.0, tiltVelocity: 1.0, zoomVelocity: 1.0 },
    });

    const offCoords = opticsController.getCoordinates(cameraId, ['camera.ptz.view']);
    expect(offCoords.pan).toBe(10);

    // 4. Guard releases lock -> Triggers auto-return to Home
    priorityManager.releaseLock(cameraId, 'guard-ravi');

    const homeCoords = opticsController.getCoordinates(cameraId, ['camera.ptz.view']);
    expect(homeCoords.pan).toBe(0.0);
    expect(homeCoords.tilt).toBe(0.0);
    expect(homeCoords.zoom).toBe(1.0);
  });

  it('strictly enforces RBAC permissions (camera.ptz.view, camera.ptz.control, camera.ptz.admin)', () => {
    const priorityManager = new PtzPriorityManagerService();
    const opticsController = new PtzOpticsControllerService(priorityManager);
    const cameraId = 'CAM-PTZ-RBAC-01';

    // 1. Missing camera.ptz.view permission
    expect(() => {
      opticsController.getCoordinates(cameraId, []);
    }).toThrow('PERMISSION_DENIED: Missing required permission camera.ptz.view');

    // 2. Missing camera.ptz.admin permission when configuring Home
    expect(() => {
      opticsController.setHomePosition(cameraId, {
        cameraId,
        autoReturnIdleTimeoutSeconds: 30,
      }, ['camera.ptz.control']); // Only control, not admin
    }).toThrow('PERMISSION_DENIED: Missing required permission camera.ptz.admin');
  });
});
