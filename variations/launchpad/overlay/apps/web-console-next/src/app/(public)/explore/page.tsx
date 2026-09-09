"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Rocket } from "lucide-react";
import type { PublicProduct } from "@saas/contracts/launches";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { ProductCard } from "@/components/launches/product-card";
import { RANGES, isRange, type RangeValue } from "@/components/launches/model";

export default function ExplorePage() {
  const search = useSearchParams();
  const router = useRouter();
  const range: RangeValue = isRange(search?.get("range")) ? (search!.get("range") as RangeValue) : "today";
  const { client, token } = useSession();
  const { toast } = useToast();
  const qc = useQueryClient();
  const feed = useApiQuery(qk.launchFeed(range), () => wrap(async () => (await client.launches.list({ range, limit: 50 })).products));

  const toggleUpvote = token
    ? async (p: PublicProduct) => {
        const r = await wrap(() => (p.viewerHasUpvoted ? client.launches.removeUpvote(p.slug) : client.launches.upvote(p.slug)));
        if (!r.ok) {
          toast({ kind: "error", title: "Could not vote", description: r.error.message });
          return;
        }
        qc.setQueryData<PublicProduct[]>(qk.launchFeed(range), (old) =>
          old?.map((x) => (x.id === p.id ? { ...x, upvoteCount: r.data.upvoteCount, viewerHasUpvoted: r.data.viewerHasUpvoted } : x)),
        );
      }
    : undefined;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Launches</h1>
          <p className="text-sm text-muted-foreground">What makers shipped, ranked by the community.</p>
        </div>
        <Tabs value={range} onValueChange={(v) => router.replace(v === "today" ? "/explore" : `/explore?range=${v}`)}>
          <TabsList>
            {RANGES.map((r) => (
              <TabsTrigger key={r.value} value={r.value}>
                {r.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {feed.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : feed.error ? (
        <EmptyState title="The directory is unavailable" description={feed.error.message} />
      ) : feed.data && feed.data.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title={range === "today" ? "Nothing launched today — yet" : "No launches in this window"}
          description="Be the first: submit your product and it appears here the moment you launch."
          primaryAction={{ label: token ? "Submit a launch" : "Sign in to submit", href: token ? "/launches/new" : "/login" }}
          secondaryAction={range === "today" ? { label: "See all time", href: "/explore?range=all" } : undefined}
        />
      ) : (
        <ol className="space-y-3">
          {feed.data!.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} onUpvote={toggleUpvote} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
