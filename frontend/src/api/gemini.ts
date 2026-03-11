/**
 * frontend/src/api/gemini.ts
 *
 * Gemini API integration for the AI Fitness Oracle.
 *
 * Sends workout media (image / video buffers) together with a TOON-formatted
 * system prompt to the Google Gemini multimodal API and returns the model's
 * TOON-formatted response.
 *
 * Prerequisites:
 *   npm install @google/generative-ai
 *
 * Environment variables (set in .env.local, never committed):
 *   VITE_GEMINI_API_KEY  — your Google AI Studio API key
 */

import {
  GoogleGenerativeAI,
  type GenerateContentRequest,
  type Part,
} from "@google/generative-ai";
import { buildGymLogPrompt } from "../utils/toon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A media buffer to be analysed alongside the gym log. */
export interface WorkoutMedia {
  /** Raw binary data of the image or video frame. */
  data: Uint8Array | ArrayBuffer;
  /** MIME type, e.g. "image/jpeg", "image/png", "video/mp4". */
  mimeType: string;
}

/** Structured result returned after Gemini analysis. */
export interface GeminiAnalysisResult {
  /** Raw TOON-formatted text returned by the model. */
  rawToon: string;
  /** Whether the session was considered verified by the model. */
  verified: boolean;
  /** Suggested delta (+/-) for the user's streak count. */
  streakDelta: number;
  /** Any form issues flagged by the model. */
  issues: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key =
    typeof import.meta !== "undefined"
      ? (import.meta as Record<string, unknown> & { env?: Record<string, string> })
          .env?.VITE_GEMINI_API_KEY
      : process.env["VITE_GEMINI_API_KEY"];

  if (!key) {
    throw new Error(
      "VITE_GEMINI_API_KEY is not set. Add it to your .env.local file."
    );
  }
  return key;
}

/**
 * Convert a `Uint8Array` or `ArrayBuffer` to a base-64 string for the
 * Gemini `inlineData` part format.
 */
function toBase64(buffer: Uint8Array | ArrayBuffer): string {
  const bytes =
    buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Parse a TOON string returned by the model to extract high-level fields.
 * This is a best-effort parser; callers should always check `rawToon` for
 * the full response.
 */
function parseToonResponse(toon: string): Omit<GeminiAnalysisResult, "rawToon"> {
  const lines = toon.split("\n").map((l) => l.trim());

  let verified = false;
  let streakDelta = 0;
  const issues: string[] = [];

  let currentSection = "";

  for (const line of lines) {
    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).toUpperCase();
      continue;
    }

    if (!line || !line.includes(":")) continue;

    const colonIdx = line.indexOf(":");
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (currentSection === "VERIFIED") {
      if (key === "status") verified = value.toLowerCase() === "true" || value === "1";
    } else if (currentSection === "STREAK_DELTA") {
      if (key === "delta") streakDelta = parseInt(value, 10) || 0;
    } else if (currentSection === "ISSUES") {
      if (value) issues.push(`${key}: ${value}`);
    }
  }

  return { verified, streakDelta, issues };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send workout media + a TOON-formatted gym log to the Gemini API for
 * AI-powered form analysis and streak verification.
 *
 * @param gymLog  - Raw gym-log JSON (will be converted to TOON internally).
 * @param media   - One or more image / video buffers captured during the session.
 * @param modelId - Gemini model to use (defaults to "gemini-1.5-pro").
 * @returns         Parsed analysis result including the raw TOON response.
 *
 * @example
 * const result = await analyseWorkout(
 *   { session: { date: "2024-01-15", duration: 60 },
 *     exercises: [{ name: "squat", sets: 3, reps: 10 }] },
 *   [{ data: imageBuffer, mimeType: "image/jpeg" }]
 * );
 * console.log(result.verified);    // true
 * console.log(result.streakDelta); // 1
 */
export async function analyseWorkout(
  gymLog: unknown,
  media: WorkoutMedia[],
  modelId = "gemini-1.5-pro"
): Promise<GeminiAnalysisResult> {
  const genAI = new GoogleGenerativeAI(getApiKey());
  const model = genAI.getGenerativeModel({ model: modelId });

  const systemPrompt = buildGymLogPrompt(gymLog);

  const parts: Part[] = [
    { text: systemPrompt },
    ...media.map(
      ({ data, mimeType }): Part => ({
        inlineData: {
          mimeType,
          data: toBase64(data),
        },
      })
    ),
  ];

  const request: GenerateContentRequest = { contents: [{ role: "user", parts }] };

  const response = await model.generateContent(request);
  const rawToon = response.response.text();

  return {
    rawToon,
    ...parseToonResponse(rawToon),
  };
}
