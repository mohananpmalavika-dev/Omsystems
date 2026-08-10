/**
 * Camera Discovery Service
 * Orchestrates camera discovery, fingerprinting, and deduplication
 */

import { Pool } from 'pg';
import {
  CameraDiscoveryResult,
  DiscoveredCamera,
  ImportedCamera,
} from '../models/provisioning-result';
import { ProvisioningContext, DiscoveryContext } from '../models/provisioning-context';
import { DeviceDiscoveryProvider } from './discovery-provider.interface';
import { OnvifDiscoveryProvider } from './onvif-discovery.provider';
import { SubnetDiscoveryProvider } from './subnet-discovery.provider';
import { DeviceFingerprintService } from './device-fingerprint.service';
import { DuplicateDetectorService } from './duplicate-detector.service';

export class CameraDiscoveryService {
  private providers: DeviceDiscoveryProvider[];
  private fingerprintService: DeviceFingerprintService;
  private duplicateDetector: DuplicateDetectorService;

  constructor(
    private pool: Pool,
    providers?: DeviceDiscoveryProvider[]
  ) {
    // Default providers
    this.providers = providers || [
      new OnvifDiscoveryProvider(),
      new SubnetDiscoveryProvider(),
    ];

    this.fingerprintService = new DeviceFingerprintService();
    this.duplicateDetector = new DuplicateDetectorService();
  }

  /**
   * Discover and import cameras
   */
  async discoverAndImport(
    context: ProvisioningContext
  ): Promise<CameraDiscoveryResult> {
    // Step 1: Discovery from all providers
    const candidates = await this.discoverCameras(context);

    // Step 2: Normalize and fingerprint
    const fingerprinted = await this.fingerprintService.fingerprintAll(
      candidates
    );

    // Step 3: Filter to high-confidence cameras
    const likelyCameras = this.fingerprintService.filterCameras(
      fingerprinted,
      0.7
    );

    // Step 4: Deduplicate
    const { unique, duplicates } = this.duplicateDetector.removeDuplicates(
      likelyCameras
    );

    // Step 5: Separate reachable from unreachable
    // (In a full implementation, you'd ping/probe each device)
    const reachable = unique;
    const unreachable: DiscoveredCamera[] = [];

    // Step 6: Import to database
    // Note: Authentication and import logic will be added separately
    const imported: ImportedCamera[] = [];
    const authFailures: DiscoveredCamera[] = [];

    // Calculate statistics
    const totalDiscovered = candidates.length;
    const totalImported = imported.length;
    const successRate =
      totalDiscovered > 0 ? (totalImported / totalDiscovered) * 100 : 0;

    return {
      discovered: reachable,
      imported,
      duplicates,
      unreachable,
      authenticationFailures: authFailures,
      unsupported: fingerprinted.filter(
        d => !d.fingerprint || d.fingerprint.type !== 'camera'
      ),
      totalDiscovered,
      totalImported,
      successRate,
    };
  }

  /**
   * Discover cameras from all providers
   */
  private async discoverCameras(
    context: ProvisioningContext
  ): Promise<DiscoveredCamera[]> {
    const config = context.config.discovery;
    const discoveryContext: DiscoveryContext = {
      branchId: context.branchId,
      tenantId: context.tenantId,
      approvedSubnets: config.approvedSubnets,
      scanPorts: config.scanPorts,
      timeoutSeconds: config.discoveryTimeoutSeconds,
    };

    const allCandidates: DiscoveredCamera[] = [];

    // Run enabled discovery providers
    for (const provider of this.providers) {
      try {
        // Check if provider should run
        if (!this.shouldRunProvider(provider, config)) {
          continue;
        }

        // Check if provider is available
        const available = await provider.isAvailable();
        if (!available) {
          console.warn(`Provider ${provider.name} is not available`);
          continue;
        }

        // Run discovery
        console.log(`Running discovery provider: ${provider.name}`);
        const discovered = await provider.discover(discoveryContext);
        console.log(
          `Provider ${provider.name} discovered ${discovered.length} devices`
        );

        allCandidates.push(...discovered);
      } catch (error) {
        console.error(
          `Error running discovery provider ${provider.name}:`,
          error
        );
        // Continue with other providers
      }
    }

    return allCandidates;
  }

  /**
   * Determine if a provider should run based on configuration
   */
  private shouldRunProvider(
    provider: DeviceDiscoveryProvider,
    config: any
  ): boolean {
    if (provider.name === 'onvif') {
      return config.enableOnvifDiscovery !== false;
    }

    if (provider.name === 'subnet-scan') {
      return config.enableSubnetScan !== false;
    }

    // Unknown providers run by default
    return true;
  }

  /**
   * Get discovery status for a branch
   */
  async getDiscoveryStatus(branchId: string): Promise<{
    totalDiscovered: number;
    totalImported: number;
    lastDiscoveryAt?: Date;
  }> {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE discovery_source IS NOT NULL) as total_discovered,
        COUNT(*) FILTER (WHERE status = 'active') as total_imported,
        MAX(discovered_at) as last_discovery_at
      FROM cameras
      WHERE branch_id = $1
    `;

    const result = await this.pool.query(query, [branchId]);
    const row = result.rows[0];

    return {
      totalDiscovered: parseInt(row.total_discovered) || 0,
      totalImported: parseInt(row.total_imported) || 0,
      lastDiscoveryAt: row.last_discovery_at,
    };
  }

  /**
   * Save discovered cameras to database (without full import)
   */
  async saveDiscoveredCameras(
    branchId: string,
    tenantId: string,
    cameras: DiscoveredCamera[]
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const camera of cameras) {
        // Check if camera already exists
        const existingQuery = `
          SELECT id FROM cameras
          WHERE branch_id = $1 
            AND (
              ip_address = $2
              OR (serial_number = $3 AND $3 IS NOT NULL)
              OR (onvif_endpoint = $4 AND $4 IS NOT NULL)
            )
          LIMIT 1
        `;

        const existingResult = await client.query(existingQuery, [
          branchId,
          camera.ipAddress,
          camera.serialNumber || null,
          camera.endpointReference || null,
        ]);

        if (existingResult.rows.length > 0) {
          // Camera already exists, skip
          continue;
        }

        // Insert discovered camera
        const insertQuery = `
          INSERT INTO cameras (
            branch_id, tenant_id,
            name, ip_address,
            vendor, model, serial_number,
            discovery_source, onvif_endpoint,
            discovered_at, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'discovered')
          ON CONFLICT (branch_id, ip_address) DO NOTHING
        `;

        const name = this.generateCameraName(camera);

        await client.query(insertQuery, [
          branchId,
          tenantId,
          name,
          camera.ipAddress,
          camera.vendor || null,
          camera.model || null,
          camera.serialNumber || null,
          camera.discoverySource,
          camera.endpointReference || null,
          camera.discoveredAt,
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate camera name from discovered information
   */
  private generateCameraName(camera: DiscoveredCamera): string {
    if (camera.vendor && camera.model) {
      return `${camera.vendor} ${camera.model} (${camera.ipAddress})`;
    }

    if (camera.vendor) {
      return `${camera.vendor} Camera (${camera.ipAddress})`;
    }

    return `Camera ${camera.ipAddress}`;
  }
}
