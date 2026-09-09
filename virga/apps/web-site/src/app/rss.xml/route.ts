import { buildRss } from "@/lib/feeds";
import { absoluteUrl, posts, site } from "@/lib/site";

export const dynamic = "force-static";

export function GET(): Response {
  const xml = buildRss(
    { name: site.name, url: site.url, description: site.description },
    posts().map((p) => ({
      title: p.data.title,
      url: absoluteUrl(`/posts/${p.slug}`),
      date: p.data.date,
      summary: p.data.summary,
      html: p.html,
    })),
  );
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
