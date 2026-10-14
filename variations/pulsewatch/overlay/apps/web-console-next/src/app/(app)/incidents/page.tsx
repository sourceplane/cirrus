"use client";

import * as React from "react";
import Link from "next/link";
import { Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { formatDuration, relativeTime } from "@/components/monitors/model";

export default function IncidentsPage() {
  const { client } = useSession();
  const incidents = useApiQuery(qk.incidents(), () => wrap(async () => (await client.monitors.incidents(50)).incidents));
  const open = (incidents.data ?? []).filter((i) => i.resolvedAt === null);
  const past = (incidents.data ?? []).filter((i) => i.resolvedAt !== null);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Incidents</h1>
        <p className="text-sm text-muted-foreground">Opened after two failed checks in a row, closed by the first success.</p>
      </header>

      {incidents.loading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : incidents.error ? (
        <EmptyState title="Incidents unavailable" description={incidents.error.message} />
      ) : (incidents.data ?? []).length === 0 ? (
        <EmptyState
          icon={Siren}
          title="No incidents"
          description="Nothing has gone down since you started watching. Long may it last."
          primaryAction={{ label: "Back to monitors", href: "/monitors" }}
        />
      ) : (
        <>
          {open.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="text-base text-destructive">Ongoing</CardTitle>
                <CardDescription>{open.length} open {open.length === 1 ? "incident" : "incidents"}.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {open.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <Link href={`/monitors/${i.monitorId}`} className="text-sm font-medium hover:underline">
                          {i.monitorName}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">{i.cause ?? "No response"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive">down {formatDuration(i.openedAt, null)}</Badge>
                        <span className="text-xs text-muted-foreground">since {relativeTime(i.openedAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {past.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">History</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {past.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0">
                        <Link href={`/monitors/${i.monitorId}`} className="text-sm font-medium hover:underline">
                          {i.monitorName}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">{i.cause ?? "No response"}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{formatDuration(i.openedAt, i.resolvedAt)}</Badge>
                        <span className="text-xs text-muted-foreground">{relativeTime(i.openedAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
