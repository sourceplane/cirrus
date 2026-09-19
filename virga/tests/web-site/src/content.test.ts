import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentError, engagementSlug, loadCollection, parseEntry } from "@web-site/lib/content";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("content collections", () => {
  it("loads posts newest-first, excluding drafts unless asked", () => {
    const posts = loadCollection("posts", { root: ROOT });
    expect(posts.map((p) => p.slug)).toEqual(["good", "older"]);
    const withDrafts = loadCollection("posts", { root: ROOT, includeDrafts: true });
    expect(withDrafts.map((p) => p.slug)).toEqual(["draft", "good", "older"]);
    expect(withDrafts[0]!.draft).toBe(true);
  });

  it("renders Markdown to HTML and builds an excerpt", () => {
    const post = loadCollection("posts", { root: ROOT }).find((p) => p.slug === "good")!;
    expect(post.data).toEqual({ title: "Good post", date: "2026-02-03", summary: "A fine post.", tags: ["a", "b"] });
    expect(post.html).toContain("<h1>Heading</h1>");
    expect(post.html).toContain("<strong>bold</strong>");
    expect(post.html).toContain('<a href="https://example.com">link</a>');
    expect(post.html).toContain("<pre><code class=\"language-ts\">");
    expect(post.excerpt).toBe("Heading Some bold text and a link.");
    expect(engagementSlug(post)).toBe("posts/good");
  });

  it("sorts projects by order, pages by slug, and returns [] for a missing folder", () => {
    expect(loadCollection("projects", { root: ROOT }).map((p) => p.data.title)).toEqual(["A", "B"]);
    expect(loadCollection("pages", { root: ROOT })[0]!.data).toEqual({ title: "About", nav: true });
    expect(loadCollection("launches", { root: ROOT })[0]!.data).toMatchObject({ title: "One", maker: null, tags: [] });
    expect(loadCollection("posts", { root: resolve(ROOT, "nowhere") })).toEqual([]);
  });

  it("fails the build with the file and the field on bad frontmatter", () => {
    expect(() => parseEntry("posts", "content/posts/x.md", `---\ntitle: "T"\nsummary: "s"\n---\nbody`)).toThrow(ContentError);
    expect(() => parseEntry("posts", "content/posts/x.md", `---\ntitle: "T"\ndate: nope\nsummary: "s"\n---\n`)).toThrow(/x\.md: date must be a date/);
    expect(() => parseEntry("launches", "content/launches/y.md", `---\ntitle: "T"\ntagline: "t"\ndate: 2026-01-01\n---\n`)).toThrow(/url is required/);
    expect(() => parseEntry("projects", "content/projects/z.md", `---\ntitle: "T"\nsummary: "s"\norder: "first"\n---\n`)).toThrow(/order must be a number/);
    expect(() => parseEntry("posts", "content/posts/Bad Name.md", `---\ntitle: "T"\ndate: 2026-01-01\nsummary: "s"\n---\n`)).toThrow(/filename must be a lowercase slug/);
    expect(() => parseEntry("posts", "content/posts/x.md", `---\ntitle: "T"\ndate: 2026-01-01\nsummary: "s"\ntags: "one"\n---\n`)).toThrow(/tags must be a list/);
  });
});
