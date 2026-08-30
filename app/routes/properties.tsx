import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/properties";
import { requirePermission } from "~/lib/auth.server";
import "~/properties-workflow.css";

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<string,string> = {
  DRAFT:"Entwurf", ACQUISITION:"Akquise", VALUATION:"Bewertung", CONTRACT_PENDING:"Vertrag in Vorbereitung",
  PREPARATION:"Vorbereitung", MARKETING:"Vermarktung", RESERVED:"Reserviert", NOTARY:"Notar",
  SOLD:"Verkauft", LOST:"Verloren", WITHDRAWN:"Zurückgezogen", ARCHIVED:"Archiviert",
};

const STATUS_EXPLANATIONS: Record<string,string> = {
  DRAFT:"Objekt ist angelegt, aber die aktive Akquise hat noch nicht begonnen.",
  ACQUISITION:"Eigentümerkontakt und Akquise laufen.",
  VALUATION:"Immobilie und realistischer Marktwert werden bewertet.",
  CONTRACT_PENDING:"Maklervertrag bzw. Beauftragung wird vorbereitet oder abgestimmt.",
  PREPARATION:"Unterlagen, Daten, Medien und Vermarktung werden vorbereitet.",
  MARKETING:"Objekt befindet sich aktiv in der Vermarktung.",
  RESERVED:"Objekt ist für einen Interessenten reserviert.",
  NOTARY:"Kaufvertrags- und Notarprozess läuft. Regulärer nächster Schritt: Verkauft.",
  SOLD:"Verkauf ist abgeschlossen. Danach kann das Objekt archiviert werden.",
  LOST:"Vorgang wurde verloren. Eine erneute Akquise ist möglich.",
  WITHDRAWN:"Objekt wurde zurückgezogen. Der Vorgang kann wieder in die Akquise gehen.",
  ARCHIVED:"Abschlussstatus. In der aktuellen Statusmaschine ist kein weiterer Statuswechsel freigegeben.",
};

const MAIN_FLOW = ["DRAFT","ACQUISITION","VALUATION","CONTRACT_PENDING","PREPARATION","MARKETING","RESERVED","NOTARY","SOLD","ARCHIVED"] as const;
const PREFERRED_NEXT: Record<string,string> = {
  DRAFT:"ACQUISITION", ACQUISITION:"VALUATION", VALUATION:"CONTRACT_PENDING", CONTRACT_PENDING:"PREPARATION",
  PREPARATION:"MARKETING", MARKETING:"RESERVED", RESERVED:"NOTARY", NOTARY:"SOLD", SOLD:"ARCHIVED",
  LOST:"ACQUISITION", WITHDRAWN:"ACQUISITION",
};

const TYPE_LABELS: Record<string, string> = {
  DETACHED_HOUSE: "Einfamilienhaus",
  SEMI_DETACHED_HOUSE: "Doppelhaushälfte",
  TERRACED_HOUSE: "Reihenhaus",
  APARTMENT_BUILDING: "Mehrfamilienhaus",
  APARTMENT: "Wohnung",
  PENTHOUSE: "Penthouse",
  MAISONETTE: "Maisonette",
  LAND: "Grundstück",
  COMMERCIAL: "Gewerbe",
  OFFICE: "Büro",
  RETAIL: "Einzelhandel",
  GARAGE: "Garage",
  PARKING_SPACE: "Stellplatz",
  OTHER: "Sonstige",
};

function money(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "property.read");
  const url = new URL(request.url);
  const status = (url.searchParams.get("status") ?? "ACTIVE").trim();
  const transaction = (url.searchParams.get("transaction") ?? "").trim();
  const propertyType = (url.searchParams.get("type") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("properties")
    .select("id, property_number, internal_title, property_type, transaction_type, status, purchase_price, rent_cold, living_area_sqm, updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (status === "ARCHIVED") query = query.eq("status", "ARCHIVED");
  else if (status !== "ALL") query = query.neq("status", "ARCHIVED");
  if (transaction) query = query.eq("transaction_type", transaction);
  if (propertyType) query = query.eq("property_type", propertyType);

  const [{ data: properties, count, error }, { data: transitions, error: transitionError }] = await Promise.all([
    query,
    supabase.from("property_status_transitions").select("from_status,to_status,description").order("from_status").order("to_status"),
  ]);
  if (error) throw new Response("Immobilien konnten nicht geladen werden.", { status: 500 });
  if (transitionError) throw new Response("Status-Workflow konnte nicht geladen werden.", { status: 500 });

  const ids = (properties ?? []).map((item) => item.id);
  const { data: addresses, error: addressError } = ids.length
    ? await supabase.from("property_addresses").select("property_id, postal_code, city, district").in("property_id", ids)
    : { data: [], error: null };
  if (addressError) throw new Response("Objektadressen konnten nicht geladen werden.", { status: 500 });
  const addressMap = Object.fromEntries((addresses ?? []).map((address) => [address.property_id, address]));

  return data({ properties: properties ?? [], addressMap, transitions: transitions ?? [], total: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)), filters: { status, transaction, propertyType }, profile }, { headers: responseHeaders() });
}

export default function Properties() {
  const { properties, addressMap, transitions, total, page, pageCount, filters, profile } = useLoaderData<typeof loader>();
  const transitionsByStatus = Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [status, transitions.filter((transition) => transition.from_status === status)]));
  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to="/crm">← ZeyherMutterOS</Link><p className="eyebrow">Modul 02 · Immobilien</p><h1 className="editor-title">Immobilien</h1></div>
        <div className="header-actions"><span className="badge">{total} Objekte</span><Link className="primary-button link-button" to="/properties/new">+ Immobilie</Link><small>{profile.display_name}</small></div>
      </header>

      <section className="data-card">
        <Form method="get" className="filter-grid">
          <label><span>Status</span><select name="status" defaultValue={filters.status}><option value="ACTIVE">Aktive</option><option value="ALL">Alle</option><option value="ARCHIVED">Archiv</option></select></label>
          <label><span>Transaktion</span><select name="transaction" defaultValue={filters.transaction}><option value="">Alle</option><option value="SALE">Verkauf</option><option value="RENT">Vermietung</option></select></label>
          <label><span>Typ</span><select name="type" defaultValue={filters.propertyType}><option value="">Alle</option>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <button className="secondary-button" type="submit">Filtern</button>
        </Form>
      </section>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Objektbestand</p><h2>Verzeichnis</h2></div><span className="subtle">Seite {page} / {pageCount}</span></div>
        <div className="data-list">
          {properties.map((property) => {
            const address = addressMap[property.id];
            return <div className="data-row" key={property.id}>
              <div><Link className="data-title-link" to={`/properties/${property.id}`}><strong>{property.internal_title}</strong></Link><small>{property.property_number} · {TYPE_LABELS[property.property_type] ?? property.property_type} · {property.transaction_type === "SALE" ? "Verkauf" : "Vermietung"}</small><div className="row-links"><Link className="subtle-link" to={`/properties/${property.id}`}>Objektakte</Link><Link className="subtle-link" to={`/properties/${property.id}/documents`}>Dokumente</Link><Link className="subtle-link" to={`/properties/${property.id}/media`}>Medien</Link></div></div>
              <div className="row-meta"><span>{property.transaction_type === "SALE" ? money(property.purchase_price) : money(property.rent_cold)}</span><small>{address ? `${address.postal_code} ${address.city}${address.district ? ` · ${address.district}` : ""}` : "Adresse offen"} · {STATUS_LABELS[property.status] ?? property.status}</small></div>
            </div>;
          })}
          {properties.length === 0 ? <p className="empty-state">Keine Immobilien in dieser Ansicht.</p> : null}
        </div>
        {pageCount > 1 ? <div className="pagination">{page > 1 ? <Link className="secondary-button link-button" to={`?status=${filters.status}&transaction=${filters.transaction}&type=${filters.propertyType}&page=${page - 1}`}>← Zurück</Link> : <span />}{page < pageCount ? <Link className="secondary-button link-button" to={`?status=${filters.status}&transaction=${filters.transaction}&type=${filters.propertyType}&page=${page + 1}`}>Weiter →</Link> : null}</div> : null}
      </section>

      <section className="data-card property-workflow-section" id="status-workflow">
        <div className="property-workflow-heading">
          <div><p className="eyebrow">Status & Workflow</p><h2>So läuft eine Immobilie durch ZeyherMutterOS</h2><p>Der obere Pfad zeigt den regulären Verkaufsprozess. Darunter siehst du für jeden Status den empfohlenen nächsten Schritt und alle weiteren technisch erlaubten Wechsel.</p></div>
          <span className="workflow-rule-badge">PostgreSQL-Statusmaschine</span>
        </div>

        <div className="workflow-main-path" aria-label="Regulärer Immobilien-Workflow">
          {MAIN_FLOW.map((status, index) => <div className="workflow-main-step-wrap" key={status}>
            <div className={`workflow-main-step status-${status.toLowerCase().replaceAll("_","-")}`}>
              <span>{index + 1}</span><strong>{STATUS_LABELS[status]}</strong>
            </div>
            {index < MAIN_FLOW.length - 1 ? <span className="workflow-arrow" aria-hidden="true">→</span> : null}
          </div>)}
        </div>

        <div className="workflow-callouts">
          <div className="workflow-callout workflow-callout-primary"><strong>Notar erreicht?</strong><span>Regulärer nächster Schritt ist <b>Verkauft</b>. Falls der Notarprozess scheitert, sind auch Rückkehr oder Abbruch möglich.</span></div>
          <div className="workflow-callout"><strong>Verkauft?</strong><span>Danach kann das Objekt in <b>Archiviert</b> überführt werden.</span></div>
          <div className="workflow-callout"><strong>Archiviert?</strong><span>Das ist aktuell ein <b>Endstatus</b>. Von dort ist kein weiterer Statuswechsel freigegeben.</span></div>
        </div>

        <div className="workflow-status-grid">
          {Object.keys(STATUS_LABELS).map((status) => {
            const allowed = transitionsByStatus[status] ?? [];
            const preferred = PREFERRED_NEXT[status];
            return <article className={`workflow-status-card status-${status.toLowerCase().replaceAll("_","-")}`} key={status}>
              <div className="workflow-status-card-head"><strong>{STATUS_LABELS[status]}</strong>{preferred ? <span>Empfohlen: {STATUS_LABELS[preferred]}</span> : <span>Endstatus</span>}</div>
              <p>{STATUS_EXPLANATIONS[status]}</p>
              <div className="workflow-transition-list">
                {allowed.length ? allowed.map((transition) => <div className={transition.to_status === preferred ? "workflow-transition preferred" : "workflow-transition"} key={`${transition.from_status}-${transition.to_status}`}>
                  <span>→ {STATUS_LABELS[transition.to_status] ?? transition.to_status}</span><small>{transition.description}</small>
                </div>) : <div className="workflow-transition terminal"><span>Keine weiteren Wechsel</span><small>Statusmaschine beendet den Vorgang hier.</small></div>}
              </div>
            </article>;
          })}
        </div>
        <p className="workflow-footnote">Hinweis: Diese Übersicht wird aus den tatsächlich hinterlegten Statusübergängen geladen. Nicht aufgeführte Wechsel werden serverseitig blockiert.</p>
      </section>
    </main>
  );
}
