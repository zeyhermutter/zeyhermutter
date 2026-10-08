import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/measurement-detail";
import { requirePermission } from "~/lib/auth.server";
import { crmIsoToLocalDateTime as isoNachLokal, crmLocalDateTimeToIso as lokalNachIso } from "~/lib/local-time";
import { euroGenau as money, flaeche, tag as formatDate, zeitpunkt } from "~/lib/format";
import {
  AUFGABENSTATUS, AUFMASSPAKET as PAKET, AUFMASSSTATUS as STATUS, AUFTRAGSQUELLE as QUELLE,
  DOKUMENTKATEGORIE, FLAECHENSTANDARD, beschrifte,
} from "~/lib/labels";
import { IMMOBILIENARTEN } from "~/lib/public-intake";
import { LeerOderFehler } from "~/components/leer-oder-fehler";

// Die Akte eines Aufmass-Auftrags.
//
// DIE UEBERNAHME IST DER EIGENTLICHE PUNKT
//
// Ein Aufmass endet nicht mit einer PDF-Datei, sondern mit einer Zahl, die
// anschliessend im Expose, in der Veroeffentlichung und bei der Bank steht.
// Diese Zahl landet nur dann in der Objektakte, wenn jemand sie dorthin
// traegt -- und genau das macht der Knopf "In die Objektakte uebernehmen":
// er schreibt die gemessene Wohnflaeche nach properties.living_area_sqm und
// die Grundlage nach property_legal_data.living_area_basis.
//
// Warum das kein Trigger ist, steht in der Migration. Kurz: die Wohnflaeche
// einer Immobilie stillschweigend zu aendern, waehrend jemand einen Auftrag
// abhakt, waere eine Nebenwirkung, die spaeter niemand mehr zuordnet.

type ActionResult={error?:string;ok?:string};

const STATUS_CLASS: Record<string,string> = {DRAFT:"status-draft",REQUESTED:"status-open",OFFERED:"status-valuation",ACCEPTED:"status-marketing",SCHEDULED:"status-preparation",MEASURED:"status-notary",DELIVERED:"status-ready",INVOICED:"status-reserved",PAID:"status-sold",CANCELLED:"status-archived"};

/** Welche Flaechengrundlage ein Aufmass in die Objektakte schreibt. */
const GRUNDLAGE_JE_STANDARD: Record<string,string> = {WOFLV:"WOFLV",DIN_277:"DIN_277",BOTH:"WOFLV"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dezimal(fd:FormData,key:string){const roh=text(fd,key).replace(",",".");if(!roh)return null;const wert=Number(roh);return Number.isFinite(wert)?wert:NaN;}
function ganzzahl(fd:FormData,key:string){const roh=text(fd,key);if(!roh)return null;const wert=Number(roh);return Number.isInteger(wert)?wert:NaN;}
function heute(){return new Date().toISOString().slice(0,10);}

export function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("INVALID_MEASUREMENT_STATUS_TRANSITION"))return"Dieser Stand lässt sich aus dem aktuellen nicht erreichen.";
  if(message.includes("MEASUREMENT_MEASURED_DATE_REQUIRED"))return"Für „Aufgemessen“ wird das Datum des Aufmaßes benötigt.";
  if(message.includes("MEASUREMENT_DELIVERY_DATE_REQUIRED"))return"Für „Geliefert“ und alles danach wird das Lieferdatum benötigt.";
  if(message.includes("MEASUREMENT_INVOICE_DETAILS_REQUIRED"))return"Zum Abrechnen werden Honorar und Rechnungsdatum benötigt.";
  if(message.includes("MEASUREMENT_PAYMENT_DATE_REQUIRED"))return"Für „Bezahlt“ wird das Zahlungsdatum benötigt.";
  if(message.includes("MEASUREMENT_AREA_REQUIRED_FOR_STANDARD"))return"Eine Flächengrundlage ohne Flächenangabe ergibt keine Aussage — bitte Wohn- oder Nutzfläche eintragen.";
  if(message.includes("MEASUREMENT_RESPONSIBLE_USER_INACTIVE"))return"Der ausgewählte Verantwortliche ist nicht aktiv.";
  if(message.includes("MEASUREMENT_PROPERTY_NOT_FOUND"))return"Die gewählte Immobilie wurde nicht gefunden.";
  if(message.includes("MEASUREMENT_CONTACT_NOT_FOUND"))return"Der gewählte Kunde wurde nicht gefunden.";
  if(message.includes("MEASUREMENT_NUMBER_IMMUTABLE"))return"Die Auftragsnummer kann nicht geändert werden.";
  if(message.includes("ARCHIVED_MEASUREMENT_IMMUTABLE"))return"Ein archivierter Auftrag kann inhaltlich nicht mehr geändert werden.";
  if(message.includes("measurement_orders_zuordnung_check"))return"Immobilie oder Kunde — mindestens eines von beidem muss gesetzt bleiben.";
  if(message.includes("measurement_orders_delivery_order_check"))return"Das Lieferdatum darf nicht vor dem Aufmaß liegen.";
  if(message.includes("measurement_orders_payment_order_check"))return"Das Zahlungsdatum darf nicht vor dem Rechnungsdatum liegen.";
  if(message.includes("measurement_orders_object_postal_code_check"))return"Die Postleitzahl des Objekts besteht aus fünf Ziffern.";
  if(message.includes("measurement.archive"))return"Zum Archivieren fehlt die Berechtigung.";
  return "Die Änderung konnte nicht gespeichert werden.";
}

/** Was auffällt, ohne dass die Datenbank es verbieten würde. */
export function warnings(row:any,unterlagen:any[]){
  const list:string[]=[];
  if(["ACCEPTED","SCHEDULED"].includes(row.status)&&!row.appointment_at&&row.service_package!=="FLOOR_PLAN_REFRESH")list.push("Der Auftrag ist beauftragt, es ist aber kein Aufmaßtermin hinterlegt.");
  if(row.status==="SCHEDULED"&&row.appointment_at&&row.appointment_at<new Date().toISOString())list.push("Der hinterlegte Aufmaßtermin liegt in der Vergangenheit, der Auftrag steht aber noch auf „Termin vereinbart“.");
  if(row.status==="DELIVERED"&&unterlagen.length===0)list.push("Der Auftrag gilt als geliefert, in der Akte hängt aber keine Unterlage.");
  if(["DELIVERED","INVOICED","PAID"].includes(row.status)&&row.area_standard!=="NONE"&&!row.measured_living_area_sqm&&!row.measured_usable_area_sqm)list.push("Eine Flächengrundlage ist gewählt, aber keine Fläche eingetragen.");
  if(row.status==="INVOICED"&&row.invoiced_on&&row.invoiced_on<new Date(Date.now()-30*864e5).toISOString().slice(0,10)&&!row.paid_on)list.push("Die Rechnung liegt mehr als 30 Tage zurück und ist nicht als bezahlt vermerkt.");
  if(!row.property_id&&!row.object_city)list.push("Zum Auftrag ist weder eine Objektakte noch ein Ort hinterlegt — der Termin lässt sich so nicht planen.");
  return list;
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"measurement.read");
  const id=params.orderId!;
  const {data:row,error}=await supabase.from("measurement_orders").select("*,properties(id,property_number,internal_title,status,living_area_sqm,version),contacts(id,contact_number,first_name,last_name,email)").eq("id",id).maybeSingle();
  if(error||!row)throw new Response("Aufmaß-Auftrag nicht gefunden.",{status:404,headers:responseHeaders()});
  const property=one(row.properties);
  const [{data:transitions,error:transitionsFehler},{data:unterlagen,error:unterlagenFehler},{data:tasks,error:tasksFehler},{data:objektDokumente},{data:legal},{data:contacts},{data:properties},{data:profiles},{data:canWrite},{data:canArchive},{data:canTask},{data:canProperty},{data:canAudit}]=await Promise.all([
    supabase.from("measurement_order_status_transitions").select("to_status,description").eq("from_status",row.status).order("to_status"),
    supabase.from("measurement_order_documents").select("id,document_id,note,created_at,documents(id,title,category,classification)").eq("order_id",id).order("created_at"),
    supabase.from("tasks").select("id,task_number,title,status,due_at").eq("measurement_order_id",id).is("archived_at",null).order("due_at"),
    property?supabase.from("documents").select("id,title,category").eq("property_id",property.id).is("archived_at",null).order("created_at",{ascending:false}).limit(200):Promise.resolve({data:[]}),
    property?supabase.from("property_legal_data").select("id,version,living_area_basis").eq("property_id",property.id).maybeSingle():Promise.resolve({data:null}),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("properties").select("id,property_number,internal_title").neq("status","ARCHIVED").order("updated_at",{ascending:false}).limit(500),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.rpc("current_user_has_permission",{p_permission:"measurement.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"measurement.archive"}),
    supabase.rpc("current_user_has_permission",{p_permission:"task.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"property.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"audit.read"}),
  ]);
  let audit:any[]=[];
  if(canAudit===true){
    const result=await supabase.from("audit_events").select("id,occurred_at,actor_display_name_snapshot,action,field_changes,entity_type").eq("entity_type","MEASUREMENT_ORDER").eq("entity_id",id).order("occurred_at",{ascending:false}).limit(60);
    if(!result.error)audit=result.data??[];
  }
  return data({
    ladefehler:[transitionsFehler&&"transitions",unterlagenFehler&&"unterlagen",tasksFehler&&"tasks"].filter(Boolean) as string[],
    row,profile,transitions:transitions??[],unterlagen:unterlagen??[],tasks:tasks??[],objektDokumente:objektDokumente??[],
    legal:legal??null,contacts:contacts??[],properties:properties??[],profiles:profiles??[],
    canWrite:canWrite===true,canArchive:canArchive===true,canTask:canTask===true,canProperty:canProperty===true,audit,
  },{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"measurement.write");
  const id=params.orderId!,fd=await request.formData(),intent=text(fd,"_intent");
  const fail=(message:string,status=400)=>data<ActionResult>({error:message},{status,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Der Auftrag wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});
  const back=(hash="")=>redirect(`/measurements/${id}${hash}`,{headers:responseHeaders()});

  const mitVersion=["update","termine","ergebnis","honorar","status","archive","restore"];
  let version=0;
  if(mitVersion.includes(intent)){
    version=Number(text(fd,"version"));
    if(!Number.isInteger(version)||version<1)return fail("Ungültige Datensatzversion.");
  }
  const speichere=async(update:Record<string,unknown>,hash="")=>{
    const {data:updated,error}=await supabase.from("measurement_orders").update(update).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return fail(errorMessage(error));
    if(!updated)return conflict();
    return back(hash);
  };

  if(intent==="update"){
    const plz=text(fd,"object_postal_code");
    if(plz&&!/^\d{5}$/.test(plz))return fail("Die Postleitzahl des Objekts besteht aus fünf Ziffern.");
    const propertyId=text(fd,"property_id"),contactId=text(fd,"contact_id");
    if(!propertyId&&!contactId)return fail("Immobilie oder Kunde — mindestens eines von beidem muss gesetzt bleiben.");
    const flaecheRoh=dezimal(fd,"approx_area_sqm");
    if(flaecheRoh!==null&&(Number.isNaN(flaecheRoh)||flaecheRoh<=0))return fail("Die ungefähre Fläche muss eine Zahl größer als null sein.");
    const geschosse=ganzzahl(fd,"floor_count");
    if(geschosse!==null&&(Number.isNaN(geschosse)||geschosse<1||geschosse>20))return fail("Die Zahl der Geschosse liegt zwischen 1 und 20.");
    return speichere({
      service_package:text(fd,"service_package"),
      property_id:propertyId||null,
      contact_id:contactId||null,
      object_street:text(fd,"object_street")||null,
      object_house_number:text(fd,"object_house_number")||null,
      object_postal_code:plz||null,
      object_city:text(fd,"object_city")||null,
      property_type:text(fd,"property_type")||null,
      approx_area_sqm:flaecheRoh,
      floor_count:geschosse,
      source:text(fd,"source"),
      customer_message:text(fd,"customer_message")||null,
      internal_notes:text(fd,"internal_notes")||null,
      primary_responsible_user:text(fd,"primary_responsible_user"),
    });
  }

  if(intent==="termine"){
    const terminRoh=text(fd,"appointment_at");
    const termin=terminRoh?lokalNachIso(terminRoh):null;
    if(terminRoh&&!termin)return fail("Der Aufmaßtermin ist kein gültiger Zeitpunkt.");
    const gemessen=text(fd,"measured_on"),geliefert=text(fd,"delivered_on");
    if(gemessen&&geliefert&&geliefert<gemessen)return fail("Das Lieferdatum darf nicht vor dem Aufmaß liegen.");
    return speichere({
      requested_on:text(fd,"requested_on")||heute(),
      appointment_at:termin,
      measured_on:gemessen||null,
      delivered_on:geliefert||null,
    },"#termine");
  }

  if(intent==="ergebnis"){
    const standard=text(fd,"area_standard");
    if(!Object.hasOwn(FLAECHENSTANDARD,standard))return fail("Bitte eine gültige Flächengrundlage auswählen.");
    const wohn=dezimal(fd,"measured_living_area_sqm"),nutz=dezimal(fd,"measured_usable_area_sqm");
    if(wohn!==null&&(Number.isNaN(wohn)||wohn<=0))return fail("Die Wohnfläche muss eine Zahl größer als null sein.");
    if(nutz!==null&&(Number.isNaN(nutz)||nutz<=0))return fail("Die Nutzfläche muss eine Zahl größer als null sein.");
    return speichere({area_standard:standard,measured_living_area_sqm:wohn,measured_usable_area_sqm:nutz},"#ergebnis");
  }

  if(intent==="honorar"){
    const betrag=dezimal(fd,"fee_amount");
    if(betrag!==null&&(Number.isNaN(betrag)||betrag<0))return fail("Das Honorar muss eine Zahl ab null sein.");
    const rechnung=text(fd,"invoiced_on"),zahlung=text(fd,"paid_on");
    if(rechnung&&zahlung&&zahlung<rechnung)return fail("Das Zahlungsdatum darf nicht vor dem Rechnungsdatum liegen.");
    return speichere({
      fee_amount:betrag,
      fee_basis:text(fd,"fee_basis")||null,
      invoice_reference:text(fd,"invoice_reference")||null,
      invoiced_on:rechnung||null,
      paid_on:zahlung||null,
    },"#honorar");
  }

  if(intent==="status"){
    const next=text(fd,"target_status");
    const update:Record<string,unknown>={status:next};
    if(next==="MEASURED"&&!text(fd,"measured_on_known"))update.measured_on=text(fd,"measured_on")||heute();
    if(next==="DELIVERED"&&!text(fd,"delivered_on_known"))update.delivered_on=text(fd,"delivered_on")||heute();
    if(next==="INVOICED"&&!text(fd,"invoiced_on_known"))update.invoiced_on=text(fd,"invoiced_on")||heute();
    if(next==="PAID"&&!text(fd,"paid_on_known"))update.paid_on=text(fd,"paid_on")||heute();
    return speichere(update,"#status");
  }

  if(intent==="archive"||intent==="restore"){
    await requirePermission(request,context.cloudflare.env,"measurement.archive");
    return speichere({archived_at:intent==="archive"?new Date().toISOString():null},"#status");
  }

  if(intent==="unterlage"){
    const documentId=text(fd,"document_id");
    if(!documentId)return fail("Bitte eine Unterlage auswählen.");
    const {error}=await supabase.from("measurement_order_documents").insert({order_id:id,document_id:documentId,note:text(fd,"note")||null,created_by:userId,updated_by:userId});
    if(error)return fail(String(error.message??"").includes("duplicate")?"Diese Unterlage hängt bereits an dem Auftrag.":"Die Unterlage konnte nicht verknüpft werden.");
    return back("#unterlagen");
  }

  if(intent==="unterlage_entfernen"){
    const {error}=await supabase.from("measurement_order_documents").delete().eq("id",text(fd,"link_id")).eq("order_id",id);
    if(error)return fail("Die Verknüpfung konnte nicht entfernt werden.");
    return back("#unterlagen");
  }

  if(intent==="wiedervorlage"){
    await requirePermission(request,context.cloudflare.env,"task.write");
    const {data:order,error:loadError}=await supabase.from("measurement_orders").select("order_number,property_id,appointment_at,primary_responsible_user").eq("id",id).maybeSingle();
    if(loadError||!order)return fail("Der Auftrag konnte nicht gelesen werden.");
    if(!order.appointment_at)return fail("Für die Wiedervorlage wird zuerst ein Aufmaßtermin benötigt.");
    const {error}=await supabase.from("tasks").insert({
      title:`Aufmaß ausarbeiten · ${order.order_number}`,
      description:"Nach dem Aufmaßtermin: Grundriss zeichnen, Flächen berechnen und die Unterlagen an den Auftrag hängen.",
      status:"OPEN",priority:"NORMAL",
      due_at:new Date(new Date(order.appointment_at).getTime()+3*864e5).toISOString(),
      responsible_user:order.primary_responsible_user,
      property_id:order.property_id,measurement_order_id:id,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail("Die Wiedervorlage konnte nicht angelegt werden.");
    return back("#termine");
  }

  // Die Flaeche in die Objektakte tragen -- ausdruecklich und mit eigener
  // Berechtigung, weil hier ein anderer Datensatz geaendert wird.
  if(intent==="uebernehmen"){
    await requirePermission(request,context.cloudflare.env,"property.write");
    const {data:order,error:loadError}=await supabase.from("measurement_orders").select("property_id,area_standard,measured_living_area_sqm").eq("id",id).maybeSingle();
    if(loadError||!order)return fail("Der Auftrag konnte nicht gelesen werden.");
    if(!order.property_id)return fail("Zu diesem Auftrag gehört keine Immobilie aus dem Bestand.");
    if(!order.measured_living_area_sqm)return fail("Es ist keine gemessene Wohnfläche eingetragen.");
    const grundlage=GRUNDLAGE_JE_STANDARD[order.area_standard];
    if(!grundlage)return fail("Ohne Flächengrundlage (WoFlV oder DIN 277) lässt sich das Ergebnis nicht übernehmen.");

    const {data:property,error:propertyError}=await supabase.from("properties").select("id,version").eq("id",order.property_id).maybeSingle();
    if(propertyError||!property)return fail("Die Immobilie konnte nicht gelesen werden.");
    const {data:propertyUpdated,error:areaError}=await supabase.from("properties").update({living_area_sqm:order.measured_living_area_sqm}).eq("id",property.id).eq("version",property.version).select("id").maybeSingle();
    if(areaError)return fail("Die Wohnfläche konnte in der Objektakte nicht gesetzt werden.");
    if(!propertyUpdated)return fail("Die Immobilie wurde zwischenzeitlich geändert. Bitte Seite neu laden und erneut übernehmen.",409);

    const {data:legal,error:legalError}=await supabase.from("property_legal_data").select("id,version").eq("property_id",property.id).maybeSingle();
    if(legalError)return fail("Die Flächengrundlage konnte nicht gelesen werden.");
    if(legal){
      const {error}=await supabase.from("property_legal_data").update({living_area_basis:grundlage}).eq("id",legal.id).eq("version",legal.version);
      if(error)return fail("Die Flächengrundlage konnte nicht gesetzt werden.");
    }else{
      const {error}=await supabase.from("property_legal_data").insert({property_id:property.id,living_area_basis:grundlage,created_by:userId,updated_by:userId});
      if(error)return fail("Die Flächengrundlage konnte nicht angelegt werden.");
    }
    return back("#ergebnis");
  }

  return fail("Unbekannte Aktion.");
}

export default function MeasurementDetail(){
  const {row,profile,transitions,unterlagen,tasks,objektDokumente,legal,contacts,properties,profiles,canWrite,canArchive,canTask,canProperty,audit,ladefehler}=useLoaderData<typeof loader>();
  const result=useActionData<typeof action>();
  const property=one(row.properties),contact=one(row.contacts);
  const locked=Boolean(row.archived_at),editable=canWrite&&!locked;
  const hinweise=warnings(row,unterlagen);
  const verknuepft=new Set(unterlagen.map((link:any)=>link.document_id));
  const uebernehmbar=Boolean(property&&row.measured_living_area_sqm&&GRUNDLAGE_JE_STANDARD[row.area_standard]);

  return <main className="editor-shell">
    <header className="editor-header"><div>
      <Link className="back-link" to="/measurements">← Aufmaß-Aufträge</Link>
      <p className="eyebrow">{row.order_number} · {QUELLE[row.source]??row.source}</p>
      <div className="property-title-row"><h1 className="editor-title">{PAKET[row.service_package]??row.service_package}</h1><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{locked?"Archiviert":STATUS[row.status]??row.status}</span></div>
      <p className="editor-meta">{property?<>{property.property_number} · {property.internal_title}</>:[ [row.object_street,row.object_house_number].filter(Boolean).join(" "),[row.object_postal_code,row.object_city].filter(Boolean).join(" ")].filter(Boolean).join(", ")||"Objekt noch offen"}{contact?` · ${contact.first_name} ${contact.last_name}`:""} · Version {row.version}</p>
    </div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>

    {result?.error?<div className="form-error">{result.error}</div>:null}
    {hinweise.length?<div className="form-warning"><strong>Das fällt auf:</strong><ul>{hinweise.map((hinweis)=><li key={hinweis}>{hinweis}</li>)}</ul></div>:null}

    <section className="data-card" id="status">
      <div className="card-head"><div><p className="eyebrow">Stand</p><h2>{STATUS[row.status]??row.status}</h2></div></div>
      <p className="subtle">Angefragt am {formatDate(row.requested_on)}{row.delivered_on?` · geliefert am ${formatDate(row.delivered_on)}`:""}{row.paid_on?` · bezahlt am ${formatDate(row.paid_on)}`:""}</p>
      <div className="inline-actions">
        {editable?transitions.map((transition:any)=><Form method="post" key={transition.to_status}>
          <input type="hidden" name="_intent" value="status"/>
          <input type="hidden" name="version" value={row.version}/>
          <input type="hidden" name="target_status" value={transition.to_status}/>
          <button className="secondary-button" type="submit" title={transition.description??undefined}>{STATUS[transition.to_status]??transition.to_status}</button>
        </Form>):null}
        {canArchive?<Form method="post"><input type="hidden" name="_intent" value={locked?"restore":"archive"}/><input type="hidden" name="version" value={row.version}/><button className="secondary-button" type="submit">{locked?"Aus dem Archiv holen":"Archivieren"}</button></Form>:null}
      </div>
      {transitions.length===0?<LeerOderFehler fehler={ladefehler} name="transitions">Aus diesem Stand ist kein weiterer Schritt vorgesehen.</LeerOderFehler>:null}
    </section>

    <section className="editor-card"><div className="card-head"><div><p className="eyebrow">Grunddaten</p><h2>Leistung, Objekt und Kunde</h2></div></div>
      <Form method="post">
        <input type="hidden" name="_intent" value="update"/>
        <input type="hidden" name="version" value={row.version}/>
        <fieldset disabled={!editable}>
          <div className="form-grid">
            <label className="form-field"><span>Leistungspaket</span><select name="service_package" defaultValue={row.service_package}>{Object.entries(PAKET).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Quelle</span><select name="source" defaultValue={row.source}>{Object.entries(QUELLE).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Immobilie aus dem Bestand</span><select name="property_id" defaultValue={row.property_id??""}><option value="">Nicht im eigenen Bestand</option>{properties.map((item:any)=><option key={item.id} value={item.id}>{item.property_number} · {item.internal_title}</option>)}</select></label>
            <label className="form-field"><span>Kunde</span><select name="contact_id" defaultValue={row.contact_id??""}><option value="">Kein Kontakt verknüpft</option>{contacts.map((item:any)=><option key={item.id} value={item.id}>{item.contact_number} · {item.first_name} {item.last_name}</option>)}</select></label>
            <label className="form-field"><span>Immobilienart</span><select name="property_type" defaultValue={row.property_type??""}><option value="">Noch offen</option>{IMMOBILIENARTEN.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Verantwortlich</span><select name="primary_responsible_user" defaultValue={row.primary_responsible_user}>{profiles.map((item:any)=><option key={item.user_id} value={item.user_id}>{item.display_name}</option>)}</select></label>
            <label className="form-field"><span>Straße</span><input name="object_street" defaultValue={row.object_street??""}/></label>
            <label className="form-field"><span>Hausnummer</span><input name="object_house_number" defaultValue={row.object_house_number??""}/></label>
            <label className="form-field"><span>PLZ</span><input name="object_postal_code" inputMode="numeric" maxLength={5} defaultValue={row.object_postal_code??""}/></label>
            <label className="form-field"><span>Ort</span><input name="object_city" defaultValue={row.object_city??""}/></label>
            <label className="form-field"><span>Fläche laut Kunde in m²</span><input name="approx_area_sqm" inputMode="decimal" defaultValue={row.approx_area_sqm??""}/></label>
            <label className="form-field"><span>Geschosse</span><input name="floor_count" inputMode="numeric" maxLength={2} defaultValue={row.floor_count??""}/></label>
          </div>
          <label className="form-field full-width"><span>Anliegen des Kunden</span><textarea name="customer_message" rows={3} defaultValue={row.customer_message??""}/></label>
          <label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={3} defaultValue={row.internal_notes??""}/></label>
        </fieldset>
        {editable?<div className="form-actions"><button className="primary-button" type="submit">Grunddaten speichern</button></div>:null}
      </Form>
    </section>

    <section className="editor-card" id="termine"><div className="card-head"><div><p className="eyebrow">Ablauf</p><h2>Termin und Lieferung</h2></div></div>
      <Form method="post">
        <input type="hidden" name="_intent" value="termine"/>
        <input type="hidden" name="version" value={row.version}/>
        <fieldset disabled={!editable}>
          <div className="form-grid">
            <label className="form-field"><span>Angefragt am</span><input name="requested_on" type="date" defaultValue={row.requested_on??""}/></label>
            <label className="form-field"><span>Aufmaßtermin</span><input name="appointment_at" type="datetime-local" defaultValue={isoNachLokal(row.appointment_at)}/><small className="subtle">{row.appointment_at?`Hinterlegt: ${zeitpunkt(row.appointment_at)}`:"Noch kein Termin"}</small></label>
            <label className="form-field"><span>Aufgemessen am</span><input name="measured_on" type="date" defaultValue={row.measured_on??""}/></label>
            <label className="form-field"><span>Geliefert am</span><input name="delivered_on" type="date" defaultValue={row.delivered_on??""}/></label>
          </div>
        </fieldset>
        {editable?<div className="form-actions"><button className="primary-button" type="submit">Termine speichern</button></div>:null}
      </Form>
      {editable&&canTask?<Form method="post" className="inline-actions"><input type="hidden" name="_intent" value="wiedervorlage"/><button className="secondary-button" type="submit">Wiedervorlage zur Ausarbeitung anlegen</button></Form>:null}
      <div className="data-list">
        {tasks.map((task:any)=><Link className="data-row data-row-link" to="/crm/tasks" key={task.id}><div><strong>{task.title}</strong><small>{task.task_number} · {beschrifte(AUFGABENSTATUS,task.status)}</small></div><div className="row-meta"><span>Fällig {formatDate(task.due_at)}</span></div><span className="subtle-link">Aufgaben öffnen →</span></Link>)}
        {tasks.length===0?<LeerOderFehler fehler={ladefehler} name="tasks">Keine Wiedervorlage zu diesem Auftrag.</LeerOderFehler>:null}
      </div>
    </section>

    <section className="editor-card" id="ergebnis"><div className="card-head"><div><p className="eyebrow">Ergebnis</p><h2>Flächen und Grundlage</h2></div></div>
      <p className="subtle">Die Zahlen stammen aus der Berechnung, die als Unterlage beiliegt. Das CRM rechnet selbst nichts aus.</p>
      <Form method="post">
        <input type="hidden" name="_intent" value="ergebnis"/>
        <input type="hidden" name="version" value={row.version}/>
        <fieldset disabled={!editable}>
          <div className="form-grid">
            <label className="form-field"><span>Flächengrundlage</span><select name="area_standard" defaultValue={row.area_standard}>{Object.entries(FLAECHENSTANDARD).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Wohnfläche in m²</span><input name="measured_living_area_sqm" inputMode="decimal" defaultValue={row.measured_living_area_sqm??""}/></label>
            <label className="form-field"><span>Nutzfläche in m²</span><input name="measured_usable_area_sqm" inputMode="decimal" defaultValue={row.measured_usable_area_sqm??""}/></label>
          </div>
        </fieldset>
        {editable?<div className="form-actions"><button className="primary-button" type="submit">Ergebnis speichern</button></div>:null}
      </Form>

      {property?<div className="status-note">
        <p><strong>In der Objektakte steht:</strong> Wohnfläche {flaeche(property.living_area_sqm)} · Grundlage {beschrifte(FLAECHENSTANDARD,legal?.living_area_basis==="ESTIMATED"?"NONE":legal?.living_area_basis??"NONE")}{legal?.living_area_basis==="ESTIMATED"?" (geschätzt)":""}</p>
        {editable&&canProperty&&uebernehmbar?<Form method="post" className="inline-actions">
          <input type="hidden" name="_intent" value="uebernehmen"/>
          <button className="secondary-button" type="submit">Wohnfläche {flaeche(row.measured_living_area_sqm)} in die Objektakte übernehmen</button>
        </Form>:<p className="subtle">{!canProperty?"Zum Übernehmen in die Objektakte fehlt die Berechtigung.":!row.measured_living_area_sqm?"Zum Übernehmen wird eine gemessene Wohnfläche benötigt.":!GRUNDLAGE_JE_STANDARD[row.area_standard]?"Zum Übernehmen wird eine Flächengrundlage nach WoFlV oder DIN 277 benötigt.":"Der Auftrag ist archiviert."}</p>}
      </div>:<p className="subtle">Ohne Immobilie aus dem Bestand gibt es keine Objektakte, in die das Ergebnis übernommen werden könnte.</p>}
    </section>

    <section className="editor-card" id="honorar"><div className="card-head"><div><p className="eyebrow">Honorar</p><h2>Vereinbarung und Abrechnung</h2></div></div>
      <p className="subtle">Das CRM erzeugt keine Rechnung. Die Referenz verweist auf die Rechnung, die außerhalb erstellt wurde.</p>
      <Form method="post">
        <input type="hidden" name="_intent" value="honorar"/>
        <input type="hidden" name="version" value={row.version}/>
        <fieldset disabled={!editable}>
          <div className="form-grid">
            <label className="form-field"><span>Honorar</span><input name="fee_amount" inputMode="decimal" defaultValue={row.fee_amount??""}/><small className="subtle">{row.fee_amount?`Hinterlegt: ${money(row.fee_amount)}`:"Noch nicht vereinbart"}</small></label>
            <label className="form-field"><span>Grundlage des Honorars</span><input name="fee_basis" defaultValue={row.fee_basis??""} placeholder="z. B. Paketpreis, Aufwand, Zuschlag Anfahrt"/></label>
            <label className="form-field"><span>Rechnungsreferenz</span><input name="invoice_reference" defaultValue={row.invoice_reference??""}/></label>
            <label className="form-field"><span>Abgerechnet am</span><input name="invoiced_on" type="date" defaultValue={row.invoiced_on??""}/></label>
            <label className="form-field"><span>Bezahlt am</span><input name="paid_on" type="date" defaultValue={row.paid_on??""}/></label>
          </div>
        </fieldset>
        {editable?<div className="form-actions"><button className="primary-button" type="submit">Honorar speichern</button></div>:null}
      </Form>
    </section>

    <section className="data-card" id="unterlagen"><div className="card-head"><div><p className="eyebrow">Unterlagen</p><h2>Was aus dem Auftrag entstanden ist</h2></div></div>
      <p className="subtle">Die Dateien liegen in der Dokumentenverwaltung der Immobilie. Hier wird darauf verwiesen, nicht ein zweites Mal gespeichert.</p>
      <div className="data-list">
        {unterlagen.map((link:any)=>{
          const dokument=one(link.documents);
          return <div className="data-row" key={link.id}>
            <div><strong>{dokument?.title??"Unterlage"}</strong><small>{beschrifte(DOKUMENTKATEGORIE,dokument?.category)}{link.note?` · ${link.note}`:""}</small></div>
            <div className="row-meta"><small>Verknüpft {formatDate(link.created_at)}</small></div>
            {property?<Link className="subtle-link" to={`/properties/${property.id}/documents`}>Dokumente öffnen →</Link>:<span className="subtle">—</span>}
            {editable?<Form method="post"><input type="hidden" name="_intent" value="unterlage_entfernen"/><input type="hidden" name="link_id" value={link.id}/><button className="secondary-button" type="submit">Entfernen</button></Form>:null}
          </div>;
        })}
        {unterlagen.length===0?<LeerOderFehler fehler={ladefehler} name="unterlagen">Noch keine Unterlage verknüpft.</LeerOderFehler>:null}
      </div>
      {editable&&property?<Form method="post" className="form-grid">
        <input type="hidden" name="_intent" value="unterlage"/>
        <label className="form-field"><span>Unterlage der Immobilie</span><select name="document_id" defaultValue=""><option value="">Auswählen…</option>{objektDokumente.filter((dokument:any)=>!verknuepft.has(dokument.id)).map((dokument:any)=><option key={dokument.id} value={dokument.id}>{dokument.title} · {beschrifte(DOKUMENTKATEGORIE,dokument.category)}</option>)}</select></label>
        <label className="form-field"><span>Notiz</span><input name="note" placeholder="z. B. Exposé-Grundriss, 2. OG"/></label>
        <div className="form-actions"><button className="secondary-button" type="submit">Verknüpfen</button></div>
      </Form>:null}
      {editable&&!property?<p className="subtle">Unterlagen lassen sich erst verknüpfen, wenn dem Auftrag eine Immobilie aus dem Bestand zugeordnet ist.</p>:null}
    </section>

    {audit.length?<section className="data-card"><div className="card-head"><div><p className="eyebrow">Historie</p><h2>Änderungen an diesem Auftrag</h2></div></div><div className="data-list">
      {audit.map((event:any)=><div className="data-row" key={event.id}>
        <div><strong>{event.action}</strong><small>{event.actor_display_name_snapshot??"System"}</small></div>
        <div className="row-meta"><small>{zeitpunkt(event.occurred_at)}</small></div>
      </div>)}
    </div></section>:null}
  </main>;
}
