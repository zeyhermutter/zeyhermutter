import { data, Form, Link, useLoaderData, redirect } from "react-router";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/closings";
import { requirePermission } from "~/lib/auth.server";
import { euroGenau as money, tag, zeitpunkt } from "~/lib/format";
import { IMMOBILIENSTATUS, beschrifte } from "~/lib/labels";
import { seiteAus, seitenzahl, sicher, enthaelt, inListe, passendeBezuege, BEZUG_GRENZE, seiteZuWeit } from "~/lib/blaettern.server";
import { Seiten, SucheZuAllgemein } from "~/components/seiten";
import "~/programm-liste.css";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
const STATUS:Record<string,string>={PREPARATION:"Abschlussvorbereitung",NOTARY_INSTRUCTED:"Notariat beauftragt",DRAFT_RECEIVED:"Entwurf eingegangen",APPOINTMENT_SCHEDULED:"Beurkundung terminiert",NOTARIZED:"Beurkundet",PURCHASE_PRICE_DUE:"Kaufpreis fällig",PURCHASE_PRICE_PAID:"Kaufpreis bezahlt",HANDOVER_COMPLETED:"Übergabe erfolgt",COMPLETED:"Abgeschlossen",CANCELLED:"Abgebrochen"};
function one(v:any){return Array.isArray(v)?v[0]:v;}function formatDate(v:string|null,withTime=false){return withTime?zeitpunkt(v):tag(v);}

export async function loader({request,context}:Route.LoaderArgs){const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"closing.read");
  // Einstieg: gleich den obersten Datensatz im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if(istEinstieg(request)){const {data:erster}=await supabase.from("sale_closings").select("id").is("archived_at",null).order("updated_at",{ascending:false}).limit(1).maybeSingle(); if(erster)throw redirect(`/closings/${erster.id}`,{headers:responseHeaders()});}const url=new URL(request.url),filters={q:(url.searchParams.get("q")??"").trim(),status:url.searchParams.get("status")??"ACTIVE",propertyId:url.searchParams.get("property_id")??""};
  // Blaettern ueber die Datenbank (19.10.2026, app/lib/blaettern.server.ts).
  const {page,from,to}=seiteAus(url);const text=sicher(filters.q);
  const [bezug,angebotTreffer]=await Promise.all([passendeBezuege(supabase,filters.q,{kontakte:true,objekte:true}),text?supabase.from("purchase_offers").select("id").ilike("offer_number",`%${text}%`).limit(BEZUG_GRENZE):Promise.resolve({data:[]})]);
  let abfrage=supabase.from("sale_closings").select("id,closing_number,property_id,accepted_offer_id,buyer_contact_id,agreed_purchase_price,notarial_purchase_price,status,notary_appointment_at,notarized_date,purchase_price_due_date,purchase_price_paid_date,handover_date,completed_date,archived_at,updated_at,properties!inner(id,property_number,internal_title,status),buyer:contacts!sale_closings_buyer_contact_id_fkey(id,contact_number,first_name,last_name),purchase_offers!inner(id,offer_number,amount,status),organizations(id,name)",{count:"exact"});
  if(filters.propertyId)abfrage=abfrage.eq("property_id",filters.propertyId);
  if(filters.status==="ACTIVE")abfrage=abfrage.is("archived_at",null).not("status","in","(COMPLETED,CANCELLED)");
  else if(filters.status==="ARCHIVED")abfrage=abfrage.not("archived_at","is",null);
  else if(filters.status!=="ALL")abfrage=abfrage.eq("status",filters.status);
  if(text)abfrage=abfrage.or([enthaelt(["closing_number"],text),inListe("buyer_contact_id",bezug.kontakte),inListe("property_id",bezug.objekte),inListe("accepted_offer_id",((angebotTreffer.data??[]) as any[]).map(r=>r.id))].join(","));
  const zaehle=(st:string[])=>supabase.from("sale_closings").select("id",{count:"exact"}).is("archived_at",null).in("status",st).limit(1);
  const [{data:rows,error,count},{data:properties},...zahlen]=await Promise.all([
    abfrage.order("updated_at",{ascending:false}).range(from,to),
    supabase.from("properties").select("id,property_number,internal_title").eq("transaction_type","SALE").order("updated_at",{ascending:false}).limit(500),
    zaehle(["PREPARATION","NOTARY_INSTRUCTED","DRAFT_RECEIVED","APPOINTMENT_SCHEDULED"]),zaehle(["NOTARIZED"]),zaehle(["PURCHASE_PRICE_DUE","PURCHASE_PRICE_PAID"]),zaehle(["HANDOVER_COMPLETED"]),zaehle(["COMPLETED"]),
  ]);
  seiteZuWeit(error,url,responseHeaders());if(error)throw new Response("Abschlussvorgänge konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const [preparation,notarized,payment,handover,completed]=zahlen.map((z:any)=>z.count??0);
  return data({profile,rows:(rows??[]) as any[],total:count??0,page,pageCount:seitenzahl(count),zuViele:bezug.zuViele,properties:properties??[],summary:{preparation,notarized,payment,handover,completed},filters},{headers:responseHeaders()});}

// Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026):
// Werkzeugleiste, eine Zeile Kennzahlen, Tabelle. Vorher Seitenkopf, fünf
// Kacheln, Filterkasten und Kartenzeilen (mit dem Objektstatus als Code).
export default function Closings(){
  const d=useLoaderData<typeof loader>();
  const gefiltert=Boolean(d.filters.q||d.filters.propertyId||d.filters.status!=="ACTIVE");
  return <main className="editor-shell programm-liste"><ListenUeberschrift/>
    <Form method="get" className="programm-liste-werkzeuge" role="search">
      <input type="hidden" name="ansicht" value="tabelle"/>
      <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={d.filters.q} placeholder="Abschluss, Angebot, Objekt oder Käufer …" autoComplete="off"/></label>
      <label><span className="sr-only">Status</span><select name="status" defaultValue={d.filters.status}><option value="ACTIVE">Laufende Abschlüsse</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([v,l])=><option value={v} key={v}>{l}</option>)}<option value="ARCHIVED">Archiviert</option></select></label>
      <label><span className="sr-only">Immobilie</span><select name="property_id" defaultValue={d.filters.propertyId}><option value="">Alle Immobilien</option>{d.properties.map((p:any)=><option key={p.id} value={p.id}>{p.property_number} · {p.internal_title}</option>)}</select></label>
      <button className="secondary-button" type="submit">Filtern</button>
      <span className="programm-liste-zaehler">{d.total} {d.total===1?"Abschluss":"Abschlüsse"}</span>
    </Form>
    <p className="programm-kennzahlen">
      <span><strong>{d.summary.preparation}</strong> bis zur Beurkundung</span>
      <span><strong>{d.summary.notarized}</strong> beurkundet</span>
      <span><strong>{d.summary.payment}</strong> Kaufpreis fällig/bezahlt</span>
      <span><strong>{d.summary.handover}</strong> übergeben</span>
      <span><strong>{d.summary.completed}</strong> abgeschlossen</span>
      <span className="leise">Ein Abschluss entsteht aus einem angenommenen Kaufangebot.</span>
    </p>
    <div className="programm-tabelle-rahmen">
      {d.rows.length===0?<p className="programm-liste-leer">{gefiltert?"Kein Abschluss passt zu diesem Filter.":"Noch kein Abschluss. Er entsteht aus einem angenommenen Kaufangebot."} <Link to="/purchase-offers?ansicht=tabelle">Kaufangebote</Link></p>:<table className="programm-tabelle">
        <thead><tr><th scope="col">Nummer</th><th scope="col">Objekt</th><th scope="col">Käufer</th><th scope="col" className="rechts">Kaufpreis</th><th scope="col">Status</th><th scope="col">Notartermin</th><th scope="col">Zuletzt erreicht</th><th scope="col" className="rechts">Geändert</th></tr></thead>
        <tbody>{d.rows.map((row:any)=>{const p=one(row.properties),b=one(row.buyer),offer=one(row.purchase_offers);const erreicht=row.completed_date?`Abgeschlossen ${formatDate(row.completed_date)}`:row.handover_date?`Übergabe ${formatDate(row.handover_date)}`:row.purchase_price_paid_date?`Kaufpreis bezahlt ${formatDate(row.purchase_price_paid_date)}`:row.notarized_date?`Beurkundet ${formatDate(row.notarized_date)}`:null;return <tr key={row.id}>
          <td className="zahl"><Link to={`/closings/${row.id}`}>{row.closing_number}</Link></td>
          <td><Link to={`/closings/${row.id}`}>{p?.property_number} · {p?.internal_title}</Link>{p?.status?<div className="leise">{beschrifte(IMMOBILIENSTATUS,p.status)}</div>:null}</td>
          <td>{b?<Link to={`/crm/contacts/${b.id}`}>{b.first_name} {b.last_name}</Link>:<span className="leise">—</span>}{offer?.offer_number?<div className="leise">{offer.offer_number}</div>:null}</td>
          <td className="zahl rechts">{money(row.notarial_purchase_price??row.agreed_purchase_price)}</td>
          <td>{row.archived_at?"Archiviert":STATUS[row.status]??row.status}</td>
          <td className="zahl">{row.notary_appointment_at?formatDate(row.notary_appointment_at,true):<span className="leise">offen</span>}</td>
          <td>{erreicht??<span className="leise">—</span>}</td>
          <td className="zahl rechts leise">{formatDate(row.updated_at)}</td>
        </tr>;})}</tbody>
      </table>}
      <SucheZuAllgemein an={d.zuViele}/>
    </div>
      <Seiten page={d.page} pageCount={d.pageCount}/>
  </main>;
}
