"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDuration, formatLatency, formatUptime, overallStatus, relativeTime, statusLabel, statusTone } from "@/components/monitors/model";

export default function PublicStatusPage() {
  const params = useParams<{ handle: string }>();
  const handle = params?.handle ?? "";
  const { client } = useSession();
  const data = useApiQuery(qk.publicStatus(handle), () => wrap(() => client.monitors.publicStatus(handle)), { enabled: !!handle });

  if (data.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (data.error || !data.data) {
    return (
      <EmptyState
        title="No status page here"
        description="The address may be wrong, or the page is not public."
      />
    );
  }

  const { page, monitors, incidents } = data.data;
  const overall = overallStatus(monitors.map((m) => m.status));
  const openIncidents = incidents.filter((i) => i.resolvedAt === null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{page.title}</h1>
        {page.description && <p className="mt-1 text-sm text-muted-foreground">{page.description}</p>}
      </header>

      <div
        className={cn(
          "rounded-xl border p-4 text-center text-base font-medium",
          overall.tone === "success" && "border-success/40 bg-success/10 text-success",
          overall.tone === "destructive" && "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        {overall.label}
      </div>

      {openIncidents.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Ongoing incidents</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {openIncidents.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm font-medium">{i.monitorName}</span>
                  <span className="text-xs text-muted-foreground">down {formatDuration(i.openedAt, null)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Services</CardTitle>
        </CardHeader>
        <CardContent>
          {monitors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is being monitored yet.</p>
          ) : (
            <ul className="divide-y">
              {monitors.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        m.status === "up" ? "bg-success" : m.status === "down" ? "bg-destructive" : "bg-muted-foreground/40",
                      )}
                    />
                    <span className="text-sm font-medium">{m.name}</span>
                    <Badge variant={statusTone(m.status)}>{statusLabel(m.status)}</Badge>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>24h {formatUptime(m.uptime24h)}</span>
                    <span>7d {formatUptime(m.uptime7d)}</span>
                    <span>{formatLatency(m.avgLatencyMs24h)}</span>
                    <span>checked {relativeTime(m.lastCheckedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {incidents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent incidents</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {incidents.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">{i.monitorName}</span>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(i.openedAt)} · {i.resolvedAt ? formatDuration(i.openedAt, i.resolvedAt) : "ongoing"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
