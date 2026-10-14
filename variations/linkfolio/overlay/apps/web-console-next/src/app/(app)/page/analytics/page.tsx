"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { barHeights, shortDate } from "@/components/pages/model";

const WINDOWS = [7, 30, 90];

export default function AnalyticsPage() {
  const { client } = useSession();
  const [days, setDays] = React.useState(30);
  const stats = useApiQuery(qk.pageAnalytics(days), () => wrap(() => client.pages.analytics(days)));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Clicks on your page, by block and by day.</p>
        </div>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            {WINDOWS.map((w) => (
              <TabsTrigger key={w} value={String(w)}>
                {w} days
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {stats.loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : stats.error ? (
        <EmptyState title="Analytics unavailable" description={stats.error.message} />
      ) : stats.data && stats.data.totalClicks === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No clicks yet"
          description="Share your page — every visit that taps a block shows up here."
          primaryAction={{ label: "Back to my page", href: "/page" }}
        />
      ) : stats.data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{stats.data.totalClicks} clicks</CardTitle>
              <CardDescription>Last {stats.data.days} days.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-1" role="img" aria-label={`Clicks per day over ${stats.data.days} days`}>
                {barHeights(stats.data.byDay).map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${shortDate(d.date)}: ${d.clicks}`}>
                    <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(d.height, d.clicks > 0 ? 4 : 1)}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{shortDate(stats.data.byDay[0]?.date ?? "")}</span>
                <span>{shortDate(stats.data.byDay[stats.data.byDay.length - 1]?.date ?? "")}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By block</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Block</TH>
                    <TH className="text-right">Clicks</TH>
                  </TR>
                </THead>
                <TBody>
                  {stats.data.byBlock.map((b) => (
                    <TR key={b.blockId}>
                      <TD>{b.title}</TD>
                      <TD className="text-right tabular-nums">{b.clicks}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
