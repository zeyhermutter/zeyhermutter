import { useState } from "react";
import { data, Form, Link, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/property-media";
import { AssetPreviewModal, type AssetPreviewKind } from "~/components/asset-preview-modal";
import { requirePermission } from "~/lib/auth.server";
import { zeitpunkt as formatDate } from "~/lib/format";

type ActionResult = { error?: string; hochgeladen?: number; fehler?: string[] };
const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
// Mehrere Dateien auf einmal (P1, 15.10.2026). Grenzen, weil alles in einer
// Worker-Anfrage laeuft: je Datei zwei Unteranfragen (Speicher, Datenbank),
// und der Anfragekoerper ist begrenzt.
const HOECHSTENS_DATEIEN = 20;
const HOECHSTENS_GESAMT = 90 * 1024 * 1024;
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
  // Eine Signatur-Anfrage je Speicher statt zwei je Medium (15.10.2026):
  // bei 30 Medien waeren das 60 Unteranfragen gewesen, mehr als eine
  // Worker-Anfrage stellen darf. Der Download-Name haengt die Bibliothek
  // ohnehin nur an die fertige Adresse an ("&download=...").
  const jeSpeicher=new Map<string,any[]>();
  for(const item of media??[])jeSpeicher.set(item.storage_bucket,[...(jeSpeicher.get(item.storage_bucket)??[]),item]);
  await Promise.all([...jeSpeicher].map(async([bucket,items])=>{
    const {data:signiert}=await supabase.storage.from(bucket).createSignedUrls(items.map((i)=>i.storage_path),600);
    const nachPfad=new Map(((signiert??[]) as any[]).filter((x)=>x.signedUrl).map((x)=>[x.path,x.signedUrl as string]));
    for(const item of items){
      const url=nachPfad.get(item.storage_path);
      if(!url)continue;
      signedUrls[item.id]=url;
      downloadUrls[item.id]=`${url}&download=${encodeURIComponent(displayFilename(item.storage_path))}`;
    }
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
  const dateien=fd.getAll("file").filter((f):f is File=>f instanceof File&&f.size>0);
  if(dateien.length===0)return data<ActionResult>({error:"Bitte mindestens eine Datei auswählen."},{status:400,headers:responseHeaders()});
  if(dateien.length>HOECHSTENS_DATEIEN)return data<ActionResult>({error:`Höchstens ${HOECHSTENS_DATEIEN} Dateien auf einmal. Bitte in mehreren Durchgängen hochladen.`},{status:400,headers:responseHeaders()});
  if(dateien.reduce((s,f)=>s+f.size,0)>HOECHSTENS_GESAMT)return data<ActionResult>({error:"Zusammen höchstens 90 MB auf einmal. Bitte in mehreren Durchgängen hochladen."},{status:400,headers:responseHeaders()});
  const mediaType=text(fd,"media_type")||"IMAGE";
  if(!MEDIA_TYPES.has(mediaType))return data<ActionResult>({error:"Ungültiger Medientyp."},{status:400,headers:responseHeaders()});
  // Ohne Angabe ans Ende der Bibliothek, in der gewaehlten Reihenfolge.
  let sortOrder:number;
  if(text(fd,"sort_order")===""){
    const {data:letzte}=await supabase.from("property_media").select("sort_order").eq("property_id",propertyId).is("archived_at",null).order("sort_order",{ascending:false}).limit(1).maybeSingle();
    sortOrder=letzte?Number(letzte.sort_order)+1:0;
  }else{
    sortOrder=Number(text(fd,"sort_order"));
    if(!Number.isInteger(sortOrder))return data<ActionResult>({error:"Die Sortierung muss eine ganze Zahl sein."},{status:400,headers:responseHeaders()});
  }
  const einzeln=dateien.length===1;
  const fehler:string[]=[];
  let hochgeladen=0;
  for(const file of dateien){
    if(file.size>MAX_UPLOAD_BYTES){fehler.push(`${file.name}: größer als 75 MB`);continue;}
    if(!ALLOWED.has(file.type)){fehler.push(`${file.name}: Dateityp ${file.type||"unbekannt"} ist nicht freigegeben`);continue;}
    if(!mimeAllowedForType(mediaType,file.type)){fehler.push(`${file.name}: passt nicht zum Typ „${mediaTypeLabel(mediaType)}“`);continue;}
    const storagePath=`properties/${propertyId}/media/${crypto.randomUUID()}-${safeFilename(file.name)}`;
    const {error:uploadError}=await supabase.storage.from("zm-property-media").upload(storagePath,file,{contentType:file.type,upsert:false});
    if(uploadError){fehler.push(`${file.name}: konnte nicht gespeichert werden`);continue;}
    // Bei mehreren Dateien: Titel aus dem Dateinamen, Beschreibung leer --
    // ein gemeinsamer Alt-Text fuer zehn Fotos waere fuer jedes falsch.
    const titel=einzeln&&text(fd,"title")?text(fd,"title"):file.name.replace(/\.[^.]+$/,"");
    const {error:insertError}=await supabase.from("property_media").insert({property_id:propertyId,media_type:mediaType,storage_bucket:"zm-property-media",storage_path:storagePath,title:titel,alt_text:einzeln?(text(fd,"alt_text")||null):null,sort_order:sortOrder,public_approved:fd.get("public_approved")==="on",created_by:userId,updated_by:userId});
    if(insertError){await supabase.storage.from("zm-property-media").remove([storagePath]);fehler.push(`${file.name}: konnte nicht übernommen werden`);continue;}
    hochgeladen++;sortOrder++;
  }
  if(fehler.length)return data<ActionResult>({hochgeladen,fehler,error:hochgeladen?undefined:"Keine Datei wurde übernommen."},{status:hochgeladen?200:400,headers:responseHeaders()});
  return redirect(`/properties/${propertyId}/media?hochgeladen=${hochgeladen}`,{headers:responseHeaders()});
}

export default function PropertyMedia(){
  const {property,media,signedUrls,downloadUrls,profile}=useLoaderData<typeof loader>();
  const result=useActionData<typeof action>();
  const [openIndex,setOpenIndex]=useState<number|null>(null);
  const [auswahl,setAuswahl]=useState<{anzahl:number;bytes:number}>({anzahl:0,bytes:0});
  const [suche]=useSearchParams();
  const fertig=Number(suche.get("hochgeladen")??0);
  const zuViele=auswahl.anzahl>HOECHSTENS_DATEIEN;
  const zuGross=auswahl.bytes>HOECHSTENS_GESAMT;
  const activeItem=openIndex===null?null:media[openIndex];
  const activeUrl=activeItem?signedUrls[activeItem.id]:undefined;
  const activeDownloadUrl=activeItem?downloadUrls[activeItem.id]:undefined;

  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to={`/properties/${property.id}`}>← {property.property_number}</Link><h1 className="editor-title">Medienbibliothek</h1><p className="editor-meta">{property.internal_title} · private Ablage</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
    {result?.error?<div className="form-error">{result.error}</div>:null}
    {!result&&fertig>0?<div className="form-success">{fertig===1?"Ein Medium hochgeladen.":`${fertig} Medien hochgeladen.`}</div>:null}
    {result?.fehler?.length?<div className="form-warning">{result.hochgeladen?<strong>{result.hochgeladen===1?"Ein Medium hochgeladen.":`${result.hochgeladen} Medien hochgeladen.`} </strong>:null}Nicht übernommen:<ul>{result.fehler.map((f)=><li key={f}>{f}</li>)}</ul></div>:null}

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
        <div className="card-head"><div><p className="eyebrow">Neu · je Datei max. 75 MB</p><h2>Medien hochladen</h2></div></div>
        <Form method="post" encType="multipart/form-data" className="auth-form"><input type="hidden" name="_intent" value="upload"/>
          <label><span>Dateien *</span><input name="file" type="file" multiple required accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,application/pdf" onChange={(e)=>{const f=[...(e.currentTarget.files??[])];setAuswahl({anzahl:f.length,bytes:f.reduce((s,x)=>s+x.size,0)});}}/>
            <small className="subtle">{auswahl.anzahl?`${auswahl.anzahl} ${auswahl.anzahl===1?"Datei":"Dateien"} · ${auswahl.bytes<100*1024?`${Math.max(1,Math.round(auswahl.bytes/1024))} KB`:`${(auswahl.bytes/1024/1024).toFixed(1).replace(".",",")} MB`}`:`Mehrere auf einmal möglich, bis ${HOECHSTENS_DATEIEN} Dateien und 90 MB zusammen.`}</small>
            {zuViele?<small className="form-error">Höchstens {HOECHSTENS_DATEIEN} Dateien auf einmal.</small>:zuGross?<small className="form-error">Zusammen höchstens 90 MB auf einmal.</small>:null}
          </label>
          <label><span>Typ</span><select name="media_type" defaultValue="IMAGE"><option value="IMAGE">Foto</option><option value="FLOOR_PLAN">Grundriss</option><option value="VIDEO">Video</option><option value="OTHER">Sonstige</option></select></label>
          {auswahl.anzahl<=1?<><label><span>Titel</span><input name="title" placeholder="leer: Dateiname"/></label><label><span>Alt-Text / Beschreibung</span><input name="alt_text"/></label></>:<p className="form-help">Bei mehreren Dateien wird der Dateiname zum Titel; Beschreibungen danach je Medium ergänzen.</p>}
          <label><span>Sortierung ab</span><input name="sort_order" type="number" placeholder="leer: ans Ende"/></label>
          <label className="checkbox-row"><input name="public_approved" type="checkbox"/><span>Für spätere Veröffentlichung freigeben</span></label>
          <button className="primary-button" type="submit" disabled={zuViele||zuGross}>{auswahl.anzahl>1?`${auswahl.anzahl} Dateien hochladen`:"Sicher hochladen"}</button></Form>
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
