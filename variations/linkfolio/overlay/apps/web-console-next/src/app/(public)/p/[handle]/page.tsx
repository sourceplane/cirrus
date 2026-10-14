"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { PublicBlock } from "@saas/contracts/pages";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { DEFAULT_ACCENT, formatPrice } from "@/components/pages/model";
import { PRODUCT_LABEL } from "@/lib/product";

export default function PublicCreatorPage() {
  const params = useParams<{ handle: string }>();
  const handle = params?.handle ?? "";
  const { client } = useSession();
  const data = useApiQuery(qk.publicPage(handle), () => wrap(() => client.pages.getPublic(handle)), { enabled: !!handle });

  // A click is recorded, then the visitor is sent on. The navigation happens
  // whatever the click write does — analytics never costs someone their tap.
  const open = React.useCallback(
    async (block: PublicBlock) => {
      if (!block.url) return;
      const target = window.open("", "_blank", "noopener,noreferrer");
      const r = await wrap(() => client.pages.click(handle, block.id, { referrer: document.referrer || null }));
      const url = r.ok ? r.data.url : block.url;
      if (target) target.location.href = url;
      else window.location.assign(url);
    },
    [client, handle],
  );

  if (data.loading) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 px-4 py-16">
        <Skeleton className="mx-auto h-20 w-20 rounded-full" />
        <Skeleton className="mx-auto h-6 w-40" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    );
  }

  if (data.error || !data.data) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <EmptyState
          title="This page isn't here"
          description="The handle may be wrong, or the page isn't published."
          primaryAction={{ label: `Make your own ${PRODUCT_LABEL} page`, href: "/login" }}
        />
      </div>
    );
  }

  const { page, blocks } = data.data;
  const accent = page.theme.accent ?? DEFAULT_ACCENT;
  const grid = page.theme.layout === "grid";

  return (
    <div className="mx-auto w-full max-w-md px-4 py-14">
      <header className="text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full text-2xl font-semibold text-white" style={{ backgroundColor: accent }}>
          {page.title.slice(0, 1).toUpperCase()}
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{page.title}</h1>
        <p className="text-sm text-muted-foreground">@{page.handle}</p>
        {page.bio && <p className="mt-3 text-sm leading-relaxed">{page.bio}</p>}
      </header>

      <div className={cn("mt-8", grid ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3")}>
        {blocks.map((b) =>
          b.kind === "header" ? (
            <div key={b.id} className={cn("pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground", grid && "col-span-2")}>
              {b.title}
            </div>
          ) : (
            <button
              key={b.id}
              type="button"
              onClick={() => void open(b)}
              className="rounded-xl px-4 py-3 text-center text-sm font-medium text-white shadow-sm transition-transform active:scale-[0.99]"
              style={{ backgroundColor: accent }}
            >
              <span className="block truncate">{b.title}</span>
              {b.description && <span className="mt-0.5 block truncate text-xs font-normal opacity-80">{b.description}</span>}
              {b.priceCents !== null && (
                <span className="mt-1 inline-block rounded bg-black/20 px-2 py-0.5 text-xs">
                  {b.kind === "tip" ? "Tip " : ""}
                  {formatPrice(b.priceCents, b.currency)}
                </span>
              )}
            </button>
          ),
        )}
      </div>

      {blocks.length === 0 && <p className="mt-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>}

      <footer className="mt-12 text-center text-xs text-muted-foreground">
        <Link href="/login" className="hover:text-foreground">
          Made with {PRODUCT_LABEL}
        </Link>
      </footer>
    </div>
  );
}
