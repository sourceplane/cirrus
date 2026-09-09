// Merge the static launch list with live rankings from site-api. Pure, so
// the client island and the tests share it. Unranked launches keep their
// content order after the ranked ones.

import type { RankedSlug } from "@site/contracts/engagement";

export interface Rankable {
  slug: string;
}

export interface Ranked<T extends Rankable> {
  item: T;
  upvotes: number;
  views: number;
  score: number;
}

export function mergeRankings<T extends Rankable>(items: T[], ranked: RankedSlug[] | null, prefix: string): Ranked<T>[] {
  const bySlug = new Map<string, RankedSlug>();
  for (const r of ranked ?? []) bySlug.set(r.slug.startsWith(prefix) ? r.slug.slice(prefix.length) : r.slug, r);
  const merged = items.map((item, index) => {
    const r = bySlug.get(item.slug);
    return { item, upvotes: r?.upvotes ?? 0, views: r?.views ?? 0, score: r?.score ?? 0, index };
  });
  merged.sort((a, b) => b.score - a.score || a.index - b.index);
  return merged.map(({ index: _index, ...rest }) => rest);
}
