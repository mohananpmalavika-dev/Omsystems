"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Package,
  Shield,
  FileText,
  Download,
  Lock,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  MapPin,
  Hash,
  Eye,
  FileCheck,
  Fingerprint,
} from "lucide-react";

interface EvidencePackage {
  id: string;
  packageNumber: string;
  incidentId: string;
  title: string;
  description?: string;
  packageType: string;
  status: string;
  collectionProgress: number;
  totalItems: number;
  totalSizeBytes: number;
  manifestHash: string;
  packageHash?: string;
  digitallySigned: boolean;
  signedBy?: string;
  signedAt?: string;
  currentCustodian?: string;
  createdBy: string;
  createdAt: string;
  encrypted: boolean;
  chainOfCustody: ChainOfCustodyEvent[];
}

interface ChainOfCustodyEvent {
  id: string;
  eventType: string;
  timestamp: string;
  performedBy: string;
  sourceIp?: string;
  transferredTo?: string;
  purpose?: string;
  notes?: string;
}

interface EvidenceItem {
  id: string;
  itemType: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  checksumValue: string;
  classification: string;
  capturedAt?: string;
}

export function AIEvidenceBuilder({ incidentId }: { incidentId: string }) {
  const [packages, setPackages] = useState<EvidencePackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<EvidencePackage | null>(null);
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Package creation form
  const [packageConfig, setPackageConfig] = useState({
    title: "",
    packageType: "investigation",
    includeOriginalVideo: true,
    includeInvestigationClips: true,
    includeSnapshots: true,
    includeTimeline: true,
    includeAlertLogs: true,
    includeDocuments: true,
    encrypted: false,
  });

  useEffect(() => {
    loadPackages();
  }, [incidentId]);

  const loadPackages = async () => {
    setLoading(true);
    try {
      // Would fetch packages for this incident
      // const response = await fetch(`/api/v1/incidents/${incidentId}/evidence-packages`);
      // const data = await response.json();
      // setPackages(data);
    } catch (error) {
      console.error("Failed to load packages:", error);
    } finally {
      setLoading(false);
    }
  };

  const createPackage = async (type: string) => {
    setLoading(true);
    try {
      let endpoint = "";
      const body: any = { incidentId };

      if (type === "court") {
        endpoint = "/api/v1/ai/evidence-packages/court";
      } else if (type === "police") {
        endpoint = "/api/v1/ai/evidence-packages/police";
      } else if (type === "insurance") {
        endpoint = "/api/v1/ai/evidence-packages/insurance";
      } else {
        endpoint = "/api/v1/ai/evidence-packages";
        body.title = packageConfig.title;
        body.packageType = packageConfig.packageType;
        body.includeOriginalVideo = packageConfig.includeOriginalVideo;
        body.includeInvestigationClips = packageConfig.includeInvestigationClips;
        body.includeSnapshots = packageConfig.includeSnapshots;
        body.includeTimeline = packageConfig.includeTimeline;
        body.includeAlertLogs = packageConfig.includeAlertLogs;
        body.includeDocuments = packageConfig.includeDocuments;
        body.encrypted = packageConfig.encrypted;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      setSelectedPackage(data);
      setShowCreateDialog(false);
      await loadPackages();
    } catch (error) {
      console.error("Failed to create package:", error);
    } finally {
      setLoading(false);
    }
  };

  const collectEvidence = async (packageId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/ai/evidence-packages/${packageId}/collect`, {
        method: "POST",
      });
      const data = await response.json();
      setSelectedPackage(data);
    } catch (error) {
      console.error("Failed to collect evidence:", error);
    } finally {
      setLoading(false);
    }
  };

  const verifyIntegrity = async (packageId: string) => {
    try {
      const response = await fetch(`/api/v1/ai/evidence-packages/${packageId}/verify`);
      const data = await response.json();
      
      if (data.valid) {
        alert("✓ Package integrity verified successfully");
      } else {
        alert(`✗ Integrity verification failed:\n${data.issues.join("\n")}`);
      }
    } catch (error) {
      console.error("Failed to verify integrity:", error);
    }
  };

  const signPackage = async (packageId: string) => {
    setLoading(true);
    try {
      await fetch(`/api/v1/ai/evidence-packages/${packageId}/sign`, {
        method: "POST",
      });
      await loadPackages();
      if (selectedPackage?.id === packageId) {
        // Reload selected package
      }
    } catch (error) {
      console.error("Failed to sign package:", error);
    } finally {
      setLoading(false);
    }
  };

  const downloadPackage = async (packageId: string) => {
    try {
      await fetch(`/api/v1/ai/evidence-packages/${packageId}/download`, {
        method: "POST",
      });
      // Trigger actual download
      window.location.href = `/api/v1/ai/evidence-packages/${packageId}/export`;
    } catch (error) {
      console.error("Failed to download package:", error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-green-500";
      case "collecting":
        return "bg-blue-500";
      case "draft":
        return "bg-gray-500";
      case "downloaded":
        return "bg-purple-500";
      default:
        return "bg-gray-400";
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  if (showCreateDialog) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Create Evidence Package</CardTitle>
          <CardDescription>
            Configure evidence collection for court-ready export
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick Create Options */}
          <div>
            <h3 className="font-medium mb-3">Quick Create Templates</h3>
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant="outline"
                onClick={() => createPackage("court")}
                className="h-auto flex-col p-4"
              >
                <Shield className="h-8 w-8 mb-2 text-red-600" />
                <div className="font-medium">Court Evidence</div>
                <div className="text-xs text-gray-500">Complete package</div>
              </Button>

              <Button
                variant="outline"
                onClick={() => createPackage("police")}
                className="h-auto flex-col p-4"
              >
                <Shield className="h-8 w-8 mb-2 text-blue-600" />
                <div className="font-medium">Police Submission</div>
                <div className="text-xs text-gray-500">Standard evidence</div>
              </Button>

              <Button
                variant="outline"
                onClick={() => createPackage("insurance")}
                className="h-auto flex-col p-4"
              >
                <FileText className="h-8 w-8 mb-2 text-green-600" />
                <div className="font-medium">Insurance Claim</div>
                <div className="text-xs text-gray-500">Claim documentation</div>
              </Button>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-medium mb-3">Custom Package</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Package Title</label>
                <input
                  type="text"
                  value={packageConfig.title}
                  onChange={(e) =>
                    setPackageConfig({ ...packageConfig, title: e.target.value })
                  }
                  placeholder="Enter package title..."
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Package Type</label>
                <select
                  value={packageConfig.packageType}
                  onChange={(e) =>
                    setPackageConfig({ ...packageConfig, packageType: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="investigation">Investigation</option>
                  <option value="court-evidence">Court Evidence</option>
                  <option value="police-submission">Police Submission</option>
                  <option value="insurance-claim">Insurance Claim</option>
                  <option value="internal-audit">Internal Audit</option>
                  <option value="compliance">Compliance</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Include in Package</label>
                {[
                  { key: "includeOriginalVideo", label: "Original Video Segments" },
                  { key: "includeInvestigationClips", label: "Investigation Clips" },
                  { key: "includeSnapshots", label: "Snapshots" },
                  { key: "includeTimeline", label: "Timeline & Events" },
                  { key: "includeAlertLogs", label: "Alert Logs" },
                  { key: "includeDocuments", label: "Documents" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <Checkbox
                      checked={(packageConfig as any)[item.key]}
                      onCheckedChange={(checked) =>
                        setPackageConfig({ ...packageConfig, [item.key]: checked })
                      }
                    />
                    <label className="text-sm">{item.label}</label>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                <Lock className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  <Checkbox
                    checked={packageConfig.encrypted}
                    onCheckedChange={(checked) =>
                      setPackageConfig({ ...packageConfig, encrypted: !!checked })
                    }
                  />
                  <label className="text-sm font-medium ml-2">Encrypt Package</label>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => createPackage("custom")}
                  disabled={!packageConfig.title || loading}
                  className="flex-1"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Create Package
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (selectedPackage) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => setSelectedPackage(null)}>
                ← Back
              </Button>
              <div>
                <h2 className="text-2xl font-bold">{selectedPackage.packageNumber}</h2>
                <p className="text-gray-500">{selectedPackage.title}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={getStatusColor(selectedPackage.status)}>
              {selectedPackage.status.toUpperCase()}
            </Badge>
            {selectedPackage.digitallySigned && (
              <Badge variant="outline" className="bg-green-50 border-green-500">
                <Fingerprint className="h-3 w-3 mr-1" />
                Digitally Signed
              </Badge>
            )}
            {selectedPackage.encrypted && (
              <Badge variant="outline" className="bg-blue-50 border-blue-500">
                <Lock className="h-3 w-3 mr-1" />
                Encrypted
              </Badge>
            )}
          </div>
        </div>

        {/* Package Status */}
        {selectedPackage.status === "collecting" && (
          <Card className="border-blue-500 bg-blue-50">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Collecting Evidence...</span>
                  <span className="text-sm text-gray-600">
                    {selectedPackage.collectionProgress.toFixed(0)}%
                  </span>
                </div>
                <Progress value={selectedPackage.collectionProgress} className="h-2" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Package Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Items</CardDescription>
              <CardTitle className="text-3xl">{selectedPackage.totalItems}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                {formatBytes(selectedPackage.totalSizeBytes)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Package Type</CardDescription>
              <CardTitle className="text-xl capitalize">
                {selectedPackage.packageType.replace("-", " ")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Created {new Date(selectedPackage.createdAt).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Current Custodian</CardDescription>
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="h-5 w-5" />
                {selectedPackage.currentCustodian || selectedPackage.createdBy}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                {selectedPackage.chainOfCustody.length} custody events
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        {selectedPackage.status === "draft" && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Button
                  onClick={() => collectEvidence(selectedPackage.id)}
                  disabled={loading}
                  className="flex-1"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Collect Evidence
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedPackage.status === "ready" && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => verifyIntegrity(selectedPackage.id)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Verify Integrity
                </Button>

                {!selectedPackage.digitallySigned && (
                  <Button
                    variant="outline"
                    onClick={() => signPackage(selectedPackage.id)}
                    disabled={loading}
                  >
                    <Fingerprint className="h-4 w-4 mr-2" />
                    Apply Digital Signature
                  </Button>
                )}

                <Button
                  onClick={() => downloadPackage(selectedPackage.id)}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Package
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Integrity Verification */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Integrity Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-sm text-gray-500">Manifest Hash (SHA-256)</div>
                <div className="font-mono text-xs bg-gray-50 p-2 rounded break-all">
                  {selectedPackage.manifestHash || "Not generated"}
                </div>
              </div>
              {selectedPackage.packageHash && (
                <div className="space-y-1">
                  <div className="text-sm text-gray-500">Package Hash (SHA-256)</div>
                  <div className="font-mono text-xs bg-gray-50 p-2 rounded break-all">
                    {selectedPackage.packageHash}
                  </div>
                </div>
              )}
            </div>

            {selectedPackage.digitallySigned && (
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-medium text-green-900">Digitally Signed</div>
                    <div className="text-sm text-green-700">
                      Signed by {selectedPackage.signedBy} on{" "}
                      {selectedPackage.signedAt &&
                        new Date(selectedPackage.signedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chain of Custody */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Chain of Custody
            </CardTitle>
            <CardDescription>
              Immutable audit trail of all evidence handling ({selectedPackage.chainOfCustody.length}{" "}
              events)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedPackage.chainOfCustody.map((event, index) => (
                <div
                  key={event.id}
                  className="flex gap-4 p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex flex-col items-center">
                    <div className="rounded-full bg-blue-100 p-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                    </div>
                    {index < selectedPackage.chainOfCustody.length - 1 && (
                      <div className="w-0.5 h-full bg-blue-200 my-2" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{event.eventType}</Badge>
                      <span className="text-sm text-gray-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm">
                      <User className="h-3 w-3 inline mr-1" />
                      <span className="font-medium">{event.performedBy}</span>
                      {event.transferredTo && (
                        <span className="text-gray-600"> → {event.transferredTo}</span>
                      )}
                    </div>
                    {event.purpose && (
                      <p className="text-sm text-gray-600 mt-1">{event.purpose}</p>
                    )}
                    {event.sourceIp && (
                      <div className="text-xs text-gray-500 mt-1">
                        <MapPin className="h-3 w-3 inline mr-1" />
                        {event.sourceIp}
                      </div>
                    )}
                    {event.notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">{event.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Legal Notice */}
        <Card className="border-yellow-500 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-900">
                <div className="font-medium mb-1">Legal Evidence Notice</div>
                <p>
                  This evidence package contains original and derivative digital evidence collected
                  from a video surveillance system. All items have been preserved with cryptographic
                  integrity verification. The chain of custody has been maintained and documented.
                  This package is intended for use in legal proceedings and must be handled in
                  accordance with applicable evidence handling procedures.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Evidence Packages</h2>
          <p className="text-gray-500">Court-ready evidence with chain of custody</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Package className="h-4 w-4 mr-2" />
          Create Evidence Package
        </Button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardContent className="pt-6 text-center" onClick={() => createPackage("court")}>
            <Shield className="h-12 w-12 mx-auto mb-3 text-red-600" />
            <h3 className="font-medium mb-1">Court Evidence Package</h3>
            <p className="text-sm text-gray-500">Complete evidence for legal proceedings</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardContent className="pt-6 text-center" onClick={() => createPackage("police")}>
            <Shield className="h-12 w-12 mx-auto mb-3 text-blue-600" />
            <h3 className="font-medium mb-1">Police Submission</h3>
            <p className="text-sm text-gray-500">Standard evidence package for law enforcement</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <CardContent className="pt-6 text-center" onClick={() => createPackage("insurance")}>
            <FileText className="h-12 w-12 mx-auto mb-3 text-green-600" />
            <h3 className="font-medium mb-1">Insurance Claim</h3>
            <p className="text-sm text-gray-500">Documentation for insurance claims</p>
          </CardContent>
        </Card>
      </div>

      {/* Existing Packages */}
      {packages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Existing Packages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedPackage(pkg)}
                >
                  <div className="flex items-center gap-4">
                    <Package className="h-8 w-8 text-blue-600" />
                    <div>
                      <div className="font-medium">{pkg.packageNumber}</div>
                      <div className="text-sm text-gray-500">{pkg.title}</div>
                      <div className="text-xs text-gray-400">
                        {pkg.totalItems} items • {formatBytes(pkg.totalSizeBytes)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {pkg.digitallySigned && (
                      <Badge variant="outline" className="bg-green-50">
                        <Fingerprint className="h-3 w-3 mr-1" />
                        Signed
                      </Badge>
                    )}
                    <Badge className={getStatusColor(pkg.status)}>{pkg.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Features Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-purple-50 rounded-lg">
          <Hash className="h-8 w-8 mx-auto mb-2 text-purple-600" />
          <div className="font-medium">SHA-256 Hashing</div>
          <div className="text-sm text-gray-600">Cryptographic integrity</div>
        </div>

        <div className="text-center p-4 bg-green-50 rounded-lg">
          <Shield className="h-8 w-8 mx-auto mb-2 text-green-600" />
          <div className="font-medium">Chain of Custody</div>
          <div className="text-sm text-gray-600">Immutable audit trail</div>
        </div>

        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <Fingerprint className="h-8 w-8 mx-auto mb-2 text-blue-600" />
          <div className="font-medium">Digital Signatures</div>
          <div className="text-sm text-gray-600">Verified authenticity</div>
        </div>

        <div className="text-center p-4 bg-orange-50 rounded-lg">
          <FileCheck className="h-8 w-8 mx-auto mb-2 text-orange-600" />
          <div className="font-medium">Court Ready</div>
          <div className="text-sm text-gray-600">Legal compliance</div>
        </div>
      </div>
    </div>
  );
}
