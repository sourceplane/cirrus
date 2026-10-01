"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { MonitorForm, monitorToForm, type MonitorSubmitValues } from "@/components/monitors/monitor-form";
import { formatLatency, formatUptime, intervalLabel, relativeTime, statusLabel, statusTone } from "@/components/monitors/model";

export default function MonitorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { client } = useSession();
  const { toast } = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const monitor = useApiQuery(qk.monitor(id), () => wrap(async () => (await client.monitors.get(id)).monitor), { enabled: !!id });
  const checks = useApiQuery(qk.monitorChecks(id), () => wrap(async () => (await client.monitors.checks(id, 50)).checks), { enabled: !!id });
  const [saving, setSaving] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.monitors() });
    monitor.reload();
    checks.reload();
  };

  const runNow = async () => {
    setChecking(true);
    const r = await wrap(() => client.monitors.runCheck(id));
    setChecking(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Check failed to run", description: r.error.message });
      return;
    }
    toast({
      kind: r.data.check.ok ? "success" : "error",
      title: r.data.check.ok ? "Check passed" : "Check failed",
      description: r.data.check.error ?? `${r.data.check.statusCode ?? "no status"} in ${formatLatency(r.data.check.latencyMs)}`,
    });
    refresh();
  };

  const save = async (values: MonitorSubmitValues) => {
    setSaving(true);
    const r = await wrap(() => client.monitors.update(id, values));
    setSaving(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Could not save", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: "Saved" });
    refresh();
  };

  const remove = async () => {
    const r = await wrap(() => client.monitors.remove(id));
    if (!r.ok) {
      toast({ kind: "error", title: "Delete failed", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: "Monitor deleted" });
    void qc.invalidateQueries({ queryKey: qk.monitors() });
    router.push("/monitors");
  };

  const m = monitor.data;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Link href="/monitors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Monitors
      </Link>

      {monitor.loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : monitor.error || !m ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Monitor not found</CardTitle>
            <CardDescription>{monitor.error?.message ?? "It may have been deleted."}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{m.name}</CardTitle>
                  <Badge variant={statusTone(m.status)}>{statusLabel(m.status)}</Badge>
                </div>
                <CardDescription className="truncate">
                  <a href={m.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">
                    {m.url} <ExternalLink className="h-3 w-3" />
                  </a>
                </CardDescription>
              </div>
              <Button variant="outline" onClick={runNow} loading={checking}>
                <RefreshCw className="h-4 w-4" /> Check now
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="24h uptime" value={formatUptime(m.uptime24h)} />
              <Stat label="7d uptime" value={formatUptime(m.uptime7d)} />
              <Stat label="Avg latency" value={formatLatency(m.avgLatencyMs24h)} />
              <Stat label="Last checked" value={relativeTime(m.lastCheckedAt)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent checks</CardTitle>
              <CardDescription>{intervalLabel(m.intervalSec)} · expecting {m.expectedStatus}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {checks.loading ? (
                <Skeleton className="h-24 w-full" />
              ) : checks.data && checks.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checks yet — the first one runs within a minute.</p>
              ) : (
                <>
                  {/* Oldest on the left, so the strip reads like time passing. */}
                  <div className="flex items-end gap-0.5" role="img" aria-label="Recent check results">
                    {[...(checks.data ?? [])].reverse().map((c) => (
                      <span
                        key={c.id}
                        title={`${c.checkedAt}: ${c.ok ? "up" : c.error ?? "down"}`}
                        className={cn("h-8 flex-1 rounded-sm", c.ok ? "bg-success" : "bg-destructive")}
                      />
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>When</TH>
                          <TH>Result</TH>
                          <TH>Status</TH>
                          <TH className="text-right">Latency</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {(checks.data ?? []).slice(0, 20).map((c) => (
                          <TR key={c.id}>
                            <TD>{relativeTime(c.checkedAt)}</TD>
                            <TD className={c.ok ? "text-success" : "text-destructive"}>{c.ok ? "up" : c.error ?? "down"}</TD>
                            <TD>{c.statusCode ?? "—"}</TD>
                            <TD className="text-right tabular-nums">{formatLatency(c.latencyMs)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <MonitorForm key={m.id} initial={monitorToForm(m)} submitLabel="Save changes" saving={saving} onSubmit={save} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base text-destructive">Delete monitor</CardTitle>
              <CardDescription>Its checks and incident history go with it.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete {m.name}
              </Button>
            </CardContent>
          </Card>

          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title="Delete this monitor?"
            description="Its checks and incidents are deleted with it. This cannot be undone."
            resourceName={m.name}
            confirmLabel="Delete"
            onConfirm={remove}
          />
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
