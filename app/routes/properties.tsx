import { useState } from "react";
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

const WORKFLOW_ACTIONS: Record<string,string[]> = {
  DRAFT:["Objektstammdaten vervollständigen","Eigentümer und Objektadresse erfassen","Prüfen, ob die aktive Akquise gestartet werden kann"],
  ACQUISITION:["Eigentümerkontakt dokumentieren","Bedarf, Verkaufsabsicht und Rahmendaten klären","Bewertung vorbereiten und fehlende Unterlagen anfordern"],
  VALUATION:["Objektdaten und Lage prüfen","Marktwert bzw. Angebotspreis herleiten","Bewertung mit Eigentümer abstimmen"],
  CONTRACT_PENDING:["Maklerauftrag vorbereiten","Vertragsdaten und Parteien prüfen","Unterschrift bzw. Beauftragung nachhalten"],
  PREPARATION:["Dokumente vollständig einsammeln","Fotos, Grundrisse und Medien vorbereiten","Exposé- und Vermarktungsdaten finalisieren"],
  MARKETING:["Objekt veröffentlichen und Anfragen bearbeiten","Besichtigungen organisieren","Interessenten und Angebote dokumentieren"],
  RESERVED:["Reservierung und Interessent verbindlich nachhalten","Finanzierung bzw. Bonität prüfen","Notarvorbereitung anstoßen"],
  NOTARY:["Kaufvertragsentwurf abstimmen","Notartermin und offene Punkte koordinieren","Nach Beurkundung auf Verkauft setzen"],
  SOLD:["Abschlussunterlagen vervollständigen","Übergabe und Restpunkte dokumentieren","Vorgang anschließend archivieren"],
  LOST:["Verlustgrund dokumentieren","Wiedervorlage oder erneute Akquise bewerten","Bei neuer Chance zurück in Akquise wechseln"],
  WITHDRAWN:["Rückzugsgrund dokumentieren","Offene Aufgaben beenden oder terminieren","Bei Wiederaufnahme zurück in Akquise wechseln"],
  ARCHIVED:["Vorgang nur noch nachvollziehen und recherchieren","Historie und Unterlagen aufbewahren","Keine reguläre weitere Bearbeitung im Workflow"],
};

const MAIN_FLOW = ["DRAFT","ACQUISITION","VALUATION","CONTRACT_PENDING","PREPARATION","MARKETING","RESERVED","NOTARY","SOLD","ARCHIVED"] as const;
const SIDE_STATUSES = ["LOST","WITHDRAWN"] as const;
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

function statusClass(status:string){return `status-${status.toLowerCase().replaceAll("_","-")}`;}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "property.read");
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
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
  if (q) {
    const safeQ = q.replace(/[,%()]/g, " ").trim();
    if (safeQ) query = query.or(`property_number.ilike.%${safeQ}%,internal_title.ilike.%${safeQ}%`);
  }

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

  return data({ properties: properties ?? [], addressMap, transitions: transitions ?? [], total: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)), filters: { q, status, transaction, propertyType }, profile }, { headers: responseHeaders() });
}

export default function Properties() {
  const { properties, addressMap, transitions, total, page, pageCount, filters, profile } = useLoaderData<typeof loader>();
  const [selectedStatus,setSelectedStatus]=useState<string>("DRAFT");
  const transitionsByStatus = Object.fromEntries(Object.keys(STATUS_LABELS).map((status) => [status, transitions.filter((transition) => transition.from_status === status)]));
  const allowedTransitions=transitionsByStatus[selectedStatus]??[];
  const preferred=PREFERRED_NEXT[selectedStatus];
  const pageHref=(nextPage:number)=>{const p=new URLSearchParams();if(filters.q)p.set("q",filters.q);p.set("status",filters.status);if(filters.transaction)p.set("transaction",filters.transaction);if(filters.propertyType)p.set("type",filters.propertyType);p.set("page",String(nextPage));return `?${p.toString()}`;};

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to="/crm">← ZeyherMutterOS</Link><p className="eyebrow">Modul 02 · Immobilien</p><h1 className="editor-title">Immobilien</h1></div>
        <div className="header-actions"><span className="badge">{total} Objekte</span><Link className="primary-button link-button" to="/properties/new">+ Immobilie</Link><small>{profile.display_name}</small></div>
      </header>

      <section className="data-card property-section">
        <Form method="get" className="filter-grid property-filter-grid">
          <label><span>Suche</span><input name="q" defaultValue={filters.q} placeholder="Objektnummer oder Titel"/></label>
          <label><span>Status</span><select name="status" defaultValue={filters.status}><option value="ACTIVE">Aktive</option><option value="ALL">Alle</option><option value="ARCHIVED">Archiv</option></select></label>
          <label><span>Transaktion</span><select name="transaction" defaultValue={filters.transaction}><option value="">Alle</option><option value="SALE">Verkauf</option><option value="RENT">Vermietung</option></select></label>
          <label><span>Typ</span><select name="type" defaultValue={filters.propertyType}><option value="">Alle</option>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <button className="secondary-button" type="submit">Filtern</button>
        </Form>
      </section>

      <section className="data-card property-section">
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
        {pageCount > 1 ? <div className="pagination">{page > 1 ? <Link className="secondary-button link-button" to={pageHref(page - 1)}>← Zurück</Link> : <span />}{page < pageCount ? <Link className="secondary-button link-button" to={pageHref(page + 1)}>Weiter →</Link> : null}</div> : null}
      </section>

      <section className="data-card property-workflow-section" id="status-workflow">
        <div className="property-workflow-heading">
          <div><p className="eyebrow">Interaktiver Status & Workflow</p><h2>Was kann ich in welchem Stand machen?</h2><p>Klicke auf einen Status. Darunter erscheinen die typischen Aufgaben, der empfohlene nächste Schritt und alle Statuswechsel, die die echte PostgreSQL-Statusmaschine aktuell erlaubt.</p></div>
          <span className="workflow-rule-badge">Live aus Statusmaschine</span>
        </div>

        <div className="workflow-main-path" aria-label="Regulärer Immobilien-Workflow">
          {MAIN_FLOW.map((status, index) => <div className="workflow-main-step-wrap" key={status}>
            <button type="button" aria-pressed={selectedStatus===status} onClick={()=>setSelectedStatus(status)} className={`workflow-main-step workflow-status-button ${statusClass(status)}${selectedStatus===status?" selected":""}`}>
              <span>{index + 1}</span><strong>{STATUS_LABELS[status]}</strong>
            </button>
            {index < MAIN_FLOW.length - 1 ? <span className="workflow-arrow" aria-hidden="true">→</span> : null}
          </div>)}
        </div>

        <div className="workflow-side-statuses" aria-label="Alternative Status">
          <span>Alternative Verläufe:</span>
          {SIDE_STATUSES.map(status=><button type="button" key={status} aria-pressed={selectedStatus===status} onClick={()=>setSelectedStatus(status)} className={`workflow-side-button ${statusClass(status)}${selectedStatus===status?" selected":""}`}>{STATUS_LABELS[status]}</button>)}
        </div>

        <div className="workflow-inspector" aria-live="polite">
          <div className="workflow-inspector-head">
            <div><p className="eyebrow">Ausgewählter Stand</p><h3>{STATUS_LABELS[selectedStatus]}</h3><p>{STATUS_EXPLANATIONS[selectedStatus]}</p></div>
            <span className={`status-pill ${statusClass(selectedStatus)}`}>{STATUS_LABELS[selectedStatus]}</span>
          </div>

          <div className="workflow-inspector-grid">
            <div className="workflow-action-panel">
              <h4>Was jetzt gemacht werden kann</h4>
              <ol>{(WORKFLOW_ACTIONS[selectedStatus]??[]).map(action=><li key={action}>{action}</li>)}</ol>
            </div>

            <div className="workflow-transition-panel">
              <h4>Nächste Statusmöglichkeiten</h4>
              {preferred?<div className="workflow-recommended"><small>Empfohlener nächster Schritt</small><strong>→ {STATUS_LABELS[preferred]}</strong></div>:<div className="workflow-recommended terminal"><small>Workflow</small><strong>Endstatus</strong></div>}
              <div className="workflow-transition-list interactive">
                {allowedTransitions.length?allowedTransitions.map((transition)=><button type="button" onClick={()=>setSelectedStatus(transition.to_status)} className={transition.to_status===preferred?"workflow-transition preferred":"workflow-transition"} key={`${transition.from_status}-${transition.to_status}`}>
                  <span>→ {STATUS_LABELS[transition.to_status]??transition.to_status}</span><small>{transition.description}</small>
                </button>):<div className="workflow-transition terminal"><span>Keine weiteren Wechsel</span><small>Statusmaschine beendet den Vorgang hier.</small></div>}
              </div>
            </div>
          </div>
        </div>

        <p className="workflow-footnote">Die Aufgaben sind eine Arbeitsorientierung. Die angezeigten Statuswechsel werden dagegen direkt aus den tatsächlich hinterlegten Übergängen geladen; nicht aufgeführte Wechsel werden serverseitig blockiert.</p>
      </section>
    </main>
  );
}
