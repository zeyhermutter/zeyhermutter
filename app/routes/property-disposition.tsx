import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-disposition";
import { requirePermission } from "~/lib/auth.server";
import { crmDateAtTimeToIso } from "~/lib/local-time";

type ActionResult={error?:string};

const STRUCTURE:Record<string,string>={SOLE:"Alleineigentum",FRACTIONAL:"Miteigentum nach Bruchteilen",COMMUNITY_OF_HEIRS:"Erbengemeinschaft",MARITAL_COMMUNITY:"Gütergemeinschaft",OTHER:"Andere Form",UNKNOWN:"Noch nicht geklärt"};
const PROOF:Record<string,string>={CERTIFICATE_OF_INHERITANCE:"Erbschein",NOTARIAL_WILL:"Notarielles Testament mit Eröffnungsprotokoll",EUROPEAN_CERTIFICATE:"Europäisches Nachlasszeugnis",OTHER:"Sonstiger Nachweis"};
const PARTY_ROLE:Record<string,string>={OWNER:"Eigentümer",CO_HEIR:"Miterbe",EXECUTOR:"Testamentsvollstrecker",ATTORNEY_IN_FACT:"Bevollmächtigter",LEGAL_GUARDIAN:"Betreuer",SUPPLEMENTARY_CURATOR:"Ergänzungspfleger",SPOUSE:"Ehegatte"};
const CONSENT:Record<string,string>={NOT_REQUIRED:"Nicht erforderlich",OPEN:"Offen",GIVEN:"Erteilt",REFUSED:"Verweigert"};
const CONSENT_CLASS:Record<string,string>={NOT_REQUIRED:"status-archived",OPEN:"status-draft",GIVEN:"status-sold",REFUSED:"status-lost"};
const FORM:Record<string,string>={PRIVATE_WRITTEN:"Privatschriftlich",CERTIFIED:"Beglaubigt",NOTARIAL:"Notariell",VERBAL:"Mündlich"};
const POA_FORM:Record<string,string>={PRIVATE_WRITTEN:"Privatschriftlich",CERTIFIED:"Beglaubigt",NOTARIAL:"Notariell"};
const POA_TYPE:Record<string,string>={GENERAL:"Generalvollmacht",PRECAUTIONARY:"Vorsorgevollmacht",SALE:"Verkaufsvollmacht",OTHER:"Sonstige Vollmacht"};

const REPRESENTING_ROLES=["ATTORNEY_IN_FACT","LEGAL_GUARDIAN","SUPPLEMENTARY_CURATOR"];

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const value=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function today(){return new Date().toISOString().slice(0,10);}
function contactLabel(contact:any){return contact?`${contact.last_name}, ${contact.first_name}`:"";}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("DISPOSITION_PROPERTY_NOT_FOUND"))return"Die Immobilie wurde nicht gefunden.";
  if(message.includes("DISPOSITION_DEATH_DATE_REQUIRED"))return"Zu einem Erbfall gehört das Sterbedatum.";
  if(message.includes("DISPOSITION_DECEDENT_NOT_FOUND"))return"Der gewählte Erblasser wurde nicht gefunden.";
  if(message.includes("DISPOSITION_PROOF_DATE_IN_FUTURE"))return"Das Erteilungsdatum des Erbnachweises darf nicht in der Zukunft liegen.";
  if(message.includes("DISPOSITION_LAND_REGISTER_DATE_REQUIRED"))return"Zur erfolgten Grundbuchberichtigung gehört ein Datum.";
  if(message.includes("DISPOSITION_SPOUSAL_DATE_IN_FUTURE"))return"Das Datum der Ehegattenzustimmung darf nicht in der Zukunft liegen.";
  if(message.includes("DISPOSITION_REVIEWER_REQUIRED"))return"Zum Prüfdatum gehört auch, wer geprüft hat.";
  if(message.includes("DISPOSITION_NOT_FOUND"))return"Die Akte zur Verfügungsberechtigung wurde nicht gefunden.";
  if(message.includes("DISPOSITION_CONTACT_NOT_FOUND"))return"Der gewählte Kontakt wurde nicht gefunden.";
  if(message.includes("DISPOSITION_REPRESENTED_CONTACT_REQUIRED"))return"Bei Vollmacht, Betreuung und Pflegschaft muss angegeben werden, für wen die Person handelt.";
  if(message.includes("DISPOSITION_REPRESENTED_CONTACT_MUST_DIFFER"))return"Die vertretene Person muss sich von der handelnden Person unterscheiden.";
  if(message.includes("DISPOSITION_REPRESENTED_CONTACT_NOT_FOUND"))return"Die vertretene Person wurde nicht gefunden.";
  if(message.includes("DISPOSITION_COURT_REQUIRED"))return"Bei Betreuung und Ergänzungspflegschaft ist das zuständige Gericht erforderlich.";
  if(message.includes("DISPOSITION_REVOCATION_IN_FUTURE"))return"Das Widerrufsdatum der Vollmacht darf nicht in der Zukunft liegen.";
  if(message.includes("DISPOSITION_APPROVAL_IN_FUTURE"))return"Das Datum der Genehmigung darf nicht in der Zukunft liegen.";
  if(message.includes("DISPOSITION_CONSENT_AFTER_REVOCATION"))return"Eine Zustimmung nach dem Widerruf der Vollmacht kann nicht dokumentiert werden.";
  if(message.includes("DISPOSITION_SHARES_EXCEED_TOTAL"))return"Die erfassten Quoten überschreiten zusammen 100 Prozent.";
  if(message.includes("ARCHIVED_DISPOSITION_PARTY_IMMUTABLE"))return"Ein archivierter Beteiligter kann inhaltlich nicht mehr geändert werden.";
  if(message.includes("property_dispositions_inheritance_check"))return"Angaben zum Erbfall sind nur möglich, wenn ein Erbfall vorliegt.";
  if(message.includes("property_dispositions_death_date_check"))return"Das Sterbedatum darf nicht in der Zukunft liegen.";
  if(message.includes("property_dispositions_proof_dates_check"))return"Der Erbnachweis kann nicht vor der Beantragung erteilt worden sein.";
  if(message.includes("property_dispositions_land_register_check"))return"Ein Berichtigungsdatum setzt voraus, dass die Grundbuchberichtigung erfolgt ist.";
  if(message.includes("property_dispositions_spousal_check"))return"Ein Zustimmungsdatum setzt voraus, dass die Ehegattenzustimmung erforderlich ist.";
  if(message.includes("property_disposition_parties_consent_check"))return"Zu einer erteilten Zustimmung gehören Datum und Form.";
  if(message.includes("property_disposition_parties_consent_date_check"))return"Das Zustimmungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("property_disposition_parties_poa_required_check"))return"Für einen Bevollmächtigten sind Art und Form der Vollmacht erforderlich.";
  if(message.includes("property_disposition_parties_poa_check"))return"Angaben zur Vollmacht sind nur bei einem Bevollmächtigten möglich.";
  if(message.includes("property_disposition_parties_court_check"))return"Angaben zur Genehmigung sind nur möglich, wenn eine Genehmigung erforderlich ist.";
  if(message.includes("property_disposition_parties_court_dates_check"))return"Die Genehmigung kann nicht vor der Beantragung erteilt worden sein.";
  if(message.includes("property_disposition_parties_share_check"))return"Eine Quote lässt sich nur für Eigentümer und Miterben erfassen.";
  if(message.includes("property_disposition_parties_disposition_id_contact_id_party_role_key"))return"Diese Person ist in dieser Rolle bereits erfasst.";
  if(message.includes("ARCHIVE_PERMISSION_REQUIRED")||message.includes("disposition.archive"))return"Zum Archivieren fehlt die Berechtigung.";
  return "Die Angaben zur Verfügungsberechtigung konnten nicht gespeichert werden.";
}

/**
 * Die Lückenliste — eine reine Vollständigkeitsprüfung der Erfassung, keine
 * Aussage darüber, ob jemand rechtlich wirksam verfügen kann — kommt seit
 * Thema 11 aus public.property_disposition_gaps. Sie erscheint auch in der
 * Objektakte und in den Blockern des Verkaufsprojekts; eine zweite Fassung in
 * TypeScript würde davon abdriften.
 */

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"disposition.read");
  const propertyId=params.propertyId!;
  const {data:property,error:propertyError}=await supabase.from("properties").select("id,property_number,internal_title,status,primary_responsible_user").eq("id",propertyId).maybeSingle();
  if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});
  const [{data:record},{data:partiesRaw},{data:owners},{data:contacts},{data:profiles},{data:canWrite},{data:canArchive},{data:canTask},{data:gapsResult}]=await Promise.all([
    supabase.from("property_dispositions").select("*").eq("property_id",propertyId).maybeSingle(),
    supabase.from("property_disposition_parties").select("*,contacts!property_disposition_parties_contact_id_fkey(id,contact_number,first_name,last_name),represents:contacts!property_disposition_parties_represents_contact_id_fkey(id,first_name,last_name)").order("party_role").order("created_at"),
    supabase.from("property_owners").select("contact_id,ownership_percentage,primary_contact").eq("property_id",propertyId),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.rpc("current_user_has_permission",{p_permission:"disposition.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"disposition.archive"}),
    supabase.rpc("current_user_has_permission",{p_permission:"task.write"}),
    supabase.rpc("property_disposition_gaps",{p_property_id:propertyId}),
  ]);
  const parties=((partiesRaw??[]) as any[]).filter((row)=>!record||row.disposition_id===record.id);
  return data({profile,property,record,parties,gaps:(gapsResult??[]) as string[],owners:owners??[],contacts:contacts??[],profiles:profiles??[],canWrite:canWrite===true,canArchive:canArchive===true,canTask:canTask===true},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"disposition.write");
  const propertyId=params.propertyId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const back=`/properties/${propertyId}/disposition`;
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Der Datensatz wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="record_save"){
    const structure=text(fd,"ownership_structure");
    if(!Object.keys(STRUCTURE).includes(structure))return invalid("Bitte eine gültige Eigentümerstellung wählen.");
    const inheritance=text(fd,"inheritance_case")==="yes";
    const proofType=text(fd,"succession_proof_type");
    if(proofType&&!Object.keys(PROOF).includes(proofType))return invalid("Ungültige Art des Erbnachweises.");
    const corrected=inheritance&&text(fd,"land_register_corrected")==="yes";
    const spousal=text(fd,"spousal_consent_required")==="yes";
    const reviewedOn=dateOrNull(fd,"reviewed_on");
    const payload:Record<string,unknown>={
      property_id:propertyId,
      ownership_structure:structure,
      inheritance_case:inheritance,
      decedent_name:inheritance?(text(fd,"decedent_name")||null):null,
      decedent_contact_id:inheritance?(text(fd,"decedent_contact_id")||null):null,
      date_of_death:inheritance?dateOrNull(fd,"date_of_death"):null,
      succession_proof_type:inheritance?(proofType||null):null,
      succession_proof_applied_on:inheritance?dateOrNull(fd,"succession_proof_applied_on"):null,
      succession_proof_issued_on:inheritance?dateOrNull(fd,"succession_proof_issued_on"):null,
      succession_proof_reference:inheritance?(text(fd,"succession_proof_reference")||null):null,
      land_register_corrected:corrected,
      land_register_corrected_on:corrected?dateOrNull(fd,"land_register_corrected_on"):null,
      executor_appointed:text(fd,"executor_appointed")==="yes",
      spousal_consent_required:spousal,
      spousal_consent_given_on:spousal?dateOrNull(fd,"spousal_consent_given_on"):null,
      disposition_notes:text(fd,"disposition_notes")||null,
      reviewed_on:reviewedOn,
      reviewed_by:reviewedOn?userId:null,
      updated_by:userId,
    };
    const recordId=text(fd,"record_id");
    if(recordId){
      const {data:updated,error}=await supabase.from("property_dispositions").update(payload).eq("id",recordId).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
      if(error)return fail(error);
      if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("property_dispositions").insert({...payload,created_by:userId});
      if(error)return fail(error);
    }
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="party_save"){
    const dispositionId=text(fd,"disposition_id");
    if(!dispositionId)return invalid("Bitte zuerst die Verfügungsberechtigung anlegen.");
    const contactId=text(fd,"contact_id");
    if(!contactId)return invalid("Bitte einen Kontakt auswählen.");
    const role=text(fd,"party_role");
    if(!Object.keys(PARTY_ROLE).includes(role))return invalid("Bitte eine gültige Rolle wählen.");
    const consentStatus=text(fd,"consent_status");
    if(!Object.keys(CONSENT).includes(consentStatus))return invalid("Ungültiger Zustimmungsstand.");
    const consentForm=text(fd,"consent_form");
    if(consentForm&&!Object.keys(FORM).includes(consentForm))return invalid("Ungültige Form der Zustimmung.");
    const isAttorney=role==="ATTORNEY_IN_FACT";
    const poaType=text(fd,"power_of_attorney_type");
    const poaForm=text(fd,"power_of_attorney_form");
    if(isAttorney){
      if(!Object.keys(POA_TYPE).includes(poaType))return invalid("Für einen Bevollmächtigten ist die Art der Vollmacht erforderlich.");
      if(!Object.keys(POA_FORM).includes(poaForm))return invalid("Für einen Bevollmächtigten ist die Form der Vollmacht erforderlich.");
    }
    const share=numOrNull(fd,"share_percentage");
    if(typeof share==="number"&&!Number.isFinite(share))return invalid("Ungültige Quote.");
    const approvalRequired=text(fd,"court_approval_required")==="yes";
    const payload:Record<string,unknown>={
      disposition_id:dispositionId,
      contact_id:contactId,
      party_role:role,
      represents_contact_id:REPRESENTING_ROLES.includes(role)?(text(fd,"represents_contact_id")||null):null,
      share_percentage:["OWNER","CO_HEIR"].includes(role)?share:null,
      consent_status:consentStatus,
      consent_on:consentStatus==="GIVEN"?dateOrNull(fd,"consent_on"):null,
      consent_form:consentStatus==="GIVEN"?(consentForm||null):null,
      power_of_attorney_type:isAttorney?poaType:null,
      power_of_attorney_form:isAttorney?poaForm:null,
      power_of_attorney_scope:isAttorney?(text(fd,"power_of_attorney_scope")||null):null,
      power_of_attorney_valid_until:isAttorney?dateOrNull(fd,"power_of_attorney_valid_until"):null,
      power_of_attorney_revoked_on:isAttorney?dateOrNull(fd,"power_of_attorney_revoked_on"):null,
      is_minor:text(fd,"is_minor")==="yes",
      supervising_court:text(fd,"supervising_court")||null,
      guardianship_scope:text(fd,"guardianship_scope")||null,
      court_approval_required:approvalRequired,
      court_approval_applied_on:approvalRequired?dateOrNull(fd,"court_approval_applied_on"):null,
      court_approval_granted_on:approvalRequired?dateOrNull(fd,"court_approval_granted_on"):null,
      court_approval_reference:approvalRequired?(text(fd,"court_approval_reference")||null):null,
      notes:text(fd,"notes")||null,
      updated_by:userId,
    };
    const partyId=text(fd,"party_id");
    if(partyId){
      const {data:updated,error}=await supabase.from("property_disposition_parties").update(payload).eq("id",partyId).eq("version",Number(text(fd,"party_version"))).select("id").maybeSingle();
      if(error)return fail(error);
      if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("property_disposition_parties").insert({...payload,created_by:userId});
      if(error)return fail(error);
    }
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="party_archive"||intent==="party_restore"){
    await requirePermission(request,context.cloudflare.env,"disposition.archive");
    const {data:updated,error}=await supabase.from("property_disposition_parties")
      .update({archived_at:intent==="party_archive"?new Date().toISOString():null})
      .eq("id",text(fd,"party_id")).eq("version",Number(text(fd,"party_version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="party_remove"){
    const {error}=await supabase.from("property_disposition_parties").delete().eq("id",text(fd,"party_id"));
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="reminder"){
    await requirePermission(request,context.cloudflare.env,"task.write");
    const partyId=text(fd,"party_id");
    const {data:party,error:loadError}=await supabase.from("property_disposition_parties")
      .select("id,party_role,court_approval_required,court_approval_granted_on,court_approval_applied_on,consent_status,supervising_court,contacts!property_disposition_parties_contact_id_fkey(first_name,last_name)")
      .eq("id",partyId).maybeSingle();
    if(loadError||!party)return invalid("Der Beteiligte konnte nicht gelesen werden.");
    const {data:property}=await supabase.from("properties").select("property_number,primary_responsible_user").eq("id",propertyId).maybeSingle();
    const contact=one((party as any).contacts);
    const name=contactLabel(contact)||"Beteiligter";
    const isApproval=(party as any).court_approval_required&&!(party as any).court_approval_granted_on;
    if(!isApproval&&(party as any).consent_status!=="OPEN")return invalid("Für diesen Beteiligten ist derzeit nichts offen, das eine Wiedervorlage rechtfertigt.");
    const dueOn=new Date(Date.now()+14*864e5).toISOString().slice(0,10);
    const dueAt=crmDateAtTimeToIso(dueOn);
    if(!dueAt)return invalid("Die Wiedervorlage konnte nicht terminiert werden.");
    const {error}=await supabase.from("tasks").insert({
      title:isApproval
        ?`Gerichtliche Genehmigung nachfassen · ${name}`
        :`Zustimmung einholen · ${name}`,
      description:isApproval
        ?`Stand der Genehmigung für das Grundstücksgeschäft prüfen${(party as any).supervising_court?` (${(party as any).supervising_court})`:""}. Ohne dokumentierte Genehmigung bleibt die Verfügungsberechtigung offen.`
        :`Zustimmung von ${name} zur Veräußerung einholen und mit Datum und Form dokumentieren.`,
      status:"OPEN",priority:"HIGH",due_at:dueAt,
      responsible_user:property?.primary_responsible_user??userId,
      property_id:propertyId,
      contact_id:(party as any).contact_id??null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

function PartyForm({row,contacts,dispositionId,disabled,formKey}:{row?:any;contacts:any[];dispositionId:string;disabled:boolean;formKey:string}){
  return <Form method="post" className="editor-card" style={{marginTop:"1rem"}} key={formKey}>
    <input type="hidden" name="_intent" value="party_save"/>
    <input type="hidden" name="disposition_id" value={dispositionId}/>
    {row?<input type="hidden" name="party_id" value={row.id}/>:null}
    {row?<input type="hidden" name="party_version" value={row.version}/>:null}
    <div className="card-head"><div><p className="eyebrow">{row?"Bestehender Beteiligter":"Neue Erfassung"}</p><h3>{row?`${PARTY_ROLE[row.party_role]??row.party_role} · ${contactLabel(one(row.contacts))}`:"Beteiligten erfassen"}</h3></div></div>
    <div className="form-grid">
      <label className="form-field"><span>Person *</span><select name="contact_id" defaultValue={row?.contact_id??""} required disabled={disabled}><option value="">Auswählen…</option>{contacts.map((c:any)=><option value={c.id} key={c.id}>{contactLabel(c)} · {c.contact_number}</option>)}</select></label>
      <label className="form-field"><span>Rolle *</span><select name="party_role" defaultValue={row?.party_role??"CO_HEIR"} required disabled={disabled}>{Object.entries(PARTY_ROLE).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Handelt für</span><select name="represents_contact_id" defaultValue={row?.represents_contact_id??""} disabled={disabled}><option value="">—</option>{contacts.map((c:any)=><option value={c.id} key={c.id}>{contactLabel(c)}</option>)}</select><small className="subtle">Pflicht bei Vollmacht, Betreuung und Ergänzungspflegschaft.</small></label>
      <label className="form-field"><span>Quote %</span><input name="share_percentage" inputMode="decimal" defaultValue={row?.share_percentage??""} disabled={disabled}/><small className="subtle">Nur für Eigentümer und Miterben.</small></label>
      <label className="form-field"><span>Zustimmung</span><select name="consent_status" defaultValue={row?.consent_status??"OPEN"} disabled={disabled}>{Object.entries(CONSENT).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Zustimmung am</span><input name="consent_on" type="date" defaultValue={row?.consent_on??""} max={today()} disabled={disabled}/></label>
      <label className="form-field"><span>Form der Zustimmung</span><select name="consent_form" defaultValue={row?.consent_form??""} disabled={disabled}><option value="">—</option>{Object.entries(FORM).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select><small className="subtle">Bei „Erteilt" sind Datum und Form erforderlich.</small></label>
      <label className="form-field"><span>Minderjährig</span><select name="is_minor" defaultValue={row?.is_minor?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
    </div>

    <div className="card-head" style={{marginTop:"1rem"}}><div><p className="eyebrow">Nur bei Bevollmächtigten</p><h4>Vollmacht</h4></div></div>
    <div className="form-grid">
      <label className="form-field"><span>Art der Vollmacht</span><select name="power_of_attorney_type" defaultValue={row?.power_of_attorney_type??""} disabled={disabled}><option value="">—</option>{Object.entries(POA_TYPE).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Form der Vollmacht</span><select name="power_of_attorney_form" defaultValue={row?.power_of_attorney_form??""} disabled={disabled}><option value="">—</option>{Object.entries(POA_FORM).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Gültig bis</span><input name="power_of_attorney_valid_until" type="date" defaultValue={row?.power_of_attorney_valid_until??""} disabled={disabled}/></label>
      <label className="form-field"><span>Widerrufen am</span><input name="power_of_attorney_revoked_on" type="date" defaultValue={row?.power_of_attorney_revoked_on??""} max={today()} disabled={disabled}/></label>
      <label className="form-field full-width"><span>Umfang der Vollmacht</span><input name="power_of_attorney_scope" defaultValue={row?.power_of_attorney_scope??""} placeholder="Wortlaut bzw. Zusammenfassung" disabled={disabled}/></label>
    </div>

    <div className="card-head" style={{marginTop:"1rem"}}><div><p className="eyebrow">Betreuung, Pflegschaft und Genehmigungen</p><h4>Gericht</h4></div></div>
    <div className="form-grid">
      <label className="form-field"><span>Zuständiges Gericht</span><input name="supervising_court" defaultValue={row?.supervising_court??""} placeholder="Betreuungs- bzw. Familiengericht" disabled={disabled}/></label>
      <label className="form-field"><span>Aufgabenkreis / Umfang</span><input name="guardianship_scope" defaultValue={row?.guardianship_scope??""} disabled={disabled}/></label>
      <label className="form-field"><span>Genehmigung erforderlich</span><select name="court_approval_required" defaultValue={row?.court_approval_required?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select><small className="subtle">Ob eine Genehmigung nötig ist, entscheidet nicht das System.</small></label>
      <label className="form-field"><span>Beantragt am</span><input name="court_approval_applied_on" type="date" defaultValue={row?.court_approval_applied_on??""} disabled={disabled}/></label>
      <label className="form-field"><span>Erteilt am</span><input name="court_approval_granted_on" type="date" defaultValue={row?.court_approval_granted_on??""} max={today()} disabled={disabled}/></label>
      <label className="form-field"><span>Aktenzeichen</span><input name="court_approval_reference" defaultValue={row?.court_approval_reference??""} disabled={disabled}/></label>
    </div>
    <label className="form-field full-width"><span>Interne Notiz</span><textarea name="notes" rows={2} defaultValue={row?.notes??""} disabled={disabled}/></label>
    <div className="form-actions"><button className="primary-button" type="submit" disabled={disabled}>{row?"Beteiligten speichern":"Beteiligten erfassen"}</button></div>
  </Form>;
}

export default function PropertyDisposition(){
  const d=useLoaderData<typeof loader>();
  const r=useActionData<typeof action>();
  const record=d.record as any;
  const parties=d.parties as any[];
  const locked=!d.canWrite;
  const gaps=(d.gaps??[]) as string[];
  const active=parties.filter((row)=>!row.archived_at);
  const inheritance=Boolean(record?.inheritance_case);
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to={`/properties/${d.property.id}`}>← Objektakte</Link><p className="eyebrow">{d.property.property_number}</p><h1 className="editor-title">Verfügungsberechtigung</h1><p className="editor-meta">{d.property.internal_title}</p></div><div className="header-actions"><span className={`status-pill ${gaps.length?"status-lost":"status-sold"}`}>{gaps.length?`${gaps.length} offen`:"Geklärt"}</span><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div></header>

    {r?.error?<div className="form-error">{r.error}</div>:null}
    <div className="form-warning"><strong>Erfassung, keine rechtliche Prüfung.</strong> Das System dokumentiert, wer beteiligt ist und welche Zustimmungen und Genehmigungen vorliegen. Es beurteilt nicht, ob eine Vollmacht ausreicht oder ob jemand wirksam verfügen kann. Diese Frage gehört zum Notariat oder zur anwaltlichen Beratung.</div>

    {gaps.length
      ?<div className="form-warning"><strong>Verfügungsberechtigung offen</strong><ul>{gaps.map((gap)=><li key={gap}>{gap}</li>)}</ul></div>
      :<div className="form-success"><strong>Verfügungsberechtigung geklärt.</strong> Alle im System geführten Angaben, Zustimmungen und Genehmigungen sind dokumentiert.</div>}

    <section className="metric-grid">
      <article className="metric-card"><span>Eigentümerstellung</span><strong>{STRUCTURE[record?.ownership_structure??"UNKNOWN"]}</strong><small>{d.owners.length} Eigentümer in der Objektakte</small></article>
      <article className="metric-card"><span>Beteiligte</span><strong>{active.length}</strong><small>erfasst</small></article>
      <article className="metric-card"><span>Zustimmungen offen</span><strong>{active.filter((row)=>row.consent_status==="OPEN").length}</strong><small>{active.filter((row)=>row.consent_status==="REFUSED").length} verweigert</small></article>
      <article className="metric-card"><span>Genehmigungen offen</span><strong>{active.filter((row)=>row.court_approval_required&&!row.court_approval_granted_on).length}</strong><small>gerichtlich</small></article>
      <article className="metric-card"><span>Erbfall</span><strong>{inheritance?"Ja":"Nein"}</strong><small>{inheritance&&record?.succession_proof_issued_on?`Nachweis vom ${formatDate(record.succession_proof_issued_on)}`:inheritance?"Nachweis offen":"kein Erbfall erfasst"}</small></article>
    </section>

    <section className="editor-card"><div className="card-head"><div><p className="eyebrow">Grundlage</p><h2>Eigentümerstellung, Erbfall und Ehegattenzustimmung</h2></div>{record?<span className="status-pill">Version {record.version}</span>:<span className="status-pill status-draft">Noch nicht erfasst</span>}</div>
      <Form method="post">
        <input type="hidden" name="_intent" value="record_save"/>
        {record?<input type="hidden" name="record_id" value={record.id}/>:null}
        {record?<input type="hidden" name="version" value={record.version}/>:null}
        <div className="form-grid">
          <label className="form-field"><span>Eigentümerstellung *</span><select name="ownership_structure" defaultValue={record?.ownership_structure??"UNKNOWN"} required disabled={locked}>{Object.entries(STRUCTURE).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
          <label className="form-field"><span>Testamentsvollstreckung</span><select name="executor_appointed" defaultValue={record?.executor_appointed?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select><small className="subtle">Den Vollstrecker unten als Beteiligten erfassen.</small></label>
          <label className="form-field"><span>Ehegattenzustimmung erforderlich</span><select name="spousal_consent_required" defaultValue={record?.spousal_consent_required?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Ehegattenzustimmung erteilt am</span><input name="spousal_consent_given_on" type="date" defaultValue={record?.spousal_consent_given_on??""} max={today()} disabled={locked}/></label>
          <label className="form-field"><span>Geprüft am</span><input name="reviewed_on" type="date" defaultValue={record?.reviewed_on??""} max={today()} disabled={locked}/><small className="subtle">Wird auf den angemeldeten Benutzer gebucht.</small></label>
        </div>

        <div className="card-head" style={{marginTop:"1.25rem"}}><div><p className="eyebrow">Nachlass</p><h3>Erbfall</h3></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Erbfall liegt vor</span><select name="inheritance_case" defaultValue={inheritance?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select><small className="subtle">Die folgenden Felder werden nur bei „Ja" gespeichert.</small></label>
          <label className="form-field"><span>Erblasser · Kontakt</span><select name="decedent_contact_id" defaultValue={record?.decedent_contact_id??""} disabled={locked}><option value="">—</option>{d.contacts.map((c:any)=><option value={c.id} key={c.id}>{contactLabel(c)} · {c.contact_number}</option>)}</select></label>
          <label className="form-field"><span>Erblasser · Freitext</span><input name="decedent_name" defaultValue={record?.decedent_name??""} disabled={locked}/></label>
          <label className="form-field"><span>Sterbedatum</span><input name="date_of_death" type="date" defaultValue={record?.date_of_death??""} max={today()} disabled={locked}/></label>
          <label className="form-field"><span>Erbnachweis</span><select name="succession_proof_type" defaultValue={record?.succession_proof_type??""} disabled={locked}><option value="">Noch nicht festgelegt</option>{Object.entries(PROOF).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
          <label className="form-field"><span>Beantragt am</span><input name="succession_proof_applied_on" type="date" defaultValue={record?.succession_proof_applied_on??""} disabled={locked}/></label>
          <label className="form-field"><span>Erteilt am</span><input name="succession_proof_issued_on" type="date" defaultValue={record?.succession_proof_issued_on??""} max={today()} disabled={locked}/></label>
          <label className="form-field"><span>Aktenzeichen des Nachweises</span><input name="succession_proof_reference" defaultValue={record?.succession_proof_reference??""} disabled={locked}/></label>
          <label className="form-field"><span>Grundbuch berichtigt</span><select name="land_register_corrected" defaultValue={record?.land_register_corrected?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Berichtigt am</span><input name="land_register_corrected_on" type="date" defaultValue={record?.land_register_corrected_on??""} max={today()} disabled={locked}/></label>
        </div>
        <label className="form-field full-width"><span>Interne Notizen zur Verfügungsberechtigung</span><textarea name="disposition_notes" rows={4} defaultValue={record?.disposition_notes??""} disabled={locked}/></label>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={locked}>{record?"Angaben speichern":"Verfügungsberechtigung anlegen"}</button></div>
      </Form>
    </section>

    {record?<section className="data-card" id="beteiligte"><div className="card-head"><div><p className="eyebrow">Wer darf verkaufen</p><h2>{active.length} Beteiligte</h2></div><Link className="subtle-link" to={`/properties/${d.property.id}`}>Eigentümer der Objektakte →</Link></div>
      {parties.length===0?<p className="empty-state">Noch keine Beteiligten erfasst. Bei Alleineigentum genügt der Eigentümer, bei einer Erbengemeinschaft gehören alle Miterben hierher.</p>:<div className="data-list">
        {parties.map((row:any)=>{
          const contact=one(row.contacts);const represents=one(row.represents);
          const approvalOpen=row.court_approval_required&&!row.court_approval_granted_on;
          const poaProblem=row.party_role==="ATTORNEY_IN_FACT"&&(row.power_of_attorney_revoked_on||(row.power_of_attorney_valid_until&&row.power_of_attorney_valid_until<today()));
          return <div className="data-row" key={row.id}>
            <div><strong>{contactLabel(contact)} · {PARTY_ROLE[row.party_role]??row.party_role}</strong><small>{row.share_percentage?`Quote ${Number(row.share_percentage).toLocaleString("de-DE",{maximumFractionDigits:3})} % · `:""}{represents?`handelt für ${contactLabel(represents)}`:row.is_minor?"minderjährig":"—"}</small></div>
            <div className="row-meta"><span className={`status-pill ${CONSENT_CLASS[row.consent_status]}`}>{CONSENT[row.consent_status]}</span><small>{row.consent_on?`${formatDate(row.consent_on)}${row.consent_form?` · ${FORM[row.consent_form]}`:""}`:"kein Datum erfasst"}</small></div>
            <div className="row-meta">
              {row.party_role==="ATTORNEY_IN_FACT"?<span className={poaProblem?"status-pill status-lost":""}>{row.power_of_attorney_revoked_on?`widerrufen ${formatDate(row.power_of_attorney_revoked_on)}`:row.power_of_attorney_valid_until&&row.power_of_attorney_valid_until<today()?`abgelaufen ${formatDate(row.power_of_attorney_valid_until)}`:POA_TYPE[row.power_of_attorney_type]??"Vollmacht"}</span>:<span>{approvalOpen?"Genehmigung ausstehend":row.court_approval_granted_on?`genehmigt ${formatDate(row.court_approval_granted_on)}`:"—"}</span>}
              <small>{row.supervising_court||(row.archived_at?"archiviert":"")}</small>
            </div>
            <div className="inline-actions">
              {d.canTask&&!row.archived_at&&(approvalOpen||row.consent_status==="OPEN")?<Form method="post"><input type="hidden" name="_intent" value="reminder"/><input type="hidden" name="party_id" value={row.id}/><button className="secondary-button" type="submit">Wiedervorlage</button></Form>:null}
              {d.canArchive?<Form method="post"><input type="hidden" name="_intent" value={row.archived_at?"party_restore":"party_archive"}/><input type="hidden" name="party_id" value={row.id}/><input type="hidden" name="party_version" value={row.version}/><button className="secondary-button" type="submit">{row.archived_at?"Wiederherstellen":"Archivieren"}</button></Form>:null}
            </div>
          </div>;
        })}
      </div>}
      {parties.map((row:any)=><PartyForm key={`f-${row.id}`} formKey={`f-${row.id}`} row={row} contacts={d.contacts} dispositionId={record.id} disabled={locked||Boolean(row.archived_at)}/>)}
      {d.canWrite?<PartyForm formKey="new-party" contacts={d.contacts} dispositionId={record.id} disabled={false}/>:null}
    </section>:null}

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Vor produktiver Nutzung</p><h2>Anwaltlich abzunehmen</h2></div></div>
      <ul className="subtle">
        <li>Welcher Erbnachweis im Einzelfall genügt und wann eine Grundbuchberichtigung vor dem Verkauf zwingend ist.</li>
        <li>Ob eine vorgelegte Vollmacht Form und Umfang für ein Grundstücksgeschäft erfüllt.</li>
        <li>In welchen Fällen eine betreuungs- oder familiengerichtliche Genehmigung erforderlich ist und wer sie beantragt.</li>
        <li>Ob und wann eine Ehegattenzustimmung erforderlich ist.</li>
        <li>Welche Nachlass- und Betreuungsunterlagen aufbewahrt werden dürfen und wie lange.</li>
        <li>Ob die Zustimmung aller Miterben vor Abschluss eines Maklerauftrags vorliegen muss.</li>
      </ul>
    </section>
  </main>;
}
