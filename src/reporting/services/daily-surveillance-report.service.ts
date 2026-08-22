/**
 * Daily Surveillance Report Service
 * 
 * Manages immutable report snapshots, artifact storage, on-demand generation,
 * historical downloads, and automated daily schedule execution.
 */

import { createHash } from "node:crypto";
import type { DailySurveillanceHealthReportData } from "../domain/daily-surveillance-report.types.js";
import { dailySurveillanceCollectorService, DailySurveillanceCollectorService } from "./daily-surveillance-collector.service.js";
import { renderDailySurveillanceHealthPdf } from "../renderers/daily-surveillance-pdf.renderer.js";
import { renderDailySurveillanceHealthXlsx } from "../renderers/daily-surveillance-xlsx.renderer.js";
import { renderDailySurveillanceHealthCsv } from "../renderers/daily-surveillance-csv.renderer.js";

export interface ReportScheduleConfig {
  id: string;
  tenantId: string;
  enabled: boolean;
  dailyAt: string; // e.g. "06:00"
  timezone: string; // e.g. "Asia/Kolkata"
  formats: Array<"PDF" | "XLSX" | "CSV">;
  recipients: string[];
  lastRunAt?: Date | undefined;
  nextRunAt?: Date | undefined;
}

export interface StoredReportRecord {
  reportId: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  timezone: string;
  generatedAt: Date;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  integrityHashSha256: string;
  data: DailySurveillanceHealthReportData;
  artifacts: {
    pdf?: { sizeBytes: number; sha256: string; buffer: Buffer } | undefined;
    xlsx?: { sizeBytes: number; sha256: string; buffer: Buffer } | undefined;
    csv?: { sizeBytes: number; sha256: string; buffer: Buffer } | undefined;
  };
}

export class DailySurveillanceReportService {
  private reports: Map<string, StoredReportRecord> = new Map();
  private schedules: Map<string, ReportScheduleConfig> = new Map();

  constructor(
    private readonly collector: DailySurveillanceCollectorService = dailySurveillanceCollectorService
  ) {
    // Seed default daily schedule for tenant
    this.schedules.set("sched-bank-corp-01", {
      id: "sched-bank-corp-01",
      tenantId: "bank-corp",
      enabled: true,
      dailyAt: "06:00",
      timezone: "Asia/Kolkata",
      formats: ["PDF", "XLSX"],
      recipients: ["security-officer@bank-corp.internal", "soc-manager@bank-corp.internal"],
    });
  }

  async generate(options: {
    tenantId: string;
    periodStart?: Date | undefined;
    periodEnd?: Date | undefined;
    timezone?: string | undefined;
    formats?: Array<"PDF" | "XLSX" | "CSV"> | undefined;
    generatedBy?: "SCHEDULED" | "MANUAL" | "API" | undefined;
  }): Promise<StoredReportRecord> {
    const formats = options.formats || ["PDF", "XLSX", "CSV"];
    const data = await this.collector.collect({
      tenantId: options.tenantId,
      periodStart: options.periodStart,
      periodEnd: options.periodEnd,
      timezone: options.timezone,
      generatedBy: options.generatedBy,
    });

    const artifacts: StoredReportRecord["artifacts"] = {};

    if (formats.includes("PDF")) {
      const pdfBuffer = await renderDailySurveillanceHealthPdf(data);
      const sha = createHash("sha256").update(pdfBuffer).digest("hex");
      artifacts.pdf = { sizeBytes: pdfBuffer.length, sha256: sha, buffer: pdfBuffer };
    }

    if (formats.includes("XLSX")) {
      const xlsxBuffer = await renderDailySurveillanceHealthXlsx(data);
      const sha = createHash("sha256").update(xlsxBuffer).digest("hex");
      artifacts.xlsx = { sizeBytes: xlsxBuffer.length, sha256: sha, buffer: xlsxBuffer };
    }

    if (formats.includes("CSV")) {
      const csvBuffer = renderDailySurveillanceHealthCsv(data);
      const sha = createHash("sha256").update(csvBuffer).digest("hex");
      artifacts.csv = { sizeBytes: csvBuffer.length, sha256: sha, buffer: csvBuffer };
    }

    const record: StoredReportRecord = {
      reportId: data.metadata.reportId,
      tenantId: options.tenantId,
      periodStart: data.metadata.periodStart,
      periodEnd: data.metadata.periodEnd,
      timezone: data.metadata.timezone,
      generatedAt: data.metadata.generatedAt,
      status: "COMPLETED",
      integrityHashSha256: data.metadata.integrityHashSha256 || "",
      data,
      artifacts,
    };

    this.reports.set(data.metadata.reportId, record);
    return record;
  }

  getReport(reportId: string): StoredReportRecord | undefined {
    return this.reports.get(reportId);
  }

  getArtifact(reportId: string, format: "pdf" | "xlsx" | "csv"): { buffer: Buffer; mimeType: string; filename: string } | undefined {
    const record = this.reports.get(reportId);
    if (!record) return undefined;

    const fmtKey = format.toLowerCase() as "pdf" | "xlsx" | "csv";
    const artifact = record.artifacts[fmtKey];
    if (!artifact) return undefined;

    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv; charset=utf-8",
    };

    return {
      buffer: artifact.buffer,
      mimeType: mimeTypes[fmtKey] || "application/octet-stream",
      filename: `daily-surveillance-health-${record.periodEnd.toISOString().slice(0, 10)}.${fmtKey}`,
    };
  }

  listReports(tenantId: string): Array<Omit<StoredReportRecord, "artifacts" | "data"> & { executiveSummary: DailySurveillanceHealthReportData["executiveSummary"] }> {
    return Array.from(this.reports.values())
      .filter((r) => r.tenantId === tenantId)
      .map((r) => ({
        reportId: r.reportId,
        tenantId: r.tenantId,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        timezone: r.timezone,
        generatedAt: r.generatedAt,
        status: r.status,
        integrityHashSha256: r.integrityHashSha256,
        executiveSummary: r.data.executiveSummary,
      }));
  }

  getSchedules(tenantId: string): ReportScheduleConfig[] {
    return Array.from(this.schedules.values()).filter((s) => s.tenantId === tenantId);
  }

  saveSchedule(config: ReportScheduleConfig): ReportScheduleConfig {
    this.schedules.set(config.id, config);
    return config;
  }
}

export const dailySurveillanceReportService = new DailySurveillanceReportService();
