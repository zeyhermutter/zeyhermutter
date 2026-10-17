import { data, Form, Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/properties";
import { requirePermission } from "~/lib/auth.server";
import { euroRund as money, tag } from "~/lib/format";
import { IMMOBILIENSTATUS } from "~/lib/labels";
import { Ampel, useNaechsteSchritte } from "~/components/ampel";
import "~/programm-liste.css";

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
  const { properties, addressMap, total, page, pageCount, filters } = useLoaderData<typeof loader>();
  const pageHref=(nextPage:number)=>{const p=new URLSearchParams({ansicht:"tabelle"});if(filters.q)p.set("q",filters.q);p.set("status",filters.status);if(filters.transaction)p.set("transaction",filters.transaction);if(filters.propertyType)p.set("type",filters.propertyType);p.set("page",String(nextPage));return `?${p.toString()}`;};
  const gefiltert = Boolean(filters.q || filters.transaction || filters.propertyType || filters.status !== "ACTIVE");

  // Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026):
  // Werkzeugleiste und Tabelle. Vorher Seitenkopf, Filterkasten und
  // Kartenzeilen mit drei Links je Objekt.
  return (
    <main className="editor-shell programm-liste">
      <Form method="get" className="programm-liste-werkzeuge" role="search">
        {/* Haelt die Tabelle fest, auch wenn alle Filter leer sind -- sonst oeffnete "/properties" die erste Akte. */}
        <input type="hidden" name="ansicht" value="tabelle"/>
        <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={filters.q} placeholder="Objektnummer oder Titel …" autoComplete="off"/></label>
        <label><span className="sr-only">Bestand</span><select name="status" defaultValue={filters.status}><option value="ACTIVE">Aktive Objekte</option><option value="ALL">Alle</option><option value="ARCHIVED">Archiv</option></select></label>
        <label><span className="sr-only">Vermarktungsart</span><select name="transaction" defaultValue={filters.transaction}><option value="">Verkauf und Vermietung</option><option value="SALE">Verkauf</option><option value="RENT">Vermietung</option></select></label>
        <label><span className="sr-only">Objektart</span><select name="type" defaultValue={filters.propertyType}><option value="">Alle Objektarten</option>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="secondary-button" type="submit">Filtern</button>
        <span className="programm-liste-zaehler">{total} {total === 1 ? "Objekt" : "Objekte"}</span>
        <Link className="programm-liste-neu" to="/properties/new">+ Neue Immobilie</Link>
      </Form>

      <div className="programm-tabelle-rahmen">
        {properties.length === 0 ? <p className="programm-liste-leer">{gefiltert ? "Keine Immobilie passt zu diesem Filter." : "Noch keine Immobilie erfasst."} <Link to="/properties/new">Immobilie anlegen</Link></p> : <table className="programm-tabelle">
          <thead><tr><th scope="col">Nummer</th><th scope="col">Objekt</th><th scope="col">Art</th><th scope="col">Ort</th><th scope="col" className="rechts">Preis</th><th scope="col">Status</th><th scope="col" className="rechts">Geändert</th></tr></thead>
          <tbody>{properties.map((property) => {
            const address = addressMap[property.id];
            return <tr key={property.id}>
              <td className="zahl"><Link to={`/properties/${property.id}`}>{property.property_number}</Link></td>
              <td><Link to={`/properties/${property.id}`}>{property.internal_title}</Link><div className="leise"><Link to={`/properties/${property.id}/documents`}>Dokumente</Link> · <Link to={`/properties/${property.id}/media`}>Medien</Link></div></td>
              <td>{TYPE_LABELS[property.property_type] ?? property.property_type}<div className="leise">{property.transaction_type === "SALE" ? "Verkauf" : "Vermietung"}</div></td>
              <td>{address ? <>{`${address.postal_code} ${address.city}`}{address.district ? <div className="leise">{address.district}</div> : null}</> : <span className="leise">Adresse offen</span>}</td>
              <td className="zahl rechts">{property.transaction_type === "SALE" ? money(property.purchase_price) : `${money(property.rent_cold)} kalt`}</td>
              <td><span className="ampel-neben">{STATUS_LABELS[property.status] ?? property.status}<Ampel s={schritte[property.id]} /></span></td>
              <td className="zahl rechts leise">{tag(property.updated_at)}</td>
            </tr>;
          })}</tbody>
        </table>}
      </div>

      {pageCount > 1 ? (
        <nav className="programm-liste-seiten" aria-label="Seiten">
          {page > 1 ? <Link to={pageHref(page - 1)}>← Zurück</Link> : <span />}
          <span>Seite {page} von {pageCount}</span>
          {page < pageCount ? <Link to={pageHref(page + 1)}>Weiter →</Link> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
