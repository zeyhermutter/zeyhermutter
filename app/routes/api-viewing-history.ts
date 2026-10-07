import { data } from "react-router";
import { requirePermission } from "~/lib/auth.server";

export async function loader({ request, context, params }: any) {
  const { supabase, responseHeaders } = await requirePermission(
    request,
    context.cloudflare.env,
    "viewing.read",
  );

  const viewingId = String(params.viewingId ?? "");
  const { data: current, error: currentError } = await supabase
    .from("viewings")
    .select("id,property_id,contact_id")
    .eq("id", viewingId)
    .maybeSingle();

  if (currentError || !current) {
    return data({ error: "Besichtigung nicht gefunden." }, { status: 404, headers: responseHeaders() });
  }

  const { data: related, error: relatedError } = await supabase
    .from("viewings")
    .select("id,viewing_number,starts_at,status")
    .eq("property_id", current.property_id)
    .eq("contact_id", current.contact_id)
    .order("starts_at", { ascending: false })
    .limit(50);

  if (relatedError) {
    return data({ error: "Besichtigungshistorie konnte nicht geladen werden." }, { status: 400, headers: responseHeaders() });
  }

  const viewings = related ?? [];
  const viewingIds = viewings.map((item: any) => item.id);
  let audit: any[] = [];

  if (viewingIds.length) {
    const { data: auditRows, error: auditError } = await supabase
      .from("audit_events")
      .select("id,entity_id,occurred_at,actor_display_name_snapshot,action,description,field_changes")
      .eq("entity_type", "VIEWING")
      .in("entity_id", viewingIds)
      .order("occurred_at", { ascending: false })
      .limit(300);

    if (auditError) {
      return data({ error: "Besichtigungshistorie konnte nicht geladen werden." }, { status: 400, headers: responseHeaders() });
    }
    audit = auditRows ?? [];
  }

  return data(
    {
      currentViewingId: viewingId,
      viewings,
      audit,
    },
    { headers: responseHeaders() },
  );
}
