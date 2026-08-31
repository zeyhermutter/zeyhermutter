import { useState } from "react";
import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-media";
import { AssetPreviewModal, type AssetPreviewKind } from "~/components/asset-preview-modal";
import { requirePermission } from "~/lib/auth.server";

type ActionResult = { error?: string };
const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg","image/png","image/webp","image/heic"]);
const ALLOWED = new Set([...IMAGE_MIME_TYPES,"video/mp4","application/pdf"]);
const MEDIA_TYPES = new Set(["IMAGE","FLOOR_PLAN","VIDEO","OTHER"]);

const MEDIA_TYPE_LABELS:Record<string,string>={
  IMAGE:"Foto",
  FLOOR_PLAN:"Grundriss",
  VIDEO:"Video",
  OTHER:"Sonstige",
};

function mediaTypeLabel(value:string){return MEDIA_TYPE_LABELS[value]??value;}
function mimeAllowedForType(mediaType:string,mimeType:string){
  if(mediaType==="IMAGE") return IMAGE_MIME_TYPES.has(mimeType);
  if(mediaType==="FLOOR_PLAN") return IMAGE_MIME_TYPES.has(mimeType)||mimeType==="application/pdf";
  if(mediaType==="VIDEO") return mimeType==="video/mp4";
  return ALLOWED.has(mimeType);
}
function text(fd: FormData,key:string){return String(fd.get(key)??"").trim();}
function safeFilename(name:string){const v=name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-");return v.slice(-140)||"medium";}
function formatDate(value:string){return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(value));}
function displayFilename(storagePath:string){const filename=storagePath.split("/").pop()??storagePath;return filename.length>37&&filename[36]==="-"?filename.slice(37):filename;}
function mediaPreviewKind(mediaType:string,storagePath:string):AssetPreviewKind{
  const path=storagePath.toLowerCase();
  if(mediaType==="VIDEO"||path.endsWith(".mp4"))return "video";
  if(path.endsWith(".pdf"))return "pdf";
  if(mediaType==="IMAGE"||/\.(jpe?g|png|webp|heic)$/.test(path))return "image";
  if(mediaType==="FLOOR_PLAN"&& !path.endsWith(".pdf"))return "image";
  return "file";
}

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
  const downloadUrls:Record<string,string>={};
  await Promise.all((media??[]).map(async(item)=>{
    const [previewResult,downloadResult]=await Promise.all([
      supabase.storage.from(item.storage_bucket).createSignedUrl(item.storage_path,600),
      supabase.storage.from(item.storage_bucket).createSignedUrl(item.storage_path,600,{download:displayFilename(item.storage_path)}),
    ]);
    if(previewResult.data?.signedUrl)signedUrls[item.id]=previewResult.data.signedUrl;
    if(downloadResult.data?.signedUrl)downloadUrls[item.id]=downloadResult.data.signedUrl;
  }));
  return data({property,media:media??[],signedUrls,downloadUrls,profile},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"property.write");
  const propertyId=params.propertyId; const fd=await request.formData(); const intent=text(fd,"_intent");

  if(intent==="metadata_update"){
    const mediaId=text(fd,"media_id");
    const version=Number(text(fd,"version"));
    const title=text(fd,"title");
    const sortOrder=Number(text(fd,"sort_order"));
    if(!mediaId||!Number.isInteger(version)||version<1)return data<ActionResult>({error:"Ungültiger Medienstand. Bitte Seite neu laden."},{status:400,headers:responseHeaders()});
    if(!title)return data<ActionResult>({error:"Der Medientitel ist erforderlich."},{status:400,headers:responseHeaders()});
    if(!Number.isInteger(sortOrder))return data<ActionResult>({error:"Die Sortierung muss eine ganze Zahl sein."},{status:400,headers:responseHeaders()});

    const {data:updated,error}=await supabase
      .from("property_media")
      .update({title,alt_text:text(fd,"alt_text")||null,sort_order:sortOrder,public_approved:fd.get("public_approved")==="on"})
      .eq("id",mediaId)
      .eq("property_id",propertyId)
      .eq("version",version)
      .select("id")
      .maybeSingle();
    if(error)return data<ActionResult>({error:"Medien-Metadaten konnten nicht gespeichert werden."},{status:400,headers:responseHeaders()});
    if(!updated)return data<ActionResult>({error:"Medium wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});
    return redirect(`/properties/${propertyId}/media`,{headers:responseHeaders()});
  }

  if(intent==="archive"){
    const {data:updated,error}=await supabase.from("property_media").update({archived_at:new Date().toISOString()}).eq("id",text(fd,"media_id")).eq("property_id",propertyId).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
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
  if(!MEDIA_TYPES.has(mediaType))return data<ActionResult>({error:"Ungültiger Medientyp."},{status:400,headers:responseHeaders()});
  if(!mimeAllowedForType(mediaType,file.type))return data<ActionResult>({error:"Dateityp und gewählter Medientyp passen nicht zusammen."},{status:400,headers:responseHeaders()});
  const sortOrder=Number(text(fd,"sort_order")||"0");
  if(!Number.isInteger(sortOrder))return data<ActionResult>({error:"Die Sortierung muss eine ganze Zahl sein."},{status:400,headers:responseHeaders()});
  const storagePath=`properties/${propertyId}/media/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const {error:uploadError}=await supabase.storage.from("zm-property-media").upload(storagePath,file,{contentType:file.type,upsert:false});
  if(uploadError)return data<ActionResult>({error:"Medium konnte nicht in den privaten Storage geladen werden."},{status:400,headers:responseHeaders()});
  const {error:insertError}=await supabase.from("property_media").insert({property_id:propertyId,media_type:mediaType,storage_bucket:"zm-property-media",storage_path:storagePath,title:text(fd,"title")||file.name,alt_text:text(fd,"alt_text")||null,sort_order:sortOrder,public_approved:fd.get("public_approved")==="on",created_by:userId,updated_by:userId});
  if(insertError){await supabase.storage.from("zm-property-media").remove([storagePath]);return data<ActionResult>({error:"Medium konnte nicht registriert werden. Upload wurde wieder entfernt."},{status:400,headers:responseHeaders()});}
  return redirect(`/properties/${propertyId}/media`,{headers:responseHeaders()});
}

export default function PropertyMedia(){
  const {property,media,signedUrls,downloadUrls,profile}=useLoaderData<typeof loader>();
  const result=useActionData<typeof action>();
  const [openIndex,setOpenIndex]=useState<number|null>(null);
  const activeItem=openIndex===null?null:media[openIndex];
  const activeUrl=activeItem?signedUrls[activeItem.id]:undefined;
  const activeDownloadUrl=activeItem?downloadUrls[activeItem.id]:undefined;

  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to={`/properties/${property.id}`}>← {property.property_number}</Link><p className="eyebrow">Modul 02 · Medien</p><h1 className="editor-title">Medienbibliothek</h1><p className="editor-meta">{property.internal_title} · private Ablage</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
    {result?.error?<div className="form-error">{result.error}</div>:null}

    <div className="dashboard-grid">
      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Fotos · Grundrisse · Videos</p><h2>Medien</h2></div><span className="subtle">{media.length}</span></div>
        <div className="media-grid">
          {media.map((item,index)=>{
            const kind=mediaPreviewKind(item.media_type,item.storage_path);
            return <article className="media-card" key={item.id}>
              <button className="media-preview-trigger" type="button" onClick={()=>setOpenIndex(index)}>
                {signedUrls[item.id]&&kind==="image"?<img src={signedUrls[item.id]} alt={item.alt_text??item.title??"Objektbild"}/>:<div className="media-placeholder">{signedUrls[item.id]?`${mediaTypeLabel(item.media_type)} ansehen`:"Kein Zugriff"}</div>}
                <div className="media-preview-caption"><strong>{item.title??mediaTypeLabel(item.media_type)}</strong><small>{mediaTypeLabel(item.media_type)} · Sortierung {item.sort_order}{item.public_approved?" · freigegeben":" · intern"}</small>{item.alt_text?<span>{item.alt_text}</span>:null}</div>
              </button>
            </article>;
          })}
          {media.length===0?<p className="empty-state">Noch keine Medien vorhanden.</p>:null}
        </div>
      </section>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Neu · max. 75 MB</p><h2>Medium hochladen</h2></div></div>
        <Form method="post" encType="multipart/form-data" className="auth-form"><input type="hidden" name="_intent" value="upload"/><label><span>Typ</span><select name="media_type" defaultValue="IMAGE"><option value="IMAGE">Foto</option><option value="FLOOR_PLAN">Grundriss</option><option value="VIDEO">Video</option><option value="OTHER">Sonstige</option></select></label><label><span>Titel</span><input name="title"/></label><label><span>Alt-Text / Beschreibung</span><input name="alt_text"/></label><label><span>Sortierung</span><input name="sort_order" type="number" defaultValue="0"/></label><label><span>Datei *</span><input name="file" type="file" required/></label><label className="checkbox-row"><input name="public_approved" type="checkbox"/><span>Für spätere Veröffentlichung freigeben</span></label><button className="primary-button" type="submit">Sicher hochladen</button></Form>
      </section>
    </div>

    {activeItem?<AssetPreviewModal
      open={true}
      title={activeItem.title??mediaTypeLabel(activeItem.media_type)}
      subtitle={`${mediaTypeLabel(activeItem.media_type)} · ${activeItem.public_approved?"für Veröffentlichung freigegeben":"intern"}`}
      url={activeUrl}
      downloadUrl={activeDownloadUrl}
      downloadName={displayFilename(activeItem.storage_path)}
      editorResetKey={activeItem.version}
      kind={mediaPreviewKind(activeItem.media_type,activeItem.storage_path)}
      positionLabel={`${(openIndex??0)+1} von ${media.length}`}
      hasPrevious={(openIndex??0)>0}
      hasNext={(openIndex??0)<media.length-1}
      onPrevious={()=>setOpenIndex((index)=>index===null?0:Math.max(0,index-1))}
      onNext={()=>setOpenIndex((index)=>index===null?0:Math.min(media.length-1,index+1))}
      onClose={()=>setOpenIndex(null)}
      metadata={[
        {label:"Titel",value:activeItem.title??"—"},
        {label:"Medientyp",value:mediaTypeLabel(activeItem.media_type)},
        {label:"Beschreibung",value:activeItem.alt_text||"—"},
        {label:"Sortierung",value:String(activeItem.sort_order)},
        {label:"Veröffentlichung",value:activeItem.public_approved?"Freigegeben":"Intern"},
        {label:"Dateiname",value:displayFilename(activeItem.storage_path)},
        {label:"Angelegt",value:formatDate(activeItem.created_at)},
      ]}
      metadataEditor={<Form method="post" className="auth-form">
        <input type="hidden" name="_intent" value="metadata_update"/>
        <input type="hidden" name="media_id" value={activeItem.id}/>
        <input type="hidden" name="version" value={activeItem.version}/>
        <label><span>Titel *</span><input name="title" defaultValue={activeItem.title??mediaTypeLabel(activeItem.media_type)} required/></label>
        <label><span>Medientyp</span><input value={mediaTypeLabel(activeItem.media_type)} readOnly aria-readonly="true"/></label>
        <label><span>Alt-Text / Beschreibung</span><textarea name="alt_text" rows={3} defaultValue={activeItem.alt_text??""}/></label>
        <label><span>Sortierung</span><input name="sort_order" type="number" defaultValue={activeItem.sort_order}/></label>
        <label className="checkbox-row"><input name="public_approved" type="checkbox" defaultChecked={activeItem.public_approved}/><span>Für spätere Veröffentlichung freigeben</span></label>
        <button className="primary-button" type="submit">Metadaten speichern</button>
      </Form>}
      moreActions={<Form method="post" onSubmit={(event)=>{if(!window.confirm("Medium wirklich archivieren?"))event.preventDefault();}}><input type="hidden" name="_intent" value="archive"/><input type="hidden" name="media_id" value={activeItem.id}/><input type="hidden" name="version" value={activeItem.version}/><button className="text-button" type="submit">Medium archivieren</button></Form>}
    />:null}
  </main>;
}
