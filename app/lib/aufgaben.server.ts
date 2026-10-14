// Was der Aufgaben-Baustein (app/components/aufgaben-baustein.tsx) neben den
// Aufgaben selbst braucht: wer verantwortlich sein kann und ob der Benutzer
// Aufgaben anlegen und abhaken darf. Eine Stelle, damit jede Akte dasselbe
// laedt.

export const AUFGABEN_SPALTEN = "id,task_number,title,description,status,priority,due_at,responsible_user,version";

export async function aufgabenRahmen(supabase: any) {
  const [nutzer, recht] = await Promise.all([
    supabase.from("profiles").select("user_id,display_name").eq("status", "ACTIVE").order("display_name"),
    supabase.rpc("current_user_has_permission", { p_permission: "task.write" }),
  ]);
  return {
    nutzer: (nutzer.data ?? []) as { user_id: string; display_name: string }[],
    darfAufgaben: recht.data === true,
  };
}
