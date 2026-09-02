/**
 * Canonical Storage Error Hierarchy for Sentinel Grid
 */
export var StorageErrorCode;
(function (StorageErrorCode) {
    StorageErrorCode["STORAGE_FULL"] = "STORAGE_FULL";
    StorageErrorCode["QUOTA_EXCEEDED"] = "QUOTA_EXCEEDED";
    StorageErrorCode["STORAGE_READ_ONLY"] = "STORAGE_READ_ONLY";
    StorageErrorCode["STORAGE_IO_ERROR"] = "STORAGE_IO_ERROR";
    StorageErrorCode["STORAGE_OFFLINE"] = "STORAGE_OFFLINE";
    StorageErrorCode["STORAGE_TIMEOUT"] = "STORAGE_TIMEOUT";
    StorageErrorCode["STORAGE_PERMISSION_DENIED"] = "STORAGE_PERMISSION_DENIED";
    StorageErrorCode["STORAGE_CHECKSUM_MISMATCH"] = "STORAGE_CHECKSUM_MISMATCH";
    StorageErrorCode["STORAGE_NOT_FOUND"] = "STORAGE_NOT_FOUND";
    StorageErrorCode["LEGAL_HOLD_PROTECTED"] = "LEGAL_HOLD_PROTECTED";
    StorageErrorCode["MOUNT_DISAPPEARED"] = "MOUNT_DISAPPEARED";
    StorageErrorCode["STORAGE_CORRUPT"] = "STORAGE_CORRUPT";
})(StorageErrorCode || (StorageErrorCode = {}));
export class StorageError extends Error {
    code;
    storageNodeId;
    pathOrLocator;
    originalError;
    constructor(code, message, options) {
        super(message);
        this.name = "StorageError";
        this.code = code;
        this.storageNodeId = options?.storageNodeId;
        this.pathOrLocator = options?.pathOrLocator;
        this.originalError = options?.originalError;
    }
}
export class LegalHoldProtectedError extends StorageError {
    segmentId;
    holdId;
    constructor(segmentId, holdId, message) {
        super(StorageErrorCode.LEGAL_HOLD_PROTECTED, message || `Recording segment '${segmentId}' is protected by active Legal Hold ${holdId || ""}. Deletion is forbidden.`, { pathOrLocator: segmentId });
        this.name = "LegalHoldProtectedError";
        this.segmentId = segmentId;
        this.holdId = holdId;
    }
}
export class StorageFullError extends StorageError {
    constructor(storageNodeId, pathOrLocator, originalError) {
        super(StorageErrorCode.STORAGE_FULL, `Storage node '${storageNodeId || "unknown"}' is full (ENOSPC/quota exceeded).`, { storageNodeId, pathOrLocator, originalError });
        this.name = "StorageFullError";
    }
}
export class MountDisappearedError extends StorageError {
    constructor(mountPath, expectedRemote) {
        super(StorageErrorCode.MOUNT_DISAPPEARED, `Storage mount at '${mountPath}' has disappeared (expected remote '${expectedRemote || "unknown"}'). Writes halted to prevent local disk overflow.`, { pathOrLocator: mountPath });
        this.name = "MountDisappearedError";
    }
}
export class StorageChecksumMismatchError extends StorageError {
    expectedSha256;
    actualSha256;
    constructor(expectedSha256, actualSha256, pathOrLocator) {
        super(StorageErrorCode.STORAGE_CHECKSUM_MISMATCH, `Storage integrity violation: Expected SHA-256 '${expectedSha256}', but computed '${actualSha256}'.`, { pathOrLocator });
        this.name = "StorageChecksumMismatchError";
        this.expectedSha256 = expectedSha256;
        this.actualSha256 = actualSha256;
    }
}
/**
 * Maps OS system call error codes to canonical StorageErrorCode.
 */
export function mapSystemErrorToStorageErrorCode(err) {
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
