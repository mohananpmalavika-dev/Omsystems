"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Database,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Download,
  AlertTriangle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  FileJson,
  Layers,
  Table as TableIcon,
  HardDrive,
  Cpu,
  Camera,
  Users,
  Shield,
  Activity,
  FileText,
  Save,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";

interface ColumnDef {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "json" | "datetime" | "enum";
  options?: string[];
  required?: boolean;
  readonly?: boolean;
  description?: string;
}

interface TableDef {
  id: string;
  name: string;
  category: string;
  description: string;
  primaryKey: string;
  columnCount: number;
  rowCount: number;
  columns: ColumnDef[];
}

export default function DatabaseManagerPage() {
  const [tables, setTables] = useState<TableDef[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>("cameras");
  const [loadingTables, setLoadingTables] = useState<boolean>(true);

  // Table Data State
  const [tableData, setTableData] = useState<{
    table: TableDef | null;
    rows: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>({
    table: null,
    rows: [],
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
  });
  const [loadingRows, setLoadingRows] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // Modal states
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [deletingRow, setDeletingRow] = useState<any | null>(null);
  const [viewingJson, setViewingJson] = useState<{ title: string; data: any } | null>(null);

  // Status message / toast
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Load Tables List
  const fetchTables = async () => {
    setLoadingTables(true);
    try {
      const res = await fetch("/api/control/v1/admin/database/tables", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.tables) {
          setTables(json.data.tables);
          if (json.data.tables.length > 0 && !selectedTableId) {
            setSelectedTableId(json.data.tables[0].id);
          }
        }
      }
    } catch (err: any) {
      showToast("error", `Failed to load database tables: ${err.message}`);
    } finally {
      setLoadingTables(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // Load Rows for Selected Table
  const fetchRows = async (page = 1, limit = 25, search = searchQuery) => {
    if (!selectedTableId) return;
    setLoadingRows(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (search) params.append("search", search);

      const res = await fetch(`/api/control/v1/admin/database/tables/${selectedTableId}?${params.toString()}`, {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setTableData({
            table: json.data.table,
            rows: json.data.rows || [],
            total: json.data.total || 0,
            page: json.data.page || 1,
            limit: json.data.limit || 25,
            totalPages: json.data.totalPages || 1,
          });
        }
      } else {
        showToast("error", `Error loading records from ${selectedTableId}`);
      }
    } catch (err: any) {
      showToast("error", `Failed to load table rows: ${err.message}`);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    fetchRows(1, tableData.limit, searchQuery);
  }, [selectedTableId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRows(1, tableData.limit, searchQuery);
  };

  // Delete Row Handler
  const handleDeleteRow = async () => {
    if (!deletingRow || !tableData.table) return;
    const pk = tableData.table.primaryKey;
    const rowId = deletingRow[pk];

    try {
      const res = await fetch(`/api/control/v1/admin/database/tables/${selectedTableId}/rows/${encodeURIComponent(rowId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast("success", `Record ${rowId} deleted successfully`);
        setDeletingRow(null);
        fetchRows(tableData.page, tableData.limit, searchQuery);
        fetchTables(); // update count badge
      } else {
        showToast("error", json.error || "Failed to delete record");
      }
    } catch (err: any) {
      showToast("error", `Delete failed: ${err.message}`);
    }
  };

  // Save / Update Row Handler
  const handleSaveRow = async (formData: any) => {
    if (!tableData.table) return;
    const pk = tableData.table.primaryKey;
    const isEditing = Boolean(editingRow);
    const rowId = isEditing ? editingRow[pk] : formData[pk];

    const url = isEditing
      ? `/api/control/v1/admin/database/tables/${selectedTableId}/rows/${encodeURIComponent(rowId)}`
      : `/api/control/v1/admin/database/tables/${selectedTableId}/rows`;

    const method = isEditing ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast("success", isEditing ? `Record ${rowId} updated` : "New record created successfully");
        setEditingRow(null);
        setIsCreateModalOpen(false);
        fetchRows(tableData.page, tableData.limit, searchQuery);
        fetchTables(); // update count badge
      } else {
        showToast("error", json.error || "Operation failed");
      }
    } catch (err: any) {
      showToast("error", `Save error: ${err.message}`);
    }
  };

  // Export JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tableData.rows, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${selectedTableId}_export_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!tableData.rows || tableData.rows.length === 0 || !tableData.table) return;
    const cols = tableData.table.columns.map((c) => c.name);
    const headers = cols.join(",");
    const rows = tableData.rows.map((r) =>
      cols
        .map((c) => {
          const val = r[c];
          if (val === null || val === undefined) return '""';
          if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent([headers, ...rows].join("\n"));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", csvContent);
    downloadAnchor.setAttribute("download", `${selectedTableId}_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    tables.forEach((t) => cats.add(t.category));
    return ["ALL", ...Array.from(cats)];
  }, [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter((t) => selectedCategory === "ALL" || t.category === selectedCategory);
  }, [tables, selectedCategory]);

  const currentTable = useMemo(() => {
    return tables.find((t) => t.id === selectedTableId) || tableData.table;
  }, [tables, selectedTableId, tableData.table]);

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "Core Topology":
        return <Layers className="w-4 h-4 text-sky-400" />;
      case "Surveillance":
        return <Camera className="w-4 h-4 text-emerald-400" />;
      case "Edge & Fleet":
        return <Cpu className="w-4 h-4 text-amber-400" />;
      case "AI & Analytics":
        return <Activity className="w-4 h-4 text-indigo-400" />;
      case "Incidents & Audit":
        return <Shield className="w-4 h-4 text-rose-400" />;
      case "Maintenance & Storage":
        return <HardDrive className="w-4 h-4 text-cyan-400" />;
      default:
        return <TableIcon className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border text-sm font-medium transition-all ${
              toast.type === "success"
                ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/50"
                : "bg-rose-950/90 text-rose-200 border-rose-500/50"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-rose-400" />}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white tracking-tight">Database Table Explorer & Manager</h1>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                  Live Store
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Inspect, query, add, edit, and delete authoritative database records across {tables.length} system collections
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                fetchTables();
                fetchRows(tableData.page, tableData.limit, searchQuery);
              }}
              disabled={loadingRows || loadingTables}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRows || loadingTables ? "animate-spin text-sky-400" : ""}`} />
              <span>Refresh Tables</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Record</span>
            </button>
          </div>
        </div>

        {/* Main Grid: Table Switcher Sidebar + Table Data Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Tables Navigator */}
          <div className="lg:col-span-3 space-y-4">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    selectedCategory === cat
                      ? "bg-sky-600 text-white shadow-sm"
                      : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Tables List */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2 space-y-1 overflow-hidden shadow-inner">
              <div className="px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-between">
                <span>Database Tables</span>
                <span>{filteredTables.length}</span>
              </div>

              <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
                {loadingTables ? (
                  <div className="py-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                    <span>Loading tables...</span>
                  </div>
                ) : filteredTables.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">No tables in category</div>
                ) : (
                  filteredTables.map((tbl) => {
                    const isSelected = tbl.id === selectedTableId;
                    return (
                      <button
                        key={tbl.id}
                        onClick={() => {
                          setSelectedTableId(tbl.id);
                          setSearchQuery("");
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-all flex items-center justify-between group ${
                          isSelected
                            ? "bg-slate-800 border border-sky-500/40 text-white shadow-sm font-semibold"
                            : "text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          {getCategoryIcon(tbl.category)}
                          <div className="truncate">
                            <div className="truncate">{tbl.name}</div>
                            <div className="text-[10px] font-mono text-slate-400 truncate">{tbl.id}</div>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            isSelected ? "bg-sky-500/20 text-sky-300 border border-sky-500/30" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {tbl.rowCount}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Active Table Explorer & Data Grid */}
          <div className="lg:col-span-9 space-y-4">
            {/* Table Meta & Search / Export Bar */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      {currentTable?.name || selectedTableId}
                    </h2>
                    <span className="text-xs font-mono text-slate-400">({selectedTableId})</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      PK: {currentTable?.primaryKey || "id"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{currentTable?.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportJSON}
                    disabled={tableData.rows.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40"
                    title="Export currently visible records as JSON"
                  >
                    <FileJson className="w-3.5 h-3.5 text-sky-400" />
                    <span>JSON</span>
                  </button>

                  <button
                    onClick={handleExportCSV}
                    disabled={tableData.rows.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40"
                    title="Export currently visible records as CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Search & Stats Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search in ${currentTable?.name || "table"}...`}
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        fetchRows(1, tableData.limit, "");
                      }}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </form>

                <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                  <span>
                    Showing <strong className="text-slate-200">{tableData.rows.length}</strong> of{" "}
                    <strong className="text-slate-200">{tableData.total}</strong> records
                  </span>
                </div>
              </div>
            </div>

            {/* Table Records Grid */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="border-b border-slate-800 bg-slate-950/90 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <tr>
                      {tableData.table?.columns.map((col) => (
                        <th key={col.name} className="py-3 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{col.label}</span>
                            <span className="text-[9px] font-mono text-slate-600 lowercase">({col.type})</span>
                          </div>
                        </th>
                      ))}
                      <th className="py-3 px-3.5 text-right whitespace-nowrap sticky right-0 bg-slate-950/95">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-800/60">
                    {loadingRows ? (
                      <tr>
                        <td
                          colSpan={(tableData.table?.columns.length || 4) + 1}
                          className="py-16 text-center text-slate-400"
                        >
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-400" />
                          <p className="text-sm">Loading records from {selectedTableId}...</p>
                        </td>
                      </tr>
                    ) : tableData.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={(tableData.table?.columns.length || 4) + 1}
                          className="py-16 text-center text-slate-400"
                        >
                          <Database className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                          <p className="text-base font-semibold text-slate-300">No records found</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {searchQuery ? `No results matching "${searchQuery}"` : "This table is currently empty."}
                          </p>
                          <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="mt-3 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors"
                          >
                            + Add First Record
                          </button>
                        </td>
                      </tr>
                    ) : (
                      tableData.rows.map((row, idx) => {
                        const pk = tableData.table?.primaryKey || "id";
                        const rowKey = row[pk] || idx;
                        return (
                          <tr key={rowKey} className="hover:bg-slate-800/40 transition-colors group">
                            {tableData.table?.columns.map((col) => {
                              const rawVal = row[col.name];
                              return (
                                <td key={col.name} className="py-2.5 px-3.5 max-w-xs truncate">
                                  {formatCellValue(rawVal, col, (title, json) => setViewingJson({ title, data: json }))}
                                </td>
                              );
                            })}
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap sticky right-0 bg-slate-900/90 group-hover:bg-slate-800/90 transition-colors">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setEditingRow(row)}
                                  className="p-1.5 rounded-md hover:bg-slate-700 text-slate-300 hover:text-sky-400 transition-colors"
                                  title="Edit Record"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeletingRow(row)}
                                  className="p-1.5 rounded-md hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors"
                                  title="Delete Record"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Bar */}
              {tableData.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 bg-slate-950/70 text-xs font-mono text-slate-400">
                  <div>
                    Page <strong className="text-slate-200">{tableData.page}</strong> of{" "}
                    <strong className="text-slate-200">{tableData.totalPages}</strong>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => fetchRows(tableData.page - 1, tableData.limit, searchQuery)}
                      disabled={tableData.page <= 1}
                      className="p-1.5 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => fetchRows(tableData.page + 1, tableData.limit, searchQuery)}
                      disabled={tableData.page >= tableData.totalPages}
                      className="p-1.5 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Edit Record Modal */}
        {editingRow && tableData.table && (
          <RecordEditorModal
            table={tableData.table}
            initialData={editingRow}
            isEditing={true}
            onClose={() => setEditingRow(null)}
            onSave={handleSaveRow}
          />
        )}

        {/* Create Record Modal */}
        {isCreateModalOpen && tableData.table && (
          <RecordEditorModal
            table={tableData.table}
            initialData={{}}
            isEditing={false}
            onClose={() => setIsCreateModalOpen(false)}
            onSave={handleSaveRow}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deletingRow && tableData.table && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-md rounded-xl border border-rose-500/40 bg-slate-900 shadow-2xl p-6 space-y-4">
              <div className="flex items-center gap-3 text-rose-400">
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Delete Record Confirmation</h3>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to permanently delete this record from table{" "}
                <strong className="text-white font-mono">{selectedTableId}</strong>?
              </p>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
                <div>
                  <span className="text-slate-500">PK ({tableData.table.primaryKey}): </span>
                  <span className="font-bold text-sky-400">{deletingRow[tableData.table.primaryKey]}</span>
                </div>
                {deletingRow.name && (
                  <div>
                    <span className="text-slate-500">Name: </span>
                    <span>{deletingRow.name}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setDeletingRow(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteRow}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                >
                  Delete Record
                </button>
              </div>
            </div>
          </div>
        )}

        {/* JSON Viewer Modal */}
        {viewingJson && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-5 space-y-3 font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-semibold text-sky-400 flex items-center gap-2">
                  <FileJson className="w-4 h-4" />
                  <span>{viewingJson.title}</span>
                </h3>
                <button onClick={() => setViewingJson(null)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-emerald-400 overflow-auto max-h-[60vh]">
                {JSON.stringify(viewingJson.data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// Cell Formatter Helper
function formatCellValue(
  value: any,
  col: ColumnDef,
  onViewJson: (title: string, data: any) => void
) {
  if (value === null || value === undefined) {
    return <span className="text-slate-600 font-mono italic text-[10px]">null</span>;
  }

  if (col.type === "boolean" || typeof value === "boolean") {
    return (
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
          value ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30" : "bg-slate-800 text-slate-400"
        }`}
      >
        {value ? "TRUE" : "FALSE"}
      </span>
    );
  }

  if (col.type === "datetime") {
    try {
      const d = new Date(value);
      return <span className="font-mono text-[11px] text-slate-300">{d.toLocaleString()}</span>;
    } catch {
      return <span className="font-mono text-[11px] text-slate-300">{String(value)}</span>;
    }
  }

  if (col.type === "json" || typeof value === "object") {
    const isArray = Array.isArray(value);
    const count = isArray ? value.length : Object.keys(value).length;
    return (
      <button
        onClick={() => onViewJson(col.label, value)}
        className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 flex items-center gap-1.5 transition-colors"
      >
        <Eye className="w-3 h-3" />
        <span>
          {isArray ? `Array(${count})` : `Object(${count})`}
        </span>
      </button>
    );
  }

  if (col.name.toLowerCase().includes("status")) {
    const s = String(value).toLowerCase();
    let badgeClass = "bg-slate-800 text-slate-300 border-slate-700";
    if (s === "online" || s === "healthy" || s === "compliant" || s === "active") {
      badgeClass = "bg-emerald-950/60 text-emerald-400 border-emerald-500/30";
    } else if (s === "offline" || s === "critical" || s === "violation") {
      badgeClass = "bg-rose-950/60 text-rose-400 border-rose-500/30";
    } else if (s === "warning" || s === "degraded" || s === "at_risk") {
      badgeClass = "bg-amber-950/60 text-amber-400 border-amber-500/30";
    }
    return <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${badgeClass}`}>{value}</span>;
  }

  return <span className="text-slate-200">{String(value)}</span>;
}

// Modal for Creating & Editing Records
interface RecordEditorModalProps {
  table: TableDef;
  initialData: any;
  isEditing: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
}

function RecordEditorModal({
  table,
  initialData,
  isEditing,
  onClose,
  onSave,
}: RecordEditorModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>({ ...initialData });
  const [jsonFields, setJsonFields] = useState<Record<string, string>>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const rawJsonMap: Record<string, string> = {};
    table.columns.forEach((col) => {
      if (col.type === "json") {
        const val = initialData[col.name];
        rawJsonMap[col.name] = val !== undefined ? JSON.stringify(val, null, 2) : "{}";
      }
    });
    setJsonFields(rawJsonMap);
  }, [table, initialData]);

  const handleChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleJsonChange = (name: string, textVal: string) => {
    setJsonFields((prev) => ({ ...prev, [name]: textVal }));
    try {
      const parsed = JSON.parse(textVal);
      setJsonErrors((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
      setFormData((prev) => ({ ...prev, [name]: parsed }));
    } catch (err: any) {
      setJsonErrors((prev) => ({ ...prev, [name]: "Invalid JSON format" }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(jsonErrors).length > 0) {
      alert("Please fix JSON errors before submitting.");
      return;
    }
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              {isEditing ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEditing ? `Edit Record (${initialData[table.primaryKey]})` : `Add New Record to ${table.name}`}
              </h3>
              <p className="text-xs text-slate-400">Table: {table.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {table.columns.map((col) => {
            const isPk = col.name === table.primaryKey;
            const disabled = isEditing && isPk;
            const currentValue = formData[col.name];

            return (
              <div key={col.name} className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>
                    {col.label} {col.required && <span className="text-rose-400">*</span>}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 font-normal">
                    {col.name} ({col.type})
                  </span>
                </label>

                {col.type === "boolean" ? (
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => handleChange(col.name, true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        currentValue === true
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      TRUE
                    </button>
                    <button
                      type="button"
                      onClick={() => handleChange(col.name, false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        currentValue === false
                          ? "bg-rose-600 text-white shadow-sm"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      FALSE
                    </button>
                  </div>
                ) : col.type === "enum" && col.options ? (
                  <select
                    value={currentValue || ""}
                    onChange={(e) => handleChange(col.name, e.target.value)}
                    disabled={disabled}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                  >
                    <option value="">-- Select --</option>
                    {col.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : col.type === "number" ? (
                  <input
                    type="number"
                    value={currentValue ?? ""}
                    onChange={(e) => handleChange(col.name, e.target.value === "" ? "" : Number(e.target.value))}
                    disabled={disabled}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 font-mono"
                  />
                ) : col.type === "json" ? (
                  <div className="space-y-1 font-mono">
                    <textarea
                      rows={4}
                      value={jsonFields[col.name] ?? "{}"}
                      onChange={(e) => handleJsonChange(col.name, e.target.value)}
                      className={`w-full p-2.5 text-xs rounded-lg border bg-slate-950 text-emerald-400 font-mono focus:outline-none ${
                        jsonErrors[col.name] ? "border-rose-500 focus:ring-1 focus:ring-rose-500" : "border-slate-700 focus:ring-1 focus:ring-sky-500"
                      }`}
                    />
                    {jsonErrors[col.name] && <p className="text-[10px] text-rose-400">{jsonErrors[col.name]}</p>}
                  </div>
                ) : (
                  <input
                    type={col.type === "datetime" ? "text" : "text"}
                    value={currentValue ?? ""}
                    placeholder={isPk && !isEditing ? "(Auto-generated if empty)" : ""}
                    onChange={(e) => handleChange(col.name, e.target.value)}
                    disabled={disabled}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 font-mono"
                  />
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>{isEditing ? "Save Changes" : "Create Record"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
