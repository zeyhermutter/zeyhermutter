import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/project-detail";
import { requirePermission } from "~/lib/auth.server";
import { BLOCKER_AREA, PHASE, PROJECT_STATUS, STATUS_CLASS, formatDay, nextAction, projectErrorMessage } from "./projects";

type ActionResult={error?:string};

const MEASURE_STATUS:Record<string,string>={PROPOSED:"Vorgeschlagen",QUOTE_REQUIRED:"Angebot nötig",QUOTE_REQUESTED:"Angebot angefragt",QUOTE_RECEIVED:"Angebot da",WAITING_OWNER:"Wartet auf Eigentümer",APPROVED:"Freigegeben",COMMISSIONED:"Beauftragt",PLANNED:"Geplant",IN_PROGRESS:"In Arbeit",BLOCKED:"Blockiert",DONE:"Erledigt",CHECKED:"Abgenommen",DISMISSED:"Verworfen"};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function money(value:any){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n):"—";}
function formatMoment(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(value));}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"project.read");
  const projectId=params.projectId!;
  const {data:project,error}=await supabase.from("sale_projects")
    .select("*,contacts(id,contact_number,first_name,last_name,email,phone,mobile),properties(id,property_number,internal_title,status,purchase_price),leads(id,lead_number,status),profiles!sale_projects_primary_responsible_user_fkey(user_id,display_name)")
    .eq("id",projectId).maybeSingle();
  if(error||!project)throw new Response("Verkaufsprojekt nicht gefunden.",{status:404,headers:responseHeaders()});

  const p=project as any;
  const [blockersRes,checkRes,profilesRes,contactsRes,propertiesRes,mandatesRes,closingsRes,tasksRes,activityRes,canWriteRes,canAssignRes]=await Promise.all([
    supabase.rpc("sale_project_blockers",{p_project_id:projectId}),
    supabase.from("lead_sales_readiness_checks").select("id,revision_no,status,is_current,lead_id,owner_decision,owner_decision_at,finalized_at").or(`sale_project_id.eq.${projectId}${p.lead_id?`,lead_id.eq.${p.lead_id}`:""}`).order("revision_no",{ascending:false}),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("properties").select("id,property_number,internal_title").is("archived_at",null).order("property_number").limit(500),
    p.property_id?supabase.from("brokerage_mandates").select("id,mandate_number,mandate_type,status,term_start,term_end").eq("property_id",p.property_id).is("archived_at",null).order("updated_at",{ascending:false}):Promise.resolve({data:[],error:null}),
    p.property_id?supabase.from("sale_closings").select("id,closing_number,status,notary_appointment_at,notarized_date,handover_date").eq("property_id",p.property_id).is("archived_at",null).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
    supabase.from("tasks").select("id,task_number,title,status,due_at,responsible_user").eq("contact_id",p.contact_id).is("archived_at",null).neq("status","DONE").order("due_at").limit(20),
    supabase.from("activity_events").select("id,activity_type,title,occurred_at").eq("contact_id",p.contact_id).order("occurred_at",{ascending:false}).limit(5),
    supabase.rpc("current_user_has_permission",{p_permission:"project.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"project.assign"}),
  ]);
  // Lesefehler nicht verschlucken — ein leerer Blockerbereich darf nicht wie
  // „alles frei" aussehen.
  if(blockersRes.error||checkRes.error)throw new Response("Die Projektdaten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  const checks=(checkRes.data??[]) as any[];
  const currentCheck=checks.find((c)=>c.is_current)??checks[0]??null;
  let measures:any[]=[]; let scenarios:any[]=[];
  if(currentCheck){
    const [measureRes,scenarioRes]=await Promise.all([
      supabase.from("lead_sales_readiness_measures").select("id,title,category,status,decision,approved_budget,actual_cost,quote_price,target_date").eq("check_id",currentCheck.id).order("sort_order"),
      supabase.from("lead_sales_readiness_scenarios").select("id,title,scenario_kind,is_recommended,investment_min,investment_max,estimated_sale_price_min,estimated_sale_price_max").eq("check_id",currentCheck.id).order("sort_order"),
    ]);
    measures=measureRes.data??[]; scenarios=scenarioRes.data??[];
  }

  return data({
    profile,project,
    blockers:(blockersRes.data??[]) as any[],
    checks,currentCheck,measures,scenarios,
    profiles:profilesRes.data??[],
    contacts:contactsRes.data??[],
    properties:propertiesRes.data??[],
    mandates:mandatesRes.data??[],
    closings:closingsRes.data??[],
    tasks:tasksRes.data??[],
    activities:activityRes.data??[],
    canWrite:canWriteRes.data===true,
    canAssign:canAssignRes.data===true,
  },{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"project.write");
  const projectId=params.projectId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const back=`/projects/${projectId}`;
  const fail=(error:any)=>data<ActionResult>({error:projectErrorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Das Projekt wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});
  const save=async(update:Record<string,unknown>,hash="")=>{
    const {data:updated,error}=await supabase.from("sale_projects").update(update).eq("id",projectId).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error); if(!updated)return conflict();
    return redirect(`${back}${hash}`,{headers:responseHeaders()});
  };

  if(intent==="core_save"){
    const phase=text(fd,"phase");
    const propertyId=text(fd,"property_id")||null;
    if(["PREPARATION","MARKETING","NOTARY","COMPLETED"].includes(phase)&&!propertyId)
      return invalid("Ab der Vorbereitung gehört eine Immobilie zum Projekt.");
    const status=text(fd,"status");
    const lostReason=text(fd,"lost_reason");
    if(status==="LOST"&&!lostReason)return invalid("Zu einem verlorenen Projekt gehört ein Grund.");
    if(status==="WON"&&phase!=="COMPLETED")return invalid("Ein gewonnenes Projekt steht in der Phase Abgeschlossen.");
    const estimate=numOrNull(fd,"current_price_estimate");
    if(typeof estimate==="number"&&!Number.isFinite(estimate))return invalid("Die Preiseinschätzung ist keine gültige Zahl.");
    return save({
      phase,status,lost_reason:status==="LOST"?lostReason:null,
      property_id:propertyId,contact_id:text(fd,"contact_id"),
      target_marketing_start:dateOrNull(fd,"target_marketing_start"),
      current_price_estimate:estimate,
      price_estimate_note:text(fd,"price_estimate_note")||null,
      notes:text(fd,"notes")||null,
    });
  }

  if(intent==="next_step_save"){
    const step=text(fd,"next_step");
    const due=dateOrNull(fd,"next_step_due_on");
    // Ein Schritt ohne Termin ist keine Aufgabe, sondern ein Wunsch.
    if(step&&!due)return invalid("Zu einem nächsten Schritt gehört eine Fälligkeit.");
    return save({
      next_step:step||null,
      next_step_due_on:step?due:null,
      next_step_user:step?(text(fd,"next_step_user")||userId):null,
    },"#naechster-schritt");
  }

  if(intent==="assign"){
    return save({primary_responsible_user:text(fd,"primary_responsible_user")||null});
  }

  if(intent==="link_check"){
    const checkId=text(fd,"check_id");
    if(!checkId)return invalid("Kein Check gewählt.");
    const {error}=await supabase.from("lead_sales_readiness_checks").update({sale_project_id:projectId}).eq("id",checkId);
    if(error)return invalid("Der Check konnte nicht mit dem Projekt verknüpft werden.");
    return redirect(`${back}#check`,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

export default function ProjectDetail(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<ActionResult>();
  const p=d.project as any;
  const disabled=!d.canWrite;
  const blockers=(d.blockers??[]) as any[];
  const measures=(d.measures??[]) as any[];
  const scenarios=(d.scenarios??[]) as any[];
  const action=nextAction(p,blockers);
  const today=new Date().toISOString().slice(0,10);
  const overdue=action.kind==="STEP"&&action.due&&action.due<today;
  const openMeasures=measures.filter((m)=>!["DONE","CHECKED","DISMISSED"].includes(m.status)&&!["NOT_RECOMMENDED","NOT_REQUIRED"].includes(m.decision));
  const plannedBudget=measures.reduce((sum,m)=>sum+(Number(m.approved_budget)||Number(m.quote_price)||0),0);
  const actualCost=measures.reduce((sum,m)=>sum+(Number(m.actual_cost)||0),0);
  const recommended=scenarios.find((s)=>s.is_recommended)??null;
  const lastActivity=(d.activities??[])[0]??null;
  const profileName=(id:string|null)=>(d.profiles as any[]).find((x)=>x.user_id===id)?.display_name??"—";

  return <div className="editor-shell">
    <div className="editor-header">
      <div>
        <Link className="back-link" to="/projects">← Verkaufsprojekte</Link>
        <p className="eyebrow">{p.project_number}</p>
        <h1>{p.contacts?`${p.contacts.last_name}, ${p.contacts.first_name}`:"Eigentümer offen"}</h1>
        <p className="subtle">{PHASE[p.phase]??p.phase}{p.properties?` · ${p.properties.property_number} · ${p.properties.internal_title}`:" · ohne Immobilie"}</p>
      </div>
      <div className="inline-actions">
        <span className={`status-pill ${STATUS_CLASS[p.status]??""}`}>{PROJECT_STATUS[p.status]??p.status}</span>
        <span className="status-pill">Version {p.version}</span>
      </div>
    </div>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <section className="data-card" id="naechster-schritt">
      <div className="card-head"><div><p className="eyebrow">Genau eine Sache</p><h2>Nächste Aktion</h2></div></div>
      {action.kind==="STEP"
        ?<div className={overdue?"form-warning":"form-success"}><strong>{action.title}</strong><br/>Fällig {formatDay(action.due)}{overdue?" — überfällig":""} · {profileName(action.userId)}</div>
        :action.kind==="BLOCKER"
          ?<div className="form-warning"><strong>Das Projekt hängt an: {BLOCKER_AREA[(action as any).area]??"einem offenen Punkt"}</strong><br/>{action.title}</div>
          :<p className="empty-state">{action.title}</p>}

      <Form method="post" className="form-grid" style={{marginTop:"0.75rem"}}>
        <input type="hidden" name="_intent" value="next_step_save"/>
        <input type="hidden" name="version" value={p.version}/>
        <label className="form-field"><span>Nächster Schritt</span><input name="next_step" defaultValue={p.next_step??""} disabled={disabled}/></label>
        <label className="form-field"><span>Fällig am</span><input type="date" name="next_step_due_on" defaultValue={p.next_step_due_on??""} disabled={disabled}/></label>
        <label className="form-field"><span>Verantwortlich</span><select name="next_step_user" defaultValue={p.next_step_user??p.primary_responsible_user??""} disabled={disabled}><option value="">—</option>{(d.profiles as any[]).map((x:any)=><option key={x.user_id} value={x.user_id}>{x.display_name}</option>)}</select></label>
        <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Schritt speichern</button></div>
      </Form>
    </section>

    <section className="data-card" id="blocker">
      <div className="card-head"><div><p className="eyebrow">Bis zum Vermarktungsstart</p><h2>Offene Punkte</h2></div><span className="status-pill">{blockers.length}</span></div>
      {blockers.length===0
        ?<p className="form-success">Aus Maßnahmen, Vermarktungsreife, Pflichtangaben, Verfügungsberechtigung und Auftrag ist nichts offen. Das ist eine Vollständigkeitsprüfung der Erfassung, keine Freigabe.</p>
        :<div className="data-list">{blockers.map((b:any,index:number)=>
          <div className="data-row" key={`${b.area}-${index}`}>
            <div><strong>{BLOCKER_AREA[b.area]??b.area}</strong><small>{b.text}</small></div>
            <div className="row-meta">
              {b.area==="DISCLOSURE"&&p.property_id?<Link className="subtle-link" to={`/properties/${p.property_id}/mandatory-data`}>Pflichtangaben →</Link>:null}
              {b.area==="DISPOSITION"&&p.property_id?<Link className="subtle-link" to={`/properties/${p.property_id}/disposition`}>Verfügungsberechtigung →</Link>:null}
              {b.area==="CHECKLIST"&&p.property_id?<Link className="subtle-link" to={`/properties/${p.property_id}#checkliste`}>Checkliste →</Link>:null}
              {b.area==="MANDATE"&&p.property_id?<Link className="subtle-link" to={`/mandates?property_id=${encodeURIComponent(p.property_id)}`}>Maklerauftrag →</Link>:null}
              {b.area==="MEASURE"&&p.leads?<Link className="subtle-link" to={`/leads/${p.leads.id}/sales-readiness`}>Maßnahmen →</Link>:null}
              {b.area==="CHECK"&&p.leads?<Link className="subtle-link" to={`/leads/${p.leads.id}/sales-readiness`}>Check öffnen →</Link>:null}
            </div>
          </div>)}</div>}
    </section>

    <div className="dashboard-grid property-section">
      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Rahmen</p><h2>Projekt</h2></div></div>
        <Form method="post" className="form-grid">
          <input type="hidden" name="_intent" value="core_save"/>
          <input type="hidden" name="version" value={p.version}/>
          <label className="form-field"><span>Eigentümer *</span><select name="contact_id" defaultValue={p.contact_id} disabled={disabled}>{(d.contacts as any[]).map((c:any)=><option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}</select></label>
          <label className="form-field"><span>Immobilie</span><select name="property_id" defaultValue={p.property_id??""} disabled={disabled}><option value="">— noch keine</option>{(d.properties as any[]).map((x:any)=><option key={x.id} value={x.id}>{x.property_number} · {x.internal_title}</option>)}</select></label>
          <label className="form-field"><span>Phase</span><select name="phase" defaultValue={p.phase} disabled={disabled}>{Object.entries(PHASE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
          <label className="form-field"><span>Status</span><select name="status" defaultValue={p.status} disabled={disabled}>{Object.entries(PROJECT_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
          <label className="form-field full-width"><span>Grund bei Verloren</span><input name="lost_reason" defaultValue={p.lost_reason??""} disabled={disabled}/></label>
          <label className="form-field"><span>Ziel Vermarktungsstart</span><input type="date" name="target_marketing_start" defaultValue={p.target_marketing_start??""} disabled={disabled}/></label>
          <label className="form-field"><span>Preiseinschätzung €</span><input name="current_price_estimate" defaultValue={p.current_price_estimate??""} disabled={disabled}/><small className="subtle">Einschätzung, keine Zusicherung.</small></label>
          <label className="form-field full-width"><span>Woraus die Einschätzung stammt</span><input name="price_estimate_note" defaultValue={p.price_estimate_note??""} disabled={disabled}/></label>
          <label className="form-field full-width"><span>Notiz</span><textarea name="notes" rows={2} defaultValue={p.notes??""} disabled={disabled}/></label>
          <div className="form-field full-width inline-actions"><button className="primary-button" type="submit" disabled={disabled}>Projekt speichern</button></div>
        </Form>
      </section>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Überblick</p><h2>Stand</h2></div></div>
        <dl className="detail-list">
          <div><dt>Zuständig</dt><dd>{p.profiles?.display_name??"—"}</dd></div>
          <div><dt>Eigentümer</dt><dd>{p.contacts?<Link className="subtle-link" to={`/crm/contacts/${p.contacts.id}`}>{p.contacts.last_name}, {p.contacts.first_name} →</Link>:"—"}</dd></div>
          <div><dt>Immobilie</dt><dd>{p.properties?<Link className="subtle-link" to={`/properties/${p.properties.id}`}>{p.properties.property_number} →</Link>:"noch keine"}</dd></div>
          <div><dt>Lead</dt><dd>{p.leads?<Link className="subtle-link" to={`/leads/${p.leads.id}`}>{p.leads.lead_number} →</Link>:"ohne Lead"}</dd></div>
          <div><dt>Ziel Vermarktungsstart</dt><dd>{formatDay(p.target_marketing_start)}</dd></div>
          <div><dt>Preiseinschätzung</dt><dd>{p.current_price_estimate!=null?`${money(p.current_price_estimate)}${p.price_estimate_note?` · ${p.price_estimate_note}`:""}`:"—"}</dd></div>
          <div><dt>Gewähltes Szenario</dt><dd>{recommended?`${recommended.title}${recommended.investment_min!=null?` · Einsatz ab ${money(recommended.investment_min)}`:""}`:"keines empfohlen"}</dd></div>
          <div><dt>Geplantes Budget</dt><dd>{plannedBudget>0?money(plannedBudget):"—"}</dd></div>
          <div><dt>Tatsächliche Kosten</dt><dd>{actualCost>0?money(actualCost):"—"}</dd></div>
          <div><dt>Offene Maßnahmen</dt><dd>{openMeasures.length} von {measures.length}</dd></div>
          <div><dt>Letzter Kontakt</dt><dd>{lastActivity?`${lastActivity.title??lastActivity.activity_type} · ${formatMoment(lastActivity.occurred_at)}`:"keine Aktivität erfasst"}</dd></div>
          <div><dt>Offene Aufgaben</dt><dd>{(d.tasks as any[]).length}</dd></div>
        </dl>
        {d.canAssign?<Form method="post" className="inline-actions" style={{marginTop:"0.75rem"}}>
          <input type="hidden" name="_intent" value="assign"/>
          <input type="hidden" name="version" value={p.version}/>
          <select name="primary_responsible_user" defaultValue={p.primary_responsible_user??""}>{(d.profiles as any[]).map((x:any)=><option key={x.user_id} value={x.user_id}>{x.display_name}</option>)}</select>
          <button className="secondary-button" type="submit">Zuordnen</button>
        </Form>:null}
      </section>
    </div>

    <section className="data-card" id="check">
      <div className="card-head"><div><p className="eyebrow">Strategie</p><h2>Verkaufsstrategie-Check</h2></div>{p.leads?<Link className="subtle-link" to={`/leads/${p.leads.id}/sales-readiness`}>Check öffnen →</Link>:null}</div>
      {(d.checks as any[]).length===0
        ?<p className="empty-state">Zu diesem Projekt ist kein Check erfasst. Der Check wird weiterhin über den Lead geführt.</p>
        :<div className="data-list">{(d.checks as any[]).map((c:any)=>
          <div className="data-row" key={c.id}>
            <div><strong>Revision {c.revision_no}</strong><small>{c.status}{c.is_current?" · aktuell":""}{c.finalized_at?` · finalisiert ${formatMoment(c.finalized_at)}`:""}</small></div>
            <div className="row-meta"><span>{c.owner_decision??"Entscheidung offen"}</span><small>{c.owner_decision_at?formatMoment(c.owner_decision_at):""}</small></div>
            {c.sale_project_id?<span className="status-pill status-sold">verknüpft</span>
              :<Form method="post"><input type="hidden" name="_intent" value="link_check"/><input type="hidden" name="check_id" value={c.id}/><button className="text-button" type="submit" disabled={disabled}>Mit Projekt verknüpfen</button></Form>}
          </div>)}</div>}
      {measures.length?<div className="data-list" style={{marginTop:"0.75rem"}}>{measures.slice(0,8).map((m:any)=>
        <div className="data-row" key={m.id}>
          <div><strong>{m.title}</strong><small>{MEASURE_STATUS[m.status]??m.status}{m.target_date?` · bis ${formatDay(m.target_date)}`:""}</small></div>
          <div className="row-meta"><span>{m.approved_budget!=null?money(m.approved_budget):m.quote_price!=null?`${money(m.quote_price)} Angebot`:"kein Budget"}</span><small>{m.actual_cost!=null?`${money(m.actual_cost)} angefallen`:""}</small></div>
        </div>)}</div>:null}
    </section>

    <section className="data-card" id="verlauf">
      <div className="card-head"><div><p className="eyebrow">Weiter im Prozess</p><h2>Auftrag, Vermarktung, Abschluss</h2></div></div>
      {!p.property_id
        ?<p className="empty-state">Ohne zugeordnete Immobilie gibt es hier nichts zu zeigen.</p>
        :<>
          <dl className="detail-list">
            <div><dt>Maklerauftrag</dt><dd>{(d.mandates as any[]).length?(d.mandates as any[]).map((m:any)=>`${m.mandate_number} (${m.status})`).join(", "):"keiner erfasst"}</dd></div>
            <div><dt>Abschluss & Notar</dt><dd>{(d.closings as any[]).length?(d.closings as any[]).map((c:any)=>`${c.closing_number} (${c.status})`).join(", "):"keiner erfasst"}</dd></div>
          </dl>
          <div className="inline-actions" style={{marginTop:"0.75rem"}}>
            <Link className="secondary-button link-button" to={`/properties/${p.property_id}`}>Objektakte</Link>
            <Link className="secondary-button link-button" to={`/properties/${p.property_id}/interests`}>Interessenten</Link>
            <Link className="secondary-button link-button" to={`/properties/${p.property_id}/publication`}>Veröffentlichung</Link>
            <Link className="secondary-button link-button" to={`/purchase-offers?property_id=${encodeURIComponent(p.property_id)}`}>Kaufangebote</Link>
            <Link className="secondary-button link-button" to={`/closings?property_id=${encodeURIComponent(p.property_id)}`}>Abschluss & Notar</Link>
            <Link className="secondary-button link-button" to={`/commissions?property_id=${encodeURIComponent(p.property_id)}`}>Provisionen</Link>
          </div>
        </>}
    </section>
  </div>;
}
