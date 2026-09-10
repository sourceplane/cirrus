/**
 * Pure view-model helpers for the page editor and the public page.
 * Dependency-free so they are unit-testable; the worker owns the
 * authoritative validation.
 */

import type { BlockKind, PublicBlock, DailyClickCount } from "@saas/contracts/pages";

export const BLOCK_KINDS: { value: BlockKind; label: string; hint: string }[] = [
  { value: "link", label: "Link", hint: "Anywhere you want to send people." },
  { value: "header", label: "Section header", hint: "A label that groups the blocks under it." },
  { value: "product", label: "Product", hint: "Something to buy, with a price." },
  { value: "tip", label: "Tip jar", hint: "A one-tap way to say thanks." },
];

export const ACCENTS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#0ea5e9", "#111827"] as const;
export const DEFAULT_ACCENT = ACCENTS[0];

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;
const RESERVED = new Set(["me", "admin", "api", "www", "p", "page", "login", "about", "help", "support", "settings"]);

/** Mirror of the worker's handle rule, for inline form feedback. */
export function handleValid(handle: string): boolean {
  const h = handle.trim().toLowerCase();
  return HANDLE_RE.test(h) && !RESERVED.has(h);
}

/** "12.99" → 1299. Returns null when the input is not a clean amount. */
export function parsePriceInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function formatPrice(cents: number | null, currency: string | null): string {
  if (cents === null) return "";
  const code = currency ?? "USD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(cents / 100);
  } catch {
    // An unknown code must not blank out the price.
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

/**
 * Move one id up or down within an order. Returns the same array (by value)
 * when the move would fall off either end, so callers can skip the request.
 */
export function moveItem(ids: string[], id: string, direction: "up" | "down"): string[] {
  const i = ids.indexOf(id);
  if (i < 0) return ids;
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  next[i] = ids[j]!;
  next[j] = ids[i]!;
  return next;
}

export interface BlockFormValues {
  kind: BlockKind;
  title: string;
  url: string;
  description: string;
  price: string;
  currency: string;
}

export function emptyBlockForm(kind: BlockKind = "link"): BlockFormValues {
  return { kind, title: "", url: "", description: "", price: "", currency: "USD" };
}

export function blockToForm(b: PublicBlock): BlockFormValues {
  return {
    kind: b.kind,
    title: b.title,
    url: b.url ?? "",
    description: b.description ?? "",
    price: b.priceCents === null ? "" : (b.priceCents / 100).toFixed(2),
    currency: b.currency ?? "USD",
  };
}

export function validateBlockForm(v: BlockFormValues): Partial<Record<keyof BlockFormValues, string>> {
  const errors: Partial<Record<keyof BlockFormValues, string>> = {};
  const title = v.title.trim();
  if (title.length < 1 || title.length > 80) errors.title = "1–80 characters";

  // A header is a label; everything else is something a visitor clicks.
  if (v.kind !== "header") {
    try {
      const u = new URL(v.url);
      if (u.protocol !== "https:" && u.protocol !== "http:") errors.url = "Must be an http(s) URL";
    } catch {
      errors.url = "Must be a valid URL";
    }
  }
  if (v.description.length > 280) errors.description = "At most 280 characters";
  if (v.price.trim() !== "" && parsePriceInput(v.price) === null) errors.price = "Use a plain amount, e.g. 12.99";
  if (v.price.trim() !== "" && !/^[A-Za-z]{3}$/.test(v.currency.trim())) errors.currency = "Three-letter code";
  return errors;
}

/** The bar height (0–100) for one day, relative to the busiest day shown. */
export function barHeights(byDay: DailyClickCount[]): { date: string; clicks: number; height: number }[] {
  const max = byDay.reduce((m, d) => Math.max(m, d.clicks), 0);
  return byDay.map((d) => ({ ...d, height: max === 0 ? 0 : Math.round((d.clicks / max) * 100) }));
}

/** "Sep 9" — compact axis label for the click chart. */
export function shortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
