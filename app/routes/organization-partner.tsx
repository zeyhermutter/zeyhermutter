import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/organization-partner";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

const REGULATED:Record<string,string>={NONE:"Keine regulierte Berufsgruppe",LAWYER:"Rechtsanwalt",NOTARY:"Notar",TAX_ADVISOR:"Steuerberater",AUDITOR:"Wirtschaftsprüfer",OTHER_REGULATED:"Andere regulierte Berufsgruppe"};
const COMPLIANCE:Record<string,string>={COMMISSION_POSSIBLE:"Vergütung grundsätzlich möglich",NO_COMMISSION:"Keine Vergütung",LEGAL_REVIEW_REQUIRED:"Rechtliche Prüfung erforderlich",COOPERATION_ONLY:"Nur Kooperation ohne Vergütung"};
const COMPLIANCE_CLASS:Record<string,string>={COMMISSION_POSSIBLE:"status-sold",NO_COMMISSION:"status-archived",LEGAL_REVIEW_REQUIRED:"status-draft",COOPERATION_ONLY:"status-archived"};
const PRICE_LEVEL:Record<string,string>={LOW:"Günstig",MEDIUM:"Mittel",HIGH:"Hochpreisig",UNKNOWN:"Unbekannt"};
const FEE_STATUS:Record<string,string>={AGREED:"Zugesagt",INVOICED:"In Rechnung",PAID:"Gezahlt",CANCELLED:"Storniert"};

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function intOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number.parseInt(raw,10);return Number.isFinite(n)?n:NaN;}
function money(value:any){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(n):"—";}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function stars(value:any){const n=Number(value);return Number.isFinite(n)&&n>=1?`${"★".repeat(n)}${"☆".repeat(5-n)}`:"—";}
function today(){return new Date().toISOString().slice(0,10);}

/**
 * Die Sperre für regulierte Berufsgruppen wird in der Datenbank durchgesetzt.
 * Diese Funktion sagt nur, warum die Oberfläche das Feld gar nicht erst
 * anbietet — damit die Begründung im Klartext an der Stelle steht, an der
 * jemand die Vergütung erfassen würde.
 */
export function commissionBlockReason(profile:any){
  if(!profile)return "Für diese Organisation ist noch kein Partnerprofil erfasst.";
  if(profile.regulated_profession&&profile.regulated_profession!=="NONE")
    return `Dieser Partner ist als ${REGULATED[profile.regulated_profession]??"regulierte Berufsgruppe"} gekennzeichnet. Regulierte Berufsgruppen werden nicht in ein Vergütungsmodell aufgenommen.`;
  if(profile.blocked)return "Dieser Partner ist gesperrt.";
  if(profile.compliance_status!=="COMMISSION_POSSIBLE")
    return `Der Compliance-Stand lautet „${COMPLIANCE[profile.compliance_status]??profile.compliance_status}". Eine Vergütung ist damit nicht hinterlegbar.`;
  return null;
}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("PARTNER_REGULATED_NO_COMMISSION")||message.includes("partner_profiles_regulated_no_commission_check"))
    return"Für eine regulierte Berufsgruppe lässt sich keine Vergütung vorsehen. Bitte einen anderen Compliance-Stand wählen.";
  if(message.includes("partner_profiles_commission_reviewed_check"))return"Eine Freigabe für Vergütungen braucht ein Prüfdatum und eine prüfende Person.";
  if(message.includes("partner_profiles_blocked_reason_check"))return"Zu einer Sperre gehört eine Begründung.";
  if(message.includes("partner_profiles_blocked_not_preferred_check"))return"Ein gesperrter Partner kann nicht zugleich bevorzugt sein.";
  if(message.includes("PARTNER_HAS_OPEN_FEES"))return"Zu diesem Partner sind noch Vergütungszusagen offen. Sie sind zuerst zu klären, bevor die Freigabe zurückgenommen wird.";
  if(message.includes("PARTNER_REVIEW_IN_FUTURE"))return"Das Prüfdatum darf nicht in der Zukunft liegen.";
  if(message.includes("PARTNER_LAST_ORDER_IN_FUTURE"))return"Der letzte Auftrag kann nicht in der Zukunft liegen.";
  if(message.includes("FEE_PARTNER_REGULATED"))return"Für eine regulierte Berufsgruppe wird keine Vergütung erfasst.";
  if(message.includes("FEE_PARTNER_NOT_CLEARED"))return"Für diesen Partner ist keine Vergütung freigegeben.";
  if(message.includes("FEE_PARTNER_BLOCKED"))return"Dieser Partner ist gesperrt.";
  if(message.includes("FEE_PARTNER_PROFILE_MISSING"))return"Für diese Organisation ist noch kein Partnerprofil erfasst.";
  if(message.includes("FEE_AGREED_IN_FUTURE"))return"Das Vereinbarungsdatum darf nicht in der Zukunft liegen.";
  return "Die Angaben konnten nicht gespeichert werden.";
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"organization.read");
  const organizationId=params.organizationId!;
  const {data:organization,error}=await supabase.from("organizations")
    .select("id,organization_number,name,legal_form,city,status").eq("id",organizationId).maybeSingle();
  if(error||!organization)throw new Response("Organisation nicht gefunden.",{status:404,headers:responseHeaders()});

  const [profileRes,feesRes,referralsRes,canWriteRes]=await Promise.all([
    supabase.from("partner_profiles").select("*,profiles!partner_profiles_compliance_reviewed_by_fkey(display_name)").eq("organization_id",organizationId).maybeSingle(),
    supabase.from("partner_referral_fees").select("*,leads(id,lead_number),properties(id,property_number)").eq("organization_id",organizationId).order("agreed_on",{ascending:false}),
    supabase.from("lead_acquisitions").select("id,response_on,leads(id,lead_number,status,valuation_appointment_at,converted_property_id)").eq("referrer_organization_id",organizationId).order("response_on",{ascending:false,nullsFirst:false}),
    supabase.rpc("current_user_has_permission",{p_permission:"organization.write"}),
  ]);
  const readError=[profileRes,feesRes,referralsRes].find((r)=>r.error)?.error;
  if(readError)throw new Response("Die Partnerdaten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  return data({
    profile,organization,
    partner:profileRes.data,
    fees:feesRes.data??[],
    referrals:referralsRes.data??[],
    canWrite:canWriteRes.data===true,
  },{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"organization.write");
  const organizationId=params.organizationId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const back=`/crm/organizations/${organizationId}/partner`;
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Das Partnerprofil wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="profile_save"){
    const regulated=text(fd,"regulated_profession")||"NONE";
    const compliance=text(fd,"compliance_status")||"LEGAL_REVIEW_REQUIRED";
    // Die Datenbank weist das ohnehin ab. Der Hinweis kommt hier, damit er in
    // Klartext am Formular steht und nicht als Fehlercode.
    if(regulated!=="NONE"&&compliance==="COMMISSION_POSSIBLE")
      return invalid(`Für ${REGULATED[regulated]??"eine regulierte Berufsgruppe"} lässt sich keine Vergütung vorsehen. Möglich sind „Keine Vergütung", „Rechtliche Prüfung erforderlich" oder „Nur Kooperation ohne Vergütung".`);
    const blocked=text(fd,"blocked")==="yes";
    const blockedReason=text(fd,"blocked_reason");
    if(blocked&&!blockedReason)return invalid("Zu einer Sperre gehört eine Begründung.");
    const preferred=text(fd,"preferred")==="yes";
    if(blocked&&preferred)return invalid("Ein gesperrter Partner kann nicht zugleich bevorzugt sein.");
    const orders=intOrNull(fd,"order_count");
    if(typeof orders==="number"&&!Number.isFinite(orders))return invalid("Die Anzahl der Aufträge ist keine gültige Zahl.");
    const ratings:Record<string,any>={};
    for(const key of ["rating_reliability","rating_quality","rating_speed"]){
      const raw=text(fd,key);
      ratings[key]=raw?Number.parseInt(raw,10):null;
      if(raw&&!Number.isFinite(ratings[key]))return invalid("Ungültige Bewertung.");
    }
    const payload:any={
      trade:text(fd,"trade")||null,
      service_area:text(fd,"service_area")||null,
      ...ratings,
      price_level:text(fd,"price_level")||"UNKNOWN",
      last_order_on:dateOrNull(fd,"last_order_on"),
      order_count:orders??0,
      preferred,blocked,
      blocked_reason:blocked?blockedReason:null,
      regulated_profession:regulated,
      compliance_status:compliance,
      compliance_note:text(fd,"compliance_note")||null,
      // Wer die Freigabe erteilt, ist die angemeldete Person und das heutige
      // Datum. Kein Auswahlfeld, damit die Freigabe nicht versehentlich einer
      // anderen Person zugeschrieben wird.
      compliance_reviewed_on:compliance==="COMMISSION_POSSIBLE"?today():dateOrNull(fd,"compliance_reviewed_on"),
      compliance_reviewed_by:compliance==="COMMISSION_POSSIBLE"?userId:(text(fd,"compliance_reviewed_by")||null),
      notes:text(fd,"notes")||null,
    };
    const profileId=text(fd,"profile_id");
    if(profileId){
      const {data:updated,error}=await supabase.from("partner_profiles").update(payload).eq("id",profileId).eq("version",Number(text(fd,"profile_version"))).select("id").maybeSingle();
      if(error)return fail(error); if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("partner_profiles").insert({...payload,organization_id:organizationId,created_by:userId,updated_by:userId});
      if(error)return fail(error);
    }
    return redirect(`${back}#profil`,{headers:responseHeaders()});
  }

  if(intent==="fee_add"){
    const amount=numOrNull(fd,"amount");
    if(amount===null||typeof amount!=="number"||!Number.isFinite(amount))return invalid("Bitte einen Betrag angeben.");
    const agreedOn=dateOrNull(fd,"agreed_on");
    if(!agreedOn)return invalid("Bitte das Datum der Vereinbarung angeben.");
    const {error}=await supabase.from("partner_referral_fees").insert({
      organization_id:organizationId,
      lead_id:text(fd,"lead_id")||null,
      amount,agreed_on:agreedOn,
      basis:text(fd,"basis")||null,
      status:text(fd,"status")||"AGREED",
      notes:text(fd,"notes")||null,
      created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(`${back}#verguetung`,{headers:responseHeaders()});
  }

  if(intent==="fee_cancel"){
    const {data:updated,error}=await supabase.from("partner_referral_fees").update({status:"CANCELLED"}).eq("id",text(fd,"fee_id")).eq("version",Number(text(fd,"fee_version"))).select("id").maybeSingle();
    if(error)return fail(error); if(!updated)return conflict();
    return redirect(`${back}#verguetung`,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

export default function OrganizationPartner(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<ActionResult>();
  const o=d.organization as any;
  const partner=d.partner as any;
  const disabled=!d.canWrite;
  const fees=(d.fees??[]) as any[];
  const referrals=(d.referrals??[]) as any[];
  const blockReason=commissionBlockReason(partner);
  const openFees=fees.filter((f)=>f.status==="AGREED"||f.status==="INVOICED");

  return <div className="editor-shell">
    <div className="editor-header">
      <div>
        <Link className="back-link" to={`/crm/organizations/${o.id}`}>← Organisation</Link>
        <p className="eyebrow">{o.organization_number}</p>
        <h1>Partner & Compliance</h1>
        <p className="subtle">{o.name}{o.city?` · ${o.city}`:""}</p>
      </div>
      <div className="inline-actions">
        {partner?<span className={`status-pill ${COMPLIANCE_CLASS[partner.compliance_status]??""}`}>{COMPLIANCE[partner.compliance_status]??partner.compliance_status}</span>:<span className="status-pill status-draft">Kein Profil</span>}
        {partner?.blocked?<span className="status-pill status-lost">Gesperrt</span>:null}
        {partner?.preferred?<span className="status-pill status-sold">Bevorzugt</span>:null}
      </div>
    </div>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <p className="form-warning">Erfassung und Kennzeichnung, keine rechtliche Bewertung. Das System entscheidet nicht, ob eine Zuwendung im Einzelfall zulässig ist. Es verhindert nur, dass eine regulierte Berufsgruppe ohne Weiteres in ein Vergütungsmodell gerät.</p>

    <section className="data-card" id="profil">
      <div className="card-head"><div><p className="eyebrow">Dienstleister</p><h2>Partnerprofil</h2></div>{partner?<span className="status-pill">Version {partner.version}</span>:null}</div>
      <Form method="post" className="form-grid">
        <input type="hidden" name="_intent" value="profile_save"/>
        <input type="hidden" name="profile_id" value={partner?.id??""}/>
        <input type="hidden" name="profile_version" value={partner?.version??0}/>
        <label className="form-field"><span>Gewerk</span><input name="trade" defaultValue={partner?.trade??""} disabled={disabled} placeholder="Malerbetrieb"/></label>
        <label className="form-field"><span>Einsatzgebiet</span><input name="service_area" defaultValue={partner?.service_area??""} disabled={disabled} placeholder="München Ost"/></label>
        <label className="form-field"><span>Zuverlässigkeit</span><select name="rating_reliability" defaultValue={partner?.rating_reliability??""} disabled={disabled}><option value="">—</option>{[1,2,3,4,5].map((n)=><option key={n} value={n}>{n}</option>)}</select></label>
        <label className="form-field"><span>Qualität</span><select name="rating_quality" defaultValue={partner?.rating_quality??""} disabled={disabled}><option value="">—</option>{[1,2,3,4,5].map((n)=><option key={n} value={n}>{n}</option>)}</select></label>
        <label className="form-field"><span>Geschwindigkeit</span><select name="rating_speed" defaultValue={partner?.rating_speed??""} disabled={disabled}><option value="">—</option>{[1,2,3,4,5].map((n)=><option key={n} value={n}>{n}</option>)}</select></label>
        <label className="form-field"><span>Preisniveau</span><select name="price_level" defaultValue={partner?.price_level??"UNKNOWN"} disabled={disabled}>{Object.entries(PRICE_LEVEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field"><span>Letzter Auftrag</span><input type="date" name="last_order_on" defaultValue={partner?.last_order_on??""} disabled={disabled}/></label>
        <label className="form-field"><span>Anzahl Aufträge</span><input name="order_count" defaultValue={partner?.order_count??0} disabled={disabled}/></label>
        <label className="form-field"><span>Bevorzugt</span><select name="preferred" defaultValue={partner?.preferred?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
        <label className="form-field"><span>Gesperrt</span><select name="blocked" defaultValue={partner?.blocked?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
        <label className="form-field full-width"><span>Grund der Sperre</span><input name="blocked_reason" defaultValue={partner?.blocked_reason??""} disabled={disabled}/><small className="subtle">Ohne Begründung wird eine Sperre nicht gespeichert.</small></label>
        <label className="form-field"><span>Regulierte Berufsgruppe</span><select name="regulated_profession" defaultValue={partner?.regulated_profession??"NONE"} disabled={disabled}>{Object.entries(REGULATED).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field"><span>Compliance-Stand</span><select name="compliance_status" defaultValue={partner?.compliance_status??"LEGAL_REVIEW_REQUIRED"} disabled={disabled}>{Object.entries(COMPLIANCE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><small className="subtle">Eine Freigabe für Vergütungen wird mit Ihrem Namen und dem heutigen Datum vermerkt.</small></label>
        <label className="form-field full-width"><span>Compliance-Notiz</span><textarea name="compliance_note" rows={2} defaultValue={partner?.compliance_note??""} disabled={disabled}/></label>
        <label className="form-field full-width"><span>Notizen</span><textarea name="notes" rows={2} defaultValue={partner?.notes??""} disabled={disabled}/></label>
        <div className="form-field full-width inline-actions"><button className="primary-button" type="submit" disabled={disabled}>Partnerprofil speichern</button></div>
      </Form>
      {partner?<dl className="detail-list" style={{marginTop:"0.75rem"}}>
        <div><dt>Bewertung</dt><dd>Zuverlässigkeit {stars(partner.rating_reliability)} · Qualität {stars(partner.rating_quality)} · Tempo {stars(partner.rating_speed)}</dd></div>
        <div><dt>Compliance geprüft</dt><dd>{partner.compliance_reviewed_on?`${formatDate(partner.compliance_reviewed_on)} durch ${partner.profiles?.display_name??"—"}`:"noch nicht geprüft"}</dd></div>
      </dl>:null}
    </section>

    <section className="data-card" id="verguetung">
      <div className="card-head"><div><p className="eyebrow">Empfehlungsvergütung</p><h2>Vergütung</h2></div><span className="status-pill">{fees.length}</span></div>

      {blockReason
        ?<p className="form-warning"><strong>Keine Vergütung hinterlegbar.</strong> {blockReason}</p>
        :<p className="form-success">Für diesen Partner ist eine Vergütung freigegeben. Das ist eine Kennzeichnung im CRM, keine rechtliche Beurteilung des Einzelfalls.</p>}

      {fees.length===0
        ?<p className="empty-state">Keine Vergütung erfasst.</p>
        :<div className="data-list">{fees.map((f:any)=>
          <div className="data-row" key={f.id}>
            <div><strong>{money(f.amount)}</strong><small>{formatDate(f.agreed_on)}{f.basis?` · ${f.basis}`:""}{f.leads?` · ${f.leads.lead_number}`:""}</small></div>
            <div className="row-meta"><span>{FEE_STATUS[f.status]??f.status}</span><small>{f.notes??""}</small></div>
            {f.status!=="CANCELLED"?<Form method="post"><input type="hidden" name="_intent" value="fee_cancel"/><input type="hidden" name="fee_id" value={f.id}/><input type="hidden" name="fee_version" value={f.version}/><button className="text-button" type="submit" disabled={disabled}>Stornieren</button></Form>:<span className="subtle">storniert</span>}
          </div>)}</div>}

      {blockReason?null:<Form method="post" className="form-grid" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="fee_add"/>
        <label className="form-field"><span>Betrag € *</span><input name="amount" disabled={disabled}/></label>
        <label className="form-field"><span>Vereinbart am *</span><input type="date" name="agreed_on" defaultValue={today()} disabled={disabled}/></label>
        <label className="form-field"><span>Grundlage</span><input name="basis" disabled={disabled} placeholder="Empfehlung Eigentümer"/></label>
        <label className="form-field"><span>Stand</span><select name="status" defaultValue="AGREED" disabled={disabled}>{Object.entries(FEE_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field full-width"><span>Notiz</span><input name="notes" disabled={disabled}/></label>
        <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Vergütung erfassen</button></div>
      </Form>}

      {openFees.length&&partner?.compliance_status==="COMMISSION_POSSIBLE"?<p className="subtle" style={{marginTop:"0.75rem"}}>Solange {openFees.length} {openFees.length===1?"Zusage":"Zusagen"} offen {openFees.length===1?"ist":"sind"}, lässt sich die Freigabe nicht zurücknehmen.</p>:null}
    </section>

    <section className="data-card" id="empfehlungen">
      <div className="card-head"><div><p className="eyebrow">Herkunft</p><h2>Empfehlungen</h2></div><span className="status-pill">{referrals.length}</span></div>
      {referrals.length===0
        ?<p className="empty-state">Diesem Partner ist noch kein Lead als Empfehlung zugeordnet. Die Zuordnung erfolgt in der Leadakte unter Herkunft.</p>
        :<div className="data-list">{referrals.map((r:any)=>
          <Link className="data-row data-row-link" to={`/leads/${r.leads?.id}`} key={r.id}>
            <div><strong>{r.leads?.lead_number}</strong><small>{r.response_on?formatDate(r.response_on):"ohne Datum"}</small></div>
            <div className="row-meta"><span>{r.leads?.status??"—"}</span><small>{r.leads?.valuation_appointment_at?"Bewertungstermin vereinbart":"kein Bewertungstermin"}{r.leads?.converted_property_id?" · in Immobilie überführt":""}</small></div>
            <span className="subtle-link">Öffnen →</span>
          </Link>)}</div>}
    </section>

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Vor produktiver Nutzung</p><h2>Anwaltlich abzunehmen</h2></div></div>
      <ul className="subtle">
        <li>Ob und in welcher Form eine Empfehlungsvergütung an einen bestimmten Partner zulässig ist.</li>
        <li>Welche Berufsgruppen über die hier gelisteten hinaus als reguliert zu behandeln sind.</li>
        <li>Ob und wann eine Vergütung gegenüber dem Kunden offenzulegen ist.</li>
        <li>Wie eine bestehende Zusage zu behandeln ist, wenn sich der Compliance-Stand eines Partners nachträglich ändert.</li>
      </ul>
    </section>
  </div>;
}
