"use client";

import * as React from "react";
import { Tags } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { CATEGORY_LABELS, categoryShare, formatMoney, type Category } from "@/components/subscriptions/model";

export default function CategoriesPage() {
  const { client } = useSession();
  const summary = useApiQuery(qk.subscriptionsSummary(), () => wrap(() => client.subscriptions.summary()));
  const rows = summary.data?.byCategory ?? [];
  const max = rows.reduce((m, r) => Math.max(m, r.monthlyCents), 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">Where the money actually goes, per month.</p>
      </header>

      {summary.loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : summary.error ? (
        <EmptyState title="Categories unavailable" description={summary.error.message} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="Nothing to break down yet"
          description="Add a few subscriptions and their categories show up here."
          primaryAction={{ label: "Add subscription", href: "/subscriptions" }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By category</CardTitle>
            <CardDescription>Active subscriptions only, normalised to a month.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {rows.map((row) => (
                <li key={`${row.category}:${row.currency}`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{CATEGORY_LABELS[(row.category as Category) ?? "other"] ?? row.category}</span>
                    <span className="tabular-nums">
                      {formatMoney(row.monthlyCents, row.currency)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.count} item{row.count === 1 ? "" : "s"} · {formatMoney(row.yearlyCents, row.currency)}/yr
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${categoryShare(row.monthlyCents, max)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
