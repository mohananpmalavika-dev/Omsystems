import { describe, it, expect } from "vitest";
import { SiemWebhookDispatcherService } from "../../src/integrations/services/siem-webhook-dispatcher.service.js";

describe("Third-Party SIEM & Webhook Dispatcher (Phase 34)", () => {
  it("formats security events into CEF (Common Event Format) with correct severity mapping", () => {
    const siem = new SiemWebhookDispatcherService();

    const formatted = siem.formatPayload(
      {
        eventId: "ev-782",
        tenantId: "bank-alpha",
        branchId: "BR-400",
        severity: "P1",
        title: "Vault Door Forced Open",
        description: "Airlock physical sensor tripped without badge authorization",
        category: "VAULT_INTRUSION",
        timestamp: new Date("2026-09-12T12:00:00Z"),
      },
      "CEF"
    );

    expect(formatted).toContain("CEF:0|KryptoVision|EnterpriseVMS|1.0|VAULT_INTRUSION|Vault Door Forced Open|10|");
    expect(formatted).toContain("srcBranch=BR-400");
    expect(formatted).toContain("tenantId=bank-alpha");
  });

  it("formats security events into RFC 5424 Syslog format", () => {
    const siem = new SiemWebhookDispatcherService();

    const formatted = siem.formatPayload(
      {
        eventId: "ev-900",
        tenantId: "bank-alpha",
        branchId: "BR-007",
        severity: "P2",
        title: "Cash Counter Loitering",
        description: "Dwell time > 180 seconds detected",
        category: "LOITERING",
        timestamp: new Date("2026-09-12T12:00:00Z"),
      },
      "SYSLOG_RFC5424"
    );

    expect(formatted).toContain("<134>1 2026-09-12T12:00:00.000Z branch-BR-007 KryptoVision - ev-900");
    expect(formatted).toContain('severity="P2"');
  });

  it("dispatches events with cryptographically valid HMAC-SHA256 signatures", async () => {
    const siem = new SiemWebhookDispatcherService();
    const authSecret = "secret-key-soc-splunk-production-7781";

    siem.registerTarget({
      id: "tgt-splunk-1",
      tenantId: "bank-alpha",
      name: "Enterprise Splunk SIEM",
      targetType: "SPLUNK",
      endpointUrl: "https://splunk-hec.bank.internal/services/collector",
      authSecret,
      format: "JSON",
      enabled: true,
    });

    const result = await siem.dispatchEvent("tgt-splunk-1", {
      eventId: "ev-1001",
      tenantId: "bank-alpha",
      branchId: "BR-101",
      severity: "P1",
      title: "Armed Robbery Panic Button",
      description: "Teller 3 panic trigger active",
      category: "PANIC_BUTTON",
      timestamp: new Date("2026-09-12T12:00:00Z"),
    });

    expect(result.status).toBe("DELIVERED");
    expect(result.signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(result.payloadHash).toMatch(/^[0-9a-f]{64}$/);

    // Verify HMAC independently
    const expectedSig = siem.computeHmacSignature(result.formattedPayload, authSecret);
    expect(result.signature).toBe(expectedSig);
  });
});
