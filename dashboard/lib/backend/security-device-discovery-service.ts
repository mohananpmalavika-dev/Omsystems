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
}

export default SecurityDeviceDiscoveryService;
