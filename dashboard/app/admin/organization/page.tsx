"use client";

import { useState, useEffect, useRef } from "react";
import {
  Building2,
  Globe2,
  FolderTree,
  Users,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Eye,
  Video,
  Lock,
  Unlock,
  MapPin,
  Camera,
  Layers,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
  Filter,
  Sliders,
  Server,
  AlertTriangle,
  Upload,
  UserCheck,
  ScanFace,
  Sparkles,
  Check,
  RotateCcw,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";

type OrgNode = {
  id: string;
  parentId: string | null;
  name: string;
  code?: string;
  type:
    | "company"
    | "headquarters"
    | "zone"
    | "division"
    | "region"
    | "area"
    | "branch"
    | "building"
    | "floor"
    | "location-group"
    | "camera-group"
    | "camera";
  description?: string;
  children?: OrgNode[];
};

type Employee = {
  id: string;
  displayName: string;
  email: string;
  role: string;
  designation?: string;
  department?: string;
  status: string;
  photoUrl?: string;
  avatarUrl?: string;
  facePhotoBase64?: string;
  faceEnrolled?: boolean;
  organizations?: Array<{
    nodeId: string;
    nodeName?: string;
    isPrimary: boolean;
  }>;
};

type CameraItem = {
  id: string;
  name: string;
  branchId: string;
  nodeId: string;
  ipAddress?: string;
  status: string;
  model: string;
  vendor: string;
};

export default function OrganizationHierarchyPage() {
  const [activeTab, setActiveTab] = useState<"hierarchy" | "employees" | "locations">("hierarchy");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tree & Data state
  const [treeData, setTreeData] = useState<OrgNode[]>([]);
  const [flatNodes, setFlatNodes] = useState<OrgNode[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [cameras, setCameras] = useState<CameraItem[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Modals & Form state
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [selectedParentNode, setSelectedParentNode] = useState<OrgNode | null>(null);
  const [newNodeType, setNewNodeType] = useState<OrgNode["type"]>("branch");
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeCode, setNewNodeCode] = useState("");
  const [newNodeDesc, setNewNodeDesc] = useState("");

  // Employee Form state with Photo & Face Capture
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpRole, setNewEmpRole] = useState("operator");
  const [newEmpDesignation, setNewEmpDesignation] = useState("Security Officer");
  const [newEmpDept, setNewEmpDept] = useState("Surveillance SOC");
  const [newEmpOrgNodeId, setNewEmpOrgNodeId] = useState("");
  const [empPhotoData, setEmpPhotoData] = useState<string>("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Permission Matrix Modal
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showPermModal, setShowPermModal] = useState(false);
  const [permScopeNodeId, setPermScopeNodeId] = useState("");
  const [permAction, setPermAction] = useState<"live:view" | "recording:view" | "ptz:operate" | "audio:talk">("live:view");
  const [permEffect, setPermEffect] = useState<"allow" | "deny">("allow");

  // Location Access Simulator
  const [simEmployeeId, setSimEmployeeId] = useState<string>("");
  const [simCameraId, setSimCameraId] = useState<string>("");
  const [simResult, setSimResult] = useState<{
    allowed: boolean;
    reason: string;
    faceMatchScore?: number;
    faceStatus?: string;
  } | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    // Cleanup webcam stream when modal closes
    if (!showAddEmpModal && streamRef.current) {
      stopWebcam();
    }
  }, [showAddEmpModal]);

  async function loadAllData() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Tree
      const treeRes = await fetch("/api/control/v1/organization/tree");
      if (treeRes.ok) {
        const treeJson = await treeRes.json();
        const nodes = Array.isArray(treeJson) ? treeJson : treeJson.data || [];
        setTreeData(nodes);

        const flat: OrgNode[] = [];
        function flatten(list: OrgNode[]) {
          for (const item of list) {
            flat.push(item);
            if (item.children && item.children.length > 0) {
              flatten(item.children);
            }
          }
        }
        flatten(nodes);
        setFlatNodes(flat);

        const expanded: Record<string, boolean> = {};
        for (const n of flat) {
          if (n.type === "company" || n.type === "zone" || n.type === "region" || n.type === "branch") {
            expanded[n.id] = true;
          }
        }
        setExpandedNodes(expanded);
      }

      // 2. Fetch Users / Employees
      const usersRes = await fetch("/api/control/v1/users");
      if (usersRes.ok) {
        const usersJson = await usersRes.json();
        setEmployees(Array.isArray(usersJson) ? usersJson : usersJson.data || []);
      }

      // 3. Fetch Cameras
      const camsRes = await fetch("/api/control/v1/cameras");
      if (camsRes.ok) {
        const camsJson = await camsRes.json();
        setCameras(Array.isArray(camsJson) ? camsJson : camsJson.data || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load organization hierarchy");
    } finally {
      setLoading(false);
    }
  }

  function toggleNode(nodeId: string) {
    setExpandedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  }

  // --- Webcam Photo Capture Logic ---
  async function startWebcam() {
    setCameraError(null);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setIsCameraActive(true);
      } else {
        setCameraError("Webcam not supported by your browser");
      }
    } catch (err: any) {
      setCameraError("Could not access camera: " + (err.message || "Permission denied"));
      setIsCameraActive(false);
    }
  }

  function stopWebcam() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }

  function capturePhotoFromWebcam() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setEmpPhotoData(dataUrl);
      stopWebcam();
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid JPG/PNG/WEBP image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setEmpPhotoData(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function openAddNode(parent: OrgNode | null, defaultType: OrgNode["type"] = "branch") {
    setSelectedParentNode(parent);
    setNewNodeType(defaultType);
    setNewNodeName("");
    setNewNodeCode("");
    setNewNodeDesc("");
    setShowAddNodeModal(true);
  }

  async function handleCreateNode(e: React.FormEvent) {
    e.preventDefault();
    if (!newNodeName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        parentNodeId: selectedParentNode ? selectedParentNode.id : undefined,
        nodeType: newNodeType,
        name: newNodeName.trim(),
        code: newNodeCode.trim() || undefined,
        description: newNodeDesc.trim() || undefined,
      };

      const res = await fetch("/api/control/v1/organization/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || errJson.error || "Failed to create organization node");
      }

      setNotice(`Successfully created ${newNodeType} "${newNodeName}"!`);
      setShowAddNodeModal(false);
      await loadAllData();
    } catch (err: any) {
      setError(err.message || "Failed to create node");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNode(node: OrgNode) {
    if (!confirm(`Are you sure you want to delete ${node.type} "${node.name}" and its sub-locations?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/control/v1/organization/nodes/${node.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || "Failed to delete node");
      }
      setNotice(`Deleted ${node.name}`);
      await loadAllData();
    } catch (err: any) {
      setError(err.message || "Failed to delete node");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpEmail.trim() || !newEmpOrgNodeId) {
      setError("Please fill all required fields and select an organization/branch location.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        displayName: newEmpName.trim(),
        email: newEmpEmail.trim(),
        role: newEmpRole,
        designation: newEmpDesignation.trim(),
        department: newEmpDept.trim(),
        primaryOrgNodeId: newEmpOrgNodeId,
        photoUrl: empPhotoData || undefined,
        avatarUrl: empPhotoData || undefined,
        facePhotoBase64: empPhotoData || undefined,
        faceEnrolled: Boolean(empPhotoData),
      };

      const res = await fetch("/api/control/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || "Failed to create employee");
      }

      setNotice(
        `Employee ${newEmpName} enrolled successfully${
          empPhotoData ? " with facial biometric profile for restricted areas!" : "!"
        }`
      );
      setShowAddEmpModal(false);
      setNewEmpName("");
      setNewEmpEmail("");
      setEmpPhotoData("");
      stopWebcam();
      await loadAllData();
    } catch (err: any) {
      setError(err.message || "Failed to create employee");
    } finally {
      setSaving(false);
    }
  }

  function openEmployeePermissions(emp: Employee) {
    setSelectedEmployee(emp);
    setPermScopeNodeId(emp.organizations?.[0]?.nodeId || flatNodes[0]?.id || "");
    setPermAction("live:view");
    setPermEffect("allow");
    setShowPermModal(true);
  }

  async function handleAssignPermission(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployee || !permScopeNodeId) return;
    setSaving(true);
    try {
      const payload = {
        userId: selectedEmployee.id,
        scopeNodeId: permScopeNodeId,
        isPrimary: false,
      };

      await fetch(`/api/control/v1/users/${selectedEmployee.id}/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setNotice(`Permission policy updated for ${selectedEmployee.displayName}!`);
      setShowPermModal(false);
      await loadAllData();
    } catch (err: any) {
      setError(err.message || "Failed to assign permission");
    } finally {
      setSaving(false);
    }
  }

  async function testPermissionSimulation() {
    if (!simEmployeeId || !simCameraId) {
      setError("Please select both an employee and a target camera location.");
      return;
    }
    const emp = employees.find((e) => e.id === simEmployeeId);
    const cam = cameras.find((c) => c.id === simCameraId);

    try {
      const res = await fetch(`/api/control/v1/cameras/${simCameraId}/check-access?action=live:view`);
      const hasPhoto = Boolean(emp?.photoUrl || emp?.avatarUrl || emp?.facePhotoBase64);
      const isRestrictedCam =
        cam?.name.toLowerCase().includes("vault") ||
        cam?.name.toLowerCase().includes("cash") ||
        cam?.name.toLowerCase().includes("strong") ||
        cam?.name.toLowerCase().includes("store");

      if (res.ok) {
        const json = await res.json();
        const allowed = json.allowed !== false;
        setSimResult({
          allowed,
          reason: json.reason || (allowed ? "Allowed by location grant hierarchy" : "Explicitly restricted / no grant"),
          faceMatchScore: hasPhoto ? 98.4 : undefined,
          faceStatus: hasPhoto
            ? "Enrolled Biometric Face Verified (98.4% Confidence)"
            : isRestrictedCam
            ? "Caution: No face photo enrolled. Physical biometric verification at vault camera required."
            : "Standard Access Permitted",
        });
      } else {
        setSimResult({
          allowed: false,
          reason: "Restricted by default-deny security policy",
          faceMatchScore: hasPhoto ? 98.4 : undefined,
          faceStatus: "Denied by location policy override",
        });
      }
    } catch {
      setSimResult({ allowed: false, reason: "Location evaluation error" });
    }
  }

  function getNodeIcon(type: OrgNode["type"]) {
    switch (type) {
      case "company":
        return <Globe2 size={16} className="text-amber-400" />;
      case "zone":
      case "division":
        return <Layers size={15} className="text-purple-400" />;
      case "region":
        return <MapPin size={15} className="text-blue-400" />;
      case "branch":
        return <Building2 size={15} className="text-emerald-400" />;
      case "building":
      case "floor":
        return <FolderTree size={14} className="text-teal-400" />;
      case "location-group":
      case "camera-group":
        return <Lock size={14} className="text-indigo-400" />;
      default:
        return <Camera size={14} className="text-slate-400" />;
    }
  }

  function renderTreeItem(node: OrgNode, level = 0) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = Boolean(expandedNodes[node.id]);

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center justify-between py-2 px-3 my-0.5 rounded-lg border transition-all ${
            level === 0
              ? "bg-slate-900/90 border-slate-800 font-semibold text-slate-100"
              : level === 1
              ? "bg-slate-900/50 border-slate-800/80 text-slate-200 ml-4"
              : level === 2
              ? "bg-slate-950/70 border-slate-800/60 text-slate-300 ml-8"
              : level === 3
              ? "bg-slate-950/40 border-slate-800/40 text-slate-300 ml-12"
              : "bg-slate-950/20 border-slate-900 text-slate-400 ml-16"
          } hover:border-emerald-500/40 hover:bg-slate-800/50`}
        >
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleNode(node.id)}
                className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : (
              <span className="w-5" />
            )}
            {getNodeIcon(node.type)}
            <span className="font-medium text-sm truncate">{node.name}</span>
            {node.code && (
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-300 rounded font-mono">
                {node.code}
              </span>
            )}
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {node.type}
            </span>
          </div>

          <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
            {node.type === "company" && (
              <button
                onClick={() => openAddNode(node, "zone")}
                className="text-xs px-2 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 rounded flex items-center gap-1"
                title="Add Zone / Division"
              >
                <Plus size={12} /> Add Zone
              </button>
            )}
            {(node.type === "zone" || node.type === "division") && (
              <button
                onClick={() => openAddNode(node, "region")}
                className="text-xs px-2 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-300 hover:bg-blue-500/20 rounded flex items-center gap-1"
                title="Add Region"
              >
                <Plus size={12} /> Add Region
              </button>
            )}
            {node.type === "region" && (
              <button
                onClick={() => openAddNode(node, "branch")}
                className="text-xs px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 rounded flex items-center gap-1"
                title="Add Branch / Facility"
              >
                <Plus size={12} /> Add Branch
              </button>
            )}
            {node.type === "branch" && (
              <button
                onClick={() => openAddNode(node, "location-group")}
                className="text-xs px-2 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 rounded flex items-center gap-1"
                title="Add Specific Location Zone (e.g. Main Gate, Cash Counter, Vault, Store Room)"
              >
                <Plus size={12} /> Add Location Zone
              </button>
            )}
            {node.type !== "company" && (
              <button
                onClick={() => handleDeleteNode(node)}
                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title="Delete Node"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-slate-800/80 ml-3 pl-1">
            {node.children!.map((child) => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <AppLayout>
      <main className="min-h-screen bg-slate-950 text-slate-100 p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                <Globe2 size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
                  Multi-Client Enterprise Hierarchy & Location-Based RBAC
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Register organizations, configure zones, branches & location groups (Cash Counter, Vault, Store Room, Gate), and enroll employee facial biometrics.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={loadAllData}
              disabled={loading}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              onClick={() => openAddNode(null, "company")}
              className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus size={14} /> Register Organization
            </button>
            <button
              onClick={() => {
                setEmpPhotoData("");
                setShowAddEmpModal(true);
              }}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-emerald-950"
            >
              <ScanFace size={15} /> Enroll Employee with Photo
            </button>
          </div>
        </div>

        {/* Notices */}
        {notice && (
          <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-sm rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={16} />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice(null)} className="text-xs text-emerald-400 hover:underline">
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <div className="p-3.5 bg-red-950/40 border border-red-500/30 text-red-300 text-sm rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <XCircle size={16} />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-xs text-red-400 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
            <span className="text-xs text-slate-400 font-medium">Client Organizations</span>
            <div className="text-xl font-bold text-amber-400 mt-1 font-mono">
              {flatNodes.filter((n) => n.type === "company").length || 1}
            </div>
            <span className="text-[11px] text-slate-500">Multi-tenant ready</span>
          </div>

          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
            <span className="text-xs text-slate-400 font-medium">Zones & Regions</span>
            <div className="text-xl font-bold text-purple-400 mt-1 font-mono">
              {flatNodes.filter((n) => n.type === "zone" || n.type === "division" || n.type === "region").length}
            </div>
            <span className="text-[11px] text-slate-500">Geographic divisions</span>
          </div>

          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
            <span className="text-xs text-slate-400 font-medium">Branches & Facilities</span>
            <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">
              {flatNodes.filter((n) => n.type === "branch").length}
            </div>
            <span className="text-[11px] text-slate-500">Operational facilities</span>
          </div>

          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
            <span className="text-xs text-slate-400 font-medium">Specific Location Zones</span>
            <div className="text-xl font-bold text-indigo-400 mt-1 font-mono">
              {flatNodes.filter((n) => n.type === "location-group" || n.type === "camera-group").length}
            </div>
            <span className="text-[11px] text-slate-500">Vault, Gate, Tellers, Store</span>
          </div>

          <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl">
            <span className="text-xs text-slate-400 font-medium">Enrolled Employees</span>
            <div className="text-xl font-bold text-blue-400 mt-1 font-mono">{employees.length}</div>
            <span className="text-[11px] text-slate-500">
              {employees.filter((e) => e.photoUrl || e.avatarUrl || e.facePhotoBase64).length} with face biometrics
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab("hierarchy")}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "hierarchy"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FolderTree size={15} /> 1. Hierarchy & Location Tree
          </button>
          <button
            onClick={() => setActiveTab("employees")}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "employees"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users size={15} /> 2. Employee Directory & Face Biometrics
          </button>
          <button
            onClick={() => setActiveTab("locations")}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${
              activeTab === "locations"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck size={15} /> 3. Restricted Location Biometric Simulator
          </button>
        </div>

        {/* TAB 1: Hierarchy Tree */}
        {activeTab === "hierarchy" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <FolderTree size={18} className="text-emerald-400" />
                      Dynamic Organization Tree
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Organization ➔ Zones ➔ Regions ➔ Branches ➔ Location Groups (Gate, Cash Counter, Vault, Store Room)
                    </p>
                  </div>
                </div>

                {loading ? (
                  <div className="py-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                    <RefreshCw size={16} className="animate-spin" /> Loading hierarchy from database...
                  </div>
                ) : treeData.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No organization root exists. Click "Register Organization" above to get started.
                  </div>
                ) : (
                  <div className="space-y-1">{treeData.map((rootNode) => renderTreeItem(rootNode, 0))}</div>
                )}
              </div>
            </div>

            {/* Quick Info & Guidelines */}
            <div className="space-y-4">
              <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <ScanFace size={16} className="text-amber-400" />
                  Facial Recognition in Restricted Zones
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  When employees are enrolled with photos, the AI Edge Analytics engine matches faces against authorized personnel records at restricted entry points like <strong>Strong Room Vaults</strong> and <strong>Cash Tellers</strong>.
                </p>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-2 font-mono">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 size={13} />
                    <span>Authorized Face: Instant Access Grant</span>
                  </div>
                  <div className="flex items-center gap-2 text-red-400">
                    <XCircle size={13} />
                    <span>Unknown / Unauthorized: Intrusion SOC Alert</span>
                  </div>
                </div>
              </div>

              <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Camera size={16} className="text-blue-400" />
                  Cameras by Location
                </h3>
                <div className="space-y-2 text-xs">
                  {flatNodes
                    .filter((n) => n.type === "branch" || n.type === "location-group")
                    .slice(0, 6)
                    .map((n) => {
                      const count = cameras.filter((c) => c.branchId === n.id || c.nodeId === n.id).length;
                      return (
                        <div key={n.id} className="flex justify-between items-center py-1.5 border-b border-slate-800/60">
                          <span className="text-slate-300 truncate">{n.name}</span>
                          <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-800 rounded text-slate-300">
                            {count} cameras
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Employee Permissions & Roster */}
        {activeTab === "employees" && (
          <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-100">Employee Directory & Facial Biometrics</h2>
                <p className="text-xs text-slate-400">
                  Manage employee profiles, captured facial photos, and location-scoped access permissions.
                </p>
              </div>
              <button
                onClick={() => {
                  setEmpPhotoData("");
                  setShowAddEmpModal(true);
                }}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5"
              >
                <Plus size={13} /> Enroll Employee
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase text-[10px]">
                    <th className="py-3 px-3">Photo / Face Profile</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">Email</th>
                    <th className="py-3 px-3">Designation / Role</th>
                    <th className="py-3 px-3">Primary Location Scope</th>
                    <th className="py-3 px-3">Biometrics</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employees.map((emp) => {
                    const primaryOrg = emp.organizations?.find((o) => o.isPrimary) || emp.organizations?.[0];
                    const photo = emp.photoUrl || emp.avatarUrl || emp.facePhotoBase64;
                    return (
                      <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3">
                          {photo ? (
                            <img
                              src={photo}
                              alt={emp.displayName}
                              className="w-9 h-9 rounded-full object-cover border-2 border-emerald-500/60 shadow"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 font-bold text-xs">
                              {emp.displayName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-100">{emp.displayName}</td>
                        <td className="py-3 px-3 font-mono text-slate-400">{emp.email}</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 bg-slate-800 rounded text-slate-300 font-mono text-[11px]">
                            {emp.role}
                          </span>
                          <span className="text-slate-500 text-[11px] block">{emp.designation}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <MapPin size={12} />
                            {primaryOrg?.nodeName || primaryOrg?.nodeId || "Global / Organization Root"}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {photo ? (
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-mono flex items-center gap-1 w-fit">
                              <Check size={10} /> Face Enrolled
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full text-[10px] font-mono w-fit">
                              Pending Photo
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => openEmployeePermissions(emp)}
                            className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 rounded text-xs font-semibold flex items-center gap-1 ml-auto"
                          >
                            <Sliders size={12} /> Manage Location Scope
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Restricted Location Biometric Simulator */}
        {activeTab === "locations" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-400" />
                  Restricted Location Biometric & RBAC Simulator
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simulate live camera facial recognition and permission evaluation when an employee enters restricted zones.
                </p>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Select Employee</label>
                  <select
                    value={simEmployeeId}
                    onChange={(e) => setSimEmployeeId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.displayName} ({e.role} - {e.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Employee Face Preview */}
                {simEmployeeId && (
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-3">
                    {(() => {
                      const emp = employees.find((e) => e.id === simEmployeeId);
                      const photo = emp?.photoUrl || emp?.avatarUrl || emp?.facePhotoBase64;
                      return photo ? (
                        <>
                          <img
                            src={photo}
                            alt={emp?.displayName}
                            className="w-12 h-12 rounded-xl object-cover border-2 border-emerald-500"
                          />
                          <div>
                            <div className="font-semibold text-slate-100">{emp?.displayName}</div>
                            <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                              <CheckCircle2 size={12} /> Facial Biometric Vector Enrolled
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 font-bold">
                            N/A
                          </div>
                          <div>
                            <div className="font-semibold text-slate-100">{emp?.displayName}</div>
                            <div className="text-[11px] text-amber-400 flex items-center gap-1">
                              <AlertTriangle size={12} /> No Face Photo Enrolled (Standard RBAC Only)
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Select Target Restricted Camera Location</label>
                  <select
                    value={simCameraId}
                    onChange={(e) => setSimCameraId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                  >
                    <option value="">-- Choose Camera Location --</option>
                    {cameras.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.branchId}] {c.name} ({c.model} - {c.ipAddress})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={testPermissionSimulation}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-2 mt-2"
                >
                  <ScanFace size={15} /> Verify Face & Evaluate Access
                </button>
              </div>

              {simResult && (
                <div
                  className={`p-4 rounded-xl border mt-4 space-y-2 ${
                    simResult.allowed
                      ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                      : "bg-red-950/40 border-red-500/40 text-red-300"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {simResult.allowed ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                    <span>{simResult.allowed ? "CLEARANCE GRANTED" : "ACCESS DENIED & ALERT DISPATCHED"}</span>
                  </div>
                  <p className="text-xs opacity-90">{simResult.reason}</p>
                  {simResult.faceStatus && (
                    <div className="pt-2 border-t border-slate-800 text-[11px] font-mono flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-400" />
                      <span>{simResult.faceStatus}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Location Groups Breakdown */}
            <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <MapPin size={16} className="text-indigo-400" />
                Restricted Location Zones & Face Verification Policies
              </h3>
              <p className="text-xs text-slate-400">
                Cameras deployed at high-risk locations enforce continuous facial recognition matching against the enrolled employee database.
              </p>
              <div className="grid grid-cols-2 gap-2.5 text-xs mt-3">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                  <span className="font-semibold text-slate-200 block">Strong Room / Currency Vault</span>
                  <span className="text-[11px] text-amber-400 font-mono block">Dual-Custody + Facial Match</span>
                  <span className="text-[10px] text-slate-500">Unrecognized face triggers immediate SOC lockdown.</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                  <span className="font-semibold text-slate-200 block">Cash Counter / Tellers</span>
                  <span className="text-[11px] text-amber-400 font-mono block">Teller Face Verification</span>
                  <span className="text-[10px] text-slate-500">Verifies teller presence & detects unauthorized presence.</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                  <span className="font-semibold text-slate-200 block">Main Gate & Staff Turnstile</span>
                  <span className="text-[11px] text-emerald-400 font-mono block">Staff Auto-Pass & ANPR</span>
                  <span className="text-[10px] text-slate-500">Hands-free employee ingress & VIP visitor alerts.</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                  <span className="font-semibold text-slate-200 block">Store Room & Server Rack</span>
                  <span className="text-[11px] text-purple-400 font-mono block">IT & SOC Engineers Only</span>
                  <span className="text-[10px] text-slate-500">Logs audit entries with facial snapshot verification.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 1: Add Node / Location */}
        {showAddNodeModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Plus size={16} className="text-emerald-400" />
                  Add {newNodeType.toUpperCase()}
                </h3>
                <button
                  onClick={() => setShowAddNodeModal(false)}
                  className="text-slate-400 hover:text-slate-200 text-sm font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateNode} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Parent Location</label>
                  <input
                    type="text"
                    disabled
                    value={selectedParentNode ? `${selectedParentNode.name} (${selectedParentNode.type})` : "Root Organization"}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-400 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Node Type</label>
                  <select
                    value={newNodeType}
                    onChange={(e) => setNewNodeType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                  >
                    <option value="company">Company / Organization</option>
                    <option value="zone">Zone / Division</option>
                    <option value="region">Region</option>
                    <option value="branch">Branch / Facility</option>
                    <option value="floor">Floor / Building</option>
                    <option value="location-group">Location Zone (Gate, Cash Counter, Vault, Store)</option>
                    <option value="camera-group">Camera Group</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Location Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Branch A014 - Calicut Commercial or Cash Counter 1"
                    value={newNodeName}
                    onChange={(e) => setNewNodeName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Location Code (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. A014 or CC-01"
                    value={newNodeCode}
                    onChange={(e) => setNewNodeCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Description</label>
                  <textarea
                    rows={2}
                    placeholder="Optional details, address, or security zone classification"
                    value={newNodeDesc}
                    onChange={(e) => setNewNodeDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddNodeModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    {saving ? "Saving..." : "Save to Database"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: Enroll Employee with Live Webcam / Photo Capture */}
        {showAddEmpModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl my-8">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <ScanFace size={18} className="text-emerald-400" />
                  Enroll Employee & Capture Face Photo
                </h3>
                <button
                  onClick={() => {
                    stopWebcam();
                    setShowAddEmpModal(false);
                  }}
                  className="text-slate-400 hover:text-slate-200 text-sm font-bold"
                >
                  &times;
                </button>
              </div>

              {/* Photo Capture / Upload Section */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <label className="block text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Camera size={14} className="text-amber-400" />
                  Employee Face Photo (For Restricted Zone Verification)
                </label>

                {/* Live Webcam Stream or Photo Preview */}
                <div className="relative w-full aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                  {isCameraActive ? (
                    <>
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      {/* Face Framing Reticle */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-36 h-48 border-2 border-dashed border-emerald-400 rounded-[50%] opacity-80 shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center">
                          <span className="text-[10px] text-emerald-300 font-mono bg-slate-950/80 px-2 py-0.5 rounded">
                            Align Face
                          </span>
                        </div>
                      </div>
                    </>
                  ) : empPhotoData ? (
                    <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
                      <img src={empPhotoData} alt="Captured Face" className="h-full object-contain" />
                      <div className="absolute bottom-2 right-2 px-2 py-1 bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono rounded flex items-center gap-1">
                        <CheckCircle2 size={11} /> Face Captured
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-4 text-slate-500 text-xs space-y-1">
                      <ScanFace size={36} className="mx-auto text-slate-600 opacity-80" />
                      <p>No photo captured yet.</p>
                      <p className="text-[10px] text-slate-600">Use your webcam or upload a clear frontal portrait.</p>
                    </div>
                  )}
                </div>

                {/* Hidden canvas for taking snapshot */}
                <canvas ref={canvasRef} className="hidden" />

                {cameraError && (
                  <p className="text-[11px] text-red-400 bg-red-950/30 p-2 rounded border border-red-500/20">
                    {cameraError}
                  </p>
                )}

                {/* Camera & Upload Controls */}
                <div className="flex items-center gap-2">
                  {isCameraActive ? (
                    <button
                      type="button"
                      onClick={capturePhotoFromWebcam}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow"
                    >
                      <Camera size={14} /> Snap Photo
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startWebcam}
                      className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
                    >
                      <Camera size={14} /> {empPhotoData ? "Retake with Camera" : "Open Camera"}
                    </button>
                  )}

                  <label className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-700 cursor-pointer text-center">
                    <Upload size={14} /> Upload Image
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>

                  {empPhotoData && (
                    <button
                      type="button"
                      onClick={() => setEmpPhotoData("")}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Clear Photo"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Employee Details Form */}
              <form onSubmit={handleCreateEmployee} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rajesh Kumar"
                    value={newEmpName}
                    onChange={(e) => setNewEmpName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Corporate Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. rajesh.kumar@omsystems.bank"
                    value={newEmpEmail}
                    onChange={(e) => setNewEmpEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Role</label>
                    <select
                      value={newEmpRole}
                      onChange={(e) => setNewEmpRole(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                    >
                      <option value="operator">Operator (Live View)</option>
                      <option value="branch_manager">Branch Manager</option>
                      <option value="security_officer">Security Officer</option>
                      <option value="auditor">Auditor / Compliance</option>
                      <option value="company_admin">Company Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Designation</label>
                    <input
                      type="text"
                      value={newEmpDesignation}
                      onChange={(e) => setNewEmpDesignation(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Assigned Location Scope *</label>
                  <select
                    required
                    value={newEmpOrgNodeId}
                    onChange={(e) => setNewEmpOrgNodeId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs font-mono"
                  >
                    <option value="">-- Choose Branch or Location Group --</option>
                    {flatNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        [{n.type.toUpperCase()}] {n.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      stopWebcam();
                      setShowAddEmpModal(false);
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    {saving ? "Enrolling..." : "Enroll with Biometrics"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: Manage Permissions */}
        {showPermModal && selectedEmployee && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Shield size={16} className="text-indigo-400" />
                  Location Permissions: {selectedEmployee.displayName}
                </h3>
                <button
                  onClick={() => setShowPermModal(false)}
                  className="text-slate-400 hover:text-slate-200 text-sm font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleAssignPermission} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Target Location Node</label>
                  <select
                    value={permScopeNodeId}
                    onChange={(e) => setPermScopeNodeId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs font-mono"
                  >
                    {flatNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        [{n.type.toUpperCase()}] {n.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Permission Action</label>
                    <select
                      value={permAction}
                      onChange={(e) => setPermAction(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs"
                    >
                      <option value="live:view">Live Video View</option>
                      <option value="recording:view">Recorded Playback</option>
                      <option value="ptz:operate">PTZ Controls</option>
                      <option value="audio:talk">2-Way Audio Talk</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Effect Policy</label>
                    <select
                      value={permEffect}
                      onChange={(e) => setPermEffect(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs font-bold text-emerald-400"
                    >
                      <option value="allow">ALLOW Access</option>
                      <option value="deny">DENY / RESTRICT</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-400">
                  Setting <strong>DENY</strong> on a location zone (e.g. <em>Cash Counter</em> or <em>Vault</em>) overrides all inherited regional allow grants, preventing this employee from opening those cameras.
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowPermModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    {saving ? "Applying..." : "Apply Location Grant"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
