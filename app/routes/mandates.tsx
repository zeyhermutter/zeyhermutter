import { data, Form, Link, redirect, useLoaderData } from "react-router";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/mandates";
import { requirePermission } from "~/lib/auth.server";
import { euroRund, prozent, tag as formatDate } from "~/lib/format";
import { MAKLERAUFTRAGART as TYPE, MAKLERAUFTRAGSTATUS as STATUS } from "~/lib/labels";
import "~/programm-liste.css";

const STATUS_CLASS: Record<string,string> = {DRAFT:"status-draft",ACTIVE:"status-marketing",WITHDRAWN:"status-lost",TERMINATED:"status-lost",EXPIRED:"status-archived",FULFILLED:"status-sold",CANCELLED:"status-archived"};

const CLIENT_SIDE: Record<string,string> = {SELLER:"Verkäuferauftrag",BUYER:"Käuferauftrag",BOTH:"Doppeltätigkeit"};

function one(value:any){return Array.isArray(value)?value[0]:value;}

function today(){return new Date().toISOString().slice(0,10);}

export function openWithdrawalRisk(row:any){
  if(row.status!=="ACTIVE")return false;
  if(!row.client_is_consumer)return false;
  if(!row.withdrawal_instruction_given_on)return true;
  if(row.withdrawal_deadline_on&&row.withdrawal_deadline_on>=today()&&!row.early_start_requested_on)return true;
  return false;
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"mandate.read");
  // Einstieg: gleich den zuletzt bearbeiteten Datensatz im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if(istEinstieg(request)){const {data:erster}=await supabase.from("brokerage_mandates").select("id").is("archived_at",null).order("updated_at",{ascending:false}).limit(1).maybeSingle(); if(erster)throw redirect(`/mandates/${erster.id}`,{headers:responseHeaders()});}
  const url=new URL(request.url);
  const filters={q:(url.searchParams.get("q")??"").trim(),status:url.searchParams.get("status")??"OPEN",type:url.searchParams.get("type")??"",propertyId:url.searchParams.get("property_id")??""};
  const [{data:rows,error},{data:canWrite},{data:properties}]=await Promise.all([
    supabase.from("brokerage_mandates").select("id,mandate_number,property_id,lead_id,mandate_type,client_side,dual_agency,client_is_consumer,status,concluded_on,term_start,term_end,text_form_confirmed,withdrawal_instruction_given_on,withdrawal_deadline_on,early_start_requested_on,client_share_payment_proof_on,archived_at,updated_at,properties!inner(id,property_number,internal_title,status),brokerage_mandate_clients(contact_id,contacts(first_name,last_name)),brokerage_mandate_commission_terms(side,calculation_method,agreed_percent,agreed_fixed_amount)").order("updated_at",{ascending:false}).limit(400),
    supabase.rpc("current_user_has_permission",{p_permission:"mandate.write"}),
    supabase.from("properties").select("id,property_number,internal_title").eq("transaction_type","SALE").order("updated_at",{ascending:false}).limit(500),
  ]);
  if(error)throw new Response("Makleraufträge konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const all=(rows??[]) as any[];
  const active=all.filter((row)=>!row.archived_at);
  const summary={
    draft:active.filter((row)=>row.status==="DRAFT").length,
    active:active.filter((row)=>row.status==="ACTIVE").length,
    exclusive:active.filter((row)=>row.status==="ACTIVE"&&row.mandate_type!=="SIMPLE").length,
    risk:active.filter((row)=>openWithdrawalRisk(row)).length,
    expiring:active.filter((row)=>row.status==="ACTIVE"&&row.term_end&&row.term_end>=today()&&row.term_end<=new Date(Date.now()+30*864e5).toISOString().slice(0,10)).length,
  };
  const needle=filters.q.toLocaleLowerCase("de-DE");
  const filtered=all.filter((row)=>{
    const property=one(row.properties);
    if(filters.propertyId&&row.property_id!==filters.propertyId)return false;
    if(filters.type&&row.mandate_type!==filters.type)return false;
    if(filters.status==="OPEN"&&(row.archived_at||["WITHDRAWN","TERMINATED","CANCELLED","FULFILLED"].includes(row.status)))return false;
    if(filters.status==="RISK"&&!openWithdrawalRisk(row))return false;
    if(filters.status==="ARCHIVED"&&!row.archived_at)return false;
    if(!["OPEN","ALL","ARCHIVED","RISK"].includes(filters.status)&&row.status!==filters.status)return false;
    if(!needle)return true;
    const clients=(row.brokerage_mandate_clients??[]).map((client:any)=>{const contact=one(client.contacts);return contact?`${contact.first_name} ${contact.last_name}`:"";});
    return [row.mandate_number,property?.property_number,property?.internal_title,...clients].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(needle);
  });
  return data({profile,rows:filtered,summary,canWrite:canWrite===true,properties:properties??[],filters},{headers:responseHeaders()});
}

export default function Mandates(){
  const {rows,summary,canWrite,properties,filters}=useLoaderData<typeof loader>();
  const neu=filters.propertyId?`/mandates/new?property_id=${encodeURIComponent(filters.propertyId)}`:"/mandates/new";
  // Eine Programmliste wie die Kontaktliste (12.10.2026): Werkzeugleiste,
  // eine Zeile Kennzahlen, Tabelle. Vorher Seitenkopf, fuenf grosse Kacheln,
  // ein Filterkasten und Karten -- auch dann, wenn es keinen Auftrag gibt.
  return <main className="editor-shell programm-liste">
    <Form method="get" className="programm-liste-werkzeuge" role="search">
      <input type="hidden" name="ansicht" value="tabelle"/>
      <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={filters.q} placeholder="Auftrag, Objekt oder Auftraggeber …" autoComplete="off"/></label>
      <label><span className="sr-only">Ansicht</span><select name="status" defaultValue={filters.status}><option value="OPEN">Laufende Aufträge</option><option value="RISK">Widerruf offen</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([value,label])=><option value={value} key={value}>{label}</option>)}<option value="ARCHIVED">Archiviert</option></select></label>
      <label><span className="sr-only">Auftragsart</span><select name="type" defaultValue={filters.type}><option value="">Alle Auftragsarten</option>{Object.entries(TYPE).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label><span className="sr-only">Immobilie</span><select name="property_id" defaultValue={filters.propertyId}><option value="">Alle Immobilien</option>{properties.map((property:any)=><option key={property.id} value={property.id}>{property.property_number} · {property.internal_title}</option>)}</select></label>
      <button className="secondary-button" type="submit">Filtern</button>
      <span className="programm-liste-zaehler">{rows.length} {rows.length===1?"Auftrag":"Aufträge"}</span>
      {canWrite?<Link className="programm-liste-neu" to={neu}>+ Neuer Auftrag</Link>:null}
    </Form>

    <p className="programm-kennzahlen">
      <span><strong>{summary.draft}</strong> Entwürfe</span>
      <span><strong>{summary.active}</strong> aktiv</span>
      <span><strong>{summary.exclusive}</strong> Alleinaufträge</span>
      <span className={summary.risk?"warnung":undefined}><strong>{summary.risk}</strong> Widerruf offen</span>
      <span className={summary.expiring?"warnung":undefined}><strong>{summary.expiring}</strong> Laufzeitende &lt; 30 Tage</span>
    </p>

    <div className="programm-tabelle-rahmen">
      {rows.length===0?<p className="programm-liste-leer">{filters.q||filters.type||filters.propertyId||filters.status!=="OPEN"?"Keine Makleraufträge in dieser Ansicht.":"Noch kein Maklerauftrag erfasst."}{canWrite?<> <Link to={neu}>Ersten Auftrag anlegen</Link></>:null}</p>:<table className="programm-tabelle">
        <thead><tr><th>Nummer</th><th>Objekt</th><th>Auftraggeber</th><th>Art</th><th>Status</th><th>Provision V · K</th><th>Laufzeit</th><th className="rechts">Geändert</th></tr></thead>
        <tbody>{rows.map((row:any)=>{
          const property=one(row.properties);
          const clients=(row.brokerage_mandate_clients??[]).map((client:any)=>{const contact=one(client.contacts);return contact?`${contact.first_name} ${contact.last_name}`:null;}).filter(Boolean);
          const seller=(row.brokerage_mandate_commission_terms??[]).find((term:any)=>term.side==="SELLER");
          const buyer=(row.brokerage_mandate_commission_terms??[]).find((term:any)=>term.side==="BUYER");
          const termLabel=(term:any)=>!term?"—":term.calculation_method==="PERCENT"?prozent(term.agreed_percent,2):euroRund(term.agreed_fixed_amount);
          return <tr key={row.id}>
            <td className="zahl"><Link to={`/mandates/${row.id}`}>{row.mandate_number}</Link></td>
            <td><Link to={`/mandates/${row.id}`}>{property?.property_number??"—"} · {property?.internal_title??"Immobilie"}</Link></td>
            <td>{clients.length?clients.join(", "):<span className="leise">offen</span>}</td>
            <td>{TYPE[row.mandate_type]??row.mandate_type}<div className="leise">{CLIENT_SIDE[row.client_side]??row.client_side}</div></td>
            <td><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":STATUS[row.status]??row.status}</span>{openWithdrawalRisk(row)?<div className="warnung-text">Widerruf offen</div>:null}</td>
            <td className="zahl">{termLabel(seller)} · {termLabel(buyer)}</td>
            <td className="zahl">{row.term_start?formatDate(row.term_start):"offen"}{row.term_end?` – ${formatDate(row.term_end)}`:""}</td>
            <td className="zahl rechts leise">{formatDate(row.updated_at)}</td>
          </tr>;
        })}</tbody>
      </table>}
    </div>
  </main>;
}
