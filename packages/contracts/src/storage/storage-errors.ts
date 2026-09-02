/**
 * Canonical Storage Error Hierarchy for Sentinel Grid
 */

export enum StorageErrorCode {
  STORAGE_FULL = "STORAGE_FULL",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  STORAGE_READ_ONLY = "STORAGE_READ_ONLY",
  STORAGE_IO_ERROR = "STORAGE_IO_ERROR",
  STORAGE_OFFLINE = "STORAGE_OFFLINE",
  STORAGE_TIMEOUT = "STORAGE_TIMEOUT",
  STORAGE_PERMISSION_DENIED = "STORAGE_PERMISSION_DENIED",
  STORAGE_CHECKSUM_MISMATCH = "STORAGE_CHECKSUM_MISMATCH",
  STORAGE_NOT_FOUND = "STORAGE_NOT_FOUND",
  LEGAL_HOLD_PROTECTED = "LEGAL_HOLD_PROTECTED",
  MOUNT_DISAPPEARED = "MOUNT_DISAPPEARED",
  STORAGE_CORRUPT = "STORAGE_CORRUPT",
}

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly storageNodeId?: string;
  readonly pathOrLocator?: string;
  readonly originalError?: unknown;

  constructor(
    code: StorageErrorCode,
    message: string,
    options?: {
      storageNodeId?: string;
      pathOrLocator?: string;
      originalError?: unknown;
    },
  ) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.storageNodeId = options?.storageNodeId;
    this.pathOrLocator = options?.pathOrLocator;
    this.originalError = options?.originalError;
  }
}

export class LegalHoldProtectedError extends StorageError {
  readonly segmentId: string;
  readonly holdId?: string;

  constructor(segmentId: string, holdId?: string, message?: string) {
    super(
      StorageErrorCode.LEGAL_HOLD_PROTECTED,
      message || `Recording segment '${segmentId}' is protected by active Legal Hold ${holdId || ""}. Deletion is forbidden.`,
      { pathOrLocator: segmentId },
    );
    this.name = "LegalHoldProtectedError";
    this.segmentId = segmentId;
    this.holdId = holdId;
  }
}

export class StorageFullError extends StorageError {
  constructor(storageNodeId?: string, pathOrLocator?: string, originalError?: unknown) {
    super(
      StorageErrorCode.STORAGE_FULL,
      `Storage node '${storageNodeId || "unknown"}' is full (ENOSPC/quota exceeded).`,
      { storageNodeId, pathOrLocator, originalError },
    );
    this.name = "StorageFullError";
  }
}

export class MountDisappearedError extends StorageError {
  constructor(mountPath: string, expectedRemote?: string) {
    super(
      StorageErrorCode.MOUNT_DISAPPEARED,
      `Storage mount at '${mountPath}' has disappeared (expected remote '${expectedRemote || "unknown"}'). Writes halted to prevent local disk overflow.`,
      { pathOrLocator: mountPath },
    );
    this.name = "MountDisappearedError";
  }
}

export class StorageChecksumMismatchError extends StorageError {
  readonly expectedSha256: string;
  readonly actualSha256: string;

  constructor(expectedSha256: string, actualSha256: string, pathOrLocator?: string) {
    super(
      StorageErrorCode.STORAGE_CHECKSUM_MISMATCH,
      `Storage integrity violation: Expected SHA-256 '${expectedSha256}', but computed '${actualSha256}'.`,
      { pathOrLocator },
    );
    this.name = "StorageChecksumMismatchError";
    this.expectedSha256 = expectedSha256;
    this.actualSha256 = actualSha256;
  }
}

/**
 * Maps OS system call error codes to canonical StorageErrorCode.
 */
export function mapSystemErrorToStorageErrorCode(err: any): StorageErrorCode {
  const code = err?.code || "";
  switch (code) {
    case "ENOSPC":
      return StorageErrorCode.STORAGE_FULL;
    case "EDQUOT":
      return StorageErrorCode.QUOTA_EXCEEDED;
    case "EROFS":
      return StorageErrorCode.STORAGE_READ_ONLY;
    case "EACCES":
    case "EPERM":
      return StorageErrorCode.STORAGE_PERMISSION_DENIED;
    case "ENOENT":
      return StorageErrorCode.STORAGE_NOT_FOUND;
    case "ETIMEDOUT":
    case "ETIME":
      return StorageErrorCode.STORAGE_TIMEOUT;
    case "EHOSTUNREACH":
    case "ENETUNREACH":
    case "ECONNREFUSED":
    case "ECONNRESET":
      return StorageErrorCode.STORAGE_OFFLINE;
    case "EIO":
    case "EMFILE":
    case "ENFILE":
    default:
      return StorageErrorCode.STORAGE_IO_ERROR;
  }
}
