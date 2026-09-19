import { mergeRankings } from "@web-site/lib/ranking";
import { buildRss, buildSitemap } from "@web-site/lib/feeds";
import { compact, formatDate } from "@web-site/lib/format";

describe("ranking merge", () => {
  const items = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];

  it("keeps content order when there are no rankings", () => {
    expect(mergeRankings(items, null, "launches/").map((r) => r.item.slug)).toEqual(["a", "b", "c"]);
  });

  it("orders ranked items first by score, then the rest in content order", () => {
    const ranked = [
      { slug: "launches/c", upvotes: 2, views: 10, score: 7.04 },
      { slug: "launches/b", upvotes: 1, views: 0, score: 3 },
      { slug: "launches/zzz-not-in-content", upvotes: 9, views: 0, score: 27 },
    ];
    const merged = mergeRankings(items, ranked, "launches/");
    expect(merged.map((r) => r.item.slug)).toEqual(["c", "b", "a"]);
    expect(merged[0]).toMatchObject({ upvotes: 2, views: 10, score: 7.04 });
    expect(merged[2]).toMatchObject({ upvotes: 0, views: 0, score: 0 });
  });
});

describe("feeds", () => {
  it("builds valid RSS with escaped text and CDATA bodies", () => {
    const xml = buildRss({ name: "S & Co", url: "https://s.test", description: "d" }, [
      { title: "A <b>", url: "https://s.test/posts/a", date: "2026-01-02", summary: "sum", html: "<p>hi</p>" },
    ]);
    expect(xml).toContain("<title>S &amp; Co</title>");
    expect(xml).toContain("<title>A &lt;b&gt;</title>");
    expect(xml).toContain("<pubDate>Fri, 02 Jan 2026 00:00:00 GMT</pubDate>");
    expect(xml).toContain("<content:encoded><![CDATA[<p>hi</p>]]></content:encoded>");
    expect(xml).toContain('href="https://s.test/rss.xml"');
  });

  it("builds a sitemap", () => {
    const xml = buildSitemap([{ url: "https://s.test/" }, { url: "https://s.test/posts/a", lastModified: "2026-01-02" }]);
    expect(xml).toContain("<loc>https://s.test/</loc>");
    expect(xml).toContain("<lastmod>2026-01-02</lastmod>");
  });
});

describe("format", () => {
  it("formats dates and compacts numbers", () => {
    expect(formatDate("2026-01-02")).toBe("Jan 2, 2026");
    expect([compact(7), compact(1234), compact(12345), compact(2_500_000)]).toEqual(["7", "1.2k", "12k", "2.5m"]);
  });
});
