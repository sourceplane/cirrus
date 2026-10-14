// Build-time view of the site: config + which sections have content.

import { resolve } from "node:path";
import config from "../../site.config";
import { loadCollection, type Entry, type Launch, type Page, type Post, type Project } from "./content";

export const CONTENT_ROOT = resolve(process.cwd(), "content");
const includeDrafts = (process.env.NEXT_PUBLIC_DEPLOY_ENV || "dev") === "dev";

export const site = config;

export function posts(): Entry<Post>[] {
  return loadCollection("posts", { root: CONTENT_ROOT, includeDrafts });
}
export function projects(): Entry<Project>[] {
  return loadCollection("projects", { root: CONTENT_ROOT, includeDrafts });
}
export function launches(): Entry<Launch>[] {
  return loadCollection("launches", { root: CONTENT_ROOT, includeDrafts });
}
export function pages(): Entry<Page>[] {
  return loadCollection("pages", { root: CONTENT_ROOT, includeDrafts });
}

export interface Sections {
  posts: boolean;
  projects: boolean;
  launches: boolean;
  subscribe: boolean;
  contact: boolean;
}

/** A section is on when it has content and config did not turn it off. */
export function sections(): Sections {
  const s = config.sections;
  return {
    posts: s.posts !== false && posts().length > 0,
    projects: s.projects !== false && projects().length > 0,
    launches: s.launches !== false && launches().length > 0,
    subscribe: s.subscribe !== false,
    contact: s.contact !== false,
  };
}

export interface NavLink {
  label: string;
  href: string;
}

export function navLinks(): NavLink[] {
  const on = sections();
  const links: NavLink[] = [];
  if (on.launches) links.push({ label: config.copy.launches, href: "/launches" });
  if (on.posts) links.push({ label: config.copy.posts, href: "/posts" });
  if (on.projects) links.push({ label: config.copy.projects, href: "/projects" });
  for (const p of pages()) if (p.data.nav) links.push({ label: p.data.title, href: `/${p.slug}` });
  if (on.contact) links.push({ label: "Contact", href: "/contact" });
  links.push(...config.nav);
  return links;
}

export function absoluteUrl(path: string): string {
  return `${config.url.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
