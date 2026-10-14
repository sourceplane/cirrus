import type { MetadataRoute } from "next";
import { absoluteUrl, launches, pages, posts, sections } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const on = sections();
  const urls: MetadataRoute.Sitemap = [{ url: absoluteUrl("/") }];
  if (on.posts) urls.push({ url: absoluteUrl("/posts") }, ...posts().map((p) => ({ url: absoluteUrl(`/posts/${p.slug}`), lastModified: p.data.date })));
  if (on.projects) urls.push({ url: absoluteUrl("/projects") });
  if (on.launches) urls.push({ url: absoluteUrl("/launches") }, ...launches().map((l) => ({ url: absoluteUrl(`/launches/${l.slug}`), lastModified: l.data.date })));
  urls.push(...pages().map((p) => ({ url: absoluteUrl(`/${p.slug}`) })));
  if (on.subscribe) urls.push({ url: absoluteUrl("/subscribe") });
  if (on.contact) urls.push({ url: absoluteUrl("/contact") });
  return urls;
}
