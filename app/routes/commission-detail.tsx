import { bruttoErfasst, offenZahlung, provisionNetto, umsatzsteuer, ustSatz, zahlziel } from "~/lib/provision";
import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/commission-detail";
import { CommissionFields, type CommissionOfferOption, type CommissionPartyOption } from "~/components/commission-fields";
import { requirePermission } from "~/lib/auth.server";
import { euroGenau as money, tag as formatDate, zeitpunkt } from "~/lib/format";
import { MAKLERAUFTRAGSTATUS, beschrifte, AUDITAKTION } from "~/lib/labels";
import { LeerOderFehler } from "~/components/leer-oder-fehler";

type ActionResult={error?:string;ok?:string};
const STATUS:Record<string,string>={DRAFT:"Entwurf",EXPECTED:"Erwartet",DUE:"Fällig",INVOICED:"Abgerechnet",PARTIALLY_PAID:"Teilweise bezahlt",PAID:"Bezahlt",CANCELLED:"Storniert"};
const STATUS_CLASS:Record<string,string>={DRAFT:"status-draft",EXPECTED:"status-valuation",DUE:"status-contract-pending",INVOICED:"status-marketing",PARTIALLY_PAID:"status-preparation",PAID:"status-sold",CANCELLED:"status-lost"};
const INVOICE_STATUS:Record<string,string>={NOT_ISSUED:"Noch nicht abgerechnet",ISSUED:"Abgerechnet",CANCELLED:"Storniert"};
const PAYMENT_STATUS:Record<string,string>={OPEN:"Offen",PARTIALLY_PAID:"Teilweise bezahlt",PAID:"Bezahlt"};
function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function decimal(fd:FormData,key:string){const raw=text(fd,key).replace(",",".");if(!raw)return null;const value=Number(raw);return Number.isFinite(value)?value:NaN;}

function target(row:any){return zahlziel(row);}
function errorMessage(error:any){const message=String(error?.message??"");if(message.includes("INVALID_COMMISSION_STATUS_TRANSITION"))return"Dieser Provisionsstatus kann aus dem aktuellen Stand nicht gewählt werden.";if(message.includes("COMMISSION_PARTY_REQUIRED"))return"Vor diesem Status muss eine zahlende Partei ausgewählt werden.";if(message.includes("COMMISSION_PERCENT_TERMS_REQUIRED"))return"Für die prozentuale Provision werden Berechnungsgrundlage und Prozentsatz benötigt.";if(message.includes("COMMISSION_FIXED_AMOUNT_REQUIRED"))return"Für die Festprovision wird ein positiver Festbetrag benötigt.";if(message.includes("COMMISSION_DUE_DATE_REQUIRED"))return"Für diesen Status muss eine Fälligkeit hinterlegt sein.";if(message.includes("COMMISSION_TARGET_AMOUNT_REQUIRED"))return"Für diesen Status muss eine erwartete oder tatsächliche Provision vorhanden sein.";if(message.includes("COMMISSION_PARTIAL_PAYMENT_INVALID"))return"Die Teilzahlung muss größer als 0 € und kleiner als die maßgebliche Provision sein.";if(message.includes("COMMISSION_FULL_PAYMENT_INCOMPLETE"))return"Für „Bezahlt“ muss der dokumentierte Zahlbetrag mindestens der maßgeblichen Provision entsprechen.";if(message.includes("COMMISSION_PAID_AT_REQUIRED"))return"Für „Bezahlt“ ist das Zahlungsdatum erforderlich.";if(message.includes("COMMISSION_SELLER_MUST_BE_PROPERTY_OWNER"))return"Für eine Innenprovision muss die zahlende Partei als Eigentümer dieser Immobilie hinterlegt sein.";if(message.includes("COMMISSION_BUYER_REQUIRES_PROPERTY_OFFER"))return"Für eine Außenprovision muss für die zahlende Partei ein Kaufangebot zu dieser Immobilie vorliegen.";if(message.includes("COMMISSION_BUYER_OFFER_CONTACT_MISMATCH"))return"Käufer und ausgewähltes Kaufangebot passen nicht zusammen.";if(message.includes("COMMISSION_OFFER_PROPERTY_MISMATCH"))return"Das ausgewählte Kaufangebot gehört nicht zu dieser Immobilie.";if(message.includes("ARCHIVED_COMMISSION_IMMUTABLE"))return"Eine archivierte Provision kann nicht bearbeitet werden. Bitte zuerst wiederherstellen.";if(message.includes("COMMISSION_RESPONSIBLE_USER_INACTIVE"))return"Der ausgewählte Verantwortliche ist nicht aktiv.";if(message.includes("COMMISSION_MANDATE_PROPERTY_MISMATCH"))return"Der ausgewählte Maklerauftrag gehört nicht zu dieser Immobilie.";if(message.includes("COMMISSION_MANDATE_SIDE_NOT_AGREED"))return"Im ausgewählten Maklerauftrag ist für diese Provisionsseite keine Provision vereinbart.";if(message.includes("COMMISSION_MANDATE_LINK_REQUIRED"))return"Für diese Immobilie besteht ein aktiver Maklerauftrag. Bitte die Provision zuerst mit dem Auftrag verknüpfen.";if(message.includes("COMMISSION_CLIENT_SHARE_PROOF_REQUIRED"))return"Die Käuferprovision kann erst fällig gestellt werden, wenn im Maklerauftrag der Zahlungsnachweis des Auftraggeberanteils hinterlegt ist.";if(message.includes("COMMISSION_MANDATE_NOT_FOUND"))return"Der ausgewählte Maklerauftrag wurde nicht gefunden.";return"Provision konnte nicht aktualisiert werden.";}

async function loadOptions(supabase:any){
 const [{data:properties,error:propertyError},{data:owners,error:ownerError},{data:offers,error:offerError},{data:profiles,error:profileError},{data:mandates,error:mandateError}]=await Promise.all([
  supabase.from("properties").select("id,property_number,internal_title,purchase_price,status").eq("transaction_type","SALE").order("updated_at",{ascending:false}).limit(500),
  supabase.from("property_owners").select("property_id,contact_id,contacts(id,contact_number,first_name,last_name,archived_at)").limit(1000),
  supabase.from("purchase_offers").select("id,offer_number,property_id,contact_id,amount,status,archived_at,contacts(id,contact_number,first_name,last_name,archived_at)").is("archived_at",null).in("status",["DRAFT","SUBMITTED","COUNTERED","ACCEPTED"]).order("updated_at",{ascending:false}).limit(1000),
  supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
  supabase.from("brokerage_mandates").select("id,mandate_number,property_id,mandate_type,status,brokerage_mandate_commission_terms(side)").is("archived_at",null).in("status",["DRAFT","ACTIVE"]).order("updated_at",{ascending:false}).limit(500),
 ]);
 if(propertyError||ownerError||offerError||profileError||mandateError)throw new Response("Provisionsoptionen konnten nicht geladen werden.",{status:500});
 const propertyIds=new Set((properties??[]).map((p:any)=>p.id));const partyOptions:CommissionPartyOption[]=[];const seen=new Set<string>();
 for(const owner of owners??[]){const contact=one(owner.contacts);if(!propertyIds.has(owner.property_id)||!contact||contact.archived_at)continue;const key=`SELLER:${owner.property_id}:${owner.contact_id}`;if(seen.has(key))continue;seen.add(key);partyOptions.push({propertyId:owner.property_id,contactId:owner.contact_id,side:"SELLER",label:`${contact.first_name} ${contact.last_name} · ${contact.contact_number}`});}
 const offerOptions:CommissionOfferOption[]=[];
 for(const offer of offers??[]){const contact=one(offer.contacts);if(!propertyIds.has(offer.property_id)||!contact||contact.archived_at)continue;const key=`BUYER:${offer.property_id}:${offer.contact_id}`;if(!seen.has(key)){seen.add(key);partyOptions.push({propertyId:offer.property_id,contactId:offer.contact_id,side:"BUYER",label:`${contact.first_name} ${contact.last_name} · ${contact.contact_number}`});}offerOptions.push({id:offer.id,propertyId:offer.property_id,contactId:offer.contact_id,label:offer.offer_number,amount:offer.amount,status:offer.status});}
 const mandateOptions=(mandates??[]).map((mandate:any)=>({id:mandate.id,propertyId:mandate.property_id,label:`${mandate.mandate_number} · ${beschrifte(MAKLERAUFTRAGSTATUS,mandate.status)}`,sides:(mandate.brokerage_mandate_commission_terms??[]).map((term:any)=>term.side)}));
 return {properties:properties??[],partyOptions,offers:offerOptions,mandates:mandateOptions,profiles:profiles??[]};
}

export async function loader({request,context,params}:Route.LoaderArgs){
 const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"commission.read");const id=params.commissionId!;
 const {data:row,error}=await supabase.from("commissions").select("*,properties(id,property_number,internal_title,status,purchase_price,property_type),party:contacts!commissions_party_contact_id_fkey(id,contact_number,first_name,last_name),purchase_offers(id,offer_number,amount,status,contact_id)").eq("id",id).maybeSingle();
 if(error||!row)throw new Response("Provision nicht gefunden.",{status:404,headers:responseHeaders()});
 const [options,{data:transitions,error:transitionsFehler},{data:canWrite},{data:canArchive},{data:canAudit}]=await Promise.all([loadOptions(supabase),supabase.from("commission_status_transitions").select("to_status,description").eq("from_status",row.status).order("to_status"),supabase.rpc("current_user_has_permission",{p_permission:"commission.write"}),supabase.rpc("current_user_has_permission",{p_permission:"commission.archive"}),supabase.rpc("current_user_has_permission",{p_permission:"audit.read"})]);
 // Pruefhinweis (19.10.2026): bei Wohnung/Einfamilienhaus Verkaeufer- und
 // Kaeuferprovision desselben Objekts gegenueberstellen. Das CRM bewertet nicht.
 const {data:geschwister}=row.property_id?await supabase.from("commissions").select("id,commission_number,side,calculation_method,agreed_percent,agreed_fixed_amount,status").eq("property_id",row.property_id).is("archived_at",null).neq("status","CANCELLED"):{data:[]};
 let audit:any[]=[];if(canAudit===true){const result=await supabase.from("audit_events").select("id,occurred_at,actor_display_name_snapshot,action,field_changes").eq("entity_type","COMMISSION").eq("entity_id",id).order("occurred_at",{ascending:false}).limit(80);if(!result.error)audit=result.data??[];}
 return data({geschwister:(geschwister??[]) as any[],ladefehler:[transitionsFehler&&"transitions"].filter(Boolean) as string[],row,profile,transitions:transitions??[],canWrite:canWrite===true,canArchive:canArchive===true,audit,...options},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
 const {supabase,responseHeaders}=await requirePermission(request,context.cloudflare.env,"commission.write");const id=params.commissionId!,fd=await request.formData(),intent=text(fd,"_intent");
 const version=Number(text(fd,"version"));if(!Number.isInteger(version)||version<1)return data<ActionResult>({error:"Ungültige Datensatzversion."},{status:400,headers:responseHeaders()});
 const conflict=()=>data<ActionResult>({error:"Die Provision wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});
 if(intent==="update"){
   const method=text(fd,"calculation_method"),basis=decimal(fd,"calculation_basis"),percent=decimal(fd,"agreed_percent"),fixed=decimal(fd,"agreed_fixed_amount"),actual=decimal(fd,"actual_amount");
   for(const [value,label] of [[basis,"Berechnungsgrundlage"],[percent,"Prozentsatz"],[fixed,"Festbetrag"],[actual,"tatsächliche Provision"]] as const){if(typeof value==="number"&&(!Number.isFinite(value)||value<0))return data<ActionResult>({error:`${label} muss eine gültige, nicht negative Zahl sein.`},{status:400,headers:responseHeaders()});}
   if(percent!==null&&percent>100)return data<ActionResult>({error:"Der Prozentsatz darf 100 % nicht überschreiten."},{status:400,headers:responseHeaders()});
   const ust=decimal(fd,"vat_rate");if(ust!==null&&(!Number.isFinite(ust)||ust<0||ust>100))return data<ActionResult>({error:"Der Umsatzsteuersatz muss zwischen 0 und 100 % liegen."},{status:400,headers:responseHeaders()});
   const update:any={property_id:text(fd,"property_id"),purchase_offer_id:text(fd,"purchase_offer_id")||null,mandate_id:text(fd,"mandate_id")||null,party_contact_id:text(fd,"party_contact_id")||null,side:text(fd,"side"),calculation_method:method,calculation_basis:basis,agreed_percent:method==="PERCENT"?percent:null,agreed_fixed_amount:method==="FIXED"?fixed:null,actual_amount:actual,vat_rate:(()=>{const v=decimal(fd,"vat_rate");return v===null?19:v;})(),due_date:text(fd,"due_date")||null,invoice_reference:text(fd,"invoice_reference")||null,primary_responsible_user:text(fd,"primary_responsible_user"),internal_notes:text(fd,"internal_notes")||null};
   if(fd.has("paid_amount"))update.paid_amount=decimal(fd,"paid_amount")??0;if(fd.has("paid_at"))update.paid_at=text(fd,"paid_at")||null;
   const {data:updated,error}=await supabase.from("commissions").update(update).eq("id",id).eq("version",version).select("id").maybeSingle();if(error)return data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});if(!updated)return conflict();return redirect(`/commissions/${id}`,{headers:responseHeaders()});
 }
 if(intent==="status"){
   const next=text(fd,"target_status"),update:any={status:next};if(fd.has("invoice_reference"))update.invoice_reference=text(fd,"invoice_reference")||null;if(fd.has("paid_amount")){const amount=decimal(fd,"paid_amount");if(amount===null||!Number.isFinite(amount)||amount<0)return data<ActionResult>({error:"Bitte einen gültigen Zahlbetrag angeben."},{status:400,headers:responseHeaders()});update.paid_amount=amount;}if(fd.has("paid_at"))update.paid_at=text(fd,"paid_at")||null;
   const {data:updated,error}=await supabase.from("commissions").update(update).eq("id",id).eq("version",version).select("id").maybeSingle();if(error)return data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});if(!updated)return conflict();return redirect(`/commissions/${id}#status`,{headers:responseHeaders()});
 }
 if(intent==="archive"||intent==="restore"){
   await requirePermission(request,context.cloudflare.env,"commission.archive");const {data:updated,error}=await supabase.from("commissions").update({archived_at:intent==="archive"?new Date().toISOString():null}).eq("id",id).eq("version",version).select("id").maybeSingle();if(error)return data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});if(!updated)return conflict();return redirect(`/commissions/${id}`,{headers:responseHeaders()});
 }
 return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

function auditLabel(changes:any){if(!changes||typeof changes!=="object")return"Änderung dokumentiert";const keys=Object.keys(changes);if(keys.includes("record"))return"Provisionsvorgang angelegt";return keys.map((key)=>({status:"Status",property_id:"Immobilie",party_contact_id:"Partei",side:"Provisionsseite",calculation_method:"Berechnungsart",calculation_basis:"Berechnungsgrundlage",agreed_percent:"Prozentsatz",agreed_fixed_amount:"Festbetrag",actual_amount:"Tatsächliche Provision",due_date:"Fälligkeit",invoice_reference:"Rechnungsreferenz",paid_amount:"Bezahlter Betrag",paid_at:"Zahlungsdatum",primary_responsible_user:"Verantwortlich",internal_notes:"Notizen",archived_at:"Archiv"}[key]??key)).join(", ");}

export default function CommissionDetail(){
 const {geschwister,row,profile,transitions,canWrite,canArchive,audit,properties,partyOptions,offers,mandates,profiles,ladefehler}=useLoaderData<typeof loader>();const result=useActionData<typeof action>();const property=one(row.properties),party=one(row.party),offer=one(row.purchase_offers),targetAmount=target(row),locked=Boolean(row.archived_at);
 return <main className="editor-shell">
 {result?.error?<div className="form-error">{result.error}</div>:null}
 <div className="property-summary-grid">
  <section className="data-card"><div className="card-head"><div><p className="eyebrow">Provisionsseite</p><h2>{row.side==="SELLER"?"Innenprovision":"Außenprovision"}</h2></div></div><p><strong>{party?`${party.first_name} ${party.last_name}`:"Partei noch offen"}</strong></p><p className="subtle">{party?.contact_number??(row.side==="SELLER"?"Eigentümerseite":"Käuferseite")}{offer?.offer_number?` · ${offer.offer_number}`:""}</p></section>
  <section className="data-card"><div className="card-head"><div><p className="eyebrow">Betrag</p><h2>{money(row.actual_amount??row.expected_amount)}</h2></div></div><p className="subtle">Erwartet {money(row.expected_amount)}{row.actual_amount!==null?` · tatsächlich ${money(row.actual_amount)}`:""}</p>{provisionNetto(row)>0?<p className="subtle">Netto {money(provisionNetto(row))} · zzgl. {ustSatz(row).toLocaleString("de-DE")} % USt {money(umsatzsteuer(row))} · Rechnungsbetrag {money(Math.round(provisionNetto(row)*(100+ustSatz(row)))/100)}</p>:null}<p className="subtle">{bruttoErfasst(row)?"Zahlungseingang brutto":"Zahlung netto erfasst (vor 19.10.2026)"}: {money(row.paid_amount)} · offen {money(offenZahlung(row))}</p></section>
  <section className="data-card"><div className="card-head"><div><p className="eyebrow">Abrechnung & Zahlung</p><h2>{PAYMENT_STATUS[row.payment_status]??row.payment_status}</h2></div></div><p className="subtle">{INVOICE_STATUS[row.invoice_status]??row.invoice_status} · Fälligkeit {formatDate(row.due_date)}</p><p className="subtle">{row.invoice_reference?`Referenz ${row.invoice_reference}`:"Keine Rechnungsreferenz"}{row.paid_at?` · bezahlt ${formatDate(row.paid_at)}`:""}</p></section>
 </div>
 <ProvisionsVergleich property={property} geschwister={geschwister}/>

 <section className="data-card" id="status"><div className="card-head"><div><p className="eyebrow">Workflow</p><h2>Status & nächste Schritte</h2></div><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{STATUS[row.status]??row.status}</span></div>{locked?<p className="empty-state">Archivierte Provisionen können erst nach dem Wiederherstellen weiterbearbeitet werden.</p>:canWrite?<div className="commission-transition-list">{transitions.map((transition:any)=>{
   if(transition.to_status==="INVOICED")return <Form method="post" className="inline-actions" key={transition.to_status}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="version" value={row.version}/><input type="hidden" name="target_status" value={transition.to_status}/><input name="invoice_reference" defaultValue={row.invoice_reference??""} placeholder="Rechnungsreferenz · optional"/><button className="secondary-button" type="submit">→ {STATUS[transition.to_status]}</button></Form>;
   if(transition.to_status==="PARTIALLY_PAID")return <Form method="post" className="inline-actions" key={transition.to_status}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="version" value={row.version}/><input type="hidden" name="target_status" value={transition.to_status}/><input name="paid_amount" type="number" min="0.01" step="0.01" placeholder={bruttoErfasst(row)?"Teilzahlung brutto €":"Teilzahlung €"} required/><button className="secondary-button" type="submit">→ {STATUS[transition.to_status]}</button></Form>;
   if(transition.to_status==="PAID")return <Form method="post" className="inline-actions" key={transition.to_status}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="version" value={row.version}/><input type="hidden" name="target_status" value={transition.to_status}/><input name="paid_amount" type="number" min="0.01" step="0.01" defaultValue={Math.max(Number(row.paid_amount??0),targetAmount)||""} required/><input name="paid_at" type="date" required/><button className="primary-button" type="submit">→ {STATUS[transition.to_status]}</button></Form>;
   return <Form method="post" key={transition.to_status}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="version" value={row.version}/><input type="hidden" name="target_status" value={transition.to_status}/><button className="secondary-button" type="submit" title={transition.description??""}>→ {STATUS[transition.to_status]??transition.to_status}</button></Form>;
 })}{transitions.length===0?<LeerOderFehler fehler={ladefehler} name="transitions">Für diesen Status ist aktuell kein weiterer Statuswechsel vorgesehen.</LeerOderFehler>:null}</div>:<p className="empty-state">Keine Berechtigung zum Bearbeiten von Provisionen.</p>}</section>

 <section className="editor-card"><div className="card-head"><div><p className="eyebrow">Provisionsakte</p><h2>Vereinbarung & Beträge</h2></div><span className="subtle">Erwartungswert wird bei Prozentangabe automatisch berechnet.</span></div><Form method="post"><input type="hidden" name="_intent" value="update"/><input type="hidden" name="version" value={row.version}/><CommissionFields properties={properties} partyOptions={partyOptions} offers={offers} mandates={mandates} profiles={profiles} defaultResponsibleUser={row.primary_responsible_user} initial={row} disabled={!canWrite||locked} showPaymentFields={row.status==="PARTIALLY_PAID"||row.status==="PAID"}/>{canWrite&&!locked?<div className="form-actions"><button className="primary-button" type="submit">Provision speichern</button></div>:null}</Form></section>

 {canArchive?<section className="data-card"><div className="card-head"><div><p className="eyebrow">Verwaltung</p><h2>Archiv</h2></div></div><p className="subtle">{locked?"Diese Provision ist archiviert und nur noch lesbar.":"Archivierte Provisionen bleiben lesbar, erscheinen aber nicht mehr in der Arbeitsliste."}</p><Form method="post"><input type="hidden" name="_intent" value={locked?"restore":"archive"}/><input type="hidden" name="version" value={row.version}/><button className="secondary-button" type="submit">{locked?"Wiederherstellen":"Archivieren"}</button></Form></section>:null}

 <section className="data-card"><div className="card-head"><div><p className="eyebrow">Historie</p><h2>Änderungsverlauf</h2></div><span className="subtle">{audit.length} Einträge</span></div><div className="data-list">{audit.map((event:any)=><div className="data-row" key={event.id}><div><strong>{auditLabel(event.field_changes)}</strong><small>{event.actor_display_name_snapshot??"System"} · {beschrifte(AUDITAKTION,event.action)}</small></div><div className="row-meta"><span>{zeitpunkt(event.occurred_at)}</span></div></div>)}{audit.length===0?<p className="empty-state">Keine sichtbare Historie vorhanden.</p>:null}</div></section>
 </main>;
}

const WOHNEN=new Set(["APARTMENT","PENTHOUSE","MAISONETTE","DETACHED_HOUSE","SEMI_DETACHED_HOUSE","TERRACED_HOUSE"]);
function satz(c:any){return c.calculation_method==="PERCENT"?`${Number(c.agreed_percent??0).toLocaleString("de-DE",{maximumFractionDigits:2})} %`:money(c.agreed_fixed_amount);}
/**
 * Pruefhinweis (19.10.2026): Bei Wohnung oder Einfamilienhaus stehen
 * Verkaeufer- und Kaeuferprovision desselben Objekts nebeneinander; weichen sie
 * ab, ein Hinweis zum Abgleich mit dem Maklerauftrag. Ob die Abweichung
 * zulaessig ist, bewertet das CRM nicht.
 */
function ProvisionsVergleich({property,geschwister}:{property:any;geschwister:any[]}){
 if(!property||!WOHNEN.has(property.property_type))return null;
 const verk=geschwister.filter((c)=>c.side==="SELLER"),kauf=geschwister.filter((c)=>c.side==="BUYER");
 if(!verk.length||!kauf.length)return null;
 const werte=new Set(geschwister.map((c)=>[c.calculation_method,c.calculation_method==="PERCENT"?Number(c.agreed_percent):Number(c.agreed_fixed_amount)].join(":")));
 if(werte.size<=1)return null;
 return <p className="form-warning" role="note">Verkäufer- und Käuferprovision zu {property.property_number} unterscheiden sich: {[...verk,...kauf].map((c)=>`${c.commission_number} (${c.side==="SELLER"?"Verkäufer":"Käufer"}) ${satz(c)}`).join(" · ")}. Bei einer Wohnung oder einem Einfamilienhaus und einem Käufer als Verbraucher bitte mit dem Maklerauftrag abgleichen (§§ 656c, 656d BGB). Das CRM bewertet das nicht.</p>;
}
