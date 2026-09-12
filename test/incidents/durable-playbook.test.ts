import { describe, expect, it } from "vitest";
import { PostgresPlaybookDefinitionRepository } from "../../src/incidents/repositories/postgres-playbook-definition.repository.js";
import { PostgresPlaybookInstanceRepository } from "../../src/incidents/repositories/postgres-playbook-instance.repository.js";
import type { PlaybookInstance } from "../../src/incidents/domain/playbook.types.js";

describe("Durable Incident & SOP Engine (P0 Phase 4)", () => {
  describe("Playbook Definitions & Seeding", () => {
    it("returns seeded 10-step P1 Vault Intrusion SOP with mandatory banking steps", async () => {
      const repo = new PostgresPlaybookDefinitionRepository();
      const vaultP1 = await repo.getById("vault-intrusion-p1");

      expect(vaultP1).not.toBeNull();
      expect(vaultP1?.name).toBe("P1 Vault Intrusion & Breach Response");
      expect(vaultP1?.steps).toHaveLength(10);

      // Verify all 10 mandatory steps from specification
      const titles = vaultP1?.steps.map((s) => s.title);
      expect(titles).toContain("Verify Live Camera Stream");
      expect(titles).toContain("Review -15s / +30s Event Evidence");
      expect(titles).toContain("Verify Branch Operational Status");
      expect(titles).toContain("Query Access Control & Door Sensors");
      expect(titles).toContain("Call Branch Manager / Key Holder");
      expect(titles).toContain("Notify Regional Security Control Room");
      expect(titles).toContain("Escalate if Not Acknowledged Within SLA");
      expect(titles).toContain("Record Operator Classification & Threat Level");
      expect(titles).toContain("Capture Evidence Package");
      expect(titles).toContain("Mandatory Closure Reason");
    });

    it("locates playbook by trigger type and severity", async () => {
      const repo = new PostgresPlaybookDefinitionRepository();
      const found = await repo.findByTrigger("VAULT_INTRUSION", "P1");
      expect(found).not.toBeNull();
      expect(found?.id).toBe("vault-intrusion-p1");
    });
  });

  describe("Playbook Instance Optimistic Concurrency", () => {
    it("increments instance version on save", async () => {
      const instanceRepo = new PostgresPlaybookInstanceRepository();

      const instance: PlaybookInstance = {
        instanceId: "inst-test-01",
        incidentId: "inc-1001",
        tenantId: "t-bank-01",
        playbookId: "vault-intrusion-p1",
        playbookName: "P1 Vault Intrusion",
        playbookVersion: 1,
        status: "RUNNING",
        currentStepIds: ["step-1-live-verification"],
        completedStepIds: [],
        stepInstances: {},
        contextData: {},
        startedAt: new Date().toISOString(),
        version: 1,
      };

      await instanceRepo.save(instance);
      expect(instance.version).toBe(2);

      const loaded = await instanceRepo.getById("inst-test-01");
      expect(loaded?.version).toBe(2);
    });

    it("rejects concurrent conflicting modifications with optimistic lock error", async () => {
      const instanceRepo = new PostgresPlaybookInstanceRepository();

      const instance: PlaybookInstance = {
        instanceId: "inst-conflict-01",
        incidentId: "inc-1002",
        tenantId: "t-bank-01",
        playbookId: "vault-intrusion-p1",
        playbookName: "P1 Vault Intrusion",
        playbookVersion: 1,
        status: "RUNNING",
        currentStepIds: ["step-1"],
        completedStepIds: [],
        stepInstances: {},
        contextData: {},
        startedAt: new Date().toISOString(),
        version: 1,
      };

      await instanceRepo.save(instance); // version becomes 2

      // Operator B attempts to save with stale version 1
      const staleInstance: PlaybookInstance = {
        ...instance,
        version: 1,
      };

      await expect(instanceRepo.save(staleInstance)).rejects.toThrow(/Optimistic lock conflict/);
    });
  });
});
