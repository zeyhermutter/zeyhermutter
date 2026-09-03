import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-legal";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

export const SECTION:Record<string,string>={LAND_REGISTER_II:"Abteilung II · Lasten und Beschränkungen",LAND_REGISTER_III:"Abteilung III · Grundpfandrechte",BUILDING_ENCUMBRANCE:"Baulastenverzeichnis"};
const SECTION_SHORT:Record<string,string>={LAND_REGISTER_II:"Abt. II",LAND_REGISTER_III:"Abt. III",BUILDING_ENCUMBRANCE:"Baulast"};
const KINDS:Record<string,Record<string,string>>={
  LAND_REGISTER_II:{RESIDENCE_RIGHT:"Wohnrecht",USUFRUCT:"Nießbrauch",RIGHT_OF_WAY:"Wegerecht",UTILITY_EASEMENT:"Leitungsrecht",PRE_EMPTION_RIGHT:"Vorkaufsrecht",REAL_CHARGE:"Reallast",HERITABLE_BUILDING_RIGHT:"Erbbaurecht",PRIORITY_NOTICE:"Auflassungsvormerkung",REDEVELOPMENT_NOTE:"Sanierungsvermerk",REALLOCATION_NOTE:"Umlegungsvermerk",INSOLVENCY_NOTE:"Insolvenzvermerk",OTHER:"Sonstiges Recht"},
  LAND_REGISTER_III:{LAND_CHARGE:"Grundschuld",MORTGAGE:"Hypothek",ANNUITY_CHARGE:"Rentenschuld",OTHER:"Sonstiges Grundpfandrecht"},
  BUILDING_ENCUMBRANCE:{ACCESS:"Zufahrtsbaulast",DISTANCE_AREA:"Abstandsflächenbaulast",PARKING:"Stellplatzbaulast",UNION:"Vereinigungsbaulast",DEVELOPMENT:"Erschließungsbaulast",CHILDREN_PLAYGROUND:"Spielplatzbaulast",OTHER:"Sonstige Baulast"},
};
const DELETABLE:Record<string,string>={YES:"Löschbar",NO:"Nicht löschbar",UNCLEAR:"Noch offen"};
const SALE_IMPACT:Record<string,string>={NONE:"Keine Auswirkung",TRANSFERS_TO_BUYER:"Geht auf den Käufer über",MUST_BE_DELETED:"Muss vor Übergabe gelöscht werden",PURCHASE_PRICE_RELEVANT:"Wirkt sich auf den Kaufpreis aus",UNCLEAR:"Noch zu klären"};
const AREA_BASIS:Record<string,string>={WOFLV:"Wohnflächenverordnung",DIN_277:"DIN 277",ESTIMATED:"Geschätzt",UNKNOWN:"Unbekannt"};
const INTERVAL:Record<string,string>={ANNUAL:"jährlich",QUARTERLY:"vierteljährlich",MONTHLY:"monatlich"};

const SECTION_KEYS=["LAND_REGISTER_II","LAND_REGISTER_III","BUILDING_ENCUMBRANCE"];

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const value=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function intOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number.parseInt(raw,10);return Number.isFinite(n)?n:NaN;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function money(value:any){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n):"—";}
function today(){return new Date().toISOString().slice(0,10);}
function contactLabel(contact:any){return contact?`${contact.last_name}, ${contact.first_name}`:"";}

export function encumbranceLabel(row:any){return KINDS[row.section]?.[row.kind]??row.kind;}
export function isOpenBurden(row:any){return !row.archived_at&&!row.deleted_on;}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("LEGAL_PROPERTY_NOT_FOUND")||message.includes("ENCUMBRANCE_PROPERTY_NOT_FOUND"))return"Die Immobilie wurde nicht gefunden.";
  if(message.includes("LEGAL_GROUND_LEASE_EXPIRED"))return"Das Ende der Erbbaurechtslaufzeit liegt in der Vergangenheit. Bitte prüfen.";
  if(message.includes("LEGAL_GROUND_LESSOR_NOT_FOUND"))return"Der gewählte Erbbaurechtsgeber wurde nicht gefunden.";
  if(message.includes("LEGAL_REVIEWER_REQUIRED"))return"Zum Prüfdatum gehört auch, wer geprüft hat.";
  if(message.includes("ENCUMBRANCE_BENEFICIARY_NOT_FOUND"))return"Der gewählte Berechtigte wurde nicht gefunden.";
  if(message.includes("ENCUMBRANCE_REGISTERED_IN_FUTURE"))return"Das Eintragungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("ENCUMBRANCE_DELETED_IN_FUTURE"))return"Das Löschungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("ENCUMBRANCE_DELETED_BUT_NOT_DELETABLE"))return"Ein bereits gelöschter Eintrag kann nicht als „nicht löschbar“ geführt werden.";
  if(message.includes("ENCUMBRANCE_DELETION_CONSENT_ONLY_SECTION_III"))return"Eine Löschungsbewilligung wird nur bei Grundpfandrechten der Abteilung III erfasst.";
  if(message.includes("ARCHIVED_ENCUMBRANCE_IMMUTABLE"))return"Ein archivierter Eintrag kann inhaltlich nicht mehr geändert werden.";
  if(message.includes("property_legal_data_heritable_check"))return"Angaben zum Erbbaurecht sind nur möglich, wenn ein Erbbaurecht besteht.";
  if(message.includes("property_legal_data_ground_rent_pair_check"))return"Zum Erbbauzins gehört auch der Zahlungsrhythmus.";
  if(message.includes("property_legal_data_extract_date_check"))return"Der Stand des Grundbuchauszugs darf nicht in der Zukunft liegen.";
  if(message.includes("property_legal_data_reviewed_date_check"))return"Das Prüfdatum darf nicht in der Zukunft liegen.";
  if(message.includes("property_legal_data_registered_area_sqm_check"))return"Die Grundstücksgröße laut Grundbuch muss größer als null sein.";
  if(message.includes("property_encumbrances_section_kind_check"))return"Die gewählte Art passt nicht zur gewählten Abteilung.";
  if(message.includes("property_encumbrances_nominal_required_check"))return"Für ein Grundpfandrecht ist der Nennbetrag erforderlich.";
  if(message.includes("property_encumbrances_amount_section_check"))return"Beträge werden nur bei Grundpfandrechten der Abteilung III erfasst.";
  if(message.includes("property_encumbrances_remaining_le_nominal_check"))return"Die Restvaluta kann nicht höher sein als der Nennbetrag.";
  if(message.includes("property_encumbrances_dates_check"))return"Das Löschungsdatum kann nicht vor der Eintragung liegen.";
  if(message.includes("property_encumbrances_party_check"))return"Bitte einen Berechtigten oder eine zuständige Behörde angeben.";
  if(message.includes("property_encumbrances_content_check"))return"Der Inhalt des Eintrags ist erforderlich.";
  if(message.includes("PROPERTY_ARCHIVE_REQUIRED")||message.includes("property.archive"))return"Zum Archivieren fehlt die Berechtigung.";
  return "Die Rechtsdaten konnten nicht gespeichert werden.";
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"property.read");
  const propertyId=params.propertyId!;
  const {data:property,error:propertyError}=await supabase.from("properties").select("id,property_number,internal_title,status,living_area_sqm,plot_area_sqm").eq("id",propertyId).maybeSingle();
  if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});
  const [{data:legal},{data:encumbrances},{data:contacts},{data:profiles},{data:canWrite},{data:canArchive}]=await Promise.all([
    supabase.from("property_legal_data").select("*").eq("property_id",propertyId).maybeSingle(),
    supabase.from("property_encumbrances").select("*,contacts!property_encumbrances_beneficiary_contact_id_fkey(id,contact_number,first_name,last_name)").eq("property_id",propertyId).order("section").order("rank_position",{nullsFirst:false}).order("created_at"),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.rpc("current_user_has_permission",{p_permission:"property.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"property.archive"}),
  ]);
  return data({profile,property,legal,encumbrances:encumbrances??[],contacts:contacts??[],profiles:profiles??[],canWrite:canWrite===true,canArchive:canArchive===true},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"property.write");
  const propertyId=params.propertyId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const back=`/properties/${propertyId}/legal`;
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Der Datensatz wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="legal_save"){
    const basis=text(fd,"living_area_basis");
    if(!["WOFLV","DIN_277","ESTIMATED","UNKNOWN"].includes(basis))return invalid("Bitte eine gültige Wohnflächengrundlage wählen.");
    const heritable=text(fd,"heritable_building_right")==="yes";
    const interval=text(fd,"ground_rent_interval");
    if(interval&&!["ANNUAL","QUARTERLY","MONTHLY"].includes(interval))return invalid("Ungültiger Zahlungsrhythmus für den Erbbauzins.");
    const area=numOrNull(fd,"registered_area_sqm");
    if(typeof area==="number"&&!Number.isFinite(area))return invalid("Ungültige Grundstücksgröße laut Grundbuch.");
    const rent=numOrNull(fd,"ground_rent_amount");
    if(typeof rent==="number"&&!Number.isFinite(rent))return invalid("Ungültiger Erbbauzins.");
    const reviewedOn=dateOrNull(fd,"reviewed_on");
    const payload:Record<string,unknown>={
      property_id:propertyId,
      land_registry_court:text(fd,"land_registry_court")||null,
      land_register_sheet:text(fd,"land_register_sheet")||null,
      cadastral_district:text(fd,"cadastral_district")||null,
      parcel_section:text(fd,"parcel_section")||null,
      parcel_number:text(fd,"parcel_number")||null,
      registered_area_sqm:area,
      co_ownership_share:text(fd,"co_ownership_share")||null,
      extract_dated_on:dateOrNull(fd,"extract_dated_on"),
      living_area_basis:basis,
      heritable_building_right:heritable,
      ground_rent_amount:heritable?rent:null,
      ground_rent_interval:heritable?(interval||null):null,
      ground_lease_until:heritable?dateOrNull(fd,"ground_lease_until"):null,
      ground_lessor_contact_id:heritable?(text(fd,"ground_lessor_contact_id")||null):null,
      ground_lessor_name:heritable?(text(fd,"ground_lessor_name")||null):null,
      monument_protection:text(fd,"monument_protection")==="yes",
      monument_protection_note:text(fd,"monument_protection_note")||null,
      milieu_protection:text(fd,"milieu_protection")==="yes",
      milieu_protection_note:text(fd,"milieu_protection_note")||null,
      redevelopment_area:text(fd,"redevelopment_area")==="yes",
      redevelopment_area_note:text(fd,"redevelopment_area_note")||null,
      contamination_suspicion:text(fd,"contamination_suspicion")==="yes",
      contamination_suspicion_note:text(fd,"contamination_suspicion_note")||null,
      development_charges_open:text(fd,"development_charges_open")==="yes",
      development_charges_note:text(fd,"development_charges_note")||null,
      legal_notes:text(fd,"legal_notes")||null,
      reviewed_on:reviewedOn,
      reviewed_by:reviewedOn?userId:null,
      updated_by:userId,
    };
    const legalId=text(fd,"legal_id");
    if(legalId){
      const {data:updated,error}=await supabase.from("property_legal_data").update(payload).eq("id",legalId).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
      if(error)return fail(error);
      if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("property_legal_data").insert({...payload,created_by:userId});
      if(error)return fail(error);
    }
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="encumbrance_save"){
    const section=text(fd,"section");
    if(!SECTION_KEYS.includes(section))return invalid("Bitte eine gültige Abteilung wählen.");
    const kind=text(fd,"kind");
    if(!KINDS[section][kind])return invalid("Die gewählte Art passt nicht zur gewählten Abteilung.");
    const deletable=text(fd,"deletable");
    if(!["YES","NO","UNCLEAR"].includes(deletable))return invalid("Ungültige Angabe zur Löschbarkeit.");
    const impact=text(fd,"sale_impact");
    if(!["NONE","TRANSFERS_TO_BUYER","MUST_BE_DELETED","PURCHASE_PRICE_RELEVANT","UNCLEAR"].includes(impact))return invalid("Ungültige Angabe zur Auswirkung auf den Verkauf.");
    if(!text(fd,"content"))return invalid("Der Inhalt des Eintrags ist erforderlich.");
    const rank=intOrNull(fd,"rank_position");
    if(typeof rank==="number"&&!Number.isFinite(rank))return invalid("Ungültiger Rang.");
    const nominal=numOrNull(fd,"nominal_amount");
    if(typeof nominal==="number"&&!Number.isFinite(nominal))return invalid("Ungültiger Nennbetrag.");
    const remaining=numOrNull(fd,"remaining_amount");
    if(typeof remaining==="number"&&!Number.isFinite(remaining))return invalid("Ungültige Restvaluta.");
    const isThird=section==="LAND_REGISTER_III";
    const payload:Record<string,unknown>={
      property_id:propertyId,
      section,
      kind,
      rank_position:rank,
      beneficiary_contact_id:text(fd,"beneficiary_contact_id")||null,
      beneficiary_name:text(fd,"beneficiary_name")||null,
      authority:text(fd,"authority")||null,
      reference:text(fd,"reference")||null,
      content:text(fd,"content"),
      nominal_amount:isThird?nominal:null,
      remaining_amount:isThird?remaining:null,
      deletable,
      deletion_consent_available:isThird&&text(fd,"deletion_consent_available")==="yes",
      sale_impact:impact,
      registered_on:dateOrNull(fd,"registered_on"),
      deleted_on:dateOrNull(fd,"deleted_on"),
      notes:text(fd,"notes")||null,
      updated_by:userId,
    };
    const encumbranceId=text(fd,"encumbrance_id");
    if(encumbranceId){
      const {data:updated,error}=await supabase.from("property_encumbrances").update(payload).eq("id",encumbranceId).eq("version",Number(text(fd,"encumbrance_version"))).select("id").maybeSingle();
      if(error)return fail(error);
      if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("property_encumbrances").insert({...payload,created_by:userId});
      if(error)return fail(error);
    }
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="encumbrance_archive"||intent==="encumbrance_restore"){
    await requirePermission(request,context.cloudflare.env,"property.archive");
    const {data:updated,error}=await supabase.from("property_encumbrances")
      .update({archived_at:intent==="encumbrance_archive"?new Date().toISOString():null})
      .eq("id",text(fd,"encumbrance_id")).eq("version",Number(text(fd,"encumbrance_version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect(back,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

export function legalWarnings(legal:any,encumbrances:any[]){
  const warnings:string[]=[];
  const open=encumbrances.filter(isOpenBurden);
  if(!legal)warnings.push("Für diese Immobilie sind keine Grundbuchdaten erfasst.");
  else{
    if(!legal.land_registry_court||!legal.land_register_sheet)warnings.push("Amtsgericht oder Grundbuchblatt fehlen.");
    if(!legal.extract_dated_on)warnings.push("Es ist nicht dokumentiert, von wann der Grundbuchauszug stammt.");
    else if(legal.extract_dated_on<new Date(Date.now()-365*864e5).toISOString().slice(0,10))warnings.push("Der Grundbuchauszug ist älter als ein Jahr.");
    if(legal.living_area_basis==="UNKNOWN")warnings.push("Die Grundlage der Wohnflächenangabe ist nicht dokumentiert.");
    if(legal.heritable_building_right&&!legal.ground_lease_until)warnings.push("Beim Erbbaurecht fehlt das Ende der Laufzeit.");
    if(legal.contamination_suspicion)warnings.push("Es besteht ein Altlastenverdacht — offenbarungsrelevant gegenüber Kaufinteressenten.");
    if(legal.development_charges_open)warnings.push("Erschließungsbeiträge sind als offen erfasst.");
  }
  const secondUndeleted=open.filter((row)=>row.section==="LAND_REGISTER_II"&&row.deletable!=="YES");
  if(secondUndeleted.length)warnings.push(`${secondUndeleted.length} nicht gelöschte${secondUndeleted.length===1?"s Recht":" Rechte"} in Abteilung II.`);
  const openThird=open.filter((row)=>row.section==="LAND_REGISTER_III"&&!row.deletion_consent_available);
  if(openThird.length)warnings.push(`${openThird.length} Grundpfandrecht${openThird.length===1?"":"e"} ohne vorliegende Löschungsbewilligung.`);
  if(open.some((row)=>row.sale_impact==="UNCLEAR"))warnings.push("Bei mindestens einem Eintrag ist die Auswirkung auf den Verkauf noch nicht geklärt.");
  return warnings;
}

function EncumbranceForm({row,section,contacts,disabled,formKey}:{row?:any;section:string;contacts:any[];disabled:boolean;formKey:string}){
  const isThird=section==="LAND_REGISTER_III";
  return <Form method="post" className="editor-card" style={{marginTop:"1rem"}} key={formKey}>
    <input type="hidden" name="_intent" value="encumbrance_save"/>
    <input type="hidden" name="section" value={section}/>
    {row?<input type="hidden" name="encumbrance_id" value={row.id}/>:null}
    {row?<input type="hidden" name="encumbrance_version" value={row.version}/>:null}
    <div className="card-head"><div><p className="eyebrow">{row?"Bestehender Eintrag":"Neuer Eintrag"}</p><h3>{row?`${KINDS[section][row.kind]??row.kind}${row.rank_position?` · Rang ${row.rank_position}`:""}`:`${SECTION[section]} erfassen`}</h3></div></div>
    <div className="form-grid">
      <label className="form-field"><span>Art *</span><select name="kind" defaultValue={row?.kind??Object.keys(KINDS[section])[0]} required disabled={disabled}>{Object.entries(KINDS[section]).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="form-field"><span>Rang</span><input name="rank_position" type="number" min={1} step={1} defaultValue={row?.rank_position??""} disabled={disabled}/></label>
      <label className="form-field"><span>Berechtigter · Kontakt</span><select name="beneficiary_contact_id" defaultValue={row?.beneficiary_contact_id??""} disabled={disabled}><option value="">—</option>{contacts.map((contact:any)=><option value={contact.id} key={contact.id}>{contactLabel(contact)} · {contact.contact_number}</option>)}</select></label>
      <label className="form-field"><span>Berechtigter · Freitext</span><input name="beneficiary_name" defaultValue={row?.beneficiary_name??""} placeholder={isThird?"z. B. Sparkasse":"z. B. Name des Berechtigten"} disabled={disabled}/></label>
      <label className="form-field"><span>Zuständige Behörde</span><input name="authority" defaultValue={row?.authority??""} placeholder={section==="BUILDING_ENCUMBRANCE"?"Bauaufsichtsbehörde":"—"} disabled={disabled}/></label>
      <label className="form-field"><span>Laufende Nummer / Aktenzeichen</span><input name="reference" defaultValue={row?.reference??""} disabled={disabled}/></label>
      {isThird?<label className="form-field"><span>Nennbetrag € *</span><input name="nominal_amount" inputMode="decimal" defaultValue={row?.nominal_amount??""} required disabled={disabled}/></label>:null}
      {isThird?<label className="form-field"><span>Restvaluta €</span><input name="remaining_amount" inputMode="decimal" defaultValue={row?.remaining_amount??""} disabled={disabled}/><small className="subtle">Aktueller Stand laut Gläubiger.</small></label>:null}
      <label className="form-field"><span>Löschbar</span><select name="deletable" defaultValue={row?.deletable??"UNCLEAR"} disabled={disabled}>{Object.entries(DELETABLE).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      {isThird?<label className="form-field"><span>Löschungsbewilligung liegt vor</span><select name="deletion_consent_available" defaultValue={row?.deletion_consent_available?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select></label>:null}
      <label className="form-field"><span>Auswirkung auf den Verkauf</span><select name="sale_impact" defaultValue={row?.sale_impact??"UNCLEAR"} disabled={disabled}>{Object.entries(SALE_IMPACT).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><small className="subtle">Eigene Einschätzung, keine Rechtsauskunft.</small></label>
      <label className="form-field"><span>Eingetragen am</span><input name="registered_on" type="date" defaultValue={row?.registered_on??""} max={today()} disabled={disabled}/></label>
      <label className="form-field"><span>Gelöscht am</span><input name="deleted_on" type="date" defaultValue={row?.deleted_on??""} max={today()} disabled={disabled}/><small className="subtle">Leer lassen, solange der Eintrag besteht.</small></label>
    </div>
    <label className="form-field full-width"><span>Inhalt des Eintrags *</span><textarea name="content" rows={3} defaultValue={row?.content??""} required disabled={disabled} placeholder="Wortlaut bzw. Zusammenfassung des Eintrags"/></label>
    <label className="form-field full-width"><span>Interne Notiz</span><textarea name="notes" rows={2} defaultValue={row?.notes??""} disabled={disabled}/></label>
    <div className="form-actions"><button className="primary-button" type="submit" disabled={disabled}>{row?"Eintrag speichern":"Eintrag anlegen"}</button></div>
  </Form>;
}

export default function PropertyLegal(){
  const d=useLoaderData<typeof loader>();
  const r=useActionData<typeof action>();
  const legal=d.legal as any;
  const encumbrances=d.encumbrances as any[];
  const locked=!d.canWrite;
  const warnings=legalWarnings(legal,encumbrances);
  const heritable=Boolean(legal?.heritable_building_right);
  const open=encumbrances.filter(isOpenBurden);
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to={`/properties/${d.property.id}`}>← Objektakte</Link><p className="eyebrow">{d.property.property_number}</p><h1 className="editor-title">Recht & Lasten</h1><p className="editor-meta">{d.property.internal_title}</p></div><div className="header-actions"><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div></header>

    {r?.error?<div className="form-error">{r.error}</div>:null}
    <div className="form-warning"><strong>Erfassung, keine rechtliche Bewertung.</strong> Das System bildet ab, was im Grundbuch, im Baulastenverzeichnis und in den öffentlich-rechtlichen Auskünften steht. Es prüft nicht, ob ein Recht wirksam ist oder wie es sich auf den Verkauf auswirkt. Keine dieser Angaben gelangt in die öffentliche Veröffentlichung.</div>

    <section className="metric-grid">
      <article className="metric-card"><span>Abteilung II</span><strong>{open.filter((row)=>row.section==="LAND_REGISTER_II").length}</strong><small>bestehende Rechte und Beschränkungen</small></article>
      <article className="metric-card"><span>Abteilung III</span><strong>{open.filter((row)=>row.section==="LAND_REGISTER_III").length}</strong><small>{money(open.filter((row)=>row.section==="LAND_REGISTER_III").reduce((sum,row)=>sum+Number(row.remaining_amount??row.nominal_amount??0),0))} offen</small></article>
      <article className="metric-card"><span>Baulasten</span><strong>{open.filter((row)=>row.section==="BUILDING_ENCUMBRANCE").length}</strong><small>eingetragene Baulasten</small></article>
      <article className="metric-card"><span>Erbbaurecht</span><strong>{heritable?"Ja":"Nein"}</strong><small>{heritable&&legal?.ground_lease_until?`bis ${formatDate(legal.ground_lease_until)}`:"kein Erbbaurecht erfasst"}</small></article>
      <article className="metric-card"><span>Auszug vom</span><strong>{legal?.extract_dated_on?formatDate(legal.extract_dated_on):"—"}</strong><small>Stand der Grundbuchdaten</small></article>
    </section>

    {warnings.length?<div className="form-warning"><strong>Offene Punkte</strong><ul>{warnings.map((warning)=><li key={warning}>{warning}</li>)}</ul></div>:<div className="form-success">Grundbuchdaten und Belastungen sind vollständig erfasst und bewertet.</div>}

    <section className="editor-card"><div className="card-head"><div><p className="eyebrow">Rechtsobjekt</p><h2>Grundbuch, Erbbaurecht und öffentliches Recht</h2></div>{legal?<span className="status-pill">Version {legal.version}</span>:<span className="status-pill status-draft">Noch nicht erfasst</span>}</div>
      <Form method="post">
        <input type="hidden" name="_intent" value="legal_save"/>
        {legal?<input type="hidden" name="legal_id" value={legal.id}/>:null}
        {legal?<input type="hidden" name="version" value={legal.version}/>:null}
        <div className="form-grid">
          <label className="form-field"><span>Amtsgericht</span><input name="land_registry_court" defaultValue={legal?.land_registry_court??""} disabled={locked}/></label>
          <label className="form-field"><span>Grundbuch von / Blatt</span><input name="land_register_sheet" defaultValue={legal?.land_register_sheet??""} disabled={locked}/></label>
          <label className="form-field"><span>Gemarkung</span><input name="cadastral_district" defaultValue={legal?.cadastral_district??""} disabled={locked}/></label>
          <label className="form-field"><span>Flur</span><input name="parcel_section" defaultValue={legal?.parcel_section??""} disabled={locked}/></label>
          <label className="form-field"><span>Flurstück</span><input name="parcel_number" defaultValue={legal?.parcel_number??""} disabled={locked}/></label>
          <label className="form-field"><span>Größe laut Grundbuch m²</span><input name="registered_area_sqm" inputMode="decimal" defaultValue={legal?.registered_area_sqm??""} disabled={locked}/><small className="subtle">Vermarktungsangabe: {d.property.plot_area_sqm??"—"} m²</small></label>
          <label className="form-field"><span>Miteigentumsanteil</span><input name="co_ownership_share" defaultValue={legal?.co_ownership_share??""} placeholder="z. B. 127/1000" disabled={locked}/></label>
          <label className="form-field"><span>Auszug vom</span><input name="extract_dated_on" type="date" defaultValue={legal?.extract_dated_on??""} max={today()} disabled={locked}/></label>
          <label className="form-field"><span>Grundlage der Wohnfläche</span><select name="living_area_basis" defaultValue={legal?.living_area_basis??"UNKNOWN"} disabled={locked}>{Object.entries(AREA_BASIS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><small className="subtle">Ausgewiesen: {d.property.living_area_sqm??"—"} m²</small></label>
          <label className="form-field"><span>Geprüft am</span><input name="reviewed_on" type="date" defaultValue={legal?.reviewed_on??""} max={today()} disabled={locked}/><small className="subtle">Wird auf den angemeldeten Benutzer gebucht.</small></label>
        </div>

        <div className="card-head" style={{marginTop:"1.25rem"}}><div><p className="eyebrow">Erbbaurecht</p><h3>Bestehendes Erbbaurecht</h3></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Erbbaurecht besteht</span><select name="heritable_building_right" defaultValue={heritable?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select><small className="subtle">Die folgenden Felder werden nur bei „Ja“ gespeichert.</small></label>
          <label className="form-field"><span>Erbbauzins €</span><input name="ground_rent_amount" inputMode="decimal" defaultValue={legal?.ground_rent_amount??""} disabled={locked}/></label>
          <label className="form-field"><span>Zahlungsrhythmus</span><select name="ground_rent_interval" defaultValue={legal?.ground_rent_interval??""} disabled={locked}><option value="">—</option>{Object.entries(INTERVAL).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
          <label className="form-field"><span>Laufzeit bis</span><input name="ground_lease_until" type="date" defaultValue={legal?.ground_lease_until??""} disabled={locked}/></label>
          <label className="form-field"><span>Erbbaurechtsgeber · Kontakt</span><select name="ground_lessor_contact_id" defaultValue={legal?.ground_lessor_contact_id??""} disabled={locked}><option value="">—</option>{d.contacts.map((contact:any)=><option value={contact.id} key={contact.id}>{contactLabel(contact)} · {contact.contact_number}</option>)}</select></label>
          <label className="form-field"><span>Erbbaurechtsgeber · Freitext</span><input name="ground_lessor_name" defaultValue={legal?.ground_lessor_name??""} placeholder="z. B. Kirchengemeinde, Kommune" disabled={locked}/></label>
        </div>

        <div className="card-head" style={{marginTop:"1.25rem"}}><div><p className="eyebrow">Öffentliches Recht</p><h3>Beschränkungen und Auskünfte</h3></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Denkmalschutz</span><select name="monument_protection" defaultValue={legal?.monument_protection?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Notiz Denkmalschutz</span><input name="monument_protection_note" defaultValue={legal?.monument_protection_note??""} disabled={locked}/></label>
          <label className="form-field"><span>Milieuschutz</span><select name="milieu_protection" defaultValue={legal?.milieu_protection?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Notiz Milieuschutz</span><input name="milieu_protection_note" defaultValue={legal?.milieu_protection_note??""} disabled={locked}/></label>
          <label className="form-field"><span>Sanierungsgebiet</span><select name="redevelopment_area" defaultValue={legal?.redevelopment_area?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Notiz Sanierungsgebiet</span><input name="redevelopment_area_note" defaultValue={legal?.redevelopment_area_note??""} disabled={locked}/></label>
          <label className="form-field"><span>Altlastenverdacht</span><select name="contamination_suspicion" defaultValue={legal?.contamination_suspicion?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Notiz Altlasten</span><input name="contamination_suspicion_note" defaultValue={legal?.contamination_suspicion_note??""} placeholder="Auskunft, Datum, Ergebnis" disabled={locked}/></label>
          <label className="form-field"><span>Erschließungsbeiträge offen</span><select name="development_charges_open" defaultValue={legal?.development_charges_open?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Notiz Erschließungsbeiträge</span><input name="development_charges_note" defaultValue={legal?.development_charges_note??""} disabled={locked}/></label>
        </div>
        <label className="form-field full-width"><span>Interne Notizen zur Rechtslage</span><textarea name="legal_notes" rows={4} defaultValue={legal?.legal_notes??""} disabled={locked}/></label>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={locked}>{legal?"Rechtsdaten speichern":"Rechtsdaten anlegen"}</button></div>
      </Form>
    </section>

    {SECTION_KEYS.map((section)=>{
      const rows=encumbrances.filter((row)=>row.section===section);
      return <section className="data-card" id={section.toLowerCase()} key={section}>
        <div className="card-head"><div><p className="eyebrow">{SECTION_SHORT[section]}</p><h2>{SECTION[section]}</h2></div><span className="subtle">{rows.filter(isOpenBurden).length} bestehend · {rows.length} erfasst</span></div>
        {rows.length===0?<p className="empty-state">Keine Einträge erfasst.</p>:<div className="data-list">
          {rows.map((row:any)=>{const contact=one(row.contacts);const beneficiary=contactLabel(contact)||row.beneficiary_name||row.authority||"—";return <div className="data-row" key={row.id}>
            <div><strong>{row.rank_position?`Rang ${row.rank_position} · `:""}{KINDS[section][row.kind]??row.kind}</strong><small>{beneficiary}{row.reference?` · ${row.reference}`:""}{row.registered_on?` · eingetragen ${formatDate(row.registered_on)}`:""}</small></div>
            <div className="row-meta"><span>{row.content.length>90?`${row.content.slice(0,90)}…`:row.content}</span>{section==="LAND_REGISTER_III"?<small>{money(row.nominal_amount)} nominal{row.remaining_amount!==null&&row.remaining_amount!==undefined?` · ${money(row.remaining_amount)} offen`:""}</small>:null}</div>
            <div className="row-meta">
              {row.deleted_on?<span className="status-pill status-sold">Gelöscht {formatDate(row.deleted_on)}</span>:row.archived_at?<span className="status-pill status-archived">Archiviert</span>:<span className={`status-pill ${row.deletable==="NO"?"status-lost":row.deletable==="YES"?"status-marketing":"status-draft"}`}>{DELETABLE[row.deletable]}</span>}
              <small>{SALE_IMPACT[row.sale_impact]}{section==="LAND_REGISTER_III"?row.deletion_consent_available?" · Bewilligung liegt vor":" · Bewilligung offen":""}</small>
            </div>
            {d.canArchive?<Form method="post"><input type="hidden" name="_intent" value={row.archived_at?"encumbrance_restore":"encumbrance_archive"}/><input type="hidden" name="encumbrance_id" value={row.id}/><input type="hidden" name="encumbrance_version" value={row.version}/><button className="secondary-button" type="submit">{row.archived_at?"Wiederherstellen":"Archivieren"}</button></Form>:null}
          </div>;})}
        </div>}
        {rows.map((row:any)=><EncumbranceForm key={`f-${row.id}`} formKey={`f-${row.id}`} row={row} section={section} contacts={d.contacts} disabled={locked||Boolean(row.archived_at)}/>)}
        {d.canWrite?<EncumbranceForm formKey={`new-${section}`} section={section} contacts={d.contacts} disabled={false}/>:null}
      </section>;
    })}

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Vor produktiver Nutzung</p><h2>Anwaltlich abzunehmen</h2></div></div>
      <ul className="subtle">
        <li>Welche Angaben aus Grundbuch und Baulastenverzeichnis gegenüber Kaufinteressenten offenbart werden müssen und wann.</li>
        <li>Ob und wie ein Altlastenverdacht mitgeteilt werden muss und welche Haftung an einem Verschweigen hängt.</li>
        <li>Wie ein bestehendes Wohnrecht oder ein Nießbrauch im Exposé und im Kaufvertrag darzustellen ist.</li>
        <li>Ob die erfassten Einschätzungen zur Auswirkung auf den Verkauf gegenüber Dritten verwendet werden dürfen.</li>
        <li>Welche Aufbewahrungsfrist für Grundbuchauszüge und Behördenauskünfte gilt.</li>
      </ul>
    </section>
  </main>;
}
