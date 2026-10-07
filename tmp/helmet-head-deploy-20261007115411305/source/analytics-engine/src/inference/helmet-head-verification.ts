import type { DetectionFrame, InferenceObject } from "../detectors/base-detector.js";
import type { HelmetClassificationFrameInference, ObjectFrameInference, PoseInference } from "./configured-model-inference.js";
import type { PoseDetection } from "./vision-specialty-inference.js";

type Box = InferenceObject["boundingBox"];
export interface VerifiedHelmetHead {
  boundingBox: Box;
  classificationConfidence: number;
  localizationConfidence: number;
  headEvidence?: boolean;
}
export interface HelmetHeadVerifier {
  usesHeadEvidence?(frame: DetectionFrame): boolean;
  verify(frame: DetectionFrame, person: Box, threshold: number): Promise<VerifiedHelmetHead | null>;
  verifyDirect?(frame: DetectionFrame, threshold: number): Promise<{ candidate: VerifiedHelmetHead; synthPerson: Box } | null>;
}

/** The person-crop classifier must agree with an independently located head. */
export class LocalizedHelmetHeadVerifier implements HelmetHeadVerifier {
  private readonly frames = new WeakMap<DetectionFrame, Promise<InferenceObject[]>>();
  private readonly faceFrames = new WeakMap<DetectionFrame, Promise<InferenceObject[]>>();
  private readonly poseFrames = new WeakMap<DetectionFrame, Promise<PoseDetection[]>>();

  constructor(
    private readonly localizer: ObjectFrameInference,
    private readonly classifier: HelmetClassificationFrameInference,
    private readonly faceDetector: ObjectFrameInference | null = null,
    private readonly poseEstimator: PoseInference | null = null,
    private readonly headClassifier: HelmetClassificationFrameInference | null = null,
    private readonly evidenceCameras: ReadonlySet<string> | null = null,
  ) {}

  usesHeadEvidence(frame: DetectionFrame): boolean {
    return !!this.headClassifier && (!this.evidenceCameras || this.evidenceCameras.has(frame.cameraId));
  }

  async verifyDirect(frame: DetectionFrame, threshold: number): Promise<{ candidate: VerifiedHelmetHead; synthPerson: Box } | null> {
    let pending = this.frames.get(frame);
    if (!pending) { pending = this.localizer.run(frame); this.frames.set(frame, pending); }
    const objects = await pending;

    if (this.usesHeadEvidence(frame)) return null; // Adapted evidence requires a real person box.

    // Direct frame fallback must ONLY consider explicit, localized helmets (never bare heads, never furniture).
    const helmetCandidates = objects.filter(o => o.label === "helmet" && (o.confidence ?? 0) >= 0.35);
    if (helmetCandidates.length === 0) return null;

    for (const h of helmetCandidates) {
      const box = h.boundingBox;
      if (![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
          box.width <= 0 || box.height <= 0 ||
          box.width * frame.width < 24 || box.height * frame.height < 24) {
        continue;
      }

      const synthPerson: Box = {
        x: Math.max(0, box.x - box.width * 0.5),
        y: box.y,
        width: Math.min(1 - box.x, box.width * 2),
        height: Math.min(1 - box.y, Math.max(0.25, box.height * 3.5)),
      };

      // Empty chair / furniture anti-false-alarm gate:
      // If a pose estimator is configured, require verified human presence (shoulders).
      // In an empty room or on an empty chair, there is no living human body.
      if (this.poseEstimator) {
        let posePending = this.poseFrames.get(frame);
        if (!posePending) {
          posePending = this.poseEstimator.run(frame);
          this.poseFrames.set(frame, posePending);
        }
        const poses = await posePending;
        const matchedPose = findMatchingPose(poses, synthPerson);
        if (!matchedPose) continue; // No human pose matched -> reject empty chair/furniture
        const kp = matchedPose.keypoints;
        const hasShoulders = (kp[5] && kp[5].confidence >= 0.35) || (kp[6] && kp[6].confidence >= 0.35);
        if (!hasShoulders) continue; // No human shoulders -> reject
      }

      const result = await this.verify(frame, synthPerson, threshold);
      if (result) return { candidate: result, synthPerson };
    }
    return null;
  }

  async verify(frame: DetectionFrame, person: Box, threshold: number): Promise<VerifiedHelmetHead | null> {
    let pending = this.frames.get(frame);
    if (!pending) { pending = this.localizer.run(frame); this.frames.set(frame, pending); }
    const objects = await pending;

    // A motorcycle helmet can be localized as a generic head. The dedicated
    // full-head model establishes helmet evidence; the generic label does not.
    // Keep this opt-in camera adaptation separate from the legacy hair crops.
    if (this.usesHeadEvidence(frame)) {
      const candidates = objects.filter(item => (item.label === "head" || item.label === "helmet") &&
        (item.confidence ?? 0) >= 0.35 && validHead(frame, person, item.boundingBox) &&
        item.boundingBox.x > 0.005 && item.boundingBox.y > 0.005 &&
        item.boundingBox.x + item.boundingBox.width < 0.995 &&
        item.boundingBox.y + item.boundingBox.height < 0.995);
      for (const candidate of candidates.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
        const head = await this.headClassifier!.run(frame, expand(candidate.boundingBox, 0.15));
        if (!head.wearingHelmet || head.wearingHelmetConfidence < threshold) continue;
        const context = await this.headClassifier!.run(frame, expand(candidate.boundingBox, 0.25));
        if (!context.wearingHelmet || context.wearingHelmetConfidence < threshold) continue;
        return { boundingBox: candidate.boundingBox, localizationConfidence: candidate.confidence!,
          classificationConfidence: Math.min(head.wearingHelmetConfidence, context.wearingHelmetConfidence), headEvidence: true };
      }
      // Do not override contrary complete-head evidence with legacy crown strips.
      return null;
    }

    // 1. POSE ESTIMATION (Keypoint Verification)
    // Filters out office chair backrests / tall furniture behind the person
    if (this.poseEstimator) {
      let posePending = this.poseFrames.get(frame);
      if (!posePending) {
        posePending = this.poseEstimator.run(frame);
        this.poseFrames.set(frame, posePending);
      }
      const poses = await posePending;
      const matchedPose = findMatchingPose(poses, person);
      if (matchedPose) {
        const kp = matchedPose.keypoints;
        const nose = (kp[0] && kp[0].confidence >= 0.4) ? kp[0] : undefined;
        const leftEar = (kp[3] && kp[3].confidence >= 0.5) ? kp[3] : undefined;
        const rightEar = (kp[4] && kp[4].confidence >= 0.5) ? kp[4] : undefined;
        const leftShoulder = (kp[5] && kp[5].confidence >= 0.4) ? kp[5] : undefined;
        const rightShoulder = (kp[6] && kp[6].confidence >= 0.4) ? kp[6] : undefined;

        // If ears are clearly visible with high confidence and unoccluded,
        // a full motorcycle helmet cannot be present.
        const earsClearlyExposed = (leftEar && leftEar.confidence >= 0.70) || (rightEar && rightEar.confidence >= 0.70);
        const hasExplicitHelmetBox = objects.some(o => o.label === "helmet" && (o.confidence ?? 0) >= 0.25 &&
          validHead(frame, person, o.boundingBox));

        if (earsClearlyExposed && !hasExplicitHelmetBox) {
          // Reject bare head masquerading as helmet
          return null;
        }

        // Chair backrest check: head must physically align with nose & shoulders
        if (nose && (leftShoulder || rightShoulder)) {
          const shoulderY = leftShoulder?.y ?? rightShoulder!.y;
          const headHeightEst = Math.abs(shoulderY - nose.y);
          // A valid helmet/head box must cover down to the eyes/nose region.
          // If the bottom of the box is above the nose or center is far above the skull, it is a chair headrest.
          const isChairBackrest = (candidateBox: Box) =>
            (candidateBox.y + candidateBox.height < nose.y) ||
            (candidateBox.y < nose.y - headHeightEst * 1.3 && (candidateBox.y + candidateBox.height / 2) < nose.y - headHeightEst * 0.7);
          const validCandidates = objects.filter(o => !isChairBackrest(o.boundingBox));
          if (validCandidates.length === 0 && objects.length > 0) {
            return null;
          }
        } else if (!nose && (leftShoulder || rightShoulder)) {
          // Chair backrest check when seen from behind (nose occluded/facing away):
          // A real head/helmet must sit close to the shoulders. A tall chair headrest extends far above.
          const shoulderY = Math.min(leftShoulder?.y ?? 1, rightShoulder?.y ?? 1);
          const isFloatingChairTop = (candidateBox: Box) =>
            (candidateBox.y + candidateBox.height < shoulderY - person.height * 0.12);
          const validCandidates = objects.filter(o => !isFloatingChairTop(o.boundingBox));
          if (validCandidates.length === 0 && objects.length > 0) {
            return null;
          }
        }
      }
    }

    // 2. FACE DETECTION (YuNet Cross-Verification)
    // An unoccluded, bare human face directly contradicts a full face-concealing helmet.
    // If a transparent/clear visor is worn, the face can be visible while the helmet shell
    // encloses the head and crown.
    if (this.faceDetector) {
      let facePending = this.faceFrames.get(frame);
      if (!facePending) {
        facePending = this.faceDetector.run(frame);
        this.faceFrames.set(frame, facePending);
      }
      const faces = await facePending;
      const visibleFace = faces.find(f => (f.confidence ?? 0) >= 0.65 && isInsidePersonHead(person, f.boundingBox));
      if (visibleFace) {
        // If an open face is detected, but there is NO localized helmet shell on the crown,
        // it is a bare-headed visitor/staff member.
        const hasHelmetCrown = objects.some(o => o.label === "helmet" &&
          (o.confidence ?? 0) >= 0.25 &&
          validHead(frame, person, o.boundingBox) &&
          o.boundingBox.y <= visibleFace.boundingBox.y + 0.05);
        if (!hasHelmetCrown) {
          return null;
        }
      }
    }

    // 3. HELMET LOCALIZER (YOLOv5)
    // Only independently localized helmet observations may establish helmet evidence.
    // Bare heads (label === "head") indicate an unhelmeted person and must never be promoted to a helmet.
    const candidates = objects.filter(item =>
      item.label === "helmet" && (item.confidence ?? 0) >= 0.25 &&
      validHead(frame, person, item.boundingBox));

    for (const candidate of candidates.sort((a,b) => (b.confidence ?? 0) - (a.confidence ?? 0))) {
      const box = candidate.boundingBox;
      const head = await this.classifier.run(frame, box);
      const context = await this.classifier.run(frame, expand(box, 0.15));
      if (head.wearingHelmet && context.wearingHelmet &&
          Math.min(head.wearingHelmetConfidence, context.wearingHelmetConfidence) >= threshold) {
        // Tight crops of hair can fool both models with near-certain scores.
        // Require the complete head in wider scene context as well. A failed
        // context check is contrary evidence, not permission to retry hair.
        const surrounding = await this.classifier.run(frame, expand(box, 0.75));
        if (!surrounding.wearingHelmet || surrounding.wearingHelmetConfidence < threshold) continue;
        return { boundingBox: box, classificationConfidence: Math.min(head.wearingHelmetConfidence,
          context.wearingHelmetConfidence, surrounding.wearingHelmetConfidence),
          localizationConfidence: candidate.confidence! };
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
          if (!shellContext.wearingHelmet || shellContext.wearingHelmetConfidence < threshold) continue;
          return { boundingBox: crown, classificationConfidence: Math.min(result.wearingHelmetConfidence,
            shellContext.wearingHelmetConfidence),
            localizationConfidence: candidate.confidence! };
        }
      }
    }
    return null;
  }
}

function isInsidePersonHead(person: Box, face: Box): boolean {
  const headTop = Math.max(0, person.y - person.height * 0.1);
  const headBottom = person.y + person.height * 0.45;
  const inY = face.y >= headTop && face.y <= headBottom;
  const inX = face.x >= person.x - person.width * 0.2 && (face.x + face.width) <= person.x + person.width * 1.2;
  return inY && inX;
}

function findMatchingPose(poses: PoseDetection[], person: Box): PoseDetection | undefined {
  if (!poses || poses.length === 0) return undefined;
  return poses.find(pose => {
    const left = Math.max(person.x, pose.boundingBox.x);
    const top = Math.max(person.y, pose.boundingBox.y);
    const right = Math.min(person.x + person.width, pose.boundingBox.x + pose.boundingBox.width);
    const bottom = Math.min(person.y + person.height, pose.boundingBox.y + pose.boundingBox.height);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const area = person.width * person.height;
    return (intersection / area) >= 0.25;
  });
}

function expand(box: Box, padding: number): Box {
  const x = Math.max(0, box.x - box.width * padding), y = Math.max(0, box.y - box.height * padding);
  const right = Math.min(1, box.x + box.width * (1 + padding));
  const bottom = Math.min(1, box.y + box.height * (1 + padding));
  return { x, y, width: right - x, height: bottom - y };
}
function validHead(frame: DetectionFrame, person: Box, head: Box) {
  if (![head.x,head.y,head.width,head.height].every(Number.isFinite) || head.width <= 0 || head.height <= 0 ||
      head.width * frame.width < 20 || head.height * frame.height < 20) return false;
  const region = { x:person.x, y:Math.max(0,person.y-person.height*.2), width:person.width,
    bottom:Math.min(1,person.y+person.height*.35) };
  const intersection = Math.max(0,Math.min(region.x+region.width,head.x+head.width)-Math.max(region.x,head.x)) *
    Math.max(0,Math.min(region.bottom,head.y+head.height)-Math.max(region.y,head.y));
  return intersection / (head.width * head.height) >= .75;
}
