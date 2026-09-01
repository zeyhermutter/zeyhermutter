import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-interests";
import { requirePermission } from "~/lib/auth.server";
import { groupMatchingRows, isDeprioritizedDecision, MATCH_DECISION_LABELS } from "~/lib/matching-priority";
import "~/inquiry.css";

type ActionResult={error?:string;ok?:string};
const PROFILE_STATUS:Record<string,string>={ACTIVE:"Aktiv",PAUSED:"Pausiert",CLOSED:"Geschlossen"};
const VIEWING_STATUS:Record<string,string>={PLANNED:"Geplant",CONFIRMED:"Bestätigt",COMPLETED:"Durchgeführt",CANCELLED:"Abgesagt",NO_SHOW:"Nicht erschienen"};
function one(v:any){return Array.isArray(v)?v[0]:v;}
function text(fd:FormData,k:string){return String(fd.get(k)??"").trim();}
function money(v:any){return v==null?"—":new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(Number(v));}
function number(v:any,suffix=""){return v==null?"—":`${new Intl.NumberFormat("de-DE",{maximumFractionDigits:1}).format(Number(v))}${suffix}`;}
function range(min:any,max:any,formatter:(v:any)=>string){if(min==null&&max==null)return"—";if(min!=null&&max!=null)return`${formatter(min)} – ${formatter(max)}`;if(min!=null)return`ab ${formatter(min)}`;return`bis ${formatter(max)}`;}
function formatDate(v:string|null){if(!v)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(v));}

export async function loader({request,context,params}:Route.LoaderArgs){
 const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"property.read");
 const propertyId=params.propertyId!;
 const [{data:canReadSearchProfiles},{data:canReadViewings}]=await Promise.all([
  supabase.rpc("current_user_has_permission",{p_permission:"search_profile.read"}),
  supabase.rpc("current_user_has_permission",{p_permission:"viewing.read"}),
 ]);
 if(canReadSearchProfiles!==true)throw new Response("Keine Berechtigung für Interessenten-Matching.",{status:403,headers:responseHeaders()});
 const viewingsPromise=canReadViewings===true
  ? supabase.from("viewings").select("id,viewing_number,status,starts_at,primary_responsible_user,contact_id,search_profile_id,inquiry_id,contacts!inner(id,first_name,last_name),search_profiles(id,search_profile_number,title),inquiries(id,inquiry_number)").eq("property_id",propertyId).is("archived_at",null).order("starts_at",{ascending:false}).limit(100)
  : Promise.resolve({data:[],error:null} as any);
 const [{data:property,error:propertyError},{data:matches,error:matchError},{data:viewings,error:viewingError},{data:profiles},{data:canDecide},{data:canCreateViewing}]=await Promise.all([
  supabase.from("properties").select("id,property_number,internal_title,status,transaction_type").eq("id",propertyId).maybeSingle(),
  supabase.rpc("match_search_profiles_for_property",{p_property_id:propertyId,p_limit:100}),
  viewingsPromise,
  supabase.from("profiles").select("user_id,display_name,status").eq("status","ACTIVE").order("display_name"),
  supabase.rpc("current_user_has_permission",{p_permission:"search_profile.write"}),
  supabase.rpc("current_user_has_permission",{p_permission:"viewing.write"}),
 ]);
 if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});
 if(matchError||viewingError)throw new Response("Interessenten und Besichtigungen konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
 return data({property,matches:matches??[],viewings:viewings??[],profiles:profiles??[],profile,canDecide:canDecide===true,canCreateViewing:canCreateViewing===true,canReadViewings:canReadViewings===true},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
 const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"search_profile.write");
 const {data:canReadProperty}=await supabase.rpc("current_user_has_permission",{p_permission:"property.read"});
 if(canReadProperty!==true)throw new Response("Keine Berechtigung für diese Immobilie.",{status:403,headers:responseHeaders()});
 const fd=await request.formData(),intent=text(fd,"_intent"),propertyId=params.propertyId!;
 if(intent!=="decision")return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
 const searchProfileId=text(fd,"search_profile_id"),status=text(fd,"status"),score=Number(text(fd,"score"));
 if(!searchProfileId||!Object.hasOwn(MATCH_DECISION_LABELS,status))return data<ActionResult>({error:"Ungültige Match-Entscheidung."},{status:400,headers:responseHeaders()});
 const {data:property}=await supabase.from("properties").select("id").eq("id",propertyId).maybeSingle();
 if(!property)return data<ActionResult>({error:"Immobilie nicht gefunden oder nicht lesbar."},{status:404,headers:responseHeaders()});
 const {data:existing,error:lookupError}=await supabase.from("search_profile_property_decisions").select("id,version").eq("search_profile_id",searchProfileId).eq("property_id",propertyId).maybeSingle();
 if(lookupError)return data<ActionResult>({error:"Match-Entscheidung konnte nicht geladen werden."},{status:400,headers:responseHeaders()});
 const payload={status,last_match_score:Number.isFinite(score)?score:null,decided_at:new Date().toISOString(),decided_by:userId};
 if(existing){
  const {data:updated,error}=await supabase.from("search_profile_property_decisions").update(payload).eq("id",existing.id).eq("version",existing.version).select("id").maybeSingle();
  if(error)return data<ActionResult>({error:"Match-Entscheidung konnte nicht gespeichert werden."},{status:400,headers:responseHeaders()});
  if(!updated)return data<ActionResult>({error:"Die Match-Entscheidung wurde inzwischen geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});
 }else{
  const {error}=await supabase.from("search_profile_property_decisions").insert({search_profile_id:searchProfileId,property_id:propertyId,...payload,created_by:userId,updated_by:userId});
  if(error)return data<ActionResult>({error:"Match-Entscheidung konnte nicht gespeichert werden."},{status:400,headers:responseHeaders()});
 }
 return data<ActionResult>({ok:`Match als „${MATCH_DECISION_LABELS[status]}“ markiert.`},{headers:responseHeaders()});
}

export default function PropertyInterests(){
 const {property,matches,viewings,profiles,profile,canDecide,canCreateViewing,canReadViewings}=useLoaderData<typeof loader>();
 const result=useActionData<typeof action>();
 const profileMap=Object.fromEntries(profiles.map((x:any)=>[x.user_id,x.display_name]));
 const matchGroups=groupMatchingRows(matches as any[]);
 return <main className="editor-shell">
  <header className="editor-header"><div><Link className="back-link" to={`/properties/${property.id}`}>← Objektakte</Link><p className="eyebrow">{property.property_number} · Modul 04</p><h1 className="editor-title">Interessenten & Besichtigungen</h1><p className="editor-meta">{property.internal_title} · Reverse Matching und Termine direkt an der Immobilie.</p></div><div className="header-user">{canCreateViewing?<Link className="primary-button link-button" to={`/viewings/new?propertyId=${property.id}`}>+ Besichtigung anlegen</Link>:null}<span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
  <div className="inquiry-page">
   {result?.error?<div className="form-error">{result.error}</div>:null}{result?.ok?<div className="success-banner">{result.ok}</div>:null}
   <section className="data-card" id="interessenten"><div className="card-head"><div><p className="eyebrow">Reverse Matching</p><h2>Passende Interessenten</h2></div><span className="subtle">{matches.length} aktive Suchprofile</span></div>
    <p className="match-legend">Gruppierung: 85–100 % sehr passend · 70–84 % passend · 50–69 % teilweise passend · unter 50 % nicht passend. Entscheidungen verändern den fachlichen Score nicht; abgelehnt und ungeeignet werden lediglich nach hinten priorisiert.</p>
    <div className="match-group-stack">{matchGroups.map(({group,items})=>items.length?<section className={`match-group ${group.className}`} key={group.key}><div className="match-group-head"><div className="match-group-title"><strong>{group.label}</strong><small>{group.hint}</small></div><span className="match-group-count">{items.length}</span></div><div className="property-match-list">{items.map((m:any)=><article className={`property-match-card ${isDeprioritizedDecision(m.decision_status)?"is-deprioritized":""}`} key={m.search_profile_id}><div className="property-match-main"><div className="property-match-title"><div><strong>{m.contact_name}</strong><small>{m.search_profile_number} · {m.profile_title}</small></div><div className="property-match-score">{Number(m.score).toLocaleString("de-DE",{maximumFractionDigits:0})}%</div></div><div className="property-match-facts"><span><small>Status</small><strong>{PROFILE_STATUS[m.profile_status]??m.profile_status}</strong></span><span><small>Art</small><strong>{m.transaction_type==="BUY"?"Kauf":"Miete"}</strong></span><span><small>Budget</small><strong>{range(m.min_price,m.max_price,money)}</strong></span><span><small>Wohnfläche</small><strong>{range(m.min_living_area,m.max_living_area,(v)=>number(v," m²"))}</strong></span><span><small>Zimmer</small><strong>{m.min_rooms!=null?`ab ${number(m.min_rooms)}`:"—"}</strong></span></div><div className="match-reasons">{(m.reasons??[]).map((reason:string,i:number)=><span key={`${reason}-${i}`}>{reason}</span>)}</div><div className="property-match-locations">{(m.locations??[]).map((location:string)=><span key={location}>{location}</span>)}</div></div><aside className="property-match-actions"><span className={`inquiry-status ${m.decision_status?"qualified":"new"}`}>{m.decision_status?MATCH_DECISION_LABELS[m.decision_status]??m.decision_status:"Noch keine Entscheidung"}</span><Link className="secondary-button link-button compact" to={`/search-profiles/${m.search_profile_id}`}>Suchprofil öffnen</Link><Link className="secondary-button link-button compact" to={`/crm/contacts/${m.contact_id}`}>Kontakt öffnen</Link>{canCreateViewing?<Link className="secondary-button link-button compact" to={`/viewings/new?propertyId=${property.id}&contactId=${m.contact_id}&searchProfileId=${m.search_profile_id}`}>Besichtigung anlegen</Link>:null}{canDecide?<Form method="post" className="property-match-decision"><input type="hidden" name="_intent" value="decision"/><input type="hidden" name="search_profile_id" value={m.search_profile_id}/><input type="hidden" name="score" value={m.score}/><select name="status" defaultValue={m.decision_status??"INTERESTED"}>{Object.entries(MATCH_DECISION_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button className="secondary-button compact" type="submit">Speichern</button></Form>:null}</aside></article>)}</div></section>:null)}</div>
    {matches.length===0?<p className="empty-state">Für diese Immobilie wurden aktuell keine aktiven Suchprofile bewertet.</p>:null}
   </section>
   <section className="data-card" id="besichtigungen"><div className="card-head"><div><p className="eyebrow">Termine</p><h2>Besichtigungen</h2></div>{canCreateViewing?<Link className="secondary-button link-button compact" to={`/viewings/new?propertyId=${property.id}`}>+ Besichtigung anlegen</Link>:null}</div>{canReadViewings?<div className="inquiry-list">{viewings.map((v:any)=>{const c=one(v.contacts),sp=one(v.search_profiles),inq=one(v.inquiries);return <div className="inquiry-row property-viewing-row" key={v.id}><div><strong>{v.viewing_number} · {c?.first_name} {c?.last_name}</strong><small>{sp?.search_profile_number??"Ohne Suchprofil"}{inq?.inquiry_number?` · ${inq.inquiry_number}`:""}</small></div><div><span className={`inquiry-status ${String(v.status).toLowerCase()}`}>{VIEWING_STATUS[v.status]??v.status}</span><small>{profileMap[v.primary_responsible_user]??"Nicht zugewiesen"}</small></div><div><strong>{formatDate(v.starts_at)}</strong><small>{v.status==="PLANNED"?"Nächster Schritt: Termin bestätigen":v.status==="CONFIRMED"?"Nächster Schritt: durchführen oder absagen":"Status dokumentiert"}</small></div><Link className="secondary-button link-button compact" to={`/viewings/${v.id}`}>Besichtigung öffnen</Link></div>})}{viewings.length===0?<p className="empty-state">Für diese Immobilie sind noch keine Besichtigungen angelegt.</p>:null}</div>:<p className="empty-state">Keine Berechtigung zum Anzeigen von Besichtigungen.</p>}</section>
  </div>
 </main>;
}
