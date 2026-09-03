import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/reservations";
import { requirePermission } from "~/lib/auth.server";
import { crmDateAtTimeToIso } from "~/lib/local-time";

type ActionResult={error?:string};

export const RESERVATION_STATUS:Record<string,string>={ACTIVE:"Aktiv",EXPIRED:"Abgelaufen",CONVERTED:"In Verkauf übergegangen",CANCELLED:"Aufgehoben"};
const STATUS_CLASS:Record<string,string>={ACTIVE:"status-marketing",EXPIRED:"status-archived",CONVERTED:"status-sold",CANCELLED:"status-lost"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function money(value:any){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n):"—";}
function today(){return new Date().toISOString().slice(0,10);}
function contactLabel(c:any){return c?`${c.last_name}, ${c.first_name}`:"";}

export function reservationExpired(row:any){return row.status==="ACTIVE"&&row.reserved_until<today();}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("RESERVATION_PROPERTY_NOT_FOUND"))return"Die gewählte Immobilie wurde nicht gefunden.";
  if(message.includes("RESERVATION_CONTACT_NOT_FOUND"))return"Der gewählte Interessent wurde nicht gefunden.";
  if(message.includes("RESERVATION_PROPERTY_NOT_RESERVABLE"))return"Diese Immobilie kann in ihrem aktuellen Status nicht reserviert werden.";
  if(message.includes("RESERVATION_OFFER_PROPERTY_MISMATCH"))return"Das gewählte Kaufangebot gehört nicht zu dieser Immobilie.";
  if(message.includes("RESERVATION_OFFER_CONTACT_MISMATCH"))return"Das gewählte Kaufangebot stammt nicht von diesem Interessenten.";
  if(message.includes("RESERVATION_END_DATE_IN_FUTURE"))return"Das Beendigungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("RESERVATION_END_BEFORE_START"))return"Die Reservierung kann nicht vor ihrem Beginn enden.";
  if(message.includes("RESERVATION_FEE_NEEDS_AGREEMENT"))return"Ein Reservierungsentgelt lässt sich nur erfassen, wenn die Vereinbarung dokumentiert ist.";
  if(message.includes("RESERVATION_CANNOT_REACTIVATE"))return"Eine beendete Reservierung kann nicht wieder aktiviert werden.";
  if(message.includes("property_reservations_one_active_idx"))return"Für diese Immobilie besteht bereits eine aktive Reservierung.";
  if(message.includes("property_reservations_period_check"))return"Das Ende der Reservierung kann nicht vor ihrem Beginn liegen.";
  if(message.includes("property_reservations_ended_check"))return"Zu einer beendeten Reservierung gehört ein Beendigungsdatum.";
  if(message.includes("property_reservations_active_check"))return"Eine aktive Reservierung hat kein Beendigungsdatum und keinen Beendigungsgrund.";
  if(message.includes("property_reservations_cancel_reason_check"))return"Für eine Aufhebung ist ein Grund erforderlich.";
  if(message.includes("ARCHIVE_PERMISSION_REQUIRED")||message.includes("reservation.archive"))return"Zum Archivieren fehlt die Berechtigung.";
  return "Die Reservierung konnte nicht gespeichert werden.";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"reservation.read");
  const url=new URL(request.url);
  const filters={q:(url.searchParams.get("q")??"").trim(),view:url.searchParams.get("view")??"ACTIVE",propertyId:url.searchParams.get("property_id")??""};
  const [{data:rows,error},{data:properties},{data:contacts},{data:offers},{data:profiles},{data:canWrite},{data:canArchive},{data:canTask}]=await Promise.all([
    supabase.from("property_reservations").select("*,properties!inner(id,property_number,internal_title,status),contacts!inner(id,contact_number,first_name,last_name),purchase_offers(id,offer_number,amount)").order("created_at",{ascending:false}).limit(400),
    supabase.from("properties").select("id,property_number,internal_title,status").eq("transaction_type","SALE").not("status","in","(SOLD,LOST,WITHDRAWN,ARCHIVED)").order("updated_at",{ascending:false}).limit(500),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
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
  return data({profile,rows:filtered,summary,filters,properties:properties??[],contacts:contacts??[],offers:offers??[],profiles:profiles??[],canWrite:canWrite===true,canArchive:canArchive===true,canTask:canTask===true},{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"reservation.write");
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Die Reservierung wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="create"){
    const propertyId=text(fd,"property_id"),contactId=text(fd,"contact_id");
    if(!propertyId)return invalid("Bitte eine Immobilie auswählen.");
    if(!contactId)return invalid("Bitte einen Interessenten auswählen.");
    const until=dateOrNull(fd,"reserved_until");
    if(!until)return invalid("Bitte ein Ablaufdatum angeben.");
    const price=numOrNull(fd,"reserved_price");
    if(typeof price==="number"&&!Number.isFinite(price))return invalid("Ungültiger reservierter Preis.");
    const fee=numOrNull(fd,"fee_amount");
    if(typeof fee==="number"&&!Number.isFinite(fee))return invalid("Ungültiges Reservierungsentgelt.");
    const documented=text(fd,"agreement_documented")==="yes";
    // Ein eingetragenes Entgelt darf nicht stillschweigend verschwinden, nur weil die
    // Vereinbarung nicht dokumentiert ist. Lieber abweisen als leise verwerfen.
    if(!documented&&(fee!==null||text(fd,"fee_note")))return invalid("Ein Reservierungsentgelt lässt sich nur erfassen, wenn die Vereinbarung dokumentiert ist. Bitte zuerst „Vereinbarung dokumentiert“ auf „Ja“ setzen oder die Angaben zum Entgelt leeren.");
    const {error}=await supabase.from("property_reservations").insert({
      property_id:propertyId,contact_id:contactId,
      purchase_offer_id:text(fd,"purchase_offer_id")||null,
      reserved_from:dateOrNull(fd,"reserved_from")??today(),
      reserved_until:until,
      reserved_price:price,
      conditions:text(fd,"conditions")||null,
      agreement_documented:documented,
      fee_amount:documented?fee:null,
      fee_note:documented?(text(fd,"fee_note")||null):null,
      primary_responsible_user:text(fd,"primary_responsible_user")||userId,
      internal_notes:text(fd,"internal_notes")||null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect("/reservations",{headers:responseHeaders()});
  }

  if(intent==="update"){
    const id=text(fd,"reservation_id");
    const until=dateOrNull(fd,"reserved_until");
    if(!until)return invalid("Bitte ein Ablaufdatum angeben.");
    const price=numOrNull(fd,"reserved_price");
    if(typeof price==="number"&&!Number.isFinite(price))return invalid("Ungültiger reservierter Preis.");
    const fee=numOrNull(fd,"fee_amount");
    if(typeof fee==="number"&&!Number.isFinite(fee))return invalid("Ungültiges Reservierungsentgelt.");
    const documented=text(fd,"agreement_documented")==="yes";
    if(!documented&&(fee!==null||text(fd,"fee_note")))return invalid("Ein Reservierungsentgelt lässt sich nur erfassen, wenn die Vereinbarung dokumentiert ist. Bitte zuerst „Vereinbarung dokumentiert“ auf „Ja“ setzen oder die Angaben zum Entgelt leeren.");
    const {data:updated,error}=await supabase.from("property_reservations").update({
      reserved_until:until,
      reserved_price:price,
      conditions:text(fd,"conditions")||null,
      agreement_documented:documented,
      fee_amount:documented?fee:null,
      fee_note:documented?(text(fd,"fee_note")||null):null,
      purchase_offer_id:text(fd,"purchase_offer_id")||null,
      primary_responsible_user:text(fd,"primary_responsible_user")||userId,
      internal_notes:text(fd,"internal_notes")||null,
    }).eq("id",id).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect("/reservations",{headers:responseHeaders()});
  }

  if(intent==="end"){
    const status=text(fd,"target_status");
    if(!["EXPIRED","CONVERTED","CANCELLED"].includes(status))return invalid("Ungültiger Beendigungsgrund.");
    const reason=text(fd,"end_reason");
    if(status==="CANCELLED"&&!reason)return invalid("Für eine Aufhebung ist ein Grund erforderlich.");
    const {data:updated,error}=await supabase.from("property_reservations").update({
      status,ended_on:dateOrNull(fd,"ended_on")??today(),end_reason:reason||null,
    }).eq("id",text(fd,"reservation_id")).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect("/reservations",{headers:responseHeaders()});
  }

  if(intent==="archive"||intent==="restore"){
    await requirePermission(request,context.cloudflare.env,"reservation.archive");
    const {data:updated,error}=await supabase.from("property_reservations")
      .update({archived_at:intent==="archive"?new Date().toISOString():null})
      .eq("id",text(fd,"reservation_id")).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect("/reservations",{headers:responseHeaders()});
  }

  if(intent==="reminder"){
    await requirePermission(request,context.cloudflare.env,"task.write");
    const {data:row}=await supabase.from("property_reservations")
      .select("reservation_number,property_id,contact_id,reserved_until,primary_responsible_user,status")
      .eq("id",text(fd,"reservation_id")).maybeSingle();
    if(!row)return invalid("Die Reservierung konnte nicht gelesen werden.");
    if((row as any).status!=="ACTIVE")return invalid("Für eine beendete Reservierung ist keine Wiedervorlage sinnvoll.");
    const dueAt=crmDateAtTimeToIso((row as any).reserved_until);
    if(!dueAt)return invalid("Das hinterlegte Ablaufdatum ist kein gültiges Datum.");
    const {error}=await supabase.from("tasks").insert({
      title:`Reservierung läuft ab · ${(row as any).reservation_number}`,
      description:"Vor Ablauf klären, ob die Reservierung verlängert wird, in einen Verkauf übergeht oder endet.",
      status:"OPEN",priority:"HIGH",due_at:dueAt,
      responsible_user:(row as any).primary_responsible_user,
      property_id:(row as any).property_id,
      contact_id:(row as any).contact_id,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect("/reservations",{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

export default function Reservations(){
  const d=useLoaderData<typeof loader>();
  const r=useActionData<typeof action>();
  const rows=d.rows as any[];
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Objekte & Verkauf</p><h1 className="editor-title">Reservierungen</h1><p className="editor-meta">Reservierungsvereinbarungen mit Zeitraum, Bedingungen und Ablauf je Immobilie.</p></div><div className="header-actions"><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div></header>

    {r?.error?<div className="form-error">{r.error}</div>:null}
    <div className="form-warning"><strong>Erfassung, keine rechtliche Bewertung.</strong> Reservierungsentgelte sind rechtlich heikel. Das System erfasst ein tatsächlich vereinbartes Entgelt nur, schlägt keines vor, berechnet nichts und sagt nichts darüber, ob es zulässig ist.</div>

    <section className="metric-grid">
      <article className="metric-card"><span>Aktive Reservierungen</span><strong>{d.summary.active}</strong><small>laufend</small></article>
      <article className="metric-card"><span>Läuft in 14 Tagen ab</span><strong>{d.summary.expiring}</strong><small>Verlängerung klären</small></article>
      <article className="metric-card"><span>Frist überschritten</span><strong>{d.summary.expired}</strong><small>noch als aktiv geführt</small></article>
      <article className="metric-card"><span>Ohne Vereinbarung</span><strong>{d.summary.undocumented}</strong><small>nicht dokumentiert</small></article>
      <article className="metric-card"><span>In Verkauf übergegangen</span><strong>{d.summary.converted}</strong><small>gesamt</small></article>
    </section>

    <section className="data-card"><Form method="get" className="filter-grid">
      <label><span>Suche</span><input name="q" defaultValue={d.filters.q} placeholder="Reservierung, Objekt oder Interessent"/></label>
      <label><span>Ansicht</span><select name="view" defaultValue={d.filters.view}><option value="ACTIVE">Aktive</option><option value="EXPIRED">Frist überschritten</option><option value="ALL">Alle</option>{Object.entries(RESERVATION_STATUS).map(([v,l])=><option value={v} key={v}>{l}</option>)}<option value="ARCHIVED">Archiviert</option></select></label>
      <label><span>Immobilie</span><select name="property_id" defaultValue={d.filters.propertyId}><option value="">Alle Immobilien</option>{d.properties.map((p:any)=><option value={p.id} key={p.id}>{p.property_number} · {p.internal_title}</option>)}</select></label>
      <button className="secondary-button" type="submit">Filtern</button>
    </Form></section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Verzeichnis</p><h2>{rows.length} Reservierungen</h2></div></div><div className="data-list">
      {rows.map((row:any)=>{
        const property=one(row.properties),contact=one(row.contacts),offer=one(row.purchase_offers);
        const expired=reservationExpired(row);
        return <div className="data-row" key={row.id}>
          <div><strong>{row.reservation_number} · {property?.property_number}</strong><small>{contactLabel(contact)}{offer?` · Angebot ${offer.offer_number}`:""}</small></div>
          <div className="row-meta"><span className={`status-pill ${row.archived_at?"status-archived":expired?"status-lost":STATUS_CLASS[row.status]}`}>{row.archived_at?"Archiviert":expired?"Frist überschritten":RESERVATION_STATUS[row.status]}</span><small>{formatDate(row.reserved_from)} – {formatDate(row.reserved_until)}</small></div>
          <div className="row-meta"><span>{money(row.reserved_price)}</span><small>{row.agreement_documented?`Vereinbarung dokumentiert${row.fee_amount!==null&&row.fee_amount!==undefined?` · Entgelt ${money(row.fee_amount)}`:""}`:"Vereinbarung nicht dokumentiert"}</small></div>
          <div className="row-meta"><span>{row.ended_on?`Beendet ${formatDate(row.ended_on)}`:"—"}</span><small>{row.end_reason?row.end_reason.slice(0,60):""}</small></div>
          <div className="inline-actions">
            {d.canTask&&row.status==="ACTIVE"&&!row.archived_at?<Form method="post"><input type="hidden" name="_intent" value="reminder"/><input type="hidden" name="reservation_id" value={row.id}/><button className="secondary-button" type="submit">Wiedervorlage</button></Form>:null}
            {d.canArchive?<Form method="post"><input type="hidden" name="_intent" value={row.archived_at?"restore":"archive"}/><input type="hidden" name="reservation_id" value={row.id}/><input type="hidden" name="version" value={row.version}/><button className="secondary-button" type="submit">{row.archived_at?"Wiederherstellen":"Archivieren"}</button></Form>:null}
          </div>
        </div>;
      })}
      {rows.length===0?<p className="empty-state">Keine Reservierungen in dieser Ansicht.</p>:null}
    </div></section>

    {rows.filter((row:any)=>!row.archived_at).map((row:any)=><section className="editor-card" key={`edit-${row.id}`}>
      <div className="card-head"><div><p className="eyebrow">{row.reservation_number}</p><h2>{one(row.properties)?.property_number} · {contactLabel(one(row.contacts))}</h2></div><span className={`status-pill ${STATUS_CLASS[row.status]}`}>{RESERVATION_STATUS[row.status]}</span></div>
      {d.canWrite&&row.status==="ACTIVE"?<Form method="post">
        <input type="hidden" name="_intent" value="update"/>
        <input type="hidden" name="reservation_id" value={row.id}/>
        <input type="hidden" name="version" value={row.version}/>
        <div className="form-grid">
          <label className="form-field"><span>Reserviert bis *</span><input name="reserved_until" type="date" defaultValue={row.reserved_until} required/></label>
          <label className="form-field"><span>Reservierter Preis €</span><input name="reserved_price" inputMode="decimal" defaultValue={row.reserved_price??""}/></label>
          <label className="form-field"><span>Vereinbarung dokumentiert</span><select name="agreement_documented" defaultValue={row.agreement_documented?"yes":"no"}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Reservierungsentgelt €</span><input name="fee_amount" inputMode="decimal" defaultValue={row.fee_amount??""}/><small className="subtle">Nur erfassbar, wenn die Vereinbarung dokumentiert ist.</small></label>
          <label className="form-field"><span>Kaufangebot</span><select name="purchase_offer_id" defaultValue={row.purchase_offer_id??""}><option value="">—</option>{d.offers.filter((o:any)=>o.property_id===row.property_id&&o.contact_id===row.contact_id).map((o:any)=><option value={o.id} key={o.id}>{o.offer_number} · {money(o.amount)}</option>)}</select></label>
        </div>
        <label className="form-field full-width"><span>Bedingungen</span><textarea name="conditions" rows={3} defaultValue={row.conditions??""}/></label>
        <label className="form-field full-width"><span>Notiz zum Entgelt</span><input name="fee_note" defaultValue={row.fee_note??""}/></label>
        <label className="form-field full-width"><span>Interne Notizen</span><textarea name="internal_notes" rows={2} defaultValue={row.internal_notes??""}/></label>
        <div className="form-actions"><button className="primary-button" type="submit">Reservierung speichern</button></div>
      </Form>:null}
      {d.canWrite&&row.status==="ACTIVE"?<Form method="post" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="end"/>
        <input type="hidden" name="reservation_id" value={row.id}/>
        <input type="hidden" name="version" value={row.version}/>
        <div className="card-head"><div><p className="eyebrow">Beenden</p><h3>Reservierung abschließen</h3></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Ergebnis *</span><select name="target_status" defaultValue="EXPIRED" required><option value="EXPIRED">Abgelaufen</option><option value="CONVERTED">In Verkauf übergegangen</option><option value="CANCELLED">Aufgehoben</option></select></label>
          <label className="form-field"><span>Beendet am</span><input name="ended_on" type="date" defaultValue={today()} max={today()}/></label>
        </div>
        <label className="form-field full-width"><span>Beendigungsgrund</span><textarea name="end_reason" rows={2} placeholder="Bei Aufhebung erforderlich"/></label>
        <div className="form-actions"><button className="secondary-button" type="submit">Reservierung beenden</button></div>
      </Form>:null}
    </section>)}

    {d.canWrite?<section className="editor-card"><div className="card-head"><div><p className="eyebrow">Neu</p><h2>Reservierung anlegen</h2></div></div>
      <Form method="post">
        <input type="hidden" name="_intent" value="create"/>
        <div className="form-grid">
          <label className="form-field"><span>Immobilie *</span><select name="property_id" defaultValue={d.filters.propertyId} required><option value="">Auswählen…</option>{d.properties.map((p:any)=><option value={p.id} key={p.id}>{p.property_number} · {p.internal_title}</option>)}</select><small className="subtle">Nur Verkaufsobjekte, die noch nicht verkauft sind.</small></label>
          <label className="form-field"><span>Interessent *</span><select name="contact_id" defaultValue="" required><option value="">Auswählen…</option>{d.contacts.map((c:any)=><option value={c.id} key={c.id}>{contactLabel(c)} · {c.contact_number}</option>)}</select></label>
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
      </Form>
    </section>:null}

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Vor produktiver Nutzung</p><h2>Anwaltlich abzunehmen</h2></div></div>
      <ul className="subtle">
        <li>Ob und unter welchen Voraussetzungen ein Reservierungsentgelt überhaupt vereinbart werden darf.</li>
        <li>Welche Form eine Reservierungsvereinbarung braucht und was sie regeln darf.</li>
        <li>Welche Wirkung eine Reservierung gegenüber anderen Interessenten hat.</li>
        <li>Wie ein vereinnahmtes Entgelt bei Nichtzustandekommen des Kaufs zu behandeln ist.</li>
      </ul>
    </section>
  </main>;
}
