"use client";

import * as React from "react";
import { ExternalLink, Pause, Play, Pencil, Plus, Repeat, Trash2, XCircle } from "lucide-react";
import type { PublicTrackedSubscription, TrackedSubscriptionStatus } from "@saas/contracts/subscriptions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { SubscriptionForm, subscriptionToForm, type SubscriptionSubmitValues } from "@/components/subscriptions/subscription-form";
import { CATEGORY_LABELS, cadenceLabel, formatMoney, shortDate, statusTone, type Category } from "@/components/subscriptions/model";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export default function SubscriptionsPage() {
  const { client } = useSession();
  const { toast } = useToast();
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["value"]>("all");
  const list = useApiQuery(qk.subscriptions(filter), () =>
    wrap(async () => (await client.subscriptions.list(filter === "all" ? undefined : (filter as TrackedSubscriptionStatus))).subscriptions),
  );
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<PublicTrackedSubscription | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<PublicTrackedSubscription | null>(null);

  const submit = async (values: SubscriptionSubmitValues) => {
    setSaving(true);
    const r = editing ? await wrap(() => client.subscriptions.update(editing.id, values)) : await wrap(() => client.subscriptions.create(values));
    setSaving(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Could not save", description: r.error.message });
      return;
    }
    setAdding(false);
    setEditing(null);
    list.reload();
  };

  const setStatus = async (s: PublicTrackedSubscription, status: TrackedSubscriptionStatus) => {
    const r = await wrap(() => client.subscriptions.update(s.id, { status }));
    if (!r.ok) {
      toast({ kind: "error", title: "Could not update", description: r.error.message });
      return;
    }
    list.reload();
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const r = await wrap(() => client.subscriptions.remove(pendingDelete.id));
    if (!r.ok) {
      toast({ kind: "error", title: "Delete failed", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: "Subscription deleted" });
    list.reload();
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">Everything recurring, in one list.</p>
        </div>
        {!adding && !editing && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add subscription
          </Button>
        )}
      </header>

      {(adding || editing) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? `Edit ${editing.name}` : "New subscription"}</CardTitle>
            <CardDescription>The billing date anchors every future renewal.</CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionForm
              {...(editing ? { initial: subscriptionToForm(editing) } : {})}
              submitLabel={editing ? "Save changes" : "Add subscription"}
              saving={saving}
              onSubmit={submit}
              onCancel={() => {
                setAdding(false);
                setEditing(null);
              }}
            />
          </CardContent>
        </Card>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {list.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : list.data && list.data.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={filter === "all" ? "Nothing tracked yet" : `No ${filter} subscriptions`}
          description="Add one and the overview starts adding things up."
          primaryAction={{ label: "Add subscription", onClick: () => setAdding(true) }}
        />
      ) : (
        <ul className="space-y-2">
          {list.data!.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <Badge variant={statusTone(s.status)}>{s.status}</Badge>
                  <Badge variant="outline">{CATEGORY_LABELS[(s.category as Category) ?? "other"] ?? s.category}</Badge>
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      manage <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {cadenceLabel(s.cadence, s.intervalDays)} · {formatMoney(s.monthlyCents, s.currency)}/mo
                  {s.nextRenewal ? ` · next ${shortDate(s.nextRenewal)}` : ""}
                </div>
              </div>
              <div className="tabular-nums text-sm font-medium">{formatMoney(s.amountCents, s.currency)}</div>
              <div className="flex items-center">
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => { setEditing(s); setAdding(false); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {s.status === "active" ? (
                  <Button variant="ghost" size="icon" aria-label="Pause" onClick={() => void setStatus(s, "paused")}>
                    <Pause className="h-4 w-4" />
                  </Button>
                ) : s.status === "paused" ? (
                  <Button variant="ghost" size="icon" aria-label="Resume" onClick={() => void setStatus(s, "active")}>
                    <Play className="h-4 w-4" />
                  </Button>
                ) : null}
                {s.status !== "cancelled" && (
                  <Button variant="ghost" size="icon" aria-label="Mark cancelled" onClick={() => void setStatus(s, "cancelled")}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" aria-label="Delete" className="text-destructive" onClick={() => setPendingDelete(s)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this subscription?"
        description="It disappears from every total and cannot be recovered. Marking it cancelled keeps the record instead."
        resourceName={pendingDelete?.name}
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}
