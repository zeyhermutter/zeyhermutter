import { data, Form, Link, useActionData, useLoaderData, redirect } from "react-router";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/inquiries";
import { requirePermission } from "~/lib/auth.server";
import { zeitpunktKurz as formatDate } from "~/lib/format";
import { ANFRAGEKANAL as CHANNEL, ANFRAGESTATUS as STATUS } from "~/lib/labels";
import { Ampel, useNaechsteSchritte } from "~/components/ampel";
import { Aufklapper } from "~/components/aufklapper";
import { seiteAus, seitenzahl, sicher, enthaelt, inListe, passendeBezuege, BEZUG_GRENZE } from "~/lib/blaettern.server";
import { Seiten, SucheZuAllgemein } from "~/components/seiten";
import "~/programm-liste.css";

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
  // Einstieg: gleich den obersten Datensatz im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if(istEinstieg(request)){const {data:erster}=await supabase.from("inquiries").select("id").is("archived_at",null).order("received_at",{ascending:false}).limit(1).maybeSingle(); if(erster)throw redirect(`/inquiries/${erster.id}`,{headers:responseHeaders()});}
 const u=new URL(request.url),q=(u.searchParams.get("q")??"").trim(),status=u.searchParams.get("status")??"OPEN",channel=u.searchParams.get("channel")??"ALL",responsible=u.searchParams.get("responsible")??"ALL",archived=u.searchParams.get("archived")==="1";
 // Blaettern ueber die Datenbank (19.10.2026, app/lib/blaettern.server.ts):
 // gefiltert, gezaehlt und geblaettert wird dort. Die Reaktionszeit-Kennzahlen
 // zaehlt die Datenbank, Reaktionszeiten geholt werden nur fuer die Seite.
 const {page,from,to}=seiteAus(u);const text=sicher(q);
 const [bezug,profilTreffer]=await Promise.all([passendeBezuege(supabase,q,{kontakte:true,objekte:true}),text?supabase.from("search_profiles").select("id").ilike("search_profile_number",`%${text}%`).limit(BEZUG_GRENZE):Promise.resolve({data:[]})]);
 let abfrage=supabase.from("inquiries").select("id,inquiry_number,status,channel,source_label,message,received_at,answered_at,primary_responsible_user,updated_at,archived_at,contacts!inner(id,contact_number,first_name,last_name,email,phone,mobile),properties(id,property_number,internal_title),search_profiles(id,search_profile_number,title)",{count:"exact"});
 abfrage=archived?abfrage.not("archived_at","is",null):abfrage.is("archived_at",null);
 if(status==="OPEN")abfrage=abfrage.not("status","in","(CLOSED,LOST)");else if(status!=="ALL")abfrage=abfrage.eq("status",status);
 if(channel!=="ALL")abfrage=abfrage.eq("channel",channel);
 if(responsible!=="ALL")abfrage=abfrage.eq("primary_responsible_user",responsible);
 if(text)abfrage=abfrage.or([enthaelt(["inquiry_number","message","source_label"],text),inListe("contact_id",bezug.kontakte),inListe("property_id",bezug.objekte),inListe("search_profile_id",((profilTreffer.data??[]) as any[]).map(r=>r.id))].join(","));
 const zaehle=(f:(a:any)=>any)=>f(supabase.rpc("inquiry_response_overview",{p_only_open:false},{count:"exact"}).select("inquiry_id")).limit(1);
 const [{data:rows,error,count},{data:profiles},targetsRes,{data:canEscalate},{data:canManageTargets},...zahlen]=await Promise.all([
  abfrage.order("received_at",{ascending:false}).range(from,to),
  supabase.from("profiles").select("user_id,display_name,status").eq("status","ACTIVE").order("display_name"),
  supabase.from("inquiry_response_targets").select("*").order("channel",{nullsFirst:true}),
  supabase.rpc("current_user_has_permission",{p_permission:"inquiry.escalate"}),
  supabase.rpc("current_user_has_permission",{p_permission:"settings.manage"}),
  zaehle(a=>a.eq("state","OVERDUE")),
  zaehle(a=>a.eq("state","ESCALATION_DUE")),
  zaehle(a=>a.eq("escalated",true)),
  zaehle(a=>a.eq("state","ANSWERED_LATE")),
  zaehle(a=>a.eq("state","ANSWERED_IN_TIME")),
 ]);
 if(error)throw new Response("Anfragen konnten nicht geladen werden.",{status:500});
 const seitenIds=((rows??[]) as any[]).map(r=>r.id);
 const responseRes=seitenIds.length?await supabase.rpc("inquiry_response_overview",{p_only_open:false}).in("inquiry_id",seitenIds):{data:[],error:null};
 // Ein verschluckter Lesefehler sähe hier aus wie "keine Reaktionszeit überschritten".
 if(responseRes.error||targetsRes.error||zahlen.some((z:any)=>z.error))throw new Response("Die Reaktionszeiten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
 const responseByInquiry=Object.fromEntries(((responseRes.data??[]) as any[]).map((row:any)=>[row.inquiry_id,row]));
 const profileMap=Object.fromEntries((profiles??[]).map((p:any)=>[p.user_id,p.display_name]));
 const [overdue,escalationDue,escalated,late,inTime]=zahlen.map((z:any)=>z.count??0);
 return data({rows:rows??[],total:count??0,page,pageCount:seitenzahl(count),zuViele:bezug.zuViele,profiles:profiles??[],profileMap,profile,
  responseByInquiry,targets:targetsRes.data??[],
  canEscalate:canEscalate===true,canManageTargets:canManageTargets===true,
  responseSummary:{overdue,escalationDue,escalated,late,inTime},
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

// Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026):
// Werkzeugleiste, eine Zeile Kennzahlen zur Reaktionszeit, Tabelle. Vorher
// Seitenkopf, drei Kacheln, Filterkasten und Kartenzeilen. Die Zielzeiten je
// Kanal stehen jetzt im Aufklapper statt offen über der Liste.
export default function Inquiries(){
 const schritte=useNaechsteSchritte("inquiry");
 const d=useLoaderData<typeof loader>();
 const {rows,profiles,profileMap,filters}=d;
 const actionData=useActionData<typeof action>();
 const summary=d.responseSummary as any;
 const responseByInquiry=d.responseByInquiry as Record<string,any>;
 const gefiltert=Boolean(filters.q||filters.status!=="OPEN"||filters.channel!=="ALL"||filters.responsible!=="ALL"||filters.archived);
 return <main className="editor-shell programm-liste">
  <Form method="get" className="programm-liste-werkzeuge" role="search">
   <input type="hidden" name="ansicht" value="tabelle"/>
   <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={filters.q} placeholder="Name, Anfrage-, Objekt- oder Profilnummer …" autoComplete="off"/></label>
   <label><span className="sr-only">Status</span><select name="status" defaultValue={filters.status}><option value="OPEN">Offene Anfragen</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label><span className="sr-only">Kanal</span><select name="channel" defaultValue={filters.channel}><option value="ALL">Alle Kanäle</option>{Object.entries(CHANNEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label><span className="sr-only">Verantwortlich</span><select name="responsible" defaultValue={filters.responsible}><option value="ALL">Alle Verantwortlichen</option>{profiles.map((p:any)=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label>
   <label className="programm-liste-haken"><input name="archived" type="checkbox" value="1" defaultChecked={filters.archived}/>Archiv</label>
   <button className="secondary-button" type="submit">Filtern</button>
   <span className="programm-liste-zaehler">{d.total} {d.total===1?"Anfrage":"Anfragen"}</span>
   <Link className="secondary-button link-button" to="/inquiries/assistent">Anfrage einfügen</Link>
   <Link className="programm-liste-neu" to="/inquiries/new">+ Neue Anfrage</Link>
  </Form>

  {actionData?.error?<p className="form-error">{actionData.error}</p>:null}
  {actionData?.ok?<p className="form-success">{actionData.ok}</p>:null}

  <p className="programm-kennzahlen" id="reaktionszeit">
   <span className={summary.overdue?"warnung":undefined}><strong>{summary.overdue}</strong> über der Zielzeit</span>
   <span className={summary.escalationDue?"warnung":undefined}><strong>{summary.escalationDue}</strong> Eskalation fällig{summary.escalated>0?` (${summary.escalated} eskaliert)`:""}</span>
   <span><strong>{summary.late}</strong> verspätet beantwortet</span>
   <span><strong>{summary.inTime}</strong> rechtzeitig</span>
   {d.canEscalate?<Form method="post" className="programm-liste-rechts"><input type="hidden" name="_intent" value="escalate"/><button className="secondary-button" type="submit" title="Legt je überfälliger Anfrage genau eine Wiedervorlage für den Verantwortlichen an — einmalig und nur auf Knopfdruck.">Überfällige eskalieren</button></Form>:null}
  </p>

  <div className="programm-tabelle-rahmen">
   {rows.length===0?<p className="programm-liste-leer">{gefiltert?"Keine Anfrage passt zu diesem Filter.":"Keine offenen Anfragen."} <Link to="/inquiries/new">Anfrage erfassen</Link></p>:<table className="programm-tabelle">
    <thead><tr><th scope="col">Nummer</th><th scope="col">Kontakt</th><th scope="col">Bezug</th><th scope="col">Kanal</th><th scope="col">Status</th><th scope="col">Verantwortlich</th><th scope="col">Reaktionszeit</th><th scope="col" className="rechts">Eingang</th></tr></thead>
    <tbody>{rows.map((r:any)=>{const c=one(r.contacts),p=one(r.properties),sp=one(r.search_profiles),rt=responseByInquiry[r.id];return <tr key={r.id}>
     <td className="zahl"><Link to={`/inquiries/${r.id}`}>{r.inquiry_number}</Link></td>
     <td><Link to={`/inquiries/${r.id}`}>{c?`${c.first_name} ${c.last_name}`:"Kontakt"}</Link>{r.message?<div className="leise">{r.message.slice(0,80)}{r.message.length>80?" …":""}</div>:null}</td>
     <td>{p?<><Link to={`/properties/${p.id}`}>{p.property_number}</Link><div className="leise">{p.internal_title}</div></>:sp?<><Link to={`/search-profiles/${sp.id}`}>{sp.search_profile_number}</Link><div className="leise">{sp.title}</div></>:<span className="leise">ohne Zuordnung</span>}</td>
     <td>{CHANNEL[r.channel]??r.channel}{r.source_label?<div className="leise">{r.source_label}</div>:null}</td>
     <td><span className="ampel-neben">{r.archived_at?"Archiviert":STATUS[r.status]??r.status}<Ampel s={schritte[r.id]}/></span></td>
     <td>{profileMap[r.primary_responsible_user]??<span className="leise">nicht zugeordnet</span>}</td>
     <td>{rt?<><span className={`status-pill ${RESPONSE_STATE_CLASS[rt.state]??"status-draft"}`}>{RESPONSE_STATE[rt.state]??rt.state}</span><div className="leise">{elapsedLabel(rt.elapsed_hours)}{rt.target_hours?` von ${rt.target_hours} h`:""}{rt.escalated?" · eskaliert":""}</div></>:<span className="leise">ohne Zielzeit</span>}</td>
     <td className="zahl rechts leise">{formatDate(r.received_at)}</td>
    </tr>;})}</tbody>
   </table>}
   <SucheZuAllgemein an={d.zuViele}/>
  </div>
  <Seiten page={d.page} pageCount={d.pageCount}/>

  {d.canManageTargets?<Aufklapper id="zielzeiten" knopf={`Zielzeiten je Kanal (${(d.targets as any[]).length})`}>
   <p className="programm-erklaerung">Die Zielzeit bis zur ersten Antwort wird je Kanal vorgegeben; ab der Eskalationszeit gilt eine Anfrage als zu eskalieren.</p>
   <table className="programm-tabelle"><thead><tr><th scope="col">Kanal</th><th scope="col">Notiz</th><th scope="col" className="rechts">Ziel</th><th scope="col" className="rechts">Eskalation ab</th><th scope="col">Stand</th></tr></thead>
    <tbody>{(d.targets as any[]).map((t:any)=><tr key={t.id}><td>{t.channel?CHANNEL[t.channel]??t.channel:"Allgemeine Vorgabe"}</td><td>{t.note??<span className="leise">—</span>}</td><td className="zahl rechts">{t.target_hours} h</td><td className="zahl rechts">{t.escalation_hours} h</td><td><span className={t.active?"status-pill status-sold":"status-pill status-archived"}>{t.active?"Aktiv":"Inaktiv"}</span></td></tr>)}</tbody>
   </table>
  </Aufklapper>:null}
 </main>;
}
