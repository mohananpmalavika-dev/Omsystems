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
                // Tight crops of hair can fool both models with near-certain scores.
                // Require the complete head in wider scene context as well. A failed
                // context check is contrary evidence, not permission to retry hair.
                const surrounding = await this.classifier.run(frame, expand(box, 0.75));
                if (!surrounding.wearingHelmet || surrounding.wearingHelmetConfidence < threshold)
                    continue;
                return { boundingBox: box, classificationConfidence: Math.min(head.wearingHelmetConfidence, context.wearingHelmetConfidence, surrounding.wearingHelmetConfidence),
                    localizationConfidence: candidate.confidence };
            }
            // A helmet shell may occupy the crown while the exposed face makes the
            // whole-head classifier negative. Only a separate helmet-labelled box
            // can support this path; bare-head localization cannot retry hair strips.
            if (candidate.label === "helmet" && box.height * 0.65 * frame.height >= 20) {
                const crown = { ...box, height: box.height * 0.65 };
                const result = await this.classifier.run(frame, crown);
                if (result?.wearingHelmet && result.wearingHelmetConfidence >= threshold) {
                    // Preserve exposed-face helmets, but include both sides of the
                    // shell and its boundary: an isolated dark crown is insufficient.
                    const x = Math.max(0, box.x - box.width * 0.3), y = Math.max(0, box.y - box.height * 0.15);
                    const shellContext = await this.classifier.run(frame, {
                        x, y, width: Math.min(1, box.x + box.width * 1.3) - x,
                        height: Math.min(1, crown.y + crown.height + box.height * 0.15) - y,
                    });
                    if (!shellContext.wearingHelmet || shellContext.wearingHelmetConfidence < threshold)
                        continue;
                    return { boundingBox: crown, classificationConfidence: Math.min(result.wearingHelmetConfidence, shellContext.wearingHelmetConfidence),
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
