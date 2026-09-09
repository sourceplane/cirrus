"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { mergeRankings } from "@/lib/ranking";
import { UpvoteButton } from "./UpvoteButton";

export interface LaunchCard {
  slug: string;
  title: string;
  tagline: string;
  url: string;
  maker: string | null;
  date: string;
  tags: string[];
}

export function RankedLaunches({ launches, windowDays = 0 }: { launches: LaunchCard[]; windowDays?: number }) {
  const [ranked, setRanked] = useState(() => mergeRankings(launches, null, "launches/"));

  useEffect(() => {
    let cancelled = false;
    api.top("launches/", windowDays, 100).then((r) => {
      if (!cancelled && r.ok) setRanked(mergeRankings(launches, r.value, "launches/"));
    });
    return () => {
      cancelled = true;
    };
  }, [launches, windowDays]);

  return (
    <ol className="flex flex-col divide-y divide-line">
      {ranked.map(({ item, upvotes }, i) => (
        <li key={item.slug} className="flex items-start gap-4 py-4">
          <span className="w-6 pt-2 text-right font-mono text-sm text-muted">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold leading-snug">
              <Link href={`/launches/${item.slug}`} className="hover:underline">{item.title}</Link>
            </h3>
            <p className="text-muted">{item.tagline}</p>
            <p className="mt-1 text-sm text-muted">
              {item.maker ? <>by {item.maker} · </> : null}
              {item.tags.map((t) => (
                <span key={t} className="mr-2">#{t}</span>
              ))}
            </p>
          </div>
          <UpvoteButton slug={`launches/${item.slug}`} initial={upvotes} />
        </li>
      ))}
    </ol>
  );
}
