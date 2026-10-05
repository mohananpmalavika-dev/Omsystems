/**
 * Generic CSV Serialization Utility
 * RFC 4180 compliant with security hardening
 */
/**
 * Neutralize potential spreadsheet formula injection
 * Prefixes dangerous characters with single quote
 */
function neutralizeSpreadsheetFormula(value) {
    // Check if value starts with formula-like characters
    if (/^[=+\-@]/.test(value)) {
        return `'${value}`;
    }
    return value;
}
/**
 * Escape a single CSV cell value according to RFC 4180
 * Handles: null/undefined, dates, commas, quotes, newlines, formula injection
 */
export function escapeCsvCell(value) {
    // Handle null/undefined as empty string
    if (value === null || value === undefined) {
        return '';
    }
    // Convert to string (ISO format for dates)
    let text = value instanceof Date
        ? value.toISOString()
        : String(value);
    // Neutralize potential formula injection
    text = neutralizeSpreadsheetFormula(text);
    // Check if value needs quoting (contains special characters)
    if (/[",\r\n]/.test(text)) {
        // Escape internal quotes by doubling them
        text = `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}
/**
 * Serialize a single CSV row
 */
export function serializeCsvRow(values) {
    return values.map(escapeCsvCell).join(',');
}
/**
 * Serialize complete CSV document with headers and data rows
 * Uses CRLF line endings for better spreadsheet compatibility
 */
export function serializeCsv(items, columns) {
    // Build header row
    const header = columns
        .map(column => escapeCsvCell(column.header))
        .join(',');
    // Build data rows
    const rows = items.map(item => columns
        .map(column => escapeCsvCell(column.value(item)))
        .join(','));
    // Join with CRLF for better spreadsheet compatibility
    return [header, ...rows].join('\r\n');
}
/**
 * UTF-8 BOM for Excel compatibility
 * Add to start of CSV if targeting Excel on Windows with non-ASCII characters
 */
export const UTF8_BOM = '\uFEFF';
