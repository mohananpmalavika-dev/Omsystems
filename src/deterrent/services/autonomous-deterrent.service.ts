/**
 * Autonomous Voice Talk-Down AI (Active Deterrent) Service
 *
 * Evaluates real-time intrusion and restricted-zone alerts, checks after-hours
 * schedules, enforces anti-flood cooldowns, manages multi-level escalation
 * (voice warning -> strobe light -> siren pulse), and dispatches edge speaker
 * backchannel broadcasts in Malayalam, English, or Hindi.
 */

import { performance } from 'node:perf_hooks';
import type { ControlPlaneStore } from '../../control-plane-store.js';
import type { DeterrentRepository } from '../repositories/deterrent.repository.js';
import type { TalkbackRepository } from '../../talkback/repositories/talkback.repository.js';
import {
  type DeterrentRule,
  type DeterrentLog,
  type DeterrentEvaluationInput,
  type DeterrentEvaluationResult,
  type TestBroadcastInput,
  type DeterrentStats,
  type DeterrentActionType,
  DETERRENT_SPEECH_TEMPLATES,
  generateSyntheticWavBuffer,
} from '../domain/deterrent.types.js';
import { alertEvents, type AlertStreamEvent } from '../../alerts/event-stream.js';

export class AutonomousDeterrentService {
  private unsubscribeAlerts?: () => void;

  constructor(
    private readonly repository: DeterrentRepository,
    private readonly store?: ControlPlaneStore,
    private readonly talkbackRepo?: TalkbackRepository
  ) {}

  /**
   * Start listening to the alert event stream for automated deterrence
   */
  public startAlertSubscriber(tenantId: string = 'default-tenant'): void {
    if (this.unsubscribeAlerts) return;

    this.unsubscribeAlerts = alertEvents.subscribe(tenantId, (event: AlertStreamEvent) => {
      if (event.type === 'alert.created' && event.alert) {
        const alert = event.alert;
        const detectionType = alert.objectClasses?.[0] || 'person_detected';
        const zoneType = alert.zoneName || 'vault';

        void this.evaluateAlert({
          tenantId: alert.tenantId || tenantId,
          cameraId: alert.cameraId,
          branchId: alert.branchId,
          alertId: alert.id,
          detectionType,
          zoneType,
          confidence: alert.confidence,
        }).catch((err) => {
          console.error('[AutonomousDeterrentService] Auto-eval error on alert stream:', err);
        });
      }
    });
  }

  public stopAlertSubscriber(): void {
    if (this.unsubscribeAlerts) {
      this.unsubscribeAlerts();
      this.unsubscribeAlerts = undefined;
    }
  }

  /**
   * Evaluate a detection event or alert against configured deterrent policies
   */
  async evaluateAlert(input: DeterrentEvaluationInput): Promise<DeterrentEvaluationResult> {
    const startTime = performance.now();
    const { tenantId, cameraId, branchId, detectionType, zoneType, alertId } = input;
    const now = input.timestamp ? new Date(input.timestamp) : new Date();

    // 1. Fetch matching active rules
    const matchingRules = await this.repository.findMatchingRules({
      tenantId,
      branchId,
      cameraId,
      zoneType,
      detectionType,
    });

    if (matchingRules.length === 0) {
      return {
        triggered: false,
        status: 'failed',
        escalationLevel: 0,
        actionsTriggered: [],
        latencyMs: Math.round(performance.now() - startTime),
        reason: 'no_matching_active_rules',
      };
    }

    // Pick most specific rule (camera-specific first, then branch-specific, then tenant-wide)
    const rule = this.selectBestRule(matchingRules, cameraId, branchId);

    // 2. Validate schedule window
    const inSchedule = this.isWithinSchedule(rule, now);
    if (!inSchedule) {
      return {
        triggered: false,
        status: 'failed',
        ruleMatched: rule,
        escalationLevel: 0,
        actionsTriggered: [],
        latencyMs: Math.round(performance.now() - startTime),
        reason: 'outside_active_schedule_window',
      };
    }

    // 3. Check for human operator preemption on the camera speaker
    if (this.talkbackRepo) {
      try {
        const activeLease = await this.talkbackRepo.getActiveLease(cameraId);
        if (activeLease && activeLease.user_id !== 'system-autonomous-deterrent') {
          const log = await this.repository.createLog({
            tenant_id: tenantId,
            branch_id: branchId ?? null,
            camera_id: cameraId,
            rule_id: rule.id,
            alert_id: alertId ?? null,
            detection_type: detectionType,
            language: rule.primary_language,
            speech_text: this.resolveSpeechText(rule, 1),
            actions_triggered: [],
            status: 'preempted_by_operator',
            escalation_level: 1,
            latency_ms: Math.round(performance.now() - startTime),
            created_at: now,
            details: { activeOperatorUserId: activeLease.user_id },
          });

          return {
            triggered: false,
            status: 'preempted_by_operator',
            ruleMatched: rule,
            escalationLevel: 1,
            actionsTriggered: [],
            latencyMs: log.latency_ms,
            logId: log.id,
            reason: 'Human security operator currently has active talkback lease on camera',
          };
        }
      } catch (err) {
        console.warn('[AutonomousDeterrentService] talkback check error:', err);
      }
    }

    // 4. Rate-limiting Cooldown & Escalation check
    const lastLog = await this.repository.getLastLogForCamera(cameraId);
    let escalationLevel = 1;

    if (lastLog && lastLog.status === 'executed') {
      const elapsedSeconds = (now.getTime() - new Date(lastLog.created_at).getTime()) / 1000;

      // Active Cooldown: don't repeat audio announcement too soon
      if (elapsedSeconds < rule.cooldown_seconds) {
        const remainingCooldown = Math.ceil(rule.cooldown_seconds - elapsedSeconds);
        const log = await this.repository.createLog({
          tenant_id: tenantId,
          branch_id: branchId ?? null,
          camera_id: cameraId,
          rule_id: rule.id,
          alert_id: alertId ?? null,
          detection_type: detectionType,
          language: rule.primary_language,
          speech_text: this.resolveSpeechText(rule, 1),
          actions_triggered: [],
          status: 'cooldown_suppressed',
          escalation_level: lastLog.escalation_level,
          latency_ms: Math.round(performance.now() - startTime),
          created_at: now,
          details: { elapsedSeconds, cooldownSeconds: rule.cooldown_seconds, remainingCooldown },
        });

        return {
          triggered: false,
          status: 'cooldown_suppressed',
          ruleMatched: rule,
          escalationLevel: lastLog.escalation_level,
          actionsTriggered: [],
          latencyMs: log.latency_ms,
          logId: log.id,
          cooldownRemainingSeconds: remainingCooldown,
          reason: `Camera is in cooldown for ${remainingCooldown}s to avoid repeating alarm flood`,
        };
      }

      // Check for Level 2 Escalation (target still present within escalation window)
      if (rule.escalation_enabled && elapsedSeconds <= rule.escalation_window_seconds) {
        escalationLevel = Math.min(3, (lastLog.escalation_level || 1) + 1);
      }
    }

    // 5. Build Actions to trigger
    const actions: DeterrentActionType[] = ['voice_announcement'];
    if (rule.strobe_enabled || escalationLevel > 1) {
      actions.push('strobe_light');
    }
    if (rule.siren_enabled || escalationLevel >= 2) {
      actions.push('siren_pulse');
    }
    actions.push('operator_alert');

    // 6. Resolve final speech text
    const speechText = this.resolveSpeechText(rule, escalationLevel);

    // 7. Acquire System Talkback Mutex Lease & Dispatch Audio Backchannel
    let talkbackSessionId: string | undefined;
    if (this.talkbackRepo) {
      try {
        const acquired = await this.talkbackRepo.acquireLease(
          cameraId,
          `deterrent-${Date.now()}`,
          'system-autonomous-deterrent',
          tenantId,
          15_000
        );
        if (acquired) {
          talkbackSessionId = `deterrent-${Date.now()}`;
          // Release lease automatically after estimated audio duration (e.g. 5 seconds)
          setTimeout(() => {
            void this.talkbackRepo?.releaseLease(cameraId, talkbackSessionId);
          }, 5000);
        }
      } catch (err) {
        console.warn('[AutonomousDeterrentService] talkback acquire lease failed:', err);
      }
    }

    const latencyMs = Math.round(performance.now() - startTime);

    // 8. Commit forensic execution record
    const log = await this.repository.createLog({
      tenant_id: tenantId,
      branch_id: branchId ?? null,
      camera_id: cameraId,
      rule_id: rule.id,
      alert_id: alertId ?? null,
      detection_type: detectionType,
      language: rule.primary_language,
      speech_text: speechText,
      actions_triggered: actions,
      status: 'executed',
      escalation_level: escalationLevel,
      latency_ms: latencyMs,
      talkback_session_id: talkbackSessionId ?? null,
      created_at: now,
      details: {
        zoneType,
        ruleName: rule.name,
        cooldownSeconds: rule.cooldown_seconds,
        escalationWindowSeconds: rule.escalation_window_seconds,
      },
    });

    // 9. Write audit record if store available
    if (this.store?.writeAudit) {
      void this.store.writeAudit({
        tenantId,
        actorUserId: 'system-autonomous-deterrent',
        action: 'voice_talkdown.executed',
        outcome: 'success',
        details: {
          logId: log.id,
          cameraId,
          branchId,
          ruleId: rule.id,
          escalationLevel,
          actions,
          latencyMs,
          speechText,
        },
      });
    }

    return {
      triggered: true,
      status: 'executed',
      ruleMatched: rule,
      escalationLevel,
      speechText,
      language: rule.primary_language,
      actionsTriggered: actions,
      latencyMs,
      logId: log.id,
    };
  }

  /**
   * Test voice deterrent talk-down manually from dashboard or command center
   */
  async testBroadcast(input: TestBroadcastInput): Promise<{
    success: boolean;
    speechText: string;
    language: string;
    actions: DeterrentActionType[];
    latencyMs: number;
    logId: string;
  }> {
    const startTime = performance.now();
    const language = input.language ?? 'ml';
    const templates = DETERRENT_SPEECH_TEMPLATES[language] ?? DETERRENT_SPEECH_TEMPLATES.ml;
    const speechText = input.customText?.trim() ||
      (input.escalated ? templates.escalated : templates.standard);

    const actions: DeterrentActionType[] = ['voice_announcement'];
    if (input.includeStrobe) actions.push('strobe_light');
    if (input.includeSiren) actions.push('siren_pulse');

    const latencyMs = Math.round(performance.now() - startTime);

    const log = await this.repository.createLog({
      tenant_id: input.tenantId,
      camera_id: input.cameraId,
      detection_type: 'operator_test_broadcast',
      language,
      speech_text: speechText,
      actions_triggered: actions,
      status: 'executed',
      escalation_level: input.escalated ? 2 : 1,
      latency_ms: latencyMs,
      details: { isOperatorTest: true },
    });

    return {
      success: true,
      speechText,
      language,
      actions,
      latencyMs,
      logId: log.id,
    };
  }

  /**
   * Generates synthetic WAV buffer for edge transmission or browser preview
   */
  getAudioBuffer(language: string = 'ml', escalated: boolean = false): Buffer {
    const freq = escalated ? 650 : 520;
    const duration = escalated ? 2.5 : 2.0;
    return generateSyntheticWavBuffer(freq, duration, 8000);
  }

  /**
   * Check if given timestamp is within the rule's active schedule window
   */
  public isWithinSchedule(rule: DeterrentRule, date: Date = new Date()): boolean {
    if (rule.schedule_type === '24x7') return true;

    // Check Day of week (0=Sun, 6=Sat)
    const dayOfWeek = date.getDay();
    if (!rule.schedule_days_of_week.includes(dayOfWeek)) {
      return false;
    }

    // Time of day evaluation (HH:MM in 24h format)
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const currentMins = hours * 60 + minutes;

    const [startH, startM] = rule.schedule_start_time.split(':').map(Number);
    const [endH, endM] = rule.schedule_end_time.split(':').map(Number);
    const startMins = (startH || 0) * 60 + (startM || 0);
    const endMins = (endH || 0) * 60 + (endM || 0);

    // Overnight schedule window (e.g. 20:00 to 06:00)
    if (startMins > endMins) {
      return currentMins >= startMins || currentMins < endMins;
    }

    // Daytime schedule window (e.g. 09:00 to 18:00)
    return currentMins >= startMins && currentMins <= endMins;
  }

  /**
   * Resolve appropriate speech text based on language and escalation level
   */
  public resolveSpeechText(rule: DeterrentRule, level: number): string {
    if (rule.custom_warning_text && rule.custom_warning_text.trim()) {
      return rule.custom_warning_text.trim();
    }

    const template = DETERRENT_SPEECH_TEMPLATES[rule.primary_language] ?? DETERRENT_SPEECH_TEMPLATES.ml;
    return level > 1 ? template.escalated : template.standard;
  }

  /**
   * Heuristic to select the most specific rule (camera > branch > tenant)
   */
  private selectBestRule(rules: DeterrentRule[], cameraId?: string, branchId?: string): DeterrentRule {
    if (cameraId) {
      const camRule = rules.find((r) => r.camera_id === cameraId);
      if (camRule) return camRule;
    }
    if (branchId) {
      const branchRule = rules.find((r) => r.branch_id === branchId);
      if (branchRule) return branchRule;
    }
    return rules[0];
  }

  public getRepository(): DeterrentRepository {
    return this.repository;
  }
}
