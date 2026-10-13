// Was eine Reservierung aendert -- an einer Stelle fuer die Liste und die
// Akte (13.10.2026). Vorher stand das in app/routes/reservations.tsx, und
// jede Aenderung kehrte auf die Liste zurueck. Jetzt kehrt sie dorthin
// zurueck, wo sie abgeschickt wurde (Feld "zurueck").

import { data, redirect } from "react-router";
import { requirePermission } from "~/lib/auth.server";
import { crmDateAtTimeToIso } from "~/lib/local-time";
import { today } from "~/lib/reservierung";

type ActionResult={error?:string};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}

/** Nur Pfade dieser Anwendung, nur unter /reservations. */
function zurueck(fd:FormData){
  const ziel=text(fd,"zurueck");
  return /^\/reservations(\/[0-9a-f-]{36})?(\?[^/]*)?$/i.test(ziel)?ziel:"/reservations?ansicht=tabelle";
}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("RESERVATION_PROPERTY_NOT_FOUND"))return"Die gewählte Immobilie wurde nicht gefunden.";
  if(message.includes("RESERVATION_CONTACT_NOT_FOUND"))return"Der gewählte Interessent wurde nicht gefunden.";
  if(message.includes("RESERVATION_PROPERTY_NOT_RESERVABLE"))return"Diese Immobilie kann in ihrem aktuellen Status nicht reserviert werden.";
  if(message.includes("RESERVATION_OFFER_PROPERTY_MISMATCH"))return"Das gewählte Kaufangebot gehört nicht zu dieser Immobilie.";
  if(message.includes("RESERVATION_OFFER_CONTACT_MISMATCH"))return"Das gewählte Kaufangebot stammt nicht von diesem Interessenten.";
  if(message.includes("RESERVATION_END_DATE_IN_FUTURE"))return"Das Beendigungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("RESERVATION_END_BEFORE_START"))return"Die Reservierung kann nicht vor ihrem Beginn enden.";
  if(message.includes("RESERVATION_FEE_NEEDS_AGREEMENT"))return"Ein Reservierungsentgelt lässt sich nur erfassen, wenn die Vereinbarung dokumentiert ist.";
  if(message.includes("RESERVATION_CANNOT_REACTIVATE"))return"Eine beendete Reservierung kann nicht wieder aktiviert werden.";
  if(message.includes("property_reservations_one_active_idx"))return"Für diese Immobilie besteht bereits eine aktive Reservierung.";
  if(message.includes("property_reservations_period_check"))return"Das Ende der Reservierung kann nicht vor ihrem Beginn liegen.";
  if(message.includes("property_reservations_ended_check"))return"Zu einer beendeten Reservierung gehört ein Beendigungsdatum.";
  if(message.includes("property_reservations_active_check"))return"Eine aktive Reservierung hat kein Beendigungsdatum und keinen Beendigungsgrund.";
  if(message.includes("property_reservations_cancel_reason_check"))return"Für eine Aufhebung ist ein Grund erforderlich.";
  if(message.includes("ARCHIVE_PERMISSION_REQUIRED")||message.includes("reservation.archive"))return"Zum Archivieren fehlt die Berechtigung.";
  return "Die Reservierung konnte nicht gespeichert werden.";
}

export async function reservierungAktion({request,context}:{request:Request;context:any}){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"reservation.write");
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Die Reservierung wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="create"){
    const propertyId=text(fd,"property_id"),contactId=text(fd,"contact_id");
    if(!propertyId)return invalid("Bitte eine Immobilie auswählen.");
    if(!contactId)return invalid("Bitte einen Interessenten auswählen.");
    const until=dateOrNull(fd,"reserved_until");
    if(!until)return invalid("Bitte ein Ablaufdatum angeben.");
    const price=numOrNull(fd,"reserved_price");
    if(typeof price==="number"&&!Number.isFinite(price))return invalid("Ungültiger reservierter Preis.");
    const fee=numOrNull(fd,"fee_amount");
    if(typeof fee==="number"&&!Number.isFinite(fee))return invalid("Ungültiges Reservierungsentgelt.");
    const documented=text(fd,"agreement_documented")==="yes";
    // Ein eingetragenes Entgelt darf nicht stillschweigend verschwinden, nur weil die
    // Vereinbarung nicht dokumentiert ist. Lieber abweisen als leise verwerfen.
    if(!documented&&(fee!==null||text(fd,"fee_note")))return invalid("Ein Reservierungsentgelt lässt sich nur erfassen, wenn die Vereinbarung dokumentiert ist. Bitte zuerst „Vereinbarung dokumentiert“ auf „Ja“ setzen oder die Angaben zum Entgelt leeren.");
    const {data:created,error}=await supabase.from("property_reservations").insert({
      property_id:propertyId,contact_id:contactId,
      purchase_offer_id:text(fd,"purchase_offer_id")||null,
      reserved_from:dateOrNull(fd,"reserved_from")??today(),
      reserved_until:until,
      reserved_price:price,
      conditions:text(fd,"conditions")||null,
      agreement_documented:documented,
      fee_amount:documented?fee:null,
      fee_note:documented?(text(fd,"fee_note")||null):null,
      primary_responsible_user:text(fd,"primary_responsible_user")||userId,
      internal_notes:text(fd,"internal_notes")||null,
      created_by:userId,updated_by:userId,
    }).select("id").maybeSingle();
    if(error)return fail(error);
    // Die neue Reservierung gleich als Akte oeffnen.
    return redirect(created?.id?`/reservations/${created.id}`:"/reservations?ansicht=tabelle",{headers:responseHeaders()});
  }

  if(intent==="update"){
    const id=text(fd,"reservation_id");
    const until=dateOrNull(fd,"reserved_until");
    if(!until)return invalid("Bitte ein Ablaufdatum angeben.");
    const price=numOrNull(fd,"reserved_price");
    if(typeof price==="number"&&!Number.isFinite(price))return invalid("Ungültiger reservierter Preis.");
    const fee=numOrNull(fd,"fee_amount");
    if(typeof fee==="number"&&!Number.isFinite(fee))return invalid("Ungültiges Reservierungsentgelt.");
    const documented=text(fd,"agreement_documented")==="yes";
    if(!documented&&(fee!==null||text(fd,"fee_note")))return invalid("Ein Reservierungsentgelt lässt sich nur erfassen, wenn die Vereinbarung dokumentiert ist. Bitte zuerst „Vereinbarung dokumentiert“ auf „Ja“ setzen oder die Angaben zum Entgelt leeren.");
    const {data:updated,error}=await supabase.from("property_reservations").update({
      reserved_until:until,
      reserved_price:price,
      conditions:text(fd,"conditions")||null,
      agreement_documented:documented,
      fee_amount:documented?fee:null,
      fee_note:documented?(text(fd,"fee_note")||null):null,
      purchase_offer_id:text(fd,"purchase_offer_id")||null,
      primary_responsible_user:text(fd,"primary_responsible_user")||userId,
      internal_notes:text(fd,"internal_notes")||null,
    }).eq("id",id).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect(zurueck(fd),{headers:responseHeaders()});
  }

  if(intent==="end"){
    const status=text(fd,"target_status");
    if(!["EXPIRED","CONVERTED","CANCELLED"].includes(status))return invalid("Ungültiger Beendigungsgrund.");
    const reason=text(fd,"end_reason");
    if(status==="CANCELLED"&&!reason)return invalid("Für eine Aufhebung ist ein Grund erforderlich.");
    const {data:updated,error}=await supabase.from("property_reservations").update({
      status,ended_on:dateOrNull(fd,"ended_on")??today(),end_reason:reason||null,
    }).eq("id",text(fd,"reservation_id")).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect(zurueck(fd),{headers:responseHeaders()});
  }

  if(intent==="archive"||intent==="restore"){
    await requirePermission(request,context.cloudflare.env,"reservation.archive");
    const {data:updated,error}=await supabase.from("property_reservations")
      .update({archived_at:intent==="archive"?new Date().toISOString():null})
      .eq("id",text(fd,"reservation_id")).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect(zurueck(fd),{headers:responseHeaders()});
  }

  if(intent==="reminder"){
    await requirePermission(request,context.cloudflare.env,"task.write");
    const {data:row}=await supabase.from("property_reservations")
      .select("reservation_number,property_id,contact_id,reserved_until,primary_responsible_user,status")
      .eq("id",text(fd,"reservation_id")).maybeSingle();
    if(!row)return invalid("Die Reservierung konnte nicht gelesen werden.");
    if((row as any).status!=="ACTIVE")return invalid("Für eine beendete Reservierung ist keine Wiedervorlage sinnvoll.");
    const dueAt=crmDateAtTimeToIso((row as any).reserved_until);
    if(!dueAt)return invalid("Das hinterlegte Ablaufdatum ist kein gültiges Datum.");
    const {error}=await supabase.from("tasks").insert({
      title:`Reservierung läuft ab · ${(row as any).reservation_number}`,
      description:"Vor Ablauf klären, ob die Reservierung verlängert wird, in einen Verkauf übergeht oder endet.",
      status:"OPEN",priority:"HIGH",due_at:dueAt,
      responsible_user:(row as any).primary_responsible_user,
      property_id:(row as any).property_id,
      contact_id:(row as any).contact_id,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(zurueck(fd),{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}
