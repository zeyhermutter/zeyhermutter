import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/training";
import { requirePermission } from "~/lib/auth.server";
import { tag } from "~/lib/format";

type ActionResult={error?:string};

export const TRAINING_FORMAT:Record<string,string>={IN_PERSON:"Präsenz",ONLINE_LIVE:"Online, live",SELF_STUDY:"Selbststudium",BLENDED:"Kombiniert",OTHER:"Sonstiges"};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
export const formatDay = tag;
export function hoursLabel(value:any){const n=Number(value);if(!Number.isFinite(n))return"—";return `${n.toLocaleString("de-DE",{maximumFractionDigits:2})} ${n===1?"Stunde":"Stunden"}`;}
export function plural(count:number,one:string,many:string){return `${count} ${count===1?one:many}`;}

// Warnt, sobald der Zeitraum zur Neige geht und noch Stunden offen sind.
// Zwei Monate sind knapp, ein halbes Jahr ist ein Hinweis.
export function trainingWarning(row:any){
  const remaining=Number(row?.remaining_hours??0);
  const daysLeft=Number(row?.days_left??0);
  if(!(remaining>0))return null;
  if(daysLeft<0)return {level:"error" as const,text:`Der Zeitraum ist abgelaufen und es fehlen ${hoursLabel(remaining)}.`};
  if(daysLeft<=60)return {level:"error" as const,text:`Noch ${plural(daysLeft,"Tag","Tage")} im Zeitraum, offen sind ${hoursLabel(remaining)}.`};
  if(daysLeft<=180)return {level:"warn" as const,text:`Der Zeitraum endet in ${plural(daysLeft,"Tag","Tagen")}, offen sind ${hoursLabel(remaining)}.`};
  return null;
}

export function trainingErrorMessage(message:string){
  if(message.includes("TRAINING_COMPLETED_IN_FUTURE"))return"Eine Weiterbildung kann nicht in der Zukunft abgeschlossen worden sein.";
  if(message.includes("TRAINING_COMPLETED_TOO_LONG_AGO"))return"Das Abschlussdatum liegt unrealistisch weit zurück.";
  if(message.includes("TRAINING_FOREIGN_USER_REQUIRES_MANAGE"))return"Nachweise anderer Benutzer pflegt nur die Geschäftsführung.";
  if(message.includes("TRAINING_DOCUMENT_WRONG_CATEGORY"))return"Als Nachweis kommt nur ein Dokument der Kategorie „Weiterbildungsnachweis\" in Frage.";
  if(message.includes("user_training_records_hours_check"))return"Der Umfang muss zwischen 0 und 500 Stunden liegen.";
  if(message.includes("user_training_records_title_check"))return"Bitte die Maßnahme benennen.";
  if(message.includes("row-level security"))return"Für diesen Nachweis fehlt die Berechtigung.";
  return"Der Nachweis konnte nicht gespeichert werden.";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile,userId}=await requirePermission(request,context.cloudflare.env,"training.read");

  const [summaryRes,recordsRes,settingsRes,profilesRes,certificatesRes,canWriteRes,canManageRes]=await Promise.all([
    supabase.rpc("user_training_summary"),
    supabase.from("user_training_records")
      .select("id,user_id,title,provider,topic,completed_on,hours,format,notes,document_id,archived_at,version,profiles!user_training_records_user_id_fkey(user_id,display_name)")
      .is("archived_at",null).order("completed_on",{ascending:false}).limit(300),
    supabase.from("training_settings").select("*").maybeSingle(),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.from("documents").select("id,title").eq("category","TRAINING_CERTIFICATE").is("archived_at",null).order("title").limit(200),
    supabase.rpc("current_user_has_permission",{p_permission:"training.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"training.manage"}),
  ]);
  // Lesefehler nicht verschlucken: eine leere Liste sähe aus wie "keine Weiterbildung erfasst".
  if(summaryRes.error||recordsRes.error)throw new Response("Die Weiterbildungsnachweise konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  const summary=(summaryRes.data??[]) as any[];
  return data({profile,userId,
    summary,
    own:summary.find((row:any)=>row.user_id===userId)??null,
    records:recordsRes.data??[],
    settings:settingsRes.data??null,
    profiles:profilesRes.data??[],
    certificates:certificatesRes.data??[],
    canWrite:canWriteRes.data===true,canManage:canManageRes.data===true},{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"training.read");
  const fd=await request.formData();
  const intent=text(fd,"_intent");

  if(intent==="record_add"){
    await requirePermission(request,context.cloudflare.env,"training.write");
    const completed=dateOrNull(fd,"completed_on");
    const hours=Number(text(fd,"hours").replace(",","."));
    if(!text(fd,"title"))return data<ActionResult>({error:"Bitte die Maßnahme benennen."},{status:400,headers:responseHeaders()});
    if(!completed)return data<ActionResult>({error:"Bitte ein gültiges Abschlussdatum angeben."},{status:400,headers:responseHeaders()});
    if(!Number.isFinite(hours)||hours<=0)return data<ActionResult>({error:"Bitte den Umfang in Stunden angeben."},{status:400,headers:responseHeaders()});
    const {error}=await supabase.from("user_training_records").insert({
      user_id:text(fd,"user_id")||userId,
      title:text(fd,"title"),
      provider:text(fd,"provider")||null,
      topic:text(fd,"topic")||null,
      completed_on:completed,
      hours,
      format:text(fd,"format")||null,
      document_id:text(fd,"document_id")||null,
      notes:text(fd,"notes")||null,
      created_by:userId,
    });
    if(error)return data<ActionResult>({error:trainingErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    return redirect("/crm/training#nachweise",{headers:responseHeaders()});
  }

  if(intent==="record_archive"){
    await requirePermission(request,context.cloudflare.env,"training.manage");
    const {data:updated,error}=await supabase.from("user_training_records")
      .update({archived_at:new Date().toISOString()})
      .eq("id",text(fd,"record_id")).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:trainingErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    if(!updated)return data<ActionResult>({error:"Der Nachweis wurde inzwischen geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});
    return redirect("/crm/training#nachweise",{headers:responseHeaders()});
  }

  if(intent==="settings_save"){
    await requirePermission(request,context.cloudflare.env,"training.manage");
    const required=Number(text(fd,"required_hours").replace(",","."));
    const years=Number(text(fd,"period_years"));
    const start=dateOrNull(fd,"period_start");
    if(!Number.isFinite(required)||required<0)return data<ActionResult>({error:"Der Zielwert muss eine Zahl sein."},{status:400,headers:responseHeaders()});
    if(!Number.isInteger(years)||years<1||years>10)return data<ActionResult>({error:"Der Zeitraum muss zwischen einem und zehn Jahren liegen."},{status:400,headers:responseHeaders()});
    if(!start)return data<ActionResult>({error:"Bitte ein gültiges Startdatum angeben."},{status:400,headers:responseHeaders()});
    const {error}=await supabase.from("training_settings")
      .update({required_hours:required,period_years:years,period_start:start,note:text(fd,"note")||null})
      .eq("id",true).eq("version",Number(text(fd,"version")));
    if(error)return data<ActionResult>({error:"Der Zielwert konnte nicht gespeichert werden."},{status:400,headers:responseHeaders()});
    return redirect("/crm/training#zielwert",{headers:responseHeaders()});
  }

  return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

export default function Training(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<typeof action>();
  const own=d.own as any;
  const warning=trainingWarning(own);
  const settings=d.settings as any;
  const records=(d.records as any[]);

  return <main className="editor-shell">
    <header className="editor-header">
      <div>
        <Link className="back-link" to="/crm">← CRM</Link>
        <p className="eyebrow">Verwaltung</p>
        <h1 className="editor-title">Weiterbildung</h1>
        <p className="editor-meta">Erfasste Maßnahmen und die Summe im laufenden Zeitraum.</p>
      </div>
      <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div>
    </header>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}
    {warning?<p className={warning.level==="error"?"form-error":"form-warning"}>{warning.text}</p>:null}

    {own?<div className="metric-grid">
      <article className="metric"><span>Erreicht</span><strong>{hoursLabel(own.achieved_hours)}</strong><small>von {hoursLabel(own.required_hours)} im Zeitraum</small></article>
      <article className="metric"><span>Offen</span><strong>{hoursLabel(own.remaining_hours)}</strong><small>{Number(own.remaining_hours)>0?"noch zu belegen":"Zielwert erreicht"}</small></article>
      <article className="metric"><span>Zeitraum</span><strong>{formatDay(own.period_from)}</strong><small>bis {formatDay(own.period_to)} · {plural(Number(own.days_left)||0,"Tag","Tage")} übrig</small></article>
      <article className="metric"><span>Maßnahmen</span><strong>{own.records}</strong><small>im laufenden Zeitraum erfasst</small></article>
    </div>:<p className="empty-state">Für dieses Konto ist kein aktives Benutzerprofil hinterlegt.</p>}

    {d.canManage?<section className="data-card" id="uebersicht">
      <div className="card-head"><div><p className="eyebrow">Alle Benutzer</p><h2>Stand im laufenden Zeitraum</h2></div><Link className="subtle-link" to="/crm/users">Benutzer & Rollen →</Link></div>
      <div className="data-list">{(d.summary as any[]).map((row:any)=>{
        const rowWarning=trainingWarning(row);
        return <div className="data-row" key={row.user_id}>
          <div><strong>{row.display_name}</strong><small>{plural(Number(row.records)||0,"Maßnahme","Maßnahmen")}{row.last_completed_on?` · zuletzt ${formatDay(row.last_completed_on)}`:" · noch keine erfasst"}</small></div>
          <div className="row-meta"><span>{hoursLabel(row.achieved_hours)} von {hoursLabel(row.required_hours)}</span><small>offen {hoursLabel(row.remaining_hours)}</small></div>
          <div className="row-meta">
            <span className={`status-pill ${Number(row.remaining_hours)===0?"status-sold":rowWarning?.level==="error"?"status-lost":rowWarning?"status-marketing":"status-draft"}`}>
              {Number(row.remaining_hours)===0?"Zielwert erreicht":rowWarning?"Wird knapp":"Im Zeitraum"}
            </span>
            <small>bis {formatDay(row.period_to)}</small>
          </div>
        </div>;
      })}</div>
    </section>:null}

    <section className="data-card" id="nachweise">
      <div className="card-head"><div><p className="eyebrow">Belegte Maßnahmen</p><h2>{d.canManage?"Nachweise":"Meine Nachweise"}</h2></div><span className="status-pill">{records.length}</span></div>
      {records.length===0
        ?<p className="empty-state">Es ist noch kein Nachweis erfasst.</p>
        :<div className="data-list">{records.map((row:any)=>{
          const person=Array.isArray(row.profiles)?row.profiles[0]:row.profiles;
          return <div className="data-row" key={row.id}>
            <div>
              <strong>{row.title}</strong>
              <small>{row.provider??"Anbieter offen"}{row.topic?` · ${row.topic}`:""}{row.format?` · ${TRAINING_FORMAT[row.format]??row.format}`:""}</small>
              {d.canManage?<small>{person?.display_name??"—"}</small>:null}
            </div>
            <div className="row-meta"><span>{hoursLabel(row.hours)}</span><small>{formatDay(row.completed_on)}</small></div>
            <div className="row-meta"><span>{row.document_id?"Nachweis hinterlegt":"ohne Nachweisdokument"}</span><small>{row.notes??""}</small></div>
            {d.canManage?<Form method="post">
              <input type="hidden" name="_intent" value="record_archive"/>
              <input type="hidden" name="record_id" value={row.id}/>
              <input type="hidden" name="version" value={row.version}/>
              <button className="text-button" type="submit">Archivieren</button>
            </Form>:null}
          </div>;
        })}</div>}
    </section>

    {d.canWrite?<section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Neu</p><h2>Maßnahme erfassen</h2></div></div>
      <Form method="post" className="form-grid">
        <input type="hidden" name="_intent" value="record_add"/>
        {d.canManage
          ?<label className="form-field"><span>Benutzer</span>
            <select name="user_id" defaultValue={d.userId}>
              {(d.profiles as any[]).map((p:any)=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}
            </select>
          </label>
          :<input type="hidden" name="user_id" value={d.userId}/>}
        <label className="form-field"><span>Maßnahme *</span><input name="title" placeholder="z. B. Maklerrecht aktuell"/></label>
        <label className="form-field"><span>Anbieter</span><input name="provider"/></label>
        <label className="form-field"><span>Thema</span><input name="topic" placeholder="z. B. Recht, Bewertung, Verbraucherschutz"/></label>
        <label className="form-field"><span>Abgeschlossen am *</span><input type="date" name="completed_on"/></label>
        <label className="form-field"><span>Umfang in Stunden *</span><input name="hours" inputMode="decimal" placeholder="z. B. 8"/></label>
        <label className="form-field"><span>Form</span>
          <select name="format" defaultValue="">
            <option value="">—</option>
            {Object.entries(TRAINING_FORMAT).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {(d.certificates as any[]).length>0
          ?<label className="form-field"><span>Nachweisdokument</span>
            <select name="document_id" defaultValue="">
              <option value="">— keines</option>
              {(d.certificates as any[]).map((doc:any)=><option key={doc.id} value={doc.id}>{doc.title}</option>)}
            </select>
          </label>
          :null}
        <label className="form-field full-width"><span>Notiz</span><textarea name="notes" rows={2}/></label>
        <div className="form-field full-width inline-actions"><button className="primary-button" type="submit">Nachweis erfassen</button></div>
        {(d.certificates as any[]).length===0
          ?<p className="form-field full-width subtle">Ein Nachweisdokument lässt sich hier noch nicht hochladen; die Dokumentenakte kennt bisher nur Objekt- und Kontaktdokumente. Die Kategorie „Weiterbildungsnachweis" ist angelegt, der Upload steht auf der Restpunktliste.</p>
          :null}
      </Form>
    </section>:null}

    {d.canManage&&settings?<section className="data-card" id="zielwert">
      <div className="card-head"><div><p className="eyebrow">Vorgabe</p><h2>Zielwert und Zeitraum</h2></div></div>
      <Form method="post" className="form-grid">
        <input type="hidden" name="_intent" value="settings_save"/>
        <input type="hidden" name="version" value={settings.version}/>
        <label className="form-field"><span>Stunden je Zeitraum</span><input name="required_hours" inputMode="decimal" defaultValue={settings.required_hours}/></label>
        <label className="form-field"><span>Zeitraum in Jahren</span><input name="period_years" type="number" min={1} max={10} defaultValue={settings.period_years}/></label>
        <label className="form-field"><span>Zeitraum beginnt am</span><input type="date" name="period_start" defaultValue={settings.period_start}/></label>
        <label className="form-field full-width"><span>Notiz</span><textarea name="note" rows={2} defaultValue={settings.note??""}/></label>
        <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit">Vorgabe speichern</button></div>
        <p className="form-field full-width subtle">Der Wert ist eine betriebliche Vorgabe. Ob und in welchem Umfang eine Weiterbildungspflicht besteht, ist anwaltlich zu klären; die Software trifft dazu keine Aussage.</p>
      </Form>
    </section>:null}
  </main>;
}
