export function reportCsv(rows: Record<string, unknown>[], headers = [...new Set(rows.flatMap(row => Object.keys(row)))]): string {
  const cell = (value: unknown) => {
    let text = value == null ? '' : String(value);
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers.map(cell).join(','), ...rows.map(row => headers.map(key => cell(row[key])).join(','))].join('\r\n');
}

export function downloadReportCsv(rows: Record<string, unknown>[], filename: string, headers?: string[]) {
  const url = URL.createObjectURL(new Blob([reportCsv(rows, headers)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
