import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UpvoteButton } from "@/components/UpvoteButton";
import { ViewBeacon } from "@/components/ViewBeacon";
import { ViewCount } from "@/components/ViewCount";
import { engagementSlug } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { launches } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return launches().map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const launch = launches().find((l) => l.slug === slug);
  return launch ? { title: launch.data.title, description: launch.data.tagline } : {};
}

export default async function LaunchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const launch = launches().find((l) => l.slug === slug);
  if (!launch) notFound();
  const key = engagementSlug(launch);
  return (
    <article className="mx-auto max-w-2xl">
      <ViewBeacon slug={key} />
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{launch.data.title}</h1>
          <p className="mt-2 text-xl text-muted">{launch.data.tagline}</p>
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
            {launch.data.maker ? <span>by {launch.data.maker}</span> : null}
            <time dateTime={launch.data.date}>{formatDate(launch.data.date)}</time>
            <ViewCount slug={key} />
          </p>
        </div>
        <UpvoteButton slug={key} />
      </header>
      <div className="prose" dangerouslySetInnerHTML={{ __html: launch.html }} />
      <p className="mt-8">
        <a href={launch.data.url} className="rounded-md bg-accent px-4 py-2 font-medium text-accent-ink" rel="noopener">Visit {launch.data.title} →</a>
      </p>
    </article>
  );
}
