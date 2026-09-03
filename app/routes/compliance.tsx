import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/compliance";
import { requirePermission } from "~/lib/auth.server";

const RISK:Record<string,string>={LOW:"Gering",MEDIUM:"Mittel",HIGH:"Hoch"};
const RISK_CLASS:Record<string,string>={LOW:"status-sold",MEDIUM:"status-marketing",HIGH:"status-lost"};
const RETENTION_CATEGORY:Record<string,string>={GWG_IDENTIFICATION:"Geldwäsche · Identifizierung"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function today(){return new Date().toISOString().slice(0,10);}
function inDays(days:number){return new Date(Date.now()+days*864e5).toISOString().slice(0,10);}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"gwg.read");
  const url=new URL(request.url);
  const filters={q:(url.searchParams.get("q")??"").trim(),view:url.searchParams.get("view")??"OPEN"};
  const [{data:cases,error},{data:documents},{data:canWrite}]=await Promise.all([
    supabase.from("gwg_cases").select("id,case_number,property_id,risk_level,risk_assessed_on,risk_next_review_on,source_of_funds_documented_on,non_cash_payment_evidence_on,suspicious_indication_reviewed_on,report_filed_on,retention_until,legal_hold,archived_at,updated_at,properties!inner(id,property_number,internal_title,status),gwg_identifications(id,party_role,identified_on,politically_exposed,screening_result,document_valid_until)").order("updated_at",{ascending:false}).limit(400),
    supabase.from("documents").select("id,title,category,property_id,retention_category,retention_until,legal_hold,archived_at,properties(id,property_number,internal_title)").not("retention_until","is",null).is("archived_at",null).lte("retention_until",inDays(180)).order("retention_until").limit(300),
    supabase.rpc("current_user_has_permission",{p_permission:"gwg.write"}),
  ]);
  if(error)throw new Response("Geldwäscheakten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const all=((cases??[]) as any[]).map((row)=>{
    const identifications=(row.gwg_identifications??[]) as any[];
    const open:string[]=[];
    if(!row.risk_level)open.push("Risikoeinstufung offen");
    if(!identifications.some((item)=>item.party_role==="SELLER"&&item.identified_on))open.push("Verkäuferseite nicht identifiziert");
    if(!identifications.some((item)=>item.party_role==="BUYER"&&item.identified_on))open.push("Käuferseite nicht identifiziert");
    if(row.risk_level==="HIGH"&&!row.source_of_funds_documented_on)open.push("Herkunft der Mittel offen");
    if(identifications.some((item)=>item.politically_exposed)&&!row.source_of_funds_documented_on)open.push("PEP ohne Mittelherkunft");
    if(identifications.some((item)=>item.screening_result&&item.screening_result!=="NO_MATCH")&&!row.suspicious_indication_reviewed_on)open.push("Treffer ohne Verdachtsprüfung");
    if(row.risk_next_review_on&&row.risk_next_review_on<today())open.push("Wiedervorlage überfällig");
    if(identifications.some((item)=>item.document_valid_until&&item.document_valid_until<today()))open.push("Ausweis abgelaufen");
    return {...row,openPoints:open,identifiedCount:identifications.filter((item)=>item.identified_on).length,totalCount:identifications.length};
  });
  const active=all.filter((row)=>!row.archived_at);
  const summary={
    total:active.length,
    withoutRisk:active.filter((row)=>!row.risk_level).length,
    highRisk:active.filter((row)=>row.risk_level==="HIGH").length,
    open:active.filter((row)=>row.openPoints.length>0).length,
    retention:active.filter((row)=>row.retention_until&&row.retention_until<=inDays(90)).length,
    hold:active.filter((row)=>row.legal_hold).length,
  };
  const needle=filters.q.toLocaleLowerCase("de-DE");
  const filtered=all.filter((row)=>{
    const property=one(row.properties);
    if(filters.view==="OPEN"&&(row.archived_at||row.openPoints.length===0))return false;
    if(filters.view==="ACTIVE"&&row.archived_at)return false;
    if(filters.view==="HIGH"&&(row.archived_at||row.risk_level!=="HIGH"))return false;
    if(filters.view==="RETENTION"&&(row.archived_at||!row.retention_until||row.retention_until>inDays(90)))return false;
    if(filters.view==="ARCHIVED"&&!row.archived_at)return false;
    if(!needle)return true;
    return [row.case_number,property?.property_number,property?.internal_title].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(needle);
  });
  const retentionDocuments=((documents??[]) as any[]).filter((row)=>row.retention_category||row.category==="IDENTITY_PROOF");
  return data({profile,rows:filtered,summary,filters,retentionDocuments,canWrite:canWrite===true},{headers:responseHeaders()});
}

export default function Compliance(){
  const {profile,rows,summary,filters,retentionDocuments}=useLoaderData<typeof loader>();
  const overdue=retentionDocuments.filter((row:any)=>row.retention_until<today());
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Verwaltung</p><h1 className="editor-title">Geldwäsche & Aufbewahrung</h1><p className="editor-meta">Risikoeinstufung, Identifizierung der Beteiligten und Ablauf der Aufbewahrungsfristen über alle Verkaufsfälle.</p></div><div className="header-actions"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>

    <div className="form-warning"><strong>Dokumentation, keine Bewertung.</strong> Diese Übersicht zeigt nur, was erfasst wurde. Sie stellt nicht fest, ob eine geldwäscherechtliche Pflicht besteht oder erfüllt ist, und löst keine Meldung aus.</div>

    <section className="metric-grid">
      <article className="metric-card"><span>Aktive Akten</span><strong>{summary.total}</strong><small>je Verkaufsimmobilie eine</small></article>
      <article className="metric-card"><span>Ohne Risikoeinstufung</span><strong>{summary.withoutRisk}</strong><small>Einstufung nachholen</small></article>
      <article className="metric-card"><span>Hohes Risiko</span><strong>{summary.highRisk}</strong><small>verstärkte Sorgfalt prüfen</small></article>
      <article className="metric-card"><span>Mit offenen Punkten</span><strong>{summary.open}</strong><small>Erfassung unvollständig</small></article>
      <article className="metric-card"><span>Aufbewahrung &lt; 90 Tage</span><strong>{summary.retention}</strong><small>Frist läuft ab</small></article>
      <article className="metric-card"><span>Löschsperren</span><strong>{summary.hold}</strong><small>bewusst zurückgehalten</small></article>
    </section>

    <section className="data-card"><Form method="get" className="filter-grid">
      <label><span>Suche</span><input name="q" defaultValue={filters.q} placeholder="Akte oder Immobilie"/></label>
      <label><span>Ansicht</span><select name="view" defaultValue={filters.view}><option value="OPEN">Mit offenen Punkten</option><option value="ACTIVE">Alle aktiven Akten</option><option value="HIGH">Hohes Risiko</option><option value="RETENTION">Aufbewahrung läuft ab</option><option value="ARCHIVED">Archiviert</option></select></label>
      <button className="secondary-button" type="submit">Filtern</button>
    </Form></section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Aktenverzeichnis</p><h2>{rows.length} Akten</h2></div></div><div className="data-list">
      {rows.map((row:any)=>{const property=one(row.properties);return <Link className="data-row data-row-link" to={`/properties/${property.id}/compliance`} key={row.id}>
        <div><strong>{row.case_number} · {property.property_number}</strong><small>{property.internal_title}</small></div>
        <div className="row-meta"><span className={`status-pill ${row.archived_at?"status-archived":RISK_CLASS[row.risk_level]??"status-draft"}`}>{row.archived_at?"Archiviert":row.risk_level?`Risiko ${RISK[row.risk_level]}`:"Ohne Einstufung"}</span><small>{row.identifiedCount} von {row.totalCount} identifiziert</small></div>
        <div className="row-meta"><span>{row.openPoints.length?row.openPoints.join(" · "):"Erfassung vollständig"}</span><small>Aufbewahrung bis {formatDate(row.retention_until)}{row.legal_hold?" · Löschsperre":""}</small></div>
        <span className="subtle-link">Öffnen →</span>
      </Link>;})}
      {rows.length===0?<p className="empty-state">Keine Akten in dieser Ansicht.</p>:null}
    </div></section>

    <section className="data-card" id="aufbewahrung"><div className="card-head"><div><p className="eyebrow">Besonders schutzwürdige Unterlagen</p><h2>Aufbewahrung läuft ab</h2></div><span className="status-pill">{overdue.length} überfällig</span></div>
      <p className="subtle">Dokumente mit hinterlegter Aufbewahrungsfrist, die innerhalb der nächsten 180 Tage abläuft oder bereits abgelaufen ist. Das System löscht nichts von selbst; über die Löschung entscheidet die Geschäftsführung.</p>
      {retentionDocuments.length===0?<p className="empty-state">Derzeit läuft keine Aufbewahrungsfrist ab.</p>:<div className="data-list">
        {retentionDocuments.map((row:any)=>{const property=one(row.properties);const expired=row.retention_until<today();return <div className="data-row" key={row.id}>
          <div><strong>{row.title}</strong><small>{RETENTION_CATEGORY[row.retention_category]??row.retention_category??"Ohne Aufbewahrungskategorie"}{property?` · ${property.property_number}`:""}</small></div>
          <div className="row-meta"><span className={`status-pill ${row.legal_hold?"status-marketing":expired?"status-lost":"status-draft"}`}>{row.legal_hold?"Löschsperre":expired?"Frist abgelaufen":"Frist läuft"}</span><small>bis {formatDate(row.retention_until)}</small></div>
          {property?<Link className="subtle-link" to={`/properties/${property.id}/documents`}>Dokumente öffnen →</Link>:null}
        </div>;})}
      </div>}
    </section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Vor produktiver Nutzung</p><h2>Anwaltlich abzunehmen</h2></div></div>
      <ul className="subtle">
        <li>Ob und ab wann für dieses Maklerbüro geldwäscherechtliche Pflichten bestehen und welche Fälle erfasst werden müssen.</li>
        <li>Die zulässige Speicherung von Ausweisdaten und Ausweiskopien sowie die konkreten Löschfristen.</li>
        <li>Der interne Ablauf bei einem Treffer im Listenabgleich und bei einem Verdachtsfall einschließlich der Frage, wer meldet.</li>
        <li>Der Umgang mit dem Verbot, den Betroffenen über eine Meldung zu informieren.</li>
      </ul>
    </section>
  </main>;
}
