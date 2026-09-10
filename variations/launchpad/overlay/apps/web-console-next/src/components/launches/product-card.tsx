"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronUp, MessageSquare, ExternalLink } from "lucide-react";
import type { PublicProduct } from "@saas/contracts/launches";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { displayHost, relativeTime, statusLabel } from "./model";

/**
 * One launch in a list. `onUpvote` is omitted for anonymous viewers (the button
 * then links to /login). Used by the public feed, maker pages and My launches.
 */
export function ProductCard({
  product,
  onUpvote,
  showStatus = false,
  href,
}: {
  product: PublicProduct;
  onUpvote?: ((p: PublicProduct) => void) | undefined;
  showStatus?: boolean;
  href?: string;
}) {
  const st = statusLabel(product.status);
  const link = href ?? `/explore/${product.slug}`;
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <UpvoteButton product={product} onUpvote={onUpvote} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={link} className="truncate text-base font-semibold tracking-tight hover:underline">
            {product.name}
          </Link>
          {showStatus && <Badge variant={st.tone}>{st.label}</Badge>}
          <a href={product.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {displayHost(product.url)} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{product.tagline}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {product.maker && (
            <Link href={`/makers/${product.maker.handle}`} className="hover:text-foreground">
              by {product.maker.displayName}
            </Link>
          )}
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> {product.commentCount}
          </span>
          <span>{product.status === "live" ? relativeTime(product.launchedAt) : `created ${relativeTime(product.createdAt)}`}</span>
          {product.tags.map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 py-0.5">
              #{t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function UpvoteButton({ product, onUpvote, size = "md" }: { product: PublicProduct; onUpvote?: ((p: PublicProduct) => void) | undefined; size?: "md" | "lg" }) {
  const cls = cn(
    "flex shrink-0 flex-col items-center justify-center rounded-lg border font-medium transition-colors",
    size === "lg" ? "h-16 w-16 text-base" : "h-14 w-12 text-sm",
    product.viewerHasUpvoted ? "border-primary bg-primary/10 text-primary" : "bg-background text-foreground hover:border-foreground/30",
  );
  const inner = (
    <>
      <ChevronUp className={cn("h-4 w-4", product.viewerHasUpvoted && "stroke-[2.5]")} />
      <span className="tabular-nums">{product.upvoteCount}</span>
    </>
  );
  if (!onUpvote) {
    return (
      <Link href="/login" className={cls} aria-label="Sign in to upvote">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => onUpvote(product)} aria-pressed={product.viewerHasUpvoted} aria-label={product.viewerHasUpvoted ? "Remove upvote" : "Upvote"}>
      {inner}
    </button>
  );
}
