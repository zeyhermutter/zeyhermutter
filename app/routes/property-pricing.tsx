import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-pricing";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

export const VALUATION_METHOD:Record<string,string>={COMPARATIVE:"Vergleichswertverfahren",INCOME:"Ertragswertverfahren",ASSET:"Sachwertverfahren",MARKET_ESTIMATE:"Marktpreiseinschätzung"};
const INTEREST:Record<string,string>={HIGH:"hoch",MEDIUM:"mittel",LOW:"gering",NONE:"kein Interesse"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function money(value:any){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n):"—";}
function today(){return new Date().toISOString().slice(0,10);}
function dayDiff(from:string,to:string){return Math.max(0,Math.round((new Date(`${to}T12:00:00Z`).getTime()-new Date(`${from}T12:00:00Z`).getTime())/864e5));}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("PRICE_PROPERTY_NOT_FOUND"))return"Die Immobilie wurde nicht gefunden.";
  if(message.includes("PRICE_STAGE_IN_FUTURE"))return"Eine Preisstufe kann nicht in der Zukunft beginnen.";
  if(message.includes("PRICE_FIRST_STAGE_MUST_BE_INITIAL"))return"Die erste Preisstufe ist der Ausgangspreis.";
  if(message.includes("PRICE_INITIAL_ALREADY_SET"))return"Ein Ausgangspreis ist bereits erfasst.";
  if(message.includes("PRICE_STAGE_BEFORE_PREVIOUS"))return"Eine Preisstufe kann nicht vor der vorhergehenden beginnen.";
  if(message.includes("PRICE_PREVIOUS_MISMATCH"))return"Der angegebene Vorwert entspricht nicht dem zuletzt geführten Preis. Bitte Seite neu laden.";
  if(message.includes("PRICE_INITIAL_FLAG_IMMUTABLE"))return"Der Ausgangspreis lässt sich nicht nachträglich zur Änderung umdeuten.";
  if(message.includes("property_price_stages_reason_check"))return"Für eine Preisänderung ist eine Begründung erforderlich.";
  if(message.includes("property_price_stages_change_check"))return"Eine Preisstufe muss sich vom bisherigen Preis unterscheiden.";
  if(message.includes("property_price_stages_property_id_effective_from_key"))return"Für dieses Datum ist bereits eine Preisstufe erfasst.";
  if(message.includes("VALUATION_PROPERTY_NOT_FOUND"))return"Die Immobilie wurde nicht gefunden.";
  if(message.includes("VALUATION_LEAD_NOT_FOUND"))return"Der gewählte Lead wurde nicht gefunden.";
  if(message.includes("VALUATION_LAND_REFERENCE_IN_FUTURE"))return"Der Stichtag des Bodenrichtwerts darf nicht in der Zukunft liegen.";
  if(message.includes("VALUATION_COMPARABLES_REQUIRED"))return"Für ein Ergebnis im Vergleichswertverfahren wird mindestens ein Vergleichsobjekt benötigt.";
  if(message.includes("VALUATION_NOT_FOUND"))return"Die Wertermittlung wurde nicht gefunden.";
  if(message.includes("ARCHIVED_VALUATION_IMMUTABLE"))return"Eine archivierte Wertermittlung kann nicht mehr geändert werden.";
  if(message.includes("property_valuations_target_check"))return"Eine Wertermittlung braucht ein Objekt oder einen Lead.";
  if(message.includes("property_valuations_range_check"))return"Der obere Wert der Spanne muss mindestens so hoch sein wie der untere.";
  if(message.includes("property_valuations_result_in_range_check"))return"Das Ergebnis muss innerhalb der angegebenen Spanne liegen.";
  if(message.includes("property_valuations_valued_on_check"))return"Das Bewertungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("property_valuations_land_reference_check"))return"Zum Bodenrichtwert gehören Stichtag und Quelle.";
  if(message.includes("property_valuations_valuer_check"))return"Bitte angeben, wer bewertet hat.";
  if(message.includes("property_valuation_comparables_source_check"))return"Für ein Vergleichsobjekt ist die Quelle erforderlich.";
  if(message.includes("property_valuation_comparables_date_check"))return"Der Stichtag eines Vergleichsobjekts darf nicht in der Zukunft liegen.";
  if(message.includes("property_valuation_adjustments_value_check"))return"Ein Zu- oder Abschlag ist entweder ein Betrag oder ein Prozentsatz, nicht beides.";
  if(message.includes("property_valuation_adjustments_nonzero_check"))return"Ein Zu- oder Abschlag von null ist keine Angabe.";
  if(message.includes("property_valuation_adjustments_reason_check"))return"Ein Zu- oder Abschlag braucht eine Begründung.";
  return "Die Angaben konnten nicht gespeichert werden.";
}

/**
 * Verdichtet die Kennzahlen je Preisstufe. Anfragen, Besichtigungen und Angebote
 * werden dem Zeitfenster der Stufe zugeordnet — reine Zuordnung nach Datum,
 * keine Aussage über Ursache und Wirkung.
 */
export function priceStageMetrics(stages:any[],inquiries:any[],viewings:any[],offers:any[]){
  const sorted=[...stages].sort((a,b)=>a.effective_from<b.effective_from?-1:1);
  return sorted.map((stage,index)=>{
    const from=stage.effective_from;
    const until=sorted[index+1]?.effective_from??null;
    const inWindow=(value:string|null)=>{if(!value)return false;const day=value.slice(0,10);return day>=from&&(until===null||day<until);};
    return {
      ...stage,
      until,
      days:dayDiff(from,until??today()),
      inquiries:inquiries.filter((row)=>inWindow(row.received_at??row.created_at)).length,
      viewings:viewings.filter((row)=>inWindow(row.starts_at)).length,
      offers:offers.filter((row)=>inWindow(row.submitted_at??row.created_at)).length,
    };
  }).reverse();
}

/** Verdichtet das Besichtigungsfeedback. Keine Preisempfehlung, nur Auszählung. */
export function feedbackSummary(feedback:any[],currentPrice:number|null){
  const withPrice=feedback.filter((row)=>row.price_feedback!==null&&row.price_feedback!==undefined);
  const below=currentPrice?withPrice.filter((row)=>Number(row.price_feedback)<currentPrice):[];
  const levels:Record<string,number>={HIGH:0,MEDIUM:0,LOW:0,NONE:0};
  for(const row of feedback){if(row.interest_level&&levels[row.interest_level]!==undefined)levels[row.interest_level]+=1;}
  const values=withPrice.map((row)=>Number(row.price_feedback)).sort((a,b)=>a-b);
  const median=values.length?(values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2):null;
  return {
    total:feedback.length,
    withPrice:withPrice.length,
    below:below.length,
    levels,
    median,
    lowest:values[0]??null,
    highest:values[values.length-1]??null,
    concerns:feedback.map((row)=>row.concerns).filter((value)=>value&&String(value).trim()),
  };
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"property.read");
  const propertyId=params.propertyId!;
  const {data:property,error:propertyError}=await supabase.from("properties")
    .select("id,property_number,internal_title,status,purchase_price,living_area_sqm,plot_area_sqm").eq("id",propertyId).maybeSingle();
  if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});

  const [stagesRes,inquiriesRes,viewingsRes,offersRes,feedbackRes,valuationsRes,profilesRes,leadsRes,canWriteRes,canValuationRes]=await Promise.all([
    supabase.from("property_price_stages").select("*,profiles!property_price_stages_decided_by_fkey(user_id,display_name)").eq("property_id",propertyId).order("effective_from"),
    supabase.from("inquiries").select("id,received_at,created_at").eq("property_id",propertyId).is("archived_at",null),
    supabase.from("viewings").select("id,starts_at,status").eq("property_id",propertyId).is("archived_at",null),
    supabase.from("purchase_offers").select("id,submitted_at,created_at,amount,status").eq("property_id",propertyId).is("archived_at",null),
    supabase.from("viewing_feedback").select("id,viewing_id,interest_level,price_feedback,concerns,positives,viewings!inner(property_id,starts_at)").eq("viewings.property_id",propertyId),
    supabase.from("property_valuations").select("*,profiles!property_valuations_valuer_user_fkey(user_id,display_name),property_valuation_comparables(*),property_valuation_adjustments(*)").eq("property_id",propertyId).order("valued_on",{ascending:false}),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.from("leads").select("id,lead_number").eq("converted_property_id",propertyId).limit(50),
    supabase.rpc("current_user_has_permission",{p_permission:"property.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"valuation.write"}),
  ]);
  // Lesefehler nicht verschlucken: eine leere Liste darf nicht die Antwort auf einen Fehler sein.
  const readError=[stagesRes,inquiriesRes,viewingsRes,offersRes,feedbackRes,valuationsRes].find((r)=>r.error)?.error;
  if(readError)throw new Response("Preis- und Bewertungsdaten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  return data({
    profile,property,
    stages:stagesRes.data??[],
    inquiries:inquiriesRes.data??[],
    viewings:viewingsRes.data??[],
    offers:offersRes.data??[],
    feedback:feedbackRes.data??[],
    valuations:valuationsRes.data??[],
    profiles:profilesRes.data??[],
    leads:leadsRes.data??[],
    canWrite:canWriteRes.data===true,
    canValuation:canValuationRes.data===true,
  },{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"property.read");
  const propertyId=params.propertyId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const back=`/properties/${propertyId}/pricing`;
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});

  if(intent==="stage_add"){
    await requirePermission(request,context.cloudflare.env,"property.write");
    const price=numOrNull(fd,"price");
    if(price===null||!Number.isFinite(price)||price<=0)return invalid("Bitte einen gültigen Preis angeben.");
    const isInitial=text(fd,"is_initial")==="yes";
    const previous=numOrNull(fd,"previous_price");
    if(!isInitial&&(previous===null||!Number.isFinite(previous)))return invalid("Der bisherige Preis fehlt. Bitte Seite neu laden.");
    if(!isInitial&&!text(fd,"reason"))return invalid("Für eine Preisänderung ist eine Begründung erforderlich.");
    const {error}=await supabase.from("property_price_stages").insert({
      property_id:propertyId,price,
      previous_price:isInitial?null:previous,
      effective_from:dateOrNull(fd,"effective_from")??today(),
      reason:isInitial?(text(fd,"reason")||null):text(fd,"reason"),
      decided_by:text(fd,"decided_by")||userId,
      is_initial:isInitial,
      note:text(fd,"note")||null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    // Der geführte Objektpreis folgt der jüngsten Stufe, damit Akte und Verlauf nicht auseinanderlaufen.
    if(text(fd,"sync_property")==="yes"){
      const {error:syncError}=await supabase.from("properties").update({purchase_price:price}).eq("id",propertyId);
      if(syncError)return data<ActionResult>({error:"Die Preisstufe wurde gespeichert, der Objektpreis konnte aber nicht angeglichen werden."},{status:400,headers:responseHeaders()});
    }
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="valuation_create"){
    await requirePermission(request,context.cloudflare.env,"valuation.write");
    const method=text(fd,"method");
    if(!Object.keys(VALUATION_METHOD).includes(method))return invalid("Bitte ein gültiges Verfahren wählen.");
    const landValue=numOrNull(fd,"land_reference_value");
    if(typeof landValue==="number"&&!Number.isFinite(landValue))return invalid("Ungültiger Bodenrichtwert.");
    if(landValue!==null&&(!dateOrNull(fd,"land_reference_date")||!text(fd,"land_reference_source")))return invalid("Zum Bodenrichtwert gehören Stichtag und Quelle.");
    const from=numOrNull(fd,"range_from"),to=numOrNull(fd,"range_to");
    if((typeof from==="number"&&!Number.isFinite(from))||(typeof to==="number"&&!Number.isFinite(to)))return invalid("Ungültige Wertspanne.");
    const {error}=await supabase.from("property_valuations").insert({
      property_id:propertyId,
      lead_id:text(fd,"lead_id")||null,
      method,
      valued_on:dateOrNull(fd,"valued_on")??today(),
      valuer_user:text(fd,"valuer_user")||userId,
      valuer_name:text(fd,"valuer_name")||null,
      land_reference_value:landValue,
      land_reference_date:landValue!==null?dateOrNull(fd,"land_reference_date"):null,
      land_reference_source:landValue!==null?(text(fd,"land_reference_source")||null):null,
      range_from:from,range_to:to,
      assumptions:text(fd,"assumptions")||null,
      notes:text(fd,"notes")||null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="valuation_result"){
    await requirePermission(request,context.cloudflare.env,"valuation.write");
    const result=numOrNull(fd,"result_value");
    if(typeof result==="number"&&!Number.isFinite(result))return invalid("Ungültiges Ergebnis.");
    const {data:updated,error}=await supabase.from("property_valuations")
      .update({result_value:result}).eq("id",text(fd,"valuation_id")).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return data<ActionResult>({error:"Die Wertermittlung wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="comparable_add"){
    await requirePermission(request,context.cloudflare.env,"valuation.write");
    const price=numOrNull(fd,"price");
    if(price===null||!Number.isFinite(price)||price<=0)return invalid("Bitte einen gültigen Preis für das Vergleichsobjekt angeben.");
    if(!text(fd,"label"))return invalid("Bitte das Vergleichsobjekt benennen.");
    if(!text(fd,"source"))return invalid("Für ein Vergleichsobjekt ist die Quelle erforderlich.");
    const refDate=dateOrNull(fd,"reference_date");
    if(!refDate)return invalid("Bitte einen Stichtag für das Vergleichsobjekt angeben.");
    const area=numOrNull(fd,"living_area_sqm");
    if(typeof area==="number"&&!Number.isFinite(area))return invalid("Ungültige Wohnfläche.");
    const {error}=await supabase.from("property_valuation_comparables").insert({
      valuation_id:text(fd,"valuation_id"),label:text(fd,"label"),price,
      living_area_sqm:area,reference_date:refDate,source:text(fd,"source"),note:text(fd,"note")||null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="comparable_remove"){
    await requirePermission(request,context.cloudflare.env,"valuation.write");
    const {error}=await supabase.from("property_valuation_comparables").delete().eq("id",text(fd,"comparable_id"));
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="adjustment_add"){
    await requirePermission(request,context.cloudflare.env,"valuation.write");
    if(!text(fd,"label"))return invalid("Bitte den Zu- oder Abschlag benennen.");
    if(!text(fd,"reason"))return invalid("Ein Zu- oder Abschlag braucht eine Begründung.");
    const kind=text(fd,"kind");
    const value=numOrNull(fd,"value");
    if(value===null||!Number.isFinite(value)||value===0)return invalid("Bitte einen Wert ungleich null angeben.");
    const {error}=await supabase.from("property_valuation_adjustments").insert({
      valuation_id:text(fd,"valuation_id"),label:text(fd,"label"),
      amount:kind==="AMOUNT"?value:null,
      percent:kind==="PERCENT"?value:null,
      reason:text(fd,"reason"),
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="adjustment_remove"){
    await requirePermission(request,context.cloudflare.env,"valuation.write");
    const {error}=await supabase.from("property_valuation_adjustments").delete().eq("id",text(fd,"adjustment_id"));
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

export default function PropertyPricing(){
  const d=useLoaderData<typeof loader>();
  const r=useActionData<typeof action>();
  const stages=priceStageMetrics(d.stages as any[],d.inquiries as any[],d.viewings as any[],d.offers as any[]);
  const current=stages[0];
  const summary=feedbackSummary(d.feedback as any[],current?Number(current.price):Number(d.property.purchase_price)||null);
  const hasInitial=(d.stages as any[]).some((s:any)=>s.is_initial);
  const drift=current&&Number(d.property.purchase_price)!==Number(current.price);
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to={`/properties/${d.property.id}`}>← Objektakte</Link><p className="eyebrow">{d.property.property_number}</p><h1 className="editor-title">Preis & Wert</h1><p className="editor-meta">{d.property.internal_title}</p></div><div className="header-actions"><span className="status-pill">{money(d.property.purchase_price)}</span><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div></header>

    {r?.error?<div className="form-error">{r.error}</div>:null}
    <div className="form-warning"><strong>Einschätzungen, keine Zusicherung.</strong> Alle Werte auf dieser Seite sind Einschätzungen und Auswertungen des bisher Erfassten. Das System empfiehlt keinen Preis, leitet aus dem Feedback keine Preisänderung ab und sagt nichts über einen erzielbaren Verkaufspreis zu.</div>

    {drift?<div className="form-warning">Der in der Objektakte geführte Preis ({money(d.property.purchase_price)}) weicht von der jüngsten Preisstufe ({money(current.price)}) ab. Beim Erfassen einer Stufe lässt sich der Objektpreis mit angleichen.</div>:null}

    <section className="metric-grid">
      <article className="metric-card"><span>Aktueller Preis</span><strong>{current?money(current.price):money(d.property.purchase_price)}</strong><small>{current?`seit ${formatDate(current.effective_from)} · ${current.days} Tage`:"keine Preisstufe erfasst"}</small></article>
      <article className="metric-card"><span>Preisstufen</span><strong>{stages.length}</strong><small>{stages.length>1?`${money(stages[stages.length-1].price)} zu Beginn`:"nur Ausgangspreis"}</small></article>
      <article className="metric-card"><span>Besichtigungen</span><strong>{(d.viewings as any[]).length}</strong><small>{summary.total} mit Feedback</small></article>
      <article className="metric-card"><span>Preisrückmeldungen</span><strong>{summary.withPrice}</strong><small>{summary.withPrice?`Median ${money(summary.median)}`:"noch keine"}</small></article>
      <article className="metric-card"><span>Wertermittlungen</span><strong>{(d.valuations as any[]).length}</strong><small>am Objekt erfasst</small></article>
    </section>

    <section className="data-card" id="preisverlauf"><div className="card-head"><div><p className="eyebrow">Zeitleiste</p><h2>Preisverlauf</h2></div></div>
      {stages.length===0?<p className="empty-state">Noch keine Preisstufe erfasst. Die erste Stufe ist der Ausgangspreis.</p>:<div className="data-list">
        {stages.map((stage:any)=>{
          const decided=one(stage.profiles);
          const delta=stage.previous_price?Number(stage.price)-Number(stage.previous_price):null;
          return <div className="data-row" key={stage.id}>
            <div><strong>{money(stage.price)}{delta!==null?` (${delta>0?"+":""}${money(delta)})`:" · Ausgangspreis"}</strong><small>{formatDate(stage.effective_from)}{stage.until?` bis ${formatDate(stage.until)}`:" bis heute"} · {stage.days} Tage{decided?.display_name?` · ${decided.display_name}`:""}</small></div>
            <div className="row-meta"><span>{stage.inquiries} Anfragen · {stage.viewings} Besichtigungen · {stage.offers} Angebote</span><small>in dieser Preisstufe</small></div>
            <div className="row-meta"><span>{stage.reason||(stage.is_initial?"Ausgangspreis":"ohne Begründung")}</span><small>{stage.note?stage.note.slice(0,70):""}</small></div>
          </div>;
        })}
      </div>}
      {d.canWrite?<Form method="post" className="editor-card" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="stage_add"/>
        <input type="hidden" name="is_initial" value={hasInitial?"no":"yes"}/>
        {hasInitial&&current?<input type="hidden" name="previous_price" value={current.price}/>:null}
        <div className="card-head"><div><p className="eyebrow">Neue Stufe</p><h3>{hasInitial?"Preisänderung erfassen":"Ausgangspreis erfassen"}</h3></div></div>
        <div className="form-grid">
          <label className="form-field"><span>{hasInitial?"Neuer Preis €":"Ausgangspreis €"} *</span><input name="price" inputMode="decimal" required/>{hasInitial&&current?<small className="subtle">Bisher {money(current.price)}</small>:null}</label>
          <label className="form-field"><span>Gültig ab *</span><input name="effective_from" type="date" defaultValue={today()} max={today()} required/></label>
          <label className="form-field"><span>Entschieden von</span><select name="decided_by" defaultValue="">{d.profiles.map((p:any)=><option value={p.user_id} key={p.user_id}>{p.display_name}</option>)}</select></label>
          <label className="form-field"><span>Objektpreis angleichen</span><select name="sync_property" defaultValue="yes"><option value="yes">Ja</option><option value="no">Nein</option></select><small className="subtle">Hält Objektakte und Verlauf zusammen.</small></label>
        </div>
        <label className="form-field full-width"><span>Begründung{hasInitial?" *":""}</span><textarea name="reason" rows={2} required={hasInitial} placeholder={hasInitial?"Warum wird der Preis geändert?":"Optional: wie kam der Ausgangspreis zustande?"}/></label>
        <label className="form-field full-width"><span>Interne Notiz</span><input name="note"/></label>
        <div className="form-actions"><button className="primary-button" type="submit">{hasInitial?"Preisänderung speichern":"Ausgangspreis speichern"}</button></div>
      </Form>:null}
    </section>

    <section className="data-card" id="feedback"><div className="card-head"><div><p className="eyebrow">Verdichtet</p><h2>Besichtigungsfeedback</h2></div><Link className="subtle-link" to={`/properties/${d.property.id}/interests`}>Besichtigungen öffnen →</Link></div>
      {summary.total===0?<p className="empty-state">Zu diesem Objekt liegt noch kein Besichtigungsfeedback vor.</p>:<>
        <dl className="detail-list">
          <div><dt>Rückmeldungen</dt><dd>{summary.total} von {(d.viewings as any[]).length} Besichtigungen</dd></div>
          <div><dt>Mit Preisangabe</dt><dd>{summary.withPrice}{summary.withPrice&&current?`, davon ${summary.below} unter dem aktuellen Preis`:""}</dd></div>
          <div><dt>Genannte Spanne</dt><dd>{summary.withPrice?`${money(summary.lowest)} bis ${money(summary.highest)} · Median ${money(summary.median)}`:"—"}</dd></div>
          <div><dt>Interesse</dt><dd>{Object.entries(summary.levels).filter(([,count])=>count>0).map(([level,count])=>`${count}× ${INTEREST[level]}`).join(" · ")||"nicht erfasst"}</dd></div>
        </dl>
        {summary.withPrice&&current?<p className="subtle" style={{marginTop:"0.5rem"}}>Von {summary.withPrice} Preisrückmeldungen liegen {summary.below} unter dem aktuellen Preis von {money(current.price)}. Das ist eine Auszählung des Erfassten, keine Preisempfehlung.</p>:null}
        {summary.concerns.length?<div className="data-list" style={{marginTop:"0.75rem"}}>{summary.concerns.slice(0,12).map((concern:string,index:number)=><div className="data-row" key={index}><div><strong>Bedenken</strong><small>{concern}</small></div></div>)}</div>:null}
      </>}
    </section>

    <section className="data-card" id="wertermittlung"><div className="card-head"><div><p className="eyebrow">Belegbar</p><h2>Wertermittlung</h2></div></div>
      {(d.valuations as any[]).length===0?<p className="empty-state">Noch keine Wertermittlung erfasst.</p>:(d.valuations as any[]).map((v:any)=>{
        const valuer=one(v.profiles);
        const comparables=(v.property_valuation_comparables??[]) as any[];
        const adjustments=(v.property_valuation_adjustments??[]) as any[];
        return <section className="editor-card" style={{marginTop:"1rem"}} key={v.id}>
          <div className="card-head"><div><p className="eyebrow">{v.valuation_number} · {VALUATION_METHOD[v.method]??v.method}</p><h3>{v.result_value?money(v.result_value):v.range_from?`${money(v.range_from)} bis ${money(v.range_to)}`:"ohne Ergebnis"}</h3></div><span className="status-pill">{formatDate(v.valued_on)}</span></div>
          <dl className="detail-list">
            <div><dt>Bewertet von</dt><dd>{valuer?.display_name??v.valuer_name??"—"}</dd></div>
            <div><dt>Spanne</dt><dd>{v.range_from?`${money(v.range_from)} bis ${money(v.range_to)}`:"nicht angegeben"}</dd></div>
            <div><dt>Bodenrichtwert</dt><dd>{v.land_reference_value?`${money(v.land_reference_value)} je m² · Stichtag ${formatDate(v.land_reference_date)}`:"nicht angegeben"}</dd></div>
            <div><dt>Quelle</dt><dd>{v.land_reference_source||"—"}</dd></div>
          </dl>
          {v.assumptions?<p className="subtle">{v.assumptions}</p>:null}

          <div className="card-head" style={{marginTop:"1rem"}}><div><p className="eyebrow">Herangezogen</p><h4>{comparables.length} Vergleichsobjekte</h4></div></div>
          {comparables.length===0?<p className="empty-state">Noch kein Vergleichsobjekt erfasst.</p>:<div className="data-list">
            {comparables.map((c:any)=><div className="data-row" key={c.id}>
              <div><strong>{c.label}</strong><small>{c.source} · Stichtag {formatDate(c.reference_date)}{c.note?` · ${c.note}`:""}</small></div>
              <div className="row-meta"><span>{money(c.price)}</span><small>{c.living_area_sqm?`${Number(c.living_area_sqm).toLocaleString("de-DE")} m² · ${money(Number(c.price)/Number(c.living_area_sqm))} je m²`:"ohne Flächenangabe"}</small></div>
              {d.canValuation?<Form method="post"><input type="hidden" name="_intent" value="comparable_remove"/><input type="hidden" name="comparable_id" value={c.id}/><button className="secondary-button" type="submit">Entfernen</button></Form>:null}
            </div>)}
          </div>}
          {d.canValuation?<Form method="post" style={{marginTop:"0.75rem"}}>
            <input type="hidden" name="_intent" value="comparable_add"/>
            <input type="hidden" name="valuation_id" value={v.id}/>
            <div className="form-grid">
              <label className="form-field"><span>Bezeichnung *</span><input name="label" required placeholder="Objekt und Lage"/></label>
              <label className="form-field"><span>Preis € *</span><input name="price" inputMode="decimal" required/></label>
              <label className="form-field"><span>Wohnfläche m²</span><input name="living_area_sqm" inputMode="decimal"/></label>
              <label className="form-field"><span>Stichtag *</span><input name="reference_date" type="date" max={today()} required/></label>
              <label className="form-field"><span>Quelle *</span><input name="source" required placeholder="Kaufpreissammlung, eigene Vermittlung, Portal"/></label>
              <label className="form-field"><span>Notiz</span><input name="note"/></label>
            </div>
            <div className="form-actions"><button className="secondary-button" type="submit">Vergleichsobjekt erfassen</button></div>
          </Form>:null}

          <div className="card-head" style={{marginTop:"1rem"}}><div><p className="eyebrow">Begründet</p><h4>{adjustments.length} Zu- und Abschläge</h4></div></div>
          {adjustments.length===0?<p className="empty-state">Noch kein Zu- oder Abschlag erfasst.</p>:<div className="data-list">
            {adjustments.map((a:any)=><div className="data-row" key={a.id}>
              <div><strong>{a.label}</strong><small>{a.reason}</small></div>
              <div className="row-meta"><span className={Number(a.amount??a.percent)<0?"status-pill status-lost":"status-pill status-sold"}>{a.amount!==null&&a.amount!==undefined?`${Number(a.amount)>0?"+":""}${money(a.amount)}`:`${Number(a.percent)>0?"+":""}${Number(a.percent).toLocaleString("de-DE",{maximumFractionDigits:3})} %`}</span></div>
              {d.canValuation?<Form method="post"><input type="hidden" name="_intent" value="adjustment_remove"/><input type="hidden" name="adjustment_id" value={a.id}/><button className="secondary-button" type="submit">Entfernen</button></Form>:null}
            </div>)}
          </div>}
          {d.canValuation?<Form method="post" style={{marginTop:"0.75rem"}}>
            <input type="hidden" name="_intent" value="adjustment_add"/>
            <input type="hidden" name="valuation_id" value={v.id}/>
            <div className="form-grid">
              <label className="form-field"><span>Bezeichnung *</span><input name="label" required/></label>
              <label className="form-field"><span>Art *</span><select name="kind" defaultValue="AMOUNT"><option value="AMOUNT">Betrag in €</option><option value="PERCENT">Prozent</option></select></label>
              <label className="form-field"><span>Wert *</span><input name="value" inputMode="decimal" required placeholder="negativ für Abschlag"/></label>
            </div>
            <label className="form-field full-width"><span>Begründung *</span><input name="reason" required/></label>
            <div className="form-actions"><button className="secondary-button" type="submit">Zu- oder Abschlag erfassen</button></div>
          </Form>:null}

          {d.canValuation?<Form method="post" style={{marginTop:"0.75rem"}}>
            <input type="hidden" name="_intent" value="valuation_result"/>
            <input type="hidden" name="valuation_id" value={v.id}/>
            <input type="hidden" name="version" value={v.version}/>
            <div className="form-grid">
              <label className="form-field"><span>Ergebnis der Einschätzung €</span><input name="result_value" inputMode="decimal" defaultValue={v.result_value??""}/><small className="subtle">Muss innerhalb der Spanne liegen. Im Vergleichswertverfahren erst mit mindestens einem Vergleichsobjekt speicherbar.</small></label>
            </div>
            <div className="form-actions"><button className="primary-button" type="submit">Ergebnis speichern</button></div>
          </Form>:null}
        </section>;
      })}

      {d.canValuation?<Form method="post" className="editor-card" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="valuation_create"/>
        <div className="card-head"><div><p className="eyebrow">Neu</p><h3>Wertermittlung anlegen</h3></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Verfahren *</span><select name="method" defaultValue="COMPARATIVE" required>{Object.entries(VALUATION_METHOD).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
          <label className="form-field"><span>Bewertungsdatum *</span><input name="valued_on" type="date" defaultValue={today()} max={today()} required/></label>
          <label className="form-field"><span>Bewerter</span><select name="valuer_user" defaultValue="">{d.profiles.map((p:any)=><option value={p.user_id} key={p.user_id}>{p.display_name}</option>)}</select></label>
          <label className="form-field"><span>Externer Bewerter</span><input name="valuer_name" placeholder="falls extern erstellt"/></label>
          <label className="form-field"><span>Zugehöriger Lead</span><select name="lead_id" defaultValue=""><option value="">—</option>{d.leads.map((l:any)=><option value={l.id} key={l.id}>{l.lead_number}</option>)}</select></label>
          <label className="form-field"><span>Bodenrichtwert € je m²</span><input name="land_reference_value" inputMode="decimal"/></label>
          <label className="form-field"><span>Stichtag Bodenrichtwert</span><input name="land_reference_date" type="date" max={today()}/></label>
          <label className="form-field"><span>Quelle Bodenrichtwert</span><input name="land_reference_source" placeholder="Gutachterausschuss, Stand"/></label>
          <label className="form-field"><span>Spanne von €</span><input name="range_from" inputMode="decimal"/></label>
          <label className="form-field"><span>Spanne bis €</span><input name="range_to" inputMode="decimal"/></label>
        </div>
        <label className="form-field full-width"><span>Annahmen</span><textarea name="assumptions" rows={2}/></label>
        <label className="form-field full-width"><span>Notizen</span><textarea name="notes" rows={2}/></label>
        <div className="form-actions"><button className="primary-button" type="submit">Wertermittlung anlegen</button></div>
      </Form>:null}
    </section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Grenze der Software</p><h2>Was das System nicht tut</h2></div></div>
      <ul className="subtle">
        <li>Es leitet aus dem Besichtigungsfeedback keinen Preis ab und schlägt keine Preisänderung vor.</li>
        <li>Es rechnet Zu- und Abschläge nicht automatisch in ein Ergebnis um — die Einschätzung bleibt eine menschliche Entscheidung.</li>
        <li>Es prüft nicht, ob die herangezogenen Vergleichsobjekte tatsächlich vergleichbar sind.</li>
        <li>Es trifft keine Aussage über einen erzielbaren Verkaufspreis und gibt keine Preisgarantie.</li>
        <li>Eine Wertermittlung nach dieser Erfassung ist kein Verkehrswertgutachten im Sinne der ImmoWertV.</li>
      </ul>
    </section>
  </main>;
}
