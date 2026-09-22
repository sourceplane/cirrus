// Keyset pagination cursors for owner listings.
//
// Every list orders by (created_at DESC, id DESC) and pages with a cursor
// that names the last row seen. The cursor is an opaque base64url string on
// the wire; here it is `{ createdAt, id }`. A malformed cursor decodes to
// null and the caller treats it as "first page" — the owner's CLI never
// needs an error for a stale cursor.

// base64 is available as a global in Workers and Node; this package compiles
// against neither lib, so the two functions it uses are declared.
declare function btoa(data: string): string;
declare function atob(data: string): string;

function toBase64Url(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export interface CursorPosition {
  createdAt: string;
  id: string;
}

export function encodeCursor(position: CursorPosition): string {
  const json = JSON.stringify([position.createdAt, position.id]);
  return toBase64Url(json);
}

export function decodeCursor(raw: string | null | undefined): CursorPosition | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(raw));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string"
    ) {
      return { createdAt: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Clamp a requested page size into [1, max], defaulting when absent. */
export function pageLimit(requested: number | undefined, fallback: number, max: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(requested)));
}

/** Split `limit + 1` rows into the page and its next cursor. */
export function paginate<T extends { createdAt: string; id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  const last = items[items.length - 1]!;
  return { items, nextCursor: encodeCursor({ createdAt: last.createdAt, id: last.id }) };
}
