import { createClient } from "@supabase/supabase-js";

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

export async function getAppState(sheetName?: string): Promise<AppState> {
  // If specific year requested (e.g., DIEM_2627), query that first
  // Otherwise, prioritize "main" (stable 2025-2026 data)
  const primaryId = sheetName || "main";
  const fallbackId = sheetName ? "main" : null; // Only fallback if querying specific year

  let { data, error } = await supabase
    .from("app_state")
    .select("students_json")
    .eq("id", primaryId)
    .maybeSingle();

  // Fallback logic
  if (!data && fallbackId) {
    const fallback = await supabase.from("app_state").select("students_json").eq("id", fallbackId).maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if ((error as any).code === "PGRST116") return { students: [] };
    throw error;
  }

  return (data?.students_json as AppState) ?? { students: [] };
}

export async function setAppState(state: AppState): Promise<void> {
  const { error } = await supabase
    .from("app_state")
    .upsert({ id: "DIEM_2526", students_json: state, updated_at: new Date().toISOString() });

  if (error) throw error;
}
