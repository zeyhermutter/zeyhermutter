import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/mandates";
import { requirePermission } from "~/lib/auth.server";

const STATUS: Record<string,string> = {DRAFT:"Entwurf",ACTIVE:"Aktiv",WITHDRAWN:"Widerrufen",TERMINATED:"Gekündigt",EXPIRED:"Abgelaufen",FULFILLED:"Erfüllt",CANCELLED:"Verworfen"};
const STATUS_CLASS: Record<string,string> = {DRAFT:"status-draft",ACTIVE:"status-marketing",WITHDRAWN:"status-lost",TERMINATED:"status-lost",EXPIRED:"status-archived",FULFILLED:"status-sold",CANCELLED:"status-archived"};
const TYPE: Record<string,string> = {SIMPLE:"Einfacher Auftrag",EXCLUSIVE:"Alleinauftrag",QUALIFIED_EXCLUSIVE:"Qualifizierter Alleinauftrag"};
const CLIENT_SIDE: Record<string,string> = {SELLER:"Verkäuferauftrag",BUYER:"Käuferauftrag",BOTH:"Doppeltätigkeit"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(value));}
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
  const {profile,rows,summary,canWrite,properties,filters}=useLoaderData<typeof loader>();
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Objekte & Verkauf</p><h1 className="editor-title">Makleraufträge</h1><p className="editor-meta">Auftragsart, Laufzeit, Form, Provisionsvereinbarung und Widerrufsdokumentation je Verkaufsimmobilie.</p></div><div className="header-actions">{canWrite?<Link className="primary-button link-button" to={filters.propertyId?`/mandates/new?property_id=${encodeURIComponent(filters.propertyId)}`:"/mandates/new"}>+ Auftrag</Link>:null}<span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>

    <section className="metric-grid">
      <article className="metric-card"><span>Entwürfe</span><strong>{summary.draft}</strong><small>noch nicht zustande gekommen</small></article>
      <article className="metric-card"><span>Aktive Aufträge</span><strong>{summary.active}</strong><small>laufende Beauftragungen</small></article>
      <article className="metric-card"><span>Alleinaufträge</span><strong>{summary.exclusive}</strong><small>einfach und qualifiziert</small></article>
      <article className="metric-card"><span>Widerruf offen</span><strong>{summary.risk}</strong><small>Belehrung oder Frist ungeklärt</small></article>
      <article className="metric-card"><span>Laufzeitende &lt; 30 Tage</span><strong>{summary.expiring}</strong><small>Verlängerung prüfen</small></article>
    </section>

    <section className="data-card"><Form method="get" className="filter-grid">
      <label><span>Suche</span><input name="q" defaultValue={filters.q} placeholder="Auftrag, Objekt oder Auftraggeber"/></label>
      <label><span>Ansicht</span><select name="status" defaultValue={filters.status}><option value="OPEN">Laufende Aufträge</option><option value="RISK">Widerruf offen</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([value,label])=><option value={value} key={value}>{label}</option>)}<option value="ARCHIVED">Archiviert</option></select></label>
      <label><span>Auftragsart</span><select name="type" defaultValue={filters.type}><option value="">Alle</option>{Object.entries(TYPE).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>Immobilie</span><select name="property_id" defaultValue={filters.propertyId}><option value="">Alle Immobilien</option>{properties.map((property:any)=><option key={property.id} value={property.id}>{property.property_number} · {property.internal_title}</option>)}</select></label>
      <button className="secondary-button" type="submit">Filtern</button>
    </Form></section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Auftragsverzeichnis</p><h2>{rows.length} Aufträge</h2></div></div><div className="data-list">
      {rows.map((row:any)=>{
        const property=one(row.properties);
        const clients=(row.brokerage_mandate_clients??[]).map((client:any)=>{const contact=one(client.contacts);return contact?`${contact.first_name} ${contact.last_name}`:null;}).filter(Boolean);
        const seller=(row.brokerage_mandate_commission_terms??[]).find((term:any)=>term.side==="SELLER");
        const buyer=(row.brokerage_mandate_commission_terms??[]).find((term:any)=>term.side==="BUYER");
        const termLabel=(term:any)=>!term?"—":term.calculation_method==="PERCENT"?`${Number(term.agreed_percent).toLocaleString("de-DE",{maximumFractionDigits:2})} %`:new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(Number(term.agreed_fixed_amount));
        return <Link className="data-row data-row-link" to={`/mandates/${row.id}`} key={row.id}>
          <div><strong>{row.mandate_number} · {TYPE[row.mandate_type]??row.mandate_type}</strong><small>{property?.property_number??"—"} · {property?.internal_title??"Immobilie"}{clients.length?` · ${clients.join(", ")}`:" · Auftraggeber offen"}</small></div>
          <div className="row-meta"><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":STATUS[row.status]??row.status}</span><small>{CLIENT_SIDE[row.client_side]??row.client_side}</small></div>
          <div className="row-meta"><span>Verkäufer {termLabel(seller)} · Käufer {termLabel(buyer)}</span><small>{row.term_start?`Laufzeit ab ${formatDate(row.term_start)}`:"Laufzeit offen"}{row.term_end?` bis ${formatDate(row.term_end)}`:""}</small></div>
          <div className="row-meta">{openWithdrawalRisk(row)?<span className="status-pill status-lost">Widerruf offen</span>:<span>{row.text_form_confirmed?"Textform dokumentiert":"Textform offen"}</span>}<small>Aktualisiert {formatDate(row.updated_at)}</small></div>
          <span className="subtle-link">Öffnen →</span>
        </Link>;
      })}
      {rows.length===0?<p className="empty-state">Keine Makleraufträge in dieser Ansicht.</p>:null}
    </div></section>
  </main>;
}
