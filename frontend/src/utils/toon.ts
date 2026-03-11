/**
 * frontend/src/utils/toon.ts
 *
 * TOON — Token-Optimized Object Notation helper for the AI Fitness Oracle
 * frontend.  Re-exports the canonical converter and adds frontend-specific
 * convenience wrappers.
 *
 * TOON format rules (summary):
 *  - Sections start with an ALL-CAPS header: [SECTION_NAME]
 *  - Key-value pairs: `key: value`  (no quotes, no braces)
 *  - Nested keys use dot notation: `user.name: Alice`
 *  - Arrays are comma-separated on a single line
 *  - Empty / null / undefined values are omitted
 */

// ---------------------------------------------------------------------------
// Core TOON serialiser (duplicated here so the frontend bundle stays
// self-contained and does not depend on the /src tree at runtime).
// ---------------------------------------------------------------------------

function flattenObject(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) continue;

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
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      const str = String(value);
      if (str) result[fullKey] = str;
    }
  }

  return result;
}

/**
 * Convert any JSON gym-log (or other structured data) to TOON format.
 *
 * @param data - Any JSON-serialisable value.
 * @returns    A TOON-formatted string.
 *
 * @example
 * convertToToon({ session: { date: "2024-01-15", duration: 60 } })
 * // "[SESSION]\ndate: 2024-01-15\nduration: 60"
 */
export function convertToToon(data: unknown): string {
  if (data === null || data === undefined) return "";

  if (typeof data !== "object") {
    return `[DATA]\nvalue: ${String(data)}`;
  }

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

  const sections: string[] = [];

  for (const [sectionKey, sectionValue] of Object.entries(
    data as Record<string, unknown>
  )) {
    const header = `[${sectionKey.toUpperCase()}]`;

    if (sectionValue === null || sectionValue === undefined) continue;

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
          items.push(...Object.entries(pairs).map(([k, v]) => `${k}: ${v}`));
        }
      });
      if (items.length) sections.push(`${header}\n${items.join("\n")}`);
      continue;
    }

    const pairs = flattenObject(sectionValue as Record<string, unknown>);
    const lines = Object.entries(pairs)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    if (lines) sections.push(`${header}\n${lines}`);
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Frontend-specific helpers
// ---------------------------------------------------------------------------

/**
 * Build the TOON-formatted system prompt that is sent to the Gemini API
 * together with workout media (images / video frames).
 *
 * @param gymLog - Raw gym-log JSON received from the user's session.
 * @returns       A complete system prompt string with TOON-encoded context.
 */
export function buildGymLogPrompt(gymLog: unknown): string {
  const toon = convertToToon(gymLog);
  return [
    "[SYSTEM]",
    "role: AI Fitness Oracle",
    "task: Analyse the attached workout media and verify exercise form and rep count",
    "format: TOON",
    "",
    "[GYM_LOG]",
    toon,
    "",
    "[INSTRUCTIONS]",
    "1. Verify each exercise listed in GYM_LOG against the media provided",
    "2. Count verified reps and sets",
    "3. Flag any form issues with severity: low | medium | high",
    "4. Return a TOON-formatted response with sections: VERIFIED, ISSUES, STREAK_DELTA",
  ].join("\n");
}
