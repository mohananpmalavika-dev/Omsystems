/**
 * Camera Service Interfaces
 *
 * Domain service contracts for camera operations.
 * Commands use these to interact with real camera infrastructure.
 */
/**
 * Camera status
 */
export var CameraStatus;
(function (CameraStatus) {
    CameraStatus["ONLINE"] = "ONLINE";
    CameraStatus["OFFLINE"] = "OFFLINE";
    CameraStatus["STARTING"] = "STARTING";
    CameraStatus["STOPPING"] = "STOPPING";
    CameraStatus["ERROR"] = "ERROR";
    CameraStatus["UNKNOWN"] = "UNKNOWN";
})(CameraStatus || (CameraStatus = {}));
