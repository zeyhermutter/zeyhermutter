import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/crm-archive";
import "~/programm-liste.css";
import { requireActiveUser } from "~/lib/auth.server";
import { AUFGABENPRIORITAET, AUFGABENSTATUS, KONTAKTSTATUS, beschrifte } from "~/lib/labels";
import { euroGenau, tag, zeitpunkt } from "~/lib/format";
import { seiteAus, seitenzahl, seiteZuWeit } from "~/lib/blaettern.server";
import { Seiten } from "~/components/seiten";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
type EntityType = "CONTACT" | "ORGANIZATION" | "TASK";
type ActionResult = { error?: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

// Archiv fuer alle Vorgangsarten (19.10.2026).
//
// Vorher kannte die Seite nur Kontakte, Organisationen und Aufgaben, je die
// 100 zuletzt geaenderten, ohne Link zum Datensatz. Ein archiviertes Objekt,
// eine Anfrage oder ein Abschluss war nur ueber die Suche mit Archiv zu
// finden. Jetzt stehen alle archivierbaren Arten hier, seitenweise, mit Link
// in die Akte. Archivieren und Wiederherstellen direkt in der Liste gibt es
// wie bisher fuer Kontakte, Organisationen und Aufgaben; die anderen Arten
// pruefen dabei fachliche Regeln und werden in ihrer Akte wiederhergestellt.
type Zeile = { id: string; reference: string; title: string; subtitle: string; statusLabel: string; version: number; archivedAt: string | null; pfad: string | null };
type Art = { name: string; tabelle: string; spalten: string; zeile: (r: any) => Omit<Zeile, "id" | "version" | "archivedAt">; aktion?: boolean };
const eins = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;
const person = (k: any) => (k ? [k.first_name, k.last_name].filter(Boolean).join(" ") : "");
const objekt = (o: any) => (o ? [o.property_number, o.internal_title].filter(Boolean).join(" · ") : "");
const ARTEN: Record<string, Art> = {
  CONTACT: { name: "Kontakte", tabelle: "contacts", spalten: "contact_number, first_name, last_name, email, mobile, status", aktion: true,
    zeile: (r) => ({ reference: r.contact_number, title: `${r.first_name} ${r.last_name}`, subtitle: r.email ?? r.mobile ?? "—", statusLabel: beschrifte(KONTAKTSTATUS, r.status), pfad: `/crm/contacts/${r.id}` }) },
  ORGANIZATION: { name: "Organisationen", tabelle: "organizations", spalten: "organization_number, name, legal_form, city, status", aktion: true,
    zeile: (r) => ({ reference: r.organization_number, title: r.name, subtitle: [r.legal_form, r.city].filter(Boolean).join(" · ") || "—", statusLabel: beschrifte(KONTAKTSTATUS, r.status), pfad: `/crm/organizations/${r.id}` }) },
  TASK: { name: "Aufgaben", tabelle: "tasks", spalten: "task_number, title, priority, status", aktion: true,
    zeile: (r) => ({ reference: r.task_number, title: r.title, subtitle: beschrifte(AUFGABENPRIORITAET, r.priority), statusLabel: beschrifte(AUFGABENSTATUS, r.status), pfad: null }) },
  PROPERTY: { name: "Objekte", tabelle: "properties", spalten: "property_number, internal_title",
    zeile: (r) => ({ reference: r.property_number, title: r.internal_title ?? "Objekt", subtitle: "", statusLabel: "", pfad: `/properties/${r.id}` }) },
  LEAD: { name: "Leads", tabelle: "leads", spalten: "lead_number, property_city, contacts(first_name, last_name)",
    zeile: (r) => ({ reference: r.lead_number, title: person(eins(r.contacts)) || "Lead", subtitle: r.property_city ?? "", statusLabel: "", pfad: `/leads/${r.id}` }) },
  INQUIRY: { name: "Anfragen", tabelle: "inquiries", spalten: "inquiry_number, contacts(first_name, last_name), properties(property_number, internal_title)",
    zeile: (r) => ({ reference: r.inquiry_number, title: person(eins(r.contacts)) || "Anfrage", subtitle: objekt(eins(r.properties)), statusLabel: "", pfad: `/inquiries/${r.id}` }) },
  SEARCH_PROFILE: { name: "Suchprofile", tabelle: "search_profiles", spalten: "search_profile_number, title, contacts(first_name, last_name)",
    zeile: (r) => ({ reference: r.search_profile_number, title: r.title ?? "Suchprofil", subtitle: person(eins(r.contacts)), statusLabel: "", pfad: `/search-profiles/${r.id}` }) },
  VIEWING: { name: "Besichtigungen", tabelle: "viewings", spalten: "viewing_number, starts_at, contacts(first_name, last_name), properties(property_number, internal_title)",
    zeile: (r) => ({ reference: r.viewing_number, title: `${zeitpunkt(r.starts_at)} · ${person(eins(r.contacts))}`, subtitle: objekt(eins(r.properties)), statusLabel: "", pfad: `/viewings/${r.id}` }) },
  OFFER: { name: "Kaufangebote", tabelle: "purchase_offers", spalten: "offer_number, amount, contacts(first_name, last_name), properties(property_number, internal_title)",
    zeile: (r) => ({ reference: r.offer_number, title: `${person(eins(r.contacts))} · ${euroGenau(r.amount)}`, subtitle: objekt(eins(r.properties)), statusLabel: "", pfad: `/purchase-offers/${r.id}` }) },
  RESERVATION: { name: "Reservierungen", tabelle: "property_reservations", spalten: "reservation_number, properties(property_number, internal_title)",
    zeile: (r) => ({ reference: r.reservation_number, title: objekt(eins(r.properties)) || "Reservierung", subtitle: "", statusLabel: "", pfad: `/reservations/${r.id}` }) },
  CLOSING: { name: "Abschlüsse", tabelle: "sale_closings", spalten: "closing_number, properties(property_number, internal_title)",
    zeile: (r) => ({ reference: r.closing_number, title: objekt(eins(r.properties)) || "Abschluss", subtitle: "", statusLabel: "", pfad: `/closings/${r.id}` }) },
  COMMISSION: { name: "Provisionen", tabelle: "commissions", spalten: "commission_number, properties(property_number, internal_title)",
    zeile: (r) => ({ reference: r.commission_number, title: objekt(eins(r.properties)) || "Provision", subtitle: "", statusLabel: "", pfad: `/commissions/${r.id}` }) },
  MANDATE: { name: "Makleraufträge", tabelle: "brokerage_mandates", spalten: "mandate_number, properties(property_number, internal_title)",
    zeile: (r) => ({ reference: r.mandate_number, title: objekt(eins(r.properties)) || "Maklerauftrag", subtitle: "", statusLabel: "", pfad: `/mandates/${r.id}` }) },
  PROJECT: { name: "Verkaufsprojekte", tabelle: "sale_projects", spalten: "project_number, properties(property_number, internal_title)",
    zeile: (r) => ({ reference: r.project_number, title: objekt(eins(r.properties)) || "Verkaufsprojekt", subtitle: "", statusLabel: "", pfad: `/projects/${r.id}` }) },
  MEASUREMENT: { name: "Aufmaß-Aufträge", tabelle: "measurement_orders", spalten: "order_number, object_city",
    zeile: (r) => ({ reference: r.order_number, title: "Aufmaß-Auftrag", subtitle: r.object_city ?? "", statusLabel: "", pfad: `/measurements/${r.id}` }) },
  CAMPAIGN: { name: "Kampagnen", tabelle: "acquisition_campaigns", spalten: "campaign_number, name",
    zeile: (r) => ({ reference: r.campaign_number, title: r.name ?? "Kampagne", subtitle: "", statusLabel: "", pfad: `/acquisition/${r.id}` }) },
  CASE_STUDY: { name: "Case Studies", tabelle: "sale_case_studies", spalten: "case_study_number, title",
    zeile: (r) => ({ reference: r.case_study_number, title: r.title ?? "Case Study", subtitle: "", statusLabel: "", pfad: `/case-studies/${r.id}` }) },
  REFERRAL: { name: "Empfehlungen", tabelle: "referrals", spalten: "referral_number",
    zeile: (r) => ({ reference: r.referral_number, title: "Empfehlung", subtitle: "", statusLabel: "", pfad: `/referrals/${r.id}` }) },
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const typParam = url.searchParams.get("type") ?? "CONTACT";
  const entityType = typParam in ARTEN ? typParam : "CONTACT";
  const art = ARTEN[entityType];
  // Nur wo hier archiviert werden kann, gibt es die Ansicht "Aktiv".
  const view = url.searchParams.get("view") === "archived" || !art.aktion ? "archived" : "active";
  const archived = view === "archived";
  const { page, from, to } = seiteAus(url);

  let query = supabase.from(art.tabelle).select(`id, version, archived_at, ${art.spalten}`, { count: "exact" })
    .order(archived ? "archived_at" : "updated_at", { ascending: false }).range(from, to);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data: rows, error, count } = await query;
  seiteZuWeit(error, url, responseHeaders());
  if (error) throw new Response(`${art.name} konnten nicht geladen werden.`, { status: 500, headers: responseHeaders() });
  const items: Zeile[] = ((rows ?? []) as any[]).map((r) => ({ id: r.id, version: r.version, archivedAt: r.archived_at ?? null, ...art.zeile(r) }));
  const arten = Object.entries(ARTEN).map(([wert, a]) => ({ wert, name: a.name, aktion: Boolean(a.aktion) }));

  return data({ entityType, view, items, total: count ?? 0, page, pageCount: seitenzahl(count), arten, aktion: Boolean(art.aktion), profile }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const entityType = text(formData, "entity_type") as EntityType;
  const entityId = text(formData, "entity_id");
  const version = Number(text(formData, "version"));
  const intent = text(formData, "_intent");
  const view = intent === "restore" ? "archived" : "active";

  if (!entityId || !Number.isInteger(version) || version < 1 || !["archive", "restore"].includes(intent)) {
    return data<ActionResult>({ error: "Ungültige Archivaktion." }, { status: 400, headers: responseHeaders() });
  }

  const archivedAt = intent === "archive" ? new Date().toISOString() : null;
  if (!["CONTACT", "ORGANIZATION", "TASK"].includes(entityType)) return data<ActionResult>({ error: "Diese Art wird in ihrer Akte archiviert und wiederhergestellt." }, { status: 400, headers: responseHeaders() });
  const table = entityType === "CONTACT" ? "contacts" : entityType === "ORGANIZATION" ? "organizations" : "tasks";

  if (entityType === "TASK" && intent === "archive") {
    const { data: task } = await supabase.from("tasks").select("status").eq("id", entityId).maybeSingle();
    if (!task || !["DONE", "CANCELLED"].includes(task.status)) {
      return data<ActionResult>({ error: "Nur erledigte oder abgebrochene Aufgaben können archiviert werden." }, { status: 400, headers: responseHeaders() });
    }
  }

  const { data: updated, error } = await supabase
    .from(table)
    .update({ archived_at: archivedAt })
    .eq("id", entityId)
    .eq("version", version)
    .select("id")
    .maybeSingle();

  if (error) {
    return data<ActionResult>({ error: "Archivaktion wurde abgelehnt oder konnte nicht gespeichert werden." }, { status: 403, headers: responseHeaders() });
  }
  if (!updated) {
    return data<ActionResult>({ error: "Datensatz wurde zwischenzeitlich geändert. Bitte Ansicht neu laden." }, { status: 409, headers: responseHeaders() });
  }

  return redirect(`/crm/archive?type=${entityType}&view=${view}`, { headers: responseHeaders() });
}

export default function CrmArchive() {
  const { entityType, view, items, total, page, pageCount, arten, aktion } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const isArchived = view === "archived";

  // Programmliste: Art als Auswahl, Ansicht als Umschalter (nur wo hier
  // archiviert wird), die Datensaetze als Tabelle mit Link in die Akte.
  return (
    <main className="editor-shell programm-liste"><ListenUeberschrift/>
      <Form method="get" className="programm-liste-werkzeuge">
        <label><span className="sr-only">Art</span><select name="type" defaultValue={entityType} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
          {arten.map((a) => <option key={a.wert} value={a.wert}>{a.name}</option>)}
        </select></label>
        <input type="hidden" name="view" value={view} />
        <noscript><button className="secondary-button" type="submit">Anzeigen</button></noscript>
        {aktion ? <nav className="programm-umfang" aria-label="Ansicht">
          <Link className={isArchived ? undefined : "aktiv"} to={`/crm/archive?type=${entityType}&view=active`}>Aktiv</Link>
          <Link className={isArchived ? "aktiv" : undefined} to={`/crm/archive?type=${entityType}&view=archived`}>Archiviert</Link>
        </nav> : <span className="leise">Archiviert – wiederherstellen in der Akte</span>}
        <span className="programm-liste-zaehler">{total} {total === 1 ? "Datensatz" : "Datensätze"}</span>
      </Form>

      {result?.error ? <div className="form-error" role="alert">{result.error}</div> : null}

      <div className="programm-tabelle-rahmen">
        {items.length === 0 ? <p className="programm-liste-leer">Keine Datensätze in dieser Ansicht.</p> : <table className="programm-tabelle">
          <thead><tr><th scope="col">Nummer</th><th scope="col">Bezeichnung</th><th scope="col">Details</th><th scope="col">{isArchived ? "Archiviert am" : "Stand"}</th><th scope="col" className="rechts"><span className="sr-only">Aktion</span></th></tr></thead>
          <tbody>{items.map((item) => (
            <tr key={item.id}>
              <td className="zahl">{item.pfad ? <Link to={item.pfad}>{item.reference}</Link> : item.reference}</td>
              <td>{item.pfad ? <Link to={item.pfad}><strong>{item.title}</strong></Link> : <strong>{item.title}</strong>}</td>
              <td className="leise">{item.subtitle || "—"}</td>
              <td>{isArchived ? tag(item.archivedAt) : item.statusLabel}</td>
              <td className="rechts">
                {aktion ? <Form method="post">
                  <input type="hidden" name="entity_type" value={entityType} />
                  <input type="hidden" name="entity_id" value={item.id} />
                  <input type="hidden" name="version" value={item.version} />
                  <button className="secondary-button compact" name="_intent" value={isArchived ? "restore" : "archive"} type="submit">{isArchived ? "Wiederherstellen" : "Archivieren"}</button>
                </Form> : item.pfad ? <Link className="secondary-button compact link-button" to={item.pfad}>Öffnen</Link> : null}
              </td>
            </tr>
          ))}</tbody>
        </table>}
      </div>
      <Seiten page={page} pageCount={pageCount} />
    </main>
  );
}
