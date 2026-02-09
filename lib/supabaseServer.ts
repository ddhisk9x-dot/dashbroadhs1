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

// Legacy support (defaults to current year)
export async function getAppState(): Promise<AppState> {
  return getAppStateForYear(DEFAULT_YEAR_ID);
}

// Save data for a specific sheet (DB ID)
export async function setAppState(state: AppState, dbId: string = "main"): Promise<void> {
  const { error } = await supabase
    .from("app_state")
    .upsert({ id: dbId, students_json: state, updated_at: new Date().toISOString() });

  if (error) throw error;
}

