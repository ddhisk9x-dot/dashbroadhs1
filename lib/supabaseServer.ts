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

export async function getAppState(sheetName: string = "DIEM_2526"): Promise<AppState> {
  // Query the requested sheet first (default: DIEM_2526 where sync saves data)
  let { data, error } = await supabase
    .from("app_state")
    .select("students_json")
    .eq("id", sheetName)
    .maybeSingle();

  // Fallback to "main" if the specific sheet doesn't exist
  if (!data && sheetName !== "main") {
    const fallback = await supabase.from("app_state").select("students_json").eq("id", "main").maybeSingle();
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
