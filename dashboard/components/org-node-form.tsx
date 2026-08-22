"use client";

import { useState, useEffect } from "react";
import { X, Building2, MapPin, Layers, Globe, Shield } from "lucide-react";
import { organizationApi } from "@/lib/api-client";

interface OrgNodeFormProps {
  parentNode?: { id: string; name: string; type: string };
  editNode?: any;
  initialNodeType?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const NODE_TYPES = [
  { value: "branch", label: "🏦 Branch (e.g. MG Road Branch, InfoPark Branch, Store)" },
  { value: "area", label: "🏙️ Area (e.g. Ernakulam Area, Kozhikode Area)" },
  { value: "region", label: "📍 Region (e.g. Kerala Region, Karnataka Region)" },
  { value: "zone", label: "🌐 Zone (e.g. South Zone, North Zone)" },
  { value: "headquarters", label: "🏢 Headquarters / Head Office" },
  { value: "company", label: "🏛️ Company Root" },
];

export function OrgNodeForm({
  parentNode,
  editNode,
  initialNodeType,
  onSuccess,
  onCancel,
}: OrgNodeFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    nodeType: initialNodeType || "branch",
    description: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
    phone: "",
    email: "",
    contactPerson: "",
  });

  const [validNodeTypes, setValidNodeTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editNode) {
      setFormData({
        name: editNode.name || "",
        code: editNode.code || "",
        nodeType: editNode.type || "",
        description: editNode.description || "",
        street: editNode.address?.street || "",
        city: editNode.address?.city || "",
        state: editNode.address?.state || "",
        postalCode: editNode.address?.postalCode || "",
        country: editNode.address?.country || "India",
        phone: editNode.contactInfo?.phone || "",
        email: editNode.contactInfo?.email || "",
        contactPerson: editNode.contactInfo?.contactPerson || "",
      });
    }
  }, [editNode]);

  useEffect(() => {
    if (parentNode && !editNode) {
      validateHierarchy();
    } else if (!parentNode && !editNode) {
      setValidNodeTypes(["company"]);
    }
  }, [parentNode, editNode]);

  const validateHierarchy = async () => {
    if (!parentNode) return;

    // Standard fallback allowed child types based on parent node type
    const parentType = (parentNode.type || "company").toLowerCase();
    const standardHierarchyMap: Record<string, string[]> = {
      company: ["headquarters", "zone", "region", "area", "branch"],
      headquarters: ["zone", "region", "area", "branch"],
      zone: ["region", "area", "branch"],
      region: ["area", "branch"],
      area: ["branch"],
      branch: [],
    };
    const defaultAllowed = standardHierarchyMap[parentType] || ["zone", "region", "area", "branch"];

    try {
      const results = await Promise.all(
        NODE_TYPES.map(async (type) => {
          try {
            const result = await organizationApi.validateHierarchy(
              parentNode.id,
              type.value
            );
            return result.valid ? type.value : null;
          } catch {
            return defaultAllowed.includes(type.value) ? type.value : null;
          }
        })
      );

      const computed = results.filter((t) => t !== null) as string[];
      const finalTypes = computed.length > 0 ? computed : defaultAllowed;
      setValidNodeTypes(finalTypes);

      if (initialNodeType && finalTypes.includes(initialNodeType)) {
        setFormData((prev) => ({ ...prev, nodeType: initialNodeType }));
      } else if (!formData.nodeType || !finalTypes.includes(formData.nodeType)) {
        setFormData((prev) => ({ ...prev, nodeType: finalTypes[0] || "branch" }));
      }
    } catch {
      setValidNodeTypes(defaultAllowed);
      if (initialNodeType && defaultAllowed.includes(initialNodeType)) {
        setFormData((prev) => ({ ...prev, nodeType: initialNodeType }));
      } else {
        setFormData((prev) => ({ ...prev, nodeType: defaultAllowed[0] || "branch" }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!formData.nodeType) {
      setError("Please select a valid Node Type");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code?.trim() || undefined,
        nodeType: formData.nodeType,
        description: formData.description?.trim() || undefined,
        parentNodeId: parentNode?.id,
        address:
          formData.street || formData.city || formData.state || formData.postalCode
            ? {
                street: formData.street || undefined,
                city: formData.city || undefined,
                state: formData.state || undefined,
                postalCode: formData.postalCode || undefined,
                country: formData.country || "India",
              }
            : undefined,
        contactInfo:
          formData.phone || formData.email || formData.contactPerson
            ? {
                phone: formData.phone || undefined,
                email: formData.email || undefined,
                contactPerson: formData.contactPerson || undefined,
              }
            : undefined,
      };

      if (editNode) {
        await organizationApi.updateNode(editNode.id, payload);
      } else {
        await organizationApi.createNode(payload);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to save organization node");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const activeAllowedTypes =
    validNodeTypes.length > 0
      ? NODE_TYPES.filter((t) => validNodeTypes.includes(t.value))
      : NODE_TYPES.filter((t) => t.value !== "company");

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-container" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Building2 size={20} className="text-blue-600" />
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
              {editNode ? "Edit Node" : `Add New ${formData.nodeType.toUpperCase() || "Node"}`}
              {parentNode && (
                <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "#64748b", marginLeft: "0.5rem" }}>
                  under {parentNode.name} ({parentNode.type})
                </span>
              )}
            </h2>
          </div>
          <button className="icon-button" onClick={onCancel} title="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {error && (
              <div className="error-alert" style={{ background: "#fee2e2", border: "1px solid #ef4444", color: "#991b1b", padding: "0.75rem", borderRadius: "0.375rem" }}>
                {error}
              </div>
            )}

            {/* Node Type Selector Pills */}
            {!editNode && (
              <div className="form-group">
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "#334155", marginBottom: "0.5rem", display: "block" }}>
                  Select Node Level / Type <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {activeAllowedTypes.map((type) => {
                    const isSelected = formData.nodeType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, nodeType: type.value }))}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.375rem",
                          padding: "0.5rem 0.875rem",
                          fontSize: "0.8125rem",
                          fontWeight: isSelected ? 700 : 500,
                          borderRadius: "0.5rem",
                          border: isSelected ? "2px solid #2563eb" : "1px solid #cbd5e1",
                          background: isSelected ? "#eff6ff" : "#ffffff",
                          color: isSelected ? "#1d4ed8" : "#475569",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {type.label.split(" (")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="form-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label htmlFor="name" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#334155" }}>
                  {formData.nodeType === "branch" ? "Branch Name" : `${formData.nodeType.toUpperCase()} Name`}{" "}
                  <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder={
                    formData.nodeType === "branch"
                      ? "e.g., MG Road Main Branch"
                      : formData.nodeType === "zone"
                      ? "e.g., South Zone"
                      : formData.nodeType === "region"
                      ? "e.g., Kerala Region"
                      : "e.g., Kochi Central Area"
                  }
                  style={{ width: "100%", padding: "0.625rem", borderRadius: "0.375rem", border: "1px solid #cbd5e1", color: "#0f172a", background: "#ffffff" }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="code" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#334155" }}>
                  Code / ID
                </label>
                <input
                  type="text"
                  id="code"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  placeholder="e.g., BR-MUM-01, ZN-S01"
                  style={{ width: "100%", padding: "0.625rem", borderRadius: "0.375rem", border: "1px solid #cbd5e1", color: "#0f172a", background: "#ffffff" }}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="description" style={{ fontSize: "0.875rem", fontWeight: 600, color: "#334155" }}>
                Description
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={2}
                placeholder="Optional operational details, facilities, or notes..."
                style={{ width: "100%", padding: "0.625rem", borderRadius: "0.375rem", border: "1px solid #cbd5e1", color: "#0f172a", background: "#ffffff" }}
              />
            </div>

            {/* Address & Contact Information */}
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <MapPin size={16} /> Location & Address
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <input
                    type="text"
                    name="street"
                    value={formData.street}
                    onChange={handleChange}
                    placeholder="Street / Building / Landmark"
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #cbd5e1", color: "#0f172a", background: "#ffffff" }}
                  />
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="City (e.g. Kochi, Mumbai)"
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #cbd5e1", color: "#0f172a", background: "#ffffff" }}
                  />
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    placeholder="State (e.g. Kerala, Maharashtra)"
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #cbd5e1", color: "#0f172a", background: "#ffffff" }}
                  />
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleChange}
                    placeholder="Postal / PIN Code"
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #cbd5e1", color: "#0f172a", background: "#ffffff" }}
                  />
                </div>
                <div className="form-group">
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Branch Contact Phone"
                    style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem", border: "1px solid #cbd5e1", color: "#0f172a", background: "#ffffff" }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", padding: "1rem 1.5rem", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
              disabled={loading}
              style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid #cbd5e1", background: "#ffffff", color: "#475569", fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ padding: "0.5rem 1.25rem", borderRadius: "0.375rem", border: "none", background: "#2563eb", color: "#ffffff", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              {loading ? "Saving..." : editNode ? "Update Node" : `Save ${formData.nodeType.toUpperCase()}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
