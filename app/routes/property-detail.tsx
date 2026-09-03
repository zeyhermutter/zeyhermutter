import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-detail";
import { requirePermission } from "~/lib/auth.server";

type FeatureChoice = { key:string; label:string };
type ActionResult = { error?: string; success?: string; featurePreview?: { entered:string; formatted:string; exact?:FeatureChoice; suggestion?:FeatureChoice } };

const TYPE_LABELS: Record<string,string> = {
  DETACHED_HOUSE:"Einfamilienhaus",SEMI_DETACHED_HOUSE:"Doppelhaushälfte",TERRACED_HOUSE:"Reihenhaus",APARTMENT_BUILDING:"Mehrfamilienhaus",APARTMENT:"Wohnung",PENTHOUSE:"Penthouse",MAISONETTE:"Maisonette",LAND:"Grundstück",COMMERCIAL:"Gewerbe",OFFICE:"Büro",RETAIL:"Einzelhandel",GARAGE:"Garage",PARKING_SPACE:"Stellplatz",OTHER:"Sonstige",
};
const FEATURE_OPTIONS = [
  ["BALCONY","Balkon"],["TERRACE","Terrasse"],["GARDEN","Garten"],["BASEMENT","Keller"],["GARAGE","Garage"],["PARKING_SPACE","Stellplatz"],["ELEVATOR","Aufzug"],["FIREPLACE","Kamin"],["FITTED_KITCHEN","Einbauküche"],["SAUNA","Sauna"],["POOL","Pool"],["PHOTOVOLTAIC","Photovoltaik"],["HEAT_PUMP","Wärmepumpe"],["UNDERFLOOR_HEATING","Fußbodenheizung"],["SMART_HOME","Smart Home"],["ACCESSIBLE","Barrierefrei"],
] as const;

function text(fd: FormData,key:string){return String(fd.get(key)??"").trim();}
function num(value:string){return value===""?null:Number(value.replace(",","."));}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(value));}
function normalizeFeatureLabel(value:string){return value.trim().toLocaleLowerCase("de-DE").replaceAll("ß","ss").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");}
function formatFeatureLabel(value:string){const clean=value.trim().replace(/\s+/g," ");return clean?clean.charAt(0).toLocaleUpperCase("de-DE")+clean.slice(1):clean;}
function customFeatureKey(value:string){const normalized=normalizeFeatureLabel(value).toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"");return `CUSTOM_${normalized.slice(0,52)}`;}
function levenshtein(a:string,b:string){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return row[b.length];}
function findFeatureMatch(value:string,options:FeatureChoice[]){const normalized=normalizeFeatureLabel(value);const exact=options.find((o)=>normalizeFeatureLabel(o.label)===normalized);if(exact)return {exact};let best:FeatureChoice|undefined;let bestDistance=Infinity;for(const option of options){const distance=levenshtein(normalized,normalizeFeatureLabel(option.label));if(distance<bestDistance){bestDistance=distance;best=option;}}const threshold=normalized.length<=8?1:normalized.length<=16?2:3;return {suggestion:bestDistance<=threshold?best:undefined};}

const STATUS_LABELS: Record<string,string> = {
  DRAFT:"Entwurf", ACQUISITION:"Akquise", VALUATION:"Bewertung", CONTRACT_PENDING:"Vertrag in Vorbereitung",
  PREPARATION:"Vorbereitung", MARKETING:"Vermarktung", RESERVED:"Reserviert", NOTARY:"Notar",
  SOLD:"Verkauft", LOST:"Verloren", WITHDRAWN:"Zurückgezogen", ARCHIVED:"Archiviert",
};
function labelStatus(value:string){return STATUS_LABELS[value]??value.replaceAll("_"," ");}
function auditValueLabel(value:unknown){if(value===null||value===undefined||value==="")return"—";const raw=typeof value==="object"?JSON.stringify(value):String(value);return raw.length>140?`${raw.slice(0,137)}…`:raw;}

const MANDATE_TYPE: Record<string,string> = {SIMPLE:"Einfacher Auftrag",EXCLUSIVE:"Alleinauftrag",QUALIFIED_EXCLUSIVE:"Qualifizierter Alleinauftrag"};
const GWG_RISK: Record<string,string> = {LOW:"gering",MEDIUM:"mittel",HIGH:"hoch"};
const ENCUMBRANCE_SECTION: Record<string,string> = {LAND_REGISTER_II:"Abt. II",LAND_REGISTER_III:"Abt. III",BUILDING_ENCUMBRANCE:"Baulast"};
const ENCUMBRANCE_KIND: Record<string,string> = {RESIDENCE_RIGHT:"Wohnrecht",USUFRUCT:"Nießbrauch",RIGHT_OF_WAY:"Wegerecht",UTILITY_EASEMENT:"Leitungsrecht",PRE_EMPTION_RIGHT:"Vorkaufsrecht",REAL_CHARGE:"Reallast",HERITABLE_BUILDING_RIGHT:"Erbbaurecht",PRIORITY_NOTICE:"Auflassungsvormerkung",REDEVELOPMENT_NOTE:"Sanierungsvermerk",REALLOCATION_NOTE:"Umlegungsvermerk",INSOLVENCY_NOTE:"Insolvenzvermerk",LAND_CHARGE:"Grundschuld",MORTGAGE:"Hypothek",ANNUITY_CHARGE:"Rentenschuld",ACCESS:"Zufahrtsbaulast",DISTANCE_AREA:"Abstandsflächenbaulast",PARKING:"Stellplatzbaulast",UNION:"Vereinigungsbaulast",DEVELOPMENT:"Erschließungsbaulast",CHILDREN_PLAYGROUND:"Spielplatzbaulast",OTHER:"Sonstiges"};
const ENCUMBRANCE_IMPACT: Record<string,string> = {NONE:"ohne Auswirkung",TRANSFERS_TO_BUYER:"geht auf den Käufer über",MUST_BE_DELETED:"muss gelöscht werden",PURCHASE_PRICE_RELEVANT:"kaufpreisrelevant",UNCLEAR:"Auswirkung offen"};
function euro(value:any){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n):"—";}
function formatDay(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
const MANDATE_STATUS: Record<string,string> = {DRAFT:"Entwurf",ACTIVE:"Aktiv",WITHDRAWN:"Widerrufen",TERMINATED:"Gekündigt",EXPIRED:"Abgelaufen",FULFILLED:"Erfüllt",CANCELLED:"Verworfen"};

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "property.read");
  const propertyId=params.propertyId;
  const newOwner=new URL(request.url).searchParams.get("newOwner")??"";
  const { data: property, error } = await supabase.from("properties").select("*").eq("id",propertyId).maybeSingle();
  if(error||!property) throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});

  const [addressRes,ownersRes,contactsRes,featuresRes,customFeaturesRes,energyRes,checklistRes,transitionsRes,usersRes,auditPermissionRes,gwgPermissionRes,legalRes,encumbranceRes,gwgCaseRes,mandatesRes] = await Promise.all([
    supabase.from("property_addresses").select("*").eq("property_id",propertyId).maybeSingle(),
    supabase.from("property_owners").select("*").eq("property_id",propertyId).order("primary_contact",{ascending:false}),
    supabase.from("contacts").select("id, contact_number, first_name, last_name, email").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("property_features").select("*").eq("property_id",propertyId).order("label"),
    supabase.from("property_features").select("feature_key,label").like("feature_key","CUSTOM_%").order("label").limit(1000),
    supabase.from("property_energy_data").select("*").eq("property_id",propertyId).maybeSingle(),
    supabase.from("property_marketing_checklist_items").select("*").eq("property_id",propertyId).order("category").order("title"),
    supabase.from("property_status_transitions").select("to_status, description").eq("from_status",property.status).order("to_status"),
    supabase.from("profiles").select("user_id, display_name").eq("status","ACTIVE").order("display_name"),
    supabase.rpc("current_user_has_permission",{p_permission:"audit.read"}),
    supabase.rpc("current_user_has_permission",{p_permission:"gwg.read"}),
    supabase.from("property_legal_data").select("id,land_registry_court,land_register_sheet,extract_dated_on,living_area_basis,heritable_building_right,ground_lease_until,monument_protection,milieu_protection,redevelopment_area,contamination_suspicion,development_charges_open").eq("property_id",propertyId).maybeSingle(),
    supabase.from("property_encumbrances").select("id,section,kind,rank_position,content,beneficiary_name,nominal_amount,remaining_amount,deletable,deletion_consent_available,sale_impact,deleted_on,archived_at").eq("property_id",propertyId).is("archived_at",null).is("deleted_on",null).order("section").order("rank_position",{nullsFirst:false}),
    supabase.from("gwg_cases").select("id,case_number,risk_level,risk_assessed_on,retention_until,legal_hold,archived_at,gwg_identifications(id,party_role,identified_on)").eq("property_id",propertyId).is("archived_at",null).limit(1),
    supabase.from("brokerage_mandates").select("id,mandate_number,mandate_type,client_side,status,client_is_consumer,text_form_confirmed,term_start,term_end,withdrawal_instruction_given_on,withdrawal_deadline_on,early_start_requested_on").eq("property_id",propertyId).is("archived_at",null).order("updated_at",{ascending:false}).limit(20),
  ]);
  const firstError=[addressRes,ownersRes,contactsRes,featuresRes,customFeaturesRes,energyRes,checklistRes,transitionsRes,usersRes].find((r)=>r.error)?.error;
  if(firstError) throw new Response("Objektdaten konnten nicht vollständig geladen werden.",{status:500,headers:responseHeaders()});

  let auditEvents:any[]=[];
  if(auditPermissionRes.data===true){
    const auditRes=await supabase.from("audit_events").select("id,occurred_at,actor_display_name_snapshot,action,field_changes,metadata").eq("entity_type","PROPERTY").eq("entity_id",propertyId).order("occurred_at",{ascending:false}).limit(60);
    if(!auditRes.error) auditEvents=auditRes.data??[];
  }
  const contactMap=Object.fromEntries((contactsRes.data??[]).map((c)=>[c.id,c]));
  const customFeatureOptions=Array.from(new Map((customFeaturesRes.data??[]).map((f)=>[f.feature_key,{key:f.feature_key,label:f.label}])).values());
  return data({property,mandates:mandatesRes.data??[],canGwgRead:gwgPermissionRes.data===true,gwgCase:(gwgCaseRes.data??[])[0]??null,legal:legalRes.data??null,encumbrances:encumbranceRes.data??[],address:addressRes.data,owners:ownersRes.data??[],contacts:contactsRes.data??[],contactMap,features:featuresRes.data??[],customFeatureOptions,energy:energyRes.data,checklist:checklistRes.data??[],transitions:transitionsRes.data??[],users:usersRes.data??[],auditEvents,profile,newOwner},{headers:responseHeaders()});
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const session=await requirePermission(request,context.cloudflare.env,"property.write");
  const {supabase,responseHeaders,userId}=session;
  const propertyId=params.propertyId;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const conflict=()=>data<ActionResult>({error:"Der Datensatz wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="core"){
    const version=Number(text(fd,"version"));
    const transactionType=text(fd,"transaction_type");
    const responsibleUser=text(fd,"primary_responsible_user")||null;
    const {data:currentProperty}=await supabase.from("properties").select("primary_responsible_user").eq("id",propertyId).maybeSingle();
    if(currentProperty?.primary_responsible_user!==responsibleUser){
      await requirePermission(request,context.cloudflare.env,"property.assign");
    }
    const update={
      internal_title:text(fd,"internal_title"), property_type:text(fd,"property_type"), transaction_type:transactionType,
      primary_responsible_user:responsibleUser, purchase_price:transactionType==="SALE"?num(text(fd,"purchase_price")):null,
      rent_cold:transactionType==="RENT"?num(text(fd,"rent_cold")):null,
      additional_costs:num(text(fd,"additional_costs")), hoa_fee:num(text(fd,"hoa_fee")), living_area_sqm:num(text(fd,"living_area_sqm")), usable_area_sqm:num(text(fd,"usable_area_sqm")), plot_area_sqm:num(text(fd,"plot_area_sqm")), rooms:num(text(fd,"rooms")), bedrooms:num(text(fd,"bedrooms")), bathrooms:num(text(fd,"bathrooms")), floor:num(text(fd,"floor")), year_built:num(text(fd,"year_built")), modernization_year:num(text(fd,"modernization_year")), condition:text(fd,"condition")||null, available_from:text(fd,"available_from")||null, tenancy_status:text(fd,"tenancy_status")||null, parking_spaces:num(text(fd,"parking_spaces")), residential_units:num(text(fd,"residential_units")), internal_notes:text(fd,"internal_notes")||null,
    };
    if(!update.internal_title) return data<ActionResult>({error:"Interner Titel ist erforderlich."},{status:400,headers:responseHeaders()});
    const {data:updated,error}=await supabase.from("properties").update(update).eq("id",propertyId).eq("version",version).select("id").maybeSingle();
    if(error) return data<ActionResult>({error:"Objektstammdaten konnten nicht gespeichert werden."},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/properties/${propertyId}#stammdaten`,{headers:responseHeaders()});
  }

  if(intent==="status"){
    const target=text(fd,"target_status"), version=Number(text(fd,"version"));
    const {data:current}=await supabase.from("properties").select("status").eq("id",propertyId).maybeSingle();
    if(target==="ARCHIVED"||current?.status==="ARCHIVED") await requirePermission(request,context.cloudflare.env,"property.archive");
    const {data:updated,error}=await supabase.from("properties").update({status:target}).eq("id",propertyId).eq("version",version).select("id").maybeSingle();
    if(error){
      if(String(error.message??"").includes("PROPERTY_MARKETING_NOT_READY")){
        const missing=String(error.details??"").trim();
        return data<ActionResult>({error:`Vermarktung kann noch nicht gestartet werden.${missing?` Fehlend: ${missing}.`:" Bitte die Vermarktungsreife prüfen."}`},{status:400,headers:responseHeaders()});
      }
      if(String(error.message??"").includes("PROPERTY_PUBLISH_REQUIRED")){
        return data<ActionResult>({error:"Für den Start der Vermarktung fehlt die Berechtigung „Immobilie veröffentlichen“."},{status:403,headers:responseHeaders()});
      }
      return data<ActionResult>({error:"Dieser Statuswechsel ist fachlich nicht zulässig."},{status:400,headers:responseHeaders()});
    }
    if(!updated)return conflict();
    return redirect(`/properties/${propertyId}#status`,{headers:responseHeaders()});
  }

  if(intent==="address"){
    const addressId=text(fd,"address_id"), version=Number(text(fd,"address_version")||"0");
    const country=(text(fd,"country")||"DE").toUpperCase();
    const latitude=num(text(fd,"latitude")), longitude=num(text(fd,"longitude"));
    if(!/^[A-Z]{2}$/.test(country))return data<ActionResult>({error:"Land muss als zweistelliger Ländercode angegeben werden, z. B. DE."},{status:400,headers:responseHeaders()});
    if(latitude!==null&&(!Number.isFinite(latitude)||latitude < -90||latitude > 90))return data<ActionResult>({error:"Breitengrad muss zwischen -90 und 90 liegen."},{status:400,headers:responseHeaders()});
    if(longitude!==null&&(!Number.isFinite(longitude)||longitude < -180||longitude > 180))return data<ActionResult>({error:"Längengrad muss zwischen -180 und 180 liegen."},{status:400,headers:responseHeaders()});
    const payload={street:text(fd,"street"),house_number:text(fd,"house_number"),postal_code:text(fd,"postal_code"),city:text(fd,"city"),district:text(fd,"district")||null,country,latitude,longitude,public_address_mode:text(fd,"public_address_mode")||"CITY_ONLY"};
    if(!payload.street||!payload.house_number||!payload.postal_code||!payload.city)return data<ActionResult>({error:"Straße, Hausnummer, PLZ und Ort sind erforderlich."},{status:400,headers:responseHeaders()});
    if(addressId){
      const {data:updated,error}=await supabase.from("property_addresses").update(payload).eq("id",addressId).eq("version",version).select("id").maybeSingle();
      if(error)return data<ActionResult>({error:"Adresse konnte nicht gespeichert werden."},{status:400,headers:responseHeaders()}); if(!updated)return conflict();
    } else {
      const {error}=await supabase.from("property_addresses").insert({...payload,property_id:propertyId,created_by:userId,updated_by:userId});
      if(error)return data<ActionResult>({error:"Adresse konnte nicht angelegt werden."},{status:400,headers:responseHeaders()});
    }
    return redirect(`/properties/${propertyId}#adresse`,{headers:responseHeaders()});
  }

  if(intent==="owner_add"){
    const contactId=text(fd,"contact_id"); if(!contactId)return data<ActionResult>({error:"Eigentümer auswählen."},{status:400,headers:responseHeaders()});
    const percentage=num(text(fd,"ownership_percentage"));
    const {error}=await supabase.from("property_owners").insert({property_id:propertyId,contact_id:contactId,ownership_percentage:percentage,ownership_type:text(fd,"ownership_type")||null,primary_contact:fd.get("primary_contact")==="on",valid_from:text(fd,"valid_from")||null,valid_until:text(fd,"valid_until")||null,created_by:userId,updated_by:userId});
    if(error)return data<ActionResult>({error:"Eigentümer konnte nicht zugeordnet werden. Prüfe insbesondere die Eigentumsanteile (max. 100 %)."},{status:400,headers:responseHeaders()});
    return redirect(`/properties/${propertyId}#eigentuemer`,{headers:responseHeaders()});
  }
  if(intent==="owner_update"){
    const ownerId=text(fd,"owner_id");
    const version=Number(text(fd,"owner_version"));
    const percentage=num(text(fd,"ownership_percentage"));
    const validFrom=text(fd,"valid_from")||null;
    const validUntil=text(fd,"valid_until")||null;
    if(percentage!==null&&(!Number.isFinite(percentage)||percentage<0||percentage>100)){
      return data<ActionResult>({error:"Der Eigentumsanteil muss zwischen 0 und 100 % liegen."},{status:400,headers:responseHeaders()});
    }
    if(validFrom&&validUntil&&validUntil<validFrom){
      return data<ActionResult>({error:"„Gültig bis“ darf nicht vor „Gültig ab“ liegen."},{status:400,headers:responseHeaders()});
    }
    const payload={
      ownership_percentage:percentage,
      ownership_type:text(fd,"ownership_type")||null,
      primary_contact:fd.get("primary_contact")==="on",
      valid_from:validFrom,
      valid_until:validUntil,
    };
    const {data:updated,error}=await supabase.from("property_owners").update(payload).eq("id",ownerId).eq("property_id",propertyId).eq("version",version).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:"Eigentümerangaben konnten nicht gespeichert werden. Prüfe insbesondere Gesamtanteil und Hauptkontakt."},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/properties/${propertyId}#owner-${ownerId}`,{headers:responseHeaders()});
  }
  if(intent==="owner_remove"){
    const {data:removed,error}=await supabase.from("property_owners").delete().eq("id",text(fd,"owner_id")).eq("property_id",propertyId).eq("version",Number(text(fd,"owner_version"))).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:"Eigentümerbeziehung konnte nicht entfernt werden."},{status:400,headers:responseHeaders()}); if(!removed)return conflict();
    return redirect(`/properties/${propertyId}#eigentuemer`,{headers:responseHeaders()});
  }

  if(intent==="feature_add"){
    const key=text(fd,"feature_key");
    let option:FeatureChoice|undefined=FEATURE_OPTIONS.map(([k,l])=>({key:k,label:l})).find((o)=>o.key===key);
    if(!option&&key.startsWith("CUSTOM_")){
      const {data:custom}=await supabase.from("property_features").select("feature_key,label").eq("feature_key",key).limit(1).maybeSingle();
      if(custom)option={key:custom.feature_key,label:custom.label};
    }
    if(!option)return data<ActionResult>({error:"Ungültiges Ausstattungsmerkmal."},{status:400,headers:responseHeaders()});
    const {error}=await supabase.from("property_features").insert({property_id:propertyId,feature_key:option.key,label:option.label,value_type:"BOOLEAN",boolean_value:true,created_by:userId,updated_by:userId});
    if(error)return data<ActionResult>({error:"Merkmal ist bereits vorhanden oder konnte nicht gespeichert werden."},{status:400,headers:responseHeaders()});
    return redirect(`/properties/${propertyId}#ausstattung`,{headers:responseHeaders()});
  }
  if(intent==="feature_custom_preview"){
    const entered=text(fd,"custom_feature");
    if(entered.length<2||entered.length>60)return data<ActionResult>({error:"Eigene Ausstattung muss zwischen 2 und 60 Zeichen lang sein."},{status:400,headers:responseHeaders()});
    if(!/[\p{L}\p{N}]/u.test(entered))return data<ActionResult>({error:"Bitte einen verständlichen Ausstattungsbegriff eingeben."},{status:400,headers:responseHeaders()});
    const {data:customRows}=await supabase.from("property_features").select("feature_key,label").like("feature_key","CUSTOM_%").limit(1000);
    const options:FeatureChoice[]=[...FEATURE_OPTIONS.map(([key,label])=>({key,label})),...Array.from(new Map((customRows??[]).map((f)=>[f.feature_key,{key:f.feature_key,label:f.label}])).values())];
    const formatted=formatFeatureLabel(entered);
    const match=findFeatureMatch(formatted,options);
    const targetKey=match.exact?.key??customFeatureKey(formatted);
    const {data:alreadyUsed}=await supabase.from("property_features").select("id").eq("property_id",propertyId).eq("feature_key",targetKey).maybeSingle();
    if(alreadyUsed)return data<ActionResult>({error:`„${match.exact?.label??formatted}“ ist bei dieser Immobilie bereits vorhanden.`},{status:400,headers:responseHeaders()});
    return data<ActionResult>({featurePreview:{entered,formatted,...match}},{headers:responseHeaders()});
  }
  if(intent==="feature_custom_confirm"){
    if(text(fd,"confirmed")!=="yes")return data<ActionResult>({error:"Die neue Ausstattung muss vor dem Übernehmen noch einmal bestätigt werden."},{status:400,headers:responseHeaders()});
    const entered=text(fd,"custom_feature");
    const choice=text(fd,"feature_choice");
    if(entered.length<2||entered.length>60)return data<ActionResult>({error:"Ungültiger Ausstattungsbegriff."},{status:400,headers:responseHeaders()});
    const {data:customRows}=await supabase.from("property_features").select("feature_key,label").like("feature_key","CUSTOM_%").limit(1000);
    const options:FeatureChoice[]=[...FEATURE_OPTIONS.map(([key,label])=>({key,label})),...Array.from(new Map((customRows??[]).map((f)=>[f.feature_key,{key:f.feature_key,label:f.label}])).values())];
    const formatted=formatFeatureLabel(entered);
    const match=findFeatureMatch(formatted,options);
    let option:FeatureChoice;
    if(choice==="suggestion"&&match.suggestion)option=match.suggestion;
    else if(match.exact)option=match.exact;
    else option={key:customFeatureKey(formatted),label:formatted};
    const {error}=await supabase.from("property_features").insert({property_id:propertyId,feature_key:option.key,label:option.label,value_type:"BOOLEAN",boolean_value:true,created_by:userId,updated_by:userId});
    if(error)return data<ActionResult>({error:"Merkmal ist bereits vorhanden oder konnte nicht gespeichert werden."},{status:400,headers:responseHeaders()});
    return redirect(`/properties/${propertyId}#ausstattung`,{headers:responseHeaders()});
  }
  if(intent==="feature_remove"){
    const {data:removed,error}=await supabase.from("property_features").delete().eq("id",text(fd,"feature_id")).eq("version",Number(text(fd,"feature_version"))).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:"Merkmal konnte nicht entfernt werden."},{status:400,headers:responseHeaders()}); if(!removed)return conflict();
    return redirect(`/properties/${propertyId}#ausstattung`,{headers:responseHeaders()});
  }

  if(intent==="energy"){
    const energyId=text(fd,"energy_id"), certificatePresent=fd.get("certificate_present")==="on";
    const payload={certificate_present:certificatePresent,certificate_type:certificatePresent?(text(fd,"certificate_type")||null):null,energy_value_kwh:certificatePresent?num(text(fd,"energy_value_kwh")):null,efficiency_class:certificatePresent?(text(fd,"efficiency_class")||null):null,energy_source:certificatePresent?(text(fd,"energy_source")||null):null,building_year:certificatePresent?num(text(fd,"energy_building_year")):null,valid_until:certificatePresent?(text(fd,"energy_valid_until")||null):null,notes:text(fd,"energy_notes")||null};
    if(energyId){
      const {data:updated,error}=await supabase.from("property_energy_data").update(payload).eq("id",energyId).eq("version",Number(text(fd,"energy_version"))).select("id").maybeSingle();
      if(error)return data<ActionResult>({error:"Energiedaten konnten nicht gespeichert werden."},{status:400,headers:responseHeaders()}); if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("property_energy_data").insert({...payload,property_id:propertyId,created_by:userId,updated_by:userId}); if(error)return data<ActionResult>({error:"Energiedaten konnten nicht angelegt werden."},{status:400,headers:responseHeaders()});
    }
    return redirect(`/properties/${propertyId}#energie`,{headers:responseHeaders()});
  }

  if(intent==="checklist"){
    const status=text(fd,"checklist_status");
    const payload:any={status,completed_at:status==="DONE"?new Date().toISOString():null,completed_by:status==="DONE"?userId:null};
    const {data:updated,error}=await supabase.from("property_marketing_checklist_items").update(payload).eq("id",text(fd,"checklist_id")).eq("version",Number(text(fd,"checklist_version"))).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:"Checklistenpunkt konnte nicht aktualisiert werden."},{status:400,headers:responseHeaders()}); if(!updated)return conflict();
    return redirect(`/properties/${propertyId}#checkliste`,{headers:responseHeaders()});
  }

  return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

export default function PropertyDetail(){
  const d=useLoaderData<typeof loader>(); const result=useActionData<typeof action>(); const p=d.property;
  const usedFeatures=new Set(d.features.map((f)=>f.feature_key));
  const allFeatureOptions:FeatureChoice[]=[...FEATURE_OPTIONS.map(([key,label])=>({key,label})),...d.customFeatureOptions];
  return <main className="editor-shell">
    <header className="editor-header property-header"><div><Link className="back-link" to="/properties">← Immobilien</Link><p className="eyebrow">{p.property_number} · {p.transaction_type==="SALE"?"Verkauf":"Vermietung"}</p><div className="property-title-row"><h1 className="editor-title">{p.internal_title}</h1><span className={`status-pill status-${p.status.toLowerCase().replace("_","-")}`}>{labelStatus(p.status)}</span></div><p className="editor-meta">{TYPE_LABELS[p.property_type]??p.property_type} · Version {p.version}</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div></header>
    {result?.error?<div className="form-error">{result.error}</div>:null}

    <div className="property-summary-grid">
      <section className="data-card" id="status"><div className="card-head"><div><p className="eyebrow">Ablauf</p><h2>Status</h2></div><span className="badge">{labelStatus(p.status)}</span></div><div className="inline-actions">
        {p.status==="ARCHIVED" && p.status_before_archive ? <Form method="post"><input type="hidden" name="_intent" value="status"/><input type="hidden" name="version" value={p.version}/><input type="hidden" name="target_status" value={p.status_before_archive}/><button className="secondary-button" type="submit">Wiederherstellen → {labelStatus(p.status_before_archive)}</button></Form> : d.transitions.map((t)=><Form method="post" key={t.to_status}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="version" value={p.version}/><input type="hidden" name="target_status" value={t.to_status}/><button className="secondary-button" type="submit" title={t.description??""}>→ {labelStatus(t.to_status)}</button></Form>)}
      </div></section>
      <section className="data-card" id="maklerauftrag"><div className="card-head"><div><p className="eyebrow">Beauftragung</p><h2>Maklerauftrag</h2></div><Link className="subtle-link" to={`/mandates?property_id=${encodeURIComponent(p.id)}`}>Aufträge öffnen →</Link></div>{d.mandates.length===0?<p className="empty-state">Für diese Immobilie ist kein Maklerauftrag erfasst.</p>:d.mandates.map((m:any)=>{const risk=m.status==="ACTIVE"&&m.client_is_consumer&&(!m.withdrawal_instruction_given_on||(m.withdrawal_deadline_on&&m.withdrawal_deadline_on>=new Date().toISOString().slice(0,10)&&!m.early_start_requested_on));return <Link className="data-row data-row-link" to={`/mandates/${m.id}`} key={m.id}><div><strong>{m.mandate_number} · {MANDATE_TYPE[m.mandate_type]??m.mandate_type}</strong><small>{MANDATE_STATUS[m.status]??m.status}{m.term_start?` · ab ${new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(m.term_start))}`:""}</small></div><div className="row-meta">{risk?<span className="status-pill status-lost">Widerruf offen</span>:<span>{m.text_form_confirmed?"Textform dokumentiert":"Textform offen"}</span>}</div><span className="subtle-link">Öffnen →</span></Link>;})}</section>
      <section className="data-card" id="recht-lasten"><div className="card-head"><div><p className="eyebrow">Rechtsobjekt</p><h2>Recht & Lasten</h2></div><Link className="subtle-link" to={`/properties/${p.id}/legal`}>Erfassen & prüfen →</Link></div>{(()=>{
        const l=d.legal as any;const rows=(d.encumbrances??[]) as any[];
        const flags=l?[l.monument_protection?"Denkmalschutz":null,l.milieu_protection?"Milieuschutz":null,l.redevelopment_area?"Sanierungsgebiet":null,l.contamination_suspicion?"Altlastenverdacht":null,l.development_charges_open?"Erschließungsbeiträge offen":null,l.heritable_building_right?"Erbbaurecht":null].filter(Boolean) as string[]:[];
        if(!l&&rows.length===0)return <p className="empty-state">Für diese Immobilie sind keine Grundbuchdaten und keine Belastungen erfasst. Ohne diese Angaben lässt sich nicht beurteilen, was verkauft wird.</p>;
        const undeleted=rows.filter((row)=>row.section==="LAND_REGISTER_II"&&row.deletable!=="YES").length;
        const debt=rows.filter((row)=>row.section==="LAND_REGISTER_III").reduce((sum,row)=>sum+Number(row.remaining_amount??row.nominal_amount??0),0);
        return <>
          <dl className="detail-list">
            <div><dt>Grundbuch</dt><dd>{l?.land_registry_court||l?.land_register_sheet?[l?.land_registry_court,l?.land_register_sheet].filter(Boolean).join(" · "):"nicht erfasst"}</dd></div>
            <div><dt>Auszug vom</dt><dd>{formatDay(l?.extract_dated_on??null)}</dd></div>
            <div><dt>Wohnflächengrundlage</dt><dd>{l?.living_area_basis==="WOFLV"?"Wohnflächenverordnung":l?.living_area_basis==="DIN_277"?"DIN 277":l?.living_area_basis==="ESTIMATED"?"Geschätzt":"Unbekannt"}</dd></div>
            {rows.some((row)=>row.section==="LAND_REGISTER_III")?<div><dt>Offene Grundpfandrechte</dt><dd>{euro(debt)}</dd></div>:null}
          </dl>
          {flags.length?<div className="inline-actions" style={{marginTop:"0.5rem"}}>{flags.map((flag)=><span className="status-pill status-lost" key={flag}>{flag}</span>)}</div>:null}
          {rows.length?<div className="data-list" style={{marginTop:"0.75rem"}}>{rows.map((row:any)=><Link className="data-row data-row-link" to={`/properties/${p.id}/legal#${row.section.toLowerCase()}`} key={row.id}>
            <div><strong>{ENCUMBRANCE_SECTION[row.section]}{row.rank_position?` · Rang ${row.rank_position}`:""} · {ENCUMBRANCE_KIND[row.kind]??row.kind}</strong><small>{row.beneficiary_name?`${row.beneficiary_name} · `:""}{row.content.length>80?`${row.content.slice(0,80)}…`:row.content}</small></div>
            <div className="row-meta">{row.section==="LAND_REGISTER_III"?<span>{euro(row.remaining_amount??row.nominal_amount)}</span>:<span className={row.deletable==="NO"?"status-pill status-lost":""}>{row.deletable==="NO"?"nicht löschbar":row.deletable==="YES"?"löschbar":"Löschbarkeit offen"}</span>}<small>{ENCUMBRANCE_IMPACT[row.sale_impact]}</small></div>
            <span className="subtle-link">Öffnen →</span>
          </Link>)}</div>:<p className="subtle" style={{marginTop:"0.75rem"}}>Keine bestehenden Belastungen erfasst.</p>}
          {undeleted?<p className="form-warning" style={{marginTop:"0.75rem"}}>{undeleted === 1 ? "Ein Recht" : `${undeleted} Rechte`} in Abteilung II {undeleted===1?"ist":"sind"} nicht als löschbar dokumentiert. Vor Vermarktungsstart klären, ob es beim Verkauf bestehen bleibt.</p>:null}
        </>;
      })()}</section>
      {d.canGwgRead?<section className="data-card" id="geldwaesche"><div className="card-head"><div><p className="eyebrow">Sorgfaltspflichten</p><h2>Geldwäsche-Compliance</h2></div><Link className="subtle-link" to={`/properties/${p.id}/compliance`}>Akte öffnen →</Link></div>{(()=>{const g=d.gwgCase as any;if(!g)return <p className="empty-state">Für diese Immobilie ist keine Geldwäscheakte angelegt.</p>;const ids=(g.gwg_identifications??[]) as any[];const seller=ids.filter((i)=>i.party_role==="SELLER"&&i.identified_on).length;const buyer=ids.filter((i)=>i.party_role==="BUYER"&&i.identified_on).length;return <Link className="data-row data-row-link" to={`/properties/${p.id}/compliance`}><div><strong>{g.case_number}</strong><small>{g.risk_level?`Risiko ${GWG_RISK[g.risk_level]??g.risk_level}`:"Risikoeinstufung offen"} · Verkäuferseite {seller?"identifiziert":"offen"} · Käuferseite {buyer?"identifiziert":"offen"}</small></div><div className="row-meta">{g.risk_level&&seller?<span className="status-pill status-sold">Erfasst</span>:<span className="status-pill status-lost">Unvollständig</span>}<small>{g.retention_until?`Aufbewahrung bis ${formatDay(g.retention_until)}`:"Aufbewahrung offen"}</small></div><span className="subtle-link">Öffnen →</span></Link>;})()}</section>:null}
      <section className="data-card" id="checkliste"><div className="card-head"><div><p className="eyebrow">Vermarktungsreife</p><h2>Checkliste</h2></div><span className="subtle">{d.checklist.filter((i)=>i.status==="DONE"||i.status==="WAIVED").length}/{d.checklist.length}</span></div>{d.checklist.map((item)=><Form method="post" className={`checklist-row checklist-${item.status.toLowerCase().replace("_","-")}`} key={item.id}><input type="hidden" name="_intent" value="checklist"/><input type="hidden" name="checklist_id" value={item.id}/><input type="hidden" name="checklist_version" value={item.version}/><div><strong>{item.title}</strong><small>{item.category}{item.required?" · Pflicht":" · optional"}</small></div><select name="checklist_status" defaultValue={item.status} onChange={(e)=>e.currentTarget.form?.requestSubmit()}><option value="TODO">Offen</option><option value="IN_PROGRESS">In Arbeit</option><option value="DONE">Erledigt</option><option value="WAIVED">Entfällt</option></select></Form>)}</section>
    </div>

    <section className="editor-card property-section" id="stammdaten"><div className="card-head"><div><p className="eyebrow">Objektstammdaten</p><h2>Basis & Kennzahlen</h2></div></div><Form method="post"><input type="hidden" name="_intent" value="core"/><input type="hidden" name="version" value={p.version}/><div className="form-grid">
      <label className="form-field"><span>Interner Titel</span><input name="internal_title" defaultValue={p.internal_title} required/></label><label className="form-field"><span>Typ</span><select name="property_type" defaultValue={p.property_type}>{Object.entries(TYPE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Transaktion</span><select name="transaction_type" defaultValue={p.transaction_type}><option value="SALE">Verkauf</option><option value="RENT">Vermietung</option></select></label>
      <label className="form-field"><span>Verantwortlicher Benutzer</span><select name="primary_responsible_user" defaultValue={p.primary_responsible_user??""}><option value="">Nicht zugewiesen</option>{d.users.map((u)=><option key={u.user_id} value={u.user_id}>{u.display_name}</option>)}</select></label>
      <label className="form-field"><span>Kaufpreis</span><input name="purchase_price" defaultValue={p.purchase_price??""}/></label><label className="form-field"><span>Kaltmiete</span><input name="rent_cold" defaultValue={p.rent_cold??""}/></label><label className="form-field"><span>Nebenkosten</span><input name="additional_costs" defaultValue={p.additional_costs??""}/></label><label className="form-field"><span>Hausgeld</span><input name="hoa_fee" defaultValue={p.hoa_fee??""}/></label><label className="form-field"><span>Wohnfläche m²</span><input name="living_area_sqm" defaultValue={p.living_area_sqm??""}/></label><label className="form-field"><span>Nutzfläche m²</span><input name="usable_area_sqm" defaultValue={p.usable_area_sqm??""}/></label><label className="form-field"><span>Grundstück m²</span><input name="plot_area_sqm" defaultValue={p.plot_area_sqm??""}/></label><label className="form-field"><span>Zimmer</span><input name="rooms" defaultValue={p.rooms??""}/></label><label className="form-field"><span>Schlafzimmer</span><input name="bedrooms" defaultValue={p.bedrooms??""}/></label><label className="form-field"><span>Bäder</span><input name="bathrooms" defaultValue={p.bathrooms??""}/></label><label className="form-field"><span>Etage</span><input name="floor" defaultValue={p.floor??""}/></label><label className="form-field"><span>Baujahr</span><input name="year_built" defaultValue={p.year_built??""}/></label><label className="form-field"><span>Modernisiert</span><input name="modernization_year" defaultValue={p.modernization_year??""}/></label><label className="form-field"><span>Zustand</span><input name="condition" defaultValue={p.condition??""}/></label><label className="form-field"><span>Verfügbar ab</span><input name="available_from" type="date" defaultValue={p.available_from??""}/></label><label className="form-field"><span>Vermietungsstatus</span><select name="tenancy_status" defaultValue={p.tenancy_status??""}><option value="">—</option><option value="VACANT">Leerstehend</option><option value="OWNER_OCCUPIED">Eigengenutzt</option><option value="RENTED">Vermietet</option><option value="PARTIALLY_RENTED">Teilvermietet</option><option value="UNKNOWN">Unbekannt</option></select></label><label className="form-field"><span>Stellplätze</span><input name="parking_spaces" defaultValue={p.parking_spaces??""}/></label><label className="form-field"><span>Wohneinheiten</span><input name="residential_units" defaultValue={p.residential_units??""}/></label>
    </div><label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={5} defaultValue={p.internal_notes??""}/></label><div className="form-actions"><button className="primary-button" type="submit">Stammdaten speichern</button></div></Form></section>

    <div className="dashboard-grid property-section">
      <section className="data-card" id="adresse"><div className="card-head"><div><p className="eyebrow">Vertraulich intern</p><h2>Objektadresse</h2></div></div><Form method="post" className="auth-form"><input type="hidden" name="_intent" value="address"/><input type="hidden" name="address_id" value={d.address?.id??""}/><input type="hidden" name="address_version" value={d.address?.version??0}/><label><span>Straße</span><input name="street" defaultValue={d.address?.street??""} required/></label><label><span>Hausnummer</span><input name="house_number" defaultValue={d.address?.house_number??""} required/></label><label><span>PLZ</span><input name="postal_code" defaultValue={d.address?.postal_code??""} required/></label><label><span>Ort</span><input name="city" defaultValue={d.address?.city??""} required/></label><label><span>Ortsteil</span><input name="district" defaultValue={d.address?.district??""}/></label>
<label><span>Land</span><input name="country" maxLength={2} defaultValue={d.address?.country??"DE"} placeholder="DE"/></label>
<label><span>Breitengrad</span><input name="latitude" inputMode="decimal" defaultValue={d.address?.latitude??""} placeholder="z. B. 48,137"/></label>
<label><span>Längengrad</span><input name="longitude" inputMode="decimal" defaultValue={d.address?.longitude??""} placeholder="z. B. 11,575"/></label>
<label><span>Öffentlich zeigen</span><select name="public_address_mode" defaultValue={d.address?.public_address_mode??"CITY_ONLY"}><option value="FULL">Vollständig</option><option value="STREET_ONLY">Straße</option><option value="DISTRICT_ONLY">Ortsteil</option><option value="CITY_ONLY">Nur Ort</option><option value="HIDDEN">Verbergen</option></select></label><button className="primary-button" type="submit">Adresse speichern</button></Form></section>

      <section className="data-card" id="eigentuemer"><div className="card-head"><div><p className="eyebrow">Mehrfacheigentum möglich</p><h2>Eigentümer</h2><small className="subtle">Die Angaben hier gelten nur für diese Immobilie. Derselbe Kontakt kann bei anderen Immobilien andere Anteile haben.</small></div></div><div className="owner-list">{d.owners.map((owner)=>{const c=d.contactMap[owner.contact_id];return <details className="owner-card" id={`owner-${owner.id}`} key={owner.id}><summary><div><strong>{c?`${c.first_name} ${c.last_name}`:owner.contact_id}</strong><small>{owner.ownership_percentage??"?"} % · {owner.ownership_type??"ohne Typ"}{owner.primary_contact?" · Hauptkontakt":""}</small></div><span className="owner-edit-hint">Angaben bearbeiten</span></summary><Form method="post" className="auth-form owner-edit-form"><input type="hidden" name="_intent" value="owner_update"/><input type="hidden" name="owner_id" value={owner.id}/><input type="hidden" name="owner_version" value={owner.version}/><label><span>Anteil %</span><input name="ownership_percentage" inputMode="decimal" defaultValue={owner.ownership_percentage??""}/></label><label><span>Eigentumsart</span><input name="ownership_type" defaultValue={owner.ownership_type??""} placeholder="z. B. Miteigentum"/></label><label><span>Gültig ab</span><input name="valid_from" type="date" defaultValue={owner.valid_from??""}/></label><label><span>Gültig bis</span><input name="valid_until" type="date" defaultValue={owner.valid_until??""}/></label><label className="checkbox-row"><input type="checkbox" name="primary_contact" defaultChecked={owner.primary_contact}/><span>Hauptkontakt für diese Immobilie</span></label><div className="owner-edit-actions"><button className="primary-button" type="submit">Eigentümerangaben speichern</button></div></Form><Form method="post" className="owner-remove-form"><input type="hidden" name="_intent" value="owner_remove"/><input type="hidden" name="owner_id" value={owner.id}/><input type="hidden" name="owner_version" value={owner.version}/><button className="text-button" type="submit">Zuordnung zu dieser Immobilie entfernen</button></Form></details>})}{d.owners.length===0?<p className="empty-state">Noch kein Eigentümer zugeordnet.</p>:null}</div><Form method="post" className="auth-form compact-form"><input type="hidden" name="_intent" value="owner_add"/><label><span>Kontakt</span><select name="contact_id" defaultValue={d.newOwner} required><option value="">Auswählen…</option>{d.contacts.map((c)=><option key={c.id} value={c.id}>{c.last_name}, {c.first_name} · {c.contact_number}</option>)}</select></label><label><span>Anteil %</span><input name="ownership_percentage" inputMode="decimal"/></label><label><span>Eigentumsart</span><input name="ownership_type" placeholder="z. B. Miteigentum"/></label><label><span>Gültig ab</span><input name="valid_from" type="date"/></label><label><span>Gültig bis</span><input name="valid_until" type="date"/></label><label className="checkbox-row"><input type="checkbox" name="primary_contact"/><span>Hauptkontakt für diese Immobilie</span></label><div className="inline-actions owner-actions"><button className="secondary-button" type="submit">Eigentümer hinzufügen</button><Link className="subtle-link owner-create-link" to={`/crm/contacts/new?returnTo=${encodeURIComponent(`/properties/${p.id}#eigentuemer`)}`}>+ Neuen Eigentümer anlegen</Link></div></Form></section>
    </div>

    <div className="dashboard-grid property-section">
      <section className="data-card" id="ausstattung"><div className="card-head"><div><p className="eyebrow">Flexible Ausstattung</p><h2>Ausstattung</h2></div></div><div className="chip-list">{d.features.map((feature)=><Form method="post" key={feature.id}><input type="hidden" name="_intent" value="feature_remove"/><input type="hidden" name="feature_id" value={feature.id}/><input type="hidden" name="feature_version" value={feature.version}/><button className="feature-chip" type="submit" title="Entfernen">{feature.label} ×</button></Form>)}</div><Form method="post" className="inline-form"><input type="hidden" name="_intent" value="feature_add"/><select name="feature_key" defaultValue=""><option value="">Merkmal hinzufügen…</option>{allFeatureOptions.filter((o)=>!usedFeatures.has(o.key)).map((o)=><option key={o.key} value={o.key}>{o.label}</option>)}</select><button className="secondary-button" type="submit">Hinzufügen</button></Form><details className="section-separator"><summary className="subtle-link">+ Eigene Ausstattung ergänzen</summary><Form method="post" className="inline-form"><input type="hidden" name="_intent" value="feature_custom_preview"/><input name="custom_feature" lang="de" spellCheck={true} maxLength={60} placeholder="z. B. Wallbox" defaultValue={result?.featurePreview?.entered??""}/><button className="secondary-button" type="submit">Prüfen</button></Form><small className="subtle">Rechtschreibprüfung des Browsers ist aktiv. Zusätzlich wird auf vorhandene und ähnlich geschriebene Merkmale geprüft.</small>{result?.featurePreview?<div className="form-warning"><strong>Bitte noch einmal bestätigen:</strong><p>{result.featurePreview.exact?`„${result.featurePreview.formatted}“ gibt es bereits als „${result.featurePreview.exact.label}“. Es wird keine Dublette angelegt.`:result.featurePreview.suggestion?`„${result.featurePreview.formatted}“ ähnelt stark „${result.featurePreview.suggestion.label}“. Prüfe bitte die Schreibweise.`:`„${result.featurePreview.formatted}“ ist noch nicht vorhanden und kann als neues Merkmal übernommen werden.`}</p><div className="inline-actions">{result.featurePreview.suggestion&&!result.featurePreview.exact?<Form method="post"><input type="hidden" name="_intent" value="feature_custom_confirm"/><input type="hidden" name="confirmed" value="yes"/><input type="hidden" name="feature_choice" value="suggestion"/><input type="hidden" name="custom_feature" value={result.featurePreview.entered}/><button className="primary-button" type="submit">OK – {result.featurePreview.suggestion.label} verwenden</button></Form>:null}<Form method="post"><input type="hidden" name="_intent" value="feature_custom_confirm"/><input type="hidden" name="confirmed" value="yes"/><input type="hidden" name="feature_choice" value="entered"/><input type="hidden" name="custom_feature" value={result.featurePreview.entered}/><button className="secondary-button" type="submit">OK – {result.featurePreview.exact?result.featurePreview.exact.label:result.featurePreview.formatted} übernehmen</button></Form></div></div>:null}</details></section>
      <section className="data-card" id="energie"><div className="card-head"><div><p className="eyebrow">Energieausweis</p><h2>Energiedaten</h2></div></div><Form method="post" className="auth-form"><input type="hidden" name="_intent" value="energy"/><input type="hidden" name="energy_id" value={d.energy?.id??""}/><input type="hidden" name="energy_version" value={d.energy?.version??0}/><label className="checkbox-row"><input type="checkbox" name="certificate_present" defaultChecked={d.energy?.certificate_present??false}/><span>Energieausweis vorhanden</span></label><label><span>Art</span><select name="certificate_type" defaultValue={d.energy?.certificate_type??""}><option value="">—</option><option value="DEMAND">Bedarfsausweis</option><option value="CONSUMPTION">Verbrauchsausweis</option><option value="OTHER">Sonstige</option></select></label><label><span>Kennwert kWh/(m²·a)</span><input name="energy_value_kwh" defaultValue={d.energy?.energy_value_kwh??""}/></label><label><span>Effizienzklasse</span><select name="efficiency_class" defaultValue={d.energy?.efficiency_class??""}><option value="">—</option>{["A+","A","B","C","D","E","F","G","H"].map(v=><option key={v} value={v}>{v}</option>)}</select></label><label><span>Energieträger</span><input name="energy_source" defaultValue={d.energy?.energy_source??""}/></label><label><span>Gebäudebaujahr</span><input name="energy_building_year" defaultValue={d.energy?.building_year??""}/></label><label><span>Gültig bis</span><input name="energy_valid_until" type="date" defaultValue={d.energy?.valid_until??""}/></label><label><span>Notiz</span><textarea name="energy_notes" rows={3} defaultValue={d.energy?.notes??""}/></label><button className="primary-button" type="submit">Energiedaten speichern</button></Form></section>
    </div>

    {d.auditEvents.length>0?<section className="history-card property-section"><div className="card-head"><div><p className="eyebrow">Append-only</p><h2>Objekthistorie</h2></div><Link className="subtle-link" to={`/crm/history?entity=PROPERTY&reference=${encodeURIComponent(p.property_number)}`}>Systemhistorie</Link></div><div className="history-list">{d.auditEvents.map((event)=>{const changes=(event.field_changes??{}) as Record<string,{old?:unknown;new?:unknown}>;return <article className="history-event" key={event.id}><div className="history-head"><strong>{event.action}</strong><small>{formatDate(event.occurred_at)}</small></div><p>{event.actor_display_name_snapshot??"System"}{event.metadata?.change_type?` · ${event.metadata.change_type}`:""}</p>{Object.entries(changes).slice(0,12).map(([field,change])=><div className="history-change" key={field}><span>{field}</span><small>{auditValueLabel(change?.old)} → {auditValueLabel(change?.new)}</small></div>)}</article>})}</div></section>:null}
  </main>;
}
