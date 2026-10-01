// Pure input rules for the launches surface — shared by the worker handlers and
// the console form model, and unit-tested on their own.

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;
export const RESERVED_HANDLES = new Set(["me", "admin", "launches", "makers", "api", "www", "about", "login"]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

export function normalizeTags(input: unknown): string[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") return null;
    const s = slugify(t).slice(0, 24);
    if (s && !out.includes(s)) out.push(s);
  }
  return out.length <= 5 ? out : null;
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export interface ProductFields {
  name?: unknown;
  tagline?: unknown;
  url?: unknown;
  slug?: unknown;
  description?: unknown;
  tags?: unknown;
}

/** Validate create/update fields. `partial` allows omitted fields (PATCH). */
export function validateProductFields(
  body: ProductFields,
  partial: boolean,
): { ok: true; value: { name?: string; tagline?: string; url?: string; slug?: string; description?: string; tags?: string[] } } | { ok: false; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  const value: { name?: string; tagline?: string; url?: string; slug?: string; description?: string; tags?: string[] } = {};

  if (body.name !== undefined || !partial) {
    if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 60) {
      fields.name = ["Name must be 2–60 characters"];
    } else value.name = body.name.trim();
  }
  if (body.tagline !== undefined || !partial) {
    if (typeof body.tagline !== "string" || body.tagline.trim().length < 4 || body.tagline.trim().length > 120) {
      fields.tagline = ["Tagline must be 4–120 characters"];
    } else value.tagline = body.tagline.trim();
  }
  if (body.url !== undefined || !partial) {
    if (!isHttpUrl(body.url)) fields.url = ["A valid http(s) URL is required"];
    else value.url = body.url;
  }
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !SLUG_RE.test(body.slug)) fields.slug = ["Slug must be lowercase letters, digits and hyphens (max 64)"];
    else value.slug = body.slug;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 5000) fields.description = ["Description must be at most 5000 characters"];
    else value.description = body.description;
  }
  if (body.tags !== undefined) {
    const tags = normalizeTags(body.tags);
    if (tags === null) fields.tags = ["Tags must be up to 5 short strings"];
    else value.tags = tags;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value };
}

export function validateProfile(body: Record<string, unknown>):
  | { ok: true; value: { handle: string; displayName: string; bio: string | null; websiteUrl: string | null; twitter: string | null } }
  | { ok: false; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {};
  const handle = typeof body.handle === "string" ? body.handle.trim().toLowerCase() : "";
  if (!HANDLE_RE.test(handle) || RESERVED_HANDLES.has(handle)) fields.handle = ["Handle must be 3–32 lowercase letters, digits, hyphens or underscores"];
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (displayName.length < 1 || displayName.length > 60) fields.displayName = ["Display name must be 1–60 characters"];
  const bio = body.bio === undefined || body.bio === null ? null : typeof body.bio === "string" && body.bio.length <= 280 ? body.bio : undefined;
  if (bio === undefined) fields.bio = ["Bio must be at most 280 characters"];
  const websiteUrl = body.websiteUrl === undefined || body.websiteUrl === null || body.websiteUrl === "" ? null : isHttpUrl(body.websiteUrl) ? body.websiteUrl : undefined;
  if (websiteUrl === undefined) fields.websiteUrl = ["Website must be a valid http(s) URL"];
  const twitter = body.twitter === undefined || body.twitter === null || body.twitter === "" ? null : typeof body.twitter === "string" && /^[A-Za-z0-9_]{1,15}$/.test(body.twitter.replace(/^@/, "")) ? body.twitter.replace(/^@/, "") : undefined;
  if (twitter === undefined) fields.twitter = ["Twitter handle must be 1–15 letters, digits or underscores"];
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: { handle, displayName, bio: bio ?? null, websiteUrl: websiteUrl ?? null, twitter: twitter ?? null } };
}

export function validateComment(body: Record<string, unknown>): { ok: true; value: string } | { ok: false; fields: Record<string, string[]> } {
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length < 1 || text.length > 2000) return { ok: false, fields: { body: ["Comment must be 1–2000 characters"] } };
  return { ok: true, value: text };
}
