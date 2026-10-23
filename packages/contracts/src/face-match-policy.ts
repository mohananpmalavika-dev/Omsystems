export const FACE_MATCH_MINIMUM = 0.82;
export const FACE_MATCH_MARGIN = 0.05;

export function validFaceVector(vector: readonly number[], dimension = 512): boolean {
  if (!Array.isArray(vector) || vector.length !== dimension || vector.some(value => !Number.isFinite(value))) return false;
  const norm = Math.hypot(...vector);
  return Number.isFinite(norm) && norm >= 0.9 && norm <= 1.1;
}

/** Scores represent candidates, not an identity, until the runner-up is excluded. */
export function selectFaceIdentity<T>(candidates: readonly T[], personId: (row:T)=>string, similarity: (row:T)=>number, threshold = FACE_MATCH_MINIMUM, minimumMargin = FACE_MATCH_MARGIN): T | null {
  if (!Number.isFinite(threshold) || !Number.isFinite(minimumMargin) || minimumMargin < FACE_MATCH_MARGIN) return null;
  const persons = new Map<string,T>();
  for (const candidate of candidates) {
    const id = personId(candidate), score = similarity(candidate);
    if (!id || !Number.isFinite(score) || score < 0 || score > 1) continue;
    const prior = persons.get(id);
    if (!prior || score > similarity(prior)) persons.set(id,candidate);
  }
  const ranked = [...persons.values()].sort((a,b)=>similarity(b)-similarity(a));
  const best = ranked[0], next = ranked[1];
  if (!best || similarity(best) < Math.max(FACE_MATCH_MINIMUM,threshold)) return null;
  if (next && similarity(best)-similarity(next) < minimumMargin) return null;
  return best;
}
