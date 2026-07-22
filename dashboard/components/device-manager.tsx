"use client";

import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Copy,
  Network,
  Plus,
  Router,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cameraInventoryApi, deviceInventoryApi } from "@/lib/api-client";
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
  edgeAgentId: string;
  connectionSecretRef: string;
  codec: "H264" | "H265" | "MJPEG" | "unknown";
  width: string;
  height: string;
  ptz: boolean;
  audio: boolean;
  events: boolean;
};

const emptyCameraForm: CameraForm = {
  name: "",
  vendor: "other",
  model: "",
  ipAddress: "",
  onvifPort: "80",
  rtspPort: "554",
  channel: "1",
  protocol: "onvif-t",
  edgeAgentId: "",
  connectionSecretRef: "",
  codec: "H264",
  width: "1920",
  height: "1080",
  ptz: false,
  audio: false,
  events: true,
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

const emptyInventoryForm: DeviceInventoryForm = {
  deviceId: "",
  tenant: "tenant-demo",
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
  healthStatus: "healthy",
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
  const [discoveryOnvifSupport, setDiscoveryOnvifSupport] = useState(true);
  const [discoveryRtspValidated, setDiscoveryRtspValidated] = useState(true);
  const [discoveryPtzCapability, setDiscoveryPtzCapability] = useState(false);
  const [discoveryAudioCapability, setDiscoveryAudioCapability] = useState(false);
  const [discoveryAnalyticsCapability, setDiscoveryAnalyticsCapability] = useState(false);
  const [discoveryTimeSynchronization, setDiscoveryTimeSynchronization] = useState("unknown");
  const [discoveryDuplicateStatus, setDiscoveryDuplicateStatus] = useState("unique");
  const [discoveryCompatibilityStatus, setDiscoveryCompatibilityStatus] = useState("compatible");
  const [discoveryHardwareId, setDiscoveryHardwareId] = useState("");
  const [discoveryExistingDeviceAssociation, setDiscoveryExistingDeviceAssociation] = useState("");
  const [gatewayName, setGatewayName] = useState("");
  const [showCameraForm, setShowCameraForm] = useState(false);
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [showDiscoveredList, setShowDiscoveredList] = useState(false);
  const [provisionedGateway, setProvisionedGateway] = useState<EdgeAgent>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryDeviceTypeFilter, setInventoryDeviceTypeFilter] = useState("all");
  const [inventoryLifecycleFilter, setInventoryLifecycleFilter] = useState("all");
  const [inventoryHealthFilter, setInventoryHealthFilter] = useState("all");
  const [inventorySort, setInventorySort] = useState<"updated" | "deviceId">("updated");

  const activeBranch = branches.find((branch) => branch.id === selectedBranch);
  const discoveryQueueItems = useMemo(() => discoveredCameras.map((camera) => {
    const reviewStatus = discoveryReviewState[camera.id]?.reviewStatus ?? (camera.duplicateStatus === "duplicate" ? "duplicate" : camera.duplicateStatus === "review-required" ? "review-required" : "pending");
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
  const setupText = useMemo(() => provisionedGateway
    ? [
        "CONTROL_PLANE_URL=<provided-by-platform-admin>",
        `BRANCH_ID=${provisionedGateway.branchId}`,
        `EDGE_AGENT_ID=${provisionedGateway.id}`,
        `EDGE_AGENT_NAME=${provisionedGateway.name}`,
        "EDGE_BRIDGE_SHARED_KEY=<enrollment-secret>",
        "CAMERA_USERNAME=<camera-user>",
        "CAMERA_PASSWORD=<camera-password>",
        "PUBLIC_MEDIA_GATEWAY_URL=https://<branch-media-tunnel-host>",
        "EDGE_MEDIA_SHARED_KEY=<unique-branch-media-key>",
        "STREAM_SECRET_STORE_PATH=./data/stream-secrets.json",
        "ONVIF_ENDPOINTS=http://<camera-ip>/onvif/device_service",
      ].join("\n")
    : "", [provisionedGateway]);

  useEffect(() => {
    void cameraInventoryApi.listBranches("device:configure")
      .then(({ data }) => {
        setBranches(data);
        setSelectedBranch(data[0]?.id ?? "");
      })
      .catch((reason) => setError(messageOf(reason, "Unable to load configurable branches.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBranch) {
      setGateways([]);
      setCameras([]);
      setInventoryRecords([]);
      return;
    }
    setInventoryForm((form) => ({ ...form, branch: selectedBranch }));
    void refreshBranch(selectedBranch);
  }, [selectedBranch]);

  async function refreshBranch(branchId: string) {
    setLoading(true);
    setError(undefined);
    try {
      const [gatewayResponse, cameraResponse, discoveredResponse, inventoryResponse] = await Promise.all([
        cameraInventoryApi.listGateways(branchId),
        cameraInventoryApi.listByBranch(branchId),
        cameraInventoryApi.listDiscovered(branchId),
        deviceInventoryApi.list(branchId),
      ]);
      setGateways(gatewayResponse.data);
      setCameras(cameraResponse.data);
      setDiscoveredCameras(discoveredResponse.data);
      setDiscoveryReviewState((previous) => {
        const next = { ...previous };
        for (const camera of discoveredResponse.data) {
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
      setInventoryRecords(inventoryResponse.data);
      return discoveredResponse.data;
    } catch (reason) {
      setError(messageOf(reason, "Unable to load devices for this branch."));
    } finally {
      setLoading(false);
    }
  }

  function openCameraForm() {
    const preferred = gateways.find((gateway) => gateway.status === "online") ?? gateways[0];
    setCameraForm({
      ...emptyCameraForm,
      edgeAgentId: preferred?.id ?? "",
      connectionSecretRef: `edge://${preferred?.id ?? "gateway"}/manual-camera`,
    });
    setError(undefined);
    setShowDiscoveredList(true);
  }

  async function scanNetwork() {
    if (!selectedBranch) return;
    if (gateways.length === 0) {
      setProvisionedGateway(undefined);
      setShowGatewayForm(true);
      setNotice("Register the on-site gateway first; scans run inside the branch network.");
      return;
    }
    setScanning(true);
    setError(undefined);
    try {
      const preferred = gateways.find((gateway) => gateway.status === "online") ?? gateways[0];
      let job = await cameraInventoryApi.startScan(selectedBranch, preferred?.id) as EdgeScanJob;
      const deadline = Date.now() + 120_000;
      while (job.status === "queued" || job.status === "running") {
        if (Date.now() >= deadline) {
          setNotice("Scan queued. It will run when the branch gateway checks in.");
          return;
        }
        await wait(2_000);
        job = await cameraInventoryApi.getScan(selectedBranch, job.id) as EdgeScanJob;
      }
      const discoveries = await refreshBranch(selectedBranch) ?? [];
      if (job.status === "failed") throw new Error(job.error ?? "Branch gateway scan failed.");
      setShowDiscoveredList(true);
      setNotice(`Network scan completed. Found ${job.resultCount || discoveries.length} cameras.`);
    } catch (reason) {
      setError(messageOf(reason, "Network scan failed."));
    } finally {
      setScanning(false);
    }
  }

  function markDiscoveryReviewStatus(discoveryId: string, reviewStatus: "pending" | "duplicate" | "review-required" | "approved") {
    setDiscoveryReviewState((previous) => ({ ...previous, [discoveryId]: { reviewStatus } }));
  }

  async function addDiscoveredCamera(discovered: any) {
    setSaving(true);
    setError(undefined);
    try {
      // Pre-fill the form with discovered camera details
      setCameraForm({
        ...emptyCameraForm,
        edgeAgentId: discovered.edgeAgentId,
        vendor: discovered.vendor,
        model: discovered.model,
        ipAddress: discovered.ipAddress,
        onvifPort: String(discovered.onvifPort),
        rtspPort: String(discovered.rtspPort),
        name: `${discovered.model}@${discovered.ipAddress}`,
        codec: discovered.profiles[0]?.codec ?? "H264",
        width: String(discovered.profiles[0]?.width ?? "1920"),
        height: String(discovered.profiles[0]?.height ?? "1080"),
        ptz: discovered.capabilities.ptz,
        audio: discovered.capabilities.audio,
        events: discovered.capabilities.events,
        connectionSecretRef: `edge://${discovered.edgeAgentId}/${discovered.id}`,
      });

      // Submit the discovery
      const discovery = await cameraInventoryApi.submitDiscovery(selectedBranch, {
        edgeAgentId: discovered.edgeAgentId,
        vendor: discovered.vendor,
        model: discovered.model,
        ipAddress: discovered.ipAddress,
        onvifPort: discovered.onvifPort,
        rtspPort: discovered.rtspPort,
        profiles: discovered.profiles,
        capabilities: discovered.capabilities,
      });

      // Approve the camera
      await cameraInventoryApi.approveCamera(selectedBranch, {
        discoveryId: discovery.id,
        name: `${discovered.model}@${discovered.ipAddress}`,
        channel: 1,
        protocol: "onvif-t",
        connectionSecretRef: `edge://${discovered.edgeAgentId}/${discovered.id}`,
      });

      markDiscoveryReviewStatus(discovered.id, "approved");
      setShowDiscoveredList(false);
      setNotice(`Camera ${discovered.model} was added successfully.`);
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Failed to add discovered camera."));
    } finally {
      setSaving(false);
    }
  }

  async function registerGateway(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBranch) return;
    setSaving(true);
    setError(undefined);
    try {
      const gateway = await cameraInventoryApi.registerGateway(selectedBranch, {
        name: gatewayName,
        version: "0.1.0",
      }) as EdgeAgent;
      setProvisionedGateway(gateway);
      setGatewayName("");
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Gateway registration failed."));
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
      setInventoryForm({ ...emptyInventoryForm, branch: selectedBranch, tenant: inventoryForm.tenant || "tenant-demo" });
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
        onvifPort: Number(cameraForm.onvifPort),
        rtspPort: Number(cameraForm.rtspPort),
        profiles: [{
          name: "main",
          codec: cameraForm.codec,
          width: Number(cameraForm.width),
          height: Number(cameraForm.height),
        }],
        capabilities: {
          ptz: cameraForm.ptz,
          audio: cameraForm.audio,
          events: cameraForm.events,
        },
      });
      await cameraInventoryApi.approveCamera(selectedBranch, {
        discoveryId: discovery.id,
        name: cameraForm.name,
        channel: Number(cameraForm.channel),
        protocol: cameraForm.protocol,
        connectionSecretRef: cameraForm.connectionSecretRef,
      });
      setShowCameraForm(false);
      setNotice(`${cameraForm.name} was added to ${activeBranch?.name ?? "the branch"}.`);
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Camera onboarding failed."));
    } finally {
      setSaving(false);
    }
  }

  async function copySetup() {
    await navigator.clipboard.writeText(setupText);
    setNotice("Gateway configuration copied.");
  }

  return (
    <div className="device-manager">
      <div className="device-toolbar">
        <div>
          <h2>Branches & devices</h2>
          <p>Add ONVIF or RTSP cameras through an on-site branch gateway.</p>
        </div>
        <div className="device-toolbar-actions">
          <button className="secondary-button" onClick={() => {
            setProvisionedGateway(undefined);
            setShowGatewayForm(true);
          }} disabled={!selectedBranch}>
            <Router size={15} /> Register gateway
          </button>
          <button className="secondary-button" onClick={() => void scanNetwork()} disabled={!selectedBranch || scanning} title={gateways.length === 0 ? "Register a gateway to scan this branch" : "Run discovery inside this branch network"}>
            <Network size={15} /> {scanning ? "Scanning…" : gateways.length === 0 ? "Set up scan" : "Scan network"}
          </button>
          <button className="primary-button" onClick={openCameraForm} disabled={!selectedBranch || gateways.length === 0}>
            <Plus size={15} /> Add camera
          </button>
        </div>
      </div>

      {error && <div className="device-message error"><AlertTriangle size={16} />{error}</div>}
      {notice && <div className="device-message success"><CheckCircle2 size={16} />{notice}<button onClick={() => setNotice(undefined)}><X size={14} /></button></div>}

      <div className="remote-camera-note">
        <Network size={19} />
        <div>
          <strong>Camera at another location?</strong>
          <span>Install one Sentinel Edge Agent inside that branch network. The camera IP remains private and its credentials stay at the branch.</span>
        </div>
      </div>

      <div className="device-scope">
        <label htmlFor="device-branch">Branch location</label>
        <select id="device-branch" value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        {branches.length === 0 && !loading && <span>You do not have device configuration permission for any branch.</span>}
      </div>

      {loading ? <div className="loading-state"><Activity className="spin" />Loading branch devices…</div> : (
        <div className="device-columns">
          <section className="device-card">
            <div className="device-card-heading"><Router size={18} /><div><h3>Branch gateways</h3><p>{gateways.length} registered</p></div></div>
            {gateways.length === 0 ? (
              <div className="device-empty"><Router size={25} /><strong>No gateway registered</strong><span>Register and install a gateway before adding cameras at this location.</span></div>
            ) : gateways.map((gateway) => (
              <article className="gateway-row" key={gateway.id}>
                <span className={`gateway-state ${gateway.status}`}><i /></span>
                <div><strong>{gateway.name}</strong><small>{gateway.status} · v{gateway.version}</small></div>
                <code title={gateway.id}>{gateway.id.slice(0, 8)}</code>
              </article>
            ))}
          </section>

          <section className="device-card">
            <div className="device-card-heading"><Camera size={18} /><div><h3>Camera inventory</h3><p>{cameras.length} devices</p></div></div>
            {cameras.length === 0 ? (
              <div className="device-empty"><Camera size={25} /><strong>No cameras added</strong><span>Add the first camera after its branch gateway is registered.</span></div>
            ) : cameras.map((camera) => (
              <article className="camera-inventory-row" key={camera.id}>
                <span className="camera-device-icon"><Camera size={15} /></span>
                <div><strong>{camera.name}</strong><small>{camera.vendor} · {camera.model} · channel {camera.channel}</small></div>
                <span className={`inventory-status ${camera.status}`}>{camera.status}</span>
              </article>
            ))}
          </section>
        </div>
      )}

      <section className="device-card">
        <div className="device-card-heading"><Search size={18} /><div><h3>Discovery queue</h3><p>{discoveryQueueItems.filter((item) => item.reviewStatus !== "approved").length} pending review</p></div></div>
        {discoveryQueueItems.length === 0 ? (
          <div className="device-empty"><Camera size={25} /><strong>No pending discoveries</strong><span>Scan the branch or submit a discovery to populate this queue.</span></div>
        ) : discoveryQueueItems.map((item) => (
          <article className="discovery-queue-row" key={item.id}>
            <div className="discovery-queue-meta">
              <strong>{item.model} @ {item.ipAddress}</strong>
              <small>{item.vendor} · {item.discoveryMethod ?? "discovery"} · {item.serialNumber ? `SN ${item.serialNumber}` : "Serial pending"}</small>
              {item.onvifServices?.length ? <small>Services: {item.onvifServices.join(", ")}</small> : null}
              {item.onvifCapabilityTests?.length ? <small>Tests: {item.onvifCapabilityTests.filter((test: any) => test.status === "pass").length}/{item.onvifCapabilityTests.length} passed</small> : null}
            </div>
            <span className={`inventory-status discovery-badge ${item.reviewStatus === "duplicate" ? "offline" : item.reviewStatus === "review-required" ? "degraded" : item.reviewStatus === "approved" ? "online" : ""}`}>
              {item.badgeLabel}
            </span>
            <div className="discovery-actions">
              <button type="button" className="secondary-button" onClick={() => void addDiscoveredCamera(item)} disabled={saving}>Approve</button>
              <button type="button" className="secondary-button" onClick={() => markDiscoveryReviewStatus(item.id, "duplicate")}>Duplicate</button>
              <button type="button" className="secondary-button" onClick={() => markDiscoveryReviewStatus(item.id, "review-required")}>Review later</button>
            </div>
          </article>
        ))}
      </section>

      <section className="device-card">
        <div className="device-card-heading"><Network size={18} /><div><h3>Unified device inventory</h3><p>{inventoryRecords.length} records</p></div></div>
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
      </section>

      {showGatewayForm && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header"><h2>Register branch gateway</h2><button className="icon-button" onClick={() => setShowGatewayForm(false)}><X size={20} /></button></div>
            {!provisionedGateway ? (
              <form className="modal-form" onSubmit={registerGateway}>
                <div className="form-info-banner"><Network size={16} />Use a Windows or Linux computer that stays on inside {activeBranch?.name}.</div>
                <div className="form-group"><label htmlFor="gatewayName">Gateway name <span className="required">*</span></label><input id="gatewayName" value={gatewayName} onChange={(event) => setGatewayName(event.target.value)} minLength={2} maxLength={120} required placeholder={`${activeBranch?.name ?? "Branch"} Gateway`} /></div>
                <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowGatewayForm(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Registering…" : "Register gateway"}</button></div>
              </form>
            ) : (
              <div className="modal-body">
                <div className="device-message success"><CheckCircle2 size={16} />Gateway registration created.</div>
                <p className="setup-description">Set these environment variables on the branch computer, then run the Sentinel Edge Agent. Obtain the enrollment secret from the platform administrator.</p>
                <pre className="gateway-config">{setupText}</pre>
                <div className="modal-actions"><button className="secondary-button" onClick={() => void copySetup()}><Copy size={14} />Copy configuration</button><button className="primary-button" onClick={() => setShowGatewayForm(false)}>Done</button></div>
              </div>
            )}
          </div>
        </div>
      )}
      {showDiscoveredList && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header"><h2>Add camera to {activeBranch?.name}</h2><button className="icon-button" onClick={() => setShowDiscoveredList(false)}><X size={20} /></button></div>
            <div className="modal-body">
              {discoveredCameras.length === 0 ? (
                <div className="device-empty"><Camera size={30} /><strong>No cameras discovered</strong><span>Run a network scan or configure the gateway's ONVIF endpoints to find cameras.</span></div>
              ) : (
                <>
                  <p className="form-info-banner"><Network size={16} />Select a discovered camera to add it to this branch. Pre-populated details can be edited if needed.</p>
                  <div className="discovered-cameras-list">
                    {discoveredCameras.map((camera) => (
                      <div key={camera.id} className="discovered-camera-item">
                        <div className="camera-details">
                          <strong>{camera.model} @ {camera.ipAddress}</strong>
                          <small>{camera.vendor} · {camera.discoveryMethod ?? "discovery"} · ONVIF port {camera.onvifPort}</small>
                          <small>{camera.serialNumber ? `SN ${camera.serialNumber}` : "Serial pending"} · {camera.macAddress ?? "MAC pending"}</small>
                          <small className="profiles">{camera.profiles.map((p: any) => `${p.codec} ${p.width}x${p.height}`).join(", ")}</small>
                        </div>
                        <button className="primary-button" onClick={() => void addDiscoveredCamera(camera)} disabled={saving}>
                          {saving ? "Adding…" : "Add camera"}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setShowDiscoveredList(false)}>Close</button>
                <button className="secondary-button" onClick={() => { setShowDiscoveredList(false); setShowCameraForm(true); }}>Manual entry</button>
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
              <div className="form-section"><h3>Location and gateway</h3><div className="form-row">
                <div className="form-group"><label>Branch</label><input value={activeBranch?.name ?? ""} disabled /></div>
                <div className="form-group"><label htmlFor="cameraGateway">Edge gateway <span className="required">*</span></label><select id="cameraGateway" value={cameraForm.edgeAgentId} onChange={(event) => setCameraForm((form) => ({ ...form, edgeAgentId: event.target.value }))} required><option value="">Select gateway…</option>{gateways.map((gateway) => <option key={gateway.id} value={gateway.id}>{gateway.name} ({gateway.status})</option>)}</select></div>
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

              <div className="form-section"><h3>Network connection</h3><div className="form-row">
                <div className="form-group"><label htmlFor="cameraIp">Private IP address <span className="required">*</span></label><input id="cameraIp" value={cameraForm.ipAddress} onChange={(event) => setCameraForm((form) => ({ ...form, ipAddress: event.target.value }))} required placeholder="192.168.1.20" /></div>
                <div className="form-group"><label htmlFor="cameraProtocol">Protocol</label><select id="cameraProtocol" value={cameraForm.protocol} onChange={(event) => setCameraForm((form) => ({ ...form, protocol: event.target.value as CameraForm["protocol"] }))}><option value="onvif-t">ONVIF Profile T</option><option value="onvif-s">ONVIF Profile S</option><option value="rtsp">RTSP</option><option value="vendor-adapter">Vendor adapter</option></select></div>
                <div className="form-group"><label htmlFor="onvifPort">ONVIF port</label><input id="onvifPort" type="number" min="1" max="65535" value={cameraForm.onvifPort} onChange={(event) => setCameraForm((form) => ({ ...form, onvifPort: event.target.value }))} required /></div>
                <div className="form-group"><label htmlFor="rtspPort">RTSP port</label><input id="rtspPort" type="number" min="1" max="65535" value={cameraForm.rtspPort} onChange={(event) => setCameraForm((form) => ({ ...form, rtspPort: event.target.value }))} required /></div>
              </div><div className="form-group"><label htmlFor="secretRef">Stream secret reference <span className="required">*</span></label><input id="secretRef" value={cameraForm.connectionSecretRef} onChange={(event) => setCameraForm((form) => ({ ...form, connectionSecretRef: event.target.value }))} minLength={8} required /><small className="field-help">This reference must map to the RTSP URL in the gateway secret store. Camera credentials are never saved in the inventory database.</small></div></div>

              <div className="form-section"><h3>Main stream and capabilities</h3><div className="form-row form-row-three">
                <div className="form-group"><label htmlFor="codec">Codec</label><select id="codec" value={cameraForm.codec} onChange={(event) => setCameraForm((form) => ({ ...form, codec: event.target.value as CameraForm["codec"] }))}><option value="H264">H.264</option><option value="H265">H.265</option><option value="MJPEG">MJPEG</option><option value="unknown">Auto-detect</option></select></div>
                <div className="form-group"><label htmlFor="streamWidth">Width</label><input id="streamWidth" type="number" min="1" value={cameraForm.width} onChange={(event) => setCameraForm((form) => ({ ...form, width: event.target.value }))} required /></div>
                <div className="form-group"><label htmlFor="streamHeight">Height</label><input id="streamHeight" type="number" min="1" value={cameraForm.height} onChange={(event) => setCameraForm((form) => ({ ...form, height: event.target.value }))} required /></div>
              </div><div className="capability-checks">{([['ptz', 'PTZ control'], ['audio', 'Audio'], ['events', 'Motion/events']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={cameraForm[key]} onChange={(event) => setCameraForm((form) => ({ ...form, [key]: event.target.checked }))} />{label}</label>)}</div></div>

              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCameraForm(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Adding camera…" : "Add camera"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message !== "Request failed"
    ? reason.message
    : fallback;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
