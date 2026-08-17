/**
 * Deterministic / Canonical JSON Serializer (RFC 8785 subset)
 * Guarantees exact, byte-identical JSON representation across platforms and runtimes.
 */

export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const elements = obj.map((item) => canonicalJsonStringify(item));
    return `[${elements.join(',')}]`;
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys
    .filter((key) => (obj as Record<string, unknown>)[key] !== undefined)
    .map((key) => {
      const val = (obj as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${canonicalJsonStringify(val)}`;
    });

  return `{${pairs.join(',')}}`;
}
