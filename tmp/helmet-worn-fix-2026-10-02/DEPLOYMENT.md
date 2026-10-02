# Helmet detector 1.1.0 runtime bundle

Prepared for sentinel-gcp-analytics-engine. Production has not been modified.

1. Verify SHA256SUMS.txt. Back up the three existing runtime JS files and
   /app/models/manifest.json from the analytics container.
2. Copy runtime/ files beneath /app/ with the paths shown in this archive.
3. Replace only the id=helmet entry in the existing runtime manifest with
   helmet-model.json. Preserve all other entries and environment configuration.
   If HELMET_MODEL_PATH overrides the manifest, point it at the new artifact.
4. Restart only the analytics service and verify that /health reports the
   Motorcycle helmet head classifier as loaded and the detector as healthy.
5. Validate two independent live helmet observations on the affected camera
   and check the helmet-worn event. Replays in this bundle did not submit alerts.

Rollback: restore the backed-up JS files and manifest and restart analytics.
The prior safety/helmet.onnx is preserved by this update. Future image rebuilds
must use the updated Dockerfile and packaging script in the repository.
