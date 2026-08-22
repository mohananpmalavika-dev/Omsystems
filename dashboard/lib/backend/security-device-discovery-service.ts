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
	private readonly tenantId: string;

	constructor(pool: Pool) {
		super(pool);
		this.tenantId = process.env.DEFAULT_TENANT_ID || 'default-tenant';
	}

	static getInstance(): SecurityDeviceDiscoveryService {
		if (!SecurityDeviceDiscoveryService.instance) {
			const connectionString =
				process.env.DATABASE_URL ||
				process.env.POSTGRES_URL;
			if (!connectionString) throw new Error('DATABASE_URL or POSTGRES_URL is required');

			SecurityDeviceDiscoveryService.instance = new SecurityDeviceDiscoveryService(
				new Pool({ connectionString })
			);
		}

		return SecurityDeviceDiscoveryService.instance;
	}

	approveDiscoveredDevice(tenantId: string, deviceId: string, reviewedBy: string): Promise<void>;
	approveDiscoveredDevice(deviceId: string, reviewedBy: string): Promise<void>;
	async approveDiscoveredDevice(
		first: string,
		second: string,
		third?: string
	): Promise<void> {
		return third
			? super.approveDiscoveredDevice(first, second, third)
			: super.approveDiscoveredDevice(this.tenantId, first, second);
	}

	rejectDiscoveredDevice(tenantId: string, deviceId: string, reviewedBy: string): Promise<void>;
	rejectDiscoveredDevice(deviceId: string, reviewedBy?: string): Promise<void>;
	async rejectDiscoveredDevice(
		first: string,
		second?: string,
		third?: string
	): Promise<void> {
		return third
			? super.rejectDiscoveredDevice(first, second!, third)
			: super.rejectDiscoveredDevice(this.tenantId, first, second || 'system');
	}

	async listDiscoveredDevices(jobId?: string, status?: string): Promise<any[]> {
		const result = await super.getDiscoveredDevices(this.tenantId, {
			jobId,
			enrollmentStatus: status,
			limit: 100,
		});

		return result.devices;
	}

	listDiscoveryJobs(tenantId: string, filters: any): Promise<any>;
	listDiscoveryJobs(status?: string): Promise<any[]>;
	async listDiscoveryJobs(first?: string, filters?: any): Promise<any> {
		if (filters !== undefined) {
			return super.listDiscoveryJobs(first!, filters);
		}

		const result = await super.listDiscoveryJobs(this.tenantId, {
			status: first,
			limit: 100,
		});

		return result.jobs;
	}

	startDiscovery(
		tenantId: string,
		branchId: string | null,
		networkRange: string,
		options: any,
		createdBy: string
	): Promise<any>;
	startDiscovery(
		branchId: string,
		networkRanges: string | string[],
		protocols?: string[],
		initiatedBy?: string,
		options?: any
	): Promise<any>;
	async startDiscovery(
		first: string,
		second: string | null | string[],
		third?: string | string[],
		fourth?: any,
		fifth?: any
	): Promise<any> {
		if (fifth !== undefined) {
			return super.startDiscovery(first, second as string | null, third as any, fourth, fifth);
		}

		const branchId = first;
		const networkRanges = second as string | string[];
		const protocols = third as string[] | undefined;
		const initiatedBy = fourth as string | undefined;
		const options = fifth;
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
