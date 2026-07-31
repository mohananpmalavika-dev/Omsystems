/**
 * Database Configuration
 * Stub implementation for security services
 */

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

export async function closeDatabaseConnection(): Promise<void> {
  if (database && typeof database.close === 'function') {
    await database.close();
  }

  database = null;
}

export default getDatabase;
