let database: any = null;

export function setDatabase(db: any): void {
  database = db;
}

export function getDatabase(): any {
  if (!database) {
    throw new Error('Security database is not initialized. Call setDatabase(db) before using getDatabase().');
  }

  return database;
}
