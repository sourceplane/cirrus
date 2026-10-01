import Link from "next/link";
import { RankedLaunches } from "@/components/RankedLaunches";
import { SubscribeBox } from "@/components/SubscribeBox";
import { formatDate } from "@/lib/format";
import { launches, posts, projects, sections, site } from "@/lib/site";

export default function HomePage() {
  const on = sections();
  const latestPosts = posts().slice(0, 3);
  const topLaunches = launches().slice(0, 5).map((l) => ({ slug: l.slug, ...l.data }));
  const featuredProjects = projects().slice(0, 4);

  return (
    <div className="flex flex-col gap-14">
      <section>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{site.name}</h1>
        <p className="mt-3 max-w-2xl text-xl text-muted">{site.tagline}</p>
      </section>

      {on.launches ? (
        <section>
          <SectionHeading title={site.copy.launches} href="/launches" />
          <RankedLaunches launches={topLaunches} />
        </section>
      ) : null}

      {on.posts ? (
        <section>
          <SectionHeading title={site.copy.posts} href="/posts" />
          <ul className="flex flex-col divide-y divide-line">
            {latestPosts.map((p) => (
              <li key={p.slug} className="py-4">
                <Link href={`/posts/${p.slug}`} className="text-lg font-semibold hover:underline">{p.data.title}</Link>
                <p className="text-muted">{p.data.summary}</p>
                <p className="mt-1 text-sm text-muted">{formatDate(p.data.date)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {on.projects ? (
        <section>
          <SectionHeading title={site.copy.projects} href="/projects" />
          <ul className="grid gap-4 sm:grid-cols-2">
            {featuredProjects.map((p) => (
              <li key={p.slug} className="rounded-lg border border-line bg-card p-5">
                <h3 className="font-semibold">
                  {p.data.url ? <a href={p.data.url} className="hover:underline">{p.data.title}</a> : p.data.title}
                </h3>
                <p className="mt-1 text-sm text-muted">{p.data.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {on.subscribe ? <SubscribeBox source="home" /> : null}
    </div>
  );
}

function SectionHeading({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <Link href={href} className="text-sm text-muted hover:text-ink">All →</Link>
    </div>
  );
}
