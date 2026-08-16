/**
 * Notification Policy Engine
 * 
 * Determines notification channels, repeat intervals, and escalation rules
 * based on alert priority and hierarchical scope overrides.
 */

import type {
  NotificationPriority,
  NotificationPolicy,
  NotificationContext,
  ScopedNotificationPolicyAssignment,
} from "../domain/notification.types.js";

export const DEFAULT_NOTIFICATION_POLICIES: Record<NotificationPriority, NotificationPolicy> = {
  P1: {
    priority: "P1",
    channels: ["dashboard", "sms", "email", "voice"],
    repeat: {
      enabled: true,
      intervalSeconds: 15,
    },
    escalation: {
      acknowledgeWithinSeconds: 120,
      escalateToLevel: 2,
    },
  },
  P2: {
    priority: "P2",
    channels: ["dashboard", "email"],
    repeat: {
      enabled: true,
      intervalSeconds: 60,
      maximumAttempts: 5,
    },
    escalation: {
      acknowledgeWithinSeconds: 300,
      escalateToLevel: 2,
    },
  },
  P3: {
    priority: "P3",
    channels: ["dashboard"],
    repeat: {
      enabled: false,
      intervalSeconds: 0,
      maximumAttempts: 1,
    },
  },
  P4: {
    priority: "P4",
    channels: ["system_log"],
    repeat: {
      enabled: false,
      intervalSeconds: 0,
      maximumAttempts: 1,
    },
  },
};

export class NotificationPolicyEngine {
  private assignments: ScopedNotificationPolicyAssignment[] = [];

  registerAssignment(assignment: ScopedNotificationPolicyAssignment) {
    this.assignments.push(assignment);
    this.assignments.sort((a, b) => b.priorityRank - a.priorityRank);
  }

  evaluate(context: NotificationContext): NotificationPolicy {
    const basePolicy = DEFAULT_NOTIFICATION_POLICIES[context.priority];

    // Check for scoped overrides in order of highest priority rank
    for (const assignment of this.assignments) {
      if (assignment.tenantId === context.tenantId && assignment.priority === context.priority) {
        if (assignment.scopeType === "ALERT_TYPE" && assignment.scopeId === context.detectionType) {
          return { ...basePolicy, channels: assignment.channels };
        }
        if (assignment.scopeType === "BRANCH" && assignment.scopeId === context.branchId) {
          return { ...basePolicy, channels: assignment.channels };
        }
        if (assignment.scopeType === "TENANT" && assignment.scopeId === context.tenantId) {
          return { ...basePolicy, channels: assignment.channels };
        }
      }
    }

    return basePolicy;
  }
}

export const notificationPolicyEngine = new NotificationPolicyEngine();
