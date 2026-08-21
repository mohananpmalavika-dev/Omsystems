/**
 * Dashboard-side wrapper for SecurityDeviceDiscoveryService
 * 
 * The backend service exposes a factory function, but the dashboard route code
 * expects a singleton-style API. This compatibility shim keeps the route contract
 * stable while reusing the backend implementation.
 */

import { Pool } from 'pg';
import { SecurityDeviceDiscoveryService as BackendSecurityDeviceDiscoveryService } from '../../../backend/src/services/security-device-discovery.service';

export class SecurityDeviceDiscoveryService extends BackendSecurityDeviceDiscoveryService {
	private static instance: SecurityDeviceDiscoveryService | null = null;

	static getInstance(): SecurityDeviceDiscoveryService {
		if (!SecurityDeviceDiscoveryService.instance) {
			const connectionString =
				process.env.DATABASE_URL ||
				process.env.POSTGRES_URL ||
				'postgresql://postgres:postgres@localhost:5432/sentinel';

			SecurityDeviceDiscoveryService.instance = new SecurityDeviceDiscoveryService(
				new Pool({ connectionString })
			);
		}

		return SecurityDeviceDiscoveryService.instance;
	}

	async approveDiscoveredDevice(deviceId: string, reviewedBy: string): Promise<void> {
		return super.approveDiscoveredDevice(this.tenantId, deviceId, reviewedBy);
	}

	async rejectDiscoveredDevice(deviceId: string, reviewedBy: string = 'system'): Promise<void> {
		return super.rejectDiscoveredDevice(this.tenantId, deviceId, reviewedBy);
	}

	async listDiscoveredDevices(jobId?: string, status?: string): Promise<any[]> {
		const result = await super.getDiscoveredDevices(this.tenantId, {
			jobId,
			enrollmentStatus: status,
			limit: 100,
		});

		return result.devices;
	}

	async listDiscoveryJobs(status?: string): Promise<any[]> {
		const result = await super.listDiscoveryJobs(this.tenantId, {
			status,
			limit: 100,
		});

		return result.jobs;
	}

	async startDiscovery(
		branchId: string,
		networkRanges: string | string[],
		protocols?: string[],
		initiatedBy?: string,
		options?: any
	): Promise<any> {
		const addr = Array.isArray(networkRanges) ? networkRanges.join(',') : networkRanges;
		const normalizedOptions = {
			deepScan: false,
			includeDeviceTypes: undefined,
			excludeDeviceTypes: undefined,
			...(options || {}),
			...(protocols ? { protocolFilter: protocols } : {}),
		};

		return super.startDiscovery(
			this.tenantId,
			branchId,
			addr,
			normalizedOptions,
			initiatedBy || 'dashboard-user'
		);
	}
}

export default SecurityDeviceDiscoveryService;
