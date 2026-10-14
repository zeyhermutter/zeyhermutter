import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/reservations";
import { KontaktAuswahl } from "~/components/kontakt-auswahl";
import { LeererArbeitsplatz } from "~/components/leerer-arbeitsplatz";
import { ReservierungHinweis } from "~/components/reservierung-hinweis";
import { requirePermission } from "~/lib/auth.server";
import { istEinstieg } from "~/lib/einstieg";
import { euroRund as money, tag as formatDate } from "~/lib/format";
import { reservierungAktion } from "~/lib/reservierung.server";
import { RESERVATION_STATUS, contactLabel, one, reservationExpired, reservierungStand, today } from "~/lib/reservierung";
import "~/programm-liste.css";

// Reservierungen: Liste (?ansicht=tabelle) und Einstieg in den Arbeitsplatz.
// Die Akte einer Reservierung ist app/routes/reservation-detail.tsx; was
// eine Reservierung aendert, steht in app/lib/reservierung.server.ts.

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders}=await requirePermission(request,context.cloudflare.env,"reservation.read");
  // Ohne Parameter: gleich die zuletzt angelegte Reservierung als Akte --
  // Liste links, Akte rechts, wie in allen Bereichen. Die Tabelle gibt es
  // mit ?ansicht=tabelle. Gibt es noch keine, steht der leere Arbeitsplatz da.
  let leer=false;
  if(istEinstieg(request)){
    const {data:erste}=await supabase.from("property_reservations").select("id").is("archived_at",null).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(erste?.id) throw redirect(`/reservations/${erste.id}`,{headers:responseHeaders()});
    leer=true;
  }
  const url=new URL(request.url);
  const filters={q:(url.searchParams.get("q")??"").trim(),view:url.searchParams.get("view")??"ACTIVE",propertyId:url.searchParams.get("property_id")??""};
  const [{data:rows,error},{data:properties},{data:offers},{data:profiles},{data:canWrite},{data:canArchive},{data:canTask}]=await Promise.all([
    supabase.from("property_reservations").select("*,properties!inner(id,property_number,internal_title,status),contacts!inner(id,contact_number,first_name,last_name),purchase_offers(id,offer_number,amount)").order("created_at",{ascending:false}).limit(400),
    supabase.from("properties").select("id,property_number,internal_title,status").eq("transaction_type","SALE").not("status","in","(SOLD,LOST,WITHDRAWN,ARCHIVED)").order("updated_at",{ascending:false}).limit(500),
    supabase.from("purchase_offers").select("id,offer_number,property_id,contact_id,amount,status").is("archived_at",null).order("created_at",{ascending:false}).limit(500),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.rpc("current_user_has_permission",{p_permission:"reservation.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"reservation.archive"}),
    supabase.rpc("current_user_has_permission",{p_permission:"task.write"}),
  ]);
  if(error)throw new Response("Reservierungen konnten nicht geladen werden.",{status:500,headers:responseHeaders()});
  const all=(rows??[]) as any[];
  const summary={
    active:all.filter((row)=>row.status==="ACTIVE"&&!row.archived_at).length,
    expiring:all.filter((row)=>row.status==="ACTIVE"&&!row.archived_at&&row.reserved_until>=today()&&row.reserved_until<=new Date(Date.now()+14*864e5).toISOString().slice(0,10)).length,
    expired:all.filter((row)=>reservationExpired(row)&&!row.archived_at).length,
    undocumented:all.filter((row)=>row.status==="ACTIVE"&&!row.archived_at&&!row.agreement_documented).length,
    converted:all.filter((row)=>row.status==="CONVERTED").length,
  };
  const needle=filters.q.toLocaleLowerCase("de-DE");
  const filtered=all.filter((row)=>{
    const property=one(row.properties),contact=one(row.contacts);
    if(filters.propertyId&&row.property_id!==filters.propertyId)return false;
    if(filters.view==="ACTIVE"&&(row.archived_at||row.status!=="ACTIVE"))return false;
    if(filters.view==="EXPIRED"&&!reservationExpired(row))return false;
    if(filters.view==="ARCHIVED"&&!row.archived_at)return false;
    if(!["ACTIVE","ALL","EXPIRED","ARCHIVED"].includes(filters.view)&&row.status!==filters.view)return false;
    if(!needle)return true;
    return [row.reservation_number,property?.property_number,property?.internal_title,contactLabel(contact)].filter(Boolean).join(" ").toLocaleLowerCase("de-DE").includes(needle);
  });
  return data({leer,neu:url.searchParams.get("neu")==="1",rows:filtered,summary,filters,properties:properties??[],offers:offers??[],profiles:profiles??[],canWrite:canWrite===true,canArchive:canArchive===true,canTask:canTask===true},{headers:responseHeaders()});
}

export async function action(args:Route.ActionArgs){
  return reservierungAktion(args);
}

/** Das Anlegeformular -- in der Liste zum Aufklappen, im leeren Arbeitsplatz offen. */
function ReservierungAnlegen({d}:{d:any}){
  return <Form method="post" className="reservierung-anlegen">
    <input type="hidden" name="_intent" value="create"/>
    <div className="form-grid">
      <label className="form-field"><span>Immobilie *</span><select name="property_id" defaultValue={d.filters.propertyId} required><option value="">Auswählen…</option>{d.properties.map((p:any)=><option value={p.id} key={p.id}>{p.property_number} · {p.internal_title}</option>)}</select><small className="subtle">Nur Verkaufsobjekte, die noch nicht verkauft sind.</small></label>
      <KontaktAuswahl name="contact_id" beschriftung="Interessent" pflicht/>
      <label className="form-field"><span>Reserviert ab</span><input name="reserved_from" type="date" defaultValue={today()}/></label>
      <label className="form-field"><span>Reserviert bis *</span><input name="reserved_until" type="date" required/></label>
      <label className="form-field"><span>Reservierter Preis €</span><input name="reserved_price" inputMode="decimal"/></label>
      <label className="form-field"><span>Vereinbarung dokumentiert</span><select name="agreement_documented" defaultValue="no"><option value="no">Nein</option><option value="yes">Ja</option></select></label>
      <label className="form-field"><span>Reservierungsentgelt €</span><input name="fee_amount" inputMode="decimal"/><small className="subtle">Nur erfassbar, wenn die Vereinbarung dokumentiert ist.</small></label>
      <label className="form-field"><span>Verantwortlich</span><select name="primary_responsible_user" defaultValue="">{d.profiles.map((p:any)=><option value={p.user_id} key={p.user_id}>{p.display_name}</option>)}</select></label>
    </div>
    <label className="form-field full-width"><span>Bedingungen</span><textarea name="conditions" rows={3} placeholder="Was für die Dauer der Reservierung gilt"/></label>
    <label className="form-field full-width"><span>Notiz zum Entgelt</span><input name="fee_note"/></label>
    <label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={2}/></label>
    <div className="form-actions"><button className="primary-button" type="submit">Reservierung anlegen</button></div>
  </Form>;
}

export default function Reservations(){
  const d=useLoaderData<typeof loader>();
  const r=useActionData<typeof action>();
  const rows=d.rows as any[];

  if(d.leer) return <LeererArbeitsplatz listenName="Reservierungsliste" einzahl="Reservierung" mehrzahl="Reservierungen" suchePlatzhalter="Nummer, Objekt, Interessent …"
    neu={d.canWrite?{pfad:"#anlegen",beschriftung:"+ Neu"}:undefined} volleListe="/reservations?ansicht=tabelle" titel="Noch keine Reservierung">
    {r?.error?<div className="form-error">{r.error}</div>:null}
    {d.canWrite?<section className="data-card" id="anlegen"><div className="card-head"><div><h2>Erste Reservierung anlegen</h2></div></div><ReservierungAnlegen d={d}/></section>
      :<p className="programm-liste-leer">Noch keine Reservierung erfasst.</p>}
    <ReservierungHinweis/>
  </LeererArbeitsplatz>;

  // Programmliste (13.10.2026) wie die Makleraufträge: Werkzeugleiste, eine
  // Zeile Kennzahlen, Tabelle; jede Zeile oeffnet die Akte.
  return <main className="editor-shell programm-liste">
    <Form method="get" className="programm-liste-werkzeuge" role="search">
      <input type="hidden" name="ansicht" value="tabelle"/>
      <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={d.filters.q} placeholder="Reservierung, Objekt oder Interessent …" autoComplete="off"/></label>
      <label><span className="sr-only">Ansicht</span><select name="view" defaultValue={d.filters.view}><option value="ACTIVE">Aktive</option><option value="EXPIRED">Frist überschritten</option><option value="ALL">Alle</option>{Object.entries(RESERVATION_STATUS).map(([v,l])=><option value={v} key={v}>{l}</option>)}<option value="ARCHIVED">Archiviert</option></select></label>
      <label><span className="sr-only">Immobilie</span><select name="property_id" defaultValue={d.filters.propertyId}><option value="">Alle Immobilien</option>{d.properties.map((p:any)=><option value={p.id} key={p.id}>{p.property_number} · {p.internal_title}</option>)}</select></label>
      <button className="secondary-button" type="submit">Filtern</button>
      <span className="programm-liste-zaehler">{rows.length} {rows.length===1?"Reservierung":"Reservierungen"}</span>
      {d.canWrite?<Link className="programm-liste-neu" to="/reservations?ansicht=tabelle&neu=1#anlegen">+ Neue Reservierung</Link>:null}
    </Form>

    {r?.error?<div className="form-error">{r.error}</div>:null}

    <p className="programm-kennzahlen">
      <span><strong>{d.summary.active}</strong> aktiv</span>
      <span className={d.summary.expiring?"warnung":undefined}><strong>{d.summary.expiring}</strong> laufen in 14 Tagen ab</span>
      <span className={d.summary.expired?"warnung":undefined}><strong>{d.summary.expired}</strong> Frist überschritten</span>
      <span><strong>{d.summary.undocumented}</strong> ohne dokumentierte Vereinbarung</span>
      <span><strong>{d.summary.converted}</strong> in Verkauf übergegangen</span>
    </p>

    {d.canWrite&&d.neu?<section className="data-card programm-abschnitt" id="anlegen"><div className="card-head"><div><h2>Neue Reservierung</h2></div><Link className="subtle-link" to="/reservations?ansicht=tabelle">Abbrechen</Link></div><ReservierungAnlegen d={d}/></section>:null}

    <div className="programm-tabelle-rahmen">
      {rows.length===0?<p className="programm-liste-leer">Keine Reservierungen in dieser Ansicht.</p>:<table className="programm-tabelle">
        <thead><tr><th>Nummer</th><th>Objekt</th><th>Interessent</th><th>Stand</th><th>Zeitraum</th><th className="rechts">Preis</th><th>Vereinbarung</th><th>Beendet</th></tr></thead>
        <tbody>{rows.map((row:any)=>{
          const property=one(row.properties),contact=one(row.contacts),offer=one(row.purchase_offers);
          const stand=reservierungStand(row);
          const pfad=`/reservations/${row.id}`;
          return <tr key={row.id}>
            <td className="zahl"><Link to={pfad}>{row.reservation_number}</Link></td>
            <td><Link to={pfad}>{property?.property_number} · {property?.internal_title}</Link></td>
            <td>{contactLabel(contact)}{offer?<div className="leise">Angebot {offer.offer_number}</div>:null}</td>
            <td><span className={`status-pill ${stand.klasse}`}>{stand.text}</span></td>
            <td className="zahl">{formatDate(row.reserved_from)} – {formatDate(row.reserved_until)}</td>
            <td className="zahl rechts">{row.reserved_price!=null?money(row.reserved_price):"—"}</td>
            <td>{row.agreement_documented?<>dokumentiert{row.fee_amount!=null?<div className="leise">Entgelt {money(row.fee_amount)}</div>:null}</>:<span className="leise">nicht dokumentiert</span>}</td>
            <td className="zahl">{row.ended_on?formatDate(row.ended_on):"—"}</td>
          </tr>;
        })}</tbody>
      </table>}
    </div>

    <section className="programm-abschnitt"><ReservierungHinweis/></section>
  </main>;
}
