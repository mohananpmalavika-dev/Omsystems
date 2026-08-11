/**
 * ACME Challenge Provider Interface
 * Abstracts different challenge types (HTTP-01, DNS-01, TLS-ALPN-01)
 */

export interface AcmeChallengeRequest {
  type: 'http-01' | 'dns-01' | 'tls-alpn-01';
  identifier: string; // Domain name
  token: string;
  keyAuthorization: string;
}

/**
 * ACME Challenge Provider Interface
 * 
 * Challenge providers handle the presentation and cleanup of ACME challenges.
 * Different implementations support different challenge mechanisms.
 */
export interface AcmeChallengeProvider {
  /**
   * Present a challenge for validation
   * 
   * For HTTP-01: Create /.well-known/acme-challenge/{token} file
   * For DNS-01: Create _acme-challenge.{domain} TXT record
   * For TLS-ALPN-01: Configure TLS server with special certificate
   */
  presentChallenge(request: AcmeChallengeRequest): Promise<void>;

  /**
   * Clean up a challenge after validation
   * 
   * Remove files, DNS records, or TLS configuration
   */
  cleanupChallenge(request: AcmeChallengeRequest): Promise<void>;

  /**
   * Verify challenge can be presented (pre-flight check)
   */
  canPresent(type: string, identifier: string): Promise<boolean>;
}

/**
 * HTTP-01 Challenge Provider
 * Serves challenges via HTTP on port 80
 */
export class Http01ChallengeProvider implements AcmeChallengeProvider {
  private challenges: Map<string, string> = new Map();
  private webRoot: string;

  constructor(config: { webRoot: string }) {
    this.webRoot = config.webRoot;
  }

  async presentChallenge(request: AcmeChallengeRequest): Promise<void> {
    if (request.type !== 'http-01') {
      throw new Error('This provider only supports HTTP-01 challenges');
    }

    const fs = require('fs/promises');
    const path = require('path');

    const challengePath = path.join(
      this.webRoot,
      '.well-known',
      'acme-challenge',
      request.token
    );

    // Ensure directory exists
    await fs.mkdir(path.dirname(challengePath), { recursive: true });

    // Write challenge file
    await fs.writeFile(challengePath, request.keyAuthorization, 'utf8');

    // Cache for cleanup
    this.challenges.set(request.token, challengePath);
  }

  async cleanupChallenge(request: AcmeChallengeRequest): Promise<void> {
    const fs = require('fs/promises');
    const challengePath = this.challenges.get(request.token);

    if (challengePath) {
      try {
        await fs.unlink(challengePath);
      } catch (error) {
        // Ignore if file doesn't exist
      }
      this.challenges.delete(request.token);
    }
  }

  async canPresent(type: string, identifier: string): Promise<boolean> {
    return type === 'http-01';
  }
}

/**
 * DNS-01 Challenge Provider (Abstract Base)
 * Subclasses implement DNS provider-specific logic
 */
export abstract class Dns01ChallengeProvider
  implements AcmeChallengeProvider
{
  protected challenges: Map<string, string> = new Map();

  async presentChallenge(request: AcmeChallengeRequest): Promise<void> {
    if (request.type !== 'dns-01') {
      throw new Error('This provider only supports DNS-01 challenges');
    }

    const crypto = require('crypto');
    const challengeValue = crypto
      .createHash('sha256')
      .update(request.keyAuthorization)
      .digest('base64url');

    const recordName = `_acme-challenge.${request.identifier}`;

    await this.createTxtRecord(recordName, challengeValue);

    this.challenges.set(request.token, recordName);

    // Wait for DNS propagation
    await this.waitForPropagation(recordName, challengeValue);
  }

  async cleanupChallenge(request: AcmeChallengeRequest): Promise<void> {
    const recordName = this.challenges.get(request.token);

    if (recordName) {
      try {
        await this.deleteTxtRecord(recordName);
      } catch (error) {
        // Ignore cleanup errors
      }
      this.challenges.delete(request.token);
    }
  }

  async canPresent(type: string, identifier: string): Promise<boolean> {
    return type === 'dns-01';
  }

  /**
   * Create a TXT record for the challenge
   * Must be implemented by DNS provider-specific subclass
   */
  protected abstract createTxtRecord(
    name: string,
    value: string
  ): Promise<void>;

  /**
   * Delete a TXT record
   * Must be implemented by DNS provider-specific subclass
   */
  protected abstract deleteTxtRecord(name: string): Promise<void>;

  /**
   * Wait for DNS propagation
   */
  protected async waitForPropagation(
    recordName: string,
    expectedValue: string,
    maxAttempts: number = 30
  ): Promise<void> {
    const dns = require('dns').promises;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const records = await dns.resolveTxt(recordName);
        const flatRecords = records.flat();

        if (flatRecords.includes(expectedValue)) {
          return;
        }
      } catch (error) {
        // Record doesn't exist yet
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(`DNS propagation timeout for ${recordName}`);
  }
}

/**
 * Route53 DNS-01 Challenge Provider
 */
export class Route53Dns01ChallengeProvider extends Dns01ChallengeProvider {
  private route53Client: any;
  private hostedZoneId: string;

  constructor(config: { hostedZoneId: string; awsConfig?: any }) {
    super();
    this.hostedZoneId = config.hostedZoneId;

    // Would initialize AWS SDK Route53 client here
    // For now, this is a placeholder
  }

  protected async createTxtRecord(name: string, value: string): Promise<void> {
    // AWS Route53 implementation
    const params = {
      HostedZoneId: this.hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: name,
              Type: 'TXT',
              TTL: 60,
              ResourceRecords: [{ Value: `"${value}"` }]
            }
          }
        ]
      }
    };

    // await this.route53Client.changeResourceRecordSets(params).promise();
    console.log(`Would create Route53 TXT record: ${name} = ${value}`);
  }

  protected async deleteTxtRecord(name: string): Promise<void> {
    // AWS Route53 deletion
    console.log(`Would delete Route53 TXT record: ${name}`);
  }
}

/**
 * Cloudflare DNS-01 Challenge Provider
 */
export class CloudflareDns01ChallengeProvider extends Dns01ChallengeProvider {
  private apiToken: string;
  private zoneId: string;
  private recordIds: Map<string, string> = new Map();

  constructor(config: { apiToken: string; zoneId: string }) {
    super();
    this.apiToken = config.apiToken;
    this.zoneId = config.zoneId;
  }

  protected async createTxtRecord(name: string, value: string): Promise<void> {
    const axios = require('axios');

    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records`,
      {
        type: 'TXT',
        name: name,
        content: value,
        ttl: 60
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    this.recordIds.set(name, response.data.result.id);
  }

  protected async deleteTxtRecord(name: string): Promise<void> {
    const recordId = this.recordIds.get(name);
    if (!recordId) return;

    const axios = require('axios');

    await axios.delete(
      `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records/${recordId}`,
      {
        headers: {
          Authorization: `Bearer ${this.apiToken}`
        }
      }
    );

    this.recordIds.delete(name);
  }
}

/**
 * Internal DNS Challenge Provider
 * For internal DNS servers that support dynamic updates
 */
export class InternalDns01ChallengeProvider extends Dns01ChallengeProvider {
  private dnsServer: string;
  private tsigKey?: { name: string; algorithm: string; secret: string };

  constructor(config: {
    dnsServer: string;
    tsigKey?: { name: string; algorithm: string; secret: string };
  }) {
    super();
    this.dnsServer = config.dnsServer;
    this.tsigKey = config.tsigKey;
  }

  protected async createTxtRecord(name: string, value: string): Promise<void> {
    // Would use DNS UPDATE mechanism (RFC 2136)
    // Could use libraries like 'dns-update' or 'native-dns'
    console.log(
      `Would create internal DNS TXT record on ${this.dnsServer}: ${name} = ${value}`
    );
  }

  protected async deleteTxtRecord(name: string): Promise<void> {
    console.log(`Would delete internal DNS TXT record: ${name}`);
  }
}

/**
 * Manual Challenge Provider
 * For manual verification (air-gapped or development environments)
 */
export class ManualChallengeProvider implements AcmeChallengeProvider {
  async presentChallenge(request: AcmeChallengeRequest): Promise<void> {
    console.log('\n' + '='.repeat(80));
    console.log('MANUAL ACME CHALLENGE REQUIRED');
    console.log('='.repeat(80));
    console.log(`Challenge Type: ${request.type}`);
    console.log(`Identifier: ${request.identifier}`);
    console.log(`Token: ${request.token}`);

    if (request.type === 'http-01') {
      console.log('\nCreate the following file:');
      console.log(
        `  Path: /.well-known/acme-challenge/${request.token}`
      );
      console.log(`  Content: ${request.keyAuthorization}`);
    } else if (request.type === 'dns-01') {
      const crypto = require('crypto');
      const challengeValue = crypto
        .createHash('sha256')
        .update(request.keyAuthorization)
        .digest('base64url');

      console.log('\nCreate the following DNS record:');
      console.log(`  Name: _acme-challenge.${request.identifier}`);
      console.log(`  Type: TXT`);
      console.log(`  Value: ${challengeValue}`);
    }

    console.log('\nPress Enter once the challenge is in place...');
    console.log('='.repeat(80) + '\n');

    // In a real implementation, would wait for user input
    // For automated contexts, this would need a different mechanism
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  async cleanupChallenge(request: AcmeChallengeRequest): Promise<void> {
    console.log(
      `\nManual cleanup: Remove ${request.type} challenge for ${request.identifier}`
    );
  }

  async canPresent(type: string, identifier: string): Promise<boolean> {
    return true; // Manual provider can handle any challenge type
  }
}
