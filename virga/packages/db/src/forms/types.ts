export type { SqlExecutor } from "../d1/executor.js";

export type SubmissionStatus = "new" | "read" | "archived" | "spam";

export type FormsError =
  | { kind: "not_found" }
  | { kind: "internal"; message: string };

export type FormsResult<T> = { ok: true; value: T } | { ok: false; error: FormsError };

export interface StoredSubmission {
  id: string;
  form: string;
  fields: Record<string, string>;
  status: SubmissionStatus;
  visitor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubmissionInput {
  id: string;
  form: string;
  fields: Record<string, string>;
  visitor: string | null;
  now: string;
}

export interface ListSubmissionsInput {
  form?: string | undefined;
  status?: SubmissionStatus | undefined;
  cursor?: string | null | undefined;
  limit?: number | undefined;
}

export interface SubmissionPage {
  items: StoredSubmission[];
  nextCursor: string | null;
}

export interface FormsRepository {
  create(input: CreateSubmissionInput): Promise<FormsResult<StoredSubmission>>;
  findById(id: string): Promise<FormsResult<StoredSubmission>>;
  list(input: ListSubmissionsInput): Promise<FormsResult<SubmissionPage>>;
  updateStatus(id: string, status: SubmissionStatus, now: string): Promise<FormsResult<StoredSubmission>>;
  counts(): Promise<FormsResult<{ new: number; total: number }>>;
}
