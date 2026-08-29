import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/properties";
import { requirePermission } from "~/lib/auth.server";

const PAGE_SIZE = 50;

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

  const { data: properties, count, error } = await query;
  if (error) throw new Response("Immobilien konnten nicht geladen werden.", { status: 500 });

  const ids = (properties ?? []).map((item) => item.id);
  const { data: addresses, error: addressError } = ids.length
    ? await supabase.from("property_addresses").select("property_id, postal_code, city, district").in("property_id", ids)
    : { data: [], error: null };
  if (addressError) throw new Response("Objektadressen konnten nicht geladen werden.", { status: 500 });
  const addressMap = Object.fromEntries((addresses ?? []).map((address) => [address.property_id, address]));

  return data({
    properties: properties ?? [],
    addressMap,
    total: count ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
    filters: { status, transaction, propertyType },
    profile,
  }, { headers: responseHeaders() });
}

export default function Properties() {
  const { properties, addressMap, total, page, pageCount, filters, profile } = useLoaderData<typeof loader>();
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
            return <Link className="data-row data-row-link" key={property.id} to={`/properties/${property.id}`}>
              <div><strong>{property.internal_title}</strong><small>{property.property_number} · {TYPE_LABELS[property.property_type] ?? property.property_type} · {property.transaction_type === "SALE" ? "Verkauf" : "Vermietung"}</small></div>
              <div className="row-meta"><span>{property.transaction_type === "SALE" ? money(property.purchase_price) : money(property.rent_cold)}</span><small>{address ? `${address.postal_code} ${address.city}${address.district ? ` · ${address.district}` : ""}` : "Adresse offen"} · {property.status}</small></div>
            </Link>;
          })}
          {properties.length === 0 ? <p className="empty-state">Keine Immobilien in dieser Ansicht.</p> : null}
        </div>
        {pageCount > 1 ? <div className="pagination">{page > 1 ? <Link className="secondary-button link-button" to={`?status=${filters.status}&transaction=${filters.transaction}&type=${filters.propertyType}&page=${page - 1}`}>← Zurück</Link> : <span />}{page < pageCount ? <Link className="secondary-button link-button" to={`?status=${filters.status}&transaction=${filters.transaction}&type=${filters.propertyType}&page=${page + 1}`}>Weiter →</Link> : null}</div> : null}
      </section>
    </main>
  );
}
