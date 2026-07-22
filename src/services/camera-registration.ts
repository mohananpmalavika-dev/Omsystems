import { z } from "zod";

export interface BulkCameraRegistrationRow {
  branchCode: string;
  cameraName: string;
  ip: string;
  port: number;
  manufacturer: string;
  model: string;
  serial: string;
  streamProfile: string;
  secretReference: string;
}

const bulkCameraRowSchema = z.object({
  branchCode: z.string().trim().min(1),
  cameraName: z.string().trim().min(1),
  ip: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  manufacturer: z.string().trim().min(1),
  model: z.string().trim().min(1),
  serial: z.string().trim().min(1),
  streamProfile: z.string().trim().min(1),
  secretReference: z.string().trim().min(1),
});

export function parseBulkCameraCsv(csv: string): BulkCameraRegistrationRow[] {
  const trimmed = csv.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
  const expectedHeaders = [
    "branchcode",
    "cameraname",
    "ip",
    "port",
    "manufacturer",
    "model",
    "serial",
    "streamprofile",
    "secretreference",
  ];

  const missingHeader = expectedHeaders.find((headerName) => !header.includes(headerName));
  if (missingHeader) {
    throw new Error(`Bulk registration CSV is missing required column ${missingHeader}`);
  }

  return lines.slice(1).map((line, index) => {
    const values = line.split(",").map((value) => value.trim());
    const row = Object.fromEntries(
      header.map((column, columnIndex) => [column, values[columnIndex] ?? ""]),
    ) as Record<string, string>;

    const parsed = bulkCameraRowSchema.safeParse({
      branchCode: row.branchcode,
      cameraName: row.cameraname,
      ip: row.ip,
      port: row.port,
      manufacturer: row.manufacturer,
      model: row.model,
      serial: row.serial,
      streamProfile: row.streamprofile,
      secretReference: row.secretreference,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path[0];
      throw new Error(`Bulk registration row ${index + 1} is missing ${field}`);
    }

    return parsed.data as BulkCameraRegistrationRow;
  });
}
