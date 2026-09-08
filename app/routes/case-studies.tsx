import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/case-studies";
import { requirePermission } from "~/lib/auth.server";
import { euroRund, tag } from "~/lib/format";

type ActionResult={error?:string};

export const CASE_STATUS:Record<string,string>={DRAFT:"In Arbeit",INTERNAL:"Nur intern",PUBLISHABLE:"Öffentlich verwendbar",WITHDRAWN:"Zurückgezogen"};
export const CASE_STATUS_CLASS:Record<string,string>={DRAFT:"status-draft",INTERNAL:"status-marketing",PUBLISHABLE:"status-sold",WITHDRAWN:"status-archived"};
export const RELEASE_STATUS:Record<string,string>={NOT_REQUESTED:"Nicht angefragt",REQUESTED:"Angefragt",GRANTED:"Erteilt",DECLINED:"Abgelehnt",WITHDRAWN:"Zurückgezogen"};
export const RELEASE_SCOPE:Record<string,string>={ANONYMIZED_ONLY:"Nur anonymisiert",IDENTIFIABLE:"Auch mit Namen und Objekt"};
export const RELEASE_FORM:Record<string,string>={WRITTEN:"Schriftlich",EMAIL:"E-Mail",VERBAL:"Mündlich",CONTRACT:"Im Vertrag"};
export const FEEDBACK_SOURCE:Record<string,string>={WRITTEN:"Schriftlich",VERBAL:"Mündlich",REVIEW:"Öffentliche Bewertung",SURVEY:"Befragung",OTHER:"Sonstiges"};

export function one(v:any){return Array.isArray(v)?v[0]:v;}
// Ohne Grundlage steht hier ein Strich. Number(null) waere 0 und damit eine
// Zahl, die niemand erfasst hat.
export const money = euroRund;
export const formatDay = tag;
export function plural(count:number,one:string,many:string){return `${count} ${count===1?one:many}`;}

export function caseStudyErrorMessage(message:string){
  if(message.includes("CASE_STUDY_CLOSING_NOT_NOTARIZED"))return"Eine Case Study entsteht erst nach der Beurkundung. Vorher gibt es keinen abgeschlossenen Fall.";
  if(message.includes("CASE_STUDY_RELEASE_CONTACT_UNRELATED"))return"Die Freigabe kann nur von jemandem kommen, der an diesem Verkauf beteiligt war — Käufer oder Eigentümer.";
  if(message.includes("CASE_STUDY_MEDIA_NOT_RELEASED"))return"Mindestens ein ausgewähltes Bild ist in der Mediathek nicht öffentlich freigegeben. Ohne diese Freigabe wird die Case Study nicht öffentlich verwendbar.";
  if(message.includes("CASE_STUDY_MEDIA_FOREIGN_PROPERTY"))return"Das Bild gehört zu einer anderen Immobilie.";
  if(message.includes("CASE_STUDY_WEBSITE_APPROVE_REQUIRED"))return"Das Veröffentlichen auf der Webseite darf nur die Geschäftsführung entscheiden.";
  if(message.includes("CASE_STUDY_WEBSITE_REQUIRES_PUBLISHABLE"))return"Auf die Webseite kommt nur, was auf „Öffentlich verwendbar“ steht — und das setzt eine erteilte Freigabe voraus.";
  if(message.includes("sale_case_studies_website_publishable_check"))return"Auf die Webseite kommt nur, was auf „Öffentlich verwendbar“ steht.";
  if(message.includes("sale_case_studies_website_dated_check"))return"Zur Veröffentlichung gehört ihr Zeitpunkt. Das setzt das System selbst — melden Sie den Fehler, wenn er auftritt.";
  if(message.includes("CASE_STUDY_APPROVE_REQUIRED"))return"Die Marketingfreigabe darf nur die Geschäftsführung entscheiden.";
  if(message.includes("sale_case_studies_publishable_release_check"))return"Ohne erteilte Marketingfreigabe lässt sich die Case Study nicht auf öffentlich verwendbar setzen.";
  if(message.includes("sale_case_studies_publishable_scope_check"))return"Die Freigabe gilt nur anonymisiert. Eine nicht anonymisierte Fassung braucht eine Freigabe mit Namen und Objekt.";
  if(message.includes("sale_case_studies_granted_scope_check"))return"Zu einer erteilten Freigabe gehören der Umfang und die freigebende Person.";
  if(message.includes("sale_case_studies_requested_dated_check"))return"Zu einer angefragten Freigabe gehört das Datum der Anfrage.";
  if(message.includes("sale_case_studies_decided_dated_check"))return"Zu einer entschiedenen Freigabe gehört das Datum der Entscheidung.";
  if(message.includes("sale_case_studies_feedback_dated_check"))return"Zu einem Kundenfeedback gehört die Angabe, woher es stammt.";
  if(message.includes("sale_case_studies_sale_closing_id_key"))return"Zu diesem Abschluss ist bereits eine Case Study erfasst.";
  return"Die Case Study konnte nicht gespeichert werden.";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"case_study.read");
  const url=new URL(request.url);
  const filter=url.searchParams.get("status")??"ACTIVE";

  const [rowsRes,closingsRes,canWriteRes]=await Promise.all([
    supabase.from("sale_case_studies")
      .select("id,case_study_number,title,status,release_status,release_scope,anonymized,display_location,archived_at,updated_at,sale_closings!inner(id,closing_number,notarized_date,agreed_purchase_price,notarial_purchase_price,properties!inner(id,property_number,internal_title))")
      .order("updated_at",{ascending:false}).limit(300),
    supabase.from("sale_closings")
      .select("id,closing_number,notarized_date,properties!inner(id,property_number,internal_title)")
      .not("notarized_date","is",null).is("archived_at",null).order("notarized_date",{ascending:false}).limit(300),
    supabase.rpc("current_user_has_permission",{p_permission:"case_study.write"}),
  ]);
  // Lesefehler werden nicht verschluckt: eine leere Liste sähe aus wie "nichts da".
  if(rowsRes.error||closingsRes.error)throw new Response("Case Studies konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  const all=(rowsRes.data??[]) as any[];
  const taken=new Set(all.map((row:any)=>one(row.sale_closings)?.id));
  const open=((closingsRes.data??[]) as any[]).filter((row:any)=>!taken.has(row.id));
  const rows=all.filter((row:any)=>filter==="ALL"?true:filter==="ARCHIVED"?Boolean(row.archived_at):!row.archived_at&&(filter==="ACTIVE"||row.status===filter));

  return data({profile,rows,openClosings:open,total:all.length,notarizedCount:((closingsRes.data??[]) as any[]).length,
    publishable:all.filter((row:any)=>!row.archived_at&&row.status==="PUBLISHABLE").length,
    waiting:all.filter((row:any)=>!row.archived_at&&row.release_status==="REQUESTED").length,
    filter,canWrite:canWriteRes.data===true},{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"case_study.write");
  const fd=await request.formData();
  const closingId=String(fd.get("sale_closing_id")??"").trim();
  const title=String(fd.get("title")??"").trim();
  if(!closingId)return data<ActionResult>({error:"Bitte einen abgeschlossenen Verkauf auswählen."},{status:400,headers:responseHeaders()});
  if(!title)return data<ActionResult>({error:"Bitte einen Titel angeben."},{status:400,headers:responseHeaders()});

  const {data:created,error}=await supabase.from("sale_case_studies")
    .insert({sale_closing_id:closingId,title,primary_responsible_user:userId,created_by:userId})
    .select("id").maybeSingle();
  if(error||!created)return data<ActionResult>({error:caseStudyErrorMessage(String(error?.message??""))},{status:400,headers:responseHeaders()});
  return redirect(`/case-studies/${created.id}`,{headers:responseHeaders()});
}

export default function CaseStudies(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<typeof action>();
  return <main className="editor-shell">
    <header className="editor-header">
      <div>
        <Link className="back-link" to="/crm">← CRM</Link>
        <p className="eyebrow">Nach dem Verkauf</p>
        <h1 className="editor-title">Case Studies</h1>
        <p className="editor-meta">Der abgeschlossene Fall, aufbereitet aus den Daten, die ohnehin erfasst sind.</p>
      </div>
      <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div>
    </header>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <div className="metric-grid">
      <article className="metric"><span>Angezeigt</span><strong>{d.rows.length}</strong><small>von {plural(d.total,"erfassten Case Study","erfassten Case Studies")}</small></article>
      <article className="metric"><span>Öffentlich verwendbar</span><strong>{d.publishable}</strong><small>{d.publishable===1?"Fall mit erteilter Freigabe":"Fälle mit erteilter Freigabe"}</small></article>
      <article className="metric"><span>Freigabe offen</span><strong>{d.waiting}</strong><small>{d.waiting===1?"Anfrage wartet auf Entscheidung":"Anfragen warten auf Entscheidung"}</small></article>
    </div>

    <section className="data-card">
      <Form method="get" className="filter-grid">
        <label><span>Ansicht</span><select name="status" defaultValue={d.filter}>
          <option value="ACTIVE">Aktive</option>
          <option value="ALL">Alle</option>
          {Object.entries(CASE_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          <option value="ARCHIVED">Archiviert</option>
        </select></label>
        <button className="secondary-button" type="submit">Filtern</button>
      </Form>
    </section>

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Referenzen</p><h2>Fälle</h2></div></div>
      {d.rows.length===0
        ?<p className="empty-state">In dieser Ansicht ist keine Case Study erfasst.</p>
        :<div className="data-list">{d.rows.map((row:any)=>{
          const closing=one(row.sale_closings);const property=one(closing?.properties);
          return <Link className="data-row data-row-link" to={`/case-studies/${row.id}`} key={row.id}>
            <div>
              <strong>{row.case_study_number} · {row.title}</strong>
              <small>{property?.property_number} · {property?.internal_title}</small>
              <small>{row.anonymized?`Anonymisiert${row.display_location?` · ${row.display_location}`:""}`:"Nicht anonymisiert"}</small>
            </div>
            <div className="row-meta">
              <span>{money(closing?.notarial_purchase_price??closing?.agreed_purchase_price)}</span>
              <small>beurkundet {formatDay(closing?.notarized_date)}</small>
            </div>
            <div className="row-meta">
              <span className={`status-pill ${CASE_STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":CASE_STATUS[row.status]??row.status}</span>
              <small>Freigabe: {RELEASE_STATUS[row.release_status]??row.release_status}</small>
            </div>
            <span className="subtle-link">Öffnen →</span>
          </Link>;
        })}</div>}
    </section>

    {d.canWrite?<section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Neu</p><h2>Case Study anlegen</h2></div></div>
      {d.openClosings.length===0
        ?<p className="empty-state">{d.notarizedCount===0
            ?"Es ist noch kein Verkauf beurkundet. Eine Case Study entsteht erst danach."
            :"Zu allen beurkundeten Verkäufen ist bereits eine Case Study erfasst."}</p>
        :<Form method="post" className="form-grid">
          <label className="form-field"><span>Abgeschlossener Verkauf *</span>
            <select name="sale_closing_id" defaultValue="">
              <option value="">— bitte wählen</option>
              {d.openClosings.map((row:any)=>{const property=one(row.properties);return <option key={row.id} value={row.id}>{row.closing_number} · {property?.property_number} · {property?.internal_title}</option>;})}
            </select>
          </label>
          <label className="form-field"><span>Titel *</span><input name="title" placeholder="z. B. Sanierungsfall im Bestand"/></label>
          <div className="form-field full-width inline-actions"><button className="primary-button" type="submit">Case Study anlegen</button></div>
          <p className="form-field full-width subtle">Die Kennzahlen kommen aus dem Vorgang selbst. Texte schreibt ausschließlich der Benutzer; die Software formuliert nichts.</p>
        </Form>}
    </section>:null}
  </main>;
}
