/**
 * System Health Service Interface
 *
 * Provides real system health aggregation.
 * Replaces hardcoded system status values.
 */
/**
 * Overall system health status
 */
export var SystemHealthStatus;
(function (SystemHealthStatus) {
    SystemHealthStatus["HEALTHY"] = "HEALTHY";
    SystemHealthStatus["DEGRADED"] = "DEGRADED";
    SystemHealthStatus["CRITICAL"] = "CRITICAL";
    SystemHealthStatus["UNKNOWN"] = "UNKNOWN";
})(SystemHealthStatus || (SystemHealthStatus = {}));
