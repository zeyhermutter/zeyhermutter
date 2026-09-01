import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/commissions";
import { requirePermission } from "~/lib/auth.server";

const STATUS: Record<string,string> = {DRAFT:"Entwurf",EXPECTED:"Erwartet",DUE:"Fällig",INVOICED:"Abgerechnet",PARTIALLY_PAID:"Teilweise bezahlt",PAID:"Bezahlt",CANCELLED:"Storniert"};
const SIDE: Record<string,string> = {SELLER:"Innenprovision",BUYER:"Außenprovision"};
const STATUS_CLASS: Record<string,string> = {DRAFT:"status-draft",EXPECTED:"status-valuation",DUE:"status-contract-pending",INVOICED:"status-marketing",PARTIALLY_PAID:"status-preparation",PAID:"status-sold",CANCELLED:"status-lost"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function money(value:number|string|null|undefined){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(n):"—";}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(value));}
function targetAmount(row:any){const value=row.actual_amount??row.expected_amount;const n=Number(value);return Number.isFinite(n)?n:0;}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"commission.read");
  const url=new URL(request.url);
  const filters={q:(url.searchParams.get("q")??"").trim(),status:url.searchParams.get("status")??"OPEN",side:url.searchParams.get("side")??"",propertyId:url.searchParams.get("property_id")??""};
  const [{data:rows,error},{data:canWrite},{data:properties}]=await Promise.all([
    supabase.from("commissions").select("id,commission_number,property_id,side,status,expected_amount,actual_amount,due_date,invoice_status,payment_status,paid_amount,archived_at,updated_at,properties!inner(id,property_number,internal_title,status),party:contacts!commissions_party_contact_id_fkey(id,first_name,last_name),purchase_offers(id,offer_number,amount,status)").order("updated_at",{ascending:false}).limit(500),
    supabase.rpc("current_user_has_permission",{p_permission:"commission.write"}),
    supabase.from("properties").select("id,property_number,internal_title").eq("transaction_type","SALE").order("updated_at",{ascending:false}).limit(500),
  ]);
  if(error)throw new Response("Provisionen konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const all=(rows??[]) as any[];
  const active=all.filter((row)=>!row.archived_at);
  const expectedSum=active.filter((row)=>row.status!=="CANCELLED").reduce((sum,row)=>sum+Number(row.expected_amount??0),0);
  const openSum=active.filter((row)=>!['PAID','CANCELLED'].includes(row.status)).reduce((sum,row)=>sum+Math.max(0,targetAmount(row)-Number(row.paid_amount??0)),0);
  const summary={
    expected:active.filter((row)=>row.status==="EXPECTED").length,
    due:active.filter((row)=>row.status==="DUE").length,
    invoiced:active.filter((row)=>['INVOICED','PARTIALLY_PAID'].includes(row.status)).length,
    paid:active.filter((row)=>row.status==="PAID").length,
    expectedSum,openSum,
  };
  const needle=filters.q.toLocaleLowerCase("de-DE");
  const filtered=all.filter((row)=>{
    const property=one(row.properties),party=one(row.party);
    if(filters.propertyId&&row.property_id!==filters.propertyId)return false;
    if(filters.side&&row.side!==filters.side)return false;
    if(filters.status==="OPEN"&&(row.archived_at||['PAID','CANCELLED'].includes(row.status)))return false;
    if(filters.status==="ARCHIVED"&&!row.archived_at)return false;
    if(!['OPEN','ALL','ARCHIVED'].includes(filters.status)&&row.status!==filters.status)return false;
    if(!needle)return true;
    return [row.commission_number,property?.property_number,property?.internal_title,party?.first_name,party?.last_name].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(needle);
  });
  return data({profile,rows:filtered,summary,canWrite:canWrite===true,properties:properties??[],filters},{headers:responseHeaders()});
}

export default function Commissions(){
  const {profile,rows,summary,canWrite,properties,filters}=useLoaderData<typeof loader>();
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Objekte & Verkauf</p><h1 className="editor-title">Provisionen</h1><p className="editor-meta">Erwartete, fällige, abgerechnete und bezahlte Provisionen je Verkaufsimmobilie.</p></div><div className="header-actions">{canWrite?<Link className="primary-button link-button" to={filters.propertyId?`/commissions/new?property_id=${encodeURIComponent(filters.propertyId)}`:"/commissions/new"}>+ Provision</Link>:null}<span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>

    <section className="metric-grid">
      <article className="metric-card"><span>Erwartet</span><strong>{summary.expected}</strong><small>aktive erwartete Provisionen</small></article>
      <article className="metric-card"><span>Fällig</span><strong>{summary.due}</strong><small>noch nicht abgerechnet</small></article>
      <article className="metric-card"><span>Offene Rechnungen</span><strong>{summary.invoiced}</strong><small>abgerechnet / teilbezahlt</small></article>
      <article className="metric-card"><span>Bezahlt</span><strong>{summary.paid}</strong><small>vollständig bezahlt</small></article>
      <article className="metric-card"><span>Summe erwartet</span><strong>{money(summary.expectedSum)}</strong><small>ohne stornierte Vorgänge</small></article>
      <article className="metric-card"><span>Summe offen</span><strong>{money(summary.openSum)}</strong><small>abzüglich dokumentierter Zahlungen</small></article>
    </section>

    <section className="data-card"><Form method="get" className="filter-grid">
      <label><span>Suche</span><input name="q" defaultValue={filters.q} placeholder="Provision, Objekt oder Partei"/></label>
      <label><span>Ansicht</span><select name="status" defaultValue={filters.status}><option value="OPEN">Offene Vorgänge</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([value,label])=><option value={value} key={value}>{label}</option>)}<option value="ARCHIVED">Archiviert</option></select></label>
      <label><span>Seite</span><select name="side" defaultValue={filters.side}><option value="">Alle</option><option value="SELLER">Innenprovision</option><option value="BUYER">Außenprovision</option></select></label>
      <label><span>Immobilie</span><select name="property_id" defaultValue={filters.propertyId}><option value="">Alle Immobilien</option>{properties.map((property:any)=><option key={property.id} value={property.id}>{property.property_number} · {property.internal_title}</option>)}</select></label>
      <button className="secondary-button" type="submit">Filtern</button>
    </Form></section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Provisionsverzeichnis</p><h2>{rows.length} Vorgänge</h2></div></div><div className="data-list">
      {rows.map((row:any)=>{const property=one(row.properties),party=one(row.party),offer=one(row.purchase_offers);return <Link className="data-row data-row-link" to={`/commissions/${row.id}`} key={row.id}><div><strong>{row.commission_number} · {SIDE[row.side]??row.side}</strong><small>{property?.property_number??"—"} · {property?.internal_title??"Immobilie"}{party?` · ${party.first_name} ${party.last_name}`:" · Partei noch offen"}</small></div><div className="row-meta"><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":STATUS[row.status]??row.status}</span><small>{money(row.actual_amount??row.expected_amount)}{offer?.offer_number?` · ${offer.offer_number}`:""}</small></div><div className="row-meta"><span>{row.due_date?`Fällig ${formatDate(row.due_date)}`:"Fälligkeit offen"}</span><small>{row.invoice_status} · {row.payment_status}</small></div><span className="subtle-link">Öffnen →</span></Link>})}
      {rows.length===0?<p className="empty-state">Keine Provisionen in dieser Ansicht.</p>:null}
    </div></section>
  </main>;
}
