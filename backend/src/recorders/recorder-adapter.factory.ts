/**
 * Recorder Adapter Factory
 * 
 * Creates appropriate adapter based on recorder vendor.
 * Priority order:
 * 1. Vendor-specific adapter (Hikvision, Dahua, etc.)
 * 2. ONVIF adapter (standardized)
 * 3. Generic adapter (basic connectivity only)
 */

import type { Pool } from 'pg';
import type { RecorderAdapter, RecorderConnection } from './recorder-adapter.interface.js';
import type { Recorder } from './types/index.js';
import { HikvisionRecorderAdapter } from './adapters/hikvision-recorder.adapter.js';
import { DahuaRecorderAdapter } from './adapters/dahua-recorder.adapter.js';
import { OnvifRecorderAdapter } from './adapters/onvif-recorder.adapter.js';
import { GenericRecorderAdapter } from './adapters/generic-recorder.adapter.js';
import { logger } from '../utils/logger.js';

/**
 * Supported recorder vendors
 */
export type SupportedRecorderVendor =
  | 'hikvision'
  | 'dahua'
  | 'axis'
  | 'hanwha'
  | 'uniview'
  | 'tiandy'
  | 'cp-plus'
  | 'onvif'
  | 'generic';

/**
 * Normalize vendor name to standard identifier
 */
function normalizeVendor(vendor: string): SupportedRecorderVendor {
  const normalized = vendor.toLowerCase().trim();
  
  if (normalized.includes('hikvision') || normalized.includes('hik')) {
    return 'hikvision';
  }
  
  if (normalized.includes('dahua')) {
    return 'dahua';
  }
  
  if (normalized.includes('axis')) {
    return 'axis';
  }
  
  if (normalized.includes('hanwha') || normalized.includes('samsung')) {
    return 'hanwha';
  }
  
  if (normalized.includes('uniview')) {
    return 'uniview';
  }
  
  if (normalized.includes('tiandy')) {
    return 'tiandy';
  }
  
  if (normalized.includes('cp-plus') || normalized.includes('cpplus')) {
    return 'cp-plus';
  }
  
  if (normalized === 'onvif') {
    return 'onvif';
  }
  
  return 'generic';
}

/**
 * Recorder Adapter Factory
 */
export class RecorderAdapterFactory {
  constructor(private pool: Pool) {}
  
  /**
   * Create adapter for recorder
   * 
   * Priority:
   * 1. Known vendor → vendor-specific adapter
   * 2. Unknown vendor → ONVIF adapter
   * 3. ONVIF fails → generic connectivity adapter
   */
  async create(recorder: Recorder): Promise<RecorderAdapter> {
    try {
      // Get credentials from secure store
      const credentials = await this.getRecorderCredentials(recorder);
      
      const connection: RecorderConnection = {
        ipAddress: recorder.ipAddress,
        port: recorder.port,
        protocol: recorder.protocol === 'https' ? 'https' : 'http',
        credentials
      };
      
      // Normalize vendor identifier
      const vendor = normalizeVendor(recorder.vendor);
      
      logger.debug('Creating recorder adapter', {
        recorderId: recorder.id,
        vendor,
        originalVendor: recorder.vendor,
        ipAddress: recorder.ipAddress
      });
      
      // Create vendor-specific adapter
      switch (vendor) {
        case 'hikvision':
          return new HikvisionRecorderAdapter(recorder, connection);
        
        case 'dahua':
          return new DahuaRecorderAdapter(recorder, connection);
        
        case 'axis':
        case 'hanwha':
        case 'uniview':
        case 'tiandy':
        case 'cp-plus':
          // These vendors support ONVIF well, use ONVIF adapter
          logger.info(`Using ONVIF adapter for ${vendor} recorder`, {
            recorderId: recorder.id
          });
          return new OnvifRecorderAdapter(recorder, connection);
        
        case 'onvif':
          return new OnvifRecorderAdapter(recorder, connection);
        
        case 'generic':
        default:
          logger.warn('Unknown recorder vendor, using generic adapter', {
            recorderId: recorder.id,
            vendor: recorder.vendor
          });
          return new GenericRecorderAdapter(recorder, connection);
      }
      
    } catch (error) {
      logger.error('Failed to create recorder adapter', {
        error,
        recorderId: recorder.id,
        vendor: recorder.vendor
      });
      
      // Return generic adapter as fallback
      return new GenericRecorderAdapter(recorder, {
        ipAddress: recorder.ipAddress,
        port: recorder.port,
        protocol: recorder.protocol === 'https' ? 'https' : 'http',
        credentials: { username: '', password: '' }
      });
    }
  }
  
  /**
   * Get recorder credentials from secure storage
   */
  private async getRecorderCredentials(
    recorder: Recorder
  ): Promise<{ username: string; password: string }> {
    try {
      // If credentials stored directly (legacy)
      if (recorder.username && recorder.passwordEncrypted) {
        const password = await this.decryptPassword(recorder.passwordEncrypted);
        return {
          username: recorder.username,
          password
        };
      }
      
      // If credential reference exists
      if (recorder.credentialId) {
        const result = await this.pool.query(
          `SELECT username, password_encrypted
           FROM device_credentials
           WHERE id = $1::uuid`,
          [recorder.credentialId]
        );
        
        if (result.rows.length > 0) {
          const password = await this.decryptPassword(
            result.rows[0].password_encrypted
          );
          return {
            username: result.rows[0].username,
            password
          };
        }
      }
      
      logger.warn('No credentials found for recorder', {
        recorderId: recorder.id
      });
      
      return { username: '', password: '' };
      
    } catch (error) {
      logger.error('Failed to get recorder credentials', {
        error,
        recorderId: recorder.id
      });
      return { username: '', password: '' };
    }
  }
  
  /**
   * Decrypt password
   * 
   * TODO: Implement actual decryption based on your encryption scheme
   */
  private async decryptPassword(encryptedPassword: string): Promise<string> {
    // This is a placeholder - implement actual decryption
    // based on your encryption scheme (AES, etc.)
    
    // For now, assume base64 encoded (NOT SECURE - REPLACE THIS)
    try {
      return Buffer.from(encryptedPassword, 'base64').toString('utf-8');
    } catch {
      return encryptedPassword; // Return as-is if decryption fails
    }
  }
}
