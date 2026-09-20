import { RecordingIndexService } from "./recording-index.service.js";

export interface EvidenceExportPackage {
  packageId: string;
  incidentId?: string;
  branchId: string;
  cameraId: string;
  cameraName: string;
  incidentTimestamp: string;
  timeWindow: {
    from: string; // -15s
    to: string; // +30s
    totalDurationSeconds: number;
  };
  sealedMediaUrl: string;
  sha256Hash: string;
  signature: string;
  chainOfCustody: Array<{
    action: string;
    actor: string;
    timestamp: string;
  }>;
  status: "PACKAGED" | "SEALED" | "DOWNLOADED";
  createdAt: string;
}

export class EvidenceExportPipelineService {
  private packages = new Map<string, EvidenceExportPackage>();

  constructor(private recordingIndex: RecordingIndexService) {}

  /**
   * Export incident evidence window (-15s to +30s) strictly from RecordingIndex.
   * Never connects to active live stream.
   */
  async exportIncidentEvidence(input: {
    incidentId?: string;
    branchId: string;
    cameraId: string;
    cameraName?: string;
    incidentTime: string;
    requestedBy: string;
  }): Promise<EvidenceExportPackage> {
    const incidentTime = new Date(input.incidentTime).getTime();
    const from = new Date(incidentTime - 15 * 1000).toISOString();
    const to = new Date(incidentTime + 30 * 1000).toISOString();
    await this.recordingIndex.queryTimeline({
      cameraIds: [input.cameraId],
      from,
      to,
    });
    throw new Error(
      "EVIDENCE_EXPORT_PIPELINE_UNAVAILABLE: legacy metadata-only export is disabled; use the forensic evidence export worker so media bytes are hashed and signed",
    );
  }

  getPackage(packageId: string): EvidenceExportPackage | undefined {
    return this.packages.get(packageId);
  }
}
