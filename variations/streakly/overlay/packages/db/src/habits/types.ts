export type { SqlExecutor, SqlExecutorResult, SqlRow } from "../d1/executor.js";

// ── Result type ─────────────────────────────────────────────

export type HabitsRepositoryError =
  | { kind: "not_found" }
  | { kind: "conflict"; entity: string }
  | { kind: "internal"; message: string };

export type HabitsResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: HabitsRepositoryError };

// ── Entities ────────────────────────────────────────────────

export type Cadence = "daily" | "weekdays" | "weekly_target";

export interface Habit {
  id: string;
  userId: string;
  name: string;
  cadence: Cadence;
  targetPerWeek: number | null;
  color: string | null;
  position: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckIn {
  id: string;
  habitId: string;
  userId: string;
  /** The client's local calendar date, `YYYY-MM-DD`. */
  date: string;
  note: string | null;
  createdAt: Date;
}

// ── Inputs ──────────────────────────────────────────────────

export interface CreateHabitInput {
  id: string;
  userId: string;
  name: string;
  cadence: Cadence;
  targetPerWeek?: number | null;
  color?: string | null;
}

export interface UpdateHabitInput {
  name?: string;
  cadence?: Cadence;
  targetPerWeek?: number | null;
  color?: string | null;
  /** true archives the habit, false restores it. */
  archived?: boolean;
}

// ── Repository ──────────────────────────────────────────────

export interface HabitsRepository {
  listHabits(userId: string, includeArchived: boolean): Promise<HabitsResult<Habit[]>>;
  getHabit(userId: string, habitId: string): Promise<HabitsResult<Habit>>;
  createHabit(input: CreateHabitInput): Promise<HabitsResult<Habit>>;
  updateHabit(userId: string, habitId: string, input: UpdateHabitInput): Promise<HabitsResult<Habit>>;
  deleteHabit(userId: string, habitId: string): Promise<HabitsResult<void>>;
  reorderHabits(userId: string, ids: string[]): Promise<HabitsResult<Habit[]>>;

  /** Idempotent: checking in twice on the same day is one check-in. */
  checkIn(input: { id: string; habitId: string; userId: string; date: string; note?: string | null }): Promise<HabitsResult<CheckIn>>;
  undoCheckIn(userId: string, habitId: string, date: string): Promise<HabitsResult<void>>;
  /** Every check-in date for one habit, ascending — the streak math's input. */
  checkInDates(userId: string, habitId: string): Promise<HabitsResult<string[]>>;
  /** Check-in dates for every habit of the owner, as habitId → dates. */
  allCheckInDates(userId: string): Promise<HabitsResult<Map<string, string[]>>>;
}
