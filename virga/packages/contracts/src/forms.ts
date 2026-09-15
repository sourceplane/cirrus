// Forms contract — anything a visitor types into a box and sends.
//
// A form is a key (`contact`, `feedback`, `launch-request`) the site names;
// site-api accepts any key that matches FORM_KEY_RE and stores the fields as
// an opaque document. The owner reads submissions through the CLI.

export type SubmissionStatus = "new" | "read" | "archived" | "spam";

export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  "new",
  "read",
  "archived",
  "spam",
];

export const FORM_KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;

/** Bound the document so a hostile client cannot fill the database. */
export const FORM_LIMITS = {
  maxFields: 32,
  maxKeyLength: 64,
  maxValueLength: 4000,
} as const;

export interface FormSubmitRequest {
  fields: Record<string, string>;
  /** A field real browsers leave empty; a value means a bot filled the form. */
  honeypot?: string;
  turnstileToken?: string;
}

export interface FormSubmitResponse {
  id: string;
  status: "accepted";
}

export interface Submission {
  id: string;
  form: string;
  fields: Record<string, string>;
  status: SubmissionStatus;
  /** Opaque, salted visitor fingerprint — never an IP address. */
  visitor: string | null;
  createdAt: string;
  updatedAt: string;
}
