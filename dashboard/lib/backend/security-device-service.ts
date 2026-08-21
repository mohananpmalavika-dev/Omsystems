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
}

export default SecurityDeviceService;
