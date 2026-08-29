import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-media";
import { requirePermission } from "~/lib/auth.server";

type ActionResult = { error?: string };
const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg","image/png","image/webp","image/heic","video/mp4","application/pdf"]);

function text(fd: FormData,key:string){return String(fd.get(key)??"").trim();}
function safeFilename(name:string){const v=name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-");return v.slice(-140)||"medium";}
function formatSize(bytes:number){return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"property.read");
  const propertyId=params.propertyId;
  const [{data:property,error:propertyError},{data:media,error:mediaError}]=await Promise.all([
    supabase.from("properties").select("id,property_number,internal_title").eq("id",propertyId).maybeSingle(),
    supabase.from("property_media").select("id,media_type,storage_bucket,storage_path,title,alt_text,sort_order,public_approved,version,created_at").eq("property_id",propertyId).is("archived_at",null).order("sort_order").order("created_at"),
  ]);
  if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});
  if(mediaError)throw new Response("Medien konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const signedUrls:Record<string,string>={};
  await Promise.all((media??[]).map(async(item)=>{const {data:signed}=await supabase.storage.from(item.storage_bucket).createSignedUrl(item.storage_path,600);if(signed?.signedUrl)signedUrls[item.id]=signed.signedUrl;}));
  return data({property,media:media??[],signedUrls,profile},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"property.write");
  const propertyId=params.propertyId; const fd=await request.formData(); const intent=text(fd,"_intent");
  if(intent==="archive"){
    const {data:updated,error}=await supabase.from("property_media").update({archived_at:new Date().toISOString()}).eq("id",text(fd,"media_id")).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:"Medium konnte nicht archiviert werden."},{status:400,headers:responseHeaders()});
    if(!updated)return data<ActionResult>({error:"Medium wurde zwischenzeitlich geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});
    return redirect(`/properties/${propertyId}/media`,{headers:responseHeaders()});
  }
  if(intent!=="upload")return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
  const file=fd.get("file");
  if(!(file instanceof File)||file.size===0)return data<ActionResult>({error:"Bitte eine Datei auswählen."},{status:400,headers:responseHeaders()});
  if(file.size>MAX_UPLOAD_BYTES)return data<ActionResult>({error:"Datei ist zu groß. Maximal 75 MB."},{status:400,headers:responseHeaders()});
  if(!ALLOWED.has(file.type))return data<ActionResult>({error:`Dateityp ${file.type||"unbekannt"} ist nicht freigegeben.`},{status:400,headers:responseHeaders()});
  const mediaType=text(fd,"media_type")||"IMAGE";
  if(mediaType==="VIDEO"&&file.type!=="video/mp4")return data<ActionResult>({error:"Videos müssen als MP4 vorliegen."},{status:400,headers:responseHeaders()});
  const storagePath=`properties/${propertyId}/media/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const {error:uploadError}=await supabase.storage.from("zm-property-media").upload(storagePath,file,{contentType:file.type,upsert:false});
  if(uploadError)return data<ActionResult>({error:"Medium konnte nicht in den privaten Storage geladen werden."},{status:400,headers:responseHeaders()});
  const {error:insertError}=await supabase.from("property_media").insert({property_id:propertyId,media_type:mediaType,storage_bucket:"zm-property-media",storage_path:storagePath,title:text(fd,"title")||file.name,alt_text:text(fd,"alt_text")||null,sort_order:Number(text(fd,"sort_order")||"0"),public_approved:fd.get("public_approved")==="on",created_by:userId,updated_by:userId});
  if(insertError){await supabase.storage.from("zm-property-media").remove([storagePath]);return data<ActionResult>({error:"Medium konnte nicht registriert werden. Upload wurde wieder entfernt."},{status:400,headers:responseHeaders()});}
  return redirect(`/properties/${propertyId}/media`,{headers:responseHeaders()});
}

export default function PropertyMedia(){
  const {property,media,signedUrls,profile}=useLoaderData<typeof loader>();const result=useActionData<typeof action>();
  return <main className="editor-shell"><header className="editor-header"><div><Link className="back-link" to={`/properties/${property.id}`}>← {property.property_number}</Link><p className="eyebrow">Modul 02 · Medien</p><h1 className="editor-title">Medienbibliothek</h1><p className="editor-meta">{property.internal_title} · private Ablage</p></div><div className="header-user"><span className="badge">STAGING</span><small>{profile.display_name}</small></div></header>{result?.error?<div className="form-error">{result.error}</div>:null}
    <div className="dashboard-grid"><section className="data-card"><div className="card-head"><div><p className="eyebrow">Fotos · Grundrisse · Videos</p><h2>Medien</h2></div><span className="subtle">{media.length}</span></div><div className="media-grid">{media.map(item=><article className="media-card" key={item.id}>{signedUrls[item.id]&&item.media_type==="IMAGE"?<img src={signedUrls[item.id]} alt={item.alt_text??item.title??"Objektbild"}/>:signedUrls[item.id]?<a className="media-placeholder" href={signedUrls[item.id]} target="_blank" rel="noreferrer">{item.media_type} öffnen</a>:<div className="media-placeholder">Kein Zugriff</div>}<div className="media-meta"><strong>{item.title??item.media_type}</strong><small>{item.media_type} · Sortierung {item.sort_order}{item.public_approved?" · für Veröffentlichung freigegeben":" · intern"}</small><Form method="post"><input type="hidden" name="_intent" value="archive"/><input type="hidden" name="media_id" value={item.id}/><input type="hidden" name="version" value={item.version}/><button className="text-button" type="submit">Archivieren</button></Form></div></article>)}{media.length===0?<p className="empty-state">Noch keine Medien vorhanden.</p>:null}</div></section>
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Neu · max. 75 MB</p><h2>Medium hochladen</h2></div></div><Form method="post" encType="multipart/form-data" className="auth-form"><input type="hidden" name="_intent" value="upload"/><label><span>Typ</span><select name="media_type" defaultValue="IMAGE"><option value="IMAGE">Foto</option><option value="FLOOR_PLAN">Grundriss</option><option value="VIDEO">Video</option><option value="OTHER">Sonstige</option></select></label><label><span>Titel</span><input name="title"/></label><label><span>Alt-Text / Beschreibung</span><input name="alt_text"/></label><label><span>Sortierung</span><input name="sort_order" type="number" defaultValue="0"/></label><label><span>Datei *</span><input name="file" type="file" required/></label><label className="checkbox-row"><input name="public_approved" type="checkbox"/><span>Für spätere Veröffentlichung freigeben</span></label><button className="primary-button" type="submit">Sicher hochladen</button></Form></section></div>
  </main>;
}
