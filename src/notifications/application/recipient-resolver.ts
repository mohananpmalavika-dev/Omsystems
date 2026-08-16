/**
 * Enterprise Recipient Resolver
 * 
 * Deterministically resolves operational recipients (Branch Managers, Regional Security,
 * Active Shift Operators, On-Call Duty Officers) from contextual selectors with endpoint
 * verification, user deduplication, and channel unioning.
 */

import type {
  BranchNotificationReadiness,
  NotificationChannel,
  NotificationContext,
  RecipientReason,
  RecipientResolutionContext,
  RecipientResolutionRequest,
  RecipientResolutionResult,
  RecipientResolutionWarning,
  RecipientSelector,
  ResolvedRecipient,
} from "../domain/notification.types.js";
import {
  OrganizationalDirectoryService,
  organizationalDirectoryService,
} from "./organizational-directory.service.js";
import {
  UserDirectoryService,
  userDirectoryService,
} from "./user-directory.service.js";

interface IntermediateCandidate {
  userId: string;
  reasons: RecipientReason[];
  sourceAssignmentId?: string | undefined;
  priority: number;
}

export class RecipientResolver {
  constructor(
    private readonly orgDirectory: OrganizationalDirectoryService = organizationalDirectoryService,
    private readonly userDirectory: UserDirectoryService = userDirectoryService,
  ) {}

  async resolve(
    requestOrContext: RecipientResolutionRequest | NotificationContext,
    fallbackChannel?: NotificationChannel,
  ): Promise<ResolvedRecipient[]> {
    // 1. Adapter for simple NotificationContext calls
    if ("alertId" in requestOrContext && !("selectors" in requestOrContext)) {
      const context = requestOrContext as NotificationContext;
      const channel = fallbackChannel ?? "dashboard";

      const selectors: RecipientSelector[] = [];
      if (context.priority === "P1") {
        selectors.push(
          { type: "TENANT_ROLE", role: "HO_OPERATOR" },
          { type: "BRANCH_ROLE", role: "BRANCH_MANAGER" },
          { type: "REGION_ROLE", role: "REGIONAL_SECURITY_OFFICER" },
          { type: "ON_CALL", scheduleKey: "SURVEILLANCE_AFTER_HOURS" },
        );
      } else {
        selectors.push(
          { type: "TENANT_ROLE", role: "HO_OPERATOR" },
          { type: "BRANCH_ROLE", role: "BRANCH_MANAGER" },
        );
      }

      const res = await this.resolveComprehensive({
        context: {
          tenantId: context.tenantId,
          alertId: context.alertId,
          branchId: context.branchId,
          priority: context.priority,
          alertType: context.detectionType ?? "alert",
          occurredAt: context.occurredAt ?? new Date(),
          escalationLevel: 0,
        },
        selectors,
        requiredChannels: [channel],
      });

      return res.recipients;
    }

    // 2. Comprehensive resolution
    const res = await this.resolveComprehensive(requestOrContext as RecipientResolutionRequest);
    return res.recipients;
  }

  async resolveComprehensive(
    request: RecipientResolutionRequest,
  ): Promise<RecipientResolutionResult> {
    const { context, selectors, requiredChannels } = request;
    const candidates: IntermediateCandidate[] = [];
    const warnings: RecipientResolutionWarning[] = [];
    const evaluatedSelectors: RecipientResolutionResult["evaluatedSelectors"] = [];

    // Evaluate each selector
    for (const selector of selectors) {
      const initialCount = candidates.length;

      switch (selector.type) {
        case "USER": {
          candidates.push({
            userId: selector.userId,
            reasons: ["EXPLICIT_USER"],
            priority: 10,
          });
          break;
        }

        case "BRANCH_ROLE": {
          if (!context.branchId) {
            warnings.push({
              selector,
              code: "ROLE_UNASSIGNED",
              message: "No branchId provided in context for branch role resolution",
            });
            break;
          }
          const assignments = await this.orgDirectory.findRoleAssignments({
            tenantId: context.tenantId,
            roleKey: selector.role,
            scopeType: "BRANCH",
            scopeId: context.branchId,
            at: context.occurredAt,
          });
          if (!assignments.length) {
            warnings.push({
              selector,
              code: "ROLE_UNASSIGNED",
              message: `No active assignment for branch role ${selector.role} at branch ${context.branchId}`,
            });
          }
          for (const a of assignments) {
            candidates.push({
              userId: a.userId,
              reasons: ["BRANCH_MANAGER"],
              sourceAssignmentId: a.id,
              priority: 20,
            });
          }
          break;
        }

        case "REGION_ROLE": {
          const regionId = context.regionId ?? (context.branchId ? "region-thrissur" : undefined);
          if (!regionId) {
            warnings.push({
              selector,
              code: "ROLE_UNASSIGNED",
              message: "No regionId provided in context for regional role resolution",
            });
            break;
          }
          const assignments = await this.orgDirectory.findRoleAssignments({
            tenantId: context.tenantId,
            roleKey: selector.role,
            scopeType: "REGION",
            scopeId: regionId,
            at: context.occurredAt,
          });
          if (!assignments.length) {
            warnings.push({
              selector,
              code: "ROLE_UNASSIGNED",
              message: `No active assignment for regional role ${selector.role} in region ${regionId}`,
            });
          }
          for (const a of assignments) {
            candidates.push({
              userId: a.userId,
              reasons: ["REGIONAL_SECURITY"],
              sourceAssignmentId: a.id,
              priority: 30,
            });
          }
          break;
        }

        case "TENANT_ROLE": {
          if (selector.role === "HO_OPERATOR") {
            // Find active shift members
            const activeShiftMembers = await this.orgDirectory.findActiveShiftMembers({
              tenantId: context.tenantId,
              at: context.occurredAt,
            });
            if (!activeShiftMembers.length) {
              warnings.push({
                selector,
                code: "NO_ACTIVE_SHIFT_OPERATOR",
                message: "No active control room shift operator found for given timestamp",
              });
            }
            for (const sm of activeShiftMembers) {
              candidates.push({
                userId: sm.userId,
                reasons: ["HO_OPERATOR"],
                sourceAssignmentId: sm.id,
                priority: 5,
              });
            }
          } else {
            const assignments = await this.orgDirectory.findRoleAssignments({
              tenantId: context.tenantId,
              roleKey: selector.role,
              scopeType: "TENANT",
              at: context.occurredAt,
            });
            for (const a of assignments) {
              candidates.push({
                userId: a.userId,
                reasons: ["SURVEILLANCE_MANAGER"],
                sourceAssignmentId: a.id,
                priority: 15,
              });
            }
          }
          break;
        }

        case "ON_CALL": {
          const entry = await this.orgDirectory.findActiveOnCallEntry({
            tenantId: context.tenantId,
            scheduleKey: selector.scheduleKey,
            at: context.occurredAt,
          });
          if (!entry) {
            warnings.push({
              selector,
              code: "NO_ACTIVE_ON_CALL_MEMBER",
              message: `No active on-call duty member found for schedule ${selector.scheduleKey}`,
            });
          } else {
            candidates.push({
              userId: entry.userId,
              reasons: ["ON_CALL"],
              sourceAssignmentId: entry.id,
              priority: 25,
            });
          }
          break;
        }

        default:
          break;
      }

      evaluatedSelectors.push({
        selector,
        candidateCount: candidates.length - initialCount,
        resolvedCount: candidates.length - initialCount,
      });
    }

    // 2. User Deduplication with Reason & Source Aggregation
    const byUser = new Map<string, IntermediateCandidate>();
    for (const c of candidates) {
      const existing = byUser.get(c.userId);
      if (!existing) {
        byUser.set(c.userId, { ...c });
      } else {
        existing.reasons = Array.from(new Set([...existing.reasons, ...c.reasons]));
        if (c.sourceAssignmentId && !existing.sourceAssignmentId) {
          existing.sourceAssignmentId = c.sourceAssignmentId;
        }
        existing.priority = Math.min(existing.priority, c.priority);
      }
    }

    // 3. Endpoint Resolution & Verification Filtering
    const resolvedRecipients: ResolvedRecipient[] = [];
    const resolvedAt = new Date();

    for (const candidate of byUser.values()) {
      const profile = await this.userDirectory.getNotificationProfile(context.tenantId, candidate.userId);
      if (!profile) {
        warnings.push({
          userId: candidate.userId,
          selector: { type: "USER", userId: candidate.userId },
          code: "USER_NOT_FOUND",
          message: `User ${candidate.userId} not found in directory or disabled`,
        });
        continue;
      }

      const channels: ResolvedRecipient["channels"] = {};
      let endpointVerifiedAt: Date | undefined;

      // Dashboard channel
      if (requiredChannels.includes("dashboard")) {
        channels.dashboard = true;
      }

      // Email channel
      if (requiredChannels.includes("email")) {
        if (profile.email && profile.email.enabled && profile.email.verified) {
          channels.email = profile.email;
          endpointVerifiedAt = profile.email.verifiedAt;
        } else {
          warnings.push({
            userId: candidate.userId,
            selector: { type: "USER", userId: candidate.userId },
            code: "NO_EMAIL",
            message: `User ${profile.displayName} has no verified email endpoint`,
          });
        }
      }

      // SMS channel
      if (requiredChannels.includes("sms")) {
        if (profile.phone && profile.phone.enabled && profile.phone.verified) {
          channels.sms = profile.phone;
          endpointVerifiedAt = profile.phone.verifiedAt;
        } else {
          warnings.push({
            userId: candidate.userId,
            selector: { type: "USER", userId: candidate.userId },
            code: profile.phone ? "PHONE_UNVERIFIED" : "NO_PHONE",
            message: profile.phone
              ? `Phone for ${profile.displayName} is NOT verified (suppressed from P1 delivery)`
              : `User ${profile.displayName} has no phone endpoint`,
          });
        }
      }

      // Voice channel
      if (requiredChannels.includes("voice")) {
        if (profile.phone && profile.phone.enabled && profile.phone.verified) {
          channels.voice = profile.phone;
          endpointVerifiedAt = profile.phone.verifiedAt;
        } else if (!requiredChannels.includes("sms")) {
          // don't duplicate warning if already logged for SMS
          warnings.push({
            userId: candidate.userId,
            selector: { type: "USER", userId: candidate.userId },
            code: profile.phone ? "PHONE_UNVERIFIED" : "NO_PHONE",
            message: `Voice call suppressed: phone for ${profile.displayName} is unverified`,
          });
        }
      }

      // Push channel
      if (requiredChannels.includes("push")) {
        const activePush = profile.pushDevices.filter((d) => d.enabled && d.verified);
        if (activePush.length > 0) {
          channels.push = activePush;
        } else {
          warnings.push({
            userId: candidate.userId,
            selector: { type: "USER", userId: candidate.userId },
            code: "NO_PUSH_DEVICE",
            message: `User ${profile.displayName} has no active push devices`,
          });
        }
      }

      resolvedRecipients.push({
        tenantId: context.tenantId,
        userId: candidate.userId,
        displayName: profile.displayName,
        name: profile.displayName,
        email: profile.email?.value,
        mobile: profile.phone?.value,
        pushTokens: profile.pushDevices.map((d) => d.value),
        role: candidate.reasons[0],
        channels,
        reasons: candidate.reasons,
        sourceAssignments: candidate.sourceAssignmentId ? [candidate.sourceAssignmentId] : [],
        branchId: context.branchId,
        regionId: context.regionId,
        resolutionPriority: candidate.priority,
        resolvedAt,
        endpointVerifiedAt,
      });
    }

    return {
      recipients: resolvedRecipients,
      warnings,
      evaluatedSelectors,
      resolvedAt,
    };
  }

  async checkBranchReadiness(tenantId: string, branchId: string): Promise<BranchNotificationReadiness> {
    const res = await this.resolveComprehensive({
      context: {
        tenantId,
        alertId: "preflight-check",
        branchId,
        priority: "P1",
        alertType: "readiness_preflight",
        occurredAt: new Date(),
        escalationLevel: 0,
      },
      selectors: [
        { type: "TENANT_ROLE", role: "HO_OPERATOR" },
        { type: "BRANCH_ROLE", role: "BRANCH_MANAGER" },
        { type: "REGION_ROLE", role: "REGIONAL_SECURITY_OFFICER" },
        { type: "ON_CALL", scheduleKey: "SURVEILLANCE_AFTER_HOURS" },
      ],
      requiredChannels: ["dashboard", "sms", "email", "voice"],
    });

    const hasManager = res.recipients.some((r) => r.reasons.includes("BRANCH_MANAGER"));
    const hasRegional = res.recipients.some((r) => r.reasons.includes("REGIONAL_SECURITY"));
    const hasHo = res.recipients.some((r) => r.reasons.includes("HO_OPERATOR"));
    const hasOnCall = res.recipients.some((r) => r.reasons.includes("ON_CALL"));

    const hasSms = res.recipients.some((r) => !!r.channels.sms);
    const hasVoice = res.recipients.some((r) => !!r.channels.voice);
    const hasEmail = res.recipients.some((r) => !!r.channels.email);

    const ready = hasManager && hasRegional && hasHo && hasSms && hasVoice;

    return {
      branchId,
      branchName: `Branch ${branchId}`,
      ready,
      priority: "P1",
      recipientSelectors: [
        {
          role: "BRANCH_MANAGER",
          resolved: hasManager,
          userIds: res.recipients.filter((r) => r.reasons.includes("BRANCH_MANAGER")).map((r) => r.userId),
          phoneVerified: res.recipients.some((r) => r.reasons.includes("BRANCH_MANAGER") && (!!r.channels.sms || !!r.channels.voice)),
        },
        {
          role: "REGIONAL_SECURITY_OFFICER",
          resolved: hasRegional,
          userIds: res.recipients.filter((r) => r.reasons.includes("REGIONAL_SECURITY")).map((r) => r.userId),
          phoneVerified: res.recipients.some((r) => r.reasons.includes("REGIONAL_SECURITY") && (!!r.channels.sms || !!r.channels.voice)),
        },
        {
          role: "HO_OPERATOR",
          resolved: hasHo,
          userIds: res.recipients.filter((r) => r.reasons.includes("HO_OPERATOR")).map((r) => r.userId),
          phoneVerified: res.recipients.some((r) => r.reasons.includes("HO_OPERATOR") && (!!r.channels.sms || !!r.channels.voice)),
        },
        {
          role: "AFTER_HOURS_DUTY",
          resolved: hasOnCall,
          userIds: res.recipients.filter((r) => r.reasons.includes("ON_CALL")).map((r) => r.userId),
          phoneVerified: res.recipients.some((r) => r.reasons.includes("ON_CALL") && (!!r.channels.sms || !!r.channels.voice)),
        },
      ],
      channels: {
        sms: hasSms,
        voice: hasVoice,
        email: hasEmail,
        dashboard: true,
      },
      warnings: res.warnings.map((w) => w.message),
    };
  }
}

export const recipientResolver = new RecipientResolver();
