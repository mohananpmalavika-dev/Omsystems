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

- Classifier: EfficientNet-B0 motorcycle helmet head classifier, `helmet_v5e_head`
- Upstream: https://huggingface.co/vivekvar/helmet-v5
- Pinned revision: `4ea2eb67301722073555448b477178330e40f7d1`
- License: Apache License 2.0
- Source graph SHA-256: `410d439f78d7bd86e9e83763db30e5ba00a70b4642439d640c0df1d288bd5dc8`
- Source weights SHA-256: `911a3ec0533276fc5bff11351ecadb23318d9ff8e8fcd76f939efdd0e9920346`
- Self-contained ONNX SHA-256: `b50a2ec2354db804a2f4d14b726bec24d5de0966340fc66477f53f8ec3159e6e`

The Docker build uses ONNX 1.23.1 and Protobuf 7.36.2 to embed the external
weights, verifying all three hashes. The model receives upper-body/head crops
of a YOLOX-detected person with bilinear resize to 224x224 and ImageNet
normalization. Logit order is `helmet`, then `no_helmet`.

The prior PaddleClas safety-hardhat classifier rejected a clearly visible
black motorcycle helmet in the pilot camera sample. The replacement recognizes
that sample, while cap and partial-body controls stay below the alert threshold.
Those checks cover the reported failure, not overall camera accuracy. The
existing confidence floor, agreement between crops, and two-frame confirmation
remain in effect. Wider field validation is still required.
