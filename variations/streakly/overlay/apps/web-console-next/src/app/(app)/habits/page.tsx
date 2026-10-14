"use client";

import * as React from "react";
import { Archive, ChevronDown, ChevronUp, ListChecks, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { PublicHabit } from "@saas/contracts/habits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Cadence } from "@saas/contracts/habits";
import { CADENCES, COLORS, cadenceLabel, emptyHabitForm, validateHabitForm, type HabitFormValues } from "@/components/habits/model";

export default function HabitsPage() {
  const { client } = useSession();
  const { toast } = useToast();
  const [showArchived, setShowArchived] = React.useState(false);
  const habits = useApiQuery(qk.habits(showArchived), () => wrap(async () => (await client.habits.list(showArchived)).habits));
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<PublicHabit | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<PublicHabit | null>(null);

  const submit = async (values: HabitFormValues) => {
    setSaving(true);
    const payload = {
      name: values.name.trim(),
      cadence: values.cadence,
      targetPerWeek: values.cadence === "weekly_target" ? Number(values.targetPerWeek) : null,
      color: values.color,
    };
    const r = editing ? await wrap(() => client.habits.update(editing.id, payload)) : await wrap(() => client.habits.create(payload));
    setSaving(false);
    if (!r.ok) {
      toast({ kind: "error", title: "Could not save", description: r.error.message });
      return;
    }
    setAdding(false);
    setEditing(null);
    habits.reload();
  };

  const setArchived = async (h: PublicHabit, archived: boolean) => {
    const r = await wrap(() => client.habits.update(h.id, { archived }));
    if (!r.ok) {
      toast({ kind: "error", title: "Could not update", description: r.error.message });
      return;
    }
    habits.reload();
  };

  const move = async (h: PublicHabit, direction: "up" | "down") => {
    const ids = (habits.data ?? []).map((x) => x.id);
    const i = ids.indexOf(h.id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    next[i] = ids[j]!;
    next[j] = ids[i]!;
    const r = await wrap(() => client.habits.reorder({ ids: next }));
    if (!r.ok) {
      toast({ kind: "error", title: "Could not reorder", description: r.error.message });
      return;
    }
    habits.reload();
  };

  const remove = async () => {
    if (!pendingDelete) return;
    const r = await wrap(() => client.habits.remove(pendingDelete.id));
    if (!r.ok) {
      toast({ kind: "error", title: "Delete failed", description: r.error.message });
      return;
    }
    toast({ kind: "success", title: "Habit deleted" });
    habits.reload();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Habits</h1>
          <p className="text-sm text-muted-foreground">What you are keeping up, and how often.</p>
        </div>
        {!adding && !editing && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add habit
          </Button>
        )}
      </header>

      {(adding || editing) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing ? `Edit ${editing.name}` : "New habit"}</CardTitle>
            <CardDescription>Cadence decides what counts as keeping the streak.</CardDescription>
          </CardHeader>
          <CardContent>
            <HabitForm
              initial={
                editing
                  ? {
                      name: editing.name,
                      cadence: editing.cadence,
                      targetPerWeek: String(editing.targetPerWeek ?? 3),
                      color: editing.color ?? COLORS[0],
                    }
                  : emptyHabitForm()
              }
              submitLabel={editing ? "Save habit" : "Add habit"}
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

      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground">Show archived</span>
        <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label="Show archived" />
      </div>

      {habits.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : habits.data && habits.data.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={showArchived ? "Nothing here" : "No habits yet"}
          description="Start with one. You can always add more once it sticks."
          primaryAction={{ label: "Add a habit", onClick: () => setAdding(true) }}
        />
      ) : (
        <ul className="space-y-2">
          {habits.data!.map((h, i, all) => (
            <li key={h.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex flex-col">
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => void move(h, "up")} className="text-muted-foreground disabled:opacity-30 hover:text-foreground">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Move down" disabled={i === all.length - 1} onClick={() => void move(h, "down")} className="text-muted-foreground disabled:opacity-30 hover:text-foreground">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: h.color ?? COLORS[0] }} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("truncate text-sm font-medium", h.archived && "text-muted-foreground line-through")}>{h.name}</span>
                  {h.archived && <Badge variant="secondary">Archived</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{cadenceLabel(h.cadence, h.targetPerWeek)}</div>
              </div>
              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => { setEditing(h); setAdding(false); }}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={h.archived ? "Restore" : "Archive"}
                onClick={() => void setArchived(h, !h.archived)}
              >
                {h.archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Delete" className="text-destructive" onClick={() => setPendingDelete(h)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this habit?"
        description="Its whole check-in history goes with it. Archiving keeps the history and hides the habit."
        resourceName={pendingDelete?.name}
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}

function HabitForm({
  initial,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  initial: HabitFormValues;
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: HabitFormValues) => void;
  onCancel: () => void;
}) {
  const [v, setV] = React.useState<HabitFormValues>(initial);
  const [touched, setTouched] = React.useState(false);
  const errors = validateHabitForm(v);
  const valid = Object.keys(errors).length === 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (valid) onSubmit(v);
      }}
    >
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={60} placeholder="Read for 20 minutes" required />
        {touched && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Cadence</Label>
        <Select value={v.cadence} onValueChange={(cadence) => setV({ ...v, cadence: cadence as Cadence })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CADENCES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{CADENCES.find((c) => c.value === v.cadence)?.hint}</p>
      </div>

      {v.cadence === "weekly_target" && (
        <div className="space-y-1.5">
          <Label>Times per week</Label>
          <Input type="number" min={1} max={7} value={v.targetPerWeek} onChange={(e) => setV({ ...v, targetPerWeek: e.target.value })} className="w-24" />
          {touched && errors.targetPerWeek && <p className="text-xs text-destructive">{errors.targetPerWeek}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Colour</Label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={v.color === c}
              onClick={() => setV({ ...v, color: c })}
              className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-background", v.color === c && "ring-2 ring-foreground")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={saving} disabled={touched && !valid}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
