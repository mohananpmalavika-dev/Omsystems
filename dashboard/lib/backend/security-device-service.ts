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

	getDeviceEvents(tenantId: string, request: any): Promise<any[]>;
	getDeviceEvents(filters: any, limit?: number): Promise<any[]>;
	async getDeviceEvents(first: any, second?: any): Promise<any[]> {
		if (typeof second !== 'number') {
			return super.getDeviceEvents(first, second || {});
		}

		const request = {
			...(first || {}),
			deviceIds: first?.deviceId ? [first.deviceId] : undefined,
			limit: second || 100,
		};

		return this.getDeviceEventsInternal(this.tenantId, request);
	}

	private async getDeviceEventsInternal(tenantId: string, request: any): Promise<any[]> {
		return super.getDeviceEvents(tenantId, request);
	}

	executeCommand(tenantId: string, deviceId: string, request: any, requestedBy: string): Promise<any>;
	executeCommand(
		deviceId: string,
		command: string,
		requestedBy: string,
		parameters?: Record<string, any>,
		reason?: string,
		mfaToken?: string
	): Promise<any>;
	async executeCommand(
		first: string,
		second: string,
		third: any,
		fourth?: any,
		fifth?: string,
		sixth?: string
	): Promise<any> {
		if (typeof third === 'object') {
			return super.executeCommand(first, second, third, fourth);
		}

		return super.executeCommand(this.tenantId, first, {
			command: second as any,
			parameters: fourth || {},
			reason: fifth,
			requiresMFA: !!sixth,
		}, third);
	}
}

export default SecurityDeviceService;
