// Error contract.
//
// Every non-2xx response from site-api carries this envelope, and every
// client (the site's islands, the CLI) branches on `error.code`, never on
// the message.

export interface ErrorEnvelope {
  error: {
    code: ErrorCode | string;
    message: string;
    details: Record<string, unknown>;
    requestId: string;
  };
}

export const ERROR_CODES = {
  BAD_REQUEST: "bad_request",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  VALIDATION_FAILED: "validation_failed",
  PRECONDITION_FAILED: "precondition_failed",
  UNSUPPORTED: "unsupported",
  INTERNAL_ERROR: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
