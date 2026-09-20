import { createHash, randomUUID } from "node:crypto";
import type { EvidencePackage } from "../domain/forensic-evidence.types.js";
import type { EvidenceSigningProvider } from "../signing/evidence-signing-provider.js";
import { canonicalJsonStringify } from "./chain-of-custody.service.js";

export type ElectronicRecordCertificateStatus = "DRAFT" | "ISSUED" | "REVOKED";

export interface ElectronicRecordCertificate {
  id: string;
  jurisdiction: "IN-BSA-2023-S63";
  evidencePackageId: string;
  tenantId: string;
  branchId: string;
  status: ElectronicRecordCertificateStatus;
  recordDescription: string;
  productionMethod: string;
  deviceParticulars: string;
  section63Conditions: {
    lawfulControlAndRegularUse: boolean;
    ordinaryCourseInput: boolean;
    systemOperatingProperlyOrImpactDisclosed: boolean;
    outputDerivedInOrdinaryCourse: boolean;
    multiDeviceSystemDescription?: string;
  };
  custodian: {
    userId: string;
    name: string;
    designation: string;
    attestedAt: string;
  };
  artifactManifest: Array<{ path: string; sha256: string; sizeBytes: number; mimeType: string }>;
  evidenceManifestSha256: string;
  evidencePackageSignature: string;
  signature?: { algorithm: string; keyId: string; signatureBase64: string; publicKeyPem: string; signedAt: string };
  createdAt: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface CreateElectronicRecordCertificateInput {
  evidence: EvidencePackage;
  custodian: ElectronicRecordCertificate["custodian"];
  recordDescription: string;
  productionMethod: string;
  deviceParticulars: string;
  section63Conditions: ElectronicRecordCertificate["section63Conditions"];
}

/**
 * Creates a BSA section 63 certificate payload. It intentionally does not make
 * a legal-admissibility determination: that rests with the court and counsel.
 */
export class ElectronicRecordCertificateService {
  constructor(private readonly signingProvider: EvidenceSigningProvider) {}

  async issue(input: CreateElectronicRecordCertificateInput): Promise<ElectronicRecordCertificate> {
    if (input.evidence.status !== "SEALED" || !input.evidence.manifestHash || !input.evidence.signature) {
      throw new Error("A sealed, signed evidence package is required before a Section 63 certificate can be issued");
    }
    if (!input.custodian.userId || !input.custodian.name || !input.custodian.designation || !input.custodian.attestedAt) {
      throw new Error("A named system custodian must attest to the Section 63 conditions");
    }
    if (Object.values(input.section63Conditions).some((value) => value === false)) {
      throw new Error("All applicable Section 63 conditions must be affirmatively attested or the certificate cannot be issued");
    }
    const artifactManifest = input.evidence.artifacts.map((artifact) => ({
      path: artifact.path,
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      mimeType: artifact.mimeType,
    })).sort((a, b) => a.path.localeCompare(b.path));
    if (!artifactManifest.length || artifactManifest.some((item) => !/^[a-f0-9]{64}$/i.test(item.sha256))) {
      throw new Error("Section 63 certificates require at least one SHA-256-addressed evidence artifact");
    }
    const now = new Date().toISOString();
    const unsigned = {
      jurisdiction: "IN-BSA-2023-S63" as const,
      evidencePackageId: input.evidence.id,
      tenantId: input.evidence.tenantId,
      branchId: input.evidence.branchId,
      recordDescription: input.recordDescription,
      productionMethod: input.productionMethod,
      deviceParticulars: input.deviceParticulars,
      section63Conditions: input.section63Conditions,
      custodian: input.custodian,
      artifactManifest,
      evidenceManifestSha256: input.evidence.manifestHash,
      evidencePackageSignature: input.evidence.signature.signature,
    };
    const digest = createHash("sha256").update(canonicalJsonStringify(unsigned)).digest();
    const signed = await this.signingProvider.signDigest(digest);
    return {
      id: `BSA63-${randomUUID()}`,
      ...unsigned,
      status: "ISSUED",
      signature: {
        algorithm: signed.algorithm,
        keyId: signed.keyId,
        signatureBase64: signed.signature.toString("base64"),
        publicKeyPem: await this.signingProvider.getPublicKeyPem(),
        signedAt: now,
      },
      createdAt: now,
    };
  }

  async verify(certificate: ElectronicRecordCertificate): Promise<boolean> {
    if (certificate.status !== "ISSUED" || !certificate.signature) return false;
    const unsigned = {
      jurisdiction: certificate.jurisdiction,
      evidencePackageId: certificate.evidencePackageId,
      tenantId: certificate.tenantId,
      branchId: certificate.branchId,
      recordDescription: certificate.recordDescription,
      productionMethod: certificate.productionMethod,
      deviceParticulars: certificate.deviceParticulars,
      section63Conditions: certificate.section63Conditions,
      custodian: certificate.custodian,
      artifactManifest: certificate.artifactManifest,
      evidenceManifestSha256: certificate.evidenceManifestSha256,
      evidencePackageSignature: certificate.evidencePackageSignature,
    };
    const digest = createHash("sha256").update(canonicalJsonStringify(unsigned)).digest();
    return this.signingProvider.verify(digest, Buffer.from(certificate.signature.signatureBase64, "base64"), certificate.signature.keyId, certificate.signature.publicKeyPem);
  }
}
