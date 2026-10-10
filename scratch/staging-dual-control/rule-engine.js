const severityOrder = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };
export function sortedMatchingRules(rules, event) {
    const detectionTypes = new Set(eventDetectionTypes(event));
    const matches = rules
        .filter((rule) => rule.enabled && !["no-helmet", "person-counting", "occupancy-counting"].includes(rule.detectionType) && detectionTypes.has(rule.detectionType))
        .filter(rule => !["shutter-opened", "shutter-closed"].includes(event.detectionType) ||
        isConfirmedShutterTransition(event) && event.metadata?.shutterRuleId === rule.id)
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
export function eventDetectionTypes(event) {
    const types = [event.detectionType];
    if (event.detectionType === "shutter-opened" || event.detectionType === "shutter-closed")
        types.push("shutter-state");
    if (event.detectionType === "helmet" || event.detectionType === "helmet-worn") {
        types.push("helmet", "helmet-worn");
    }
    if (event.detectionType === "dual-control-verification" || event.detectionType === "dual-control-violation") {
        types.push("dual-control-verification", "dual-control-violation");
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
        return "Dual control violation detected";
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
    if (rule.detectionType === "dual-control-verification" || rule.detectionType === "dual-control-violation")
        return "Single person detected in vault area. Dual control policy requires minimum 2 authorized persons.";
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
    return event.objects.some((object) => rule.objectClasses.some((label) => object.label.toLowerCase() === label.toLowerCase() && object.confidence >= rule.minConfidence));
}
function directionMatches(rule, event) {
    if (rule.direction === "any")
        return true;
    return event.metadata?.direction === rule.direction;
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
    if (!rule.schedule.days.includes(day))
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
