/**
 * Report Service Interface
 *
 * Provides real report generation.
 * Replaces hardcoded report numbers.
 */
/**
 * Report type
 */
export var ReportType;
(function (ReportType) {
    ReportType["INCIDENT_SUMMARY"] = "INCIDENT_SUMMARY";
    ReportType["ANALYTICS_SUMMARY"] = "ANALYTICS_SUMMARY";
    ReportType["COMPLIANCE"] = "COMPLIANCE";
    ReportType["DAILY"] = "DAILY";
    ReportType["WEEKLY"] = "WEEKLY";
    ReportType["MONTHLY"] = "MONTHLY";
    ReportType["CUSTOM"] = "CUSTOM";
})(ReportType || (ReportType = {}));
