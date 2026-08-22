import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const edgeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const destinationRoot = join(edgeRoot, "vendor", "windows");
const assets = [
  {
    name: "FFmpeg 8.1.2 LGPL shared build",
    file: "ffmpeg.zip",
    // BtbN removes ordinary daily autobuilds after 14 days. Month-end builds
    // are retained for two years and keep this checksum-pinned build stable.
    url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-07-31-14-10/ffmpeg-n8.1.2-34-g9b6c8969e0-win64-lgpl-shared-8.1.zip",
    sha256: "c222a490dde4e7059f45495deef6bfb98dbcacc2b43df5b607546252037aa95c",
  },
  {
    name: "MediaMTX 1.17.1",
    file: "mediamtx.zip",
    url: "https://github.com/bluenviron/mediamtx/releases/download/v1.17.1/mediamtx_v1.17.1_windows_amd64.zip",
    sha256: "5b8ada2f1f175c71c45a18c45be5c7a0c8e527c8a2e2644888bdad017b3f842c",
  },
  {
    name: "cloudflared 2026.5.2",
    file: "cloudflared.exe",
    url: "https://github.com/cloudflare/cloudflared/releases/download/2026.5.2/cloudflared-windows-amd64.exe",
    sha256: "20b9638f685333d623798e733effbad2487093f15ba592f6c7752360ff3b7ab7",
  },
];

await mkdir(destinationRoot, { recursive: true });
for (const asset of assets) {
  const destination = join(destinationRoot, asset.file);
  if (existsSync(destination) && await sha256(destination) === asset.sha256) {
    process.stdout.write(`${asset.name}: verified cached asset\n`);
    continue;
  }
  const temporary = `${destination}.part`;
  await rm(temporary, { force: true });
  process.stdout.write(`${asset.name}: downloading pinned release\n`);
  const response = await fetch(asset.url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Download failed for ${asset.name}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  const digest = await sha256(temporary);
  if (digest !== asset.sha256) {
    await rm(temporary, { force: true });
    throw new Error(`${asset.name} checksum mismatch: expected ${asset.sha256}, received ${digest}`);
  }
  await rm(destination, { force: true });
  await rename(temporary, destination);
}

await copyFile(join(edgeRoot, "THIRD_PARTY_NOTICES.txt"), join(destinationRoot, "THIRD_PARTY_NOTICES.txt"));

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
