"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Flame, ListChecks } from "lucide-react";
import type { TodayHabit } from "@saas/contracts/habits";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { COLORS, cadenceLabel, localDateString, streakLabel, weekdayLabel } from "@/components/habits/model";

export default function TodayPage() {
  const { client } = useSession();
  const { toast } = useToast();
  // "Today" is the browser's day, computed once per mount.
  const [date] = React.useState(() => localDateString());
  const board = useApiQuery(qk.today(date), () => wrap(async () => (await client.habits.today(date)).habits));
  const [pending, setPending] = React.useState<Record<string, boolean>>({});

  const toggle = async (row: TodayHabit) => {
    const next = !row.doneToday;
    setPending((p) => ({ ...p, [row.habit.id]: next }));
    const r = await wrap(async () => {
      if (next) await client.habits.checkIn(row.habit.id, date);
      else await client.habits.undoCheckIn(row.habit.id, date);
    });
    if (!r.ok) {
      setPending((p) => {
        const copy = { ...p };
        delete copy[row.habit.id];
        return copy;
      });
      toast({ kind: "error", title: "Could not save", description: r.error.message });
      return;
    }
    board.reload();
    setPending((p) => {
      const copy = { ...p };
      delete copy[row.habit.id];
      return copy;
    });
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">Tap a habit when you have done it. That is the whole app.</p>
      </header>

      {board.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : board.error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{board.error.message}</CardContent>
        </Card>
      ) : board.data && board.data.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No habits yet"
          description="Add the first thing you want to keep doing. One is plenty to start."
          primaryAction={{ label: "Add a habit", href: "/habits" }}
        />
      ) : (
        <ul className="space-y-3">
          {board.data!.map((row) => {
            const done = pending[row.habit.id] ?? row.doneToday;
            const color = row.habit.color ?? COLORS[0];
            return (
              <li key={row.habit.id}>
                <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
                  <button
                    type="button"
                    aria-pressed={done}
                    aria-label={done ? `Undo ${row.habit.name}` : `Mark ${row.habit.name} done`}
                    onClick={() => void toggle(row)}
                    className={cn(
                      "grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 transition-colors",
                      done ? "text-white" : "border-border text-transparent hover:border-foreground/40",
                    )}
                    style={done ? { backgroundColor: color, borderColor: color } : undefined}
                  >
                    <Check className="h-6 w-6" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-medium">{row.habit.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span>{cadenceLabel(row.habit.cadence, row.habit.targetPerWeek)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Flame className={cn("h-3 w-3", row.currentStreak > 0 && "text-orange-500")} />
                        {streakLabel(row.currentStreak, row.habit.cadence)}
                      </span>
                      <span>{row.completionRate30d}% over 30 days</span>
                    </div>
                    <div className="mt-2 flex gap-1">
                      {row.days.map((d) => (
                        <div key={d.date} className="flex flex-col items-center gap-1" title={d.date}>
                          <span
                            className={cn("block h-2.5 w-2.5 rounded-full", !d.done && "bg-muted")}
                            style={d.done ? { backgroundColor: color } : undefined}
                          />
                          <span className="text-[9px] uppercase text-muted-foreground">{weekdayLabel(d.date).slice(0, 1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {board.data && board.data.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/habits" className="underline">
            Manage habits
          </Link>
        </p>
      )}
    </div>
  );
}
