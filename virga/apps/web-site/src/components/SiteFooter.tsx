import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="container flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-muted">
        <p>
          © {new Date().getUTCFullYear()} {site.author.url ? <a href={site.author.url} className="hover:text-ink">{site.author.name}</a> : site.author.name}
        </p>
        <p className="flex gap-4">
          {site.social.map((s) => (
            <a key={s.href} href={s.href} className="hover:text-ink">{s.label}</a>
          ))}
          <a href="/rss.xml" className="hover:text-ink">RSS</a>
        </p>
      </div>
    </footer>
  );
}
