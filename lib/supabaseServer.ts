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

export async function getAppState(): Promise<AppState> {
  // ✅ PRIORITY: Read from "main" first (stable, has good data)
  // Fallback to DIEM_2526 only if "main" doesn't exist
  let { data, error } = await supabase
    .from("app_state")
    .select("students_json")
    .eq("id", "main")
    .maybeSingle();

  if (!data) {
    // Fallback to DIEM_2526 (may have newer but potentially incomplete data)
    const fallback = await supabase.from("app_state").select("students_json").eq("id", "DIEM_2526").maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    // If table exists but row missing, return empty state
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
