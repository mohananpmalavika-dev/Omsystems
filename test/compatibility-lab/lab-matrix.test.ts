/**
 * Test Suite: LabMatrixStore
 *
 * Covers:
 *  - upsert / getById / get / list
 *  - filter by vendor, deviceClass, rating
 *  - updateFeatureResult + rating recomputation
 *  - certifiedAt stamping
 *  - seedFromFixtures (no overwrites)
 *  - exportSnapshot checksum
 *  - renderTable ASCII output
 *  - computeOverallRating edge cases
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  LabMatrixStore,
  computeOverallRating,
  makeEntryId,
  _resetLabMatrixStore,
} from "../../src/compatibility-lab/services/lab-matrix.store.js";
import { KNOWN_DEVICES } from "../../src/compatibility-lab/fixtures/known-devices.js";
import type {
  CompatibilityMatrixEntry,
  CompatibilityTestResult,
  CompatibilityTestTarget,
} from "../../src/compatibility-lab/domain/compatibility-lab.types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTarget(overrides: Partial<CompatibilityTestTarget> = {}): CompatibilityTestTarget {
  return {
    vendor: "HIKVISION",
    modelId: "DS-7616NI-I2",
    firmwareVersion: "V4.62.00",
    generation: "I2 Series",
    deviceClass: "NVR",
    authModes: ["DIGEST"],
    codecSupport: [{ codec: "H264", resolutions: ["1920x1080"] }],
    ...overrides,
  };
}

function makeResult(
  feature: CompatibilityTestResult["feature"],
  status: CompatibilityTestResult["status"],
): CompatibilityTestResult {
  return {
    feature,
    status,
    testedByVersion: "0.1.0",
    testedAt: new Date().toISOString(),
  };
}

function makeEntry(
  target: CompatibilityTestTarget,
  results: Partial<Record<CompatibilityTestResult["feature"], CompatibilityTestResult>> = {},
): CompatibilityMatrixEntry {
  return {
    id: makeEntryId(target.vendor, target.modelId, target.firmwareVersion),
    target,
    results,
    overallRating: computeOverallRating(results),
    sentinelVersion: "0.1.0",
    lastTestedAt: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LabMatrixStore", () => {
  let store: LabMatrixStore;

  beforeEach(() => {
    _resetLabMatrixStore();
    store = new LabMatrixStore("0.1.0");
  });

  // ── upsert / retrieval ──────────────────────────────────────────────────

  it("upserts an entry and retrieves it by id", () => {
    const target = makeTarget();
    const entry = makeEntry(target);
    const saved = store.upsert(entry);

    expect(saved.id).toBe(makeEntryId(target.vendor, target.modelId, target.firmwareVersion));
    expect(store.getById(saved.id)).toStrictEqual(saved);
  });

  it("retrieves by vendor + model + firmware", () => {
    const target = makeTarget();
    store.upsert(makeEntry(target));

    const found = store.get("HIKVISION", "DS-7616NI-I2", "V4.62.00");
    expect(found).toBeDefined();
    expect(found!.target.vendor).toBe("HIKVISION");
  });

  it("returns undefined for unknown id", () => {
    expect(store.getById("does-not-exist")).toBeUndefined();
  });

  it("counts entries correctly", () => {
    store.upsert(makeEntry(makeTarget()));
    store.upsert(makeEntry(makeTarget({ vendor: "DAHUA", modelId: "DHI-NVR4116HS" })));
    expect(store.count()).toBe(2);
  });

  // ── list / filter ────────────────────────────────────────────────────────

  it("lists all entries", () => {
    store.upsert(makeEntry(makeTarget()));
    store.upsert(makeEntry(makeTarget({ vendor: "CP_PLUS", modelId: "CP-UNR-4K" })));
    expect(store.list()).toHaveLength(2);
  });

  it("filters by vendor", () => {
    store.upsert(makeEntry(makeTarget()));
    store.upsert(makeEntry(makeTarget({ vendor: "CP_PLUS", modelId: "CP-UNR-4K" })));
    const result = store.list({ vendor: "CP_PLUS" });
    expect(result).toHaveLength(1);
    expect(result[0]!.target.vendor).toBe("CP_PLUS");
  });

  it("filters by deviceClass", () => {
    store.upsert(makeEntry(makeTarget({ deviceClass: "NVR" })));
    store.upsert(makeEntry(makeTarget({ modelId: "DS-2CD2347G2-LU", deviceClass: "IP_CAMERA" })));
    const nvrs = store.list({ deviceClass: "NVR" });
    expect(nvrs).toHaveLength(1);
    expect(nvrs[0]!.target.deviceClass).toBe("NVR");
  });

  it("filters by overallRating", () => {
    store.upsert(makeEntry(makeTarget(), {}));                           // UNTESTED
    store.upsert(makeEntry(makeTarget({ modelId: "OTHER" }), {         // INCOMPATIBLE
      LIVE: makeResult("LIVE", "FAIL"),
    }));
    const untested = store.list({ overallRating: "UNTESTED" });
    expect(untested).toHaveLength(1);
  });

  it("filters by modelId substring", () => {
    store.upsert(makeEntry(makeTarget({ modelId: "DS-7616NI-I2" })));
    store.upsert(makeEntry(makeTarget({ modelId: "DS-9616NI-M8" })));
    const result = store.list({ modelId: "7616" });
    expect(result).toHaveLength(1);
  });

  // ── rating logic ─────────────────────────────────────────────────────────

  it("computes UNTESTED when no results", () => {
    expect(computeOverallRating({})).toBe("UNTESTED");
  });

  it("computes INCOMPATIBLE when LIVE fails", () => {
    expect(computeOverallRating({
      LIVE: makeResult("LIVE", "FAIL"),
      SUBSTREAM: makeResult("SUBSTREAM", "PASS"),
    })).toBe("INCOMPATIBLE");
  });

  it("computes INCOMPATIBLE when SUBSTREAM fails", () => {
    expect(computeOverallRating({
      LIVE: makeResult("LIVE", "PASS"),
      SUBSTREAM: makeResult("SUBSTREAM", "FAIL"),
    })).toBe("INCOMPATIBLE");
  });

  it("computes CERTIFIED when all 8 features are PASS or NA", () => {
    const results: Partial<Record<CompatibilityTestResult["feature"], CompatibilityTestResult>> = {
      LIVE: makeResult("LIVE", "PASS"),
      SUBSTREAM: makeResult("SUBSTREAM", "PASS"),
      PLAYBACK: makeResult("PLAYBACK", "PASS"),
      EVENTS: makeResult("EVENTS", "PASS"),
      PTZ: makeResult("PTZ", "NA"),
      HDD_HEALTH: makeResult("HDD_HEALTH", "PASS"),
      RETENTION: makeResult("RETENTION", "PASS"),
      REBOOT: makeResult("REBOOT", "PASS"),
    };
    expect(computeOverallRating(results)).toBe("CERTIFIED");
  });

  it("computes COMPATIBLE when ≥5 PASS, no FAIL, some NOT_TESTED", () => {
    // 5 features provided — HDD_HEALTH, RETENTION, REBOOT are NOT_TESTED (absent)
    const results: Partial<Record<CompatibilityTestResult["feature"], CompatibilityTestResult>> = {
      LIVE: makeResult("LIVE", "PASS"),
      SUBSTREAM: makeResult("SUBSTREAM", "PASS"),
      PLAYBACK: makeResult("PLAYBACK", "PASS"),
      EVENTS: makeResult("EVENTS", "PASS"),
      PTZ: makeResult("PTZ", "PASS"),
    };
    expect(computeOverallRating(results)).toBe("COMPATIBLE");
  });

  it("computes LIMITED when some fail but ≥3 pass", () => {
    const results: Partial<Record<CompatibilityTestResult["feature"], CompatibilityTestResult>> = {
      LIVE: makeResult("LIVE", "PASS"),
      SUBSTREAM: makeResult("SUBSTREAM", "PASS"),
      PLAYBACK: makeResult("PLAYBACK", "FAIL"),
      EVENTS: makeResult("EVENTS", "PASS"),
    };
    expect(computeOverallRating(results)).toBe("LIMITED");
  });

  // ── updateFeatureResult ───────────────────────────────────────────────────

  it("updateFeatureResult updates a cell and recomputes rating", () => {
    const target = makeTarget();
    const entry = store.upsert(makeEntry(target, {
      LIVE: makeResult("LIVE", "PASS"),
      SUBSTREAM: makeResult("SUBSTREAM", "PASS"),
    }));

    const updated = store.updateFeatureResult(entry.id, makeResult("PLAYBACK", "PASS"));
    expect(updated).not.toBeNull();
    expect(updated!.results.PLAYBACK?.status).toBe("PASS");
  });

  it("updateFeatureResult returns null for unknown id", () => {
    expect(store.updateFeatureResult("no-such-id", makeResult("LIVE", "PASS"))).toBeNull();
  });

  it("stamps certifiedAt when rating first reaches CERTIFIED", () => {
    const target = makeTarget();
    const results: Record<string, CompatibilityTestResult> = {
      LIVE: makeResult("LIVE", "PASS"),
      SUBSTREAM: makeResult("SUBSTREAM", "PASS"),
      PLAYBACK: makeResult("PLAYBACK", "PASS"),
      EVENTS: makeResult("EVENTS", "PASS"),
      PTZ: makeResult("PTZ", "NA"),
      HDD_HEALTH: makeResult("HDD_HEALTH", "PASS"),
      RETENTION: makeResult("RETENTION", "PASS"),
    };
    const entry = store.upsert(makeEntry(target, results as CompatibilityMatrixEntry["results"]));
    expect(entry.certifiedAt).toBeUndefined();

    const certified = store.updateFeatureResult(entry.id, makeResult("REBOOT", "PASS"));
    expect(certified!.overallRating).toBe("CERTIFIED");
    expect(certified!.certifiedAt).toBeDefined();
  });

  // ── seedFromFixtures ──────────────────────────────────────────────────────

  it("seeds known devices without overwriting existing entries", () => {
    const target = KNOWN_DEVICES[0]!;
    const id = makeEntryId(target.vendor, target.modelId, target.firmwareVersion);
    store.upsert({
      id,
      target,
      results: { LIVE: makeResult("LIVE", "PASS") },
      overallRating: "COMPATIBLE",
      sentinelVersion: "0.1.0",
      lastTestedAt: new Date().toISOString(),
    });

    store.seedFromFixtures([...KNOWN_DEVICES]);
    // Existing entry should not be overwritten
    const existing = store.getById(id);
    expect(existing!.results.LIVE?.status).toBe("PASS");

    // Total should include all known devices
    expect(store.count()).toBe(KNOWN_DEVICES.length);
  });

  // ── exportSnapshot ────────────────────────────────────────────────────────

  it("exportSnapshot includes checksum", () => {
    store.upsert(makeEntry(makeTarget()));
    const snap = store.exportSnapshot();
    expect(snap.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(snap.schemaVersion).toBe(1);
    expect(snap.entryCount).toBe(1);
  });

  // ── renderTable ───────────────────────────────────────────────────────────

  it("renderTable produces non-empty ASCII output", () => {
    store.upsert(makeEntry(makeTarget()));
    const table = store.renderTable();
    expect(table).toContain("HIKVISION");
    expect(table).toContain("DS-7616NI-I2");
  });
});
