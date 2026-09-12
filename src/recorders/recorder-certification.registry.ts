/**
 * Authoritative Recorder Certification Registry
 * 
 * Verifies NVR/DVR capabilities against the evidence-based banking certification catalog.
 * Invariant: Never manufactures fake certifications or fabricated QA test records.
 * Status values: UNVERIFIED | PROVISIONAL | TEST_REQUIRED | CERTIFIED | FAILED | DEPRECATED
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  CompatibilityLevel,
  FeatureSupportStatus,
} from "./recorder-adapter.interface.js";

export type DeviceCertificationStatus =
  | "UNVERIFIED"
  | "PROVISIONAL"
  | "TEST_REQUIRED"
  | "CERTIFIED"
  | "FAILED"
  | "DEPRECATED";

export interface DeviceCertificationResult {
  manufacturer: string;
  model: string;
  firmware: string;
  hardwareRevision?: string;
  serialNumber?: string;
  testSuiteVersion: string;
  testDate: Date;
  testOperator: string;
  testEnvironment: string;
  capabilities: Record<CompatibilityLevel, "PASS" | "FAIL" | "SKIP">;
  overall: DeviceCertificationStatus;
  evidenceLogFiles?: string[];
}

export interface DeviceCertificationRecord {
  id: string;
  vendor: string;
  manufacturer?: string;
  modelPattern: string;
  firmwareVersionPattern: string;
  hardwareRevision?: string;
  serialNumber?: string;
  testSuiteVersion?: string;
  testEnvironment?: string;
  testOperator?: string;
  evidenceLogFiles?: string[];
  compatibilityLevel: CompatibilityLevel;
  features: Record<CompatibilityLevel, FeatureSupportStatus>;
  certificationStatus: DeviceCertificationStatus;
  testedBy: string;
  notes?: string;
  certifiedAt?: Date;
  testDate?: Date;
}

export class RecorderCertificationRegistry {
  private readonly defaultCertifications: DeviceCertificationRecord[] = [
    {
      id: "cert-hikvision-ds7600-nvr",
      vendor: "Hikvision",
      manufacturer: "Hikvision Digital Technology",
      modelPattern: "DS-76*",
      firmwareVersionPattern: "V4.*",
      compatibilityLevel: "KV-C12",
      features: {
        "KV-C1": "SUPPORTED",
        "KV-C2": "SUPPORTED",
        "KV-C3": "SUPPORTED",
        "KV-C4": "SUPPORTED",
        "KV-C5": "SUPPORTED",
        "KV-C6": "SUPPORTED",
        "KV-C7": "SUPPORTED",
        "KV-C8": "SUPPORTED",
        "KV-C9": "SUPPORTED",
        "KV-C10": "SUPPORTED",
        "KV-C11": "SUPPORTED",
        "KV-C12": "SUPPORTED",
      },
      certificationStatus: "TEST_REQUIRED",
      testedBy: "UNTESTED - Physical Device Lab Run Required",
      notes: "Awaiting physical lab hardware execution of test suite KV-CERT-1.0",
    },
    {
      id: "cert-dahua-nvr5000",
      vendor: "Dahua",
      manufacturer: "Dahua Technology",
      modelPattern: "NVR5*",
      firmwareVersionPattern: "V4.000.*",
      compatibilityLevel: "KV-C11",
      features: {
        "KV-C1": "SUPPORTED",
        "KV-C2": "SUPPORTED",
        "KV-C3": "SUPPORTED",
        "KV-C4": "SUPPORTED",
        "KV-C5": "SUPPORTED",
        "KV-C6": "SUPPORTED",
        "KV-C7": "SUPPORTED",
        "KV-C8": "SUPPORTED",
        "KV-C9": "SUPPORTED",
        "KV-C10": "SUPPORTED",
        "KV-C11": "SUPPORTED",
        "KV-C12": "UNKNOWN",
      },
      certificationStatus: "TEST_REQUIRED",
      testedBy: "UNTESTED - Physical Device Lab Run Required",
      notes: "Awaiting physical lab hardware execution of test suite KV-CERT-1.0",
    },
    {
      id: "cert-cpplus-uvr-dvr",
      vendor: "CP Plus",
      manufacturer: "CP Plus India",
      modelPattern: "CP-UVR-*",
      firmwareVersionPattern: "*",
      compatibilityLevel: "KV-C8",
      features: {
        "KV-C1": "SUPPORTED",
        "KV-C2": "SUPPORTED",
        "KV-C3": "SUPPORTED",
        "KV-C4": "SUPPORTED",
        "KV-C5": "SUPPORTED",
        "KV-C6": "UNKNOWN",
        "KV-C7": "SUPPORTED",
        "KV-C8": "SUPPORTED",
        "KV-C9": "UNSUPPORTED",
        "KV-C10": "UNSUPPORTED",
        "KV-C11": "UNKNOWN",
        "KV-C12": "UNSUPPORTED",
      },
      certificationStatus: "TEST_REQUIRED",
      testedBy: "UNTESTED - Physical Device Lab Run Required",
      notes: "Legacy analog DVR profile requires bench validation",
    },
    {
      id: "cert-cpplus-nvr",
      vendor: "CP Plus",
      manufacturer: "CP Plus India",
      modelPattern: "CP-NVR-*",
      firmwareVersionPattern: "*",
      compatibilityLevel: "KV-C10",
      features: {
        "KV-C1": "SUPPORTED",
        "KV-C2": "SUPPORTED",
        "KV-C3": "SUPPORTED",
        "KV-C4": "SUPPORTED",
        "KV-C5": "SUPPORTED",
        "KV-C6": "SUPPORTED",
        "KV-C7": "SUPPORTED",
        "KV-C8": "SUPPORTED",
        "KV-C9": "SUPPORTED",
        "KV-C10": "SUPPORTED",
        "KV-C11": "UNKNOWN",
        "KV-C12": "UNKNOWN",
      },
      certificationStatus: "TEST_REQUIRED",
      testedBy: "UNTESTED - Physical Device Lab Run Required",
      notes: "Awaiting physical lab hardware execution of test suite KV-CERT-1.0",
    },
    {
      id: "cert-uniview-nvr300",
      vendor: "Uniview",
      manufacturer: "Uniview Technologies",
      modelPattern: "NVR30*",
      firmwareVersionPattern: "*",
      compatibilityLevel: "KV-C9",
      features: {
        "KV-C1": "SUPPORTED",
        "KV-C2": "SUPPORTED",
        "KV-C3": "SUPPORTED",
        "KV-C4": "SUPPORTED",
        "KV-C5": "SUPPORTED",
        "KV-C6": "SUPPORTED",
        "KV-C7": "SUPPORTED",
        "KV-C8": "SUPPORTED",
        "KV-C9": "SUPPORTED",
        "KV-C10": "UNKNOWN",
        "KV-C11": "UNSUPPORTED",
        "KV-C12": "UNKNOWN",
      },
      certificationStatus: "TEST_REQUIRED",
      testedBy: "UNTESTED - Physical Device Lab Run Required",
      notes: "Awaiting physical lab hardware execution of test suite KV-CERT-1.0",
    },
  ];

  private readonly testedCertifications: Map<string, DeviceCertificationRecord> = new Map();

  constructor(private readonly pool?: Pool) {}

  /**
   * Records a genuine physical hardware test result into the registry.
   * Only this method can grant CERTIFIED status based on real execution evidence.
   */
  async recordHardwareTestResult(result: DeviceCertificationResult): Promise<DeviceCertificationRecord> {
    const id = `cert-${result.manufacturer.toLowerCase()}-${result.model.toLowerCase()}-${randomUUID().substring(0, 8)}`;
    
    // Map pass/fail capabilities to FeatureSupportStatus
    const features: Record<CompatibilityLevel, FeatureSupportStatus> = {
      "KV-C1": result.capabilities["KV-C1"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C2": result.capabilities["KV-C2"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C3": result.capabilities["KV-C3"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C4": result.capabilities["KV-C4"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C5": result.capabilities["KV-C5"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C6": result.capabilities["KV-C6"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C7": result.capabilities["KV-C7"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C8": result.capabilities["KV-C8"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C9": result.capabilities["KV-C9"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C10": result.capabilities["KV-C10"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C11": result.capabilities["KV-C11"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
      "KV-C12": result.capabilities["KV-C12"] === "PASS" ? "SUPPORTED" : "UNSUPPORTED",
    };

    // Calculate highest passed compatibility level
    let highestLevel: CompatibilityLevel = "KV-C1";
    const levels: CompatibilityLevel[] = [
      "KV-C1", "KV-C2", "KV-C3", "KV-C4", "KV-C5", "KV-C6",
      "KV-C7", "KV-C8", "KV-C9", "KV-C10", "KV-C11", "KV-C12",
    ];
    for (const lvl of levels) {
      if (features[lvl] === "SUPPORTED") {
        highestLevel = lvl;
      }
    }

    const record: DeviceCertificationRecord = {
      id,
      vendor: result.manufacturer,
      manufacturer: result.manufacturer,
      modelPattern: result.model,
      firmwareVersionPattern: result.firmware,
      hardwareRevision: result.hardwareRevision,
      serialNumber: result.serialNumber,
      testSuiteVersion: result.testSuiteVersion,
      testEnvironment: result.testEnvironment,
      testOperator: result.testOperator,
      evidenceLogFiles: result.evidenceLogFiles,
      compatibilityLevel: highestLevel,
      features,
      certificationStatus: result.overall,
      testedBy: result.testOperator,
      notes: `Executed test suite ${result.testSuiteVersion} on ${result.testDate.toISOString()}`,
      certifiedAt: result.overall === "CERTIFIED" ? result.testDate : undefined,
      testDate: result.testDate,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO recorder_certifications (
             id, vendor, model_pattern, firmware_version_pattern, compatibility_level,
             features, certification_status, tested_by, notes, certified_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             features = EXCLUDED.features,
             certification_status = EXCLUDED.certification_status,
             tested_by = EXCLUDED.tested_by,
             certified_at = EXCLUDED.certified_at`,
          [
            record.id,
            record.vendor,
            record.modelPattern,
            record.firmwareVersionPattern,
            record.compatibilityLevel,
            JSON.stringify(record.features),
            record.certificationStatus,
            record.testedBy,
            record.notes,
            record.certifiedAt || null,
          ],
        );
      } catch (err) {
        console.warn("[RecorderCertificationRegistry] DB save certification error:", err);
      }
    }

    this.testedCertifications.set(id, record);
    return record;
  }

  async evaluateDevice(params: {
    vendor: string;
    model: string;
    firmwareVersion?: string;
  }): Promise<{
    compatibilityLevel: CompatibilityLevel;
    certificationStatus: DeviceCertificationStatus;
    features: Record<CompatibilityLevel, FeatureSupportStatus>;
    matchRecord?: DeviceCertificationRecord;
  }> {
    const list = await this.getAllCertifications();

    for (const cert of list) {
      if (
        this.vendorMatches(cert.vendor, params.vendor) &&
        this.patternMatches(cert.modelPattern, params.model)
      ) {
        if (
          !params.firmwareVersion ||
          this.patternMatches(cert.firmwareVersionPattern, params.firmwareVersion)
        ) {
          return {
            compatibilityLevel: cert.compatibilityLevel,
            certificationStatus: cert.certificationStatus,
            features: cert.features,
            matchRecord: cert,
          };
        }
      }
    }

    // Default uncertified/unknown device returns UNKNOWN for all features
    const unknownFeatures: Record<CompatibilityLevel, FeatureSupportStatus> = {
      "KV-C1": "UNKNOWN",
      "KV-C2": "UNKNOWN",
      "KV-C3": "UNKNOWN",
      "KV-C4": "UNKNOWN",
      "KV-C5": "UNKNOWN",
      "KV-C6": "UNKNOWN",
      "KV-C7": "UNKNOWN",
      "KV-C8": "UNKNOWN",
      "KV-C9": "UNKNOWN",
      "KV-C10": "UNKNOWN",
      "KV-C11": "UNKNOWN",
      "KV-C12": "UNKNOWN",
    };

    return {
      compatibilityLevel: "KV-C1",
      certificationStatus: "UNVERIFIED",
      features: unknownFeatures,
    };
  }

  async getAllCertifications(): Promise<DeviceCertificationRecord[]> {
    const all = [...this.testedCertifications.values()];
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM recorder_certifications ORDER BY vendor ASC, model_pattern ASC`
        );
        if (res.rows.length > 0) {
          const dbRecords = res.rows.map((r) => ({
            id: r.id,
            vendor: r.vendor,
            modelPattern: r.model_pattern,
            firmwareVersionPattern: r.firmware_version_pattern,
            compatibilityLevel: r.compatibility_level as CompatibilityLevel,
            features: typeof r.features === "string" ? JSON.parse(r.features) : r.features,
            certificationStatus: r.certification_status as DeviceCertificationStatus,
            testedBy: r.tested_by,
            notes: r.notes,
            certifiedAt: r.certified_at ? new Date(r.certified_at) : undefined,
          }));
          return [...dbRecords, ...all];
        }
      } catch {
        // Fallback to in-memory catalog
      }
    }

    return [...all, ...this.defaultCertifications];
  }

  private vendorMatches(certVendor: string, testVendor: string): boolean {
    return certVendor.trim().toLowerCase() === testVendor.trim().toLowerCase();
  }

  private patternMatches(pattern: string, value: string): boolean {
    if (pattern === "*") return true;
    const regexStr = "^" + pattern.replace(/\*/g, ".*") + "$";
    const regex = new RegExp(regexStr, "i");
    return regex.test(value);
  }
}

export const recorderCertificationRegistry = new RecorderCertificationRegistry();
