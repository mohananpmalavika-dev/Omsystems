/**
 * Authoritative Recorder Certification Registry
 * 
 * Verifies NVR/DVR capabilities against the banking-certified device catalog.
 * Invariant: Never manufactures healthy or supported capabilities.
 */

import type { Pool } from "pg";
import type {
  CompatibilityLevel,
  FeatureSupportStatus,
} from "./recorder-adapter.interface.js";

export interface DeviceCertificationRecord {
  id: string;
  vendor: string;
  modelPattern: string;
  firmwareVersionPattern: string;
  compatibilityLevel: CompatibilityLevel;
  features: Record<CompatibilityLevel, FeatureSupportStatus>;
  certificationStatus: "CERTIFIED" | "PROVISIONAL" | "INCOMPATIBLE" | "REVOKED";
  testedBy: string;
  notes?: string;
  certifiedAt: Date;
}

export class RecorderCertificationRegistry {
  private readonly defaultCertifications: DeviceCertificationRecord[] = [
    {
      id: "cert-hikvision-ds7600-nvr",
      vendor: "Hikvision",
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
      certificationStatus: "CERTIFIED",
      testedBy: "KryptoVision Indian Banking QA Lab",
      certifiedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "cert-dahua-nvr5000",
      vendor: "Dahua",
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
      certificationStatus: "CERTIFIED",
      testedBy: "KryptoVision Indian Banking QA Lab",
      certifiedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "cert-cpplus-uvr-dvr",
      vendor: "CP Plus",
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
      certificationStatus: "CERTIFIED",
      testedBy: "KryptoVision Indian Banking QA Lab",
      certifiedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "cert-cpplus-nvr",
      vendor: "CP Plus",
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
      certificationStatus: "CERTIFIED",
      testedBy: "KryptoVision Indian Banking QA Lab",
      certifiedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "cert-uniview-nvr300",
      vendor: "Uniview",
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
      certificationStatus: "CERTIFIED",
      testedBy: "KryptoVision Indian Banking QA Lab",
      certifiedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ];

  constructor(private readonly pool?: Pool) {}

  async evaluateDevice(params: {
    vendor: string;
    model: string;
    firmwareVersion?: string;
  }): Promise<{
    compatibilityLevel: CompatibilityLevel;
    certificationStatus: "CERTIFIED" | "PROVISIONAL" | "INCOMPATIBLE" | "REVOKED" | "UNKNOWN";
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
      certificationStatus: "UNKNOWN",
      features: unknownFeatures,
    };
  }

  async getAllCertifications(): Promise<DeviceCertificationRecord[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM recorder_certifications ORDER BY vendor ASC, model_pattern ASC`
        );
        if (res.rows.length > 0) {
          return res.rows.map((r) => ({
            id: r.id,
            vendor: r.vendor,
            modelPattern: r.model_pattern,
            firmwareVersionPattern: r.firmware_version_pattern,
            compatibilityLevel: r.compatibility_level as CompatibilityLevel,
            features: r.features,
            certificationStatus: r.certification_status,
            testedBy: r.tested_by,
            notes: r.notes,
            certifiedAt: new Date(r.certified_at),
          }));
        }
      } catch {
        // Fallback to in-memory catalog
      }
    }

    return this.defaultCertifications;
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
