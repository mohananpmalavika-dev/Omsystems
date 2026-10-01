export interface TimestampedCameraCredential {
  username: string;
  password: string;
  updatedAt: string;
}

export function newestDiscoveryCredential<T extends TimestampedCameraCredential>(
  database: T | undefined,
  local: T | undefined,
): T | undefined {
  if (!database) return local;
  if (!local) return database;
  const databaseTime = Date.parse(database.updatedAt);
  const localTime = Date.parse(local.updatedAt);
  return Number.isFinite(localTime) &&
    (!Number.isFinite(databaseTime) || localTime > databaseTime)
    ? local : database;
}
