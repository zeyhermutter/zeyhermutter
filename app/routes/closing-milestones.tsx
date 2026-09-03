import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/closing-milestones";
import { requirePermission } from "~/lib/auth.server";
import { crmDateAtTimeToIso, crmLocalDateTimeToIso } from "~/lib/local-time";

type ActionResult={error?:string};

const APPLICABILITY:Record<string,string>={REQUIRED:"Einschlägig",NOT_APPLICABLE:"Nicht einschlägig",UNCLEAR:"Noch zu klären"};
const METER_TYPE:Record<string,string>={ELECTRICITY:"Strom",GAS:"Gas",WATER_COLD:"Kaltwasser",WATER_HOT:"Warmwasser",HEAT:"Wärme",OTHER:"Sonstiger Zähler"};
const KEY_TYPE:Record<string,string>={HOUSE_DOOR:"Haustür",APARTMENT:"Wohnungstür",BASEMENT:"Keller",ATTIC:"Dachboden",MAILBOX:"Briefkasten",GARAGE:"Garage",GATE:"Hoftor",WINDOW:"Fenster",UTILITY_ROOM:"Technikraum",OTHER:"Sonstiger Schlüssel"};
/** Was der jeweilige Meilenstein in der Praxis bedeutet — Erfassungshilfe, keine Rechtsauskunft. */
const MILESTONE_HINT:Record<string,string>={
  PRIORITY_NOTICE:"Datum der Eintragung im Grundbuch.",
  ENCUMBRANCE_RELEASE:"Eingeleitet: Freistellungsunterlagen angefordert. Erledigt: alle Löschungsbewilligungen liegen vor.",
  MUNICIPAL_PRE_EMPTION:"Eingeleitet: Anfrage an die Gemeinde. Erledigt: Verzicht oder Negativattest erhalten.",
  TENANT_PRE_EMPTION:"Nur bei Umwandlung einschlägig. Eingeleitet: Mitteilung an den Mieter. Frist: Ende der Ausübungsfrist.",
  HOA_MANAGER_CONSENT:"Nur wenn die Teilungserklärung sie vorsieht. Erledigt: Zustimmung liegt vor.",
  NOTARY_DUE_NOTICE:"Datum, an dem die Fälligkeitsmitteilung des Notariats eingegangen ist.",
  TRANSFER_TAX_ASSESSMENT:"Datum des Grunderwerbsteuerbescheids.",
  TAX_CLEARANCE:"Datum der Unbedenklichkeitsbescheinigung des Finanzamts.",
  TITLE_TRANSFER:"Erst mit diesem Datum gilt der Vorgang als vollständig abgeschlossen.",
};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function formatMoment(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(value));}
function isoToLocal(value:string|null){if(!value)return"";const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(value));const g=(t:string)=>p.find((x)=>x.type===t)?.value??"";return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;}
function today(){return new Date().toISOString().slice(0,10);}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("MILESTONE_CLOSING_NOT_FOUND"))return"Der Abschlussvorgang wurde nicht gefunden.";
  if(message.includes("MILESTONE_KEY_IMMUTABLE"))return"Der Meilenstein selbst kann nicht umbenannt werden.";
  if(message.includes("MILESTONE_INITIATED_IN_FUTURE"))return"Das Datum der Einleitung darf nicht in der Zukunft liegen.";
  if(message.includes("MILESTONE_COMPLETED_IN_FUTURE"))return"Das Erledigungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("MILESTONE_TITLE_BEFORE_NOTARIZATION"))return"Die Eigentumsumschreibung kann nicht vor der Beurkundung erfolgt sein.";
  if(message.includes("sale_closing_milestones_dates_check"))return"Die Erledigung kann nicht vor der Einleitung liegen.";
  if(message.includes("sale_closing_milestones_not_applicable_check"))return"Ein als nicht einschlägig gekennzeichneter Meilenstein darf keine Datumsangaben enthalten.";
  if(message.includes("HANDOVER_CLOSING_CANCELLED"))return"Zu einem abgebrochenen Vorgang lässt sich kein Übergabeprotokoll führen.";
  if(message.includes("HANDOVER_DATE_IN_FUTURE"))return"Der Übergabetermin darf nicht in der Zukunft liegen.";
  if(message.includes("HANDOVER_DATE_REQUIRED_BEFORE_CONFIRMATION"))return"Vor der Bestätigung durch die Beteiligten wird der Übergabetermin benötigt.";
  if(message.includes("HANDOVER_DOCUMENT_NOT_FOUND"))return"Das gewählte Dokument wurde nicht gefunden.";
  if(message.includes("sale_handover_protocols_seller_check"))return"Zur Bestätigung der Verkäuferseite gehört der Name der bestätigenden Person.";
  if(message.includes("sale_handover_protocols_buyer_check"))return"Zur Bestätigung der Käuferseite gehört der Name der bestätigenden Person.";
  if(message.includes("sale_handover_meters_read_date_check"))return"Das Ablesedatum darf nicht in der Zukunft liegen.";
  if(message.includes("sale_handover_meters_reading_check"))return"Der Zählerstand darf nicht negativ sein.";
  if(message.includes("sale_handover_keys_quantity_check"))return"Die Schlüsselanzahl muss größer als null sein.";
  if(message.includes("sale_handover_keys_protocol_id_key_type_label_key"))return"Diese Schlüsselart ist mit dieser Bezeichnung bereits erfasst.";
  return "Die Angaben konnten nicht gespeichert werden.";
}

export function openMilestones(milestones:any[]){
  return milestones.filter((row)=>row.applicability!=="NOT_APPLICABLE"&&!row.completed_on);
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"closing.read");
  const closingId=params.closingId!;
  const {data:row,error}=await supabase.from("sale_closings")
    .select("id,closing_number,status,property_id,handover_date,notarized_date,completed_date,properties!inner(id,property_number,internal_title),buyer:contacts!sale_closings_buyer_contact_id_fkey(id,first_name,last_name)")
    .eq("id",closingId).maybeSingle();
  if(error||!row)throw new Response("Abschlussvorgang nicht gefunden.",{status:404,headers:responseHeaders()});
  const [{data:milestones},{data:protocol},{data:profiles},{data:documents},{data:canWrite},{data:canTask}]=await Promise.all([
    supabase.from("sale_closing_milestones").select("*,profiles(user_id,display_name)").eq("sale_closing_id",closingId).order("sort_order"),
    supabase.from("sale_handover_protocols").select("*").eq("sale_closing_id",closingId).maybeSingle(),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.from("documents").select("id,title,category").eq("property_id",(row as any).property_id).is("archived_at",null).order("created_at",{ascending:false}).limit(200),
    supabase.rpc("current_user_has_permission",{p_permission:"closing.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"task.write"}),
  ]);
  let meters:any[]=[],keys:any[]=[];
  if(protocol){
    const [{data:m},{data:k}]=await Promise.all([
      supabase.from("sale_handover_meters").select("*").eq("protocol_id",(protocol as any).id).order("meter_type"),
      supabase.from("sale_handover_keys").select("*").eq("protocol_id",(protocol as any).id).order("key_type"),
    ]);
    meters=m??[];keys=k??[];
  }
  return data({profile,row,milestones:milestones??[],protocol,meters,keys,profiles:profiles??[],documents:documents??[],canWrite:canWrite===true,canTask:canTask===true},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"closing.write");
  const closingId=params.closingId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const back=`/closings/${closingId}/milestones`;
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Der Datensatz wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="milestone_save"){
    const applicability=text(fd,"applicability");
    if(!Object.keys(APPLICABILITY).includes(applicability))return invalid("Ungültige Angabe zur Einschlägigkeit.");
    const notApplicable=applicability==="NOT_APPLICABLE";
    const payload:Record<string,unknown>={
      applicability,
      initiated_on:notApplicable?null:dateOrNull(fd,"initiated_on"),
      completed_on:notApplicable?null:dateOrNull(fd,"completed_on"),
      deadline_on:notApplicable?null:dateOrNull(fd,"deadline_on"),
      reference:text(fd,"reference")||null,
      responsible_user:text(fd,"responsible_user")||null,
      note:text(fd,"note")||null,
      updated_by:userId,
    };
    const {data:updated,error}=await supabase.from("sale_closing_milestones").update(payload)
      .eq("id",text(fd,"milestone_id")).eq("sale_closing_id",closingId).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="milestone_reminder"){
    await requirePermission(request,context.cloudflare.env,"task.write");
    const {data:milestone}=await supabase.from("sale_closing_milestones")
      .select("title,deadline_on,responsible_user,note").eq("id",text(fd,"milestone_id")).eq("sale_closing_id",closingId).maybeSingle();
    if(!milestone)return invalid("Der Meilenstein konnte nicht gelesen werden.");
    const {data:closing}=await supabase.from("sale_closings").select("closing_number,property_id,primary_responsible_user").eq("id",closingId).maybeSingle();
    const dueOn=(milestone as any).deadline_on??new Date(Date.now()+14*864e5).toISOString().slice(0,10);
    const dueAt=crmDateAtTimeToIso(dueOn);
    if(!dueAt)return invalid("Die Wiedervorlage konnte nicht terminiert werden.");
    const {error}=await supabase.from("tasks").insert({
      title:`${(milestone as any).title} · ${closing?.closing_number??""}`.trim(),
      description:"Stand dieses notariellen Meilensteins prüfen und im Abschlussvorgang dokumentieren.",
      status:"OPEN",priority:"NORMAL",due_at:dueAt,
      responsible_user:(milestone as any).responsible_user??closing?.primary_responsible_user??userId,
      property_id:closing?.property_id??null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="protocol_save"){
    const handoverRaw=text(fd,"handover_at");
    const handoverAt=handoverRaw?crmLocalDateTimeToIso(handoverRaw):null;
    if(handoverRaw&&!handoverAt)return invalid("Ungültiger Übergabetermin.");
    const sellerName=text(fd,"seller_confirmed_name");
    const buyerName=text(fd,"buyer_confirmed_name");
    const sellerConfirmed=text(fd,"seller_confirmed")==="yes";
    const buyerConfirmed=text(fd,"buyer_confirmed")==="yes";
    if(sellerConfirmed&&!sellerName)return invalid("Zur Bestätigung der Verkäuferseite gehört der Name der bestätigenden Person.");
    if(buyerConfirmed&&!buyerName)return invalid("Zur Bestätigung der Käuferseite gehört der Name der bestätigenden Person.");
    const existingId=text(fd,"protocol_id");
    const payload:Record<string,unknown>={
      sale_closing_id:closingId,
      handover_at:handoverAt,
      attendees:text(fd,"attendees")||null,
      room_condition:text(fd,"room_condition")||null,
      remaining_inventory:text(fd,"remaining_inventory")||null,
      defects:text(fd,"defects")||null,
      energy_certificate_handed_over:text(fd,"energy_certificate_handed_over")==="yes",
      remarks:text(fd,"remarks")||null,
      document_id:text(fd,"document_id")||null,
      seller_confirmed_name:sellerConfirmed?sellerName:null,
      buyer_confirmed_name:buyerConfirmed?buyerName:null,
      updated_by:userId,
    };
    if(existingId){
      const previousSeller=text(fd,"seller_confirmed_at_current");
      const previousBuyer=text(fd,"buyer_confirmed_at_current");
      payload.seller_confirmed_at=sellerConfirmed?(previousSeller||new Date().toISOString()):null;
      payload.buyer_confirmed_at=buyerConfirmed?(previousBuyer||new Date().toISOString()):null;
      const {data:updated,error}=await supabase.from("sale_handover_protocols").update(payload)
        .eq("id",existingId).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
      if(error)return fail(error);
      if(!updated)return conflict();
    }else{
      payload.seller_confirmed_at=sellerConfirmed?new Date().toISOString():null;
      payload.buyer_confirmed_at=buyerConfirmed?new Date().toISOString():null;
      const {error}=await supabase.from("sale_handover_protocols").insert({...payload,created_by:userId});
      if(error)return fail(error);
    }
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="meter_add"){
    const protocolId=text(fd,"protocol_id");
    if(!protocolId)return invalid("Bitte zuerst das Übergabeprotokoll anlegen.");
    const meterType=text(fd,"meter_type");
    if(!Object.keys(METER_TYPE).includes(meterType))return invalid("Ungültige Zählerart.");
    const reading=numOrNull(fd,"reading");
    if(reading===null||!Number.isFinite(reading))return invalid("Bitte einen gültigen Zählerstand angeben.");
    const {error}=await supabase.from("sale_handover_meters").insert({
      protocol_id:protocolId,meter_type:meterType,meter_number:text(fd,"meter_number")||null,
      reading,unit:text(fd,"unit")||null,read_on:dateOrNull(fd,"read_on")??today(),note:text(fd,"note")||null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="meter_remove"){
    const {error}=await supabase.from("sale_handover_meters").delete().eq("id",text(fd,"meter_id"));
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="key_add"){
    const protocolId=text(fd,"protocol_id");
    if(!protocolId)return invalid("Bitte zuerst das Übergabeprotokoll anlegen.");
    const keyType=text(fd,"key_type");
    if(!Object.keys(KEY_TYPE).includes(keyType))return invalid("Ungültige Schlüsselart.");
    const quantity=Number.parseInt(text(fd,"quantity"),10);
    if(!Number.isFinite(quantity)||quantity<1)return invalid("Bitte eine Anzahl größer als null angeben.");
    const {error}=await supabase.from("sale_handover_keys").insert({
      protocol_id:protocolId,key_type:keyType,label:text(fd,"label")||null,quantity,note:text(fd,"note")||null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="key_remove"){
    const {error}=await supabase.from("sale_handover_keys").delete().eq("id",text(fd,"key_id"));
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

export default function ClosingMilestones(){
  const d=useLoaderData<typeof loader>();
  const r=useActionData<typeof action>();
  const row=d.row as any;
  const property=one(row.properties);
  const buyer=one(row.buyer);
  const milestones=d.milestones as any[];
  const protocol=d.protocol as any;
  const locked=!d.canWrite;
  const open=openMilestones(milestones);
  const titleTransfer=milestones.find((m)=>m.milestone_key==="TITLE_TRANSFER");
  const overdue=open.filter((m)=>m.deadline_on&&m.deadline_on<today());
  const totalKeys=(d.keys as any[]).reduce((sum,k)=>sum+Number(k.quantity??0),0);
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to={`/closings/${row.id}`}>← Abschlussakte</Link><p className="eyebrow">{row.closing_number}</p><h1 className="editor-title">Meilensteine & Übergabe</h1><p className="editor-meta">{property.property_number} · {buyer.first_name} {buyer.last_name}</p></div><div className="header-actions"><span className={`status-pill ${titleTransfer?.completed_on?"status-sold":"status-draft"}`}>{titleTransfer?.completed_on?"Umgeschrieben":`${open.length} offen`}</span><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div></header>

    {r?.error?<div className="form-error">{r.error}</div>:null}
    <div className="form-warning"><strong>Erfassung, keine rechtliche Prüfung.</strong> Ob ein Meilenstein im konkreten Fall einschlägig ist, entscheidet die Bearbeitung. Das System schlägt nichts vor und leitet keine Rechtsfolge ab. Erst mit dokumentierter Eigentumsumschreibung lässt sich der Vorgang abschließen.</div>

    <section className="metric-grid">
      <article className="metric-card"><span>Offene Meilensteine</span><strong>{open.length}</strong><small>von {milestones.filter((m)=>m.applicability!=="NOT_APPLICABLE").length} einschlägigen</small></article>
      <article className="metric-card"><span>Fristen überschritten</span><strong>{overdue.length}</strong><small>{overdue.length?"dringend prüfen":"keine Überschreitung"}</small></article>
      <article className="metric-card"><span>Eigentumsumschreibung</span><strong>{titleTransfer?.completed_on?formatDate(titleTransfer.completed_on):"offen"}</strong><small>Voraussetzung für den Abschluss</small></article>
      <article className="metric-card"><span>Übergabeprotokoll</span><strong>{protocol?.handover_at?formatMoment(protocol.handover_at):protocol?"angelegt":"fehlt"}</strong><small>{protocol?`${(d.meters as any[]).length} Zähler · ${totalKeys} Schlüssel`:"noch nicht erfasst"}</small></article>
    </section>

    <section className="data-card" id="meilensteine"><div className="card-head"><div><p className="eyebrow">Zwischen Beurkundung und Grundbuch</p><h2>Notarielle Meilensteine</h2></div></div>
      <div className="data-list">
        {milestones.map((m:any)=>{
          const responsible=one(m.profiles);
          const isOverdue=m.deadline_on&&!m.completed_on&&m.deadline_on<today()&&m.applicability!=="NOT_APPLICABLE";
          return <div className="data-row" key={m.id}>
            <div><strong>{m.title}</strong><small>{MILESTONE_HINT[m.milestone_key]??""}</small></div>
            <div className="row-meta">
              {m.applicability==="NOT_APPLICABLE"?<span className="status-pill status-archived">Nicht einschlägig</span>
                :m.completed_on?<span className="status-pill status-sold">Erledigt {formatDate(m.completed_on)}</span>
                :isOverdue?<span className="status-pill status-lost">Frist überschritten</span>
                :m.initiated_on?<span className="status-pill status-marketing">Eingeleitet {formatDate(m.initiated_on)}</span>
                :<span className="status-pill status-draft">{APPLICABILITY[m.applicability]}</span>}
              <small>{m.deadline_on?`Frist ${formatDate(m.deadline_on)}`:responsible?.display_name??""}</small>
            </div>
            <div className="row-meta"><span>{m.reference||"—"}</span><small>{m.note?m.note.slice(0,60):""}</small></div>
            {d.canTask&&!m.completed_on&&m.applicability!=="NOT_APPLICABLE"?<Form method="post"><input type="hidden" name="_intent" value="milestone_reminder"/><input type="hidden" name="milestone_id" value={m.id}/><button className="secondary-button" type="submit">Wiedervorlage</button></Form>:null}
          </div>;
        })}
      </div>
      {milestones.map((m:any)=><Form method="post" className="editor-card" style={{marginTop:"1rem"}} key={`f-${m.id}`}>
        <input type="hidden" name="_intent" value="milestone_save"/>
        <input type="hidden" name="milestone_id" value={m.id}/>
        <input type="hidden" name="version" value={m.version}/>
        <div className="card-head"><div><p className="eyebrow">Meilenstein</p><h3>{m.title}</h3></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Einschlägig</span><select name="applicability" defaultValue={m.applicability} disabled={locked}>{Object.entries(APPLICABILITY).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select><small className="subtle">Bei „Nicht einschlägig" werden Datumsangaben verworfen.</small></label>
          <label className="form-field"><span>Eingeleitet am</span><input name="initiated_on" type="date" defaultValue={m.initiated_on??""} max={today()} disabled={locked}/></label>
          <label className="form-field"><span>Erledigt am</span><input name="completed_on" type="date" defaultValue={m.completed_on??""} max={today()} disabled={locked}/></label>
          <label className="form-field"><span>Frist</span><input name="deadline_on" type="date" defaultValue={m.deadline_on??""} disabled={locked}/></label>
          <label className="form-field"><span>Referenz / Aktenzeichen</span><input name="reference" defaultValue={m.reference??""} disabled={locked}/></label>
          <label className="form-field"><span>Zuständig</span><select name="responsible_user" defaultValue={m.responsible_user??""} disabled={locked}><option value="">—</option>{d.profiles.map((p:any)=><option value={p.user_id} key={p.user_id}>{p.display_name}</option>)}</select></label>
        </div>
        <label className="form-field full-width"><span>Notiz</span><textarea name="note" rows={2} defaultValue={m.note??""} disabled={locked}/></label>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={locked}>Meilenstein speichern</button></div>
      </Form>)}
    </section>

    <section className="editor-card" id="uebergabe"><div className="card-head"><div><p className="eyebrow">Schlüsselübergabe</p><h2>Übergabeprotokoll</h2></div>{protocol?<span className="status-pill">Version {protocol.version}</span>:<span className="status-pill status-draft">Noch nicht angelegt</span>}</div>
      <Form method="post">
        <input type="hidden" name="_intent" value="protocol_save"/>
        {protocol?<input type="hidden" name="protocol_id" value={protocol.id}/>:null}
        {protocol?<input type="hidden" name="version" value={protocol.version}/>:null}
        {protocol?<input type="hidden" name="seller_confirmed_at_current" value={protocol.seller_confirmed_at??""}/>:null}
        {protocol?<input type="hidden" name="buyer_confirmed_at_current" value={protocol.buyer_confirmed_at??""}/>:null}
        <div className="form-grid">
          <label className="form-field"><span>Übergabetermin</span><input name="handover_at" type="datetime-local" defaultValue={isoToLocal(protocol?.handover_at??null)} disabled={locked}/><small className="subtle">Ortszeit. Abschlussakte: {row.handover_date?formatDate(row.handover_date):"kein Übergabedatum"}</small></label>
          <label className="form-field"><span>Energieausweis übergeben</span><select name="energy_certificate_handed_over" defaultValue={protocol?.energy_certificate_handed_over?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Protokoll als Dokument</span><select name="document_id" defaultValue={protocol?.document_id??""} disabled={locked}><option value="">—</option>{d.documents.map((doc:any)=><option value={doc.id} key={doc.id}>{doc.title}</option>)}</select><small className="subtle">Aus der Dokumentenakte der Immobilie.</small></label>
          <label className="form-field"><span>Verkäuferseite bestätigt</span><select name="seller_confirmed" defaultValue={protocol?.seller_confirmed_at?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select><small className="subtle">{protocol?.seller_confirmed_at?formatMoment(protocol.seller_confirmed_at):"noch nicht bestätigt"}</small></label>
          <label className="form-field"><span>Name Verkäuferseite</span><input name="seller_confirmed_name" defaultValue={protocol?.seller_confirmed_name??""} disabled={locked}/></label>
          <label className="form-field"><span>Käuferseite bestätigt</span><select name="buyer_confirmed" defaultValue={protocol?.buyer_confirmed_at?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select><small className="subtle">{protocol?.buyer_confirmed_at?formatMoment(protocol.buyer_confirmed_at):"noch nicht bestätigt"}</small></label>
          <label className="form-field"><span>Name Käuferseite</span><input name="buyer_confirmed_name" defaultValue={protocol?.buyer_confirmed_name??""} disabled={locked}/></label>
        </div>
        <label className="form-field full-width"><span>Anwesende</span><textarea name="attendees" rows={2} defaultValue={protocol?.attendees??""} disabled={locked}/></label>
        <label className="form-field full-width"><span>Zustand der Räume</span><textarea name="room_condition" rows={3} defaultValue={protocol?.room_condition??""} disabled={locked}/></label>
        <label className="form-field full-width"><span>Verbleibendes Inventar</span><textarea name="remaining_inventory" rows={3} defaultValue={protocol?.remaining_inventory??""} disabled={locked}/></label>
        <label className="form-field full-width"><span>Mängel</span><textarea name="defects" rows={3} defaultValue={protocol?.defects??""} disabled={locked}/></label>
        <label className="form-field full-width"><span>Bemerkungen</span><textarea name="remarks" rows={2} defaultValue={protocol?.remarks??""} disabled={locked}/></label>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={locked}>{protocol?"Protokoll speichern":"Protokoll anlegen"}</button></div>
      </Form>
    </section>

    {protocol?<div className="dashboard-grid property-section">
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Ablesung</p><h2>Zählerstände</h2></div><span className="subtle">{(d.meters as any[]).length}</span></div>
        {(d.meters as any[]).length===0?<p className="empty-state">Noch kein Zählerstand erfasst.</p>:<div className="data-list">
          {(d.meters as any[]).map((m:any)=><div className="data-row" key={m.id}>
            <div><strong>{METER_TYPE[m.meter_type]??m.meter_type}</strong><small>{m.meter_number?`Nr. ${m.meter_number}`:"ohne Zählernummer"}{m.note?` · ${m.note}`:""}</small></div>
            <div className="row-meta"><span>{Number(m.reading).toLocaleString("de-DE",{maximumFractionDigits:3})}{m.unit?` ${m.unit}`:""}</span><small>abgelesen {formatDate(m.read_on)}</small></div>
            {d.canWrite?<Form method="post"><input type="hidden" name="_intent" value="meter_remove"/><input type="hidden" name="meter_id" value={m.id}/><button className="secondary-button" type="submit">Entfernen</button></Form>:null}
          </div>)}
        </div>}
        {d.canWrite?<Form method="post" style={{marginTop:"1rem"}}>
          <input type="hidden" name="_intent" value="meter_add"/>
          <input type="hidden" name="protocol_id" value={protocol.id}/>
          <div className="form-grid">
            <label className="form-field"><span>Zählerart *</span><select name="meter_type" defaultValue="ELECTRICITY" required>{Object.entries(METER_TYPE).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
            <label className="form-field"><span>Zählernummer</span><input name="meter_number"/></label>
            <label className="form-field"><span>Stand *</span><input name="reading" inputMode="decimal" required/></label>
            <label className="form-field"><span>Einheit</span><input name="unit" placeholder="kWh, m³"/></label>
            <label className="form-field"><span>Abgelesen am *</span><input name="read_on" type="date" defaultValue={today()} max={today()} required/></label>
            <label className="form-field"><span>Notiz</span><input name="note"/></label>
          </div>
          <div className="form-actions"><button className="secondary-button" type="submit">Zähler erfassen</button></div>
        </Form>:null}
      </section>

      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Übergeben</p><h2>Schlüssel</h2></div><span className="subtle">{totalKeys} Stück</span></div>
        {(d.keys as any[]).length===0?<p className="empty-state">Noch kein Schlüssel erfasst.</p>:<div className="data-list">
          {(d.keys as any[]).map((k:any)=><div className="data-row" key={k.id}>
            <div><strong>{KEY_TYPE[k.key_type]??k.key_type}{k.label?` · ${k.label}`:""}</strong><small>{k.note||"—"}</small></div>
            <div className="row-meta"><span>{k.quantity} Stück</span></div>
            {d.canWrite?<Form method="post"><input type="hidden" name="_intent" value="key_remove"/><input type="hidden" name="key_id" value={k.id}/><button className="secondary-button" type="submit">Entfernen</button></Form>:null}
          </div>)}
        </div>}
        {d.canWrite?<Form method="post" style={{marginTop:"1rem"}}>
          <input type="hidden" name="_intent" value="key_add"/>
          <input type="hidden" name="protocol_id" value={protocol.id}/>
          <div className="form-grid">
            <label className="form-field"><span>Schlüsselart *</span><select name="key_type" defaultValue="HOUSE_DOOR" required>{Object.entries(KEY_TYPE).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
            <label className="form-field"><span>Bezeichnung</span><input name="label" placeholder="z. B. Schließanlage A"/></label>
            <label className="form-field"><span>Anzahl *</span><input name="quantity" type="number" min={1} step={1} defaultValue={1} required/></label>
            <label className="form-field"><span>Notiz</span><input name="note"/></label>
          </div>
          <div className="form-actions"><button className="secondary-button" type="submit">Schlüssel erfassen</button></div>
        </Form>:null}
      </section>
    </div>:null}

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Vor produktiver Nutzung</p><h2>Anwaltlich abzunehmen</h2></div></div>
      <ul className="subtle">
        <li>Welche Meilensteine im eigenen Bundesland und bei welcher Objektart tatsächlich einschlägig sind.</li>
        <li>Wann ein Vorkaufsrecht des Mieters besteht, wie die Mitteilung zu erfolgen hat und wie die Frist läuft.</li>
        <li>Ob und wie das Übergabeprotokoll als Beweismittel taugt und welche Form die Bestätigung beider Seiten braucht.</li>
        <li>Wie mit bei der Übergabe festgestellten Mängeln umzugehen ist und wer sie wem mitteilt.</li>
        <li>Ob ein Reservierungsentgelt im jeweiligen Fall überhaupt vereinbart werden darf.</li>
      </ul>
    </section>
  </main>;
}
