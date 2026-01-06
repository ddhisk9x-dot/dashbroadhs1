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
  const { data, error } = await supabase
    .from("app_state")
    .select("students_json")
    .eq("id", "main")
    .single();

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
    .upsert({ id: "main", students_json: state, updated_at: new Date().toISOString() });

  if (error) throw error;
}
