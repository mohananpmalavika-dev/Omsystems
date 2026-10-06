/** The person-crop classifier must agree with an independently located head. */
export class LocalizedHelmetHeadVerifier {
    localizer;
    classifier;
    frames = new WeakMap();
    constructor(localizer, classifier) {
        this.localizer = localizer;
        this.classifier = classifier;
    }
    async verify(frame, person, threshold) {
        let pending = this.frames.get(frame);
        if (!pending) {
            pending = this.localizer.run(frame);
            this.frames.set(frame, pending);
        }
        const objects = await pending;
        // "head" localizes the visible head, including exposed faces underneath
        // helmets. The independent classifier must establish helmet evidence.
        const candidates = objects.filter(head => (head.label === "head" || head.label === "helmet") && (head.confidence ?? 0) >= 0.25 &&
            validHead(frame, person, head.boundingBox));
        for (const candidate of candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
            const box = candidate.boundingBox;
            const head = await this.classifier.run(frame, box);
            const context = await this.classifier.run(frame, expand(box, 0.15));
            if (head.wearingHelmet && context.wearingHelmet &&
                Math.min(head.wearingHelmetConfidence, context.wearingHelmetConfidence) >= threshold) {
                return { boundingBox: box, classificationConfidence: Math.min(head.wearingHelmetConfidence, context.wearingHelmetConfidence),
                    localizationConfidence: candidate.confidence };
            }
            // A helmet shell may occupy the crown while the exposed face makes the
            // whole-head classifier negative. Only a separate helmet-labelled box
            // can support this path; bare-head localization cannot retry hair strips.
            if (candidate.label === "helmet" && box.height * 0.65 * frame.height >= 20) {
                const crown = { ...box, height: box.height * 0.65 };
                const result = await this.classifier.run(frame, crown);
                if (result?.wearingHelmet && result.wearingHelmetConfidence >= threshold) {
                    return { boundingBox: crown, classificationConfidence: result.wearingHelmetConfidence,
                        localizationConfidence: candidate.confidence };
                }
            }
        }
        return null;
    }
}
function expand(box, padding) {
    const x = Math.max(0, box.x - box.width * padding), y = Math.max(0, box.y - box.height * padding);
    const right = Math.min(1, box.x + box.width * (1 + padding));
    const bottom = Math.min(1, box.y + box.height * (1 + padding));
    return { x, y, width: right - x, height: bottom - y };
}
function validHead(frame, person, head) {
    if (![head.x, head.y, head.width, head.height].every(Number.isFinite) || head.width <= 0 || head.height <= 0 ||
        head.width * frame.width < 20 || head.height * frame.height < 20)
        return false;
    const region = { x: person.x, y: Math.max(0, person.y - person.height * .2), width: person.width,
        bottom: Math.min(1, person.y + person.height * .35) };
    const intersection = Math.max(0, Math.min(region.x + region.width, head.x + head.width) - Math.max(region.x, head.x)) *
        Math.max(0, Math.min(region.bottom, head.y + head.height) - Math.max(region.y, head.y));
    return intersection / (head.width * head.height) >= .75;
}
