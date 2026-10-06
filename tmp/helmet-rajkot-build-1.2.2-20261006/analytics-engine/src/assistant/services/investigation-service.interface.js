/**
 * Investigation Service Interface
 *
 * Provides real investigation workflows with ReID and timeline.
 * Replaces fake track_123 generated stories.
 */
/**
 * Investigation status
 */
export var InvestigationStatus;
(function (InvestigationStatus) {
    InvestigationStatus["CREATED"] = "CREATED";
    InvestigationStatus["RUNNING"] = "RUNNING";
    InvestigationStatus["COMPLETED"] = "COMPLETED";
    InvestigationStatus["FAILED"] = "FAILED";
})(InvestigationStatus || (InvestigationStatus = {}));
