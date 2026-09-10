"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/session";
import { useApiQuery, qk } from "@/lib/query";
import { wrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { COLORS, addDays, cadenceLabel, localDateString, streakLabel, weekRangeLabel, weekStartOf } from "@/components/habits/model";

export default function ReviewPage() {
  const { client } = useSession();
  const [weekStart, setWeekStart] = React.useState(() => weekStartOf(localDateString()));
  const review = useApiQuery(qk.review(weekStart), () => wrap(() => client.habits.review(weekStart)));
  const thisWeek = weekStartOf(localDateString());
  const isCurrent = weekStart === thisWeek;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Weekly review</h1>
          <p className="text-sm text-muted-foreground">{isCurrent ? "This week so far." : "How that week went."}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9.5rem] text-center text-sm tabular-nums">{weekRangeLabel(weekStart)}</span>
          <Button variant="outline" size="icon" aria-label="Next week" disabled={isCurrent} onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {review.loading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : review.error ? (
        <EmptyState title="Review unavailable" description={review.error.message} />
      ) : review.data && review.data.habits.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing to review"
          description="Add a habit and check it off — this page fills itself in."
          primaryAction={{ label: "Add a habit", href: "/habits" }}
        />
      ) : review.data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {review.data.totals.met} of {review.data.totals.habits} habits met
              </CardTitle>
              <CardDescription>{review.data.totals.checkIns} check-ins this week.</CardDescription>
            </CardHeader>
          </Card>

          <ul className="space-y-2">
            {review.data.habits.map((row) => {
              const color = row.habit.color ?? COLORS[0];
              const pct = row.target === 0 ? 0 : Math.min(100, Math.round((row.done / row.target) * 100));
              return (
                <li key={row.habit.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-sm font-medium">{row.habit.name}</span>
                      <Badge variant={row.met ? "success" : "secondary"}>{row.met ? "Met" : `${row.done}/${row.target}`}</Badge>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Flame className={cn("h-3 w-3", row.currentStreak > 0 && "text-orange-500")} />
                      {streakLabel(row.currentStreak, row.habit.cadence)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{cadenceLabel(row.habit.cadence, row.habit.targetPerWeek)}</div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
