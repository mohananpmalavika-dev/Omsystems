/**
 * Distributed State & Fencing Errors
 * 
 * Enforces production-truth: Redis failures fail-closed; stale operations rejected.
 */

export class DistributedStateUnavailableError extends Error {
  readonly statusCode = 503;
  readonly retryable = true;
  readonly code = "DISTRIBUTED_STATE_UNAVAILABLE";

  constructor(message = "Distributed state backend (Redis) is unavailable in clustered production mode") {
    super(message);
    this.name = "DistributedStateUnavailableError";
  }
}

export class StaleLeaseEpochError extends Error {
  readonly statusCode = 409;
  readonly retryable = false;
  readonly code = "STALE_LEASE_EPOCH";

  constructor(
    readonly currentEpoch: number,
    readonly requestedEpoch: number,
    message = `Side-effecting media operation rejected: requested epoch (${requestedEpoch}) is older than current epoch (${currentEpoch})`,
  ) {
    super(message);
    this.name = "StaleLeaseEpochError";
  }
}

export class NoHealthyMediaGatewayError extends Error {
  readonly statusCode = 503;
  readonly retryable = true;
  readonly code = "NO_HEALTHY_MEDIA_GATEWAY";

  constructor(message = "No healthy media gateway registered or available to service stream request") {
    super(message);
    this.name = "NoHealthyMediaGatewayError";
  }
}
