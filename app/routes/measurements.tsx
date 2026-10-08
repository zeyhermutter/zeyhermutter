import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/measurements";
import { requirePermission } from "~/lib/auth.server";
import { euroRund, flaeche, tag as formatDate, zeitpunkt } from "~/lib/format";
import { AUFMASSPAKET as PAKET, AUFMASSSTATUS as STATUS, AUFTRAGSQUELLE as QUELLE } from "~/lib/labels";

// Aufmass-Auftraege: die Liste der Dienstleistung neben der Vermittlung.
//
// Die Kennzahlen oben sind die vier Fragen eines Arbeitstages: Was ist neu
// hereingekommen, was ist beauftragt und wartet auf einen Termin, was ist
// aufgemessen und noch nicht geliefert, und was ist geliefert und noch nicht
// bezahlt. Eine fuenfte Kachel haette keine davon beantwortet.

const STATUS_CLASS: Record<string,string> = {DRAFT:"status-draft",REQUESTED:"status-open",OFFERED:"status-valuation",ACCEPTED:"status-marketing",SCHEDULED:"status-preparation",MEASURED:"status-notary",DELIVERED:"status-ready",INVOICED:"status-reserved",PAID:"status-sold",CANCELLED:"status-archived"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function heute(){return new Date().toISOString().slice(0,10);}

/** Was aufgemessen wird: die eigene Objektakte, sonst die Anschrift am Auftrag. */
export function objektZeile(row:any){
  const property=one(row.properties);
  if(property)return `${property.property_number} · ${property.internal_title}`;
  const ort=[row.object_postal_code,row.object_city].filter(Boolean).join(" ");
  const strasse=[row.object_street,row.object_house_number].filter(Boolean).join(" ");
  return [strasse,ort].filter(Boolean).join(", ")||"Objekt noch offen";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"measurement.read");
  const url=new URL(request.url);
  const filters={q:(url.searchParams.get("q")??"").trim(),status:url.searchParams.get("status")??"OPEN",paket:url.searchParams.get("paket")??"",propertyId:url.searchParams.get("property_id")??""};
  const [{data:rows,error},{data:canWrite},{data:properties}]=await Promise.all([
    supabase.from("measurement_orders").select("id,order_number,service_package,status,source,property_id,contact_id,object_street,object_house_number,object_postal_code,object_city,property_type,approx_area_sqm,requested_on,appointment_at,measured_on,delivered_on,area_standard,measured_living_area_sqm,fee_amount,invoiced_on,paid_on,archived_at,updated_at,properties(id,property_number,internal_title),contacts(id,contact_number,first_name,last_name)").order("updated_at",{ascending:false}).limit(400),
    supabase.rpc("current_user_has_permission",{p_permission:"measurement.write"}),
    supabase.from("properties").select("id,property_number,internal_title").order("updated_at",{ascending:false}).limit(500),
  ]);
  if(error)throw new Response("Aufmaß-Aufträge konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const all=(rows??[]) as any[];
  const aktiv=all.filter((row)=>!row.archived_at);
  const inSiebenTagen=new Date(Date.now()+7*864e5).toISOString();
  const summary={
    angefragt:aktiv.filter((row)=>["REQUESTED","OFFERED"].includes(row.status)).length,
    beauftragt:aktiv.filter((row)=>["ACCEPTED","SCHEDULED"].includes(row.status)).length,
    termin:aktiv.filter((row)=>row.appointment_at&&row.appointment_at>=new Date().toISOString()&&row.appointment_at<=inSiebenTagen).length,
    auszuliefern:aktiv.filter((row)=>row.status==="MEASURED").length,
    offenesHonorar:aktiv.filter((row)=>["DELIVERED","INVOICED"].includes(row.status)).reduce((summe,row)=>summe+Number(row.fee_amount??0),0),
  };
  const needle=filters.q.toLocaleLowerCase("de-DE");
  const gefiltert=all.filter((row)=>{
    if(filters.propertyId&&row.property_id!==filters.propertyId)return false;
    if(filters.paket&&row.service_package!==filters.paket)return false;
    if(filters.status==="OPEN"&&(row.archived_at||["PAID","CANCELLED"].includes(row.status)))return false;
    if(filters.status==="DUE"&&!(["DELIVERED","INVOICED"].includes(row.status)&&!row.archived_at))return false;
    if(filters.status==="ARCHIVED"&&!row.archived_at)return false;
    if(!["OPEN","ALL","ARCHIVED","DUE"].includes(filters.status)&&row.status!==filters.status)return false;
    if(!needle)return true;
    const contact=one(row.contacts);
    return [row.order_number,objektZeile(row),contact?`${contact.first_name} ${contact.last_name}`:""].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(needle);
  });
  return data({profile,rows:gefiltert,summary,canWrite:canWrite===true,properties:properties??[],filters},{headers:responseHeaders()});
}

export default function Measurements(){
  const {profile,rows,summary,canWrite,properties,filters}=useLoaderData<typeof loader>();
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Verkauf · Dienstleistung</p><h1 className="editor-title">Aufmaß-Aufträge</h1><p className="editor-meta">Grundrisse, Bestandsaufmaß und Wohnflächenberechnung — auch für Objekte ohne eigenen Maklerauftrag.</p></div><div className="header-actions">{canWrite?<Link className="primary-button link-button" to={filters.propertyId?`/measurements/new?property_id=${encodeURIComponent(filters.propertyId)}`:"/measurements/new"}>+ Auftrag</Link>:null}<span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>

    <section className="metric-grid">
      <article className="metric-card"><span>Angefragt</span><strong>{summary.angefragt}</strong><small>Anfrage oder Angebot offen</small></article>
      <article className="metric-card"><span>Beauftragt</span><strong>{summary.beauftragt}</strong><small>Termin steht aus oder ist vereinbart</small></article>
      <article className="metric-card"><span>Termin &lt; 7 Tage</span><strong>{summary.termin}</strong><small>Aufmaß vor Ort</small></article>
      <article className="metric-card"><span>Auszuliefern</span><strong>{summary.auszuliefern}</strong><small>aufgemessen, Unterlagen offen</small></article>
      <article className="metric-card"><span>Offenes Honorar</span><strong>{euroRund(summary.offenesHonorar)}</strong><small>geliefert oder abgerechnet, nicht bezahlt</small></article>
    </section>

    <section className="data-card"><Form method="get" className="filter-grid">
      <label><span>Suche</span><input name="q" defaultValue={filters.q} placeholder="Auftrag, Objekt oder Kunde"/></label>
      <label><span>Ansicht</span><select name="status" defaultValue={filters.status}><option value="OPEN">Laufende Aufträge</option><option value="DUE">Honorar offen</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([value,label])=><option value={value} key={value}>{label}</option>)}<option value="ARCHIVED">Archiviert</option></select></label>
      <label><span>Paket</span><select name="paket" defaultValue={filters.paket}><option value="">Alle Pakete</option>{Object.entries(PAKET).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>Immobilie</span><select name="property_id" defaultValue={filters.propertyId}><option value="">Alle Immobilien</option>{properties.map((property:any)=><option key={property.id} value={property.id}>{property.property_number} · {property.internal_title}</option>)}</select></label>
      <button className="secondary-button" type="submit">Filtern</button>
    </Form></section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Auftragsverzeichnis</p><h2>{rows.length} Aufträge</h2></div></div><div className="data-list">
      {rows.map((row:any)=>{
        const contact=one(row.contacts);
        return <Link className="data-row data-row-link" to={`/measurements/${row.id}`} key={row.id}>
          <div><strong>{row.order_number} · {PAKET[row.service_package]??row.service_package}</strong><small>{objektZeile(row)}{contact?` · ${contact.first_name} ${contact.last_name}`:""}</small></div>
          <div className="row-meta"><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":STATUS[row.status]??row.status}</span><small>{QUELLE[row.source]??row.source}</small></div>
          <div className="row-meta"><span>{row.appointment_at?`Termin ${zeitpunkt(row.appointment_at)}`:row.measured_on?`Aufgemessen ${formatDate(row.measured_on)}`:`Angefragt ${formatDate(row.requested_on)}`}</span><small>{row.measured_living_area_sqm?`Wohnfläche ${flaeche(row.measured_living_area_sqm)}`:row.approx_area_sqm?`ca. ${flaeche(row.approx_area_sqm)} laut Kunde`:"Fläche offen"}</small></div>
          <div className="row-meta"><span>{row.fee_amount?euroRund(row.fee_amount):"Honorar offen"}</span><small>{row.paid_on?`Bezahlt ${formatDate(row.paid_on)}`:row.invoiced_on?`Abgerechnet ${formatDate(row.invoiced_on)}`:row.delivered_on?`Geliefert ${formatDate(row.delivered_on)}`:"—"}</small></div>
          <span className="subtle-link">Öffnen →</span>
        </Link>;
      })}
      {rows.length===0?<p className="empty-state">Keine Aufmaß-Aufträge in dieser Ansicht.</p>:null}
    </div></section>
  </main>;
}
