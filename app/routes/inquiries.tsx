import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/inquiries";
import { requirePermission } from "~/lib/auth.server";
import { zeitpunktKurz as formatDate } from "~/lib/format";
import { ANFRAGEKANAL as CHANNEL, ANFRAGESTATUS as STATUS } from "~/lib/labels";
import "~/inquiry.css";

type ActionResult={error?:string;ok?:string};

export const RESPONSE_STATE:Record<string,string>={
 IN_TIME:"in der Zielzeit",OVERDUE:"Zielzeit überschritten",ESCALATION_DUE:"Eskalation fällig",
 ANSWERED_IN_TIME:"rechtzeitig beantwortet",ANSWERED_LATE:"verspätet beantwortet",NO_TARGET:"ohne Zielzeit"};
export const RESPONSE_STATE_CLASS:Record<string,string>={
 IN_TIME:"status-draft",OVERDUE:"status-marketing",ESCALATION_DUE:"status-lost",
 ANSWERED_IN_TIME:"status-sold",ANSWERED_LATE:"status-lost",NO_TARGET:"status-archived"};

// Stunden lesbar machen: unter zwei Tagen in Stunden, darüber in Tagen.
export function elapsedLabel(hours:any){
 const n=Number(hours);
 if(!Number.isFinite(n))return"—";
 if(n<48)return `${n.toLocaleString("de-DE",{maximumFractionDigits:1})} ${n===1?"Stunde":"Stunden"}`;
 const days=Math.round(n/24);
 return `${days} ${days===1?"Tag":"Tage"}`;
}

function one(v:any){return Array.isArray(v)?v[0]:v;}

export async function loader({request,context}:Route.LoaderArgs){
 const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"inquiry.read");
 const u=new URL(request.url),q=(u.searchParams.get("q")??"").trim().toLowerCase(),status=u.searchParams.get("status")??"OPEN",channel=u.searchParams.get("channel")??"ALL",responsible=u.searchParams.get("responsible")??"ALL",archived=u.searchParams.get("archived")==="1";
 const [{data:rows,error},{data:profiles},responseRes,targetsRes,{data:canEscalate},{data:canManageTargets}]=await Promise.all([
  supabase.from("inquiries").select("id,inquiry_number,status,channel,source_label,message,received_at,answered_at,primary_responsible_user,updated_at,archived_at,contacts!inner(id,contact_number,first_name,last_name,email,phone,mobile),properties(id,property_number,internal_title),search_profiles(id,search_profile_number,title)").order("received_at",{ascending:false}).limit(500),
  supabase.from("profiles").select("user_id,display_name,status").eq("status","ACTIVE").order("display_name"),
  supabase.rpc("inquiry_response_overview",{p_only_open:false}),
  supabase.from("inquiry_response_targets").select("*").order("channel",{nullsFirst:true}),
  supabase.rpc("current_user_has_permission",{p_permission:"inquiry.escalate"}),
  supabase.rpc("current_user_has_permission",{p_permission:"settings.manage"})
 ]);
 if(error)throw new Response("Anfragen konnten nicht geladen werden.",{status:500});
 // Ein verschluckter Lesefehler sähe hier aus wie "keine Reaktionszeit überschritten".
 if(responseRes.error||targetsRes.error)throw new Response("Die Reaktionszeiten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
 const responseByInquiry=Object.fromEntries(((responseRes.data??[]) as any[]).map((row:any)=>[row.inquiry_id,row]));
 const profileMap=Object.fromEntries((profiles??[]).map((p:any)=>[p.user_id,p.display_name]));
 const filtered=(rows??[]).filter((r:any)=>{if(archived?!r.archived_at:r.archived_at)return false;if(status==="OPEN"&&["CLOSED","LOST"].includes(r.status))return false;if(status!=="ALL"&&status!=="OPEN"&&r.status!==status)return false;if(channel!=="ALL"&&r.channel!==channel)return false;if(responsible!=="ALL"&&r.primary_responsible_user!==responsible)return false;if(q){const c=one(r.contacts),p=one(r.properties),sp=one(r.search_profiles);const hay=[r.inquiry_number,c?.first_name,c?.last_name,c?.email,c?.phone,c?.mobile,p?.property_number,sp?.search_profile_number,r.message].filter(Boolean).join(" ").toLowerCase();if(!hay.includes(q))return false;}return true;});
 const response=(responseRes.data??[]) as any[];
 return data({rows:filtered,profiles:profiles??[],profileMap,profile,
  responseByInquiry,targets:targetsRes.data??[],
  canEscalate:canEscalate===true,canManageTargets:canManageTargets===true,
  responseSummary:{
   overdue:response.filter((r:any)=>r.state==="OVERDUE").length,
   escalationDue:response.filter((r:any)=>r.state==="ESCALATION_DUE").length,
   escalated:response.filter((r:any)=>r.escalated).length,
   late:response.filter((r:any)=>r.state==="ANSWERED_LATE").length,
   inTime:response.filter((r:any)=>r.state==="ANSWERED_IN_TIME").length,
  },
  filters:{q,status,channel,responsible,archived}},{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
 const {supabase,responseHeaders}=await requirePermission(request,context.cloudflare.env,"inquiry.escalate");
 const fd=await request.formData();
 if(String(fd.get("_intent")??"")!=="escalate")return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
 const {data:count,error}=await supabase.rpc("escalate_overdue_inquiries");
 if(error)return data<ActionResult>({error:String(error.message??"").includes("INQUIRY_ESCALATE_REQUIRED")?"Für das Eskalieren fehlt die Berechtigung.":"Die Eskalation konnte nicht ausgeführt werden."},{status:400,headers:responseHeaders()});
 const created=Number(count)||0;
 return data<ActionResult>({ok:created===0?"Es gab keine Anfrage, die zu eskalieren war.":created===1?"Eine Wiedervorlage wurde angelegt.":`${created} Wiedervorlagen wurden angelegt.`},{headers:responseHeaders()});
}
export default function Inquiries(){const d=useLoaderData<typeof loader>();const {rows,profiles,profileMap,profile,filters}=d;const actionData=useActionData<typeof action>();const summary=d.responseSummary as any;const responseByInquiry=d.responseByInquiry as Record<string,any>;return <main className="editor-shell"><header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Modul 04 · Interessenten</p><h1 className="editor-title">Anfragen</h1><p className="editor-meta">Eingehende Käufer- und Mieteranfragen mit Kontakt-, Objekt- und Suchprofilbezug.</p></div><div className="header-user"><Link className="primary-button link-button" to="/inquiries/new">+ Anfrage</Link><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header><div className="inquiry-page">
{actionData?.error?<p className="form-error">{actionData.error}</p>:null}
{actionData?.ok?<p className="form-success">{actionData.ok}</p>:null}
<section className="data-card" id="reaktionszeit">
 <div className="card-head"><div><p className="eyebrow">Zeit bis zur ersten Antwort</p><h2>Reaktionszeit</h2></div>{d.canEscalate?<Form method="post"><input type="hidden" name="_intent" value="escalate"/><button className="secondary-button" type="submit">Überfällige eskalieren</button></Form>:null}</div>
 <div className="metric-grid">
  <article className="metric"><span>Zielzeit überschritten</span><strong>{summary.overdue}</strong><small>{summary.overdue===1?"offene Anfrage über der Zielzeit":"offene Anfragen über der Zielzeit"}</small></article>
  <article className="metric"><span>Eskalation fällig</span><strong>{summary.escalationDue}</strong><small>{summary.escalated>0?`${summary.escalated} bereits eskaliert`:"noch nichts eskaliert"}</small></article>
  <article className="metric"><span>Verspätet beantwortet</span><strong>{summary.late}</strong><small>{summary.inTime} rechtzeitig</small></article>
 </div>
 <p className="subtle">Die Zielzeit wird je Kanal vorgegeben. Eskalieren legt je überfälliger Anfrage genau eine Wiedervorlage für den Verantwortlichen an — einmalig und nur auf Knopfdruck.</p>
 {d.canManageTargets?<div className="data-list" style={{marginTop:"0.75rem"}}>{(d.targets as any[]).map((t:any)=>
  <div className="data-row" key={t.id}>
   <div><strong>{t.channel?CHANNEL[t.channel]??t.channel:"Allgemeine Vorgabe"}</strong><small>{t.note??"ohne Notiz"}</small></div>
   <div className="row-meta"><span>Ziel {t.target_hours} h</span><small>Eskalation ab {t.escalation_hours} h</small></div>
   <div className="row-meta"><span className={t.active?"status-pill status-sold":"status-pill status-archived"}>{t.active?"Aktiv":"Inaktiv"}</span></div>
  </div>)}</div>:null}
</section>
<section className="data-card"><Form method="get" className="inquiry-filter-grid"><label><span>Suche</span><input name="q" defaultValue={filters.q} placeholder="Name, Anfrage-, Objekt- oder Profilnummer"/></label><label><span>Status</span><select name="status" defaultValue={filters.status}><option value="OPEN">Offen</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label><span>Kanal</span><select name="channel" defaultValue={filters.channel}><option value="ALL">Alle</option>{Object.entries(CHANNEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><label><span>Verantwortlich</span><select name="responsible" defaultValue={filters.responsible}><option value="ALL">Alle</option>{profiles.map((p:any)=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label><button className="secondary-button" type="submit">Filtern</button><label className="checkbox-row"><input name="archived" type="checkbox" value="1" defaultChecked={filters.archived}/><span>Archiv anzeigen</span></label></Form></section><section className="data-card"><div className="card-head"><div><p className="eyebrow">Anfragen</p><h2>{rows.length} Treffer</h2></div><Link className="subtle-link" to="/search-profiles">Suchprofile öffnen</Link></div><div className="inquiry-list">{rows.map((r:any)=>{const c=one(r.contacts),p=one(r.properties),sp=one(r.search_profiles);return <Link className="inquiry-row" to={`/inquiries/${r.id}`} key={r.id}><div><strong>{c?`${c.first_name} ${c.last_name}`:r.inquiry_number}</strong><small>{r.inquiry_number} · {CHANNEL[r.channel]??r.channel}</small><small>{r.message?.slice(0,110)??"Keine Nachricht"}</small></div><div><span className={`inquiry-status ${String(r.status).toLowerCase()}`}>{STATUS[r.status]??r.status}</span><small>{profileMap[r.primary_responsible_user]??"Nicht zugeordnet"}</small></div><div><strong>{p?.property_number??sp?.search_profile_number??"Ohne Zuordnung"}</strong><small>{p?.internal_title??sp?.title??"Kontaktanfrage"}</small><small>Eingang {formatDate(r.received_at)}</small></div>{(()=>{const rt=responseByInquiry[r.id];if(!rt)return <div><small>ohne Reaktionszeit</small></div>;return <div><span className={`status-pill ${RESPONSE_STATE_CLASS[rt.state]??"status-draft"}`}>{RESPONSE_STATE[rt.state]??rt.state}</span><small>{elapsedLabel(rt.elapsed_hours)}{rt.target_hours?` von ${rt.target_hours} h`:""}</small><small>{rt.escalated?"eskaliert":""}</small></div>;})()}<span className="subtle-link">Öffnen →</span></Link>})}{rows.length===0?<p className="empty-state">Keine Anfragen in dieser Ansicht.</p>:null}</div></section></div></main>}
