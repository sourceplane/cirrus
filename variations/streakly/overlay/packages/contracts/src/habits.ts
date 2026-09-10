/**
 * Habits contract types — the private habit & streak tracker (Streakly
 * variation).
 *
 * Entirely user-scoped: every route lives under `/v1/me/...` and needs a
 * session. There is no public surface and no organization in any path.
 *
 * Dates are the CLIENT's local calendar dates as `YYYY-MM-DD`. The server does
 * no timezone math: a day is whatever day it was where the person was.
 */

export type Cadence = "daily" | "weekdays" | "weekly_target";

export interface PublicHabit {
  id: string;
  name: string;
  cadence: Cadence;
  targetPerWeek: number | null;
  color: string | null;
  position: number;
  archived: boolean;
  createdAt: string;
}

export interface PublicCheckIn {
  habitId: string;
  date: string;
  note: string | null;
}

// ── Habits ──────────────────────────────────────────────────

export interface ListHabitsResponse {
  habits: PublicHabit[];
}

export interface CreateHabitRequest {
  name: string;
  cadence?: Cadence;
  targetPerWeek?: number | null;
  color?: string | null;
}

export interface UpdateHabitRequest {
  name?: string;
  cadence?: Cadence;
  targetPerWeek?: number | null;
  color?: string | null;
  archived?: boolean;
}

export interface HabitResponse {
  habit: PublicHabit;
}

export interface ReorderHabitsRequest {
  /** Exactly the owner's habit ids, in the order they should render. */
  ids: string[];
}

export interface ReorderHabitsResponse {
  habits: PublicHabit[];
}

// ── Check-ins ───────────────────────────────────────────────

export interface CheckInRequest {
  note?: string | null;
}

export interface CheckInResponse {
  checkIn: PublicCheckIn;
}

// ── Today ───────────────────────────────────────────────────

export interface DayMark {
  date: string;
  done: boolean;
}

export interface TodayHabit {
  habit: PublicHabit;
  doneToday: boolean;
  currentStreak: number;
  bestStreak: number;
  /** Share of the cadence's expected days met over the last 30 days, 0–100. */
  completionRate30d: number;
  /** The last seven days, oldest first — the dot grid. */
  days: DayMark[];
}

export interface TodayResponse {
  date: string;
  habits: TodayHabit[];
}

// ── Weekly review ───────────────────────────────────────────

export interface ReviewHabit {
  habit: PublicHabit;
  done: number;
  target: number;
  met: boolean;
  currentStreak: number;
}

export interface ReviewResponse {
  /** The Monday the week starts on. */
  weekStart: string;
  habits: ReviewHabit[];
  totals: {
    habits: number;
    met: number;
    checkIns: number;
  };
}
