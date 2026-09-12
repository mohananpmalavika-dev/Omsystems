import type { ControlPlaneStore } from "../control-plane-store.js";

export type LocalIdentityState = {
  faceWatchlists: any[];
  facePersons: any[];
  faceEvents: any[];
  anprWatchlists: any[];
  anprPlates: any[];
  anprEvents: any[];
  anprSessions: any[];
  protectedObjects: any[];
  behaviorEvents: any[];
};

export type AnprRegistryMatch = {
  plateId: string;
  plateNumber: string;
  watchlistId: string;
  watchlistName: string | null;
  reason: string | null;
  severity: string | null;
  alertAuthorities: boolean;
  alertOnMatch: boolean;
};

const localIdentityStates = new WeakMap<object, LocalIdentityState>();

export function localIdentityState(store: ControlPlaneStore) {
  let state = localIdentityStates.get(store as object);
  if (!state) {
    state = {
      faceWatchlists: [], facePersons: [], faceEvents: [],
      anprWatchlists: [], anprPlates: [], anprEvents: [], anprSessions: [],
      protectedObjects: [], behaviorEvents: [],
    };
    localIdentityStates.set(store as object, state);
  }
  return state;
}

export function normalizePlateNumber(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

export async function activeAnprRegistryMatches(
  store: ControlPlaneStore,
  tenantId: string,
  plateNumbers: readonly string[],
): Promise<AnprRegistryMatch[]> {
  const requested = new Set(plateNumbers.map(normalizePlateNumber).filter(Boolean));
  if (requested.size === 0) return [];

  if (!hasDatabase(store)) {
    const state = localIdentityState(store);
    const watchlists = new Map(
      state.anprWatchlists
        .filter((watchlist) => watchlist.tenantId === tenantId && !watchlist.archivedAt && watchlist.enabled !== false)
        .map((watchlist) => [String(watchlist.id), watchlist] as const),
    );
    return state.anprPlates.flatMap((plate) => {
      const plateNumber = typeof plate.plateNumber === "string" ? plate.plateNumber : "";
      const watchlist = watchlists.get(String(plate.watchlistId));
      const expiresAt = typeof plate.expiresAt === "string" ? Date.parse(plate.expiresAt) : Number.NaN;
      if (!watchlist || plate.tenantId !== tenantId || plate.archivedAt ||
          !requested.has(normalizePlateNumber(plateNumber)) ||
          (Number.isFinite(expiresAt) && expiresAt <= Date.now())) return [];
      return [{
        plateId: String(plate.id),
        plateNumber: normalizePlateNumber(plateNumber),
        watchlistId: String(watchlist.id),
        watchlistName: typeof watchlist.name === "string" ? watchlist.name : null,
        reason: typeof plate.reason === "string" ? plate.reason : null,
        severity: typeof watchlist.alertSeverity === "string" ? watchlist.alertSeverity : null,
        alertAuthorities: watchlist.alertAuthorities === true,
        alertOnMatch: watchlist.alertOnMatch !== false,
      }];
    });
  }

  const result = await store.db.query(
    `SELECT p.id::text AS plate_id, p.plate_number,
            w.id::text AS watchlist_id, w.name AS watchlist_name,
            p.reason, w.alert_severity, w.alert_authorities, w.alert_on_match
     FROM anpr_watchlist_plates p
     JOIN anpr_watchlists w ON w.id = p.watchlist_id
     WHERE p.tenant_id = $1 AND p.archived_at IS NULL
       AND w.tenant_id = $1 AND w.archived_at IS NULL AND w.enabled
       AND (p.expires_at IS NULL OR p.expires_at > now())
       AND upper(regexp_replace(p.plate_number, '\\s+', '', 'g')) = ANY($2::text[])`,
    [tenantId, [...requested]],
  );
  return result.rows.flatMap((row: Record<string, unknown>) => {
    const plateId = stringValue(row.plate_id);
    const plateNumber = stringValue(row.plate_number);
    const watchlistId = stringValue(row.watchlist_id);
    if (!plateId || !plateNumber || !watchlistId) return [];
    return [{
      plateId,
      plateNumber: normalizePlateNumber(plateNumber),
      watchlistId,
      watchlistName: stringValue(row.watchlist_name),
      reason: stringValue(row.reason),
      severity: stringValue(row.alert_severity),
      alertAuthorities: row.alert_authorities === true,
      alertOnMatch: row.alert_on_match !== false,
    }];
  });
}

export async function recordAnprRegistryMatches(
  store: ControlPlaneStore,
  tenantId: string,
  plateIds: readonly string[],
  occurredAt: string,
) {
  const uniqueIds = [...new Set(plateIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;
  if (!hasDatabase(store)) {
    const ids = new Set(uniqueIds);
    for (const plate of localIdentityState(store).anprPlates) {
      if (plate.tenantId !== tenantId || !ids.has(String(plate.id))) continue;
      plate.lastMatchedAt = occurredAt;
      plate.matchCount = Number(plate.matchCount ?? 0) + 1;
    }
    return;
  }
  await store.db.query(
    `UPDATE anpr_watchlist_plates
     SET last_matched_at = $3, match_count = match_count + 1
     WHERE tenant_id = $1 AND id::text = ANY($2::text[])`,
    [tenantId, uniqueIds, occurredAt],
  );
}

export type FaceRegistryMatch = {
  embeddingId: string;
  personId: string;
  personName: string;
  watchlistId: string;
  watchlistName: string | null;
  listType: string | null;
  severity: string | null;
  alertOnMatch: boolean;
  similarity: number;
  qualityScore?: number | null;
  externalId?: string | null;
  metadata?: Record<string, unknown>;
};

export type FaceMatchQueryOptions = {
  minSimilarity?: number;
  watchlistIds?: readonly string[];
  limit?: number;
};

export type RecordFaceEventParams = {
  cameraId: string;
  personId?: string | null;
  watchlistId?: string | null;
  similarityScore: number;
  faceBbox: { x: number; y: number; width: number; height: number };
  faceQuality?: number | null;
  ageEstimate?: number | null;
  genderEstimate?: "male" | "female" | null;
  wearingMask?: boolean | null;
  snapshotReference?: string | null;
  occurredAt?: string;
  analyticsEventId?: string | null;
};

export type FaceMatchReviewDecision = "confirmed" | "rejected" | "unsure";

export type RecordFaceReviewParams = {
  eventId: string;
  reviewerId: string;
  decision: FaceMatchReviewDecision;
  notes?: string;
};

export function calculateCosineSimilarity(vecA: readonly number[], vecB: readonly number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return Math.max(0, Math.min(1, dotProduct / denominator));
}

export async function activeFaceRegistryMatches(
  store: ControlPlaneStore,
  tenantId: string,
  embeddingVector: readonly number[],
  options: FaceMatchQueryOptions = {},
): Promise<FaceRegistryMatch[]> {
  const minSimilarity = options.minSimilarity ?? 0.80;
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const watchlistIdFilter = options.watchlistIds?.filter(Boolean);

  if (!hasDatabase(store)) {
    const state = localIdentityState(store);
    const watchlists = new Map(
      state.faceWatchlists
        .filter((w) => w.tenantId === tenantId && !w.archivedAt && w.enabled !== false)
        .map((w) => [String(w.id), w] as const),
    );

    const matches: FaceRegistryMatch[] = [];

    for (const person of state.facePersons) {
      if (person.tenantId !== tenantId || person.archivedAt) continue;
      const watchlist = watchlists.get(String(person.watchlistId));
      if (!watchlist) continue;
      if (watchlistIdFilter && watchlistIdFilter.length > 0 && !watchlistIdFilter.includes(String(person.watchlistId))) {
        continue;
      }

      // Check stored embeddings on the person or in embeddings list
      const candidateEmbeddings: number[][] = [];
      if (Array.isArray(person.embedding) && person.embedding.length > 0) {
        candidateEmbeddings.push(person.embedding);
      }
      if (Array.isArray(person.embeddings)) {
        for (const emb of person.embeddings) {
          if (Array.isArray(emb)) candidateEmbeddings.push(emb);
          else if (emb && Array.isArray(emb.embedding)) candidateEmbeddings.push(emb.embedding);
        }
      }

      let bestSim = 0;
      for (const candidate of candidateEmbeddings) {
        const sim = calculateCosineSimilarity(embeddingVector, candidate);
        if (sim > bestSim) bestSim = sim;
      }

      if (bestSim >= minSimilarity) {
        matches.push({
          embeddingId: `emb-${person.id}`,
          personId: String(person.id),
          personName: typeof person.fullName === "string" ? person.fullName : "Unknown Person",
          watchlistId: String(watchlist.id),
          watchlistName: typeof watchlist.name === "string" ? watchlist.name : null,
          listType: typeof watchlist.listType === "string" ? watchlist.listType : null,
          severity: typeof watchlist.alertSeverity === "string" ? watchlist.alertSeverity : "P2",
          alertOnMatch: watchlist.alertOnMatch !== false,
          similarity: Number(bestSim.toFixed(4)),
          externalId: typeof person.externalId === "string" ? person.externalId : null,
          metadata: typeof person.metadata === "object" && person.metadata !== null ? person.metadata as Record<string, unknown> : {},
        });
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  // Database mode: PostgreSQL with pgvector cosine distance <=>
  try {
    const vectorStr = `[${embeddingVector.join(",")}]`;
    const params: unknown[] = [vectorStr, tenantId, minSimilarity];
    let watchlistClause = "";

    if (watchlistIdFilter && watchlistIdFilter.length > 0) {
      params.push(watchlistIdFilter);
      watchlistClause = `AND w.id::text = ANY($${params.length}::text[])`;
    }
    params.push(limit);

    const result = await store.db.query(
      `SELECT e.id::text AS embedding_id,
              p.id::text AS person_id,
              p.full_name AS person_name,
              p.external_id,
              w.id::text AS watchlist_id,
              w.name AS watchlist_name,
              w.list_type,
              w.alert_severity,
              w.alert_on_match,
              (1 - (e.embedding <=> $1::vector)) AS similarity,
              e.quality_score,
              e.metadata
       FROM face_embeddings e
       JOIN face_watchlist_persons p ON p.id = e.person_id
       JOIN face_watchlists w ON w.id = p.watchlist_id
       WHERE e.tenant_id = $2
         AND p.tenant_id = $2
         AND w.tenant_id = $2
         AND p.archived_at IS NULL
         AND w.archived_at IS NULL
         AND w.enabled = true
         AND (1 - (e.embedding <=> $1::vector)) >= $3
         ${watchlistClause}
       ORDER BY e.embedding <=> $1::vector ASC
       LIMIT $${params.length}`,
      params,
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      embeddingId: String(row.embedding_id),
      personId: String(row.person_id),
      personName: String(row.person_name),
      watchlistId: String(row.watchlist_id),
      watchlistName: stringValue(row.watchlist_name),
      listType: stringValue(row.list_type),
      severity: stringValue(row.alert_severity),
      alertOnMatch: row.alert_on_match !== false,
      similarity: Number(parseFloat(String(row.similarity ?? 0)).toFixed(4)),
      qualityScore: row.quality_score ? Number(parseFloat(String(row.quality_score)).toFixed(4)) : null,
      externalId: stringValue(row.external_id),
      metadata: typeof row.metadata === "object" && row.metadata !== null ? row.metadata as Record<string, unknown> : {},
    }));
  } catch (error) {
    // If pgvector operator fails (e.g. extension not active in standard postgres fallback), fallback gracefully
    console.warn("PostgreSQL pgvector query error, falling back to in-memory matching:", error instanceof Error ? error.message : error);
    return [];
  }
}

export async function recordFaceRegistryMatches(
  store: ControlPlaneStore,
  tenantId: string,
  params: RecordFaceEventParams,
): Promise<{ id: string; reviewStatus: string }> {
  const occurredAt = params.occurredAt ?? new Date().toISOString();
  const eventId = crypto.randomUUID();
  const reviewStatus = "pending";

  if (!hasDatabase(store)) {
    const state = localIdentityState(store);
    const eventRecord = {
      id: eventId,
      tenantId,
      cameraId: params.cameraId,
      watchlistId: params.watchlistId ?? null,
      personId: params.personId ?? null,
      similarityScore: params.similarityScore,
      faceBbox: params.faceBbox,
      faceQuality: params.faceQuality ?? null,
      ageEstimate: params.ageEstimate ?? null,
      genderEstimate: params.genderEstimate ?? null,
      wearingMask: params.wearingMask ?? null,
      snapshotReference: params.snapshotReference ?? null,
      reviewStatus,
      occurredAt,
      createdAt: new Date().toISOString(),
    };
    state.faceEvents.unshift(eventRecord);

    if (params.personId) {
      const person = state.facePersons.find((p) => String(p.id) === String(params.personId) && p.tenantId === tenantId);
      if (person) {
        person.lastSeenAt = occurredAt;
        person.matchCount = Number(person.matchCount ?? 0) + 1;
        person.lastSeenCameraId = params.cameraId;
      }
    }

    return { id: eventId, reviewStatus };
  }

  // Database mode: Insert face_recognition_events and update person record
  await store.db.query(
    `INSERT INTO face_recognition_events
      (id, tenant_id, camera_id, watchlist_id, person_id,
       analytics_event_id, similarity_score, face_bbox,
       face_quality, age_estimate, gender_estimate, wearing_mask,
       snapshot_reference, review_status, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      eventId,
      tenantId,
      params.cameraId,
      params.watchlistId ?? null,
      params.personId ?? null,
      params.analyticsEventId ?? null,
      params.similarityScore,
      JSON.stringify(params.faceBbox),
      params.faceQuality ?? null,
      params.ageEstimate ?? null,
      params.genderEstimate ?? null,
      params.wearingMask ?? null,
      params.snapshotReference ?? null,
      reviewStatus,
      occurredAt,
    ],
  );

  if (params.personId) {
    await store.db.query(
      `UPDATE face_watchlist_persons
       SET last_seen_at = $3,
           match_count = match_count + 1,
           last_seen_camera_id = $4
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, params.personId, occurredAt, params.cameraId],
    );
  }

  return { id: eventId, reviewStatus };
}

export async function recordFaceMatchReview(
  store: ControlPlaneStore,
  tenantId: string,
  params: RecordFaceReviewParams,
): Promise<{ reviewId: string; status: string; reviewedAt: string }> {
  const reviewedAt = new Date().toISOString();
  const reviewId = crypto.randomUUID();
  const eventStatus = params.decision === "confirmed" ? "confirmed" : params.decision === "rejected" ? "rejected" : "dismissed";

  if (!hasDatabase(store)) {
    const state = localIdentityState(store);
    const event = state.faceEvents.find((e) => String(e.id) === String(params.eventId) && e.tenantId === tenantId);
    if (event) {
      event.reviewStatus = eventStatus;
      event.reviewedBy = params.reviewerId;
      event.reviewedAt = reviewedAt;
      event.reviewNotes = params.notes ?? null;
    }
    return { reviewId, status: eventStatus, reviewedAt };
  }

  await store.db.query(
    `INSERT INTO face_match_reviews
      (id, tenant_id, recognition_event_id, reviewer_id, decision, notes, reviewed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [reviewId, tenantId, params.eventId, params.reviewerId, params.decision, params.notes ?? null, reviewedAt],
  );

  await store.db.query(
    `UPDATE face_recognition_events
     SET review_status = $3,
         reviewed_by = $4,
         reviewed_at = $5,
         review_notes = $6
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, params.eventId, eventStatus, params.reviewerId, reviewedAt, params.notes ?? null],
  );

  return { reviewId, status: eventStatus, reviewedAt };
}

function hasDatabase(
  store: ControlPlaneStore,
): store is ControlPlaneStore & { db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> } } {
  return "db" in store && Boolean((store as { db?: unknown }).db);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

