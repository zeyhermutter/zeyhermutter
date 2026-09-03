import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-interests";
import { requirePermission } from "~/lib/auth.server";
import { groupMatchingRows, isDeprioritizedDecision, MATCH_DECISION_LABELS } from "~/lib/matching-priority";
import "~/inquiry.css";

type ActionResult={error?:string;ok?:string};
const PROFILE_STATUS:Record<string,string>={ACTIVE:"Aktiv",PAUSED:"Pausiert",CLOSED:"Geschlossen"};
const DISCLOSURE_CHANNEL:Record<string,string>={EXPOSE_EMAIL:"Exposé per E-Mail",PORTAL:"Portal",WEBSITE:"Website",IN_PERSON:"Persönlich",VIEWING:"Besichtigung",PHONE:"Telefon",POSTAL:"Post",OTHER:"Sonstiges"};
const DISCLOSURE_ACK:Record<string,string>={NONE:"Keine Bestätigung",EMAIL_REPLY:"Antwort per E-Mail",READ_RECEIPT:"Lesebestätigung",SIGNATURE:"Unterschrift",PORTAL_LOG:"Portalprotokoll",VERBAL:"Mündlich bestätigt",OTHER:"Sonstiges"};
const VIEWING_STATUS:Record<string,string>={PLANNED:"Geplant",CONFIRMED:"Bestätigt",COMPLETED:"Durchgeführt",CANCELLED:"Abgesagt",NO_SHOW:"Nicht erschienen"};
function one(v:any){return Array.isArray(v)?v[0]:v;}
function text(fd:FormData,k:string){return String(fd.get(k)??"").trim();}
function money(v:any){return v==null?"—":new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(Number(v));}
function number(v:any,suffix=""){return v==null?"—":`${new Intl.NumberFormat("de-DE",{maximumFractionDigits:1}).format(Number(v))}${suffix}`;}
function range(min:any,max:any,formatter:(v:any)=>string){if(min==null&&max==null)return"—";if(min!=null&&max!=null)return`${formatter(min)} – ${formatter(max)}`;if(min!=null)return`ab ${formatter(min)}`;return`bis ${formatter(max)}`;}
function nowLocal(){const d=new Date();const pad=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
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
 const [{data:property,error:propertyError},{data:matches,error:matchError},{data:viewings,error:viewingError},{data:profiles},{data:canDecide},{data:canCreateViewing},{data:canReadDisclosures},{data:canWriteDisclosures}]=await Promise.all([
  supabase.from("properties").select("id,property_number,internal_title,status,transaction_type").eq("id",propertyId).maybeSingle(),
  supabase.rpc("match_search_profiles_for_property",{p_property_id:propertyId,p_limit:100}),
  viewingsPromise,
  supabase.from("profiles").select("user_id,display_name,status").eq("status","ACTIVE").order("display_name"),
  supabase.rpc("current_user_has_permission",{p_permission:"search_profile.write"}),
  supabase.rpc("current_user_has_permission",{p_permission:"viewing.write"}),
  supabase.rpc("current_user_has_permission",{p_permission:"disclosure.read"}),
  supabase.rpc("current_user_has_permission",{p_permission:"disclosure.write"}),
 ]);
 if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});
 if(matchError||viewingError)throw new Response("Interessenten und Besichtigungen konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
 let disclosures:any[]=[],disclosureContacts:any[]=[],publicationVersions:any[]=[],exposes:any[]=[];
 if(canReadDisclosures===true){
  const [d,c,pv,ex]=await Promise.all([
   supabase.from("property_disclosures").select("id,disclosure_number,contact_id,disclosed_at,channel,channel_reference,acknowledgement_kind,acknowledged_at,acknowledgement_reference,prior_knowledge_declared,prior_knowledge_source,prior_knowledge_on,resale_prohibition_notice_given,notes,primary_responsible_user,archived_at,publication_version_id,expose_id,viewing_id,contacts(id,contact_number,first_name,last_name)").eq("property_id",propertyId).order("disclosed_at",{ascending:false}).limit(300),
   supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
   supabase.from("property_publication_versions").select("id,version_number,published_at,is_current_public,property_publications!inner(property_id)").eq("property_publications.property_id",propertyId).order("version_number",{ascending:false}).limit(50),
   supabase.from("property_exposes").select("id,expose_number,version_number,status").eq("property_id",propertyId).order("created_at",{ascending:false}).limit(50),
  ]);
  disclosures=d.data??[];disclosureContacts=c.data??[];publicationVersions=pv.data??[];exposes=ex.data??[];
 }
 return data({property,matches:matches??[],viewings:viewings??[],profiles:profiles??[],profile,canDecide:canDecide===true,canCreateViewing:canCreateViewing===true,canReadViewings:canReadViewings===true,disclosures,disclosureContacts,publicationVersions,exposes,canReadDisclosures:canReadDisclosures===true,canWriteDisclosures:canWriteDisclosures===true},{headers:responseHeaders()});
}

function disclosureError(error:any){const m=String(error?.message??"");
 if(m.includes("DISCLOSURE_PRIOR_KNOWLEDGE_SOURCE_REQUIRED"))return"Bitte angeben, woher der Interessent das Objekt bereits kannte.";
 if(m.includes("DISCLOSURE_ACKNOWLEDGEMENT_DATE_REQUIRED"))return"Zu einer Empfangsbestätigung gehört auch deren Zeitpunkt.";
 if(m.includes("DISCLOSURE_DATE_IN_FUTURE"))return"Ein Nachweis kann nicht in der Zukunft liegen.";
 if(m.includes("DISCLOSURE_CONTACT_ARCHIVED"))return"Für einen archivierten Kontakt kann kein Nachweis erfasst werden.";
 if(m.includes("DISCLOSURE_SEARCH_PROFILE_CONTACT_MISMATCH"))return"Das gewählte Suchprofil gehört nicht zu diesem Interessenten.";
 if(m.includes("DISCLOSURE_INQUIRY_MISMATCH"))return"Die gewählte Anfrage passt nicht zu Interessent und Objekt.";
 if(m.includes("DISCLOSURE_VIEWING_MISMATCH"))return"Die gewählte Besichtigung passt nicht zu Interessent und Objekt.";
 if(m.includes("DISCLOSURE_PUBLICATION_PROPERTY_MISMATCH"))return"Die gewählte Publikationsversion gehört nicht zu dieser Immobilie.";
 if(m.includes("DISCLOSURE_EXPOSE_PROPERTY_MISMATCH"))return"Das gewählte Exposé gehört nicht zu dieser Immobilie.";
 if(m.includes("ARCHIVED_DISCLOSURE_IMMUTABLE"))return"Ein archivierter Nachweis kann nicht verändert werden.";
 if(m.includes("property_disclosures_ack_order_check"))return"Die Empfangsbestätigung darf nicht vor dem Nachweis liegen.";
 return"Der Objektnachweis konnte nicht gespeichert werden.";}

export async function action({request,context,params}:Route.ActionArgs){
 const rawIntent=String((await request.clone().formData()).get("_intent")??"").trim();
 if(rawIntent==="disclosure"||rawIntent==="disclosure_archive"){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"disclosure.write");
  const {data:canReadProperty}=await supabase.rpc("current_user_has_permission",{p_permission:"property.read"});
  if(canReadProperty!==true)throw new Response("Keine Berechtigung für diese Immobilie.",{status:403,headers:responseHeaders()});
  const fd=await request.formData(),propertyId=params.propertyId!;
  if(rawIntent==="disclosure_archive"){
   await requirePermission(request,context.cloudflare.env,"disclosure.archive");
   const id=text(fd,"disclosure_id"),restore=text(fd,"mode")==="restore";
   const {error}=await supabase.from("property_disclosures").update({archived_at:restore?null:new Date().toISOString()}).eq("id",id).eq("property_id",propertyId);
   if(error)return data<ActionResult>({error:disclosureError(error)},{status:400,headers:responseHeaders()});
   return data<ActionResult>({ok:restore?"Nachweis wiederhergestellt.":"Nachweis archiviert."},{headers:responseHeaders()});
  }
  const contactId=text(fd,"contact_id"),disclosedAt=text(fd,"disclosed_at");
  if(!contactId)return data<ActionResult>({error:"Bitte einen Interessenten auswählen."},{status:400,headers:responseHeaders()});
  if(!disclosedAt)return data<ActionResult>({error:"Bitte Datum und Uhrzeit des Nachweises angeben."},{status:400,headers:responseHeaders()});
  const when=new Date(disclosedAt);
  if(Number.isNaN(when.getTime()))return data<ActionResult>({error:"Bitte einen gültigen Zeitpunkt für den Nachweis angeben."},{status:400,headers:responseHeaders()});
  if(when.getTime()>Date.now()+5*60*1000)return data<ActionResult>({error:"Ein Nachweis kann nicht in der Zukunft liegen."},{status:400,headers:responseHeaders()});
  const ackKind=text(fd,"acknowledgement_kind")||"NONE",ackAt=text(fd,"acknowledged_at");
  if(ackKind!=="NONE"&&!ackAt)return data<ActionResult>({error:"Zu einer Empfangsbestätigung gehört auch deren Zeitpunkt."},{status:400,headers:responseHeaders()});
  const prior=text(fd,"prior_knowledge_declared")==="yes";
  if(prior&&!text(fd,"prior_knowledge_source"))return data<ActionResult>({error:"Bitte angeben, woher der Interessent das Objekt bereits kannte."},{status:400,headers:responseHeaders()});
  const payload={property_id:propertyId,contact_id:contactId,disclosed_at:when.toISOString(),channel:text(fd,"channel")||"EXPOSE_EMAIL",channel_reference:text(fd,"channel_reference")||null,
   publication_version_id:text(fd,"publication_version_id")||null,expose_id:text(fd,"expose_id")||null,viewing_id:text(fd,"viewing_id")||null,
   acknowledgement_kind:ackKind,acknowledged_at:ackKind==="NONE"?null:new Date(ackAt).toISOString(),acknowledgement_reference:text(fd,"acknowledgement_reference")||null,
   prior_knowledge_declared:prior,prior_knowledge_source:prior?text(fd,"prior_knowledge_source"):null,prior_knowledge_on:prior?(text(fd,"prior_knowledge_on")||null):null,
   resale_prohibition_notice_given:text(fd,"resale_prohibition_notice_given")==="yes",notes:text(fd,"notes")||null,
   primary_responsible_user:userId,created_by:userId,updated_by:userId};
  const {error}=await supabase.from("property_disclosures").insert(payload);
  if(error)return data<ActionResult>({error:disclosureError(error)},{status:400,headers:responseHeaders()});
  return data<ActionResult>({ok:"Objektnachweis dokumentiert."},{headers:responseHeaders()});
 }
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
 const {property,matches,viewings,profiles,profile,canDecide,canCreateViewing,canReadViewings,disclosures,disclosureContacts,publicationVersions,exposes,canReadDisclosures,canWriteDisclosures}=useLoaderData<typeof loader>();
 const result=useActionData<typeof action>();
 const profileMap=Object.fromEntries(profiles.map((x:any)=>[x.user_id,x.display_name]));
 const matchGroups=groupMatchingRows(matches as any[]);
 const firstDisclosureIds=new Set<string>();
 {const earliest=new Map<string,any>();for(const d of disclosures as any[]){if(d.archived_at)continue;const current=earliest.get(d.contact_id);if(!current||new Date(d.disclosed_at)<new Date(current.disclosed_at))earliest.set(d.contact_id,d);}for(const d of earliest.values())firstDisclosureIds.add(d.id);}
 return <main className="editor-shell">
  <header className="editor-header"><div><Link className="back-link" to={`/properties/${property.id}`}>← Objektakte</Link><p className="eyebrow">{property.property_number} · Modul 04</p><h1 className="editor-title">Interessenten & Besichtigungen</h1><p className="editor-meta">{property.internal_title} · Reverse Matching und Termine direkt an der Immobilie.</p></div><div className="header-user">{canCreateViewing?<Link className="primary-button link-button" to={`/viewings/new?propertyId=${property.id}`}>+ Besichtigung anlegen</Link>:null}<span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
  <div className="inquiry-page">
   {result?.error?<div className="form-error">{result.error}</div>:null}{result?.ok?<div className="success-banner">{result.ok}</div>:null}
   <section className="data-card" id="interessenten"><div className="card-head"><div><p className="eyebrow">Reverse Matching</p><h2>Passende Interessenten</h2></div><span className="subtle">{matches.length} aktive Suchprofile</span></div>
    <p className="match-legend">Gruppierung: 85–100 % sehr passend · 70–84 % passend · 50–69 % teilweise passend · unter 50 % nicht passend. Entscheidungen verändern den fachlichen Score nicht; abgelehnt und ungeeignet werden lediglich nach hinten priorisiert.</p>
    <div className="match-group-stack">{matchGroups.map(({group,items})=>items.length?<section className={`match-group ${group.className}`} key={group.key}><div className="match-group-head"><div className="match-group-title"><strong>{group.label}</strong><small>{group.hint}</small></div><span className="match-group-count">{items.length}</span></div><div className="property-match-list">{items.map((m:any)=><article className={`property-match-card ${isDeprioritizedDecision(m.decision_status)?"is-deprioritized":""}`} key={m.search_profile_id}><div className="property-match-main"><div className="property-match-title"><div><strong>{m.contact_name}</strong><small>{m.search_profile_number} · {m.profile_title}</small></div><div className="property-match-score">{Number(m.score).toLocaleString("de-DE",{maximumFractionDigits:0})}%</div></div><div className="property-match-facts"><span><small>Status</small><strong>{PROFILE_STATUS[m.profile_status]??m.profile_status}</strong></span><span><small>Art</small><strong>{m.transaction_type==="BUY"?"Kauf":"Miete"}</strong></span><span><small>Budget</small><strong>{range(m.min_price,m.max_price,money)}</strong></span><span><small>Wohnfläche</small><strong>{range(m.min_living_area,m.max_living_area,(v)=>number(v," m²"))}</strong></span><span><small>Zimmer</small><strong>{m.min_rooms!=null?`ab ${number(m.min_rooms)}`:"—"}</strong></span></div><div className="match-reasons">{(m.reasons??[]).map((reason:string,i:number)=><span key={`${reason}-${i}`}>{reason}</span>)}</div><div className="property-match-locations">{(m.locations??[]).map((location:string)=><span key={location}>{location}</span>)}</div></div><aside className="property-match-actions"><span className={`inquiry-status ${m.decision_status?"qualified":"new"}`}>{m.decision_status?MATCH_DECISION_LABELS[m.decision_status]??m.decision_status:"Noch keine Entscheidung"}</span><Link className="secondary-button link-button compact" to={`/search-profiles/${m.search_profile_id}`}>Suchprofil öffnen</Link><Link className="secondary-button link-button compact" to={`/crm/contacts/${m.contact_id}`}>Kontakt öffnen</Link>{canCreateViewing?<Link className="secondary-button link-button compact" to={`/viewings/new?propertyId=${property.id}&contactId=${m.contact_id}&searchProfileId=${m.search_profile_id}`}>Besichtigung anlegen</Link>:null}{canDecide?<Form method="post" className="property-match-decision"><input type="hidden" name="_intent" value="decision"/><input type="hidden" name="search_profile_id" value={m.search_profile_id}/><input type="hidden" name="score" value={m.score}/><select name="status" defaultValue={m.decision_status??"INTERESTED"}>{Object.entries(MATCH_DECISION_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button className="secondary-button compact" type="submit">Speichern</button></Form>:null}</aside></article>)}</div></section>:null)}</div>
    {matches.length===0?<p className="empty-state">Für diese Immobilie wurden aktuell keine aktiven Suchprofile bewertet.</p>:null}
   </section>
   <section className="data-card" id="objektnachweise"><div className="card-head"><div><p className="eyebrow">Interessentenschutz</p><h2>Objektnachweise</h2></div><span className="subtle">{canReadDisclosures?`${disclosures.filter((d:any)=>!d.archived_at).length} dokumentiert`:"Keine Berechtigung"}</span></div>
    <p className="match-legend">Hier wird festgehalten, wem wann auf welchem Weg dieses Objekt nachgewiesen wurde. Der Nachweis ist unabhängig von der Match-Entscheidung oben. Das System dokumentiert nur — es bewertet weder Kausalität noch einen Provisionsanspruch.</p>
    {canReadDisclosures?<>
     <div className="inquiry-list">{disclosures.map((d:any)=>{const c=one(d.contacts);const first=firstDisclosureIds.has(d.id);return <div className={`inquiry-row${d.archived_at?" is-archived":""}`} key={d.id}>
      <div><strong>{d.disclosure_number} · {c?`${c.first_name} ${c.last_name}`:"Interessent"}</strong><small>{c?.contact_number??"—"}{d.channel_reference?` · ${d.channel_reference}`:""}</small></div>
      <div><span className="inquiry-status qualified">{DISCLOSURE_CHANNEL[d.channel]??d.channel}</span><small>{first?"Erstnachweis":"Weiterer Nachweis"}</small></div>
      <div><strong>{formatDate(d.disclosed_at)}</strong><small>{d.acknowledgement_kind==="NONE"?"Ohne Empfangsbestätigung":`${DISCLOSURE_ACK[d.acknowledgement_kind]??d.acknowledgement_kind} · ${formatDate(d.acknowledged_at)}`}</small></div>
      <div><small>{d.prior_knowledge_declared?`Vorkenntnis erklärt: ${d.prior_knowledge_source}${d.prior_knowledge_on?` (${new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(d.prior_knowledge_on))})`:""}`:"Keine Vorkenntnis erklärt"}</small><small>{d.resale_prohibition_notice_given?"Weitergabeverbot erteilt":"Weitergabeverbot nicht dokumentiert"}</small></div>
      <div><Link className="secondary-button link-button compact" to={`/crm/contacts/${d.contact_id}`}>Kontakt öffnen</Link>{canWriteDisclosures?<Form method="post"><input type="hidden" name="_intent" value="disclosure_archive"/><input type="hidden" name="disclosure_id" value={d.id}/><input type="hidden" name="mode" value={d.archived_at?"restore":"archive"}/><button className="secondary-button compact" type="submit">{d.archived_at?"Wiederherstellen":"Archivieren"}</button></Form>:null}</div>
     </div>})}{disclosures.length===0?<p className="empty-state">Für dieses Objekt ist noch kein Nachweis dokumentiert.</p>:null}</div>
     {canWriteDisclosures?<Form method="post" className="disclosure-form">
      <input type="hidden" name="_intent" value="disclosure"/>
      <div className="form-grid">
       <label className="form-field"><span>Interessent *</span><select name="contact_id" required defaultValue=""><option value="">Auswählen…</option>{disclosureContacts.map((c:any)=><option value={c.id} key={c.id}>{c.last_name}, {c.first_name} · {c.contact_number}</option>)}</select></label>
       <label className="form-field"><span>Nachgewiesen am *</span><input name="disclosed_at" type="datetime-local" defaultValue={nowLocal()} required/></label>
       <label className="form-field"><span>Weg *</span><select name="channel" defaultValue="EXPOSE_EMAIL" required>{Object.entries(DISCLOSURE_CHANNEL).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
       <label className="form-field"><span>Referenz zum Weg</span><input name="channel_reference" placeholder="z. B. E-Mail-Betreff, Portal-Vorgang"/></label>
       <label className="form-field"><span>Nachgewiesene Publikationsversion</span><select name="publication_version_id" defaultValue=""><option value="">Ohne Versionsbezug</option>{publicationVersions.map((v:any)=><option value={v.id} key={v.id}>Version {v.version_number}{v.is_current_public?" · aktuell öffentlich":""}</option>)}</select></label>
       <label className="form-field"><span>Nachgewiesenes Exposé</span><select name="expose_id" defaultValue=""><option value="">Ohne Exposébezug</option>{exposes.map((e:any)=><option value={e.id} key={e.id}>{e.expose_number} · Version {e.version_number}</option>)}</select></label>
       <label className="form-field"><span>Bezug zur Besichtigung</span><select name="viewing_id" defaultValue=""><option value="">Ohne Besichtigungsbezug</option>{viewings.map((v:any)=><option value={v.id} key={v.id}>{v.viewing_number} · {formatDate(v.starts_at)}</option>)}</select><small className="subtle">Nur Besichtigungen desselben Interessenten sind zulässig.</small></label>
       <label className="form-field"><span>Empfangsbestätigung</span><select name="acknowledgement_kind" defaultValue="NONE">{Object.entries(DISCLOSURE_ACK).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
       <label className="form-field"><span>Bestätigt am</span><input name="acknowledged_at" type="datetime-local"/></label>
       <label className="form-field"><span>Nachweis der Bestätigung</span><input name="acknowledgement_reference" placeholder="z. B. Antwortmail, Protokollnummer"/></label>
       <label className="form-field"><span>Vorkenntnis erklärt *</span><select name="prior_knowledge_declared" defaultValue="no" required><option value="no">Nein</option><option value="yes">Ja</option></select></label>
       <label className="form-field"><span>Woher bereits bekannt</span><input name="prior_knowledge_source" placeholder="Quelle laut Interessent"/></label>
       <label className="form-field"><span>Bekannt seit</span><input name="prior_knowledge_on" type="date"/></label>
       <label className="form-field"><span>Hinweis auf Weitergabeverbot erteilt *</span><select name="resale_prohibition_notice_given" defaultValue="yes" required><option value="yes">Ja</option><option value="no">Nein</option></select></label>
      </div>
      <label className="form-field full-width"><span>Bemerkung</span><textarea name="notes" rows={2}/></label>
      <div className="form-actions"><button className="primary-button" type="submit">Objektnachweis dokumentieren</button></div>
     </Form>:null}
    </>:<p className="empty-state">Keine Berechtigung zum Anzeigen von Objektnachweisen.</p>}
   </section>
   <section className="data-card" id="besichtigungen"><div className="card-head"><div><p className="eyebrow">Termine</p><h2>Besichtigungen</h2></div>{canCreateViewing?<Link className="secondary-button link-button compact" to={`/viewings/new?propertyId=${property.id}`}>+ Besichtigung anlegen</Link>:null}</div>{canReadViewings?<div className="inquiry-list">{viewings.map((v:any)=>{const c=one(v.contacts),sp=one(v.search_profiles),inq=one(v.inquiries);return <div className="inquiry-row property-viewing-row" key={v.id}><div><strong>{v.viewing_number} · {c?.first_name} {c?.last_name}</strong><small>{sp?.search_profile_number??"Ohne Suchprofil"}{inq?.inquiry_number?` · ${inq.inquiry_number}`:""}</small></div><div><span className={`inquiry-status ${String(v.status).toLowerCase()}`}>{VIEWING_STATUS[v.status]??v.status}</span><small>{profileMap[v.primary_responsible_user]??"Nicht zugewiesen"}</small></div><div><strong>{formatDate(v.starts_at)}</strong><small>{v.status==="PLANNED"?"Nächster Schritt: Termin bestätigen":v.status==="CONFIRMED"?"Nächster Schritt: durchführen oder absagen":"Status dokumentiert"}</small></div><Link className="secondary-button link-button compact" to={`/viewings/${v.id}`}>Besichtigung öffnen</Link></div>})}{viewings.length===0?<p className="empty-state">Für diese Immobilie sind noch keine Besichtigungen angelegt.</p>:null}</div>:<p className="empty-state">Keine Berechtigung zum Anzeigen von Besichtigungen.</p>}</section>
  </div>
 </main>;
}
