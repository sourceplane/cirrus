"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { MonitorForm, type MonitorSubmitValues } from "@/components/monitors/monitor-form";
import { formatLatency, formatUptime, intervalLabel, relativeTime, statusLabel, statusTone } from "@/components/monitors/model";
import type { PublicMonitor } from "@saas/contracts/monitors";

export default function MonitorsPage() {
  const { client } = useSession();
  const { toast } = useToast();
  const monitors = useApiQuery(qk.monitors(), () => wrap(async () => (await client.monitors.list()).monitors));
  const [adding, setAdding] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const create = async (values: MonitorSubmitValues) => {
    setSaving(true);
    const r = await wrap(() => client.monitors.create(values));
    setSaving(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Could not add monitor", description: r.error.message });
      return;
    }
    setAdding(false);
    toast({ kind: "success", title: `${r.data.monitor.name} is being watched` });
    monitors.reload();
  };

  const toggle = async (m: PublicMonitor, enabled: boolean) => {
    const r = await wrap(() => client.monitors.update(m.id, { enabled }));
    if (!r.ok) {
      toast({ kind: "error", title: "Could not update", description: r.error.message });
      return;
    }
    monitors.reload();
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Monitors</h1>
          <p className="text-sm text-muted-foreground">Endpoints we check on a schedule, so you do not have to.</p>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add monitor
          </Button>
        )}
      </header>

      {adding && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New monitor</CardTitle>
            <CardDescription>Two failures in a row open an incident; the first success closes it.</CardDescription>
          </CardHeader>
          <CardContent>
            <MonitorForm submitLabel="Add monitor" saving={saving} onSubmit={create} onCancel={() => setAdding(false)} />
          </CardContent>
        </Card>
      )}

      {monitors.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : monitors.error ? (
        <EmptyState title="Monitors unavailable" description={monitors.error.message} />
      ) : monitors.data && monitors.data.length === 0 && !adding ? (
        <EmptyState
          icon={Activity}
          title="Nothing being watched"
          description="Add your first endpoint. Checks start on the next minute."
          primaryAction={{ label: "Add monitor", onClick: () => setAdding(true) }}
        />
      ) : (
        <ul className="space-y-2">
          {(monitors.data ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
              <span
                aria-hidden
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  m.status === "up" ? "bg-success" : m.status === "down" ? "bg-destructive" : "bg-muted-foreground/40",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/monitors/${m.id}`} className="truncate text-sm font-medium hover:underline">
                    {m.name}
                  </Link>
                  <Badge variant={statusTone(m.status)}>{statusLabel(m.status)}</Badge>
                  {!m.enabled && <Badge variant="secondary">Paused</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{m.url}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                  <span>24h {formatUptime(m.uptime24h)}</span>
                  <span>7d {formatUptime(m.uptime7d)}</span>
                  <span>{formatLatency(m.avgLatencyMs24h)}</span>
                  <span>{intervalLabel(m.intervalSec)}</span>
                  <span>checked {relativeTime(m.lastCheckedAt)}</span>
                </div>
              </div>
              <Switch checked={m.enabled} onCheckedChange={(enabled) => void toggle(m, enabled)} aria-label="Enabled" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
