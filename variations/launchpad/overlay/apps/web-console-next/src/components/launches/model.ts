/**
 * Pure view-model helpers for the launch directory pages. Dependency-free so
 * they are unit-testable; the worker owns the authoritative validation.
 */

import type { PublicProduct } from "@saas/contracts/launches";

export const RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "all", label: "All time" },
] as const;
export type RangeValue = (typeof RANGES)[number]["value"];

export function isRange(v: string | null | undefined): v is RangeValue {
  return v === "today" || v === "week" || v === "all";
}

/** Mirror of the worker's slug derivation, for the live preview under the name field. */
export function previewSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

/** Comma/space separated tag input → normalized list (max 5, deduped). */
export function parseTagInput(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const t = previewSlug(part).slice(0, 24);
    if (t && !out.includes(t)) out.push(t);
    if (out.length === 5) break;
  }
  return out;
}

export function statusLabel(status: PublicProduct["status"]): { label: string; tone: "default" | "secondary" | "success" | "warning" } {
  switch (status) {
    case "live":
      return { label: "Live", tone: "success" };
    case "archived":
      return { label: "Archived", tone: "secondary" };
    default:
      return { label: "Draft", tone: "warning" };
  }
}

/** Host shown next to a product ("acme.dev"), never the full URL. */
export function displayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "3h ago" / "2d ago" / "Sep 9" — compact, for lists. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface ProductFormValues {
  name: string;
  tagline: string;
  url: string;
  description: string;
  tags: string;
}

export function validateProductForm(v: ProductFormValues): Partial<Record<keyof ProductFormValues, string>> {
  const errors: Partial<Record<keyof ProductFormValues, string>> = {};
  const name = v.name.trim();
  if (name.length < 2 || name.length > 60) errors.name = "2–60 characters";
  const tagline = v.tagline.trim();
  if (tagline.length < 4 || tagline.length > 120) errors.tagline = "4–120 characters";
  try {
    const u = new URL(v.url);
    if (u.protocol !== "https:" && u.protocol !== "http:") errors.url = "Must be an http(s) URL";
  } catch {
    errors.url = "Must be a valid URL";
  }
  if (v.description.length > 5000) errors.description = "At most 5000 characters";
  if (parseTagInput(v.tags).length !== v.tags.split(/[,\n]/).filter((t) => t.trim()).length && v.tags.split(/[,\n]/).filter((t) => t.trim()).length > 5) {
    errors.tags = "Up to 5 tags";
  }
  return errors;
}
