"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Globe, Rocket } from "lucide-react";
import type { PublicProduct } from "@saas/contracts/launches";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { ProductCard } from "@/components/launches/product-card";
import { useQueryClient } from "@tanstack/react-query";
import type { GetMakerResponse } from "@saas/contracts/launches";

export default function MakerPage() {
  const params = useParams<{ handle: string }>();
  const handle = params?.handle ?? "";
  const { client, token } = useSession();
  const { toast } = useToast();
  const qc = useQueryClient();
  const maker = useApiQuery(qk.maker(handle), () => wrap(() => client.launches.getMaker(handle)), { enabled: !!handle });

  const toggleUpvote = token
    ? async (p: PublicProduct) => {
        const r = await wrap(() => (p.viewerHasUpvoted ? client.launches.removeUpvote(p.slug) : client.launches.upvote(p.slug)));
        if (!r.ok) {
          toast({ kind: "error", title: "Could not vote", description: r.error.message });
          return;
        }
        qc.setQueryData<GetMakerResponse>(qk.maker(handle), (old) =>
          old ? { ...old, products: old.products.map((x) => (x.id === p.id ? { ...x, upvoteCount: r.data.upvoteCount, viewerHasUpvoted: r.data.viewerHasUpvoted } : x)) } : old,
        );
      }
    : undefined;

  if (maker.loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (maker.error || !maker.data) {
    return <EmptyState title="Maker not found" description="No profile lives at this handle." primaryAction={{ label: "Back to launches", href: "/explore" }} />;
  }
  const m = maker.data.maker;
  return (
    <div className="space-y-6">
      <Link href="/explore" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All launches
      </Link>
      <header className="flex items-start gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/40 text-lg font-semibold text-primary-foreground">
          {m.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{m.displayName}</h1>
          <div className="text-sm text-muted-foreground">@{m.handle}</div>
          {m.bio && <p className="mt-2 text-sm">{m.bio}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {m.websiteUrl && (
              <a href={m.websiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-foreground">
                <Globe className="h-3.5 w-3.5" /> {m.websiteUrl.replace(/^https?:\/\//, "")}
              </a>
            )}
            {m.twitter && (
              <a href={`https://x.com/${m.twitter}`} target="_blank" rel="noreferrer noopener" className="hover:text-foreground">
                @{m.twitter} on X
              </a>
            )}
          </div>
        </div>
      </header>
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Launches</h2>
        {maker.data.products.length === 0 ? (
          <EmptyState icon={Rocket} title="No launches yet" description={`${m.displayName} hasn't launched anything public.`} />
        ) : (
          maker.data.products.map((p) => <ProductCard key={p.id} product={p} onUpvote={toggleUpvote} />)
        )}
      </section>
    </div>
  );
}
