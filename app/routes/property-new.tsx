import { data, Form, Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/property-new";
import { requirePermission } from "~/lib/auth.server";

type ActionResult = { error?: string; fields?: Record<string, string> };

const TYPES = [
  ["DETACHED_HOUSE","Einfamilienhaus"],["SEMI_DETACHED_HOUSE","Doppelhaushälfte"],["TERRACED_HOUSE","Reihenhaus"],["APARTMENT_BUILDING","Mehrfamilienhaus"],["APARTMENT","Wohnung"],["PENTHOUSE","Penthouse"],["MAISONETTE","Maisonette"],["LAND","Grundstück"],["COMMERCIAL","Gewerbe"],["OFFICE","Büro"],["RETAIL","Einzelhandel"],["GARAGE","Garage"],["PARKING_SPACE","Stellplatz"],["OTHER","Sonstige"],
] as const;

function text(fd: FormData, key: string) { return String(fd.get(key) ?? "").trim(); }
function numeric(value: string) { return value === "" ? null : Number(value.replace(",", ".")); }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { responseHeaders } = await requirePermission(request, context.cloudflare.env, "property.write");
  return data({}, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "property.write");
  const fd = await request.formData();
  const fields = Object.fromEntries(Array.from(fd.entries()).map(([key,value]) => [key, String(value)]));
  const internalTitle = text(fd,"internal_title");
  const propertyType = text(fd,"property_type");
  const transactionType = text(fd,"transaction_type");
  if (!internalTitle || !propertyType || !transactionType) return data<ActionResult>({ error: "Titel, Immobilientyp und Transaktion sind Pflichtfelder.", fields }, { status: 400, headers: responseHeaders() });

  const street=text(fd,"street"), houseNumber=text(fd,"house_number"), postalCode=text(fd,"postal_code"), city=text(fd,"city");
  const addressValues=[street,houseNumber,postalCode,city];
  if (addressValues.some(Boolean) && !addressValues.every(Boolean)) return data<ActionResult>({ error: "Wenn eine Adresse erfasst wird, sind Straße, Hausnummer, PLZ und Ort erforderlich.", fields }, { status: 400, headers: responseHeaders() });

  const purchasePrice=numeric(text(fd,"purchase_price"));
  const rentCold=numeric(text(fd,"rent_cold"));
  const livingArea=numeric(text(fd,"living_area_sqm"));
  const rooms=numeric(text(fd,"rooms"));
  if ([purchasePrice,rentCold,livingArea,rooms].some((v) => v !== null && (!Number.isFinite(v) || v < 0))) return data<ActionResult>({ error: "Preis-, Flächen- und Zimmerwerte müssen gültige positive Zahlen sein.", fields }, { status: 400, headers: responseHeaders() });
  if (transactionType === "SALE" && purchasePrice === null) return data<ActionResult>({ error: "Für einen Verkaufsdatensatz ist zunächst ein Kaufpreis erforderlich.", fields }, { status: 400, headers: responseHeaders() });
  if (transactionType === "RENT" && rentCold === null) return data<ActionResult>({ error: "Für einen Vermietungsdatensatz ist zunächst die Kaltmiete erforderlich.", fields }, { status: 400, headers: responseHeaders() });

  const { data: propertyId, error } = await supabase.rpc("create_property_with_address", {
    p_internal_title: internalTitle,
    p_property_type: propertyType,
    p_transaction_type: transactionType,
    p_purchase_price: purchasePrice,
    p_rent_cold: rentCold,
    p_living_area_sqm: livingArea,
    p_rooms: rooms,
    p_street: street || null,
    p_house_number: houseNumber || null,
    p_postal_code: postalCode || null,
    p_city: city || null,
    p_district: text(fd,"district") || null,
    p_public_address_mode: text(fd,"public_address_mode") || "CITY_ONLY",
  });
  if (error || !propertyId) return data<ActionResult>({ error: "Immobilie konnte nicht angelegt werden. Bitte Eingaben prüfen.", fields }, { status: 400, headers: responseHeaders() });
  return redirect(`/properties/${propertyId}`, { headers: responseHeaders() });
}

export default function PropertyNew() {
  const result=useActionData<typeof action>();
  const f=result?.fields ?? {};
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to="/properties">← Immobilien</Link><p className="eyebrow">Modul 02 · Immobilien</p><h1 className="editor-title">Immobilie anlegen</h1></div><span className="badge">STAGING</span></header>
    <Form method="post" className="editor-card">
      {result?.error ? <div className="form-error">{result.error}</div> : null}
      <div className="form-grid">
        <label className="form-field"><span>Interner Objekttitel *</span><input name="internal_title" defaultValue={f.internal_title} required /></label>
        <label className="form-field"><span>Immobilientyp *</span><select name="property_type" defaultValue={f.property_type ?? "APARTMENT"}>{TYPES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="form-field"><span>Transaktion *</span><select name="transaction_type" defaultValue={f.transaction_type ?? "SALE"}><option value="SALE">Verkauf</option><option value="RENT">Vermietung</option></select></label>
        <label className="form-field"><span>Kaufpreis</span><input name="purchase_price" inputMode="decimal" defaultValue={f.purchase_price} placeholder="z. B. 875000" /></label>
        <label className="form-field"><span>Kaltmiete</span><input name="rent_cold" inputMode="decimal" defaultValue={f.rent_cold} /></label>
        <label className="form-field"><span>Wohnfläche m²</span><input name="living_area_sqm" inputMode="decimal" defaultValue={f.living_area_sqm} /></label>
        <label className="form-field"><span>Zimmer</span><input name="rooms" inputMode="decimal" defaultValue={f.rooms} /></label>
      </div>
      <div className="section-separator"><p className="eyebrow">Interne Objektadresse · optional im Entwurf</p></div>
      <div className="form-grid">
        <label className="form-field"><span>Straße</span><input name="street" defaultValue={f.street} /></label>
        <label className="form-field"><span>Hausnummer</span><input name="house_number" defaultValue={f.house_number} /></label>
        <label className="form-field"><span>PLZ</span><input name="postal_code" defaultValue={f.postal_code} /></label>
        <label className="form-field"><span>Ort</span><input name="city" defaultValue={f.city} /></label>
        <label className="form-field"><span>Ortsteil</span><input name="district" defaultValue={f.district} /></label>
        <label className="form-field"><span>Öffentliche Adressdarstellung</span><select name="public_address_mode" defaultValue={f.public_address_mode ?? "CITY_ONLY"}><option value="FULL">Vollständig</option><option value="STREET_ONLY">Nur Straße</option><option value="DISTRICT_ONLY">Nur Ortsteil</option><option value="CITY_ONLY">Nur Ort</option><option value="HIDDEN">Verbergen</option></select></label>
      </div>
      <div className="form-actions"><Link className="secondary-button link-button" to="/properties">Abbrechen</Link><button className="primary-button" type="submit">Immobilie anlegen</button></div>
    </Form>
  </main>;
}
