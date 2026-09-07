# Third-party model notices

The analytics image provisions the listed general-purpose, face, and ANPR
models during its Docker build. They run locally through ONNX Runtime and do
not call a paid inference API.

## YOLOX Tiny COCO object detector

- Project: Megvii YOLOX
- Upstream: https://github.com/Megvii-BaseDetection/YOLOX
- Artifact: official `0.1.1rc0` `yolox_tiny.onnx` release asset
- License: Apache License 2.0
- SHA-256: `427cc366d34e27ff7a03e2899b5e3671425c262ea2291f88bb942bc1cc70b0f7`

The internal manifest id remains `yolov8n` for backward compatibility with
existing rule/scheduler records. The loaded implementation is YOLOX Tiny; the
runtime health inventory reports its actual model name and decoder.

## Face detection and embeddings

- Detector: OpenCV Zoo YuNet `face_detection_yunet_2023mar.onnx`
- Upstream: https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet
- License: MIT
- SHA-256: `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`
- Embedding: OpenCV Zoo SFace `face_recognition_sface_2021dec_int8.onnx`
- Upstream: https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface
- License: Apache License 2.0
- SHA-256: `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a`

YuNet's five landmarks are retained and used to align the input for SFace.
Face matching must be enabled only with a lawful basis, clear notice, consent
where applicable, strict retention, and access controls.

## Automatic number-plate recognition (ANPR)

- Detector: OpenCV Zoo LPD-YuNet `license_plate_detection_lpd_yunet_2023mar.onnx`
- Upstream: https://github.com/opencv/opencv_zoo/tree/main/models/license_plate_detection_yunet
- License: Apache License 2.0
- SHA-256: `6d4978a7b6d25514d5e24811b82bfb511d166bdd8ca3b03aa63c1623d4d039c7`
- Recognizer: OpenCV Zoo CRNN `text_recognition_CRNN_EN_2022oct_int8.onnx`
- Upstream: https://github.com/opencv/opencv_zoo/tree/main/models/text_recognition_crnn
- License: Apache License 2.0
- SHA-256: `94117b4c2652337b3f1aef81b2ec15a74e97973b1c58f743e86380b95b95ffa2`

The CRNN emits digits and English letters. Plate watchlist alerts stay behind
the configured country-format validation and should be verified on deployed
cameras before operational use. The LPD-YuNet card notes its detector was
trained on Chinese plates, so Indian-camera validation is mandatory.

## Helmet compliance

- Classifier: PaddleClas PULC `safety_helmet_infer`
- Upstream: https://github.com/PaddlePaddle/PaddleClas/blob/release/2.6/docs/en/PULC/PULC_safety_helmet_en.md
- License: Apache License 2.0
- Source archive SHA-256: `6e7cff9c4e3f3966b1d964c7f27c47577d9b31d725a4c8b625e68cb9affdcaa7`
- Converted ONNX SHA-256: `8c87834e2fde4eb29723483cdecedf78c231cf7e6da9913cf8227ba542b3f31f`

The Docker build converts the pinned official Paddle inference archive with
Paddle2ONNX 1.2.6, verifies both hashes, and runs the resulting classifier
locally. It receives the upper-body/head crop of a YOLOX-detected rider and
returns either `wearing_helmet` or `unwearing_helmet`; it does not use a paid
cloud service. Production validation on representative cameras is still
required before using violation alerts operationally.
