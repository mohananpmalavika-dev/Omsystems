# Face recognition recovery and validation

The control plane now enrolls employee portraits using a local YuNet detector,
five-point alignment, and a normalized 512-dimensional ArcFace embedding.
Employee profiles record the hashes of both model files and the alignment version.
Login requires the same model pipeline that created the profile.

## Models

Provision the approved ONNX files on the control plane as well as the analytics
worker. Set `FACE_DETECTOR_MODEL_PATH` to the YuNet `face-detector.onnx` file and
`ARCFACE_MODEL_PATH` to the `arcface_r100.onnx` file. The default local directory is
`analytics-engine/models/face`. These model binaries are not tracked in Git.
The container's existing ArcFace downloader does not provision the detector;
mount both files or supply the detector separately before enabling face sign-in.
Missing or incompatible models return an unavailable response and never trigger
the former grayscale matcher. The model smoke test uses the installed binaries.

## Existing enrollments

Re-enroll employee photos through the existing employee create/edit form. Legacy
version 1 and 2 image templates cannot authenticate users. A model or alignment
change also requires re-enrollment. Password sign-in remains available for accounts
that do not require facial verification. An administrator must update enrollment
for accounts with mandatory face verification; this policy is not bypassed.

Watchlist embeddings tagged `model: facenet-512` by the old image-hashing endpoint
are excluded from searches. Re-enroll those identities using clear portraits or
approved, normalized embeddings from the trusted edge. Photo enrollment rejects
no-face, multiple-face, tiny-face and inconsistent-identity samples. All samples
and their person record are saved atomically in PostgreSQL; pgvector is required.
Use the same recognition model and preprocessing for gallery and probe vectors.

## Identity decisions

Face-only login uses a minimum similarity of 0.86 and a minimum gap of 0.08 from
the next distinct employee. CCTV uses a minimum of 0.82 with a 0.05 gap; higher
watchlist thresholds remain effective. Scores are similarities, not probabilities.
Duplicate photos of one person cannot hide the next distinct person.

The CCTV integration requires consecutive, sufficiently good observations of the
same identity within the configured window. Switching identities, poor quality,
ambiguous matches and failed governance checks reset confirmation. Repeated frame
timestamps do not advance confirmation. Tenant searches never fall back to another
tenant or to a process-global gallery.

## Before rollout

Run the face regression suites, type checks and the database-backed integration
suite against `TEST_DATABASE_URL`. Validate with consented, labeled enrollment and
camera samples: the same person across lighting/pose, unrelated people, similar
faces, duplicate enrollments, empty frames and multiple faces. Record false accepts
and false rejects separately. The conservative default thresholds have not been
calibrated against this installation's camera data; adjust upward if needed and
review low-confidence results manually. These changes do not add anti-spoofing to
the employee webcam flow.

The patch does not deploy services, rewrite existing profiles, or establish a
measured accuracy rate. Re-enrollment and live camera acceptance checks are required
after deployment.
