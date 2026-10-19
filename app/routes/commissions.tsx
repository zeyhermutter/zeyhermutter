import { data, Form, Link, useLoaderData, redirect } from "react-router";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/commissions";
import { requirePermission } from "~/lib/auth.server";
import { euroGenau as money, tag as formatDate } from "~/lib/format";
import { RECHNUNGSSTATUS, ZAHLUNGSSTATUS, beschrifte } from "~/lib/labels";
import { seiteAus, seitenzahl, sicher, enthaelt, inListe, passendeBezuege } from "~/lib/blaettern.server";
import { Seiten, SucheZuAllgemein } from "~/components/seiten";
import "~/programm-liste.css";

const STATUS: Record<string,string> = {DRAFT:"Entwurf",EXPECTED:"Erwartet",DUE:"Fällig",INVOICED:"Abgerechnet",PARTIALLY_PAID:"Teilweise bezahlt",PAID:"Bezahlt",CANCELLED:"Storniert"};
const SIDE: Record<string,string> = {SELLER:"Innenprovision",BUYER:"Außenprovision"};
const STATUS_CLASS: Record<string,string> = {DRAFT:"status-draft",EXPECTED:"status-valuation",DUE:"status-contract-pending",INVOICED:"status-marketing",PARTIALLY_PAID:"status-preparation",PAID:"status-sold",CANCELLED:"status-lost"};

function one(value:any){return Array.isArray(value)?value[0]:value;}

function targetAmount(row:any){const value=row.actual_amount??row.expected_amount;const n=Number(value);return Number.isFinite(n)?n:0;}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"commission.read");
  // Einstieg: gleich den obersten Datensatz im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if(istEinstieg(request)){const {data:erster}=await supabase.from("commissions").select("id").is("archived_at",null).order("updated_at",{ascending:false}).limit(1).maybeSingle(); if(erster)throw redirect(`/commissions/${erster.id}`,{headers:responseHeaders()});}
  const url=new URL(request.url);
  const filters={q:(url.searchParams.get("q")??"").trim(),status:url.searchParams.get("status")??"OPEN",side:url.searchParams.get("side")??"",propertyId:url.searchParams.get("property_id")??""};
  // Blaettern ueber die Datenbank (19.10.2026, app/lib/blaettern.server.ts).
  // Fuer Kennzahlen und Summen holt der Worker nur Status und Betraege aller
  // nicht archivierten Provisionen -- nicht mehr nur der 500 zuletzt geaenderten.
  const {page,from,to}=seiteAus(url);const text=sicher(filters.q);
  const bezug=await passendeBezuege(supabase,filters.q,{kontakte:true,objekte:true});
  let abfrage=supabase.from("commissions").select("id,commission_number,property_id,side,status,expected_amount,actual_amount,due_date,invoice_status,payment_status,paid_amount,archived_at,updated_at,properties!inner(id,property_number,internal_title,status),party:contacts!commissions_party_contact_id_fkey(id,first_name,last_name),purchase_offers(id,offer_number,amount,status)",{count:"exact"});
  if(filters.propertyId)abfrage=abfrage.eq("property_id",filters.propertyId);
  if(filters.side)abfrage=abfrage.eq("side",filters.side);
  if(filters.status==="OPEN")abfrage=abfrage.is("archived_at",null).not("status","in","(PAID,CANCELLED)");
  else if(filters.status==="ARCHIVED")abfrage=abfrage.not("archived_at","is",null);
  else if(filters.status!=="ALL")abfrage=abfrage.eq("status",filters.status);
  if(text)abfrage=abfrage.or([enthaelt(["commission_number"],text),inListe("party_contact_id",bezug.kontakte),inListe("property_id",bezug.objekte)].join(","));
  const SUMMEN_GRENZE=10000;
  const [{data:rows,error,count},{data:canWrite},{data:properties},summenRes]=await Promise.all([
    abfrage.order("updated_at",{ascending:false}).range(from,to),
    supabase.rpc("current_user_has_permission",{p_permission:"commission.write"}),
    supabase.from("properties").select("id,property_number,internal_title").eq("transaction_type","SALE").order("updated_at",{ascending:false}).limit(500),
    supabase.from("commissions").select("status,expected_amount,actual_amount,paid_amount").is("archived_at",null).limit(SUMMEN_GRENZE),
  ]);
  if(error||summenRes.error)throw new Response("Provisionen konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const active=(summenRes.data??[]) as any[];
  const expectedSum=active.filter((row)=>row.status!=="CANCELLED").reduce((sum,row)=>sum+Number(row.expected_amount??0),0);
  const openSum=active.filter((row)=>!['PAID','CANCELLED'].includes(row.status)).reduce((sum,row)=>sum+Math.max(0,targetAmount(row)-Number(row.paid_amount??0)),0);
  const summary={
    expected:active.filter((row)=>row.status==="EXPECTED").length,
    due:active.filter((row)=>row.status==="DUE").length,
    invoiced:active.filter((row)=>['INVOICED','PARTIALLY_PAID'].includes(row.status)).length,
    paid:active.filter((row)=>row.status==="PAID").length,
    expectedSum,openSum,
  };
  return data({profile,rows:(rows??[]) as any[],total:count??0,page,pageCount:seitenzahl(count),zuViele:bezug.zuViele,summenGekappt:active.length>=SUMMEN_GRENZE,summary,canWrite:canWrite===true,properties:properties??[],filters},{headers:responseHeaders()});
}

// Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026):
// Werkzeugleiste, eine Zeile Kennzahlen mit den Summen, Tabelle. Vorher
// Seitenkopf, sechs Kacheln, Filterkasten und Kartenzeilen.
export default function Commissions(){
  const {rows,total,page,pageCount,zuViele,summenGekappt,summary,canWrite,properties,filters}=useLoaderData<typeof loader>();
  const neu=filters.propertyId?`/commissions/new?property_id=${encodeURIComponent(filters.propertyId)}`:"/commissions/new";
  const gefiltert=Boolean(filters.q||filters.side||filters.propertyId||filters.status!=="OPEN");
  const heute=new Date().toISOString().slice(0,10);
  return <main className="editor-shell programm-liste">
    <Form method="get" className="programm-liste-werkzeuge" role="search">
      <input type="hidden" name="ansicht" value="tabelle"/>
      <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={filters.q} placeholder="Provision, Objekt oder Partei …" autoComplete="off"/></label>
      <label><span className="sr-only">Ansicht</span><select name="status" defaultValue={filters.status}><option value="OPEN">Offene Provisionen</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([value,label])=><option value={value} key={value}>{label}</option>)}<option value="ARCHIVED">Archiviert</option></select></label>
      <label><span className="sr-only">Seite</span><select name="side" defaultValue={filters.side}><option value="">Innen- und Außenprovision</option><option value="SELLER">Innenprovision</option><option value="BUYER">Außenprovision</option></select></label>
      <label><span className="sr-only">Immobilie</span><select name="property_id" defaultValue={filters.propertyId}><option value="">Alle Immobilien</option>{properties.map((property:any)=><option key={property.id} value={property.id}>{property.property_number} · {property.internal_title}</option>)}</select></label>
      <button className="secondary-button" type="submit">Filtern</button>
      <span className="programm-liste-zaehler">{total} {total===1?"Provision":"Provisionen"}</span>
      {canWrite?<Link className="programm-liste-neu" to={neu}>+ Neue Provision</Link>:null}
    </Form>
    <p className="programm-kennzahlen">
      <span><strong>{summary.expected}</strong> erwartet</span>
      <span className={summary.due?"warnung":undefined}><strong>{summary.due}</strong> fällig, nicht abgerechnet</span>
      <span><strong>{summary.invoiced}</strong> abgerechnet/teilbezahlt</span>
      <span><strong>{summary.paid}</strong> bezahlt</span>
      <span title="ohne stornierte Vorgänge"><strong>{money(summary.expectedSum)}</strong> erwartet gesamt</span>
      <span title="abzüglich dokumentierter Zahlungen"><strong>{money(summary.openSum)}</strong> offen</span>
    </p>
    <div className="programm-tabelle-rahmen">
      {rows.length===0?<p className="programm-liste-leer">{gefiltert?"Keine Provision passt zu diesem Filter.":"Keine offene Provision."}{canWrite?<> <Link to={neu}>Provision erfassen</Link></>:null}</p>:<table className="programm-tabelle">
        <thead><tr><th scope="col">Nummer</th><th scope="col">Objekt</th><th scope="col">Partei</th><th scope="col">Art</th><th scope="col" className="rechts">Betrag</th><th scope="col">Status</th><th scope="col">Rechnung · Zahlung</th><th scope="col">Fällig</th></tr></thead>
        <tbody>{rows.map((row:any)=>{const property=one(row.properties),party=one(row.party),offer=one(row.purchase_offers);const ueberfaellig=row.due_date&&row.due_date<heute&&!["PAID","CANCELLED"].includes(row.status)&&!row.archived_at;return <tr key={row.id} className={ueberfaellig?"frist-vorbei":undefined}>
          <td className="zahl"><Link to={`/commissions/${row.id}`}>{row.commission_number}</Link></td>
          <td><Link to={`/commissions/${row.id}`}>{property?.property_number??"—"} · {property?.internal_title??"Immobilie"}</Link>{offer?.offer_number?<div className="leise">{offer.offer_number}</div>:null}</td>
          <td>{party?<Link to={`/crm/contacts/${party.id}`}>{party.first_name} {party.last_name}</Link>:<span className="leise">noch offen</span>}</td>
          <td>{SIDE[row.side]??row.side}</td>
          <td className="zahl rechts">{money(row.actual_amount??row.expected_amount)}{row.actual_amount==null?<div className="leise">erwartet</div>:null}</td>
          <td><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":STATUS[row.status]??row.status}</span></td>
          <td>{beschrifte(RECHNUNGSSTATUS,row.invoice_status)}<div className="leise">{beschrifte(ZAHLUNGSSTATUS,row.payment_status)}</div></td>
          <td className="zahl">{row.due_date?formatDate(row.due_date):<span className="leise">offen</span>}</td>
        </tr>;})}</tbody>
      </table>}
      <SucheZuAllgemein an={zuViele}/>
      {summenGekappt?<p className="programm-liste-leer">Kennzahlen und Summen beziehen sich auf 10.000 nicht archivierte Provisionen.</p>:null}
    </div>
      <Seiten page={page} pageCount={pageCount}/>
  </main>;
}
