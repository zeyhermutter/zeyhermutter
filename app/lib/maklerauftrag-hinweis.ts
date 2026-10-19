// Hinweis "ohne Maklerauftrag vermarkten" (19.10.2026).
//
// Freigabe Sebastian: Beim Veroeffentlichen auf der Website und beim
// Freigeben eines Exposés warnt das CRM, wenn fuer das Objekt kein aktiver
// Maklerauftrag erfasst ist oder beim aktiven Auftrag die Textform nicht
// dokumentiert ist. Es blockiert nichts und bewertet nichts rechtlich -- es
// zeigt nur, was im CRM erfasst ist. Wer Maklerauftraege nicht lesen darf,
// bekommt keinen Hinweis (das CRM weiss dann nichts Verlaessliches).

import type { SupabaseClient } from "@supabase/supabase-js";

export type MaklerauftragHinweis = { text: string; href: string; linkText: string };

export async function maklerauftragHinweis(supabase: SupabaseClient, propertyId: string): Promise<MaklerauftragHinweis | null> {
  const recht = await supabase.rpc("current_user_has_permission", { p_permission: "mandate.read" });
  if (recht.error || recht.data !== true) return null;
  const { data, error } = await supabase
    .from("brokerage_mandates")
    .select("id,mandate_number,text_form_confirmed")
    .eq("property_id", propertyId)
    .eq("status", "ACTIVE")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) return null;
  const aktiv = data ?? [];
  if (aktiv.length === 0) {
    return {
      text: "Für dieses Objekt ist kein aktiver Maklerauftrag erfasst.",
      href: `/mandates/new?property_id=${encodeURIComponent(propertyId)}`,
      linkText: "Maklerauftrag erfassen",
    };
  }
  if (!aktiv.some((m) => m.text_form_confirmed)) {
    return {
      text: `Beim Maklerauftrag ${aktiv[0].mandate_number} ist nicht dokumentiert, dass er in Textform vorliegt.`,
      href: `/mandates/${aktiv[0].id}`,
      linkText: "Auftrag öffnen",
    };
  }
  return null;
}
