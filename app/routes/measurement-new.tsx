import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/measurement-new";
import { requirePermission } from "~/lib/auth.server";
import { AUFMASSPAKET, AUFTRAGSQUELLE } from "~/lib/labels";
import { IMMOBILIENARTEN } from "~/lib/public-intake";

type ActionResult={error?:string};
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dezimal(fd:FormData,key:string){const roh=text(fd,key).replace(",",".");if(!roh)return null;const wert=Number(roh);return Number.isFinite(wert)&&wert>0?wert:NaN;}

export function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("MEASUREMENT_PROPERTY_NOT_FOUND"))return"Die gewählte Immobilie wurde nicht gefunden.";
  if(message.includes("MEASUREMENT_CONTACT_NOT_FOUND"))return"Der gewählte Kunde wurde nicht gefunden.";
  if(message.includes("MEASUREMENT_RESPONSIBLE_USER_INACTIVE"))return"Der ausgewählte Verantwortliche ist nicht aktiv.";
  if(message.includes("MEASUREMENT_MUST_START_DRAFT_OR_REQUESTED"))return"Ein Auftrag beginnt als Entwurf oder als Anfrage.";
  if(message.includes("measurement_orders_zuordnung_check"))return"Bitte eine Immobilie aus dem Bestand oder einen Kunden auswählen — sonst ist nicht erkennbar, was aufgemessen werden soll.";
  if(message.includes("measurement_orders_object_postal_code_check"))return"Die Postleitzahl des Objekts besteht aus fünf Ziffern.";
  return "Der Aufmaß-Auftrag konnte nicht angelegt werden.";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile,userId}=await requirePermission(request,context.cloudflare.env,"measurement.write");
  const [{data:properties,error:propertyError},{data:contacts,error:contactError},{data:profiles,error:profileError}]=await Promise.all([
    supabase.from("properties").select("id,property_number,internal_title").neq("status","ARCHIVED").order("updated_at",{ascending:false}).limit(500),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
  ]);
  if(propertyError||contactError||profileError)throw new Response("Auftragsoptionen konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const url=new URL(request.url);
  return data({profile,userId,propertyId:url.searchParams.get("property_id")??"",contactId:url.searchParams.get("contact_id")??"",properties:properties??[],contacts:contacts??[],profiles:profiles??[]},{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"measurement.write");
  const fd=await request.formData();
  const paket=text(fd,"service_package"),propertyId=text(fd,"property_id"),contactId=text(fd,"contact_id");
  const flaeche=dezimal(fd,"approx_area_sqm");
  const geschosse=text(fd,"floor_count")?Number(text(fd,"floor_count")):null;
  if(!Object.hasOwn(AUFMASSPAKET,paket))return data<ActionResult>({error:"Bitte ein Leistungspaket auswählen."},{status:400,headers:responseHeaders()});
  if(!propertyId&&!contactId)return data<ActionResult>({error:"Bitte eine Immobilie aus dem Bestand oder einen Kunden auswählen — sonst ist nicht erkennbar, was aufgemessen werden soll."},{status:400,headers:responseHeaders()});
  if(flaeche!==null&&Number.isNaN(flaeche))return data<ActionResult>({error:"Die ungefähre Fläche muss eine Zahl größer als null sein."},{status:400,headers:responseHeaders()});
  if(geschosse!==null&&(!Number.isInteger(geschosse)||geschosse<1||geschosse>20))return data<ActionResult>({error:"Die Zahl der Geschosse liegt zwischen 1 und 20."},{status:400,headers:responseHeaders()});
  const plz=text(fd,"object_postal_code");
  if(plz&&!/^\d{5}$/.test(plz))return data<ActionResult>({error:"Die Postleitzahl des Objekts besteht aus fünf Ziffern."},{status:400,headers:responseHeaders()});
  const payload={
    service_package:paket,
    property_id:propertyId||null,
    contact_id:contactId||null,
    object_street:text(fd,"object_street")||null,
    object_house_number:text(fd,"object_house_number")||null,
    object_postal_code:plz||null,
    object_city:text(fd,"object_city")||null,
    property_type:text(fd,"property_type")||null,
    approx_area_sqm:flaeche,
    floor_count:geschosse,
    source:text(fd,"source")||"INTERNAL",
    customer_message:text(fd,"customer_message")||null,
    internal_notes:text(fd,"internal_notes")||null,
    status:"DRAFT",
    primary_responsible_user:text(fd,"primary_responsible_user")||userId,
    created_by:userId,
    updated_by:userId,
  };
  const {data:created,error}=await supabase.from("measurement_orders").insert(payload).select("id").single();
  if(error||!created)return data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  return redirect(`/measurements/${created.id}`,{headers:responseHeaders()});
}

export default function MeasurementNew(){
  const {profile,userId,propertyId,contactId,properties,contacts,profiles}=useLoaderData<typeof loader>();
  const result=useActionData<typeof action>();
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to="/measurements">← Aufmaß-Aufträge</Link><p className="eyebrow">Verkauf · Dienstleistung</p><h1 className="editor-title">Aufmaß-Auftrag anlegen</h1><p className="editor-meta">Der Auftrag startet als Entwurf. Termin, Ergebnis und Honorar werden anschließend in der Auftragsakte erfasst.</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
    {result?.error?<div className="form-error">{result.error}</div>:null}

    <section className="editor-card"><div className="card-head"><div><p className="eyebrow">Neuer Auftrag</p><h2>Leistung und Objekt</h2></div></div>
      <Form method="post">
        <fieldset>
          <div className="form-grid">
            <label className="form-field"><span>Leistungspaket *</span><select name="service_package" defaultValue="AS_BUILT" required>{Object.entries(AUFMASSPAKET).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Quelle *</span><select name="source" defaultValue="INTERNAL" required>{Object.entries(AUFTRAGSQUELLE).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Immobilie aus dem Bestand</span><select name="property_id" defaultValue={propertyId}><option value="">Nicht im eigenen Bestand</option>{properties.map((property:any)=><option value={property.id} key={property.id}>{property.property_number} · {property.internal_title}</option>)}</select><small className="subtle">Ohne Objektakte genügt die Anschrift unten.</small></label>
            <label className="form-field"><span>Kunde</span><select name="contact_id" defaultValue={contactId}><option value="">Noch kein Kontakt erfasst</option>{contacts.map((contact:any)=><option value={contact.id} key={contact.id}>{contact.contact_number} · {contact.first_name} {contact.last_name}</option>)}</select><small className="subtle">Immobilie oder Kunde — mindestens eines von beidem.</small></label>
            <label className="form-field"><span>Verantwortlich *</span><select name="primary_responsible_user" defaultValue={userId} required>{profiles.map((item:any)=><option key={item.user_id} value={item.user_id}>{item.display_name}</option>)}</select></label>
            <label className="form-field"><span>Immobilienart</span><select name="property_type" defaultValue=""><option value="">Noch offen</option>{IMMOBILIENARTEN.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Anschrift des Objekts</legend>
          <div className="form-grid">
            <label className="form-field"><span>Straße</span><input name="object_street"/></label>
            <label className="form-field"><span>Hausnummer</span><input name="object_house_number"/></label>
            <label className="form-field"><span>PLZ</span><input name="object_postal_code" inputMode="numeric" maxLength={5}/></label>
            <label className="form-field"><span>Ort</span><input name="object_city"/></label>
            <label className="form-field"><span>Ungefähre Fläche in m²</span><input name="approx_area_sqm" inputMode="decimal"/><small className="subtle">Angabe des Kunden, nicht das Messergebnis.</small></label>
            <label className="form-field"><span>Geschosse</span><input name="floor_count" inputMode="numeric" maxLength={2}/></label>
          </div>
          <label className="form-field full-width"><span>Anliegen des Kunden</span><textarea name="customer_message" rows={3}/></label>
          <label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={3}/></label>
        </fieldset>

        <div className="form-actions"><Link className="secondary-button link-button" to="/measurements">Abbrechen</Link><button className="primary-button" type="submit">Entwurf anlegen</button></div>
      </Form>
    </section>
  </main>;
}
