import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/case-study-detail";
import { requirePermission } from "~/lib/auth.server";
import { CASE_STATUS, CASE_STATUS_CLASS, FEEDBACK_SOURCE, RELEASE_FORM, RELEASE_SCOPE, RELEASE_STATUS, caseStudyErrorMessage, formatDay, money, one, plural } from "./case-studies";

type ActionResult={error?:string};

const MEDIA_ROLE:Record<string,string>={BEFORE:"Vorher",AFTER:"Nachher"};
const MEDIA_TYPE:Record<string,string>={IMAGE:"Bild",VIDEO:"Video",FLOOR_PLAN:"Grundriss",OTHER:"Sonstiges"};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function days(value:any){const n=Number(value);return Number.isFinite(n)?plural(n,"Tag","Tage"):"—";}

export function priceDelta(salePrice:any,reference:any){
  const sale=Number(salePrice),base=Number(reference);
  if(!Number.isFinite(sale)||!Number.isFinite(base)||base<=0)return null;
  return Math.round(((sale-base)/base)*1000)/10;
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"case_study.read");
  const id=params.caseStudyId!;
  const {data:row,error}=await supabase.from("sale_case_studies")
    .select("*,sale_closings!inner(id,closing_number,notarized_date,handover_date,agreed_purchase_price,notarial_purchase_price,buyer_contact_id,property_id,properties!inner(id,property_number,internal_title,status)),profiles!sale_case_studies_primary_responsible_user_fkey(user_id,display_name)")
    .eq("id",id).maybeSingle();
  if(error||!row)throw new Response("Case Study nicht gefunden.",{status:404,headers:responseHeaders()});

  const r=row as any;
  const closing=one(r.sale_closings);
  const propertyId=closing?.property_id;

  const [factsRes,gapsRes,mediaRes,propertyMediaRes,ownersRes,buyerRes,documentsRes,canWriteRes,canApproveRes,canArchiveRes]=await Promise.all([
    supabase.rpc("sale_case_study_facts",{p_case_study_id:id}),
    supabase.rpc("sale_case_study_gaps",{p_case_study_id:id}),
    supabase.from("sale_case_study_media").select("id,media_role,caption,sort_order,property_media:property_media!sale_case_study_media_property_media_id_fkey(id,title,media_type,storage_bucket,storage_path,public_approved)").eq("case_study_id",id).order("media_role").order("sort_order"),
    supabase.from("property_media").select("id,title,media_type,public_approved,sort_order").eq("property_id",propertyId).is("archived_at",null).order("sort_order"),
    supabase.from("property_owners").select("contact_id,contacts(id,contact_number,first_name,last_name)").eq("property_id",propertyId),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").eq("id",closing?.buyer_contact_id).maybeSingle(),
    supabase.from("documents").select("id,title,category").eq("property_id",propertyId).is("archived_at",null).order("title").limit(200),
    supabase.rpc("current_user_has_permission",{p_permission:"case_study.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"case_study.approve"}),
    supabase.rpc("current_user_has_permission",{p_permission:"case_study.archive"}),
  ]);
  // Ein stiller Lesefehler wäre hier besonders irreführend: eine leere
  // Bildliste sähe aus, als wäre nichts ausgewählt.
  if(mediaRes.error||propertyMediaRes.error)throw new Response("Die Medien der Case Study konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  const mediaUrls:Record<string,string>={};
  await Promise.all(((mediaRes.data??[]) as any[]).map(async(item:any)=>{
    const media=one(item.property_media);
    if(!media?.storage_bucket||!media?.storage_path)return;
    const {data:signed}=await supabase.storage.from(media.storage_bucket).createSignedUrl(media.storage_path,600);
    if(signed?.signedUrl)mediaUrls[media.id]=signed.signedUrl;
  }));

  const usedMedia=new Set(((mediaRes.data??[]) as any[]).map((item:any)=>one(item.property_media)?.id));
  return data({profile,row:r,closing,property:one(closing?.properties),
    facts:(factsRes.data??{}) as any,
    gaps:(gapsRes.data??[]) as string[],
    media:mediaRes.data??[],mediaUrls,
    availableMedia:((propertyMediaRes.data??[]) as any[]).filter((m:any)=>!usedMedia.has(m.id)),
    owners:(ownersRes.data??[]) as any[],buyer:buyerRes.data??null,
    documents:documentsRes.data??[],
    canWrite:canWriteRes.data===true,canApprove:canApproveRes.data===true,canArchive:canArchiveRes.data===true,
  },{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"case_study.write");
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const id=params.caseStudyId!;
  const version=Number(text(fd,"version"));
  const conflict=()=>data<ActionResult>({error:"Die Case Study wurde inzwischen geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="story_save"){
    const payload={
      title:text(fd,"title"),
      initial_condition:text(fd,"initial_condition")||null,
      special_aspects:text(fd,"special_aspects")||null,
      lessons_learned:text(fd,"lessons_learned")||null,
      customer_feedback:text(fd,"customer_feedback")||null,
      customer_feedback_source:text(fd,"customer_feedback_source")||null,
      customer_feedback_on:dateOrNull(fd,"customer_feedback_on"),
      anonymized:fd.get("anonymized")==="on",
      display_location:text(fd,"display_location")||null,
      notes:text(fd,"notes")||null,
    };
    if(!payload.title)return data<ActionResult>({error:"Der Titel darf nicht leer sein."},{status:400,headers:responseHeaders()});
    const {data:updated,error}=await supabase.from("sale_case_studies").update(payload).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:caseStudyErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/case-studies/${id}#erzaehlung`,{headers:responseHeaders()});
  }

  if(intent==="release_save"){
    const status=text(fd,"release_status");
    if(["GRANTED","DECLINED","WITHDRAWN"].includes(status))await requirePermission(request,context.cloudflare.env,"case_study.approve");
    const payload={
      release_status:status,
      release_scope:text(fd,"release_scope")||null,
      release_contact_id:text(fd,"release_contact_id")||null,
      release_requested_on:dateOrNull(fd,"release_requested_on"),
      release_decided_on:dateOrNull(fd,"release_decided_on"),
      release_form:text(fd,"release_form")||null,
      release_document_id:text(fd,"release_document_id")||null,
      release_note:text(fd,"release_note")||null,
    };
    const {data:updated,error}=await supabase.from("sale_case_studies").update(payload).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:caseStudyErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/case-studies/${id}#freigabe`,{headers:responseHeaders()});
  }

  if(intent==="status_save"){
    const {data:updated,error}=await supabase.from("sale_case_studies").update({status:text(fd,"status")}).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:caseStudyErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/case-studies/${id}#verwendung`,{headers:responseHeaders()});
  }

  if(intent==="media_add"){
    const mediaId=text(fd,"property_media_id");
    if(!mediaId)return data<ActionResult>({error:"Bitte ein Bild auswählen."},{status:400,headers:responseHeaders()});
    const {error}=await supabase.from("sale_case_study_media").insert({
      case_study_id:id,property_media_id:mediaId,media_role:text(fd,"media_role")||"BEFORE",
      caption:text(fd,"caption")||null,sort_order:Number(text(fd,"sort_order"))||0,created_by:userId,
    });
    if(error)return data<ActionResult>({error:caseStudyErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    return redirect(`/case-studies/${id}#medien`,{headers:responseHeaders()});
  }

  if(intent==="media_remove"){
    const {error}=await supabase.from("sale_case_study_media").delete().eq("id",text(fd,"media_link_id")).eq("case_study_id",id);
    if(error)return data<ActionResult>({error:"Das Bild konnte nicht entfernt werden."},{status:400,headers:responseHeaders()});
    return redirect(`/case-studies/${id}#medien`,{headers:responseHeaders()});
  }

  if(intent==="archive"||intent==="restore"){
    await requirePermission(request,context.cloudflare.env,"case_study.archive");
    const {data:updated,error}=await supabase.from("sale_case_studies")
      .update({archived_at:intent==="archive"?new Date().toISOString():null}).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:caseStudyErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/case-studies/${id}`,{headers:responseHeaders()});
  }

  return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

export default function CaseStudyDetail(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<typeof action>();
  const row=d.row as any;
  const facts=d.facts as any;
  const disabled=!d.canWrite||Boolean(row.archived_at);
  const releaseCandidates=[
    ...(d.buyer?[{...(d.buyer as any),role:"Käufer"}]:[]),
    ...((d.owners as any[]).map((owner:any)=>({...(one(owner.contacts)??{}),role:"Eigentümer"})).filter((c:any)=>c.id)),
  ];
  const delta=priceDelta(facts.sale_price,facts.initial_price);
  const before=(d.media as any[]).filter((item:any)=>item.media_role==="BEFORE");
  const after=(d.media as any[]).filter((item:any)=>item.media_role==="AFTER");

  return <main className="editor-shell">
    <header className="editor-header">
      <div>
        <Link className="back-link" to="/case-studies">← Case Studies</Link>
        <p className="eyebrow">{row.case_study_number}</p>
        <h1 className="editor-title">{row.title}</h1>
        <p className="editor-meta">{d.property?.property_number} · {d.property?.internal_title} · {d.closing?.closing_number}</p>
      </div>
      <div className="header-actions">
        <span className={`status-pill ${CASE_STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":CASE_STATUS[row.status]??row.status}</span>
        <span className="status-pill">Version {row.version}</span>
      </div>
    </header>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <section className="data-card" id="luecken">
      <div className="card-head"><div><p className="eyebrow">Vor der Verwendung</p><h2>Was noch fehlt</h2></div><span className="status-pill">{(d.gaps as string[]).length}</span></div>
      {(d.gaps as string[]).length===0
        ?<p className="form-success">Freigabe, Bilder und Beschreibung sind vollständig. Das ist eine Vollständigkeitsprüfung der Erfassung, keine rechtliche Bewertung der Veröffentlichung.</p>
        :<ul className="form-warning">{(d.gaps as string[]).map((gap:string)=><li key={gap}>{gap}</li>)}</ul>}
    </section>

    <section className="data-card" id="kennzahlen">
      <div className="card-head"><div><p className="eyebrow">Aus dem Vorgang gerechnet</p><h2>Zahlen zum Fall</h2></div><Link className="subtle-link" to={`/closings/${d.closing?.id}`}>Abschluss öffnen →</Link></div>
      <div className="metric-grid">
        <article className="metric"><span>Verkaufspreis</span><strong>{money(facts.sale_price)}</strong><small>{facts.notarized_date?`beurkundet ${formatDay(facts.notarized_date)}`:"noch nicht beurkundet"}</small></article>
        <article className="metric"><span>Ausgangspreis</span><strong>{money(facts.initial_price)}</strong><small>{delta===null?"kein Vergleich möglich":`${delta>0?"+":""}${delta.toLocaleString("de-DE")} % gegenüber dem Ausgangspreis`}</small></article>
        <article className="metric"><span>Investition</span><strong>{money(facts.invested)}</strong><small>{plural(Number(facts.measures_done)||0,"umgesetzte Maßnahme","umgesetzte Maßnahmen")}</small></article>
        <article className="metric"><span>Aufbereitung</span><strong>{days(facts.preparation_days)}</strong><small>{facts.preparation_start?`ab ${formatDay(facts.preparation_start)}`:"kein Startpunkt erfasst"}</small></article>
        <article className="metric"><span>Vermarktung</span><strong>{days(facts.marketing_days)}</strong><small>{facts.marketing_start?`ab ${formatDay(facts.marketing_start)}`:"keine Preisstufe erfasst"}</small></article>
        <article className="metric"><span>Nachfrage</span><strong>{facts.viewings??0}</strong><small>{plural(Number(facts.inquiries)||0,"Anfrage","Anfragen")} · {plural(Number(facts.offers)||0,"Kaufangebot","Kaufangebote")}</small></article>
      </div>
      <p className="subtle">Alle Werte stammen aus dem laufenden Datenbestand und werden nicht gespeichert. Fehlt eine Grundlage, steht dort ein Strich statt einer erfundenen Zahl.</p>
      {facts.price_estimate!=null||facts.valuation_from!=null
        ?<dl className="detail-list">
          {facts.price_estimate!=null?<div><dt>Ursprüngliche Preiseinschätzung</dt><dd>{money(facts.price_estimate)}</dd></div>:null}
          {facts.valuation_from!=null||facts.valuation_to!=null?<div><dt>Wertermittlung</dt><dd>{money(facts.valuation_from)} bis {money(facts.valuation_to)}</dd></div>:null}
        </dl>:null}
    </section>

    <div className="dashboard-grid property-section">
      <section className="data-card" id="erzaehlung">
        <div className="card-head"><div><p className="eyebrow">Vom Benutzer geschrieben</p><h2>Erzählung</h2></div></div>
        <Form method="post" className="form-grid">
          <input type="hidden" name="_intent" value="story_save"/>
          <input type="hidden" name="version" value={row.version}/>
          <label className="form-field full-width"><span>Titel *</span><input name="title" defaultValue={row.title} disabled={disabled}/></label>
          <label className="form-field full-width"><span>Ausgangszustand</span><textarea name="initial_condition" rows={3} defaultValue={row.initial_condition??""} disabled={disabled}/></label>
          <label className="form-field full-width"><span>Besonderheiten</span><textarea name="special_aspects" rows={2} defaultValue={row.special_aspects??""} disabled={disabled}/></label>
          <label className="form-field full-width"><span>Lessons Learned</span><textarea name="lessons_learned" rows={2} defaultValue={row.lessons_learned??""} disabled={disabled}/></label>
          <label className="form-field full-width"><span>Kundenfeedback</span><textarea name="customer_feedback" rows={2} defaultValue={row.customer_feedback??""} disabled={disabled}/></label>
          <label className="form-field"><span>Woher das Feedback stammt</span>
            <select name="customer_feedback_source" defaultValue={row.customer_feedback_source??""} disabled={disabled}>
              <option value="">—</option>
              {Object.entries(FEEDBACK_SOURCE).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="form-field"><span>Feedback vom</span><input type="date" name="customer_feedback_on" defaultValue={row.customer_feedback_on??""} disabled={disabled}/></label>
          <label className="form-field full-width checkbox-row">
            <input type="checkbox" name="anonymized" defaultChecked={row.anonymized} disabled={disabled}/>
            <span>Anonymisiert — ohne Namen und ohne genaue Adresse</span>
          </label>
          <label className="form-field"><span>Ortsangabe für die anonyme Fassung</span><input name="display_location" defaultValue={row.display_location??""} placeholder="z. B. München-Ost" disabled={disabled}/></label>
          <label className="form-field full-width"><span>Interne Notiz</span><textarea name="notes" rows={2} defaultValue={row.notes??""} disabled={disabled}/></label>
          <div className="form-field full-width inline-actions"><button className="primary-button" type="submit" disabled={disabled}>Erzählung speichern</button></div>
        </Form>
      </section>

      <section className="data-card" id="freigabe">
        <div className="card-head"><div><p className="eyebrow">Getrennt von der Anonymisierung</p><h2>Marketingfreigabe</h2></div></div>
        <dl className="detail-list">
          <div><dt>Stand</dt><dd>{RELEASE_STATUS[row.release_status]??row.release_status}</dd></div>
          <div><dt>Umfang</dt><dd>{row.release_scope?RELEASE_SCOPE[row.release_scope]??row.release_scope:"—"}</dd></div>
          <div><dt>Entschieden am</dt><dd>{formatDay(row.release_decided_on)}</dd></div>
        </dl>
        <Form method="post" className="form-grid" style={{marginTop:"0.75rem"}}>
          <input type="hidden" name="_intent" value="release_save"/>
          <input type="hidden" name="version" value={row.version}/>
          <label className="form-field"><span>Stand der Freigabe</span>
            <select name="release_status" defaultValue={row.release_status} disabled={disabled}>
              {Object.entries(RELEASE_STATUS).map(([k,v])=><option key={k} value={k} disabled={!d.canApprove&&["GRANTED","DECLINED","WITHDRAWN"].includes(k)}>{v}</option>)}
            </select>
          </label>
          <label className="form-field"><span>Umfang</span>
            <select name="release_scope" defaultValue={row.release_scope??""} disabled={disabled}>
              <option value="">—</option>
              {Object.entries(RELEASE_SCOPE).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="form-field"><span>Freigegeben von</span>
            <select name="release_contact_id" defaultValue={row.release_contact_id??""} disabled={disabled}>
              <option value="">—</option>
              {releaseCandidates.map((c:any)=><option key={c.id} value={c.id}>{c.last_name}, {c.first_name} · {c.role}</option>)}
            </select>
          </label>
          <label className="form-field"><span>Form</span>
            <select name="release_form" defaultValue={row.release_form??""} disabled={disabled}>
              <option value="">—</option>
              {Object.entries(RELEASE_FORM).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="form-field"><span>Angefragt am</span><input type="date" name="release_requested_on" defaultValue={row.release_requested_on??""} disabled={disabled}/></label>
          <label className="form-field"><span>Entschieden am</span><input type="date" name="release_decided_on" defaultValue={row.release_decided_on??""} disabled={disabled}/></label>
          <label className="form-field full-width"><span>Beleg aus der Objektakte</span>
            <select name="release_document_id" defaultValue={row.release_document_id??""} disabled={disabled}>
              <option value="">— kein Beleg hinterlegt</option>
              {(d.documents as any[]).map((doc:any)=><option key={doc.id} value={doc.id}>{doc.title}</option>)}
            </select>
          </label>
          <label className="form-field full-width"><span>Notiz zur Freigabe</span><textarea name="release_note" rows={2} defaultValue={row.release_note??""} disabled={disabled}/></label>
          <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Freigabe speichern</button></div>
          {d.canApprove?null:<p className="form-field full-width subtle">Erteilen, Ablehnen und Zurückziehen entscheidet die Geschäftsführung.</p>}
        </Form>
      </section>
    </div>

    <section className="data-card" id="medien">
      <div className="card-head"><div><p className="eyebrow">Aus der Objektmediathek</p><h2>Vorher und Nachher</h2></div><Link className="subtle-link" to={`/properties/${d.property?.id}/media`}>Mediathek öffnen →</Link></div>
      {(d.media as any[]).length===0
        ?<p className="empty-state">Für diese Case Study ist noch kein Bild ausgewählt.</p>
        :<div className="dashboard-grid property-section">
          {[["Vorher",before],["Nachher",after]].map(([label,items]:any)=>
            <div key={label}>
              <p className="eyebrow">{label}</p>
              {items.length===0?<p className="empty-state">Kein Bild ausgewählt.</p>:<div className="data-list">{items.map((item:any)=>{
                const media=one(item.property_media);
                const url=media?d.mediaUrls[media.id]:null;
                return <div className="data-row" key={item.id}>
                  <div>
                    {url&&media.media_type!=="VIDEO"?<img src={url} alt={media.title??label} style={{maxWidth:"140px",borderRadius:"6px"}}/>:null}
                    <strong>{media?.title??"Ohne Titel"}</strong>
                    <small>{MEDIA_TYPE[media?.media_type]??media?.media_type}{item.caption?` · ${item.caption}`:""}</small>
                  </div>
                  <div className="row-meta">
                    <span className={`status-pill ${media?.public_approved?"status-sold":"status-draft"}`}>{media?.public_approved?"öffentlich freigegeben":"nicht freigegeben"}</span>
                  </div>
                  {disabled?null:<Form method="post">
                    <input type="hidden" name="_intent" value="media_remove"/>
                    <input type="hidden" name="media_link_id" value={item.id}/>
                    <button className="text-button" type="submit">Entfernen</button>
                  </Form>}
                </div>;
              })}</div>}
            </div>)}
        </div>}
      {disabled?null:<Form method="post" className="form-grid" style={{marginTop:"0.75rem"}}>
        <input type="hidden" name="_intent" value="media_add"/>
        <label className="form-field"><span>Bild aus der Mediathek</span>
          <select name="property_media_id" defaultValue="">
            <option value="">— bitte wählen</option>
            {(d.availableMedia as any[]).map((m:any)=><option key={m.id} value={m.id}>{m.title??"Ohne Titel"} · {MEDIA_TYPE[m.media_type]??m.media_type}{m.public_approved?"":" · nicht freigegeben"}</option>)}
          </select>
        </label>
        <label className="form-field"><span>Rolle</span>
          <select name="media_role" defaultValue="BEFORE">{Object.entries(MEDIA_ROLE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="form-field"><span>Bildunterschrift</span><input name="caption"/></label>
        <label className="form-field"><span>Reihenfolge</span><input name="sort_order" type="number" defaultValue={0}/></label>
        <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit">Bild übernehmen</button></div>
        <p className="form-field full-width subtle">Es werden keine Dateien kopiert. Ein Bild wird nur dann öffentlich verwendbar, wenn es in der Mediathek freigegeben ist.</p>
      </Form>}
    </section>

    <div className="dashboard-grid property-section">
      <section className="data-card" id="verwendung">
        <div className="card-head"><div><p className="eyebrow">Wofür verwendbar</p><h2>Verwendung</h2></div></div>
        <Form method="post" className="form-grid">
          <input type="hidden" name="_intent" value="status_save"/>
          <input type="hidden" name="version" value={row.version}/>
          <label className="form-field"><span>Status</span>
            <select name="status" defaultValue={row.status} disabled={disabled}>
              {Object.entries(CASE_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="form-field inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Status speichern</button></div>
          <p className="form-field full-width subtle">„Öffentlich verwendbar" setzt eine erteilte Freigabe und freigegebene Bilder voraus. Das System prüft das, es entscheidet aber nicht über die Zulässigkeit einer konkreten Veröffentlichung.</p>
        </Form>
      </section>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Verwaltung</p><h2>Archiv</h2></div></div>
        {d.canArchive
          ?<Form method="post" className="inline-actions">
            <input type="hidden" name="_intent" value={row.archived_at?"restore":"archive"}/>
            <input type="hidden" name="version" value={row.version}/>
            <button className="secondary-button" type="submit">{row.archived_at?"Wiederherstellen":"Archivieren"}</button>
          </Form>
          :<p className="empty-state">Archivieren ist Geschäftsführungs- und Adminfunktion.</p>}
        <dl className="detail-list" style={{marginTop:"0.75rem"}}>
          <div><dt>Zuständig</dt><dd>{one(row.profiles)?.display_name??"—"}</dd></div>
          <div><dt>Immobilie</dt><dd><Link className="subtle-link" to={`/properties/${d.property?.id}`}>{d.property?.property_number} →</Link></dd></div>
          <div><dt>Übergabe</dt><dd>{formatDay(d.closing?.handover_date)}</dd></div>
        </dl>
      </section>
    </div>
  </main>;
}
