import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/projects";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

export const PHASE:Record<string,string>={LEAD:"Lead",OWNER_TALK:"Eigentümergespräch",READINESS_CHECK:"Verkaufsstrategie-Check",CONSULTATION:"Beratung",MANDATE:"Maklerauftrag",PREPARATION:"Vorbereitung",MARKETING:"Vermarktung",NOTARY:"Notar",COMPLETED:"Abgeschlossen"};
export const PROJECT_STATUS:Record<string,string>={ACTIVE:"Aktiv",ON_HOLD:"Ruht",WON:"Gewonnen",LOST:"Verloren"};
export const STATUS_CLASS:Record<string,string>={ACTIVE:"status-sold",ON_HOLD:"status-draft",WON:"status-sold",LOST:"status-lost"};
export const BLOCKER_AREA:Record<string,string>={PROPERTY:"Immobilie",CHECK:"Verkaufsstrategie-Check",MEASURE:"Maßnahmen",CHECKLIST:"Vermarktungsreife",DISCLOSURE:"Pflichtangaben",DISPOSITION:"Verfügungsberechtigung",MANDATE:"Maklerauftrag"};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
export function formatDay(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}

/**
 * Genau eine nächste Aktion je Projekt. Das System erfindet keine: entweder es
 * ist ein nächster Schritt erfasst, dann steht der da — oder es nennt, woran
 * das Projekt hängt. Gibt es beides nicht, sagt es auch das.
 */
export function nextAction(project:any,blockers:any[]){
  const step=String(project?.next_step??"").trim();
  if(step)return {kind:"STEP" as const,title:step,due:project.next_step_due_on??null,userId:project.next_step_user??null};
  const first=(blockers??[])[0];
  if(first)return {kind:"BLOCKER" as const,title:first.text,area:first.area,due:null,userId:project?.primary_responsible_user??null};
  return {kind:"NONE" as const,title:"Kein nächster Schritt erfasst und kein offener Punkt erkennbar.",due:null,userId:project?.primary_responsible_user??null};
}

export function projectErrorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("PROJECT_CONTACT_NOT_FOUND"))return"Der gewählte Eigentümer wurde nicht gefunden.";
  if(message.includes("PROJECT_PROPERTY_NOT_FOUND"))return"Die gewählte Immobilie wurde nicht gefunden.";
  if(message.includes("PROJECT_LEAD_NOT_FOUND"))return"Der gewählte Lead wurde nicht gefunden.";
  if(message.includes("PROJECT_PHASE_NEEDS_PROPERTY"))return"Ab der Vorbereitung gehört eine Immobilie zum Projekt.";
  if(message.includes("PROJECT_WON_NEEDS_COMPLETED_PHASE"))return"Ein gewonnenes Projekt steht in der Phase Abgeschlossen.";
  if(message.includes("PROJECT_ASSIGN_REQUIRED"))return"Zum Ändern des Verantwortlichen fehlt die Berechtigung.";
  if(message.includes("PROJECT_NEXT_STEP_UNREALISTIC"))return"Die Fälligkeit des nächsten Schritts liegt unrealistisch weit zurück.";
  if(message.includes("sale_projects_next_step_dated_check"))return"Zu einem nächsten Schritt gehört eine Fälligkeit.";
  if(message.includes("sale_projects_lost_reason_check"))return"Zu einem verlorenen Projekt gehört ein Grund.";
  if(message.includes("sale_projects_one_active_per_property_idx"))return"Für diese Immobilie besteht bereits ein laufendes Verkaufsprojekt.";
  if(message.includes("ARCHIVE_PERMISSION_REQUIRED")||message.includes("project.archive"))return"Zum Archivieren fehlt die Berechtigung.";
  return "Das Verkaufsprojekt konnte nicht gespeichert werden.";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"project.read");
  const url=new URL(request.url);
  const showAll=url.searchParams.get("alle")==="1";

  const [projectsRes,contactsRes,propertiesRes,leadsRes,canWriteRes]=await Promise.all([
    supabase.from("sale_projects")
      .select("*,contacts(id,contact_number,first_name,last_name),properties(id,property_number,internal_title),leads(id,lead_number),profiles!sale_projects_primary_responsible_user_fkey(display_name)")
      .is("archived_at",null).order("updated_at",{ascending:false}).limit(200),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("properties").select("id,property_number,internal_title").is("archived_at",null).order("property_number").limit(500),
    supabase.from("leads").select("id,lead_number,contact_id").is("archived_at",null).order("created_at",{ascending:false}).limit(500),
    supabase.rpc("current_user_has_permission",{p_permission:"project.write"}),
  ]);
  // Lesefehler nicht verschlucken — eine leere Liste darf nicht wie „keine Projekte" aussehen.
  if(projectsRes.error)throw new Response("Die Verkaufsprojekte konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  const all=(projectsRes.data??[]) as any[];
  const visible=showAll?all:all.filter((p)=>p.status==="ACTIVE"||p.status==="ON_HOLD");
  const blockers=await Promise.all(visible.map(async(p)=>{
    const {data:rows,error}=await supabase.rpc("sale_project_blockers",{p_project_id:p.id});
    // Ein Fehler darf nicht als „keine Blocker" durchgehen.
    return {id:p.id,rows:error?null:((rows??[]) as any[])};
  }));
  const blockerMap=Object.fromEntries(blockers.map((b)=>[b.id,b.rows]));

  return data({
    profile,showAll,
    projects:visible,
    total:all.length,
    blockerMap,
    contacts:contactsRes.data??[],
    properties:propertiesRes.data??[],
    leads:leadsRes.data??[],
    canWrite:canWriteRes.data===true,
  },{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"project.write");
  const fd=await request.formData();
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  if(text(fd,"_intent")!=="project_add")return invalid("Unbekannte Aktion.");

  const contactId=text(fd,"contact_id");
  if(!contactId)return invalid("Bitte den Eigentümer wählen. Ohne ihn gibt es kein Projekt.");
  const phase=text(fd,"phase")||"LEAD";
  const propertyId=text(fd,"property_id")||null;
  if(["PREPARATION","MARKETING","NOTARY","COMPLETED"].includes(phase)&&!propertyId)
    return invalid("Ab der Vorbereitung gehört eine Immobilie zum Projekt.");
  const nextStep=text(fd,"next_step");
  const nextDue=dateOrNull(fd,"next_step_due_on");
  if(nextStep&&!nextDue)return invalid("Zu einem nächsten Schritt gehört eine Fälligkeit.");

  const {data:created,error}=await supabase.from("sale_projects").insert({
    contact_id:contactId,property_id:propertyId,lead_id:text(fd,"lead_id")||null,
    phase,next_step:nextStep||null,next_step_due_on:nextDue,next_step_user:nextStep?userId:null,
    target_marketing_start:dateOrNull(fd,"target_marketing_start"),
    notes:text(fd,"notes")||null,
    primary_responsible_user:userId,created_by:userId,updated_by:userId,
  }).select("id").maybeSingle();
  if(error)return data<ActionResult>({error:projectErrorMessage(error)},{status:400,headers:responseHeaders()});
  return redirect(`/projects/${created?.id}`,{headers:responseHeaders()});
}

export default function Projects(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<ActionResult>();
  const disabled=!d.canWrite;
  const projects=(d.projects??[]) as any[];
  const blockerMap=d.blockerMap as Record<string,any[]|null>;
  const withoutProperty=projects.filter((p)=>!p.property_id).length;
  const overdue=projects.filter((p)=>p.next_step_due_on&&p.next_step_due_on<new Date().toISOString().slice(0,10)).length;

  return <div className="editor-shell">
    <div className="editor-header">
      <div>
        <p className="eyebrow">Arbeitsplatz · Verkauf</p>
        <h1>Verkaufsprojekte</h1>
        <p className="subtle">Die Klammer um Eigentümer, Immobilie, Check, Maßnahmen, Auftrag, Vermarktung und Abschluss.</p>
      </div>
      <div className="inline-actions">
        <Link className="subtle-link" to={d.showAll?"/projects":"/projects?alle=1"}>{d.showAll?"Nur laufende":"Auch abgeschlossene"}</Link>
      </div>
    </div>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <div className="metric-grid">
      <article className="metric"><span>Angezeigt</span><strong>{projects.length}</strong><small>von {d.total} nicht archivierten</small></article>
      <article className="metric"><span>Ohne Immobilie</span><strong>{withoutProperty}</strong><small>Projekt zeigt auf kein Objekt</small></article>
      <article className="metric"><span>Fällige Schritte</span><strong>{overdue}</strong><small>nächster Schritt überfällig</small></article>
    </div>

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Ein Projekt, eine nächste Aktion</p><h2>Projekte</h2></div></div>
      {projects.length===0
        ?<p className="empty-state">Kein Verkaufsprojekt vorhanden.</p>
        :<div className="data-list">{projects.map((p:any)=>{
          const rows=blockerMap[p.id];
          const action=nextAction(p,rows??[]);
          const overdueStep=action.kind==="STEP"&&action.due&&action.due<new Date().toISOString().slice(0,10);
          return <Link className="data-row data-row-link" to={`/projects/${p.id}`} key={p.id}>
            <div>
              <strong>{p.project_number} · {p.contacts?`${p.contacts.last_name}, ${p.contacts.first_name}`:"Eigentümer offen"}</strong>
              <small>{PHASE[p.phase]??p.phase}{p.properties?` · ${p.properties.property_number}`:" · ohne Immobilie"}{p.profiles?.display_name?` · ${p.profiles.display_name}`:""}</small>
            </div>
            <div className="row-meta">
              <span>{action.kind==="BLOCKER"?`Hängt an: ${action.title}`:action.title}</span>
              <small>{rows===null?"Offene Punkte konnten nicht geladen werden."
                :action.kind==="STEP"?`fällig ${formatDay(action.due)}${overdueStep?" · überfällig":""}`
                :action.kind==="BLOCKER"?`${BLOCKER_AREA[(action as any).area]??"Offener Punkt"} · ${rows.length} ${rows.length===1?"offener Punkt":"offene Punkte"}`
                :"nichts offen"}</small>
            </div>
            <span className={`status-pill ${STATUS_CLASS[p.status]??""}`}>{PROJECT_STATUS[p.status]??p.status}</span>
          </Link>;
        })}</div>}
    </section>

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Neu</p><h2>Projekt anlegen</h2></div></div>
      <Form method="post" className="form-grid">
        <input type="hidden" name="_intent" value="project_add"/>
        <label className="form-field"><span>Eigentümer *</span><select name="contact_id" defaultValue="" disabled={disabled}><option value="">—</option>{(d.contacts as any[]).map((c:any)=><option key={c.id} value={c.id}>{c.last_name}, {c.first_name} · {c.contact_number}</option>)}</select></label>
        <label className="form-field"><span>Immobilie</span><select name="property_id" defaultValue="" disabled={disabled}><option value="">— noch keine</option>{(d.properties as any[]).map((p:any)=><option key={p.id} value={p.id}>{p.property_number} · {p.internal_title}</option>)}</select></label>
        <label className="form-field"><span>Lead</span><select name="lead_id" defaultValue="" disabled={disabled}><option value="">— ohne Lead</option>{(d.leads as any[]).map((l:any)=><option key={l.id} value={l.id}>{l.lead_number}</option>)}</select><small className="subtle">Nur die Herkunft; der Lead bleibt unverändert bestehen.</small></label>
        <label className="form-field"><span>Phase</span><select name="phase" defaultValue="LEAD" disabled={disabled}>{Object.entries(PHASE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field"><span>Nächster Schritt</span><input name="next_step" disabled={disabled} placeholder="Eigentümer anrufen"/></label>
        <label className="form-field"><span>Fällig am</span><input type="date" name="next_step_due_on" disabled={disabled}/><small className="subtle">Ohne Fälligkeit wird kein Schritt gespeichert.</small></label>
        <label className="form-field"><span>Ziel Vermarktungsstart</span><input type="date" name="target_marketing_start" disabled={disabled}/></label>
        <label className="form-field full-width"><span>Notiz</span><input name="notes" disabled={disabled}/></label>
        <div className="form-field full-width inline-actions"><button className="primary-button" type="submit" disabled={disabled}>Projekt anlegen</button></div>
      </Form>
    </section>
  </div>;
}
