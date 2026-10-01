// Pure input rules for the pages surface — shared by the worker handlers and
// mirrored by the console form model, and unit-tested on their own.

export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;
export const RESERVED_HANDLES = new Set(["me", "admin", "api", "www", "p", "page", "login", "about", "help", "support", "settings"]);
export const BLOCK_KINDS = ["link", "header", "product", "tip"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const ACCENT_RE = /^#[0-9a-f]{6}$/i;
export const CURRENCY_RE = /^[A-Z]{3}$/;

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function handleValid(handle: string): boolean {
  const h = handle.trim().toLowerCase();
  return HANDLE_RE.test(h) && !RESERVED_HANDLES.has(h);
}

export interface PageValues {
  handle: string;
  title: string;
  bio: string | null;
  theme: { accent?: string; layout?: "list" | "grid" };
  published: boolean;
}

export function validatePage(body: Record<string, unknown>): { ok: true; value: PageValues } | { ok: false; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};

  const handle = typeof body.handle === "string" ? body.handle.trim().toLowerCase() : "";
  if (!handleValid(handle)) fields.handle = ["Handle must be 3–32 lowercase letters, digits, hyphens or underscores"];

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 1 || title.length > 60) fields.title = ["Title must be 1–60 characters"];

  let bio: string | null = null;
  if (body.bio !== undefined && body.bio !== null) {
    if (typeof body.bio !== "string" || body.bio.length > 280) fields.bio = ["Bio must be at most 280 characters"];
    else bio = body.bio;
  }

  const theme: PageValues["theme"] = {};
  if (body.theme !== undefined && body.theme !== null) {
    if (typeof body.theme !== "object" || Array.isArray(body.theme)) {
      fields.theme = ["Theme must be an object"];
    } else {
      const t = body.theme as Record<string, unknown>;
      if (t.accent !== undefined) {
        if (typeof t.accent !== "string" || !ACCENT_RE.test(t.accent)) fields.theme = ["Accent must be a #rrggbb colour"];
        else theme.accent = t.accent.toLowerCase();
      }
      if (t.layout !== undefined) {
        if (t.layout !== "list" && t.layout !== "grid") fields.theme = [...(fields.theme ?? []), "Layout must be list or grid"];
        else theme.layout = t.layout;
      }
    }
  }

  if (body.published !== undefined && typeof body.published !== "boolean") fields.published = ["Published must be a boolean"];

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: { handle, title, bio, theme, published: body.published === true } };
}

export interface BlockValues {
  kind: BlockKind;
  title: string;
  url: string | null;
  description: string | null;
  priceCents: number | null;
  currency: string | null;
}

/** Validate create (`partial: false`) or patch (`partial: true`) fields. */
export function validateBlock(
  body: Record<string, unknown>,
  partial: boolean,
  kindHint?: BlockKind,
): { ok: true; value: Partial<BlockValues> & { enabled?: boolean } } | { ok: false; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  const value: Partial<BlockValues> & { enabled?: boolean } = {};

  let kind: BlockKind | undefined = kindHint;
  if (!partial) {
    if (typeof body.kind !== "string" || !(BLOCK_KINDS as readonly string[]).includes(body.kind)) {
      fields.kind = ["Kind must be link, header, product or tip"];
    } else {
      kind = body.kind as BlockKind;
      value.kind = kind;
    }
  } else if (body.kind !== undefined) {
    fields.kind = ["A block's kind cannot be changed"];
  }

  if (body.title !== undefined || !partial) {
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 80) {
      fields.title = ["Title must be 1–80 characters"];
    } else value.title = body.title.trim();
  }

  // Everything a visitor can click needs a URL; a header is a label.
  const needsUrl = kind !== undefined && kind !== "header";
  if (body.url !== undefined) {
    if (body.url === null || body.url === "") {
      if (needsUrl) fields.url = ["A link, product or tip block needs a URL"];
      else value.url = null;
    } else if (!isHttpUrl(body.url)) {
      fields.url = ["A valid http(s) URL is required"];
    } else value.url = body.url;
  } else if (!partial && needsUrl) {
    fields.url = ["A link, product or tip block needs a URL"];
  }

  if (body.description !== undefined) {
    if (body.description === null) value.description = null;
    else if (typeof body.description !== "string" || body.description.length > 280) fields.description = ["Description must be at most 280 characters"];
    else value.description = body.description;
  }

  if (body.priceCents !== undefined) {
    if (body.priceCents === null) value.priceCents = null;
    else if (!Number.isInteger(body.priceCents) || (body.priceCents as number) < 0 || (body.priceCents as number) > 100_000_000) {
      fields.priceCents = ["Price must be a whole number of minor units"];
    } else value.priceCents = body.priceCents as number;
  }

  if (body.currency !== undefined) {
    if (body.currency === null) value.currency = null;
    else if (typeof body.currency !== "string" || !CURRENCY_RE.test(body.currency)) fields.currency = ["Currency must be a 3-letter code, e.g. USD"];
    else value.currency = body.currency;
  }

  if (value.priceCents !== undefined && value.priceCents !== null && value.currency === undefined && !partial) {
    value.currency = "USD";
  }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") fields.enabled = ["Enabled must be a boolean"];
    else value.enabled = body.enabled;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value };
}

/** Referrers are visitor-supplied: keep a bounded, printable string or nothing. */
export function normalizeReferrer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 512);
  return trimmed.length > 0 ? trimmed : null;
}
