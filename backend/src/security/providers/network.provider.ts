/**
 * Network Trust Provider
 * IP reputation, geolocation, VPN/Proxy detection, and impossible travel detection
 */

import {
  INetworkProvider,
  ProviderContext,
  NetworkVerificationResult,
  IPReputation,
  LocationTrust,
  NetworkThreat,
  SecurityVerdict,
  ThreatLevel
} from './types';

interface IPRecord {
  ipAddress: string;
  reputation: IPReputation;
  lastCheckedAt: Date;
  accessCount: number;
  firstSeenAt: Date;
  blocked: boolean;
  blockReason?: string;
}

interface LocationRecord {
  userId: string;
  location: {
    country: string;
    countryCode: string;
    city?: string;
    latitude: number;
    longitude: number;
  };
  ipAddress: string;
  timestamp: Date;
}

interface KnownLocation {
  userId: string;
  country: string;
  countryCode: string;
  city?: string;
  latitude: number;
  longitude: number;
  addedAt: Date;
  lastSeenAt: Date;
  frequency: number;
}

export class NetworkProvider implements INetworkProvider {
  readonly name = 'NetworkProvider';
  readonly version = '1.0.0';

  private ipRecords: Map<string, IPRecord> = new Map();
  private locationHistory: Map<string, LocationRecord[]> = new Map();
  private knownLocations: Map<string, KnownLocation[]> = new Map();
  private threatList: Set<string> = new Set(); // Known malicious IPs
  private vpnRanges: Set<string> = new Set(); // Known VPN IP ranges
  private datacenterRanges: Set<string> = new Set(); // Known datacenter ranges

  private readonly IP_REPUTATION_CACHE_MS = 60 * 60 * 1000; // 1 hour
  private readonly MAX_LOCATION_HISTORY = 100;
  private readonly IMPOSSIBLE_TRAVEL_SPEED_KMH = 800; // Speed of commercial aircraft

  constructor() {}

  /**
   * Verify network trust
   */
  async verify(context: ProviderContext): Promise<NetworkVerificationResult> {
    const startTime = Date.now();
    let score = 0;
    const evidence: Record<string, any> = {};
    const reasons: string[] = [];
    const threats: NetworkThreat[] = [];

    // 1. Get or check IP reputation
    const ipReputation = await this.checkIPReputation(context.ipAddress);
    evidence.ipReputation = ipReputation;

    // Add score based on reputation
    const reputationScore = 100 - ipReputation.score;
    score += reputationScore;
    
    if (reputationScore > 50) {
      reasons.push(`Low IP reputation score: ${ipReputation.score}/100`);
    }

    // 2. Check if IP is known threat
    if (ipReputation.isKnownThreat) {
      score += 80;
      reasons.push('IP address is on threat list');
      threats.push({
        type: 'malicious_ip',
        severity: ThreatLevel.CRITICAL,
        description: 'IP address flagged as malicious',
        detectedAt: new Date(),
        source: ipReputation.source
      });
    }

    // 3. Check for botnet activity
    if (ipReputation.isBotnet) {
      score += 70;
      reasons.push('IP associated with botnet activity');
      threats.push({
        type: 'ddos',
        severity: ThreatLevel.HIGH,
        description: 'IP address associated with botnet',
        detectedAt: new Date(),
        source: ipReputation.source
      });
    }

    // 4. Detect VPN usage
    const vpnDetected = await this.detectVPN(context.ipAddress);
    evidence.vpnDetected = vpnDetected;

    if (vpnDetected) {
      score += 15;
      reasons.push('VPN detected');
    }

    // 5. Detect proxy usage
    const proxyDetected = this.detectProxy(context.ipAddress, context.metadata);
    evidence.proxyDetected = proxyDetected;

    if (proxyDetected) {
      score += 20;
      reasons.push('Proxy detected');
    }

    // 6. Detect Tor usage
    const torDetected = this.detectTor(context.ipAddress);
    evidence.torDetected = torDetected;

    if (torDetected) {
      score += 40;
      reasons.push('Tor exit node detected');
      threats.push({
        type: 'unknown',
        severity: ThreatLevel.HIGH,
        description: 'Access via Tor anonymization network',
        detectedAt: new Date(),
        source: 'tor-detection'
      });
    }

    // 7. Get geolocation only from an integrated provider.
    const location = this.getGeolocation(context.ipAddress);
    const locationTrust = location
      ? await this.checkLocationTrust(context.userId, location, context.ipAddress)
      : {
          country: 'Unknown',
          countryCode: 'ZZ',
          isKnownLocation: false,
          impossibleTravel: false,
        };
    evidence.locationTrust = locationTrust;
    evidence.geolocationAvailable = Boolean(location);

    if (location && !locationTrust.isKnownLocation) {
      score += 25;
      reasons.push(`Access from new location: ${location.city ?? 'unknown city'}, ${location.country}`);
    }

    // 9. Detect impossible travel
    if (locationTrust.impossibleTravel) {
      score += 50;
      reasons.push(
        `Impossible travel detected: ${locationTrust.distance}km in ${Math.round(locationTrust.timeElapsed! / 60)} minutes`
      );
      threats.push({
        type: 'unknown',
        severity: ThreatLevel.HIGH,
        description: `Impossible travel: ${locationTrust.distance}km at ${locationTrust.maxPossibleSpeed}km/h`,
        detectedAt: new Date(),
        source: 'impossible-travel-detection'
      });
    }

    // 10. Check for rapid requests from same IP
    const rapidRequests = this.detectRapidRequests(context.ipAddress);
    evidence.rapidRequests = rapidRequests;

    if (rapidRequests) {
      score += 30;
      reasons.push('Rapid requests detected - possible bot activity');
      threats.push({
        type: 'brute_force',
        severity: ThreatLevel.MEDIUM,
        description: 'High request rate from IP address',
        detectedAt: new Date(),
        source: 'rate-limiting'
      });
    }

    // 11. Check datacenter hosting
    const isDatacenter = this.isDatacenterIP(context.ipAddress);
    evidence.isDatacenter = isDatacenter;

    if (isDatacenter) {
      score += 10;
      reasons.push('Access from datacenter IP');
    }

    // 12. Log real location evidence only.
    if (location) {
      await this.logLocation(context.userId, location, context.ipAddress);
    }

    // Determine verdict
    let verdict: SecurityVerdict;
    let confidence = 0.85;
    const requiredActions: string[] = [];

    if (score >= 100) {
      verdict = SecurityVerdict.DENY;
      confidence = 0.95;
      requiredActions.push('BLOCK_IP', 'SECURITY_REVIEW');
    } else if (score >= 70) {
      verdict = SecurityVerdict.DENY;
      confidence = 0.9;
      requiredActions.push('VERIFY_IDENTITY', 'ADDITIONAL_MFA');
    } else if (score >= 50) {
      verdict = SecurityVerdict.CHALLENGE;
      confidence = 0.85;
      requiredActions.push('VERIFY_LOCATION', 'MFA_REQUIRED');
    } else if (score >= 30) {
      verdict = SecurityVerdict.REVIEW;
      confidence = 0.8;
      requiredActions.push('MONITOR_ACCESS');
    } else {
      verdict = SecurityVerdict.ALLOW;
      confidence = 0.9;
    }

    evidence.processingTimeMs = Date.now() - startTime;

    return {
      verdict,
      score: Math.min(score, 100),
      confidence,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Network verification passed',
      evidence,
      ipReputation,
      locationTrust,
      vpnDetected,
      proxyDetected,
      torDetected,
      threats,
      requiredActions: requiredActions.length > 0 ? requiredActions : undefined
    };
  }

  /**
   * Check IP reputation
   */
  async checkIPReputation(ipAddress: string): Promise<IPReputation> {
    // Check cache first
    const cached = this.ipRecords.get(ipAddress);
    
    if (cached && Date.now() - cached.lastCheckedAt.getTime() < this.IP_REPUTATION_CACHE_MS) {
      cached.accessCount++;
      return cached.reputation;
    }

    // Calculate reputation score
    let score = 100; // Start with perfect score
    const categories: string[] = [];

    // Check threat list
    const isKnownThreat = this.threatList.has(ipAddress);
    if (isKnownThreat) {
      score -= 90;
      categories.push('malicious');
    }

    // Check VPN
    const isVPN = this.vpnRanges.has(this.getIPPrefix(ipAddress));
    if (isVPN) {
      score -= 15;
      categories.push('vpn');
    }

    // Check datacenter
    const isDatacenter = this.isDatacenterIP(ipAddress);
    if (isDatacenter) {
      score -= 10;
      categories.push('datacenter');
    }

    // Check if residential
    if (!isVPN && !isDatacenter && !isKnownThreat) {
      categories.push('residential');
    }

    // Check for botnet
    const isBotnet = this.checkBotnet(ipAddress);

    const reputation: IPReputation = {
      ipAddress,
      score: Math.max(0, score),
      categories,
      isKnownThreat,
      isBotnet,
      lastSeen: new Date(),
      source: 'internal'
    };

    // Update cache
    const record: IPRecord = cached || {
      ipAddress,
      reputation,
      lastCheckedAt: new Date(),
      accessCount: 1,
      firstSeenAt: new Date(),
      blocked: false
    };

    record.reputation = reputation;
    record.lastCheckedAt = new Date();
    this.ipRecords.set(ipAddress, record);

    return reputation;
  }

  /**
   * Detect impossible travel
   */
  async detectImpossibleTravel(
    userId: string,
    currentLocation: { lat: number; lon: number }
  ): Promise<boolean> {
    const history = this.locationHistory.get(userId) || [];
    
    if (history.length === 0) {
      return false;
    }

    // Get most recent location
    const lastLocation = history[history.length - 1];
    
    // Calculate distance
    const distance = this.calculateDistance(
      lastLocation.location.latitude,
      lastLocation.location.longitude,
      currentLocation.lat,
      currentLocation.lon
    );

    // Calculate time elapsed
    const timeElapsedMs = Date.now() - lastLocation.timestamp.getTime();
    const timeElapsedHours = timeElapsedMs / (1000 * 60 * 60);

    // Calculate required speed
    const requiredSpeed = distance / timeElapsedHours;

    // Check if travel is impossible
    return requiredSpeed > this.IMPOSSIBLE_TRAVEL_SPEED_KMH;
  }

  /**
   * Detect VPN
   */
  async detectVPN(ipAddress: string): Promise<boolean> {
    const prefix = this.getIPPrefix(ipAddress);
    return this.vpnRanges.has(prefix);
  }

  /**
   * Check location trust
   */
  private async checkLocationTrust(
    userId: string,
    location: LocationRecord['location'],
    ipAddress: string
  ): Promise<LocationTrust> {
    const knownLocs = this.knownLocations.get(userId) || [];
    
    // Check if location is known
    const isKnownLocation = knownLocs.some(kl => 
      kl.countryCode === location.countryCode &&
      (kl.city === location.city || !location.city)
    );

    // Check for impossible travel
    const history = this.locationHistory.get(userId) || [];
    let impossibleTravel = false;
    let distance: number | undefined;
    let timeElapsed: number | undefined;
    let maxPossibleSpeed: number | undefined;

    if (history.length > 0) {
      const lastLocation = history[history.length - 1];
      
      distance = this.calculateDistance(
        lastLocation.location.latitude,
        lastLocation.location.longitude,
        location.latitude,
        location.longitude
      );

      timeElapsed = (Date.now() - lastLocation.timestamp.getTime()) / 1000; // seconds
      const timeElapsedHours = timeElapsed / 3600;
      maxPossibleSpeed = timeElapsedHours > 0 ? distance / timeElapsedHours : 0;

      impossibleTravel = maxPossibleSpeed > this.IMPOSSIBLE_TRAVEL_SPEED_KMH;
    }

    // Update or add known location
    if (isKnownLocation) {
      const knownLoc = knownLocs.find(kl => 
        kl.countryCode === location.countryCode &&
        (kl.city === location.city || !location.city)
      );
      if (knownLoc) {
        knownLoc.lastSeenAt = new Date();
        knownLoc.frequency++;
      }
    }

    return {
      country: location.country,
      countryCode: location.countryCode,
      region: undefined,
      city: location.city,
      latitude: location.latitude,
      longitude: location.longitude,
      isKnownLocation,
      impossibleTravel,
      distance,
      timeElapsed,
      maxPossibleSpeed
    };
  }

  /**
   * Add known location for user
   */
  async addKnownLocation(
    userId: string,
    country: string,
    countryCode: string,
    city?: string,
    latitude?: number,
    longitude?: number
  ): Promise<void> {
    const knownLocs = this.knownLocations.get(userId) || [];
    
    const existing = knownLocs.find(kl => 
      kl.countryCode === countryCode && kl.city === city
    );

    if (!existing) {
      knownLocs.push({
        userId,
        country,
        countryCode,
        city,
        latitude: latitude || 0,
        longitude: longitude || 0,
        addedAt: new Date(),
        lastSeenAt: new Date(),
        frequency: 1
      });
      
      this.knownLocations.set(userId, knownLocs);
      console.log(`✓ Known location added for user ${userId}: ${city}, ${country}`);
    }
  }

  /**
   * Block an IP address
   */
  async blockIP(ipAddress: string, reason: string): Promise<void> {
    const record = this.ipRecords.get(ipAddress);
    
    if (record) {
      record.blocked = true;
      record.blockReason = reason;
    } else {
      const reputation: IPReputation = {
        ipAddress,
        score: 0,
        categories: ['blocked'],
        isKnownThreat: true,
        isBotnet: false,
        lastSeen: new Date(),
        source: 'manual-block'
      };

      this.ipRecords.set(ipAddress, {
        ipAddress,
        reputation,
        lastCheckedAt: new Date(),
        accessCount: 0,
        firstSeenAt: new Date(),
        blocked: true,
        blockReason: reason
      });
    }

    this.threatList.add(ipAddress);
    console.log(`🚫 IP blocked: ${ipAddress} - ${reason}`);
  }

  /**
   * Unblock an IP address
   */
  async unblockIP(ipAddress: string): Promise<boolean> {
    const record = this.ipRecords.get(ipAddress);
    
    if (!record) {
      return false;
    }

    record.blocked = false;
    record.blockReason = undefined;
    this.threatList.delete(ipAddress);

    console.log(`✓ IP unblocked: ${ipAddress}`);
    return true;
  }

  /**
   * Add IP to threat list
   */
  async addThreat(ipAddress: string): Promise<void> {
    this.threatList.add(ipAddress);
    await this.blockIP(ipAddress, 'Added to threat list');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    // Clean up old IP records
    await this.cleanupOldRecords();
    
    return true;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private getGeolocation(_ipAddress: string): LocationRecord['location'] | null {
    // Do not fabricate coordinates until a verified GeoIP source is integrated.
    return null;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Haversine formula for calculating distance between two points on Earth
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private detectProxy(ipAddress: string, metadata?: Record<string, any>): boolean {
    // Check for proxy indicators in headers
    const proxyHeaders = [
      'x-forwarded-for',
      'x-real-ip',
      'via',
      'x-proxy-id'
    ];

    if (metadata) {
      for (const header of proxyHeaders) {
        if (metadata[header]) {
          return true;
        }
      }
    }

    return false;
  }

  private detectTor(ipAddress: string): boolean {
    // Prefix heuristics are not a valid Tor signal. This is false until a
    // synchronized exit-node feed is explicitly integrated.
    void ipAddress;
    return false;
  }

  private isDatacenterIP(ipAddress: string): boolean {
    const prefix = this.getIPPrefix(ipAddress);
    return this.datacenterRanges.has(prefix);
  }

  private checkBotnet(ipAddress: string): boolean {
    // In production, check against botnet IP lists
    // For now, simple check
    const record = this.ipRecords.get(ipAddress);
    
    if (!record) {
      return false;
    }

    // High access count in short time might indicate botnet
    const timeSinceFirstSeen = Date.now() - record.firstSeenAt.getTime();
    const hoursActive = timeSinceFirstSeen / (1000 * 60 * 60);
    const requestsPerHour = record.accessCount / Math.max(hoursActive, 0.1);

    return requestsPerHour > 100;
  }

  private detectRapidRequests(ipAddress: string): boolean {
    const record = this.ipRecords.get(ipAddress);
    
    if (!record) {
      return false;
    }

    const timeSinceLastCheck = Date.now() - record.lastCheckedAt.getTime();
    const minutesSinceLastCheck = timeSinceLastCheck / (1000 * 60);

    // More than 10 requests per minute
    return minutesSinceLastCheck < 1 && record.accessCount > 10;
  }

  private getIPPrefix(ipAddress: string): string {
    // Get /24 network prefix
    const parts = ipAddress.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
  }

  private async logLocation(
    userId: string,
    location: LocationRecord['location'],
    ipAddress: string
  ): Promise<void> {
    const history = this.locationHistory.get(userId) || [];
    
    history.push({
      userId,
      location,
      ipAddress,
      timestamp: new Date()
    });

    // Keep only recent history
    if (history.length > this.MAX_LOCATION_HISTORY) {
      history.splice(0, history.length - this.MAX_LOCATION_HISTORY);
    }

    this.locationHistory.set(userId, history);
  }

  private initializeThreatIntelligence(): void {
    // Production starts without embedded threat intelligence data.
    const knownThreats: string[] = [];

    knownThreats.forEach(ip => this.threatList.add(ip));

    const vpnRanges: string[] = [];

    vpnRanges.forEach(range => this.vpnRanges.add(range));

    const datacenterRanges: string[] = [];

    datacenterRanges.forEach(range => this.datacenterRanges.add(range));

    console.log('✓ Threat intelligence initialized');
  }

  private async cleanupOldRecords(): Promise<void> {
    const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days
    const toDelete: string[] = [];

    for (const [ip, record] of this.ipRecords.entries()) {
      if (!record.blocked && record.lastCheckedAt.getTime() < cutoff) {
        toDelete.push(ip);
      }
    }

    toDelete.forEach(ip => this.ipRecords.delete(ip));

    if (toDelete.length > 0) {
      console.log(`🧹 Cleaned up ${toDelete.length} old IP records`);
    }
  }

  /**
   * Get network statistics
   */
  async getNetworkStats(): Promise<{
    totalIPs: number;
    blockedIPs: number;
    knownThreats: number;
    vpnDetected: number;
    datacenterIPs: number;
    activeLocations: number;
  }> {
    const stats = {
      totalIPs: this.ipRecords.size,
      blockedIPs: 0,
      knownThreats: this.threatList.size,
      vpnDetected: 0,
      datacenterIPs: 0,
      activeLocations: 0
    };

    for (const record of this.ipRecords.values()) {
      if (record.blocked) stats.blockedIPs++;
      if (record.reputation.categories.includes('vpn')) stats.vpnDetected++;
      if (record.reputation.categories.includes('datacenter')) stats.datacenterIPs++;
    }

    stats.activeLocations = this.knownLocations.size;

    return stats;
  }

  /**
   * Get user location history
   */
  async getUserLocationHistory(userId: string): Promise<LocationRecord[]> {
    return this.locationHistory.get(userId) || [];
  }

  /**
   * Check if IP is blocked
   */
  async isIPBlocked(ipAddress: string): Promise<boolean> {
    const record = this.ipRecords.get(ipAddress);
    return record?.blocked || false;
  }
}
