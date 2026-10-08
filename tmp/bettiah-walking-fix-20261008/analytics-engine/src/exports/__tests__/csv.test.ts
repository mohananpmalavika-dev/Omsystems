/**
 * CSV Serializer Tests
 * Unit tests for generic CSV export utilities
 */

import { describe, it, expect } from "vitest";
import { escapeCsvCell, serializeCsvRow, serializeCsv, type CsvColumn } from "../csv.js";

describe("CSV Serializer", () => {
  describe("escapeCsvCell", () => {
    it("should handle null and undefined as empty string", () => {
      expect(escapeCsvCell(null)).toBe("");
      expect(escapeCsvCell(undefined)).toBe("");
    });

    it("should convert numbers to strings", () => {
      expect(escapeCsvCell(42)).toBe("42");
      expect(escapeCsvCell(3.14)).toBe("3.14");
      expect(escapeCsvCell(0)).toBe("0");
    });

    it("should convert dates to ISO format", () => {
      const date = new Date("2026-08-11T15:30:20.123Z");
      expect(escapeCsvCell(date)).toBe("2026-08-11T15:30:20.123Z");
    });

    it("should quote values containing commas", () => {
      expect(escapeCsvCell("Entrance, Gate 1")).toBe('"Entrance, Gate 1"');
      expect(escapeCsvCell("Floor 1, East")).toBe('"Floor 1, East"');
    });

    it("should quote values containing double quotes and escape internal quotes", () => {
      expect(escapeCsvCell('Camera "A"')).toBe('"Camera ""A"""');
      expect(escapeCsvCell('Say "hello" and "goodbye"')).toBe('"Say ""hello"" and ""goodbye"""');
    });

    it("should quote values containing newlines", () => {
      expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
      expect(escapeCsvCell("Lobby\nEntrance")).toBe('"Lobby\nEntrance"');
    });

    it("should quote values containing carriage returns", () => {
      expect(escapeCsvCell("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"');
    });

    it("should neutralize formula injection - equals sign", () => {
      const result = escapeCsvCell("=HYPERLINK('http://evil.com','Click')");
      // Should prefix with quote and also quote the whole string because it contains quotes
      expect(result).toContain("'=HYPERLINK");
      expect(result.startsWith('"')).toBe(true); // Quoted because contains single quotes
    });

    it("should handle simple formula injection", () => {
      expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    });

    it("should neutralize formula injection - plus sign", () => {
      expect(escapeCsvCell("+1234")).toBe("'+1234");
    });

    it("should neutralize formula injection - minus sign", () => {
      expect(escapeCsvCell("-1234")).toBe("'-1234");
    });

    it("should neutralize formula injection - at sign", () => {
      expect(escapeCsvCell("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
    });

    it("should handle combination of formula and special characters", () => {
      // Formula prefix + comma should neutralize formula AND quote
      const result = escapeCsvCell('=cmd|" /C calc",test');
      expect(result).toContain("'=");
      expect(result).toContain('"');
    });

    it("should not modify normal text values", () => {
      expect(escapeCsvCell("Normal Text")).toBe("Normal Text");
      expect(escapeCsvCell("Camera 123")).toBe("Camera 123");
      expect(escapeCsvCell("ONLINE")).toBe("ONLINE");
    });

    it("should handle boolean values", () => {
      expect(escapeCsvCell(true)).toBe("true");
      expect(escapeCsvCell(false)).toBe("false");
    });

    it("should handle empty string", () => {
      expect(escapeCsvCell("")).toBe("");
    });
  });

  describe("serializeCsvRow", () => {
    it("should join multiple values with commas", () => {
      expect(serializeCsvRow(["A", "B", "C"])).toBe("A,B,C");
    });

    it("should handle mixed types", () => {
      expect(serializeCsvRow(["Text", 42, true, null])).toBe("Text,42,true,");
    });

    it("should properly escape special characters in row", () => {
      const result = serializeCsvRow(["Normal", "Has, comma", 'Has"quote']);
      // Second value has comma so gets quoted, third has quote so gets quoted with doubled quotes
      expect(result).toBe('Normal,"Has, comma","Has""quote"');
    });
  });

  describe("serializeCsv", () => {
    interface TestRow {
      id: string;
      name: string;
      value: number;
    }

    const columns: CsvColumn<TestRow>[] = [
      { header: "ID", value: (row) => row.id },
      { header: "Name", value: (row) => row.name },
      { header: "Value", value: (row) => row.value },
    ];

    it("should generate CSV with headers and data", () => {
      const data: TestRow[] = [
        { id: "1", name: "First", value: 100 },
        { id: "2", name: "Second", value: 200 },
      ];

      const csv = serializeCsv(data, columns);
      const lines = csv.split("\r\n");

      expect(lines[0]).toBe("ID,Name,Value");
      expect(lines[1]).toBe("1,First,100");
      expect(lines[2]).toBe("2,Second,200");
    });

    it("should use CRLF line endings", () => {
      const data: TestRow[] = [{ id: "1", name: "Test", value: 100 }];
      const csv = serializeCsv(data, columns);

      expect(csv).toContain("\r\n");
      expect(csv.split("\r\n")).toHaveLength(2); // header + 1 data row
    });

    it("should return only headers for empty data", () => {
      const csv = serializeCsv([], columns);
      expect(csv).toBe("ID,Name,Value");
    });

    it("should handle columns with special characters in headers", () => {
      const specialColumns: CsvColumn<TestRow>[] = [
        { header: "ID (Primary)", value: (row) => row.id },
        { header: 'Name "Display"', value: (row) => row.name },
      ];

      const data: TestRow[] = [{ id: "1", name: "Test", value: 100 }];
      const csv = serializeCsv(data, specialColumns);
      const lines = csv.split("\r\n");

      // Only the second header with quotes needs quoting
      expect(lines[0]).toBe('ID (Primary),"Name ""Display"""');
    });

    it("should handle data with commas and quotes", () => {
      const data: TestRow[] = [
        { id: "1", name: "Lobby, East", value: 100 },
        { id: "2", name: 'Camera "A"', value: 200 },
      ];

      const csv = serializeCsv(data, columns);
      const lines = csv.split("\r\n");

      expect(lines[1]).toBe('1,"Lobby, East",100');
      expect(lines[2]).toBe('2,"Camera ""A""",200');
    });

    it("should handle data with newlines", () => {
      const data: TestRow[] = [{ id: "1", name: "Line 1\nLine 2", value: 100 }];

      const csv = serializeCsv(data, columns);
      const lines = csv.split("\r\n");

      // Note: the newline inside the quoted field doesn't split the row
      expect(lines[1]).toContain('"Line 1\nLine 2"');
    });

    it("should handle column extractors returning null/undefined", () => {
      const columnsWithOptional: CsvColumn<TestRow>[] = [
        { header: "ID", value: (row) => row.id },
        { header: "Optional", value: () => undefined },
      ];

      const data: TestRow[] = [{ id: "1", name: "Test", value: 100 }];
      const csv = serializeCsv(data, columnsWithOptional);
      const lines = csv.split("\r\n");

      expect(lines[1]).toBe("1,");
    });

    it("should handle dates in data rows", () => {
      interface DateRow {
        id: string;
        timestamp: Date;
      }

      const dateColumns: CsvColumn<DateRow>[] = [
        { header: "ID", value: (row) => row.id },
        { header: "Timestamp", value: (row) => row.timestamp },
      ];

      const data: DateRow[] = [
        { id: "1", timestamp: new Date("2026-08-11T10:30:00Z") },
      ];

      const csv = serializeCsv(data, dateColumns);
      const lines = csv.split("\r\n");

      expect(lines[1]).toBe("1,2026-08-11T10:30:00.000Z");
    });

    it("should prevent formula injection in data", () => {
      const data: TestRow[] = [
        { id: "1", name: "=SUM(A1:A10)", value: 100 },
        { id: "2", name: "+1234", value: 200 },
        { id: "3", name: "-9876", value: 300 },
        { id: "4", name: "@SUM(B1:B10)", value: 400 },
      ];

      const csv = serializeCsv(data, columns);
      const lines = csv.split("\r\n");

      expect(lines[1]).toBe("1,'=SUM(A1:A10),100");
      expect(lines[2]).toBe("2,'+1234,200");
      expect(lines[3]).toBe("3,'-9876,300");
      expect(lines[4]).toBe("4,'@SUM(B1:B10),400");
    });

    it("should handle large datasets", () => {
      const data: TestRow[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        name: `Camera ${i}`,
        value: i * 10,
      }));

      const csv = serializeCsv(data, columns);
      const lines = csv.split("\r\n");

      expect(lines).toHaveLength(1001); // header + 1000 rows
      expect(lines[0]).toBe("ID,Name,Value");
      expect(lines[1]).toBe("0,Camera 0,0");
      expect(lines[1000]).toBe("999,Camera 999,9990");
    });
  });
});
