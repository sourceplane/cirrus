// The one file a new site edits first. Everything about the site's identity
// lives here; everything about its content lives in `content/`.

export interface SiteConfig {
  /** Display name — also the smoke marker the deploy checks for on `/`. */
  name: string;
  tagline: string;
  description: string;
  /** Canonical origin, without a trailing slash. */
  url: string;
  /** site-api origin; `NEXT_PUBLIC_SITE_API_URL` overrides per environment. */
  apiUrl: string;
  author: { name: string; url?: string };
  social: Array<{ label: string; href: string }>;
  /** Extra nav links (content sections and the standard pages are automatic). */
  nav: Array<{ label: string; href: string }>;
  /**
   * Sections render automatically when their content folder has files.
   * Set one to `false` to hide it even when content exists.
   */
  sections: { posts?: boolean; projects?: boolean; launches?: boolean; subscribe?: boolean; contact?: boolean };
  /** Copy for the section headings and the subscribe box. */
  copy: {
    posts: string;
    projects: string;
    launches: string;
    subscribeTitle: string;
    subscribeBlurb: string;
    contactTitle: string;
    contactBlurb: string;
  };
}

const config: SiteConfig = {
  name: "Virga",
  tagline: "A site with an audience, shipped from git.",
  description:
    "Virga is a Cloudflare-only baseline for launch directories, newsletters and portfolios — one owner, many readers, no console.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://virga.site",
  apiUrl: process.env.NEXT_PUBLIC_SITE_API_URL || "http://localhost:8787",
  author: { name: "The owner", url: "https://github.com/sourceplane" },
  social: [{ label: "GitHub", href: "https://github.com/sourceplane/virga" }],
  nav: [],
  sections: {},
  copy: {
    posts: "Writing",
    projects: "Projects",
    launches: "Launches",
    subscribeTitle: "Get new issues by email",
    subscribeBlurb: "One email when something ships. No tracking, unsubscribe in one click.",
    contactTitle: "Say hello",
    contactBlurb: "Questions, ideas, a launch to list — send it over.",
  },
};

export default config;
