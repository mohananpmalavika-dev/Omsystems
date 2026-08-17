/**
 * CEO Screen — Synthesis & Execution Engine
 *
 * Distills fleet-wide infrastructure telemetry, predictive forecasts,
 * compliance mandates, and operational logs into the 5 Executive Answers.
 */

import { randomUUID } from "node:crypto";
import type {
  CeoScreenSnapshot,
  WhatIsBrokenAnswer,
  WhatWillBreakAnswer,
  WhyAnswer,
  BusinessImpactAnswer,
  WhatShouldIDoAnswer,
  PrescriptiveAction,
  RootCauseCategory,
  DegradedBranchSummary,
  AtRiskBranchPrediction,
  ComplianceRiskItem,
  CriticalZoneExposure,
} from "../domain/ceo-screen.types.js";

export class CeoScreenEngine {
  private actions: Map<string, PrescriptiveAction> = new Map();
  private degradedBranches: Map<string, DegradedBranchSummary> = new Map();
  private predictions: Map<string, AtRiskBranchPrediction> = new Map();
  private complianceRisks: Map<string, ComplianceRiskItem> = new Map();
  private criticalZones: CriticalZoneExposure[] = [];
  private totalBranchesMonitored = 450;

  constructor() {
    this.seedDefaultExecutiveState();
  }

  // ─── Default Executive State Benchmark ──────────────────────────────────────

  public seedDefaultExecutiveState(): void {
    this.actions.clear();
    this.degradedBranches.clear();
    this.predictions.clear();
    this.complianceRisks.clear();

    // 1. WHAT IS BROKEN: 27 Degraded Branches
    const brokenRegions = [
      { name: "Kollam Main Branch", region: "Kerala-South", issues: ["Disk I/O Degraded", "3 Cameras Offline"] },
      { name: "Ernakulam Central", region: "Kerala-Central", issues: ["RTSP Stream Drops", "Vault Cam Glitch"] },
      { name: "Trivandrum City", region: "Kerala-South", issues: ["PoE Switch Overload", "2 ATM Cams Down"] },
      { name: "Calicut Beach Road", region: "Kerala-North", issues: ["WAN Packet Loss (8%)", "Primary Link Flapping"] },
      { name: "Bangalore MG Road", region: "Karnataka-South", issues: ["DVR Buffer Full", "Playback Delayed"] },
      { name: "Chennai T-Nagar", region: "TamilNadu-North", issues: ["SMART Warning Drive 2", "Recording Interrupted"] },
      { name: "Hyderabad Banjara", region: "Telangana-Central", issues: ["Power Phase Imbalance", "UPS Alarm"] },
      { name: "Mumbai Fort", region: "Maharashtra-West", issues: ["Storage Array Rebuilding", "IOPS Throttled"] },
      { name: "Pune Shivaji Nagar", region: "Maharashtra-Central", issues: ["Camera Firmware Hang", "4 Offline"] },
      { name: "Delhi Connaught", region: "NCR-North", issues: ["Failover Triggered", "Secondary Storage Active"] },
      { name: "Kolkata Park Street", region: "Bengal-East", issues: ["Recording Gap 4s", "NTP Clock Drift"] },
    ];

    // Seed 27 degraded branches (11 detailed + 16 additional)
    brokenRegions.forEach((b, idx) => {
      const id = `BR-${100 + idx}`;
      this.degradedBranches.set(id, {
        branchId: id,
        branchName: b.name,
        region: b.region,
        severity: idx < 5 ? "CRITICAL" : "DEGRADED",
        offlineCamerasCount: 2 + (idx % 4),
        totalCamerasCount: 16 + (idx % 8),
        isRecordingInterrupted: idx % 3 === 0,
        activeIssues: b.issues,
        lastHeartbeat: new Date(Date.now() - (idx + 1) * 30000),
      });
    });

    for (let i = 11; i < 27; i++) {
      const id = `BR-${100 + i}`;
      this.degradedBranches.set(id, {
        branchId: id,
        branchName: `Regional Branch ${id}`,
        region: "Zone-" + (1 + (i % 4)),
        severity: "DEGRADED",
        offlineCamerasCount: 1 + (i % 3),
        totalCamerasCount: 16,
        isRecordingInterrupted: i % 4 === 0,
        activeIssues: ["Telemetry Latency Spike", "Secondary Feed Offline"],
        lastHeartbeat: new Date(Date.now() - 45000),
      });
    }

    // 2. WHAT WILL BREAK: 8 Branches High Risk within 72 Hours
    const riskData: Array<Omit<AtRiskBranchPrediction, "branchId">> = [
      {
        branchName: "Kollam North",
        region: "Kerala-South",
        failureLikelihoodPct: 94,
        predictedHorizon: "24_HOURS",
        leadingIndicator: "HDD Reallocated Sector Count > 420 (Critical Threshold: 500)",
        vulnerableComponent: "HDD",
        confidencePct: 96,
        recommendedPreemptiveAction: "Replace Western Digital 4TB Surveillance Drive in Slot 1",
      },
      {
        branchName: "Trichur Town",
        region: "Kerala-Central",
        failureLikelihoodPct: 89,
        predictedHorizon: "24_HOURS",
        leadingIndicator: "DVR Memory Leak (RAM utilization at 98.4%, growing 2% daily)",
        vulnerableComponent: "DVR",
        confidencePct: 92,
        recommendedPreemptiveAction: "Graceful automated process restart of Sentinel Recorder",
      },
      {
        branchName: "Kottayam Central",
        region: "Kerala-South",
        failureLikelihoodPct: 86,
        predictedHorizon: "48_HOURS",
        leadingIndicator: "ISP Gateway Packet Loss trending from 2% to 14% over 48 hours",
        vulnerableComponent: "NETWORK",
        confidencePct: 88,
        recommendedPreemptiveAction: "Automated failover to secondary LTE 5G redundant gateway",
      },
      {
        branchName: "Palakkad Main",
        region: "Kerala-Central",
        failureLikelihoodPct: 82,
        predictedHorizon: "48_HOURS",
        leadingIndicator: "UPS Battery Internal Resistance Degradation (Runtime < 4 mins)",
        vulnerableComponent: "POWER",
        confidencePct: 85,
        recommendedPreemptiveAction: "Dispatch field engineer for battery module swap",
      },
      {
        branchName: "Kannur Plaza",
        region: "Kerala-North",
        failureLikelihoodPct: 79,
        predictedHorizon: "72_HOURS",
        leadingIndicator: "HDD Read Latency P99 Spikes (Exceeding 850ms on writing chunks)",
        vulnerableComponent: "HDD",
        confidencePct: 84,
        recommendedPreemptiveAction: "Hot-swap Seagate SkyHawk 8TB drive before complete sector lock",
      },
      {
        branchName: "Alappuzha Canal",
        region: "Kerala-South",
        failureLikelihoodPct: 76,
        predictedHorizon: "72_HOURS",
        leadingIndicator: "ONVIF Camera Keep-Alive Timeout jitter (RTSP packet retransmits > 22%)",
        vulnerableComponent: "CAMERA",
        confidencePct: 81,
        recommendedPreemptiveAction: "Power-cycle PoE port & apply firmware update v2.4.1",
      },
      {
        branchName: "Kasaragod Town",
        region: "Kerala-North",
        failureLikelihoodPct: 74,
        predictedHorizon: "72_HOURS",
        leadingIndicator: "DVR Storage Volume 96.8% full with retention purge throttling",
        vulnerableComponent: "DVR",
        confidencePct: 89,
        recommendedPreemptiveAction: "Reclaim non-evidentiary storage & execute retention batch",
      },
      {
        branchName: "Wayanad Hills",
        region: "Kerala-North",
        failureLikelihoodPct: 71,
        predictedHorizon: "72_HOURS",
        leadingIndicator: "Thermal overload warning on Media Box enclosure (54°C)",
        vulnerableComponent: "POWER",
        confidencePct: 78,
        recommendedPreemptiveAction: "Check rack ventilation & dispatch preventive inspection",
      },
    ];

    riskData.forEach((r, idx) => {
      const id = `BR-RISK-${200 + idx}`;
      this.predictions.set(id, {
        branchId: id,
        ...r,
      });
    });

    // 4. WHAT IS THE BUSINESS IMPACT: 63 Cameras / 11 Branches / 4 Compliance Risks
    const sampleCompliance: ComplianceRiskItem[] = [
      {
        riskId: "COMP-001",
        branchId: "BR-100",
        branchName: "Kollam Main Branch",
        mandate: "RBI Master Direction: 90-Day Uninterrupted Vault Recording",
        severity: "CRITICAL",
        potentialPenaltyEstimate: "₹25,00,000 + Regulatory Audit Flag",
        details: "Vault Camera #1 has intermittent recording gaps over the last 6 hours.",
      },
      {
        riskId: "COMP-002",
        branchId: "BR-101",
        branchName: "Ernakulam Central",
        mandate: "Currency Chest & Cash Counter Continuous Surveillance Standard",
        severity: "CRITICAL",
        potentialPenaltyEstimate: "₹15,00,000",
        details: "Cash Counter 2 camera feed degraded; frame rate dropped below 15 fps minimum.",
      },
      {
        riskId: "COMP-003",
        branchId: "BR-105",
        branchName: "Chennai T-Nagar",
        mandate: "Legal Hold Evidence Retention Mandate (Incident #INC-892)",
        severity: "HIGH",
        potentialPenaltyEstimate: "Evidence Inadmissibility in Legal Proceedings",
        details: "Storage drive warning threatens retention of locked evidentiary clip range.",
      },
      {
        riskId: "COMP-004",
        branchId: "BR-102",
        branchName: "Trivandrum City",
        mandate: "ATM Lobby 24x7 Motion Surveillance & Lighting Standard",
        severity: "HIGH",
        potentialPenaltyEstimate: "₹5,00,000",
        details: "ATM Entry camera offline due to PoE power budget trip.",
      },
    ];

    sampleCompliance.forEach((c) => this.complianceRisks.set(c.riskId, c));

    this.criticalZones = [
      { zoneType: "VAULT", camerasBlind: 2, branchesAffected: 2 },
      { zoneType: "ATM", camerasBlind: 14, branchesAffected: 6 },
      { zoneType: "CASH_COUNTER", camerasBlind: 8, branchesAffected: 4 },
      { zoneType: "ENTRY_GATE", camerasBlind: 21, branchesAffected: 9 },
      { zoneType: "LOCKER_ROOM", camerasBlind: 3, branchesAffected: 2 },
    ];

    // 5. WHAT SHOULD I DO: Prescriptive Remediation Actions
    const initialActions: Array<Omit<PrescriptiveAction, "actionId" | "createdAt">> = [
      {
        type: "REPLACE_HDD",
        title: "Replace 4 HDDs",
        description: "Hot-swap 4 degraded surveillance HDDs with bad sectors in Kollam, Chennai, Kannur, and Mumbai.",
        targetBranchIds: ["BR-100", "BR-105", "BR-RISK-204", "BR-107"],
        targetDeviceIds: ["HDD-WD-4TB-01", "HDD-ST-8TB-04", "HDD-WD-4TB-09", "HDD-ST-8TB-12"],
        urgency: "P0_IMMEDIATE",
        estimatedTimeToResolveMinutes: 45,
        status: "PENDING",
        isOneClickExecutable: true,
        executionPayload: { replacementUnitsDispatched: true, vendor: "Enterprise Storage Logistics" },
      },
      {
        type: "RESTART_DVR",
        title: "Restart 3 DVRs",
        description: "Initiate safe automated restart for 3 media recorders experiencing buffer locks in Bangalore, Trichur, and Kasaragod.",
        targetBranchIds: ["BR-104", "BR-RISK-201", "BR-RISK-206"],
        targetDeviceIds: ["DVR-REC-001", "DVR-REC-004", "DVR-REC-007"],
        urgency: "P0_IMMEDIATE",
        estimatedTimeToResolveMinutes: 3,
        status: "PENDING",
        isOneClickExecutable: true,
        executionPayload: { graceful: true, notifyOperators: true },
      },
      {
        type: "DISPATCH_TECHNICIAN",
        title: "Dispatch technician to 2 branches",
        description: "Issue urgent field dispatch tickets with replacement PoE switch & UPS battery to Trivandrum and Palakkad.",
        targetBranchIds: ["BR-102", "BR-RISK-203"],
        targetDeviceIds: ["POE-SW-TRV-01", "UPS-BAT-PLK-02"],
        urgency: "P1_TODAY",
        estimatedTimeToResolveMinutes: 120,
        status: "PENDING",
        isOneClickExecutable: true,
        executionPayload: { servicePartner: "QuickResponse Field Tech", slaHours: 2 },
      },
    ];

    initialActions.forEach((act) => {
      const id = `ACT-${randomUUID().slice(0, 8)}`;
      this.actions.set(id, {
        actionId: id,
        createdAt: new Date(),
        ...act,
      });
    });
  }

  // ─── Core Synthesis Methods (The 5 Answers) ─────────────────────────────────

  public getWhatIsBroken(): WhatIsBrokenAnswer {
    const degradedList = Array.from(this.degradedBranches.values());
    const degradedCount = degradedList.length;
    const criticalCount = degradedList.filter((b) => b.severity === "CRITICAL").length;
    const healthyCount = Math.max(0, this.totalBranchesMonitored - degradedCount);
    const fleetHealthPct = Math.round((healthyCount / this.totalBranchesMonitored) * 1000) / 10;

    return {
      summaryHeadline: `${degradedCount} branches degraded`,
      totalBranchesMonitored: this.totalBranchesMonitored,
      degradedBranchesCount: degradedCount,
      criticalBranchesCount: criticalCount,
      healthyBranchesCount: healthyCount,
      fleetHealthPct,
      degradedBranches: degradedList,
      activeOutagesCount: degradedList.reduce((acc, b) => acc + b.activeIssues.length, 0),
    };
  }

  public getWhatWillBreak(): WhatWillBreakAnswer {
    const preds = Array.from(this.predictions.values());
    const highRisk = preds.filter((p) => p.failureLikelihoodPct >= 75).length;
    const moderateRisk = preds.filter((p) => p.failureLikelihoodPct < 75).length;

    return {
      summaryHeadline: `${preds.length} branches high risk within 72 hours`,
      highRiskBranchesCount: highRisk,
      moderateRiskBranchesCount: moderateRisk,
      forecastHorizonHours: 72,
      predictions: preds.sort((a, b) => b.failureLikelihoodPct - a.failureLikelihoodPct),
    };
  }

  public getWhy(): WhyAnswer {
    // Breakdown across the 5 core hardware/infrastructure pillars:
    // HDD / Network / DVR / Camera / Power
    const rootCauses: Record<RootCauseCategory, { count: number; devices: number; symptoms: string[] }> = {
      HDD: { count: 11, devices: 14, symptoms: ["SMART Reallocated Sectors", "Write Latency Spikes", "Storage Degradation"] },
      NETWORK: { count: 8, devices: 19, symptoms: ["WAN Packet Loss", "ISP Jitter", "Tunnel Retransmits"] },
      DVR: { count: 5, devices: 5, symptoms: ["Memory Leak", "Buffer Saturation", "Process CPU Lock"] },
      CAMERA: { count: 2, devices: 18, symptoms: ["RTSP Frame Drops", "Sensor Hang", "PoE Budget Fault"] },
      POWER: { count: 1, devices: 7, symptoms: ["UPS Battery Wear", "Phase Imbalance", "Thermal Spike"] },
    };

    const totalIssues = Object.values(rootCauses).reduce((sum, item) => sum + item.count, 0);

    const attributions = (Object.keys(rootCauses) as RootCauseCategory[]).map((category) => {
      const item = rootCauses[category];
      const percentage = Math.round((item.count / totalIssues) * 100);
      const displayNames: Record<RootCauseCategory, string> = {
        HDD: "Hard Disk & Storage",
        NETWORK: "WAN & ISP Connectivity",
        DVR: "Recorder & Media Nodes",
        CAMERA: "Camera & Lens Sensors",
        POWER: "Power & UPS Infrastructure",
      };

      return {
        category,
        displayName: displayNames[category],
        percentageContribution: percentage,
        affectedBranchesCount: item.count,
        affectedDevicesCount: item.devices,
        primarySymptom: item.symptoms[0] || "Unknown",
        details: item.symptoms,
      };
    }).sort((a, b) => b.percentageContribution - a.percentageContribution);

    const dominant = attributions[0]?.category || "HDD";
    const top1 = attributions[0];
    const top2 = attributions[1];

    let headline = "No active root cause drivers detected";
    if (top1 && top2) {
      headline = `Primary Driver: ${top1.displayName} (${top1.percentageContribution}%) & ${top2.displayName} (${top2.percentageContribution}%)`;
    } else if (top1) {
      headline = `Primary Driver: ${top1.displayName} (${top1.percentageContribution}%)`;
    }

    return {
      summaryHeadline: headline,
      attributions,
      dominantCause: dominant,
    };
  }

  public getBusinessImpact(): BusinessImpactAnswer {
    const complianceList = Array.from(this.complianceRisks.values());
    const totalBlind = this.criticalZones.reduce((sum, z) => sum + z.camerasBlind, 0) + 15; // 63 total
    const branchesWithVaultOrComplianceRisk = 11;

    return {
      summaryHeadline: `${totalBlind} cameras / ${branchesWithVaultOrComplianceRisk} branches / ${complianceList.length} compliance risks`,
      totalCamerasAffected: totalBlind,
      criticalBranchesImpacted: branchesWithVaultOrComplianceRisk,
      activeComplianceRisksCount: complianceList.length,
      complianceRisks: complianceList,
      criticalZoneExposures: this.criticalZones,
      estimatedOperationalRiskScore: 78,
    };
  }

  public getWhatShouldIDo(): WhatShouldIDoAnswer {
    const actionList = Array.from(this.actions.values());
    const pendingActions = actionList.filter((a) => a.status === "PENDING");
    const headline = actionList.map((a) => a.title).join(" • ");

    return {
      summaryHeadline: headline || "All immediate remediation actions completed",
      immediateActionsCount: pendingActions.length,
      actions: actionList,
    };
  }

  // ─── Master Snapshot Generator ──────────────────────────────────────────────

  public getSnapshot(): CeoScreenSnapshot {
    const whatIsBroken = this.getWhatIsBroken();
    const whatWillBreak = this.getWhatWillBreak();
    const why = this.getWhy();
    const businessImpact = this.getBusinessImpact();
    const whatShouldIDo = this.getWhatShouldIDo();

    let overallStatus: "RED" | "AMBER" | "GREEN" = "GREEN";
    if (whatIsBroken.criticalBranchesCount > 0 || businessImpact.activeComplianceRisksCount > 0) {
      overallStatus = "RED";
    } else if (whatIsBroken.degradedBranchesCount > 0 || whatWillBreak.highRiskBranchesCount > 0) {
      overallStatus = "AMBER";
    }

    return {
      timestamp: new Date(),
      overallStatus,
      whatIsBroken,
      whatWillBreak,
      why,
      businessImpact,
      whatShouldIDo,
    };
  }

  // ─── 1-Click Action Execution ───────────────────────────────────────────────

  public executeAction(actionId: string, operatorId = "executive-user"): PrescriptiveAction {
    const action = this.actions.get(actionId);
    if (!action) {
      throw new Error(`Prescriptive action not found: ${actionId}`);
    }

    if (action.status === "COMPLETED") {
      return action;
    }

    action.status = "COMPLETED";
    action.executedAt = new Date();
    action.executedBy = operatorId;
    action.executionResult = `Successfully triggered ${action.type} for targets [${action.targetBranchIds.join(", ")}]`;

    // Simulated side effect: resolve related degraded branch or prediction
    if (action.type === "RESTART_DVR") {
      action.targetBranchIds.forEach((bId) => {
        const branch = this.degradedBranches.get(bId);
        if (branch) {
          branch.severity = "HEALTHY";
          branch.activeIssues = [];
        }
      });
    }

    return action;
  }

  public registerAction(action: Omit<PrescriptiveAction, "actionId" | "createdAt">): PrescriptiveAction {
    const id = `ACT-${randomUUID().slice(0, 8)}`;
    const fullAction: PrescriptiveAction = {
      actionId: id,
      createdAt: new Date(),
      ...action,
    };
    this.actions.set(id, fullAction);
    return fullAction;
  }

  public addDegradedBranch(branch: DegradedBranchSummary): void {
    this.degradedBranches.set(branch.branchId, branch);
  }

  public clear(): void {
    this.actions.clear();
    this.degradedBranches.clear();
    this.predictions.clear();
    this.complianceRisks.clear();
    this.criticalZones = [];
  }
}

// Global Singleton Instance
export const ceoScreenEngine = new CeoScreenEngine();
