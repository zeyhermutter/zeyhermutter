import { data, Form, Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/properties";
import { requirePermission } from "~/lib/auth.server";
import { euroRund as money } from "~/lib/format";
import { IMMOBILIENSTATUS } from "~/lib/labels";
import { Ampel, useNaechsteSchritte } from "~/components/ampel";
import "~/properties-workflow.css";

const PAGE_SIZE = 50;

// Die Beschriftungen stehen einmal in labels.ts (14.10.2026).
export const STATUS_LABELS = IMMOBILIENSTATUS;

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


export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "property.read");
  const url = new URL(request.url);

  // "Objekte" oeffnet den Arbeitsplatz mit der zuletzt bearbeiteten Akte --
  // derselbe Datensatz, der in der Liste links oben steht. So wie bei den
  // Kontakten (12.10.2026). Die Tabelle mit allen Filtern bleibt als
  // "Volle Liste" (?ansicht=tabelle) und fuer jede gefilterte Ansicht.
  const gefiltert = ["ansicht", "q", "status", "transaction", "type", "page"].some((k) => url.searchParams.has(k));
  if (!gefiltert) {
    const { data: erste } = await supabase.from("properties").select("id").neq("status", "ARCHIVED")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (erste) throw redirect(`/properties/${erste.id}`, { headers: responseHeaders() });
  }

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

  const { data: properties, count, error } = await query;
  if (error) throw new Response("Immobilien konnten nicht geladen werden.", { status: 500 });

  const ids = (properties ?? []).map((item) => item.id);
  const { data: addresses, error: addressError } = ids.length
    ? await supabase.from("property_addresses").select("property_id, postal_code, city, district").in("property_id", ids)
    : { data: [], error: null };
  if (addressError) throw new Response("Objektadressen konnten nicht geladen werden.", { status: 500 });
  const addressMap = Object.fromEntries((addresses ?? []).map((address) => [address.property_id, address]));

  return data({ properties: properties ?? [], addressMap, total: count ?? 0, page, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)), filters: { q, status, transaction, propertyType }, profile }, { headers: responseHeaders() });
}

export default function Properties() {
  const schritte = useNaechsteSchritte("property");
  const { properties, addressMap, total, page, pageCount, filters, profile } = useLoaderData<typeof loader>();
  const pageHref=(nextPage:number)=>{const p=new URLSearchParams({ansicht:"tabelle"});if(filters.q)p.set("q",filters.q);p.set("status",filters.status);if(filters.transaction)p.set("transaction",filters.transaction);if(filters.propertyType)p.set("type",filters.propertyType);p.set("page",String(nextPage));return `?${p.toString()}`;};

  return (
    <main className="editor-shell programm-seite">
      <header className="editor-header">
        <div><Link className="back-link" to="/crm">← ZeyherMutterOS</Link><h1 className="editor-title">Immobilien</h1></div>
        <div className="header-actions"><span className="badge">{total} Objekte</span><Link className="primary-button link-button" to="/properties/new">+ Immobilie</Link><small>{profile.display_name}</small></div>
      </header>

      <section className="data-card property-section">
        <Form method="get" className="filter-grid property-filter-grid">
          {/* Haelt die Tabelle fest, auch wenn alle Filter leer sind -- sonst oeffnete "/properties" die erste Akte. */}
          <input type="hidden" name="ansicht" value="tabelle"/>
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
              <div className="row-meta"><span>{property.transaction_type === "SALE" ? money(property.purchase_price) : `${money(property.rent_cold)} kalt`}</span><small>{address ? `${address.postal_code} ${address.city}${address.district ? ` · ${address.district}` : ""}` : "Adresse offen"} · {STATUS_LABELS[property.status] ?? property.status}</small><Ampel s={schritte[property.id]} /></div>
            </div>;
          })}
          {properties.length === 0 ? <p className="empty-state">Keine Immobilien in dieser Ansicht.</p> : null}
        </div>
        {pageCount > 1 ? <div className="pagination">{page > 1 ? <Link className="secondary-button link-button" to={pageHref(page - 1)}>← Zurück</Link> : <span />}{page < pageCount ? <Link className="secondary-button link-button" to={pageHref(page + 1)}>Weiter →</Link> : null}</div> : null}
      </section>
    </main>
  );
}
