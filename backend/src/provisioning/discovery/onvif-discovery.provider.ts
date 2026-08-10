/**
 * ONVIF Discovery Provider
 * Implements WS-Discovery for ONVIF-capable cameras
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as dgram from 'dgram';
import { DiscoveredCamera } from '../models/provisioning-result';
import { DiscoveryContext } from '../models/provisioning-context';
import { DeviceDiscoveryProvider } from './discovery-provider.interface';

const execAsync = promisify(exec);

interface OnvifDevice {
  address: string;
  endpointReference: string;
  scopes: string[];
  types: string[];
  xaddrs: string[];
}

export class OnvifDiscoveryProvider implements DeviceDiscoveryProvider {
  readonly name = 'onvif';

  private readonly MULTICAST_ADDRESS = '239.255.255.250';
  private readonly MULTICAST_PORT = 3702;
  private readonly DISCOVERY_TIMEOUT = 30000; // 30 seconds

  /**
   * Discover ONVIF devices using WS-Discovery
   */
  async discover(context: DiscoveryContext): Promise<DiscoveredCamera[]> {
    const devices = await this.performWsDiscovery(
      context.timeoutSeconds * 1000
    );

    return devices.map(device => this.mapToDiscoveredCamera(device));
  }

  /**
   * Check if ONVIF discovery is available
   */
  async isAvailable(): Promise<boolean> {
    // Check if we can create UDP sockets
    try {
      const socket = dgram.createSocket('udp4');
      socket.close();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Perform WS-Discovery probe
   */
  private async performWsDiscovery(timeoutMs: number): Promise<OnvifDevice[]> {
    const discoveredDevices = new Map<string, OnvifDevice>();

    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const timeout = setTimeout(() => {
        socket.close();
        resolve(Array.from(discoveredDevices.values()));
      }, timeoutMs);

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      });

      socket.on('message', (msg, rinfo) => {
        try {
          const device = this.parseProbeMatch(msg.toString(), rinfo.address);
          if (device) {
            // Use endpoint reference as unique key to avoid duplicates
            discoveredDevices.set(device.endpointReference, device);
          }
        } catch (error) {
          // Ignore parse errors
        }
      });

      socket.bind(() => {
        socket.addMembership(this.MULTICAST_ADDRESS);

        // Send probe message
        const probeMessage = this.createProbeMessage();
        socket.send(
          probeMessage,
          0,
          probeMessage.length,
          this.MULTICAST_PORT,
          this.MULTICAST_ADDRESS,
          (err) => {
            if (err) {
              clearTimeout(timeout);
              socket.close();
              reject(err);
            }
          }
        );
      });
    });
  }

  /**
   * Create WS-Discovery probe message
   */
  private createProbeMessage(): Buffer {
    const uuid = this.generateUuid();
    const probe = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <s:Header>
    <a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action>
    <a:MessageID>uuid:${uuid}</a:MessageID>
    <a:ReplyTo>
      <a:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address>
    </a:ReplyTo>
    <a:To s:mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To>
  </s:Header>
  <s:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </s:Body>
</s:Envelope>`;

    return Buffer.from(probe, 'utf8');
  }

  /**
   * Parse probe match response
   */
  private parseProbeMatch(xml: string, sourceIp: string): OnvifDevice | null {
    try {
      // Extract endpoint reference
      const endpointMatch = xml.match(
        /<a:Address>urn:uuid:([a-f0-9-]+)<\/a:Address>/i
      );
      if (!endpointMatch) return null;

      const endpointReference = endpointMatch[1];

      // Extract types
      const typesMatch = xml.match(/<d:Types>([^<]+)<\/d:Types>/i);
      const types = typesMatch ? typesMatch[1].split(' ') : [];

      // Check if this is a network video device
      const isCamera =
        types.some(
          (t) =>
            t.includes('NetworkVideoTransmitter') ||
            t.includes('Device') ||
            t.includes('NetworkVideoDisplay')
        ) || xml.includes('NetworkVideoTransmitter');

      if (!isCamera) return null;

      // Extract scopes
      const scopesMatch = xml.match(/<d:Scopes>([^<]+)<\/d:Scopes>/i);
      const scopes = scopesMatch
        ? scopesMatch[1].split(' ').filter((s) => s.trim())
        : [];

      // Extract XAddrs (device service URLs)
      const xaddrsMatch = xml.match(/<d:XAddrs>([^<]+)<\/d:XAddrs>/i);
      const xaddrs = xaddrsMatch
        ? xaddrsMatch[1].split(' ').filter((x) => x.trim())
        : [];

      // Extract IP from XAddrs or use source IP
      let ipAddress = sourceIp;
      if (xaddrs.length > 0) {
        const urlMatch = xaddrs[0].match(/http:\/\/([^:/]+)/);
        if (urlMatch) {
          ipAddress = urlMatch[1];
        }
      }

      return {
        address: ipAddress,
        endpointReference,
        scopes,
        types,
        xaddrs,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Map ONVIF device to discovered camera
   */
  private mapToDiscoveredCamera(device: OnvifDevice): DiscoveredCamera {
    // Parse vendor and model from scopes
    let vendor: string | undefined;
    let model: string | undefined;
    let serialNumber: string | undefined;

    for (const scope of device.scopes) {
      const hardwareMatch = scope.match(/hardware\/([^/]+)/i);
      if (hardwareMatch) {
        vendor = hardwareMatch[1];
      }

      const nameMatch = scope.match(/name\/([^/]+)/i);
      if (nameMatch) {
        model = decodeURIComponent(nameMatch[1]);
      }

      const serialMatch = scope.match(/serial\/([^/]+)/i);
      if (serialMatch) {
        serialNumber = serialMatch[1];
      }

      // Axis-specific parsing
      if (scope.includes('mfr=Axis')) {
        vendor = 'Axis';
      }

      // Hikvision-specific parsing
      if (scope.includes('hardware/Hikvision') || scope.includes('hardware/HIKVISION')) {
        vendor = 'Hikvision';
      }

      // Dahua-specific parsing
      if (scope.includes('hardware/Dahua') || scope.includes('hardware/DAHUA')) {
        vendor = 'Dahua';
      }
    }

    return {
      discoverySource: 'onvif',
      ipAddress: device.address,
      endpointReference: device.endpointReference,
      serviceUrls: device.xaddrs,
      vendor,
      model,
      serialNumber,
      scopes: device.scopes,
      discoveredAt: new Date(),
    };
  }

  /**
   * Generate UUID for probe message
   */
  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
