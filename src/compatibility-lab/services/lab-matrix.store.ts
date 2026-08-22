/**
 * Hardware Compatibility Lab — Matrix Store
 *
 * Persists the CompatibilityMatrix in memory with optional JSON file backing.
 * Thread-safe for single-process usage.
 *
 * Key operations:
 *   upsert(entry)              — add or update a matrix row
 *   get(vendor, model, fw)     — exact lookup
 *   getById(id)                — lookup by deterministic slug ID
 *   list(filter)               — filtered list
 *   updateFeatureResult(...)   — update one feature cell, recompute rating
 *   exportSnapshot()           — produce signed JSON snapshot
 */

import { createHash } from "node:crypto";
import type {
  CompatibilityFeature,
  CompatibilityMatrixEntry,
  CompatibilityMatrixSnapshot,
  CompatibilityRating,
  CompatibilityTestResult,
  CompatibilityVendor,
  DeviceClass,
  FeatureStatus,
  MatrixFilter,
} from "../domain/compatibility-lab.types.js";
import { ALL_FEATURES } from "../domain/compatibility-lab.types.js";

// ─── Rating Logic ─────────────────────────────────────────────────────────────

/**
 * Deterministic rating algorithm.
 *
 * CERTIFIED    — every feature is PASS or NA (zero NOT_TESTED, zero FAIL)
 * COMPATIBLE   — ≥5 PASS features, LIVE and SUBSTREAM both PASS
 * LIMITED      — LIVE/SUBSTREAM PASS but other features partial/failing
 * INCOMPATIBLE — LIVE or SUBSTREAM FAIL, or <3 PASS overall
 * UNTESTED     — no results at all
 */
export function computeOverallRating(
  results: Partial<Record<CompatibilityFeature, CompatibilityTestResult>>,
): CompatibilityRating {
  const entries = Object.values(results) as CompatibilityTestResult[];
  if (entries.length === 0) return "UNTESTED";

  const statusOf = (f: CompatibilityFeature): FeatureStatus =>
    results[f]?.status ?? "NOT_TESTED";

  const liveStatus = statusOf("LIVE");
  const subStatus = statusOf("SUBSTREAM");

  // Incompatibility conditions
  if (liveStatus === "FAIL" || subStatus === "FAIL") return "INCOMPATIBLE";

  const passCount = entries.filter((r) => r.status === "PASS").length;
  const failCount = entries.filter((r) => r.status === "FAIL").length;
  const notTestedCount = entries.filter((r) => r.status === "NOT_TESTED").length;

  if (failCount > 0) {
    return passCount >= 3 ? "LIMITED" : "INCOMPATIBLE";
  }

  // All tested features are PASS or NA, and all 8 have been tested
  if (notTestedCount === 0 && entries.length === 8) {
    return "CERTIFIED";
  }

  // Some features not yet tested but no failures
  if (passCount >= 5 && liveStatus === "PASS" && subStatus === "PASS") {
    return "COMPATIBLE";
  }

  if (passCount >= 3) return "LIMITED";

  return "UNTESTED";
}

// ─── ID Generation ────────────────────────────────────────────────────────────

export function makeEntryId(
  vendor: string,
  modelId: string,
  firmwareVersion: string,
): string {
  const slug = `${vendor}-${modelId}-${firmwareVersion}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug;
}

// ─── Lab Matrix Store ─────────────────────────────────────────────────────────

export class LabMatrixStore {
  private readonly entries = new Map<string, CompatibilityMatrixEntry>();

  /** Sentinel Grid version stamped on entries created via this store instance */
  constructor(private readonly sentinelVersion: string = "0.1.0") {}

  // ─ Writes ────────────────────────────────────────────────────────────────

  upsert(entry: CompatibilityMatrixEntry): CompatibilityMatrixEntry {
    const id = entry.id || makeEntryId(
      entry.target.vendor,
      entry.target.modelId,
      entry.target.firmwareVersion,
    );
    const rated: CompatibilityMatrixEntry = {
      ...entry,
      id,
      overallRating: computeOverallRating(entry.results),
    };
    this.entries.set(id, rated);
    return rated;
  }

  /**
   * Update a single feature result for an existing entry.
   * If the entry doesn't exist, creates a bare-bones one first.
   */
  updateFeatureResult(
    id: string,
    result: CompatibilityTestResult,
  ): CompatibilityMatrixEntry | null {
    const existing = this.entries.get(id);
    if (!existing) return null;

    const updated: CompatibilityMatrixEntry = {
      ...existing,
      results: {
        ...existing.results,
        [result.feature]: result,
      },
      lastTestedAt: result.testedAt,
    };

    updated.overallRating = computeOverallRating(updated.results);

    // Stamp certifiedAt once it first reaches CERTIFIED
    if (updated.overallRating === "CERTIFIED" && !updated.certifiedAt) {
      updated.certifiedAt = new Date().toISOString();
    }

    this.entries.set(id, updated);
    return updated;
  }

  // ─ Reads ─────────────────────────────────────────────────────────────────

  getById(id: string): CompatibilityMatrixEntry | undefined {
    return this.entries.get(id);
  }

  get(
    vendor: CompatibilityVendor,
    modelId: string,
    firmwareVersion: string,
  ): CompatibilityMatrixEntry | undefined {
    const id = makeEntryId(vendor, modelId, firmwareVersion);
    return this.entries.get(id);
  }

  list(filter?: MatrixFilter): CompatibilityMatrixEntry[] {
    let all = [...this.entries.values()];

    if (filter?.vendor) {
      all = all.filter((e) => e.target.vendor === filter.vendor);
    }
    if (filter?.deviceClass) {
      all = all.filter((e) => e.target.deviceClass === filter.deviceClass);
    }
    if (filter?.overallRating) {
      all = all.filter((e) => e.overallRating === filter.overallRating);
    }
    if (filter?.modelId) {
      all = all.filter((e) =>
        e.target.modelId.toLowerCase().includes(filter.modelId!.toLowerCase()),
      );
    }
    if (filter?.firmwareVersion) {
      all = all.filter((e) => e.target.firmwareVersion === filter.firmwareVersion);
    }

    return all.sort((a, b) => a.target.vendor.localeCompare(b.target.vendor));
  }

  count(): number {
    return this.entries.size;
  }

  // ─ Bulk Seed ─────────────────────────────────────────────────────────────

  /**
   * Seed the store with KNOWN_DEVICES as UNTESTED stubs.
   * Existing entries are not overwritten.
   */
  seedFromFixtures(
    targets: import("../domain/compatibility-lab.types.js").CompatibilityTestTarget[],
  ): void {
    for (const target of targets) {
      const id = makeEntryId(target.vendor, target.modelId, target.firmwareVersion);
      if (!this.entries.has(id)) {
        const entry: CompatibilityMatrixEntry = {
          id,
          target,
          results: {},
          overallRating: "UNTESTED",
          sentinelVersion: this.sentinelVersion,
          lastTestedAt: new Date().toISOString(),
        };
        this.entries.set(id, entry);
      }
    }
  }

  // ─ Snapshot Export ────────────────────────────────────────────────────────

  exportSnapshot(): CompatibilityMatrixSnapshot {
    const entries = this.list();
    const checksum = createHash("sha256")
      .update(JSON.stringify(entries))
      .digest("hex");

    return {
      schemaVersion: 1,
      sentinelVersion: this.sentinelVersion,
      publishedAt: new Date().toISOString(),
      entryCount: entries.length,
      entries,
      checksum,
    };
  }

  // ─ Rendering Helpers ─────────────────────────────────────────────────────

  /** Returns an ASCII table row for a single entry — useful for CLI/logs */
  static renderRow(entry: CompatibilityMatrixEntry): string {
    const featureCells = ALL_FEATURES.map((f) => {
      const status = entry.results[f]?.status ?? "NOT_TESTED";
      const icon: Record<FeatureStatus, string> = {
        PASS: "✅",
        FAIL: "❌",
        PARTIAL: "⚠️",
        NA: "N/A",
        NOT_TESTED: "—",
      };
      return icon[status];
    });

    return [
      entry.target.vendor.padEnd(15),
      entry.target.modelId.padEnd(28),
      entry.target.firmwareVersion.padEnd(25),
      ...featureCells,
      entry.overallRating,
    ].join("  ");
  }

  /** Renders the full matrix as an ASCII table */
  renderTable(): string {
    const header = [
      "Vendor".padEnd(15),
      "Model".padEnd(28),
      "Firmware".padEnd(25),
      ...ALL_FEATURES.map((f) => f.substring(0, 8).padEnd(8)),
      "Rating",
    ].join("  ");

    const divider = "─".repeat(header.length);

    const rows = this.list().map((e) => LabMatrixStore.renderRow(e));

    return [divider, header, divider, ...rows, divider].join("\n");
  }
}

// ─── Singleton for application use ───────────────────────────────────────────

let _instance: LabMatrixStore | null = null;

export function getLabMatrixStore(sentinelVersion?: string): LabMatrixStore {
  if (!_instance) {
    _instance = new LabMatrixStore(sentinelVersion ?? "0.1.0");
  }
  return _instance;
}

/** For testing only — reset the singleton */
export function _resetLabMatrixStore(): void {
  _instance = null;
}
