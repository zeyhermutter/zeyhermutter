import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/mandate-new";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("MANDATE_PROPERTY_NOT_FOUND"))return"Die gewählte Immobilie wurde nicht gefunden.";
  if(message.includes("MANDATE_LEAD_NOT_FOUND"))return"Der gewählte Verkäufer-Lead wurde nicht gefunden.";
  if(message.includes("MANDATE_RESPONSIBLE_USER_INACTIVE"))return"Der ausgewählte Verantwortliche ist nicht aktiv.";
  if(message.includes("MANDATE_MUST_START_DRAFT"))return"Ein Auftrag wird immer zuerst als Entwurf angelegt.";
  return "Der Maklerauftrag konnte nicht angelegt werden.";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile,userId}=await requirePermission(request,context.cloudflare.env,"mandate.write");
  const [{data:properties,error:propertyError},{data:leads,error:leadError},{data:profiles,error:profileError}]=await Promise.all([
    supabase.from("properties").select("id,property_number,internal_title,status").eq("transaction_type","SALE").neq("status","ARCHIVED").order("updated_at",{ascending:false}).limit(500),
    supabase.from("leads").select("id,lead_number,property_city,converted_property_id").is("archived_at",null).order("updated_at",{ascending:false}).limit(500),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
  ]);
  if(propertyError||leadError||profileError)throw new Response("Auftragsoptionen konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const propertyId=new URL(request.url).searchParams.get("property_id")??"";
  return data({profile,userId,propertyId,properties:properties??[],leads:leads??[],profiles:profiles??[]},{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"mandate.write");
  const fd=await request.formData();
  const propertyId=text(fd,"property_id"),mandateType=text(fd,"mandate_type"),clientSide=text(fd,"client_side");
  if(!propertyId)return data<ActionResult>({error:"Eine Verkaufsimmobilie ist erforderlich."},{status:400,headers:responseHeaders()});
  if(!["SIMPLE","EXCLUSIVE","QUALIFIED_EXCLUSIVE"].includes(mandateType))return data<ActionResult>({error:"Bitte eine gültige Auftragsart auswählen."},{status:400,headers:responseHeaders()});
  if(!["SELLER","BUYER","BOTH"].includes(clientSide))return data<ActionResult>({error:"Bitte eine gültige Auftraggeberseite auswählen."},{status:400,headers:responseHeaders()});
  const payload={
    property_id:propertyId,
    lead_id:text(fd,"lead_id")||null,
    mandate_type:mandateType,
    client_side:clientSide,
    client_is_consumer:text(fd,"client_is_consumer")!=="no",
    status:"DRAFT",
    primary_responsible_user:text(fd,"primary_responsible_user")||userId,
    internal_notes:text(fd,"internal_notes")||null,
    created_by:userId,
    updated_by:userId,
  };
  const {data:created,error}=await supabase.from("brokerage_mandates").insert(payload).select("id").single();
  if(error||!created)return data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  return redirect(`/mandates/${created.id}`,{headers:responseHeaders()});
}

export default function MandateNew(){
  const {profile,userId,propertyId,properties,leads,profiles}=useLoaderData<typeof loader>();
  const result=useActionData<typeof action>();
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to="/mandates">← Makleraufträge</Link><p className="eyebrow">Objekte & Verkauf</p><h1 className="editor-title">Maklerauftrag anlegen</h1><p className="editor-meta">Der Auftrag startet als Entwurf. Laufzeit, Form, Provisionsvereinbarung und Widerruf werden anschließend in der Auftragsakte erfasst.</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
    {result?.error?<div className="form-error">{result.error}</div>:null}
    <section className="editor-card"><div className="card-head"><div><p className="eyebrow">Neuer Auftrag</p><h2>Grunddaten</h2></div></div>
      <Form method="post">
        <fieldset>
          <div className="form-grid">
            <label className="form-field"><span>Immobilie *</span><select name="property_id" defaultValue={propertyId} required><option value="">Auswählen…</option>{properties.map((property:any)=><option value={property.id} key={property.id}>{property.property_number} · {property.internal_title}</option>)}</select><small className="subtle">Nur Verkaufsimmobilien.</small></label>
            <label className="form-field"><span>Verkäufer-Lead · optional</span><select name="lead_id" defaultValue=""><option value="">Ohne Leadbezug</option>{leads.map((lead:any)=><option value={lead.id} key={lead.id}>{lead.lead_number}{lead.property_city?` · ${lead.property_city}`:""}</option>)}</select></label>
            <label className="form-field"><span>Auftragsart *</span><select name="mandate_type" defaultValue="EXCLUSIVE" required><option value="SIMPLE">Einfacher Auftrag</option><option value="EXCLUSIVE">Alleinauftrag</option><option value="QUALIFIED_EXCLUSIVE">Qualifizierter Alleinauftrag</option></select></label>
            <label className="form-field"><span>Auftraggeberseite *</span><select name="client_side" defaultValue="SELLER" required><option value="SELLER">Verkäufer beauftragt</option><option value="BUYER">Käufer beauftragt (Suchauftrag)</option><option value="BOTH">Doppeltätigkeit für beide Seiten</option></select><small className="subtle">Bei Doppeltätigkeit prüft das System, dass beide Provisionsseiten gleich hoch vereinbart sind.</small></label>
            <label className="form-field"><span>Verantwortlich *</span><select name="primary_responsible_user" defaultValue={userId} required>{profiles.map((item:any)=><option key={item.user_id} value={item.user_id}>{item.display_name}</option>)}</select></label>
            <label className="form-field"><span>Auftraggeber ist Verbraucher *</span><select name="client_is_consumer" defaultValue="yes" required><option value="yes">Ja</option><option value="no">Nein</option></select><small className="subtle">Steuert die Hinweise zur Widerrufsbelehrung.</small></label>
          </div>
          <label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={4}/></label>
        </fieldset>
        <div className="form-actions"><Link className="secondary-button link-button" to="/mandates">Abbrechen</Link><button className="primary-button" type="submit">Entwurf anlegen</button></div>
      </Form>
    </section>
  </main>;
}
