# CSV Export Module

This module provides RFC 4180 compliant CSV export functionality with security hardening for the analytics engine.

## Architecture

The export system follows a clean separation of concerns:

```
Request
   ↓
Validate filters & format
   ↓
Fetch data from detectors
   ↓
Build canonical report model
   ↓
Map to export DTO
   ↓
Serialize to CSV
   ↓
HTTP response
```

## Files

### `csv.ts`
Generic CSV serialization utilities with:
- **RFC 4180 compliance**: Proper handling of commas, quotes, newlines, and CRLF line endings
- **Formula injection prevention**: Neutralizes cells starting with `=`, `+`, `-`, `@`
- **Type-safe column definitions**: Strongly-typed column schema with extractors
- **Date formatting**: ISO 8601 timestamps for consistency
- **UTF-8 BOM support**: Optional BOM for Excel compatibility

### `analog-camera-csv.ts`
Analog camera-specific export schema:
- **56-column export schema**: Comprehensive data from all detectors
- **Flattened structure**: Nested objects converted to flat tabular format
- **Public DTO**: Deliberate export schema preventing credential leakage
- **Helper functions**: `boolToYesNo()`, `joinForCsv()` for consistent formatting

### API Integration

The `/v1/analog/report` endpoint aggregates data from:
- **Quality detector**: Video quality metrics and issues
- **Aging detector**: Health scores and maintenance recommendations
- **Type classifier**: Camera type and AI accuracy estimates
- **Upgrade advisor**: ROI calculations and upgrade paths
- **DVR health**: Channel status and connectivity

## Security Features

1. **Formula Injection Prevention**
   - Prefixes dangerous characters (`=+-@`) with single quote
   - Prevents spreadsheet formula execution

2. **Proper Escaping**
   - Quotes values containing commas, quotes, or newlines
   - Doubles internal quotes per RFC 4180

3. **No Credential Exposure**
   - Explicit export DTO prevents accidental data leakage
   - Internal IDs, passwords, and tokens excluded

4. **Tenant Scoping**
   - All data sources must be tenant-scoped
   - No cross-tenant data exposure

## Usage

### Basic Export

```typescript
import { serializeCsv, type CsvColumn } from './csv.js';

interface MyData {
  id: string;
  name: string;
  value: number;
}

const columns: CsvColumn<MyData>[] = [
  { header: 'ID', value: (row) => row.id },
  { header: 'Name', value: (row) => row.name },
  { header: 'Value', value: (row) => row.value },
];

const data: MyData[] = [
  { id: '1', name: 'Test', value: 100 }
];

const csv = serializeCsv(data, columns);
```

### API Usage

```bash
# JSON export (default)
GET /v1/analog/report

# CSV export
GET /v1/analog/report?format=csv

# Filtered export
GET /v1/analog/report?format=csv&includeQuality=true&includeAging=false
```

### Response Headers

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="analog-camera-report-2026-08-11T15-30-20.csv"
```

## Testing

Comprehensive test coverage (66 tests):
- **csv.test.ts**: Escaping, formula injection, special characters, edge cases
- **analog-camera-csv.test.ts**: Schema serialization, helpers, multi-camera exports
- **analog-camera-csv-api.test.ts**: Endpoint integration, headers, error handling

Run tests:
```bash
npx vitest run src/exports/__tests__/
```

## Empty Export Handling

Empty data sets return valid CSV with headers only:

```csv
Camera ID,Camera Name,Video Quality Score,...
```

This ensures downstream parsers receive predictable output.

## Column Schema Stability

The column order and headers are **fixed by design**. Changes to the export schema should be:
1. Explicitly versioned
2. Documented in API changelog
3. Tested for backward compatibility

Do not derive columns from `Object.keys()` as this makes property order part of the API contract.

## Performance Considerations

Current implementation:
- **Buffered export**: Loads all data into memory
- **Suitable for**: Up to ~100K rows
- **Future enhancement**: Streaming export for large datasets

For large exports (>100K rows), consider:
- Pagination
- Streaming CSV generation
- Background job + download link

## Compliance Notes

CSV export follows these principles:
- **RFC 4180 compliance**: Standard CSV format
- **UTF-8 encoding**: Universal character support
- **CRLF line endings**: Spreadsheet compatibility
- **Deterministic output**: Same input produces same CSV
- **No locale-specific formatting**: ISO dates, dot-decimal numbers
