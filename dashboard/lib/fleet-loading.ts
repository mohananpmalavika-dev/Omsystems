/** A failed page rejects the whole refresh, so a partial fleet never looks complete. */
export async function loadCameraInventory<T extends { id: string }>(
  fetchPage: (offset: number, limit: number) => Promise<{ cameras: T[]; total?: number }>,
): Promise<T[]> {
  const limit = 500;
  const first = await fetchPage(0, limit);
  const cameras = new Map(first.cameras.map(camera => [camera.id, camera]));
  let offset = first.cameras.length;
  let pageLength = first.cameras.length;
  while (first.total === undefined ? pageLength === limit : offset < first.total) {
    const page = await fetchPage(offset, limit);
    pageLength = page.cameras.length;
    if (!pageLength || page.cameras.every(camera => cameras.has(camera.id))) {
      throw new Error("Camera inventory pagination is incomplete. Refresh the scope.");
    }
    page.cameras.forEach(camera => cameras.set(camera.id, camera));
    offset += pageLength;
  }
  return [...cameras.values()];
}

/** Bound backend fan-out while covering every authorized camera. */
export async function loadCameraBatches<T>(cameraIds: string[], fetchBatch: (ids: string[]) => Promise<T>): Promise<T[]> {
  const unique = [...new Set(cameraIds)];
  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += 144) batches.push(unique.slice(index, index + 144));
  const results: T[] = [];
  for (let index = 0; index < batches.length; index += 3) {
    results.push(...await Promise.all(batches.slice(index, index + 3).map(fetchBatch)));
  }
  return results;
}
