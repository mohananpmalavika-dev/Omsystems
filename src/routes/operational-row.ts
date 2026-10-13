/** Preserve legacy SQL keys while providing the camel-case API field names. */
export function operationalRow(row: Record<string, unknown>) {
  return { ...row, ...Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value])) };
}
