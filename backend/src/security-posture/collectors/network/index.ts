/**
 * Network Security Collectors
 * 
 * Collectors for TLS, certificates, and network security evidence.
 */

export { TlsProtocolCollector, TlsProtocolEvidence } from './tls-protocol.collector';
export { CipherStrengthCollector, CipherStrengthEvidence } from './cipher-strength.collector';
export { CertificateChainCollector, CertificateChainEvidence } from './certificate-chain.collector';
export { OcspCollector, OcspStaplingCollector, OcspEvidence } from './ocsp.collector';
export { CtVerificationCollector, CtVerificationEvidence } from './ct-verification.collector';

/**
 * Register all network security collectors
 */
import { getCollectorRegistry } from '../collector-registry';
import { TlsProtocolCollector } from './tls-protocol.collector';
import { CipherStrengthCollector } from './cipher-strength.collector';
import { CertificateChainCollector } from './certificate-chain.collector';
import { OcspCollector, OcspStaplingCollector } from './ocsp.collector';
import { CtVerificationCollector } from './ct-verification.collector';

export function registerNetworkCollectors(): void {
  const registry = getCollectorRegistry();
  
  // TLS Protocol
  registry.register(new TlsProtocolCollector(), {
    categories: ['network-security', 'tls'],
    priority: 90,
  });
  
  // Cipher Strength
  registry.register(new CipherStrengthCollector(), {
    categories: ['network-security', 'tls'],
    priority: 90,
  });
  
  // Certificate Chain
  registry.register(new CertificateChainCollector(), {
    categories: ['network-security', 'certificates'],
    priority: 100,
  });
  
  // OCSP
  registry.register(new OcspCollector(), {
    categories: ['network-security', 'certificates', 'revocation'],
    priority: 80,
  });
  
  // OCSP Stapling
  registry.register(new OcspStaplingCollector(), {
    categories: ['network-security', 'certificates', 'revocation'],
    priority: 85,
  });
  
  // CT Verification
  registry.register(new CtVerificationCollector(), {
    categories: ['network-security', 'certificates', 'transparency'],
    priority: 70,
  });
  
  console.log('[NetworkCollectors] Registered 6 network security collectors');
}
