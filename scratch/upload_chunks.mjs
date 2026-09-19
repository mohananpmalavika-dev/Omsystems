import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const chunksDir = "C:/Omsystems/Omsystems/scratch/installer_chunks";
const gcpTarget = "kryptovision-server:/tmp/installer_chunks/";
const zone = "asia-south1-b";
const project = "project-7866fc3f-5dd5-4495-804";

const chunks = fs.readdirSync(chunksDir).filter((f) => f.startsWith("part_")).sort();

console.log(`Found ${chunks.length} chunks to upload.`);

// Check what chunks are already uploaded on remote
let remoteExisting = "";
try {
  remoteExisting = execSync(
    `gcloud compute ssh kryptovision-server --zone=${zone} --project=${project} --command="ls /tmp/installer_chunks"`,
    { encoding: "utf8" }
  );
} catch (e) {
  // ignore
}

for (const chunk of chunks) {
  if (remoteExisting.includes(chunk)) {
    console.log(`[SKIPPED] ${chunk} already exists on remote.`);
    continue;
  }

  const localFile = path.join(chunksDir, chunk);
  let success = false;
  let attempts = 0;

  while (!success && attempts < 5) {
    attempts++;
    console.log(`[UPLOADING] ${chunk} (Attempt ${attempts})...`);
    try {
      execSync(
        `gcloud compute scp --zone=${zone} --project=${project} --quiet "${localFile}" "${gcpTarget}"`,
        { stdio: "inherit", timeout: 180000 }
      );
      success = true;
      console.log(`[SUCCESS] ${chunk} uploaded.`);
    } catch (err) {
      console.error(`[ERROR] ${chunk} failed on attempt ${attempts}: ${err.message}`);
    }
  }

  if (!success) {
    console.error(`FATAL: Failed to upload ${chunk} after 5 attempts.`);
    process.exit(1);
  }
}

console.log("All chunks uploaded successfully! Reassembling on GCP...");
const reassembleCmd = `sudo bash -c 'install -d /opt/sentinel-grid/edge-agent/installer/windows/output && cat /tmp/installer_chunks/part_* > /opt/sentinel-grid/edge-agent/installer/windows/output/KryptonVisionInstaller-v0.1.21-windows.exe && chmod 644 /opt/sentinel-grid/edge-agent/installer/windows/output/KryptonVisionInstaller-v0.1.21-windows.exe && sha256sum /opt/sentinel-grid/edge-agent/installer/windows/output/KryptonVisionInstaller-v0.1.21-windows.exe && rm -rf /tmp/installer_chunks'`;

execSync(
  `gcloud compute ssh kryptovision-server --zone=${zone} --project=${project} --command="${reassembleCmd}"`,
  { stdio: "inherit" }
);

console.log("Reassembly verified! Now triggering container rebuild and restart...");
execSync(
  `gcloud compute ssh kryptovision-server --zone=${zone} --project=${project} --command="sudo bash /opt/sentinel-grid/deploy/gcp/update-live.sh"`,
  { stdio: "inherit" }
);

console.log("Deployment complete!");
