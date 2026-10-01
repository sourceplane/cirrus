// RSS and sitemap builders — pure string builders so they can be tested
// without Next.

export interface FeedItem {
  title: string;
  url: string;
  date: string;
  summary: string;
  html?: string;
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildRss(site: { name: string; url: string; description: string }, items: FeedItem[]): string {
  const entries = items
    .map(
      (i) =>
        `<item><title>${esc(i.title)}</title><link>${esc(i.url)}</link><guid>${esc(i.url)}</guid>` +
        `<pubDate>${new Date(i.date).toUTCString()}</pubDate><description>${esc(i.summary)}</description>` +
        (i.html ? `<content:encoded><![CDATA[${i.html}]]></content:encoded>` : "") +
        `</item>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">` +
    `<channel><title>${esc(site.name)}</title><link>${esc(site.url)}</link><description>${esc(site.description)}</description>` +
    `<atom:link href="${esc(site.url)}/rss.xml" rel="self" type="application/rss+xml"/>` +
    entries +
    `</channel></rss>`
  );
}

export function buildSitemap(urls: Array<{ url: string; lastModified?: string }>): string {
  const body = urls
    .map((u) => `<url><loc>${esc(u.url)}</loc>${u.lastModified ? `<lastmod>${esc(u.lastModified)}</lastmod>` : ""}</url>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}
