/**
 * Test PostgreSQL error utilities
 */

import { describe, it, expect } from "vitest";
import { isPgError, isConstraintViolation, isTableMissing, PG_ERROR_CODES } from "../src/utils/pg-error-utils.js";

describe("PostgreSQL Error Utilities", () => {
  it("isPgError identifies PostgreSQL errors correctly", () => {
    const pgError = { code: "23503", message: "violates foreign key constraint" };
    const regularError = new Error("something went wrong");
    
    expect(isPgError(pgError)).toBe(true);
    expect(isPgError(regularError)).toBe(false);
    expect(isPgError(null)).toBe(false);
    expect(isPgError(undefined)).toBe(false);
  });

  it("isConstraintViolation identifies constraint violations", () => {
    expect(isConstraintViolation("23503")).toBe(true); // Foreign key
    expect(isConstraintViolation("23505")).toBe(true); // Unique
    expect(isConstraintViolation("42P01")).toBe(false); // Table missing
  });

  it("isTableMissing identifies missing table errors", () => {
    const tableMissingError = { code: "42P01", message: "relation does not exist" };
    const otherError = { code: "23503", message: "foreign key violation" };
    
    expect(isTableMissing(tableMissingError)).toBe(true);
    expect(isTableMissing(otherError)).toBe(false);
  });

  it("PG_ERROR_CODES constants are defined", () => {
    expect(PG_ERROR_CODES.FOREIGN_KEY_VIOLATION).toBe("23503");
    expect(PG_ERROR_CODES.UNDEFINED_TABLE).toBe("42P01");
  });
});
