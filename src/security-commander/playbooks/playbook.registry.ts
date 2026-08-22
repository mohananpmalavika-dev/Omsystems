/**
 * Playbook Registry
 * 
 * Predefined playbooks for common security incident types.
 */

import type { Playbook } from './playbook.types.js';

export const PLAYBOOK_REGISTRY: Playbook[] = [
  // ========================================================================
  // UNAUTHORIZED ENTRY PLAYBOOK
  // ========================================================================
  {
    id: 'unauthorized-entry',
    name: 'Unauthorized Entry Response',
    description: 'Response workflow for confirmed or suspected unauthorized physical entry',
    incidentType: 'security.unauthorized_entry',
    minSeverity: 'high',
    version: '1.0',
    active: true,
    actions: [
      {
        id: 'preserve-evidence',
        order: 1,
        title: 'Preserve Video Evidence',
        description: 'Export and secure all camera footage related to the incident. Create SHA256 hashes for integrity verification.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 5,
      },
      {
        id: 'verify-access-logs',
        order: 2,
        title: 'Verify Access Control Logs',
        description: 'Review complete access control records for the affected entry point during the incident timeframe.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 10,
      },
      {
        id: 'notify-security',
        order: 3,
        title: 'Notify Local Security Personnel',
        description: 'Alert on-site security team immediately for physical verification and containment.',
        required: true,
        category: 'notification',
        estimatedMinutes: 2,
        requiredPermissions: ['security.notify'],
      },
      {
        id: 'physical-inspection',
        order: 4,
        title: 'Physical Inspection of Entry Point',
        description: 'Conduct physical inspection of the affected door/entry point to verify condition and assess damage.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 15,
        dependsOn: ['notify-security'],
      },
      {
        id: 'verify-badge',
        order: 5,
        title: 'Verify Badge/Credential Status',
        description: 'Check the status and history of any badges/credentials involved in the incident.',
        required: false,
        category: 'investigation',
        estimatedMinutes: 5,
      },
      {
        id: 'check-adjacent-cameras',
        order: 6,
        title: 'Review Adjacent Camera Footage',
        description: 'Check footage from cameras covering adjacent areas for additional context.',
        required: false,
        category: 'investigation',
        estimatedMinutes: 15,
      },
      {
        id: 'lock-credentials',
        order: 7,
        title: 'Suspend Suspicious Credentials',
        description: 'Temporarily disable any credentials that may have been compromised.',
        required: false,
        category: 'containment',
        estimatedMinutes: 2,
        requiredPermissions: ['access.manage'],
      },
      {
        id: 'notify-management',
        order: 8,
        title: 'Notify Management',
        description: 'Alert appropriate management personnel of the security breach.',
        required: true,
        category: 'notification',
        estimatedMinutes: 5,
      },
      {
        id: 'incident-report',
        order: 9,
        title: 'Create Incident Report',
        description: 'Document complete incident details including timeline, evidence, and response actions.',
        required: true,
        category: 'documentation',
        estimatedMinutes: 30,
      },
    ],
    notifications: [
      {
        severity: 'critical',
        recipients: ['security-team', 'management'],
        channels: ['email', 'sms', 'push'],
      },
    ],
    sla: {
      acknowledgmentMinutes: 5,
      responseMinutes: 15,
      resolutionMinutes: 120,
    },
  },

  // ========================================================================
  // FIRE SAFETY PLAYBOOK
  // ========================================================================
  {
    id: 'fire-safety',
    name: 'Fire/Smoke Detection Response',
    description: 'Emergency response workflow for fire or smoke detection',
    incidentType: 'safety.fire_alarm',
    minSeverity: 'critical',
    version: '1.0',
    active: true,
    actions: [
      {
        id: 'initiate-evacuation',
        order: 1,
        title: 'Initiate Evacuation Procedures',
        description: 'IMMEDIATE: Activate building evacuation procedures and alarm systems.',
        required: true,
        category: 'containment',
        estimatedMinutes: 2,
        requiredPermissions: ['emergency.evacuate'],
      },
      {
        id: 'contact-fire-department',
        order: 2,
        title: 'Contact Fire Department',
        description: 'IMMEDIATE: Call emergency services (911) to report fire.',
        required: true,
        category: 'notification',
        estimatedMinutes: 2,
      },
      {
        id: 'verify-detection',
        order: 3,
        title: 'Verify Fire Detection',
        description: 'Review camera footage to confirm fire/smoke and determine exact location.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 3,
      },
      {
        id: 'shutdown-hvac',
        order: 4,
        title: 'Shutdown HVAC Systems',
        description: 'Shut down HVAC to prevent smoke spread through ventilation.',
        required: true,
        category: 'containment',
        estimatedMinutes: 2,
        requiredPermissions: ['building.hvac'],
      },
      {
        id: 'unlock-exits',
        order: 5,
        title: 'Unlock Emergency Exits',
        description: 'Ensure all emergency exits are unlocked for evacuation.',
        required: true,
        category: 'containment',
        estimatedMinutes: 1,
        requiredPermissions: ['access.emergency'],
        automatedAction: {
          type: 'api',
          command: '/api/access/emergency-unlock',
          parameters: { reason: 'fire-evacuation' },
        },
      },
      {
        id: 'preserve-fire-evidence',
        order: 6,
        title: 'Preserve Fire Detection Evidence',
        description: 'Export camera footage showing fire detection for investigation.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 5,
        dependsOn: ['verify-detection'],
      },
      {
        id: 'account-personnel',
        order: 7,
        title: 'Account for Personnel',
        description: 'Verify all personnel have evacuated safely using badge out data.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 10,
      },
      {
        id: 'post-incident-assessment',
        order: 8,
        title: 'Post-Incident Assessment',
        description: 'After fire department clearance, assess damage and document incident.',
        required: true,
        category: 'documentation',
        estimatedMinutes: 60,
      },
    ],
    notifications: [
      {
        severity: 'critical',
        recipients: ['all-personnel', 'emergency-contacts', 'management'],
        channels: ['sms', 'push'],
      },
    ],
    sla: {
      acknowledgmentMinutes: 1,
      responseMinutes: 2,
      resolutionMinutes: 240,
    },
  },

  // ========================================================================
  // NETWORK CASCADE FAILURE PLAYBOOK
  // ========================================================================
  {
    id: 'network-cascade',
    name: 'Network Infrastructure Failure Response',
    description: 'Response workflow for network failures affecting multiple devices',
    incidentType: 'infrastructure.network_cascade',
    minSeverity: 'high',
    version: '1.0',
    active: true,
    actions: [
      {
        id: 'identify-root-cause',
        order: 1,
        title: 'Identify Root Cause',
        description: 'Determine which network device or link caused the cascade failure.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 5,
      },
      {
        id: 'verify-switch-status',
        order: 2,
        title: 'Verify Network Switch Status',
        description: 'Check physical and operational status of network switches.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 10,
      },
      {
        id: 'check-power',
        order: 3,
        title: 'Verify Power Supply',
        description: 'Confirm power supply to network equipment is functioning.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 5,
      },
      {
        id: 'restart-switch',
        order: 4,
        title: 'Restart Failed Network Device',
        description: 'Attempt to restore service by restarting the failed network device.',
        required: false,
        category: 'remediation',
        estimatedMinutes: 5,
        dependsOn: ['identify-root-cause', 'check-power'],
      },
      {
        id: 'verify-camera-recovery',
        order: 5,
        title: 'Verify Camera Connectivity',
        description: 'Confirm affected cameras have restored connectivity.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 10,
        dependsOn: ['restart-switch'],
      },
      {
        id: 'check-recordings',
        order: 6,
        title: 'Verify Recording Continuity',
        description: 'Check that video recording resumed on all affected cameras.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 10,
      },
      {
        id: 'escalate-it',
        order: 7,
        title: 'Escalate to IT/Network Team',
        description: 'Notify IT team if issue persists or requires hardware replacement.',
        required: false,
        category: 'notification',
        estimatedMinutes: 5,
      },
      {
        id: 'document-outage',
        order: 8,
        title: 'Document Network Outage',
        description: 'Record outage duration, affected devices, and resolution steps.',
        required: true,
        category: 'documentation',
        estimatedMinutes: 15,
      },
    ],
    notifications: [
      {
        severity: 'high',
        recipients: ['it-team', 'security-team'],
        channels: ['email', 'push'],
      },
    ],
    sla: {
      acknowledgmentMinutes: 10,
      responseMinutes: 30,
      resolutionMinutes: 120,
    },
  },

  // ========================================================================
  // CAMERA TAMPERING PLAYBOOK
  // ========================================================================
  {
    id: 'camera-tampering',
    name: 'Camera Tampering Response',
    description: 'Response workflow for camera tampering incidents',
    incidentType: 'infrastructure.camera_tampering',
    minSeverity: 'high',
    version: '1.0',
    active: true,
    actions: [
      {
        id: 'preserve-tamper-evidence',
        order: 1,
        title: 'Preserve Tampering Evidence',
        description: 'Export footage from the tampered camera and adjacent cameras.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 5,
      },
      {
        id: 'check-adjacent-footage',
        order: 2,
        title: 'Review Adjacent Camera Footage',
        description: 'Check footage from nearby cameras for suspicious activity.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 15,
      },
      {
        id: 'physical-camera-inspection',
        order: 3,
        title: 'Physical Camera Inspection',
        description: 'Inspect tampered camera for physical damage or interference.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 20,
      },
      {
        id: 'restore-camera',
        order: 4,
        title: 'Restore Camera Operation',
        description: 'Reposition camera and restore normal operation if possible.',
        required: true,
        category: 'remediation',
        estimatedMinutes: 15,
        dependsOn: ['physical-camera-inspection'],
      },
      {
        id: 'verify-recording',
        order: 5,
        title: 'Verify Recording Resumed',
        description: 'Confirm camera is recording properly after restoration.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 5,
        dependsOn: ['restore-camera'],
      },
      {
        id: 'investigate-motive',
        order: 6,
        title: 'Investigate Tampering Motive',
        description: 'Analyze whether tampering was part of broader security incident.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 30,
      },
      {
        id: 'notify-security-tamper',
        order: 7,
        title: 'Notify Security Team',
        description: 'Alert security personnel of tampering incident.',
        required: true,
        category: 'notification',
        estimatedMinutes: 5,
      },
      {
        id: 'document-tampering',
        order: 8,
        title: 'Document Tampering Incident',
        description: 'Create comprehensive report of tampering incident.',
        required: true,
        category: 'documentation',
        estimatedMinutes: 20,
      },
    ],
    notifications: [
      {
        severity: 'high',
        recipients: ['security-team', 'management'],
        channels: ['email', 'push'],
      },
    ],
    sla: {
      acknowledgmentMinutes: 10,
      responseMinutes: 30,
      resolutionMinutes: 180,
    },
  },

  // ========================================================================
  // AFTER-HOURS ACTIVITY PLAYBOOK
  // ========================================================================
  {
    id: 'after-hours-activity',
    name: 'After-Hours Activity Response',
    description: 'Response workflow for unexpected activity outside business hours',
    incidentType: 'security.after_hours_activity',
    minSeverity: 'medium',
    version: '1.0',
    active: true,
    actions: [
      {
        id: 'review-footage',
        order: 1,
        title: 'Review Detection Footage',
        description: 'Review camera footage to identify persons and activities.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 10,
      },
      {
        id: 'check-authorization',
        order: 2,
        title: 'Check Authorization',
        description: 'Verify if detected personnel have after-hours authorization.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 5,
      },
      {
        id: 'verify-access-records',
        order: 3,
        title: 'Verify Access Records',
        description: 'Check access control logs to see how entry was gained.',
        required: true,
        category: 'investigation',
        estimatedMinutes: 5,
      },
      {
        id: 'contact-personnel',
        order: 4,
        title: 'Contact Detected Personnel',
        description: 'If identified, contact personnel to verify legitimacy of presence.',
        required: false,
        category: 'investigation',
        estimatedMinutes: 10,
      },
      {
        id: 'escalate-unauthorized',
        order: 5,
        title: 'Escalate if Unauthorized',
        description: 'If activity is unauthorized, escalate to security team.',
        required: false,
        category: 'notification',
        estimatedMinutes: 5,
      },
      {
        id: 'document-activity',
        order: 6,
        title: 'Document After-Hours Activity',
        description: 'Record incident details and determination of legitimacy.',
        required: true,
        category: 'documentation',
        estimatedMinutes: 15,
      },
    ],
    notifications: [
      {
        severity: 'medium',
        recipients: ['security-team'],
        channels: ['email'],
      },
    ],
    sla: {
      acknowledgmentMinutes: 30,
      responseMinutes: 60,
      resolutionMinutes: 240,
    },
  },
];

/**
 * Get playbook for incident type
 */
export function getPlaybookForIncident(incidentType: string, severity?: string): Playbook | undefined {
  return PLAYBOOK_REGISTRY.find(
    playbook =>
      playbook.active &&
      playbook.incidentType === incidentType &&
      (!playbook.minSeverity || !severity || compareSeverity(severity, playbook.minSeverity) >= 0)
  );
}

/**
 * Get all active playbooks
 */
export function getActivePlaybooks(): Playbook[] {
  return PLAYBOOK_REGISTRY.filter(p => p.active);
}

/**
 * Get playbook by ID
 */
export function getPlaybook(id: string): Playbook | undefined {
  return PLAYBOOK_REGISTRY.find(p => p.id === id);
}

/**
 * Compare severity levels
 */
function compareSeverity(a: string, b: string): number {
  const order: Record<string, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  return (order[a] || 0) - (order[b] || 0);
}
