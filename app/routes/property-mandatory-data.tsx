import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-mandatory-data";
import { requirePermission } from "~/lib/auth.server";

type ActionResult={error?:string};

const CERTIFICATE_TYPE:Record<string,string>={DEMAND:"Bedarfsausweis",CONSUMPTION:"Verbrauchsausweis",OTHER:"Sonstige"};
const EXEMPTION_REASON:Record<string,string>={MONUMENT_PROTECTION:"Denkmalschutz",SMALL_BUILDING:"Kleines Gebäude",NOT_REGULARLY_HEATED:"Nicht regelmäßig beheizt",DEMOLITION_PLANNED:"Abriss vorgesehen",OTHER:"Anderer Grund"};
const OCCASION:Record<string,string>={VIEWING:"Besichtigung",CONTRACT_CONCLUSION:"Vertragsschluss",OTHER:"Sonstiger Anlass"};
const PRESENTATION_FORM:Record<string,string>={IN_PERSON:"Persönlich gezeigt",COPY_HANDED:"Kopie ausgehändigt",EMAIL:"Per E-Mail",PORTAL:"Über das Portal",EXPOSE:"Im Exposé",OTHER:"Andere Form"};
const EFFICIENCY_CLASSES=["A+","A","B","C","D","E","F","G","H"];

function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
function dateOrNull(fd:FormData,key:string){const v=text(fd,key);return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;}
function numOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);return Number.isFinite(n)?n:NaN;}
function intOrNull(fd:FormData,key:string){const raw=text(fd,key);if(!raw)return null;const n=Number.parseInt(raw,10);return Number.isFinite(n)?n:NaN;}
function formatDate(value:string|null){if(!value)return"—";return new Intl.DateTimeFormat("de-DE",{dateStyle:"medium",timeZone:"Europe/Berlin"}).format(new Date(`${value}T12:00:00Z`));}
function today(){return new Date().toISOString().slice(0,10);}
function contactLabel(c:any){return c?`${c.last_name}, ${c.first_name}${c.contact_number?` · ${c.contact_number}`:""}`:"";}

/**
 * Objekte ohne Gebäude tragen keine Angaben aus dem Energieausweis. Die Liste
 * ist dieselbe wie in public.property_disclosure_gaps; die Oberfläche nutzt sie
 * nur, um die Abschnitte auszublenden, geprüft wird weiterhin in der Datenbank.
 */
const WITHOUT_BUILDING=["LAND","GARAGE","PARKING_SPACE"];

function errorMessage(error:any){
  const message=String(error?.message??"");
  if(message.includes("PRESENTATION_PROPERTY_NOT_FOUND"))return"Die Immobilie wurde nicht gefunden.";
  if(message.includes("PRESENTATION_CONTACT_NOT_FOUND"))return"Der gewählte Interessent wurde nicht gefunden.";
  if(message.includes("PRESENTATION_DATE_IN_FUTURE"))return"Das Datum der Vorlage darf nicht in der Zukunft liegen.";
  if(message.includes("PRESENTATION_VIEWING_MISMATCH"))return"Die gewählte Besichtigung gehört nicht zu dieser Immobilie.";
  if(message.includes("PRESENTATION_CLOSING_MISMATCH"))return"Der gewählte Abschlussvorgang gehört nicht zu dieser Immobilie.";
  if(message.includes("PRESENTATION_CLOSING_REQUIRED"))return"Für eine Übergabe bei Vertragsschluss ist der Abschlussvorgang erforderlich.";
  if(message.includes("energy_certificate_presentations_handover_required_check"))return"Bei Vertragsschluss ist die Übergabe zu bestätigen; eine reine Vorlage genügt hier nicht.";
  if(message.includes("energy_certificate_presentations_viewing_required_check"))return"Für einen Nachweis zur Besichtigung ist die Besichtigung auszuwählen.";
  if(message.includes("property_energy_data_exemption_documented_check"))return"Eine Ausnahme braucht eine Begründung im Klartext.";
  if(message.includes("property_energy_data_exemption_exclusive_check"))return"Ausnahme und vorliegender Energieausweis schließen sich aus.";
  if(message.includes("property_energy_data_issue_before_validity_check"))return"Die Gültigkeit kann nicht vor dem Ausstellungsdatum enden.";
  if(message.includes("property_energy_data_building_year_check"))return"Das Baujahr laut Ausweis liegt außerhalb des zulässigen Bereichs.";
  if(message.includes("property_energy_data_check"))return"Ohne vorliegenden Energieausweis können keine Ausweiswerte gespeichert werden.";
  return "Die Angaben konnten nicht gespeichert werden.";
}

export async function loader({request,context,params}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"property.read");
  const propertyId=params.propertyId!;
  const {data:property,error:propertyError}=await supabase.from("properties")
    .select("id,property_number,internal_title,property_type,status").eq("id",propertyId).maybeSingle();
  if(propertyError||!property)throw new Response("Immobilie nicht gefunden.",{status:404,headers:responseHeaders()});

  const [energyRes,gapsRes,presentationsRes,contactsRes,viewingsRes,closingsRes,publicationRes,canWriteRes]=await Promise.all([
    supabase.from("property_energy_data").select("*,profiles!property_energy_data_exemption_confirmed_by_fkey(display_name)").eq("property_id",propertyId).maybeSingle(),
    supabase.rpc("property_disclosure_gaps",{p_property_id:propertyId}),
    supabase.from("energy_certificate_presentations").select("*,contacts(id,contact_number,first_name,last_name),viewings(id,viewing_number),sale_closings(id,closing_number)").eq("property_id",propertyId).order("presented_on",{ascending:false}),
    supabase.from("contacts").select("id,contact_number,first_name,last_name").is("archived_at",null).order("last_name").limit(1000),
    supabase.from("viewings").select("id,viewing_number,starts_at,contact_id").eq("property_id",propertyId).is("archived_at",null).order("starts_at",{ascending:false}).limit(200),
    supabase.from("sale_closings").select("id,closing_number,buyer_contact_id,status").eq("property_id",propertyId).is("archived_at",null).order("created_at",{ascending:false}).limit(50),
    supabase.from("property_publications").select("id,status,has_unpublished_changes").eq("property_id",propertyId).maybeSingle(),
    supabase.rpc("current_user_has_permission",{p_permission:"property.write"}),
  ]);
  // Lesefehler nicht verschlucken — eine leere Seite darf nicht wie „alles in Ordnung" aussehen.
  const readError=[energyRes,gapsRes,presentationsRes].find((r)=>r.error)?.error;
  if(readError)throw new Response("Die Pflichtangaben konnten nicht geladen werden.",{status:500,headers:responseHeaders()});

  return data({
    profile,property,
    energy:energyRes.data,
    gaps:(gapsRes.data??[]) as string[],
    presentations:presentationsRes.data??[],
    contacts:contactsRes.data??[],
    viewings:viewingsRes.data??[],
    closings:closingsRes.data??[],
    publication:publicationRes.data??null,
    canWrite:canWriteRes.data===true,
  },{headers:responseHeaders()});
}

export async function action({request,context,params}:Route.ActionArgs){
  const {supabase,responseHeaders,userId}=await requirePermission(request,context.cloudflare.env,"property.write");
  const propertyId=params.propertyId!;
  const fd=await request.formData();
  const intent=text(fd,"_intent");
  const fail=(error:any)=>data<ActionResult>({error:errorMessage(error)},{status:400,headers:responseHeaders()});
  const invalid=(message:string)=>data<ActionResult>({error:message},{status:400,headers:responseHeaders()});
  const conflict=()=>data<ActionResult>({error:"Der Datensatz wurde zwischenzeitlich geändert. Bitte Seite neu laden."},{status:409,headers:responseHeaders()});

  if(intent==="energy_save"){
    const value=numOrNull(fd,"energy_value_kwh");
    if(typeof value==="number"&&!Number.isFinite(value))return invalid("Der Endenergiewert ist keine gültige Zahl.");
    const buildingYear=intOrNull(fd,"building_year");
    if(typeof buildingYear==="number"&&!Number.isFinite(buildingYear))return invalid("Das Baujahr laut Ausweis ist keine gültige Zahl.");
    const payload:any={
      certificate_present:true,
      certificate_type:text(fd,"certificate_type")||null,
      energy_value_kwh:value,
      efficiency_class:text(fd,"efficiency_class")||null,
      energy_source:text(fd,"energy_source")||null,
      building_year:buildingYear,
      certificate_issued_on:dateOrNull(fd,"certificate_issued_on"),
      certificate_registration_number:text(fd,"certificate_registration_number")||null,
      valid_until:dateOrNull(fd,"valid_until"),
      notes:text(fd,"notes")||null,
      exemption_reason:null,exemption_note:null,exemption_confirmed_on:null,exemption_confirmed_by:null,
    };
    const energyId=text(fd,"energy_id");
    if(energyId){
      const {data:updated,error}=await supabase.from("property_energy_data").update(payload).eq("id",energyId).eq("version",Number(text(fd,"energy_version"))).select("id").maybeSingle();
      if(error)return fail(error); if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("property_energy_data").insert({...payload,property_id:propertyId,created_by:userId,updated_by:userId});
      if(error)return fail(error);
    }
    return redirect(`/properties/${propertyId}/mandatory-data#energieausweis`,{headers:responseHeaders()});
  }

  if(intent==="exemption_save"){
    const reason=text(fd,"exemption_reason");
    if(!reason)return invalid("Bitte einen Ausnahmegrund wählen.");
    const note=text(fd,"exemption_note");
    if(!note)return invalid("Eine Ausnahme braucht eine Begründung im Klartext.");
    // Bestätigt hat, wer die Ausnahme erfasst. Kein Auswahlfeld, damit die
    // Bestätigung nicht versehentlich einer anderen Person zugeschrieben wird.
    const payload:any={
      certificate_present:false,certificate_type:null,energy_value_kwh:null,efficiency_class:null,
      energy_source:null,building_year:null,valid_until:null,
      certificate_issued_on:null,certificate_registration_number:null,
      exemption_reason:reason,exemption_note:note,
      exemption_confirmed_on:today(),exemption_confirmed_by:userId,
      notes:text(fd,"notes")||null,
    };
    const energyId=text(fd,"energy_id");
    if(energyId){
      const {data:updated,error}=await supabase.from("property_energy_data").update(payload).eq("id",energyId).eq("version",Number(text(fd,"energy_version"))).select("id").maybeSingle();
      if(error)return fail(error); if(!updated)return conflict();
    }else{
      const {error}=await supabase.from("property_energy_data").insert({...payload,property_id:propertyId,created_by:userId,updated_by:userId});
      if(error)return fail(error);
    }
    return redirect(`/properties/${propertyId}/mandatory-data#ausnahme`,{headers:responseHeaders()});
  }

  if(intent==="exemption_clear"){
    const energyId=text(fd,"energy_id");
    if(!energyId)return invalid("Es ist keine Ausnahme erfasst.");
    const {data:updated,error}=await supabase.from("property_energy_data")
      .update({exemption_reason:null,exemption_note:null,exemption_confirmed_on:null,exemption_confirmed_by:null})
      .eq("id",energyId).eq("version",Number(text(fd,"energy_version"))).select("id").maybeSingle();
    if(error)return fail(error); if(!updated)return conflict();
    return redirect(`/properties/${propertyId}/mandatory-data#ausnahme`,{headers:responseHeaders()});
  }

  if(intent==="presentation_add"){
    const contactId=text(fd,"contact_id");
    if(!contactId)return invalid("Bitte den Interessenten wählen, dem der Ausweis vorgelegt wurde.");
    const occasion=text(fd,"occasion")||"OTHER";
    const presentedOn=dateOrNull(fd,"presented_on");
    if(!presentedOn)return invalid("Bitte das Datum der Vorlage angeben.");
    const form=text(fd,"presentation_form");
    if(!form)return invalid("Bitte angeben, in welcher Form der Ausweis vorgelegt wurde.");
    const viewingId=text(fd,"viewing_id")||null;
    const closingId=text(fd,"closing_id")||null;
    if(occasion==="VIEWING"&&!viewingId)return invalid("Für einen Nachweis zur Besichtigung ist die Besichtigung auszuwählen.");
    if(occasion==="CONTRACT_CONCLUSION"&&!closingId)return invalid("Für eine Übergabe bei Vertragsschluss ist der Abschlussvorgang auszuwählen.");
    // Bei Vertragsschluss ist die Übergabe der Sinn des Eintrags. Wer hier
    // ausdrücklich „nur vorgelegt" wählt, bekommt eine Erklärung — der Eintrag
    // wird nicht stillschweigend zu einer Übergabe umgedeutet, die nicht
    // stattgefunden hat.
    const handedOver=text(fd,"handed_over")==="yes";
    if(occasion==="CONTRACT_CONCLUSION"&&!handedOver)return invalid("Bei Vertragsschluss wird die Übergabe dokumentiert. Bitte „Ja, übergeben\" wählen oder als sonstigen Anlass erfassen, wenn der Ausweis nur vorgelegt wurde.");
    const {error}=await supabase.from("energy_certificate_presentations").insert({
      property_id:propertyId,contact_id:contactId,
      viewing_id:occasion==="VIEWING"?viewingId:(viewingId||null),
      closing_id:occasion==="CONTRACT_CONCLUSION"?closingId:(closingId||null),
      occasion,presented_on:presentedOn,presentation_form:form,handed_over:handedOver,
      note:text(fd,"note")||null,created_by:userId,updated_by:userId,
    });
    if(error)return fail(error);
    return redirect(`/properties/${propertyId}/mandatory-data#nachweise`,{headers:responseHeaders()});
  }

  return invalid("Unbekannte Aktion.");
}

export default function PropertyMandatoryData(){
  const d=useLoaderData<typeof loader>();
  const actionData=useActionData<ActionResult>();
  const p=d.property as any;
  const energy=d.energy as any;
  const gaps=d.gaps??[];
  const complete=gaps.length===0;
  const withoutBuilding=WITHOUT_BUILDING.includes(p.property_type);
  const disabled=!d.canWrite;
  const exemption=energy?.exemption_reason??null;
  const presentations=(d.presentations??[]) as any[];
  const viewingProofs=presentations.filter((x)=>x.occasion==="VIEWING");
  const handovers=presentations.filter((x)=>x.occasion==="CONTRACT_CONCLUSION");
  const viewings=(d.viewings??[]) as any[];
  const closings=(d.closings??[]) as any[];
  const viewingsWithoutProof=viewings.filter((v)=>!viewingProofs.some((x)=>x.viewing_id===v.id));
  const closingsWithoutHandover=closings.filter((c)=>c.status!=="CANCELLED"&&!handovers.some((x)=>x.closing_id===c.id));

  return <div className="editor-shell">
    <div className="editor-header">
      <div>
        <Link className="back-link" to={`/properties/${p.id}`}>← Objektakte</Link>
        <p className="eyebrow">{p.property_number}</p>
        <h1>Pflichtangaben</h1>
        <p className="subtle">{p.internal_title}</p>
      </div>
      <div className="inline-actions">
        <span className={`status-pill ${complete?"status-sold":"status-lost"}`}>{complete?"Vollständig erfasst":`${gaps.length} ${gaps.length===1?"Lücke":"Lücken"}`}</span>
      </div>
    </div>

    {actionData?.error?<p className="form-error">{actionData.error}</p>:null}

    <p className="form-warning">Erfassung, keine rechtliche Bewertung. Das System prüft, ob die Angaben vollständig erfasst sind, und blockiert Vermarktung und Veröffentlichung, solange etwas fehlt. Ob eine Ausnahme tatsächlich greift und welche Angaben eine konkrete Anzeige tragen muss, entscheidet es nicht.</p>

    {withoutBuilding
      ?<section className="data-card"><div className="card-head"><div><p className="eyebrow">Kein Gebäude</p><h2>Keine Energieangaben erforderlich</h2></div></div>
        <p className="empty-state">Für dieses Objekt führt das System keine Angaben aus dem Energieausweis. Ob das im Einzelfall zutrifft, ist vor der Veröffentlichung zu prüfen.</p></section>
      :complete
        ?<div className="form-success"><strong>Alle Pflichtangaben sind erfasst.</strong> Vermarktung und Veröffentlichung sind aus dieser Sicht nicht blockiert. Das ist eine Vollständigkeitsprüfung, keine rechtliche Freigabe.</div>
        :<div className="form-warning"><strong>Diese Punkte blockieren Vermarktung und Veröffentlichung:</strong><ul>{gaps.map((gap)=><li key={gap}>{gap}</li>)}</ul></div>}

    {withoutBuilding?null:<>
      <section className="data-card" id="energieausweis">
        <div className="card-head"><div><p className="eyebrow">Angaben aus dem Ausweis</p><h2>Energieausweis</h2></div>{exemption?<span className="status-pill status-draft">Ausnahme erfasst</span>:energy?.certificate_present?<span className="status-pill status-sold">Ausweis vorhanden</span>:<span className="status-pill status-lost">Nicht erfasst</span>}</div>
        {exemption
          ?<p className="empty-state">Für dieses Objekt ist eine Ausnahme erfasst. Um stattdessen einen Energieausweis zu hinterlegen, ist die Ausnahme unten zuerst aufzuheben.</p>
          :<Form method="post" className="form-grid">
            <input type="hidden" name="_intent" value="energy_save"/>
            <input type="hidden" name="energy_id" value={energy?.id??""}/>
            <input type="hidden" name="energy_version" value={energy?.version??0}/>
            <label className="form-field"><span>Art des Ausweises *</span><select name="certificate_type" defaultValue={energy?.certificate_type??""} disabled={disabled}><option value="">—</option>{Object.entries(CERTIFICATE_TYPE).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><small className="subtle">Für eine Anzeige wird Bedarf oder Verbrauch benötigt.</small></label>
            <label className="form-field"><span>Endenergiewert kWh/(m²·a) *</span><input name="energy_value_kwh" defaultValue={energy?.energy_value_kwh??""} disabled={disabled}/></label>
            <label className="form-field"><span>Wesentlicher Energieträger *</span><input name="energy_source" defaultValue={energy?.energy_source??""} disabled={disabled}/><small className="subtle">Der Energieträger der Heizung, wie er im Ausweis steht.</small></label>
            <label className="form-field"><span>Baujahr laut Ausweis *</span><input name="building_year" defaultValue={energy?.building_year??""} disabled={disabled}/></label>
            <label className="form-field"><span>Energieeffizienzklasse *</span><select name="efficiency_class" defaultValue={energy?.efficiency_class??""} disabled={disabled}><option value="">—</option>{EFFICIENCY_CLASSES.map((v)=><option key={v} value={v}>{v}</option>)}</select><small className="subtle">Bei Wohngebäuden erforderlich.</small></label>
            <label className="form-field"><span>Gültig bis *</span><input type="date" name="valid_until" defaultValue={energy?.valid_until??""} disabled={disabled}/></label>
            <label className="form-field"><span>Ausgestellt am</span><input type="date" name="certificate_issued_on" defaultValue={energy?.certificate_issued_on??""} disabled={disabled}/></label>
            <label className="form-field"><span>Registriernummer</span><input name="certificate_registration_number" defaultValue={energy?.certificate_registration_number??""} disabled={disabled}/></label>
            <label className="form-field full-width"><span>Notiz</span><textarea name="notes" rows={2} defaultValue={energy?.notes??""} disabled={disabled}/></label>
            <div className="form-field full-width inline-actions"><button className="primary-button" type="submit" disabled={disabled}>Energieausweis speichern</button></div>
          </Form>}
      </section>

      <section className="data-card" id="ausnahme">
        <div className="card-head"><div><p className="eyebrow">Nur mit Begründung</p><h2>Ausnahme vom Energieausweis</h2></div></div>
        {exemption
          ?<>
            <dl className="detail-list">
              <div><dt>Grund</dt><dd>{EXEMPTION_REASON[exemption]??exemption}</dd></div>
              <div><dt>Begründung</dt><dd>{energy.exemption_note}</dd></div>
              <div><dt>Bestätigt am</dt><dd>{formatDate(energy.exemption_confirmed_on)}</dd></div>
              <div><dt>Bestätigt von</dt><dd>{energy.profiles?.display_name??"—"}</dd></div>
            </dl>
            <Form method="post" className="inline-actions" style={{marginTop:"0.75rem"}}>
              <input type="hidden" name="_intent" value="exemption_clear"/>
              <input type="hidden" name="energy_id" value={energy.id}/>
              <input type="hidden" name="energy_version" value={energy.version}/>
              <button className="secondary-button" type="submit" disabled={disabled}>Ausnahme aufheben</button>
            </Form>
          </>
          :<Form method="post" className="form-grid">
            <input type="hidden" name="_intent" value="exemption_save"/>
            <input type="hidden" name="energy_id" value={energy?.id??""}/>
            <input type="hidden" name="energy_version" value={energy?.version??0}/>
            <label className="form-field"><span>Grund *</span><select name="exemption_reason" defaultValue="" disabled={disabled}><option value="">—</option>{Object.entries(EXEMPTION_REASON).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
            <label className="form-field full-width"><span>Begründung *</span><textarea name="exemption_note" rows={3} defaultValue="" disabled={disabled} placeholder="Worauf stützt sich die Ausnahme?"/><small className="subtle">Ohne Begründung wird die Ausnahme nicht gespeichert. Bestätigt wird sie mit Ihrem Namen und dem heutigen Datum.</small></label>
            <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Ausnahme erfassen</button></div>
          </Form>}
        <p className="subtle" style={{marginTop:"0.75rem"}}>Eine Ausnahme ersetzt die Ausweisangaben. Sie wird nicht stillschweigend angenommen: ohne Grund, Begründung und Bestätigung bleibt das Objekt gesperrt.</p>
      </section>
    </>}

    <section className="data-card" id="nachweise">
      <div className="card-head"><div><p className="eyebrow">Vorlage und Übergabe</p><h2>Nachweise</h2></div><span className="status-pill">{presentations.length} {presentations.length===1?"Eintrag":"Einträge"}</span></div>

      {viewingsWithoutProof.length?<p className="form-warning">Zu {viewingsWithoutProof.length} {viewingsWithoutProof.length===1?"Besichtigung":"Besichtigungen"} ist keine Vorlage des Energieausweises dokumentiert: {viewingsWithoutProof.slice(0,5).map((v)=>v.viewing_number).join(", ")}{viewingsWithoutProof.length>5?" und weitere":""}.</p>:null}
      {closingsWithoutHandover.length?<p className="form-warning">Zu {closingsWithoutHandover.length} {closingsWithoutHandover.length===1?"Abschlussvorgang":"Abschlussvorgängen"} ist keine Übergabe des Energieausweises dokumentiert: {closingsWithoutHandover.map((c)=>c.closing_number).join(", ")}.</p>:null}

      {presentations.length===0
        ?<p className="empty-state">Noch kein Nachweis erfasst.</p>
        :<div className="data-list">{presentations.map((x)=>
          <div className="data-row" key={x.id}>
            <div><strong>{contactLabel(x.contacts)}</strong><small>{OCCASION[x.occasion]??x.occasion} · {formatDate(x.presented_on)}{x.viewings?` · ${x.viewings.viewing_number}`:""}{x.sale_closings?` · ${x.sale_closings.closing_number}`:""}</small></div>
            <div className="row-meta"><span>{PRESENTATION_FORM[x.presentation_form]??x.presentation_form}</span><small>{x.handed_over?"übergeben":"vorgelegt"}{x.note?` · ${x.note}`:""}</small></div>
            <span className={`status-pill ${x.handed_over?"status-sold":"status-draft"}`}>{x.handed_over?"Übergeben":"Vorgelegt"}</span>
          </div>)}</div>}

      <Form method="post" className="form-grid" style={{marginTop:"1rem"}}>
        <input type="hidden" name="_intent" value="presentation_add"/>
        <label className="form-field"><span>Interessent *</span><select name="contact_id" defaultValue="" disabled={disabled}><option value="">—</option>{(d.contacts as any[]).map((c)=><option key={c.id} value={c.id}>{contactLabel(c)}</option>)}</select></label>
        <label className="form-field"><span>Anlass *</span><select name="occasion" defaultValue="VIEWING" disabled={disabled}>{Object.entries(OCCASION).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field"><span>Besichtigung</span><select name="viewing_id" defaultValue="" disabled={disabled}><option value="">—</option>{viewings.map((v)=><option key={v.id} value={v.id}>{v.viewing_number} · {formatDate(String(v.starts_at??"").slice(0,10))}</option>)}</select><small className="subtle">Beim Anlass Besichtigung erforderlich.</small></label>
        <label className="form-field"><span>Abschlussvorgang</span><select name="closing_id" defaultValue="" disabled={disabled}><option value="">—</option>{closings.map((c)=><option key={c.id} value={c.id}>{c.closing_number}</option>)}</select><small className="subtle">Beim Anlass Vertragsschluss erforderlich.</small></label>
        <label className="form-field"><span>Datum *</span><input type="date" name="presented_on" defaultValue={today()} disabled={disabled}/></label>
        <label className="form-field"><span>Form *</span><select name="presentation_form" defaultValue="IN_PERSON" disabled={disabled}>{Object.entries(PRESENTATION_FORM).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field"><span>Übergeben</span><select name="handed_over" defaultValue="no" disabled={disabled}><option value="no">Nein, nur vorgelegt</option><option value="yes">Ja, übergeben</option></select><small className="subtle">Beim Anlass Vertragsschluss ist „Ja, übergeben" erforderlich.</small></label>
        <label className="form-field full-width"><span>Notiz</span><input name="note" disabled={disabled}/></label>
        <div className="form-field full-width inline-actions"><button className="secondary-button" type="submit" disabled={disabled}>Nachweis erfassen</button></div>
      </Form>
    </section>

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Vor produktiver Nutzung</p><h2>Anwaltlich abzunehmen</h2></div></div>
      <ul className="subtle">
        <li>Welche Angaben eine Immobilienanzeige im konkreten Fall tragen muss und ab wann eine Veröffentlichung als Anzeige gilt.</li>
        <li>Ob eine erfasste Ausnahme tatsächlich greift. Das System prüft nur, dass sie begründet und bestätigt ist.</li>
        <li>Ob für Gewerbeobjekte und für Objekte ohne Gebäude die hier gewählte Abgrenzung zutrifft.</li>
        <li>Wann der Energieausweis vorzulegen und wann er zu übergeben ist und was als Nachweis dafür genügt.</li>
        <li>Welche Folgen ein abgelaufener Ausweis für eine bereits laufende Vermarktung hat.</li>
      </ul>
    </section>
  </div>;
}
