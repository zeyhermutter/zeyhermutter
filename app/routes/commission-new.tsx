import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/commission-new";
import { CommissionFields, type CommissionOfferOption, type CommissionPartyOption } from "~/components/commission-fields";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function decimal(fd:FormData,key:string){const raw=text(fd,key).replace(",",".");if(!raw)return null;const value=Number(raw);return Number.isFinite(value)?value:NaN;}
function errorMessage(error:any){const message=String(error?.message??"");if(message.includes("COMMISSION_SALE_PROPERTY_REQUIRED"))return"Provisionen können nur einer Verkaufsimmobilie zugeordnet werden.";if(message.includes("COMMISSION_SELLER_MUST_BE_PROPERTY_OWNER"))return"Für eine Innenprovision muss die zahlende Partei als Eigentümer der Immobilie hinterlegt sein.";if(message.includes("COMMISSION_BUYER_REQUIRES_PROPERTY_OFFER"))return"Für eine Außenprovision muss für die zahlende Partei ein Kaufangebot zu dieser Immobilie vorhanden sein.";if(message.includes("COMMISSION_BUYER_OFFER_CONTACT_MISMATCH"))return"Das ausgewählte Kaufangebot gehört nicht zur gewählten Käuferseite.";if(message.includes("COMMISSION_OFFER_PROPERTY_MISMATCH"))return"Das ausgewählte Kaufangebot gehört nicht zu dieser Immobilie.";if(message.includes("COMMISSION_RESPONSIBLE_USER_INACTIVE"))return"Der ausgewählte Verantwortliche ist nicht aktiv.";return"Provision konnte nicht angelegt werden.";}

async function loadOptions(supabase:any){
 const [{data:properties,error:propertyError},{data:owners,error:ownerError},{data:offers,error:offerError},{data:profiles,error:profileError}]=await Promise.all([
  supabase.from("properties").select("id,property_number,internal_title,purchase_price,status").eq("transaction_type","SALE").neq("status","ARCHIVED").order("updated_at",{ascending:false}).limit(500),
  supabase.from("property_owners").select("property_id,contact_id,contacts(id,contact_number,first_name,last_name,archived_at)").or("valid_until.is.null,valid_until.gte."+new Date().toISOString().slice(0,10)).limit(1000),
  supabase.from("purchase_offers").select("id,offer_number,property_id,contact_id,amount,status,archived_at,contacts(id,contact_number,first_name,last_name,archived_at)").is("archived_at",null).in("status",["DRAFT","SUBMITTED","COUNTERED","ACCEPTED"]).order("updated_at",{ascending:false}).limit(1000),
  supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
 ]);
 if(propertyError||ownerError||offerError||profileError)throw new Response("Provisionsoptionen konnten nicht geladen werden.",{status:500});
 const activePropertyIds=new Set((properties??[]).map((p:any)=>p.id));
 const partyOptions:CommissionPartyOption[]=[];
 const seen=new Set<string>();
 for(const owner of owners??[]){const contact=Array.isArray(owner.contacts)?owner.contacts[0]:owner.contacts;if(!activePropertyIds.has(owner.property_id)||!contact||contact.archived_at)continue;const key=`SELLER:${owner.property_id}:${owner.contact_id}`;if(seen.has(key))continue;seen.add(key);partyOptions.push({propertyId:owner.property_id,contactId:owner.contact_id,side:"SELLER",label:`${contact.first_name} ${contact.last_name} · ${contact.contact_number}`});}
 const offerOptions:CommissionOfferOption[]=[];
 for(const offer of offers??[]){const contact=Array.isArray(offer.contacts)?offer.contacts[0]:offer.contacts;if(!activePropertyIds.has(offer.property_id)||!contact||contact.archived_at)continue;const key=`BUYER:${offer.property_id}:${offer.contact_id}`;if(!seen.has(key)){seen.add(key);partyOptions.push({propertyId:offer.property_id,contactId:offer.contact_id,side:"BUYER",label:`${contact.first_name} ${contact.last_name} · ${contact.contact_number}`});}offerOptions.push({id:offer.id,propertyId:offer.property_id,contactId:offer.contact_id,label:offer.offer_number,amount:offer.amount,status:offer.status});}
 return {properties:properties??[],partyOptions,offers:offerOptions,profiles:profiles??[]};
}

export async function loader({request,context}:Route.LoaderArgs){const {supabase,responseHeaders,profile,userId}=await requirePermission(request,context.cloudflare.env,"commission.write");const options=await loadOptions(supabase);const propertyId=new URL(request.url).searchParams.get("property_id")??"";return data({profile,userId,propertyId,...options},{headers:responseHeaders()});}

export async function action({request,context}:Route.ActionArgs){
 const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"commission.write");const fd=await request.formData();
 const propertyId=text(fd,"property_id"),side=text(fd,"side"),method=text(fd,"calculation_method"),responsible=text(fd,"primary_responsible_user")||userId;
 const basis=decimal(fd,"calculation_basis"),percent=decimal(fd,"agreed_percent"),fixed=decimal(fd,"agreed_fixed_amount"),actual=decimal(fd,"actual_amount");
 if(!propertyId)return data<ActionResult>({error:"Eine Verkaufsimmobilie ist erforderlich."},{status:400,headers:responseHeaders()});
 if(!["SELLER","BUYER"].includes(side))return data<ActionResult>({error:"Bitte eine gültige Provisionsseite auswählen."},{status:400,headers:responseHeaders()});
 if(!["PERCENT","FIXED"].includes(method))return data<ActionResult>({error:"Bitte eine gültige Berechnungsart auswählen."},{status:400,headers:responseHeaders()});
 for(const [value,label] of [[basis,"Berechnungsgrundlage"],[percent,"Prozentsatz"],[fixed,"Festbetrag"],[actual,"tatsächliche Provision"]] as const){if(typeof value==="number"&&(!Number.isFinite(value)||value<0))return data<ActionResult>({error:`${label} muss eine gültige, nicht negative Zahl sein.`},{status:400,headers:responseHeaders()});}
 if(percent!==null&&percent>100)return data<ActionResult>({error:"Der Prozentsatz darf 100 % nicht überschreiten."},{status:400,headers:responseHeaders()});
 const payload={property_id:propertyId,purchase_offer_id:text(fd,"purchase_offer_id")||null,party_contact_id:text(fd,"party_contact_id")||null,side,calculation_method:method,calculation_basis:basis,agreed_percent:method==="PERCENT"?percent:null,agreed_fixed_amount:method==="FIXED"?fixed:null,actual_amount:actual,due_date:text(fd,"due_date")||null,invoice_reference:text(fd,"invoice_reference")||null,paid_amount:0,paid_at:null,status:"DRAFT",primary_responsible_user:responsible,internal_notes:text(fd,"internal_notes")||null,created_by:userId,updated_by:userId};
 const {data:created,error}=await supabase.from("commissions").insert(payload).select("id").single();if(error||!created)return data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});return redirect(`/commissions/${created.id}`,{headers:responseHeaders()});
}

export default function CommissionNew(){const {profile,userId,propertyId,properties,partyOptions,offers,profiles}=useLoaderData<typeof loader>();const result=useActionData<typeof action>();return <main className="editor-shell"><header className="editor-header"><div><Link className="back-link" to="/commissions">← Provisionen</Link><p className="eyebrow">Objekte & Verkauf</p><h1 className="editor-title">Provision anlegen</h1><p className="editor-meta">Innen- oder Außenprovision zunächst als Entwurf erfassen.</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>{result?.error?<div className="form-error">{result.error}</div>:null}<section className="editor-card"><div className="card-head"><div><p className="eyebrow">Neuer Provisionsvorgang</p><h2>Vereinbarung</h2></div></div><Form method="post"><CommissionFields properties={properties} partyOptions={partyOptions} offers={offers} profiles={profiles} defaultResponsibleUser={userId} initial={{property_id:propertyId}} showPaymentFields={false}/><div className="form-actions"><Link className="secondary-button link-button" to="/commissions">Abbrechen</Link><button className="primary-button" type="submit">Entwurf anlegen</button></div></Form></section></main>;}
