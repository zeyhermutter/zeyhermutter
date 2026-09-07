import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/referral-detail";
import { requirePermission } from "~/lib/auth.server";
import { ACKNOWLEDGEMENT, REFERRAL_CHANNEL, REFERRAL_STATUS, REFERRAL_STATUS_CLASS, formatDay, one, referralErrorMessage, referredLabel, referrerLabel } from "./referrals";

type ActionResult={error?:string};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"referral.read");
  const id=params.referralId!;
  const {data:row,error}=await supabase.from("referrals")
    .select("*,referrer_contact:contacts!referrals_referrer_contact_id_fkey(id,contact_number,first_name,last_name,email,phone),referrer_organization:organizations!referrals_referrer_organization_id_fkey(id,name),referred_contact:contacts!referrals_referred_contact_id_fkey(id,contact_number,first_name,last_name),leads(id,lead_number,status),sale_closings(id,closing_number),profiles!referrals_primary_responsible_user_fkey(user_id,display_name)")
    .eq("id",id).maybeSingle();
  if(error||!row)throw new Response("Empfehlung nicht gefunden.",{status:404,headers:responseHeaders()});

  const r=row as any;
  const [leadsRes,profilesRes,contactsRes,acquisitionRes,canWriteRes,canArchiveRes]=await Promise.all([
    supabase.from("leads").select("id,lead_number,status,contacts(first_name,last_name)").is("archived_at",null).order("lead_number",{ascending:false}).limit(400),
    supabase.from("profiles").select("user_id,display_name").eq("status","ACTIVE").order("display_name"),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    r.resulting_lead_id
      ?supabase.from("lead_acquisitions").select("id,referrer_contact_id,referrer_organization_id,campaign_id").eq("lead_id",r.resulting_lead_id).maybeSingle()
      :Promise.resolve({data:null,error:null}),
    supabase.rpc("current_user_has_permission",{p_permission:"referral.write"}),
    supabase.rpc("current_user_has_permission",{p_permission:"referral.archive"}),
  ]);
  if(leadsRes.error)throw new Response("Die Leads konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  const acquisition=acquisitionRes.data as any;
  const referrerId=r.referrer_organization_id??r.referrer_contact_id;
  const acquisitionId=acquisition?(acquisition.referrer_organization_id??acquisition.referrer_contact_id):null;
  const attributionMatches=Boolean(acquisition)&&acquisitionId===referrerId;

  return data({profile,row:r,leads:leadsRes.data??[],profiles:profilesRes.data??[],contacts:contactsRes.data??[],
    hasAcquisition:Boolean(acquisition),attributionMatches,
    canWrite:canWriteRes.data===true,canArchive:canArchiveRes.data===true},{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders}=await requirePermission(request,context.cloudflare.env,"referral.write");
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const id=params.referralId!;
  const version=Number(text(fd,"version"));
  const conflict=()=>data<ActionResult>({error:"Die Empfehlung wurde inzwischen geändert. Bitte neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="core_save"){
    const payload={
      occasion:text(fd,"occasion")||null,
      channel:text(fd,"channel")||null,
      received_on:dateOrNull(fd,"received_on"),
      referred_name:text(fd,"referred_name")||null,
      referred_contact_id:text(fd,"referred_contact_id")||null,
      referred_note:text(fd,"referred_note")||null,
      notes:text(fd,"notes")||null,
      primary_responsible_user:text(fd,"primary_responsible_user")||null,
    };
    if(!payload.received_on)return data<ActionResult>({error:"Bitte ein gültiges Eingangsdatum angeben."},{status:400,headers:responseHeaders()});
    const {data:updated,error}=await supabase.from("referrals").update(payload).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:referralErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/referrals/${id}`,{headers:responseHeaders()});
  }

  if(intent==="outcome_save"){
    const payload={
      status:text(fd,"status"),
      resulting_lead_id:text(fd,"resulting_lead_id")||null,
      outcome_note:text(fd,"outcome_note")||null,
    };
    const {data:updated,error}=await supabase.from("referrals").update(payload).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:referralErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/referrals/${id}#ergebnis`,{headers:responseHeaders()});
  }

  if(intent==="thanks_save"){
    const payload={
      acknowledged_on:dateOrNull(fd,"acknowledged_on"),
      acknowledgement_kind:text(fd,"acknowledgement_kind")||null,
    };
    const {data:updated,error}=await supabase.from("referrals").update(payload).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:referralErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/referrals/${id}#dank`,{headers:responseHeaders()});
  }

  if(intent==="archive"||intent==="restore"){
    await requirePermission(request,context.cloudflare.env,"referral.archive");
    const {data:updated,error}=await supabase.from("referrals")
      .update({archived_at:intent==="archive"?new Date().toISOString():null}).eq("id",id).eq("version",version).select("id").maybeSingle();
    if(error)return data<ActionResult>({error:referralErrorMessage(String(error.message??""))},{status:400,headers:responseHeaders()});
    if(!updated)return conflict();
    return redirect(`/referrals/${id}`,{headers:responseHeaders()});
  }

  return data<ActionResult>({error:"Unbekannte Aktion."},{status:400,headers:responseHeaders()});
}

export default function ReferralDetail(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<typeof action>();
  const row=d.row as any;
  const disabled=!d.canWrite||Boolean(row.archived_at);
  const lead=one(row.leads);
  const closing=one(row.sale_closings);
  const referrerContact=one(row.referrer_contact);

  return <main className="editor-shell">
    <header className="editor-header">
      <div>
        <Link className="back-link" to="/referrals">← Empfehlungen</Link>
        <p className="eyebrow">{row.referral_number}</p>
        <h1 className="editor-title">{referrerLabel(row)}</h1>
        <p className="editor-meta">empfiehlt {referredLabel(row)} · eingegangen {formatDay(row.received_on)}</p>
      </div>
      <div className="header-actions">
        <span className={`status-pill ${REFERRAL_STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":REFERRAL_STATUS[row.status]??row.status}</span>
        <span className="status-pill">Version {row.version}</span>
      </div>
    </header>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    {row.resulting_lead_id&&!d.attributionMatches?<div className="form-warning">
      <strong>Die Herkunft des Leads passt nicht zu dieser Empfehlung</strong>
      <p>{d.hasAcquisition
        ?"Die Herkunft des Leads nennt einen anderen Empfehlenden. Für die Kampagnen- und Partnerauswertung zählt die Herkunft am Lead."
        :"Zum Lead ist keine Herkunft erfasst. Die Empfehlung erscheint deshalb in keiner Partnerauswertung."}</p>
      <p><Link className="subtle-link" to={`/leads/${row.resulting_lead_id}#herkunft`}>Herkunft am Lead öffnen →</Link></p>
    </div>:null}

    <div className="dashboard-grid property-section">
      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Rahmen</p><h2>Empfehlung</h2></div></div>
        <Form method="post" className="form-grid">
          <input type="hidden" name="_intent" value="core_save"/>
          <input type="hidden" name="version" value={row.version}/>
          <label className="form-field"><span>Eingegangen am</span><input type="date" name="received_on" defaultValue={row.received_on??""} disabled={disabled}/></label>
          <label className="form-field"><span>Weg</span>
            <select name="channel" defaultValue={row.channel??""} disabled={disabled}>
              <option value="">—</option>
              {Object.entries(REFERRAL_CHANNEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="form-field full-width"><span>Anlass</span><input name="occasion" defaultValue={row.occasion??""} disabled={disabled}/></label>
          <label className="form-field"><span>Empfohlener Kontakt</span>
            <select name="referred_contact_id" defaultValue={row.referred_contact_id??""} disabled={disabled}>
              <option value="">— noch nicht angelegt</option>
              {(d.contacts as any[]).map((c:any)=><option key={c.id} value={c.id}>{c.last_name}, {c.first_name} · {c.contact_number}</option>)}
            </select>
          </label>
          <label className="form-field"><span>oder Name</span><input name="referred_name" defaultValue={row.referred_name??""} disabled={disabled}/></label>
          <label className="form-field full-width"><span>Notiz zum Empfohlenen</span><textarea name="referred_note" rows={2} defaultValue={row.referred_note??""} disabled={disabled}/></label>
          <label className="form-field"><span>Zuständig</span>
            <select name="primary_responsible_user" defaultValue={row.primary_responsible_user??""} disabled={disabled}>
              <option value="">—</option>
              {(d.profiles as any[]).map((p:any)=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}
            </select>
          </label>
          <label className="form-field full-width"><span>Interne Notiz</span><textarea name="notes" rows={2} defaultValue={row.notes??""} disabled={disabled}/></label>
          <div className="form-field full-width inline-actions"><button className="primary-button" type="submit" disabled={disabled}>Empfehlung speichern</button></div>
        </Form>
      </section>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Überblick</p><h2>Stand</h2></div></div>
        <dl className="detail-list">
          <div><dt>Empfehlender</dt><dd>{referrerContact
            ?<Link className="subtle-link" to={`/crm/contacts/${referrerContact.id}`}>{referrerLabel(row)} →</Link>
            :one(row.referrer_organization)
              ?<Link className="subtle-link" to={`/crm/organizations/${one(row.referrer_organization).id}/partner`}>{referrerLabel(row)} →</Link>
              :"—"}</dd></div>
          <div><dt>Empfohlen</dt><dd>{one(row.referred_contact)
            ?<Link className="subtle-link" to={`/crm/contacts/${one(row.referred_contact).id}`}>{referredLabel(row)} →</Link>
            :referredLabel(row)}</dd></div>
          <div><dt>Aus Abschluss</dt><dd>{closing?<Link className="subtle-link" to={`/closings/${closing.id}`}>{closing.closing_number} →</Link>:"ohne Bezug"}</dd></div>
          <div><dt>Entstandener Lead</dt><dd>{lead?<Link className="subtle-link" to={`/leads/${lead.id}`}>{lead.lead_number} →</Link>:"keiner"}</dd></div>
          <div><dt>Dank</dt><dd>{row.acknowledged_on?`${ACKNOWLEDGEMENT[row.acknowledgement_kind]??"dokumentiert"} · ${formatDay(row.acknowledged_on)}`:"nicht dokumentiert"}</dd></div>
          <div><dt>Zuständig</dt><dd>{one(row.profiles)?.display_name??"—"}</dd></div>
        </dl>
      </section>
    </div>

    <div className="dashboard-grid property-section">
      <section className="data-card" id="ergebnis">
        <div className="card-head"><div><p className="eyebrow">Was daraus wurde</p><h2>Ergebnis</h2></div></div>
        <Form method="post" className="form-grid">
          <input type="hidden" name="_intent" value="outcome_save"/>
          <input type="hidden" name="version" value={row.version}/>
          <label className="form-field"><span>Stand</span>
            <select name="status" defaultValue={row.status} disabled={disabled}>
              {Object.entries(REFERRAL_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="form-field"><span>Entstandener Lead</span>
            <select name="resulting_lead_id" defaultValue={row.resulting_lead_id??""} disabled={disabled}>
              <option value="">— keiner</option>
              {(d.leads as any[]).map((l:any)=>{const c=one(l.contacts);return <option key={l.id} value={l.id}>{l.lead_number}{c?` · ${c.last_name}, ${c.first_name}`:""}</option>;})}
            </select>
          </label>
          <label className="form-field full-width"><span>Begründung / Ergebnisnotiz</span><textarea name="outcome_note" rows={2} defaultValue={row.outcome_note??""} disabled={disabled}/></label>
          <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Ergebnis speichern</button></div>
          <p className="form-field full-width subtle">„Lead entstanden", „Auftrag gewonnen" und „Nicht zustande gekommen" setzen einen zugeordneten Lead voraus. Die Herkunft des Leads wird davon nicht automatisch geändert.</p>
        </Form>
      </section>

      <section className="data-card" id="dank">
        <div className="card-head"><div><p className="eyebrow">Rückmeldung an den Empfehlenden</p><h2>Dank</h2></div></div>
        <Form method="post" className="form-grid">
          <input type="hidden" name="_intent" value="thanks_save"/>
          <input type="hidden" name="version" value={row.version}/>
          <label className="form-field"><span>Art</span>
            <select name="acknowledgement_kind" defaultValue={row.acknowledgement_kind??""} disabled={disabled}>
              <option value="">—</option>
              {Object.entries(ACKNOWLEDGEMENT).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="form-field"><span>Am</span><input type="date" name="acknowledged_on" defaultValue={row.acknowledged_on??""} disabled={disabled}/></label>
          <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Dank speichern</button></div>
          <p className="form-field full-width subtle">Ob eine Vergütung an diesen Empfehlenden zulässig ist, entscheidet die Compliance-Kennzeichnung des Partners — nicht dieses Feld.</p>
        </Form>
      </section>
    </div>

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Verwaltung</p><h2>Archiv</h2></div></div>
      {d.canArchive
        ?<Form method="post" className="inline-actions">
          <input type="hidden" name="_intent" value={row.archived_at?"restore":"archive"}/>
          <input type="hidden" name="version" value={row.version}/>
          <button className="secondary-button" type="submit">{row.archived_at?"Wiederherstellen":"Archivieren"}</button>
        </Form>
        :<p className="empty-state">Archivieren ist Geschäftsführungs- und Adminfunktion.</p>}
    </section>
  </main>;
}
