"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Network,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Server,
  Lock,
  ArrowRight,
  Info,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import { deviceConfigurationApi } from "@/lib/api-client";

export interface DeviceNetworkConfigData {
  dhcpEnabled: boolean;
  ipAddress: string;
  subnetMask: string;
  gateway: string;
  dnsServers?: string[];
  httpPort?: number;
  httpsPort?: number;
  rtspPort?: number;
  onvifPort?: number;
  confirmNetworkChange?: boolean;
}

export interface NetworkConfigPanelProps {
  deviceId?: string;
  isRecorder?: boolean;
  onConfigChanged?: () => void;
  initialConfig?: Partial<DeviceNetworkConfigData>;
  deviceName?: string;
  onSave?: (config: DeviceNetworkConfigData) => Promise<void>;
  saving?: boolean;
  disabled?: boolean;
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return 0;
  }
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function intToIpv4(intVal: number): string {
  return [
    (intVal >>> 24) & 255,
    (intVal >>> 16) & 255,
    (intVal >>> 8) & 255,
    intVal & 255,
  ].join(".");
}

export function NetworkConfigPanel({
  deviceId,
  isRecorder = false,
  onConfigChanged,
  initialConfig,
  deviceName = "Device",
  onSave,
  saving = false,
  disabled = false,
}: NetworkConfigPanelProps) {
  const [internalLoading, setInternalLoading] = useState<boolean>(false);
  const [internalSaving, setInternalSaving] = useState<boolean>(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [internalSuccess, setInternalSuccess] = useState<string | null>(null);

  const [dhcpEnabled, setDhcpEnabled] = useState<boolean>(initialConfig?.dhcpEnabled ?? false);
  const [ipAddress, setIpAddress] = useState<string>(initialConfig?.ipAddress ?? "192.168.1.100");
  const [subnetMask, setSubnetMask] = useState<string>(initialConfig?.subnetMask ?? "255.255.255.0");
  const [gateway, setGateway] = useState<string>(initialConfig?.gateway ?? "192.168.1.1");
  const [dns1, setDns1] = useState<string>(initialConfig?.dnsServers?.[0] ?? "8.8.8.8");
  const [dns2, setDns2] = useState<string>(initialConfig?.dnsServers?.[1] ?? "1.1.1.1");
  const [httpPort, setHttpPort] = useState<number>(initialConfig?.httpPort ?? 80);
  const [httpsPort, setHttpsPort] = useState<number>(initialConfig?.httpsPort ?? 443);
  const [rtspPort, setRtspPort] = useState<number>(initialConfig?.rtspPort ?? 554);
  const [onvifPort, setOnvifPort] = useState<number>(initialConfig?.onvifPort ?? 80);
  const [confirmChange, setConfirmChange] = useState<boolean>(false);

  useEffect(() => {
    if (deviceId) {
      setInternalLoading(true);
      setInternalError(null);
      const query = isRecorder
        ? deviceConfigurationApi.getRecorderNetwork(deviceId)
        : deviceConfigurationApi.getNetworkConfiguration(deviceId);
      query
        .then((res) => {
          if (res.data) {
            setDhcpEnabled(res.data.dhcpEnabled ?? false);
            if (res.data.ipAddress) setIpAddress(res.data.ipAddress);
            if (res.data.subnetMask) setSubnetMask(res.data.subnetMask);
            if (res.data.gateway) setGateway(res.data.gateway);
            if (res.data.dnsServers && res.data.dnsServers[0]) setDns1(res.data.dnsServers[0]);
            if (res.data.dnsServers && res.data.dnsServers[1]) setDns2(res.data.dnsServers[1]);
            if (res.data.httpPort) setHttpPort(res.data.httpPort);
            if (res.data.httpsPort) setHttpsPort(res.data.httpsPort);
            if (res.data.rtspPort) setRtspPort(res.data.rtspPort);
            if (res.data.onvifPort) setOnvifPort(res.data.onvifPort);
          }
        })
        .catch((err) => {
          setInternalError(err?.message || "Failed to query network configuration");
        })
        .finally(() => {
          setInternalLoading(false);
        });
    }
  }, [deviceId, isRecorder]);

  // Mathematical Subnet Evaluation
  const subnetMath = useMemo(() => {
    const ipInt = ipv4ToInt(ipAddress);
    const maskInt = ipv4ToInt(subnetMask);
    const gwInt = ipv4ToInt(gateway);

    const inverted = (~maskInt) >>> 0;
    const isContiguousMask = (inverted & (inverted + 1)) === 0;
    const cidrPrefix = Math.clz32(inverted);

    const networkInt = (ipInt & maskInt) >>> 0;
    const broadcastInt = (networkInt | inverted) >>> 0;
    const gwNetworkInt = (gwInt & maskInt) >>> 0;

    const isSameSubnet = networkInt === gwNetworkInt;
    const isGatewayCollision = ipInt === gwInt;
    const isNetworkAddress = ipInt === networkInt;
    const isBroadcastAddress = ipInt === broadcastInt;

    let error: string | null = null;
    if (!isContiguousMask) {
      error = "Subnet mask is not a valid contiguous netmask";
    } else if (isGatewayCollision) {
      error = "IP address collides with the default gateway address";
    } else if (!isSameSubnet) {
      error = `Default gateway (${gateway}) resides outside device subnet (${intToIpv4(networkInt)}/${cidrPrefix})`;
    } else if (isNetworkAddress) {
      error = `IP address ${ipAddress} cannot be the subnet network address`;
    } else if (isBroadcastAddress) {
      error = `IP address ${ipAddress} cannot be the subnet broadcast address`;
    }

    return {
      networkAddress: intToIpv4(networkInt),
      broadcastAddress: intToIpv4(broadcastInt),
      cidrPrefix,
      isSameSubnet,
      isGatewayCollision,
      error,
      isValid: !error,
    };
  }, [ipAddress, subnetMask, gateway]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subnetMath.isValid) return;
    if (!confirmChange) return;

    const dnsServers = [dns1, dns2].filter(Boolean);
    const payload: DeviceNetworkConfigData = {
      dhcpEnabled,
      ipAddress,
      subnetMask,
      gateway,
      dnsServers,
      httpPort,
      httpsPort,
      rtspPort,
      onvifPort,
      confirmNetworkChange: true,
    };

    if (onSave) {
      await onSave(payload);
    } else if (deviceId) {
      setInternalSaving(true);
      setInternalError(null);
      setInternalSuccess(null);
      try {
        const res = isRecorder
          ? await deviceConfigurationApi.setRecorderNetwork(deviceId, payload)
          : await deviceConfigurationApi.setNetworkConfiguration(deviceId, payload);

        if (res.data?.success || res.success) {
          setInternalSuccess("Network configuration applied and verified on hardware.");
          if (onConfigChanged) onConfigChanged();
        } else {
          setInternalError(res.data?.message || "Hardware verification detected parameter drift.");
        }
      } catch (err: any) {
        setInternalError(err?.message || "Failed to mutate network configuration");
      } finally {
        setInternalSaving(false);
      }
    }
  };

  const isSubmitting = saving || internalSaving;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 font-sans">
      {/* Feedback Alerts */}
      {internalError && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{internalError}</span>
        </div>
      )}

      {internalSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2.5">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{internalSuccess}</span>
        </div>
      )}

      {/* Anti-Lockout Banner */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
        <div className="flex items-center space-x-2 text-indigo-400 font-mono text-xs font-bold">
          <Network className="w-4 h-4" />
          <span>PRODUCTION ANTI-LOCKOUT NETWORK GUARD</span>
        </div>
        <p className="text-xs text-slate-400">
          Changing device network settings instructs hardware to bind to a new IPv4 interface. The platform performs real-time mathematical subnet verification before dispatching commands.
        </p>
      </div>

      {/* DHCP vs Static Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/80 border border-slate-800">
        <div>
          <div className="text-xs font-mono font-bold text-slate-200">DHCP Automatic Addressing</div>
          <div className="text-xs text-slate-400">Request IP and gateway lease from branch router DHCP pool</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={dhcpEnabled}
            onChange={(e) => setDhcpEnabled(e.target.checked)}
            disabled={disabled}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
        </label>
      </div>

      {/* IPv4 Parameters Grid */}
      <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4 shadow-xl">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono border-b border-slate-800 pb-2">
          IPv4 Network Parameters
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div>
            <label className="block text-slate-400 mb-1">IP Address:</label>
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value.trim())}
              disabled={disabled || dhcpEnabled}
              placeholder="192.168.1.100"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Subnet Mask:</label>
            <input
              type="text"
              value={subnetMask}
              onChange={(e) => setSubnetMask(e.target.value.trim())}
              disabled={disabled || dhcpEnabled}
              placeholder="255.255.255.0"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Default Gateway:</label>
            <input
              type="text"
              value={gateway}
              onChange={(e) => setGateway(e.target.value.trim())}
              disabled={disabled || dhcpEnabled}
              placeholder="192.168.1.1"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Subnet Mathematical Telemetry Badge */}
        <div
          className={`p-3.5 rounded-lg text-xs font-mono border flex items-start gap-2.5 ${
            subnetMath.isValid
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/40 text-rose-300"
          }`}
        >
          {subnetMath.isValid ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
          )}

          <div className="space-y-1 flex-1">
            <div className="font-bold">
              {subnetMath.isValid
                ? `REACHABLE DOMAIN: Subnet ${subnetMath.networkAddress}/${subnetMath.cidrPrefix} (Broadcast ${subnetMath.broadcastAddress})`
                : `ANTI-LOCKOUT VIOLATION: ${subnetMath.error}`}
            </div>
            <div className="text-[11px] opacity-80">
              Gateway verification: {subnetMath.isSameSubnet ? "Within same broadcast domain" : "Gateway resides in unreachable subnet!"}
            </div>
          </div>
        </div>

        {/* DNS Servers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono pt-2 border-t border-slate-800">
          <div>
            <label className="block text-slate-400 mb-1">Primary DNS Server:</label>
            <input
              type="text"
              value={dns1}
              onChange={(e) => setDns1(e.target.value.trim())}
              disabled={disabled || dhcpEnabled}
              placeholder="8.8.8.8"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Secondary DNS Server:</label>
            <input
              type="text"
              value={dns2}
              onChange={(e) => setDns2(e.target.value.trim())}
              disabled={disabled || dhcpEnabled}
              placeholder="1.1.1.1"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* Service Ports Configuration */}
      <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-4">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono border-b border-slate-800 pb-2 flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-indigo-400" />
          Service Ports (1–65535)
        </h4>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <label className="block text-slate-400 mb-1">HTTP Port:</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={httpPort}
              onChange={(e) => setHttpPort(parseInt(e.target.value, 10) || 80)}
              disabled={disabled}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">HTTPS (SSL) Port:</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={httpsPort}
              onChange={(e) => setHttpsPort(parseInt(e.target.value, 10) || 443)}
              disabled={disabled}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">RTSP Stream Port:</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={rtspPort}
              onChange={(e) => setRtspPort(parseInt(e.target.value, 10) || 554)}
              disabled={disabled}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">ONVIF Service Port:</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={onvifPort}
              onChange={(e) => setOnvifPort(parseInt(e.target.value, 10) || 80)}
              disabled={disabled}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
            />
          </div>
        </div>
      </div>

      {/* Mandatory Anti-Lockout Confirmation Guard */}
      <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-3">
        <div className="flex items-center space-x-2 text-amber-300 font-mono text-xs font-bold">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>CONFIRMATION REQUIRED (ANTI-LOCKOUT FAIL-SAFE)</span>
        </div>
        <p className="text-xs text-amber-200/80">
          Changing device network settings will disconnect active RTSP streams and reconnect via the new IP address. If the IP or subnet is misconfigured, the camera will require a physical technician dispatch.
        </p>
        <label className="flex items-center space-x-2 text-xs font-mono text-slate-200 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={confirmChange}
            onChange={(e) => setConfirmChange(e.target.checked)}
            disabled={disabled || !subnetMath.isValid}
            className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
          />
          <span className="font-semibold">
            I verify that {deviceName} is configured for {ipAddress} and confirm this network change.
          </span>
        </label>
      </div>

      {/* Submit Action */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={disabled || isSubmitting || !subnetMath.isValid || !confirmChange}
          className="inline-flex items-center px-6 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg shadow-indigo-950 transition-all"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Mutating &amp; Verifying on Hardware...
            </>
          ) : (
            <>
              <Network className="w-4 h-4 mr-2" />
              Apply Network Configuration
            </>
          )}
        </button>
      </div>
    </form>
  );
}
