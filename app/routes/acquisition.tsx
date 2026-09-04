import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/acquisition";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

const AREA_TYPE:Record<string,string>={CITY:"Stadt",DISTRICT:"Stadtteil",QUARTER:"Quartier",REGION:"Region",OTHER:"Sonstiges"};
const CAMPAIGN_STATUS:Record<string,string>={PLANNED:"Geplant",RUNNING:"Läuft",COMPLETED:"Abgeschlossen",CANCELLED:"Abgebrochen"};
const CAMPAIGN_CLASS:Record<string,string>={PLANNED:"status-draft",RUNNING:"status-sold",COMPLETED:"status-archived",CANCELLED:"status-lost"};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function intOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number.parseInt(raw,10);return Number.isFinite(n)?n:NaN;}
function money(value:any){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n):"—";}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function plural(count:any,one:string,many:string){return `${Number(count)||0} ${Number(count)===1?one:many}`;}

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
    profile,from,to,
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
    return redirect("/acquisition#gebiete",{headers:responseHeaders()});
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

export default function Acquisition(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<ActionResult>();
  const disabled=!d.canWrite;
  const campaigns=(d.campaigns??[]) as any[];
  const performance=new Map((d.performance??[]).map((row:any)=>[row.campaign_id,row]));
  const totals=(d.performance??[]).reduce((acc:any,row:any)=>({
    responses:acc.responses+Number(row.responses||0),
    mandates:acc.mandates+Number(row.mandates||0),
    sales:acc.sales+Number(row.sales||0),
    cost:acc.cost+Number(row.actual_cost||row.planned_cost||0),
    commission:acc.commission+Number(row.commission_expected||0),
  }),{responses:0,mandates:0,sales:0,cost:0,commission:0});

  return <div className="editor-shell">
    <div className="editor-header">
      <div>
        <p className="eyebrow">Arbeitsplatz · Akquise</p>
        <h1>Kampagnen & Gebiete</h1>
        <p className="subtle">Woraus ein Auftrag entstanden ist — vom Kanal über die Kampagne bis zur einzelnen Welle.</p>
      </div>
      <div className="inline-actions"><Link className="subtle-link" to="/reports">Reporting öffnen →</Link></div>
    </div>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <div className="metric-grid">
      <article className="metric"><span>Kampagnen</span><strong>{campaigns.length}</strong><small>nicht archiviert</small></article>
      <article className="metric"><span>Reaktionen</span><strong>{totals.responses}</strong><small>zugeordnete Leads im Zeitraum</small></article>
      <article className="metric"><span>Aufträge</span><strong>{totals.mandates}</strong><small>aus zugeordneten Leads</small></article>
      <article className="metric"><span>Verkäufe</span><strong>{totals.sales}</strong><small>beurkundet</small></article>
      <article className="metric"><span>Provision erwartet</span><strong>{d.canReadCommission?money(totals.commission):"—"}</strong><small>{d.canReadCommission?"aus verknüpften Objekten":"keine Berechtigung für Provisionen"}</small></article>
    </div>

    <p className="form-warning">Die Kennzahlen entstehen ausschließlich aus Leads, die einer Kampagne zugeordnet wurden. Ein nicht zugeordneter Lead taucht hier nicht auf — die Zahlen sind eine Auswertung der Zuordnung, keine Marktmessung.</p>

    <section className="data-card" id="kampagnen">
      <div className="card-head"><div><p className="eyebrow">Kanal › Kampagne › Gebiet</p><h2>Kampagnen</h2></div><span className="status-pill">{d.from} bis {d.to}</span></div>
      {campaigns.length===0
        ?<p className="empty-state">Noch keine Kampagne erfasst.</p>
        :<div className="data-list">{campaigns.map((c:any)=>{
          const p=performance.get(c.id);
          return <Link className="data-row data-row-link" to={`/acquisition/${c.id}`} key={c.id}>
            <div><strong>{c.campaign_number} · {c.name}</strong><small>{c.lead_sources?.label??"Kanal offen"} · {c.acquisition_areas?.name??"Gebiet offen"}{c.starts_on?` · ab ${formatDate(c.starts_on)}`:""}</small></div>
            <div className="row-meta"><span>{p?`${plural(p.responses,"Reaktion","Reaktionen")} · ${plural(p.mandates,"Auftrag","Aufträge")} · ${plural(p.sales,"Verkauf","Verkäufe")}`:"keine Zuordnung im Zeitraum"}</span><small>{c.household_count?`${plural(c.household_count,"Haushalt","Haushalte")}`:"Haushalte offen"}{c.actual_cost!=null?` · ${money(c.actual_cost)} Kosten`:c.planned_cost!=null?` · ${money(c.planned_cost)} geplant`:""}</small></div>
            <span className={`status-pill ${CAMPAIGN_CLASS[c.status]??""}`}>{CAMPAIGN_STATUS[c.status]??c.status}</span>
          </Link>;
        })}</div>}

      <Form method="post" className="form-grid" style={{marginTop:"1rem"}}>
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
      </Form>
    </section>

    <section className="data-card" id="gebiete">
      <div className="card-head"><div><p className="eyebrow">Hyperlokal</p><h2>Gebiete</h2></div><span className="status-pill">{d.areas.length}</span></div>
      {d.areas.length===0
        ?<p className="empty-state">Noch kein Gebiet erfasst. Ein Gebiet ist die Voraussetzung für eine Kampagne.</p>
        :<div className="data-list">{d.areas.map((a:any)=>
          <div className="data-row" key={a.id}>
            <div style={{paddingLeft:`${a.depth*1.25}rem`}}><strong>{a.name}</strong><small>{AREA_TYPE[a.area_type]??a.area_type}{a.postal_code?` · ${a.postal_code}`:""}{a.household_estimate?` · ca. ${a.household_estimate} Haushalte`:""}</small></div>
            <div className="row-meta"><small>{a.path}</small></div>
            <span>{plural(campaigns.filter((c:any)=>c.area_id===a.id).length,"Kampagne","Kampagnen")}</span>
          </div>)}</div>}

      <Form method="post" className="form-grid" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="area_add"/>
        <label className="form-field"><span>Name *</span><input name="name" disabled={disabled} placeholder="Waldtrudering"/></label>
        <label className="form-field"><span>Übergeordnet</span><select name="parent_area_id" defaultValue="" disabled={disabled}><option value="">— oberste Ebene</option>{d.areas.map((a:any)=><option key={a.id} value={a.id}>{a.path}</option>)}</select></label>
        <label className="form-field"><span>Art</span><select name="area_type" defaultValue="DISTRICT" disabled={disabled}>{Object.entries(AREA_TYPE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field"><span>PLZ</span><input name="postal_code" disabled={disabled}/></label>
        <label className="form-field"><span>Haushalte (Schätzung)</span><input name="household_estimate" disabled={disabled}/></label>
        <label className="form-field full-width"><span>Notiz</span><input name="notes" disabled={disabled}/></label>
        <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Gebiet anlegen</button></div>
      </Form>
    </section>
  </div>;
}
