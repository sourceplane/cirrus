/**
 * Product surface registration (Launchpad — the launch directory).
 *
 * The console shell is the Cirrus baseline's; this file is the one place that
 * tells it what THE PRODUCT is: where signed-in users land, which primary nav
 * section and mobile tabs the product contributes, and its public routes.
 * Under the Solo profile the user is the tenant, so none of these carry an
 * organization slug.
 */

import { SOLO_MODE } from "./solo-mode";

export const PRODUCT_LABEL = "Launchpad";

/** Where an authenticated user lands (app root and post-login). */
export const PRODUCT_HOME = "/launches";

/** Public routes (no session needed). */
export const PUBLIC_HOME = "/explore";

export interface ProductNavLink {
  href: string;
  label: string;
  /** lucide icon name, resolved by the renderer. */
  icon: string;
}

export const PRODUCT_NAV: ProductNavLink[] = [
  { href: "/launches", label: "My launches", icon: "Rocket" },
  { href: "/launches/new", label: "Submit a launch", icon: "PlusCircle" },
  { href: "/profile", label: "Maker profile", icon: "User2" },
  { href: "/explore", label: "Explore", icon: "Globe" },
];

/** Mobile bottom tabs (max 4). */
export const PRODUCT_TABS: ProductNavLink[] = [
  { href: "/explore", label: "Explore", icon: "Globe" },
  { href: "/launches", label: "Launches", icon: "Rocket" },
  { href: "/launches/new", label: "Submit", icon: "PlusCircle" },
  { href: "/profile", label: "Profile", icon: "User2" },
];

/**
 * Redirect an org-derived destination to the product home. Under Solo the
 * personal workspace is invisible, so the "dashboard" is the product, not the
 * account settings. Onboarding and the baseline profile pass through unchanged.
 */
export function landingDestination(dest: string, soloMode: boolean = SOLO_MODE): string {
  if (!soloMode) return dest;
  if (dest === "/onboarding" || dest === "/login") return dest;
  return PRODUCT_HOME;
}
