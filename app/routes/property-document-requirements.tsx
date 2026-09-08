import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-document-requirements";
import { requirePermission } from "~/lib/auth.server";
import { tag as formatDate } from "~/lib/format";
import { DOKUMENTKATEGORIE, beschrifte } from "~/lib/labels";
import { crmDateAtTimeToIso } from "~/lib/local-time";

type ActionResult={error?:string;hinweis?:string};

// Die Staende einer Unterlage. "Fehlt" heisst: steht auf der Arbeitsliste
// dieses Buros und ist noch nicht da. Es ist keine Aussage darueber, ob die
// Unterlage vorgeschrieben ist — diese Software gibt keine Rechtsauskunft.
const STATUS:Record<string,string>={MISSING:"Fehlt",REQUESTED:"Angefordert",PRESENT:"Vorhanden",TO_CHECK:"Zu prüfen",CHECKED:"Geprüft",OUTDATED:"Veraltet",NOT_APPLICABLE:"Nicht erforderlich"};
const STATUS_CLASS:Record<string,string>={MISSING:"status-draft",REQUESTED:"status-marketing",PRESENT:"status-reserved",TO_CHECK:"status-marketing",CHECKED:"status-sold",OUTDATED:"status-lost",NOT_APPLICABLE:"status-archived"};
const STATUS_ORDER=["MISSING","REQUESTED","PRESENT","TO_CHECK","CHECKED","OUTDATED","NOT_APPLICABLE"] as const;

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const value=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;}
function contactLabel(contact:any){if(!contact)return null;return `${contact.last_name}, ${contact.first_name}`;}

// Die Reihenfolge ist hier keine Geschmacksfrage: "fehlt das Anforderungsdatum"
// und "Anforderungsdatum darf nicht in der Zukunft liegen" enthalten beide das
// Wort Anforderungsdatum. In der Live-Abnahme stand deshalb beim Speichern
// ohne Datum die Meldung "darf nicht in der Zukunft liegen" — richtig
// blockiert, falsch begruendet. Erst das Fehlen pruefen, dann die Zukunft.
function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("fehlt das Anforderungsdatum"))return"Für den Stand „Angefordert“ fehlt das Anforderungsdatum.";
  if(message.includes("fehlt das Eingangsdatum"))return"Für diesen Stand fehlt das Eingangsdatum der Unterlage.";
  if(message.includes("fehlt das Pruefdatum"))return"Für den Stand „Geprüft“ fehlt das Prüfdatum.";
  if(message.includes("vor dem Eingang"))return"Die Prüfung kann nicht vor dem Eingang der Unterlage liegen.";
  if(message.includes("Anforderungsdatum darf nicht"))return"Das Anforderungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("Eingangsdatum darf nicht"))return"Das Eingangsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("Pruefdatum darf nicht"))return"Das Prüfdatum darf nicht in der Zukunft liegen.";
  if(message.includes("gehoert nicht zu dieser Immobilie"))return"Das gewählte Dokument gehört nicht zu dieser Immobilie.";
  if(message.includes("property_document_requirements_template_unique"))return"Diese Unterlage steht bereits auf der Liste dieser Akte.";
  if(message.includes("property_document_requirements_title_check"))return"Die Unterlage braucht eine Bezeichnung.";
  if(message.includes("row-level security"))return"Zum Bearbeiten der Unterlagenliste fehlt die Berechtigung.";
  return "Die Unterlage konnte nicht gespeichert werden.";
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"document.read");
  const propertyId=params.propertyId!;

  const {data:property,error:propertyError}=await supabase.from("properties").select("id,property_number,internal_title,status,property_type,transaction_type").eq("id",propertyId).maybeSingle();
  if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});

  const [{data:rows,error:rowError},{data:documents},{data:contacts},{data:templates},{data:summary},{data:canWrite}]=await Promise.all([
    supabase.from("property_document_requirements").select("*,documents(id,title,category,archived_at),contacts(id,contact_number,first_name,last_name)").eq("property_id",propertyId).order("sort_order").order("title"),
    supabase.from("documents").select("id,title,category").eq("property_id",propertyId).is("archived_at",null).order("created_at",{ascending:false}).limit(500),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("document_requirement_templates").select("template_key,title,active,property_type,transaction_type").eq("active",true).order("sort_order"),
    supabase.rpc("property_document_requirement_summary",{p_property_id:propertyId}),
    supabase.rpc("current_user_has_permission",{p_permission:"document.write"}),
  ]);
  // Die Liste selbst muss laden, sonst zeigt die Seite einen leeren Stand, der
  // wie "nichts zu tun" aussieht. Das ist genau die Verwechslung, die diese
  // Seite verhindern soll.
  if(rowError)throw new Response("Die Unterlagenliste konnte nicht geladen werden.",{status:500,headers:responseHeaders()});

  const passendeVorlagen=(templates??[]).filter((t:any)=>
    (t.property_type===null||t.property_type===property.property_type)&&
    (t.transaction_type===null||t.transaction_type===property.transaction_type));
  const vorhandeneSchluessel=new Set((rows??[]).map((r:any)=>r.template_key).filter(Boolean));
  const offeneVorlagen=passendeVorlagen.filter((t:any)=>!vorhandeneSchluessel.has(t.template_key)).length;

  return data({
    profile,property,
    rows:(rows??[]) as any[],
    documents:documents??[],
    contacts:contacts??[],
    offeneVorlagen,
    summary:(Array.isArray(summary)?summary[0]:summary)??null,
    canWrite:Boolean(canWrite),
  },{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"document.write");
  const propertyId=params.propertyId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const ziel=`/properties/${propertyId}/document-requirements`;

  if(intent==="apply_templates"){
    const {data:anzahl,error}=await supabase.rpc("apply_document_requirement_templates",{p_property_id:propertyId});
    if(error)return data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
    return data<ActionResult>({hinweis:anzahl===0?"Es gab nichts zu übernehmen — alle Zeilen der Arbeitsliste stehen bereits in dieser Akte.":`${anzahl} ${anzahl===1?"Zeile":"Zeilen"} aus der Arbeitsliste übernommen.`},{headers:responseHeaders()});
  }

  if(intent==="add"){
    const titel=text(fd,"title");
    if(!titel)return data<ActionResult>({error:"Die Unterlage braucht eine Bezeichnung."},{status:400,headers:responseHeaders()});
    const {error}=await supabase.from("property_document_requirements").insert({
      property_id:propertyId,title:titel,
      document_category:text(fd,"document_category")||null,
      note:text(fd,"note")||null,
      sort_order:900,created_by:userId,updated_by:userId,
    });
    if(error)return data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
    return redirect(ziel,{headers:responseHeaders()});
  }

  if(intent==="update"){
    const id=text(fd,"requirement_id");
    const status=text(fd,"status")||"MISSING";
    const geprueft=status==="CHECKED";
    const {error}=await supabase.from("property_document_requirements").update({
      status,
      document_id:text(fd,"document_id")||null,
      responsible_contact_id:text(fd,"responsible_contact_id")||null,
      requested_on:dateOrNull(fd,"requested_on"),
      received_on:dateOrNull(fd,"received_on"),
      checked_on:dateOrNull(fd,"checked_on"),
      // Wer geprueft hat, traegt das System ein — nicht der Benutzer. Sonst
      // steht in der Akte eine Pruefung im Namen einer anderen Person.
      checked_by:geprueft?userId:null,
      valid_until:dateOrNull(fd,"valid_until"),
      note:text(fd,"note")||null,
      updated_by:userId,
    }).eq("id",id).eq("property_id",propertyId);
    if(error)return data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
    return redirect(ziel,{headers:responseHeaders()});
  }

  if(intent==="remove"){
    const {error}=await supabase.from("property_document_requirements").delete().eq("id",text(fd,"requirement_id")).eq("property_id",propertyId);
    if(error)return data<ActionResult>({error:"Die Zeile konnte nicht entfernt werden."},{status:400,headers:responseHeaders()});
    return redirect(ziel,{headers:responseHeaders()});
  }

  if(intent==="create_task"){
    const faellig=crmDateAtTimeToIso(text(fd,"due_on"));
    if(!faellig)return data<ActionResult>({error:"Für die Wiedervorlage wird ein gültiges Datum gebraucht."},{status:400,headers:responseHeaders()});
    const {error}=await supabase.from("tasks").insert({
      title:`Unterlage besorgen: ${text(fd,"title")}`,
      description:`Aus der Unterlagenliste der Objektakte.${text(fd,"note")?`\n\n${text(fd,"note")}`:""}`,
      priority:"NORMAL",due_at:faellig,responsible_user:userId,
      property_id:propertyId,created_by:userId,updated_by:userId,
    });
    if(error)return data<ActionResult>({error:"Die Wiedervorlage konnte nicht angelegt werden."},{status:400,headers:responseHeaders()});
    return data<ActionResult>({hinweis:"Wiedervorlage angelegt. Sie steht in den Aufgaben."},{headers:responseHeaders()});
  }

  return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

export default function PropertyDocumentRequirements(){
  const d=useLoaderData<typeof loader>();
  const result=useActionData<typeof action>();
  const p=d.property as any;
  const heute=new Date().toISOString().slice(0,10);

  const abgelaufen=d.rows.filter((r:any)=>r.status!=="NOT_APPLICABLE"&&r.valid_until&&r.valid_until<heute);
  const offen=d.rows.filter((r:any)=>r.status==="MISSING"||r.status==="REQUESTED");

  return <main className="editor-shell">
    <header className="editor-header">
      <div>
        <Link className="back-link" to={`/properties/${p.id}`}>← Objektakte</Link>
        <p className="eyebrow">Unterlagen</p>
        <h1 className="editor-title">{p.property_number} · Unterlagenliste</h1>
        <p className="editor-meta">{p.internal_title}</p>
      </div>
      <div className="header-actions"><Link className="subtle-link" to={`/properties/${p.id}/documents`}>Dokumentenablage →</Link></div>
    </header>

    {result?.error?<div className="form-error">{result.error}</div>:null}
    {result?.hinweis?<div className="form-success">{result.hinweis}</div>:null}

    <section className="data-card">
      <div className="card-head">
        <div><p className="eyebrow">Überblick</p><h2>Stand der Unterlagen</h2></div>
        <span className="subtle">{d.rows.length} {d.rows.length===1?"Zeile":"Zeilen"}</span>
      </div>
      {/* Kein KPI-Feld ohne Grundlage: solange keine Zeile erfasst ist, steht
          hier ein Satz und keine Kachel mit Nullen. */}
      {d.rows.length===0
        ?<p className="empty-state">Für diese Akte ist noch keine Unterlage erfasst. Die Arbeitsliste des Büros lässt sich unten übernehmen, oder eine Zeile wird von Hand angelegt.</p>
        :<div className="metric-grid">
          {STATUS_ORDER.map((status)=>{
            const anzahl=d.rows.filter((r:any)=>r.status===status).length;
            if(anzahl===0)return null;
            return <article className="metric-card" key={status}><span>{STATUS[status]}</span><strong>{anzahl}</strong></article>;
          })}
        </div>}

      {abgelaufen.length>0
        ?<p className="form-warning">{abgelaufen.length===1?"Eine Unterlage hat":`${abgelaufen.length} Unterlagen haben`} ein Gültigkeitsdatum in der Vergangenheit: {abgelaufen.map((r:any)=>r.title).join(", ")}. Ob eine neue Fassung gebraucht wird, entscheidet die Sachbearbeitung.</p>
        :null}

      <p className="form-help">Diese Liste ist die Arbeitsliste dieses Büros. Sie sagt nicht, welche Unterlage rechtlich vorgeschrieben ist — „Fehlt“ heißt „steht auf unserer Liste und ist noch nicht da“. Was im Einzelfall gebraucht wird, entscheiden die Beteiligten, nicht die Software.</p>
    </section>

    {d.canWrite&&d.offeneVorlagen>0
      ?<section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Arbeitsliste</p><h2>Vorlage übernehmen</h2></div></div>
        <p className="form-help">{d.offeneVorlagen} {d.offeneVorlagen===1?"Zeile der Arbeitsliste steht":"Zeilen der Arbeitsliste stehen"} noch nicht in dieser Akte. Beim Übernehmen bleiben vorhandene Zeilen unverändert.</p>
        <Form method="post"><input type="hidden" name="_intent" value="apply_templates"/>
          <div className="form-actions"><button className="secondary-button" type="submit">Arbeitsliste übernehmen</button></div>
        </Form>
      </section>
      :null}

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Einzelne Unterlagen</p><h2>Liste</h2></div><span className="subtle">{offen.length} offen</span></div>
      {d.rows.length===0?<p className="empty-state">Noch keine Zeile erfasst.</p>:null}
      <div className="data-list">
        {d.rows.map((r:any)=>{
          const dokument=one(r.documents);
          const zustaendig=one(r.contacts);
          const veraltet=r.status!=="NOT_APPLICABLE"&&r.valid_until&&r.valid_until<heute;
          return <details className="owner-card" key={r.id}>
            <summary>
              <div>
                <strong>{r.title}</strong>
                <small>
                  {r.document_category?`${beschrifte(DOKUMENTKATEGORIE,r.document_category)} · `:""}
                  {r.requested_on?`angefordert ${formatDate(r.requested_on)}`:r.received_on?`eingegangen ${formatDate(r.received_on)}`:"noch kein Vorgang erfasst"}
                  {zustaendig?` · bei ${contactLabel(zustaendig)}`:""}
                </small>
              </div>
              <div className="row-meta">
                <span className={`status-pill ${STATUS_CLASS[r.status]??"status-draft"}`}>{STATUS[r.status]??r.status}</span>
                {veraltet?<small>Gültigkeit abgelaufen</small>:null}
              </div>
            </summary>

            <dl className="detail-list">
              <div><dt>Eingang</dt><dd>{formatDate(r.received_on)}</dd></div>
              <div><dt>Prüfung</dt><dd>{formatDate(r.checked_on)}</dd></div>
              <div><dt>Gültig bis</dt><dd>{formatDate(r.valid_until)}</dd></div>
              <div><dt>Dokument</dt><dd>{dokument?<Link className="subtle-link" to={`/properties/${p.id}/documents?document=${dokument.id}`}>{dokument.title}</Link>:"nicht verknüpft"}</dd></div>
            </dl>
            {r.note?<p className="form-help">{r.note}</p>:null}

            {d.canWrite?<>
              <Form method="post" className="auth-form owner-edit-form">
                <input type="hidden" name="_intent" value="update"/>
                <input type="hidden" name="requirement_id" value={r.id}/>
                <label className="form-field"><span>Stand</span>
                  <select name="status" defaultValue={r.status}>
                    {STATUS_ORDER.map((s)=><option value={s} key={s}>{STATUS[s]}</option>)}
                  </select>
                </label>
                <label className="form-field"><span>Angefordert am</span><input type="date" name="requested_on" defaultValue={r.requested_on??""} max={heute}/></label>
                <label className="form-field"><span>Eingegangen am</span><input type="date" name="received_on" defaultValue={r.received_on??""} max={heute}/></label>
                <label className="form-field"><span>Geprüft am</span><input type="date" name="checked_on" defaultValue={r.checked_on??""} max={heute}/></label>
                <label className="form-field"><span>Gültig bis</span><input type="date" name="valid_until" defaultValue={r.valid_until??""}/></label>
                <label className="form-field"><span>Angefordert bei</span>
                  <select name="responsible_contact_id" defaultValue={r.responsible_contact_id??""}>
                    <option value="">Noch offen</option>
                    {d.contacts.map((c:any)=><option value={c.id} key={c.id}>{c.last_name}, {c.first_name} · {c.contact_number}</option>)}
                  </select>
                </label>
                <label className="form-field"><span>Dokument aus der Ablage</span>
                  <select name="document_id" defaultValue={r.document_id??""}>
                    <option value="">Nicht verknüpft</option>
                    {d.documents.map((doc:any)=><option value={doc.id} key={doc.id}>{doc.title} · {beschrifte(DOKUMENTKATEGORIE,doc.category)}</option>)}
                  </select>
                </label>
                <label className="form-field full-width"><span>Notiz</span><textarea name="note" rows={2} defaultValue={r.note??""}/></label>
                <div className="form-actions"><button className="primary-button" type="submit">Speichern</button></div>
              </Form>

              <div className="inline-actions">
                <Form method="post" className="inline-form">
                  <input type="hidden" name="_intent" value="create_task"/>
                  <input type="hidden" name="title" value={r.title}/>
                  <input type="hidden" name="note" value={r.note??""}/>
                  <label className="form-field compact"><span>Wiedervorlage am</span><input type="date" name="due_on" required/></label>
                  <button className="secondary-button compact" type="submit">Wiedervorlage anlegen</button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="_intent" value="remove"/>
                  <input type="hidden" name="requirement_id" value={r.id}/>
                  <button className="text-button" type="submit">Zeile entfernen</button>
                </Form>
              </div>
            </>:null}
          </details>;
        })}
      </div>
    </section>

    {d.canWrite
      ?<section className="editor-card">
        <div className="card-head"><div><p className="eyebrow">Ergänzen</p><h2>Eigene Zeile anlegen</h2></div></div>
        <Form method="post" className="form-grid">
          <input type="hidden" name="_intent" value="add"/>
          <label className="form-field"><span>Bezeichnung *</span><input name="title" required placeholder="z. B. Nachweis der Sondernutzungsrechte"/></label>
          <label className="form-field"><span>Kategorie in der Ablage</span>
            <select name="document_category" defaultValue="">
              <option value="">Ohne Zuordnung</option>
              {Object.entries(DOKUMENTKATEGORIE).map(([wert,label])=><option value={wert} key={wert}>{label}</option>)}
            </select>
          </label>
          <label className="form-field full-width"><span>Notiz</span><textarea name="note" rows={2}/></label>
          <div className="form-actions"><button className="primary-button" type="submit">Zeile anlegen</button></div>
        </Form>
      </section>
      :null}
  </main>;
}

export function ErrorBoundary({error}:Route.ErrorBoundaryProps){
  return <main className="editor-shell">
    <section className="data-card">
      <h2>Die Unterlagenliste konnte nicht geladen werden.</h2>
      <p>{error instanceof Error?error.message:"Unbekannter Fehler."}</p>
      <Link className="subtle-link" to="/properties">← Zurück zu den Immobilien</Link>
    </section>
  </main>;
}
