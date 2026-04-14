import { createClient } from "@supabase/supabase-js";
import { SCHOOL_YEARS, DEFAULT_YEAR_ID } from "./schoolConfig";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const supabase = createClient(
  required("SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
);

export type AppState = { students: any[] };

// Helper to get config for a specific year
function getYearConfig(yearId: string) {
  const y = SCHOOL_YEARS.find((cf) => cf.id === yearId);
  return y || SCHOOL_YEARS.find((cf) => cf.id === DEFAULT_YEAR_ID);
}

// 1. Get Data for a specific Year (Merged from all sheets)
export async function getAppStateForYear(yearId: string = DEFAULT_YEAR_ID): Promise<AppState> {
  const config = getYearConfig(yearId);
  if (!config) return { students: [] };

  const sheetIds = config.sheets.map(s => s.dbId);
  if (sheetIds.length === 0) return { students: [] };

  // Fetch all related rows
  const { data, error } = await supabase
    .from("app_state")
    .select("id, students_json")
    .in("id", sheetIds);

  if (error) {
    console.error("Error fetching app_state:", error);
    return { students: [] };
  }

  // Merge all students from all sheets
  let allStudents: any[] = [];
  data?.forEach((row: any) => {
    const json = row.students_json as AppState;
    if (json?.students && Array.isArray(json.students)) {
      allStudents = allStudents.concat(json.students);
    }
  });

  return { students: allStudents };
}

// =====================================================
// In-memory cache for app state (reduces Disk IO)
// =====================================================
let _appStateCache: { data: AppState; ts: number } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

export function invalidateAppStateCache() {
  _appStateCache = null;
}

// Legacy support (defaults to current year) — with caching
export async function getAppState(): Promise<AppState> {
  if (_appStateCache && Date.now() - _appStateCache.ts < CACHE_TTL) {
    return _appStateCache.data;
  }
  const data = await getAppStateForYear(DEFAULT_YEAR_ID);
  _appStateCache = { data, ts: Date.now() };
  return data;
}

// Save data for a specific sheet (DB ID)
export async function setAppState(state: AppState, dbId: string = "main"): Promise<void> {
  const { error } = await supabase
    .from("app_state")
    .upsert({ id: dbId, students_json: state, updated_at: new Date().toISOString() });

  if (error) throw error;

  // Invalidate cache so next read gets fresh data
  invalidateAppStateCache();
}

// =====================================================
// NEW: Lightweight Tick Operations (No full JSON R/W)
// =====================================================

/**
 * Save a tick using DELETE + INSERT for maximum reliability.
 * This avoids issues with missing unique constraints on upsert.
 */
export async function upsertTick(
  mhs: string,
  actionId: string,
  tickDate: string,
  completed: boolean
): Promise<void> {
  const cleanMhs = mhs.trim();
  const cleanActionId = actionId.trim();
  const cleanDate = tickDate.trim();

  console.log(`[TICK] Saving: mhs=${cleanMhs}, action=${cleanActionId}, date=${cleanDate}, completed=${completed}`);

  // Step 1: Delete any existing row with same key
  const { error: delErr } = await supabase
    .from("student_ticks")
    .delete()
    .eq("mhs", cleanMhs)
    .eq("action_id", cleanActionId)
    .eq("tick_date", cleanDate);

  if (delErr) {
    console.error("[TICK] Delete failed:", delErr);
    // Don't throw — still try to insert
  }

  // Step 2: Insert new row (only if completed=true; if false, just delete is enough)
  if (completed) {
    const { error: insErr } = await supabase
      .from("student_ticks")
      .insert({
        mhs: cleanMhs,
        action_id: cleanActionId,
        tick_date: cleanDate,
        completed: true,
      });

    if (insErr) {
      console.error("[TICK] Insert failed:", insErr);
      throw insErr;
    }
  }

  // Step 3: Verify write (read back)
  const { data: verify, error: verErr } = await supabase
    .from("student_ticks")
    .select("mhs, action_id, tick_date, completed")
    .eq("mhs", cleanMhs)
    .eq("action_id", cleanActionId)
    .eq("tick_date", cleanDate)
    .maybeSingle();

  if (completed && (!verify || verErr)) {
    console.error("[TICK] VERIFICATION FAILED — tick not found after insert!", { verify, verErr });
    throw new Error("Tick verification failed: row not found after insert");
  }

  console.log(`[TICK] Verified OK: ${completed ? "saved" : "deleted"}`);
}

/**
 * Fetch all ticks for a single student from the dedicated table.
 */
export async function getTicksForStudent(mhs: string): Promise<
  { action_id: string; tick_date: string; completed: boolean }[]
> {
  const { data, error } = await supabase
    .from("student_ticks")
    .select("action_id, tick_date, completed")
    .eq("mhs", mhs.trim());

  if (error) {
    console.error("getTicksForStudent error:", error);
    return [];
  }
  return data || [];
}

/**
 * Fetch all ticks for multiple students (batch).
 * Used by admin/teacher bulk views.
 */
export async function getTicksForAllStudents(): Promise<
  { mhs: string; action_id: string; tick_date: string; completed: boolean }[]
> {
  // Supabase default limit is 1000 rows. For larger schools, paginate.
  let allTicks: any[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("student_ticks")
      .select("mhs, action_id, tick_date, completed")
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("getTicksForAllStudents error:", error);
      break;
    }
    if (!data || data.length === 0) break;
    allTicks = allTicks.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return allTicks;
}

/**
 * Merge ticks from the dedicated table into student action objects.
 * ROBUST version: handles ID mismatches between activeActions and actionsByMonth.
 * Also attaches _ticksByActionId map to each student for direct frontend access.
 */
export function mergeTicksIntoStudents(
  students: any[],
  allTicks: { mhs: string; action_id: string; tick_date: string; completed: boolean }[]
): any[] {
  // Group ticks by mhs
  const tickMap = new Map<string, { action_id: string; tick_date: string; completed: boolean }[]>();
  allTicks.forEach((t) => {
    const key = t.mhs.trim();
    if (!tickMap.has(key)) tickMap.set(key, []);
    tickMap.get(key)!.push(t);
  });

  return students.map((s) => {
    const mhs = String(s.mhs || "").trim();
    const studentTicks = tickMap.get(mhs);
    if (!studentTicks || studentTicks.length === 0) return s;

    // Group ticks by action_id
    const ticksByAction = new Map<string, { date: string; completed: boolean }[]>();
    studentTicks.forEach((t) => {
      const aid = t.action_id;
      if (!ticksByAction.has(aid)) ticksByAction.set(aid, []);
      ticksByAction.get(aid)!.push({ date: t.tick_date, completed: t.completed });
    });

    // Helper: find ticks for an action with flexible matching
    const findTicksForAction = (actionId: string): { date: string; completed: boolean }[] | undefined => {
      // 1. Exact match
      const exact = ticksByAction.get(actionId);
      if (exact) return exact;

      // 2. Try with MHS prefix (action.id might be stored with mhs- prefix in DB)
      const prefixed = ticksByAction.get(`${mhs}-${actionId}`);
      if (prefixed) return prefixed;

      // 3. Try stripping MHS prefix from DB action_id
      for (const [key, val] of ticksByAction.entries()) {
        // DB has "24123802-1774001567368-0", blob has "1774001567368-0"
        if (key.startsWith(`${mhs}-`) && key.substring(mhs.length + 1) === actionId) {
          return val;
        }
      }

      return undefined;
    };

    // Merge into actionsByMonth
    const abm = s.actionsByMonth && typeof s.actionsByMonth === "object"
      ? { ...s.actionsByMonth }
      : {};

    // Collect ALL unique ticks from matched actions (for fallback into activeActions)
    const allMatchedTicks = new Map<string, { date: string; completed: boolean }[]>();

    for (const monthKey of Object.keys(abm)) {
      if (!Array.isArray(abm[monthKey])) continue;
      abm[monthKey] = abm[monthKey].map((action: any, idx: number) => {
        const actionTicks = findTicksForAction(String(action.id || ""));
        if (actionTicks) {
          allMatchedTicks.set(String(idx), actionTicks);
          return { ...action, ticks: actionTicks };
        }
        return action;
      });
    }

    // Also merge into activeActions (backward compat)
    // Try exact match first, then fallback to index-based from actionsByMonth matches
    let activeActions = Array.isArray(s.activeActions) ? [...s.activeActions] : [];
    activeActions = activeActions.map((action: any, idx: number) => {
      // Try flexible match
      const actionTicks = findTicksForAction(String(action.id || ""));
      if (actionTicks) return { ...action, ticks: actionTicks };

      // Fallback: use index-based match from actionsByMonth (same position = same action)
      const fallbackTicks = allMatchedTicks.get(String(idx));
      if (fallbackTicks) return { ...action, ticks: fallbackTicks };

      return action;
    });

    // Attach raw ticks map for direct access by frontend (bypass merge issues)
    const _ticksByActionId: Record<string, { date: string; completed: boolean }[]> = {};
    ticksByAction.forEach((val, key) => {
      _ticksByActionId[key] = val;
    });

    return { ...s, actionsByMonth: abm, activeActions, _ticksByActionId };
  });
}

/**
 * Convenience: Load full state + merge ticks in one call.
 * Used by admin/teacher views.
 */
export async function getAppStateWithTicks(): Promise<AppState> {
  const [state, ticks] = await Promise.all([
    getAppState(),
    getTicksForAllStudents(),
  ]);

  return {
    students: mergeTicksIntoStudents(state.students, ticks),
  };
}

/**
 * Convenience: Load full state + merge ticks for a single student.
 * Used by student/me view.
 */
export async function getAppStateWithTicksForStudent(mhs: string): Promise<AppState> {
  const [state, ticks] = await Promise.all([
    getAppState(),
    getTicksForStudent(mhs),
  ]);

  const ticksWithMhs = ticks.map((t) => ({ ...t, mhs }));
  return {
    students: mergeTicksIntoStudents(state.students, ticksWithMhs),
  };
}
