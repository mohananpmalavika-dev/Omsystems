/**
 * Prometheus & Observability Metrics for Media Streaming Subsystem
 */

export interface MediaClusterMetrics {
  activeStreamLeases: number;
  activeRelays: number;
  totalGatewaysHealthy: number;
  totalGatewaysDegraded: number;
  totalGatewaysOverloaded: number;
  totalClusterBandwidthMbps: number;
  maxClusterBandwidthMbps: number;
  transcodingSessions: number;
  leaseAcquisitionSuccessCount: number;
  leaseAcquisitionConflictCount: number;
  leaseRenewalsCount: number;
  leaseReleasesCount: number;
  streamFailuresCount: number;
}

export class MediaMetricsService {
  private static instance: MediaMetricsService;

  private activeLeases = 0;
  private activeRelays = 0;
  private acquisitions = 0;
  private conflicts = 0;
  private renewals = 0;
  private releases = 0;
  private failures = 0;

  static getInstance(): MediaMetricsService {
    if (!MediaMetricsService.instance) {
      MediaMetricsService.instance = new MediaMetricsService();
    }
    return MediaMetricsService.instance;
  }

  recordLeaseAcquired(): void {
    this.acquisitions++;
    this.activeLeases++;
  }

  recordLeaseConflict(): void {
    this.conflicts++;
  }

  recordLeaseRenewed(): void {
    this.renewals++;
  }

  recordLeaseReleased(): void {
    this.releases++;
    if (this.activeLeases > 0) this.activeLeases--;
  }

  recordStreamFailure(): void {
    this.failures++;
  }

  recordRelayStarted(): void {
    this.activeRelays++;
  }

  recordRelayStopped(): void {
    if (this.activeRelays > 0) this.activeRelays--;
  }

  getMetrics(): MediaClusterMetrics {
    return {
      activeStreamLeases: this.activeLeases,
      activeRelays: this.activeRelays,
      totalGatewaysHealthy: 1,
      totalGatewaysDegraded: 0,
      totalGatewaysOverloaded: 0,
      totalClusterBandwidthMbps: this.activeLeases * 1.5,
      maxClusterBandwidthMbps: 10_000,
      transcodingSessions: 0,
      leaseAcquisitionSuccessCount: this.acquisitions,
      leaseAcquisitionConflictCount: this.conflicts,
      leaseRenewalsCount: this.renewals,
      leaseReleasesCount: this.releases,
      streamFailuresCount: this.failures,
    };
  }
}
