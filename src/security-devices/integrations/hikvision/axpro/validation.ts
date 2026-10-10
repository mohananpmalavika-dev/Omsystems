import { isIP } from 'node:net';
import { AxProError } from './errors.js';
import type { AxProConnectionConfig } from './types.js';

export function validateAxProConnection(config: AxProConnectionConfig): void {
  const invalid = (message: string): never => { throw new AxProError('AXPRO_CONFIG_INVALID', message, 400); };
  if (typeof config.host !== 'string' || !config.host || config.host !== config.host.trim()) invalid('host must be an IP address or hostname');
  const host = config.host.replace(/^\[|\]$/g, '');
  if (!isIP(host) && !/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host)) invalid('host must be an IP address or hostname');
  if (!['HTTP', 'HTTPS'].includes(config.protocol)) invalid('protocol must be HTTP or HTTPS');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) invalid('port must be between 1 and 65535');
  if (config.protocol === 'HTTP' && process.env.NODE_ENV === 'production' && config.allowInsecureHttp !== true) invalid('HTTP is disabled in production unless allowInsecureHttp is explicitly enabled');
  if (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 100 || config.timeoutMs > 60_000)) invalid('timeoutMs must be between 100 and 60000');
  if (!Number.isInteger(config.pollingIntervalSeconds) || config.pollingIntervalSeconds < 10 || config.pollingIntervalSeconds > 86400) invalid('pollingIntervalSeconds must be between 10 and 86400');
  if (config.authMethod !== undefined && !['auto', 'basic', 'digest'].includes(config.authMethod)) invalid('authMethod must be auto, basic, or digest');
  if (typeof config.credentialSecretId !== 'string' || !/^secret:\/\/[^\s?#]+(?:#[^\s/#?]+|\/[^\s/#?]+)$/.test(config.credentialSecretId) || config.credentialSecretId.includes('..')) invalid('credentialSecretId must be a secret:// reference');
  if (config.endpointPaths !== undefined) {
    if (!config.endpointPaths || typeof config.endpointPaths !== 'object' || Array.isArray(config.endpointPaths)) invalid('endpointPaths must be an object');
    for (const [key, value] of Object.entries(config.endpointPaths)) {
      if (!['systemInfo', 'capabilities', 'devices', 'deviceStatus', 'events'].includes(key)) invalid('endpointPaths contains an unsupported key');
      if (typeof value !== 'string' || !/^\/(?!\/)/.test(value) || /[\\\s#]/.test(value)) invalid('endpoint paths must be relative paths beginning with /');
    }
  }
}
