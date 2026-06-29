import "server-only";

/**
 * Telemetry helpers (PRD 5.9). Provides AI SDK v7 OpenTelemetry config and a
 * lightweight server-side event tracker. Both redact secrets/sensitive payloads
 * before anything is emitted, so tokens and keys never reach logs (PRD 5.17).
 */

const SENSITIVE_KEY = /token|secret|password|api[_-]?key|authorization|cookie/i;

/** Recursively redact obviously-sensitive fields from arbitrary metadata. */
export function redactSecrets<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redactSecrets(v);
  }
  return out as T;
}

/**
 * AI SDK v7 telemetry config. Pass as `experimental_telemetry` to streamText /
 * generateText. Prompt/completion recording is OFF by default and only enabled
 * when HUGO_RECORD_PROMPTS=true (admin debugging, PRD 5.17).
 */
export function hugoTelemetry(
  functionId: string,
  metadata: Record<string, string | number | boolean> = {},
) {
  const recordInputs = process.env.HUGO_RECORD_PROMPTS === "true";
  return {
    isEnabled: true,
    functionId,
    recordInputs,
    recordOutputs: recordInputs,
    metadata: redactSecrets(metadata),
  };
}

type TrackProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Emit a product/AI event. Today this writes a structured line that Vercel
 * Observability ingests; it is the single seam to add a metrics sink later.
 */
export function track(event: string, props: TrackProps = {}): void {
  const safe = redactSecrets(props);
  // Structured, greppable, and picked up by Vercel log drains / Observability.
  console.log(
    JSON.stringify({ kind: "hugo.event", event, ...safe, at: Date.now() }),
  );
}
