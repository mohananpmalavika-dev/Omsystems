import { describe, it, expect } from "vitest";
import { DestructiveActionClassifier } from "../../qa-engine/src/safety/destructive-action-classifier.js";
import { FormClassifier } from "../../qa-engine/src/safety/form-classifier.js";
import { UrlPolicy } from "../../qa-engine/src/safety/url-policy.js";
import {
  encryptCredential,
  decryptCredential,
  maskSensitiveData,
  maskSensitiveObject,
} from "../../qa-engine/src/safety/credential-vault.js";

describe("QA Engine Safety - Destructive Action Classifier", () => {
  const classifier = new DestructiveActionClassifier();

  it("should block standard destructive keywords", () => {
    const dangerousActions = [
      "Delete Camera",
      "Remove Recorder",
      "Delete Recording",
      "Delete Evidence",
      "Release Legal Hold",
      "Factory Reset",
      "Format Storage",
      "Drop Table",
      "Purge Backups",
      "Wipe Device",
      "Terminate Session",
      "Restart Server",
    ];

    for (const action of dangerousActions) {
      const result = classifier.classify({ text: action });
      expect(result.classification).toBe("DESTRUCTIVE");
    }
  });

  it("should block dangerous HTTP DELETE method and dangerous URLs", () => {
    expect(classifier.classify({ httpMethod: "DELETE" }).classification).toBe("DESTRUCTIVE");
    expect(classifier.classify({ actionUrl: "/api/v1/cameras/cam-1/delete" }).classification).toBe("DESTRUCTIVE");
    expect(classifier.classify({ actionUrl: "/api/system/purge" }).classification).toBe("DESTRUCTIVE");
  });

  it("should allow safe navigation and read-only actions", () => {
    const safeActions = [
      "View Live Cameras",
      "Search Alerts",
      "Export PDF Report",
      "Open Storage Tab",
      "Refresh Health Telemetry",
    ];

    for (const action of safeActions) {
      const result = classifier.classify({ text: action, role: "button" });
      expect(result.classification).toBe("SAFE");
    }
  });

  it("should honor explicit administrator allow-list", () => {
    const customClassifier = new DestructiveActionClassifier(["delete test camera"]);
    expect(customClassifier.classify({ text: "delete test camera" }).classification).toBe("SAFE");
    expect(customClassifier.classify({ text: "delete production camera" }).classification).toBe("DESTRUCTIVE");
  });
});

describe("QA Engine Safety - Form Classifier", () => {
  const formClassifier = new FormClassifier();

  it("should classify search, filter, and pagination as SAFE", () => {
    const searchForm = formClassifier.classify({
      id: "camera-search-form",
      submitButtonText: "Search Cameras",
      inputNames: ["query", "branchId"],
    });
    expect(searchForm.classification).toBe("SAFE");
    expect(searchForm.canSubmit).toBe(true);

    const filterForm = formClassifier.classify({
      formHeading: "Filter Alerts by Date",
      submitButtonText: "Apply Filters",
      inputNames: ["startDate", "endDate"],
    });
    expect(filterForm.classification).toBe("SAFE");
    expect(filterForm.canSubmit).toBe(true);
  });

  it("should classify create, edit, modify forms as POTENTIALLY_MUTATING", () => {
    const userForm = formClassifier.classify({
      formHeading: "Create New User Account",
      submitButtonText: "Save User",
      inputNames: ["username", "email", "role"],
    });
    expect(userForm.classification).toBe("POTENTIALLY_MUTATING");
    expect(userForm.canSubmit).toBe(false);
  });

  it("should block destructive forms", () => {
    const wipeForm = formClassifier.classify({
      formHeading: "Factory Reset All Nodes",
      submitButtonText: "Wipe and Reset",
    });
    expect(wipeForm.classification).toBe("DESTRUCTIVE");
    expect(wipeForm.canSubmit).toBe(false);
  });
});

describe("QA Engine Safety - URL Policy", () => {
  const policy = new UrlPolicy("https://demo.kryptonlogic.com", ["kryptonlogic.com"], ["/logout"]);

  it("should allow internal URLs on target domain", () => {
    expect(policy.evaluate("https://demo.kryptonlogic.com/cameras").isAllowed).toBe(true);
    expect(policy.evaluate("/alerts", "https://demo.kryptonlogic.com").isAllowed).toBe(true);
  });

  it("should block external domains", () => {
    const result = policy.evaluate("https://google.com/search");
    expect(result.isAllowed).toBe(false);
    expect(result.isExternal).toBe(true);
  });

  it("should block forbidden schemes", () => {
    expect(policy.evaluate("javascript:alert(1)").isAllowed).toBe(false);
    expect(policy.evaluate("file:///etc/passwd").isAllowed).toBe(false);
    expect(policy.evaluate("data:text/html,<h1>Hello</h1>").isAllowed).toBe(false);
  });

  it("should block configured paths such as /logout", () => {
    expect(policy.evaluate("https://demo.kryptonlogic.com/logout").isAllowed).toBe(false);
  });
});

describe("QA Engine Safety - Credential Vault", () => {
  const secret = "test-secret-key-32-chars-long-123";

  it("should encrypt and decrypt credentials with AES-256-GCM", () => {
    const plaintext = "SuperSecretPassword123!";
    const encrypted = encryptCredential(plaintext, secret);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(":").length).toBe(3);

    const decrypted = decryptCredential(encrypted, secret);
    expect(decrypted).toBe(plaintext);
  });

  it("should mask sensitive headers, passwords, and tokens in strings", () => {
    const log = 'User login with password="MyPassword123" and Bearer eyJhbGciOiJIUzI1Ni...';
    const masked = maskSensitiveData(log);
    expect(masked).not.toContain("MyPassword123");
    expect(masked).toContain("[REDACTED]");
    expect(masked).toContain("[REDACTED_TOKEN]");
  });

  it("should mask sensitive keys in objects recursively", () => {
    const obj = {
      username: "admin",
      password: "secretpassword",
      nested: {
        apiKey: "api-key-xyz",
        token: "bearer-token-123",
      },
    };

    const masked = maskSensitiveObject(obj);
    expect(masked.username).toBe("admin");
    expect(masked.password).toBe("[REDACTED]");
    expect(masked.nested.apiKey).toBe("[REDACTED]");
    expect(masked.nested.token).toBe("[REDACTED]");
  });
});
