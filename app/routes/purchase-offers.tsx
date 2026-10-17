import { data, Form, Link, useLoaderData, redirect } from "react-router";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/purchase-offers";
import { requirePermission } from "~/lib/auth.server";
import { euroGenau as money, tag as formatDate } from "~/lib/format";
import "~/programm-liste.css";

const STATUS:Record<string,string>={DRAFT:"Entwurf",SUBMITTED:"Abgegeben",COUNTERED:"Gegenangebot",ACCEPTED:"Angenommen",REJECTED:"Abgelehnt",WITHDRAWN:"Zurückgezogen",REPLACED:"Ersetzt",FAILED:"Abschluss gescheitert"};
const FINANCING:Record<string,string>={OPEN:"Offen",IN_PROGRESS:"In Klärung",CONFIRMED:"Bestätigt",NOT_REQUIRED:"Nicht erforderlich"};
const STATUS_CLASS:Record<string,string>={DRAFT:"status-draft",SUBMITTED:"status-marketing",COUNTERED:"status-contract-pending",ACCEPTED:"status-reserved",REJECTED:"status-lost",WITHDRAWN:"status-withdrawn",REPLACED:"status-archived",FAILED:"status-lost"};
function one(v:any){return Array.isArray(v)?v[0]:v;}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"offer.read");
  // Einstieg: gleich den obersten Datensatz im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if(istEinstieg(request)){const {data:erster}=await supabase.from("purchase_offers").select("id").is("archived_at",null).order("updated_at",{ascending:false}).limit(1).maybeSingle(); if(erster)throw redirect(`/purchase-offers/${erster.id}`,{headers:responseHeaders()});}
  const url=new URL(request.url);const filters={q:(url.searchParams.get("q")??"").trim(),status:url.searchParams.get("status")??"ACTIVE",propertyId:url.searchParams.get("property_id")??""};
  const [{data:rows,error},{data:canWrite},{data:properties}]=await Promise.all([
    supabase.from("purchase_offers").select("id,offer_number,property_id,contact_id,amount,status,financing_status,submitted_at,valid_until,archived_at,updated_at,properties!inner(id,property_number,internal_title,status),contacts!inner(id,contact_number,first_name,last_name),sale_closings(id,closing_number,status)").order("updated_at",{ascending:false}).limit(500),
    supabase.rpc("current_user_has_permission",{p_permission:"offer.write"}),
    supabase.from("properties").select("id,property_number,internal_title").eq("transaction_type","SALE").is("archived_at",null).order("updated_at",{ascending:false}).limit(500),
  ]);
  if(error)throw new Response("Kaufangebote konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const all=(rows??[]) as any[],active=all.filter(r=>!r.archived_at);
  const summary={draft:active.filter(r=>r.status==="DRAFT").length,negotiation:active.filter(r=>["SUBMITTED","COUNTERED"].includes(r.status)).length,accepted:active.filter(r=>r.status==="ACCEPTED").length,failed:active.filter(r=>["REJECTED","WITHDRAWN","FAILED"].includes(r.status)).length};
  const needle=filters.q.toLocaleLowerCase("de-DE");
  const filtered=all.filter(row=>{const p=one(row.properties),c=one(row.contacts);if(filters.propertyId&&row.property_id!==filters.propertyId)return false;if(filters.status==="ACTIVE"&&(row.archived_at||["REJECTED","WITHDRAWN","REPLACED","FAILED"].includes(row.status)))return false;if(filters.status==="ARCHIVED"&&!row.archived_at)return false;if(!["ACTIVE","ALL","ARCHIVED"].includes(filters.status)&&row.status!==filters.status)return false;if(!needle)return true;return [row.offer_number,p?.property_number,p?.internal_title,c?.contact_number,c?.first_name,c?.last_name].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(needle);});
  return data({profile,rows:filtered,gekappt:all.length>=500,summary,canWrite:canWrite===true,properties:properties??[],filters},{headers:responseHeaders()});
}

// Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026):
// Werkzeugleiste, eine Zeile Kennzahlen, Tabelle. Vorher Seitenkopf, vier
// Kacheln, Filterkasten und Kartenzeilen.
export default function PurchaseOffers(){
  const d=useLoaderData<typeof loader>();
  const neu=d.filters.propertyId?`/purchase-offers/new?property_id=${encodeURIComponent(d.filters.propertyId)}`:"/purchase-offers/new";
  const gefiltert=Boolean(d.filters.q||d.filters.propertyId||d.filters.status!=="ACTIVE");
  return <main className="editor-shell programm-liste">
    <Form method="get" className="programm-liste-werkzeuge" role="search">
      <input type="hidden" name="ansicht" value="tabelle"/>
      <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={d.filters.q} placeholder="Angebot, Objekt oder Käufer …" autoComplete="off"/></label>
      <label><span className="sr-only">Status</span><select name="status" defaultValue={d.filters.status}><option value="ACTIVE">Laufende Angebote</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([v,l])=><option value={v} key={v}>{l}</option>)}<option value="ARCHIVED">Archiviert</option></select></label>
      <label><span className="sr-only">Immobilie</span><select name="property_id" defaultValue={d.filters.propertyId}><option value="">Alle Immobilien</option>{d.properties.map((p:any)=><option key={p.id} value={p.id}>{p.property_number} · {p.internal_title}</option>)}</select></label>
      <button className="secondary-button" type="submit">Filtern</button>
      <span className="programm-liste-zaehler">{d.rows.length} {d.rows.length===1?"Kaufangebot":"Kaufangebote"}</span>
      {d.canWrite?<Link className="programm-liste-neu" to={neu}>+ Neues Kaufangebot</Link>:null}
    </Form>
    <p className="programm-kennzahlen">
      <span><strong>{d.summary.draft}</strong> Entwürfe</span>
      <span><strong>{d.summary.negotiation}</strong> in Verhandlung</span>
      <span><strong>{d.summary.accepted}</strong> angenommen</span>
      <span><strong>{d.summary.failed}</strong> beendet</span>
    </p>
    <div className="programm-tabelle-rahmen">
      {d.rows.length===0?<p className="programm-liste-leer">{gefiltert?"Kein Kaufangebot passt zu diesem Filter.":"Noch kein Kaufangebot erfasst."}{d.canWrite?<> <Link to={neu}>Kaufangebot erfassen</Link></>:null}</p>:<table className="programm-tabelle">
        <thead><tr><th scope="col">Nummer</th><th scope="col">Objekt</th><th scope="col">Käufer</th><th scope="col" className="rechts">Betrag</th><th scope="col">Status</th><th scope="col">Finanzierung</th><th scope="col">Abgegeben · gültig bis</th><th scope="col" className="rechts">Geändert</th></tr></thead>
        <tbody>{d.rows.map((row:any)=>{const p=one(row.properties),c=one(row.contacts),closing=one(row.sale_closings);return <tr key={row.id}>
          <td className="zahl"><Link to={`/purchase-offers/${row.id}`}>{row.offer_number}</Link></td>
          <td><Link to={`/purchase-offers/${row.id}`}>{p?.property_number} · {p?.internal_title}</Link></td>
          <td>{c?<Link to={`/crm/contacts/${c.id}`}>{c.first_name} {c.last_name}</Link>:<span className="leise">—</span>}</td>
          <td className="zahl rechts">{money(row.amount)}</td>
          <td><span className={`status-pill ${STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":STATUS[row.status]??row.status}</span>{closing?.closing_number?<div className="leise">{closing.closing_number}</div>:null}</td>
          <td>{FINANCING[row.financing_status]??(row.financing_status?row.financing_status:<span className="leise">offen</span>)}</td>
          <td className="zahl">{row.submitted_at?formatDate(row.submitted_at):<span className="leise">nicht abgegeben</span>}<div className="leise">{row.valid_until?`bis ${formatDate(row.valid_until)}`:"ohne Befristung"}</div></td>
          <td className="zahl rechts leise">{formatDate(row.updated_at)}</td>
        </tr>;})}</tbody>
      </table>}
      {d.gekappt?<p className="programm-liste-leer">Durchsucht werden die 500 zuletzt geänderten Kaufangebote.</p>:null}
    </div>
  </main>;
}
