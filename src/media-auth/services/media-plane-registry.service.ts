/**
 * Media Plane Node Registry Service
 * Tracks media plane instances (RTSP Ingest, WebRTC relay, Edge proxies)
 * and selects the least-loaded healthy media node for stream assignment.
 */

import { MediaPlaneNode, MediaNodeType } from '../domain/media-token.types.js';

export class MediaPlaneRegistryService {
  private nodes = new Map<string, MediaPlaneNode>();
  private readonly HEARTBEAT_TIMEOUT_MS = 30_000; // 30s

  constructor() {
    this.seedDefaultNodes();
  }

  private seedDefaultNodes() {
    this.registerNode({
      nodeId: 'media-node-mumbai-01',
      nodeName: 'Mumbai Media Gateway Primary',
      host: '10.0.1.10',
      publicHost: 'media-mumbai-01.sentinel.bank.in',
      port: 8554,
      relayPort: 8443,
      type: 'PRIMARY_INGEST',
      region: 'ap-south-1',
      status: 'HEALTHY',
      activeStreams: 24,
      maxStreams: 200,
      ingressMbps: 180.0,
      maxIngressMbps: 1500.0,
      lastHeartbeat: Date.now(),
    });

    this.registerNode({
      nodeId: 'media-node-mumbai-02',
      nodeName: 'Mumbai Media Gateway Secondary',
      host: '10.0.2.10',
      publicHost: 'media-mumbai-02.sentinel.bank.in',
      port: 8554,
      relayPort: 8443,
      type: 'PRIMARY_INGEST',
      region: 'ap-south-1',
      status: 'HEALTHY',
      activeStreams: 8,
      maxStreams: 200,
      ingressMbps: 60.0,
      maxIngressMbps: 1500.0,
      lastHeartbeat: Date.now(),
    });

    this.registerNode({
      nodeId: 'media-node-delhi-01',
      nodeName: 'Delhi Media Gateway Edge',
      host: '10.1.1.10',
      publicHost: 'media-delhi-01.sentinel.bank.in',
      port: 8554,
      relayPort: 8443,
      type: 'EDGE_RELAY',
      region: 'ap-south-delhi',
      status: 'HEALTHY',
      activeStreams: 12,
      maxStreams: 100,
      ingressMbps: 90.0,
      maxIngressMbps: 800.0,
      lastHeartbeat: Date.now(),
    });
  }

  registerNode(node: MediaPlaneNode): void {
    this.nodes.set(node.nodeId, node);
  }

  heartbeat(nodeId: string, activeStreams?: number, ingressMbps?: number): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    node.lastHeartbeat = Date.now();
    node.status = 'HEALTHY';
    if (activeStreams !== undefined) node.activeStreams = activeStreams;
    if (ingressMbps !== undefined) node.ingressMbps = ingressMbps;
    return true;
  }

  /**
   * Selects the least-loaded healthy media node for the requested region and node type.
   */
  selectOptimalMediaNode(preferredRegion?: string, preferredType?: MediaNodeType): MediaPlaneNode | null {
    const now = Date.now();
    const candidates: MediaPlaneNode[] = [];

    for (const node of this.nodes.values()) {
      // Check heartbeat freshness
      if (now - node.lastHeartbeat > this.HEARTBEAT_TIMEOUT_MS) {
        node.status = 'OFFLINE';
        continue;
      }

      if (node.status !== 'HEALTHY') continue;
      if (node.activeStreams >= node.maxStreams) continue;

      if (preferredType && node.type !== preferredType) continue;

      candidates.push(node);
    }

    if (candidates.length === 0) {
      // Fallback: any healthy node regardless of type
      for (const node of this.nodes.values()) {
        if (now - node.lastHeartbeat <= this.HEARTBEAT_TIMEOUT_MS && node.status === 'HEALTHY') {
          candidates.push(node);
        }
      }
    }

    if (candidates.length === 0) return null;

    // Filter by region if requested
    const regionMatches = preferredRegion
      ? candidates.filter((c) => c.region === preferredRegion)
      : [];

    const poolToRank = regionMatches.length > 0 ? regionMatches : candidates;

    // Rank by load percentage (activeStreams / maxStreams)
    poolToRank.sort((a, b) => {
      const loadA = a.activeStreams / a.maxStreams;
      const loadB = b.activeStreams / b.maxStreams;
      return loadA - loadB;
    });

    return poolToRank[0]!;
  }

  getNode(nodeId: string): MediaPlaneNode | null {
    return this.nodes.get(nodeId) || null;
  }

  listNodes(): MediaPlaneNode[] {
    return Array.from(this.nodes.values());
  }
}

export const mediaPlaneRegistry = new MediaPlaneRegistryService();
