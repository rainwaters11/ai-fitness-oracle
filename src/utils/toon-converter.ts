/**
 * TOON — Token-Optimized Object Notation
 *
 * A compact, header-based serialisation format designed to reduce token usage
 * when sending structured data to large-language-model APIs.
 *
 * Format rules:
 *  - Each section starts with an ALL-CAPS header in square brackets, e.g. [SESSION]
 *  - Key-value pairs use `key: value` (no quotes, no braces)
 *  - Nested objects are flattened with dot notation, e.g. `user.name: Alice`
 *  - Arrays are rendered as comma-separated values on a single line
 *  - Empty values are omitted entirely
 *  - Lines are separated by a single newline character
 */

/**
 * Flatten a nested object into dot-notation key-value pairs.
 * e.g. { user: { name: "Alice" } } → { "user.name": "Alice" }
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      const rendered = value
        .map((item) =>
          typeof item === "object" && item !== null
            ? JSON.stringify(item)
            : String(item)
        )
        .join(", ");
      if (rendered) result[fullKey] = rendered;
    } else if (typeof value === "object") {
      const nested = flattenObject(
        value as Record<string, unknown>,
        fullKey
      );
      Object.assign(result, nested);
    } else {
      const str = String(value);
      if (str) result[fullKey] = str;
    }
  }

  return result;
}

/**
 * Convert a JSON gym-log object (or any structured data) to TOON format.
 *
 * Top-level keys become HEADER sections; their values are rendered as
 * `key: value` lines beneath the header.  Scalar top-level values are
 * placed under a generic [DATA] section.
 *
 * @param data - Any JSON-serialisable value (object, array, or primitive).
 * @returns    A TOON-formatted string ready to be embedded in an AI prompt.
 *
 * @example
 * convertToToon({
 *   session: { date: "2024-01-15", duration: 60 },
 *   exercises: [{ name: "squat", sets: 3 }],
 * })
 * // =>
 * // [SESSION]
 * // date: 2024-01-15
 * // duration: 60
 * //
 * // [EXERCISES]
 * // 0.name: squat
 * // 0.sets: 3
 */
export function convertToToon(data: unknown): string {
  if (data === null || data === undefined) {
    return "";
  }

  // Primitive value — wrap in a generic DATA section
  if (typeof data !== "object") {
    return `[DATA]\nvalue: ${String(data)}`;
  }

  // Array at the top level — treat each element as an indexed entry
  if (Array.isArray(data)) {
    const sections: string[] = [];
    (data as unknown[]).forEach((item, index) => {
      const header = `[ITEM_${index}]`;
      if (item === null || item === undefined) return;
      if (typeof item !== "object") {
        sections.push(`${header}\nvalue: ${String(item)}`);
      } else {
        const pairs = flattenObject(item as Record<string, unknown>);
        const lines = Object.entries(pairs)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");
        if (lines) sections.push(`${header}\n${lines}`);
      }
    });
    return sections.join("\n\n");
  }

  // Object — each top-level key becomes its own HEADER section
  const sections: string[] = [];

  for (const [sectionKey, sectionValue] of Object.entries(
    data as Record<string, unknown>
  )) {
    const header = `[${sectionKey.toUpperCase()}]`;

    if (sectionValue === null || sectionValue === undefined) {
      continue;
    }

    if (typeof sectionValue !== "object") {
      sections.push(`${header}\n${sectionKey}: ${String(sectionValue)}`);
      continue;
    }

    if (Array.isArray(sectionValue)) {
      const items: string[] = [];
      (sectionValue as unknown[]).forEach((item, index) => {
        if (item === null || item === undefined) return;
        if (typeof item !== "object") {
          items.push(`${index}: ${String(item)}`);
        } else {
          const pairs = flattenObject(item as Record<string, unknown>, String(index));
          items.push(
            ...Object.entries(pairs).map(([k, v]) => `${k}: ${v}`)
          );
        }
      });
      if (items.length) sections.push(`${header}\n${items.join("\n")}`);
      continue;
    }

    // Nested object — flatten with dot notation
    const pairs = flattenObject(sectionValue as Record<string, unknown>);
    const lines = Object.entries(pairs)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    if (lines) sections.push(`${header}\n${lines}`);
  }

  return sections.join("\n\n");
}
