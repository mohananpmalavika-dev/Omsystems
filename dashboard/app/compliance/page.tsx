"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Shield, Plus, FileText, Calendar, CheckCircle, 
  AlertCircle, Loader2, Search, Filter 
} from "lucide-react";
import { complianceApi } from "@/lib/api-client";
import type { ComplianceFramework } from "@/lib/types";

export default function CompliancePage() {
  const [frameworks, setFrameworks] = useState<ComplianceFramework[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", source: "", description: "" });
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await complianceApi.listFrameworks();
      setFrameworks(response.data as ComplianceFramework[]);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to load compliance frameworks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createFramework(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await complianceApi.createFramework({
        name: form.name,
        source: form.source || undefined,
        description: form.description || undefined,
      });
      setFrameworks((prev) => [created, ...prev]);
      setForm({ name: "", source: "", description: "" });
      setShowForm(false);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to create framework");
    }
  }

  const filteredFrameworks = frameworks.filter(
    (fw) =>
      fw.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fw.source?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="compliance-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <div className="header-title">
            <Shield size={32} className="header-icon" />
            <div>
              <h1>Compliance Frameworks</h1>
              <p className="header-subtitle">
                Manage regulatory compliance and security standards
              </p>
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus size={18} />
            New Framework
          </button>
        </div>
      </header>

      <div className="page-content">
        {/* Create Framework Card */}
        {showForm && (
          <div className="card create-framework-card">
            <div className="card-header">
              <h2>Create New Framework</h2>
              <button
                className="btn-icon"
                onClick={() => setShowForm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={createFramework} className="framework-form">
              <div className="form-group">
                <label htmlFor="name">
                  Framework Name <span className="required">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  className="form-input"
                  placeholder="e.g., ISO 27001 Information Security"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="source">Source Standard</label>
                <input
                  id="source"
                  type="text"
                  className="form-input"
                  placeholder="e.g., ISO 27001:2013"
                  value={form.source}
                  onChange={(event) =>
                    setForm({ ...form, source: event.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  className="form-textarea"
                  placeholder="Describe the framework and its purpose..."
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </div>

              {error && (
                <div className="alert alert-error">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  <CheckCircle size={18} />
                  Create Framework
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Frameworks List */}
        <div className="card frameworks-card">
          <div className="card-header">
            <h2>
              All Frameworks
              <span className="count-badge">{frameworks.length}</span>
            </h2>
            <div className="search-box">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search frameworks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="loading-state">
              <Loader2 size={32} className="spinner" />
              <p>Loading frameworks...</p>
            </div>
          ) : filteredFrameworks.length === 0 ? (
            <div className="empty-state">
              <Shield size={64} className="empty-icon" />
              <h3>No compliance frameworks found</h3>
              <p>
                {searchQuery
                  ? "Try adjusting your search query"
                  : "Get started by creating your first compliance framework"}
              </p>
              {!searchQuery && (
                <button
                  className="btn-primary"
                  onClick={() => setShowForm(true)}
                >
                  <Plus size={18} />
                  Create Framework
                </button>
              )}
            </div>
          ) : (
            <div className="frameworks-grid">
              {filteredFrameworks.map((framework) => (
                <Link
                  key={framework.id}
                  href={`/compliance/${framework.id}`}
                  className="framework-card"
                >
                  <div className="framework-icon">
                    <FileText size={24} />
                  </div>
                  <div className="framework-content">
                    <h3>{framework.name}</h3>
                    {framework.source && (
                      <p className="framework-source">{framework.source}</p>
                    )}
                    {framework.description && (
                      <p className="framework-description">
                        {framework.description}
                      </p>
                    )}
                    <div className="framework-meta">
                      <Calendar size={14} />
                      <span>
                        Created {new Date(framework.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .compliance-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 2rem;
        }

        .page-header {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .header-icon {
          color: #667eea;
        }

        .page-header h1 {
          margin: 0;
          font-size: 2rem;
          color: #1a202c;
        }

        .header-subtitle {
          margin: 0.25rem 0 0;
          color: #718096;
          font-size: 0.95rem;
        }

        .page-content {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .card {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .card-header h2 {
          margin: 0;
          font-size: 1.5rem;
          color: #1a202c;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #667eea;
          color: white;
          border-radius: 12px;
          padding: 0.25rem 0.75rem;
          font-size: 0.875rem;
          font-weight: 600;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #f7fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 0.5rem 1rem;
          min-width: 300px;
        }

        .search-box input {
          border: none;
          background: transparent;
          outline: none;
          flex: 1;
          font-size: 0.95rem;
        }

        .framework-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          font-weight: 600;
          color: #2d3748;
          font-size: 0.95rem;
        }

        .required {
          color: #e53e3e;
        }

        .form-input,
        .form-textarea {
          padding: 0.75rem 1rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 1rem;
          transition: all 0.2s;
        }

        .form-input:focus,
        .form-textarea:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-textarea {
          resize: vertical;
          font-family: inherit;
        }

        .form-actions {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
        }

        .btn-primary,
        .btn-secondary {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .btn-secondary {
          background: white;
          color: #4a5568;
          border: 1px solid #e2e8f0;
        }

        .btn-secondary:hover {
          background: #f7fafc;
        }

        .btn-icon {
          background: transparent;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #718096;
          padding: 0.25rem;
          line-height: 1;
        }

        .btn-icon:hover {
          color: #2d3748;
        }

        .alert {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: 8px;
          font-size: 0.95rem;
        }

        .alert-error {
          background: #fff5f5;
          color: #c53030;
          border: 1px solid #feb2b2;
        }

        .loading-state,
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          text-align: center;
        }

        .spinner {
          animation: spin 1s linear infinite;
          color: #667eea;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .loading-state p {
          margin-top: 1rem;
          color: #718096;
        }

        .empty-icon {
          color: #cbd5e0;
          margin-bottom: 1rem;
        }

        .empty-state h3 {
          margin: 0 0 0.5rem;
          color: #2d3748;
          font-size: 1.25rem;
        }

        .empty-state p {
          margin: 0 0 1.5rem;
          color: #718096;
        }

        .frameworks-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }

        .framework-card {
          display: flex;
          gap: 1rem;
          padding: 1.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          transition: all 0.2s;
          text-decoration: none;
          color: inherit;
          background: white;
        }

        .framework-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
          border-color: #667eea;
        }

        .framework-icon {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 10px;
          color: white;
        }

        .framework-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .framework-content h3 {
          margin: 0;
          font-size: 1.125rem;
          color: #1a202c;
        }

        .framework-source {
          margin: 0;
          font-size: 0.875rem;
          color: #667eea;
          font-weight: 600;
        }

        .framework-description {
          margin: 0;
          font-size: 0.875rem;
          color: #718096;
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .framework-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: auto;
          font-size: 0.8125rem;
          color: #a0aec0;
        }

        @media (max-width: 768px) {
          .compliance-page {
            padding: 1rem;
          }

          .page-header {
            padding: 1.5rem;
          }

          .header-content {
            flex-direction: column;
            align-items: stretch;
          }

          .search-box {
            min-width: 100%;
          }

          .frameworks-grid {
            grid-template-columns: 1fr;
          }

          .form-actions {
            flex-direction: column-reverse;
          }

          .btn-primary,
          .btn-secondary {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
