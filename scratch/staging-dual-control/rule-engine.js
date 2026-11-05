const severityOrder = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
export function sortedMatchingRules(rules, event) {
    const detectionTypes = new Set(eventDetectionTypes(event));
    const matches = rules
        .filter((rule) => rule.enabled && !["no-helmet", "person-counting", "occupancy-counting"].includes(rule.detectionType) && detectionTypes.has(rule.detectionType))
        .filter(rule => !["shutter-opened", "shutter-closed"].includes(event.detectionType) ||
        isConfirmedShutterTransition(event) && event.metadata?.shutterRuleId === rule.id)
        .filter((rule) => {
        if (rule.detectionType === "dual-control-verification" || rule.detectionType === "dual-control-violation") {
            if (event.metadata?.violation === "BRANCH_OPENING_MINIMUM_STAFF") {
                return true;
            }
            return isVaultCameraTarget(event, rule);
        }
        return true;
    })
        .filter((rule) => event.confidence >= rule.minConfidence)
        .filter((rule) => event.durationSeconds >= rule.minDurationSeconds)
        .filter((rule) => objectClassesMatch(rule, event))
        .filter((rule) => directionMatches(rule, event))
        .filter((rule) => zoneMatches(rule, event))
        .filter((rule) => isWithinSchedule(rule, event.occurredAt));
    // Older cameras may still have the generic helmet rule alongside the
    // dedicated indoor helmet-worn rule. They describe the same observation;
    // prefer the dedicated rule so a single person creates a single alarm.
    const hasHelmetWornRule = matches.some((rule) => rule.detectionType === "helmet-worn");
    return matches
        .filter((rule) => !hasHelmetWornRule || rule.detectionType !== "helmet")
        .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
}
export const DESIGNATED_VAULT_CAMERA_IDS = new Set([
    "ca035670-aeee-481e-b47c-3eea98344fc6", // Bettaih Channel 1
    "e79e2f24-7adf-4908-93fb-6438b2ceb24f", // Hajipur Channel 6
    "b9522b23-506b-4eb2-9b24-bb05fb0148db", // KOLLAM Channel 4
    "541745ca-3aa1-4a3a-ad79-9e36d9f74fe8", // PERAVARUNI Channel 7
    "4d74d7ad-6922-4af0-9f36-420b84879425", // Rajkot Channel 8
]);
export function isVaultCameraTarget(target, rule) {
    if (!target)
        return false;
    if (typeof target === "string") {
        if (DESIGNATED_VAULT_CAMERA_IDS.has(target))
            return true;
        const vaultRegex = /vault|strong[\s_]*room|locker|safe[\s_]*(?:deposit|room|door|locker)|currency[\s_]*chest|\bsafe\b/i;
        return vaultRegex.test(target) || /channel\s*8/i.test(target);
    }
    if (target.cameraId && DESIGNATED_VAULT_CAMERA_IDS.has(target.cameraId)) {
        return true;
    }
    const meta = target.metadata || {};
    const branchName = String(meta.branchName || meta.branch || "").toLowerCase();
    const cameraName = String(meta.cameraName || meta.name || target.name || "").toLowerCase();
    const channel = meta.channel ?? target.channel;
    // Branch-specific channel mapping for banking deployments
    const combinedContext = `${branchName} ${cameraName}`;
    if (combinedContext.includes("bettaih")) {
        return channel === 1 || channel === "1" || /channel\s*1\b/i.test(cameraName);
    }
    if (combinedContext.includes("hajipur")) {
        return channel === 6 || channel === "6" || /channel\s*6\b/i.test(cameraName);
    }
    if (combinedContext.includes("kollam")) {
        return channel === 4 || channel === "4" || /channel\s*4\b/i.test(cameraName);
    }
    if (combinedContext.includes("peravaruni") || combinedContext.includes("peravurani")) {
        return channel === 7 || channel === "7" || /channel\s*7\b/i.test(cameraName);
    }
    if (combinedContext.includes("rajkot")) {
        return channel === 8 || channel === "8" || /channel\s*8\b/i.test(cameraName);
    }
    const vaultRegex = /vault|strong[\s_]*room|locker|safe[\s_]*(?:deposit|room|door|locker)|currency[\s_]*chest|\bsafe\b/i;
    const targetStr = `${cameraName} ${meta.zone || ""} ${meta.zoneName || ""} ${meta.zoneType || ""} ${meta.channelName || ""} ${channel || ""} ${meta.location || ""} ${target.cameraId || ""} ${rule?.name || ""} ${rule?.zone?.name || ""}`;
    if (vaultRegex.test(targetStr)) {
        return true;
    }
    if (channel === 8 || channel === "8" || /channel\s*8\b/i.test(targetStr)) {
        return true;
    }
    return false;
}
export function eventDetectionTypes(event) {
    const types = [event.detectionType];
    if (event.detectionType === "shutter-opened" || event.detectionType === "shutter-closed")
        types.push("shutter-state");
    if (["helmet", "helmet-worn", "face-cover", "face_cover", "mask", "face-concealment", "helmet-face-cover"].includes(event.detectionType)) {
        types.push("helmet", "helmet-worn", "face-cover", "face_cover", "helmet-face-cover");
    }
    if (event.detectionType === "dual-control-verification" || event.detectionType === "dual-control-violation") {
        types.push("dual-control-verification", "dual-control-violation");
    }
    if (["queue", "queue-length", "queue_length", "queue_length_exceeded", "customer-queue-length", "queue-depth"].includes(event.detectionType)) {
        types.push("queue", "queue-length", "queue_length", "customer-queue-length");
    }
    if (["safe-door", "safe-door-open", "safe-door-opened", "safe_door_open", "door-open", "door_open", "door-state", "door_state", "vault-door-opened", "locker-door-opened"].includes(event.detectionType)) {
        types.push("safe-door", "door-state", "door-open", "zone");
    }
    if (["recording", "recording-failure", "recording_failure", "recording-gap", "recording_gap", "continuous-recording-failure", "stream-failure", "stream-failed"].includes(event.detectionType)) {
        types.push("recording", "recording-failure", "recording_failure", "recording-gap", "recording_gap", "RECORDING_FAILURE");
    }
    if (["locker-dwell", "locker-dwell-time", "locker-session", "locker_session", "locker_dwell", "dwell-time", "dwell_time"].includes(event.detectionType)) {
        types.push("locker-dwell", "locker-session", "person", "zone", "loitering");
    }
    if (["zone-reentry", "zone_reentry", "repeated-entry", "repeated_entry", "repeated-zone-entry", "repeated_zone_entry", "suspicious-reentry", "suspicious-repeated-entry"].includes(event.detectionType)) {
        types.push("zone-reentry", "repeated-entry", "zone", "loitering", "person");
    }
    if (["intrusion", "INTRUSION", "zone-intrusion", "zone_intrusion", "restricted-zone", "restricted_zone", "perimeter-intrusion", "perimeter_intrusion", "area-intrusion", "area_intrusion"].includes(event.detectionType)) {
        types.push("intrusion", "zone-intrusion", "zone", "person", "restricted-zone");
    }
    if (["unattended-object", "unattended_object", "left-object", "left_object", "abandoned-object", "abandoned_object", "unattended-baggage", "unattended_baggage", "suspicious-package", "suspicious_package"].includes(event.detectionType)) {
        types.push("unattended-object", "left-object", "abandoned-object", "object", "unattended-baggage", "suspicious-package");
    }
    if (["anpr", "ANPR", "vehicle", "VEHICLE", "cash-van", "cash_van", "unregistered-vehicle", "unregistered_vehicle", "license-plate", "license_plate", "anpr-detector", "vehicle-detector", "cash-van-dwell", "cash_van_dwell", "van-dwell", "van_dwell", "bay-dwell", "bay_dwell", "vehicle-dwell", "vehicle_dwell"].includes(event.detectionType)) {
        types.push("anpr", "vehicle", "cash-van", "unregistered-vehicle", "cash-van-dwell");
    }
    if (["crowd-density", "crowd_density", "crowd", "CROWD_DENSITY", "cash-counter-crowd", "crowd-count", "crowd_count", "overcrowding"].includes(event.detectionType)) {
        types.push("crowd-density", "crowd", "cash-counter-crowd", "person");
    }
    if (["occupancy", "vault-occupancy", "locker-occupancy", "max-occupancy", "vault_occupancy", "locker_occupancy", "over-occupancy"].includes(event.detectionType)) {
        types.push("occupancy", "vault-occupancy", "locker-occupancy", "max-occupancy", "person");
    }
    if (["line-crossing", "line_crossing", "tripwire", "tripwire-crossing", "directional-line-crossing", "virtual-boundary", "boundary-crossing"].includes(event.detectionType)) {
        types.push("line-crossing", "tripwire", "directional-line-crossing", "zone", "person");
    }
    if (["fall", "fall-detection", "person-fall", "medical-emergency", "medical-event", "man-down", "person-down", "FALL_DETECTION"].includes(event.detectionType)) {
        types.push("fall", "fall-detection", "person-fall", "medical-emergency", "medical-event", "man-down", "person", "zone");
    }
    if (["cash-handover", "handover", "pouch-handover", "cash-counter-object", "cash-counter-handover", "tray-handover", "teller-handover"].includes(event.detectionType)) {
        types.push("cash-handover", "handover", "cash-counter-object", "object");
    }
    if (["health", "camera-health", "camera-offline", "camera_offline", "device-offline", "device_offline", "offline"].includes(event.detectionType)) {
        types.push("health", "camera-health", "camera-offline", "camera_offline", "device-offline");
    }
    if (["camera-tamper", "camera-tampering", "tamper", "TAMPER", "scene-shift", "scene_shift", "camera_tamper", "defocus", "lens-obscuration"].includes(event.detectionType)) {
        types.push("camera-tamper", "camera-tampering", "tamper", "scene-shift");
    }
    if (event.detectionType === "anpr" && Array.isArray(event.metadata?.matches)) {
        const hasAlertingMatch = event.metadata.matches.some((value) => value !== null && typeof value === "object" && !Array.isArray(value) &&
            value.alertOnMatch !== false);
        if (hasAlertingMatch)
            types.push("watchlist-match");
    }
    if (["face", "face-detection", "face-recognition"].includes(event.detectionType)) {
        const identity = faceIdentity(event.metadata);
        const matched = identity !== null && typeof identity === "object" && !Array.isArray(identity) &&
            identity.matched === true;
        types.push(matched ? "face-recognition" : "unknown-person");
    }
    return types;
}
export function isConfirmedShutterTransition(event) {
    const opened = event.detectionType === "shutter-opened";
    const closed = event.detectionType === "shutter-closed";
    return (opened || closed) && event.metadata?.transitionConfirmed === true &&
        typeof event.metadata?.shutterRuleId === "string" &&
        event.metadata?.shutterState === (opened ? "open" : "closed") &&
        event.metadata?.previousShutterState === (opened ? "closed" : "open");
}
export function isTerminalAlertStatus(status) {
    return status === "resolved" || status === "false_alarm" || status === "suppressed";
}
export function analyticsAlertTitle(rule, metadata) {
    if (rule.detectionType === "person" && rule.schedule && rule.schedule.start > rule.schedule.end) {
        return "Person Detected after office hour";
    }
    if (rule.detectionType === "dual-control-verification" || rule.detectionType === "dual-control-violation") {
        if (metadata?.violation === "BRANCH_OPENING_MINIMUM_STAFF") {
            return "Branch Opening Dual-Control Violation";
        }
        return "Dual control violation detected";
    }
    if (rule.detectionType === "queue" || rule.detectionType === "queue-length" || rule.detectionType === "queue_length") {
        return "Customer Queue Length SLA Breached";
    }
    if (rule.detectionType === "helmet-worn" || rule.detectionType === "helmet" || rule.detectionType === "face-cover") {
        const isMask = metadata?.faceCover === true || metadata?.maskDetected === true || metadata?.threatType === "mask";
        return isMask ? "Face Cover / Mask Detected Inside Facility" : "Security Alert: Helmet / Face Cover Detected";
    }
    if (rule.detectionType === "safe-door" ||
        rule.detectionType === "safe-door-open" ||
        rule.name.toLowerCase().includes("safe / locker door") ||
        rule.name.toLowerCase().includes("safe door")) {
        return "Safe / Locker Door Opened - Continuous Surveillance Active";
    }
    if (rule.detectionType === "recording" ||
        rule.detectionType === "recording-failure" ||
        rule.detectionType === "RECORDING_FAILURE" ||
        rule.detectionType === "recording-gap" ||
        rule.name.toLowerCase().includes("recording failure") ||
        rule.name.toLowerCase().includes("continuous recording")) {
        return "Critical Alert: Continuous Recording Failure Detected";
    }
    if (rule.detectionType === "locker-dwell" ||
        rule.detectionType === "locker-session" ||
        rule.name.toLowerCase().includes("locker visit") ||
        rule.name.toLowerCase().includes("locker dwell")) {
        return "Excessive Locker Visit Dwell Time Exceeded";
    }
    if (rule.detectionType === "cash-handover" ||
        rule.name.toLowerCase().includes("cash counter handover") ||
        rule.name.toLowerCase().includes("handover event")) {
        return "Cash Counter Handover Event Recorded";
    }
    if (rule.detectionType === "health" ||
        rule.detectionType === "camera-offline" ||
        rule.name.toLowerCase().includes("camera offline")) {
        return "Critical Alert: Camera Offline in Business Hours";
    }
    if (rule.detectionType === "camera-tamper" ||
        rule.detectionType === "camera-tampering" ||
        rule.detectionType === "tamper" ||
        rule.name.toLowerCase().includes("tampering") ||
        rule.name.toLowerCase().includes("scene shift")) {
        return "Security Alert: Camera Tampering / Scene Shift Detected";
    }
    if (rule.detectionType === "zone-reentry" ||
        rule.name.toLowerCase().includes("repeated zone") ||
        rule.name.toLowerCase().includes("repeated entry")) {
        return "Suspicious Activity: Repeated Zone Re-entry Detected";
    }
    if (rule.detectionType === "intrusion" ||
        rule.detectionType === "zone-intrusion" ||
        rule.name.toLowerCase().includes("restricted zone intrusion") ||
        rule.name.toLowerCase().includes("zone intrusion")) {
        return "Critical Security Alert: Restricted Zone Intrusion Detected";
    }
    if (rule.detectionType === "unattended-object" ||
        rule.detectionType === "left-object" ||
        rule.detectionType === "abandoned-object" ||
        rule.name.toLowerCase().includes("unattended baggage") ||
        rule.name.toLowerCase().includes("left object") ||
        rule.name.toLowerCase().includes("unattended object")) {
        return "Security Alert: Unattended Baggage / Left Object Detected";
    }
    if (rule.detectionType === "cash-van-dwell" ||
        rule.detectionType === "van-dwell" ||
        rule.name.toLowerCase().includes("cash van excessive") ||
        rule.name.toLowerCase().includes("bay dwell time") ||
        rule.name.toLowerCase().includes("cash van dwell")) {
        return "Operations Alert: Cash Van Excessive Bay Dwell Time Exceeded";
    }
    if (rule.detectionType === "anpr" ||
        rule.detectionType === "cash-van" ||
        rule.detectionType === "unregistered-vehicle" ||
        rule.name.toLowerCase().includes("unregistered vehicle") ||
        rule.name.toLowerCase().includes("unknown cash van") ||
        rule.name.toLowerCase().includes("cash bay")) {
        return "Critical Security Alert: Unregistered Vehicle in Cash Bay Detected";
    }
    if (rule.detectionType === "crowd-density" ||
        rule.detectionType === "crowd" ||
        rule.name.toLowerCase().includes("crowd density") ||
        rule.name.toLowerCase().includes("cash counter crowd") ||
        rule.name.toLowerCase().includes("crowd threshold")) {
        return "Operations Alert: Cash Counter Crowd Density Exceeded";
    }
    if (rule.detectionType === "occupancy" ||
        rule.detectionType === "vault-occupancy" ||
        rule.detectionType === "locker-occupancy" ||
        rule.detectionType === "max-occupancy" ||
        rule.name.toLowerCase().includes("maximum occupancy") ||
        rule.name.toLowerCase().includes("locker / vault maximum") ||
        rule.name.toLowerCase().includes("vault maximum occupancy")) {
        return "Critical Alert: Locker / Vault Maximum Occupancy Exceeded";
    }
    if (rule.detectionType === "line-crossing" ||
        rule.detectionType === "tripwire" ||
        rule.detectionType === "directional-line-crossing" ||
        rule.name.toLowerCase().includes("line crossing") ||
        rule.name.toLowerCase().includes("directional line") ||
        rule.name.toLowerCase().includes("tripwire")) {
        return "Security Alert: Directional Line Crossing Detected";
    }
    if (rule.detectionType === "fall" ||
        rule.detectionType === "fall-detection" ||
        rule.detectionType === "person-fall" ||
        rule.detectionType === "medical-emergency" ||
        rule.detectionType === "medical-event" ||
        rule.detectionType === "man-down" ||
        rule.name.toLowerCase().includes("person fall") ||
        rule.name.toLowerCase().includes("fall / medical") ||
        rule.name.toLowerCase().includes("medical event") ||
        rule.name.toLowerCase().includes("man down")) {
        return "Emergency Alert: Person Fall / Medical Emergency Detected";
    }
    if (rule.detectionType === "shutter-state")
        return metadata?.shutterState === "open" ? "Shutter opened" : "Shutter closed";
    if (rule.detectionType === "shutter-opened")
        return "Shutter opened";
    if (rule.detectionType === "shutter-closed")
        return "Shutter closed";
    if (rule.detectionType === "face-recognition") {
        const identity = faceIdentity(metadata);
        const name = identity && typeof identity === "object" && !Array.isArray(identity)
            ? identity.personName : undefined;
        return typeof name === "string" && name.trim()
            ? `${name.trim()} recognised`
            : "Known person recognised";
    }
    if (rule.detectionType === "unknown-person")
        return "Outsider detected";
    const label = rule.detectionType.replaceAll("-", " ");
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} detected`;
}
export function analyticsAlertDescription(rule, metadata) {
    if (rule.detectionType === "shutter-state")
        return `Shutter confirmed ${metadata?.shutterState === "open" ? "open" : "closed"} for rule "${rule.name}".`;
    if (rule.detectionType === "face-recognition") {
        const identity = faceIdentity(metadata);
        const name = identity && typeof identity === "object" && !Array.isArray(identity)
            ? identity.personName : undefined;
        return typeof name === "string" && name.trim()
            ? `${name.trim()} was recognised by this camera.`
            : "A known identity was recognised by this camera.";
    }
    if (rule.detectionType === "unknown-person")
        return "An unrecognised face was detected in this configured camera area.";
    if (rule.detectionType === "dual-control-verification" || rule.detectionType === "dual-control-violation") {
        if (metadata?.violation === "BRANCH_OPENING_MINIMUM_STAFF") {
            const count = metadata.staffCount ?? 1;
            const required = metadata.requiredStaff ?? 2;
            return `Branch opening dual-custody enforcement failure: ${count} person(s) opened/entered the branch during opening window when minimum ${required} authorized persons are required.`;
        }
        return "Single person detected in vault area. Dual control policy requires minimum 2 authorized persons.";
    }
    if (rule.detectionType === "queue" || rule.detectionType === "queue-length" || rule.detectionType === "queue_length") {
        const queueLen = metadata?.queueLength ?? metadata?.currentQueueLength ?? metadata?.current_queue_length ?? metadata?.length ?? metadata?.personCount;
        if (typeof queueLen === "number") {
            return `Customer queue length (${queueLen}) exceeded service SLA threshold.`;
        }
        if (typeof metadata?.explanation === "string") {
            return metadata.explanation;
        }
        return `Customer queue length SLA breached for rule "${rule.name}".`;
    }
    if (rule.detectionType === "helmet-worn" || rule.detectionType === "helmet" || rule.detectionType === "face-cover") {
        const detail = metadata?.threatType || (metadata?.maskDetected ? "face mask" : (metadata?.helmetDetected ? "motorcycle helmet" : "identity concealment gear"));
        return `Person detected inside facility wearing ${detail} in violation of branch/ATM security policy.`;
    }
    if (rule.detectionType === "safe-door" ||
        rule.detectionType === "safe-door-open" ||
        rule.name.toLowerCase().includes("safe / locker door") ||
        rule.name.toLowerCase().includes("safe door")) {
        const doorName = metadata?.doorName || metadata?.sensorName || "Safe / strong-room door";
        return `${doorName} opened. Forensic high-priority continuous recording and SOC surveillance activated for rule "${rule.name}".`;
    }
    if (rule.detectionType === "recording" ||
        rule.detectionType === "recording-failure" ||
        rule.detectionType === "RECORDING_FAILURE" ||
        rule.detectionType === "recording-gap" ||
        rule.name.toLowerCase().includes("recording failure") ||
        rule.name.toLowerCase().includes("continuous recording")) {
        const gapSec = metadata?.gapSeconds ?? metadata?.recordingGapSeconds ?? metadata?.recording_gap_seconds ?? metadata?.gapDuration ?? metadata?.gapDurationSeconds ?? metadata?.durationSeconds;
        const gapInfo = typeof gapSec === "number" ? ` (${gapSec}s gap exceeds SLA threshold)` : "";
        const cameraName = metadata?.cameraName || metadata?.cameraId || "Camera stream";
        return `${cameraName} video segment write stream failed${gapInfo}. Continuous recording interrupted in violation of NBFC compliance policy.`;
    }
    if (rule.detectionType === "locker-dwell" ||
        rule.detectionType === "locker-session" ||
        rule.name.toLowerCase().includes("locker visit") ||
        rule.name.toLowerCase().includes("locker dwell")) {
        const dwellSec = metadata?.locker_session_duration_seconds ?? metadata?.lockerSessionDurationSeconds ?? metadata?.dwellSeconds ?? metadata?.dwellTimeSeconds ?? metadata?.dwell_time_seconds ?? metadata?.durationSeconds;
        const dwellMins = typeof dwellSec === "number" ? Math.round(dwellSec / 60) : 15;
        const zoneName = metadata?.zoneName || metadata?.areaName || "Locker / strong-room area";
        return `Customer session inside ${zoneName} reached ${dwellMins} minutes (exceeding maximum 15-minute operating threshold).`;
    }
    if (rule.detectionType === "cash-handover" ||
        rule.name.toLowerCase().includes("cash counter handover") ||
        rule.name.toLowerCase().includes("handover event")) {
        const counterName = metadata?.counterName || metadata?.zoneName || "Teller Cash Tray";
        const itemType = metadata?.objectClass || metadata?.itemType || "Package / Cash Pouch";
        return `${itemType} placement detected at ${counterName} for transaction audit correlation.`;
    }
    if (rule.detectionType === "health" ||
        rule.detectionType === "camera-offline" ||
        rule.name.toLowerCase().includes("camera offline")) {
        const cameraName = metadata?.cameraName || metadata?.cameraId || "Security CCTV camera";
        const duration = metadata?.offline_duration_seconds ?? metadata?.offlineDurationSeconds ?? metadata?.durationSeconds ?? metadata?.downtimeSeconds;
        const durInfo = typeof duration === "number" ? ` for ${Math.round(duration)}s` : "";
        return `${cameraName} dropped offline${durInfo} during active business hours. Continuous surveillance interrupted in violation of NBFC security SLA.`;
    }
    if (rule.detectionType === "camera-tamper" ||
        rule.detectionType === "camera-tampering" ||
        rule.detectionType === "tamper" ||
        rule.name.toLowerCase().includes("tampering") ||
        rule.name.toLowerCase().includes("scene shift")) {
        const cameraName = metadata?.cameraName || metadata?.cameraId || "Security CCTV camera";
        const tamperType = metadata?.tamperType || metadata?.tamper_type || "scene shift / optical obstruction";
        return `Physical camera tampering or ${tamperType} detected on ${cameraName}. Immediate security verification required.`;
    }
    if (rule.detectionType === "zone-reentry" ||
        rule.name.toLowerCase().includes("repeated zone") ||
        rule.name.toLowerCase().includes("repeated entry")) {
        const zoneName = metadata?.zoneName || metadata?.areaName || "Secure Perimeter / Restricted Zone";
        const count = metadata?.reentry_count_10m ?? metadata?.reentryCount10m ?? metadata?.reentryCount ?? metadata?.reentry_count ?? metadata?.count ?? 4;
        const windowMins = metadata?.windowMinutes ?? 10;
        const trackInfo = metadata?.trackId ? ` (Subject ID: ${metadata.trackId})` : "";
        return `Subject${trackInfo} repeatedly entered ${zoneName} (${count} times in ${windowMins} minutes). Potential surveillance or reconnaissance pattern detected.`;
    }
    if (rule.detectionType === "intrusion" ||
        rule.detectionType === "zone-intrusion" ||
        rule.name.toLowerCase().includes("restricted zone intrusion") ||
        rule.name.toLowerCase().includes("zone intrusion")) {
        const zoneName = metadata?.zoneName || metadata?.areaName || metadata?.zoneType || "Restricted Security Zone";
        const trackInfo = metadata?.trackId ? ` by subject ${metadata.trackId}` : "";
        return `Unauthorized presence or perimeter intrusion detected in ${zoneName}${trackInfo}. Immediate SOC verification and emergency protocol required.`;
    }
    if (rule.detectionType === "unattended-object" ||
        rule.detectionType === "left-object" ||
        rule.detectionType === "abandoned-object" ||
        rule.name.toLowerCase().includes("unattended baggage") ||
        rule.name.toLowerCase().includes("left object") ||
        rule.name.toLowerCase().includes("unattended object")) {
        const zoneName = metadata?.zoneName || metadata?.areaName || metadata?.zoneType || "monitored zone";
        const duration = Number(metadata?.stationary_duration_seconds ?? metadata?.stationaryDurationSec ?? metadata?.dwellTimeSeconds ?? metadata?.duration ?? 300);
        const durMin = Math.round(duration / 60);
        const itemType = metadata?.objectType || metadata?.label || "Baggage / package";
        return `Unattended ${itemType} detected stationary in ${zoneName} for ${durMin}m (>${duration}s). Potential security hazard or abandoned property requiring prompt inspection.`;
    }
    if (rule.detectionType === "cash-van-dwell" ||
        rule.detectionType === "van-dwell" ||
        rule.name.toLowerCase().includes("cash van excessive") ||
        rule.name.toLowerCase().includes("bay dwell time") ||
        rule.name.toLowerCase().includes("cash van dwell")) {
        const metaObj = (metadata?.metadata && typeof metadata.metadata === "object") ? { ...metadata.metadata, ...metadata } : metadata;
        const zoneName = metaObj?.zoneName || metaObj?.areaName || metaObj?.zoneType || "Cash Transfer / Loading Bay";
        const dwellSec = Number(metaObj?.dwell_time_seconds ??
            metaObj?.dwellTimeSeconds ??
            metaObj?.bay_dwell_seconds ??
            metaObj?.bayDwellSeconds ??
            metaObj?.van_dwell_seconds ??
            metaObj?.vanDwellSeconds ??
            metaObj?.durationSeconds ??
            1260);
        const dwellMins = Math.round(dwellSec / 60);
        const thresholdMins = Number(metaObj?.maxDwellMinutes ?? metaObj?.thresholdMinutes ?? 20);
        const plate = metaObj?.plateNumber || metaObj?.licensePlate || metaObj?.plate || "Armored Logistics Van";
        return `Armored logistics van (${plate}) exceeded turnaround limit in ${zoneName}: stationed for ${dwellMins}m (policy threshold: ${thresholdMins}m). Extended loading exposure in violation of cash operations SLA.`;
    }
    if (rule.detectionType === "anpr" ||
        rule.detectionType === "cash-van" ||
        rule.detectionType === "unregistered-vehicle" ||
        rule.name.toLowerCase().includes("unregistered vehicle") ||
        rule.name.toLowerCase().includes("unknown cash van") ||
        rule.name.toLowerCase().includes("cash bay")) {
        const metaObj = (metadata?.metadata && typeof metadata.metadata === "object") ? { ...metadata.metadata, ...metadata } : metadata;
        const zoneName = metaObj?.zoneName || metaObj?.areaName || metaObj?.zoneType || "Secure Cash Loading Bay";
        const plate = metaObj?.plateNumber || metaObj?.licensePlate || metaObj?.plate || "Unregistered / Unknown";
        const vehicleType = metaObj?.vehicleType || metaObj?.vehicleClass || "vehicle";
        return `Unregistered or unauthorized ${vehicleType} (Plate: ${plate}) entered ${zoneName}. Immediate security verification and escort protocol required.`;
    }
    if (rule.detectionType === "crowd-density" ||
        rule.detectionType === "crowd" ||
        rule.name.toLowerCase().includes("crowd density") ||
        rule.name.toLowerCase().includes("cash counter crowd") ||
        rule.name.toLowerCase().includes("crowd threshold")) {
        const metaObj = (metadata?.metadata && typeof metadata.metadata === "object") ? { ...metadata.metadata, ...metadata } : metadata;
        const zoneName = metaObj?.zoneName || metaObj?.areaName || metaObj?.zoneType || "Cash Counter Queue Area";
        const count = Number(metaObj?.person_count ?? metaObj?.personCount ?? metaObj?.crowd_count ?? metaObj?.crowdCount ?? metaObj?.occupancy ?? metaObj?.count ?? 6);
        const threshold = Number(metaObj?.crowdThreshold ?? metaObj?.maxAllowedCrowd ?? metaObj?.threshold ?? 5);
        const densityLevel = metaObj?.density_level || metaObj?.densityLevel || metaObj?.density || (count >= 8 ? "CRITICAL" : "CROWDED");
        return `Excessive crowd density detected in ${zoneName}: ${count} persons present (service threshold: ${threshold}, level: ${densityLevel}). Potential customer service bottleneck and counter rush risk.`;
    }
    if (rule.detectionType === "occupancy" ||
        rule.detectionType === "vault-occupancy" ||
        rule.detectionType === "locker-occupancy" ||
        rule.detectionType === "max-occupancy" ||
        rule.name.toLowerCase().includes("maximum occupancy") ||
        rule.name.toLowerCase().includes("locker / vault maximum") ||
        rule.name.toLowerCase().includes("vault maximum occupancy")) {
        const metaObj = (metadata?.metadata && typeof metadata.metadata === "object") ? { ...metadata.metadata, ...metadata } : metadata;
        const zoneName = metaObj?.zoneName || metaObj?.areaName || metaObj?.zoneType || "Locker / Vault Strong Room";
        const count = Number(metaObj?.person_count ?? metaObj?.personCount ?? metaObj?.occupancy ?? metaObj?.count ?? metaObj?.vault_occupancy ?? 3);
        const limit = Number(metaObj?.maxAllowedOccupancy ?? metaObj?.max_occupancy ?? metaObj?.threshold ?? 2);
        return `Maximum allowable occupancy exceeded inside ${zoneName}: ${count} persons present (authorized limit: ${limit} persons). Immediate security verification and dual-custody audit required.`;
    }
    if (rule.detectionType === "line-crossing" ||
        rule.detectionType === "tripwire" ||
        rule.detectionType === "directional-line-crossing" ||
        rule.name.toLowerCase().includes("line crossing") ||
        rule.name.toLowerCase().includes("directional line") ||
        rule.name.toLowerCase().includes("tripwire")) {
        const metaObj = (metadata?.metadata && typeof metadata.metadata === "object") ? { ...metadata.metadata, ...metadata } : metadata;
        const boundaryName = metaObj?.lineName || metaObj?.line_name || metaObj?.boundaryName || metaObj?.zoneName || metaObj?.areaName || "virtual perimeter boundary";
        const direction = metaObj?.direction || metaObj?.crossing_direction || metaObj?.line_crossing || metaObj?.lineCrossing || "A->B";
        const target = metaObj?.targetType || metaObj?.objectType || metaObj?.label || "Subject";
        return `${target} crossed ${boundaryName} in unauthorized direction (${direction}). Virtual perimeter boundary breach detected requiring security verification.`;
    }
    if (rule.detectionType === "fall" ||
        rule.detectionType === "fall-detection" ||
        rule.detectionType === "person-fall" ||
        rule.detectionType === "medical-emergency" ||
        rule.detectionType === "medical-event" ||
        rule.detectionType === "man-down" ||
        rule.name.toLowerCase().includes("person fall") ||
        rule.name.toLowerCase().includes("fall / medical") ||
        rule.name.toLowerCase().includes("medical event") ||
        rule.name.toLowerCase().includes("man down")) {
        const metaObj = (metadata?.metadata && typeof metadata.metadata === "object") ? { ...metadata.metadata, ...metadata } : metadata;
        const zoneName = metaObj?.zoneName || metaObj?.areaName || metaObj?.zoneType || "monitored branch facility";
        const subject = (metaObj?.trackId ? `Subject ${metaObj.trackId}` : "Individual");
        const motionlessSec = metaObj?.motionlessSeconds ?? metaObj?.motionless_seconds ?? metaObj?.motionlessDurationSeconds ?? 5;
        const fallType = metaObj?.fallType || metaObj?.fall_type || "sudden collapse";
        return `Critical Health & Safety Emergency: ${subject} fell (${fallType}) and remained motionless for >${motionlessSec}s in ${zoneName}. Immediate on-site medical assistance and SOC emergency protocol required.`;
    }
    return `Rule \"${rule.name}\" matched.`;
}
function faceIdentity(metadata) {
    const source = metadata?.identityMatch ?? metadata?.faceMatch;
    if (!source || typeof source !== "object" || Array.isArray(source))
        return undefined;
    const value = source;
    const candidate = value.candidate;
    const candidateName = candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? candidate.name : undefined;
    const similarity = [
        value.similarity,
        value.similarityScore,
        value.score,
        candidate && typeof candidate === "object" && !Array.isArray(candidate)
            ? candidate.similarity
            : undefined,
    ].find((score) => typeof score === "number" && Number.isFinite(score));
    return {
        ...value,
        // A candidate label alone is model output, not a verified identity.  Only
        // emit recognition rules after the source explicitly marks a match and it
        // clears the service's production confidence floor.
        matched: value.matched === true && similarity !== undefined && similarity >= 0.82,
        personName: typeof value.personName === "string" ? value.personName : candidateName,
    };
}
function objectClassesMatch(rule, event) {
    if (rule.objectClasses.length === 0)
        return true;
    if (["queue", "queue-length", "queue_length", "shutter-state", "shutter-opened", "shutter-closed", "dual-control-verification", "dual-control-violation", "helmet", "helmet-worn", "face-cover", "face_cover", "mask", "safe-door", "safe-door-open", "safe-door-opened", "safe_door_open", "door-open", "door_open", "door-state", "door_state", "recording", "recording-failure", "recording_failure", "recording-gap", "recording_gap", "RECORDING_FAILURE", "locker-dwell", "locker-session", "locker-dwell-time", "cash-handover", "handover", "cash-counter-object", "cash-counter-handover", "pouch-handover", "tray-handover", "health", "camera-health", "camera-offline", "camera_offline", "device-offline", "offline", "camera-tamper", "camera-tampering", "tamper", "TAMPER", "scene-shift", "zone-reentry", "zone_reentry", "repeated-entry", "repeated_entry", "repeated-zone-entry", "suspicious-reentry", "intrusion", "INTRUSION", "zone-intrusion", "zone_intrusion", "perimeter-intrusion", "restricted-zone", "unattended-object", "left-object", "abandoned-object", "unattended_object", "left_object", "abandoned_object", "unattended-baggage", "suspicious-package", "anpr", "ANPR", "vehicle", "VEHICLE", "cash-van", "cash_van", "unregistered-vehicle", "unregistered_vehicle", "license-plate", "cash-van-dwell", "cash_van_dwell", "van-dwell", "van_dwell", "bay-dwell", "bay_dwell", "vehicle-dwell", "crowd-density", "crowd_density", "crowd", "CROWD_DENSITY", "cash-counter-crowd", "crowd-count", "occupancy", "vault-occupancy", "locker-occupancy", "max-occupancy", "vault_occupancy", "locker_occupancy", "over-occupancy", "line-crossing", "line_crossing", "tripwire", "tripwire-crossing", "directional-line-crossing", "fall", "fall-detection", "person-fall", "medical-emergency", "medical-event", "man-down", "person-down", "FALL_DETECTION"].includes(event.detectionType) && event.objects.length === 0) {
        return true;
    }
    return event.objects.some((object) => {
        const objLabel = object.label.toLowerCase();
        return rule.objectClasses.some((label) => {
            const ruleLabel = label.toLowerCase();
            if (objLabel === ruleLabel)
                return object.confidence >= rule.minConfidence;
            if ((ruleLabel === "person" || ruleLabel === "people" || ruleLabel === "customer" || ruleLabel === "crowd") &&
                (objLabel === "person" || objLabel === "people" || objLabel === "customer" || objLabel === "visitor" || objLabel === "pedestrian" || objLabel === "crowd" || objLabel === "individual")) {
                return object.confidence >= rule.minConfidence;
            }
            if ((ruleLabel === "helmet" || ruleLabel === "face_cover" || ruleLabel === "mask" || ruleLabel === "face-cover") &&
                (objLabel === "helmet" || objLabel === "face_cover" || objLabel === "face-cover" || objLabel === "mask" || objLabel === "face_concealment" || objLabel === "headwear")) {
                return object.confidence >= rule.minConfidence;
            }
            if ((ruleLabel === "package" || ruleLabel === "cash_pouch" || ruleLabel === "pouch" || ruleLabel === "bag" || ruleLabel === "cash_tray" || ruleLabel === "tray" || ruleLabel === "cash" || ruleLabel === "backpack" || ruleLabel === "suitcase" || ruleLabel === "luggage" || ruleLabel === "box" || ruleLabel === "unattended_object" || ruleLabel === "object") &&
                (objLabel === "package" || objLabel === "cash_pouch" || objLabel === "pouch" || objLabel === "bag" || objLabel === "cash_tray" || objLabel === "tray" || objLabel === "cash" || objLabel === "box" || objLabel === "envelope" || objLabel === "backpack" || objLabel === "suitcase" || objLabel === "luggage" || objLabel === "handbag" || objLabel === "briefcase" || objLabel === "item")) {
                return object.confidence >= rule.minConfidence;
            }
            if ((ruleLabel === "vehicle" || ruleLabel === "car" || ruleLabel === "van" || ruleLabel === "truck" || ruleLabel === "cash_van" || ruleLabel === "armored_van") &&
                (objLabel === "vehicle" || objLabel === "car" || objLabel === "van" || objLabel === "truck" || objLabel === "pickup" || objLabel === "suv" || objLabel === "motorcycle" || objLabel === "bus" || objLabel === "cash_van" || objLabel === "armored_van" || objLabel === "automobile")) {
                return object.confidence >= rule.minConfidence;
            }
            return false;
        });
    });
}
function directionMatches(rule, event) {
    if (rule.direction === "any" || !rule.direction)
        return true;
    const evtDir = event.metadata?.direction || event.metadata?.crossing_direction || event.metadata?.line_crossing || event.metadata?.lineCrossing;
    if (!evtDir)
        return true;
    if (rule.direction === evtDir)
        return true;
    const normalize = (val) => {
        val = String(val).toUpperCase().trim();
        if (["A_TO_B", "A->B", "A_B", "A-B", "IN", "ENTRY"].includes(val))
            return "A_TO_B";
        if (["B_TO_A", "B->A", "B_A", "B-A", "OUT", "EXIT"].includes(val))
            return "B_TO_A";
        if (["BOTH", "BIDIRECTIONAL", "ANY", "EITHER"].includes(val))
            return "BOTH";
        return val;
    };
    const normRule = normalize(rule.direction);
    const normEvt = normalize(evtDir);
    if (normRule === "BOTH" || normEvt === "BOTH")
        return true;
    return normRule === normEvt;
}
function zoneMatches(rule, event) {
    if (!rule.zone)
        return true;
    const eventZoneId = event.metadata?.zoneId;
    return eventZoneId === undefined || eventZoneId === rule.zone.id;
}
function isWithinSchedule(rule, value) {
    if (!rule.schedule)
        return true;
    const instant = new Date(value);
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: rule.schedule.timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
    const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        .indexOf(parts.weekday ?? "");
    const dayMatches = rule.schedule.days.some((d) => d === day || (typeof d === "string" && d.toLowerCase() === (parts.weekday ?? "").toLowerCase()));
    if (!dayMatches)
        return false;
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    const start = minutes(rule.schedule.start);
    const end = minutes(rule.schedule.end);
    return start <= end
        ? minute >= start && minute < end
        : minute >= start || minute < end;
}
function minutes(value) {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
}
