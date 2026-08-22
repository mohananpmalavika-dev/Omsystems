import { resolve, join } from "node:path";

export interface ResolvedStorageSource {
  storageUri: string;
  protocol: "recording" | "file" | "s3" | "nvr" | "http" | "unknown";
  localPath?: string;
  streamUrl?: string;
  isLocal: boolean;
  requiresRestore: boolean;
  storageNodeId?: string;
  storageTier: "HOT" | "WARM" | "COLD" | "ARCHIVE";
  archiveState: "ONLINE" | "NEARLINE" | "ARCHIVED" | "RESTORING" | "OFFLINE" | "DELETED" | "LEGAL_HOLD";
}

export interface StorageResolverConfig {
  localNodeId?: string;
  nodeMounts?: Record<string, string>; // e.g. { "storage-01": "/mnt/storage01", "default": "./recordings" }
  s3BaseUrl?: string;
  nvrProxyBaseUrl?: string;
}

export class StorageResolver {
  private readonly localNodeId: string;
  private readonly nodeMounts: Map<string, string> = new Map();
  private readonly defaultRoot: string;
  private readonly s3BaseUrl?: string;
  private readonly nvrProxyBaseUrl?: string;

  constructor(config: StorageResolverConfig = {}) {
    this.localNodeId = config.localNodeId || "sentinel-local";
    this.defaultRoot = config.nodeMounts?.default || "./recordings";
    this.s3BaseUrl = config.s3BaseUrl;
    this.nvrProxyBaseUrl = config.nvrProxyBaseUrl;

    if (config.nodeMounts) {
      for (const [nodeId, mount] of Object.entries(config.nodeMounts)) {
        this.nodeMounts.set(nodeId, mount);
      }
    }
  }

  /**
   * Resolves a logical storage URI to an actionable file path or streamable endpoint.
   */
  resolve(
    storageUri: string,
    context: {
      archiveState?: "ONLINE" | "NEARLINE" | "ARCHIVED" | "RESTORING" | "OFFLINE" | "DELETED" | "LEGAL_HOLD";
      storageTier?: "HOT" | "WARM" | "COLD" | "ARCHIVE";
      preferStreaming?: boolean;
    } = {},
  ): ResolvedStorageSource {
    const archiveState = context.archiveState || "ONLINE";
    const storageTier = context.storageTier || "HOT";
    const requiresRestore = archiveState === "ARCHIVED" || archiveState === "NEARLINE";

    // 1. recording://storage-node/tenant/branch/camera/YYYY/MM/DD/segment.mkv
    if (storageUri.startsWith("recording://")) {
      const parsed = this.parseRecordingUri(storageUri);
      const nodeMount = this.nodeMounts.get(parsed.nodeId) || this.nodeMounts.get("default") || this.defaultRoot;
      const localPath = resolve(join(nodeMount, parsed.relativePath));
      const isLocal = !parsed.nodeId || parsed.nodeId === this.localNodeId;

      return {
        storageUri,
        protocol: "recording",
        localPath,
        streamUrl: `/api/v1/media/stream?uri=${encodeURIComponent(storageUri)}`,
        isLocal,
        requiresRestore,
        storageNodeId: parsed.nodeId,
        storageTier,
        archiveState,
      };
    }

    // 2. file:///mnt/... or file://C:/...
    if (storageUri.startsWith("file://")) {
      let rawPath = storageUri.replace(/^file:\/\//, "");
      if (process.platform === "win32" && rawPath.startsWith("/")) {
        rawPath = rawPath.slice(1);
      }
      const localPath = resolve(rawPath);

      return {
        storageUri,
        protocol: "file",
        localPath,
        streamUrl: `/api/v1/media/stream?uri=${encodeURIComponent(storageUri)}`,
        isLocal: true,
        requiresRestore,
        storageTier,
        archiveState,
      };
    }

    // 3. s3://bucket/key
    if (storageUri.startsWith("s3://")) {
      const match = storageUri.match(/^s3:\/\/([^/]+)\/(.+)$/);
      const bucket = match?.[1] ?? "unknown";
      const key = match?.[2] ?? "";
      const streamUrl = this.s3BaseUrl
        ? `${this.s3BaseUrl.replace(/\/$/, "")}/${bucket}/${key}`
        : `/api/v1/media/archive-proxy?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;

      return {
        storageUri,
        protocol: "s3",
        streamUrl,
        isLocal: false,
        requiresRestore,
        storageTier: storageTier === "HOT" ? "ARCHIVE" : storageTier,
        archiveState: archiveState === "ONLINE" ? "ARCHIVED" : archiveState,
      };
    }

    // 4. nvr://recorderId/channel/timestamp
    if (storageUri.startsWith("nvr://")) {
      const match = storageUri.match(/^nvr:\/\/([^/]+)\/([^/]+)\/(.+)$/);
      const nvrId = match?.[1] ?? "unknown";
      const channel = match?.[2] ?? "0";
      const timestamp = match?.[3] ?? "";
      const streamUrl = this.nvrProxyBaseUrl
        ? `${this.nvrProxyBaseUrl.replace(/\/$/, "")}/${nvrId}/${channel}/${timestamp}`
        : `/api/v1/media/nvr-proxy?recorderId=${encodeURIComponent(nvrId)}&channel=${encodeURIComponent(channel)}&time=${encodeURIComponent(timestamp)}`;

      return {
        storageUri,
        protocol: "nvr",
        streamUrl,
        isLocal: false,
        requiresRestore: false,
        storageTier: "HOT",
        archiveState: "ONLINE",
      };
    }

    // 5. Plain relative or absolute filesystem path
    const localPath = resolve(storageUri);
    return {
      storageUri,
      protocol: "file",
      localPath,
      streamUrl: `/api/v1/media/stream?uri=${encodeURIComponent(storageUri)}`,
      isLocal: true,
      requiresRestore,
      storageTier,
      archiveState,
    };
  }

  private parseRecordingUri(uri: string): { nodeId: string; relativePath: string } {
    const withoutScheme = uri.slice("recording://".length);
    const slashIdx = withoutScheme.indexOf("/");
    if (slashIdx === -1) {
      return { nodeId: withoutScheme, relativePath: "" };
    }
    return {
      nodeId: withoutScheme.slice(0, slashIdx),
      relativePath: withoutScheme.slice(slashIdx + 1),
    };
  }

  formatRecordingUri(nodeId: string, relativePath: string): string {
    const cleanRelative = relativePath.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    return `recording://${nodeId}/${cleanRelative}`;
  }

  formatS3Uri(bucket: string, key: string): string {
    const cleanKey = key.replace(/^[/\\]+/, "");
    return `s3://${bucket}/${cleanKey}`;
  }

  formatNvrUri(recorderId: string, channel: string, timestamp: string): string {
    return `nvr://${recorderId}/${channel}/${timestamp}`;
  }
}

export const storageResolver = new StorageResolver();
