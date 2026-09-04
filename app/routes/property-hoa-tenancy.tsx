import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-hoa-tenancy";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

const LEVY_STATUS:Record<string,string>={EXPECTED:"Absehbar",RESOLVED:"Beschlossen",PAID:"Bezahlt",CANCELLED:"Verworfen"};
const LEVY_CLASS:Record<string,string>={EXPECTED:"status-draft",RESOLVED:"status-lost",PAID:"status-sold",CANCELLED:"status-archived"};
const CONTRACT_TYPE:Record<string,string>={UNLIMITED:"Unbefristet",FIXED_TERM:"Befristet",SUBSIDISED:"Öffentlich gefördert",COMMERCIAL:"Gewerbe",OTHER:"Sonstiges"};
const DEPOSIT_FORM:Record<string,string>={CASH:"Barkaution",SAVINGS_ACCOUNT:"Kautionskonto",BANK_GUARANTEE:"Bankbürgschaft",INSURANCE:"Kautionsversicherung",OTHER:"Sonstige Form"};
const ADJUSTMENT:Record<string,string>={NONE:"Keine Anpassungsklausel",STAGED:"Staffelmiete",INDEX:"Indexmiete"};
const TENANCY_STATUS:Record<string,string>={ACTIVE:"Laufend",ENDED:"Beendet",TERMINATED:"Gekündigt"};

function one(value:any){return Array.isArray(value)?value[0]:value;}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function intOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number.parseInt(raw,10);return Number.isFinite(n)?n:NaN;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function money(value:any){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(n):"—";}
function today(){return new Date().toISOString().slice(0,10);}
function contactLabel(c:any){return c?`${c.last_name}, ${c.first_name}`:"";}

/**
 * Bruttomietrendite aus den tatsächlich erfassten Werten. Gibt null zurück,
 * solange Kaufpreis oder Ist-Kaltmiete fehlen — dann zeigt die Oberfläche
 * „nicht berechenbar" statt einer Zahl, die etwas vortäuscht.
 */
export function grossYield(purchasePrice:any,rentCold:any){
  const price=Number(purchasePrice),rent=Number(rentCold);
  if(!Number.isFinite(price)||price<=0)return null;
  if(!Number.isFinite(rent)||rent<=0)return null;
  return (rent*12)/price*100;
}

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("HOA_PROPERTY_NOT_FOUND")||message.includes("LEVY_PROPERTY_NOT_FOUND")||message.includes("TENANCY_PROPERTY_NOT_FOUND"))return"Die Immobilie wurde nicht gefunden.";
  if(message.includes("HOA_RESERVE_DATE_IN_FUTURE"))return"Der Stichtag der Erhaltungsrücklage darf nicht in der Zukunft liegen.";
  if(message.includes("HOA_MANAGER_ORGANIZATION_NOT_FOUND"))return"Die gewählte Verwaltung wurde nicht gefunden.";
  if(message.includes("HOA_FEE_SPLIT_EXCEEDS_TOTAL"))return"Umlage und Rücklagenanteil zusammen überschreiten das in der Objektakte geführte Hausgeld.";
  if(message.includes("property_hoa_data_reserve_dated_check"))return"Zur Erhaltungsrücklage gehört ein Stichtag.";
  if(message.includes("LEVY_RESOLVED_IN_FUTURE"))return"Das Beschlussdatum darf nicht in der Zukunft liegen.";
  if(message.includes("property_hoa_special_levies_resolved_dated_check"))return"Eine beschlossene Sonderumlage braucht ein Beschlussdatum.";
  if(message.includes("property_hoa_special_levies_share_required_check"))return"Eine beschlossene Sonderumlage braucht den auf dieses Objekt entfallenden Anteil.";
  if(message.includes("property_hoa_special_levies_share_le_total_check"))return"Der eigene Anteil kann nicht höher sein als der Gesamtbetrag.";
  if(message.includes("property_hoa_special_levies_purpose_check"))return"Für eine Sonderumlage ist der Zweck erforderlich.";
  if(message.includes("TENANCY_CONTACT_NOT_FOUND"))return"Der gewählte Mieter wurde nicht gefunden.";
  if(message.includes("TENANCY_CONTRACT_DATE_IN_FUTURE"))return"Das Vertragsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("TENANCY_END_IN_FUTURE"))return"Das Beendigungsdatum darf nicht in der Zukunft liegen.";
  if(message.includes("TENANCY_END_BEFORE_START"))return"Das Mietverhältnis kann nicht vor seinem Beginn enden.";
  if(message.includes("TENANCY_DEPOSIT_AMOUNT_REQUIRED"))return"Eine hinterlegte Kaution braucht einen Betrag.";
  if(message.includes("TENANCY_CANNOT_REACTIVATE"))return"Ein beendetes Mietverhältnis kann nicht wieder aktiviert werden.";
  if(message.includes("property_tenancies_one_active_idx"))return"Für diese Immobilie besteht bereits ein laufendes Mietverhältnis.";
  if(message.includes("property_tenancies_tenant_named_check"))return"Bitte einen Mieter auswählen oder benennen.";
  if(message.includes("property_tenancies_fixed_term_check"))return"Ein befristeter Vertrag braucht ein Enddatum.";
  if(message.includes("property_tenancies_deposit_form_required_check"))return"Zu einer Kaution gehört die Form.";
  if(message.includes("property_tenancies_adjustment_noted_check"))return"Zu einer Staffel- oder Indexmiete gehört eine Erläuterung.";
  if(message.includes("property_tenancies_sublet_consistent_check"))return"Eine bestehende Untervermietung setzt voraus, dass sie erlaubt ist.";
  if(message.includes("property_tenancies_ended_dated_check"))return"Zu einem beendeten Mietverhältnis gehört ein Beendigungsdatum.";
  if(message.includes("property_tenancies_active_undated_check"))return"Ein laufendes Mietverhältnis hat kein Beendigungsdatum.";
  if(message.includes("property_tenancies_period_check"))return"Das Ende kann nicht vor dem Beginn liegen.";
  return "Die Angaben konnten nicht gespeichert werden.";
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"property.read");
  const propertyId=params.propertyId!;
  const {data:property,error:propertyError}=await supabase.from("properties")
    .select("id,property_number,internal_title,property_type,purchase_price,hoa_fee,living_area_sqm,residential_units,tenancy_status")
    .eq("id",propertyId).maybeSingle();
  if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});

  const [hoaRes,leviesRes,tenanciesRes,legalRes,orgsRes,contactsRes,documentsRes,canWriteRes]=await Promise.all([
    supabase.from("property_hoa_data").select("*,organizations(id,name),contacts(id,first_name,last_name)").eq("property_id",propertyId).maybeSingle(),
    supabase.from("property_hoa_special_levies").select("*").eq("property_id",propertyId).order("status").order("due_on",{nullsFirst:false}),
    supabase.from("property_tenancies").select("*,contacts(id,contact_number,first_name,last_name)").eq("property_id",propertyId).order("status").order("starts_on",{ascending:false}),
    supabase.from("property_legal_data").select("co_ownership_share").eq("property_id",propertyId).maybeSingle(),
    supabase.from("organizations").select("id,organization_number,name").is("archived_at",null).order("name").limit(500),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("documents").select("id,category,title,created_at").eq("property_id",propertyId).is("archived_at",null).in("category",["WEG","BUSINESS_PLAN","MINUTES","TENANCY_AGREEMENT"]).order("created_at",{ascending:false}),
    supabase.rpc("current_user_has_permission",{p_permission:"property.write"}),
  ]);
  // Lesefehler nicht verschlucken.
  const readError=[hoaRes,leviesRes,tenanciesRes,documentsRes].find((r)=>r.error)?.error;
  if(readError)throw new Response("WEG- und Mietdaten konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  return data({
    profile,property,
    hoa:hoaRes.data,levies:leviesRes.data??[],tenancies:tenanciesRes.data??[],
    coOwnershipShare:(legalRes.data as any)?.co_ownership_share??null,
    organizations:orgsRes.data??[],contacts:contactsRes.data??[],documents:documentsRes.data??[],
    canWrite:canWriteRes.data===true,
  },{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"property.write");
  const propertyId=params.propertyId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const back=`/properties/${propertyId}/hoa-tenancy`;
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Der Datensatz wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="hoa_save"){
    const operating=numOrNull(fd,"fee_operating"),reserve=numOrNull(fd,"fee_reserve");
    if((typeof operating==="number"&&!Number.isFinite(operating))||(typeof reserve==="number"&&!Number.isFinite(reserve)))return invalid("Ungültige Hausgeldaufteilung.");
    const balance=numOrNull(fd,"maintenance_reserve_balance");
    if(typeof balance==="number"&&!Number.isFinite(balance))return invalid("Ungültiger Stand der Erhaltungsrücklage.");
    if(balance!==null&&!dateOrNull(fd,"maintenance_reserve_date"))return invalid("Zur Erhaltungsrücklage gehört ein Stichtag.");
    const planYear=intOrNull(fd,"economic_plan_year"),statementYear=intOrNull(fd,"annual_statement_year");
    if((typeof planYear==="number"&&!Number.isFinite(planYear))||(typeof statementYear==="number"&&!Number.isFinite(statementYear)))return invalid("Ungültige Jahresangabe.");
    const payload:Record<string,unknown>={
      property_id:propertyId,
      fee_operating:operating,fee_reserve:reserve,
      fee_reference_month:dateOrNull(fd,"fee_reference_month"),
      maintenance_reserve_balance:balance,
      maintenance_reserve_date:balance!==null?dateOrNull(fd,"maintenance_reserve_date"):null,
      special_use_rights:text(fd,"special_use_rights")||null,
      manager_organization_id:text(fd,"manager_organization_id")||null,
      manager_contact_id:text(fd,"manager_contact_id")||null,
      manager_contract_until:dateOrNull(fd,"manager_contract_until"),
      resolution_record_available:text(fd,"resolution_record_available")==="yes",
      economic_plan_year:planYear,annual_statement_year:statementYear,
      upcoming_renovations:text(fd,"upcoming_renovations")||null,
      notes:text(fd,"notes")||null,
      updated_by:userId,
    };
    const hoaId=text(fd,"hoa_id");
    if(hoaId){
      const {data:updated,error}=await supabase.from("property_hoa_data").update(payload).eq("id",hoaId).eq("version",Number(text(fd,"version"))).select("id").maybeSingle();
      if(error)return fail(error);
      if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("property_hoa_data").insert({...payload,created_by:userId});
      if(error)return fail(error);
    }
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="levy_add"){
    if(!text(fd,"purpose"))return invalid("Bitte den Zweck der Sonderumlage angeben.");
    const status=text(fd,"status");
    if(!Object.keys(LEVY_STATUS).includes(status))return invalid("Ungültiger Stand der Sonderumlage.");
    const total=numOrNull(fd,"total_amount"),share=numOrNull(fd,"own_share_amount");
    if((typeof total==="number"&&!Number.isFinite(total))||(typeof share==="number"&&!Number.isFinite(share)))return invalid("Ungültiger Betrag.");
    if(status!=="EXPECTED"&&!dateOrNull(fd,"resolved_on"))return invalid("Eine beschlossene Sonderumlage braucht ein Beschlussdatum.");
    if(status!=="EXPECTED"&&share===null)return invalid("Eine beschlossene Sonderumlage braucht den auf dieses Objekt entfallenden Anteil.");
    const {error}=await supabase.from("property_hoa_special_levies").insert({
      property_id:propertyId,purpose:text(fd,"purpose"),status,
      total_amount:total,own_share_amount:share,
      resolved_on:dateOrNull(fd,"resolved_on"),due_on:dateOrNull(fd,"due_on"),
      note:text(fd,"note")||null,created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="levy_remove"){
    const {error}=await supabase.from("property_hoa_special_levies").delete().eq("id",text(fd,"levy_id"));
    if(error)return fail(error);
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="tenancy_save"){
    const contactId=text(fd,"tenant_contact_id"),name=text(fd,"tenant_name");
    if(!contactId&&!name)return invalid("Bitte einen Mieter auswählen oder benennen.");
    const contractType=text(fd,"contract_type");
    if(!Object.keys(CONTRACT_TYPE).includes(contractType))return invalid("Ungültige Vertragsart.");
    if(contractType==="FIXED_TERM"&&!dateOrNull(fd,"ends_on"))return invalid("Ein befristeter Vertrag braucht ein Enddatum.");
    const adjustment=text(fd,"rent_adjustment_type");
    if(!Object.keys(ADJUSTMENT).includes(adjustment))return invalid("Ungültige Anpassungsklausel.");
    if(adjustment!=="NONE"&&!text(fd,"rent_adjustment_note"))return invalid("Zu einer Staffel- oder Indexmiete gehört eine Erläuterung.");
    const depositForm=text(fd,"deposit_form");
    const deposit=numOrNull(fd,"deposit_amount");
    if(typeof deposit==="number"&&!Number.isFinite(deposit))return invalid("Ungültige Kautionshöhe.");
    if(deposit!==null&&!depositForm)return invalid("Zu einer Kaution gehört die Form.");
    const sublettPermitted=text(fd,"sublet_permitted")==="yes";
    const sublettExists=text(fd,"sublet_exists")==="yes";
    if(sublettExists&&!sublettPermitted)return invalid("Eine bestehende Untervermietung setzt voraus, dass sie erlaubt ist.");
    const rent=numOrNull(fd,"rent_cold");
    if(typeof rent==="number"&&!Number.isFinite(rent))return invalid("Ungültige Kaltmiete.");
    const payload:Record<string,unknown>={
      property_id:propertyId,
      tenant_contact_id:contactId||null,
      tenant_name:name||null,
      contract_date:dateOrNull(fd,"contract_date"),
      contract_type:contractType,
      starts_on:dateOrNull(fd,"starts_on"),
      ends_on:dateOrNull(fd,"ends_on"),
      rent_cold:rent,
      operating_cost_advance:numOrNull(fd,"operating_cost_advance"),
      heating_cost_advance:numOrNull(fd,"heating_cost_advance"),
      deposit_amount:deposit,
      deposit_form:deposit!==null?depositForm:null,
      deposit_deposited:text(fd,"deposit_deposited")==="yes",
      deposit_note:text(fd,"deposit_note")||null,
      rent_adjustment_type:adjustment,
      rent_adjustment_note:adjustment!=="NONE"?text(fd,"rent_adjustment_note"):null,
      termination_waiver_until:dateOrNull(fd,"termination_waiver_until"),
      pending_rent_increase:text(fd,"pending_rent_increase")==="yes",
      pending_rent_increase_note:text(fd,"pending_rent_increase_note")||null,
      arrears_amount:numOrNull(fd,"arrears_amount"),
      arrears_note:text(fd,"arrears_note")||null,
      sublet_permitted:sublettPermitted,
      sublet_exists:sublettExists,
      tenant_pre_emption_relevant:text(fd,"tenant_pre_emption_relevant")==="yes",
      conversion_blocking_until:dateOrNull(fd,"conversion_blocking_until"),
      notes:text(fd,"notes")||null,
      updated_by:userId,
    };
    const tenancyId=text(fd,"tenancy_id");
    if(tenancyId){
      const {data:updated,error}=await supabase.from("property_tenancies").update(payload).eq("id",tenancyId).eq("version",Number(text(fd,"tenancy_version"))).select("id").maybeSingle();
      if(error)return fail(error);
      if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("property_tenancies").insert({...payload,created_by:userId});
      if(error)return fail(error);
    }
    return redirect(back,{headers:responseHeaders()});
  }

  if(intent==="tenancy_end"){
    const status=text(fd,"target_status");
    if(!["ENDED","TERMINATED"].includes(status))return invalid("Ungültiger Beendigungsgrund.");
    const endedOn=dateOrNull(fd,"ended_on");
    if(!endedOn)return invalid("Bitte ein Beendigungsdatum angeben.");
    const {data:updated,error}=await supabase.from("property_tenancies")
      .update({status,ended_on:endedOn}).eq("id",text(fd,"tenancy_id")).eq("version",Number(text(fd,"tenancy_version"))).select("id").maybeSingle();
    if(error)return fail(error);
    if(!updated)return conflict();
    return redirect(back,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

export default function PropertyHoaTenancy(){
  const d=useLoaderData<typeof loader>();
  const r=useActionData<typeof action>();
  const p=d.property as any;
  const hoa=d.hoa as any;
  const levies=d.levies as any[];
  const tenancies=d.tenancies as any[];
  const locked=!d.canWrite;
  const active=tenancies.find((t:any)=>t.status==="ACTIVE"&&!t.archived_at);
  const yieldValue=grossYield(p.purchase_price,active?.rent_cold);
  const openLevies=levies.filter((l:any)=>l.status==="EXPECTED"||l.status==="RESOLVED");
  const openLevySum=openLevies.reduce((sum,l)=>sum+Number(l.own_share_amount??0),0);
  const docsByCategory=(category:string)=>(d.documents as any[]).filter((doc:any)=>doc.category===category);
  const minutes=docsByCategory("MINUTES");
  return <main className="editor-shell">
    <header className="editor-header"><div><Link className="back-link" to={`/properties/${p.id}`}>← Objektakte</Link><p className="eyebrow">{p.property_number}</p><h1 className="editor-title">WEG & Miete</h1><p className="editor-meta">{p.internal_title}</p></div><div className="header-actions"><span className="status-pill">{active?"Vermietet":"Nicht vermietet"}</span><span className="badge">{__APP_ENV_LABEL__}</span><small>{d.profile.display_name}</small></div></header>

    {r?.error?<div className="form-error">{r.error}</div>:null}
    <div className="form-warning"><strong>Erfassung, keine rechtliche Bewertung.</strong> Das System hält Konditionen und Fristen fest. Es beurteilt nicht, ob eine Mieterhöhung zulässig, eine Kündigung wirksam oder eine Sperrfrist einschlägig ist. Die Rendite ist eine Berechnung aus den erfassten Werten, keine Zusicherung.</div>

    <section className="metric-grid">
      <article className="metric-card"><span>Hausgeld</span><strong>{money(p.hoa_fee)}</strong><small>{hoa?.fee_operating!==null&&hoa?.fee_operating!==undefined?`${money(hoa.fee_operating)} Umlage · ${money(hoa.fee_reserve)} Rücklage`:"Aufteilung nicht erfasst"}</small></article>
      <article className="metric-card"><span>Erhaltungsrücklage</span><strong>{hoa?.maintenance_reserve_balance!==null&&hoa?.maintenance_reserve_balance!==undefined?money(hoa.maintenance_reserve_balance):"—"}</strong><small>{hoa?.maintenance_reserve_date?`Stand ${formatDate(hoa.maintenance_reserve_date)}`:"kein Stichtag"}</small></article>
      <article className="metric-card"><span>Offene Sonderumlagen</span><strong>{openLevies.length}</strong><small>{openLevySum>0?`${money(openLevySum)} eigener Anteil`:"kein Anteil beziffert"}</small></article>
      <article className="metric-card"><span>Ist-Kaltmiete</span><strong>{active?money(active.rent_cold):"—"}</strong><small>{active?`${CONTRACT_TYPE[active.contract_type]}${active.starts_on?` seit ${formatDate(active.starts_on)}`:""}`:"kein laufendes Mietverhältnis"}</small></article>
      <article className="metric-card"><span>Bruttomietrendite</span><strong>{yieldValue!==null?`${yieldValue.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} %`:"nicht berechenbar"}</strong><small>{yieldValue!==null?"Jahreskaltmiete zu Kaufpreis":"Kaufpreis oder Kaltmiete fehlt"}</small></article>
    </section>

    {yieldValue!==null?<div className="form-success"><strong>Berechnung:</strong> {money(active.rent_cold)} Kaltmiete × 12 = {money(Number(active.rent_cold)*12)} Jahreskaltmiete, geteilt durch {money(p.purchase_price)} Kaufpreis = {yieldValue.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2})} % brutto. Ohne Kaufnebenkosten, ohne nicht umlagefähige Bewirtschaftungskosten und ohne Mietausfallrisiko.</div>:null}

    <section className="editor-card" id="weg"><div className="card-head"><div><p className="eyebrow">Wohnungseigentum</p><h2>WEG-Daten</h2></div>{hoa?<span className="status-pill">Version {hoa.version}</span>:<span className="status-pill status-draft">Noch nicht erfasst</span>}</div>
      <p className="subtle">Miteigentumsanteil: {d.coOwnershipShare||"nicht erfasst"} — geführt unter <Link className="subtle-link" to={`/properties/${p.id}/legal`}>Recht & Lasten</Link>, damit er nicht doppelt gepflegt wird.</p>
      <Form method="post">
        <input type="hidden" name="_intent" value="hoa_save"/>
        {hoa?<input type="hidden" name="hoa_id" value={hoa.id}/>:null}
        {hoa?<input type="hidden" name="version" value={hoa.version}/>:null}
        <div className="form-grid">
          <label className="form-field"><span>Hausgeld · Umlage €</span><input name="fee_operating" inputMode="decimal" defaultValue={hoa?.fee_operating??""} disabled={locked}/><small className="subtle">Gesamt laut Objektakte: {money(p.hoa_fee)}</small></label>
          <label className="form-field"><span>Hausgeld · Rücklagenanteil €</span><input name="fee_reserve" inputMode="decimal" defaultValue={hoa?.fee_reserve??""} disabled={locked}/></label>
          <label className="form-field"><span>Stand des Hausgelds</span><input name="fee_reference_month" type="date" defaultValue={hoa?.fee_reference_month??""} disabled={locked}/></label>
          <label className="form-field"><span>Erhaltungsrücklage €</span><input name="maintenance_reserve_balance" inputMode="decimal" defaultValue={hoa?.maintenance_reserve_balance??""} disabled={locked}/></label>
          <label className="form-field"><span>Stichtag der Rücklage</span><input name="maintenance_reserve_date" type="date" defaultValue={hoa?.maintenance_reserve_date??""} max={today()} disabled={locked}/></label>
          <label className="form-field"><span>Verwaltung · Organisation</span><select name="manager_organization_id" defaultValue={hoa?.manager_organization_id??""} disabled={locked}><option value="">—</option>{d.organizations.map((o:any)=><option value={o.id} key={o.id}>{o.name}</option>)}</select></label>
          <label className="form-field"><span>Verwaltung · Ansprechpartner</span><select name="manager_contact_id" defaultValue={hoa?.manager_contact_id??""} disabled={locked}><option value="">—</option>{d.contacts.map((c:any)=><option value={c.id} key={c.id}>{contactLabel(c)}</option>)}</select></label>
          <label className="form-field"><span>Verwaltervertrag bis</span><input name="manager_contract_until" type="date" defaultValue={hoa?.manager_contract_until??""} disabled={locked}/></label>
          <label className="form-field"><span>Beschlusssammlung vorhanden</span><select name="resolution_record_available" defaultValue={hoa?.resolution_record_available?"yes":"no"} disabled={locked}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
          <label className="form-field"><span>Wirtschaftsplan für Jahr</span><input name="economic_plan_year" type="number" min={1950} max={2100} defaultValue={hoa?.economic_plan_year??""} disabled={locked}/></label>
          <label className="form-field"><span>Jahresabrechnung für Jahr</span><input name="annual_statement_year" type="number" min={1950} max={2100} defaultValue={hoa?.annual_statement_year??""} disabled={locked}/></label>
        </div>
        <label className="form-field full-width"><span>Sondernutzungsrechte</span><textarea name="special_use_rights" rows={2} defaultValue={hoa?.special_use_rights??""} placeholder="z. B. Stellplatz Nr. 4, Gartenanteil West" disabled={locked}/></label>
        <label className="form-field full-width"><span>Anstehende Sanierungsmaßnahmen</span><textarea name="upcoming_renovations" rows={3} defaultValue={hoa?.upcoming_renovations??""} disabled={locked}/></label>
        <label className="form-field full-width"><span>Notizen</span><textarea name="notes" rows={2} defaultValue={hoa?.notes??""} disabled={locked}/></label>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={locked}>{hoa?"WEG-Daten speichern":"WEG-Daten anlegen"}</button></div>
      </Form>
    </section>

    <section className="data-card" id="unterlagen"><div className="card-head"><div><p className="eyebrow">Aus der Dokumentenakte</p><h2>Zugehörige Unterlagen</h2></div><Link className="subtle-link" to={`/properties/${p.id}/documents`}>Dokumente öffnen →</Link></div>
      <dl className="detail-list">
        <div><dt>WEG-Unterlagen</dt><dd>{docsByCategory("WEG").length||"keine"}</dd></div>
        <div><dt>Wirtschaftsplan</dt><dd>{docsByCategory("BUSINESS_PLAN").length||"keiner"}</dd></div>
        <div><dt>Protokolle</dt><dd>{minutes.length?`${minutes.length} abgelegt${minutes.length<3?" — üblich sind die letzten drei":""}`:"keine — üblich sind die letzten drei"}</dd></div>
        <div><dt>Mietvertrag</dt><dd>{docsByCategory("TENANCY_AGREEMENT").length||"keiner"}</dd></div>
      </dl>
      {minutes.length?<div className="data-list" style={{marginTop:"0.75rem"}}>{minutes.slice(0,3).map((doc:any)=><div className="data-row" key={doc.id}><div><strong>{doc.title}</strong><small>abgelegt {formatDate(String(doc.created_at).slice(0,10))}</small></div></div>)}</div>:null}
    </section>

    <section className="data-card" id="sonderumlagen"><div className="card-head"><div><p className="eyebrow">Beschlossen und absehbar</p><h2>{levies.length} Sonderumlagen</h2></div></div>
      {levies.length===0?<p className="empty-state">Keine Sonderumlage erfasst.</p>:<div className="data-list">
        {levies.map((l:any)=><div className="data-row" key={l.id}>
          <div><strong>{l.purpose}</strong><small>{l.resolved_on?`beschlossen ${formatDate(l.resolved_on)}`:"noch kein Beschluss"}{l.due_on?` · fällig ${formatDate(l.due_on)}`:""}{l.note?` · ${l.note}`:""}</small></div>
          <div className="row-meta"><span className={`status-pill ${LEVY_CLASS[l.status]}`}>{LEVY_STATUS[l.status]}</span><small>{l.own_share_amount!==null&&l.own_share_amount!==undefined?`eigener Anteil ${money(l.own_share_amount)}`:"Anteil nicht beziffert"}</small></div>
          <div className="row-meta"><span>{l.total_amount!==null&&l.total_amount!==undefined?money(l.total_amount):"—"}</span><small>Gesamtbetrag</small></div>
          {d.canWrite?<Form method="post"><input type="hidden" name="_intent" value="levy_remove"/><input type="hidden" name="levy_id" value={l.id}/><button className="secondary-button" type="submit">Entfernen</button></Form>:null}
        </div>)}
      </div>}
      {d.canWrite?<Form method="post" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="levy_add"/>
        <div className="form-grid">
          <label className="form-field"><span>Zweck *</span><input name="purpose" required/></label>
          <label className="form-field"><span>Stand *</span><select name="status" defaultValue="EXPECTED" required>{Object.entries(LEVY_STATUS).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
          <label className="form-field"><span>Gesamtbetrag €</span><input name="total_amount" inputMode="decimal"/></label>
          <label className="form-field"><span>Eigener Anteil €</span><input name="own_share_amount" inputMode="decimal"/><small className="subtle">Bei beschlossenen Umlagen erforderlich.</small></label>
          <label className="form-field"><span>Beschlossen am</span><input name="resolved_on" type="date" max={today()}/></label>
          <label className="form-field"><span>Fällig am</span><input name="due_on" type="date"/></label>
        </div>
        <label className="form-field full-width"><span>Notiz</span><input name="note"/></label>
        <div className="form-actions"><button className="secondary-button" type="submit">Sonderumlage erfassen</button></div>
      </Form>:null}
    </section>

    <section className="data-card" id="miete"><div className="card-head"><div><p className="eyebrow">Mietsituation</p><h2>{tenancies.length} Mietverhältnisse</h2></div></div>
      {tenancies.length===0?<p className="empty-state">Kein Mietverhältnis erfasst.</p>:<div className="data-list">
        {tenancies.map((t:any)=>{const contact=one(t.contacts);return <div className="data-row" key={t.id}>
          <div><strong>{contactLabel(contact)||t.tenant_name}</strong><small>{CONTRACT_TYPE[t.contract_type]}{t.starts_on?` · seit ${formatDate(t.starts_on)}`:""}{t.ends_on?` bis ${formatDate(t.ends_on)}`:""}</small></div>
          <div className="row-meta"><span>{money(t.rent_cold)} kalt</span><small>{t.operating_cost_advance?`+ ${money(t.operating_cost_advance)} NK`:""}{t.heating_cost_advance?` + ${money(t.heating_cost_advance)} Heizung`:""}</small></div>
          <div className="row-meta"><span className={`status-pill ${t.status==="ACTIVE"?"status-marketing":"status-archived"}`}>{TENANCY_STATUS[t.status]}</span><small>{t.ended_on?`beendet ${formatDate(t.ended_on)}`:t.arrears_amount?`Rückstand ${money(t.arrears_amount)}`:""}</small></div>
          <div className="row-meta"><span>{ADJUSTMENT[t.rent_adjustment_type]}</span><small>{[t.tenant_pre_emption_relevant?"Mietervorkaufsrecht":null,t.conversion_blocking_until?`Sperrfrist bis ${formatDate(t.conversion_blocking_until)}`:null,t.pending_rent_increase?"Mieterhöhung läuft":null].filter(Boolean).join(" · ")}</small></div>
        </div>;})}
      </div>}

      {tenancies.filter((t:any)=>t.status==="ACTIVE").map((t:any)=><TenancyForm key={`f-${t.id}`} row={t} contacts={d.contacts} disabled={locked} formKey={`f-${t.id}`}/>)}
      {d.canWrite&&!active?<TenancyForm contacts={d.contacts} disabled={false} formKey="new-tenancy"/>:null}

      {d.canWrite&&active?<Form method="post" className="editor-card" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="tenancy_end"/>
        <input type="hidden" name="tenancy_id" value={active.id}/>
        <input type="hidden" name="tenancy_version" value={active.version}/>
        <div className="card-head"><div><p className="eyebrow">Beenden</p><h3>Mietverhältnis beenden</h3></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Ergebnis *</span><select name="target_status" defaultValue="ENDED" required><option value="ENDED">Beendet</option><option value="TERMINATED">Gekündigt</option></select></label>
          <label className="form-field"><span>Beendet am *</span><input name="ended_on" type="date" defaultValue={today()} max={today()} required/></label>
        </div>
        <div className="form-actions"><button className="secondary-button" type="submit">Mietverhältnis beenden</button></div>
      </Form>:null}
    </section>

    <section className="data-card"><div className="card-head"><div><p className="eyebrow">Vor produktiver Nutzung</p><h2>Anwaltlich abzunehmen</h2></div></div>
      <ul className="subtle">
        <li>Ob und wann ein Vorkaufsrecht des Mieters besteht und wie es mitzuteilen ist.</li>
        <li>Wann eine Sperrfrist nach Umwandlung in Wohnungseigentum läuft und wie lange.</li>
        <li>Welche Angaben zu Mietverhältnis und Kaution dem Käufer offengelegt werden müssen.</li>
        <li>Wie mit Mietrückständen und laufenden Mieterhöhungen beim Eigentümerwechsel umzugehen ist.</li>
        <li>Ob die dargestellte Bruttomietrendite gegenüber Interessenten verwendet werden darf und welche Hinweise sie braucht.</li>
      </ul>
    </section>
  </main>;
}

function TenancyForm({row,contacts,disabled,formKey}:{row?:any;contacts:any[];disabled:boolean;formKey:string}){
  return <Form method="post" className="editor-card" style={{marginTop:"1rem"}} key={formKey}>
    <input type="hidden" name="_intent" value="tenancy_save"/>
    {row?<input type="hidden" name="tenancy_id" value={row.id}/>:null}
    {row?<input type="hidden" name="tenancy_version" value={row.version}/>:null}
    <div className="card-head"><div><p className="eyebrow">{row?"Laufendes Mietverhältnis":"Neu"}</p><h3>{row?"Konditionen bearbeiten":"Mietverhältnis erfassen"}</h3></div></div>
    <div className="form-grid">
      <label className="form-field"><span>Mieter · Kontakt</span><select name="tenant_contact_id" defaultValue={row?.tenant_contact_id??""} disabled={disabled}><option value="">—</option>{contacts.map((c:any)=><option value={c.id} key={c.id}>{contactLabel(c)} · {c.contact_number}</option>)}</select></label>
      <label className="form-field"><span>Mieter · Freitext</span><input name="tenant_name" defaultValue={row?.tenant_name??""} disabled={disabled}/><small className="subtle">Eines von beiden ist erforderlich.</small></label>
      <label className="form-field"><span>Vertragsdatum</span><input name="contract_date" type="date" defaultValue={row?.contract_date??""} max={today()} disabled={disabled}/></label>
      <label className="form-field"><span>Vertragsart *</span><select name="contract_type" defaultValue={row?.contract_type??"UNLIMITED"} required disabled={disabled}>{Object.entries(CONTRACT_TYPE).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Mietbeginn</span><input name="starts_on" type="date" defaultValue={row?.starts_on??""} disabled={disabled}/></label>
      <label className="form-field"><span>Befristet bis</span><input name="ends_on" type="date" defaultValue={row?.ends_on??""} disabled={disabled}/><small className="subtle">Bei befristetem Vertrag erforderlich.</small></label>
      <label className="form-field"><span>Ist-Kaltmiete €</span><input name="rent_cold" inputMode="decimal" defaultValue={row?.rent_cold??""} disabled={disabled}/></label>
      <label className="form-field"><span>Nebenkostenvorauszahlung €</span><input name="operating_cost_advance" inputMode="decimal" defaultValue={row?.operating_cost_advance??""} disabled={disabled}/></label>
      <label className="form-field"><span>Heizkostenvorauszahlung €</span><input name="heating_cost_advance" inputMode="decimal" defaultValue={row?.heating_cost_advance??""} disabled={disabled}/></label>
      <label className="form-field"><span>Kaution €</span><input name="deposit_amount" inputMode="decimal" defaultValue={row?.deposit_amount??""} disabled={disabled}/></label>
      <label className="form-field"><span>Form der Kaution</span><select name="deposit_form" defaultValue={row?.deposit_form??""} disabled={disabled}><option value="">—</option>{Object.entries(DEPOSIT_FORM).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Kaution hinterlegt</span><select name="deposit_deposited" defaultValue={row?.deposit_deposited?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
      <label className="form-field"><span>Anpassungsklausel *</span><select name="rent_adjustment_type" defaultValue={row?.rent_adjustment_type??"NONE"} required disabled={disabled}>{Object.entries(ADJUSTMENT).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
      <label className="form-field"><span>Kündigungsverzicht bis</span><input name="termination_waiver_until" type="date" defaultValue={row?.termination_waiver_until??""} disabled={disabled}/></label>
      <label className="form-field"><span>Mieterhöhung läuft</span><select name="pending_rent_increase" defaultValue={row?.pending_rent_increase?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
      <label className="form-field"><span>Mietrückstand €</span><input name="arrears_amount" inputMode="decimal" defaultValue={row?.arrears_amount??""} disabled={disabled}/></label>
      <label className="form-field"><span>Untervermietung erlaubt</span><select name="sublet_permitted" defaultValue={row?.sublet_permitted?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
      <label className="form-field"><span>Untervermietung besteht</span><select name="sublet_exists" defaultValue={row?.sublet_exists?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select></label>
      <label className="form-field"><span>Mietervorkaufsrecht einschlägig</span><select name="tenant_pre_emption_relevant" defaultValue={row?.tenant_pre_emption_relevant?"yes":"no"} disabled={disabled}><option value="no">Nein</option><option value="yes">Ja</option></select><small className="subtle">Ob es besteht, entscheidet nicht das System.</small></label>
      <label className="form-field"><span>Sperrfrist nach Umwandlung bis</span><input name="conversion_blocking_until" type="date" defaultValue={row?.conversion_blocking_until??""} disabled={disabled}/></label>
    </div>
    <label className="form-field full-width"><span>Erläuterung zur Anpassungsklausel</span><input name="rent_adjustment_note" defaultValue={row?.rent_adjustment_note??""} placeholder="Bei Staffel- oder Indexmiete erforderlich" disabled={disabled}/></label>
    <label className="form-field full-width"><span>Notiz zur Kaution</span><input name="deposit_note" defaultValue={row?.deposit_note??""} disabled={disabled}/></label>
    <label className="form-field full-width"><span>Notiz zur Mieterhöhung</span><input name="pending_rent_increase_note" defaultValue={row?.pending_rent_increase_note??""} disabled={disabled}/></label>
    <label className="form-field full-width"><span>Notiz zum Rückstand</span><input name="arrears_note" defaultValue={row?.arrears_note??""} disabled={disabled}/></label>
    <label className="form-field full-width"><span>Notizen</span><textarea name="notes" rows={2} defaultValue={row?.notes??""} disabled={disabled}/></label>
    <div className="form-actions"><button className="primary-button" type="submit" disabled={disabled}>{row?"Mietverhältnis speichern":"Mietverhältnis erfassen"}</button></div>
  </Form>;
}
