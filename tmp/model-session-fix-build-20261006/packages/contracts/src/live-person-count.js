import { z } from "zod";
export const PERSON_COUNT_FRESH_MS = 90_000;
export const PERSON_COUNT_CONFIDENCE = 0.65;
export const personCountObservationSchema = z.object({
    observedAt: z.string().datetime(),
    count: z.number().int().min(0).max(2000).nullable(),
    status: z.enum(["observed", "unavailable"]),
}).refine(value => value.status === "observed" ? value.count !== null : value.count === null);
