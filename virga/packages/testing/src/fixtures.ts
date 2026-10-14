import type { HealthResponse } from "@site/contracts";

export function makeHealthResponse(overrides?: Partial<HealthResponse>): HealthResponse {
  return {
    status: "ok",
    service: "test-service",
    environment: "test",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/** A fixed clock for tests that assert on timestamps. */
export const FIXED_NOW = new Date("2026-01-02T03:04:05.000Z");
