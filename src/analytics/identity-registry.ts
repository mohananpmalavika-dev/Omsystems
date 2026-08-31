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

function hasDatabase(
  store: ControlPlaneStore,
): store is ControlPlaneStore & { db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> } } {
  return "db" in store && Boolean((store as { db?: unknown }).db);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
