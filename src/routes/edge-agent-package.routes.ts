import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { deflateRawSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { ControlPlaneStore } from "../control-plane-store.js";

const routeParams = z.object({
  branchId: z.string().min(1),
  edgeAgentId: z.string().min(1),
});
const packageQuery = z.object({
  platform: z.enum(["windows", "linux"]).default("windows"),
  mode: z.enum(["install", "scan-once"]).default("install"),
});
const embeddedConfigMarker = Buffer.from("SENTINEL_EDGE_CONFIG_V1", "ascii");

export interface EdgeAgentPackageOptions {
  controlPlanePublicUrl?: string;
  edgeBridgeSharedKey?: string;
  artifactRoot?: string;
  developmentUserId?: string;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 * (crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries: Array<{ name: string; data: Buffer }>) {
  const fileEntries: Array<{ header: Buffer; data: Buffer; centralDir: Buffer }> = [];
  let offset = 0;

  for (const entry of entries) {
    const compressed = deflateRawSync(entry.data);
    const checksum = crc32(entry.data);
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    name.copy(localHeader, 30);

    const centralDir = Buffer.alloc(46 + name.length);
    centralDir.writeUInt32LE(0x02014b50, 0);
    centralDir.writeUInt16LE(20, 4);
    centralDir.writeUInt16LE(20, 6);
    centralDir.writeUInt16LE(0x0800, 8);
    centralDir.writeUInt16LE(8, 10);
    centralDir.writeUInt32LE(checksum, 16);
    centralDir.writeUInt32LE(compressed.length, 20);
    centralDir.writeUInt32LE(entry.data.length, 24);
    centralDir.writeUInt16LE(name.length, 28);
    centralDir.writeUInt32LE(offset, 42);
    name.copy(centralDir, 46);

    fileEntries.push({ header: localHeader, data: compressed, centralDir });
    offset += localHeader.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(fileEntries.map((entry) => entry.centralDir));
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(fileEntries.length, 8);
  end.writeUInt16LE(fileEntries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([
    Buffer.concat(fileEntries.flatMap((entry) => [entry.header, entry.data])),
    centralBuffer,
    end,
  ]);
}

function environmentFile(values: Record<string, string>) {
  return `${Object.entries(values).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\r\n")}\r\n`;
}

async function findEdgeAgentRoot(preferredRoot?: string) {
  const routeDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...(preferredRoot ? [preferredRoot] : []),
    join(process.cwd(), "edge-agent"),
    join(routeDirectory, "..", "..", "edge-agent"),
    join(routeDirectory, "..", "..", "..", "edge-agent"),
  ];
  for (const candidate of candidates) {
    try {
      if ((await stat(join(candidate, "package.json"))).isFile()) return candidate;
    } catch {
      // Try the next source or production layout.
    }
  }
  return undefined;
}

async function readRequiredFile(path: string, errorCode: string) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new Error("not a file");
    return await readFile(path);
  } catch {
    throw Object.assign(new Error(`${errorCode}: ${path}`), { code: errorCode });
  }
}

function branchConfiguration(
  agent: { id: string; branchId: string; name: string },
  version: string,
  options: EdgeAgentPackageOptions,
  platform: "windows" | "linux",
  mode: "install" | "scan-once" = "install",
) {
  return environmentFile({
    CONTROL_PLANE_URL: options.controlPlanePublicUrl ?? "REPLACE_WITH_PUBLIC_CONTROL_PLANE_URL",
    CONTROL_PLANE_TIMEOUT_MS: "15000",
    BRANCH_ID: agent.branchId,
    EDGE_AGENT_ID: agent.id,
    EDGE_AGENT_NAME: agent.name,
    EDGE_AGENT_VERSION: version,
    DEV_USER_ID: options.developmentUserId ?? "",
    EDGE_BRIDGE_SHARED_KEY: options.edgeBridgeSharedKey ?? "",
    CAMERA_USERNAME: "",
    CAMERA_PASSWORD: "",
    ONVIF_ENDPOINTS: "",
    DISCOVERY_TIMEOUT_MS: "5000",
    ONVIF_TIMEOUT_MS: "8000",
    FFPROBE_PATH: "ffprobe",
    FFMPEG_PATH: "ffmpeg",
    LIVE_MEDIA_ENABLED: mode === "scan-once" ? "false" : "true",
    EDGE_MANAGED_MEDIA_BOOTSTRAP: mode === "scan-once" ? "false" : "true",
    EDGE_LIVE_GATEWAY_HOST: "127.0.0.1",
    EDGE_LIVE_GATEWAY_PORT: "8090",
    MEDIAMTX_PATH: "mediamtx",
    MEDIA_RUNTIME_MANAGED: mode === "scan-once" ? "false" : "true",
    MEDIAMTX_API_URL: "http://127.0.0.1:9997",
    MEDIAMTX_HLS_URL: "http://127.0.0.1:8888",
    MEDIA_TUNNEL_MODE: mode === "scan-once" ? "disabled" : "named",
    CLOUDFLARED_PATH: "cloudflared",
    CLOUDFLARED_TUNNEL_TOKEN: "",
    MEDIA_ACCESS_TTL_SECONDS: "300",
    CAMERA_HEARTBEAT_INTERVAL_MS: "30000",
    CAMERA_CONFIG_REFRESH_MS: "60000",
    PUBLIC_MEDIA_GATEWAY_URL: "",
    EDGE_MEDIA_SHARED_KEY: "",
    STREAM_SECRET_STORE_PATH: "./data/stream-secrets.json",
    EDGE_LOG_PATH: "./logs/edge-agent.log",
    INTERNET_LINKS_JSON: "[]",
    RECORDERS_JSON: "[]",
  });
}

function streamInstaller(executablePath: string, config: Buffer) {
  const footer = embeddedConfigurationFooter(config);
  return {
    footer,
    stream: Readable.from((async function* () {
      for await (const chunk of createReadStream(executablePath)) yield chunk;
      yield footer;
    })()),
  };
}

function embeddedConfigurationFooter(config: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32LE(config.length, 0);
  return Buffer.concat([config, length, embeddedConfigMarker]);
}

function localDiscoveryReadme(branchName: string) {
  return [
    `Sentinel Grid temporary local-network scanner for ${branchName}`,
    "",
    "1. Connect this Windows PC to the same wired/Wi-Fi network as the IP cameras and DVR/NVRs.",
    "2. Extract this ZIP and double-click Run Local Discovery.cmd.",
    "3. Enter a shared ONVIF/DVR login when prompted, if available. It is used only for this scan and is not saved on the PC.",
    "4. Wait for the completed result, then return to Sentinel Grid and review the discovered devices.",
    "",
    "It discovers direct ONVIF IP cameras plus DVR/NVR channels. Analog cameras appear as DVR channels because the DVR digitizes them. A recorder login is needed to enumerate its individual channels.",
    "This tool exits after one scan. It does not install a Windows service, a tunnel, or a background monitor.",
  ].join("\r\n");
}

export async function registerEdgeAgentPackageRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
  options: EdgeAgentPackageOptions = {},
) {
  app.get("/v1/branches/:branchId/edge-agents/:edgeAgentId/package", async (request, reply) => {
    const { branchId, edgeAgentId } = routeParams.parse(request.params);
    const { platform, mode } = packageQuery.parse(request.query);
    if (mode === "scan-once" && platform !== "windows") {
      return reply.code(400).send({ error: "local_scanner_windows_only" });
    }
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ error: "branch_not_found" });

    const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
    if (!decision) return reply.code(404).send({ error: "resource_not_found" });
    if (!decision.allowed) return reply.code(403).send({ error: "forbidden", reason: decision.reason });

    const agent = (await store.listEdgeAgentsByBranch(branchId)).find((item) => item.id === edgeAgentId);
    if (!agent) return reply.code(404).send({ error: "edge_agent_not_found" });
    if (!options.edgeBridgeSharedKey && !options.developmentUserId) {
      return reply.code(503).send({
        error: "edge_bridge_not_configured",
        message: "Configure EDGE_BRIDGE_SHARED_KEY before downloading production branch installers.",
      });
    }

    const root = await findEdgeAgentRoot(options.artifactRoot);
    if (!root) return reply.code(503).send({
      error: "edge_agent_package_not_built",
      message: "The edge-agent build artifacts are not present on this server.",
    });

    try {
      const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version?: string };
      const version = packageJson.version ?? "0.1.0";
      const config = Buffer.from(branchConfiguration(agent, version, options, platform, mode), "utf8");
      let entries: Array<{ name: string; data: Buffer }>;

      if (platform === "windows") {
        const executablePath = join(root, "release", "edge-agent.exe");
        let executableSize: number;
        try {
          const metadata = await stat(executablePath);
          if (!metadata.isFile()) throw new Error("not a file");
          executableSize = metadata.size;
        } catch {
          throw Object.assign(new Error(`edge_agent_executable_not_built: ${executablePath}`), { code: "edge_agent_executable_not_built" });
        }
        const installer = streamInstaller(executablePath, config);
        const safeBranchName = branch.name.replace(/[^a-zA-Z0-9_-]/g, "-");
        if (mode === "scan-once") {
          const scannerName = `${safeBranchName}-local-network-scanner.exe`;
          const scanner = Buffer.concat([await readFile(executablePath), embeddedConfigurationFooter(config)]);
          const runner = [
            "@echo off",
            "setlocal",
            "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0Run Local Discovery.ps1\"",
            "set EXIT_CODE=%ERRORLEVEL%",
            "echo.",
            `if not "%EXIT_CODE%"=="0" echo Discovery failed. Check that this PC is on the branch camera network and can reach Sentinel Grid.`,
            "pause",
            "exit /b %EXIT_CODE%",
            "",
          ].join("\r\n");
          const powerShellRunner = [
            "$ErrorActionPreference = 'Stop'",
            "$credential = Get-Credential -Message 'Optional: enter the shared ONVIF / DVR login to enumerate recorder channels'",
            "$passwordPointer = [IntPtr]::Zero",
            "try {",
            "  if ($credential) {",
            "    $env:CAMERA_USERNAME = $credential.UserName",
            "    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)",
            "    $env:CAMERA_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)",
            "  }",
            `  & (Join-Path $PSScriptRoot '${scannerName}') --scan-once`,
            "  exit $LASTEXITCODE",
            "} finally {",
            "  if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }",
            "  Remove-Item Env:CAMERA_USERNAME -ErrorAction SilentlyContinue",
            "  Remove-Item Env:CAMERA_PASSWORD -ErrorAction SilentlyContinue",
            "}",
            "",
          ].join("\r\n");
          await store.writeAudit({
            tenantId: branch.tenantId, actorUserId: request.currentUser.id,
            action: "edge_agent.local_scanner_downloaded", resourceNodeId: branchId,
            outcome: "success", sourceIp: request.ip,
            details: { edgeAgentId, platform, version, mode },
          });
          reply.header("Cache-Control", "no-store, private");
          reply.header("Content-Type", "application/zip");
          reply.header("Content-Disposition", `attachment; filename="${safeBranchName}-local-network-scanner.zip"`);
          return reply.send(makeZip([
            { name: scannerName, data: scanner },
            { name: "Run Local Discovery.cmd", data: Buffer.from(runner, "utf8") },
            { name: "Run Local Discovery.ps1", data: Buffer.from(powerShellRunner, "utf8") },
            { name: "README.txt", data: Buffer.from(localDiscoveryReadme(branch.name), "utf8") },
          ]));
        }
        await store.writeAudit({
          tenantId: branch.tenantId, actorUserId: request.currentUser.id,
          action: "edge_agent.package_downloaded", resourceNodeId: branchId,
          outcome: "success", sourceIp: request.ip,
          details: { edgeAgentId, platform, version, format: "single-executable", mode },
        });
        reply.header("Cache-Control", "no-store, private");
        reply.header("Content-Type", "application/vnd.microsoft.portable-executable");
        reply.header("Content-Length", String(executableSize + installer.footer.length));
        reply.header("Content-Disposition", `attachment; filename="${safeBranchName}-edge-agent-setup.exe"`);
        return reply.send(installer.stream);
      } else {
        const packageBody = JSON.stringify({ private: true, scripts: { start: "node edge-agent.cjs" } }, null, 2);
        entries = [
          { name: "edge-agent.cjs", data: await readRequiredFile(join(root, "build", "edge-agent.cjs"), "edge_agent_bundle_not_built") },
          { name: "config/edge-agent.env", data: config },
          { name: "package.json", data: Buffer.from(packageBody, "utf8") },
          { name: "install-edge-agent.sh", data: Buffer.from("#!/bin/sh\nset -eu\nnode ./edge-agent.cjs --config ./config/edge-agent.env --diagnose\nexec node ./edge-agent.cjs --config ./config/edge-agent.env\n", "utf8") },
          { name: "README.txt", data: Buffer.from("This legacy agent package provides discovery and health monitoring only. For unattended live video, deploy deploy/branch-gateway on the managed appliance.\n\nRun: chmod +x install-edge-agent.sh && ./install-edge-agent.sh\n", "utf8") },
        ];
      }

      await store.writeAudit({
        tenantId: branch.tenantId,
        actorUserId: request.currentUser.id,
        action: "edge_agent.package_downloaded",
        resourceNodeId: branchId,
        outcome: "success",
        sourceIp: request.ip,
        details: { edgeAgentId, platform, version, mode },
      });

      reply.header("Cache-Control", "no-store, private");
      reply.header("Content-Type", "application/zip");
      const safeBranchName = branch.name.replace(/[^a-zA-Z0-9_-]/g, "-");
      reply.header("Content-Disposition", `attachment; filename="${safeBranchName}-edge-agent-${platform}.zip"`);
      return reply.send(makeZip(entries));
    } catch (error) {
      app.log.error({ err: error, branchId, edgeAgentId }, "Failed to build edge-agent installer package");
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "edge_agent_package_failed";
      const status = code.endsWith("_not_built") ? 503 : 500;
      return reply.code(status).send({ error: code, message: error instanceof Error ? error.message : "Package generation failed" });
    }
  });
}
