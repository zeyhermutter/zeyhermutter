import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/acquisition";
import { Aufklapper } from "~/components/aufklapper";
import { LeererArbeitsplatz } from "~/components/leerer-arbeitsplatz";
import { requirePermission } from "~/lib/auth.server";
import { istEinstieg } from "~/lib/einstieg";
import { euroRund as money, tag as formatDate } from "~/lib/format";
import { KAMPAGNENSTATUS as CAMPAIGN_STATUS } from "~/lib/labels";
import "~/programm-liste.css";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
type ActionResult={error?:string};

const AREA_TYPE:Record<string,string>={CITY:"Stadt",DISTRICT:"Stadtteil",QUARTER:"Quartier",REGION:"Region",OTHER:"Sonstiges"};

const CAMPAIGN_CLASS:Record<string,string>={PLANNED:"status-draft",RUNNING:"status-sold",COMPLETED:"status-archived",CANCELLED:"status-lost"};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function intOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number.parseInt(raw,10);return Number.isFinite(n)?n:NaN;}


function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("AREA_PARENT_CYCLE")||message.includes("AREA_PARENT_SELF"))return"Ein Gebiet kann nicht in sich selbst liegen.";
  if(message.includes("AREA_TOO_DEEP"))return"Die Gebietsstruktur ist zu tief verschachtelt.";
  if(message.includes("AREA_PARENT_NOT_FOUND"))return"Das übergeordnete Gebiet wurde nicht gefunden.";
  if(message.includes("acquisition_areas_unique_root_idx")||message.includes("acquisition_areas_unique_child_idx"))return"Ein Gebiet mit diesem Namen existiert an dieser Stelle bereits.";
  if(message.includes("acquisition_areas_name_check"))return"Für ein Gebiet ist ein Name erforderlich.";
  if(message.includes("CAMPAIGN_AREA_NOT_FOUND"))return"Das gewählte Gebiet wurde nicht gefunden oder ist archiviert.";
  if(message.includes("CAMPAIGN_SOURCE_NOT_FOUND"))return"Der gewählte Kanal wurde nicht gefunden.";
  if(message.includes("CAMPAIGN_END_REQUIRED"))return"Eine abgeschlossene Kampagne braucht ein Enddatum.";
  if(message.includes("CAMPAIGN_START_TOO_FAR"))return"Das Startdatum liegt unrealistisch weit in der Zukunft.";
  if(message.includes("acquisition_campaigns_running_dated_check"))return"Sobald eine Kampagne läuft, gehört ein Startdatum dazu.";
  if(message.includes("acquisition_campaigns_period_check"))return"Das Ende kann nicht vor dem Start liegen.";
  if(message.includes("acquisition_campaigns_name_check"))return"Für eine Kampagne ist ein Name erforderlich.";
  return "Die Angaben konnten nicht gespeichert werden.";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"acquisition.read");
  // Ohne Parameter: gleich die zuletzt angelegte Kampagne als Akte -- Liste
  // links, Akte rechts (13.10.2026). Kampagnen und Gebiete als Tabellen gibt
  // es mit ?ansicht=tabelle. Ohne Kampagne steht der leere Arbeitsplatz da.
  const einstieg=istEinstieg(request);
  if(einstieg){
    const {data:erste}=await supabase.from("acquisition_campaigns").select("id").is("archived_at",null).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(erste?.id) throw redirect(`/acquisition/${erste.id}`,{headers:responseHeaders()});
  }
  const url=new URL(request.url);
  const from=url.searchParams.get("from")||new Date(Date.now()-365*86400000).toISOString().slice(0,10);
  const to=url.searchParams.get("to")||new Date().toISOString().slice(0,10);

  const [areasRes,campaignsRes,sourcesRes,performanceRes,canWriteRes,canCommissionRes]=await Promise.all([
    supabase.from("acquisition_areas").select("*").is("archived_at",null).order("name"),
    supabase.from("acquisition_campaigns").select("*,acquisition_areas(id,name),lead_sources(id,key,label)").is("archived_at",null).order("created_at",{ascending:false}),
    supabase.from("lead_sources").select("id,key,label,sort_order").eq("active",true).order("sort_order"),
    supabase.rpc("acquisition_campaign_performance",{p_from:from,p_to:to}),
    supabase.rpc("current_user_has_permission",{p_permission:"acquisition.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"commission.read"}),
  ]);
  // Lesefehler nicht verschlucken — eine leere Liste darf nicht wie „keine Kampagnen" aussehen.
  const readError=[areasRes,campaignsRes,performanceRes].find((r)=>r.error)?.error;
  if(readError)throw new Response("Die Akquisedaten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  const areas=(areasRes.data??[]) as any[];
  const byParent=new Map<string|null,any[]>();
  for(const area of areas){const key=area.parent_area_id??null;byParent.set(key,[...(byParent.get(key)??[]),area]);}
  const ordered:any[]=[];
  const walk=(parent:string|null,depth:number)=>{
    for(const area of byParent.get(parent)??[]){ordered.push({...area,depth});walk(area.id,depth+1);}
  };
  walk(null,0);
  const pathOf=(id:string):string=>{
    const parts:string[]=[];let cursor=areas.find((a)=>a.id===id);let guard=0;
    while(cursor&&guard<10){parts.unshift(cursor.name);cursor=areas.find((a)=>a.id===cursor.parent_area_id);guard+=1;}
    return parts.join(" › ");
  };

  return data({
    leer:einstieg,profile,from,to,
    areas:ordered.map((a)=>({...a,path:pathOf(a.id)})),
    campaigns:campaignsRes.data??[],
    sources:sourcesRes.data??[],
    performance:(performanceRes.data??[]) as any[],
    canWrite:canWriteRes.data===true,
    canReadCommission:canCommissionRes.data===true,
  },{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"acquisition.write");
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});

  if(intent==="area_add"){
    const name=text(fd,"name");
    if(!name)return invalid("Bitte einen Gebietsnamen angeben.");
    const households=intOrNull(fd,"household_estimate");
    if(typeof households==="number"&&!Number.isFinite(households))return invalid("Die geschätzte Haushaltszahl ist keine gültige Zahl.");
    const {error}=await supabase.from("acquisition_areas").insert({
      name,area_type:text(fd,"area_type")||"DISTRICT",
      parent_area_id:text(fd,"parent_area_id")||null,
      postal_code:text(fd,"postal_code")||null,
      household_estimate:households,
      notes:text(fd,"notes")||null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect("/acquisition?ansicht=tabelle#gebiete",{headers:responseHeaders()});
  }

  if(intent==="campaign_add"){
    const name=text(fd,"name");
    if(!name)return invalid("Bitte einen Kampagnennamen angeben.");
    const areaId=text(fd,"area_id");
    if(!areaId)return invalid("Bitte das Gebiet wählen, in dem die Kampagne läuft.");
    const sourceId=text(fd,"source_id");
    if(!sourceId)return invalid("Bitte den Kanal wählen.");
    const households=intOrNull(fd,"household_count");
    if(typeof households==="number"&&!Number.isFinite(households))return invalid("Die Zahl der angeschriebenen Haushalte ist keine gültige Zahl.");
    const planned=numOrNull(fd,"planned_cost");
    if(typeof planned==="number"&&!Number.isFinite(planned))return invalid("Die geplanten Kosten sind keine gültige Zahl.");
    const status=text(fd,"status")||"PLANNED";
    const startsOn=dateOrNull(fd,"starts_on");
    // Eine laufende Kampagne ohne Startdatum wird von der Datenbank abgelehnt.
    // Der Hinweis kommt hier, damit er am Formular steht statt als Fehlercode.
    if(status!=="PLANNED"&&!startsOn)return invalid("Sobald eine Kampagne läuft, gehört ein Startdatum dazu.");
    const {data:created,error}=await supabase.from("acquisition_campaigns").insert({
      name,area_id:areaId,source_id:sourceId,status,
      target_group:text(fd,"target_group")||null,
      topic:text(fd,"topic")||null,
      call_to_action:text(fd,"call_to_action")||null,
      household_count:households,
      starts_on:startsOn,ends_on:dateOrNull(fd,"ends_on"),
      planned_cost:planned,
      notes:text(fd,"notes")||null,
      primary_responsible_user:userId,
      created_by:userId,updated_by:userId,
    }).select("id").maybeSingle();
    if(error)return fail(error);
    return redirect(`/acquisition/${created?.id}`,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

/** Die Formulare zum Anlegen -- auf der Tabelle zum Aufklappen, im leeren
 * Arbeitsplatz offen. */
function KampagneAnlegen({d}:{d:any}){
  const disabled=!d.canWrite;
  return <Form method="post" className="form-grid" >
        <input type="hidden" name="_intent" value="campaign_add"/>
        <label className="form-field"><span>Name *</span><input name="name" disabled={disabled} placeholder="Trudering Herbst 2026"/></label>
        <label className="form-field"><span>Gebiet *</span><select name="area_id" defaultValue="" disabled={disabled}><option value="">—</option>{d.areas.map((a:any)=><option key={a.id} value={a.id}>{a.path}</option>)}</select></label>
        <label className="form-field"><span>Kanal *</span><select name="source_id" defaultValue="" disabled={disabled}><option value="">—</option>{d.sources.map((s:any)=><option key={s.id} value={s.id}>{s.label}</option>)}</select><small className="subtle">Die bestehenden Leadquellen bleiben die Kanalebene.</small></label>
        <label className="form-field"><span>Status</span><select name="status" defaultValue="PLANNED" disabled={disabled}>{Object.entries(CAMPAIGN_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field"><span>Zielgruppe</span><input name="target_group" disabled={disabled} placeholder="Eigentümer 55+"/></label>
        <label className="form-field"><span>Thema</span><input name="topic" disabled={disabled} placeholder="Renovieren oder verkaufen"/></label>
        <label className="form-field"><span>Handlungsaufforderung</span><input name="call_to_action" disabled={disabled} placeholder="Verkaufsstrategie-Check"/></label>
        <label className="form-field"><span>Angeschriebene Haushalte</span><input name="household_count" disabled={disabled}/></label>
        <label className="form-field"><span>Beginn</span><input type="date" name="starts_on" disabled={disabled}/></label>
        <label className="form-field"><span>Ende</span><input type="date" name="ends_on" disabled={disabled}/></label>
        <label className="form-field"><span>Geplante Kosten €</span><input name="planned_cost" disabled={disabled}/></label>
        <label className="form-field full-width"><span>Notiz</span><input name="notes" disabled={disabled}/></label>
        <div className="form-field full-width inline-actions"><button className="primary-button" type="submit" disabled={disabled}>Kampagne anlegen</button></div>
      </Form>;
}

function GebietAnlegen({d}:{d:any}){
  const disabled=!d.canWrite;
  return <Form method="post" className="form-grid" >
        <input type="hidden" name="_intent" value="area_add"/>
        <label className="form-field"><span>Name *</span><input name="name" disabled={disabled} placeholder="Waldtrudering"/></label>
        <label className="form-field"><span>Übergeordnet</span><select name="parent_area_id" defaultValue="" disabled={disabled}><option value="">— oberste Ebene</option>{d.areas.map((a:any)=><option key={a.id} value={a.id}>{a.path}</option>)}</select></label>
        <label className="form-field"><span>Art</span><select name="area_type" defaultValue="DISTRICT" disabled={disabled}>{Object.entries(AREA_TYPE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field"><span>PLZ</span><input name="postal_code" disabled={disabled}/></label>
        <label className="form-field"><span>Haushalte (Schätzung)</span><input name="household_estimate" disabled={disabled}/></label>
        <label className="form-field full-width"><span>Notiz</span><input name="notes" disabled={disabled}/></label>
        <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Gebiet anlegen</button></div>
      </Form>;
}

export default function Acquisition(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<ActionResult>();
  const campaigns=(d.campaigns??[]) as any[];
  const performance=new Map((d.performance??[]).map((row:any)=>[row.campaign_id,row]));
  const totals=(d.performance??[]).reduce((acc:any,row:any)=>({
    responses:acc.responses+Number(row.responses||0),
    mandates:acc.mandates+Number(row.mandates||0),
    sales:acc.sales+Number(row.sales||0),
    cost:acc.cost+Number(row.actual_cost||row.planned_cost||0),
    commission:acc.commission+Number(row.commission_expected||0),
  }),{responses:0,mandates:0,sales:0,cost:0,commission:0});

  if(d.leer) return <LeererArbeitsplatz listenName="Kampagnenliste" einzahl="Kampagne" mehrzahl="Kampagnen" suchePlatzhalter="Name, Nummer …"
    neu={d.canWrite?{pfad:"#kampagne-anlegen",beschriftung:"+ Neu"}:undefined} volleListe="/acquisition?ansicht=tabelle" titel="Noch keine Kampagne">
    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}
    {d.areas.length===0
      ?<section className="data-card" id="gebiet-anlegen"><div className="card-head"><div><h2>Zuerst ein Gebiet anlegen</h2></div></div><p className="programm-erklaerung">Eine Kampagne läuft immer in einem Gebiet. Es ist noch keines erfasst.</p><GebietAnlegen d={d}/></section>
      :<>
        <section className="data-card" id="kampagne-anlegen"><div className="card-head"><div><h2>Erste Kampagne anlegen</h2></div></div><KampagneAnlegen d={d}/></section>
        <Aufklapper id="gebiet-anlegen" knopf={`Gebiete (${d.areas.length}) · weiteres Gebiet anlegen`}><section className="data-card"><GebietAnlegen d={d}/></section></Aufklapper>
      </>}
  </LeererArbeitsplatz>;

  // Programmliste (13.10.2026): Kennzahlen als eine Zeile, Kampagnen und
  // Gebiete als Tabellen mit Spaltenkoepfen; Anlegen klappt darunter auf.
  return <div className="editor-shell programm-liste"><ListenUeberschrift/>
    <div className="programm-liste-werkzeuge">
      <span className="programm-liste-zaehler programm-liste-zaehler-links">Zeitraum {formatDate(d.from)} – {formatDate(d.to)}</span>
      <Link className="secondary-button link-button programm-liste-rechts" to="/reports">Auswertung öffnen</Link>
    </div>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <p className="programm-kennzahlen" title="Die Kennzahlen entstehen ausschließlich aus Leads, die einer Kampagne zugeordnet wurden. Ein nicht zugeordneter Lead taucht hier nicht auf — die Zahlen sind eine Auswertung der Zuordnung, keine Marktmessung.">
      <span><strong>{campaigns.length}</strong> Kampagnen</span>
      <span><strong>{totals.responses}</strong> Reaktionen</span>
      <span><strong>{totals.mandates}</strong> Aufträge</span>
      <span><strong>{totals.sales}</strong> Verkäufe</span>
      <span><strong>{d.canReadCommission?money(totals.commission):"—"}</strong> Provision erwartet</span>
      <span>nur aus Leads, die einer Kampagne zugeordnet sind</span>
    </p>

    <section className="programm-abschnitt" id="kampagnen">
      <h2 className="programm-abschnitt-kopf">Kampagnen <span className="leise">· {campaigns.length}</span></h2>
      <div className="programm-tabelle-rahmen">
      {campaigns.length===0
        ?<p className="programm-liste-leer">Noch keine Kampagne erfasst.</p>
        :<table className="programm-tabelle">
          <thead><tr><th>Nummer</th><th>Kampagne</th><th>Kanal</th><th>Gebiet</th><th>Status</th><th className="rechts">Haushalte</th><th className="rechts">Reaktionen</th><th className="rechts">Aufträge</th><th className="rechts">Verkäufe</th><th className="rechts">Kosten</th><th>Beginn</th></tr></thead>
          <tbody>{campaigns.map((c:any)=>{
            const p=performance.get(c.id);
            const pfad=`/acquisition/${c.id}`;
            return <tr key={c.id}>
              <td className="zahl"><Link to={pfad}>{c.campaign_number}</Link></td>
              <td><Link to={pfad}>{c.name}</Link></td>
              <td>{c.lead_sources?.label??<span className="leise">offen</span>}</td>
              <td>{c.acquisition_areas?.name??<span className="leise">offen</span>}</td>
              <td><span className={`status-pill ${CAMPAIGN_CLASS[c.status]??""}`}>{CAMPAIGN_STATUS[c.status]??c.status}</span></td>
              <td className="zahl rechts">{c.household_count??"—"}</td>
              <td className="zahl rechts">{p?p.responses:0}</td>
              <td className="zahl rechts">{p?p.mandates:0}</td>
              <td className="zahl rechts">{p?p.sales:0}</td>
              <td className="zahl rechts">{c.actual_cost!=null?money(c.actual_cost):c.planned_cost!=null?<span className="leise">{money(c.planned_cost)} geplant</span>:"—"}</td>
              <td className="zahl">{c.starts_on?formatDate(c.starts_on):"—"}</td>
            </tr>;
          })}</tbody>
        </table>}
      </div>

      <Aufklapper id="kampagne-anlegen" knopf="+ Kampagne anlegen"><KampagneAnlegen d={d}/></Aufklapper>
    </section>

    <section className="programm-abschnitt" id="gebiete">
      <h2 className="programm-abschnitt-kopf">Gebiete <span className="leise">· {d.areas.length}</span></h2>
      <div className="programm-tabelle-rahmen">
      {d.areas.length===0
        ?<p className="programm-liste-leer">Noch kein Gebiet erfasst. Ein Gebiet ist die Voraussetzung für eine Kampagne.</p>
        :<table className="programm-tabelle">
          <thead><tr><th>Gebiet</th><th>Art</th><th>PLZ</th><th className="rechts">Haushalte (ca.)</th><th className="rechts">Kampagnen</th><th>Pfad</th></tr></thead>
          <tbody>{d.areas.map((a:any)=><tr key={a.id}>
            <td style={{paddingLeft:`calc(12px + ${a.depth*1.25}rem)`}}><strong>{a.name}</strong></td>
            <td>{AREA_TYPE[a.area_type]??a.area_type}</td>
            <td className="zahl">{a.postal_code??"—"}</td>
            <td className="zahl rechts">{a.household_estimate??"—"}</td>
            <td className="zahl rechts">{campaigns.filter((c:any)=>c.area_id===a.id).length}</td>
            <td className="leise">{a.path}</td>
          </tr>)}</tbody>
        </table>}
      </div>

      <Aufklapper id="gebiet-anlegen" knopf="+ Gebiet anlegen"><GebietAnlegen d={d}/></Aufklapper>
    </section>
  </div>;
}
