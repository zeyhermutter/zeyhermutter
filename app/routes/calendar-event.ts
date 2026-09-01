import type { Route } from "./+types/calendar-event";
import { requireActiveUser } from "~/lib/auth.server";

type ExportEvent = {
  kind: string;
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  sourcePath: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(["task", "lead_followup", "lead_valuation", "viewing", "closing_notary"]);

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function utcStamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Response("Terminzeit ist ungültig.", { status: 500 });
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeBaseUrl(value: string | undefined) {
  const fallback = "https://zeyhermutter.playsony.workers.dev";
  try {
    const url = new URL(value || fallback);
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallback;
  }
}

async function loadExportEvent(supabase: any, kind: string, id: string): Promise<ExportEvent | null> {
  if (kind === "task") {
    const { data: row, error } = await supabase
      .from("tasks")
      .select("id,task_number,title,description,due_at,viewing_id,inquiry_id,lead_id,property_id,search_profile_id")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Response("Aufgabe konnte nicht exportiert werden.", { status: 500 });
    if (!row) return null;
    const sourcePath = row.viewing_id ? `/viewings/${row.viewing_id}`
      : row.inquiry_id ? `/inquiries/${row.inquiry_id}`
        : row.lead_id ? `/leads/${row.lead_id}`
          : row.property_id ? `/properties/${row.property_id}`
            : row.search_profile_id ? `/search-profiles/${row.search_profile_id}`
              : "/crm/tasks";
    return {
      kind,
      id,
      summary: row.title,
      description: [row.task_number, row.description].filter(Boolean).join(" · ") || null,
      location: null,
      startsAt: row.due_at,
      endsAt: null,
      sourcePath,
    };
  }

  if (kind === "lead_followup") {
    const { data: row, error } = await supabase
      .from("leads")
      .select("id,lead_number,follow_up_at,contacts!inner(first_name,last_name)")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Response("Wiedervorlage konnte nicht exportiert werden.", { status: 500 });
    if (!row?.follow_up_at) return null;
    const contact = one(row.contacts) as { first_name: string; last_name: string } | null;
    return {
      kind,
      id,
      summary: `Wiedervorlage ${row.lead_number}`,
      description: contact ? `${contact.first_name} ${contact.last_name}` : row.lead_number,
      location: null,
      startsAt: row.follow_up_at,
      endsAt: null,
      sourcePath: `/leads/${row.id}`,
    };
  }

  if (kind === "lead_valuation") {
    const { data: row, error } = await supabase
      .from("leads")
      .select("id,lead_number,valuation_appointment_at,property_street,property_house_number,property_postal_code,property_city,contacts!inner(first_name,last_name)")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Response("Eigentümertermin konnte nicht exportiert werden.", { status: 500 });
    if (!row?.valuation_appointment_at) return null;
    const contact = one(row.contacts) as { first_name: string; last_name: string } | null;
    const address = [row.property_street, row.property_house_number, row.property_postal_code, row.property_city].filter(Boolean).join(" ") || null;
    return {
      kind,
      id,
      summary: `Eigentümer-/Bewertungstermin ${row.lead_number}`,
      description: contact ? `${contact.first_name} ${contact.last_name}` : row.lead_number,
      location: address,
      startsAt: row.valuation_appointment_at,
      endsAt: null,
      sourcePath: `/leads/${row.id}`,
    };
  }

  if (kind === "viewing") {
    const { data: row, error } = await supabase
      .from("viewings")
      .select("id,viewing_number,starts_at,ends_at,meeting_point,contacts(first_name,last_name),properties(property_number,internal_title)")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Response("Besichtigung konnte nicht exportiert werden.", { status: 500 });
    if (!row) return null;
    const contact = one(row.contacts) as { first_name: string; last_name: string } | null;
    const property = one(row.properties) as { property_number: string; internal_title: string } | null;
    return {
      kind,
      id,
      summary: `Besichtigung ${row.viewing_number}`,
      description: [contact ? `${contact.first_name} ${contact.last_name}` : null, property?.property_number, property?.internal_title].filter(Boolean).join(" · ") || null,
      location: row.meeting_point,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      sourcePath: `/viewings/${row.id}`,
    };
  }

  const { data: row, error } = await supabase
    .from("sale_closings")
    .select("id,closing_number,notary_appointment_at,notary_reference,properties(property_number,internal_title)")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Response("Notartermin konnte nicht exportiert werden.", { status: 500 });
  if (!row?.notary_appointment_at) return null;
  const property = one(row.properties) as { property_number: string; internal_title: string } | null;
  return {
    kind,
    id,
    summary: `Notartermin ${row.closing_number}`,
    description: [property?.property_number, property?.internal_title, row.notary_reference ? `Notar-Aktenzeichen ${row.notary_reference}` : null].filter(Boolean).join(" · ") || null,
    location: null,
    startsAt: row.notary_appointment_at,
    endsAt: null,
    sourcePath: `/closings/${row.id}`,
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!KINDS.has(kind) || !UUID_RE.test(id)) {
    throw new Response("Ungültiger Kalenderexport.", { status: 400, headers: responseHeaders() });
  }

  const event = await loadExportEvent(supabase, kind, id);
  if (!event) throw new Response("Termin nicht gefunden oder nicht lesbar.", { status: 404, headers: responseHeaders() });
  const baseUrl = safeBaseUrl(context.cloudflare.env.APP_BASE_URL);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZeyherMutterOS//CRM Calendar Export//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(`${event.kind}-${event.id}@zeyhermutteros`)}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(event.startsAt)}`,
    ...(event.endsAt ? [`DTEND:${utcStamp(event.endsAt)}`] : []),
    `SUMMARY:${icsEscape(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${icsEscape(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${icsEscape(event.location)}`] : []),
    `URL:${icsEscape(`${baseUrl}${event.sourcePath}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];

  return new Response(lines.join("\r\n"), {
    headers: {
      ...Object.fromEntries(responseHeaders().entries()),
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="zm-${kind}-${id.slice(0, 8)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
