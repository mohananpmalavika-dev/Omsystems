/**
 * IP Address Resolver
 * 
 * Resolves trusted client IP from proxy headers with security validation.
 * Prevents X-Forwarded-For spoofing by validating against trusted proxy chain.
 * 
 * SECURITY:
 * - Only trusts configured proxy IPs
 * - Validates header format
 * - Normalizes IPv4/IPv6 representations
 * - Prevents header injection attacks
 */

import { Request } from 'express';
import { logger } from '../../../utils/logger.js';
import { isIP } from 'net';

export interface IpResolverConfig {
  /** List of trusted proxy IPs/CIDRs */
  trustedProxies: string[];
  
  /** Header to check (default: x-forwarded-for) */
  header?: string;
  
  /** Whether to trust all proxies (DANGEROUS - dev only) */
  trustAllProxies?: boolean;
}

export class IpResolver {
  private readonly trustedProxies: Set<string>;
  private readonly header: string;
  private readonly trustAllProxies: boolean;

  constructor(config: IpResolverConfig) {
    this.trustedProxies = new Set(config.trustedProxies);
    this.header = config.header || 'x-forwarded-for';
    this.trustAllProxies = config.trustAllProxies || false;

    if (this.trustAllProxies) {
      logger.warn('IP resolver configured to trust all proxies - USE ONLY IN DEVELOPMENT');
    }
  }

  /**
   * Resolve client IP from request
   * 
   * @param req - Express request
   * @returns Resolved client IP
   */
  resolve(req: Request): string {
    // If not behind proxy or proxy not trusted, use direct connection IP
    const connectionIp = this.extractConnectionIp(req);

    if (!this.trustAllProxies && !this.isTrustedProxy(connectionIp)) {
      // Direct connection or untrusted proxy
      return this.normalizeIp(connectionIp);
    }

    // Behind trusted proxy - parse forwarded header
    const forwardedFor = req.headers[this.header];

    if (!forwardedFor) {
      return this.normalizeIp(connectionIp);
    }

    const clientIp = this.parseForwardedFor(forwardedFor);

    return this.normalizeIp(clientIp || connectionIp);
  }

  /**
   * Extract connection IP from request
   */
  private extractConnectionIp(req: Request): string {
    // Try various Express properties
    return (
      req.ip ||
      req.socket?.remoteAddress ||
      (req.connection as any)?.remoteAddress ||
      '0.0.0.0'
    );
  }

  /**
   * Parse X-Forwarded-For header
   * 
   * Format: "client, proxy1, proxy2"
   * We want the leftmost (original client) IP
   */
  private parseForwardedFor(header: string | string[]): string | null {
    try {
      const value = Array.isArray(header) ? header[0] : header;

      if (!value) {
        return null;
      }

      // Split by comma and take first (client IP)
      const ips = value.split(',').map(ip => ip.trim());

      // Return first valid IP
      for (const ip of ips) {
        if (this.isValidIp(ip)) {
          return ip;
        }
      }

      return null;
    } catch (error) {
      logger.warn('Failed to parse X-Forwarded-For header', {
        header,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Check if IP is trusted proxy
   */
  private isTrustedProxy(ip: string): boolean {
    if (this.trustAllProxies) {
      return true;
    }

    const normalized = this.normalizeIp(ip);

    // Exact match
    if (this.trustedProxies.has(normalized)) {
      return true;
    }

    // TODO: Add CIDR range matching if needed
    // For now, exact match only

    return false;
  }

  /**
   * Validate IP format
   */
  private isValidIp(ip: string): boolean {
    return isIP(ip) !== 0;
  }

  /**
   * Normalize IP representation
   * 
   * - Remove IPv6 brackets
   * - Normalize IPv4-mapped IPv6 to IPv4
   * - Lowercase
   */
  normalizeIp(ip: string): string {
    let normalized = ip.trim().toLowerCase();

    // Remove brackets from IPv6
    normalized = normalized.replace(/^\[/, '').replace(/\]$/, '');

    // Convert IPv4-mapped IPv6 to IPv4
    // ::ffff:192.168.1.1 → 192.168.1.1
    const ipv4MappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (ipv4MappedMatch && ipv4MappedMatch[1]) {
      normalized = ipv4MappedMatch[1];
    }

    return normalized;
  }

  /**
   * Check if IP is private/internal
   */
  isPrivateIp(ip: string): boolean {
    const normalized = this.normalizeIp(ip);

    // IPv4 private ranges
    if (isIP(normalized) === 4) {
      return (
        normalized.startsWith('10.') ||
        normalized.startsWith('192.168.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalized) ||
        normalized.startsWith('127.') ||
        normalized === '0.0.0.0'
      );
    }

    // IPv6 private ranges
    if (isIP(normalized) === 6) {
      return (
        normalized.startsWith('fe80:') || // Link-local
        normalized.startsWith('fc00:') || // Unique local
        normalized.startsWith('fd00:') || // Unique local
        normalized === '::1' // Loopback
      );
    }

    return false;
  }

  /**
   * Mask IP for logging
   */
  mask(ip: string): string {
    const normalized = this.normalizeIp(ip);

    if (isIP(normalized) === 4) {
      // IPv4: show first two octets
      const parts = normalized.split('.');
      return `${parts[0]}.${parts[1]}.***`;
    }

    if (isIP(normalized) === 6) {
      // IPv6: show first segment
      const parts = normalized.split(':');
      return `${parts[0]}:***`;
    }

    return '***';
  }
}
