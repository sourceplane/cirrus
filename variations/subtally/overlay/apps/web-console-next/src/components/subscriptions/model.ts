/**
 * Pure view-model helpers for the recurring-expense tracker. Dependency-free
 * so they are unit-testable; the worker owns the authoritative validation and
 * the renewal math.
 */

import type { ExpenseCadence, TrackedSubscriptionStatus } from "@saas/contracts/subscriptions";

export const CADENCES: { value: ExpenseCadence; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Every N days" },
];

export const CATEGORIES = ["streaming", "software", "utilities", "insurance", "health", "food", "transport", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  streaming: "Streaming",
  software: "Software",
  utilities: "Utilities",
  insurance: "Insurance",
  health: "Health",
  food: "Food",
  transport: "Transport",
  other: "Other",
};

/** Minor units → a localized amount. Falls back when the code is not a currency. */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function cadenceLabel(cadence: ExpenseCadence, intervalDays: number | null): string {
  if (cadence === "custom") return `Every ${intervalDays ?? 1} days`;
  return CADENCES.find((c) => c.value === cadence)?.label ?? cadence;
}

export function statusTone(status: TrackedSubscriptionStatus): "success" | "warning" | "secondary" {
  if (status === "active") return "success";
  if (status === "paused") return "warning";
  return "secondary";
}

/** "in 3 days" / "tomorrow" / "today" — the renewal countdown. */
export function daysUntilLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** Today as the browser sees it, `YYYY-MM-DD`. */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export interface SubscriptionFormValues {
  name: string;
  amount: string;
  currency: string;
  cadence: ExpenseCadence;
  intervalDays: string;
  anchorDate: string;
  category: Category;
  url: string;
  notes: string;
}

export function emptySubscriptionForm(today = localDateString()): SubscriptionFormValues {
  return { name: "", amount: "", currency: "USD", cadence: "monthly", intervalDays: "30", anchorDate: today, category: "other", url: "", notes: "" };
}

/** "12.99" → 1299. Returns null when the input is not a clean amount. */
export function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function validateSubscriptionForm(v: SubscriptionFormValues): Partial<Record<keyof SubscriptionFormValues, string>> {
  const errors: Partial<Record<keyof SubscriptionFormValues, string>> = {};
  const name = v.name.trim();
  if (name.length < 1 || name.length > 60) errors.name = "1–60 characters";
  if (parseAmountInput(v.amount) === null) errors.amount = "Use a plain amount, e.g. 12.99";
  if (!/^[A-Za-z]{3}$/.test(v.currency.trim())) errors.currency = "Three-letter code";
  if (v.cadence === "custom") {
    const n = Number(v.intervalDays);
    if (!Number.isInteger(n) || n < 1 || n > 3650) errors.intervalDays = "A whole number of days";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.anchorDate)) errors.anchorDate = "Pick a date";
  if (v.url.trim() !== "") {
    try {
      const u = new URL(v.url);
      if (u.protocol !== "https:" && u.protocol !== "http:") errors.url = "Must be an http(s) URL";
    } catch {
      errors.url = "Must be a valid URL";
    }
  }
  if (v.notes.length > 1000) errors.notes = "At most 1000 characters";
  return errors;
}

/** The single currency to show when there is exactly one; otherwise null. */
export function soleCurrency(totals: Record<string, number>): string | null {
  const codes = Object.keys(totals);
  return codes.length === 1 ? codes[0]! : null;
}

/** Share of the biggest category, for the bars on the categories page. */
export function categoryShare(monthlyCents: number, maxMonthlyCents: number): number {
  if (maxMonthlyCents <= 0) return 0;
  return Math.round((monthlyCents / maxMonthlyCents) * 100);
}
