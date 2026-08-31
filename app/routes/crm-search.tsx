import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/crm-search";
import { requireActiveUser } from "~/lib/auth.server";
import "~/module04-fixes.css";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const includeArchived = url.searchParams.get("archived") === "1";
  let results: Array<{entity_type:string;entity_id:string;reference:string;title:string;subtitle:string;status:string;updated_at:string;archived:boolean;version:number}> = [];
  if (q.length >= 2) {
    const { data: searchResults, error } = await supabase.rpc("crm_global_search", { p_query: q, p_include_archived: includeArchived });
    if (error) throw new Response("Suche konnte nicht ausgeführt werden.", { status: 500 });
    results = searchResults ?? [];
  }
  return data({ q, includeArchived, results, profile }, { headers: responseHeaders() });
}
function target(result:{entity_type:string;entity_id:string}) {
  if (result.entity_type === "CONTACT") return `/crm/contacts/${result.entity_id}`;
  if (result.entity_type === "ORGANIZATION") return `/crm/organizations/${result.entity_id}`;
  if (result.entity_type === "PROPERTY") return `/properties/${result.entity_id}`;
  if (result.entity_type === "LEAD") return `/leads/${result.entity_id}`;
  if (result.entity_type === "SEARCH_PROFILE") return `/search-profiles/${result.entity_id}`;
  if (result.entity_type === "INQUIRY") return `/inquiries/${result.entity_id}`;
  return "/crm/tasks";
}
const LABELS:Record<string,string>={CONTACT:"Kontakt",ORGANIZATION:"Organisation",TASK:"Aufgabe",PROPERTY:"Immobilie",LEAD:"Lead",SEARCH_PROFILE:"Suchprofil",INQUIRY:"Anfrage"};
const STATUS_LABELS:Record<string,string>={OPEN:"Offen",IN_PROGRESS:"In Bearbeitung",DONE:"Erledigt",CANCELLED:"Abgebrochen",ACTIVE:"Aktiv",PAUSED:"Pausiert",CLOSED:"Erledigt",NEW:"Neu",CONTACTED:"Kontaktiert",QUALIFIED:"Qualifiziert",VIEWING_PLANNED:"Besichtigung geplant",LOST:"Kein weiteres Interesse",ARCHIVED:"Archiviert"};
export default function CrmSearch() {
  const { q, includeArchived, results, profile } = useLoaderData<typeof loader>();
  return <main className="editor-shell"><header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">ZeyherMutterOS</p><h1 className="editor-title">Globale Suche</h1><p className="editor-meta">Kontakte, Leads, Immobilien, Suchprofile und Anfragen an einer Stelle finden.</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header><div className="crm-search-page"><section className="data-card global-search-card"><Form method="get" className="global-search-form"><div className="global-search-field"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><input name="q" defaultValue={q} placeholder="Name, Nummer, Ort, Adresse oder E-Mail suchen …" minLength={2} autoFocus aria-label="CRM durchsuchen"/></div><label className="checkbox-row"><input type="checkbox" name="archived" value="1" defaultChecked={includeArchived}/><span>Archiv einbeziehen</span></label><button className="primary-button" type="submit">Suchen</button></Form></section><section className="data-card"><div className="card-head"><div><p className="eyebrow">Ergebnisse</p><h2>{q.length>=2?`${results.length} Treffer`:"Was möchtest du finden?"}</h2></div><div className="inline-actions"><Link className="subtle-link" to="/search-profiles">Suchprofile</Link><Link className="subtle-link" to="/inquiries">Anfragen</Link><Link className="subtle-link" to="/leads">Leads</Link><Link className="subtle-link" to="/properties">Immobilien</Link></div></div>{q.length<2?<p className="empty-state">Gib mindestens zwei Zeichen ein. Du kannst nach Namen, CRM-Nummern, Orten, Adressen, E-Mail-Adressen oder Telefonnummern suchen.</p>:null}{q.length>=2&&results.length===0?<p className="empty-state">Keine Treffer gefunden.</p>:null}<div className="data-list search-result-list">{results.map(result=><Link className="data-row data-row-link" to={target(result)} key={`${result.entity_type}-${result.entity_id}`}><div><strong>{result.title}</strong><small>{LABELS[result.entity_type]??result.entity_type} · {result.reference}{result.subtitle?` · ${result.subtitle}`:""}</small></div><div className="row-meta"><span>{result.archived?"Archiviert":STATUS_LABELS[result.status]??result.status}</span><small>{new Intl.DateTimeFormat("de-DE",{dateStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(result.updated_at))}</small></div></Link>)}</div></section></div></main>;
}
