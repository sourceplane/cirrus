// Content collections — Markdown + frontmatter, read from `content/` at
// BUILD time only. Every page that uses this module is statically
// generated; nothing here runs in the Worker (there is no filesystem there).
//
// Each collection has a schema; a file that fails it stops the build with
// its path and the field, which is the whole point of validating here.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

export type Collection = "posts" | "projects" | "launches" | "pages";

export interface Frontmatter {
  [key: string]: unknown;
}

export interface Entry<T> {
  slug: string;
  collection: Collection;
  data: T;
  /** Rendered HTML of the body. */
  html: string;
  /** Plain-text excerpt (first ~200 characters of the body). */
  excerpt: string;
  draft: boolean;
}

export interface Post {
  title: string;
  date: string;
  summary: string;
  tags: string[];
}

export interface Project {
  title: string;
  summary: string;
  url: string | null;
  repo: string | null;
  order: number;
  tags: string[];
}

export interface Launch {
  title: string;
  tagline: string;
  url: string;
  maker: string | null;
  date: string;
  tags: string[];
}

export interface Page {
  title: string;
  nav: boolean;
}

export class ContentError extends Error {
  constructor(
    public readonly file: string,
    public readonly field: string,
    reason: string,
  ) {
    super(`${file}: ${field} ${reason}`);
    this.name = "ContentError";
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function str(fm: Frontmatter, file: string, key: string, required: true): string;
function str(fm: Frontmatter, file: string, key: string, required: false): string | null;
function str(fm: Frontmatter, file: string, key: string, required: boolean): string | null {
  const v = fm[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ContentError(file, key, "is required");
    return null;
  }
  if (typeof v !== "string") throw new ContentError(file, key, "must be a string");
  return v;
}

function dateStr(fm: Frontmatter, file: string, key: string): string {
  const v = fm[key];
  const d = v instanceof Date ? v : typeof v === "string" ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new ContentError(file, key, "must be a date (YYYY-MM-DD)");
  return d.toISOString().slice(0, 10);
}

function tags(fm: Frontmatter, file: string): string[] {
  const v = fm.tags;
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every((t) => typeof t === "string")) throw new ContentError(file, "tags", "must be a list of strings");
  return v as string[];
}

function bool(fm: Frontmatter, key: string): boolean {
  return fm[key] === true;
}

function num(fm: Frontmatter, file: string, key: string, fallback: number): number {
  const v = fm[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "number") throw new ContentError(file, key, "must be a number");
  return v;
}

const SCHEMAS = {
  posts: (fm: Frontmatter, file: string): Post => ({
    title: str(fm, file, "title", true),
    date: dateStr(fm, file, "date"),
    summary: str(fm, file, "summary", true),
    tags: tags(fm, file),
  }),
  projects: (fm: Frontmatter, file: string): Project => ({
    title: str(fm, file, "title", true),
    summary: str(fm, file, "summary", true),
    url: str(fm, file, "url", false),
    repo: str(fm, file, "repo", false),
    order: num(fm, file, "order", 1000),
    tags: tags(fm, file),
  }),
  launches: (fm: Frontmatter, file: string): Launch => ({
    title: str(fm, file, "title", true),
    tagline: str(fm, file, "tagline", true),
    url: str(fm, file, "url", true),
    maker: str(fm, file, "maker", false),
    date: dateStr(fm, file, "date"),
    tags: tags(fm, file),
  }),
  pages: (fm: Frontmatter, file: string): Page => ({
    title: str(fm, file, "title", true),
    nav: bool(fm, "nav"),
  }),
} as const;

type SchemaOf<C extends Collection> = ReturnType<(typeof SCHEMAS)[C]>;

export function renderMarkdown(body: string): string {
  return marked.parse(body, { async: false, gfm: true }) as string;
}

function excerptOf(body: string): string {
  const text = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`[\]]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 200 ? `${text.slice(0, 197)}…` : text;
}

/** Parse one Markdown document into an entry of the given collection. */
export function parseEntry<C extends Collection>(collection: C, file: string, source: string): Entry<SchemaOf<C>> {
  const slug = basename(file).replace(/\.mdx?$/, "");
  if (!SLUG_RE.test(slug)) throw new ContentError(file, "filename", "must be a lowercase slug");
  const parsed = matter(source);
  const data = SCHEMAS[collection](parsed.data as Frontmatter, file) as SchemaOf<C>;
  return {
    slug,
    collection,
    data,
    html: renderMarkdown(parsed.content),
    excerpt: excerptOf(parsed.content),
    draft: bool(parsed.data as Frontmatter, "draft"),
  };
}

export interface LoadOptions {
  root: string;
  includeDrafts?: boolean;
}

/** Load a whole collection from `<root>/<collection>/*.md`, sorted for display. */
export function loadCollection<C extends Collection>(collection: C, options: LoadOptions): Entry<SchemaOf<C>>[] {
  const dir = join(options.root, collection);
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir)
    .filter((f) => /\.mdx?$/.test(f))
    .sort()
    .map((f) => parseEntry(collection, join(dir, f), readFileSync(join(dir, f), "utf8")))
    .filter((e) => options.includeDrafts || !e.draft);
  return sortCollection(collection, entries);
}

function sortCollection<C extends Collection>(collection: C, entries: Entry<SchemaOf<C>>[]): Entry<SchemaOf<C>>[] {
  switch (collection) {
    case "posts":
    case "launches":
      return [...entries].sort((a, b) => ((b.data as Post).date > (a.data as Post).date ? 1 : -1));
    case "projects":
      return [...entries].sort((a, b) => (a.data as Project).order - (b.data as Project).order || a.slug.localeCompare(b.slug));
    default:
      return [...entries].sort((a, b) => a.slug.localeCompare(b.slug));
  }
}

/** The engagement slug of an entry: `<collection>/<slug>`. */
export function engagementSlug(entry: { collection: Collection; slug: string }): string {
  return `${entry.collection}/${entry.slug}`;
}
