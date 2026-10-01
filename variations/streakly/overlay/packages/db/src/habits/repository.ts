import type { SqlExecutor } from "../d1/executor.js";
import { isUniqueViolation } from "../d1/errors.js";
import type {
  CheckIn,
  CreateHabitInput,
  Habit,
  HabitsRepository,
  HabitsResult,
  UpdateHabitInput,
} from "./types.js";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// ── Row mappers ────────────────────────────────────────────

function mapHabit(row: Record<string, unknown>): Habit {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    cadence: row.cadence as Habit["cadence"],
    targetPerWeek: row.target_per_week === null || row.target_per_week === undefined ? null : Number(row.target_per_week),
    color: (row.color as string) ?? null,
    position: Number(row.position ?? 0),
    archivedAt: row.archived_at ? new Date(row.archived_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapCheckIn(row: Record<string, unknown>): CheckIn {
  return {
    id: row.id as string,
    habitId: row.habit_id as string,
    userId: row.user_id as string,
    date: row.date as string,
    note: (row.note as string) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

function internal(message: string): HabitsResult<never> {
  return { ok: false, error: { kind: "internal", message } };
}

// ── Repository factory ─────────────────────────────────────

export function createHabitsRepository(executor: SqlExecutor): HabitsRepository {
  async function many<T>(sql: string, params: unknown[], map: (r: Record<string, unknown>) => T): Promise<HabitsResult<T[]>> {
    try {
      const r = await executor.execute<Record<string, unknown>>(sql, params);
      return { ok: true, value: r.rows.map(map) };
    } catch {
      return internal("Query failed");
    }
  }

  return {
    listHabits(userId, includeArchived) {
      const where = includeArchived ? "" : " AND archived_at IS NULL";
      return many(
        `SELECT * FROM habits_habits WHERE user_id = $1${where} ORDER BY position ASC, id ASC LIMIT 200`,
        [userId],
        mapHabit,
      );
    },

    async getHabit(userId, habitId) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `SELECT * FROM habits_habits WHERE user_id = $1 AND id = $2`,
          [userId, habitId],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapHabit(r.rows[0]!) };
      } catch {
        return internal("Failed to read habit");
      }
    },

    async createHabit(input: CreateHabitInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO habits_habits (id, user_id, name, cadence, target_per_week, color, position, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6,
                   (SELECT COALESCE(MAX(position), -1) + 1 FROM habits_habits WHERE user_id = $2),
                   ${NOW}, ${NOW})
           RETURNING *`,
          [input.id, input.userId, input.name, input.cadence, input.targetPerWeek ?? null, input.color ?? null],
        );
        if (r.rowCount === 0) return internal("Insert returned no row");
        return { ok: true, value: mapHabit(r.rows[0]!) };
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, error: { kind: "conflict", entity: "habit" } };
        return internal("Failed to create habit");
      }
    },

    async updateHabit(userId, habitId, input: UpdateHabitInput) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `UPDATE habits_habits
           SET name = COALESCE($3, name),
               cadence = COALESCE($4, cadence),
               target_per_week = CASE WHEN $5 = 1 THEN $6 ELSE target_per_week END,
               color = CASE WHEN $7 = 1 THEN $8 ELSE color END,
               archived_at = CASE WHEN $9 = 1 THEN ${NOW} WHEN $9 = 0 THEN NULL ELSE archived_at END,
               updated_at = ${NOW}
           WHERE user_id = $1 AND id = $2
           RETURNING *`,
          [
            userId,
            habitId,
            input.name ?? null,
            input.cadence ?? null,
            input.targetPerWeek !== undefined ? 1 : 0,
            input.targetPerWeek ?? null,
            input.color !== undefined ? 1 : 0,
            input.color ?? null,
            input.archived === undefined ? null : input.archived ? 1 : 0,
          ],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: mapHabit(r.rows[0]!) };
      } catch {
        // The cadence/target CHECK is the likely cause: a weekly target habit
        // must carry a target, and the others must not.
        return internal("Failed to update habit");
      }
    },

    async deleteHabit(userId, habitId) {
      try {
        // Check-ins reference the habit and D1 enforces the FK.
        await executor.execute(
          `DELETE FROM habits_checkins WHERE habit_id IN (SELECT id FROM habits_habits WHERE user_id = $1 AND id = $2)`,
          [userId, habitId],
        );
        const r = await executor.execute(`DELETE FROM habits_habits WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, habitId]);
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internal("Failed to delete habit");
      }
    },

    async reorderHabits(userId, ids) {
      try {
        // Park, then place: D1 has no interactive transaction, so a single pass
        // would collide two habits on one position mid-flight.
        for (let i = 0; i < ids.length; i++) {
          await executor.execute(`UPDATE habits_habits SET position = $3 WHERE user_id = $1 AND id = $2`, [userId, ids[i]!, 1000 + i]);
        }
        for (let i = 0; i < ids.length; i++) {
          await executor.execute(`UPDATE habits_habits SET position = $3, updated_at = ${NOW} WHERE user_id = $1 AND id = $2`, [userId, ids[i]!, i]);
        }
        return many(`SELECT * FROM habits_habits WHERE user_id = $1 ORDER BY position ASC, id ASC`, [userId], mapHabit);
      } catch {
        return internal("Failed to reorder habits");
      }
    },

    async checkIn(input) {
      try {
        // Idempotent by the (habit_id, date) unique index: a second tap on the
        // same day updates the note rather than doubling the streak.
        const r = await executor.execute<Record<string, unknown>>(
          `INSERT INTO habits_checkins (id, habit_id, user_id, date, note, created_at)
           VALUES ($1, $2, $3, $4, $5, ${NOW})
           ON CONFLICT (habit_id, date) DO UPDATE SET note = COALESCE(excluded.note, habits_checkins.note)
           RETURNING *`,
          [input.id, input.habitId, input.userId, input.date, input.note ?? null],
        );
        if (r.rowCount === 0) return internal("Check-in returned no row");
        return { ok: true, value: mapCheckIn(r.rows[0]!) };
      } catch {
        return internal("Failed to check in");
      }
    },

    async undoCheckIn(userId, habitId, date) {
      try {
        const r = await executor.execute(
          `DELETE FROM habits_checkins WHERE user_id = $1 AND habit_id = $2 AND date = $3 RETURNING id`,
          [userId, habitId, date],
        );
        if (r.rowCount === 0) return { ok: false, error: { kind: "not_found" } };
        return { ok: true, value: undefined };
      } catch {
        return internal("Failed to undo check-in");
      }
    },

    async checkInDates(userId, habitId) {
      const r = await many(
        `SELECT date FROM habits_checkins WHERE user_id = $1 AND habit_id = $2 ORDER BY date ASC LIMIT 5000`,
        [userId, habitId],
        (row) => row.date as string,
      );
      return r;
    },

    async allCheckInDates(userId) {
      try {
        const r = await executor.execute<Record<string, unknown>>(
          `SELECT habit_id, date FROM habits_checkins WHERE user_id = $1 ORDER BY date ASC LIMIT 20000`,
          [userId],
        );
        const map = new Map<string, string[]>();
        for (const row of r.rows) {
          const habitId = row.habit_id as string;
          const list = map.get(habitId);
          if (list) list.push(row.date as string);
          else map.set(habitId, [row.date as string]);
        }
        return { ok: true, value: map };
      } catch {
        return internal("Failed to read check-ins");
      }
    },
  };
}
