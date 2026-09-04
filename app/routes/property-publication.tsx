import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-publication";
import { requirePermission } from "~/lib/auth.server";
import "~/publication.css";

type ActionResult={error?:string;success?:string};
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function slugify(value:string){return value.toLocaleLowerCase("de-DE").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ß/g,"ss").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90);}
function errorMessage(message:string){
 if(message.includes("PUBLIC_TEASER_TOO_SHORT"))return "Der Kurztext muss mindestens 20 Zeichen enthalten.";
 if(message.includes("PUBLIC_DESCRIPTION_TOO_SHORT"))return "Die öffentliche Beschreibung muss mindestens 40 Zeichen enthalten.";
 if(message.includes("PUBLIC_CONTENT_REVIEW_REQUIRED"))return "Vor der Versionserstellung muss die Inhalts- und Datenschutzprüfung bestätigt werden.";
 if(message.includes("PUBLIC_IMAGE_REQUIRED"))return "Mindestens ein Foto muss in der Medienbibliothek für die Veröffentlichung freigegeben sein.";
 if(message.includes("PUBLIC_LIVING_AREA_REQUIRED"))return "Für diesen Immobilientyp ist eine gültige Wohnfläche erforderlich.";
 if(message.includes("PUBLIC_PLOT_AREA_REQUIRED"))return "Für ein Grundstück ist eine gültige Grundstücksfläche erforderlich.";
 if(message.includes("PROPERTY_NOT_READY_FOR_PUBLICATION"))return "Eine Freigabeversion kann erst ab Objektstatus „Vorbereitung“ erzeugt werden.";
 if(message.includes("PROPERTY_NOT_IN_MARKETING"))return "Veröffentlichen ist erst möglich, wenn die Immobilie in Vermarktung oder Reserviert steht.";
 if(message.includes("PUBLIC_PRICE_REQUIRED")||message.includes("PUBLIC_RENT_REQUIRED"))return "Für die Veröffentlichung muss ein gültiger Preis hinterlegt sein.";
 if(message.includes("PUBLIC_MANDATORY_DISCLOSURES_MISSING"))return "Die Pflichtangaben zum Energieausweis sind unvollständig. Sie sind unter Pflichtangaben zu ergänzen oder als begründete Ausnahme zu erfassen.";
 if(message.includes("PROPERTY_ADDRESS_REQUIRED"))return "Für die Veröffentlichung muss eine Objektadresse vorhanden sein.";
 if(message.includes("PROPERTY_PUBLISH_REQUIRED"))return "Dir fehlt die Berechtigung zum Freigeben bzw. Veröffentlichen.";
 return "Die Veröffentlichungsaktion konnte nicht ausgeführt werden.";
}
function formatDate(value:string|null){return value?new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(value)):"—";}
function isPositive(value:any){return value!==null&&value!==undefined&&Number(value)>0;}

async function ensurePublicMediaCopies(supabase:any,propertyId:string){
 const {data:media,error}=await supabase.from("property_media").select("id,version,storage_bucket,storage_path").eq("property_id",propertyId).eq("media_type","IMAGE").eq("public_approved",true).is("archived_at",null).order("sort_order").order("created_at");
 if(error)throw new Error("PUBLIC_MEDIA_QUERY_FAILED");
 if(!media?.length)throw new Error("PUBLIC_IMAGE_REQUIRED");
 for(const item of media){
  const destination=`media/${item.id}/v${item.version}`;
  const {data:source,error:downloadError}=await supabase.storage.from(item.storage_bucket).download(item.storage_path);
  if(downloadError||!source)throw new Error("PUBLIC_MEDIA_COPY_FAILED");
  const {error:uploadError}=await supabase.storage.from("zm-public-media").upload(destination,source,{contentType:source.type||undefined,upsert:false});
  if(uploadError&&!/already exists|duplicate/i.test(uploadError.message??""))throw new Error("PUBLIC_MEDIA_COPY_FAILED");
 }
}

export async function loader({request,context,params}:Route.LoaderArgs){
 const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"property.read");
 const propertyId=params.propertyId!;
 const [propertyRes,publicationRes,addressRes,energyRes,mediaRes,publishPermissionRes,disclosureGapsRes]=await Promise.all([
  supabase.from("properties").select("id,property_number,internal_title,property_type,transaction_type,status,purchase_price,rent_cold,living_area_sqm,plot_area_sqm,year_built,version").eq("id",propertyId).maybeSingle(),
  supabase.from("property_publications").select("*").eq("property_id",propertyId).maybeSingle(),
  supabase.from("property_addresses").select("id,public_address_mode,street,house_number,postal_code,city,district").eq("property_id",propertyId).maybeSingle(),
  supabase.from("property_energy_data").select("id,certificate_present,efficiency_class,energy_value_kwh").eq("property_id",propertyId).maybeSingle(),
  supabase.from("property_media").select("id,title,alt_text,sort_order,version").eq("property_id",propertyId).eq("media_type","IMAGE").eq("public_approved",true).is("archived_at",null).order("sort_order").order("created_at"),
  supabase.rpc("current_user_has_permission",{p_permission:"property.publish"}),
  supabase.rpc("property_disclosure_gaps",{p_property_id:propertyId})
 ]);
 if(propertyRes.error||!propertyRes.data)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});
 if(publicationRes.error||addressRes.error||energyRes.error||mediaRes.error)throw new Response("Veröffentlichungsakte konnte nicht vollständig geladen werden.",{status:500,headers:responseHeaders()});
 const property=propertyRes.data,publication=publicationRes.data,address=addressRes.data,energy=energyRes.data,approvedMedia=mediaRes.data??[];
 let versions:any[]=[];
 if(publication){const {data:rows,error}=await supabase.from("property_publication_versions").select("id,version_number,public_slug,public_title,created_at,created_by,approved_at,approved_by,published_at,published_by,is_current_public").eq("publication_id",publication.id).order("version_number",{ascending:false});if(error)throw new Response("Versionshistorie konnte nicht geladen werden.",{status:500,headers:responseHeaders()});versions=rows??[];}
 const liveVersion=versions.find(v=>v.is_current_public)??null;
 const blockers=publication?[
  {id:"public-title",label:"Öffentlicher Titel",ok:Boolean(publication.public_title?.trim())},
  {id:"public-teaser",label:"Kurztext (mind. 20 Zeichen)",ok:String(publication.teaser??"").trim().length>=20},
  {id:"public-description",label:"Objektbeschreibung (mind. 40 Zeichen)",ok:String(publication.description??"").trim().length>=40},
  {id:"public-price",label:property.transaction_type==="SALE"?"Gültiger Kaufpreis":"Gültige Kaltmiete",ok:isPositive(property.transaction_type==="SALE"?property.purchase_price:property.rent_cold)},
  {id:"public-address",label:"Objektadresse und öffentliche Adressfreigabe",ok:Boolean(address)},
  {id:"public-core-data",label:property.property_type==="LAND"?"Grundstücksfläche":"Relevante Objektgröße",ok:property.property_type==="LAND"?isPositive(property.plot_area_sqm):(["DETACHED_HOUSE","SEMI_DETACHED_HOUSE","TERRACED_HOUSE","APARTMENT_BUILDING","APARTMENT","PENTHOUSE","MAISONETTE"].includes(property.property_type)?isPositive(property.living_area_sqm):true)},
  {id:"public-media",label:"Mindestens ein freigegebenes Foto",ok:approvedMedia.length>0},
  {id:"public-review",label:"Inhalts- und Datenschutzprüfung bestätigt",ok:Boolean(publication.content_review_confirmed_at&&publication.content_review_confirmed_by)},
  ...((disclosureGapsRes.data??[]) as string[]).map((gap,index)=>({id:`public-disclosure-${index}`,label:`Pflichtangaben: ${gap}`,ok:false,href:`/properties/${propertyId}/mandatory-data`})),
 ].filter(item=>!item.ok):[];
 return data({property,publication,versions,liveVersion,canPublish:publishPermissionRes.data===true,profile,address,energy,approvedMedia,blockers,disclosureGaps:(disclosureGapsRes.data??[]) as string[]},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
 const session=await requirePermission(request,context.cloudflare.env,"property.write");
 const {supabase,responseHeaders,userId}=session;const propertyId=params.propertyId!;const fd=await request.formData();const intent=text(fd,"_intent");
 if(intent==="create"){
  const title=text(fd,"public_title");const slug=text(fd,"slug")||slugify(title);
  if(!title||!slug)return data<ActionResult>({error:"Öffentlicher Titel und URL-Kürzel sind erforderlich."},{status:400,headers:responseHeaders()});
  const {data:created,error}=await supabase.from("property_publications").insert({property_id:propertyId,slug,public_title:title,subtitle:text(fd,"subtitle")||null,teaser:text(fd,"teaser")||null,description:text(fd,"description")||null,location_description:text(fd,"location_description")||null,features_description:text(fd,"features_description")||null,public_highlights:text(fd,"public_highlights").split("\n").map(v=>v.trim()).filter(Boolean),seo_title:text(fd,"seo_title")||null,seo_description:text(fd,"seo_description")||null,created_by:userId,updated_by:userId}).select("id").maybeSingle();
  if(error||!created)return data<ActionResult>({error:error?.message?.includes("duplicate")?"Dieses URL-Kürzel ist bereits vergeben.":"Veröffentlichungsakte konnte nicht angelegt werden."},{status:400,headers:responseHeaders()});
  return redirect(`/properties/${propertyId}/publication`,{headers:responseHeaders()});
 }
 const publicationId=text(fd,"publication_id"),expectedVersion=Number(text(fd,"version"));if(!publicationId||!Number.isFinite(expectedVersion))return data<ActionResult>({error:"Veröffentlichungsstand ist ungültig."},{status:400,headers:responseHeaders()});
 if(intent==="save"){
  const payload={slug:text(fd,"slug"),public_title:text(fd,"public_title"),subtitle:text(fd,"subtitle")||null,teaser:text(fd,"teaser")||null,description:text(fd,"description")||null,location_description:text(fd,"location_description")||null,features_description:text(fd,"features_description")||null,public_highlights:text(fd,"public_highlights").split("\n").map(v=>v.trim()).filter(Boolean),seo_title:text(fd,"seo_title")||null,seo_description:text(fd,"seo_description")||null};
  const {data:updated,error}=await supabase.from("property_publications").update(payload).eq("id",publicationId).eq("property_id",propertyId).eq("version",expectedVersion).select("id").maybeSingle();
  if(error)return data<ActionResult>({error:errorMessage(error.message)},{status:400,headers:responseHeaders()});if(!updated)return data<ActionResult>({error:"Die Veröffentlichungsakte wurde zwischenzeitlich geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});return redirect(`/properties/${propertyId}/publication`,{headers:responseHeaders()});
 }
 if(intent==="confirm_review"){
  await requirePermission(request,context.cloudflare.env,"property.publish");
  const {data:updated,error}=await supabase.from("property_publications").update({content_review_confirmed_at:new Date().toISOString(),content_review_confirmed_by:userId}).eq("id",publicationId).eq("property_id",propertyId).eq("version",expectedVersion).select("id").maybeSingle();
  if(error)return data<ActionResult>({error:errorMessage(error.message)},{status:400,headers:responseHeaders()});if(!updated)return data<ActionResult>({error:"Die Veröffentlichungsakte wurde zwischenzeitlich geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});return redirect(`/properties/${propertyId}/publication#freigabe`,{headers:responseHeaders()});
 }
 if(["prepare","publish","unpublish","reset"].includes(intent)){
  if(intent==="prepare"){
   try{await ensurePublicMediaCopies(supabase,propertyId);}catch(error){return data<ActionResult>({error:errorMessage(error instanceof Error?error.message:String(error))},{status:400,headers:responseHeaders()});}
  }
  const target=intent==="prepare"?"READY":intent==="publish"?"PUBLISHED":intent==="unpublish"?"UNPUBLISHED":"DRAFT";
  const {data:updated,error}=await supabase.from("property_publications").update({status:target}).eq("id",publicationId).eq("property_id",propertyId).eq("version",expectedVersion).select("id").maybeSingle();
  if(error)return data<ActionResult>({error:errorMessage(error.message)},{status:400,headers:responseHeaders()});if(!updated)return data<ActionResult>({error:"Die Veröffentlichungsakte wurde zwischenzeitlich geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});return redirect(`/properties/${propertyId}/publication`,{headers:responseHeaders()});
 }
 return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

function stateLabel(p:any,live:any){if(!p)return"Noch nicht angelegt";if(live&&p.status==="DRAFT")return"Veröffentlicht · Änderungen offen";if(live&&p.status==="READY")return"Veröffentlicht · neue Version bereit";if(p.status==="PUBLISHED")return"Veröffentlicht";if(p.status==="READY")return"Bereit zur Freigabe";if(p.status==="UNPUBLISHED")return"Nicht veröffentlicht";return"Entwurf";}

export default function PropertyPublication(){
 const {property,publication,versions,liveVersion,canPublish,profile,address,energy,approvedMedia,blockers}=useLoaderData<typeof loader>();const result=useActionData<typeof action>();
 const values=publication??{slug:slugify(`${property.internal_title}-${property.property_number}`),public_title:property.internal_title,subtitle:"",teaser:"",description:"",location_description:"",features_description:"",public_highlights:[],seo_title:"",seo_description:""};
 const blockedIds=new Set(blockers.map((item:any)=>item.id));
 return <main className="editor-shell"><header className="editor-header"><div><Link className="back-link" to={`/properties/${property.id}`}>← Objektakte</Link><p className="eyebrow">Modul 05 · Website & Exposés</p><h1 className="editor-title">Veröffentlichung</h1><p className="editor-meta">{property.property_number} · {property.internal_title}</p></div><div className="header-user"><span className="publication-state">{stateLabel(publication,liveVersion)}</span><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
 <div className="publication-page">{result?.error?<div className="form-error">{result.error}</div>:null}
  <section className="data-card"><div className="card-head"><div><p className="eyebrow">Publikationsprinzip</p><h2>Intern bearbeiten, Snapshot veröffentlichen</h2></div><div className="inline-actions">{publication?.status==="READY"?<Link className="secondary-button compact link-button" to={`/properties/${property.id}/publication/preview`} target="_blank">Vorschau ↗</Link>:null}{liveVersion?<Link className="secondary-button compact link-button" to={`/immobilien/${liveVersion.public_slug}`} target="_blank">Live ↗</Link>:null}</div></div><p>Die Website liest ausschließlich eine freigegebene, unveränderliche Version. Interne Objektänderungen werden erst nach einer neuen Freigabe öffentlich.</p></section>
  <section className="data-card"><div className="card-head"><div><p className="eyebrow">Öffentliche Inhalte</p><h2>{publication?"Veröffentlichungsakte bearbeiten":"Veröffentlichungsakte anlegen"}</h2></div></div><Form method="post"><input type="hidden" name="_intent" value={publication?"save":"create"}/>{publication?<><input type="hidden" name="publication_id" value={publication.id}/><input type="hidden" name="version" value={publication.version}/></>:null}
   <div className="form-grid"><label id="public-title" className={`form-field${blockedIds.has("public-title")?" publication-blocked":""}`}><span>Öffentlicher Titel *</span><input name="public_title" defaultValue={values.public_title} required/></label><label className="form-field"><span>URL-Kürzel *</span><input name="slug" defaultValue={values.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required/></label></div>
   <label className="form-field"><span>Untertitel</span><input name="subtitle" defaultValue={values.subtitle??""}/></label>
   <label id="public-teaser" className={`form-field${blockedIds.has("public-teaser")?" publication-blocked":""}`}><span>Kurztext *</span><textarea name="teaser" rows={3} defaultValue={values.teaser??""}/><small>Mindestens 20 Zeichen.</small></label>
   <label id="public-description" className={`form-field${blockedIds.has("public-description")?" publication-blocked":""}`}><span>Objektbeschreibung *</span><textarea name="description" rows={8} defaultValue={values.description??""}/><small>Mindestens 40 Zeichen.</small></label>
   <label className="form-field"><span>Lagebeschreibung</span><textarea name="location_description" rows={5} defaultValue={values.location_description??""}/></label>
   <label className="form-field"><span>Ausstattungsbeschreibung</span><textarea name="features_description" rows={5} defaultValue={values.features_description??""}/></label>
   <label className="form-field"><span>Highlights</span><textarea name="public_highlights" rows={5} defaultValue={(values.public_highlights??[]).join("\n")}/><small>Ein Highlight pro Zeile.</small></label>
   <div className="form-grid"><label className="form-field"><span>SEO-Titel</span><input name="seo_title" defaultValue={values.seo_title??""}/></label><label className="form-field"><span>SEO-Beschreibung</span><input name="seo_description" defaultValue={values.seo_description??""}/></label></div>
   <button className="primary-button" type="submit">{publication?"Öffentliche Inhalte speichern":"Veröffentlichungsakte anlegen"}</button>
  </Form></section>
  {publication?<section className="data-card" id="freigabe"><div className="card-head"><div><p className="eyebrow">Publikations-Checkliste</p><h2>Vor Veröffentlichung prüfen</h2></div><span>{blockers.length?`${blockers.length} offen`:"Bereit"}</span></div>
   <div className="publication-check-grid">
    <div id="public-price" className={blockedIds.has("public-price")?"publication-check blocked":"publication-check ok"}><strong>Preis</strong><small>{property.transaction_type==="SALE"?(property.purchase_price?`${property.purchase_price} €`:"fehlt"):(property.rent_cold?`${property.rent_cold} € Kaltmiete`:"fehlt")}</small></div>
    <div id="public-address" className={blockedIds.has("public-address")?"publication-check blocked":"publication-check ok"}><strong>Adresse</strong><small>{address?`${address.public_address_mode} · ${address.postal_code} ${address.city}`:"fehlt"}</small></div>
    <div id="public-core-data" className={blockedIds.has("public-core-data")?"publication-check blocked":"publication-check ok"}><strong>Kerndaten</strong><small>{property.property_type==="LAND"?`${property.plot_area_sqm??"—"} m² Grundstück`:`${property.living_area_sqm??"—"} m² Wohnfläche`}</small></div>
    <div id="public-media" className={blockedIds.has("public-media")?"publication-check blocked":"publication-check ok"}><strong>Öffentliche Fotos</strong><small>{approvedMedia.length} freigegeben · erstes Bild = Hauptbild</small></div>
    <div className="publication-check"><strong>Energiedaten</strong><small>{energy?"geprüfter Datensatz vorhanden":"noch kein Energiedatensatz hinterlegt"}</small></div>
    <div id="public-review" className={blockedIds.has("public-review")?"publication-check blocked":"publication-check ok"}><strong>Inhalts-/Datenschutzprüfung</strong><small>{publication.content_review_confirmed_at?`bestätigt ${formatDate(publication.content_review_confirmed_at)}`:"noch nicht bestätigt"}</small></div>
   </div>
   {canPublish&&!publication.content_review_confirmed_at?<Form method="post"><input type="hidden" name="publication_id" value={publication.id}/><input type="hidden" name="version" value={publication.version}/><button className="secondary-button" name="_intent" value="confirm_review" type="submit">Inhalte & Datenschutz geprüft</button></Form>:null}
   {blockers.length?<div className="publication-blockers"><strong>Vor Veröffentlichung noch erforderlich</strong>{blockers.map((item:any)=><a key={item.id} href={item.href??`#${item.id}`}>→ {item.label}</a>)}</div>:<div className="publication-ready">Alle blockierenden Prüfungen sind erfüllt.</div>}
  </section>:null}
  {publication?<section className="data-card"><div className="card-head"><div><p className="eyebrow">Freigabe & Versionierung</p><h2>Nächster Schritt</h2></div><span className="publication-state">{stateLabel(publication,liveVersion)}</span></div><div className="publication-workflow"><div><strong>1 · Inhalte bearbeiten</strong><small>Änderungen sind zunächst nur intern.</small></div><div><strong>2 · Version vorbereiten</strong><small>Spiegelt freigegebene Fotos und friert den Snapshot ein.</small></div><div><strong>3 · Veröffentlichen</strong><small>Nur mit `property.publish`; vorherige Live-Version wird ersetzt.</small></div></div><div className="inline-actions publication-actions">{publication.status!=="READY"?<Form method="post"><input type="hidden" name="publication_id" value={publication.id}/><input type="hidden" name="version" value={publication.version}/><button className="secondary-button" name="_intent" value="prepare" type="submit" disabled={blockers.length>0}>Version vorbereiten</button></Form>:<>{canPublish?<Form method="post"><input type="hidden" name="publication_id" value={publication.id}/><input type="hidden" name="version" value={publication.version}/><button className="primary-button" name="_intent" value="publish" type="submit">Freigeben & veröffentlichen</button></Form>:null}<Form method="post"><input type="hidden" name="publication_id" value={publication.id}/><input type="hidden" name="version" value={publication.version}/><button className="secondary-button" name="_intent" value="reset" type="submit">Zurück zum Entwurf</button></Form></>}{liveVersion&&publication.status!=="UNPUBLISHED"&&canPublish?<Form method="post"><input type="hidden" name="publication_id" value={publication.id}/><input type="hidden" name="version" value={publication.version}/><button className="secondary-button" name="_intent" value="unpublish" type="submit">Veröffentlichung stoppen</button></Form>:null}</div></section>:null}
  {publication?<section className="data-card"><div className="card-head"><div><p className="eyebrow">Historie</p><h2>Freigabeversionen</h2></div><span>{versions.length} Versionen</span></div><div className="data-list">{versions.map((v:any)=><div className="data-row" key={v.id}><div><strong>Version {v.version_number} · {v.public_title}</strong><small>/{v.public_slug} · erzeugt {formatDate(v.created_at)}</small></div><div className="row-meta"><span>{v.is_current_public?"LIVE":v.published_at?"Historisch":"Vorbereitet"}</span><small>{v.published_at?`veröffentlicht ${formatDate(v.published_at)}`:"noch nicht veröffentlicht"}</small></div></div>)}{versions.length===0?<p className="empty-state">Noch keine Freigabeversion erzeugt.</p>:null}</div></section>:null}
 </div></main>;
}
