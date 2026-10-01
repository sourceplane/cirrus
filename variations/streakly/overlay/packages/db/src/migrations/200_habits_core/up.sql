-- 200_habits_core
-- Habits persistence foundation — habits and their daily check-ins.
-- Bounded context: habits (user-scoped: every row hangs off a user id, never an org)
-- Idempotent: uses IF NOT EXISTS throughout.
-- No cross-context foreign keys: user_id is an opaque identity reference.
-- schema habits: Habits bounded context — the private habit tracker.

-- ============================================================
-- Habits: what the person is trying to do, and how often.
-- ============================================================

CREATE TABLE IF NOT EXISTS habits_habits (
  id               TEXT        PRIMARY KEY,
  user_id          TEXT        NOT NULL,
  name             TEXT        NOT NULL,
  cadence          TEXT        NOT NULL DEFAULT 'daily',
  target_per_week  INTEGER,
  color            TEXT,
  position         INTEGER     NOT NULL,
  archived_at      TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),

  CONSTRAINT habits_cadence_check CHECK (cadence IN ('daily', 'weekdays', 'weekly_target')),
  -- A weekly target is the whole meaning of that cadence, so it must be present
  -- and sane; the other cadences derive their target from the calendar.
  -- `IS NOT NULL` is load-bearing: `NULL BETWEEN 1 AND 7` evaluates to NULL,
  -- and SQLite accepts a CHECK that evaluates to NULL — so without it a
  -- weekly-target habit could be stored with no target at all.
  CONSTRAINT habits_target_check CHECK (
    (cadence = 'weekly_target' AND target_per_week IS NOT NULL AND target_per_week BETWEEN 1 AND 7)
    OR (cadence <> 'weekly_target' AND target_per_week IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS habits_habits_user_active_idx
  ON habits_habits (user_id, archived_at, position ASC, id ASC);

-- table habits_habits: One habit, owned by one person.
-- column habits_habits.cadence: daily (every day), weekdays (Mon–Fri), weekly_target (N times a week).
-- column habits_habits.archived_at: Set to hide a habit without losing its history.
-- column habits_habits.position: Sort key within the person's list.

-- ============================================================
-- Check-ins: one per habit per calendar day.
-- ============================================================

CREATE TABLE IF NOT EXISTS habits_checkins (
  id          TEXT        PRIMARY KEY,
  habit_id    TEXT        NOT NULL REFERENCES habits_habits(id),
  user_id     TEXT        NOT NULL,
  date        TEXT        NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One check-in per habit per day: the uniqueness IS the idempotency of a tap.
CREATE UNIQUE INDEX IF NOT EXISTS habits_checkins_habit_date_idx
  ON habits_checkins (habit_id, date);

CREATE INDEX IF NOT EXISTS habits_checkins_user_date_idx
  ON habits_checkins (user_id, date DESC);

-- table habits_checkins: A day the person did the habit.
-- column habits_checkins.date: The CLIENT's local calendar date, 'YYYY-MM-DD'. The
--   server does no timezone math: a day is whatever day it was where the person was.
