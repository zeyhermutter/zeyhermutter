import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/leads";
import { requirePermission } from "~/lib/auth.server";
import "~/lead.css";
import "~/lead-workflow.css";
import "~/lead-object-state.css";

const STATUS_ORDER=["NEW","CONTACTED","QUALIFIED","APPOINTMENT","VALUATION","OFFER","WON","NURTURE","LOST"] as const;
const MAIN_STATUSES=["NEW","CONTACTED","QUALIFIED","APPOINTMENT","VALUATION","OFFER","WON"] as const;
const OUTCOME_STATUSES=["NURTURE","LOST"] as const;
const STATUS_LABELS:Record<string,string>={NEW:"Neu",CONTACTED:"Kontaktiert",QUALIFIED:"Qualifiziert",APPOINTMENT:"Termin",VALUATION:"Bewertung",OFFER:"Angebot",WON:"Gewonnen",NURTURE:"Später nachfassen",LOST:"Verloren"};
const STATUS_HELP:Record<string,string>={NEW:"Neu eingegangen",CONTACTED:"Erstkontakt erfolgt",QUALIFIED:"Auftrag grundsätzlich passend",APPOINTMENT:"Termin vereinbart",VALUATION:"Bewertung läuft",OFFER:"Maklerangebot liegt vor",WON:"Auftrag gewonnen",NURTURE:"Zu einem späteren Zeitpunkt wieder aufnehmen",LOST:"Auftrag verloren"};
const APARTMENT_TYPES=new Set(["APARTMENT","PENTHOUSE","MAISONETTE"]);
const HOUSE_TYPES=new Set(["DETACHED_HOUSE","SEMI_DETACHED_HOUSE","TERRACED_HOUSE"]);
const COMMERCIAL_TYPES=new Set(["COMMERCIAL","OFFICE","RETAIL"]);
function one(value:any){return Array.isArray(value)?value[0]:value;}
function fmt(value:string|null){return value?new Intl.DateTimeFormat("de-DE",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(value)):"—";}
function address(row:any){return [row.property_street,row.property_house_number].filter(Boolean).join(" ")+(row.property_postal_code||row.property_city?`, ${[row.property_postal_code,row.property_city].filter(Boolean).join(" ")}`:"");}
function positive(value:any){return Number(value)>0;}
function wonObjectState(row:any){
  if(row.status!=="WON")return null;
  if(row.converted_property_id)return {key:"created",label:"Immobilie angelegt",help:"Objektakte wurde erzeugt"};
  const addressComplete=[row.property_street,row.property_house_number,row.property_postal_code,row.property_city].every(v=>String(v??"").trim().length>0);
  let typeComplete=true;
  if(APARTMENT_TYPES.has(row.property_type))typeComplete=positive(row.living_area_sqm)&&positive(row.rooms);
  else if(HOUSE_TYPES.has(row.property_type))typeComplete=positive(row.living_area_sqm)&&positive(row.plot_area_sqm)&&positive(row.rooms);
  else if(row.property_type==="APARTMENT_BUILDING")typeComplete=positive(row.living_area_sqm)&&positive(row.plot_area_sqm);
  else if(row.property_type==="LAND")typeComplete=positive(row.plot_area_sqm);
  else if(COMMERCIAL_TYPES.has(row.property_type))typeComplete=positive(row.living_area_sqm);
  else if(row.property_type==="OTHER")typeComplete=positive(row.living_area_sqm)||positive(row.plot_area_sqm)||positive(row.rooms);
  const ready=Boolean(row.source_id&&row.property_type&&addressComplete&&row.occupancy_status&&row.occupancy_status!=="UNKNOWN"&&String(row.desired_sale_horizon??"").trim()&&typeComplete&&(positive(row.price_expectation)||positive(row.estimated_market_value)));
  return ready?{key:"ready",label:"Bereit zur Objektanlage",help:"Alle Pflichtangaben sind vollständig"}:{key:"prepare",label:"Objektanlage vorbereiten",help:"Pflichtangaben vervollständigen"};
}
function errorMessage(message:string){
  const normalized=message.toLowerCase();
  if(normalized.includes("lead source required"))return "Ab Qualifiziert muss zuerst eine Leadquelle gespeichert werden.";
  if(normalized.includes("invalid lead status transition"))return "Dieser Statuswechsel ist im Workflow nicht erlaubt.";
  if(normalized.includes("lost reason required"))return "Für Verloren ist ein Verlustgrund erforderlich.";
  if(normalized.includes("converted lead business data is immutable"))return "Dieser Lead wurde bereits in eine Immobilie übernommen und ist fachlich gesperrt.";
  return "Der Status konnte nicht geändert werden.";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"lead.read");
  const url=new URL(request.url); const q=(url.searchParams.get("q")??"").trim().toLowerCase(); const status=url.searchParams.get("status")??"ALL"; const source=url.searchParams.get("source")??"ALL"; const responsible=url.searchParams.get("responsible")??"ALL"; const followup=url.searchParams.get("followup")??"ALL"; const archived=url.searchParams.get("archived")==="1"; const page=Math.max(1,Number(url.searchParams.get("page")??"1")||1); const pageSize=50;
  const [{data:rows,error},{data:sources},{data:profiles},{data:transitions}]=await Promise.all([
    supabase.from("leads").select("id,lead_number,status,source_id,follow_up_at,primary_responsible_user,property_street,property_house_number,property_postal_code,property_city,property_type,occupancy_status,desired_sale_horizon,living_area_sqm,plot_area_sqm,rooms,price_expectation,estimated_market_value,created_at,updated_at,archived_at,version,converted_property_id,contacts!inner(id,first_name,last_name,email,phone,mobile),lead_sources(id,key,label)").order("updated_at",{ascending:false}).limit(500),
    supabase.from("lead_sources").select("id,key,label,sort_order").eq("active",true).order("sort_order"),
    supabase.from("profiles").select("user_id,display_name,status").eq("status","ACTIVE").order("display_name"),
    supabase.from("lead_status_transitions").select("from_status,to_status")
  ]);
  if(error)throw new Response("Leads konnten nicht geladen werden.",{status:500});
  const now=Date.now(); const activeRows=(rows??[]).filter((r:any)=>archived?Boolean(r.archived_at):!r.archived_at);
  const pipeline=STATUS_ORDER.map(s=>({status:s,count:activeRows.filter((r:any)=>r.status===s).length,overdue:activeRows.filter((r:any)=>r.status===s&&r.follow_up_at&&new Date(r.follow_up_at).getTime()<now).length}));
  const wonBreakdown=activeRows.filter((r:any)=>r.status==="WON").reduce((acc:any,row:any)=>{const state=wonObjectState(row);if(state)acc[state.key]=(acc[state.key]??0)+1;return acc;},{prepare:0,ready:0,created:0});
  let filtered=activeRows.filter((r:any)=>{
    const c=one(r.contacts); const hay=[r.lead_number,c?.first_name,c?.last_name,c?.email,c?.phone,c?.mobile,r.property_street,r.property_house_number,r.property_postal_code,r.property_city].filter(Boolean).join(" ").toLowerCase();
    if(q&&!hay.includes(q))return false; if(status!=="ALL"&&r.status!==status)return false; if(source!=="ALL"&&r.source_id!==source)return false; if(responsible!=="ALL"&&r.primary_responsible_user!==responsible)return false; if(followup==="OVERDUE"&&!(r.follow_up_at&&new Date(r.follow_up_at).getTime()<now))return false; if(followup==="OPEN"&&!r.follow_up_at)return false; return true;
  });
  const total=filtered.length,totalPages=Math.max(1,Math.ceil(total/pageSize)); filtered=filtered.slice((page-1)*pageSize,page*pageSize);
  const profileMap=Object.fromEntries((profiles??[]).map((p:any)=>[p.user_id,p.display_name]));
  const transitionMap:Record<string,string[]>={};
  for(const transition of transitions??[]){(transitionMap[transition.from_status]??=[]).push(transition.to_status);}
  return data({rows:filtered,sources:sources??[],profiles:profiles??[],profileMap,pipeline,wonBreakdown,transitionMap,profile,filters:{q,status,source,responsible,followup,archived,page},total,totalPages},{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders}=await requirePermission(request,context.cloudflare.env,"lead.write");
  const fd=await request.formData();
  if(String(fd.get("_intent")??"")!=="status")return data({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
  const leadId=String(fd.get("lead_id")??""); const nextStatus=String(fd.get("status")??""); const expectedVersion=Number(fd.get("version")); const lostReason=String(fd.get("lost_reason")??"").trim();
  if(!leadId||!STATUS_ORDER.includes(nextStatus as any)||!Number.isFinite(expectedVersion))return data({error:"Ungültige Statusänderung."},{status:400,headers:responseHeaders()});
  if(nextStatus==="LOST"&&!lostReason)return data({error:"Für Verloren ist ein Verlustgrund erforderlich.",leadId},{status:400,headers:responseHeaders()});
  const patch:any={status:nextStatus};
  if(nextStatus==="LOST")patch.lost_reason=lostReason; else patch.lost_reason=null;
  const {data:updated,error}=await supabase.from("leads").update(patch).eq("id",leadId).eq("version",expectedVersion).select("id,status,version").maybeSingle();
  if(error)return data({error:errorMessage(error.message),leadId},{status:400,headers:responseHeaders()});
  if(!updated)return data({error:"Der Lead wurde inzwischen geändert. Seite neu laden und erneut versuchen.",leadId},{status:409,headers:responseHeaders()});
  return data({ok:true,leadId,status:updated.status},{headers:responseHeaders()});
}

export default function Leads(){
  const {rows,sources,profiles,profileMap,pipeline,wonBreakdown,transitionMap,profile,filters,total,totalPages}=useLoaderData<typeof loader>();
  const actionData=useActionData<typeof action>();
  const actionError=actionData&&"error" in actionData?actionData.error:null;
  const pipelineByStatus=Object.fromEntries(pipeline.map(stage=>[stage.status,stage]));
  const pageHref=(page:number)=>{const p=new URLSearchParams(); if(filters.q)p.set("q",filters.q); if(filters.status!=="ALL")p.set("status",filters.status); if(filters.source!=="ALL")p.set("source",filters.source); if(filters.responsible!=="ALL")p.set("responsible",filters.responsible); if(filters.followup!=="ALL")p.set("followup",filters.followup); if(filters.archived)p.set("archived","1"); p.set("page",String(page)); return `?${p.toString()}`;};
  const filterHref=(status:string)=>{const p=new URLSearchParams(); if(status!=="ALL")p.set("status",status); if(filters.source!=="ALL")p.set("source",filters.source); if(filters.responsible!=="ALL")p.set("responsible",filters.responsible); if(filters.followup!=="ALL")p.set("followup",filters.followup); if(filters.q)p.set("q",filters.q); return `?${p.toString()}`;};
  const renderStage=(status:string,index?:number)=>{const stage=pipelineByStatus[status]??{status,count:0,overdue:0};return <Link key={status} className={`lead-workflow-step${filters.status===status?" active":""}${status==="LOST"?" outcome-lost":""}${status==="WON"?" outcome-won":""}`} to={filterHref(status)}>{index!==undefined?<span className="lead-workflow-index">{index+1}</span>:<span className="lead-workflow-index outcome">↳</span>}<span className="lead-workflow-copy"><strong>{STATUS_LABELS[status]}</strong><small>{STATUS_HELP[status]}</small>{status==="WON"?<small className="won-breakdown">{wonBreakdown.prepare} vorbereiten · {wonBreakdown.ready} bereit · {wonBreakdown.created} angelegt</small>:null}</span><span className="lead-workflow-count">{stage.count}</span>{stage.overdue>0?<span className="lead-workflow-overdue">{stage.overdue} überfällig</span>:null}</Link>;};
  return <main className="editor-shell lead-shell">
    <header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Modul 03 · Eigentümer & Leads</p><h1 className="editor-title">Verkäufer-Leads</h1><p className="editor-meta">Interessenten für einen möglichen Verkaufs- oder Bewertungsauftrag</p></div><div className="header-user"><Link className="primary-button link-button" to="/leads/new">+ Lead</Link><span className="badge">STAGING</span><small>{profile.display_name}</small></div></header>
    <div className="lead-page-width">
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Was ist ein Lead?</p><h2>Potenzieller Auftrag</h2></div></div><p className="lead-explainer"><strong>Ein Lead ist noch keine Immobilie.</strong> Er steht für einen potenziellen Verkäufer oder Eigentümer, der sich z. B. wegen einer Bewertung oder eines Verkaufs meldet. Wird daraus ein Auftrag, kann der Lead später kontrolliert in eine Immobilie übernommen werden.</p></section>
      <section className="data-card lead-workflow-board"><div className="card-head"><div><p className="eyebrow">Status & Workflow</p><h2>Verkäufer-Pipeline</h2></div><Link className="subtle-link" to={filterHref("ALL")}>Alle Leads</Link></div><p className="lead-pipeline-note">Die Hauptstrecke führt von Neu bis Gewonnen. Nach „Gewonnen“ zeigt ein eigener Bearbeitungszustand, ob die Objektanlage noch vorbereitet werden muss, bereits möglich ist oder abgeschlossen wurde. Später nachfassen und Verloren sind Nebenpfade.</p><div className="lead-workflow-main">{MAIN_STATUSES.map((status,index)=>renderStage(status,index))}</div><div className="lead-workflow-outcomes"><span className="lead-workflow-outcome-label">Nebenpfade</span>{OUTCOME_STATUSES.map(status=>renderStage(status))}</div></section>
      <section className="data-card"><Form method="get" className="lead-filter-grid"><label><span>Suche</span><input name="q" defaultValue={filters.q} placeholder="Leadnummer, Kontakt, Telefon, E-Mail, Adresse"/></label><label><span>Status</span><select name="status" defaultValue={filters.status}><option value="ALL">Alle</option>{STATUS_ORDER.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label><label><span>Quelle</span><select name="source" defaultValue={filters.source}><option value="ALL">Alle</option>{sources.map((s:any)=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label><label><span>Verantwortlich</span><select name="responsible" defaultValue={filters.responsible}><option value="ALL">Alle</option>{profiles.map((p:any)=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label><label><span>Wiedervorlage</span><select name="followup" defaultValue={filters.followup}><option value="ALL">Alle</option><option value="OPEN">Mit Wiedervorlage</option><option value="OVERDUE">Überfällig</option></select></label><label className="checkbox-row"><input type="checkbox" name="archived" value="1" defaultChecked={filters.archived}/><span>Archiv anzeigen</span></label><button className="secondary-button" type="submit">Filtern</button></Form></section>
      {actionError?<div className="form-error lead-workflow-error">{actionError}</div>:null}
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Leads</p><h2>{total} Treffer</h2></div><Link className="subtle-link" to="/leads/new">Lead anlegen</Link></div><div className="data-list lead-overview-list">{rows.map((r:any)=>{const c=one(r.contacts),src=one(r.lead_sources),overdue=r.follow_up_at&&new Date(r.follow_up_at).getTime()<Date.now(); const nextStatuses=(transitionMap[r.status]??[]).filter((s:string)=>STATUS_ORDER.includes(s as any)); const locked=Boolean(r.converted_property_id)||Boolean(r.archived_at); const objectState=wonObjectState(r); return <article className="data-row lead-list-row lead-overview-row" key={r.id}><Link className="lead-row-main-link" to={`/leads/${r.id}`}><div><strong>{c?`${c.first_name} ${c.last_name}`:"Kontakt"}</strong><small>{r.lead_number} · {src?.label??"Quelle offen"}</small></div><div><span className={`lead-status-pill status-${String(r.status).toLowerCase()}`}>{STATUS_LABELS[r.status]??r.status}</span>{objectState?<span className={`lead-object-state state-${objectState.key}`}>{objectState.label}</span>:null}<small>{profileMap[r.primary_responsible_user]??"—"}</small></div><div><strong>{address(r)||"Objektadresse offen"}</strong><small className={overdue?"lead-overdue":""}>Wiedervorlage {fmt(r.follow_up_at)}</small></div><div className="lead-row-secondary"><small>Angelegt {fmt(r.created_at)}</small><small>Geändert {fmt(r.updated_at)}</small></div></Link><div className="lead-row-workflow">{r.converted_property_id?<Link className="secondary-button compact link-button lead-object-action created" to={`/leads/${r.id}`}>Immobilie angelegt →</Link>:r.status==="WON"&&objectState?<Link className={`secondary-button compact link-button lead-object-action ${objectState.key}`} to={`/leads/${r.id}`}>{objectState.key==="ready"?"Immobilie anlegen":"Objektanlage vorbereiten"} →</Link>:locked?<Link className="secondary-button compact link-button" to={`/leads/${r.id}`}>Öffnen →</Link>:<details className="lead-workflow-menu"><summary className="secondary-button compact">Status ändern</summary><div className="lead-workflow-popover"><div className="lead-workflow-popover-head"><strong>{STATUS_LABELS[r.status]}</strong><small>{STATUS_HELP[r.status]}</small></div>{nextStatuses.length===0?<small className="lead-workflow-finished">Keine weitere Statusaktion verfügbar.</small>:nextStatuses.map((next:string)=>next==="LOST"?<Form method="post" className="lead-lost-inline" key={next}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="lead_id" value={r.id}/><input type="hidden" name="version" value={r.version}/><input type="hidden" name="status" value="LOST"/><label><span>Als verloren markieren</span><input name="lost_reason" required placeholder="Verlustgrund"/></label><button className="secondary-button compact" type="submit">Verloren</button></Form>:<Form method="post" key={next}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="lead_id" value={r.id}/><input type="hidden" name="version" value={r.version}/><input type="hidden" name="status" value={next}/><button className="lead-workflow-action" type="submit"><span>→</span><span><strong>{STATUS_LABELS[next]}</strong><small>{STATUS_HELP[next]}</small></span></button></Form>)}</div></details>}<Link className="lead-open-link" to={`/leads/${r.id}`}>Öffnen →</Link></div></article>})}{rows.length===0?<p className="empty-state">Keine Leads in dieser Ansicht.</p>:null}</div>{totalPages>1?<div className="lead-pagination"><span>Seite {filters.page} von {totalPages}</span><div className="inline-actions">{filters.page>1?<Link className="secondary-button link-button" to={pageHref(filters.page-1)}>← Zurück</Link>:null}{filters.page<totalPages?<Link className="secondary-button link-button" to={pageHref(filters.page+1)}>Weiter →</Link>:null}</div></div>:null}</section>
    </div>
  </main>;
}
