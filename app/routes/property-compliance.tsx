import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-compliance";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

const PARTY_ROLE:Record<string,string>={SELLER:"Verkäuferseite",BUYER:"Käuferseite",REPRESENTATIVE:"Vertretung / Bevollmächtigung",BENEFICIAL_OWNER:"Wirtschaftlich Berechtigter"};
const DOCUMENT_TYPE:Record<string,string>={PASSPORT:"Reisepass",ID_CARD:"Personalausweis",RESIDENCE_PERMIT:"Aufenthaltstitel",OTHER:"Sonstiges Dokument"};
const METHOD:Record<string,string>={IN_PERSON:"Persönlich vor Ort",VIDEO:"Video-Identifizierung",ELECTRONIC:"Elektronischer Identitätsnachweis",NOTARY:"Über das Notariat",OTHER:"Sonstiges Verfahren"};
const SCREENING:Record<string,string>={NO_MATCH:"Kein Treffer",POSSIBLE_MATCH:"Möglicher Treffer",MATCH:"Treffer",UNCLEAR:"Unklar"};
const RISK:Record<string,string>={LOW:"Gering",MEDIUM:"Mittel",HIGH:"Hoch"};
const RISK_CLASS:Record<string,string>={LOW:"status-sold",MEDIUM:"status-marketing",HIGH:"status-lost"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const value=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function today(){return new Date().toISOString().slice(0,10);}
function contactLabel(contact:any){if(!contact)return"Unbekannter Kontakt";return `${contact.last_name}, ${contact.first_name}`;}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("GWG_PROPERTY_NOT_FOUND"))return"Die Immobilie wurde nicht gefunden.";
  if(message.includes("GWG_CLOSING_PROPERTY_MISMATCH"))return"Der gewählte Abschlussvorgang gehört nicht zu dieser Immobilie.";
  if(message.includes("GWG_RESPONSIBLE_USER_INACTIVE"))return"Der ausgewählte Verantwortliche ist nicht aktiv.";
  if(message.includes("GWG_RISK_DATE_IN_FUTURE"))return"Das Datum der Risikoeinstufung darf nicht in der Zukunft liegen.";
  if(message.includes("GWG_REPORT_DATE_IN_FUTURE"))return"Das Meldedatum darf nicht in der Zukunft liegen.";
  if(message.includes("GWG_IDENTIFICATION_DATE_IN_FUTURE"))return"Das Identifizierungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("GWG_SCREENING_DATE_IN_FUTURE"))return"Das Datum des Listenabgleichs darf nicht in der Zukunft liegen.";
  if(message.includes("GWG_REPRESENTED_CONTACT_REQUIRED"))return"Für eine Vertretung oder einen wirtschaftlich Berechtigten muss angegeben werden, für wen die Person handelt.";
  if(message.includes("GWG_REPRESENTED_CONTACT_MUST_DIFFER"))return"Die vertretene Person muss sich von der erfassten Person unterscheiden.";
  if(message.includes("GWG_PROOF_DOCUMENT_CATEGORY"))return"Als Nachweis kann nur ein Dokument der Kategorie „Identitätsnachweis“ verknüpft werden.";
  if(message.includes("GWG_CASE_NOT_FOUND"))return"Die Geldwäscheakte wurde nicht gefunden.";
  if(message.includes("ARCHIVED_GWG_CASE_IMMUTABLE"))return"Eine archivierte Geldwäscheakte kann nicht mehr geändert werden.";
  if(message.includes("GWG_CASE_NUMBER_IMMUTABLE"))return"Die Aktennummer kann nicht geändert werden.";
  if(message.includes("gwg_cases_risk_check"))return"Zu einer Risikoeinstufung gehören immer eine Begründung und ein Datum.";
  if(message.includes("gwg_cases_report_check"))return"Eine Meldung setzt voraus, dass die Prüfung auf Verdachtsmomente dokumentiert ist.";
  if(message.includes("gwg_identifications_identified_check"))return"Für eine abgeschlossene Identifizierung werden Ausweisart, Ausweisnummer, Verfahren und die identifizierende Person benötigt.";
  if(message.includes("gwg_identifications_screening_check"))return"Zum Ergebnis des Listenabgleichs gehört auch das Datum des Abgleichs.";
  if(message.includes("gwg_identifications_gwg_case_id_contact_id_party_role_key"))return"Für diese Person ist in dieser Rolle bereits ein Eintrag vorhanden.";
  if(message.includes("gwg_cases_one_per_property_idx"))return"Für diese Immobilie besteht bereits eine aktive Geldwäscheakte.";
  if(message.includes("ARCHIVE_PERMISSION_REQUIRED")||message.includes("gwg.archive"))return"Zum Archivieren fehlt die Berechtigung.";
  return "Die Geldwäscheakte konnte nicht gespeichert werden.";
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"gwg.read");
  const propertyId=params.propertyId!;
  const {data:property,error:propertyError}=await supabase.from("properties").select("id,property_number,internal_title,status").eq("id",propertyId).maybeSingle();
  if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});
  const {data:gwgCase,error:caseError}=await supabase.from("gwg_cases").select("*").eq("property_id",propertyId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(caseError)throw new Response("Geldwäscheakte konnte nicht geladen werden.",{status:500,headers:responseHeaders()});
  if(gwgCase)await supabase.rpc("log_gwg_case_access",{p_case_id:gwgCase.id});
  const [{data:identifications},{data:contacts},{data:owners},{data:closings},{data:documents},{data:profiles},{data:canWrite},{data:canArchive}]=await Promise.all([
    gwgCase?supabase.from("gwg_identifications").select("*,contacts!gwg_identifications_contact_id_fkey(id,contact_number,first_name,last_name),represents:contacts!gwg_identifications_represents_contact_id_fkey(id,first_name,last_name)").eq("gwg_case_id",gwgCase.id).order("party_role").order("created_at"):Promise.resolve({data:[]}),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("property_owners").select("contact_id,primary_contact").eq("property_id",propertyId),
    supabase.from("sale_closings").select("id,closing_number,status,buyer_contact_id,notary_appointment_at,notarized_date").eq("property_id",propertyId).is("archived_at",null).order("created_at",{ascending:false}),
    supabase.from("documents").select("id,title,category,retention_until,legal_hold,archived_at").eq("property_id",propertyId).eq("category","IDENTITY_PROOF").is("archived_at",null).order("created_at",{ascending:false}),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.rpc("current_user_has_permission",{p_permission:"gwg.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"gwg.archive"}),
  ]);
  return data({profile,property,gwgCase,identifications:identifications??[],contacts:contacts??[],owners:owners??[],closings:closings??[],documents:documents??[],profiles:profiles??[],canWrite:canWrite===true,canArchive:canArchive===true},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"gwg.write");
  const propertyId=params.propertyId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const back=`/properties/${propertyId}/compliance`;
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Die Akte wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="case_create"){
    const {error}=await supabase.from("gwg_cases").insert({property_id:propertyId,primary_responsible_user:userId,created_by:userId,updated_by:userId});
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  const caseId=text(fd,"case_id");
  const version=Number(text(fd,"version"));

  if(intent==="case_update"){
    const riskLevel=text(fd,"risk_level");
    if(riskLevel&&!["LOW","MEDIUM","HIGH"].includes(riskLevel))return data<ActionResult>({error:"Ungültige Risikostufe."},{status:400,headers:responseHeaders()});
    const payload={
      sale_closing_id:text(fd,"sale_closing_id")||null,
      risk_level:riskLevel||null,
      risk_rationale:text(fd,"risk_rationale")||null,
      risk_assessed_on:dateOrNull(fd,"risk_assessed_on"),
      risk_assessed_by:riskLevel?userId:null,
      risk_next_review_on:dateOrNull(fd,"risk_next_review_on"),
      transparency_register_checked_on:dateOrNull(fd,"transparency_register_checked_on"),
      transparency_register_note:text(fd,"transparency_register_note")||null,
      source_of_funds_documented_on:dateOrNull(fd,"source_of_funds_documented_on"),
      source_of_funds_note:text(fd,"source_of_funds_note")||null,
      non_cash_payment_evidence_on:dateOrNull(fd,"non_cash_payment_evidence_on"),
      non_cash_payment_note:text(fd,"non_cash_payment_note")||null,
      suspicious_indication_reviewed_on:dateOrNull(fd,"suspicious_indication_reviewed_on"),
      suspicious_indication_note:text(fd,"suspicious_indication_note")||null,
      report_filed_on:dateOrNull(fd,"report_filed_on"),
      report_reference:text(fd,"report_reference")||null,
      retention_until:dateOrNull(fd,"retention_until"),
      legal_hold:text(fd,"legal_hold")==="yes",
      primary_responsible_user:text(fd,"primary_responsible_user")||userId,
      internal_notes:text(fd,"internal_notes")||null,
    };
    const {data:updated,error}=await supabase.from("gwg_cases").update(payload).eq("id",caseId).eq("version",version).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="archive"||intent==="restore"){
    await requirePermission(request,context.cloudflare.env,"gwg.archive");
    const {data:updated,error}=await supabase.from("gwg_cases").update({archived_at:intent==="archive"?new Date().toISOString():null}).eq("id",caseId).eq("version",version).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="identification_save"){
    const contactId=text(fd,"contact_id"),partyRole=text(fd,"party_role");
    if(!contactId)return data<ActionResult>({error:"Bitte einen Kontakt auswählen."},{status:400,headers:responseHeaders()});
    if(!["SELLER","BUYER","REPRESENTATIVE","BENEFICIAL_OWNER"].includes(partyRole))return data<ActionResult>({error:"Bitte eine gültige Rolle auswählen."},{status:400,headers:responseHeaders()});
    const documentType=text(fd,"document_type"),method=text(fd,"identification_method"),screeningResult=text(fd,"screening_result");
    if(documentType&&!["PASSPORT","ID_CARD","RESIDENCE_PERMIT","OTHER"].includes(documentType))return data<ActionResult>({error:"Ungültige Ausweisart."},{status:400,headers:responseHeaders()});
    if(method&&!["IN_PERSON","VIDEO","ELECTRONIC","NOTARY","OTHER"].includes(method))return data<ActionResult>({error:"Ungültiges Identifizierungsverfahren."},{status:400,headers:responseHeaders()});
    if(screeningResult&&!["NO_MATCH","POSSIBLE_MATCH","MATCH","UNCLEAR"].includes(screeningResult))return data<ActionResult>({error:"Ungültiges Ergebnis des Listenabgleichs."},{status:400,headers:responseHeaders()});
    const identifiedOn=dateOrNull(fd,"identified_on");
    const payload:Record<string,unknown>={
      gwg_case_id:caseId,
      contact_id:contactId,
      party_role:partyRole,
      represents_contact_id:text(fd,"represents_contact_id")||null,
      birth_date:dateOrNull(fd,"birth_date"),
      birth_place:text(fd,"birth_place")||null,
      nationality:text(fd,"nationality")||null,
      residential_address:text(fd,"residential_address")||null,
      document_type:documentType||null,
      document_number:text(fd,"document_number")||null,
      issuing_authority:text(fd,"issuing_authority")||null,
      document_valid_until:dateOrNull(fd,"document_valid_until"),
      identification_method:method||null,
      identified_on:identifiedOn,
      identified_by:identifiedOn?userId:null,
      proof_document_id:text(fd,"proof_document_id")||null,
      screening_done_on:dateOrNull(fd,"screening_done_on"),
      screening_source:text(fd,"screening_source")||null,
      screening_result:screeningResult||null,
      screening_note:text(fd,"screening_note")||null,
      politically_exposed:text(fd,"politically_exposed")==="yes",
      notes:text(fd,"notes")||null,
    };
    const identificationId=text(fd,"identification_id");
    if(identificationId){
      const {data:updated,error}=await supabase.from("gwg_identifications").update(payload).eq("id",identificationId).eq("version",Number(text(fd,"identification_version"))).select("id").maybeSingle();
      if(error)return fail(error);
      if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("gwg_identifications").insert({...payload,created_by:userId,updated_by:userId});
      if(error)return fail(error);
    }
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="identification_remove"){
    const {error}=await supabase.from("gwg_identifications").delete().eq("id",text(fd,"identification_id"));
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

export function complianceWarnings(gwgCase:any,identifications:any[],closings:any[]){
  const warnings:string[]=[];
  if(!gwgCase)return ["Für diese Immobilie ist noch keine Geldwäscheakte angelegt."];
  if(!gwgCase.risk_level)warnings.push("Es ist keine Risikoeinstufung dokumentiert.");
  if(gwgCase.risk_next_review_on&&gwgCase.risk_next_review_on<today())warnings.push("Die Wiedervorlage zur Risikoeinstufung ist überfällig.");
  const identifiedSellers=identifications.filter((row)=>row.party_role==="SELLER"&&row.identified_on).length;
  const identifiedBuyers=identifications.filter((row)=>row.party_role==="BUYER"&&row.identified_on).length;
  if(!identifiedSellers)warnings.push("Auf der Verkäuferseite ist keine abgeschlossene Identifizierung dokumentiert.");
  const relevantClosing=closings.find((row)=>row.status!=="CANCELLED");
  if(relevantClosing&&!identifiedBuyers)warnings.push("Zum Abschlussvorgang ist auf der Käuferseite keine abgeschlossene Identifizierung dokumentiert.");
  if(relevantClosing&&relevantClosing.buyer_contact_id&&!identifications.some((row)=>row.contact_id===relevantClosing.buyer_contact_id&&row.identified_on))warnings.push("Der im Abschlussvorgang eingetragene Käufer ist nicht identifiziert.");
  if(gwgCase.risk_level==="HIGH"&&!gwgCase.source_of_funds_documented_on)warnings.push("Bei hohem Risiko ist keine Dokumentation zur Herkunft der Mittel hinterlegt.");
  if(identifications.some((row)=>row.politically_exposed)&&!gwgCase.source_of_funds_documented_on)warnings.push("Für eine als politisch exponiert erfasste Person fehlt die Dokumentation zur Herkunft der Mittel.");
  if(identifications.some((row)=>row.screening_result==="POSSIBLE_MATCH"||row.screening_result==="MATCH"||row.screening_result==="UNCLEAR")&&!gwgCase.suspicious_indication_reviewed_on)warnings.push("Ein Treffer im Listenabgleich ist erfasst, aber die Prüfung auf Verdachtsmomente ist nicht dokumentiert.");
  if(identifications.some((row)=>row.document_valid_until&&row.document_valid_until<today()))warnings.push("Mindestens ein erfasstes Ausweisdokument ist abgelaufen.");
  if(gwgCase.retention_until&&gwgCase.retention_until<today()&&!gwgCase.legal_hold)warnings.push("Die Aufbewahrungsfrist dieser Akte ist abgelaufen. Bitte über die weitere Aufbewahrung oder Löschung entscheiden.");
  return warnings;
}

function IdentificationForm({row,contacts,documents,caseId,disabled}:{row?:any;contacts:any[];documents:any[];caseId:string;disabled:boolean}){
  return <Form method="post" className="editor-card" style={{marginTop:"1rem"}}>
    <input type="hidden" name="_intent" value="identification_save"/>
    <input type="hidden" name="case_id" value={caseId}/>
    {row?<input type="hidden" name="identification_id" value={row.id}/>:null}
    {row?<input type="hidden" name="identification_version" value={row.version}/>:null}
    <div className="card-head"><div><p className="eyebrow">{row?"Bestehender Eintrag":"Neue Erfassung"}</p><h3>{row?`${PARTY_ROLE[row.party_role]??row.party_role} · ${contactLabel(one(row.contacts))}`:"Beteiligte Person erfassen"}</h3></div></div>
    <div className="form-grid">
      <label className="form-field"><span>Person *</span><select name="contact_id" defaultValue={row?.contact_id??""} required disabled={disabled}><option value="">Auswählen…</option>{contacts.map((contact:any)=><option value={contact.id} key={contact.id}>{contactLabel(contact)} · {contact.contact_number}</option>)}</select></label>
      <label className="form-field"><span>Rolle *</span><select name="party_role" defaultValue={row?.party_role??"SELLER"} required disabled={disabled}>{Object.entries(PARTY_ROLE).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="form-field"><span>Handelt für</span><select name="represents_contact_id" defaultValue={row?.represents_contact_id??""} disabled={disabled}><option value="">—</option>{contacts.map((contact:any)=><option value={contact.id} key={contact.id}>{contactLabel(contact)}</option>)}</select><small className="subtle">Pflicht bei Vertretung und wirtschaftlich Berechtigten.</small></label>
      <label className="form-field"><span>Geburtsdatum</span><input type="date" name="birth_date" defaultValue={row?.birth_date??""} disabled={disabled}/></label>
      <label className="form-field"><span>Geburtsort</span><input name="birth_place" defaultValue={row?.birth_place??""} disabled={disabled}/></label>
      <label className="form-field"><span>Staatsangehörigkeit</span><input name="nationality" defaultValue={row?.nationality??""} disabled={disabled}/></label>
      <label className="form-field full-width"><span>Wohnanschrift</span><input name="residential_address" defaultValue={row?.residential_address??""} disabled={disabled}/></label>
      <label className="form-field"><span>Ausweisart</span><select name="document_type" defaultValue={row?.document_type??""} disabled={disabled}><option value="">—</option>{Object.entries(DOCUMENT_TYPE).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="form-field"><span>Ausweisnummer</span><input name="document_number" defaultValue={row?.document_number??""} disabled={disabled}/></label>
      <label className="form-field"><span>Ausstellende Behörde</span><input name="issuing_authority" defaultValue={row?.issuing_authority??""} disabled={disabled}/></label>
      <label className="form-field"><span>Ausweis gültig bis</span><input type="date" name="document_valid_until" defaultValue={row?.document_valid_until??""} disabled={disabled}/></label>
      <label className="form-field"><span>Verfahren</span><select name="identification_method" defaultValue={row?.identification_method??""} disabled={disabled}><option value="">—</option>{Object.entries(METHOD).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="form-field"><span>Identifiziert am</span><input type="date" name="identified_on" defaultValue={row?.identified_on??""} max={today()} disabled={disabled}/><small className="subtle">Wird auf den angemeldeten Benutzer als identifizierende Person gebucht.</small></label>
      <label className="form-field"><span>Ausweiskopie im Dokumentenbereich</span><select name="proof_document_id" defaultValue={row?.proof_document_id??""} disabled={disabled}><option value="">—</option>{documents.map((document:any)=><option value={document.id} key={document.id}>{document.title}</option>)}</select><small className="subtle">Nur Dokumente der Kategorie „Identitätsnachweis“.</small></label>
      <label className="form-field"><span>Listenabgleich am</span><input type="date" name="screening_done_on" defaultValue={row?.screening_done_on??""} max={today()} disabled={disabled}/></label>
      <label className="form-field"><span>Verwendete Quelle</span><input name="screening_source" defaultValue={row?.screening_source??""} placeholder="z. B. EU-Sanktionsliste, Datum des Abrufs" disabled={disabled}/></label>
      <label className="form-field"><span>Ergebnis</span><select name="screening_result" defaultValue={row?.screening_result??""} disabled={disabled}><option value="">—</option>{Object.entries(SCREENING).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="form-field"><span>Politisch exponierte Person</span><select name="politically_exposed" defaultValue={row?.politically_exposed?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
    </div>
    <label className="form-field full-width"><span>Anmerkung zum Listenabgleich</span><textarea name="screening_note" rows={2} defaultValue={row?.screening_note??""} disabled={disabled}/></label>
    <label className="form-field full-width"><span>Interne Notiz</span><textarea name="notes" rows={2} defaultValue={row?.notes??""} disabled={disabled}/></label>
    <div className="form-actions"><button className="primary-button" type="submit" disabled={disabled}>{row?"Eintrag speichern":"Person erfassen"}</button></div>
  </Form>;
}

export default function PropertyCompliance(){
  const d=useLoaderData<typeof loader>();
  const r=useActionData<typeof action>();
  const gwgCase=d.gwgCase as any;
  const archived=Boolean(gwgCase?.archived_at);
  const locked=!d.canWrite||archived;
  const warnings=complianceWarnings(gwgCase,d.identifications,d.closings);
  const ownerIds=new Set((d.owners as any[]).map((owner)=>owner.contact_id));
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to={`/properties/${d.property.id}`}>← Objektakte</Link><p className="eyebrow">{d.property.property_number}</p><h1 className="editor-title">Geldwäsche-Compliance</h1><p className="editor-meta">{d.property.internal_title}{gwgCase?` · ${gwgCase.case_number}`:""}</p></div><div className="header-actions"><Link className="secondary-button link-button" to="/compliance">Gesamtübersicht</Link><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div></header>

    {r?.error?<div className="form-error">{r.error}</div>:null}
    <div className="form-warning"><strong>Dokumentation, keine Bewertung.</strong> Das System erfasst und erinnert. Es prüft nicht, ob eine geldwäscherechtliche Pflicht besteht, erstellt keine Meldung und ersetzt keine rechtliche Beratung. Jeder Aufruf dieser Akte wird protokolliert.</div>

    {!gwgCase?<section className="editor-card"><div className="card-head"><div><p className="eyebrow">Noch keine Akte</p><h2>Geldwäscheakte anlegen</h2></div></div><p className="subtle">Für diese Immobilie ist keine Akte vorhanden. Die Akte bündelt Risikoeinstufung, Identifizierungen, Herkunft der Mittel, unbare Zahlung und die Aufbewahrung an einer Stelle.</p>{d.canWrite?<Form method="post"><input type="hidden" name="_intent" value="case_create"/><div className="form-actions"><button className="primary-button" type="submit">Akte anlegen</button></div></Form>:<p className="empty-state">Nur Leseberechtigung.</p>}</section>:<>

    {warnings.length?<div className="form-warning"><strong>Offene Punkte</strong><ul>{warnings.map((warning)=><li key={warning}>{warning}</li>)}</ul></div>:<div className="form-success">Alle im System geführten Erfassungspunkte dieser Akte sind dokumentiert.</div>}

    <section className="metric-grid">
      <article className="metric-card"><span>Risikoeinstufung</span><strong>{gwgCase.risk_level?RISK[gwgCase.risk_level]:"offen"}</strong><small>{gwgCase.risk_assessed_on?`eingestuft am ${formatDate(gwgCase.risk_assessed_on)}`:"noch nicht eingestuft"}</small></article>
      <article className="metric-card"><span>Identifizierungen</span><strong>{d.identifications.filter((row:any)=>row.identified_on).length} / {d.identifications.length}</strong><small>abgeschlossen von erfasst</small></article>
      <article className="metric-card"><span>Herkunft der Mittel</span><strong>{gwgCase.source_of_funds_documented_on?"dokumentiert":"offen"}</strong><small>{formatDate(gwgCase.source_of_funds_documented_on)}</small></article>
      <article className="metric-card"><span>Aufbewahrung bis</span><strong>{formatDate(gwgCase.retention_until)}</strong><small>{gwgCase.legal_hold?"Löschsperre gesetzt":"regulär fünf Jahre"}</small></article>
      <article className="metric-card"><span>Ausweisnachweise</span><strong>{d.documents.length}</strong><small>vertraulich abgelegt</small></article>
    </section>

    <section className="editor-card"><div className="card-head"><div><p className="eyebrow">Akte {gwgCase.case_number}</p><h2>Risiko, Prüfungen und Aufbewahrung</h2></div><span className={`status-pill ${archived?"status-archived":RISK_CLASS[gwgCase.risk_level]??"status-draft"}`}>{archived?"Archiviert":gwgCase.risk_level?`Risiko ${RISK[gwgCase.risk_level]}`:"Ohne Einstufung"}</span></div>
      <Form method="post">
        <input type="hidden" name="_intent" value="case_update"/>
        <input type="hidden" name="case_id" value={gwgCase.id}/>
        <input type="hidden" name="version" value={gwgCase.version}/>
        <div className="form-grid">
          <label className="form-field"><span>Zugehöriger Abschlussvorgang</span><select name="sale_closing_id" defaultValue={gwgCase.sale_closing_id??""} disabled={locked}><option value="">—</option>{d.closings.map((closing:any)=><option value={closing.id} key={closing.id}>{closing.closing_number}</option>)}</select></label>
          <label className="form-field"><span>Risikostufe</span><select name="risk_level" defaultValue={gwgCase.risk_level??""} disabled={locked}><option value="">Noch nicht eingestuft</option>{Object.entries(RISK).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><small className="subtle">Die Einstufung nimmt die Maklerin oder der Makler vor; das System schlägt keine Stufe vor.</small></label>
          <label className="form-field"><span>Eingestuft am</span><input type="date" name="risk_assessed_on" defaultValue={gwgCase.risk_assessed_on??""} max={today()} disabled={locked}/></label>
          <label className="form-field"><span>Wiedervorlage Einstufung</span><input type="date" name="risk_next_review_on" defaultValue={gwgCase.risk_next_review_on??""} disabled={locked}/></label>
          <label className="form-field"><span>Transparenzregister eingesehen am</span><input type="date" name="transparency_register_checked_on" defaultValue={gwgCase.transparency_register_checked_on??""} disabled={locked}/></label>
          <label className="form-field"><span>Herkunft der Mittel dokumentiert am</span><input type="date" name="source_of_funds_documented_on" defaultValue={gwgCase.source_of_funds_documented_on??""} disabled={locked}/></label>
          <label className="form-field"><span>Nachweis unbarer Zahlung am</span><input type="date" name="non_cash_payment_evidence_on" defaultValue={gwgCase.non_cash_payment_evidence_on??""} disabled={locked}/></label>
          <label className="form-field"><span>Auf Verdachtsmomente geprüft am</span><input type="date" name="suspicious_indication_reviewed_on" defaultValue={gwgCase.suspicious_indication_reviewed_on??""} disabled={locked}/></label>
          <label className="form-field"><span>Meldung abgegeben am</span><input type="date" name="report_filed_on" defaultValue={gwgCase.report_filed_on??""} max={today()} disabled={locked}/><small className="subtle">Nur Dokumentation einer selbst abgegebenen Meldung. Das System meldet nichts.</small></label>
          <label className="form-field"><span>Referenz der Meldung</span><input name="report_reference" defaultValue={gwgCase.report_reference??""} placeholder="nur Aktenzeichen" disabled={locked}/></label>
          <label className="form-field"><span>Aufbewahrung bis</span><input type="date" name="retention_until" defaultValue={gwgCase.retention_until??""} disabled={locked}/></label>
          <label className="form-field"><span>Löschsperre</span><select name="legal_hold" defaultValue={gwgCase.legal_hold?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Verantwortlich</span><select name="primary_responsible_user" defaultValue={gwgCase.primary_responsible_user} disabled={locked}>{d.profiles.map((item:any)=><option value={item.user_id} key={item.user_id}>{item.display_name}</option>)}</select></label>
        </div>
        <label className="form-field full-width"><span>Begründung der Risikoeinstufung</span><textarea name="risk_rationale" rows={3} defaultValue={gwgCase.risk_rationale??""} disabled={locked}/><small className="subtle">Bei gesetzter Risikostufe erforderlich.</small></label>
        <label className="form-field full-width"><span>Notiz Transparenzregister</span><textarea name="transparency_register_note" rows={2} defaultValue={gwgCase.transparency_register_note??""} disabled={locked}/></label>
        <label className="form-field full-width"><span>Notiz Herkunft der Mittel</span><textarea name="source_of_funds_note" rows={2} defaultValue={gwgCase.source_of_funds_note??""} disabled={locked}/></label>
        <label className="form-field full-width"><span>Notiz unbare Zahlung</span><textarea name="non_cash_payment_note" rows={2} defaultValue={gwgCase.non_cash_payment_note??""} disabled={locked}/></label>
        <label className="form-field full-width"><span>Notiz Prüfung auf Verdachtsmomente</span><textarea name="suspicious_indication_note" rows={2} defaultValue={gwgCase.suspicious_indication_note??""} disabled={locked}/></label>
        <label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={3} defaultValue={gwgCase.internal_notes??""} disabled={locked}/></label>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={locked}>Akte speichern</button></div>
      </Form>
    </section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Beteiligte</p><h2>{d.identifications.length} Identifizierungen</h2></div><Link className="subtle-link" to={`/properties/${d.property.id}/documents`}>Dokumente öffnen →</Link></div>
      {d.identifications.length===0?<p className="empty-state">Noch keine Person erfasst.</p>:<div className="data-list">
        {d.identifications.map((row:any)=>{const contact=one(row.contacts);const represents=one(row.represents);return <div className="data-row" key={row.id}>
          <div><strong>{contactLabel(contact)} · {PARTY_ROLE[row.party_role]??row.party_role}</strong><small>{row.identified_on?`identifiziert am ${formatDate(row.identified_on)} · ${METHOD[row.identification_method]??"Verfahren offen"}`:"Identifizierung noch nicht abgeschlossen"}{represents?` · handelt für ${contactLabel(represents)}`:""}{ownerIds.has(row.contact_id)?" · als Eigentümer geführt":""}</small></div>
          <div className="row-meta"><span>{row.document_type?DOCUMENT_TYPE[row.document_type]:"Ausweis offen"}</span><small>{row.document_valid_until?`gültig bis ${formatDate(row.document_valid_until)}`:"Gültigkeit nicht erfasst"}</small></div>
          <div className="row-meta">{row.screening_result?<span className={`status-pill ${row.screening_result==="NO_MATCH"?"status-sold":"status-lost"}`}>{SCREENING[row.screening_result]}</span>:<span>Abgleich offen</span>}<small>{row.politically_exposed?"politisch exponiert":"nicht als PEP erfasst"}</small></div>
          {d.canWrite&&!archived?<Form method="post"><input type="hidden" name="_intent" value="identification_remove"/><input type="hidden" name="identification_id" value={row.id}/><button className="secondary-button" type="submit">Entfernen</button></Form>:null}
        </div>;})}
      </div>}
      {d.identifications.map((row:any)=><IdentificationForm key={`form-${row.id}`} row={row} contacts={d.contacts} documents={d.documents} caseId={gwgCase.id} disabled={locked}/>)}
      {d.canWrite&&!archived?<IdentificationForm contacts={d.contacts} documents={d.documents} caseId={gwgCase.id} disabled={false}/>:null}
    </section>

    <div className="dashboard-grid property-section">
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Ablage</p><h2>Identitätsnachweise</h2></div><Link className="subtle-link" to={`/properties/${d.property.id}/documents`}>Hochladen →</Link></div>
        {d.documents.length===0?<p className="empty-state">Noch keine Ausweiskopie abgelegt. Dokumente der Kategorie „Identitätsnachweis“ werden automatisch als vertraulich geführt und fünf Jahre aufbewahrt.</p>:<div className="data-list">{d.documents.map((document:any)=><div className="data-row" key={document.id}><div><strong>{document.title}</strong><small>Aufbewahrung bis {formatDate(document.retention_until)}{document.legal_hold?" · Löschsperre":""}</small></div></div>)}</div>}
      </section>
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Verwaltung</p><h2>Archiv</h2></div></div>
        <p className="subtle">Archivieren beendet die Bearbeitung. Die Akte und ihre Nachweise bleiben bis zum Ablauf der Aufbewahrungsfrist lesbar.</p>
        {d.canArchive?<Form method="post"><input type="hidden" name="_intent" value={archived?"restore":"archive"}/><input type="hidden" name="case_id" value={gwgCase.id}/><input type="hidden" name="version" value={gwgCase.version}/><button className="secondary-button" type="submit">{archived?"Wiederherstellen":"Archivieren"}</button></Form>:<p className="empty-state">Archivieren ist Geschäftsführungs- und Adminfunktion.</p>}
      </section>
    </div>
    </>}

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Vor produktiver Nutzung</p><h2>Anwaltlich abzunehmen</h2></div></div>
      <ul className="subtle">
        <li>Ob und ab wann für dieses Maklerbüro geldwäscherechtliche Pflichten bestehen und welche Fälle erfasst werden müssen.</li>
        <li>Der Umfang der zu erhebenden Angaben, insbesondere zu wirtschaftlich Berechtigten und zur Herkunft der Mittel.</li>
        <li>Die zulässige Speicherung von Ausweisdaten und Ausweiskopien sowie die konkreten Löschfristen.</li>
        <li>Der interne Ablauf bei einem Treffer im Listenabgleich und bei einem Verdachtsfall einschließlich der Frage, wer meldet.</li>
        <li>Der Umgang mit dem Verbot, den Betroffenen über eine Meldung zu informieren.</li>
      </ul>
    </section>
  </main>;
}
