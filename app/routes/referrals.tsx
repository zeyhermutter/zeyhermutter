import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/referrals";
import { Aufklapper } from "~/components/aufklapper";
import "~/programm-liste.css";
import { KontaktAuswahl } from "~/components/kontakt-auswahl";
import { requirePermission } from "~/lib/auth.server";
import { tag } from "~/lib/format";

type ActionResult={error?:string};

export const REFERRAL_STATUS:Record<string,string>={OPEN:"Offen",CONTACTED:"Kontakt aufgenommen",DECLINED:"Kein Interesse",LEAD_CREATED:"Lead entstanden",WON:"Auftrag gewonnen",LOST:"Nicht zustande gekommen"};
export const REFERRAL_STATUS_CLASS:Record<string,string>={OPEN:"status-draft",CONTACTED:"status-marketing",DECLINED:"status-archived",LEAD_CREATED:"status-marketing",WON:"status-sold",LOST:"status-lost"};
export const REFERRAL_CHANNEL:Record<string,string>={PHONE:"Telefon",EMAIL:"E-Mail",IN_PERSON:"Persönlich",WEB_FORM:"Formular",LETTER:"Brief",EVENT:"Veranstaltung",OTHER:"Sonstiges"};
export const ACKNOWLEDGEMENT:Record<string,string>={THANK_YOU_NOTE:"Dankschreiben",CALL:"Anruf",GIFT:"Aufmerksamkeit",FEE:"Vergütung",NONE:"Bewusst nichts"};

export function one(v:any){return Array.isArray(v)?v[0]:v;}
export const formatDay = tag;
export function plural(count:number,one:string,many:string){return `${count} ${count===1?one:many}`;}

export function referrerLabel(row:any){
  const org=one(row.referrer_organization);
  const contact=one(row.referrer_contact);
  if(org)return org.name;
  if(contact)return `${contact.last_name}, ${contact.first_name}`;
  return "Unbekannt";
}

export function referredLabel(row:any){
  const contact=one(row.referred_contact);
  if(contact)return `${contact.last_name}, ${contact.first_name}`;
  return row.referred_name??"Ohne Namen";
}

export function referralErrorMessage(message:string){
  if(message.includes("REFERRAL_STATUS_NEEDS_LEAD"))return"Für diesen Stand muss der entstandene Lead zugeordnet sein.";
  if(message.includes("REFERRAL_SELF_REFERENCE"))return"Jemand kann sich nicht selbst empfehlen.";
  if(message.includes("REFERRAL_RECEIVED_IN_FUTURE"))return"Eine Empfehlung kann nicht in der Zukunft eingegangen sein.";
  if(message.includes("REFERRAL_ACKNOWLEDGED_BEFORE_RECEIVED"))return"Der Dank kann nicht vor dem Eingang der Empfehlung liegen.";
  if(message.includes("referrals_referrer_side_check"))return"Eine Empfehlung kommt entweder von einer Person oder von einer Organisation, nicht von beiden.";
  if(message.includes("referrals_referred_side_check"))return"Bitte angeben, wer empfohlen wurde — als Kontakt oder wenigstens mit Namen.";
  if(message.includes("referrals_declined_reason_check"))return"Zu „Kein Interesse\" gehört eine kurze Begründung.";
  if(message.includes("referrals_acknowledgement_dated_check"))return"Zu einer Art des Dankes gehört das Datum.";
  if(message.includes("referrals_lead_status_check"))return"Ein zugeordneter Lead passt nicht zu diesem Stand.";
  return"Die Empfehlung konnte nicht gespeichert werden.";
}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"referral.read");
  // Einstieg: gleich den obersten Datensatz im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if(istEinstieg(request)){const {data:erster}=await supabase.from("referrals").select("id").is("archived_at",null).order("updated_at",{ascending:false}).limit(1).maybeSingle(); if(erster)throw redirect(`/referrals/${erster.id}`,{headers:responseHeaders()});}
  const url=new URL(request.url);
  const filter=url.searchParams.get("status")??"OPEN";

  const [rowsRes,organizationsRes,closingsRes,gapsRes,canWriteRes]=await Promise.all([
    supabase.from("referrals")
      .select("id,referral_number,received_on,channel,status,occasion,acknowledged_on,acknowledgement_kind,archived_at,referred_name,referrer_contact:contacts!referrals_referrer_contact_id_fkey(id,first_name,last_name),referrer_organization:organizations!referrals_referrer_organization_id_fkey(id,name),referred_contact:contacts!referrals_referred_contact_id_fkey(id,first_name,last_name),leads(id,lead_number,status)")
      .order("received_on",{ascending:false}).limit(400),
    supabase.from("organizations").select("id,name").is("archived_at",null).order("name").limit(500),
    supabase.from("sale_closings").select("id,closing_number,properties!inner(property_number)").is("archived_at",null).order("updated_at",{ascending:false}).limit(200),
    supabase.rpc("referral_attribution_gaps"),
    supabase.rpc("current_user_has_permission",{p_permission:"referral.write"}),
  ]);
  // Lesefehler nicht verschlucken — eine leere Liste wäre hier eine falsche Aussage.
  if(rowsRes.error)throw new Response("Empfehlungen konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  const all=(rowsRes.data??[]) as any[];
  const rows=all.filter((row:any)=>
    filter==="ALL"?true
    :filter==="ARCHIVED"?Boolean(row.archived_at)
    :!row.archived_at&&(filter==="OPEN"?["OPEN","CONTACTED"].includes(row.status):row.status===filter));

  return data({profile,rows,total:all.filter((row:any)=>!row.archived_at).length,
    open:all.filter((row:any)=>!row.archived_at&&["OPEN","CONTACTED"].includes(row.status)).length,
    won:all.filter((row:any)=>!row.archived_at&&row.status==="WON").length,
    unthanked:all.filter((row:any)=>!row.archived_at&&!row.acknowledged_on&&row.status!=="OPEN").length,
    organizations:organizationsRes.data??[],closings:closingsRes.data??[],
    gaps:(gapsRes.data??[]) as any[],
    filter,canWrite:canWriteRes.data===true},{headers:responseHeaders()});
}

export async function action({request,context}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"referral.write");
  const fd=await request.formData();
  const side=String(fd.get("referrer_side")??"CONTACT");
  const referrerContact=String(fd.get("referrer_contact_id")??"").trim();
  const referrerOrganization=String(fd.get("referrer_organization_id")??"").trim();
  const referredContact=String(fd.get("referred_contact_id")??"").trim();
  const referredName=String(fd.get("referred_name")??"").trim();

  if(side==="CONTACT"&&!referrerContact)return data<ActionResult>({error:"Bitte die empfehlende Person auswählen."},{status:400,headers:responseHeaders()});
  if(side==="ORGANIZATION"&&!referrerOrganization)return data<ActionResult>({error:"Bitte die empfehlende Organisation auswählen."},{status:400,headers:responseHeaders()});
  if(!referredContact&&!referredName)return data<ActionResult>({error:"Bitte angeben, wer empfohlen wurde."},{status:400,headers:responseHeaders()});

  const received=String(fd.get("received_on")??"").trim();
  const {data:created,error}=await supabase.from("referrals").insert({
    referrer_contact_id:side==="CONTACT"?referrerContact:null,
    referrer_organization_id:side==="ORGANIZATION"?referrerOrganization:null,
    referred_contact_id:referredContact||null,
    referred_name:referredName||null,
    referred_note:String(fd.get("referred_note")??"").trim()||null,
    occasion:String(fd.get("occasion")??"").trim()||null,
    source_closing_id:String(fd.get("source_closing_id")??"").trim()||null,
    channel:String(fd.get("channel")??"").trim()||null,
    received_on:/^\d{4}-\d{2}-\d{2}$/.test(received)?received:new Date().toISOString().slice(0,10),
    primary_responsible_user:userId,created_by:userId,
  }).select("id").maybeSingle();
  if(error||!created)return data<ActionResult>({error:referralErrorMessage(String(error?.message??""))},{status:400,headers:responseHeaders()});
  return redirect(`/referrals/${created.id}`,{headers:responseHeaders()});
}

export default function Referrals(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<typeof action>();
  // Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026):
  // Werkzeugleiste, Kennzahlen, Tabelle. "Herkunft prüfen" bleibt als eigene
  // Tabelle darunter, das Formular im Aufklapper.
  return <main className="editor-shell programm-liste">
    <Form method="get" className="programm-liste-werkzeuge">
      <input type="hidden" name="ansicht" value="tabelle"/>
      <label><span className="sr-only">Ansicht</span><select name="status" defaultValue={d.filter}>
        <option value="OPEN">In Arbeit</option>
        <option value="ALL">Alle</option>
        {Object.entries(REFERRAL_STATUS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        <option value="ARCHIVED">Archiviert</option>
      </select></label>
      <button className="secondary-button" type="submit">Filtern</button>
      <span className="programm-liste-zaehler">{d.rows.length} {d.rows.length===1?"Empfehlung":"Empfehlungen"}</span>
    </Form>
    <p className="programm-kennzahlen">
      <span><strong>{d.total}</strong> erfasst</span>
      <span><strong>{d.open}</strong> in Arbeit</span>
      <span><strong>{d.won}</strong> gewonnen</span>
      <span className={d.unthanked?"warnung":undefined}><strong>{d.unthanked}</strong> ohne Dank</span>
    </p>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    {d.canWrite?<Aufklapper id="anlegen" knopf="+ Empfehlung erfassen" offen={Boolean(actionData?.error)}><section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Neu</p><h2>Empfehlung erfassen</h2></div></div>
      <Form method="post" className="form-grid">
        <label className="form-field"><span>Empfehlung kommt von</span>
          <select name="referrer_side" defaultValue="CONTACT">
            <option value="CONTACT">einer Person</option>
            <option value="ORGANIZATION">einer Organisation</option>
          </select>
        </label>
        <KontaktAuswahl name="referrer_contact_id" beschriftung="Person"/>
        <label className="form-field"><span>Organisation</span>
          <select name="referrer_organization_id" defaultValue="">
            <option value="">—</option>
            {(d.organizations as any[]).map((o:any)=><option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <KontaktAuswahl name="referred_contact_id" beschriftung="Empfohlener Kontakt" hinweis="Leer lassen, wenn die Person noch nicht angelegt ist."/>
        <label className="form-field"><span>oder Name</span><input name="referred_name" placeholder="z. B. Familie Schneider"/></label>
        <label className="form-field"><span>Eingegangen am</span><input type="date" name="received_on" defaultValue={new Date().toISOString().slice(0,10)}/></label>
        <label className="form-field"><span>Weg</span>
          <select name="channel" defaultValue="">
            <option value="">—</option>
            {Object.entries(REFERRAL_CHANNEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="form-field"><span>Aus welchem Abschluss</span>
          <select name="source_closing_id" defaultValue="">
            <option value="">— ohne Bezug</option>
            {(d.closings as any[]).map((c:any)=><option key={c.id} value={c.id}>{c.closing_number} · {one(c.properties)?.property_number}</option>)}
          </select>
        </label>
        <label className="form-field full-width"><span>Anlass</span><input name="occasion" placeholder="z. B. beim Nachfassen nach der Übergabe"/></label>
        <label className="form-field full-width"><span>Notiz zum Empfohlenen</span><textarea name="referred_note" rows={2}/></label>
        <div className="form-field full-width inline-actions"><button className="primary-button" type="submit">Empfehlung erfassen</button></div>
        <p className="form-field full-width subtle">Wähle entweder eine Person oder eine Organisation — je nachdem, was oben eingestellt ist. Die jeweils andere Auswahl bleibt unberücksichtigt.</p>
      </Form>
    </section></Aufklapper>:null}

    <div className="programm-tabelle-rahmen">
      {d.rows.length===0
        ?<p className="programm-liste-leer">In dieser Ansicht ist keine Empfehlung erfasst.</p>
        :<table className="programm-tabelle">
          <thead><tr><th scope="col">Nummer</th><th scope="col">Empfohlen von</th><th scope="col">Empfohlen</th><th scope="col">Anlass</th><th scope="col">Weg</th><th scope="col">Status</th><th scope="col">Ergebnis</th><th scope="col" className="rechts">Eingegangen</th></tr></thead>
          <tbody>{d.rows.map((row:any)=>{
            const lead=one(row.leads);
            return <tr key={row.id}>
              <td className="zahl"><Link to={`/referrals/${row.id}`}>{row.referral_number}</Link></td>
              <td><Link to={`/referrals/${row.id}`}>{referrerLabel(row)}</Link></td>
              <td>{referredLabel(row)}</td>
              <td>{row.occasion??<span className="leise">—</span>}</td>
              <td>{row.channel?REFERRAL_CHANNEL[row.channel]??row.channel:<span className="leise">offen</span>}</td>
              <td><span className={`status-pill ${REFERRAL_STATUS_CLASS[row.status]??"status-draft"}`}>{row.archived_at?"Archiviert":REFERRAL_STATUS[row.status]??row.status}</span></td>
              <td>{lead?lead.lead_number:<span className="leise">kein Lead</span>}{row.acknowledged_on?<div className="leise">bedankt {formatDay(row.acknowledged_on)}</div>:null}</td>
              <td className="zahl rechts leise">{formatDay(row.received_on)}</td>
            </tr>;
          })}</tbody>
        </table>}
    </div>

    {(d.gaps as any[]).length>0?<section className="programm-tabelle-rahmen" aria-label="Herkunft prüfen">
      <p className="programm-liste-leer"><strong>Herkunft prüfen:</strong> Für die Kampagnen- und Partnerauswertung zählt die Herkunft des Leads. Diese Liste benennt den Unterschied; sie ändert nichts von selbst.</p>
      <table className="programm-tabelle">
        <thead><tr><th scope="col">Empfehlung → Lead</th><th scope="col">Grund</th><th scope="col">Laut Empfehlung</th><th scope="col">Laut Herkunft</th><th scope="col"><span className="sr-only">Aktion</span></th></tr></thead>
        <tbody>{(d.gaps as any[]).map((gap:any)=><tr key={gap.referral_id}>
          <td className="zahl">{gap.referral_number} → {gap.lead_number}</td>
          <td>{gap.reason}</td>
          <td>{gap.referral_referrer??<span className="leise">—</span>}</td>
          <td>{gap.acquisition_referrer??<span className="leise">nicht erfasst</span>}</td>
          <td className="rechts"><Link to={`/leads/${gap.lead_id}#herkunft`}>Herkunft öffnen →</Link></td>
        </tr>)}</tbody>
      </table>
    </section>:null}
  </main>;
}
