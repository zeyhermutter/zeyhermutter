import { Link } from "react-router";
import { euroRund } from "~/lib/format";

// Eine Immobilie als Karte -- auf der Angebotsliste und auf der Startseite
// ("Aktuelle Immobilien"). Vorher stand sie nur in app/routes/public-properties.tsx;
// zwei Kopien waeren zwei Gelegenheiten, dass Preis oder Lage verschieden
// aussehen.

const TYPE_LABELS: Record<string, string> = { DETACHED_HOUSE: "Einfamilienhaus", SEMI_DETACHED_HOUSE: "Doppelhaushälfte", TERRACED_HOUSE: "Reihenhaus", APARTMENT_BUILDING: "Mehrfamilienhaus", APARTMENT: "Wohnung", PENTHOUSE: "Penthouse", MAISONETTE: "Maisonette", LAND: "Grundstück", COMMERCIAL: "Gewerbe", OFFICE: "Büro", RETAIL: "Einzelhandel", GARAGE: "Garage", PARKING_SPACE: "Stellplatz", OTHER: "Immobilie" };

// Ohne belastbaren Preis steht hier "Preis auf Anfrage". Number("") waere 0 und
// damit ein Preis von null Euro, den niemand hinterlegt hat.
function money(v: unknown) { return euroRund(v as number, "Preis auf Anfrage"); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mediaUrl(item: any) { return item?.id && item?.source_version ? `/immobilien/medien/${item.id}/${item.source_version}` : null; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function locationLabel(s: any) { const a = s.address ?? {}; return [a.postal_code, a.city, a.district].filter(Boolean).join(" · ") || "Lage auf Anfrage"; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ObjektKarte({ row }: { row: any }) {
  const s = row.snapshot ?? {}, media = s.media ?? [], main = media[0], image = mediaUrl(main);
  return (
    <Link className="public-property-card" to={`/immobilien/${row.public_slug}`}>
      {image
        ? <div className="public-property-image-wrap"><img className="public-property-image" src={image} alt={main.alt_text || main.title || row.public_title} /><span>{TYPE_LABELS[s.property_type] ?? "Immobilie"}</span></div>
        : <div className="public-property-placeholder"><span>{TYPE_LABELS[s.property_type] ?? "Immobilie"}</span></div>}
      <div className="public-property-card-body">
        <p className="public-eyebrow">{s.transaction_type === "RENT" ? "Zur Miete" : "Zum Kauf"} · {locationLabel(s)}</p>
        <h2>{row.public_title}</h2>
        <p>{row.teaser || s.location_description || "Weitere Informationen zum Objekt."}</p>
        <div className="public-property-facts">
          <strong>{money(s.price)}{s.transaction_type === "RENT" && s.price != null ? <small> kalt / Monat</small> : null}</strong>
          <span>{s.living_area_sqm ? `${Number(s.living_area_sqm)} m²` : s.plot_area_sqm ? `${Number(s.plot_area_sqm)} m² Grundstück` : ""}{s.rooms ? ` · ${Number(s.rooms)} Zimmer` : ""}</span>
        </div>
      </div>
    </Link>
  );
}
