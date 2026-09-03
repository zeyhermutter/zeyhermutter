import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/mandate-detail";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string;ok?:string};

const STATUS: Record<string,string> = {DRAFT:"Entwurf",ACTIVE:"Aktiv",WITHDRAWN:"Widerrufen",TERMINATED:"Gekündigt",EXPIRED:"Abgelaufen",FULFILLED:"Erfüllt",CANCELLED:"Verworfen"};
const STATUS_CLASS: Record<string,string> = {DRAFT:"status-draft",ACTIVE:"status-marketing",WITHDRAWN:"status-lost",TERMINATED:"status-lost",EXPIRED:"status-archived",FULFILLED:"status-sold",CANCELLED:"status-archived"};
const TYPE: Record<string,string> = {SIMPLE:"Einfacher Auftrag",EXCLUSIVE:"Alleinauftrag",QUALIFIED_EXCLUSIVE:"Qualifizierter Alleinauftrag"};
const CLIENT_SIDE: Record<string,string> = {SELLER:"Verkäufer beauftragt",BUYER:"Käufer beauftragt (Suchauftrag)",BOTH:"Doppeltätigkeit für beide Seiten"};
const CHANNEL: Record<string,string> = {IN_PERSON:"Persönlich",POSTAL:"Post",EMAIL:"E-Mail",WEB_FORM:"Webformular",PHONE:"Telefon",OTHER:"Sonstiges"};
const INSTRUCTION_FORM: Record<string,string> = {TEXT_FORM:"Textform",WRITTEN:"Schriftlich",HANDED_OVER:"Persönlich übergeben",EMAIL:"E-Mail",OTHER:"Sonstiges"};
const BASIS: Record<string,string> = {PURCHASE_PRICE:"Kaufpreis",NOTARIAL_PURCHASE_PRICE:"Beurkundeter Kaufpreis",OTHER:"Andere Bezugsgröße"};
const DUE_EVENT: Record<string,string> = {CONTRACT_CONCLUSION:"Vertragsschluss",NOTARIZATION:"Beurkundung",PURCHASE_PRICE_PAID:"Kaufpreiszahlung",HANDOVER:"Übergabe",OTHER:"Sonstiges"};
const SIDE: Record<string,string> = {SELLER:"Verkäuferseite",BUYER:"Käuferseite"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function integer(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const value=Number(raw);return Number.isInteger(value)?value:NaN;}
function decimal(fd:FormData,key:string){const raw=text(fd,key).replace(",",".");if(!raw)return null;const value=Number(raw);return Number.isFinite(value)?value:NaN;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(value));}
function money(value:number|string|null|undefined){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(n):"—";}
function today(){return new Date().toISOString().slice(0,10);}
function termLabel(term:any){if(!term)return"nicht vereinbart";return term.calculation_method==="PERCENT"?`${Number(term.agreed_percent).toLocaleString("de-DE",{maximumFractionDigits:4})} %`:money(term.agreed_fixed_amount);}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("INVALID_MANDATE_STATUS_TRANSITION"))return"Dieser Auftragsstatus kann aus dem aktuellen Stand nicht gewählt werden.";
  if(message.includes("MANDATE_CONCLUDED_DATE_REQUIRED"))return"Vor dem Aktivieren wird das Datum des Vertragsschlusses benötigt.";
  if(message.includes("MANDATE_TERM_START_REQUIRED"))return"Vor dem Aktivieren wird ein Laufzeitbeginn benötigt.";
  if(message.includes("MANDATE_CLIENT_REQUIRED"))return"Vor dem Aktivieren muss mindestens ein Auftraggeber hinterlegt sein.";
  if(message.includes("MANDATE_DUAL_AGENCY_REQUIRES_BOTH_TERMS"))return"Bei Doppeltätigkeit müssen beide Provisionsseiten vereinbart sein.";
  if(message.includes("MANDATE_DUAL_AGENCY_TERMS_MUST_MATCH"))return"Bei Doppeltätigkeit müssen Verkäufer- und Käuferseite dieselbe Berechnungsart, dieselbe Höhe und dieselbe Bezugsgröße haben.";
  if(message.includes("MANDATE_BUYER_TERM_EXCEEDS_SELLER_TERM"))return"Die Käuferprovision darf die Verkäuferprovision nicht übersteigen.";
  if(message.includes("MANDATE_BUYER_TERM_METHOD_MISMATCH"))return"Verkäufer- und Käuferseite müssen dieselbe Berechnungsart verwenden, damit die Höhen vergleichbar sind.";
  if(message.includes("MANDATE_BUYER_TERM_REQUIRES_SELLER_TERM"))return"Bei einem Verkäuferauftrag muss zuerst die Verkäuferseite vereinbart werden.";
  if(message.includes("MANDATE_SELLER_TERM_NOT_ALLOWED_FOR_BUYER_MANDATE"))return"Bei einem reinen Käuferauftrag ist keine Verkäuferprovision vorgesehen.";
  if(message.includes("MANDATE_SELLER_TERM_REQUIRED"))return"Für einen Verkäuferauftrag wird die Verkäuferprovision benötigt.";
  if(message.includes("MANDATE_BUYER_TERM_REQUIRED"))return"Für einen Käuferauftrag wird die Käuferprovision benötigt.";
  if(message.includes("MANDATE_WITHDRAWN_DATE_REQUIRED"))return"Für den Status „Widerrufen“ wird das Datum des Widerrufs benötigt.";
  if(message.includes("MANDATE_TERMINATION_DATE_REQUIRED"))return"Für den Status „Gekündigt“ wird das Kündigungsdatum benötigt.";
  if(message.includes("MANDATE_RESPONSIBLE_USER_INACTIVE"))return"Der ausgewählte Verantwortliche ist nicht aktiv.";
  if(message.includes("ARCHIVED_MANDATE_IMMUTABLE"))return"Ein archivierter Auftrag kann nicht bearbeitet werden. Bitte zuerst wiederherstellen.";
  if(message.includes("brokerage_mandates_one_active_per_property_idx"))return"Für diese Immobilie ist bereits ein anderer Auftrag aktiv.";
  if(message.includes("tasks_mandate_title_unique_idx"))return"Für diesen Auftrag existiert bereits eine offene Wiedervorlage zur Widerrufsfrist.";
  if(message.includes("brokerage_mandates_withdrawal_range_check"))return"Das Fristende darf nicht vor dem Datum der Belehrung liegen.";
  if(message.includes("brokerage_mandates_term_range_check"))return"Das Laufzeitende darf nicht vor dem Laufzeitbeginn liegen.";
  if(message.includes("brokerage_mandates_renewal_check"))return"Für eine automatische Verlängerung wird die Verlängerungsdauer in Monaten benötigt.";
  return "Der Maklerauftrag konnte nicht gespeichert werden.";
}

export function warnings(row:any,terms:any[],clients:any[]){
  const list:string[]=[];
  if(row.client_is_consumer&&!row.withdrawal_instruction_given_on)list.push("Für diesen Verbraucherauftrag ist keine Widerrufsbelehrung dokumentiert.");
  if(row.client_is_consumer&&row.withdrawal_instruction_given_on&&!row.withdrawal_deadline_on)list.push("Zur Widerrufsbelehrung ist kein Fristende hinterlegt.");
  if(row.client_is_consumer&&row.withdrawal_deadline_on&&row.withdrawal_deadline_on>=today()&&!row.early_start_requested_on)list.push("Die Widerrufsfrist läuft noch und ein ausdrückliches Verlangen nach vorzeitigem Leistungsbeginn ist nicht dokumentiert. Ein Vermarktungsstart in diesem Zeitraum ist ein Risiko.");
  if(!row.text_form_confirmed)list.push("Es ist nicht dokumentiert, dass der Auftrag in Textform vorliegt.");
  if(row.status==="ACTIVE"&&clients.length===0)list.push("Dem aktiven Auftrag ist kein Auftraggeber zugeordnet.");
  const buyer=terms.find((term)=>term.side==="BUYER");
  if(buyer&&row.client_side!=="BUYER"&&!row.client_share_payment_proof_on)list.push("Der Zahlungsnachweis des Auftraggeberanteils fehlt. Die Käuferprovision kann bis dahin nicht fällig gestellt werden.");
  if(row.status==="ACTIVE"&&row.term_end&&row.term_end<today())list.push("Die hinterlegte Laufzeit ist abgelaufen, der Auftrag steht aber noch auf „Aktiv“.");
  return list;
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"mandate.read");
  const id=params.mandateId!;
  const {data:row,error}=await supabase.from("brokerage_mandates").select("*,properties(id,property_number,internal_title,status,purchase_price),leads(id,lead_number)").eq("id",id).maybeSingle();
  if(error||!row)throw new Response("Maklerauftrag nicht gefunden.",{status:404,headers:responseHeaders()});
  const [{data:clients},{data:terms},{data:transitions},{data:commissions},{data:tasks},{data:contacts},{data:profiles},{data:canWrite},{data:canArchive},{data:canTask},{data:canAudit}]=await Promise.all([
    supabase.from("brokerage_mandate_clients").select("id,contact_id,signed_on,note,contacts(id,contact_number,first_name,last_name)").eq("mandate_id",id).order("created_at"),
    supabase.from("brokerage_mandate_commission_terms").select("*").eq("mandate_id",id).order("side"),
    supabase.from("brokerage_mandate_status_transitions").select("to_status,description").eq("from_status",row.status).order("to_status"),
    supabase.from("commissions").select("id,commission_number,side,status,expected_amount,actual_amount,due_date").eq("mandate_id",id).order("created_at"),
    supabase.from("tasks").select("id,task_number,title,status,due_at").eq("mandate_id",id).is("archived_at",null).order("due_at"),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.rpc("current_user_has_permission",{p_permission:"mandate.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"mandate.archive"}),
    supabase.rpc("current_user_has_permission",{p_permission:"task.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"audit.read"}),
  ]);
  let audit:any[]=[];
  if(canAudit===true){
    const result=await supabase.from("audit_events").select("id,occurred_at,actor_display_name_snapshot,action,field_changes,entity_type").eq("entity_type","BROKERAGE_MANDATE").eq("entity_id",id).order("occurred_at",{ascending:false}).limit(60);
    if(!result.error)audit=result.data??[];
  }
  return data({row,profile,clients:clients??[],terms:terms??[],transitions:transitions??[],commissions:commissions??[],tasks:tasks??[],contacts:contacts??[],profiles:profiles??[],canWrite:canWrite===true,canArchive:canArchive===true,canTask:canTask===true,audit},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"mandate.write");
  const id=params.mandateId!,fd=await request.formData(),intent=text(fd,"_intent");
  const fail=(message:string,status=400)=>data<ActionResult>({error:message},{status,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Der Auftrag wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});
  const back=(hash="")=>redirect(`/mandates/${id}${hash}`,{headers:responseHeaders()});

  const mandateVersionIntents=["update","status","archive","restore","withdrawal","proof"];
  let version=0;
  if(mandateVersionIntents.includes(intent)){
    version=Number(text(fd,"version"));
    if(!Number.isInteger(version)||version<1)return fail("Ungültige Datensatzversion.");
  }

  if(intent==="update"){
    const renewalMode=text(fd,"renewal_mode"),renewalMonths=integer(fd,"renewal_months"),noticeDays=integer(fd,"notice_period_days");
    if(renewalMonths!==null&&(Number.isNaN(renewalMonths)||renewalMonths<1||renewalMonths>24))return fail("Die Verlängerungsdauer muss zwischen 1 und 24 Monaten liegen.");
    if(noticeDays!==null&&(Number.isNaN(noticeDays)||noticeDays<0||noticeDays>365))return fail("Die Kündigungsfrist muss zwischen 0 und 365 Tagen liegen.");
    if(renewalMode==="AUTOMATIC"&&renewalMonths===null)return fail("Für eine automatische Verlängerung wird die Verlängerungsdauer in Monaten benötigt.");
    const termStart=text(fd,"term_start"),termEnd=text(fd,"term_end");
    if(termStart&&termEnd&&termEnd<termStart)return fail("Das Laufzeitende darf nicht vor dem Laufzeitbeginn liegen.");
    const update={
      mandate_type:text(fd,"mandate_type"),
      client_side:text(fd,"client_side"),
      client_is_consumer:text(fd,"client_is_consumer")!=="no",
      concluded_on:text(fd,"concluded_on")||null,
      conclusion_channel:text(fd,"conclusion_channel")||null,
      text_form_confirmed:text(fd,"text_form_confirmed")==="yes",
      term_start:termStart||null,
      term_end:termEnd||null,
      renewal_mode:renewalMode,
      renewal_months:renewalMode==="AUTOMATIC"?renewalMonths:null,
      notice_period_days:noticeDays,
      terminated_on:text(fd,"terminated_on")||null,
      termination_reason:text(fd,"termination_reason")||null,
      actual_end_on:text(fd,"actual_end_on")||null,
      lead_id:text(fd,"lead_id")||null,
      primary_responsible_user:text(fd,"primary_responsible_user"),
      internal_notes:text(fd,"internal_notes")||null,
    };
    const {data:updated,error}=await supabase.from("brokerage_mandates").update(update).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return fail(errorMessage(error));
    if(!updated)return conflict();
    return back();
  }

  if(intent==="withdrawal"){
    const given=text(fd,"withdrawal_instruction_given_on"),deadline=text(fd,"withdrawal_deadline_on");
    if(given&&deadline&&deadline<given)return fail("Das Fristende darf nicht vor dem Datum der Belehrung liegen.");
    const update={
      withdrawal_instruction_given_on:given||null,
      withdrawal_instruction_form:text(fd,"withdrawal_instruction_form")||null,
      withdrawal_instruction_evidence:text(fd,"withdrawal_instruction_evidence")||null,
      withdrawal_deadline_on:deadline||null,
      early_start_requested_on:text(fd,"early_start_requested_on")||null,
      early_start_value_compensation_ack:text(fd,"early_start_value_compensation_ack")==="yes",
      withdrawn_on:text(fd,"withdrawn_on")||null,
    };
    const {data:updated,error}=await supabase.from("brokerage_mandates").update(update).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return fail(errorMessage(error));
    if(!updated)return conflict();
    return back("#widerruf");
  }

  if(intent==="proof"){
    const update={client_share_payment_proof_on:text(fd,"client_share_payment_proof_on")||null,client_share_payment_proof_note:text(fd,"client_share_payment_proof_note")||null};
    const {data:updated,error}=await supabase.from("brokerage_mandates").update(update).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return fail(errorMessage(error));
    if(!updated)return conflict();
    return back("#nachweis");
  }

  if(intent==="status"){
    const next=text(fd,"target_status");
    const update:any={status:next};
    if(next==="WITHDRAWN")update.withdrawn_on=text(fd,"withdrawn_on")||today();
    if(next==="TERMINATED"){update.terminated_on=text(fd,"terminated_on")||today();update.termination_reason=text(fd,"termination_reason")||null;}
    if(["WITHDRAWN","TERMINATED","EXPIRED","FULFILLED"].includes(next)&&!text(fd,"keep_actual_end"))update.actual_end_on=text(fd,"actual_end_on")||today();
    const {data:updated,error}=await supabase.from("brokerage_mandates").update(update).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return fail(errorMessage(error));
    if(!updated)return conflict();
    return back("#status");
  }

  if(intent==="archive"||intent==="restore"){
    await requirePermission(request,context.cloudflare.env,"mandate.archive");
    const {data:updated,error}=await supabase.from("brokerage_mandates").update({archived_at:intent==="archive"?new Date().toISOString():null}).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return fail(errorMessage(error));
    if(!updated)return conflict();
    return back();
  }

  if(intent==="client_add"){
    const contactId=text(fd,"contact_id");
    if(!contactId)return fail("Bitte einen Kontakt auswählen.");
    const {error}=await supabase.from("brokerage_mandate_clients").insert({mandate_id:id,contact_id:contactId,signed_on:text(fd,"signed_on")||null,note:text(fd,"note")||null,created_by:userId,updated_by:userId});
    if(error)return fail(String(error.message??"").includes("duplicate")?"Dieser Kontakt ist bereits als Auftraggeber hinterlegt.":errorMessage(error));
    return back("#auftraggeber");
  }

  if(intent==="client_remove"){
    const clientId=text(fd,"client_id");
    const {error}=await supabase.from("brokerage_mandate_clients").delete().eq("id",clientId).eq("mandate_id",id);
    if(error)return fail(errorMessage(error));
    return back("#auftraggeber");
  }

  if(intent==="terms_save"){
    const side=text(fd,"side"),method=text(fd,"calculation_method");
    if(!["SELLER","BUYER"].includes(side))return fail("Ungültige Provisionsseite.");
    if(!["PERCENT","FIXED"].includes(method))return fail("Bitte eine gültige Berechnungsart auswählen.");
    const percent=decimal(fd,"agreed_percent"),fixed=decimal(fd,"agreed_fixed_amount");
    if(method==="PERCENT"&&(percent===null||Number.isNaN(percent)||percent<=0||percent>100))return fail("Der Prozentsatz muss größer als 0 und höchstens 100 sein.");
    if(method==="FIXED"&&(fixed===null||Number.isNaN(fixed)||fixed<=0))return fail("Der Festbetrag muss größer als 0 € sein.");
    const payload={
      mandate_id:id,side,
      calculation_method:method,
      agreed_percent:method==="PERCENT"?percent:null,
      agreed_fixed_amount:method==="FIXED"?fixed:null,
      calculation_basis_kind:text(fd,"calculation_basis_kind")||"PURCHASE_PRICE",
      calculation_basis_note:text(fd,"calculation_basis_note")||null,
      due_event:text(fd,"due_event")||"NOTARIZATION",
      note:text(fd,"note")||null,
      created_by:userId,updated_by:userId,
    };
    const {error}=await supabase.from("brokerage_mandate_commission_terms").upsert(payload,{onConflict:"mandate_id,side"});
    if(error)return fail(errorMessage(error));
    return back("#provision");
  }

  if(intent==="terms_remove"){
    const side=text(fd,"side");
    const {error}=await supabase.from("brokerage_mandate_commission_terms").delete().eq("mandate_id",id).eq("side",side);
    if(error)return fail(errorMessage(error));
    return back("#provision");
  }

  if(intent==="reminder"){
    await requirePermission(request,context.cloudflare.env,"task.write");
    const {data:mandate,error:loadError}=await supabase.from("brokerage_mandates").select("mandate_number,property_id,withdrawal_deadline_on,primary_responsible_user").eq("id",id).maybeSingle();
    if(loadError||!mandate)return fail("Der Auftrag konnte nicht gelesen werden.");
    if(!mandate.withdrawal_deadline_on)return fail("Für die Wiedervorlage wird zuerst ein Fristende benötigt.");
    const dueAt=new Date(`${mandate.withdrawal_deadline_on}T09:00:00+02:00`).toISOString();
    const {error}=await supabase.from("tasks").insert({
      title:`Widerrufsfrist beachten · ${mandate.mandate_number}`,
      description:"Vor Ablauf der Widerrufsfrist prüfen, ob Belehrung, Fristende und ein etwaiges Verlangen nach vorzeitigem Leistungsbeginn vollständig dokumentiert sind.",
      status:"OPEN",priority:"HIGH",due_at:dueAt,
      responsible_user:mandate.primary_responsible_user,
      property_id:mandate.property_id,mandate_id:id,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(errorMessage(error));
    return back("#widerruf");
  }

  return fail("Unbekannte Aktion.");
}

function auditLabel(changes:any){
  if(!changes||typeof changes!=="object")return"Änderung dokumentiert";
  const keys=Object.keys(changes);
  if(keys.includes("record"))return"Datensatz angelegt oder entfernt";
  const map:Record<string,string>={status:"Status",mandate_type:"Auftragsart",client_side:"Auftraggeberseite",client_is_consumer:"Verbrauchereigenschaft",concluded_on:"Vertragsschluss",conclusion_channel:"Weg des Zustandekommens",text_form_confirmed:"Textform",term_start:"Laufzeitbeginn",term_end:"Laufzeitende",renewal_mode:"Verlängerung",renewal_months:"Verlängerungsdauer",notice_period_days:"Kündigungsfrist",terminated_on:"Kündigung",termination_reason:"Kündigungsgrund",actual_end_on:"Tatsächliches Ende",client_share_payment_proof_on:"Zahlungsnachweis Auftraggeberanteil",withdrawal_instruction_given_on:"Widerrufsbelehrung",withdrawal_instruction_form:"Form der Belehrung",withdrawal_deadline_on:"Fristende",early_start_requested_on:"Vorzeitiger Leistungsbeginn",early_start_value_compensation_ack:"Wertersatzhinweis",withdrawn_on:"Widerruf",primary_responsible_user:"Verantwortlich",internal_notes:"Notizen",archived_at:"Archiv",side:"Provisionsseite",agreed_percent:"Prozentsatz",agreed_fixed_amount:"Festbetrag",calculation_method:"Berechnungsart",calculation_basis_kind:"Bezugsgröße",due_event:"Fälligkeitsereignis",contact_id:"Auftraggeber",signed_on:"Unterzeichnet am"};
  return keys.map((key)=>map[key]??key).join(", ");
}

function TermForm({side,term,disabled}:{side:"SELLER"|"BUYER";term:any;disabled:boolean}){
  return <div className="editor-card">
    <div className="card-head"><div><p className="eyebrow">{SIDE[side]}</p><h2>{term?termLabel(term):"Noch nicht vereinbart"}</h2></div>{term&&!disabled?<Form method="post"><input type="hidden" name="_intent" value="terms_remove"/><input type="hidden" name="side" value={side}/><button className="secondary-button" type="submit">Entfernen</button></Form>:null}</div>
    <Form method="post">
    <input type="hidden" name="_intent" value="terms_save"/>
    <input type="hidden" name="side" value={side}/>
    <fieldset disabled={disabled}>
      <div className="form-grid">
        <label className="form-field"><span>Berechnungsart *</span><select name="calculation_method" defaultValue={term?.calculation_method??"PERCENT"} required><option value="PERCENT">Prozentual</option><option value="FIXED">Festbetrag</option></select></label>
        <label className="form-field"><span>Prozentsatz (%)</span><input name="agreed_percent" type="number" min="0.0001" max="100" step="0.0001" defaultValue={term?.agreed_percent??""}/></label>
        <label className="form-field"><span>Festbetrag (€)</span><input name="agreed_fixed_amount" type="number" min="0.01" step="0.01" defaultValue={term?.agreed_fixed_amount??""}/></label>
        <label className="form-field"><span>Bezugsgröße *</span><select name="calculation_basis_kind" defaultValue={term?.calculation_basis_kind??"PURCHASE_PRICE"} required>{Object.entries(BASIS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <label className="form-field"><span>Fälligkeitsereignis *</span><select name="due_event" defaultValue={term?.due_event??"NOTARIZATION"} required>{Object.entries(DUE_EVENT).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <label className="form-field"><span>Bemerkung zur Bezugsgröße</span><input name="calculation_basis_note" defaultValue={term?.calculation_basis_note??""}/></label>
      </div>
      <label className="form-field full-width"><span>Notiz zur Vereinbarung</span><textarea name="note" rows={2} defaultValue={term?.note??""}/></label>
    </fieldset>
    {disabled?null:<div className="form-actions"><button className="primary-button" type="submit">{term?"Vereinbarung speichern":"Vereinbarung anlegen"}</button></div>}
    </Form>
  </div>;
}

export default function MandateDetail(){
  const {row,profile,clients,terms,transitions,commissions,tasks,contacts,profiles,canWrite,canArchive,canTask,audit}=useLoaderData<typeof loader>();
  const result=useActionData<typeof action>();
  const property=one(row.properties),lead=one(row.leads),locked=Boolean(row.archived_at);
  const seller=terms.find((term:any)=>term.side==="SELLER"),buyer=terms.find((term:any)=>term.side==="BUYER");
  const notes=warnings(row,terms,clients);
  const editable=canWrite&&!locked;
  const assignedContactIds=new Set(clients.map((client:any)=>client.contact_id));

  return <main className="editor-shell">
    <header className="editor-header">
      <div>
        <Link className="back-link" to="/mandates">← Makleraufträge</Link>
        <p className="eyebrow">{row.mandate_number} · {TYPE[row.mandate_type]??row.mandate_type}</p>
        <div className="property-title-row"><h1 className="editor-title">{property?.property_number??"Maklerauftrag"}</h1><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{locked?"Archiviert":STATUS[row.status]??row.status}</span></div>
        <p className="editor-meta">{property?.internal_title??"—"} · {CLIENT_SIDE[row.client_side]??row.client_side} · Version {row.version}</p>
      </div>
      <div className="header-actions">
        <Link className="secondary-button link-button" to={`/properties/${row.property_id}`}>Immobilie öffnen</Link>
        {lead?<Link className="secondary-button link-button" to={`/leads/${lead.id}`}>Lead öffnen</Link>:null}
        {canArchive?<Form method="post"><input type="hidden" name="_intent" value={locked?"restore":"archive"}/><input type="hidden" name="version" value={row.version}/><button className="secondary-button" type="submit">{locked?"Wiederherstellen":"Archivieren"}</button></Form>:null}
        <span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small>
      </div>
    </header>

    {result?.error?<div className="form-error">{result.error}</div>:null}
    {notes.length?<div className="form-warning"><strong>Offene Punkte in der Auftragsdokumentation</strong><ul>{notes.map((note)=><li key={note}>{note}</li>)}</ul></div>:null}

    <div className="property-summary-grid">
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Auftrag</p><h2>{TYPE[row.mandate_type]??row.mandate_type}</h2></div></div><p className="subtle">{CLIENT_SIDE[row.client_side]??row.client_side}{row.dual_agency?" · Doppeltätigkeit":""}</p><p className="subtle">{row.client_is_consumer?"Auftraggeber ist Verbraucher":"Auftraggeber ist kein Verbraucher"} · {row.text_form_confirmed?"Textform dokumentiert":"Textform nicht dokumentiert"}</p></section>
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Laufzeit</p><h2>{row.term_start?formatDate(row.term_start):"offen"}</h2></div></div><p className="subtle">{row.term_end?`bis ${formatDate(row.term_end)}`:"ohne festes Ende"}{row.renewal_mode==="AUTOMATIC"?` · Verlängerung um ${row.renewal_months} Monate`:""}</p><p className="subtle">Vertragsschluss {formatDate(row.concluded_on)}{row.conclusion_channel?` · ${CHANNEL[row.conclusion_channel]??row.conclusion_channel}`:""}</p></section>
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Provisionsvereinbarung</p><h2>{termLabel(seller)}</h2></div></div><p className="subtle">Verkäuferseite {termLabel(seller)} · Käuferseite {termLabel(buyer)}</p><p className="subtle">{row.client_share_payment_proof_on?`Auftraggeberanteil nachgewiesen am ${formatDate(row.client_share_payment_proof_on)}`:"Zahlungsnachweis des Auftraggeberanteils offen"}</p></section>
    </div>

    <section className="data-card" id="status">
      <div className="card-head"><div><p className="eyebrow">Workflow</p><h2>Status & nächste Schritte</h2></div><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{STATUS[row.status]??row.status}</span></div>
      {locked?<p className="empty-state">Archivierte Aufträge können erst nach dem Wiederherstellen weiterbearbeitet werden.</p>:canWrite?<div className="commission-transition-list">
        {transitions.map((transition:any)=>{
          if(transition.to_status==="WITHDRAWN")return <Form method="post" className="inline-actions" key={transition.to_status}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="version" value={row.version}/><input type="hidden" name="target_status" value={transition.to_status}/><input name="withdrawn_on" type="date" defaultValue={row.withdrawn_on??today()} required/><button className="secondary-button" type="submit">→ {STATUS[transition.to_status]}</button></Form>;
          if(transition.to_status==="TERMINATED")return <Form method="post" className="inline-actions" key={transition.to_status}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="version" value={row.version}/><input type="hidden" name="target_status" value={transition.to_status}/><input name="terminated_on" type="date" defaultValue={row.terminated_on??today()} required/><input name="termination_reason" placeholder="Kündigungsgrund · optional"/><button className="secondary-button" type="submit">→ {STATUS[transition.to_status]}</button></Form>;
          return <Form method="post" key={transition.to_status}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="version" value={row.version}/><input type="hidden" name="target_status" value={transition.to_status}/><button className={transition.to_status==="ACTIVE"?"primary-button":"secondary-button"} type="submit" title={transition.description??""}>→ {STATUS[transition.to_status]??transition.to_status}</button></Form>;
        })}
        {transitions.length===0?<p className="empty-state">Für diesen Status ist aktuell kein weiterer Statuswechsel vorgesehen.</p>:null}
      </div>:<p className="empty-state">Keine Berechtigung zum Bearbeiten von Makleraufträgen.</p>}
      <p className="subtle">Vor dem Aktivieren prüft das System Vertragsschluss, Laufzeitbeginn, mindestens einen Auftraggeber und die Provisionsvereinbarung. Rechtliche Wirksamkeit wird dabei nicht beurteilt.</p>
    </section>

    <section className="editor-card">
      <div className="card-head"><div><p className="eyebrow">Auftragsakte</p><h2>Grunddaten, Form und Laufzeit</h2></div></div>
      <Form method="post">
        <input type="hidden" name="_intent" value="update"/><input type="hidden" name="version" value={row.version}/>
        <fieldset disabled={!editable}>
          <div className="form-grid">
            <label className="form-field"><span>Auftragsart *</span><select name="mandate_type" defaultValue={row.mandate_type} required>{Object.entries(TYPE).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Auftraggeberseite *</span><select name="client_side" defaultValue={row.client_side} required>{Object.entries(CLIENT_SIDE).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Auftraggeber ist Verbraucher *</span><select name="client_is_consumer" defaultValue={row.client_is_consumer?"yes":"no"} required><option value="yes">Ja</option><option value="no">Nein</option></select></label>
            <label className="form-field"><span>Vertragsschluss am</span><input name="concluded_on" type="date" defaultValue={row.concluded_on??""}/></label>
            <label className="form-field"><span>Weg des Zustandekommens</span><select name="conclusion_channel" defaultValue={row.conclusion_channel??""}><option value="">Nicht dokumentiert</option>{Object.entries(CHANNEL).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Textform dokumentiert *</span><select name="text_form_confirmed" defaultValue={row.text_form_confirmed?"yes":"no"} required><option value="yes">Ja</option><option value="no">Nein</option></select><small className="subtle">Reine Erfassung. Das System prüft keine Wirksamkeit.</small></label>
            <label className="form-field"><span>Laufzeit ab</span><input name="term_start" type="date" defaultValue={row.term_start??""}/></label>
            <label className="form-field"><span>Laufzeit bis</span><input name="term_end" type="date" defaultValue={row.term_end??""}/></label>
            <label className="form-field"><span>Verlängerung *</span><select name="renewal_mode" defaultValue={row.renewal_mode} required><option value="NONE">Keine automatische Verlängerung</option><option value="AUTOMATIC">Automatische Verlängerung</option></select></label>
            <label className="form-field"><span>Verlängerung um (Monate)</span><input name="renewal_months" type="number" min="1" max="24" step="1" defaultValue={row.renewal_months??""}/></label>
            <label className="form-field"><span>Kündigungsfrist (Tage)</span><input name="notice_period_days" type="number" min="0" max="365" step="1" defaultValue={row.notice_period_days??""}/></label>
            <label className="form-field"><span>Gekündigt am</span><input name="terminated_on" type="date" defaultValue={row.terminated_on??""}/></label>
            <label className="form-field"><span>Tatsächliches Ende</span><input name="actual_end_on" type="date" defaultValue={row.actual_end_on??""}/></label>
            <label className="form-field"><span>Verkäufer-Lead</span><select name="lead_id" defaultValue={row.lead_id??""}><option value="">Ohne Leadbezug</option>{lead?<option value={lead.id}>{lead.lead_number}</option>:null}</select></label>
            <label className="form-field"><span>Verantwortlich *</span><select name="primary_responsible_user" defaultValue={row.primary_responsible_user} required>{profiles.map((item:any)=><option key={item.user_id} value={item.user_id}>{item.display_name}</option>)}</select></label>
          </div>
          <label className="form-field full-width"><span>Kündigungsgrund</span><input name="termination_reason" defaultValue={row.termination_reason??""}/></label>
          <label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={4} defaultValue={row.internal_notes??""}/></label>
        </fieldset>
        {editable?<div className="form-actions"><button className="primary-button" type="submit">Auftrag speichern</button></div>:null}
      </Form>
    </section>

    <section className="data-card" id="auftraggeber">
      <div className="card-head"><div><p className="eyebrow">Auftraggeber</p><h2>{clients.length} Beteiligte</h2></div></div>
      <div className="data-list">
        {clients.map((client:any)=>{const contact=one(client.contacts);return <div className="data-row" key={client.id}>
          <div><strong>{contact?`${contact.first_name} ${contact.last_name}`:"Kontakt"}</strong><small>{contact?.contact_number??"—"}{client.signed_on?` · unterzeichnet ${formatDate(client.signed_on)}`:" · Unterzeichnung nicht dokumentiert"}</small></div>
          <div className="row-meta"><span>{client.note??"—"}</span></div>
          <div className="row-meta">
            <Link className="subtle-link" to={`/crm/contacts/${client.contact_id}`}>Kontakt öffnen →</Link>
            {editable?<Form method="post"><input type="hidden" name="_intent" value="client_remove"/><input type="hidden" name="client_id" value={client.id}/><button className="secondary-button" type="submit">Entfernen</button></Form>:null}
          </div>
        </div>;})}
        {clients.length===0?<p className="empty-state">Noch kein Auftraggeber hinterlegt. Vor dem Aktivieren wird mindestens einer benötigt.</p>:null}
      </div>
      {editable?<Form method="post" className="inline-actions">
        <input type="hidden" name="_intent" value="client_add"/>
        <select name="contact_id" required defaultValue=""><option value="">Kontakt auswählen…</option>{contacts.filter((contact:any)=>!assignedContactIds.has(contact.id)).map((contact:any)=><option value={contact.id} key={contact.id}>{contact.last_name}, {contact.first_name} · {contact.contact_number}</option>)}</select>
        <input name="signed_on" type="date" aria-label="Unterzeichnet am"/>
        <input name="note" placeholder="Bemerkung · optional"/>
        <button className="secondary-button" type="submit">Auftraggeber hinzufügen</button>
      </Form>:null}
    </section>

    <section className="data-card" id="provision">
      <div className="card-head"><div><p className="eyebrow">Provisionsvereinbarung</p><h2>Getrennt je Seite</h2></div></div>
      <p className="subtle">Bei Doppeltätigkeit müssen beide Seiten dieselbe Berechnungsart, dieselbe Höhe und dieselbe Bezugsgröße haben. Bei einem Verkäuferauftrag darf die Käuferseite die Verkäuferseite nicht übersteigen. Beides wird serverseitig geprüft.</p>
      <div className="property-summary-grid">
        {row.client_side!=="BUYER"?<TermForm side="SELLER" term={seller} disabled={!editable}/>:null}
        <TermForm side="BUYER" term={buyer} disabled={!editable}/>
      </div>
    </section>

    <section className="data-card" id="widerruf">
      <div className="card-head"><div><p className="eyebrow">Widerruf</p><h2>Belehrung, Frist und vorzeitiger Beginn</h2></div>{row.withdrawal_deadline_on?<span className="subtle">Fristende {formatDate(row.withdrawal_deadline_on)}</span>:null}</div>
      <Form method="post">
        <input type="hidden" name="_intent" value="withdrawal"/><input type="hidden" name="version" value={row.version}/>
        <fieldset disabled={!editable}>
          <div className="form-grid">
            <label className="form-field"><span>Belehrung erteilt am</span><input name="withdrawal_instruction_given_on" type="date" defaultValue={row.withdrawal_instruction_given_on??""}/></label>
            <label className="form-field"><span>Form der Belehrung</span><select name="withdrawal_instruction_form" defaultValue={row.withdrawal_instruction_form??""}><option value="">Nicht dokumentiert</option>{Object.entries(INSTRUCTION_FORM).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Fristende</span><input name="withdrawal_deadline_on" type="date" defaultValue={row.withdrawal_deadline_on??""}/><small className="subtle">Vom Benutzer zu setzen. Das System berechnet keine Frist.</small></label>
            <label className="form-field"><span>Vorzeitiger Leistungsbeginn verlangt am</span><input name="early_start_requested_on" type="date" defaultValue={row.early_start_requested_on??""}/></label>
            <label className="form-field"><span>Hinweis auf Wertersatz zur Kenntnis genommen</span><select name="early_start_value_compensation_ack" defaultValue={row.early_start_value_compensation_ack?"yes":"no"}><option value="no">Nicht dokumentiert</option><option value="yes">Dokumentiert</option></select></label>
            <label className="form-field"><span>Widerruf erklärt am</span><input name="withdrawn_on" type="date" defaultValue={row.withdrawn_on??""}/></label>
          </div>
          <label className="form-field full-width"><span>Nachweis der Belehrung</span><input name="withdrawal_instruction_evidence" defaultValue={row.withdrawal_instruction_evidence??""} placeholder="z. B. Dokumentname, Sendungsnummer, Empfangsbestätigung"/></label>
        </fieldset>
        {editable?<div className="form-actions"><button className="primary-button" type="submit">Widerrufsdokumentation speichern</button></div>:null}
      </Form>
      {editable&&canTask?<Form method="post" className="inline-actions"><input type="hidden" name="_intent" value="reminder"/><button className="secondary-button" type="submit">Wiedervorlage zur Widerrufsfrist anlegen</button></Form>:null}
      <div className="data-list">
        {tasks.map((task:any)=><Link className="data-row data-row-link" to="/crm/tasks" key={task.id}><div><strong>{task.title}</strong><small>{task.task_number} · {task.status}</small></div><div className="row-meta"><span>Fällig {formatDate(task.due_at)}</span></div><span className="subtle-link">Aufgaben öffnen →</span></Link>)}
        {tasks.length===0?<p className="empty-state">Keine offene Wiedervorlage zu diesem Auftrag.</p>:null}
      </div>
    </section>

    <section className="data-card" id="nachweis">
      <div className="card-head"><div><p className="eyebrow">Nachweis</p><h2>Zahlung des Auftraggeberanteils</h2></div></div>
      <p className="subtle">Solange kein Nachweis hinterlegt ist, lässt sich eine Käuferprovision zu diesem Auftrag nicht fällig stellen.</p>
      <Form method="post">
        <input type="hidden" name="_intent" value="proof"/><input type="hidden" name="version" value={row.version}/>
        <fieldset disabled={!editable}>
          <div className="form-grid">
            <label className="form-field"><span>Nachgewiesen am</span><input name="client_share_payment_proof_on" type="date" defaultValue={row.client_share_payment_proof_on??""}/></label>
            <label className="form-field"><span>Art des Nachweises</span><input name="client_share_payment_proof_note" defaultValue={row.client_share_payment_proof_note??""} placeholder="z. B. Zahlungseingang, Kontoauszug, Bestätigung"/></label>
          </div>
        </fieldset>
        {editable?<div className="form-actions"><button className="primary-button" type="submit">Nachweis speichern</button></div>:null}
      </Form>
    </section>

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Provisionen</p><h2>{commissions.length} verknüpfte Vorgänge</h2></div><Link className="subtle-link" to={`/commissions?property_id=${encodeURIComponent(row.property_id)}`}>Alle Provisionen →</Link></div>
      <div className="data-list">
        {commissions.map((commission:any)=><Link className="data-row data-row-link" to={`/commissions/${commission.id}`} key={commission.id}><div><strong>{commission.commission_number} · {SIDE[commission.side]??commission.side}</strong><small>{commission.status}</small></div><div className="row-meta"><span>{money(commission.actual_amount??commission.expected_amount)}</span><small>{commission.due_date?`Fällig ${formatDate(commission.due_date)}`:"Fälligkeit offen"}</small></div><span className="subtle-link">Öffnen →</span></Link>)}
        {commissions.length===0?<p className="empty-state">Diesem Auftrag ist noch keine Provision zugeordnet. Die Zuordnung erfolgt in der Provisionsakte.</p>:null}
      </div>
    </section>

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Historie</p><h2>Änderungsverlauf</h2></div><span className="subtle">{audit.length} Einträge</span></div>
      <div className="data-list">
        {audit.map((event:any)=><div className="data-row" key={event.id}><div><strong>{auditLabel(event.field_changes)}</strong><small>{event.actor_display_name_snapshot??"System"} · {event.action}</small></div><div className="row-meta"><span>{new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(event.occurred_at))}</span></div></div>)}
        {audit.length===0?<p className="empty-state">Keine sichtbare Historie vorhanden.</p>:null}
      </div>
    </section>
  </main>;
}
