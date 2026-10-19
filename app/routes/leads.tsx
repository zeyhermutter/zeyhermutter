import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { Aufklapper } from "~/components/aufklapper";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/leads";
import { requirePermission } from "~/lib/auth.server";
import { zeitpunktKurz as fmt } from "~/lib/format";
import { Ampel, useNaechsteSchritte } from "~/components/ampel";
import "~/lead-workflow.css";
import { seiteAus, seitenzahl, sicher, enthaelt, inListe, passendeBezuege, seiteZuWeit } from "~/lib/blaettern.server";
import { SucheZuAllgemein } from "~/components/seiten";
import "~/programm-liste.css";

const STATUS_ORDER=["NEW","CONTACTED","QUALIFIED","APPOINTMENT","VALUATION","OFFER","WON","NURTURE","LOST"] as const;
const MAIN_STATUSES=["NEW","CONTACTED","QUALIFIED","APPOINTMENT","VALUATION","OFFER","WON"] as const;
const OUTCOME_STATUSES=["NURTURE","LOST"] as const;
const STATUS_LABELS:Record<string,string>={NEW:"Neu",CONTACTED:"Kontaktiert",QUALIFIED:"Qualifiziert",APPOINTMENT:"Termin",VALUATION:"Bewertung",OFFER:"Angebot",WON:"Gewonnen",NURTURE:"Später nachfassen",LOST:"Verloren"};
const STATUS_HELP:Record<string,string>={NEW:"Neu eingegangen",CONTACTED:"Erstkontakt erfolgt",QUALIFIED:"Auftrag grundsätzlich passend",APPOINTMENT:"Termin vereinbart",VALUATION:"Bewertung läuft",OFFER:"Maklerangebot liegt vor",WON:"Auftrag gewonnen",NURTURE:"Zu einem späteren Zeitpunkt wieder aufnehmen",LOST:"Auftrag verloren"};
const APARTMENT_TYPES=new Set(["APARTMENT","PENTHOUSE","MAISONETTE"]);
const HOUSE_TYPES=new Set(["DETACHED_HOUSE","SEMI_DETACHED_HOUSE","TERRACED_HOUSE"]);
const COMMERCIAL_TYPES=new Set(["COMMERCIAL","OFFICE","RETAIL"]);
function one(value:any){return Array.isArray(value)?value[0]:value;}

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
  // Einstieg: gleich den zuletzt bearbeiteten Lead im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if(istEinstieg(request)){const {data:erster}=await supabase.from("leads").select("id").is("archived_at",null).order("updated_at",{ascending:false}).limit(1).maybeSingle(); if(erster)throw redirect(`/leads/${erster.id}`,{headers:responseHeaders()});}
  const url=new URL(request.url); const q=(url.searchParams.get("q")??"").trim(); const status=url.searchParams.get("status")??"ALL"; const source=url.searchParams.get("source")??"ALL"; const responsible=url.searchParams.get("responsible")??"ALL"; const followup=url.searchParams.get("followup")??"ALL"; const archived=url.searchParams.get("archived")==="1";
  // Blaettern ueber die Datenbank (19.10.2026, app/lib/blaettern.server.ts):
  // gefiltert, gezaehlt und geblaettert wird dort. Die Pipeline-Stufen zaehlt
  // die Datenbank je Status; fuer "ueberfaellig" und "Gewonnen" holt der
  // Worker nur die wenigen Spalten der betroffenen Leads.
  const {page,from,to}=seiteAus(url); const text=sicher(q); const jetzt=new Date().toISOString();
  const bezug=await passendeBezuege(supabase,q,{kontakte:true});
  const basis=(spalten:string,opt?:{count:"exact"})=>{const a=supabase.from("leads").select(spalten,opt);return archived?a.not("archived_at","is",null):a.is("archived_at",null);};
  let abfrage=basis("id,lead_number,status,source_id,follow_up_at,primary_responsible_user,property_street,property_house_number,property_postal_code,property_city,property_type,occupancy_status,desired_sale_horizon,living_area_sqm,plot_area_sqm,rooms,price_expectation,estimated_market_value,created_at,updated_at,archived_at,version,converted_property_id,contacts!inner(id,first_name,last_name,email,phone,mobile),lead_sources(id,key,label)",{count:"exact"});
  if(status!=="ALL")abfrage=abfrage.eq("status",status);
  if(source!=="ALL")abfrage=abfrage.eq("source_id",source);
  if(responsible!=="ALL")abfrage=abfrage.eq("primary_responsible_user",responsible);
  if(followup==="OVERDUE")abfrage=abfrage.lt("follow_up_at",jetzt);
  if(followup==="OPEN")abfrage=abfrage.not("follow_up_at","is",null);
  if(text)abfrage=abfrage.or([enthaelt(["lead_number","property_street","property_house_number","property_postal_code","property_city"],text),inListe("contact_id",bezug.kontakte)].join(","));
  const [{data:rows,error,count},{data:sources},{data:profiles},{data:transitions},ueberfaelligRes,gewonnenRes,...stufenZahlen]=await Promise.all([
    abfrage.order("updated_at",{ascending:false}).range(from,to),
    supabase.from("lead_sources").select("id,key,label,sort_order").eq("active",true).order("sort_order"),
    supabase.from("profiles").select("user_id,display_name,status").eq("status","ACTIVE").order("display_name"),
    supabase.from("lead_status_transitions").select("from_status,to_status"),
    basis("status").lt("follow_up_at",jetzt).limit(5000),
    basis("status,converted_property_id,property_street,property_house_number,property_postal_code,property_city,property_type,living_area_sqm,plot_area_sqm,rooms").eq("status","WON").limit(5000),
    ...STATUS_ORDER.map(st=>basis("id",{count:"exact"}).eq("status",st).limit(1)),
  ]);
  seiteZuWeit(error,url,responseHeaders());if(error)throw new Response("Leads konnten nicht geladen werden.",{status:500});
  const ueberfaellig=((ueberfaelligRes.data??[]) as any[]);
  const pipeline=STATUS_ORDER.map((s,i)=>({status:s,count:(stufenZahlen[i] as any).count??0,overdue:ueberfaellig.filter((r:any)=>r.status===s).length}));
  const wonBreakdown=((gewonnenRes.data??[]) as any[]).reduce((acc:any,row:any)=>{const state=wonObjectState(row);if(state)acc[state.key]=(acc[state.key]??0)+1;return acc;},{prepare:0,ready:0,created:0});
  const filtered=(rows??[]) as any[]; const total=count??0,totalPages=seitenzahl(count);
  const profileMap=Object.fromEntries((profiles??[]).map((p:any)=>[p.user_id,p.display_name]));
  const transitionMap:Record<string,string[]>={};
  for(const transition of transitions??[]){(transitionMap[transition.from_status]??=[]).push(transition.to_status);}
  return data({rows:filtered,zuViele:bezug.zuViele,sources:sources??[],profiles:profiles??[],profileMap,pipeline,wonBreakdown,transitionMap,profile,filters:{q,status,source,responsible,followup,archived,page},total,totalPages},{headers:responseHeaders()});
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

export default function Leads(){const schritte=useNaechsteSchritte("lead");
  const {rows,sources,profiles,profileMap,pipeline,wonBreakdown,transitionMap,filters,total,totalPages,zuViele}=useLoaderData<typeof loader>();
  const actionData=useActionData<typeof action>();
  const actionError=actionData&&"error" in actionData?actionData.error:null;
  const pipelineByStatus=Object.fromEntries(pipeline.map(stage=>[stage.status,stage]));
  const pageHref=(page:number)=>{const p=new URLSearchParams({ansicht:"tabelle"}); if(filters.q)p.set("q",filters.q); if(filters.status!=="ALL")p.set("status",filters.status); if(filters.source!=="ALL")p.set("source",filters.source); if(filters.responsible!=="ALL")p.set("responsible",filters.responsible); if(filters.followup!=="ALL")p.set("followup",filters.followup); if(filters.archived)p.set("archived","1"); p.set("page",String(page)); return `?${p.toString()}`;};
  const filterHref=(status:string)=>{const p=new URLSearchParams({ansicht:"tabelle"}); if(status!=="ALL")p.set("status",status); if(filters.source!=="ALL")p.set("source",filters.source); if(filters.responsible!=="ALL")p.set("responsible",filters.responsible); if(filters.followup!=="ALL")p.set("followup",filters.followup); if(filters.q)p.set("q",filters.q); return `?${p.toString()}`;};
  // Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026):
  // Werkzeugleiste, die Pipeline als eine Zeile anklickbarer Stufen, Tabelle.
  // Vorher Seitenkopf, eine Kachelreihe je Stufe, Filterkasten und
  // Kartenzeilen. "Status ändern" bleibt in jeder Zeile.
  const stufe=(status:string)=>{const stage=pipelineByStatus[status]??{status,count:0,overdue:0};return <Link key={status} to={filterHref(status)} className={[filters.status===status?"aktiv":"",stage.overdue?"warnung":""].filter(Boolean).join(" ")||undefined} title={STATUS_HELP[status]}><strong>{stage.count}</strong> {STATUS_LABELS[status]}{stage.overdue?` (${stage.overdue} überfällig)`:""}</Link>;};
  const gefiltert=Boolean(filters.q||filters.status!=="ALL"||filters.source!=="ALL"||filters.responsible!=="ALL"||filters.followup!=="ALL"||filters.archived);
  return <main className="editor-shell programm-liste">
    <Form method="get" className="programm-liste-werkzeuge" role="search">
      <input type="hidden" name="ansicht" value="tabelle"/>
      <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={filters.q} placeholder="Leadnummer, Kontakt, Telefon, E-Mail, Adresse …" autoComplete="off"/></label>
      <label><span className="sr-only">Status</span><select name="status" defaultValue={filters.status}><option value="ALL">Alle Stufen</option>{STATUS_ORDER.map(s=><option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label>
      <label><span className="sr-only">Quelle</span><select name="source" defaultValue={filters.source}><option value="ALL">Alle Quellen</option>{sources.map((s:any)=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <label><span className="sr-only">Verantwortlich</span><select name="responsible" defaultValue={filters.responsible}><option value="ALL">Alle Verantwortlichen</option>{profiles.map((p:any)=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label>
      <label><span className="sr-only">Wiedervorlage</span><select name="followup" defaultValue={filters.followup}><option value="ALL">Alle Wiedervorlagen</option><option value="OPEN">Mit Wiedervorlage</option><option value="OVERDUE">Wiedervorlage überfällig</option></select></label>
      <label className="programm-liste-haken"><input type="checkbox" name="archived" value="1" defaultChecked={filters.archived}/>Archiv</label>
      <button className="secondary-button" type="submit">Filtern</button>
      <span className="programm-liste-zaehler">{total} {total===1?"Lead":"Leads"}</span>
      <Link className="programm-liste-neu" to="/leads/new">+ Neuer Lead</Link>
    </Form>

    <p className="programm-kennzahlen lead-stufen" aria-label="Verkäufer-Pipeline">
      {MAIN_STATUSES.map(stufe)}
      <span className="leise">Nebenpfade:</span>
      {OUTCOME_STATUSES.map(stufe)}
      {wonBreakdown.prepare+wonBreakdown.ready+wonBreakdown.created>0?<span className="leise">Gewonnen: {wonBreakdown.prepare} vorbereiten · {wonBreakdown.ready} bereit · {wonBreakdown.created} angelegt</span>:null}
    </p>
    <Aufklapper knopf="Was ist ein Lead, und wie läuft die Pipeline?"><p className="programm-erklaerung"><strong>Ein Lead ist noch keine Immobilie.</strong> Er steht für einen potenziellen Verkäufer oder Eigentümer, der sich z. B. wegen einer Bewertung oder eines Verkaufs meldet. Wird daraus ein Auftrag, kann der Lead später kontrolliert in eine Immobilie übernommen werden.</p><p className="programm-erklaerung">Die Hauptstrecke führt von Neu bis Gewonnen. Nach „Gewonnen“ zeigt ein eigener Bearbeitungszustand, ob die Objektanlage noch vorbereitet werden muss, bereits möglich ist oder abgeschlossen wurde. Später nachfassen und Verloren sind Nebenpfade.</p></Aufklapper>

    {actionError?<p className="form-error">{actionError}</p>:null}

    <div className="programm-tabelle-rahmen">
      {rows.length===0?<p className="programm-liste-leer">{gefiltert?"Kein Lead passt zu diesem Filter.":"Noch kein Lead erfasst – oben „+ Neuer Lead“."}</p>:<table className="programm-tabelle">
        <thead><tr><th scope="col">Nummer</th><th scope="col">Kontakt</th><th scope="col">Objektadresse</th><th scope="col">Stufe</th><th scope="col">Verantwortlich</th><th scope="col">Wiedervorlage</th><th scope="col" className="rechts">Geändert</th><th scope="col"><span className="sr-only">Aktion</span></th></tr></thead>
        <tbody>{rows.map((r:any)=>{const c=one(r.contacts),src=one(r.lead_sources),overdue=r.follow_up_at&&new Date(r.follow_up_at).getTime()<Date.now(); const nextStatuses=(transitionMap[r.status]??[]).filter((s:string)=>STATUS_ORDER.includes(s as any)); const locked=Boolean(r.converted_property_id)||Boolean(r.archived_at); const objectState=wonObjectState(r); return <tr key={r.id} className={overdue?"ueberfaellig":undefined}>
          <td className="zahl"><Link to={`/leads/${r.id}`}>{r.lead_number}</Link></td>
          <td><Link to={`/leads/${r.id}`}>{c?`${c.first_name} ${c.last_name}`:"Kontakt"}</Link><div className="leise">{src?.label??"Quelle offen"}</div></td>
          <td>{address(r)||<span className="leise">offen</span>}</td>
          <td><span className="ampel-neben">{r.archived_at?"Archiviert":STATUS_LABELS[r.status]??r.status}<Ampel s={schritte[r.id]}/></span>{objectState?<div className="leise">{objectState.label}</div>:null}</td>
          <td>{profileMap[r.primary_responsible_user]??<span className="leise">—</span>}</td>
          <td className="zahl">{r.follow_up_at?<span className={overdue?"warnung-text":undefined}>{fmt(r.follow_up_at)}</span>:<span className="leise">—</span>}</td>
          <td className="zahl rechts leise">{fmt(r.updated_at)}</td>
          <td className="rechts">{r.converted_property_id?<Link to={`/leads/${r.id}`}>Immobilie angelegt →</Link>:r.status==="WON"&&objectState?<Link to={`/leads/${r.id}`}>{objectState.key==="ready"?"Immobilie anlegen":"Objektanlage vorbereiten"} →</Link>:locked?null:<details className="lead-workflow-menu"><summary className="secondary-button compact">Status ändern</summary><div className="lead-workflow-popover"><div className="lead-workflow-popover-head"><strong>{STATUS_LABELS[r.status]}</strong><small>{STATUS_HELP[r.status]}</small></div>{nextStatuses.length===0?<small className="lead-workflow-finished">Keine weitere Statusaktion verfügbar.</small>:nextStatuses.map((next:string)=>next==="LOST"?<Form method="post" className="lead-lost-inline" key={next}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="lead_id" value={r.id}/><input type="hidden" name="version" value={r.version}/><input type="hidden" name="status" value="LOST"/><label><span>Als verloren markieren</span><input name="lost_reason" required placeholder="Verlustgrund"/></label><button className="secondary-button compact" type="submit">Verloren</button></Form>:<Form method="post" key={next}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="lead_id" value={r.id}/><input type="hidden" name="version" value={r.version}/><input type="hidden" name="status" value={next}/><button className="lead-workflow-action" type="submit"><span>→</span><span><strong>{STATUS_LABELS[next]}</strong><small>{STATUS_HELP[next]}</small></span></button></Form>)}</div></details>}</td>
        </tr>})}</tbody>
      </table>}
    </div>

    {totalPages>1?<nav className="programm-liste-seiten" aria-label="Seiten">{filters.page>1?<Link to={pageHref(filters.page-1)}>← Zurück</Link>:<span/>}<span>Seite {filters.page} von {totalPages}</span>{filters.page<totalPages?<Link to={pageHref(filters.page+1)}>Weiter →</Link>:<span/>}</nav>:null}
    <SucheZuAllgemein an={zuViele}/>
  </main>;
}
