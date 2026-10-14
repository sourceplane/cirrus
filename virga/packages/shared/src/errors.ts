// Generic error utilities — no domain knowledge.

export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export function isApplicationError(err: unknown): err is ApplicationError {
  return err instanceof ApplicationError;
}

/** A bounded, single-line, log-safe rendering of any thrown value. */
export function errorMessage(err: unknown, max = 200): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}
