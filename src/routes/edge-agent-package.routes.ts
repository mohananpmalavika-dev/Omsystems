import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { deflateRawSync } from "node:zlib";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile, stat } from "node:fs/promises";
import type { ControlPlaneStore } from "../control-plane-store.js";

const branchParams = z.object({ branchId: z.string().min(1) });
const edgeAgentParams = z.object({ edgeAgentId: z.string().min(1) });
const packageQuery = z.object({ platform: z.enum(["windows", "linux"]).default("windows") });

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 * (crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function collectFiles(directory: string, basePath = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<{ path: string, relativePath: string }> = [];

  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolute, basePath));
    } else if (entry.isFile()) {
      files.push({ path: absolute, relativePath: relative(basePath, absolute).replaceAll("\\", "/") });
    }
  }

  return files;
}

function makeZip(entries: Array<{ name: string; data: Buffer }>) {
  const fileEntries: Array<{ header: Buffer; data: Buffer; centralDir: Buffer }> = [];
  let offset = 0;

  for (const entry of entries) {
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const localHeader = Buffer.alloc(30 + nameBuffer.length);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(localHeader, 30);

    const centralDir = Buffer.alloc(46 + nameBuffer.length);
    centralDir.writeUInt32LE(0x02014b50, 0);
    centralDir.writeUInt16LE(20, 4);
    centralDir.writeUInt16LE(20, 6);
    centralDir.writeUInt16LE(0, 8);
    centralDir.writeUInt16LE(8, 10);
    centralDir.writeUInt16LE(0, 12);
    centralDir.writeUInt32LE(crc, 16);
    centralDir.writeUInt32LE(compressed.length, 20);
    centralDir.writeUInt32LE(entry.data.length, 24);
    centralDir.writeUInt16LE(nameBuffer.length, 28);
    centralDir.writeUInt16LE(0, 30);
    centralDir.writeUInt16LE(0, 32);
    centralDir.writeUInt16LE(0, 34);
    centralDir.writeUInt32LE(0, 36);
    centralDir.writeUInt32LE(0, 40);
    centralDir.writeUInt32LE(offset, 42);
    nameBuffer.copy(centralDir, 46);

    fileEntries.push({ header: localHeader, data: compressed, centralDir });
    offset += localHeader.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(fileEntries.map((entry) => entry.centralDir));
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileEntries.length, 8);
  eocd.writeUInt16LE(fileEntries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([Buffer.concat(fileEntries.flatMap((entry) => [entry.header, entry.data])), centralBuffer, eocd]);
}

async function readJsonFile(filePath: string) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function registerEdgeAgentPackageRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  app.get("/v1/branches/:branchId/edge-agents/:edgeAgentId/package", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const { edgeAgentId } = edgeAgentParams.parse(request.params);

    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") {
      return reply.code(404).send({ error: "branch_not_found" });
    }
    const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
    if (!decision) {
      return reply.code(404).send({ error: "resource_not_found" });
    }
    if (!decision.allowed) {
      return reply.code(403).send({ error: "forbidden", reason: decision.reason });
    }

    const agents = await store.listEdgeAgentsByBranch(branchId);
    const agent = agents.find((item) => item.id === edgeAgentId);
    if (!agent) {
      return reply.code(404).send({ error: "edge_agent_not_found" });
    }

    const { platform } = packageQuery.parse(request.query);
    const routeDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = join(routeDir, "..", "..", "edge-agent", "package.json");
    const distPath = join(routeDir, "..", "..", "edge-agent", "dist");
    const packageJson = await readJsonFile(packageJsonPath);
    const packagedPackageJson = {
      ...packageJson,
      private: true,
      scripts: {
        ...packageJson.scripts,
        start: "node dist/src/index.js",
      },
    };

    const distFiles = await collectFiles(distPath);
    const entries: Array<{ name: string; data: Buffer }> = [];
    for (const file of distFiles) {
      const fileData = await readFile(file.path);
      entries.push({ name: `edge-agent/${file.relativePath}`, data: fileData });
    }

    entries.push({ name: "edge-agent/package.json", data: Buffer.from(JSON.stringify(packagedPackageJson, null, 2), "utf8") });

    const envContents = [
      "CONTROL_PLANE_URL=<provided-by-platform-admin>",
      `BRANCH_ID=${agent.branchId}`,
      `EDGE_AGENT_ID=${agent.id}`,
      `EDGE_AGENT_NAME=${agent.name}`,
      "EDGE_AGENT_VERSION=0.1.0",
      "DEV_USER_ID=user-global-admin",
      "CAMERA_USERNAME=admin",
      "CAMERA_PASSWORD=change-me",
      "ONVIF_ENDPOINTS=",
      "EDGE_BRIDGE_SHARED_KEY=<enrollment-secret>",
      "PUBLIC_MEDIA_GATEWAY_URL=https://<branch-media-tunnel-host>",
      "EDGE_MEDIA_SHARED_KEY=<unique-branch-media-key>",
      "STREAM_SECRET_STORE_PATH=./data/stream-secrets.json",
    ].join("\n");

    entries.push({ name: ".env", data: Buffer.from(envContents, "utf8") });

    const installScriptName = platform === "linux" ? "install-edge-agent.sh" : "install-edge-agent.ps1";
    const installScript = platform === "linux" ?
`#!/bin/sh
set -e
ENV_FILE="$(pwd)/.env"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
${envContents}
EOF
  echo "Created $ENV_FILE"
fi

echo "Installing edge-agent dependencies..."
npm install --omit=dev

echo "Starting edge agent..."
npm run start
` :
`$envFile = Join-Path (Get-Location) ".env"
if (-Not (Test-Path $envFile)) {
  Write-Host "No .env file found; creating it." -ForegroundColor Yellow
  @"
${envContents}
"@ | Out-File -FilePath $envFile -Encoding UTF8
  Write-Host "Created $envFile"
}

Write-Host "Installing edge-agent dependencies..."
npm install --omit=dev

Write-Host "Starting edge agent..."
npm run start
`;

    entries.push({ name: installScriptName, data: Buffer.from(installScript, "utf8") });

    const readmeBody = platform === "linux" ?
`Unzip this package on the branch machine.

1. Open a terminal in the extracted folder.
2. Run: chmod +x install-edge-agent.sh
3. Run: ./install-edge-agent.sh

The package contains:
  - edge-agent dist files
  - edge-agent/package.json
  - .env with branch-specific config placeholders
  - install-edge-agent.sh to install and start the agent

After the gateway starts, return to the dashboard and click Add camera.
` :
`Unzip this package on the branch machine.

1. Open PowerShell in the extracted folder.
2. Run: .\install-edge-agent.ps1

If the script prompts for permission, run:
  Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

The package contains:
  - edge-agent dist files
  - edge-agent/package.json
  - .env with branch-specific config placeholders
  - install-edge-agent.ps1 to install and start the agent

After the gateway starts, return to the dashboard and click Add camera.
`;

    entries.push({ name: "README.txt", data: Buffer.from(readmeBody, "utf8") });

    const zip = makeZip(entries);
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${branch.name.replace(/[^a-zA-Z0-9_-]/g, "-")}-edge-agent-${platform}.zip"`);
    return reply.send(zip);
  });
}
