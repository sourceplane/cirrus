/**
 * Product surface registration (Streakly — the habit tracker).
 *
 * The console shell is the Cirrus baseline's; this file is the one place that
 * tells it what THE PRODUCT is: where signed-in users land and which primary
 * nav section and mobile tabs the product contributes. Under the Solo profile
 * the user is the tenant, so none of these carry an organization slug. The
 * tracker is private, so there are no public routes at all.
 */

import { SOLO_MODE } from "./solo-mode";

export const PRODUCT_LABEL = "Streakly";

/** Where an authenticated person lands (app root and post-login). */
export const PRODUCT_HOME = "/today";

export interface ProductNavLink {
  href: string;
  label: string;
  /** lucide icon name, resolved by the renderer. */
  icon: string;
}

export const PRODUCT_NAV: ProductNavLink[] = [
  { href: "/today", label: "Today", icon: "CheckCircle2" },
  { href: "/habits", label: "Habits", icon: "ListChecks" },
  { href: "/review", label: "Weekly review", icon: "CalendarDays" },
];

/** Mobile bottom tabs (max 4). */
export const PRODUCT_TABS: ProductNavLink[] = [
  { href: "/today", label: "Today", icon: "CheckCircle2" },
  { href: "/habits", label: "Habits", icon: "ListChecks" },
  { href: "/review", label: "Review", icon: "CalendarDays" },
];

/**
 * Redirect an org-derived destination to the product home. Under Solo the
 * personal workspace is invisible, so the "dashboard" is the product, not the
 * account settings. Onboarding and login pass through unchanged.
 */
export function landingDestination(dest: string, soloMode: boolean = SOLO_MODE): string {
  if (!soloMode) return dest;
  if (dest === "/onboarding" || dest === "/login") return dest;
  return PRODUCT_HOME;
}
