/**
 * Notification Policy Engine Service
 * 
 * Core service for policy matching, severity routing, quiet hours evaluation,
 * and recipient resolution.
 */

import type {
  NotificationPolicy,
  NotificationRule,
  EscalationPolicy,
  PolicyMatchCriteria,
  PolicyMatchResult,
  NotificationContext,
  AlertSeverity,
  QuietHoursConfig,
  RecipientGroup,
  RecipientMember,
  NotificationChannel,
} from '../domain/notification.types.js';
import { logger } from '../../utils/logger.js';

export class NotificationPolicyEngine {
  /**
   * Find the most specific matching policy for the given criteria
   */
  async matchPolicy(
    policies: NotificationPolicy[],
    criteria: PolicyMatchCriteria
  ): Promise<PolicyMatchResult> {
    // Filter published policies only
    const publishedPolicies = policies.filter(p => p.status === 'PUBLISHED');

    if (publishedPolicies.length === 0) {
      return {
        matched: false,
        shouldNotify: false,
        inQuietHours: false,
        reason: 'No published policies found',
      };
    }

    // Score policies by specificity
    const scoredPolicies = publishedPolicies.map(policy => ({
      policy,
      score: this.calculatePolicySpecificity(policy, criteria),
    }));

    // Sort by score descending (most specific first)
    scoredPolicies.sort((a, b) => b.score - a.score);

    // Take the most specific policy that matches
    const bestMatch = scoredPolicies.find(({ policy, score }) => 
      score > 0 && this.policyMatches(policy, criteria)
    );

    if (!bestMatch) {
      return {
        matched: false,
        shouldNotify: false,
        inQuietHours: false,
        reason: 'No matching policy found for criteria',
      };
    }

    const { policy } = bestMatch;
    const rule = this.getRuleForSeverity(policy, criteria.severity);
    const escalationPolicy = this.getEscalationForSeverity(policy, criteria.severity);

    // Check quiet hours
    const inQuietHours = policy.quietHours?.enabled
      ? this.isInQuietHours(policy.quietHours, criteria.severity, new Date())
      : false;

    // Determine if should notify
    const shouldNotify = this.shouldNotifyDespiteQuietHours(
      rule,
      inQuietHours,
      criteria.severity,
      policy.quietHours
    );

    return {
      matched: true,
      policy,
      rule,
      escalationPolicy,
      inQuietHours,
      shouldNotify,
      reason: shouldNotify ? 'Policy matched successfully' : 'Suppressed by quiet hours',
    };
  }

  /**
   * Calculate policy specificity score
   * Higher score = more specific policy
   */
  private calculatePolicySpecificity(
    policy: NotificationPolicy,
    criteria: PolicyMatchCriteria
  ): number {
    let score = 0;

    const { scope } = policy;

    // Exact matches get highest scores
    if (scope.type === 'ALERT_TYPE' && scope.alertTypes?.includes(criteria.alertType || '')) {
      score += 1000;
    }

    if (scope.type === 'CAMERA' && scope.cameraIds?.includes(criteria.cameraId || '')) {
      score += 900;
    }

    if (scope.type === 'DEVICE' && scope.deviceIds?.includes(criteria.deviceId || '')) {
      score += 800;
    }

    if (scope.type === 'BRANCH' && scope.branchIds?.includes(criteria.branchId || '')) {
      score += 700;
    }

    if (scope.type === 'REGION' && scope.regionIds?.includes(criteria.regionId || '')) {
      score += 600;
    }

    // Array-based scopes
    if (scope.alertTypes && scope.alertTypes.includes(criteria.alertType || '')) {
      score += 500;
    }

    if (scope.cameraIds && scope.cameraIds.includes(criteria.cameraId || '')) {
      score += 400;
    }

    if (scope.deviceIds && scope.deviceIds.includes(criteria.deviceId || '')) {
      score += 300;
    }

    if (scope.branchIds && scope.branchIds.includes(criteria.branchId || '')) {
      score += 200;
    }

    if (scope.regionIds && scope.regionIds.includes(criteria.regionId || '')) {
      score += 100;
    }

    // Tenant-wide policy gets base score
    if (scope.type === 'TENANT') {
      score += 10;
    }

    return score;
  }

  /**
   * Check if policy matches the criteria
   */
  private policyMatches(
    policy: NotificationPolicy,
    criteria: PolicyMatchCriteria
  ): boolean {
    const { scope } = policy;

    // Tenant must match
    if (policy.tenantId !== criteria.tenantId) {
      return false;
    }

    // Check scope-specific matching
    switch (scope.type) {
      case 'ALERT_TYPE':
        return scope.alertTypes?.includes(criteria.alertType || '') ?? false;

      case 'CAMERA':
        return scope.cameraIds?.includes(criteria.cameraId || '') ?? false;

      case 'DEVICE':
        return scope.deviceIds?.includes(criteria.deviceId || '') ?? false;

      case 'BRANCH':
        return scope.branchIds?.includes(criteria.branchId || '') ?? false;

      case 'REGION':
        return scope.regionIds?.includes(criteria.regionId || '') ?? false;

      case 'TENANT':
        // Tenant-wide policy matches everything for this tenant
        return true;

      default:
        return false;
    }
  }

  /**
   * Get notification rule for severity
   */
  private getRuleForSeverity(
    policy: NotificationPolicy,
    severity: AlertSeverity
  ): NotificationRule {
    switch (severity) {
      case 'P1':
        return policy.p1Rule;
      case 'P2':
        return policy.p2Rule;
      case 'P3':
        return policy.p3Rule;
      case 'P4':
        return policy.p4Rule;
      case 'P5':
        return policy.p5Rule;
      default:
        return policy.p3Rule; // Default to P3
    }
  }

  /**
   * Get escalation policy for severity
   */
  private getEscalationForSeverity(
    policy: NotificationPolicy,
    severity: AlertSeverity
  ): EscalationPolicy | undefined {
    switch (severity) {
      case 'P1':
        return policy.p1Escalation;
      case 'P2':
        return policy.p2Escalation;
      case 'P3':
        return policy.p3Escalation;
      case 'P4':
        return policy.p4Escalation;
      case 'P5':
        return policy.p5Escalation;
      default:
        return undefined;
    }
  }

  /**
   * Check if current time is in quiet hours
   */
  isInQuietHours(
    quietHours: QuietHoursConfig,
    severity: AlertSeverity,
    timestamp: Date
  ): boolean {
    if (!quietHours.enabled) {
      return false;
    }

    // Bypass for critical severities
    if (quietHours.bypassSeverities.includes(severity)) {
      return false;
    }

    try {
      // Convert timestamp to the configured timezone
      const localTime = new Date(timestamp.toLocaleString('en-US', {
        timeZone: quietHours.timezone,
      }));

      const hours = localTime.getHours();
      const minutes = localTime.getMinutes();
      const currentTimeMinutes = hours * 60 + minutes;

      // Parse start and end times
      const [startHours, startMinutes] = quietHours.start.split(':').map(Number);
      const [endHours, endMinutes] = quietHours.end.split(':').map(Number);

      const startTimeMinutes = startHours * 60 + startMinutes;
      const endTimeMinutes = endHours * 60 + endMinutes;

      // Handle quiet hours crossing midnight
      if (startTimeMinutes <= endTimeMinutes) {
        // Normal case: 22:00 to 23:00
        return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
      } else {
        // Crosses midnight: 22:00 to 06:00
        return currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
      }
    } catch (error) {
      logger.error('Error checking quiet hours', {
        error: error instanceof Error ? error.message : String(error),
        quietHours,
        timestamp,
      });
      return false;
    }
  }

  /**
   * Determine if notification should be sent despite quiet hours
   */
  private shouldNotifyDespiteQuietHours(
    rule: NotificationRule,
    inQuietHours: boolean,
    severity: AlertSeverity,
    quietHours?: QuietHoursConfig
  ): boolean {
    // Not in quiet hours, always notify
    if (!inQuietHours) {
      return true;
    }

    // No rule or no channels, don't notify
    if (!rule || rule.channels.length === 0) {
      return false;
    }

    // Check if severity bypasses quiet hours
    if (quietHours?.bypassSeverities.includes(severity)) {
      return true;
    }

    // During quiet hours, only dashboard notifications are allowed (unless bypassed)
    // Other channels are suppressed
    return false;
  }

  /**
   * Filter channels based on quiet hours
   */
  filterChannelsByQuietHours(
    channels: NotificationChannel[],
    inQuietHours: boolean,
    severity: AlertSeverity,
    quietHours?: QuietHoursConfig
  ): NotificationChannel[] {
    // Not in quiet hours, return all channels
    if (!inQuietHours) {
      return channels;
    }

    // Check bypass
    if (quietHours?.bypassSeverities.includes(severity)) {
      return channels;
    }

    // During quiet hours, only dashboard notifications
    return channels.filter(ch => ch === 'dashboard');
  }

  /**
   * Resolve recipients from recipient groups
   */
  async resolveRecipients(
    recipientGroups: RecipientGroup[],
    channels: NotificationChannel[]
  ): Promise<Map<NotificationChannel, RecipientMember[]>> {
    const recipientsByChannel = new Map<NotificationChannel, RecipientMember[]>();

    // Initialize map
    for (const channel of channels) {
      recipientsByChannel.set(channel, []);
    }

    // Collect all members from all groups
    const allMembers: RecipientMember[] = [];
    for (const group of recipientGroups) {
      if (group.members) {
        allMembers.push(...group.members.filter(m => m.enabled));
      }
    }

    // Deduplicate by ID
    const uniqueMembers = Array.from(
      new Map(allMembers.map(m => [m.id, m])).values()
    );

    // Route members to appropriate channels based on their contact info
    for (const member of uniqueMembers) {
      for (const channel of channels) {
        switch (channel) {
          case 'email':
            if (member.email) {
              recipientsByChannel.get(channel)?.push(member);
            }
            break;

          case 'sms':
            if (member.phone) {
              recipientsByChannel.get(channel)?.push(member);
            }
            break;

          case 'voice':
            if (member.voiceNumber || member.phone) {
              recipientsByChannel.get(channel)?.push(member);
            }
            break;

          case 'push':
          case 'dashboard':
            // These channels don't require specific contact info
            // They use userId for routing
            if (member.userId) {
              recipientsByChannel.get(channel)?.push(member);
            }
            break;

          case 'webhook':
            // Webhooks don't have individual recipients
            // They're handled separately
            break;
        }
      }
    }

    return recipientsByChannel;
  }

  /**
   * Generate deduplication key for notification
   */
  generateDedupKey(
    tenantId: string,
    incidentId: string | undefined,
    policyId: string | undefined,
    escalationStep: number,
    channel: NotificationChannel,
    recipientDestination: string
  ): string {
    return [
      tenantId,
      incidentId || 'null',
      policyId || 'null',
      escalationStep,
      channel,
      recipientDestination,
    ].join(':');
  }

  /**
   * Validate notification policy
   */
  validatePolicy(policy: Partial<NotificationPolicy>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate quiet hours
    if (policy.quietHours?.enabled) {
      if (!policy.quietHours.start || !policy.quietHours.end) {
        errors.push('Quiet hours start and end times are required');
      }

      if (!policy.quietHours.timezone) {
        errors.push('Quiet hours timezone is required');
      }

      // Validate timezone format
      try {
        Intl.DateTimeFormat(undefined, { timeZone: policy.quietHours.timezone });
      } catch {
        errors.push(`Invalid timezone: ${policy.quietHours.timezone}`);
      }

      // Validate time format (HH:mm)
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (policy.quietHours.start && !timeRegex.test(policy.quietHours.start)) {
        errors.push(`Invalid start time format: ${policy.quietHours.start}. Expected HH:mm`);
      }
      if (policy.quietHours.end && !timeRegex.test(policy.quietHours.end)) {
        errors.push(`Invalid end time format: ${policy.quietHours.end}. Expected HH:mm`);
      }
    }

    // Validate rate limits
    if (policy.rateLimits) {
      if (policy.rateLimits.perMinute < 1) {
        errors.push('Rate limit per minute must be at least 1');
      }
      if (policy.rateLimits.perMinute > 10000) {
        errors.push('Rate limit per minute cannot exceed 10000');
      }
      if (policy.rateLimits.perRecipientPerMinute < 1) {
        errors.push('Per-recipient rate limit must be at least 1');
      }
    }

    // Validate escalation policies
    const escalationPolicies = [
      { name: 'P1', policy: policy.p1Escalation },
      { name: 'P2', policy: policy.p2Escalation },
      { name: 'P3', policy: policy.p3Escalation },
      { name: 'P4', policy: policy.p4Escalation },
      { name: 'P5', policy: policy.p5Escalation },
    ];

    for (const { name, policy: escPolicy } of escalationPolicies) {
      if (escPolicy && escPolicy.steps) {
        // Validate steps are in ascending order
        for (let i = 1; i < escPolicy.steps.length; i++) {
          if (escPolicy.steps[i].afterSeconds <= escPolicy.steps[i - 1].afterSeconds) {
            errors.push(
              `${name} escalation steps must be in ascending order of time`
            );
            break;
          }
        }

        // Validate each step
        escPolicy.steps.forEach((step, index) => {
          if (step.afterSeconds < 0) {
            errors.push(`${name} escalation step ${index + 1} has negative delay`);
          }
          if (step.recipientGroupIds.length === 0) {
            errors.push(`${name} escalation step ${index + 1} has no recipient groups`);
          }
          if (step.channels.length === 0) {
            errors.push(`${name} escalation step ${index + 1} has no channels`);
          }
        });
      }
    }

    // Validate notification rules
    const rules = [
      { name: 'P1', rule: policy.p1Rule },
      { name: 'P2', rule: policy.p2Rule },
      { name: 'P3', rule: policy.p3Rule },
      { name: 'P4', rule: policy.p4Rule },
      { name: 'P5', rule: policy.p5Rule },
    ];

    for (const { name, rule } of rules) {
      if (rule) {
        if (rule.channels.length === 0 && rule.recipientGroupIds.length > 0) {
          errors.push(`${name} rule has recipients but no channels`);
        }
        if (rule.channels.length > 0 && rule.recipientGroupIds.length === 0) {
          errors.push(`${name} rule has channels but no recipient groups`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate next escalation time
   */
  calculateNextEscalationTime(
    escalationPolicy: EscalationPolicy,
    currentStep: number,
    baseTime: Date = new Date()
  ): Date | null {
    if (!escalationPolicy.steps || currentStep >= escalationPolicy.steps.length) {
      return null; // No more steps
    }

    const step = escalationPolicy.steps[currentStep];
    const nextTime = new Date(baseTime.getTime() + step.afterSeconds * 1000);

    return nextTime;
  }
}
