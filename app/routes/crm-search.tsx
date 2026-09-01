import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/crm-search";
import { requireActiveUser } from "~/lib/auth.server";
import "~/module04-fixes.css";

type SearchResult={entity_type:string;entity_id:string;reference:string;title:string;subtitle:string;status:string;updated_at:string;archived:boolean;version:number};
function one(v:any){return Array.isArray(v)?v[0]:v;}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const includeArchived = url.searchParams.get("archived") === "1";
  let results: SearchResult[] = [];
  if (q.length >= 2) {
    const [{ data: searchResults, error },{data:offers},{data:closings}] = await Promise.all([
      supabase.rpc("crm_global_search", { p_query: q, p_include_archived: includeArchived }),
      supabase.from("purchase_offers").select("id,offer_number,amount,status,updated_at,archived_at,version,properties(property_number,internal_title),contacts(first_name,last_name)").order("updated_at",{ascending:false}).limit(300),
      supabase.from("sale_closings").select("id,closing_number,agreed_purchase_price,notarial_purchase_price,status,updated_at,archived_at,version,properties(property_number,internal_title),buyer:contacts!sale_closings_buyer_contact_id_fkey(first_name,last_name),purchase_offers(offer_number)").order("updated_at",{ascending:false}).limit(300),
    ]);
    if (error) throw new Response("Suche konnte nicht ausgeführt werden.", { status: 500 });
    const needle=q.toLocaleLowerCase("de-DE");
    const offerResults=((offers??[]) as any[]).filter(row=>includeArchived||!row.archived_at).filter(row=>{const p=one(row.properties),c=one(row.contacts);return [row.offer_number,p?.property_number,p?.internal_title,c?.first_name,c?.last_name].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(needle);}).map(row=>{const p=one(row.properties),c=one(row.contacts);return {entity_type:"OFFER",entity_id:row.id,reference:row.offer_number,title:`${c?.first_name??""} ${c?.last_name??""}`.trim()||"Kaufangebot",subtitle:`${p?.property_number??"—"} · ${new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(row.amount))}`,status:row.status,updated_at:row.updated_at,archived:Boolean(row.archived_at),version:Number(row.version)} satisfies SearchResult;});
    const closingResults=((closings??[]) as any[]).filter(row=>includeArchived||!row.archived_at).filter(row=>{const p=one(row.properties),b=one(row.buyer),offer=one(row.purchase_offers);return [row.closing_number,p?.property_number,p?.internal_title,b?.first_name,b?.last_name,offer?.offer_number].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(needle);}).map(row=>{const p=one(row.properties),b=one(row.buyer);return {entity_type:"CLOSING",entity_id:row.id,reference:row.closing_number,title:`${p?.property_number??"Immobilie"} · ${b?.first_name??""} ${b?.last_name??""}`.trim(),subtitle:`Verkaufsabschluss · ${new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"}).format(Number(row.notarial_purchase_price??row.agreed_purchase_price))}`,status:row.status,updated_at:row.updated_at,archived:Boolean(row.archived_at),version:Number(row.version)} satisfies SearchResult;});
    results=[...((searchResults??[]) as SearchResult[]),...offerResults,...closingResults].sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0,100);
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
  if (result.entity_type === "OFFER") return `/purchase-offers/${result.entity_id}`;
  if (result.entity_type === "CLOSING") return `/closings/${result.entity_id}`;
  return "/crm/tasks";
}
const LABELS:Record<string,string>={CONTACT:"Kontakt",ORGANIZATION:"Organisation",TASK:"Aufgabe",PROPERTY:"Immobilie",LEAD:"Lead",SEARCH_PROFILE:"Suchprofil",INQUIRY:"Anfrage",OFFER:"Kaufangebot",CLOSING:"Abschluss & Notar"};
const STATUS_LABELS:Record<string,string>={OPEN:"Offen",IN_PROGRESS:"In Bearbeitung",DONE:"Erledigt",CANCELLED:"Abgebrochen",ACTIVE:"Aktiv",PAUSED:"Pausiert",CLOSED:"Erledigt",NEW:"Neu",CONTACTED:"Kontaktiert",QUALIFIED:"Qualifiziert",VIEWING_PLANNED:"Besichtigung geplant",LOST:"Kein weiteres Interesse",ARCHIVED:"Archiviert",DRAFT:"Entwurf",SUBMITTED:"Abgegeben",COUNTERED:"Gegenangebot",ACCEPTED:"Angenommen",REJECTED:"Abgelehnt",WITHDRAWN:"Zurückgezogen",REPLACED:"Ersetzt",FAILED:"Abschluss gescheitert",PREPARATION:"Abschlussvorbereitung",NOTARY_INSTRUCTED:"Notariat beauftragt",DRAFT_RECEIVED:"Entwurf eingegangen",APPOINTMENT_SCHEDULED:"Beurkundung terminiert",NOTARIZED:"Beurkundet",PURCHASE_PRICE_DUE:"Kaufpreis fällig",PURCHASE_PRICE_PAID:"Kaufpreis bezahlt",HANDOVER_COMPLETED:"Übergabe erfolgt",COMPLETED:"Abgeschlossen"};
export default function CrmSearch() {
  const { q, includeArchived, results, profile } = useLoaderData<typeof loader>();
  return <main className="editor-shell"><header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">ZeyherMutterOS</p><h1 className="editor-title">Globale Suche</h1><p className="editor-meta">Kontakte, Leads, Immobilien, Suchprofile, Anfragen, Kaufangebote und Abschlüsse an einer Stelle finden.</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header><div className="crm-search-page"><section className="data-card global-search-card"><Form method="get" className="global-search-form"><div className="global-search-field"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><input name="q" defaultValue={q} placeholder="Name, Nummer, Ort, Adresse oder E-Mail suchen …" minLength={2} autoFocus aria-label="CRM durchsuchen"/></div><label className="checkbox-row"><input type="checkbox" name="archived" value="1" defaultChecked={includeArchived}/><span>Archiv einbeziehen</span></label><button className="primary-button" type="submit">Suchen</button></Form></section><section className="data-card"><div className="card-head"><div><p className="eyebrow">Ergebnisse</p><h2>{q.length>=2?`${results.length} Treffer`:"Was möchtest du finden?"}</h2></div><div className="inline-actions"><Link className="subtle-link" to="/purchase-offers">Kaufangebote</Link><Link className="subtle-link" to="/closings">Abschlüsse</Link><Link className="subtle-link" to="/leads">Leads</Link><Link className="subtle-link" to="/properties">Immobilien</Link></div></div>{q.length<2?<p className="empty-state">Gib mindestens zwei Zeichen ein. Du kannst nach Namen, CRM-Nummern, Orten, Adressen, E-Mail-Adressen oder Telefonnummern suchen.</p>:null}{q.length>=2&&results.length===0?<p className="empty-state">Keine Treffer gefunden.</p>:null}<div className="data-list search-result-list">{results.map(result=><Link className="data-row data-row-link" to={target(result)} key={`${result.entity_type}-${result.entity_id}`}><div><strong>{result.title}</strong><small>{LABELS[result.entity_type]??result.entity_type} · {result.reference}{result.subtitle?` · ${result.subtitle}`:""}</small></div><div className="row-meta"><span>{result.archived?"Archiviert":STATUS_LABELS[result.status]??result.status}</span><small>{new Intl.DateTimeFormat("de-DE",{dateStyle:"short",timeZone:"Europe/Berlin"}).format(new Date(result.updated_at))}</small></div></Link>)}</div></section></div></main>;
}