/**
 * Video Security Collectors
 * 
 * Collectors for video stream encryption and security evidence.
 */

export {
  VideoTransportEncryptionCollector,
  VideoTransportEncryptionEvidence,
} from './video-transport-encryption.collector';

/**
 * Register all video security collectors
 */
import { getCollectorRegistry } from '../collector-registry';
import { VideoTransportEncryptionCollector } from './video-transport-encryption.collector';

export function registerVideoCollectors(): void {
  const registry = getCollectorRegistry();
  
  // Video Transport Encryption
  registry.register(new VideoTransportEncryptionCollector(), {
    categories: ['video-security', 'encryption'],
    priority: 85,
  });
  
  console.log('[VideoCollectors] Registered 1 video security collector');
}
