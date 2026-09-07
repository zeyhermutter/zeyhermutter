import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/after-sales";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

export const AUDIENCE:Record<string,string>={BUYER:"Käufer",SELLER:"Verkäufer"};
// Der Schluessel des Bausteins ist unveraenderlich und stand im Bearbeiten-
// Formular als roher Datenbankwert ("FOLLOW_UP", "REFERRAL_REQUEST"). Der Titel
// darueber laesst sich aendern, der Schluessel nicht — deshalb wird er weiterhin
// gezeigt, jetzt aber benannt.
export const STEP_KEY:Record<string,string>={FOLLOW_UP:"Nachfassen nach der Übergabe",REFERRAL_REQUEST:"Empfehlungsanfrage",ANNIVERSARY:"Jahrestag der Übergabe"};
export const TASK_PRIORITY:Record<string,string>={LOW:"Niedrig",NORMAL:"Normal",HIGH:"Hoch",URGENT:"Dringend"};
export const TASK_STATUS:Record<string,string>={OPEN:"Offen",IN_PROGRESS:"In Arbeit",DONE:"Erledigt",CANCELLED:"Verworfen"};

function one(v:any){return Array.isArray(v)?v[0]:v;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function plural(count:number,singular:string,many:string){return `${count} ${count===1?singular:many}`;}

export function formatMoment(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(value));}

export function offsetLabel(days:number){
  if(days===0)return"am Tag der Übergabe";
  if(days%365===0)return plural(days/365,"Jahr nach der Übergabe","Jahre nach der Übergabe");
  if(days%7===0)return plural(days/7,"Woche nach der Übergabe","Wochen nach der Übergabe");
  return plural(days,"Tag nach der Übergabe","Tage nach der Übergabe");
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"closing.read");
  const [templatesRes,tasksRes,canManageRes]=await Promise.all([
    supabase.from("after_sales_step_templates").select("*").order("sort_order").order("step_key"),
    supabase.from("tasks")
      .select("id,task_number,title,status,priority,due_at,after_sales_step,responsible_user,contacts(id,first_name,last_name),sale_closings(id,closing_number,properties(property_number,internal_title))")
      .not("after_sales_step","is",null).is("archived_at",null).order("due_at").limit(300),
    supabase.rpc("current_user_has_permission",{p_permission:"after_sales.manage"}),
  ]);
  // Ein verschluckter Lesefehler sähe hier aus wie "keine Nachbetreuung offen".
  if(templatesRes.error||tasksRes.error)throw new Response("Die Nachbetreuung konnte nicht geladen werden.",{status:500,headers:responseHeaders()});

  const tasks=(tasksRes.data??[]) as any[];
  const now=Date.now();
  return data({profile,templates:templatesRes.data??[],tasks,
    open:tasks.filter((t:any)=>!["DONE","CANCELLED"].includes(t.status)).length,
    overdue:tasks.filter((t:any)=>!["DONE","CANCELLED"].includes(t.status)&&new Date(t.due_at).getTime()<now).length,
    done:tasks.filter((t:any)=>t.status==="DONE").length,
    canManage:canManageRes.data===true},{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"after_sales.manage");
  const fd=await request.formData();
  const intent=text(fd,"_intent");

  if(intent==="template_save"){
    const id=text(fd,"template_id");
    const offset=Number(text(fd,"offset_days"));
    if(!Number.isInteger(offset)||offset<0||offset>3650)return data<ActionResult>({error:"Der Abstand zur Übergabe muss zwischen 0 und 3650 Tagen liegen."},{status:400,headers:responseHeaders()});
    const title=text(fd,"title");
    if(!title)return data<ActionResult>({error:"Ein Baustein braucht einen Titel."},{status:400,headers:responseHeaders()});
    const {error}=await supabase.from("after_sales_step_templates").update({
      title,description:text(fd,"description")||null,audience:text(fd,"audience"),
      offset_days:offset,priority:text(fd,"priority"),active:fd.get("active")==="on",
    }).eq("id",id).eq("version",Number(text(fd,"version")));
    if(error)return data<ActionResult>({error:"Der Baustein konnte nicht gespeichert werden."},{status:400,headers:responseHeaders()});
    return redirect("/after-sales#folge",{headers:responseHeaders()});
  }

  if(intent==="template_add"){
    const key=text(fd,"step_key").toUpperCase();
    if(!/^[A-Z][A-Z0-9_]{1,39}$/.test(key))return data<ActionResult>({error:"Das Kürzel darf nur Großbuchstaben, Ziffern und Unterstriche enthalten und muss mit einem Buchstaben beginnen."},{status:400,headers:responseHeaders()});
    const offset=Number(text(fd,"offset_days"));
    if(!Number.isInteger(offset)||offset<0||offset>3650)return data<ActionResult>({error:"Der Abstand zur Übergabe muss zwischen 0 und 3650 Tagen liegen."},{status:400,headers:responseHeaders()});
    const {error}=await supabase.from("after_sales_step_templates").insert({
      step_key:key,title:text(fd,"title"),description:text(fd,"description")||null,
      audience:text(fd,"audience"),offset_days:offset,priority:text(fd,"priority"),
      sort_order:Number(text(fd,"sort_order"))||0,created_by:userId,
    });
    if(error)return data<ActionResult>({error:String(error.message??"").includes("after_sales_step_templates_step_key_key")?"Dieses Kürzel ist bereits vergeben.":"Der Baustein konnte nicht angelegt werden."},{status:400,headers:responseHeaders()});
    return redirect("/after-sales#folge",{headers:responseHeaders()});
  }

  return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

export default function AfterSales(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<typeof action>();
  const now=Date.now();

  return <main className="editor-shell">
    <header className="editor-header">
      <div>
        <Link className="back-link" to="/crm">← CRM</Link>
        <p className="eyebrow">Nach dem Verkauf</p>
        <h1 className="editor-title">Nachbetreuung</h1>
        <p className="editor-meta">Nach jeder Übergabe entstehen Wiedervorlagen. Das System schreibt keine E-Mails.</p>
      </div>
      <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div>
    </header>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <div className="metric-grid">
      <article className="metric"><span>Offen</span><strong>{d.open}</strong><small>{d.open===1?"Wiedervorlage aus der Nachbetreuung":"Wiedervorlagen aus der Nachbetreuung"}</small></article>
      <article className="metric"><span>Überfällig</span><strong>{d.overdue}</strong><small>{d.overdue===1?"Termin ist verstrichen":"Termine sind verstrichen"}</small></article>
      <article className="metric"><span>Erledigt</span><strong>{d.done}</strong><small>{d.done===1?"abgeschlossene Nachbetreuung":"abgeschlossene Nachbetreuungen"}</small></article>
    </div>

    <section className="data-card" id="wiedervorlagen">
      <div className="card-head"><div><p className="eyebrow">Aus Übergaben entstanden</p><h2>Wiedervorlagen</h2></div><Link className="subtle-link" to="/crm/tasks">Alle Aufgaben →</Link></div>
      {(d.tasks as any[]).length===0
        ?<p className="empty-state">Es ist noch keine Übergabe dokumentiert, aus der eine Nachbetreuung entstehen konnte.</p>
        :<div className="data-list">{(d.tasks as any[]).map((task:any)=>{
          const contact=one(task.contacts);const closing=one(task.sale_closings);const property=one(closing?.properties);
          const overdue=!["DONE","CANCELLED"].includes(task.status)&&new Date(task.due_at).getTime()<now;
          return <div className="data-row" key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <small>{contact?`${contact.last_name}, ${contact.first_name}`:"ohne Ansprechpartner"} · {property?.property_number??"—"}</small>
              <small>{closing?.closing_number}{property?.internal_title?` · ${property.internal_title}`:""}</small>
            </div>
            <div className="row-meta">
              <span className={overdue?"status-pill status-lost":"status-pill"}>{formatMoment(task.due_at)}{overdue?" · überfällig":""}</span>
              <small>{TASK_PRIORITY[task.priority]??task.priority}</small>
            </div>
            <div className="row-meta">
              <span>{TASK_STATUS[task.status]??task.status}</span>
              <small>{task.task_number}</small>
            </div>
            {closing?<Link className="subtle-link" to={`/closings/${closing.id}`}>Abschluss →</Link>:null}
          </div>;
        })}</div>}
    </section>

    <section className="data-card" id="folge">
      <div className="card-head"><div><p className="eyebrow">Vorlage</p><h2>Die Folge</h2></div></div>
      <p className="subtle">Aus jedem aktiven Baustein entsteht mit der Übergabe genau eine Wiedervorlage — einmalig, auch wenn das Protokoll später noch geändert wird. Änderungen hier gelten für künftige Übergaben.</p>
      <div className="data-list">{(d.templates as any[]).map((template:any)=>
        <div className="data-row" key={template.id}>
          {d.canManage
            ?<Form method="post" className="form-grid" style={{width:"100%"}}>
              <input type="hidden" name="_intent" value="template_save"/>
              <input type="hidden" name="template_id" value={template.id}/>
              <input type="hidden" name="version" value={template.version}/>
              <label className="form-field"><span>Titel</span><input name="title" defaultValue={template.title}/></label>
              <label className="form-field"><span>Adressat</span>
                <select name="audience" defaultValue={template.audience}>{Object.entries(AUDIENCE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label className="form-field"><span>Abstand in Tagen</span><input name="offset_days" type="number" min={0} max={3650} defaultValue={template.offset_days}/></label>
              <label className="form-field"><span>Priorität</span>
                <select name="priority" defaultValue={template.priority}>{Object.entries(TASK_PRIORITY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label className="form-field full-width"><span>Beschreibung</span><textarea name="description" rows={2} defaultValue={template.description??""}/></label>
              <label className="form-field checkbox-row"><input type="checkbox" name="active" defaultChecked={template.active}/><span>Aktiv</span></label>
              <div className="form-field inline-actions"><button className="secondary-button" type="submit">Baustein speichern</button></div>
              <p className="form-field full-width subtle">Fester Baustein: {STEP_KEY[template.step_key]??template.step_key} · {offsetLabel(template.offset_days)}</p>
            </Form>
            :<>
              <div><strong>{template.title}</strong><small>{template.description??"ohne Beschreibung"}</small></div>
              <div className="row-meta"><span>{AUDIENCE[template.audience]??template.audience}</span><small>{offsetLabel(template.offset_days)}</small></div>
              <div className="row-meta"><span className={template.active?"status-pill status-sold":"status-pill status-archived"}>{template.active?"Aktiv":"Inaktiv"}</span><small>{TASK_PRIORITY[template.priority]??template.priority}</small></div>
            </>}
        </div>)}</div>

      {d.canManage?<Form method="post" className="form-grid" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="template_add"/>
        <label className="form-field"><span>Kürzel *</span><input name="step_key" placeholder="z. B. ANNIVERSARY_TWO"/></label>
        <label className="form-field"><span>Titel *</span><input name="title"/></label>
        <label className="form-field"><span>Adressat</span>
          <select name="audience" defaultValue="BUYER">{Object.entries(AUDIENCE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="form-field"><span>Abstand in Tagen</span><input name="offset_days" type="number" min={0} max={3650} defaultValue={30}/></label>
        <label className="form-field"><span>Priorität</span>
          <select name="priority" defaultValue="NORMAL">{Object.entries(TASK_PRIORITY).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="form-field"><span>Reihenfolge</span><input name="sort_order" type="number" defaultValue={40}/></label>
        <label className="form-field full-width"><span>Beschreibung</span><textarea name="description" rows={2}/></label>
        <div className="form-field full-width inline-actions"><button className="primary-button" type="submit">Baustein hinzufügen</button></div>
      </Form>:null}
    </section>
  </main>;
}
