import { z } from "zod";

export const PERSON_COUNT_FRESH_MS = 90_000;
export const PERSON_COUNT_CONFIDENCE = 0.65;
export const personCountObservationSchema = z.object({
  observedAt: z.string().datetime(),
  count: z.number().int().min(0).max(2000).nullable(),
  status: z.enum(["observed", "unavailable"]),
}).refine(value => value.status === "observed" ? value.count !== null : value.count === null);
export type PersonCountObservation = z.infer<typeof personCountObservationSchema>;
export type PersonCountRow = {
  id: string; name: string; branchId?: string; branchName?: string;
  regionId: string | null; regionName: string | null; zoneId: string | null; zoneName: string | null;
  personCount: number | null; totalCameras: number; onlineCameras: number; notWorkingCameras: number; reportingCameras: number;
  reportTime: string; oldestObservationAt: string | null; latestObservationAt: string | null;
  coverage: "complete" | "partial" | "unavailable";
};
export type LivePersonCountReport = {
  reportTime: string; freshnessSeconds: number; groupBy: "branch" | "region" | "zone";
  rows: PersonCountRow[];
  summary: { personCount: number | null; totalCameras: number; onlineCameras: number; notWorkingCameras: number; reportingCameras: number; branches: number };
  filters: {
    branches: Array<{id: string; name: string; regionId: string | null; zoneId: string | null}>;
    regions: Array<{id: string; name: string; zoneId: string | null}>;
    zones: Array<{id: string; name: string}>;
  };
};
