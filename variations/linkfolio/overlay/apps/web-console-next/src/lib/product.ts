/**
 * Product surface registration (Linkfolio — the creator page).
 *
 * The console shell is the Cirrus baseline's; this file is the one place that
 * tells it what THE PRODUCT is: where signed-in users land, which primary nav
 * section and mobile tabs the product contributes, and its public routes.
 * Under the Solo profile the user is the tenant, so none of these carry an
 * organization slug.
 */

import { SOLO_MODE } from "./solo-mode";

export const PRODUCT_LABEL = "Linkfolio";

/** Where an authenticated creator lands (app root and post-login). */
export const PRODUCT_HOME = "/page";

export interface ProductNavLink {
  href: string;
  label: string;
  /** lucide icon name, resolved by the renderer. */
  icon: string;
}

export const PRODUCT_NAV: ProductNavLink[] = [
  { href: "/page", label: "My page", icon: "LayoutList" },
  { href: "/page/appearance", label: "Appearance", icon: "Palette" },
  { href: "/page/analytics", label: "Analytics", icon: "BarChart3" },
  { href: "/page/preview", label: "View public page", icon: "Globe" },
];

/** Mobile bottom tabs (max 4). */
export const PRODUCT_TABS: ProductNavLink[] = [
  { href: "/page", label: "Page", icon: "LayoutList" },
  { href: "/page/appearance", label: "Theme", icon: "Palette" },
  { href: "/page/analytics", label: "Stats", icon: "BarChart3" },
  { href: "/page/preview", label: "View", icon: "Globe" },
];

/** The public URL of a creator's page. */
export function publicPagePath(handle: string): string {
  return `/p/${handle}`;
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
