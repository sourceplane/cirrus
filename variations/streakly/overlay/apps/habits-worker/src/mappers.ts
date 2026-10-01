import type { CheckIn, Habit } from "@saas/db/habits";
import type { PublicCheckIn, PublicHabit } from "@saas/contracts/habits";
import { habitPublicId } from "./ids.js";

export function toPublicHabit(h: Habit): PublicHabit {
  return {
    id: habitPublicId(h.id),
    name: h.name,
    cadence: h.cadence,
    targetPerWeek: h.targetPerWeek,
    color: h.color,
    position: h.position,
    archived: h.archivedAt !== null,
    createdAt: h.createdAt.toISOString(),
  };
}

export function toPublicCheckIn(c: CheckIn): PublicCheckIn {
  return {
    habitId: habitPublicId(c.habitId),
    date: c.date,
    note: c.note,
  };
}
