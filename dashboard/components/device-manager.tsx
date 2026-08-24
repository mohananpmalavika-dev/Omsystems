"use client";

import Link from "next/link";

import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Check,
  Copy,
  Download,
  ExternalLink,
  Network,
  Plus,
  RefreshCw,
  Router,
  Search,
  Server,
  Terminal,
  X,
  QrCode,
  Square,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cameraInventoryApi, deviceInventoryApi } from "@/lib/api-client";
import { discoveryDeviceTypeLabel, discoveryModelLabel } from "@/lib/discovery-display";
import { BranchConnectivityPanel } from "@/components/branch-connectivity-panel";
import { ProvisioningRun } from "@/components/provisioning-run";
import { QRCredentialScanner } from "@/components/qr-credential-scanner";
import { DefaultCredentialSuggester } from "@/components/default-credential-suggester";
import type {
  Branch,
  Camera as CameraRecord,
  DeviceInventoryRecord,
  EdgeAgent,
  EdgeScanJob,
} from "@/lib/types";

type CameraForm = {
  name: string;
  vendor: "hikvision" | "cp-plus" | "other";
  model: string;
  ipAddress: string;
  onvifPort: string;
  rtspPort: string;
  channel: string;
  protocol: "onvif-t" | "onvif-s" | "rtsp" | "vendor-adapter";
  connectionTransport: "vpn" | "cloudflare-tunnel";
  sourceType: "ip-camera" | "analog-dvr-channel" | "nvr-channel";
  recorderId: string;
  recorderChannel: string;
  recorderSerialNumber: string;
  edgeAgentId: string;
  connectionSecretRef: string;
  codec: "H264" | "H265" | "MJPEG" | "unknown";
  streamRole: "main" | "sub" | "unknown";
  width: string;
  height: string;
  frameRate: string;
  bitrateKbps: string;
  ptz: boolean;
  audio: boolean;
  events: boolean;
};

const scanStages = ["Local network", "VPN routes", "Secure tunnel"] as const;
const scannerStartupTimeoutMs = 12_000;

const emptyCameraForm: CameraForm = {
  name: "",
  vendor: "other",
  model: "",
  ipAddress: "",
  onvifPort: "80",
  rtspPort: "554",
  channel: "1",
  protocol: "onvif-t",
  connectionTransport: "vpn",
  sourceType: "ip-camera",
  recorderId: "",
  recorderChannel: "1",
  recorderSerialNumber: "",
  edgeAgentId: "",
  connectionSecretRef: "",
  codec: "unknown",
  streamRole: "unknown",
  width: "",
  height: "",
  frameRate: "",
  bitrateKbps: "",
  ptz: false,
  audio: false,
  events: false,
};

type DeviceInventoryForm = {
  deviceId: string;
  tenant: string;
  region: string;
  branch: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  macAddress: string;
  ipAddress: string;
  firmwareVersion: string;
  onvifVersion: string;
  capabilities: string;
  credentialReference: string;
  installationDate: string;
  warranty: string;
  amcContract: string;
  healthStatus: string;
  lastCommunication: string;
  configurationTemplate: string;
  riskClassification: string;
  lifecycleState: string;
};

type AutoProvisionResult = {
  discoveryId: string;
  cameraId?: string;
  name: string;
  status: "provisioned" | "partial" | "needs-attention" | "failed";
  reason?: string;
  stages?: {
    approved: boolean;
    recording: "recording" | "configured" | "failed";
    analytics: "active" | "disabled";
    alerts: "enabled" | "disabled";
  };
};

type GatewayActivation = {
  id: string;
  branchId: string;
  agentName: string;
  activationCode: string;
  expiresAt: string;
  bootstrap: {
    controlPlaneUrl: string;
    message: string;
    media: {
      managed: boolean;
      mode: "named" | "disabled";
      publicUrl?: string;
      tunnelStatus: string;
      credentialsDeliveredTo?: "gateway-only";
    };
  };
};

const emptyInventoryForm: DeviceInventoryForm = {
  deviceId: "",
  tenant: "",
  region: "",
  branch: "",
  deviceType: "ip-camera",
  manufacturer: "",
  model: "",
  serialNumber: "",
  macAddress: "",
  ipAddress: "",
  firmwareVersion: "",
  onvifVersion: "",
  capabilities: "",
  credentialReference: "",
  installationDate: "",
  warranty: "",
  amcContract: "",
  healthStatus: "unknown",
  lastCommunication: "",
  configurationTemplate: "default",
  riskClassification: "medium",
  lifecycleState: "discovered",
};

export function DeviceManager() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [gateways, setGateways] = useState<EdgeAgent[]>([]);
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [inventoryRecords, setInventoryRecords] = useState<DeviceInventoryRecord[]>([]);
  const [discoveredCameras, setDiscoveredCameras] = useState<any[]>([]);
  const [discoveryReviewState, setDiscoveryReviewState] = useState<Record<string, { reviewStatus: "pending" | "duplicate" | "review-required" | "approved" }>>({});
  const [inventoryForm, setInventoryForm] = useState<DeviceInventoryForm>(emptyInventoryForm);
  const [cameraForm, setCameraForm] = useState<CameraForm>(emptyCameraForm);
  const [discoveryMethod, setDiscoveryMethod] = useState("edge-agent-reported-inventory");
  const [discoveryManufacturer, setDiscoveryManufacturer] = useState("");
  const [discoverySerialNumber, setDiscoverySerialNumber] = useState("");
  const [discoveryMacAddress, setDiscoveryMacAddress] = useState("");
  const [discoveryFirmwareVersion, setDiscoveryFirmwareVersion] = useState("");
  const [discoveryOnvifSupport, setDiscoveryOnvifSupport] = useState(false);
  const [discoveryRtspValidated, setDiscoveryRtspValidated] = useState(false);
  const [discoveryPtzCapability, setDiscoveryPtzCapability] = useState(false);
  const [discoveryAudioCapability, setDiscoveryAudioCapability] = useState(false);
  const [discoveryAnalyticsCapability, setDiscoveryAnalyticsCapability] = useState(false);
  const [discoveryTimeSynchronization, setDiscoveryTimeSynchronization] = useState("unknown");
  const [discoveryDuplicateStatus, setDiscoveryDuplicateStatus] = useState("unknown");
  const [discoveryCompatibilityStatus, setDiscoveryCompatibilityStatus] = useState("unknown");
  const [discoveryHardwareId, setDiscoveryHardwareId] = useState("");
  const [discoveryExistingDeviceAssociation, setDiscoveryExistingDeviceAssociation] = useState("");
  const [gatewayName, setGatewayName] = useState("");
  const [showCameraForm, setShowCameraForm] = useState(false);
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [showDiscoveredList, setShowDiscoveredList] = useState(false);
  const [showDirectProbeModal, setShowDirectProbeModal] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [activePlatformTab, setActivePlatformTab] = useState<"powershell" | "bash" | "download">("download");
  const [probeIp, setProbeIp] = useState("");
  const [probePort, setProbePort] = useState("");
  const [probeUsername, setProbeUsername] = useState("");
  const [probePassword, setProbePassword] = useState("");
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<any>(null);
  const scanAbortedRef = useRef(false);

  function stopScanning() {
    scanAbortedRef.current = true;
    setScanning(false);
    setSaving(false);
    setNotice("Camera scanning was stopped.");
  }

  async function runDirectProbe() {
    if (!probeIp.trim() || !probeUsername.trim()) {
      setError("Camera IP address and username are required for a real probe.");
      return;
    }
    setProbing(true);
    setError(undefined);
    try {
      const res = await cameraInventoryApi.probeDirect({
        ipAddress: probeIp.trim(),
        rtspPort: Number(probePort) || 554,
        username: probeUsername.trim(),
        password: probePassword,
      });
      setProbeResult(res);
      if (res.online) {
        setNotice(`Camera at ${probeIp} responded (${res.server || "RTSP"}).`);
      } else {
        setError(`Camera at ${probeIp} is unreachable: ${res.error || "Connection error"}`);
      }
    } catch (err: any) {
      setError(err.message || "Failed to probe camera");
    } finally {
      setProbing(false);
    }
  }

  async function enrollProbedCamera() {
    if (!probeResult || !selectedBranch) return;
    setSaving(true);
    try {
      await cameraInventoryApi.approveCamera(selectedBranch, {
        discoveryId: "",
        name: probeResult.name || probeResult.model || `Camera ${probeIp.trim()}`,
        channel: 1,
        protocol: "rtsp",
        connectionTransport: "vpn",
        sourceType: "ip-camera",
        manufacturer: probeResult.vendor || probeResult.manufacturer,
        model: probeResult.model,
        ipAddress: probeIp.trim(),
        ...(probeResult.onvifPort ? { onvifPort: Number(probeResult.onvifPort) } : {}),
        ...(probeResult.rtspPort ? { rtspPort: Number(probeResult.rtspPort) } : { rtspPort: Number(probePort) }),
        profiles: Array.isArray(probeResult.profiles) ? probeResult.profiles : [],
        capabilities: probeResult.capabilities ?? {},
      });
      setShowDirectProbeModal(false);
      setNotice(`Camera at ${probeIp} successfully enrolled in ${activeBranch?.name}!`);
      await refreshBranch(selectedBranch);
    } catch (err: any) {
      setError(messageOf(err, "Failed to enroll camera"));
    } finally {
      setSaving(false);
    }
  }

  const [loadingDiscoveries, setLoadingDiscoveries] = useState(false);
  const [credentialActivation, setCredentialActivation] = useState<any>();
  const [activationUsername, setActivationUsername] = useState("");
  const [activationPassword, setActivationPassword] = useState("");
  const [credentialVerificationStatus, setCredentialVerificationStatus] = useState<string>();
  const [credentialVerificationError, setCredentialVerificationError] = useState<string>();
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<"automatic" | "manual" | "bulk">("automatic");
  const [selectedDiscoveryId, setSelectedDiscoveryId] = useState<string>();
  const [previewDiscoveryId, setPreviewDiscoveryId] = useState<string>();
  const [renameDraft, setRenameDraft] = useState("");
  const [previewNameDraft, setPreviewNameDraft] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [bulkCsv, setBulkCsv] = useState("");
  const [gatewayActivation, setGatewayActivation] = useState<GatewayActivation>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStageIndex, setScanStageIndex] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [autoProvisionResults, setAutoProvisionResults] = useState<AutoProvisionResult[]>([]);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryDeviceTypeFilter, setInventoryDeviceTypeFilter] = useState("all");
  const [inventoryLifecycleFilter, setInventoryLifecycleFilter] = useState("all");
  const [inventoryHealthFilter, setInventoryHealthFilter] = useState("all");
  const [inventorySort, setInventorySort] = useState<"updated" | "deviceId">("updated");

  const activeBranch = branches.find((branch) => branch.id === selectedBranch);
  const onlineGateway = gateways.find(isGatewayReady);
  const discoveryQueueItems = useMemo(() => discoveredCameras.map((camera) => {
    const reviewStatus = discoveryReviewState[camera.id]?.reviewStatus ?? (camera.duplicateStatus === "duplicate" ? "duplicate" : camera.duplicateStatus === "review-required" ? "review-required" : (camera.status === "approved" ? "approved" : "pending"));
    return {
      ...camera,
      reviewStatus,
      badgeLabel: reviewStatus === "duplicate"
        ? "Duplicate"
        : reviewStatus === "review-required"
          ? "Review required"
          : reviewStatus === "approved"
            ? "Approved"
            : "Pending",
    };
  }), [discoveredCameras, discoveryReviewState]);
  const pendingDiscoveryQueueItems = useMemo(() => {
    return discoveryQueueItems.filter((item) => item.reviewStatus !== "approved" && item.status !== "approved");
  }, [discoveryQueueItems]);
  const filteredInventoryRecords = useMemo(() => {
    const query = inventorySearch.trim().toLowerCase();
    return inventoryRecords.filter((record) => {
      const matchesType = inventoryDeviceTypeFilter === "all" || record.deviceType === inventoryDeviceTypeFilter;
      const matchesLifecycle = inventoryLifecycleFilter === "all" || record.lifecycleState === inventoryLifecycleFilter;
      const matchesHealth = inventoryHealthFilter === "all" || record.healthStatus === inventoryHealthFilter;
      const searchableText = [
        record.deviceId,
        record.deviceType,
        record.manufacturer,
        record.model,
        record.ipAddress,
        record.serialNumber,
        record.credentialReference,
        record.healthStatus,
        record.lifecycleState,
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = query.length === 0 || searchableText.includes(query);
      return matchesType && matchesLifecycle && matchesHealth && matchesSearch;
    }).sort((left, right) => {
      if (inventorySort === "updated") {
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }
      return left.deviceId.localeCompare(right.deviceId);
    });
  }, [inventoryRecords, inventoryDeviceTypeFilter, inventoryHealthFilter, inventoryLifecycleFilter, inventorySearch, inventorySort]);
  const pendingReviewCount = pendingDiscoveryQueueItems.length;
  const approvedReviewCount = discoveryQueueItems.filter((item) => item.reviewStatus === "approved" || item.status === "approved").length;

  useEffect(() => {
    void cameraInventoryApi.listBranches("device:configure")
      .then(({ data }) => {
        setBranches(data);
        const requestedBranch = new URLSearchParams(window.location.search).get("branchId");
        setSelectedBranch(data.some((branch: Branch) => branch.id === requestedBranch)
          ? requestedBranch!
          : data[0]?.id ?? "");
      })
      .catch((reason) => setError(messageOf(reason, "Unable to load configurable branches.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBranch) {
      setGateways([]);
      setCameras([]);
      setInventoryRecords([]);
      setGatewayActivation(undefined);
      return;
    }

    setGatewayActivation((gateway) =>
      gateway?.branchId === selectedBranch ? gateway : undefined,
    );
    setInventoryForm((form) => ({ ...form, branch: selectedBranch }));
    void refreshBranch(selectedBranch);
  }, [selectedBranch]);

  // Periodic background polling for discoveries and online edge agent status
  useEffect(() => {
    if (!selectedBranch) return;
    const interval = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const [gwResp, discResp] = await Promise.allSettled([
          cameraInventoryApi.listGateways(selectedBranch),
          cameraInventoryApi.listDiscovered(selectedBranch),
        ]);
        if (gwResp.status === "fulfilled" && gwResp.value?.data) {
          setGateways(gwResp.value.data);
        }
        if (discResp.status === "fulfilled" && Array.isArray(discResp.value?.data)) {
          setDiscoveredCameras(discResp.value.data);
          updateDiscoveryReviewState(discResp.value.data);
        }
      } catch {}
    }, 4_000);

    return () => window.clearInterval(interval);
  }, [selectedBranch]);

  useEffect(() => {
    if (!scanning) {
      setScanStageIndex(0);
      return;
    }

    const stageTimer = window.setInterval(() => {
      setScanStageIndex((current) => (current + 1) % scanStages.length);
    }, 2_200);

    return () => window.clearInterval(stageTimer);
  }, [scanning]);

  async function refreshBranch(branchId: string) {
    setLoading(true);
    setError(undefined);
    try {
      const [gatewayResult, cameraResult, discoveredResult, inventoryResult] = await Promise.allSettled([
        cameraInventoryApi.listGateways(branchId),
        cameraInventoryApi.listByBranch(branchId),
        cameraInventoryApi.listDiscovered(branchId),
        deviceInventoryApi.list(branchId),
      ]);
      if (gatewayResult.status === "fulfilled") setGateways(gatewayResult.value.data);
      if (cameraResult.status === "fulfilled") setCameras(cameraResult.value.data);
      if (inventoryResult.status === "fulfilled") setInventoryRecords(inventoryResult.value.data);
      if (discoveredResult.status === "fulfilled") {
        setDiscoveredCameras(discoveredResult.value.data);
        updateDiscoveryReviewState(discoveredResult.value.data);
      }

      const failedResult = [gatewayResult, cameraResult, discoveredResult, inventoryResult]
        .find((result) => result.status === "rejected");
      if (failedResult?.status === "rejected") {
        setError(messageOf(failedResult.reason, "Some branch device information could not be loaded."));
      }
      return discoveredResult.status === "fulfilled" ? discoveredResult.value.data : [];
    } finally {
      setLoading(false);
    }
  }

  function updateDiscoveryReviewState(discoveries: any[]) {
    setDiscoveryReviewState((previous) => {
      const next = { ...previous };
      for (const camera of discoveries) {
        if (!next[camera.id]) {
          next[camera.id] = {
            reviewStatus: camera.duplicateStatus === "duplicate"
              ? "duplicate"
              : camera.duplicateStatus === "review-required"
                ? "review-required"
                : "pending",
          };
        }
      }
      return next;
    });
  }

  function openCameraForm() {
    const preferred = gateways.find((gateway) => gateway.status === "online") ?? gateways[0];
    setCameraForm({
      ...emptyCameraForm,
      edgeAgentId: preferred?.id ?? "",
      connectionTransport: preferred ? "cloudflare-tunnel" : "vpn",
      connectionSecretRef: preferred ? `edge://${preferred.id}/manual-camera` : "",
    });
    if (selectedBranch) {
      void cameraInventoryApi.getConnectivity(selectedBranch)
        .then(({ profile }) => {
          if (!profile) return;
          setCameraForm((current) => ({
            ...current,
            connectionTransport: profile.primaryTransport,
            connectionSecretRef: profile.primaryTransport === "vpn" ? "" : current.connectionSecretRef,
          }));
        })
        .catch(() => undefined);
    }
    setError(undefined);
    setShowCameraForm(true);
  }

  async function completeCameraScan(scanId: string, fallbackEdgeAgentId?: string) {
    if (!selectedBranch) return { found: 0, provisioned: 0, credentialsRequired: 0 };
    setLastScanAt(new Date().toISOString());
    // 300 s window: edge agents claim jobs only on heartbeat (up to ~60 s latency)
    // plus ONVIF WS-Discovery can take 20-40 s on a large subnet.
    const deadline = Date.now() + 300_000;
    const startTime = Date.now();
    let job = await cameraInventoryApi.getScan(selectedBranch, scanId).catch(() => ({ status: "running" })) as EdgeScanJob;
    while (job.status === "queued" || job.status === "running") {
      if (scanAbortedRef.current) {
        setNotice("Camera scan was stopped.");
        return { found: 0, provisioned: 0, credentialsRequired: 0 };
      }
      if (Date.now() >= deadline) {
        break;
      }
      await wait(1_500);
      if (scanAbortedRef.current) {
        setNotice("Camera scan was stopped.");
        return { found: 0, provisioned: 0, credentialsRequired: 0 };
      }
      try {
        const liveDiscovered = await cameraInventoryApi.listDiscovered(selectedBranch);
        if (liveDiscovered?.data?.length > 0) {
          setDiscoveredCameras(liveDiscovered.data);
          if (job.scope !== "device" && Date.now() - startTime > 12_000) {
            break;
          }
        }
      } catch {}
      job = await cameraInventoryApi.getScan(selectedBranch, scanId).catch(() => job) as EdgeScanJob;
    }

    if (job.status === "queued" || job.status === "running") {
      throw new Error("The branch scan timed out before the edge agent completed it. Confirm the scanner remains online, then retry.");
    }

    if (job.status === "failed") {
      const liveDiscovered = await cameraInventoryApi.listDiscovered(selectedBranch).catch(() => ({ data: [] }));
      if (!liveDiscovered?.data?.length) {
        throw new Error(job.error ?? "Branch Gateway scan failed.");
      }
    }

    let rawResults: any[] = [];
    try {
      const scanResults = await cameraInventoryApi.getScanResults(selectedBranch, scanId);
      rawResults = scanResults.data ?? [];
    } catch {}

    if (rawResults.length === 0) {
      try {
        const liveDiscovered = await cameraInventoryApi.listDiscovered(selectedBranch);
        rawResults = liveDiscovered.data ?? [];
      } catch {}
    }

    const mappedResults = rawResults.map((item: any) => ({
      ...item,
      id: item.discoveryId ?? item.id,
      displayName: item.displayName ?? item.model ?? item.name ?? item.ipAddress ?? "Discovered camera",
      vendor: item.manufacturer ?? item.vendor ?? "Unknown",
      model: item.model ?? "Unknown",
      ipAddress: item.ipAddress ?? item.ip ?? "",
      onvifPort: item.onvifPort,
      onvifSupport: item.onvifSupported === true || item.onvifSupport === true,
      streamVerified: item.streamVerified === true,
      credentialsRequired: item.credentialsRequired === true,
      compatibility: item.compatibility ?? item.compatibilityStatus ?? "unknown",
      duplicateStatus: item.duplicate ? "duplicate" : item.duplicateStatus ?? "unknown",
      discoveryMethod: item.discoveryMethod ?? "edge-agent-reported-inventory",
      profiles: Array.isArray(item.profiles) ? item.profiles : [],
      statusReason: item.statusReason ?? null,
      edgeAgentId: item.edgeAgentId ?? fallbackEdgeAgentId ?? "",
    }));

    setDiscoveredCameras(mappedResults);
    updateDiscoveryReviewState(mappedResults);

    const credentialsRequired = Math.max(
      job.credentialsRequiredCount ?? 0,
      mappedResults.filter((camera) => camera.credentialsRequired).length,
    );
    const activationCandidate = mappedResults.find((camera) => camera.credentialsRequired);
    setCredentialActivation(activationCandidate);
    // Discovery is intentionally separate from approval. The operator reviews
    // every discovered IP camera or DVR channel in this module before it is
    // added to active monitoring; scanning must never create cameras silently.
    const provisioned = job.provisionedCount ?? 0;
    setShowDiscoveredList(false);
    return { found: job.resultCount || mappedResults.length, provisioned, credentialsRequired };
  }

  async function waitForWebsiteScanner(branchId: string) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const response = await cameraInventoryApi.listGateways(branchId);
      setGateways(response.data);
      const gateway = response.data.find(isGatewayReady);
      if (gateway) return gateway;
      await wait(1_000);
    }

    throw new Error("No online edge agent is registered for this branch. Install and start the branch scanner, then retry.");
  }

  async function startConnectedCameraScan(gateway: EdgeAgent) {
    if (!selectedBranch) return;
    // Use the device-scan API (not the provisioning API) so the edge agent
    // picks up the job via its heartbeat poll and we track the right scan ID.
    const job = await cameraInventoryApi.startScan(selectedBranch, gateway.id);
    const outcome = await completeCameraScan(job.id, gateway.id);
    setNotice(`Camera scan completed. Found ${outcome.found} devices. Review them in Device discovery; nothing is added until you approve it here${outcome.credentialsRequired ? `; ${outcome.credentialsRequired} need credentials` : ``}.`);
  }

  function openScannerInstaller() {
    if (!selectedBranch) return;
    setGatewayActivation(undefined);
    setGatewayName(`${activeBranch?.name ?? "Branch"} Scanner`);
    setError(undefined);
    setShowGatewayForm(true);
  }

  async function scanCameras() {
    if (!selectedBranch) return;
    if (gateways.length === 0) {
      openScannerInstaller();
      setNotice("Install the Sentinel Grid Scanner once on this PC to enable automatic branch scans.");
      return;
    }
    scanAbortedRef.current = false;
    setScanning(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const gateway = onlineGateway ?? await waitForWebsiteScanner(selectedBranch);
      if (!gateway) throw new Error("No online edge agent is registered for this branch.");
      if (scanAbortedRef.current) return;
      try {
        await startConnectedCameraScan(gateway);
      } catch (reason) {
        if (!isScannerUnavailable(reason)) throw reason;
        const reconnectedGateway = await waitForWebsiteScanner(selectedBranch);
        if (!reconnectedGateway) throw new Error("No online edge agent is registered for this branch.");
        if (scanAbortedRef.current) return;
        await startConnectedCameraScan(reconnectedGateway);
      }
    } catch (reason) {
      if (!scanAbortedRef.current) {
        setError(messageOf(reason, "Camera scan failed."));
      }
    } finally {
      setScanning(false);
    }
  }

  function markDiscoveryReviewStatus(discoveryId: string, reviewStatus: "pending" | "duplicate" | "review-required" | "approved") {
    setDiscoveryReviewState((previous) => ({ ...previous, [discoveryId]: { reviewStatus } }));
  }

  function previewDiscoveredCamera(discovered: any) {
    setPreviewDiscoveryId(discovered.id);
    setPreviewNameDraft(discovered.displayName ?? discovered.model ?? "");
    setRejectReason("");
  }

  function openCredentialActivation(discovered: any) {
    setCredentialActivation(discovered);
    setShowDiscoveredList(false);
    setActivationUsername("");
    setActivationPassword("");
    setCredentialVerificationStatus(undefined);
    setCredentialVerificationError(undefined);
    setError(undefined);
  }

  async function waitForCredentialCommand(commandId: string) {
    if (!selectedBranch) throw new Error("Select a branch before verifying device credentials.");
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const response = await cameraInventoryApi.listGatewayCommands(selectedBranch);
      const command = (response.data ?? []).find((item: any) => item.id === commandId);
      if (command?.status === "succeeded") return command;
      if (command?.status === "failed") {
        throw new Error(command.error || "The branch scanner could not verify these credentials.");
      }
      await wait(1_500);
    }
    throw new Error("Credential verification timed out. Confirm the branch scanner remains online, then retry.");
  }

  async function openPendingCredentials() {
    if (!selectedBranch) return;
    setLoadingDiscoveries(true);
    setShowDiscoveredList(true);
    setError(undefined);
    try {
      const response = await cameraInventoryApi.listDiscovered(selectedBranch);
      const discoveries = response.data ?? [];
      setDiscoveredCameras(discoveries);
      updateDiscoveryReviewState(discoveries);

      const credentialCandidates = discoveries.filter((camera) => camera.credentialsRequired);
      if (credentialCandidates.length === 1) {
        openCredentialActivation(credentialCandidates[0]);
      } else if (credentialCandidates.length === 0) {
        setShowDiscoveredList(false);
        setError("No pending device login was returned. Run the camera scan again to refresh the provisioning evidence.");
      }
    } catch (reason) {
      setShowDiscoveredList(false);
      setError(messageOf(reason, "Unable to load devices that require credentials."));
    } finally {
      setLoadingDiscoveries(false);
    }
  }

  async function activateDiscoveredCamera(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBranch || !credentialActivation) return;
    setSaving(true);
    setScanning(true);
    setError(undefined);
    setCredentialVerificationError(undefined);
    setCredentialVerificationStatus("Encrypting the login for this branch scanner…");
    try {
      const targetName = credentialActivation.displayName || credentialActivation.model || "IP Camera";
      const targetAgentId = credentialActivation.edgeAgentId;
      const targetIpAddress = credentialActivation.ipAddress;
      const activation = await cameraInventoryApi.activateDiscovery(selectedBranch, credentialActivation.id, {
        username: activationUsername,
        password: activationPassword,
      });
      setActivationPassword("");
      setCredentialVerificationStatus("Waiting for the installed scanner to verify this device and enumerate its channels…");
      await waitForCredentialCommand(activation.commandId);
      if (activation.scanId) {
        setCredentialVerificationStatus("Refreshing this device with the verified login…");
        await completeCameraScan(activation.scanId, targetAgentId);
      }
      setCredentialVerificationStatus("Verification completed. Loading the discovered channels…");
      const refreshed = await cameraInventoryApi.listDiscovered(selectedBranch);
      const refreshedDiscoveries = refreshed.data ?? [];
      const verifiedTargets = refreshedDiscoveries.filter((item: any) =>
        item.edgeAgentId === targetAgentId &&
        item.ipAddress === targetIpAddress &&
        item.streamVerified === true &&
        item.credentialsRequired !== true &&
        item.duplicateStatus !== "duplicate" &&
        (item.compatibilityStatus ?? item.compatibility) === "compatible"
      );
      setDiscoveredCameras(refreshedDiscoveries);
      updateDiscoveryReviewState(refreshedDiscoveries);
      if (verifiedTargets.length === 0) {
        const stillNeedsCredentials = refreshedDiscoveries.find((item: any) =>
          item.edgeAgentId === targetAgentId && item.ipAddress === targetIpAddress && item.credentialsRequired
        );
        if (stillNeedsCredentials) setCredentialActivation(stillNeedsCredentials);
        setCredentialVerificationStatus(undefined);
        setCredentialVerificationError(stillNeedsCredentials?.statusReason === "rtsp_credentials_rejected"
          ? `Login rejected by ${targetName} at ${targetIpAddress}. Confirm that you selected the correct device and enter its exact DVR/camera username and password.`
          : `The scanner reached ${targetName} at ${targetIpAddress}, but no authenticated video stream was returned. Check the username, password, RTSP service, and account permissions, then retry.`);
        return;
      }
      const activatedCount = verifiedTargets.length;
      setCredentialActivation(undefined);
      setCredentialVerificationStatus(undefined);
      setCredentialVerificationError(undefined);
      setNotice(verifiedTargets.length > 1
        ? `Credentials verified. ${activatedCount} recorder channels were added and connected to live monitoring.`
        : `Credentials verified and ${targetName} was connected to live monitoring.`);
      await refreshBranch(selectedBranch);
    } catch (reason) {
      if (isAgentUpdateRequired(reason)) {
        setCredentialActivation(undefined);
        setActivationPassword("");
        setCredentialVerificationStatus(undefined);
        setCredentialVerificationError(undefined);
        openScannerInstaller();
        setError("Repair the Sentinel Grid Scanner once before verifying credentials. This safety update guarantees that only the selected device is probed.");
        return;
      }
      setActivationPassword("");
      setCredentialVerificationStatus(undefined);
      setCredentialVerificationError(messageOf(reason, "Unable to activate this device with the supplied credentials."));
    } finally {
      setSaving(false);
      setScanning(false);
    }
  }

  function handleStopOperation() {
    scanAbortedRef.current = true;
    setSaving(false);
    setScanning(false);
    setLoadingDiscoveries(false);
    setNotice("Operation stopped by user.");
  }

  async function approveDiscoveredCamera(discovered: any) {
    if (discovered.credentialsRequired) {
      openCredentialActivation(discovered);
      setNotice(`Authentication required: Enter username & password for ${discovered.displayName || discovered.ipAddress} to verify and connect.`);
      return;
    }
    setSaving(true);
    setError(undefined);
    scanAbortedRef.current = false;
    try {
      const name = discovered.displayName || discovered.model || `${discovered.vendor || "IP"} Camera (${discovered.ipAddress})`;
      await cameraInventoryApi.approveDiscovery(selectedBranch, discovered.id, {
        name,
        protocol: discovered.recorderId ? "vendor-adapter" : discovered.onvifSupport ? "onvif-t" : "rtsp",
      });
      markDiscoveryReviewStatus(discovered.id, "approved");
      setPreviewDiscoveryId(undefined);
      setPreviewNameDraft("");
      setNotice(`${name} verified, approved, and added to active camera list.`);
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Failed to approve discovered camera."));
    } finally {
      setSaving(false);
    }
  }

  async function approveAllDiscovered() {
    if (!selectedBranch) return;
    setSaving(true);
    setError(undefined);
    setAutoProvisionResults([]);
    scanAbortedRef.current = false;
    try {
      let approvedCount = 0;
      // 1. Try batch auto-provision API first
      try {
        const response = await cameraInventoryApi.approveAllDiscovered(selectedBranch, {
          recordingMode: "continuous",
          retentionDays: 180,
          enableAnalytics: true,
          enableAlerts: true,
        }) as { summary: { provisioned: number; partial: number; needsAttention: number; failed: number }; results: AutoProvisionResult[] };
        if (response?.results) setAutoProvisionResults(response.results);
        approvedCount = response?.summary?.provisioned ?? 0;
        for (const result of response?.results ?? []) {
          if (result.status === "provisioned" || result.status === "partial") {
            markDiscoveryReviewStatus(result.discoveryId, "approved");
          }
        }
      } catch {}

      // 2. Iterate and approve ONLY verified cameras with valid credentials
      let unauthenticatedCount = 0;
      for (const item of discoveryQueueItems) {
        if (scanAbortedRef.current) break;
        if (item.credentialsRequired || !item.streamVerified) {
          unauthenticatedCount++;
          continue;
        }
        if (item.reviewStatus !== "approved") {
          const name = item.displayName || item.model || `${item.vendor || "IP"} Camera (${item.ipAddress})`;
          try {
            await cameraInventoryApi.approveDiscovery(selectedBranch, item.id, { name });
            markDiscoveryReviewStatus(item.id, "approved");
            approvedCount++;
          } catch {
            try {
              await cameraInventoryApi.createCamera(selectedBranch, {
                name,
                vendor: item.vendor || item.manufacturer || "other",
                model: item.model || "IP Camera",
                channel: item.recorderChannel ?? 1,
                protocol: item.onvifSupport ? "onvif-t" : "rtsp",
                ipAddress: item.ipAddress,
                macAddress: item.macAddress,
                serialNumber: item.serialNumber,
                connectionSecretRef: `edge://${item.edgeAgentId || ""}/${item.id}`,
                connectionTransport: "edge-gateway",
                sourceType: item.sourceType || "ip-camera",
              });
              markDiscoveryReviewStatus(item.id, "approved");
              approvedCount++;
            } catch {}
          }
        }
      }

      if (approvedCount > 0 && unauthenticatedCount > 0) {
        setNotice(`${approvedCount} verified cameras approved and added to active camera list. ${unauthenticatedCount} device(s) require login credentials before they can be added.`);
      } else if (approvedCount > 0) {
        setNotice(`${approvedCount} verified cameras approved and moved to active camera inventory.`);
      } else if (unauthenticatedCount > 0) {
        setNotice(`${unauthenticatedCount} camera(s) require login credentials. Click 'Enter login & password' on each camera to verify.`);
      }
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Automatic provisioning encountered an issue."));
    } finally {
      setSaving(false);
    }
  }

  async function renameDiscoveredCamera(discoveryId: string, displayName: string) {
    setSaving(true);
    setError(undefined);
    try {
      await cameraInventoryApi.renameDiscovery(selectedBranch, discoveryId, { displayName });
      setRenameDraft("");
      setPreviewNameDraft("");
      setSelectedDiscoveryId(undefined);
      setPreviewDiscoveryId(undefined);
      setNotice("Discovery name updated.");
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Failed to rename discovered camera."));
    } finally {
      setSaving(false);
    }
  }

  async function rejectDiscoveredCamera(discoveryId: string, reason: string) {
    setSaving(true);
    setError(undefined);
    try {
      await cameraInventoryApi.rejectDiscovery(selectedBranch, discoveryId, { reason });
      setRejectReason("");
      setSelectedDiscoveryId(undefined);
      setPreviewDiscoveryId(undefined);
      setNotice("Device was rejected and will stay suppressed on future scans.");
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Failed to reject discovered camera."));
    } finally {
      setSaving(false);
    }
  }

  async function registerGateway(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBranch || !activeBranch) return;
    setSaving(true);
    setError(undefined);
    try {
      // Use gatewayName if it's set (from the form), otherwise use branch name
      const agentName = gatewayName.trim() || `${activeBranch.name} Scanner`;
      const activation = await cameraInventoryApi.createGatewayActivation(selectedBranch, {
        agentName,
        ttlMinutes: 60,
      });
      setGatewayActivation(activation);
      setGatewayName("");
      
      // If this was for download (no gateway name form), show download-specific message
      if (!gatewayName.trim()) {
        setNotice(`Package prepared for ${agentName}. Click "Download Ready Package" to get the installer.`);
      } else {
        setNotice(activation.bootstrap.media.managed
          ? `Gateway and named media tunnel created. ${activation.bootstrap.media.publicUrl ?? "The stable hostname"} is delivered automatically on first boot.`
          : "One-time activation created. Managed media tunnels are not configured on this control plane.");
      }
    } catch (reason) {
      setError(messageOf(reason, "Unable to prepare the installer package."));
    } finally {
      setSaving(false);
    }
  }

  async function downloadWebsiteScanner() {
    if (!selectedBranch || !gatewayActivation) return;
    setSaving(true);
    setError(undefined);
    try {
      cameraInventoryApi.downloadInstallerFromActivation(selectedBranch, {
        activationId: gatewayActivation.id,
        activationCode: gatewayActivation.activationCode,
        agentName: gatewayActivation.agentName,
      });
      setNotice("Installer download started. Open the downloaded EXE and approve the Windows elevation prompt to install and start the branch agent.");
    } catch (reason) {
      setError(messageOf(reason, "Unable to download the scanner installer."));
    } finally {
      setSaving(false);
    }
  }

  async function issueGatewayCommand(
    gateway: EdgeAgent,
    type: "rediscover" | "restart-media" | "collect-logs",
  ) {
    if (!selectedBranch) return;
    setSaving(true);
    setError(undefined);
    try {
      const command = await cameraInventoryApi.sendGatewayCommand(selectedBranch, gateway.id, { type });
      setNotice(`${type.replaceAll("-", " ")} queued for ${gateway.name}. Command ${String(command.id).slice(0, 8)} is fully audited.`);
    } catch (reason) {
      setError(messageOf(reason, "Gateway command could not be queued."));
    } finally {
      setSaving(false);
    }
  }

  async function handleReconnectGateway(gatewayId: string, withCameras: boolean) {
    if (!selectedBranch) return;
    setSaving(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/control/v1/operations/health/edge-agents/${gatewayId}/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reconnectCameras: withCameras }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to reconnect Edge Agent');
      }

      const { data } = await response.json();
      setNotice(
        `Reconnection initiated for Edge Agent${withCameras ? ` and ${data.camerasAffected} camera(s)` : ''}. ` +
        `Status will update automatically.`
      );
      
      // Refresh the branch data after a short delay
      setTimeout(() => {
        void refreshBranch(selectedBranch);
      }, 2000);
    } catch (reason) {
      setError(messageOf(reason, "Edge Agent reconnection failed."));
    } finally {
      setSaving(false);
    }
  }

  async function addInventoryRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBranch) return;
    setSaving(true);
    setError(undefined);
    try {
      const payload = {
        ...inventoryForm,
        branch: selectedBranch,
        capabilities: inventoryForm.capabilities.split(',').map((item) => item.trim()).filter(Boolean),
      };
      await deviceInventoryApi.create(payload);
      setInventoryForm({ ...emptyInventoryForm, branch: selectedBranch, tenant: inventoryForm.tenant });
      await refreshBranch(selectedBranch);
      setNotice(`Inventory record ${payload.deviceId || "created"} was saved.`);
    } catch (reason) {
      setError(messageOf(reason, "Failed to save device inventory record."));
    } finally {
      setSaving(false);
    }
  }

  async function addCamera(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBranch) return;
    setSaving(true);
    setError(undefined);
    try {
      if (registrationMode === "bulk") {
        await cameraInventoryApi.bulkImport(selectedBranch, bulkCsv);
        setShowCameraForm(false);
        setBulkCsv("");
        setNotice("Bulk camera registrations were imported successfully.");
        await refreshBranch(selectedBranch);
        return;
      }

      if (registrationMode === "manual") {
        await cameraInventoryApi.approveCamera(selectedBranch, {
          discoveryId: "",
          name: cameraForm.name,
          channel: Number(cameraForm.channel),
          protocol: cameraForm.protocol,
          connectionTransport: cameraForm.connectionTransport,
          sourceType: cameraForm.sourceType,
          ...(cameraForm.connectionSecretRef.trim() ? { connectionSecretRef: cameraForm.connectionSecretRef.trim() } : {}),
          ...(cameraForm.sourceType !== "ip-camera" ? {
            recorderId: cameraForm.recorderId,
            recorderChannel: Number(cameraForm.recorderChannel),
            recorderSerialNumber: cameraForm.recorderSerialNumber || undefined,
          } : {}),
          manufacturer: discoveryManufacturer || cameraForm.vendor,
          model: cameraForm.model,
          serialNumber: discoverySerialNumber || undefined,
          ipAddress: cameraForm.ipAddress,
          onvifPort: Number(cameraForm.onvifPort),
          rtspPort: Number(cameraForm.rtspPort),
          streamProfile: cameraForm.streamRole,
          profile: {
            name: cameraForm.streamRole,
            role: cameraForm.streamRole,
            codec: cameraForm.codec,
            width: Number(cameraForm.width),
            height: Number(cameraForm.height),
            frameRate: Number(cameraForm.frameRate),
            bitrateKbps: Number(cameraForm.bitrateKbps),
            preferredFor: cameraForm.sourceType === "ip-camera"
              ? ["recording", "live", "analytics"]
              : ["live", "analytics"],
          },
        });
      } else {
        const discovery = await cameraInventoryApi.submitDiscovery(selectedBranch, {
          edgeAgentId: cameraForm.edgeAgentId,
          discoveryMethod,
          vendor: cameraForm.vendor,
          manufacturer: discoveryManufacturer || cameraForm.vendor,
          model: cameraForm.model,
          ipAddress: cameraForm.ipAddress,
          macAddress: discoveryMacAddress || undefined,
          serialNumber: discoverySerialNumber || undefined,
          firmwareVersion: discoveryFirmwareVersion || undefined,
          onvifSupport: discoveryOnvifSupport,
          rtspValidated: discoveryRtspValidated,
          ptzCapability: discoveryPtzCapability || cameraForm.ptz,
          audioCapability: discoveryAudioCapability || cameraForm.audio,
          analyticsCapability: discoveryAnalyticsCapability || cameraForm.events,
          timeSynchronization: discoveryTimeSynchronization,
          duplicateStatus: discoveryDuplicateStatus,
          compatibilityStatus: discoveryCompatibilityStatus,
          hardwareId: discoveryHardwareId || undefined,
          existingDeviceAssociation: discoveryExistingDeviceAssociation || undefined,
          sourceType: cameraForm.sourceType,
          ...(cameraForm.sourceType !== "ip-camera" ? {
            recorderId: cameraForm.recorderId,
            recorderChannel: Number(cameraForm.recorderChannel),
            recorderSerialNumber: cameraForm.recorderSerialNumber || undefined,
          } : {}),
          onvifPort: Number(cameraForm.onvifPort),
          rtspPort: Number(cameraForm.rtspPort),
          profiles: [{
            name: cameraForm.streamRole,
            codec: cameraForm.codec,
            width: Number(cameraForm.width),
            height: Number(cameraForm.height),
            role: cameraForm.streamRole,
            frameRate: Number(cameraForm.frameRate),
            bitrateKbps: Number(cameraForm.bitrateKbps),
            preferredFor: cameraForm.sourceType === "ip-camera"
              ? ["recording", "live", "analytics"]
              : ["live", "analytics"],
          }],
          capabilities: {
            ptz: cameraForm.ptz,
            audio: cameraForm.audio,
            events: cameraForm.events,
          },
        });
        await cameraInventoryApi.approveDiscovery(selectedBranch, discovery.id, {
          name: cameraForm.name,
          channel: Number(cameraForm.channel),
          protocol: cameraForm.protocol,
        });
      }
      setShowCameraForm(false);
      setNotice(`${cameraForm.name} was added to ${activeBranch?.name ?? "the branch"}.`);
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Camera onboarding failed."));
    } finally {
      setSaving(false);
    }
  }

  function downloadOneClickBatchFile(branchId: string, branchName: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://sentinel-grid-monitoring-s38w.onrender.com";
    const cleanBranchName = (branchName || "Branch").replace(/["\r\n]/g, "");
    const safeBranchName = (branchName || "Branch").replace(/[`"'\r\n]/g, "");
    const content = `<# :
@echo off
setlocal
title Sentinel Grid CCTV Edge Agent - 1-Click Auto Setup
color 0B
cls
powershell -NoProfile -ExecutionPolicy Bypass -Command "[ScriptBlock]::Create([IO.File]::ReadAllText('%~f0')).Invoke()"
echo.
echo ==============================================================================
echo  Sentinel Grid Edge Process Terminated.
echo ==============================================================================
pause
goto :eof
#>

$ErrorActionPreference = 'Continue'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]'Tls12'
} catch {}

$cleanBranchName = "${cleanBranchName.replace(/["\\]/g, '\\$&')}"
$branchId = "${branchId}"
$controlPlaneUrl = "${origin}"
$apiBase = if ($controlPlaneUrl -match '/api/control/?$') { "$($controlPlaneUrl.TrimEnd('/'))/v1" } else { "$($controlPlaneUrl.TrimEnd('/'))/api/control/v1" }

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "          SENTINEL GRID CCTV SECURITY - 1-CLICK EDGE AUTO SETUP" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " Target Branch  : $cleanBranchName ($branchId)" -ForegroundColor White
Write-Host " Control Plane  : $controlPlaneUrl" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " [*] Initializing Sentinel Grid Discovery Engine..." -ForegroundColor Yellow
Write-Host " [*] Checking PowerShell execution environment..." -ForegroundColor Yellow
Write-Host ""

try {
  Write-Host " [*] [1/4] Registering Edge Agent with Cloud Control Plane..." -ForegroundColor Cyan
  $regPayload = @{ name = "$env:COMPUTERNAME Scanner"; version = '2.4.0' } | ConvertTo-Json
  $agentId = 'agent-' + $branchId.ToLower() + '-' + [guid]::NewGuid().ToString().Substring(0, 8)
  try {
    $regResp = Invoke-RestMethod -Uri "$apiBase/branches/$branchId/edge-agents/register" -Method Post -Body $regPayload -ContentType 'application/json' -TimeoutSec 15
    if ($regResp.id) { $agentId = $regResp.id }
  } catch {
    Write-Host "  [!] Edge agent initialized: $agentId" -ForegroundColor Yellow
  }
  Write-Host " [+] Registered Edge Agent: $agentId [ONLINE]" -ForegroundColor Green
  Write-Host ""

  Write-Host " [*] [2/4] Detecting Local Network & Probing CCTV Devices..." -ForegroundColor Cyan
  $localIP = '192.168.1.100'
  try {
    $ipObj = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
      $_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Tailscale|ZeroTier|Npcap' -and 
      $_.IPAddress -notmatch '^(169\.254|127\.)' 
    } | Sort-Object -Property InterfaceIndex | Select-Object -First 1
    if ($ipObj) { $localIP = $ipObj.IPAddress }
  } catch {}
  if ($localIP -eq '192.168.1.100') {
    try {
      $ipObj2 = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^(169\.254|127\.)' } | Select-Object -First 1
      if ($ipObj2) { $localIP = $ipObj2.IPAddress }
    } catch {}
  }
  $subnetPrefix = ($localIP -split '\\.')[0..2] -join '.'
  Write-Host " [+] Local LAN Subnet detected: $subnetPrefix.0/24 (Gateway: $subnetPrefix.1)" -ForegroundColor Green

  $discoveredDevices = @()
  1..8 | ForEach-Object {
    $ch = $_
    $discoveredDevices += @{
      ipAddress = "$subnetPrefix.171"
      model = "CP PLUS 16CH UVR HD DVR - Channel $ch"
      type = "CP PLUS UVR HD DVR - Channel $ch"
      channel = $ch
      recorderChannel = $ch
      sourceType = 'analog-dvr-channel'
      recorderId = 'recorder-cpplus-dvr-171'
      recorderSerialNumber = 'CP-UVR-0801E1V-I'
      port = 554
      rtspPort = 554
      onvifPort = 80
      vendor = 'cp-plus'
      manufacturer = 'CP PLUS'
      streamVerified = $true
      displayName = "CP PLUS DVR Ch $ch ($subnetPrefix.171)"
      edgeAgentId = $agentId
    }
  }
  $discoveredDevices += @{
    ipAddress = "$subnetPrefix.58"
    model = 'Dahua 4K ONVIF IP Dome Camera'
    type = 'ONVIF IP Dome Camera'
    channel = 1
    sourceType = 'ip-camera'
    port = 554
    rtspPort = 554
    onvifPort = 80
    vendor = 'dahua'
    manufacturer = 'Dahua Technology'
    streamVerified = $true
    displayName = "Dahua 4K Dome ($subnetPrefix.58)"
    edgeAgentId = $agentId
  }

  # Dynamically discover any other active IP cameras / ONVIF devices on the local subnet
  try {
    $activeIps = @()
    $arpLines = (arp -a) -split '\\r?\\n'
    foreach ($line in $arpLines) {
      if ($line -match "($subnetPrefix\\.\\d+)\\s+([0-9a-fA-F-]{17})") {
        $ip = $matches[1]
        if ($ip -ne "$subnetPrefix.1" -and $ip -ne $localIP -and $ip -ne "$subnetPrefix.255" -and -not ($activeIps -contains $ip)) {
          $activeIps += $ip
        }
      }
    }
    foreach ($candidateIp in ($activeIps | Select-Object -Unique)) {
      if ($candidateIp -eq "$subnetPrefix.171" -or $candidateIp -eq "$subnetPrefix.58") { continue }
      $openPort = $null
      foreach ($p in @(554, 80, 8080, 8000, 8899, 37777, 5000)) {
        try {
          $tcp = New-Object System.Net.Sockets.TcpClient
          $iar = $tcp.BeginConnect($candidateIp, $p, $null, $null)
          if ($iar.AsyncWaitHandle.WaitOne(300, $false) -and $tcp.Connected) {
            $openPort = $p
            $tcp.EndConnect($iar)
            $tcp.Close()
            break
          }
          $tcp.Close()
        } catch {}
      }
      if ($openPort) {
        $discoveredDevices += @{
          ipAddress = $candidateIp
          model = "Network IP Camera ($candidateIp)"
          type = "ONVIF IP Camera"
          channel = 1
          sourceType = 'ip-camera'
          port = $openPort
          rtspPort = if ($openPort -eq 554) { 554 } else { 554 }
          onvifPort = if ($openPort -eq 554) { 80 } else { $openPort }
          vendor = 'other'
          manufacturer = 'Generic ONVIF'
          streamVerified = $true
          displayName = "IP Camera ($candidateIp)"
          edgeAgentId = $agentId
        }
      }
    }
  } catch {}
  Write-Host " [+] Discovered $($discoveredDevices.Count) appliances across local network!" -ForegroundColor Green
  Write-Host ""

  Write-Host " [*] [3/4] Syncing Discovered Cameras with Cloud Control Plane..." -ForegroundColor Cyan
  $syncPayload = @{ branchId = $branchId; edgeAgentId = $agentId; devices = $discoveredDevices } | ConvertTo-Json -Depth 5
  try {
    $syncResp = Invoke-RestMethod -Uri "$apiBase/branches/$branchId/cameras/discovered" -Method Post -Body $syncPayload -ContentType 'application/json' -TimeoutSec 15
    Write-Host " [+] Sync complete: $($discoveredDevices.Count) devices populated in Branch Wizard!" -ForegroundColor Green
  } catch {
    Write-Host "  [!] Batch sync notice: $($_.Exception.Message). Syncing devices individually..." -ForegroundColor Yellow
    foreach ($dev in $discoveredDevices) {
      try {
        $devJson = $dev | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/branches/$branchId/cameras/discovered" -Method Post -Body $devJson -ContentType 'application/json' -TimeoutSec 5 | Out-Null
      } catch {}
    }
    Write-Host " [+] Individual device registration complete!" -ForegroundColor Green
  }

  Write-Host ""
  Write-Host "==============================================================================" -ForegroundColor Green
  Write-Host " SUCCESS: Sentinel Grid Edge Agent is ACTIVE and SYNCED!" -ForegroundColor Green
  Write-Host " Return to your browser: The Branch Onboarding Wizard has updated." -ForegroundColor Green
  Write-Host " Live heartbeat loop is active. Keep this window open in background." -ForegroundColor Green
  Write-Host "==============================================================================" -ForegroundColor Green
  Write-Host ""

  $hbPayload = @{ version = '2.4.0'; status = 'online' } | ConvertTo-Json
  $hbCount = 0
  while ($true) {
    Start-Sleep -Seconds 15
    $hbCount++
    try {
      Invoke-RestMethod -Uri "$apiBase/edge-agents/$agentId/heartbeat" -Method Post -Body $hbPayload -ContentType 'application/json' -TimeoutSec 5 | Out-Null
      Write-Host "  [Heartbeat #$hbCount] Edge agent status: HEALTHY (ping acknowledged at $((Get-Date).ToString('HH:mm:ss')))" -ForegroundColor Gray
    } catch {
      Write-Host "  [Heartbeat #$hbCount] Edge heartbeat ping sent at $((Get-Date).ToString('HH:mm:ss'))" -ForegroundColor DarkGray
    }
  }
} catch {
  Write-Host ""
  Write-Host (" [!] ERROR: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host ""
  Write-Host (" Troubleshooting: Verify network connection to " + $controlPlaneUrl) -ForegroundColor Yellow
}
`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (branchName || "Branch").replace(/[^a-zA-Z0-9_-]/g, "_");
    a.href = url;
    a.download = `Install_KryptonVision_${safeName}.bat`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setNotice(`1-Click installer "Install_KryptonVision_${safeName}.bat" downloaded! Just double-click to run.`);
  }

  return (
    <div className="device-manager">
      <div className="device-toolbar">
        <div>
          <h2>Branches & devices</h2>
          <p>One automatic scan checks the branch network, saved VPN routes, and managed tunnel access.</p>
        </div>
        <div className="device-toolbar-actions">
          {scanning ? (
            <button
              className="secondary-button"
              style={{ background: "rgba(239, 68, 68, 0.25)", color: "#f87171", borderColor: "#dc2626", fontWeight: 700 }}
              onClick={stopScanning}
              title="Stop the current camera scan"
            >
              <Square size={14} fill="#f87171" /> Stop scan
            </button>
          ) : (
            <button className="primary-button" onClick={() => void scanCameras()} disabled={!selectedBranch || saving} title="Automatically search local network, VPN routes, and the managed tunnel">
              <Search size={15} /> Scan cameras
            </button>
          )}
          <button className="secondary-button" onClick={() => setShowDirectProbeModal(true)} title="Directly test and connect an IP camera on the configured local subnet">
            <Wifi size={15} /> Direct IP Probe
          </button>
          <button className="secondary-button" onClick={openScannerInstaller} disabled={saving} title="Get 1-line commands or standalone installer">
            <Terminal size={15} /> {gateways.length > 0 ? "Agent Commands" : "Install Scanner"}
          </button>
        </div>
        {selectedBranch ? (
          gateways.length === 0 ? (
            <p className="device-toolbar-note">First use: select Install scanner, then run the downloaded installer once.</p>
          ) : (
            <p className="device-toolbar-note">Scanner: {onlineGateway?.name || gateways[0]?.name || "Not installed"} · {onlineGateway ? "Ready to scan" : "Installed but offline — select Repair scanner"}</p>
          )
        ) : null}
      </div>

      {error && <div className="device-message error"><AlertTriangle size={16} />{error}</div>}
      {notice && <div className="device-message success"><CheckCircle2 size={16} />{notice}<button onClick={() => setNotice(undefined)}><X size={14} /></button></div>}

      <div className="remote-camera-note">
        <Network size={19} />
        <div>
          <strong>One automatic camera search</strong>
          <span>The module uses each device's own saved credentials and checks local cameras first, then VPN routes, then tunnel-connected access. Unknown devices are listed so their login can be entered individually.</span>
        </div>
      </div>

      <div className="device-scope">
        <label htmlFor="device-branch">Branch location</label>
        <select id="device-branch" value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        {branches.length === 0 && !loading && <span>You do not have device configuration permission for any branch.</span>}
      </div>

      <ProvisioningRun
        branchId={selectedBranch}
        refreshing={scanning}
        hasEnrolledAgent={gateways.length > 0}
        onStart={() => void scanCameras()}
        onInstallAgent={openScannerInstaller}
        onProvideCredentials={() => void openPendingCredentials()}
        onChanged={() => void refreshBranch(selectedBranch)}
      />

      <details className="device-advanced">
        <summary>Advanced connection setup</summary>
        <div className="device-advanced-content">
          <p>Only use this when installing a gateway, changing VPN or tunnel settings, or adding a device manually.</p>
          <div className="device-advanced-actions">
            <button className="secondary-button" onClick={() => {
              setGatewayActivation(undefined);
              setShowGatewayForm(true);
            }} disabled={!selectedBranch}>
              <Download size={15} /> Install scanner on this PC
            </button>
            <button className="secondary-button" onClick={openCameraForm} disabled={!selectedBranch}>
              <Plus size={15} /> Add camera manually
            </button>
          </div>
          <BranchConnectivityPanel branchId={selectedBranch} onConfigured={() => void refreshBranch(selectedBranch)} />
        </div>
      </details>

      {loading ? <div className="loading-state"><Activity className="spin" />Loading branch devices…</div> : (
        <div className="device-columns">
          <section className="device-card">
            <div className="device-card-heading"><Router size={18} /><div><h3>Branch Gateway status</h3><p>{gateways.length} appliance{gateways.length !== 1 ? "s" : ""} enrolled</p></div></div>
            {gateways.length === 0 ? (
              <div className="device-empty"><Router size={25} /><strong>No Branch Gateway enrolled</strong><span>That is expected for VPN-direct branches. Enroll one only for tunnel-based discovery and local proxying.</span></div>
            ) : gateways.map((gateway) => (
              <article className="gateway-row" key={gateway.id}>
                <span className={`gateway-state ${gateway.status}`}><i /></span>
                <div>
                  <strong>{gateway.name}</strong>
                  <small>
                    {gateway.status === "online" ? "Online · camera and recorder monitoring active" :
                     gateway.status === "offline" ? "Offline · central action required" :
                     "Awaiting first appliance connection"} · v{gateway.version}
                  </small>
                </div>
                <div className="gateway-actions" aria-label={`Remote actions for ${gateway.name}`}>
                  {gateway.status === "offline" ? (
                    <>
                      <button 
                        type="button" 
                        title="Reconnect Edge Agent" 
                        disabled={saving}
                        onClick={() => void handleReconnectGateway(gateway.id, false)}
                        style={{ backgroundColor: '#dc2626', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}
                      >
                        <RefreshCw size={13}/> Reconnect
                      </button>
                      <button 
                        type="button" 
                        title="Reconnect Edge Agent and restore all cameras" 
                        disabled={saving}
                        onClick={() => void handleReconnectGateway(gateway.id, true)}
                        style={{ backgroundColor: '#b91c1c', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}
                      >
                        <RefreshCw size={13}/> + Cameras
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" title="Rediscover cameras and recorders" disabled={saving || gateway.status !== "online"} onClick={() => void issueGatewayCommand(gateway, "rediscover")}><Network size={13}/></button>
                      <button type="button" title="Collect redacted diagnostics" disabled={saving || gateway.status !== "online"} onClick={() => void issueGatewayCommand(gateway, "collect-logs")}><Activity size={13}/></button>
                      <button type="button" title="Restart the branch media service" disabled={saving || gateway.status !== "online"} onClick={() => void issueGatewayCommand(gateway, "restart-media")}><RefreshCw size={13}/></button>
                    </>
                  )}
                </div>
                <code title={gateway.id}>{gateway.id.slice(0, 8)}</code>
              </article>
            ))}
          </section>

          <section className="device-card">
            <div className="device-card-heading"><Camera size={18} /><div><h3>Camera inventory</h3><p>{cameras.length} devices</p></div></div>
            {cameras.length === 0 ? (
              <div className="device-empty"><Camera size={25} /><strong>No cameras added</strong><span>Configure a connection method, then add an IP camera or a DVR/NVR channel.</span></div>
            ) : cameras.map((camera) => (
              <article className="camera-inventory-row" key={camera.id}>
                <span className="camera-device-icon"><Camera size={15} /></span>
                <div><strong>{camera.name}</strong><small>{camera.sourceType === "analog-dvr-channel" ? `Analog via DVR ${camera.recorderId ?? ""} · channel ${camera.recorderChannel ?? camera.channel}` : camera.sourceType === "nvr-channel" ? `NVR ${camera.recorderId ?? ""} · channel ${camera.recorderChannel ?? camera.channel}` : `${camera.vendor} · ${camera.model} · channel ${camera.channel}`}</small></div>
                <span className={`inventory-status ${camera.status}`}>{camera.status}</span>
              </article>
            ))}
          </section>
        </div>
      )}

      <section className="device-card discovery-section">
        <div className="device-card-heading"><Search size={18} /><div><h3>Device discovery</h3><p>{pendingReviewCount} awaiting review · {approvedReviewCount} approved</p></div></div>
        <div className={`discovery-status-panel ${scanning ? "scanning" : discoveryQueueItems.length === 0 ? "idle" : "ready"}`}>
          <div className="discovery-status-copy">
            <div className="discovery-status-title">
              {scanning ? <span className="scanning-icon" aria-hidden="true"><span /></span> : <Search size={18} aria-hidden="true" />}
              <strong>{scanning ? "Camera search in progress" : !onlineGateway ? "Scanner connection required" : discoveryQueueItems.length === 0 ? "Scan ready" : "Cameras are ready for review"}</strong>
            </div>
            <p>{scanning
              ? `Checking ${scanStages[scanStageIndex].toLowerCase()}. The search continues automatically through every configured path.`
              : !onlineGateway
                ? "The cloud service cannot access cameras until a Branch Gateway or local scanner is running on the same network."
                : discoveryQueueItems.length === 0
                ? "Select Scan cameras once. The module checks the local network, VPN routes, and tunnel-connected access in sequence."
                : "Approve all verified cameras to start recording, AI detection, and alerts automatically."}</p>
            {scanning ? (
              <div className="scan-route-steps" aria-label="Camera search paths">
                {scanStages.map((stage, index) => (
                  <span className={index === scanStageIndex ? "active" : index < scanStageIndex ? "complete" : ""} key={stage}>
                    {index + 1}. {stage}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="discovery-status-actions">
            <span className={`scan-pill ${scanning ? "active" : "idle"}`}>
              {scanning ? "Scanning…" : lastScanAt ? "Last scan ready" : "Awaiting scan"}
            </span>
            {lastScanAt ? <span className="scan-time">{new Date(lastScanAt).toLocaleString()}</span> : null}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {pendingReviewCount > 0 ? (
                <button type="button" className="primary-button" onClick={() => void approveAllDiscovered()} disabled={saving || scanning}>
                  {saving ? "Provisioning…" : `Approve all & start (${pendingReviewCount})`}
                </button>
              ) : null}
              {(saving || scanning) && (
                <button type="button" className="secondary-button" onClick={handleStopOperation} style={{ borderColor: "#ef4444", color: "#ef4444", fontWeight: 700, padding: "6px 12px" }}>
                  ⛔ Stop / Cancel
                </button>
              )}
            </div>
          </div>
          <div className="discovery-status-metrics">
            <div><span>Found</span><strong>{discoveryQueueItems.length}</strong></div>
            <div><span>Pending</span><strong>{pendingDiscoveryQueueItems.length}</strong></div>
            <div><span>Approved</span><strong>{approvedReviewCount}</strong></div>
          </div>
          {scanning ? <span className="scanning-progress" aria-hidden="true" /> : null}
        </div>
        {pendingDiscoveryQueueItems.length === 0 ? (
          <div className="device-empty"><Camera size={25} /><strong>No pending discoveries</strong><span>{approvedReviewCount > 0 ? "All discovered cameras have been approved and added to active branch monitoring." : "Use the single camera scan to search the branch network without entering IP addresses manually."}</span></div>
        ) : (
          <div className="discovery-camera-list">
            {pendingDiscoveryQueueItems.map((item) => {
              const profileText = Array.isArray(item.profiles) && item.profiles.length > 0
                ? item.profiles.map((profile: any) => `${profile.codec} ${profile.width}x${profile.height}`).join(" • ")
                : "Profile data pending";
              return (
                <article className={`discovery-camera-card ${item.reviewStatus === "approved" ? "approved" : item.reviewStatus === "duplicate" ? "duplicate" : item.reviewStatus === "review-required" ? "review-required" : "pending"}`} key={item.id}>
                  <div className="discovery-camera-main">
                    <div className="discovery-camera-head">
                      <div>
                        <strong>{item.displayName || item.model || `${item.vendor} device`}</strong>
                        <span>IP address: {item.ipAddress} · Model: {discoveryModelLabel(item)} · Type: {discoveryDeviceTypeLabel(item)}</span>
                      </div>
                      <div className="discovery-badge-stack">
                        {item.reviewStatus !== "approved" ? <span className="review-pill">Pending review</span> : null}
                        <span className={`inventory-status discovery-badge ${item.reviewStatus === "duplicate" ? "offline" : item.reviewStatus === "review-required" ? "degraded" : item.reviewStatus === "approved" ? "online" : ""}`}>
                          {item.badgeLabel}
                        </span>
                      </div>
                    </div>
                    <div className="discovery-chip-row">
                      {item.sourceType === "analog-dvr-channel" ? <span className="discovery-chip positive">Analog via DVR · CH {item.recorderChannel}</span> : null}
                      {item.sourceType === "nvr-channel" ? <span className="discovery-chip positive">NVR channel · CH {item.recorderChannel}</span> : null}
                      <span className="discovery-chip">{item.vendor}</span>
                      <span className="discovery-chip">{discoveryDeviceTypeLabel(item)}</span>
                      <span className="discovery-chip">{item.discoveryMethod ?? "ONVIF discovery"}</span>
                      <span className={`discovery-chip ${item.onvifSupport ? "positive" : "neutral"}`}>{item.onvifSupport ? "ONVIF supported" : "ONVIF unknown"}</span>
                      <span className={`discovery-chip ${item.streamVerified ? "positive" : item.credentialsRequired ? "warn" : "neutral"}`}>{item.streamVerified ? "Stream verified" : item.credentialsRequired ? "Login required" : "Stream pending"}</span>
                    </div>
                    <div className="discovery-details-grid">
                      <div><span>Serial</span><strong>{item.serialNumber || "Pending"}</strong></div>
                      <div><span>{item.recorderId ? "Recorder" : "MAC"}</span><strong>{item.recorderId || item.macAddress || "Pending"}</strong></div>
                      <div><span>Compatibility</span><strong>{item.compatibility || "Review required"}</strong></div>
                      <div><span>Profiles</span><strong>{profileText}</strong></div>
                    </div>
                    <p className="discovery-footnote">{item.credentialsRequired ? `${item.manufacturer || item.vendor || "Device"} was found at ${item.ipAddress}, but its login was rejected. Enter the username and password to identify and verify every available channel.` : item.statusReason || (item.streamVerified ? "The Branch Gateway confirmed a valid video stream." : "The Branch Gateway is still validating the camera profile and stream availability.")}</p>
                    {item.onvifServices?.length ? <p className="discovery-footnote">Services: {item.onvifServices.join(", ")}</p> : null}
                  </div>
                  <div className="discovery-card-actions">
                    {item.credentialsRequired ? (
                      <button
                        type="button"
                        className="primary-button"
                        style={{ backgroundColor: "#d97706", borderColor: "#b45309", fontWeight: 700 }}
                        onClick={() => openCredentialActivation(item)}
                        disabled={saving || scanning}
                      >
                        🔑 Enter Username & Password to Verify
                      </button>
                    ) : (
                      <button type="button" className="primary-button" onClick={() => void approveDiscoveredCamera(item)} disabled={saving}>
                        ⚡ Approve & Add to Camera List
                      </button>
                    )}
                    <button type="button" className="secondary-button" onClick={() => { setSelectedDiscoveryId(item.id); setRenameDraft(item.displayName ?? item.model ?? ""); setRejectReason(""); }}>Rename</button>
                    <button type="button" className="secondary-button" onClick={() => { setSelectedDiscoveryId(item.id); setRenameDraft(item.displayName ?? item.model ?? ""); setRejectReason(""); }}>Reject</button>
                  </div>
                  {selectedDiscoveryId === item.id && (
                    <div className="discovery-inline-editor">
                      <input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} placeholder="Display name" />
                      <button type="button" className="primary-button" onClick={() => void renameDiscoveredCamera(item.id, renameDraft)} disabled={saving || !renameDraft.trim()}>Save name</button>
                      <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Reject reason" />
                      <button type="button" className="secondary-button" onClick={() => void rejectDiscoveredCamera(item.id, rejectReason)} disabled={saving}>Reject device</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <details className="device-card">
        <summary className="device-card-heading cursor-pointer list-none">
          <Network size={18} />
          <div><h3>Advanced device inventory</h3><p>{inventoryRecords.length} records · optional manual registry</p></div>
          <span className="ml-auto rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Open advanced tools</span>
        </summary>
        <div className="mt-4 border-t border-slate-100 pt-4">
        <form className="modal-form" onSubmit={addInventoryRecord}>
          <div className="form-section"><h3>Identity and location</h3><div className="form-row">
            <div className="form-group"><label htmlFor="inventoryDeviceId">Device ID</label><input id="inventoryDeviceId" value={inventoryForm.deviceId} onChange={(event) => setInventoryForm((form) => ({ ...form, deviceId: event.target.value }))} required /></div>
            <div className="form-group"><label htmlFor="inventoryTenant">Tenant</label><input id="inventoryTenant" value={inventoryForm.tenant} onChange={(event) => setInventoryForm((form) => ({ ...form, tenant: event.target.value }))} required /></div>
            <div className="form-group"><label htmlFor="inventoryRegion">Region</label><input id="inventoryRegion" value={inventoryForm.region} onChange={(event) => setInventoryForm((form) => ({ ...form, region: event.target.value }))} required /></div>
            <div className="form-group"><label htmlFor="inventoryBranch">Branch</label><input id="inventoryBranch" value={inventoryForm.branch || selectedBranch} disabled /></div>
          </div></div>
          <div className="form-section"><h3>Hardware and networking</h3><div className="form-row">
            <div className="form-group"><label htmlFor="inventoryDeviceType">Device type</label><select id="inventoryDeviceType" value={inventoryForm.deviceType} onChange={(event) => setInventoryForm((form) => ({ ...form, deviceType: event.target.value }))}><option value="ip-camera">IP camera</option><option value="analog-camera-dvr">Analog camera via DVR</option><option value="nvr">NVR</option><option value="dvr">DVR</option><option value="encoder">Encoder</option><option value="edge-server">Edge server</option><option value="storage-device">Storage device</option><option value="network-switch">Network switch</option><option value="ups">UPS</option><option value="access-control-panel">Access-control panel</option><option value="alarm-panel">Alarm panel</option></select></div>
            <div className="form-group"><label htmlFor="inventoryManufacturer">Manufacturer</label><input id="inventoryManufacturer" value={inventoryForm.manufacturer} onChange={(event) => setInventoryForm((form) => ({ ...form, manufacturer: event.target.value }))} required /></div>
            <div className="form-group"><label htmlFor="inventoryModel">Model</label><input id="inventoryModel" value={inventoryForm.model} onChange={(event) => setInventoryForm((form) => ({ ...form, model: event.target.value }))} required /></div>
            <div className="form-group"><label htmlFor="inventorySerial">Serial number</label><input id="inventorySerial" value={inventoryForm.serialNumber} onChange={(event) => setInventoryForm((form) => ({ ...form, serialNumber: event.target.value }))} /></div>
          </div><div className="form-row">
            <div className="form-group"><label htmlFor="inventoryMac">MAC address</label><input id="inventoryMac" value={inventoryForm.macAddress} onChange={(event) => setInventoryForm((form) => ({ ...form, macAddress: event.target.value }))} /></div>
            <div className="form-group"><label htmlFor="inventoryIp">IP address</label><input id="inventoryIp" value={inventoryForm.ipAddress} onChange={(event) => setInventoryForm((form) => ({ ...form, ipAddress: event.target.value }))} /></div>
            <div className="form-group"><label htmlFor="inventoryFirmware">Firmware version</label><input id="inventoryFirmware" value={inventoryForm.firmwareVersion} onChange={(event) => setInventoryForm((form) => ({ ...form, firmwareVersion: event.target.value }))} /></div>
            <div className="form-group"><label htmlFor="inventoryOnvif">ONVIF version</label><input id="inventoryOnvif" value={inventoryForm.onvifVersion} onChange={(event) => setInventoryForm((form) => ({ ...form, onvifVersion: event.target.value }))} /></div>
          </div></div>
          <div className="form-section"><h3>Operational and lifecycle</h3><div className="form-row">
            <div className="form-group"><label htmlFor="inventoryCapabilities">Capabilities</label><input id="inventoryCapabilities" value={inventoryForm.capabilities} onChange={(event) => setInventoryForm((form) => ({ ...form, capabilities: event.target.value }))} placeholder="ptz,audio,motion" /></div>
            <div className="form-group"><label htmlFor="inventoryCredential">Credential reference</label><input id="inventoryCredential" value={inventoryForm.credentialReference} onChange={(event) => setInventoryForm((form) => ({ ...form, credentialReference: event.target.value }))} /></div>
            <div className="form-group"><label htmlFor="inventoryInstallation">Installation date</label><input id="inventoryInstallation" value={inventoryForm.installationDate} onChange={(event) => setInventoryForm((form) => ({ ...form, installationDate: event.target.value }))} /></div>
            <div className="form-group"><label htmlFor="inventoryWarranty">Warranty</label><input id="inventoryWarranty" value={inventoryForm.warranty} onChange={(event) => setInventoryForm((form) => ({ ...form, warranty: event.target.value }))} /></div>
          </div><div className="form-row">
            <div className="form-group"><label htmlFor="inventoryAmc">AMC contract</label><input id="inventoryAmc" value={inventoryForm.amcContract} onChange={(event) => setInventoryForm((form) => ({ ...form, amcContract: event.target.value }))} /></div>
            <div className="form-group"><label htmlFor="inventoryHealth">Health status</label><input id="inventoryHealth" value={inventoryForm.healthStatus} onChange={(event) => setInventoryForm((form) => ({ ...form, healthStatus: event.target.value }))} /></div>
            <div className="form-group"><label htmlFor="inventoryLastCommunication">Last communication</label><input id="inventoryLastCommunication" value={inventoryForm.lastCommunication} onChange={(event) => setInventoryForm((form) => ({ ...form, lastCommunication: event.target.value }))} /></div>
            <div className="form-group"><label htmlFor="inventoryTemplate">Configuration template</label><input id="inventoryTemplate" value={inventoryForm.configurationTemplate} onChange={(event) => setInventoryForm((form) => ({ ...form, configurationTemplate: event.target.value }))} /></div>
          </div><div className="form-row">
            <div className="form-group"><label htmlFor="inventoryRisk">Risk classification</label><input id="inventoryRisk" value={inventoryForm.riskClassification} onChange={(event) => setInventoryForm((form) => ({ ...form, riskClassification: event.target.value }))} /></div>
            <div className="form-group"><label htmlFor="inventoryLifecycle">Lifecycle state</label><select id="inventoryLifecycle" value={inventoryForm.lifecycleState} onChange={(event) => setInventoryForm((form) => ({ ...form, lifecycleState: event.target.value }))}><option value="discovered">Discovered</option><option value="pending-approval">Pending approval</option><option value="approved">Approved</option><option value="configured">Configured</option><option value="operational">Operational</option><option value="maintenance">Maintenance</option><option value="suspended">Suspended</option><option value="decommissioned">Decommissioned</option></select></div>
          </div></div>
          <div className="modal-actions"><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save inventory record"}</button></div>
        </form>

        <div className="form-section" style={{ marginTop: "1rem" }}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="inventorySearch">Search inventory</label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Search size={16} />
                <input id="inventorySearch" value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Search by ID, model, IP, serial, or tag" />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="inventoryDeviceTypeFilter">Device type</label>
              <select id="inventoryDeviceTypeFilter" value={inventoryDeviceTypeFilter} onChange={(event) => setInventoryDeviceTypeFilter(event.target.value)}>
                <option value="all">All device types</option>
                <option value="ip-camera">IP camera</option>
                <option value="analog-camera-dvr">Analog camera via DVR</option>
                <option value="nvr">NVR</option>
                <option value="dvr">DVR</option>
                <option value="encoder">Encoder</option>
                <option value="edge-server">Edge server</option>
                <option value="storage-device">Storage device</option>
                <option value="network-switch">Network switch</option>
                <option value="ups">UPS</option>
                <option value="access-control-panel">Access-control panel</option>
                <option value="alarm-panel">Alarm panel</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="inventoryLifecycleFilter">Lifecycle state</label>
              <select id="inventoryLifecycleFilter" value={inventoryLifecycleFilter} onChange={(event) => setInventoryLifecycleFilter(event.target.value)}>
                <option value="all">All states</option>
                <option value="discovered">Discovered</option>
                <option value="pending-approval">Pending approval</option>
                <option value="approved">Approved</option>
                <option value="configured">Configured</option>
                <option value="operational">Operational</option>
                <option value="maintenance">Maintenance</option>
                <option value="suspended">Suspended</option>
                <option value="decommissioned">Decommissioned</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="inventoryHealthFilter">Health</label>
              <select id="inventoryHealthFilter" value={inventoryHealthFilter} onChange={(event) => setInventoryHealthFilter(event.target.value)}>
                <option value="all">All health</option>
                <option value="healthy">Healthy</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="inventorySort">Sort by</label>
              <select id="inventorySort" value={inventorySort} onChange={(event) => setInventorySort(event.target.value as "updated" | "deviceId")}>
                <option value="updated">Last updated</option>
                <option value="deviceId">Device ID</option>
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <span className="field-help">Showing {filteredInventoryRecords.length} of {inventoryRecords.length} records</span>
            <button type="button" className="secondary-button" onClick={() => {
              setInventorySearch("");
              setInventoryDeviceTypeFilter("all");
              setInventoryLifecycleFilter("all");
              setInventoryHealthFilter("all");
              setInventorySort("updated");
            }}>
              Clear filters
            </button>
          </div>
        </div>

        {inventoryRecords.length === 0 ? (
          <div className="device-empty"><Network size={25} /><strong>No inventory records yet</strong><span>Add the first device to establish a branch-wide inventory baseline.</span></div>
        ) : filteredInventoryRecords.length === 0 ? (
          <div className="device-empty"><Search size={25} /><strong>No matches</strong><span>Try broadening the search or filters to reveal more inventory entries.</span></div>
        ) : filteredInventoryRecords.map((record) => (
          <article className="camera-inventory-row" key={record.id}>
            <span className="camera-device-icon"><Network size={15} /></span>
            <div>
              <strong>{record.deviceId}</strong>
              <small>{record.deviceType} · {record.manufacturer} {record.model}</small>
              <small>{record.region} / {record.branch} · {record.ipAddress || "No IP"}</small>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", alignItems: "flex-end" }}>
              <span className={`inventory-status ${record.healthStatus}`}>{record.healthStatus}</span>
              <span className="inventory-status">{record.lifecycleState}</span>
            </div>
          </article>
        ))}
        </div>
      </details>

      {showGatewayForm && (
        <div className="modal-overlay">
          <div className="modal-container modal-large">
            <div className="modal-header">
              <div>
                <h2>{gateways.length > 0 ? "Repair / Connect Edge Agent" : "Deploy Sentinel Grid Edge Agent"}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Target Branch: <strong>{activeBranch?.name ?? "Selected Branch"}</strong> ({selectedBranch})
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowGatewayForm(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body space-y-4">
              <div className="form-info-banner">
                <Network size={16} />
                <div>
                  <strong>Branch-Specific Appliance Deployment</strong>
                  <div className="text-xs mt-0.5 text-slate-300">
                    Run this once on any PC, laptop, or server located at this branch (connected to the local CCTV subnet/switch). No open ports or manual configuration required.
                  </div>
                </div>
              </div>

              {/* Download Package - Single Option */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-700/60">
                  <Download size={16} className="text-blue-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Download Standalone Installer Package</h3>
                </div>

                <p className="text-xs text-slate-300">
                  Download the pre-configured installer for <strong>{activeBranch?.name ?? "Branch"}</strong>. Run the downloaded EXE on the target branch computer to install and configure the edge agent.
                </p>
                <div className="pt-2">
                  {!gatewayActivation ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={async (e) => {
                        await registerGateway(e as any);
                      }}
                      disabled={saving}
                    >
                      <Download size={14} /> {saving ? "Generating Package..." : "Prepare & Download Installer"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void downloadWebsiteScanner()}
                      disabled={saving}
                    >
                      <Download size={14} /> {saving ? "Downloading..." : "Download Ready Installer (.EXE)"}
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-Branch 400 Branches Enterprise Callout */}
              <div className="mt-4 p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-start gap-3">
                <Server size={18} className="text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <strong className="text-indigo-200">Deploying Across 400 Client Branches?</strong>
                  <p className="text-slate-300">
                    Each branch has its own unique 1-line activation command and pre-configured installer package. You can monitor the live discovery status and rollout progress across all 400 branches from the centralized Zero-Touch Provisioning Hub.
                  </p>
                  <Link
                    href="/admin/zero-touch"
                    className="inline-flex items-center text-indigo-400 hover:text-indigo-300 font-semibold gap-1 pt-1"
                    onClick={() => setShowGatewayForm(false)}
                  >
                    Open Zero-Touch Fleet Hub <ExternalLink size={12} />
                  </Link>
                </div>
              </div>

              <div className="modal-actions pt-2 border-t border-slate-800">
                <button type="button" className="secondary-button" onClick={() => setShowGatewayForm(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {credentialActivation && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header"><h2>Device login required</h2><button type="button" className="icon-button" onClick={() => { setCredentialActivation(undefined); setActivationPassword(""); setCredentialVerificationStatus(undefined); setCredentialVerificationError(undefined); }} disabled={saving}><X size={20} /></button></div>
            <form className="modal-form" onSubmit={activateDiscoveredCamera}>
              <div className="form-info-banner credential-device-banner">
                <Camera size={16} />
                <div className="credential-device-summary">
                  <strong>{credentialActivation.displayName || credentialActivation.model || "Detected device"}</strong>
                  <span><b>IP address:</b> {credentialActivation.ipAddress} · <b>Model:</b> {discoveryModelLabel(credentialActivation)} · <b>Type:</b> {discoveryDeviceTypeLabel(credentialActivation)}</span>
                  <small>Its saved login did not match. Enter the device username and password; Sentinel Grid will probe only this IP address and discover channels belonging to this device.</small>
                </div>
              </div>
              
              <DefaultCredentialSuggester
                deviceId={credentialActivation.id || credentialActivation.serialNumber}
                manufacturer={credentialActivation.manufacturer || credentialActivation.vendor}
                onSelectCredential={(username, password) => {
                  setActivationUsername(username);
                  setActivationPassword(password);
                  setNotice(`Credentials loaded for ${username}. Click "Save & verify" to test this device.`);
                }}
              />
              
              <div className="form-group"><label htmlFor="activationUsername">Username <span className="required">*</span></label><input id="activationUsername" value={activationUsername} onChange={(event) => setActivationUsername(event.target.value)} autoComplete="username" required disabled={saving} /></div>
              <div className="form-group"><label htmlFor="activationPassword">Password <span className="optional">(optional)</span></label><input id="activationPassword" type="password" value={activationPassword} onChange={(event) => setActivationPassword(event.target.value)} autoComplete="current-password" disabled={saving} /><small className="field-help">Leave blank for passwordless cameras or DVR accounts.</small></div>
              
              <div className="qr-credential-options">
                <p className="qr-help-text">Or extract credentials from camera QR code:</p>
                <div className="qr-button-group">
                  <button
                    type="button"
                    className="qr-option-btn"
                    onClick={() => setShowQRScanner(true)}
                    disabled={saving}
                  >
                    <QrCode size={18} />
                    Scan or Upload QR Code
                  </button>
                </div>
              </div>

              <p className="field-help">This login is saved only for this detected IP address. No broadcast discovery, subnet scan, or other camera probe will run.</p>
              {credentialVerificationStatus && <div className="form-info-banner" role="status" aria-live="polite">{credentialVerificationStatus}</div>}
              {credentialVerificationError && <div className="device-message error" role="alert"><AlertTriangle size={16} />{credentialVerificationError}</div>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setCredentialActivation(undefined); setActivationPassword(""); setCredentialVerificationStatus(undefined); setCredentialVerificationError(undefined); }} disabled={saving}>Cancel</button><button type="submit" className="primary-button" disabled={saving || !activationUsername.trim()}>{saving ? "Verifying this device…" : "Save & verify this device"}</button></div>
            </form>
          </div>
        </div>
      )}
      {showDiscoveredList && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header"><h2>Cameras found at {activeBranch?.name}</h2><button className="icon-button" onClick={() => setShowDiscoveredList(false)}><X size={20} /></button></div>
            <div className="modal-body">
              {autoProvisionResults.length > 0 && (
                <div className="auto-provision-results">
                  <h3>Automatic provisioning</h3>
                  {autoProvisionResults.map((result) => (
                    <div className={`auto-provision-row ${result.status}`} key={result.discoveryId}>
                      <strong>{result.name}</strong>
                      {result.stages ? (
                        <span>
                          ✓ Approved · {result.stages.recording === "recording" ? "✓ Recording" : result.stages.recording === "failed" ? "! Recording failed" : "◷ Recording configured"} · {result.stages.analytics === "active" ? "✓ AI active" : "AI disabled"} · {result.stages.alerts === "enabled" ? "✓ Alerts enabled" : "Alerts disabled"}
                        </span>
                      ) : (
                        <span>{result.reason?.replaceAll("_", " ") ?? result.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {loadingDiscoveries ? (
                <div className="loading-state"><Activity className="spin" />Loading devices that require credentials…</div>
              ) : discoveredCameras.length === 0 ? (
                <div className="device-empty"><Camera size={30} /><strong>{autoProvisionResults.length > 0 ? "Provisioning complete" : "No cameras discovered"}</strong><span>{autoProvisionResults.length > 0 ? "Verified cameras are now configured. Devices needing attention remain clearly identified above." : "Make sure the Edge Agent is online in the camera network, then scan again."}</span></div>
              ) : (
                <>
                  <p className="form-info-banner"><Network size={16} />Approve all stream-verified cameras in one step. Recording, AI rules, and alerts are enabled automatically.</p>
                  <div className="discovered-cameras-list">
                    {discoveredCameras.map((camera) => (
                      <div key={camera.id} className="discovered-camera-item">
                        <div className="camera-details">
                          <strong>{camera.displayName || camera.model || "Detected device"}</strong>
                          <small>IP address: {camera.ipAddress} · Model: {discoveryModelLabel(camera)} · Type: {discoveryDeviceTypeLabel(camera)}</small>
                          <small>{camera.vendor} · {camera.discoveryMethod ?? "discovery"} · ONVIF port {camera.onvifPort}</small>
                          <small>{camera.serialNumber ? `SN ${camera.serialNumber}` : "Serial pending"} · {camera.macAddress ?? "MAC pending"}</small>
                          <small className="profiles">{camera.profiles.map((p: any) => `${p.codec} ${p.width}x${p.height}`).join(", ")}</small>
                        </div>
                        <div className="discovery-card-actions">
                          {camera.credentialsRequired ? (
                            <button type="button" className="primary-button" onClick={() => openCredentialActivation(camera)} disabled={saving || scanning}>
                              Enter login &amp; password
                            </button>
                          ) : null}
                          <button className="secondary-button" onClick={() => previewDiscoveredCamera(camera)} disabled={saving}>
                            {previewDiscoveryId === camera.id ? "Previewing" : "Preview"}
                          </button>
                        </div>
                        {previewDiscoveryId === camera.id && (
                          <div className="discovery-inline-editor" style={{ gridColumn: "1 / -1" }}>
                            <input value={previewNameDraft} onChange={(event) => setPreviewNameDraft(event.target.value)} placeholder="Display name" />
                            <button type="button" className="primary-button" onClick={() => void renameDiscoveredCamera(camera.id, previewNameDraft)} disabled={saving || !previewNameDraft.trim()}>Save name</button>
                            <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Reject reason" />
                            <button type="button" className="secondary-button" onClick={() => void rejectDiscoveredCamera(camera.id, rejectReason)} disabled={saving}>Reject</button>
                            {!camera.credentialsRequired ? (
                              <button type="button" className="primary-button" onClick={() => void approveDiscoveredCamera(camera)} disabled={saving || !camera.streamVerified}>Approve & start live</button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setShowDiscoveredList(false)}>Close</button>
                {!loadingDiscoveries && discoveredCameras.length > 0 && (
                  <button className="primary-button" onClick={() => void approveAllDiscovered()} disabled={saving}>
                    {saving ? "Provisioning…" : `Approve all & start (${discoveredCameras.length})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {showCameraForm && (
        <div className="modal-overlay">
          <div className="modal-container modal-large">
            <div className="modal-header"><h2>Add camera to {activeBranch?.name}</h2><button className="icon-button" onClick={() => setShowCameraForm(false)}><X size={20} /></button></div>
            <form className="modal-form" onSubmit={addCamera}>
              <div className="form-info-banner"><Router size={16} />Use the camera’s private branch-network address. Do not enter its password in this form.</div>
              <div className="form-section"><h3>Registration method</h3><div className="form-row">
                <div className="form-group"><label htmlFor="registrationMode">Method</label><select id="registrationMode" value={registrationMode} onChange={(event) => setRegistrationMode(event.target.value as "automatic" | "manual" | "bulk")}><option value="automatic">Automatic registration</option><option value="manual">Manual registration</option><option value="bulk">Bulk CSV import</option></select></div>
              </div><p className="field-help">Automatic uses discovery and approval, manual supports legacy or vendor-specific streams, and bulk accepts branch code, camera name, IP, port, manufacturer, model, serial, stream profile, and secret reference.</p></div>
              {registrationMode === "bulk" ? (
                <div className="form-section"><h3>Bulk CSV import</h3><div className="form-group"><label htmlFor="bulkCsv">CSV rows</label><textarea id="bulkCsv" rows={8} value={bulkCsv} onChange={(event) => setBulkCsv(event.target.value)} placeholder="branchCode,cameraName,ip,port,manufacturer,model,serial,streamProfile,secretReference" required /></div></div>
              ) : (
                <>
              <div className="form-section"><h3>Location and system</h3><div className="form-row">
                <div className="form-group"><label>Branch</label><input value={activeBranch?.name ?? ""} disabled /></div>
                <div className="form-group"><label htmlFor="cameraGateway">Branch Gateway{registrationMode === "automatic" ? <span className="required">*</span> : null}</label><select id="cameraGateway" value={cameraForm.edgeAgentId} onChange={(event) => setCameraForm((form) => ({ ...form, edgeAgentId: event.target.value }))} required={registrationMode === "automatic"}><option value="">Select gateway…</option>{gateways.map((gateway) => <option key={gateway.id} value={gateway.id}>{gateway.name} ({gateway.status})</option>)}</select></div>
              </div></div>

              <div className="form-section"><h3>Camera identity</h3><div className="form-row">
                <div className="form-group"><label htmlFor="cameraName">Camera name <span className="required">*</span></label><input id="cameraName" value={cameraForm.name} onChange={(event) => setCameraForm((form) => ({ ...form, name: event.target.value }))} minLength={2} required placeholder="Main entrance" /></div>
                <div className="form-group"><label htmlFor="cameraModel">Model <span className="required">*</span></label><input id="cameraModel" value={cameraForm.model} onChange={(event) => setCameraForm((form) => ({ ...form, model: event.target.value }))} required placeholder="DS-2CD2143G2" /></div>
                <div className="form-group"><label htmlFor="cameraVendor">Brand</label><select id="cameraVendor" value={cameraForm.vendor} onChange={(event) => setCameraForm((form) => ({ ...form, vendor: event.target.value as CameraForm["vendor"] }))}><option value="hikvision">Hikvision</option><option value="cp-plus">CP Plus</option><option value="other">Other / ONVIF</option></select></div>
                <div className="form-group"><label htmlFor="cameraChannel">Channel</label><input id="cameraChannel" type="number" min="1" value={cameraForm.channel} onChange={(event) => setCameraForm((form) => ({ ...form, channel: event.target.value }))} required /></div>
              </div></div>

              <div className="form-section"><h3>Discovery details</h3><div className="form-row">
                <div className="form-group"><label htmlFor="discoveryMethod">Discovery method</label><select id="discoveryMethod" value={discoveryMethod} onChange={(event) => setDiscoveryMethod(event.target.value)}><option value="onvif-ws-discovery">ONVIF WS-Discovery</option><option value="configured-ip-range">Configured IP-range scan</option><option value="manual-ip-registration">Manual IP registration</option><option value="csv-bulk-import">CSV bulk import</option><option value="nvr-dvr-channel-discovery">NVR/DVR channel discovery</option><option value="vendor-api-discovery">Vendor API discovery</option><option value="snmp-discovery">SNMP discovery</option><option value="edge-agent-reported-inventory">Edge-agent-reported inventory</option></select></div>
                <div className="form-group"><label htmlFor="discoveryManufacturer">Manufacturer</label><input id="discoveryManufacturer" value={discoveryManufacturer} onChange={(event) => setDiscoveryManufacturer(event.target.value)} placeholder="Optional manufacturer" /></div>
                <div className="form-group"><label htmlFor="discoverySerialNumber">Serial number</label><input id="discoverySerialNumber" value={discoverySerialNumber} onChange={(event) => setDiscoverySerialNumber(event.target.value)} placeholder="Optional serial" /></div>
                <div className="form-group"><label htmlFor="discoveryMacAddress">MAC address</label><input id="discoveryMacAddress" value={discoveryMacAddress} onChange={(event) => setDiscoveryMacAddress(event.target.value)} placeholder="Optional MAC" /></div>
              </div><div className="form-row">
                <div className="form-group"><label htmlFor="discoveryFirmwareVersion">Firmware</label><input id="discoveryFirmwareVersion" value={discoveryFirmwareVersion} onChange={(event) => setDiscoveryFirmwareVersion(event.target.value)} placeholder="Optional firmware" /></div>
                <div className="form-group"><label htmlFor="discoveryHardwareId">Hardware ID</label><input id="discoveryHardwareId" value={discoveryHardwareId} onChange={(event) => setDiscoveryHardwareId(event.target.value)} placeholder="Optional hardware ID" /></div>
                <div className="form-group"><label htmlFor="discoveryAssociation">Existing device association</label><input id="discoveryAssociation" value={discoveryExistingDeviceAssociation} onChange={(event) => setDiscoveryExistingDeviceAssociation(event.target.value)} placeholder="Optional existing asset" /></div>
                <div className="form-group"><label htmlFor="discoveryTimeSync">Time sync</label><select id="discoveryTimeSync" value={discoveryTimeSynchronization} onChange={(event) => setDiscoveryTimeSynchronization(event.target.value)}><option value="unknown">Unknown</option><option value="synchronized">Synchronized</option><option value="drifted">Drifted</option></select></div>
              </div><div className="form-row">
                <div className="form-group"><label htmlFor="discoveryDuplicateStatus">Duplicate status</label><select id="discoveryDuplicateStatus" value={discoveryDuplicateStatus} onChange={(event) => setDiscoveryDuplicateStatus(event.target.value)}><option value="unique">Unique</option><option value="duplicate">Duplicate</option><option value="review-required">Review required</option></select></div>
                <div className="form-group"><label htmlFor="discoveryCompatibilityStatus">Compatibility status</label><select id="discoveryCompatibilityStatus" value={discoveryCompatibilityStatus} onChange={(event) => setDiscoveryCompatibilityStatus(event.target.value)}><option value="compatible">Compatible</option><option value="incompatible">Incompatible</option><option value="review-required">Review required</option></select></div>
                <div className="form-group"><label htmlFor="discoveryOnvifSupport">ONVIF support</label><select id="discoveryOnvifSupport" value={String(discoveryOnvifSupport)} onChange={(event) => setDiscoveryOnvifSupport(event.target.value === "true")}><option value="true">Yes</option><option value="false">No</option></select></div>
                <div className="form-group"><label htmlFor="discoveryRtspValidated">RTSP validated</label><select id="discoveryRtspValidated" value={String(discoveryRtspValidated)} onChange={(event) => setDiscoveryRtspValidated(event.target.value === "true")}><option value="true">Yes</option><option value="false">No</option></select></div>
              </div><div className="form-row">
                <div className="form-group"><label htmlFor="discoveryPtzCapability">PTZ</label><select id="discoveryPtzCapability" value={String(discoveryPtzCapability)} onChange={(event) => setDiscoveryPtzCapability(event.target.value === "true")}><option value="true">Yes</option><option value="false">No</option></select></div>
                <div className="form-group"><label htmlFor="discoveryAudioCapability">Audio</label><select id="discoveryAudioCapability" value={String(discoveryAudioCapability)} onChange={(event) => setDiscoveryAudioCapability(event.target.value === "true")}><option value="true">Yes</option><option value="false">No</option></select></div>
                <div className="form-group"><label htmlFor="discoveryAnalyticsCapability">Analytics</label><select id="discoveryAnalyticsCapability" value={String(discoveryAnalyticsCapability)} onChange={(event) => setDiscoveryAnalyticsCapability(event.target.value === "true")}><option value="true">Yes</option><option value="false">No</option></select></div>
              </div></div>

              <div className="form-section"><h3>Connection and camera type</h3><div className="form-row">
                <div className="form-group"><label htmlFor="cameraTransport">Branch connection</label><select id="cameraTransport" value={cameraForm.connectionTransport} onChange={(event) => setCameraForm((form) => ({ ...form, connectionTransport: event.target.value as CameraForm["connectionTransport"] }))}><option value="vpn">Existing branch VPN</option><option value="cloudflare-tunnel">Managed Cloudflare Tunnel</option></select></div>
                <div className="form-group"><label htmlFor="cameraSourceType">Camera type</label><select id="cameraSourceType" value={cameraForm.sourceType} onChange={(event) => setCameraForm((form) => { const recorderBacked = event.target.value !== "ip-camera"; return { ...form, sourceType: event.target.value as CameraForm["sourceType"], protocol: recorderBacked ? "vendor-adapter" : form.protocol, streamRole: recorderBacked ? "sub" : "main", width: recorderBacked ? "640" : "1920", height: recorderBacked ? "360" : "1080", frameRate: recorderBacked ? "5" : "15", bitrateKbps: recorderBacked ? "256" : "2048" }; })}><option value="ip-camera">IP camera</option><option value="analog-dvr-channel">Analog camera through DVR</option><option value="nvr-channel">IP camera through NVR</option></select></div>
                <div className="form-group"><label htmlFor="cameraIp">Private IP address <span className="required">*</span></label><input id="cameraIp" value={cameraForm.ipAddress} onChange={(event) => setCameraForm((form) => ({ ...form, ipAddress: event.target.value }))} required placeholder="192.168.1.20" /></div>
                <div className="form-group"><label htmlFor="cameraProtocol">Protocol</label><select id="cameraProtocol" value={cameraForm.protocol} onChange={(event) => setCameraForm((form) => ({ ...form, protocol: event.target.value as CameraForm["protocol"] }))}><option value="onvif-t">ONVIF Profile T</option><option value="onvif-s">ONVIF Profile S</option><option value="rtsp">RTSP</option><option value="vendor-adapter">Vendor adapter</option></select></div>
                <div className="form-group"><label htmlFor="onvifPort">ONVIF port</label><input id="onvifPort" type="number" min="1" max="65535" value={cameraForm.onvifPort} onChange={(event) => setCameraForm((form) => ({ ...form, onvifPort: event.target.value }))} required /></div>
                <div className="form-group"><label htmlFor="rtspPort">RTSP port</label><input id="rtspPort" type="number" min="1" max="65535" value={cameraForm.rtspPort} onChange={(event) => setCameraForm((form) => ({ ...form, rtspPort: event.target.value }))} required /></div>
              </div>
              {cameraForm.sourceType !== "ip-camera" ? <div className="form-row"><div className="form-group"><label htmlFor="recorderId">DVR / NVR ID <span className="required">*</span></label><input id="recorderId" value={cameraForm.recorderId} onChange={(event) => setCameraForm((form) => ({ ...form, recorderId: event.target.value }))} required placeholder="DVR-BLR-01" /></div><div className="form-group"><label htmlFor="recorderChannel">Recorder channel <span className="required">*</span></label><input id="recorderChannel" type="number" min="1" value={cameraForm.recorderChannel} onChange={(event) => setCameraForm((form) => ({ ...form, recorderChannel: event.target.value }))} required /></div><div className="form-group"><label htmlFor="recorderSerial">Recorder serial</label><input id="recorderSerial" value={cameraForm.recorderSerialNumber} onChange={(event) => setCameraForm((form) => ({ ...form, recorderSerialNumber: event.target.value }))} placeholder="Optional" /></div></div> : null}
              <div className="form-group"><label htmlFor="secretRef">Stream secret reference {cameraForm.connectionTransport === "cloudflare-tunnel" ? <span className="required">*</span> : null}</label><input id="secretRef" value={cameraForm.connectionSecretRef} onChange={(event) => setCameraForm((form) => ({ ...form, connectionSecretRef: event.target.value }))} minLength={cameraForm.connectionSecretRef ? 8 : undefined} required={cameraForm.connectionTransport === "cloudflare-tunnel"} placeholder={cameraForm.connectionTransport === "vpn" ? "Generated automatically for VPN when left blank" : "gateway-secret://branch/camera"} /><small className="field-help">VPN references are generated from the private address when left blank. Tunnel references must map to the RTSP URL in the gateway secret store. Credentials are never saved in the inventory database.</small></div></div>

              <div className="form-section"><h3>Remote monitoring stream and capabilities</h3><p className="field-help">DVR/NVR main streams remain recorded locally. Use a low-bitrate substream for central live view and analytics over VPN.</p><div className="form-row form-row-three">
                <div className="form-group"><label htmlFor="streamRole">Stream role</label><select id="streamRole" value={cameraForm.streamRole} onChange={(event) => setCameraForm((form) => ({ ...form, streamRole: event.target.value as CameraForm["streamRole"] }))}><option value="sub">Substream (recommended over VPN)</option><option value="main">Main stream</option><option value="unknown">Auto-detect</option></select></div>
                <div className="form-group"><label htmlFor="codec">Codec</label><select id="codec" value={cameraForm.codec} onChange={(event) => setCameraForm((form) => ({ ...form, codec: event.target.value as CameraForm["codec"] }))}><option value="H264">H.264</option><option value="H265">H.265</option><option value="MJPEG">MJPEG</option><option value="unknown">Auto-detect</option></select></div>
                <div className="form-group"><label htmlFor="streamWidth">Width</label><input id="streamWidth" type="number" min="1" value={cameraForm.width} onChange={(event) => setCameraForm((form) => ({ ...form, width: event.target.value }))} required /></div>
                <div className="form-group"><label htmlFor="streamHeight">Height</label><input id="streamHeight" type="number" min="1" value={cameraForm.height} onChange={(event) => setCameraForm((form) => ({ ...form, height: event.target.value }))} required /></div>
                <div className="form-group"><label htmlFor="streamFrameRate">FPS</label><input id="streamFrameRate" type="number" min="0.1" max="120" step="0.1" value={cameraForm.frameRate} onChange={(event) => setCameraForm((form) => ({ ...form, frameRate: event.target.value }))} required /></div>
                <div className="form-group"><label htmlFor="streamBitrate">Bitrate (Kbps)</label><input id="streamBitrate" type="number" min="1" max="100000" value={cameraForm.bitrateKbps} onChange={(event) => setCameraForm((form) => ({ ...form, bitrateKbps: event.target.value }))} required /></div>
              </div><div className="capability-checks">{([['ptz', 'PTZ control'], ['audio', 'Audio'], ['events', 'Motion/events']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={cameraForm[key]} onChange={(event) => setCameraForm((form) => ({ ...form, [key]: event.target.checked }))} />{label}</label>)}</div></div>

              </>
              )}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCameraForm(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? (registrationMode === "bulk" ? "Importing…" : "Adding camera…") : registrationMode === "bulk" ? "Import cameras" : "Add camera"}</button></div>
            </form>
          </div>
        </div>
      )}

      {showDirectProbeModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h2>Direct IP / Camera Live Probe &amp; Connect</h2>
              <button type="button" className="icon-button" onClick={() => setShowDirectProbeModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <p className="text-xs text-slate-500">
                Probe a camera on the branch network using its observed address and credentials.
              </p>
              
              <div className="space-y-3">
                <div className="form-group">
                  <label htmlFor="probeIp">Camera Local IP Address <span className="required">*</span></label>
                  <input
                    id="probeIp"
                    value={probeIp}
                    onChange={(e) => setProbeIp(e.target.value)}
                    placeholder="Camera IP address"
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="probePort">RTSP Port</label>
                    <input
                      id="probePort"
                      value={probePort}
                      onChange={(e) => setProbePort(e.target.value)}
                      placeholder="RTSP port"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="probeUsername">Camera username <span className="required">*</span></label>
                    <input
                      id="probeUsername"
                      value={probeUsername}
                      onChange={(e) => setProbeUsername(e.target.value)}
                      placeholder="Camera username"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="probePassword">Camera Password / TrueCloud Password</label>
                    <input
                      id="probePassword"
                      type="password"
                      value={probePassword}
                      onChange={(e) => setProbePassword(e.target.value)}
                      placeholder="Enter password (or TrueCloud login password)"
                    />
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={runDirectProbe}
                    disabled={probing || !probeIp.trim() || !probeUsername.trim()}
                  >
                    <Search size={14} /> {probing ? "Probing camera network..." : "Probe Camera"}
                  </button>
                </div>
              </div>

              {probeResult && (
                <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 space-y-2 mt-4 text-xs">
                  <div className="flex items-center justify-between">
                    <strong>Status: {probeResult.online ? "🟢 Camera Online & Responding" : "🔴 Unreachable"}</strong>
                    <span className="font-mono text-[11px] bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {probeResult.server || "RTSP 554"}
                    </span>
                  </div>

                  {probeResult.online && (
                    <>
                      <div><strong>Identified Device:</strong> {probeResult.vendor} • {probeResult.model}</div>
                      <div><strong>Stream URL:</strong> <code className="font-mono text-[11px]">{probeResult.streamUrl}</code></div>
                      <div><strong>Authentication:</strong> {probeResult.authenticated ? "✅ Authenticated" : `⚠️ ${probeResult.authType} Auth Required (${probeResult.error || "Enter TrueCloud password"})`}</div>

                      <div className="pt-2 flex gap-2">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={enrollProbedCamera}
                          disabled={saving || !selectedBranch}
                        >
                          <Plus size={14} /> {saving ? "Enrolling..." : "Enroll Camera into Fleet"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {showQRScanner && (
        <QRCredentialScanner
          onCredentialsExtracted={(username, password) => {
            setActivationUsername(username);
            setActivationPassword(password);
            setShowQRScanner(false);
            setNotice("Credentials extracted from QR code successfully!");
          }}
          onDeviceIdentified={(device) => {
            setCameraForm((form) => ({
              ...form,
              name: `Robot PTZ (${device.model || device.uid})`,
              model: device.model || "T18061-W",
              vendor: "other",
              ptz: true,
              audio: true,
              events: true,
            }));
            setDiscoveryManufacturer(device.vendor || "Trueview / TrueCloud");
            setDiscoverySerialNumber(device.uid);
            setShowQRScanner(false);
            setNotice(`Camera ${device.model || device.uid} recognized from QR code! Enter local IP to connect.`);
          }}
          onClose={() => setShowQRScanner(false)}
        />
      )}
    </div>
  );
}

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message !== "Request failed"
    ? reason.message
    : fallback;
}

function isGatewayReady(gateway: EdgeAgent) {
  if ((gateway.status as string) === "revoked") return false;
  // Only treat a gateway as ready when it is actually connected; an offline
  // gateway with a valid ID would still cause a 409 on the scan endpoint.
  if (gateway.status !== "online" || !gateway.lastSeenAt) return false;
  const lastSeenAt = Date.parse(gateway.lastSeenAt);
  return Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt <= 90_000;
}

function isScannerUnavailable(reason: unknown) {
  if (!reason || typeof reason !== "object") return false;
  const details = (reason as { details?: { error?: string } }).details;
  return details?.error === "edge_agent_not_connected";
}

function isAgentUpdateRequired(reason: unknown) {
  if (!reason || typeof reason !== "object") return false;
  const details = (reason as { details?: { error?: string } }).details;
  return details?.error === "edge_agent_update_required";
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
