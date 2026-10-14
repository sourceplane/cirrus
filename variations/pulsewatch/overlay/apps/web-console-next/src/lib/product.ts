/**
 * Product surface registration (Pulsewatch — uptime monitoring).
 *
 * The console shell is the Cirrus baseline's; this file is the one place that
 * tells it what THE PRODUCT is: where signed-in users land, which primary nav
 * section and mobile tabs the product contributes, and its public route. Under
 * the Solo profile the user is the tenant, so none of these carry an
 * organization slug.
 */

import { SOLO_MODE } from "./solo-mode";

export const PRODUCT_LABEL = "Pulsewatch";

/** Where an authenticated developer lands (app root and post-login). */
export const PRODUCT_HOME = "/monitors";

export interface ProductNavLink {
  href: string;
  label: string;
  /** lucide icon name, resolved by the renderer. */
  icon: string;
}

export const PRODUCT_NAV: ProductNavLink[] = [
  { href: "/monitors", label: "Monitors", icon: "Activity" },
  { href: "/incidents", label: "Incidents", icon: "Siren" },
  { href: "/status-page", label: "Status page", icon: "Globe" },
];

/** Mobile bottom tabs (max 4). */
export const PRODUCT_TABS: ProductNavLink[] = [
  { href: "/monitors", label: "Monitors", icon: "Activity" },
  { href: "/incidents", label: "Incidents", icon: "Siren" },
  { href: "/status-page", label: "Status", icon: "Globe" },
];

/** The public URL of an owner's status page. */
export function statusPagePath(handle: string): string {
  return `/status/${handle}`;
}

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
