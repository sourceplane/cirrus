import Link from "next/link";
import { navLinks, site } from "@/lib/site";

export function SiteHeader() {
  const links = navLinks();
  return (
    <header className="border-b border-line">
      <div className="container flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">{site.name}</Link>
        <nav aria-label="Primary" className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">{l.label}</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
