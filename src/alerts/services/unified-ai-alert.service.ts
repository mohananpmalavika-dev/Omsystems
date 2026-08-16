/**
 * Unified AI Alert Pipeline Service
 * 
 * End-to-end ingestion pipeline:
 * Raw AI Event -> Normalizer Adapter -> Enrichment -> Severity Policy -> Deduplication -> Correlation -> Presentation Tokens -> Normalized Surveillance Alert
 */

import type { RawAiDetectionEvent } from "../domain/raw-ai-event.types.js";
import type { SurveillanceAlert, CanonicalAlertType, AlertSeverity, AlertLifecycleState } from "../domain/surveillance-alert.types.js";
import { alertNormalizerRegistry, AlertNormalizerRegistry } from "../normalizers/alert-normalizer-registry.js";
import { alertEnrichmentService, AlertEnrichmentService } from "./alert-enrichment.service.js";
import { contextualSeverityPolicyService, ContextualSeverityPolicyService } from "./contextual-severity-policy.service.js";
import { aiAlertDeduplicationService, AiAlertDeduplicationService } from "./ai-alert-deduplication.service.js";
import { aiAlertCorrelationService, AiAlertCorrelationService } from "./ai-alert-correlation.service.js";
import { alertPresentationService, AlertPresentationService } from "./alert-presentation.service.js";
import { publishEvent } from "../../events/unified-event-bus.js";

export class UnifiedAiAlertService {
  private alerts: Map<string, SurveillanceAlert> = new Map(); // alertId -> SurveillanceAlert

  constructor(
    private readonly normalizer: AlertNormalizerRegistry = alertNormalizerRegistry,
    private readonly enrichment: AlertEnrichmentService = alertEnrichmentService,
    private readonly severityPolicy: ContextualSeverityPolicyService = contextualSeverityPolicyService,
    private readonly dedup: AiAlertDeduplicationService = aiAlertDeduplicationService,
    private readonly correlation: AiAlertCorrelationService = aiAlertCorrelationService,
    private readonly presentation: AlertPresentationService = alertPresentationService
  ) {}

  async ingestRawAiEvent(rawEvent: RawAiDetectionEvent): Promise<{ alert: SurveillanceAlert; isDeduplicated: boolean }> {
    // 1. Normalize
    const candidate = this.normalizer.normalize(rawEvent);

    // 2. Enrich with Banking Metadata
    const enriched = this.enrichment.enrich(candidate, candidate.occurredAt);

    // 3. Evaluate Contextual Severity
    const severity = this.severityPolicy.evaluateSeverity({
      alertType: candidate.alertType,
      zone: enriched.zone,
      isAfterHours: enriched.isAfterHours,
      confidence: candidate.confidence,
    });

    // 4. Deduplicate / Flapping Suppression
    const dedupRes = this.dedup.evaluate({
      tenantId: candidate.tenantId,
      branchId: candidate.branchId,
      cameraId: candidate.cameraId,
      alertType: candidate.alertType,
      zone: enriched.zone,
    });

    if (dedupRes.isDuplicate && dedupRes.alertId) {
      const existing = this.alerts.get(dedupRes.alertId);
      if (existing) {
        existing.occurrenceCount = dedupRes.occurrenceCount;
        existing.lastSeenAt = candidate.occurredAt;
        existing.detectorLifecycle = "UPDATE";
        return { alert: existing, isDeduplicated: true };
      }
    }

    // 5. Generate New Canonical Alert
    const id = `alert-${candidate.alertType.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const presentation = this.presentation.getPresentation(candidate.alertType, severity);

    const alert: SurveillanceAlert = {
      id,
      tenantId: candidate.tenantId,
      branchId: candidate.branchId,
      branchName: enriched.branchName,
      zone: enriched.zone,
      cameraId: candidate.cameraId,
      cameraName: enriched.cameraName,
      recorderId: candidate.recorderId,
      alertType: candidate.alertType,
      vendorEventType: candidate.vendorEventType,
      vendorSource: candidate.vendorSource,
      severity,
      detectedAt: candidate.occurredAt,
      occurredAt: candidate.occurredAt,
      title: candidate.title,
      description: candidate.description,
      confidence: candidate.confidence,
      detectorLifecycle: "START",
      occurrenceCount: 1,
      firstSeenAt: candidate.occurredAt,
      lastSeenAt: candidate.occurredAt,
      snapshotReference: candidate.snapshotReference,
      clipReference: candidate.clipReference,
      status: "NEW",
      attributes: candidate.attributes,
      presentation,
      schemaVersion: 1,
    };

    // 6. Correlate with Temporal Alarms at Same Branch
    const corrRes = this.correlation.correlate(alert, 60_000, alert.occurredAt);
    alert.correlationId = corrRes.correlationId;
    alert.incidentId = corrRes.incidentId;

    // Register active dedup window & store alert
    this.dedup.registerActiveAlert(alert);
    this.alerts.set(id, alert);

    // 7. Publish to Unified Event Bus
    await publishEvent("surveillance:alert:created", alert).catch(() => {});

    return { alert, isDeduplicated: false };
  }

  async acknowledgeAlert(alertId: string, operatorId: string): Promise<SurveillanceAlert | null> {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.status = "ACKNOWLEDGED";
    alert.acknowledgedBy = operatorId;
    alert.acknowledgedAt = new Date();

    await publishEvent("surveillance:alert:acknowledged", { alertId, operatorId, timestamp: alert.acknowledgedAt }).catch(() => {});
    return alert;
  }

  async escalateAlert(alertId: string, operatorId: string, reason = "Critical threat escalation"): Promise<SurveillanceAlert | null> {
    const alert = this.alerts.get(alertId);
    if (!alert) return null;

    alert.status = "ESCALATED";
    alert.attributes.escalatedBy = operatorId;
    alert.attributes.escalationReason = reason;

    await publishEvent("surveillance:alert:escalated", { alertId, operatorId, reason }).catch(() => {});
    return alert;
  }

  getAlert(id: string): SurveillanceAlert | undefined {
    return this.alerts.get(id);
  }

  getAlerts(filter?: {
    tenantId?: string | undefined;
    branchId?: string | undefined;
    alertType?: CanonicalAlertType | undefined;
    severity?: AlertSeverity | undefined;
    status?: AlertLifecycleState | undefined;
  }): SurveillanceAlert[] {
    return Array.from(this.alerts.values()).filter((a) => {
      if (filter?.tenantId && a.tenantId !== filter.tenantId) return false;
      if (filter?.branchId && a.branchId !== filter.branchId) return false;
      if (filter?.alertType && a.alertType !== filter.alertType) return false;
      if (filter?.severity && a.severity !== filter.severity) return false;
      if (filter?.status && a.status !== filter.status) return false;
      return true;
    });
  }

  clear() {
    this.alerts.clear();
    this.dedup.clear();
    this.correlation.clear();
  }
}

export const unifiedAiAlertService = new UnifiedAiAlertService();
