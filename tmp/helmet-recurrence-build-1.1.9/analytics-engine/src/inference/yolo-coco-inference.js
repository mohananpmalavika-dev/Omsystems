import { YoloDetectionInference, } from "./yolo-detection-inference.js";
/** Standard COCO label order shared by the supported YOLO ONNX exports. */
export const COCO_LABELS = [
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
    "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
    "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
    "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
    "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
    "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed",
    "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven",
    "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
];
export class YoloCocoInference {
    inference;
    constructor(session, confidenceThreshold = 0.5, iouThreshold = 0.45, model = {}) {
        this.inference = new YoloDetectionInference(session, {
            labels: COCO_LABELS,
            decoder: model.decoder ?? "yolov8",
            preprocessor: model.preprocessor,
            inputWidth: model.inputWidth,
            inputHeight: model.inputHeight,
            confidenceThreshold,
            iouThreshold,
        });
    }
    run(frame) {
        return this.inference.run(frame);
    }
}
