#!/usr/bin/env bash
# Run in Google Cloud Shell with artifacts from the Windows release runner.
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 4 ]; then
    echo "Usage: bash deploy/gcp/update-edge-release.sh RELEASE_DIRECTORY ZONE [PROJECT_ID] [INSTANCE_NAME]" >&2
    exit 2
fi

RELEASE_DIRECTORY=$(cd -- "$1" && pwd)
ZONE=$2
PROJECT_ID=${3:-$(gcloud config get-value project 2>/dev/null)}
INSTANCE_NAME=${4:-kryptovision-server}
SCRIPT_DIRECTORY=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

for value in "$ZONE" "$PROJECT_ID" "$INSTANCE_NAME"; do
    if [[ ! "$value" =~ ^[a-z][a-z0-9-]*$ ]]; then
        echo "Specify a valid GCP zone, project ID, and instance name." >&2
        exit 2
    fi
done

# Verify the release checksum before uploading. Authenticode signing is optional.
node "$SCRIPT_DIRECTORY/../../edge-agent/scripts/verify-windows-production-release.mjs" "$RELEASE_DIRECTORY"
EXE_HASH=$(sha256sum "$RELEASE_DIRECTORY/edge-agent.exe" | cut -d ' ' -f 1)
MANIFEST_HASH=$(sha256sum "$RELEASE_DIRECTORY/windows-release.json" | cut -d ' ' -f 1)
INSTALLER_FILE=$(node -e 'const fs=require("node:fs"); const m=JSON.parse(fs.readFileSync(process.argv[1], "utf8").replace(/^\uFEFF/, "")); if(typeof m.installerFile!=="string" || !/^KryptonVisionInstaller-v[0-9A-Za-z.-]+-windows\.exe$/.test(m.installerFile)) process.exit(1); process.stdout.write(m.installerFile)' "$RELEASE_DIRECTORY/windows-release.json")
INSTALLER_PATH="$(dirname "$RELEASE_DIRECTORY")/installer/windows/output/$INSTALLER_FILE"
if [ ! -s "$INSTALLER_PATH" ]; then
    echo "Missing native Windows installer: $INSTALLER_PATH" >&2
    exit 1
fi
INSTALLER_HASH=$(sha256sum "$INSTALLER_PATH" | cut -d ' ' -f 1)

GCLOUD_TARGET=("$INSTANCE_NAME" "--zone=$ZONE" "--project=$PROJECT_ID" --quiet)
REMOTE_DIRECTORY=$(gcloud compute ssh "${GCLOUD_TARGET[@]}" --command='mktemp -d /tmp/sentinel-edge-release.XXXXXXXXXX')
if [[ ! "$REMOTE_DIRECTORY" =~ ^/tmp/sentinel-edge-release\.[a-zA-Z0-9]+$ ]]; then
    echo "GCP did not return a valid upload directory." >&2
    exit 1
fi

LOCAL_SCRIPT=$(mktemp)
trap 'rm -f -- "$LOCAL_SCRIPT"' EXIT
cat > "$LOCAL_SCRIPT" <<'REMOTE_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
UPLOAD_DIRECTORY=$1
EXE_HASH=$2
MANIFEST_HASH=$3
INSTALLER_FILE=$4
INSTALLER_HASH=$5
if [[ ! "$INSTALLER_FILE" =~ ^KryptonVisionInstaller-v[0-9A-Za-z.-]+-windows\.exe$ ]]; then
    echo "Invalid native installer filename." >&2
    exit 1
fi
cd -- "$UPLOAD_DIRECTORY"
printf '%s  edge-agent.exe\n%s  windows-release.json\n%s  %s\n' "$EXE_HASH" "$MANIFEST_HASH" "$INSTALLER_HASH" "$INSTALLER_FILE" | sha256sum --check --strict

REPOSITORY=/opt/sentinel-grid
test -f "$REPOSITORY/deploy/gcp/docker-compose.gcp.yml"
install -d "$REPOSITORY/edge-agent/release"
install -m 0644 edge-agent.exe "$REPOSITORY/edge-agent/release/edge-agent.exe"
install -m 0644 windows-release.json "$REPOSITORY/edge-agent/release/windows-release.json"
install -d "$REPOSITORY/edge-agent/installer/windows/output"
install -m 0644 "$INSTALLER_FILE" "$REPOSITORY/edge-agent/installer/windows/output/$INSTALLER_FILE"

cd "$REPOSITORY/deploy/gcp"
# Build must succeed before replacing the running API container.
docker compose -f docker-compose.gcp.yml build control-plane
VERIFY_RELEASE_JS=$(cat <<'JS'
const fs = require("node:fs");
const crypto = require("node:crypto");
const binary = fs.readFileSync("/app/edge-agent/release/edge-agent.exe");
const manifest = JSON.parse(fs.readFileSync("/app/edge-agent/release/windows-release.json", "utf8").replace(/^\uFEFF/, ""));
const hash = crypto.createHash("sha256").update(binary).digest("hex");
const installerFile = manifest.installerFile;
const installer = typeof installerFile === "string" && /^KryptonVisionInstaller-v[0-9A-Za-z.-]+-windows\.exe$/.test(installerFile)
  ? fs.readFileSync(`/app/edge-agent/installer/windows/output/${installerFile}`) : Buffer.alloc(0);
const installerHash = crypto.createHash("sha256").update(installer).digest("hex");
if (!binary.length || hash !== process.argv[1] || hash !== manifest.sha256.toLowerCase() || !installer.length || installerHash !== manifest.installerSha256?.toLowerCase()) process.exit(1);
console.log("Verified edge-agent.exe, native installer, and matching manifest in the GCP container.");
JS
)
docker compose -f docker-compose.gcp.yml run --rm --no-deps -T --entrypoint node control-plane -e "$VERIFY_RELEASE_JS" "$EXE_HASH"
docker compose -f docker-compose.gcp.yml up -d --no-deps --force-recreate --wait --wait-timeout 120 control-plane
docker compose -f docker-compose.gcp.yml exec -T control-plane node -e "$VERIFY_RELEASE_JS" "$EXE_HASH"

# Remove only the uploaded files after successful verification.
rm -- "$UPLOAD_DIRECTORY/edge-agent.exe" "$UPLOAD_DIRECTORY/windows-release.json" "$UPLOAD_DIRECTORY/$INSTALLER_FILE" "$UPLOAD_DIRECTORY/install-release.sh"
rmdir -- "$UPLOAD_DIRECTORY"
REMOTE_SCRIPT

echo "Uploading the Windows release to $INSTANCE_NAME ($ZONE)..."
gcloud compute scp --zone="$ZONE" --project="$PROJECT_ID" --quiet \
    "$RELEASE_DIRECTORY/edge-agent.exe" "$RELEASE_DIRECTORY/windows-release.json" "$INSTALLER_PATH" \
    "$INSTANCE_NAME:$REMOTE_DIRECTORY/"
gcloud compute scp --zone="$ZONE" --project="$PROJECT_ID" --quiet \
    "$LOCAL_SCRIPT" "$INSTANCE_NAME:$REMOTE_DIRECTORY/install-release.sh"

echo "Rebuilding and verifying the GCP control-plane container..."
gcloud compute ssh "${GCLOUD_TARGET[@]}" \
    --command="sudo bash '$REMOTE_DIRECTORY/install-release.sh' '$REMOTE_DIRECTORY' '$EXE_HASH' '$MANIFEST_HASH' '$INSTALLER_FILE' '$INSTALLER_HASH'"
echo "Windows release installed. Retry the edge-agent download in the dashboard."
