import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/email-compose";
import { Aufklapper } from "~/components/aufklapper";
import { EmailSchreiben, type SchreibDaten } from "~/components/email-schreiben";
import { anredeVon, mailtoAdresse } from "~/lib/email-vorlage";
import { FIRMA_SPALTEN, pflichtangaben, type Firma } from "~/lib/firma";
import { requireActiveUser } from "~/lib/auth.server";
import { zeitpunkt as formatDate } from "~/lib/format";
import { crmLocalDateTimeToIso as berlinLocalToIso, crmNowLocalDateTime as berlinInputNow } from "~/lib/local-time";
import "~/communication.css";
import "~/programm-liste.css";

type ContextType = "CONTACT" | "LEAD" | "INQUIRY";
type ContextRef = { type: ContextType; id: string };
type EmailContext = {
  type: ContextType;
  id: string;
  number: string;
  contactId: string;
  contactName: string;
  email: string | null;
  sourcePath: string;
  sourceLabel: string;
};
type ActionResult = { error?: string };
type ActivityMetadata = { direction?: string; capture?: string; channel?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function resolveContext(url: URL): ContextRef | null {
  const candidates: ContextRef[] = [];
  const contactId = url.searchParams.get("contact_id");
  const leadId = url.searchParams.get("lead_id");
  const inquiryId = url.searchParams.get("inquiry_id");
  if (contactId) candidates.push({ type: "CONTACT", id: contactId });
  if (leadId) candidates.push({ type: "LEAD", id: leadId });
  if (inquiryId) candidates.push({ type: "INQUIRY", id: inquiryId });
  if (candidates.length > 1) throw new Response("Bitte genau einen CRM-Bezug für die E-Mail öffnen.", { status: 400 });
  const ref = candidates[0] ?? null;
  if (ref && !UUID_RE.test(ref.id)) throw new Response("Ungültiger CRM-Bezug.", { status: 400 });
  return ref;
}

function resolveFormContext(formData: FormData): ContextRef | null {
  const type = text(formData, "context_type") as ContextType;
  const id = text(formData, "context_id");
  if (!(["CONTACT", "LEAD", "INQUIRY"] as string[]).includes(type) || !UUID_RE.test(id)) return null;
  return { type, id };
}

async function loadContext(supabase: any, ref: ContextRef): Promise<EmailContext | null> {
  if (ref.type === "CONTACT") {
    const { data: row, error } = await supabase
      .from("contacts")
      .select("id,contact_number,first_name,last_name,email")
      .eq("id", ref.id)
      .maybeSingle();
    if (error) throw new Response("Kontakt konnte nicht geladen werden.", { status: 500 });
    if (!row) return null;
    return {
      type: ref.type,
      id: row.id,
      number: row.contact_number,
      contactId: row.id,
      contactName: `${row.first_name} ${row.last_name}`.trim(),
      email: row.email,
      sourcePath: `/crm/contacts/${row.id}`,
      sourceLabel: "Kontakt",
    };
  }

  if (ref.type === "LEAD") {
    const { data: row, error } = await supabase
      .from("leads")
      .select("id,lead_number,contact_id,contacts!inner(first_name,last_name,email)")
      .eq("id", ref.id)
      .maybeSingle();
    if (error) throw new Response("Lead konnte nicht geladen werden.", { status: 500 });
    if (!row) return null;
    const contact = one(row.contacts) as { first_name: string; last_name: string; email: string | null } | null;
    if (!contact) return null;
    return {
      type: ref.type,
      id: row.id,
      number: row.lead_number,
      contactId: row.contact_id,
      contactName: `${contact.first_name} ${contact.last_name}`.trim(),
      email: contact.email,
      sourcePath: `/leads/${row.id}`,
      sourceLabel: "Verkäufer-Lead",
    };
  }

  const { data: row, error } = await supabase
    .from("inquiries")
    .select("id,inquiry_number,contact_id,contacts!inner(first_name,last_name,email)")
    .eq("id", ref.id)
    .maybeSingle();
  if (error) throw new Response("Anfrage konnte nicht geladen werden.", { status: 500 });
  if (!row) return null;
  const contact = one(row.contacts) as { first_name: string; last_name: string; email: string | null } | null;
  if (!contact) return null;
  return {
    type: ref.type,
    id: row.id,
    number: row.inquiry_number,
    contactId: row.contact_id,
    contactName: `${contact.first_name} ${contact.last_name}`.trim(),
    email: contact.email,
    sourcePath: `/inquiries/${row.id}`,
    sourceLabel: "Anfrage",
  };
}

function permissionFor(type: ContextType) {
  if (type === "LEAD") return "lead.write";
  if (type === "INQUIRY") return "inquiry.write";
  return "contact.write";
}

function contextQuery(context: EmailContext) {
  const key = context.type === "CONTACT" ? "contact_id" : context.type === "LEAD" ? "lead_id" : "inquiry_id";
  return `?${key}=${encodeURIComponent(context.id)}`;
}

function directionLabel(metadata: unknown) {
  const row = metadata && typeof metadata === "object" ? metadata as ActivityMetadata : {};
  if (row.direction === "SENT") return "Gesendet";
  if (row.direction === "RECEIVED") return "Empfangen";
  return "E-Mail";
}

type JournalZeile = { id: string; zeitpunkt: string; betreff: string; text: string | null; richtung: string; von: string; bezug: { art: string; nummer: string; pfad: string } | null; kontakt: string | null };

/** Alle dokumentierten E-Mails, neueste zuerst. activity_events.contact_id
 * hat keinen Fremdschluessel -- Kontakte, Leads und Anfragen werden deshalb
 * getrennt nachgeladen statt eingebettet. null heisst: Fehler beim Laden. */
async function ladeJournal(supabase: any): Promise<JournalZeile[] | null> {
  const { data: rows, error } = await supabase
    .from("activity_events")
    .select("id,title,description,actor_user_id,occurred_at,metadata,contact_id,lead_id,inquiry_id")
    .eq("activity_type", "EMAIL")
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) return null;
  const zeilen = (rows ?? []) as any[];
  const ids = (schluessel: string) => [...new Set(zeilen.map((r) => r[schluessel]).filter(Boolean))] as string[];
  const leer = Promise.resolve({ data: [], error: null });
  const [kontakte, leads, anfragen, profile] = await Promise.all([
    ids("contact_id").length ? supabase.from("contacts").select("id,contact_number,first_name,last_name").in("id", ids("contact_id")) : leer,
    ids("lead_id").length ? supabase.from("leads").select("id,lead_number").in("id", ids("lead_id")) : leer,
    ids("inquiry_id").length ? supabase.from("inquiries").select("id,inquiry_number").in("id", ids("inquiry_id")) : leer,
    zeilen.length ? supabase.from("profiles").select("user_id,display_name") : leer,
  ]);
  if (kontakte.error || leads.error || anfragen.error || profile.error) return null;
  const kontaktJe = new Map((kontakte.data ?? []).map((k: any) => [k.id, k]));
  const leadJe = new Map((leads.data ?? []).map((l: any) => [l.id, l]));
  const anfrageJe = new Map((anfragen.data ?? []).map((a: any) => [a.id, a]));
  const nameJe = new Map((profile.data ?? []).map((p: any) => [p.user_id, p.display_name]));
  return zeilen.map((r) => {
    const kontakt: any = r.contact_id ? kontaktJe.get(r.contact_id) : null;
    const lead: any = r.lead_id ? leadJe.get(r.lead_id) : null;
    const anfrage: any = r.inquiry_id ? anfrageJe.get(r.inquiry_id) : null;
    const bezug = lead ? { art: "Verkäufer-Lead", nummer: lead.lead_number, pfad: `/leads/${lead.id}` }
      : anfrage ? { art: "Anfrage", nummer: anfrage.inquiry_number, pfad: `/inquiries/${anfrage.id}` }
      : kontakt ? { art: "Kontakt", nummer: kontakt.contact_number, pfad: `/crm/contacts/${kontakt.id}` }
      : null;
    return {
      id: r.id,
      zeitpunkt: r.occurred_at,
      betreff: r.title ?? "E-Mail",
      text: r.description ?? null,
      richtung: directionLabel(r.metadata),
      von: r.actor_user_id ? (nameJe.get(r.actor_user_id) as string | undefined) ?? "Benutzer" : "System",
      bezug,
      kontakt: kontakt ? `${kontakt.first_name} ${kontakt.last_name}`.trim() : null,
    };
  });
}

// --- E-Mail schreiben mit Vorlage und Exposé (P2-3, 16.10.2026) ----------
//
// Vorher: "E-Mail im Mailprogramm öffnen" öffnete eine leere Mail, danach
// wurden Richtung, Zeitpunkt und Betreff von Hand abgeschrieben, und ein
// Objektnachweis war ein dritter, getrennter Weg. Jetzt füllt eine Vorlage des
// Büros Betreff und Text vor, das Exposé kommt als PDF oder Link dazu, und
// "Gesendet – festhalten" dokumentiert E-Mail und Objektnachweis in einem
// Schritt. Das CRM verschickt nichts selbst.

const LINK_GUELTIG_TAGE = 14;

/**
 * Das freigegebene Exposé zu einer Anfrage. Hat die Anfrage ein Objekt, nur
 * dessen Exposé. Eine allgemeine Anfrage ("Keine konkrete Immobilie",
 * 19.10.2026) kann jedes freigegebene Exposé bekommen -- dann nur mit
 * ausdrücklich gewählter exposeId.
 */
async function freigegebenesExpose(supabase: any, inquiryId: string, exposeId?: string) {
  const { data: anfrage } = await supabase.from("inquiries").select("id,property_id").eq("id", inquiryId).maybeSingle();
  if (!anfrage) return null;
  if (!anfrage.property_id && !(exposeId && UUID_RE.test(exposeId))) return null;
  let abfrage = supabase.from("property_exposes")
    .select("id,property_id,expose_number,publication_version_id,storage_bucket,storage_path,original_filename,released_at")
    .eq("status", "RELEASED").is("archived_at", null);
  if (anfrage.property_id) abfrage = abfrage.eq("property_id", anfrage.property_id);
  if (exposeId) abfrage = abfrage.eq("id", exposeId);
  const { data: expose } = await abfrage.order("released_at", { ascending: false }).limit(1).maybeSingle();
  return expose ? { ...expose, property_id: expose.property_id as string } : null;
}

/** Für allgemeine Anfragen: alle Objekte mit freigegebenem Exposé zur Auswahl. */
async function exposeAuswahl(supabase: any) {
  const { data } = await supabase.from("property_exposes")
    .select("id,expose_number,original_filename,properties(property_number,internal_title,property_addresses(postal_code,city))")
    .eq("status", "RELEASED").is("archived_at", null).not("storage_path", "is", null)
    .order("released_at", { ascending: false }).limit(200);
  return ((data ?? []) as any[]).map((e) => {
    const objekt = one(e.properties) as any;
    const adresse = objekt ? one(objekt.property_addresses) as any : null;
    return {
      id: e.id as string, nummer: e.expose_number as string, datei: e.original_filename as string,
      objektNummer: objekt?.property_number ?? null, objektTitel: objekt?.internal_title ?? null,
      objektOrt: adresse ? [adresse.postal_code, adresse.city].filter(Boolean).join(" ") || null : null,
    };
  }).sort((a, b) => String(a.objektNummer).localeCompare(String(b.objektNummer), "de"));
}

async function ladeSchreibDaten(supabase: any, ctx: EmailContext, meinName: string | null): Promise<SchreibDaten> {
  const anfrageId = ctx.type === "INQUIRY" ? ctx.id : null;
  const [kontaktR, vorlagenR, anfrageR, firmaR] = await Promise.all([
    supabase.from("contacts").select("salutation,title,first_name,last_name,marketing_objection_at").eq("id", ctx.contactId).maybeSingle(),
    supabase.from("email_templates").select("id,purpose,name,subject,body").eq("active", true).order("purpose").order("sort_order").order("name"),
    anfrageId ? supabase.from("inquiries").select("id,status,version,property_id,properties(property_number,internal_title,property_addresses(postal_code,city))").eq("id", anfrageId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("company_profile").select(FIRMA_SPALTEN).maybeSingle(),
  ]);
  const k = kontaktR.data ?? {};
  const anfrage = anfrageR.data as any;
  const objekt = anfrage ? one(anfrage.properties) as any : null;
  const adresse = objekt ? one(objekt.property_addresses) as any : null;
  const allgemein = Boolean(anfrage && !anfrage.property_id);
  const [expose, besichtigung, links, auswahl] = await Promise.all([
    anfrage?.property_id ? freigegebenesExpose(supabase, anfrage.id) : Promise.resolve(null),
    supabase.from("viewings").select("starts_at").eq("contact_id", ctx.contactId).in("status", ["PLANNED", "CONFIRMED"])
      .gte("starts_at", new Date().toISOString()).is("archived_at", null).order("starts_at", { ascending: true }).limit(1).maybeSingle(),
    // Ausgegebene Kurzlinks zu dieser Anfrage (A7). Ohne Leserecht auf Exposés leer (RLS).
    anfrageId ? supabase.from("expose_links").select("id,created_at,created_by,expires_at,revoked_at,open_count,first_opened_at,last_opened_at,property_exposes(expose_number)")
      .eq("inquiry_id", anfrageId).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    allgemein ? exposeAuswahl(supabase) : Promise.resolve([]),
  ]);
  return {
    vorlagen: vorlagenR.error ? [] : (vorlagenR.data ?? []),
    vorlagenFehlen: Boolean(vorlagenR.error),
    werte: {
      anrede: anredeVon(k),
      vorname: k.first_name ?? null,
      nachname: k.last_name ?? null,
      objekt_nummer: objekt?.property_number ?? null,
      objekt_titel: objekt?.internal_title ?? null,
      objekt_ort: adresse ? [adresse.postal_code, adresse.city].filter(Boolean).join(" ") : null,
      anfrage_nummer: ctx.type === "INQUIRY" ? ctx.number : null,
      besichtigung_termin: besichtigung.data?.starts_at ? formatDate(besichtigung.data.starts_at) : null,
      mein_name: meinName,
      firma: (firmaR.data as Firma | null)?.legal_name ?? null,
      firma_pflichtangaben: pflichtangaben(firmaR.data as Firma | null),
    },
    expose: expose ? { id: expose.id, nummer: expose.expose_number, datei: expose.original_filename } : null,
    exposeAuswahl: auswahl,
    linkTage: LINK_GUELTIG_TAGE,
    links: ((links.data ?? []) as any[]).map((l) => ({
      id: l.id as string, erstellt: l.created_at as string, von: l.created_by as string | null, bis: l.expires_at as string,
      zurueckgezogen: l.revoked_at as string | null, nummer: (one(l.property_exposes) as any)?.expose_number ?? null,
      geoeffnet: Number(l.open_count ?? 0), zuletztGeoeffnet: (l.last_opened_at as string | null) ?? null,
    })),
    anfrage: anfrage ? { status: anfrage.status, version: Number(anfrage.version) } : null,
    werbewiderspruch: k.marketing_objection_at ?? null,
  };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const ref = resolveContext(url);
  // Exposé-PDF zum Anhängen (P2-3): kurz gültige Download-Adresse, nur für das
  // zur Verwendung freigegebene Exposé des Objekts dieser Anfrage.
  const pdf = url.searchParams.get("expose_pdf");
  if (pdf && ref?.type === "INQUIRY") {
    const expose = await freigegebenesExpose(supabase, ref.id, pdf);
    if (!expose) throw new Response("Kein zur Verwendung freigegebenes Exposé zu dieser Anfrage.", { status: 404, headers: responseHeaders() });
    const { data: signiert } = await supabase.storage.from(expose.storage_bucket).createSignedUrl(expose.storage_path, 120, { download: expose.original_filename });
    if (!signiert?.signedUrl) throw new Response("Das Exposé konnte nicht bereitgestellt werden.", { status: 500, headers: responseHeaders() });
    throw redirect(signiert.signedUrl, { headers: responseHeaders() });
  }
  if (!ref) {
    // Ohne CRM-Bezug: das E-Mail-Journal -- alle dokumentierten E-Mails des
    // Bueros, neueste zuerst (13.10.2026). Vorher stand hier nur ein Text,
    // der erklaerte, wo man E-Mails findet.
    const journal = await ladeJournal(supabase);
    if (!journal) throw new Response("E-Mail-Journal konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });
    return data({ context: null, activities: [], journal, profileMap: {}, canWrite: false, profile, nowLocal: berlinInputNow(), schreiben: null as SchreibDaten | null, meldung: { festgehalten: null, nachweis: null, status: null } as { festgehalten: string | null; nachweis: string | null; status: string | null } }, { headers: responseHeaders() });
  }

  const emailContext = await loadContext(supabase, ref);
  if (!emailContext) throw new Response("CRM-Bezug nicht gefunden oder nicht lesbar.", { status: 404, headers: responseHeaders() });

  let activityQuery = supabase
    .from("activity_events")
    .select("id,title,description,actor_user_id,occurred_at,metadata")
    .eq("activity_type", "EMAIL")
    .order("occurred_at", { ascending: false })
    .limit(100);
  activityQuery = ref.type === "CONTACT"
    ? activityQuery.eq("contact_id", ref.id)
    : ref.type === "LEAD"
      ? activityQuery.eq("lead_id", ref.id)
      : activityQuery.eq("inquiry_id", ref.id);

  const [{ data: activities, error: activityError }, { data: profiles, error: profileError }, { data: canWrite, error: permissionError }] = await Promise.all([
    activityQuery,
    supabase.from("profiles").select("user_id,display_name"),
    supabase.rpc("current_user_has_permission", { p_permission: permissionFor(ref.type) }),
  ]);
  if (activityError || profileError || permissionError) {
    throw new Response("E-Mail-Arbeitsbereich konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });
  }

  const profileMap = Object.fromEntries((profiles ?? []).map((item: any) => [item.user_id, item.display_name]));
  const schreiben = await ladeSchreibDaten(supabase, emailContext, profile.display_name);
  const url2 = new URL(request.url);
  const meldung = { festgehalten: url2.searchParams.get("festgehalten"), nachweis: url2.searchParams.get("nachweis"), status: url2.searchParams.get("status") };
  return data({ context: emailContext, activities: activities ?? [], journal: [] as JournalZeile[], profileMap, canWrite: canWrite === true, profile, nowLocal: berlinInputNow(), schreiben, meldung }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const absicht = text(formData, "_intent");
  if (absicht === "expose_link") return exposeLink(supabase, formData, request, responseHeaders);
  if (absicht === "expose_link_zurueckziehen") return exposeLinkZurueckziehen(supabase, formData, responseHeaders);
  if (absicht === "gesendet") return gesendetFesthalten(supabase, formData, userId, responseHeaders);
  if (absicht !== "log_email") {
    return data<ActionResult>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
  }

  const ref = resolveFormContext(formData);
  if (!ref) return data<ActionResult>({ error: "Ungültiger CRM-Bezug." }, { status: 400, headers: responseHeaders() });
  const emailContext = await loadContext(supabase, ref);
  if (!emailContext) return data<ActionResult>({ error: "CRM-Bezug nicht gefunden." }, { status: 404, headers: responseHeaders() });

  const { data: canWrite } = await supabase.rpc("current_user_has_permission", { p_permission: permissionFor(ref.type) });
  if (canWrite !== true) return data<ActionResult>({ error: "Keine Berechtigung, E-Mail-Aktivitäten für diesen Datensatz zu dokumentieren." }, { status: 403, headers: responseHeaders() });

  const direction = text(formData, "direction");
  if (direction !== "SENT" && direction !== "RECEIVED") {
    return data<ActionResult>({ error: "Bitte Gesendet oder Empfangen auswählen." }, { status: 400, headers: responseHeaders() });
  }
  const title = text(formData, "title");
  if (!title) return data<ActionResult>({ error: "Betreff bzw. Titel ist erforderlich." }, { status: 400, headers: responseHeaders() });
  const localOccurredAt = text(formData, "occurred_at");
  const occurredAt = localOccurredAt ? berlinLocalToIso(localOccurredAt) : new Date().toISOString();
  if (!occurredAt) return data<ActionResult>({ error: "Ungültiger E-Mail-Zeitpunkt." }, { status: 400, headers: responseHeaders() });

  const insert: Record<string, unknown> = {
    activity_type: "EMAIL",
    title,
    description: ohneZugangsschluessel(text(formData, "description")) || null,
    actor_user_id: userId,
    contact_id: emailContext.contactId,
    occurred_at: occurredAt,
    metadata: { channel: "EMAIL", direction, capture: "MANUAL" },
  };
  if (ref.type === "LEAD") insert.lead_id = ref.id;
  if (ref.type === "INQUIRY") insert.inquiry_id = ref.id;

  const { error } = await supabase.from("activity_events").insert(insert);
  if (error) return data<ActionResult>({ error: "E-Mail-Aktivität konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
  return redirect(`/crm/email${contextQuery(emailContext)}`, { headers: responseHeaders() });
}

/**
 * Kurzer Exposé-Link (A7, 19.10.2026), nur auf ausdrücklichen Klick erzeugt.
 *
 * Vorher stand hier eine signierte Speicheradresse mit eingebautem
 * Zugangsschlüssel, 14 Tage gültig und nicht zurückzuholen. Jetzt erzeugt der
 * Worker eine zufällige Kennung (128 Bit), die Datenbank bekommt nur deren
 * SHA-256, und der Link lautet <CRM-Adresse>/e/<Kennung>. Aufgelöst wird er von
 * app/routes/expose-kurzlink.ts über die Edge-Funktion expose-link;
 * zurückziehen geht jederzeit.
 */
async function exposeLink(supabase: any, formData: FormData, request: Request, responseHeaders: () => Headers) {
  const anfrageId = text(formData, "context_id");
  if (text(formData, "context_type") !== "INQUIRY" || !UUID_RE.test(anfrageId)) return data({ error: "Ein Exposé-Link geht nur aus einer Anfrage." }, { status: 400, headers: responseHeaders() });
  const exposeId = text(formData, "expose_id");
  if (!UUID_RE.test(exposeId)) return data({ error: "Kein zur Verwendung freigegebenes Exposé zu dieser Anfrage." }, { status: 404, headers: responseHeaders() });
  const roh = crypto.getRandomValues(new Uint8Array(16));
  const kennung = btoa(String.fromCharCode(...roh)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kennung))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data: zeilen, error } = await supabase.rpc("expose_link_anlegen", { p_inquiry_id: anfrageId, p_expose_id: exposeId, p_token_hash: hash });
  if (error) {
    const meldung = /PERMISSION/.test(error.message ?? "") ? "Keine Berechtigung, Exposé-Links zu erzeugen."
      : /NOT_RELEASED/.test(error.message ?? "") ? "Kein zur Verwendung freigegebenes Exposé zu dieser Anfrage."
      : "Der Link konnte nicht erzeugt werden.";
    return data({ error: meldung }, { status: 400, headers: responseHeaders() });
  }
  const zeile = Array.isArray(zeilen) ? zeilen[0] : zeilen;
  return data({ link: `${new URL(request.url).origin}/e/${kennung}`, linkId: zeile?.id as string, bis: zeile?.expires_at as string }, { headers: responseHeaders() });
}

async function exposeLinkZurueckziehen(supabase: any, formData: FormData, responseHeaders: () => Headers) {
  const id = text(formData, "link_id");
  if (!UUID_RE.test(id)) return data({ error: "Unbekannter Link." }, { status: 400, headers: responseHeaders() });
  const { data: ok, error } = await supabase.rpc("expose_link_zurueckziehen", { p_id: id });
  if (error) return data({ error: /PERMISSION/.test(error.message ?? "") ? "Keine Berechtigung, Exposé-Links zurückzuziehen." : "Der Link konnte nicht zurückgezogen werden." }, { status: 400, headers: responseHeaders() });
  return data({ zurueckgezogen: ok === true ? id : null }, { headers: responseHeaders() });
}

/**
 * Zugangsschlüssel gehören nicht in den Verlauf: ein Kurzlink oder eine
 * signierte Speicheradresse im festgehaltenen Text wird durch einen Hinweis
 * ersetzt. Der Link selbst steht in der Liste der ausgegebenen Links.
 */
function ohneZugangsschluessel(inhalt: string) {
  return inhalt
    .replace(/https?:\/\/[^\s<>"]+\/e\/[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])/g, "[Exposé-Link]")
    .replace(/https?:\/\/[^\s<>"]+\/storage\/v1\/object\/sign\/[^\s<>"]+/g, "[Exposé-Download-Link]");
}

/**
 * "Gesendet – festhalten": die E-Mail als Aktivität, beim Exposé der
 * Objektnachweis, auf Wunsch die Anfrage auf "Kontaktiert". Jeder Teil meldet
 * sich einzeln zurück -- ein fehlender Nachweis verschwindet nicht hinter
 * einer gespeicherten E-Mail.
 */
async function gesendetFesthalten(supabase: any, formData: FormData, userId: string, responseHeaders: () => Headers) {
  const ref = resolveFormContext(formData);
  if (!ref) return data<ActionResult>({ error: "Ungültiger CRM-Bezug." }, { status: 400, headers: responseHeaders() });
  const ctx = await loadContext(supabase, ref);
  if (!ctx) return data<ActionResult>({ error: "CRM-Bezug nicht gefunden." }, { status: 404, headers: responseHeaders() });
  const { data: darf } = await supabase.rpc("current_user_has_permission", { p_permission: permissionFor(ref.type) });
  if (darf !== true) return data<ActionResult>({ error: "Keine Berechtigung, E-Mail-Aktivitäten für diesen Datensatz zu dokumentieren." }, { status: 403, headers: responseHeaders() });

  const betreff = text(formData, "subject").slice(0, 300);
  if (!betreff) return data<ActionResult>({ error: "Bitte einen Betreff angeben – er steht danach im Verlauf." }, { status: 400, headers: responseHeaders() });
  const inhalt = ohneZugangsschluessel(String(formData.get("body") ?? "").trim()).slice(0, 20000);
  const vorlageId = text(formData, "template_id");
  const exposeId = text(formData, "expose_id");
  const exposeWeg = text(formData, "expose_weg");
  const mitExpose = ref.type === "INQUIRY" && UUID_RE.test(exposeId) && (exposeWeg === "PDF" || exposeWeg === "LINK");
  const expose = mitExpose ? await freigegebenesExpose(supabase, ref.id, exposeId) : null;

  const metadata: Record<string, unknown> = { channel: "EMAIL", direction: "SENT", capture: vorlageId ? "TEMPLATE" : "COMPOSE" };
  if (UUID_RE.test(vorlageId)) metadata.template_id = vorlageId;
  if (expose) { metadata.expose_id = expose.id; metadata.expose_weg = exposeWeg; }
  const linkId = text(formData, "expose_link_id");
  if (expose && exposeWeg === "LINK" && UUID_RE.test(linkId)) metadata.expose_link_id = linkId;
  const insert: Record<string, unknown> = {
    activity_type: "EMAIL", title: betreff, description: inhalt || null, actor_user_id: userId,
    contact_id: ctx.contactId, occurred_at: new Date().toISOString(), metadata,
  };
  if (ref.type === "LEAD") insert.lead_id = ref.id;
  if (ref.type === "INQUIRY") { insert.inquiry_id = ref.id; if (expose) insert.property_id = expose.property_id; }
  const { error } = await supabase.from("activity_events").insert(insert);
  if (error) return data<ActionResult>({ error: "Die E-Mail konnte nicht festgehalten werden. Es wurde nichts gespeichert." }, { status: 400, headers: responseHeaders() });

  let nachweis = "";
  if (mitExpose && !expose) nachweis = "fehlt";
  if (expose) {
    const { data: darfNachweis } = await supabase.rpc("current_user_has_permission", { p_permission: "disclosure.write" });
    if (darfNachweis !== true) nachweis = "keinrecht";
    else {
      const { error: nachweisFehler } = await supabase.from("property_disclosures").insert({
        property_id: expose.property_id, contact_id: ctx.contactId, inquiry_id: ref.id,
        expose_id: expose.id, publication_version_id: expose.publication_version_id,
        channel: "EXPOSE_EMAIL", channel_reference: `E-Mail: ${betreff}`.slice(0, 300),
        notes: exposeWeg === "LINK" ? `Exposé als Kurzlink (${LINK_GUELTIG_TAGE} Tage gültig, zurückziehbar)` : "Exposé als PDF-Anhang",
      });
      nachweis = nachweisFehler ? "fehler" : "ok";
    }
  }

  let status = "";
  if (ref.type === "INQUIRY" && text(formData, "kontaktiert") === "1") {
    const { data: geaendert, error: statusFehler } = await supabase.from("inquiries").update({ status: "CONTACTED" })
      .eq("id", ref.id).eq("status", "NEW").eq("version", Number(text(formData, "inquiry_version"))).select("id").maybeSingle();
    status = statusFehler || !geaendert ? "fehler" : "ok";
  }

  const p = new URLSearchParams({ festgehalten: "1" });
  if (nachweis) p.set("nachweis", nachweis);
  if (status) p.set("status", status);
  return redirect(`/crm/email${contextQuery(ctx)}&${p.toString()}`, { headers: responseHeaders() });
}

export default function EmailCompose() {
  const { context, activities, journal, profileMap, canWrite, profile, nowLocal, schreiben, meldung } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>() as ActionResult | undefined;

  if (!context) return <EmailJournal journal={journal} />;

  return <main className="communication-shell">
    <header className="communication-header">
      <div>
        <p className="eyebrow">Mein Tag · E-Mail</p>
        <h1>E-Mail</h1>
        <p>Externe E-Mail-Kommunikation wird am bestehenden CRM-Bezug dokumentiert. Ein automatischer Postfach-Sync ist auf BETA derzeit nicht konfiguriert.</p>
      </div>
      <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
    </header>

    {result?.error ? <div className="form-error">{result.error}</div> : null}

    <div className="communication-grid">
      <div className="communication-stack">
        <Aufklapper knopf="Integrationsstatus: Mail-Provider nicht verbunden"><section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Integrationsstatus</p><h2>Providerunabhängiger Arbeitsablauf</h2></div></div>
          <div className="communication-status">
            <div><span>Mail-Provider</span><strong>Nicht verbunden</strong></div>
            <div><span>Verfügbar</span><strong>Mailprogramm öffnen, danach hier festhalten</strong></div>
          </div>
          <p className="communication-note">Das Öffnen des Mailprogramms wird nicht automatisch als Versand gewertet. Nur tatsächlich gesendete oder empfangene E-Mails werden anschließend bewusst als Aktivität dokumentiert.</p>
        </section></Aufklapper>

        {context ? <>
          <section className="data-card">
            <div className="card-head"><div><p className="eyebrow">CRM-Bezug</p><h2>{context.sourceLabel} · {context.number}</h2></div><Link className="subtle-link" to={context.sourcePath}>Datensatz öffnen →</Link></div>
            <div className="communication-context-summary">
              <div><span>Kontakt</span><strong>{context.contactName}</strong></div>
              <div><span>E-Mail</span><strong>{context.email ?? "Nicht hinterlegt"}</strong></div>
            </div>
            {schreiben?.werbewiderspruch ? (
              <p className="form-warning" role="note">
                Werbewiderspruch seit {formatDate(schreiben.werbewiderspruch)}: Diese Person möchte keine Werbung erhalten. Ob diese Nachricht Werbung ist, entscheiden Sie.
              </p>
            ) : null}
            {!canWrite ? <div className="communication-actions">
              {context.email ? <a className="primary-button link-button" href={mailtoAdresse(context.email, "", "")}>E-Mail im Mailprogramm öffnen</a> : <span className="subtle">Keine E-Mail-Adresse vorhanden.</span>}
            </div> : null}
          </section>

          {meldung.festgehalten ? <Rueckmeldung nachweis={meldung.nachweis} status={meldung.status} /> : null}
          {canWrite && schreiben ? <EmailSchreiben kontext={{ type: context.type, id: context.id, email: context.email }} daten={schreiben} /> : null}

          <section className="data-card">
            <div className="card-head"><div><p className="eyebrow">Kommunikationshistorie</p><h2>E-Mail-Aktivitäten</h2></div><span className="subtle">letzte 100</span></div>
            <div className="communication-history">
              {activities.map((activity: any) => <article key={activity.id}>
                <div className="communication-history-head"><strong>{activity.title ?? "E-Mail"}</strong><small>{formatDate(activity.occurred_at)}</small></div>
                <span className="communication-direction">{directionLabel(activity.metadata)} · {activity.actor_user_id ? (profileMap[activity.actor_user_id] ?? "Benutzer") : "System"}</span>
                {activity.description ? <p>{activity.description}</p> : null}
              </article>)}
              {activities.length === 0 ? <p className="empty-state">Noch keine E-Mail-Aktivität für diesen CRM-Bezug dokumentiert.</p> : null}
            </div>
          </section>
        </> : null}
      </div>

      <aside className="communication-stack">
        {context && canWrite ? <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Aktivität festhalten</p><h2>E-Mail nachträglich erfassen</h2></div></div>
          <p className="communication-note">Für empfangene E-Mails oder solche, die nicht über „E-Mail schreiben“ entstanden sind.</p>
          <Form method="post" className="auth-form">
            <input type="hidden" name="_intent" value="log_email" />
            <input type="hidden" name="context_type" value={context.type} />
            <input type="hidden" name="context_id" value={context.id} />
            <label><span>Richtung *</span><select name="direction" defaultValue="SENT"><option value="SENT">Gesendet</option><option value="RECEIVED">Empfangen</option></select></label>
            <label><span>Zeitpunkt *</span><input type="datetime-local" name="occurred_at" defaultValue={nowLocal} required /></label>
            <label><span>Betreff / Titel *</span><input name="title" required placeholder="Betreff der E-Mail" /></label>
            <label><span>Interne Dokumentation</span><textarea name="description" rows={5} placeholder="Kurze Zusammenfassung, Zusagen oder nächster Schritt" /></label>
            <button className="secondary-button" type="submit">E-Mail festhalten</button>
          </Form>
        </section> : context ? <section className="data-card"><div className="card-head"><div><p className="eyebrow">Berechtigung</p><h2>Nur Lesen</h2></div></div><p className="communication-note">Du kannst die vorhandene Kommunikationshistorie lesen, aber für diesen CRM-Bezug keine neue Aktivität dokumentieren.</p></section> : null}

        {/* Die Karte "Kalender · CRM-Termine" stand hier bis 19.10.2026 -- fachfremd
            auf der E-Mail-Seite; der Kalender ist unter Mein Tag › Kalender. */}
      </aside>
    </div>
  </main>;
}

/** Was "Gesendet – festhalten" gespeichert hat, Teil für Teil. */
function Rueckmeldung({ nachweis, status }: { nachweis: string | null; status: string | null }) {
  const nachweisText: Record<string, [string, string]> = {
    ok: ["form-success", "Objektnachweis festgehalten (Weg: Exposé per E-Mail)."],
    keinrecht: ["form-warning", "Objektnachweis NICHT festgehalten: Ihnen fehlt das Recht dazu. Bitte jemanden mit Berechtigung bitten, ihn unter Objekt › Interessenten nachzutragen."],
    fehler: ["form-error", "Objektnachweis konnte NICHT gespeichert werden. Bitte unter Objekt › Interessenten nachtragen."],
    fehlt: ["form-error", "Objektnachweis NICHT festgehalten: Das gewählte Exposé ist nicht mehr zur Verwendung freigegeben."],
  };
  const statusText: Record<string, [string, string]> = {
    ok: ["form-success", "Anfrage steht jetzt auf „Kontaktiert“."],
    fehler: ["form-warning", "Der Status der Anfrage wurde nicht geändert (inzwischen anders bearbeitet). Bitte in der Anfrage prüfen."],
  };
  return <div className="email-rueckmeldung" role="status">
    <p className="form-success">E-Mail im Verlauf festgehalten.</p>
    {nachweis && nachweisText[nachweis] ? <p className={nachweisText[nachweis][0]}>{nachweisText[nachweis][1]}</p> : null}
    {status && statusText[status] ? <p className={statusText[status][0]}>{statusText[status][1]}</p> : null}
  </div>;
}

/** Der Reiter "E-Mail" ohne CRM-Bezug: Programmliste wie die Aufgaben. */
function EmailJournal({ journal }: { journal: JournalZeile[] }) {
  return <main className="editor-shell programm-liste">
    <div className="programm-liste-werkzeuge">
      <Aufklapper knopf="Mail-Provider nicht verbunden">
        <p className="programm-erklaerung">Ein automatischer Postfach-Abgleich ist nicht eingerichtet. Eine E-Mail wird im Mailprogramm geschrieben und danach über den Knopf „E-Mail“ oben in der Akte eines Kontakts, Verkäufer-Leads oder einer Anfrage dokumentiert.</p>
        <p className="programm-erklaerung">Das Öffnen des Mailprogramms wird nicht als Versand gewertet. Hier steht nur, was bewusst als gesendet oder empfangen erfasst wurde.</p>
      </Aufklapper>
      <span className="programm-liste-zaehler">{journal.length === 100 ? "die letzten 100 E-Mails" : `${journal.length} ${journal.length === 1 ? "E-Mail" : "E-Mails"}`}</span>
      <Link className="secondary-button link-button" to="/crm/contacts">Kontakte</Link>
    </div>
    <div className="programm-tabelle-rahmen">
      {journal.length === 0 ? <p className="programm-liste-leer">Noch keine E-Mail dokumentiert. Erfasst wird sie über den Knopf „E-Mail“ oben in der Akte eines <Link to="/crm/contacts">Kontakts</Link>, eines <Link to="/leads">Verkäufer-Leads</Link> oder einer <Link to="/inquiries">Anfrage</Link>.</p> : <table className="programm-tabelle">
        <thead><tr><th>Zeitpunkt</th><th>Betreff</th><th>Richtung</th><th>Kontakt</th><th>Bezug</th><th>Erfasst von</th></tr></thead>
        <tbody>{journal.map((zeile) => <tr key={zeile.id}>
          <td className="zahl">{formatDate(zeile.zeitpunkt)}</td>
          <td>{zeile.bezug ? <Link to={zeile.bezug.pfad}>{zeile.betreff}</Link> : <strong>{zeile.betreff}</strong>}{zeile.text ? <div className="leise">{zeile.text}</div> : null}</td>
          <td>{zeile.richtung}</td>
          <td>{zeile.kontakt ?? <span className="leise">—</span>}</td>
          <td>{zeile.bezug ? <Link to={zeile.bezug.pfad}>{zeile.bezug.art} {zeile.bezug.nummer}</Link> : <span className="leise">—</span>}</td>
          <td className="leise">{zeile.von}</td>
        </tr>)}</tbody>
      </table>}
    </div>
  </main>;
}
