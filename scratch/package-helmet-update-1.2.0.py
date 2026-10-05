import tarfile
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent

files = [
    # Dist files for running container
    ("analytics-engine/dist/analytics-engine/src/detectors/helmet-detector.js", "dist/detectors/helmet-detector.js"),
    ("analytics-engine/dist/analytics-engine/src/inference/helmet-head-verification.js", "dist/inference/helmet-head-verification.js"),
    ("analytics-engine/dist/analytics-engine/src/inference/yolo-detection-inference.js", "dist/inference/yolo-detection-inference.js"),
    ("analytics-engine/dist/analytics-engine/src/inference/configured-model-inference.js", "dist/inference/configured-model-inference.js"),
    ("analytics-engine/dist/analytics-engine/src/model-manager.js", "dist/model-manager.js"),
    
    # Source TS files for repo
    ("analytics-engine/src/detectors/helmet-detector.ts", "src/detectors/helmet-detector.ts"),
    ("analytics-engine/src/inference/helmet-head-verification.ts", "src/inference/helmet-head-verification.ts"),
    ("analytics-engine/src/inference/yolo-detection-inference.ts", "src/inference/yolo-detection-inference.ts"),
    ("analytics-engine/src/inference/configured-model-inference.ts", "src/inference/configured-model-inference.ts"),
    ("analytics-engine/src/model-manager.ts", "src/model-manager.ts"),
    
    # Models and manifest
    ("analytics-engine/models/manifest.json", "models/manifest.json"),
    ("analytics-engine/models/safety/helmet-head-localizer.onnx", "models/safety/helmet-head-localizer.onnx"),
]

archive_path = root / "scratch/helmet-update-1.2.0.tar.gz"
with tarfile.open(archive_path, "w:gz") as archive:
    for source, arcname in files:
        full_source = root / source
        if not full_source.exists():
            raise FileNotFoundError(f"Missing file: {full_source}")
        archive.add(full_source, arcname=arcname)
        print(f"Added {source} ({full_source.stat().st_size:,} bytes) as {arcname}")

print(f"\nCreated archive {archive_path} ({archive_path.stat().st_size:,} bytes)")
