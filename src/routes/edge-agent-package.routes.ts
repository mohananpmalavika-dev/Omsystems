import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { deflateRawSync } from "node:zlib";
import { createHash, randomBytes } from "node:crypto";
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
const branchParams = z.object({ branchId: z.string().min(1) });
const activationInstallerBody = z.object({
  activationId: z.string().uuid(),
  activationCode: z.string().startsWith("sgact_").min(40).max(200),
  agentName: z.string().trim().min(2).max(120),
  format: z.enum(["exe", "zip"]).default("zip").optional(),
});
const packageQuery = z.object({
  platform: z.enum(["windows", "linux"]).default("windows"),
  mode: z.enum(["install", "scan-once"]).default("install"),
});
const updateArtifactParams = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
});
const embeddedConfigMarker = Buffer.from("SENTINEL_EDGE_CONFIG_V1", "ascii");
const publicApiBaseHeader = "x-sentinel-public-api-base";

export interface EdgeAgentPackageOptions {
  controlPlanePublicUrl?: string;
  edgeBridgeSharedKey?: string;
  allowLegacyEdgeBridgeKey?: boolean;
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

let cachedExeCrc: { path: string; size: number; mtimeMs: number; crc: number } | undefined;
function getExeCrc(filePath: string, buffer: Buffer, metadata: { size: number; mtimeMs: number }) {
  if (cachedExeCrc && cachedExeCrc.path === filePath && cachedExeCrc.size === metadata.size && cachedExeCrc.mtimeMs === metadata.mtimeMs) {
    return cachedExeCrc.crc;
  }
  const crc = crc32(buffer);
  cachedExeCrc = { path: filePath, size: metadata.size, mtimeMs: metadata.mtimeMs, crc };
  return crc;
}

function makeZip(entries: Array<{ name: string; data: Buffer; store?: boolean; crc?: number }>) {
  const fileEntries: Array<{ header: Buffer; data: Buffer; centralDir: Buffer }> = [];
  let offset = 0;

  for (const entry of entries) {
    const isStore = entry.store === true;
    const compressed = isStore ? entry.data : deflateRawSync(entry.data);
    const method = isStore ? 0 : 8;
    const checksum = entry.crc !== undefined ? entry.crc : crc32(entry.data);
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
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
    centralDir.writeUInt16LE(method, 10);
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

function normalizePublicApiBase(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!(["http:", "https:"] as string[]).includes(url.protocol)) return undefined;
    if (url.username || url.password || url.search || url.hash) return undefined;
    if (url.hostname === "0.0.0.0" || url.hostname === "::" || url.hostname === "[::]") return undefined;
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function resolveControlPlaneUrl(request: { headers: Record<string, string | string[] | undefined> }, configured?: string) {
  const configuredUrl = normalizePublicApiBase(configured);
  if (configuredUrl) return configuredUrl;
  const automaticValue = request.headers[publicApiBaseHeader];
  return normalizePublicApiBase(Array.isArray(automaticValue) ? automaticValue[0] : automaticValue);
}

function requireControlPlaneUrl(request: { headers: Record<string, string | string[] | undefined> }, configured?: string) {
  const resolved = resolveControlPlaneUrl(request, configured);
  if (resolved) return resolved;
  throw Object.assign(
    new Error("The scanner download could not determine the KryptoVision server automatically. Download it again from the KryptoVision portal."),
    { code: "control_plane_public_url_unavailable" },
  );
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
  activationCode?: string,
) {
  return environmentFile({
    CONTROL_PLANE_URL: options.controlPlanePublicUrl ?? "",
    CONTROL_PLANE_TIMEOUT_MS: "15000",
    BRANCH_ID: agent.branchId,
    EDGE_AGENT_ID: agent.id,
    EDGE_AGENT_NAME: agent.name,
    EDGE_AGENT_VERSION: version,
    EDGE_HEARTBEAT_INTERVAL_MS: "15000",
    DEV_USER_ID: options.developmentUserId ?? "",
    EDGE_BRIDGE_SHARED_KEY: activationCode ? "" : options.edgeBridgeSharedKey ?? "",
    EDGE_ACTIVATION_CODE: activationCode ?? "",
    AUTO_DISCOVERY_ENABLED: "true",
    AUTO_DISCOVERY_INTERVAL_MS: "900000",
    ONVIF_ENDPOINTS: "",
    DISCOVERY_TIMEOUT_MS: "5000",
    ONVIF_TIMEOUT_MS: "8000",
    RTSP_SCAN_ENABLED: "true",
    RTSP_SCAN_CIDR: "",
    RTSP_SCAN_PORTS: "554,8554,5554,10554,37777,8000,34567",
    RECORDER_HTTP_PORTS: "80,8080,8899",
    RECORDER_DISCOVERY_MAX_CHANNELS: "64",
    RTSP_SCAN_PATHS: "/,/stream,/h264,/live.sdp,/mpeg4,/Streaming/Channels/101,/cam/realmonitor?channel=1&subtype=1,/cam/realmonitor?channel=1&subtype=0",
    RTSP_SCAN_CONCURRENCY: "4",
    RTSP_DISCOVERY_CONCURRENCY: "32",
    RTSP_DISCOVERY_CONNECT_TIMEOUT_MS: "750",
    RTSP_SCAN_TIMEOUT_MS: "3000",
    FFPROBE_PATH: "ffprobe",
    FFMPEG_PATH: "ffmpeg",
    LIVE_MEDIA_ENABLED: mode === "scan-once" ? "false" : "true",
    EDGE_MANAGED_MEDIA_BOOTSTRAP: mode === "scan-once" ? "false" : "true",
    EDGE_LIVE_GATEWAY_HOST: mode === "scan-once" ? "127.0.0.1" : "0.0.0.0",
    EDGE_LIVE_GATEWAY_PORT: "8090",
    MEDIAMTX_PATH: "mediamtx",
    MEDIA_RUNTIME_MANAGED: mode === "scan-once" ? "false" : "true",
    MEDIAMTX_API_URL: "http://127.0.0.1:9997",
    MEDIAMTX_HLS_URL: "http://127.0.0.1:8888",
    MEDIA_TUNNEL_MODE: mode === "scan-once" ? "disabled" : "quick",
    MEDIA_QUICK_TUNNEL_FALLBACK: "false",
    CLOUDFLARED_PATH: "cloudflared",
    CLOUDFLARED_TUNNEL_TOKEN: "",
    MEDIA_ACCESS_TTL_SECONDS: "300",
    CAMERA_HEARTBEAT_INTERVAL_MS: "30000",
    CAMERA_ANALYTICS_INTERVAL_MS: "2000",
    CAMERA_CONFIG_REFRESH_MS: "60000",
    PUBLIC_MEDIA_GATEWAY_URL: mode === "scan-once" ? "" : "auto",
    EDGE_MEDIA_SHARED_KEY: "",
    STREAM_SECRET_STORE_PATH: "./data/stream-secrets.json",
    EDGE_LOG_PATH: "./logs/edge-agent.log",
    INTERNET_LINKS_JSON: "[]",
    RECORDERS_JSON: "[]",
  });
}

function activationConfiguration(
  agentName: string,
  version: string,
  options: EdgeAgentPackageOptions,
  activationCode: string,
) {
  return environmentFile({
    CONTROL_PLANE_URL: options.controlPlanePublicUrl ?? "",
    CONTROL_PLANE_TIMEOUT_MS: "15000",
    BRANCH_ID: "",
    EDGE_AGENT_ID: "",
    EDGE_AGENT_NAME: agentName,
    EDGE_AGENT_VERSION: version,
    EDGE_HEARTBEAT_INTERVAL_MS: "15000",
    DEV_USER_ID: "",
    EDGE_BRIDGE_SHARED_KEY: "",
    EDGE_ACTIVATION_CODE: activationCode,
    AUTO_DISCOVERY_ENABLED: "true",
    AUTO_DISCOVERY_INTERVAL_MS: "900000",
    ONVIF_ENDPOINTS: "",
    DISCOVERY_TIMEOUT_MS: "5000",
    ONVIF_TIMEOUT_MS: "8000",
    RTSP_SCAN_ENABLED: "true",
    RTSP_SCAN_CIDR: "",
    RTSP_SCAN_PORTS: "554,8554,5554,10554,37777,8000,34567",
    RECORDER_HTTP_PORTS: "80,8080,8899",
    RECORDER_DISCOVERY_MAX_CHANNELS: "64",
    RTSP_SCAN_PATHS: "/,/stream,/h264,/live.sdp,/mpeg4,/Streaming/Channels/101,/cam/realmonitor?channel=1&subtype=1,/cam/realmonitor?channel=1&subtype=0",
    RTSP_SCAN_CONCURRENCY: "4",
    RTSP_DISCOVERY_CONCURRENCY: "32",
    RTSP_DISCOVERY_CONNECT_TIMEOUT_MS: "750",
    RTSP_SCAN_TIMEOUT_MS: "3000",
    FFPROBE_PATH: "ffprobe",
    FFMPEG_PATH: "ffmpeg",
    LIVE_MEDIA_ENABLED: "true",
    EDGE_MANAGED_MEDIA_BOOTSTRAP: "true",
    EDGE_LIVE_GATEWAY_HOST: "0.0.0.0",
    EDGE_LIVE_GATEWAY_PORT: "8090",
    MEDIAMTX_PATH: "mediamtx",
    MEDIA_RUNTIME_MANAGED: "true",
    MEDIAMTX_API_URL: "http://127.0.0.1:9997",
    MEDIAMTX_HLS_URL: "http://127.0.0.1:8888",
    MEDIA_TUNNEL_MODE: "quick",
    MEDIA_QUICK_TUNNEL_FALLBACK: "false",
    CLOUDFLARED_PATH: "cloudflared",
    CLOUDFLARED_TUNNEL_TOKEN: "",
    MEDIA_ACCESS_TTL_SECONDS: "300",
    CAMERA_HEARTBEAT_INTERVAL_MS: "30000",
    CAMERA_ANALYTICS_INTERVAL_MS: "2000",
    CAMERA_CONFIG_REFRESH_MS: "60000",
    PUBLIC_MEDIA_GATEWAY_URL: "auto",
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

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function localDiscoveryReadme(branchName: string) {
  return [
    `KryptoVision temporary local-network scanner for ${branchName}`,
    "",
    "1. Connect this Windows PC to the same wired/Wi-Fi network as the IP cameras and DVR/NVRs.",
    "2. Extract this ZIP and double-click Run Local Discovery.cmd.",
    "3. The scanner securely loads only the saved login for each matching device IP. Unknown devices are reported so you can enter their login individually in KryptoVision.",
    "4. Wait for the completed result, then return to KryptoVision and review the discovered devices.",
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
  /**
   * 1-Click PowerShell Edge Agent Auto-Setup script
   * Invoked via: iwr -useb 'https://.../api/control/v1/branches/:branchId/install.ps1' | iex
   */
  app.get("/v1/branches/:branchId/install.ps1", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    return reply.code(410).send({
      error: "legacy_installer_removed",
      branchId,
      message: "The legacy PowerShell installer has been removed. Create an authenticated edge-agent activation and download the signed package instead.",
    });
  });

  app.post("/v1/branches/:branchId/edge-agent-installer", async (request, reply) => {
    const { branchId } = branchParams.parse(request.params);
    const body = activationInstallerBody.parse(request.body);
    const format = body.format ?? "zip";
    const branch = await store.getNode(branchId);
    if (!branch || branch.type !== "branch") return reply.code(404).send({ error: "branch_not_found" });

    const decision = await store.checkAccess(request.currentUser, "device:configure", branchId);
    if (!decision) return reply.code(404).send({ error: "resource_not_found" });
    if (!decision.allowed) return reply.code(403).send({ error: "forbidden", reason: decision.reason });

    // Do not treat the activation id as audit-only metadata. The downloaded
    // executable contains the one-time code, so both values must refer to the
    // same live activation for this branch. This also prevents a stale or
    // revoked activation from being packaged again.
    const activation = await store.getActiveEdgeActivation({
      id: body.activationId,
      branchId,
      tokenHash: hashSecret(body.activationCode),
    });
    if (!activation) {
      return reply.code(409).send({
        error: "edge_activation_invalid_or_expired",
        message: "Create a new gateway activation and download a fresh installer.",
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
      const packageOptions = {
        ...options,
        controlPlanePublicUrl: requireControlPlaneUrl(request, options.controlPlanePublicUrl),
      };
      const releaseDir = join(root, "release");
      const executablePath = join(releaseDir, "edge-agent.exe");
      let executableSize: number;
      let executableMtime: number;
      try {
        const metadata = await stat(executablePath);
        if (!metadata.isFile()) throw new Error("not a file");
        executableSize = metadata.size;
        executableMtime = metadata.mtimeMs;
      } catch {
        throw Object.assign(new Error(`edge_agent_executable_not_built: ${executablePath}`), { code: "edge_agent_executable_not_built" });
      }
      const safeBranchName = branch.name.replace(/[^a-zA-Z0-9_-]/g, "-");
      const envConfig = Buffer.from(activationConfiguration(body.agentName, version, packageOptions, body.activationCode), "utf8");

      if (format === "zip") {
        const exeBuffer = await readFile(executablePath);
        const exeCrc = getExeCrc(executablePath, exeBuffer, { size: executableSize, mtimeMs: executableMtime });

        const certPath = join(releaseDir, "omsystems-edge-agent.cer");
        const certData = await readFile(certPath).catch(() => Buffer.alloc(0));

        const certInstallerPath = join(releaseDir, "Install-Certificate.bat");
        const certInstallerData = await readFile(certInstallerPath).catch(() => Buffer.from(
          '@echo off\r\nnet session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process \'%~dpnx0\' -Verb RunAs" & exit /b)\r\ncd /d "%~dp0"\r\ncertutil -addstore -f "TrustedPublisher" "omsystems-edge-agent.cer"\r\ncertutil -addstore -f "ROOT" "omsystems-edge-agent.cer"\r\necho Certificate installed successfully.\r\npause\r\n',
          "utf8",
        ));

        const defenderPath = join(releaseDir, "Allow-In-Defender.bat");
        const defenderData = await readFile(defenderPath).catch(() => Buffer.alloc(0));

        const startScannerPath = join(releaseDir, "START_SCANNER.bat");
        const startScannerData = await readFile(startScannerPath).catch(() => Buffer.from(
          '@echo off\r\ncd /d "%~dp0"\r\ntaskkill /F /IM edge-agent.exe /T >nul 2>&1\r\n"%~dp0edge-agent.exe"\r\npause\r\n',
          "utf8",
        ));

        const readmeText = [
          "==============================================================================",
          `KRYPTOVISION SIGNED EDGE AGENT - QUICK SETUP GUIDE`,
          `Branch: ${branch.name}`,
          "==============================================================================",
          "",
          "STEP 1: TRUST CERTIFICATE (ONE-TIME ONLY)",
          '  Right-click "Install-Certificate.bat" and select "Run as administrator".',
          '  Click "Yes" to install the enterprise code signing certificate.',
          "  This completely eliminates Windows Defender and SmartScreen warnings.",
          "",
          "STEP 2: START SCANNER",
          '  Double-click "START_SCANNER.bat" (or run edge-agent.exe).',
          "  The scanner automatically loads branch settings from edge-agent.env,",
          "  discovers connected IP cameras/DVRs, and reports telemetry to KryptoVision.",
          "",
          "STEP 3 (OPTIONAL): WINDOWS DEFENDER WHITELIST",
          '  If your antivirus blocks scanner network ports, right-click',
          '  "Allow-In-Defender.bat" and select "Run as administrator".',
          "==============================================================================",
        ].join("\r\n");

        const entries: Array<{ name: string; data: Buffer; store?: boolean; crc?: number }> = [
          { name: "edge-agent.exe", data: exeBuffer, store: true, crc: exeCrc },
          { name: "edge-agent.env", data: envConfig },
          { name: "START_SCANNER.bat", data: startScannerData },
          { name: "Install-Certificate.bat", data: certInstallerData },
          { name: "README.txt", data: Buffer.from(readmeText, "utf8") },
        ];
        if (certData.length > 0) {
          entries.push({ name: "omsystems-edge-agent.cer", data: certData });
        }
        if (defenderData.length > 0) {
          entries.push({ name: "Allow-In-Defender.bat", data: defenderData });
        }

        const zipData = makeZip(entries);

        await store.writeAudit({
          tenantId: branch.tenantId,
          actorUserId: request.currentUser.id,
          action: "edge_agent.installer_downloaded",
          resourceNodeId: branchId,
          outcome: "success",
          sourceIp: request.ip,
          details: { activationId: body.activationId, version, platform: "windows", format: "signed-zip-package" },
        });

        reply.header("Cache-Control", "no-store, private");
        reply.header("Content-Type", "application/zip");
        reply.header("Content-Length", String(zipData.length));
        reply.header("Content-Disposition", `attachment; filename="${safeBranchName}-signed-edge-agent.zip"`);
        return reply.send(zipData);
      }

      // format === "exe": standalone single executable
      const installer = streamInstaller(executablePath, envConfig);
      await store.writeAudit({
        tenantId: branch.tenantId,
        actorUserId: request.currentUser.id,
        action: "edge_agent.installer_downloaded",
        resourceNodeId: branchId,
        outcome: "success",
        sourceIp: request.ip,
        details: { activationId: body.activationId, version, platform: "windows", format: "self-installing-executable" },
      });
      reply.header("Cache-Control", "no-store, private");
      reply.header("Content-Type", "application/vnd.microsoft.portable-executable");
      reply.header("Content-Length", String(executableSize + installer.footer.length));
      reply.header("Content-Disposition", `attachment; filename="${safeBranchName}-scanner-setup.exe"`);
      return reply.send(installer.stream);
    } catch (error) {
      app.log.error({ err: error, branchId }, "Failed to build edge-agent installer from activation");
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "edge_agent_package_failed";
      const status = code.endsWith("_not_built") || code.endsWith("_unavailable") ? 503 : 500;
      return reply.code(status).send({ error: code, message: error instanceof Error ? error.message : "Package generation failed" });
    }
  });

  // Public direct download for enterprise code signing certificate
  app.get("/v1/edge-agent/download/certificate", {
    config: { noAuth: true },
  }, async (_request, reply) => {
    const root = await findEdgeAgentRoot(options.artifactRoot);
    const certPath = root ? join(root, "release", "omsystems-edge-agent.cer") : undefined;
    if (!certPath) return reply.code(404).send({ error: "certificate_not_found" });
    try {
      const data = await readFile(certPath);
      reply.header("Cache-Control", "public, max-age=86400");
      reply.header("Content-Type", "application/x-x509-ca-cert");
      reply.header("Content-Disposition", 'attachment; filename="omsystems-edge-agent.cer"');
      return reply.send(data);
    } catch {
      return reply.code(404).send({ error: "certificate_not_found" });
    }
  });

  // Public direct download for certificate installer batch script
  app.get("/v1/edge-agent/download/cert-installer", {
    config: { noAuth: true },
  }, async (_request, reply) => {
    const root = await findEdgeAgentRoot(options.artifactRoot);
    const scriptPath = root ? join(root, "release", "Install-Certificate.bat") : undefined;
    if (!scriptPath) return reply.code(404).send({ error: "installer_script_not_found" });
    try {
      const data = await readFile(scriptPath);
      reply.header("Cache-Control", "public, max-age=86400");
      reply.header("Content-Type", "text/plain; charset=utf-8");
      reply.header("Content-Disposition", 'attachment; filename="Install-Certificate.bat"');
      return reply.send(data);
    } catch {
      return reply.code(404).send({ error: "installer_script_not_found" });
    }
  });

  // Public direct download for the full signed distribution package
  app.get("/v1/edge-agent/download/signed-package", {
    config: { noAuth: true },
  }, async (_request, reply) => {
    const root = await findEdgeAgentRoot(options.artifactRoot);
    const zipPath = root ? join(root, "release", "KryptoVision-EdgeAgent-Signed-Windows.zip") : undefined;
    if (!zipPath) return reply.code(404).send({ error: "signed_package_not_found" });
    try {
      const metadata = await stat(zipPath);
      if (!metadata.isFile() || metadata.size <= 0) throw new Error("not a file");
      reply.header("Cache-Control", "public, max-age=86400");
      reply.header("Content-Type", "application/zip");
      reply.header("Content-Length", String(metadata.size));
      reply.header("Content-Disposition", 'attachment; filename="KryptoVision-EdgeAgent-Signed-Windows.zip"');
      return reply.send(createReadStream(zipPath));
    } catch {
      return reply.code(404).send({ error: "signed_package_not_found" });
    }
  });

  // Public endpoint to download the edge-agent bundle (referenced by bootstrap installer)
  app.get("/v1/edge-agent/bundle/edge-agent.cjs", async (request, reply) => {
    const root = await findEdgeAgentRoot(options.artifactRoot);
    if (!root) return reply.code(404).send({ error: "edge_agent_bundle_not_found" });

    try {
      const bundlePath = join(root, "build", "edge-agent.cjs");
      const bundle = await readRequiredFile(bundlePath, "edge_agent_bundle_not_built");
      reply.header("Cache-Control", "public, max-age=3600");
      reply.header("Content-Type", "application/javascript");
      reply.header("Content-Disposition", `attachment; filename="edge-agent.cjs"`);
      return reply.send(bundle);
    } catch (error) {
      return reply.code(404).send({ error: "edge_agent_bundle_not_found" });
    }
  });

  // Public, immutable application-only update payload. Authenticity is not
  // delegated to transport: enrolled agents verify the signed manifest and
  // SHA-256 before this bundle can become active.
  app.get("/v1/edge-updates/artifacts/:version/edge-agent.bundle", {
    config: { noAuth: true },
  }, async (request, reply) => {
    const { version } = updateArtifactParams.parse(request.params);
    const root = await findEdgeAgentRoot(options.artifactRoot);
    if (!root) return reply.code(404).send({ error: "edge_update_artifact_not_found" });
    const artifactPath = join(root, "release", "updates", version, "edge-agent.bundle");
    try {
      const metadata = await stat(artifactPath);
      if (!metadata.isFile() || metadata.size <= 0) throw new Error("not a file");
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Content-Length", String(metadata.size));
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Content-Disposition", `attachment; filename="edge-agent-${version}.bundle"`);
      return reply.send(createReadStream(artifactPath));
    } catch {
      return reply.code(404).send({ error: "edge_update_artifact_not_found" });
    }
  });

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
    if (mode !== "scan-once" && !options.edgeBridgeSharedKey && !options.developmentUserId) {
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
      const packageOptions = {
        ...options,
        controlPlanePublicUrl: requireControlPlaneUrl(request, options.controlPlanePublicUrl),
      };
      const useLegacySharedKey = options.allowLegacyEdgeBridgeKey ?? Boolean(options.edgeBridgeSharedKey);
      const activationCode = mode === "scan-once" && !useLegacySharedKey
        ? `sgact_${randomBytes(32).toString("base64url")}`
        : undefined;
      const activation = activationCode
        ? await store.createEdgeActivation({
            branchId,
            agentName: `${branch.name} temporary local scanner`,
            createdBy: request.currentUser.id,
            expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
            tokenHash: hashSecret(activationCode),
          })
        : undefined;
      const config = Buffer.from(branchConfiguration(agent, version, packageOptions, platform, mode, activationCode), "utf8");
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
            `if not "%EXIT_CODE%"=="0" echo Discovery failed. Check that this PC is on the branch camera network and can reach KryptoVision.`,
            "pause",
            "exit /b %EXIT_CODE%",
            "",
          ].join("\r\n");
          const powerShellRunner = [
            "$ErrorActionPreference = 'Stop'",
            `& (Join-Path $PSScriptRoot '${scannerName}') --scan-once`,
            "exit $LASTEXITCODE",
            "",
          ].join("\r\n");
          await store.writeAudit({
            tenantId: branch.tenantId, actorUserId: request.currentUser.id,
            action: "edge_agent.local_scanner_downloaded", resourceNodeId: branchId,
            outcome: "success", sourceIp: request.ip,
            details: {
              edgeAgentId,
              platform,
              version,
              mode,
              ...(activation ? { activationId: activation.id, activationExpiresAt: activation.expiresAt } : {}),
            },
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
      const status = code.endsWith("_not_built") || code.endsWith("_unavailable") ? 503 : 500;
      return reply.code(status).send({ error: code, message: error instanceof Error ? error.message : "Package generation failed" });
    }
  });
}
