import { describe, it, expect, beforeEach } from "vitest";
import {
  PlaybookEngineService,
  PlaybookDefinitionRepository,
  PlaybookInstanceRepository,
  IncidentAuditRepository,
  IncidentResolutionBlockedError,
} from "../../src/incidents/index.js";

describe("Stateful Incident Playbook & Operator SOP Engine (Genetec Mission Control Parity)", () => {
  let engine: PlaybookEngineService;
  let definitions: PlaybookDefinitionRepository;
  let instances: PlaybookInstanceRepository;
  let audit: IncidentAuditRepository;

  beforeEach(() => {
    definitions = new PlaybookDefinitionRepository();
    instances = new PlaybookInstanceRepository();
    audit = new IncidentAuditRepository();
    engine = new PlaybookEngineService(definitions, instances, audit);
  });

  describe("Suite 1: P1 Vault Intrusion SOP Initialization & Step Dependencies", () => {
    it("initializes 9-step P1 Vault Intrusion SOP and runs automated branch & access checks", async () => {
      const incident = {
        id: "inc-vault-001",
        tenantId: "tenant-bank-south",
        incidentType: "VAULT_INTRUSION",
        severity: "P1",
        title: "P1 Vault PIR Motion Alarm Detected",
        branchId: "branch-kochi-main",
      };

      const instance = await engine.startPlaybook(incident);

      expect(instance.playbookId).toBe("vault-intrusion-p1");
      expect(instance.playbookVersion).toBe(1);
      expect(instance.status).toBe("RUNNING");
      expect(instance.currentStepIds).toEqual(["step-1-live-verification"]);

      // Verify automated checks ran on initialization
      const branchCheck = instance.stepInstances["step-3-branch-status"];
      expect(branchCheck?.status).toBe("COMPLETED");
      expect(branchCheck?.resultJson?.branchStatus).toBe("CLOSED");

      const accessCheck = instance.stepInstances["step-4-access-control"];
      expect(accessCheck?.status).toBe("COMPLETED");
      expect(accessCheck?.resultJson?.vaultDoorLocked).toBe(true);
    });

    it("enforces step dependencies: Step 2 requires Step 1 to be completed first", async () => {
      const instance = await engine.startPlaybook({
        id: "inc-vault-002",
        tenantId: "tenant-bank-south",
        incidentType: "VAULT_INTRUSION",
        severity: "P1",
      });

      // Attempting to complete Step 2 (Evidence Review) before Step 1 (Live Video) must fail
      await expect(
        engine.completeStep("inc-vault-002", "step-2-review-evidence", {
          stepId: "step-2-review-evidence",
          actor: { userId: "usr-1", userName: "Operator A" },
          evidence: { clipId: "clip-123", snapshotId: "snap-123" },
        }),
      ).rejects.toThrow(/Dependent step 'Verify Live Camera Stream' must be completed first/);
    });

    it("validates live camera stream requirement before completing Step 1", async () => {
      await engine.startPlaybook({
        id: "inc-vault-003",
        tenantId: "tenant-bank-south",
        incidentType: "VAULT_INTRUSION",
        severity: "P1",
      });

      // Completing without verified camera stream ID must throw validation error
      await expect(
        engine.completeStep("inc-vault-003", "step-1-live-verification", {
          stepId: "step-1-live-verification",
          actor: { userId: "usr-1", userName: "Operator A" },
        }),
      ).rejects.toThrow(/requires verified camera stream ID/);

      // Completing with camera ID succeeds
      const updated = await engine.completeStep("inc-vault-003", "step-1-live-verification", {
        stepId: "step-1-live-verification",
        actor: { userId: "usr-1", userName: "Operator A" },
        evidence: { cameraId: "cam-vault-primary", viewDurationSeconds: 25 },
      });

      expect(updated.stepInstances["step-1-live-verification"]?.status).toBe("COMPLETED");
      expect(updated.stepInstances["step-2-review-evidence"]?.status).toBe("IN_PROGRESS");
    });
  });

  describe("Suite 2: Strict Mandatory-Step Resolution Gate Enforcement", () => {
    it("strictly blocks incident resolution when mandatory SOP steps are incomplete", async () => {
      await engine.startPlaybook({
        id: "inc-vault-004",
        tenantId: "tenant-bank-south",
        incidentType: "VAULT_INTRUSION",
        severity: "P1",
      });

      // Operator attempts to prematurely resolve incident without completing SOP steps
      await expect(
        engine.resolveIncident(
          "inc-vault-004",
          { userId: "usr-1", userName: "Operator A" },
          "Attempting early closure",
        ),
      ).rejects.toThrow(IncidentResolutionBlockedError);

      // Verify audit trail logged the resolution block
      const timeline = await audit.getTimeline("inc-vault-004");
      const blockedEvent = timeline.find((e) => e.eventType === "RESOLUTION_BLOCKED");
      expect(blockedEvent).toBeDefined();
      expect(blockedEvent?.details?.incompleteSteps.length).toBeGreaterThan(0);
    });
  });

  describe("Suite 3: Controlled Supervisor Override Mechanism", () => {
    it("allows authorized supervisor override with mandatory justification when branch manager is unreachable", async () => {
      await engine.startPlaybook({
        id: "inc-vault-005",
        tenantId: "tenant-bank-south",
        incidentType: "VAULT_INTRUSION",
        severity: "P1",
      });

      // Step 1: Live video verification
      await engine.completeStep("inc-vault-005", "step-1-live-verification", {
        stepId: "step-1-live-verification",
        actor: { userId: "usr-1", userName: "Operator A" },
        evidence: { cameraId: "cam-vault-primary" },
      });

      // Step 2: Evidence review
      await engine.completeStep("inc-vault-005", "step-2-review-evidence", {
        stepId: "step-2-review-evidence",
        actor: { userId: "usr-1", userName: "Operator A" },
        evidence: { clipId: "clip-v1", snapshotId: "snap-v1" },
      });

      // Step 5: Branch manager is unreachable -> Supervisor executes override
      const overridden = await engine.overrideStep("inc-vault-005", "step-5-call-manager", {
        stepId: "step-5-call-manager",
        requestedBy: "Operator A",
        approvedBy: "Regional Security Officer - Mathew",
        reasonCode: "CONTACT_UNREACHABLE",
        justification: "Three consecutive calls went unanswered. Escalating directly to field patrol QRT.",
      });

      const step5 = overridden.stepInstances["step-5-call-manager"];
      expect(step5?.status).toBe("OVERRIDDEN");
      expect(step5?.overrideInfo?.reasonCode).toBe("CONTACT_UNREACHABLE");

      // Verify audit trail captured supervisor override
      const timeline = await audit.getTimeline("inc-vault-005");
      const overrideEvent = timeline.find((e) => e.eventType === "STEP_OVERRIDDEN");
      expect(overrideEvent).toBeDefined();
      expect(overrideEvent?.details?.reasonCode).toBe("CONTACT_UNREACHABLE");
    });
  });

  describe("Suite 4: Structured Decision Management & Full Resolution Flow", () => {
    it("progresses through complete P1 Vault Intrusion SOP and cleanly resolves via Resolution Gate", async () => {
      const incidentId = "inc-vault-006";
      await engine.startPlaybook({
        id: incidentId,
        tenantId: "tenant-bank-south",
        incidentType: "VAULT_INTRUSION",
        severity: "P1",
      });

      // Step 1: Verify Live Camera
      await engine.completeStep(incidentId, "step-1-live-verification", {
        stepId: "step-1-live-verification",
        actor: { userId: "usr-1", userName: "Operator A" },
        evidence: { cameraId: "cam-vault-01", viewDurationSeconds: 30 },
      });

      // Step 2: Review Evidence
      await engine.completeStep(incidentId, "step-2-review-evidence", {
        stepId: "step-2-review-evidence",
        actor: { userId: "usr-1", userName: "Operator A" },
        evidence: { clipId: "clip-01", snapshotId: "snap-01" },
      });

      // Step 5: Call Branch Manager
      await engine.completeStep(incidentId, "step-5-call-manager", {
        stepId: "step-5-call-manager",
        actor: { userId: "usr-1", userName: "Operator A" },
        result: { callStatus: "CONNECTED", managerSpokeWith: "Mr. Thomas (Branch Manager)" },
      });

      // Step 6: Notify Regional Security
      await engine.completeStep(incidentId, "step-6-notify-security", {
        stepId: "step-6-notify-security",
        actor: { userId: "usr-1", userName: "Operator A" },
        result: { notificationSent: true, channels: ["SMS", "PUSH"] },
      });

      // Step 7: Record Structured Operator Decision (Authorized Overtime Activity)
      const decision = await engine.recordDecision(incidentId, "step-7-decision-classification", {
        decisionType: "AUTHORIZED_ACTIVITY",
        chosenOption: "AUTHORIZED_ACTIVITY",
        confidence: "CONFIRMED",
        operatorNotes: "Branch manager confirmed authorized currency loading team entered vault with scheduled work permit.",
        evidenceId: "clip-01",
        actor: { userId: "usr-1", userName: "Operator A" },
      });

      expect(decision.chosenOption).toBe("AUTHORIZED_ACTIVITY");

      // Step 9: Resolution Gate Step
      await engine.completeStep(incidentId, "step-9-resolution-gate", {
        stepId: "step-9-resolution-gate",
        actor: { userId: "usr-1", userName: "Operator A" },
        result: { verifiedAllRequirements: true },
      });

      // Enforce Resolution -> Must succeed now because all mandatory steps are complete!
      await engine.resolveIncident(
        incidentId,
        { userId: "usr-1", userName: "Operator A" },
        "Authorized activity verified with branch manager. Vault secure.",
      );

      const instance = await instances.getByIncidentId(incidentId);
      expect(instance?.status).toBe("COMPLETED");

      // Verify audit trail shows INCIDENT_RESOLVED
      const timeline = await audit.getTimeline(incidentId);
      const resolveEvent = timeline.find((e) => e.eventType === "INCIDENT_RESOLVED");
      expect(resolveEvent).toBeDefined();
      expect(resolveEvent?.details?.completedStepsCount).toBeGreaterThanOrEqual(7);
    });
  });

  describe("Suite 5: Optimistic Concurrency Protection", () => {
    it("detects and rejects conflicting concurrent modifications by separate operators", async () => {
      const instance = await engine.startPlaybook({
        id: "inc-concurrent-001",
        tenantId: "tenant-bank-south",
        incidentType: "VAULT_INTRUSION",
        severity: "P1",
      });

      // Operator A loads instance version 1
      const copyA = await instances.getById(instance.instanceId);

      // Operator B loads instance version 1
      const copyB = await instances.getById(instance.instanceId);

      // Operator A saves modification (increments version to 2)
      copyA!.status = "BLOCKED";
      await instances.save(copyA!);

      // Operator B tries to save stale modification with version 1 -> Must throw conflict error
      copyB!.status = "WAITING";
      await expect(instances.save(copyB!)).rejects.toThrow(/Optimistic lock conflict/);
    });
  });

  describe("Suite 6: Unified Incident Workspace API State", () => {
    it("returns complete stateful workspace with allowed actions and blocked resolution reasons", async () => {
      const incident = {
        id: "inc-workspace-001",
        incidentNumber: "INC-88901",
        title: "P1 Vault Intrusion Detected",
        incidentType: "VAULT_INTRUSION",
        severity: "P1",
        status: "INVESTIGATING",
        branchId: "branch-034",
        cameraId: "cam-vault-01",
        occurredAt: new Date().toISOString(),
      };

      const workspace = await engine.getIncidentWorkspace(incident);

      expect(workspace.incident.id).toBe("inc-workspace-001");
      expect(workspace.playbook.playbookName).toBe("P1 Vault Intrusion & Breach Response");
      expect(workspace.steps.length).toBe(9);
      expect(workspace.allowedActions).toContain("START_STEP");
      expect(workspace.allowedActions).toContain("COMPLETE_STEP");
      expect(workspace.allowedActions).not.toContain("RESOLVE"); // Blocked until mandatory steps complete
      expect(workspace.blockedResolutionReasons?.length).toBeGreaterThan(0);
      expect(workspace.auditTimeline.length).toBeGreaterThan(0);
    });
  });
});
