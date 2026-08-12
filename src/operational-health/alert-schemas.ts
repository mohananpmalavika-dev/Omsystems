/**
 * Strict Zod schemas for operational alert action requests
 * 
 * SECURITY: These schemas explicitly reject client-supplied identity fields.
 * Actor identity (userId, assignedBy, resolvedBy, etc.) is derived server-side
 * from authenticated request context.
 */

import { z } from "zod";

/**
 * Alert resolution codes
 */
export const AlertResolutionCodeSchema = z.enum([
  "TRUE_POSITIVE_RESOLVED",
  "FALSE_POSITIVE",
  "DUPLICATE",
  "EXPECTED_ACTIVITY",
  "MAINTENANCE_SCHEDULED",
  "OTHER",
]);

export type AlertResolutionCode = z.infer<typeof AlertResolutionCodeSchema>;

/**
 * Acknowledge alert request
 * 
 * Client sends: (empty body or optional comment)
 * Server derives: acknowledgedBy, acknowledgedAt, tenantId
 */
export const AcknowledgeAlertRequestSchema = z.object({
  comment: z
    .string()
    .trim()
    .max(2000)
    .optional(),
}).strict(); // .strict() rejects unknown properties like userId

export type AcknowledgeAlertRequest = z.infer<typeof AcknowledgeAlertRequestSchema>;

/**
 * Assign alert request
 * 
 * Client sends: assignedTo (target user), optional note
 * Server derives: assignedBy, assignedAt, tenantId
 * 
 * IMPORTANT: assignedTo is legitimate client input (operator chooses WHO)
 *            assignedBy is NOT (server determines WHO ASSIGNED)
 */
export const AssignAlertRequestSchema = z.object({
  assignedTo: z
    .string()
    .uuid("assignedTo must be a valid user ID"),
  
  note: z
    .string()
    .trim()
    .max(2000)
    .optional(),
}).strict();

export type AssignAlertRequest = z.infer<typeof AssignAlertRequestSchema>;

/**
 * Resolve alert request
 * 
 * Client sends: resolutionCode, optional comment
 * Server derives: resolvedBy, resolvedAt, tenantId
 */
export const ResolveAlertRequestSchema = z.object({
  resolutionCode: AlertResolutionCodeSchema,
  
  comment: z
    .string()
    .trim()
    .max(2000)
    .optional(),
})
  .strict()
  // Enforce comment when resolution is OTHER
  .refine(
    (data) => data.resolutionCode !== "OTHER" || Boolean(data.comment),
    {
      message: "Comment is required when resolution code is OTHER",
      path: ["comment"],
    }
  );

export type ResolveAlertRequest = z.infer<typeof ResolveAlertRequestSchema>;

/**
 * Escalate alert request
 */
export const EscalateAlertRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Escalation reason must be at least 10 characters")
    .max(2000),
  
  recipients: z
    .array(z.string().uuid())
    .min(1, "At least one recipient is required")
    .max(10, "Maximum 10 recipients allowed"),
}).strict();

export type EscalateAlertRequest = z.infer<typeof EscalateAlertRequestSchema>;

/**
 * Suppress alert request
 */
export const SuppressAlertRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Suppression reason must be at least 10 characters")
    .max(2000),
  
  suppressUntil: z
    .string()
    .datetime()
    .optional(),
}).strict();

export type SuppressAlertRequest = z.infer<typeof SuppressAlertRequestSchema>;

/**
 * Add comment to alert
 */
export const AddAlertCommentRequestSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(2000),
}).strict();

export type AddAlertCommentRequest = z.infer<typeof AddAlertCommentRequestSchema>;

/**
 * Alert status transition validation
 * 
 * Defines valid state machine transitions
 */
export const ALERT_STATUS_TRANSITIONS = {
  active: ["acknowledged", "assigned", "resolved", "suppressed"],
  acknowledged: ["assigned", "resolved", "suppressed"],
  assigned: ["acknowledged", "resolved", "suppressed"],
  resolved: ["reopened"],
  suppressed: ["active"],
  reopened: ["acknowledged", "assigned", "resolved"],
} as const;

export type AlertStatus = keyof typeof ALERT_STATUS_TRANSITIONS;

/**
 * Validate state transition
 */
export function isValidAlertTransition(
  from: AlertStatus,
  to: AlertStatus
): boolean {
  const validTransitions: readonly AlertStatus[] = ALERT_STATUS_TRANSITIONS[from] ?? [];
  return validTransitions.includes(to);
}

/**
 * Actor context (populated server-side from request.currentUser)
 * 
 * This is NOT a request schema - it's an internal type for passing
 * authenticated actor information through the service layer.
 */
export interface ActorContext {
  type: "USER" | "SYSTEM" | "AUTOMATION";
  userId?: string;
  userName?: string;
  tenantId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
}

/**
 * Alert event for audit log
 */
export interface AlertEvent {
  alertId: string;
  tenantId: string;
  branchId?: string;
  eventType:
    | "ALERT_CREATED"
    | "ALERT_ACKNOWLEDGED"
    | "ALERT_ASSIGNED"
    | "ALERT_REASSIGNED"
    | "ALERT_ESCALATED"
    | "ALERT_COMMENTED"
    | "ALERT_RESOLVED"
    | "ALERT_REOPENED"
    | "ALERT_SUPPRESSED"
    | "ALERT_AUTO_RESOLVED";
  actor: ActorContext;
  targetUserId?: string;
  targetUserName?: string;
  previousStatus?: string;
  newStatus?: string;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}
