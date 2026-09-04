import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/acquisition-campaign";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

const CAMPAIGN_STATUS:Record<string,string>={PLANNED:"Geplant",RUNNING:"Läuft",COMPLETED:"Abgeschlossen",CANCELLED:"Abgebrochen"};
const RESPONSE_CHANNEL:Record<string,string>={QR_CODE:"QR-Code",PHONE:"Telefon",EMAIL:"E-Mail",WEB_FORM:"Formular",LETTER:"Brief",IN_PERSON:"Persönlich",EVENT:"Veranstaltung",OTHER:"Sonstiges"};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function intOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number.parseInt(raw,10);return Number.isFinite(n)?n:NaN;}
function money(value:any){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n):"—";}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function plural(count:any,one:string,many:string){return `${Number(count)||0} ${Number(count)===1?one:many}`;}

/**
 * Kosten je Reaktion. Gibt null zurück, solange Kosten oder Reaktionen fehlen —
 * dann steht in der Oberfläche „nicht berechenbar" statt einer Zahl, die
 * Genauigkeit vortäuscht.
 */
export function costPerResponse(cost:any,responses:any){
  const c=Number(cost),r=Number(responses);
  if(!Number.isFinite(c)||c<=0)return null;
  if(!Number.isFinite(r)||r<=0)return null;
  return c/r;
}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("WAVE_CAMPAIGN_NOT_FOUND"))return"Die Kampagne wurde nicht gefunden.";
  if(message.includes("WAVE_SENT_IN_FUTURE"))return"Das Versanddatum darf nicht in der Zukunft liegen.";
  if(message.includes("WAVE_BEFORE_CAMPAIGN_START"))return"Eine Welle kann nicht vor dem Start der Kampagne versendet worden sein.";
  if(message.includes("acquisition_waves_unique_position"))return"Diese Wellennummer ist in der Kampagne bereits vergeben.";
  if(message.includes("acquisition_waves_name_check"))return"Für eine Welle ist ein Name erforderlich.";
  if(message.includes("CAMPAIGN_END_REQUIRED"))return"Eine abgeschlossene Kampagne braucht ein Enddatum.";
  if(message.includes("CAMPAIGN_AREA_NOT_FOUND"))return"Das gewählte Gebiet wurde nicht gefunden oder ist archiviert.";
  if(message.includes("acquisition_campaigns_running_dated_check"))return"Sobald eine Kampagne läuft, gehört ein Startdatum dazu.";
  if(message.includes("acquisition_campaigns_period_check"))return"Das Ende kann nicht vor dem Start liegen.";
  return "Die Angaben konnten nicht gespeichert werden.";
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"acquisition.read");
  const campaignId=params.campaignId!;
  const {data:campaign,error}=await supabase.from("acquisition_campaigns")
    .select("*,acquisition_areas(id,name),lead_sources(id,key,label)").eq("id",campaignId).maybeSingle();
  if(error||!campaign)throw new Response("Kampagne nicht gefunden.",{status:404,headers:responseHeaders()});

  const [wavesRes,areasRes,sourcesRes,attributionsRes,performanceRes,canWriteRes,canCommissionRes]=await Promise.all([
    supabase.from("acquisition_waves").select("*").eq("campaign_id",campaignId).order("wave_position"),
    supabase.from("acquisition_areas").select("id,name,parent_area_id").is("archived_at",null).order("name"),
    supabase.from("lead_sources").select("id,label,sort_order").eq("active",true).order("sort_order"),
    supabase.from("lead_acquisitions").select("id,response_channel,response_on,wave_id,leads(id,lead_number,status,created_at,valuation_appointment_at,converted_property_id,contacts(first_name,last_name))").eq("campaign_id",campaignId).order("response_on",{ascending:false,nullsFirst:false}),
    supabase.rpc("acquisition_campaign_performance",{p_from:"1900-01-01",p_to:new Date().toISOString().slice(0,10)}),
    supabase.rpc("current_user_has_permission",{p_permission:"acquisition.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"commission.read"}),
  ]);
  const readError=[wavesRes,attributionsRes,performanceRes].find((r)=>r.error)?.error;
  if(readError)throw new Response("Die Kampagnendaten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  const areas=(areasRes.data??[]) as any[];
  const pathOf=(id:string):string=>{
    const parts:string[]=[];let cursor=areas.find((a)=>a.id===id);let guard=0;
    while(cursor&&guard<10){parts.unshift(cursor.name);cursor=areas.find((a)=>a.id===cursor.parent_area_id);guard+=1;}
    return parts.join(" › ");
  };

  return data({
    profile,campaign,
    areas:areas.map((a)=>({...a,path:pathOf(a.id)})),
    sources:sourcesRes.data??[],
    waves:wavesRes.data??[],
    attributions:attributionsRes.data??[],
    performance:((performanceRes.data??[]) as any[]).find((row)=>row.campaign_id===campaignId)??null,
    areaPath:pathOf((campaign as any).area_id),
    canWrite:canWriteRes.data===true,
    canReadCommission:canCommissionRes.data===true,
  },{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"acquisition.write");
  const campaignId=params.campaignId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const back=`/acquisition/${campaignId}`;
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Die Kampagne wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="campaign_save"){
    const name=text(fd,"name");
    if(!name)return invalid("Bitte einen Kampagnennamen angeben.");
    const households=intOrNull(fd,"household_count");
    if(typeof households==="number"&&!Number.isFinite(households))return invalid("Die Zahl der angeschriebenen Haushalte ist keine gültige Zahl.");
    const planned=numOrNull(fd,"planned_cost"),actual=numOrNull(fd,"actual_cost");
    if((typeof planned==="number"&&!Number.isFinite(planned))||(typeof actual==="number"&&!Number.isFinite(actual)))return invalid("Ungültiger Kostenwert.");
    const status=text(fd,"status")||"PLANNED";
    const startsOn=dateOrNull(fd,"starts_on"),endsOn=dateOrNull(fd,"ends_on");
    if(status!=="PLANNED"&&!startsOn)return invalid("Sobald eine Kampagne läuft, gehört ein Startdatum dazu.");
    if(status==="COMPLETED"&&!endsOn)return invalid("Eine abgeschlossene Kampagne braucht ein Enddatum.");
    const {data:updated,error}=await supabase.from("acquisition_campaigns").update({
      name,area_id:text(fd,"area_id"),source_id:text(fd,"source_id"),status,
      target_group:text(fd,"target_group")||null,
      topic:text(fd,"topic")||null,
      call_to_action:text(fd,"call_to_action")||null,
      household_count:households,starts_on:startsOn,ends_on:endsOn,
      planned_cost:planned,actual_cost:actual,
      notes:text(fd,"notes")||null,
    }).eq("id",campaignId).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error); if(!updated)return conflict();
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="wave_add"){
    const name=text(fd,"name");
    if(!name)return invalid("Bitte einen Namen für die Welle angeben.");
    const position=intOrNull(fd,"wave_position");
    if(position===null||typeof position!=="number"||!Number.isFinite(position)||position<1)return invalid("Bitte eine Wellennummer ab 1 angeben.");
    const households=intOrNull(fd,"household_count");
    if(typeof households==="number"&&!Number.isFinite(households))return invalid("Die Haushaltszahl ist keine gültige Zahl.");
    const cost=numOrNull(fd,"cost");
    if(typeof cost==="number"&&!Number.isFinite(cost))return invalid("Die Kosten sind keine gültige Zahl.");
    const {error}=await supabase.from("acquisition_waves").insert({
      campaign_id:campaignId,wave_position:position,name,
      medium:text(fd,"medium")||null,
      call_to_action:text(fd,"call_to_action")||null,
      sent_on:dateOrNull(fd,"sent_on"),
      household_count:households,cost,
      notes:text(fd,"notes")||null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(`${back}#wellen`,{headers:responseHeaders()});
  }

  if(intent==="wave_remove"){
    const {error}=await supabase.from("acquisition_waves").delete().eq("id",text(fd,"wave_id")).eq("campaign_id",campaignId);
    if(error)return fail(error);
    return redirect(`${back}#wellen`,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

export default function AcquisitionCampaign(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<ActionResult>();
  const c=d.campaign as any;
  const p=d.performance as any;
  const disabled=!d.canWrite;
  const waves=(d.waves??[]) as any[];
  const attributions=(d.attributions??[]) as any[];
  const waveCost=waves.reduce((sum,w)=>sum+(Number(w.cost)||0),0);
  const effectiveCost=c.actual_cost!=null?Number(c.actual_cost):(waveCost>0?waveCost:(c.planned_cost!=null?Number(c.planned_cost):null));
  const perResponse=costPerResponse(effectiveCost,p?.responses);
  const waveHouseholds=waves.reduce((sum,w)=>sum+(Number(w.household_count)||0),0);
  const householdMismatch=c.household_count!=null&&waveHouseholds>0&&waveHouseholds>Number(c.household_count);

  return <div className="editor-shell">
    <div className="editor-header">
      <div>
        <Link className="back-link" to="/acquisition">← Kampagnen</Link>
        <p className="eyebrow">{c.campaign_number}</p>
        <h1>{c.name}</h1>
        <p className="subtle">{c.lead_sources?.label??"Kanal offen"} · {d.areaPath||"Gebiet offen"}</p>
      </div>
      <div className="inline-actions"><span className="status-pill">{CAMPAIGN_STATUS[c.status]??c.status}</span></div>
    </div>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <div className="metric-grid">
      <article className="metric"><span>Reaktionen</span><strong>{p?.responses??0}</strong><small>zugeordnete Leads</small></article>
      <article className="metric"><span>Eigentümergespräche</span><strong>{p?.owner_talks??0}</strong><small>mit Bewertungstermin</small></article>
      <article className="metric"><span>Verkaufsstrategie-Checks</span><strong>{p?.readiness_checks??0}</strong><small>aus diesen Leads</small></article>
      <article className="metric"><span>Aufträge</span><strong>{p?.mandates??0}</strong><small>{p?.sales??0} davon verkauft</small></article>
      <article className="metric"><span>Kosten je Reaktion</span><strong>{perResponse===null?"nicht berechenbar":money(perResponse)}</strong><small>{perResponse===null?"Kosten oder Reaktionen fehlen":`${money(effectiveCost)} auf ${plural(p?.responses,"Reaktion","Reaktionen")}`}</small></article>
      <article className="metric"><span>Provision erwartet</span><strong>{d.canReadCommission?money(p?.commission_expected):"—"}</strong><small>{d.canReadCommission?`${money(p?.commission_paid)} gezahlt`:"keine Berechtigung für Provisionen"}</small></article>
    </div>

    {householdMismatch?<p className="form-warning">Die Wellen erreichen zusammen {waveHouseholds} Haushalte, die Kampagne führt {c.household_count}. Einer der beiden Werte stimmt nicht.</p>:null}

    <section className="data-card" id="kampagne">
      <div className="card-head"><div><p className="eyebrow">Rahmen</p><h2>Kampagne</h2></div><span className="status-pill">Version {c.version}</span></div>
      <Form method="post" className="form-grid">
        <input type="hidden" name="_intent" value="campaign_save"/>
        <input type="hidden" name="version" value={c.version}/>
        <label className="form-field"><span>Name *</span><input name="name" defaultValue={c.name} disabled={disabled}/></label>
        <label className="form-field"><span>Gebiet *</span><select name="area_id" defaultValue={c.area_id} disabled={disabled}>{d.areas.map((a:any)=><option key={a.id} value={a.id}>{a.path}</option>)}</select></label>
        <label className="form-field"><span>Kanal *</span><select name="source_id" defaultValue={c.source_id} disabled={disabled}>{d.sources.map((s:any)=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label className="form-field"><span>Status</span><select name="status" defaultValue={c.status} disabled={disabled}>{Object.entries(CAMPAIGN_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field"><span>Zielgruppe</span><input name="target_group" defaultValue={c.target_group??""} disabled={disabled}/></label>
        <label className="form-field"><span>Thema</span><input name="topic" defaultValue={c.topic??""} disabled={disabled}/></label>
        <label className="form-field"><span>Handlungsaufforderung</span><input name="call_to_action" defaultValue={c.call_to_action??""} disabled={disabled}/></label>
        <label className="form-field"><span>Angeschriebene Haushalte</span><input name="household_count" defaultValue={c.household_count??""} disabled={disabled}/></label>
        <label className="form-field"><span>Beginn</span><input type="date" name="starts_on" defaultValue={c.starts_on??""} disabled={disabled}/></label>
        <label className="form-field"><span>Ende</span><input type="date" name="ends_on" defaultValue={c.ends_on??""} disabled={disabled}/></label>
        <label className="form-field"><span>Geplante Kosten €</span><input name="planned_cost" defaultValue={c.planned_cost??""} disabled={disabled}/></label>
        <label className="form-field"><span>Tatsächliche Kosten €</span><input name="actual_cost" defaultValue={c.actual_cost??""} disabled={disabled}/></label>
        <label className="form-field full-width"><span>Notiz</span><textarea name="notes" rows={2} defaultValue={c.notes??""} disabled={disabled}/></label>
        <div className="form-field full-width inline-actions"><button className="primary-button" type="submit" disabled={disabled}>Kampagne speichern</button></div>
      </Form>
    </section>

    <section className="data-card" id="wellen">
      <div className="card-head"><div><p className="eyebrow">Werbemittel & CTA</p><h2>Wellen</h2></div><span className="status-pill">{waves.length}</span></div>
      {waves.length===0
        ?<p className="empty-state">Noch keine Welle erfasst. Ohne Welle lässt sich eine Reaktion nur der Kampagne zuordnen, nicht dem konkreten Werbemittel.</p>
        :<div className="data-list">{waves.map((w:any)=>
          <div className="data-row" key={w.id}>
            <div><strong>{w.wave_position}. {w.name}</strong><small>{w.medium||"Werbemittel offen"}{w.call_to_action?` · ${w.call_to_action}`:""}{w.sent_on?` · versendet ${formatDate(w.sent_on)}`:" · noch nicht versendet"}</small></div>
            <div className="row-meta"><span>{w.household_count?`${w.household_count} Haushalte`:"Haushalte offen"}</span><small>{w.cost!=null?money(w.cost):"Kosten offen"} · {plural(attributions.filter((a)=>a.wave_id===w.id).length,"Reaktion","Reaktionen")}</small></div>
            <Form method="post"><input type="hidden" name="_intent" value="wave_remove"/><input type="hidden" name="wave_id" value={w.id}/><button className="text-button" type="submit" disabled={disabled}>Entfernen</button></Form>
          </div>)}</div>}

      <Form method="post" className="form-grid" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="wave_add"/>
        <label className="form-field"><span>Nummer *</span><input name="wave_position" defaultValue={String(waves.length+1)} disabled={disabled}/></label>
        <label className="form-field"><span>Name *</span><input name="name" disabled={disabled} placeholder="Mailing 02"/></label>
        <label className="form-field"><span>Werbemittel</span><input name="medium" disabled={disabled} placeholder="Eigentümerbrief"/></label>
        <label className="form-field"><span>Handlungsaufforderung</span><input name="call_to_action" disabled={disabled} placeholder="QR-Code zum Check"/></label>
        <label className="form-field"><span>Versendet am</span><input type="date" name="sent_on" disabled={disabled}/></label>
        <label className="form-field"><span>Haushalte</span><input name="household_count" disabled={disabled}/></label>
        <label className="form-field"><span>Kosten €</span><input name="cost" disabled={disabled}/></label>
        <label className="form-field full-width"><span>Notiz</span><input name="notes" disabled={disabled}/></label>
        <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Welle anlegen</button></div>
      </Form>
    </section>

    <section className="data-card" id="reaktionen">
      <div className="card-head"><div><p className="eyebrow">Reaktion › Termin › Vorgang</p><h2>Zugeordnete Leads</h2></div><span className="status-pill">{attributions.length}</span></div>
      {attributions.length===0
        ?<p className="empty-state">Dieser Kampagne ist noch kein Lead zugeordnet. Die Zuordnung erfolgt in der Leadakte unter Herkunft.</p>
        :<div className="data-list">{attributions.map((a:any)=>{
          const wave=waves.find((w)=>w.id===a.wave_id);
          return <Link className="data-row data-row-link" to={`/leads/${a.leads?.id}`} key={a.id}>
            <div><strong>{a.leads?.lead_number} · {a.leads?.contacts?`${a.leads.contacts.last_name}, ${a.leads.contacts.first_name}`:"Kontakt offen"}</strong><small>{a.response_channel?RESPONSE_CHANNEL[a.response_channel]??a.response_channel:"Reaktionsweg offen"}{a.response_on?` · ${formatDate(a.response_on)}`:""}{wave?` · Welle ${wave.wave_position}`:""}</small></div>
            <div className="row-meta"><span>{a.leads?.status??"—"}</span><small>{a.leads?.valuation_appointment_at?"Bewertungstermin vereinbart":"kein Bewertungstermin"}{a.leads?.converted_property_id?" · in Immobilie überführt":""}</small></div>
            <span className="subtle-link">Öffnen →</span>
          </Link>;
        })}</div>}
    </section>
  </div>;
}
