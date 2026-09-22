import { createReadStream, statSync, readFileSync, openSync, readSync, closeSync } from "node:fs";
import { basename } from "node:path";
import { execSync } from "node:child_process";

const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
const bucket = "kryptovision-installer-7866fc3f";
const filePath = process.argv[2] || "edge-agent/release/edge-agent.exe";
const objectName = process.argv[3] || basename(filePath);
const fileSize = statSync(filePath).size;

console.log(`Starting Resumable Chunked Upload of ${filePath} (${(fileSize / (1024 * 1024)).toFixed(2)} MB) to gs://${bucket}/${objectName}...`);

// Step 1: Initiate Resumable Session
const initUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=resumable&name=${encodeURIComponent(objectName)}`;
const initRes = await fetch(initUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": "application/octet-stream",
    "X-Upload-Content-Length": String(fileSize),
  },
  body: JSON.stringify({ name: objectName }),
});

if (!initRes.ok) {
  console.error("Failed to initiate resumable upload:", initRes.status, await initRes.text());
  process.exit(1);
}

const sessionUri = initRes.headers.get("location");
if (!sessionUri) {
  console.error("No upload location returned");
  process.exit(1);
}

console.log("Resumable upload session initiated.");

// Step 2: Upload in 8MB chunks with automatic retries
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
const fd = openSync(filePath, "r");
let offset = 0;

while (offset < fileSize) {
  const currentChunkSize = Math.min(CHUNK_SIZE, fileSize - offset);
  const buffer = Buffer.alloc(currentChunkSize);
  readSync(fd, buffer, 0, currentChunkSize, offset);
  const end = offset + currentChunkSize - 1;

  let success = false;
  let attempts = 0;

  while (!success && attempts < 5) {
    attempts++;
    try {
      const chunkRes = await fetch(sessionUri, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${offset}-${end}/${fileSize}`,
          "Content-Length": String(currentChunkSize),
          "Content-Type": "application/octet-stream",
        },
        body: buffer,
      });

      if (chunkRes.status === 200 || chunkRes.status === 201) {
        success = true;
        offset += currentChunkSize;
        console.log(`Progress: 100% (${(fileSize / (1024 * 1024)).toFixed(1)} MB / ${(fileSize / (1024 * 1024)).toFixed(1)} MB) - Complete!`);
        break;
      } else if (chunkRes.status === 308) {
        success = true;
        offset += currentChunkSize;
        const pct = ((offset / fileSize) * 100).toFixed(1);
        const mb = (offset / (1024 * 1024)).toFixed(1);
        console.log(`Progress: ${pct}% (${mb} MB / ${(fileSize / (1024 * 1024)).toFixed(1)} MB) [Chunk ${attempts === 1 ? "OK" : "Retried OK"}]`);
      } else {
        console.warn(`Chunk ${offset}-${end} returned HTTP ${chunkRes.status}, retrying (attempt ${attempts})...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) {
      console.warn(`Chunk ${offset}-${end} network error: ${err.message}, retrying (attempt ${attempts})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!success) {
    console.error(`Failed to upload chunk starting at ${offset} after 5 attempts.`);
    closeSync(fd);
    process.exit(1);
  }
}

closeSync(fd);
console.log("Upload completed successfully!");
