"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { organizationApi } from "@/lib/api-client";

interface OrgNodeFormProps {
  parentNode?: { id: string; name: string; type: string };
  editNode?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

const NODE_TYPES = [
  { value: "company", label: "Company" },
  { value: "headquarters", label: "Headquarters" },
  { value: "zone", label: "Zone" },
  { value: "region", label: "Region" },
  { value: "area", label: "Area" },
  { value: "branch", label: "Branch" },
];

export function OrgNodeForm({
  parentNode,
  editNode,
  onSuccess,
  onCancel,
}: OrgNodeFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    nodeType: "",
    description: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
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
        country: editNode.address?.country || "",
        phone: editNode.contactInfo?.phone || "",
        email: editNode.contactInfo?.email || "",
        contactPerson: editNode.contactInfo?.contactPerson || "",
      });
    }
  }, [editNode]);

  useEffect(() => {
    if (parentNode && !editNode) {
      // Validate which node types can be children
      validateHierarchy();
    } else if (!parentNode && !editNode) {
      // Root node - only company allowed
      setValidNodeTypes(["company"]);
    }
  }, [parentNode, editNode]);

  const validateHierarchy = async () => {
    if (!parentNode) return;

    const results = await Promise.all(
      NODE_TYPES.map(async (type) => {
        try {
          const result = await organizationApi.validateHierarchy(
            parentNode.id,
            type.value
          );
          return result.valid ? type.value : null;
        } catch {
          return null;
        }
      })
    );

    setValidNodeTypes(results.filter((t) => t !== null) as string[]);
    
    // Auto-select first valid type
    const firstValid = results.find((type) => type !== null);
    if (firstValid) {
      setFormData((prev) => ({ ...prev, nodeType: firstValid }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        code: formData.code || undefined,
        nodeType: formData.nodeType,
        description: formData.description || undefined,
        parentNodeId: parentNode?.id,
        address:
          formData.street || formData.city
            ? {
                street: formData.street || undefined,
                city: formData.city || undefined,
                state: formData.state || undefined,
                postalCode: formData.postalCode || undefined,
                country: formData.country || undefined,
              }
            : undefined,
        contactInfo:
          formData.phone || formData.email
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
      setError(err.message || "Failed to save node");
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

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h2>
            {editNode ? "Edit" : "Create"} Organization Node
            {parentNode && ` under ${parentNode.name}`}
          </h2>
          <button className="icon-button" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="error-banner">{error}</div>}

          <div className="form-section">
            <h3>Basic Information</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="nodeType">
                  Node Type <span className="required">*</span>
                </label>
                <select
                  id="nodeType"
                  name="nodeType"
                  value={formData.nodeType}
                  onChange={handleChange}
                  required
                  disabled={editNode !== undefined}
                >
                  <option value="">Select type...</option>
                  {NODE_TYPES.filter(
                    (type) =>
                      validNodeTypes.length === 0 ||
                      validNodeTypes.includes(type.value)
                  ).map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="code">Code</label>
                <input
                  type="text"
                  id="code"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  placeholder="e.g., HQ001, BR-MUM-01"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="name">
                Name <span className="required">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g., Mumbai Branch, South Zone"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Optional description..."
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Address</h3>

            <div className="form-group">
              <label htmlFor="street">Street Address</label>
              <input
                type="text"
                id="street"
                name="street"
                value={formData.street}
                onChange={handleChange}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="city">City</label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="state">State/Province</label>
                <input
                  type="text"
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="postalCode">Postal Code</label>
                <input
                  type="text"
                  id="postalCode"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="country">Country</label>
                <input
                  type="text"
                  id="country"
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Contact Information</h3>

            <div className="form-group">
              <label htmlFor="contactPerson">Contact Person</label>
              <input
                type="text"
                id="contactPerson"
                name="contactPerson"
                value={formData.contactPerson}
                onChange={handleChange}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={loading}
            >
              {loading ? "Saving..." : editNode ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
