/**
 * PostgreSQL Error Detection Utilities
 * 
 * These utilities help identify specific PostgreSQL error conditions
 * to enable proper error handling and user-friendly responses.
 */

/**
 * PostgreSQL Error Interface
 * Represents the structure of errors thrown by node-postgres (pg)
 */
export interface PgError {
  code: string;
  constraint?: string;
  detail?: string;
  table?: string;
  column?: string;
  message: string;
}

/**
 * Type guard to check if an error is a PostgreSQL error
 * @param error - The error to check
 * @returns true if the error has a PostgreSQL error code
 */
export function isPgError(error: unknown): error is PgError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as any).code === 'string'
  );
}

/**
 * PostgreSQL Error Code Constants
 * See: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PG_ERROR_CODES = {
  // Integrity Constraint Violation (Class 23)
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  
  // SQL Routine Exception (Class 2F)
  UNDEFINED_TABLE: '42P01',
  UNDEFINED_COLUMN: '42703',
  
  // Connection Exception (Class 08)
  CONNECTION_FAILURE: '08006',
} as const;

/**
 * Check if an error code represents a constraint violation
 * All constraint violations in PostgreSQL start with '23'
 * @param code - The PostgreSQL error code
 * @returns true if the code represents a constraint violation
 */
export function isConstraintViolation(code: string): boolean {
  return code.startsWith('23');
}

/**
 * Check if an error is a foreign key violation
 * @param error - The error to check
 * @returns true if the error is a foreign key constraint violation
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return isPgError(error) && error.code === PG_ERROR_CODES.FOREIGN_KEY_VIOLATION;
}

/**
 * Check if an error is due to a missing table
 * @param error - The error to check
 * @returns true if the error is due to an undefined table
 */
export function isTableMissing(error: unknown): boolean {
  return isPgError(error) && error.code === PG_ERROR_CODES.UNDEFINED_TABLE;
}

/**
 * Sanitize error message for external consumption
 * Removes sensitive database information while keeping useful context
 * @param error - The error to sanitize
 * @returns A user-friendly error message
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (isPgError(error)) {
    // Return generic message without exposing database details
    return 'A database error occurred';
  }
  
  if (error instanceof Error) {
    // Strip potential connection strings, table names, etc.
    return 'An unexpected error occurred';
  }
  
  return 'An unexpected error occurred';
}
