import { createHmac, timingSafeEqual } from "node:crypto";

type DownloadArtifact = { id: string; tenantId: string; expiresAt: string };

export function signedReportDownloadPath(artifact: DownloadArtifact, secret: string) {
  const expires = Math.floor(Date.parse(artifact.expiresAt) / 1000);
  const token = createReportDownloadToken(artifact.id, artifact.tenantId, expires, secret);
  return `/api/control/v1/reports/operational/artifacts/${artifact.id}/download?expires=${expires}&token=${token}`;
}

export function createReportDownloadToken(id: string, tenantId: string, expires: number, secret: string) {
  return createHmac("sha256", secret).update(`${id}:${tenantId}:${expires}`).digest("hex");
}

export function verifyReportDownloadToken(id: string, tenantId: string, expires: number, value: string, secret: string) {
  const expected = createReportDownloadToken(id, tenantId, expires, secret);
  const suppliedBytes = Buffer.from(value);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}
