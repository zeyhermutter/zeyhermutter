import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/training";
import "~/programm-liste.css";
import { Aufklapper } from "~/components/aufklapper";
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

/** Ein Balken: erreichte Stunden im Verhaeltnis zum Zielwert. Die Farbe sagt
 * den Stand (erreicht gruen, laeuft blau, knapp bernstein, sehr knapp rot);
 * die Zahl daneben sagt ihn in Worten. */
function Fortschritt({erreicht,ziel,ton}:{erreicht:number;ziel:number;ton:"erreicht"|"laeuft"|"knapp"|"knapp-rot"}){
  const anteil=ziel>0?Math.min(100,Math.round(erreicht/ziel*100)):0;
  return <span className={`fortschritt ton-${ton}`} role="img" aria-label={`${anteil} Prozent des Zielwerts erreicht`}>
    <span className="fortschritt-balken"><span style={{width:`${anteil}%`}}/></span>
    <span className="fortschritt-zahl">{anteil} %</span>
  </span>;
}

export default function Training(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<typeof action>();
  const own=d.own as any;
  const warning=trainingWarning(own);
  const settings=d.settings as any;
  const records=(d.records as any[]);

  return <main className="editor-shell programm-seite">
    <header className="editor-header">
      <div>
        <Link className="back-link" to="/crm">← CRM</Link>
        <p className="eyebrow">Verwaltung</p>
        <h1 className="editor-title">Weiterbildung</h1>
        <p className="editor-meta">Erfasste Maßnahmen und die Summe im laufenden Zeitraum.</p>
      </div>
      <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div>
    </header>

    {d.canWrite?<Aufklapper id="erfassen" knopf="+ Maßnahme erfassen"><section className="data-card">
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
    </section></Aufklapper>:null}

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}
    {warning?<p className={warning.level==="error"?"form-error":"form-warning"}>{warning.text}</p>:null}

    {own?<div className="metric-grid">
      <article className="metric"><span>Erreicht</span><strong>{hoursLabel(own.achieved_hours)}</strong><small>von {hoursLabel(own.required_hours)} im Zeitraum</small></article>
      <article className="metric"><span>Offen</span><strong>{hoursLabel(own.remaining_hours)}</strong><small>{Number(own.remaining_hours)>0?"noch zu belegen":"Zielwert erreicht"}</small></article>
      <article className="metric"><span>Zeitraum</span><strong>{formatDay(own.period_from)}</strong><small>bis {formatDay(own.period_to)} · {plural(Number(own.days_left)||0,"Tag","Tage")} übrig</small></article>
      <article className="metric"><span>Maßnahmen</span><strong>{own.records}</strong><small>im laufenden Zeitraum erfasst</small></article>
      <Fortschritt erreicht={Number(own.achieved_hours)||0} ziel={Number(own.required_hours)||0} ton={Number(own.remaining_hours)===0?"erreicht":warning?.level==="error"?"knapp-rot":warning?"knapp":"laeuft"}/>
    </div>:<p className="empty-state">Für dieses Konto ist kein aktives Benutzerprofil hinterlegt.</p>}

    {d.canManage?<section className="data-card" id="uebersicht">
      <div className="card-head"><div><p className="eyebrow">Alle Benutzer</p><h2>Stand im laufenden Zeitraum</h2></div><Link className="subtle-link" to="/crm/users">Benutzer & Rollen →</Link></div>
      <div className="programm-tabelle-rahmen"><table className="programm-tabelle">
        <thead><tr><th>Benutzer</th><th>Fortschritt</th><th className="rechts">Erreicht</th><th className="rechts">Offen</th><th className="rechts">Maßnahmen</th><th>Zuletzt</th><th>Stand</th></tr></thead>
        <tbody>{(d.summary as any[]).map((row:any)=>{
          const rowWarning=trainingWarning(row);
          const ton=Number(row.remaining_hours)===0?"erreicht":rowWarning?.level==="error"?"knapp-rot":rowWarning?"knapp":"laeuft";
          return <tr key={row.user_id}>
            <td><strong>{row.display_name}</strong></td>
            <td><Fortschritt erreicht={Number(row.achieved_hours)||0} ziel={Number(row.required_hours)||0} ton={ton}/></td>
            <td className="zahl rechts">{hoursLabel(row.achieved_hours)}</td>
            <td className="zahl rechts">{hoursLabel(row.remaining_hours)}</td>
            <td className="zahl rechts">{Number(row.records)||0}</td>
            <td className="zahl">{row.last_completed_on?formatDay(row.last_completed_on):<span className="leise">noch keine</span>}</td>
            <td><span className={`status-pill ${ton==="erreicht"?"status-sold":ton==="knapp-rot"?"status-lost":ton==="knapp"?"status-preparation":"status-marketing"}`}>{ton==="erreicht"?"Zielwert erreicht":ton==="laeuft"?"Im Zeitraum":"Wird knapp"}</span><div className="leise">bis {formatDay(row.period_to)}</div></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>:null}

    <section className="data-card" id="nachweise">
      <div className="card-head"><div><p className="eyebrow">Belegte Maßnahmen</p><h2>{d.canManage?"Nachweise":"Meine Nachweise"}</h2></div><span className="status-pill">{records.length}</span></div>
      {records.length===0
        ?<p className="empty-state">Es ist noch kein Nachweis erfasst.</p>
        :<div className="programm-tabelle-rahmen"><table className="programm-tabelle">
          <thead><tr><th>Abgeschlossen</th><th>Maßnahme</th>{d.canManage?<th>Benutzer</th>:null}<th>Anbieter</th><th>Form</th><th className="rechts">Stunden</th><th>Nachweis</th>{d.canManage?<th></th>:null}</tr></thead>
          <tbody>{records.map((row:any)=>{
            const person=Array.isArray(row.profiles)?row.profiles[0]:row.profiles;
            return <tr key={row.id}>
              <td className="zahl">{formatDay(row.completed_on)}</td>
              <td><strong>{row.title}</strong>{row.topic?<div className="leise">{row.topic}</div>:null}</td>
              {d.canManage?<td>{person?.display_name??"—"}</td>:null}
              <td>{row.provider??<span className="leise">offen</span>}</td>
              <td>{row.format?TRAINING_FORMAT[row.format]??row.format:<span className="leise">—</span>}</td>
              <td className="zahl rechts">{hoursLabel(row.hours)}</td>
              <td>{row.document_id?"hinterlegt":<span className="leise">ohne Dokument</span>}</td>
              {d.canManage?<td className="rechts"><Form method="post">
                <input type="hidden" name="_intent" value="record_archive"/>
                <input type="hidden" name="record_id" value={row.id}/>
                <input type="hidden" name="version" value={row.version}/>
                <button className="secondary-button" type="submit">Archivieren</button>
              </Form></td>:null}
            </tr>;
          })}</tbody>
        </table></div>}
    </section>


    {d.canManage&&settings?<Aufklapper id="zielwert" knopf="Zielwert und Zeitraum ändern"><section className="data-card">
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
    </section></Aufklapper>:null}
  </main>;
}
