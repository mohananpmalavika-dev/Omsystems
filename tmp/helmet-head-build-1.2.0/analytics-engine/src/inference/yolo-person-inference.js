import { YoloDetectionInference } from "./yolo-detection-inference.js";
export class YoloPersonInference {
    inference;
    constructor(session, confidenceThreshold = 0.5, iouThreshold = 0.45) {
        // Reading only class zero works for both a one-class person model and a
        // standard COCO YOLO export, whose first class is person.
        this.inference = new YoloDetectionInference(session, {
            labels: ["person"],
            decoder: "yolov8",
            confidenceThreshold,
            iouThreshold,
        });
    }
    run(frame) {
        return this.inference.run(frame);
    }
}
