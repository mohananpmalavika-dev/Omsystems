/**
 * Dashboard-side wrapper for SecurityDeviceService
 * 
 * The backend service exposes a factory function, but the dashboard route code
 * expects a singleton-style API. This compatibility shim keeps the route contract
 * stable while reusing the backend implementation.
 */

import { Pool } from 'pg';
import { SecurityDeviceService as BackendSecurityDeviceService } from '../../../backend/src/services/security-device.service';

export class SecurityDeviceService extends BackendSecurityDeviceService {
	private static instance: SecurityDeviceService | null = null;
	private readonly tenantId: string;

	constructor(pool: Pool) {
		super(pool);
		this.tenantId = process.env.DEFAULT_TENANT_ID || 'default-tenant';
	}

	static getInstance(): SecurityDeviceService {
		if (!SecurityDeviceService.instance) {
			const connectionString =
				process.env.DATABASE_URL ||
				process.env.POSTGRES_URL ||
				'postgresql://postgres:postgres@localhost:5432/sentinel';

			SecurityDeviceService.instance = new SecurityDeviceService(
				new Pool({ connectionString })
			);
		}

		return SecurityDeviceService.instance;
	}

	async getAllDevices(filters: any = {}): Promise<any[]> {
		const result = await this.listDevices({
			tenantId: this.tenantId,
			...(filters || {}),
		});
		return result.devices;
	}

	async getDeviceById(deviceId: string): Promise<any> {
		return this.getDevice(this.tenantId, deviceId);
	}

	async getBranchSecurityPosture(branchId: string): Promise<any> {
		return this.getBranchPosture(this.tenantId, branchId);
	}

	async getDeviceHealthHistory(deviceId: string, hours = 24): Promise<any[]> {
		return [];
	}

	async getDeviceEvents(filters: any, limit = 100): Promise<any[]> {
		const request = {
			...(filters || {}),
			deviceIds: filters?.deviceId ? [filters.deviceId] : undefined,
			limit,
		};

		return this.getDeviceEventsInternal(this.tenantId, request);
	}

	private async getDeviceEventsInternal(tenantId: string, request: any): Promise<any[]> {
		return super.getDeviceEvents(tenantId, request);
	}

	async executeCommand(
		deviceId: string,
		command: string,
		requestedBy: string,
		parameters?: Record<string, any>,
		reason?: string,
		mfaToken?: string
	): Promise<any> {
		return super.executeCommand(this.tenantId, deviceId, {
			command: command as any,
			parameters: parameters || {},
			reason,
			requiresMFA: !!mfaToken,
		}, requestedBy);
	}
}

export default SecurityDeviceService;
