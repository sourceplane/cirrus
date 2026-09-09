import type { Metadata } from "next";
import Link from "next/link";
import { RankedLaunches } from "@/components/RankedLaunches";
import { launches, site } from "@/lib/site";

export const metadata: Metadata = { title: site.copy.launches };

export default function LaunchesPage() {
  const all = launches().map((l) => ({ slug: l.slug, ...l.data }));
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{site.copy.launches}</h1>
          <p className="mt-1 text-muted">Ranked by upvotes. One upvote per visitor per day.</p>
        </div>
        <Link href="/contact" className="text-sm text-muted hover:text-ink">Submit yours →</Link>
      </div>
      <RankedLaunches launches={all} />
    </div>
  );
}
