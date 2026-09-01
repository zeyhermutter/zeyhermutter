import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-marketing";
import { requirePermission } from "~/lib/auth.server";
import "~/publication.css";

type ActionResult={error?:string};
const STATUS_LABELS:Record<string,string>={PLANNED:"Geplant",READY:"Bereit",LIVE:"Live dokumentiert",PAUSED:"Pausiert",ERROR:"Klärung erforderlich",ENDED:"Beendet"};
const CHANNEL_LABELS:Record<string,string>={PORTAL:"Immobilienportal",OWN_WEBSITE:"Eigene Website",SOCIAL:"Social Media",DIRECT:"Direktvermarktung / Netzwerk",PRINT:"Print",OTHER:"Sonstiger Kanal"};
const DELIVERY_LABELS:Record<string,string>={MANUAL:"Manuelle Pflege",EXPORT:"Datenexport / Übergabepaket"};
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function nullable(fd:FormData,key:string){const value=text(fd,key);return value||null;}
function formatDate(value:string|null){return value?new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(value)):"—";}
function formatDay(value:string|null){return value?new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(value)):"—";}
function plannedTimestamp(value:string){return value?`${value}T12:00:00Z`:null;}
function dateInput(value:string|null){return value?new Date(value).toISOString().slice(0,10):"";}
function errorMessage(message:string){
 if(message.includes("duplicate key")||message.includes("property_marketing_active_channel_unique"))return"Für diesen Kanal gibt es bereits einen nicht beendeten Vermarktungsstand.";
 if(message.includes("MARKETING_APPROVED_SOURCE_REQUIRED"))return"Vor „Bereit“ oder „Live“ muss eine freigegebene Website-Version oder ein zur Verwendung freigegebenes Exposé zugeordnet sein.";
 if(message.includes("MARKETING_PUBLICATION_NOT_APPROVED"))return"Die gewählte Website-Version ist noch nicht freigegeben.";
 if(message.includes("MARKETING_EXPOSE_NOT_RELEASED"))return"Das gewählte Exposé ist noch nicht zur Verwendung freigegeben.";
 if(message.includes("MARKETING_PUBLICATION_PROPERTY_MISMATCH")||message.includes("MARKETING_EXPOSE_PROPERTY_MISMATCH"))return"Die gewählte Quelle gehört nicht zu dieser Immobilie.";
 if(message.includes("PROPERTY_NOT_IN_MARKETING"))return"Ein Kanal darf erst als live dokumentiert werden, wenn die Immobilie in Vermarktung oder reserviert ist.";
 if(message.includes("PAUSE_MARKETING_BEFORE_SOURCE_CHANGE"))return"Bei einem live geführten Kanal müssen Kanaltyp, Übergabeweg und Quellen zuerst durch Pausieren entsperrt werden.";
 if(message.includes("INVALID_MARKETING_STATUS_TRANSITION"))return"Dieser Vermarktungsstatuswechsel ist nicht zulässig.";
 if(message.includes("PROPERTY_PUBLISH_REQUIRED"))return"Dir fehlt die Berechtigung, einen externen Veröffentlichungsstand zu ändern.";
 if(message.includes("external_url"))return"Der externe Link muss mit http:// oder https:// beginnen.";
 return"Die Vermarktungsaktion konnte nicht ausgeführt werden.";
}

export async function loader({request,context,params}:Route.LoaderArgs){
 const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"property.read");
 const propertyId=params.propertyId!;
 const [propertyRes,publicationRes,placementsRes,exposesRes,writeRes,publishRes]=await Promise.all([
  supabase.from("properties").select("id,property_number,internal_title,status,transaction_type").eq("id",propertyId).maybeSingle(),
  supabase.from("property_publications").select("id,status,published_version").eq("property_id",propertyId).maybeSingle(),
  supabase.from("property_marketing_placements").select("*").eq("property_id",propertyId).order("status").order("updated_at",{ascending:false}),
  supabase.from("property_exposes").select("id,expose_number,version_number,status,released_at,approved_at").eq("property_id",propertyId).order("version_number",{ascending:false}),
  supabase.rpc("current_user_has_permission",{p_permission:"property.write"}),
  supabase.rpc("current_user_has_permission",{p_permission:"property.publish"})
 ]);
 if(propertyRes.error||!propertyRes.data)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});
 if(publicationRes.error||placementsRes.error||exposesRes.error)throw new Response("Vermarktungsdaten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
 let publicationVersions:any[]=[];
 if(publicationRes.data){
  const {data:versions,error}=await supabase.from("property_publication_versions").select("id,version_number,public_title,public_slug,approved_at,published_at,is_current_public").eq("publication_id",publicationRes.data.id).order("version_number",{ascending:false});
  if(error)throw new Response("Website-Versionen konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  publicationVersions=versions??[];
 }
 return data({property:propertyRes.data,publication:publicationRes.data,publicationVersions,placements:placementsRes.data??[],exposes:exposesRes.data??[],permissions:{write:writeRes.data===true,publish:publishRes.data===true},profile},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
 const propertyId=params.propertyId!;const fd=await request.formData();const intent=text(fd,"_intent");
 const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"property.write");
 if(intent==="create"){
  const channelName=text(fd,"channel_name");if(!channelName)return data<ActionResult>({error:"Kanalname ist erforderlich."},{status:400,headers:responseHeaders()});
  const {data:created,error}=await supabase.from("property_marketing_placements").insert({property_id:propertyId,channel_type:text(fd,"channel_type")||"PORTAL",channel_name:channelName,delivery_mode:text(fd,"delivery_mode")||"MANUAL",publication_version_id:nullable(fd,"publication_version_id"),expose_id:nullable(fd,"expose_id"),external_listing_id:nullable(fd,"external_listing_id"),external_url:nullable(fd,"external_url"),planned_go_live_at:plannedTimestamp(text(fd,"planned_go_live_on")),notes:text(fd,"notes"),created_by:userId,updated_by:userId}).select("id").maybeSingle();
  if(error||!created)return data<ActionResult>({error:errorMessage(error?.message??"")},{status:400,headers:responseHeaders()});
  return redirect(`/properties/${propertyId}/marketing#${created.id}`,{headers:responseHeaders()});
 }
 const placementId=text(fd,"placement_id"),expectedVersion=Number(text(fd,"version"));
 if(!placementId||!Number.isInteger(expectedVersion))return data<ActionResult>({error:"Vermarktungsstand ist ungültig."},{status:400,headers:responseHeaders()});
 if(intent==="save"){
  const payload={channel_type:text(fd,"channel_type"),channel_name:text(fd,"channel_name"),delivery_mode:text(fd,"delivery_mode"),publication_version_id:nullable(fd,"publication_version_id"),expose_id:nullable(fd,"expose_id"),external_listing_id:nullable(fd,"external_listing_id"),external_url:nullable(fd,"external_url"),planned_go_live_at:plannedTimestamp(text(fd,"planned_go_live_on")),notes:text(fd,"notes")};
  if(!payload.channel_name)return data<ActionResult>({error:"Kanalname ist erforderlich."},{status:400,headers:responseHeaders()});
  const {data:updated,error}=await supabase.from("property_marketing_placements").update(payload).eq("id",placementId).eq("property_id",propertyId).eq("version",expectedVersion).select("id").maybeSingle();
  if(error)return data<ActionResult>({error:errorMessage(error.message)},{status:400,headers:responseHeaders()});if(!updated)return data<ActionResult>({error:"Der Vermarktungsstand wurde zwischenzeitlich geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});
  return redirect(`/properties/${propertyId}/marketing#${placementId}`,{headers:responseHeaders()});
 }
 if(intent==="status"){
  const target=text(fd,"target_status");if(!["PLANNED","READY","LIVE","PAUSED","ERROR","ENDED"].includes(target))return data<ActionResult>({error:"Ungültiger Zielstatus."},{status:400,headers:responseHeaders()});
  if(["LIVE","PAUSED","ERROR","ENDED"].includes(target))await requirePermission(request,context.cloudflare.env,"property.publish");
  const {data:updated,error}=await supabase.from("property_marketing_placements").update({status:target}).eq("id",placementId).eq("property_id",propertyId).eq("version",expectedVersion).select("id").maybeSingle();
  if(error)return data<ActionResult>({error:errorMessage(error.message)},{status:400,headers:responseHeaders()});if(!updated)return data<ActionResult>({error:"Der Vermarktungsstand wurde zwischenzeitlich geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});
  return redirect(`/properties/${propertyId}/marketing#${placementId}`,{headers:responseHeaders()});
 }
 if(intent==="verify"){
  const {data:updated,error}=await supabase.from("property_marketing_placements").update({last_verified_at:new Date().toISOString()}).eq("id",placementId).eq("property_id",propertyId).eq("version",expectedVersion).select("id").maybeSingle();
  if(error)return data<ActionResult>({error:errorMessage(error.message)},{status:400,headers:responseHeaders()});if(!updated)return data<ActionResult>({error:"Der Vermarktungsstand wurde zwischenzeitlich geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});
  return redirect(`/properties/${propertyId}/marketing#${placementId}`,{headers:responseHeaders()});
 }
 return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

function StatusActions({placement,canPublish}:{placement:any;canPublish:boolean}){
 const buttons:Record<string,{target:string;label:string;primary?:boolean;publish?:boolean}[]>={
  PLANNED:[{target:"READY",label:"Als bereit markieren",primary:true},{target:"ENDED",label:"Beenden",publish:true}],
  READY:[{target:"LIVE",label:"Als live dokumentieren",primary:true,publish:true},{target:"PLANNED",label:"Zurück auf geplant"},{target:"ENDED",label:"Beenden",publish:true}],
  LIVE:[{target:"PAUSED",label:"Pausieren",publish:true},{target:"ERROR",label:"Klärung erforderlich",publish:true},{target:"ENDED",label:"Beenden",publish:true}],
  PAUSED:[{target:"LIVE",label:"Wieder als live dokumentieren",primary:true,publish:true},{target:"ERROR",label:"Klärung erforderlich",publish:true},{target:"ENDED",label:"Beenden",publish:true}],
  ERROR:[{target:"READY",label:"Zur Prüfung zurück",primary:true},{target:"ENDED",label:"Beenden",publish:true}],ENDED:[]};
 return <div className="inline-actions">{(buttons[placement.status]??[]).map(button=>button.publish&&!canPublish?null:<Form method="post" key={button.target}><input type="hidden" name="_intent" value="status"/><input type="hidden" name="placement_id" value={placement.id}/><input type="hidden" name="version" value={placement.version}/><button className={`${button.primary?"primary":"secondary"}-button compact`} name="target_status" value={button.target}>{button.label}</button></Form>)}</div>;
}

export default function PropertyMarketing(){
 const {property,publication,publicationVersions,placements,exposes,permissions,profile}=useLoaderData<typeof loader>();const result=useActionData<typeof action>();
 const approvedVersions=publicationVersions.filter((v:any)=>v.approved_at);const releasedExposes=exposes.filter((e:any)=>e.status==="RELEASED");
 const liveCount=placements.filter((p:any)=>p.status==="LIVE").length,readyCount=placements.filter((p:any)=>p.status==="READY").length,issueCount=placements.filter((p:any)=>p.status==="ERROR").length;
 return <main className="editor-shell"><header className="editor-header"><div><Link className="back-link" to={`/properties/${property.id}`}>← Objektakte</Link><p className="eyebrow">Vermarktung</p><h1 className="editor-title">Vermarktung & Portale</h1><p className="editor-meta">{property.property_number} · {property.internal_title}</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
 <div className="publication-page">{result?.error?<div className="form-error">{result.error}</div>:null}
  <section className="data-card"><div className="card-head"><div><p className="eyebrow">Arbeitsprinzip</p><h2>Externe Vermarktung nachvollziehbar führen</h2></div><div className="inline-actions"><Link className="secondary-button compact link-button" to={`/properties/${property.id}/publication`}>Website</Link><Link className="secondary-button compact link-button" to={`/properties/${property.id}/exposes`}>Exposés</Link></div></div><p>Dieser Bereich dokumentiert den tatsächlichen Stand je Vermarktungskanal. „Live“ bedeutet, dass die Veröffentlichung extern tatsächlich erfolgt ist. Es wird keine Portalverbindung oder Synchronisation vorgetäuscht. Als Quelle kann nur ein freigegebener Website-Snapshot oder ein zur Verwendung freigegebenes Exposé verwendet werden.</p></section>
  <section className="data-card"><div className="card-head"><div><p className="eyebrow">Überblick</p><h2>Aktueller Vermarktungsstand</h2></div><span>{placements.length} Kanäle</span></div><div className="stats-grid"><div><strong>{liveCount}</strong><span>Live</span></div><div><strong>{readyCount}</strong><span>Bereit</span></div><div><strong>{issueCount}</strong><span>Klärung</span></div><div><strong>{approvedVersions.length+releasedExposes.length}</strong><span>freigegebene Quellen</span></div></div><p className="editor-meta">Objektstatus: {property.status} · Website: {publication?.published_version?`Version ${publication.published_version} veröffentlicht`:"keine veröffentlichte Version"} · Exposés zur Verwendung: {releasedExposes.length}</p></section>
  {permissions.write?<section className="data-card"><div className="card-head"><div><p className="eyebrow">Neuer Kanal</p><h2>Vermarktungsstand anlegen</h2></div></div><Form method="post"><input type="hidden" name="_intent" value="create"/><div className="form-grid"><label className="form-field"><span>Kanalname *</span><input name="channel_name" placeholder="z. B. Portal- oder Kampagnenname" required/></label><label className="form-field"><span>Kanaltyp</span><select name="channel_type" defaultValue="PORTAL">{Object.entries(CHANNEL_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="form-field"><span>Übergabeweg</span><select name="delivery_mode" defaultValue="MANUAL"><option value="MANUAL">Manuelle Pflege</option><option value="EXPORT">Datenexport / Übergabepaket</option></select></label><label className="form-field"><span>Geplanter Start</span><input type="date" name="planned_go_live_on"/></label></div><div className="form-grid"><label className="form-field"><span>Website-Version als Quelle</span><select name="publication_version_id" defaultValue=""><option value="">Keine</option>{approvedVersions.map((v:any)=><option key={v.id} value={v.id}>Website V{v.version_number} · {v.public_title}{v.is_current_public?" · LIVE":""}</option>)}</select></label><label className="form-field"><span>Exposé als Quelle</span><select name="expose_id" defaultValue=""><option value="">Keines</option>{releasedExposes.map((e:any)=><option key={e.id} value={e.id}>{e.expose_number} · V{e.version_number}</option>)}</select></label></div><div className="form-grid"><label className="form-field"><span>Externe Objekt-ID</span><input name="external_listing_id"/></label><label className="form-field"><span>Externer Link</span><input type="url" name="external_url" placeholder="https://…"/></label></div><label className="form-field"><span>Interne Notiz</span><textarea name="notes" rows={3}/></label><button className="primary-button" type="submit">Kanal anlegen</button></Form></section>:null}
  <section className="data-card"><div className="card-head"><div><p className="eyebrow">Kanäle</p><h2>Vermarktungsstände</h2></div></div>{placements.length===0?<p className="empty-state">Noch kein externer Vermarktungskanal angelegt.</p>:<div className="data-list">{placements.map((placement:any)=>{const sourceVersion=publicationVersions.find((v:any)=>v.id===placement.publication_version_id),sourceExpose=exposes.find((e:any)=>e.id===placement.expose_id);return <article className="data-card" id={placement.id} key={placement.id}><div className="card-head"><div><p className="eyebrow">{CHANNEL_LABELS[placement.channel_type]??placement.channel_type} · {DELIVERY_LABELS[placement.delivery_mode]??placement.delivery_mode}</p><h2>{placement.channel_name}</h2><p className="editor-meta">{STATUS_LABELS[placement.status]??placement.status} · zuletzt geändert {formatDate(placement.updated_at)}</p></div><span className="publication-state">{STATUS_LABELS[placement.status]??placement.status}</span></div><div className="data-list"><div className="data-row"><div><strong>Freigegebene Quelle</strong><small>{sourceVersion?`Website V${sourceVersion.version_number} · ${sourceVersion.public_title}`:sourceExpose?`${sourceExpose.expose_number} · Exposé V${sourceExpose.version_number}`:"Noch keine Quelle zugeordnet"}</small></div><div className="row-meta"><small>Geplanter Start {formatDay(placement.planned_go_live_at)}</small><small>Live seit {formatDate(placement.live_at)}</small><small>Zuletzt geprüft {formatDate(placement.last_verified_at)}</small></div></div>{placement.external_listing_id||placement.external_url?<div className="data-row"><div><strong>Externer Stand</strong><small>{placement.external_listing_id?`Objekt-ID: ${placement.external_listing_id}`:"Keine externe Objekt-ID"}</small></div><div className="row-meta">{placement.external_url?<a className="secondary-button compact" href={placement.external_url} target="_blank" rel="noreferrer">Extern öffnen ↗</a>:null}</div></div>:null}</div>
   {permissions.write&&placement.status!=="ENDED"?<Form method="post"><input type="hidden" name="_intent" value="save"/><input type="hidden" name="placement_id" value={placement.id}/><input type="hidden" name="version" value={placement.version}/><div className="form-grid"><label className="form-field"><span>Kanalname</span><input name="channel_name" defaultValue={placement.channel_name} required/></label><label className="form-field"><span>Kanaltyp</span><select name="channel_type" defaultValue={placement.channel_type}>{Object.entries(CHANNEL_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="form-field"><span>Übergabeweg</span><select name="delivery_mode" defaultValue={placement.delivery_mode}><option value="MANUAL">Manuelle Pflege</option><option value="EXPORT">Datenexport / Übergabepaket</option></select></label><label className="form-field"><span>Geplanter Start</span><input type="date" name="planned_go_live_on" defaultValue={dateInput(placement.planned_go_live_at)}/></label></div><div className="form-grid"><label className="form-field"><span>Website-Version</span><select name="publication_version_id" defaultValue={placement.publication_version_id??""}><option value="">Keine</option>{publicationVersions.map((v:any)=><option key={v.id} value={v.id} disabled={!v.approved_at}>{`Website V${v.version_number} · ${v.public_title}${v.approved_at?"":" · nicht freigegeben"}`}</option>)}</select></label><label className="form-field"><span>Exposé</span><select name="expose_id" defaultValue={placement.expose_id??""}><option value="">Keines</option>{exposes.map((e:any)=><option key={e.id} value={e.id} disabled={e.status!=="RELEASED"}>{`${e.expose_number} · V${e.version_number}${e.status==="RELEASED"?"":" · nicht zur Verwendung freigegeben"}`}</option>)}</select></label></div><div className="form-grid"><label className="form-field"><span>Externe Objekt-ID</span><input name="external_listing_id" defaultValue={placement.external_listing_id??""}/></label><label className="form-field"><span>Externer Link</span><input type="url" name="external_url" defaultValue={placement.external_url??""}/></label></div><label className="form-field"><span>Interne Notiz</span><textarea name="notes" rows={3} defaultValue={placement.notes}/></label><button className="secondary-button" type="submit">Änderungen speichern</button></Form>:placement.notes?<p>{placement.notes}</p>:null}
   <div className="inline-actions"><StatusActions placement={placement} canPublish={permissions.publish}/>{permissions.write&&placement.status!=="PLANNED"&&placement.status!=="ENDED"?<Form method="post"><input type="hidden" name="_intent" value="verify"/><input type="hidden" name="placement_id" value={placement.id}/><input type="hidden" name="version" value={placement.version}/><button className="secondary-button compact" type="submit">Stand jetzt geprüft</button></Form>:null}</div></article>})}</div>}</section>
 </div></main>;
}
