/**
 * @deprecated Import from src/security/saml-provider instead.
 * The control plane owns SAML authentication; do not restore the retired
 * passport-saml implementation or its vulnerable dependency tree here.
 */
export { SamlProvider, samlProvider } from '../../../src/security/saml-provider.js';
export type { SamlConfig, SamlUser } from '../../../src/security/saml-provider.js';
