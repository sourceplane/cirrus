"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, Plus, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { cadenceLabel, daysUntilLabel, formatMoney, shortDate } from "@/components/subscriptions/model";

export default function OverviewPage() {
  const { client } = useSession();
  const summary = useApiQuery(qk.subscriptionsSummary(), () => wrap(() => client.subscriptions.summary()));
  const upcoming = useApiQuery(qk.subscriptionsUpcoming(30), () => wrap(() => client.subscriptions.upcoming(30)));

  const currencies = Object.keys(summary.data?.monthlyCentsByCurrency ?? {});

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">What you are paying for, and what is about to renew.</p>
        </div>
        <Button asChild>
          <Link href="/subscriptions">
            <Plus className="h-4 w-4" /> Add subscription
          </Link>
        </Button>
      </header>

      {summary.loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : summary.data && summary.data.activeCount === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nothing tracked yet"
          description="Add the first subscription and this page starts adding it up."
          primaryAction={{ label: "Add subscription", href: "/subscriptions" }}
        />
      ) : summary.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {currencies.map((code) => (
              <Card key={code}>
                <CardHeader className="pb-2">
                  <CardDescription>Per month{currencies.length > 1 ? ` · ${code}` : ""}</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{formatMoney(summary.data!.monthlyCentsByCurrency[code]!, code)}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  {formatMoney(summary.data!.yearlyCentsByCurrency[code] ?? 0, code)} a year
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{summary.data.activeCount}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                {summary.data.pausedCount} paused
              </CardContent>
            </Card>
          </div>

          {currencies.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Totals stay separate per currency — converting between them would need a rate this app does not have.
            </p>
          )}
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" /> Renewing in the next 30 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : upcoming.data && upcoming.data.renewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing renews in the next 30 days.</p>
          ) : (
            <ul className="divide-y">
              {(upcoming.data?.renewals ?? []).map((r) => (
                <li key={r.subscription.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{r.subscription.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {shortDate(r.nextRenewal)} · {cadenceLabel(r.subscription.cadence, r.subscription.intervalDays)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={r.daysUntil <= 3 ? "warning" : "secondary"}>{daysUntilLabel(r.daysUntil)}</Badge>
                    <span className="tabular-nums text-sm">{formatMoney(r.subscription.amountCents, r.subscription.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
