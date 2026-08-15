/**
 * Driver Detector
 * 
 * Automatically identifies recorder protocol through:
 * - HTTP fingerprinting
 * - Vendor-specific probes
 * - Response pattern matching
 * 
 * Returns confidence-scored detection results.
 */

import type { DriverDetector, DriverDetectionResult } from "./recorder-driver.interface.js";
import type { RecorderProtocol, RecorderVendor } from "./recorder-driver.types.js";
import { RecorderHttpClient } from "../transport/recorder-http-client.js";
import { BasicAuthProvider, DigestAuthProvider } from "../transport/recorder-http-transport.js";

/**
 * Detection probe result
 */
interface ProbeResult {
  protocol: RecorderProtocol;
  vendor: RecorderVendor;
  confidence: number;
  evidence: string[];
}

/**
 * Default driver detector
 * 
 * Attempts multiple detection strategies in parallel.
 */
export class DefaultDriverDetector implements DriverDetector {
  private httpClient: RecorderHttpClient;
  
  constructor() {
    this.httpClient = new RecorderHttpClient();
  }
  
  /**
   * Detect recorder protocol
   */
  async detect(
    endpoint: {
      host: string;
      port: number;
      scheme: "http" | "https";
    },
    credentials: {
      username: string;
      password: string;
    },
    options?: {
      timeoutMs?: number;
      tryAllDrivers?: boolean;
    }
  ): Promise<DriverDetectionResult> {
    const baseUrl = `${endpoint.scheme}://${endpoint.host}:${endpoint.port}`;
    const timeout = options?.timeoutMs || 10000;
    
    // Create mock context for probing
    const ctx = {
      tenantId: "detect",
      branchId: "detect",
      recorderId: "detect",
      endpoint: {
        host: endpoint.host,
        port: endpoint.port,
        scheme: endpoint.scheme,
        baseUrl
      },
      credentialRef: { ref: "detect", type: "basic" as const },
      protocol: "unknown" as RecorderProtocol,
      timeoutMs: timeout
    };
    
    // Try detection strategies in parallel
    const probes: Promise<ProbeResult | null>[] = [
      this.probeHikvisionISAPI(ctx, credentials),
      this.probeDahuaCGI(ctx, credentials),
      this.probeONVIF(ctx, credentials)
    ];
    
    const results = await Promise.allSettled(probes);
    
    // Collect successful probes
    const detections: ProbeResult[] = [];
    
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        detections.push(result.value);
      }
    }
    
    // Sort by confidence
    detections.sort((a, b) => b.confidence - a.confidence);
    
    if (detections.length === 0) {
      // No detection succeeded
      return {
        protocol: "unknown",
        vendor: "unknown",
        confidence: 0,
        evidence: ["No protocol detected"]
      };
    }
    
    // Return best match
    const best = detections[0];
    
    return {
      protocol: best.protocol,
      vendor: best.vendor,
      confidence: best.confidence,
      evidence: best.evidence,
      alternatives: detections.slice(1).map(d => ({
        protocol: d.protocol,
        confidence: d.confidence
      }))
    };
  }
  
  /**
   * Probe for Hikvision ISAPI
   */
  private async probeHikvisionISAPI(
    ctx: any,
    credentials: { username: string; password: string }
  ): Promise<ProbeResult | null> {
    const evidence: string[] = [];
    let confidence = 0;
    
    try {
      // Set digest auth for Hikvision
      this.httpClient.setAuthProvider(new DigestAuthProvider());
      
      // Try ISAPI system endpoint
      const response = await this.httpClient.get(
        { ...ctx, credentialRef: { ...ctx.credentialRef } },
        "/ISAPI/System/deviceInfo",
        undefined,
        { 
          auth: credentials,
          noRetry: true,
          timeoutMs: ctx.timeoutMs 
        }
      );
      
      if (response.statusCode === 200) {
        const body = response.body.toLowerCase();
        
        // Check for Hikvision signatures
        if (body.includes("hikvision")) {
          evidence.push("Hikvision manufacturer string found");
          confidence += 0.4;
        }
        
        if (body.includes("<deviceinfo")) {
          evidence.push("ISAPI deviceInfo XML structure");
          confidence += 0.3;
        }
        
        if (body.includes("<model>") || body.includes("model>")) {
          evidence.push("ISAPI model tag present");
          confidence += 0.1;
        }
        
        if (response.headers["server"]?.toString().toLowerCase().includes("hikvision")) {
          evidence.push("Hikvision server header");
          confidence += 0.2;
        }
        
        if (confidence > 0.5) {
          return {
            protocol: "hikvision-isapi",
            vendor: "hikvision",
            confidence,
            evidence
          };
        }
      } else if (response.statusCode === 401) {
        // Authentication required suggests ISAPI might be present
        const wwwAuth = response.headers["www-authenticate"]?.toString().toLowerCase();
        if (wwwAuth?.includes("digest")) {
          evidence.push("Digest authentication required at ISAPI endpoint");
          confidence = 0.3;
          
          return {
            protocol: "hikvision-isapi",
            vendor: "hikvision",
            confidence,
            evidence
          };
        }
      }
      
    } catch (error) {
      // Probe failed
    }
    
    return null;
  }
  
  /**
   * Probe for Dahua CGI
   */
  private async probeDahuaCGI(
    ctx: any,
    credentials: { username: string; password: string }
  ): Promise<ProbeResult | null> {
    const evidence: string[] = [];
    let confidence = 0;
    let vendor: RecorderVendor = "dahua";
    
    try {
      // Set digest auth for Dahua
      this.httpClient.setAuthProvider(new DigestAuthProvider());
      
      // Try Dahua magicBox endpoint
      const response = await this.httpClient.get(
        { ...ctx, credentialRef: { ...ctx.credentialRef } },
        "/cgi-bin/magicBox.cgi",
        { action: "getSystemInfo" },
        { 
          auth: credentials,
          noRetry: true,
          timeoutMs: ctx.timeoutMs 
        }
      );
      
      if (response.statusCode === 200) {
        const body = response.body.toLowerCase();
        
        // Check for Dahua signatures
        if (body.includes("dahua")) {
          evidence.push("Dahua manufacturer string found");
          vendor = "dahua";
          confidence += 0.4;
        }
        
        // Check for CP PLUS (Dahua OEM)
        if (body.includes("cp-plus") || body.includes("cpplus") || body.includes("cp plus")) {
          evidence.push("CP PLUS manufacturer string found");
          vendor = "cp-plus";
          confidence += 0.4;
        }
        
        // Check for key=value format
        if (body.includes("serialnumber=") || body.includes("devicetype=")) {
          evidence.push("Dahua CGI key=value format detected");
          confidence += 0.3;
        }
        
        if (body.includes("softwareversion=") || body.includes("firmwareversion=")) {
          evidence.push("Dahua system info structure");
          confidence += 0.1;
        }
        
        if (response.headers["server"]?.toString().toLowerCase().includes("dahua")) {
          evidence.push("Dahua server header");
          confidence += 0.2;
        }
        
        if (confidence > 0.5) {
          return {
            protocol: "dahua-cgi",
            vendor,
            confidence,
            evidence
          };
        }
      } else if (response.statusCode === 401) {
        // Authentication required suggests CGI might be present
        const wwwAuth = response.headers["www-authenticate"]?.toString().toLowerCase();
        if (wwwAuth?.includes("digest")) {
          evidence.push("Digest authentication required at CGI endpoint");
          confidence = 0.3;
          
          return {
            protocol: "dahua-cgi",
            vendor: "dahua",
            confidence,
            evidence
          };
        }
      }
      
    } catch (error) {
      // Probe failed
    }
    
    return null;
  }
  
  /**
   * Probe for ONVIF
   */
  private async probeONVIF(
    ctx: any,
    credentials: { username: string; password: string }
  ): Promise<ProbeResult | null> {
    const evidence: string[] = [];
    let confidence = 0;
    
    try {
      // ONVIF typically uses WS-Security, but try basic auth first
      this.httpClient.setAuthProvider(new BasicAuthProvider());
      
      // Try ONVIF device service endpoint
      const soapBody = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">
  <s:Body>
    <GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/>
  </s:Body>
</s:Envelope>`;
      
      const response = await this.httpClient.post(
        { ...ctx, credentialRef: { ...ctx.credentialRef } },
        "/onvif/device_service",
        soapBody,
        { 
          auth: credentials,
          contentType: "application/soap+xml",
          noRetry: true,
          timeoutMs: ctx.timeoutMs 
        }
      );
      
      if (response.statusCode === 200) {
        const body = response.body.toLowerCase();
        
        // Check for ONVIF signatures
        if (body.includes("onvif")) {
          evidence.push("ONVIF namespace found");
          confidence += 0.4;
        }
        
        if (body.includes("soap-envelope") || body.includes("envelope")) {
          evidence.push("SOAP envelope structure");
          confidence += 0.2;
        }
        
        if (body.includes("getdeviceinformationresponse")) {
          evidence.push("ONVIF GetDeviceInformation response");
          confidence += 0.3;
        }
        
        if (confidence > 0.5) {
          return {
            protocol: "onvif",
            vendor: "unknown", // ONVIF is multi-vendor
            confidence,
            evidence
          };
        }
      } else if (response.statusCode === 401) {
        evidence.push("Authentication required at ONVIF endpoint");
        confidence = 0.2;
        
        return {
          protocol: "onvif",
          vendor: "unknown",
          confidence,
          evidence
        };
      }
      
    } catch (error) {
      // Probe failed
    }
    
    return null;
  }
}
