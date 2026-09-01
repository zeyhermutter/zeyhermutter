import { emptySalesReadinessViewModel } from "~/lib/sales-readiness";

// This compile-time gate deliberately stays false until the prepared migration
// has been reviewed and explicitly approved for a backend environment.
export const SALES_READINESS_BACKEND_ENABLED = false;

type SupabaseQueryClient = {
  from(table: string): any;
};

export async function loadPreparedSalesReadiness(
  supabase: SupabaseQueryClient,
  leadId: string,
) {
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id,lead_number,property_street,property_house_number,property_postal_code,property_city,primary_responsible_user,contacts!inner(first_name,last_name),responsible_profile:profiles!leads_primary_responsible_user_fkey(display_name)")
    .eq("id", leadId)
    .maybeSingle();

  if (error || !lead) throw new Response("Lead nicht gefunden.", { status: 404 });

  const contact = Array.isArray(lead.contacts) ? lead.contacts[0] : lead.contacts;
  const responsible = Array.isArray(lead.responsible_profile) ? lead.responsible_profile[0] : lead.responsible_profile;
  const street = [lead.property_street, lead.property_house_number].filter(Boolean).join(" ");
  const city = [lead.property_postal_code, lead.property_city].filter(Boolean).join(" ");
  const propertyLabel = [street, city].filter(Boolean).join(", ") || "Objektangaben noch offen";

  return emptySalesReadinessViewModel({
    leadId: lead.id,
    leadNumber: lead.lead_number,
    contactLabel: [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Kontakt",
    propertyLabel,
    responsibleUserLabel: responsible?.display_name ?? "Noch offen",
  });
}
