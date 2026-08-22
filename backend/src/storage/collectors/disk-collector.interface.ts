import type { DiskEvidence, DiskEvidenceSource } from "../domain/disk-evidence.js";

export interface StorageTarget {
  recorderId: string;
  branchId: string;
  tenantId?: string | undefined;
  host: string;
  port?: number | undefined;
  credentials?: {
    username?: string | undefined;
    password?: string | undefined;
    token?: string | undefined;
  } | undefined;
  adapterInstance?: any | undefined;
}

export interface DiskHealthCollector {
  readonly source: DiskEvidenceSource;
  supports(target: StorageTarget): Promise<boolean>;
  collect(target: StorageTarget): Promise<DiskEvidence[]>;
}
