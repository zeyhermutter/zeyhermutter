import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/audit-history";
import { requirePermission } from "~/lib/auth.server";
import { zeitpunkt as formatDate } from "~/lib/format";
import { AUFGABENPRIORITAET as PRIORITY_LABELS } from "~/lib/labels";
import "~/module04-fixes.css";
import "~/programm-liste.css";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
const PAGE_SIZE = 50;
// Alle Felder, die tatsaechlich in field_changes vorkommen. Vorher war rund ein
// Drittel benannt, der Rest erschien als englischer Spaltenname mit Unterstrich
// ("internal title", "first name"). Die Abschnittsmarken in Grossbuchstaben
// (ADDRESS, MEDIA, ...) sind keine Spalten, sondern ganze Teilbereiche eines
// Datensatzes; sie stehen hier ebenfalls, weil sie in derselben Liste landen.
const FIELD_LABELS:Record<string,string>={
  record:"Datensatz",ADDRESS:"Adresse",CHECKLIST:"Vermarktungscheckliste",ENERGY:"Energiedaten",FEATURE:"Merkmal",MEDIA:"Medium",OWNER:"Eigentümer",
  title:"Titel",description:"Beschreibung",status:"Status",priority:"Priorität",contact_id:"Kontakt",property_id:"Immobilie",lead_id:"Lead",search_profile_id:"Suchprofil",inquiry_id:"Anfrage",viewing_id:"Besichtigung",sale_project_id:"Verkaufsprojekt",converted_property_id:"Erzeugte Immobilie",
  first_name:"Vorname",last_name:"Nachname",email:"E-Mail",mobile:"Mobil",phone:"Telefon",salutation:"Anrede",role:"Rolle",category:"Kategorie",
  internal_title:"Interne Bezeichnung",internal_assessment:"Interne Einschätzung",internal_notes:"Interne Notizen",location_description:"Lagebeschreibung",teaser:"Kurztext",assumptions:"Annahmen",recommendation_rationale:"Begründung der Empfehlung",
  min_price:"Preis von €",max_price:"Preis bis €",min_living_area:"Wohnfläche ab m²",max_living_area:"Wohnfläche bis m²",min_plot_area:"Grundstück ab m²",min_rooms:"Zimmer ab",min_construction_year:"Baujahr ab",transaction_type:"Kauf / Miete",property_types:"Immobilientypen",financing_status:"Finanzierung",move_in_from:"Gewünschter Einzug",desired_features:"Gewünschte Merkmale",primary_responsible_user:"Verantwortlich",responsible_user:"Verantwortlich",
  property_type:"Immobilienart",condition:"Zustand",year_built:"Baujahr",modernization_year:"Modernisierungsjahr",floor:"Etage",bedrooms:"Schlafzimmer",bathrooms:"Bäder",parking_spaces:"Stellplätze",residential_units:"Wohneinheiten",plot_area_sqm:"Grundstück m²",usable_area_sqm:"Nutzfläche m²",living_area_sqm:"Wohnfläche m²",available_from:"Verfügbar ab",tenancy_status:"Vermietungsstand",hoa_fee:"Hausgeld",additional_costs:"Nebenkosten",
  postal_code:"PLZ",city:"Ort",district:"Ortsteil",address:"Adresse",property_city:"Ort der Immobilie",property_street:"Straße der Immobilie",radius_km:"Suchradius km",channel:"Eingangskanal",source_label:"Quelle",message:"Nachricht",received_at:"Eingegangen am",answered_at:"Beantwortet am",lost_reason:"Grund für kein weiteres Interesse",follow_up_at:"Wiedervorlage",
  starts_at:"Beginn",ends_at:"Ende",meeting_point:"Treffpunkt",interest_level:"Interesse",positives:"Positives Feedback",concerns:"Bedenken",price_feedback:"Preisrückmeldung",next_step:"Nächster Schritt",next_step_due_on:"Nächster Schritt fällig",next_step_user:"Nächster Schritt verantwortlich",
  amount:"Angebotsbetrag €",offer_number:"Angebotsnummer",purchase_price:"Kaufpreis €",expected_amount:"Erwarteter Betrag €",paid_amount:"Gezahlter Betrag €",paid_at:"Gezahlt am",payment_status:"Zahlungsstatus",invoice_status:"Rechnungsstatus",invoice_reference:"Rechnungsreferenz",agreed_percent:"Vereinbarter Satz %",valid_until:"Gültig bis",notes:"Notizen",submitted_at:"Abgegeben am",decided_at:"Entschieden am",supersedes_offer_id:"Ersetzt Angebot",replaced_by_offer_id:"Ersetzt durch Angebot",
  estimated_sale_price_min:"Erwarteter Verkaufspreis ab €",estimated_sale_price_max:"Erwarteter Verkaufspreis bis €",investment_min:"Investition ab €",investment_max:"Investition bis €",duration_weeks_min:"Dauer ab Wochen",duration_weeks_max:"Dauer bis Wochen",
  current_version:"Aktuelle Version",candidate_version:"Entwurfsversion",published_version:"Veröffentlichte Version",has_unpublished_changes:"Unveröffentlichte Änderungen",content_review_confirmed_at:"Inhaltsprüfung bestätigt am",content_review_confirmed_by:"Inhaltsprüfung bestätigt von",converted_at:"Umgewandelt am",converted_by:"Umgewandelt von",
  due_at:"Fällig",completed_at:"Erledigt am",archived_at:"Archiviert am",archived_by:"Archiviert von",status_before_archive:"Status vor Archivierung",version:"Version",
};
// Alle Bereiche, die einen Eintrag in die Systemhistorie schreiben koennen.
// Vorher standen hier zehn; die uebrigen einundvierzig erschienen in der Liste
// als roher Datenbankwert ("LEAD_SALES_READINESS_SCENARIO"), und der Filter
// "Bereich" bot ebenfalls nur die zehn an — nach einem Verkaufsprojekt, einer
// Provision oder einer Dokumentversion liess sich also nicht filtern.
// Die Gruppen unten bilden denselben Bestand, damit Liste und Filter nicht
// wieder auseinanderlaufen.
const ENTITY_GROUPS:{label:string;types:[string,string][]}[]=[
  {label:"Kontakte & Organisationen",types:[["CONTACT","Kontakt"],["CONTACT_ADDRESS","Kontaktadresse"],["CONTACT_RELATIONSHIP","Kontaktbeziehung"],["CONTACT_ORGANIZATION_RELATIONSHIP","Kontakt-Organisation-Verkn\u00fcpfung"],["ORGANIZATION","Organisation"],["PARTNER_PROFILE","Partnerprofil"],["PARTNER_REFERRAL_FEE","Empfehlungsverg\u00fctung"]]},
  {label:"Immobilien",types:[["PROPERTY","Immobilie"],["PROPERTY_DISCLOSURE","Pflichtangabe zur Immobilie"],["PROPERTY_EXPOSE","Expos\u00e9"],["PROPERTY_EXPOSE_MEDIA","Expos\u00e9-Medium"],["PROPERTY_MARKETING_PLACEMENT","Portalschaltung"],["PROPERTY_PUBLICATION","Website-Ver\u00f6ffentlichung"],["VALUATION","Wertermittlung"],["WEBSITE_PAGE","Website-Seite"],["MEASUREMENT_ORDER","Aufma\u00df-Auftrag"]]},
  {label:"Verkauf",types:[["SALE_PROJECT","Verkaufsprojekt"],["LEAD","Verk\u00e4ufer-Lead"],["LEAD_ACQUISITION","Lead-Akquise"],["ACQUISITION_AREA","Akquisegebiet"],["CAMPAIGN","Kampagne"],["CAMPAIGN_WAVE","Kampagnenwelle"],["BROKERAGE_MANDATE","Maklerauftrag"],["BROKERAGE_MANDATE_CLIENT","Auftraggeber im Maklerauftrag"],["BROKERAGE_MANDATE_TERM","Konditionen im Maklerauftrag"],["OFFER","Kaufangebot"],["RESERVATION","Reservierung"],["CLOSING","Abschluss & Notar"],["COMMISSION","Provision"]]},
  {label:"Verkaufsstrategie-Check",types:[["LEAD_SALES_READINESS_CHECK","Verkaufsstrategie-Check"],["LEAD_SALES_READINESS_SCENARIO","Szenario im Check"],["LEAD_SALES_READINESS_MEASURE","Ma\u00dfnahme im Check"],["LEAD_SALES_READINESS_MEDIA","Medium im Check"]]},
  {label:"Interessenten",types:[["SEARCH_PROFILE","Suchprofil"],["SEARCH_PROFILE_MATCH","Suchprofil-Treffer"],["INQUIRY","Anfrage"],["RESPONSE_TARGET","Reaktionszeit-Vorgabe"],["VIEWING","Besichtigung"],["VIEWING_FEEDBACK","Besichtigungsfeedback"]]},
  {label:"Nach dem Verkauf",types:[["AFTER_SALES_STEP","Nachbetreuungsschritt"],["REFERRAL","Empfehlung"],["CASE_STUDY","Case Study"],["CASE_STUDY_MEDIA","Case-Study-Medium"]]},
  {label:"Unterlagen & Pflichten",types:[["DOCUMENT","Dokument"],["DOCUMENT_VERSION","Dokumentversion"],["RETENTION_RULE","Aufbewahrungsregel"],["GWG_CASE","Geldw\u00e4sche-Vorgang"],["GWG_IDENTIFICATION","Geldw\u00e4sche-Identifizierung"]]},
  // "profile" ist ein einzelner Eintrag aus der Ersteinrichtung, bevor der
  // Bereich "USER" hiess. Die Systemhistorie ist append-only, der Eintrag wird
  // deshalb nicht umgeschrieben, sondern hier benannt und filterbar gemacht.
  {label:"Arbeit & Verwaltung",types:[["TASK","Aufgabe"],["COMMENT","Kommentar"],["USER","Benutzer"],["TRAINING_RECORD","Weiterbildungsnachweis"],["profile","Benutzer (Alteintrag)"]]},
];
const ENTITY_LABELS:Record<string,string>=Object.fromEntries(ENTITY_GROUPS.flatMap(group=>group.types));
const ACTION_LABELS:Record<string,string>={CREATE:"Angelegt",UPDATE:"Geändert",STATUS_CHANGE:"Status geändert",ARCHIVE:"Archiviert",RESTORE:"Wiederhergestellt",DELETE:"Gelöscht",ROLE_ASSIGNED:"Rolle zugewiesen"};
const STATUS_LABELS:Record<string,string>={
  ACTIVE:"Aktiv",PAUSED:"Pausiert",CLOSED:"Geschlossen",NEW:"Neu",CONTACTED:"Kontaktiert",QUALIFIED:"Qualifiziert",VIEWING_PLANNED:"Besichtigung geplant",LOST:"Kein weiteres Interesse",
  PLANNED:"Geplant",CONFIRMED:"Bestätigt",COMPLETED:"Durchgeführt",CANCELLED:"Abgesagt",NO_SHOW:"Nicht erschienen",
  DRAFT:"Entwurf",SUBMITTED:"Abgegeben",COUNTERED:"Gegenangebot",ACCEPTED:"Angenommen",REJECTED:"Abgelehnt",WITHDRAWN:"Zurückgezogen",REPLACED:"Ersetzt / nicht mehr aktuell",
  OPEN:"Offen",IN_PROGRESS:"In Bearbeitung",DONE:"Erledigt",
};

const TRANSACTION_LABELS:Record<string,string>={BUY:"Kauf",RENT:"Miete",SALE:"Verkauf"};
const FINANCING_LABELS:Record<string,string>={OPEN:"Noch offen",IN_PROGRESS:"In Klärung",CONFIRMED:"Bestätigt",NOT_REQUIRED:"Nicht erforderlich"};
const TYPE_LABELS:Record<string,string>={DETACHED_HOUSE:"Einfamilienhaus",SEMI_DETACHED_HOUSE:"Doppelhaushälfte",TERRACED_HOUSE:"Reihenhaus",APARTMENT_BUILDING:"Mehrfamilienhaus",APARTMENT:"Wohnung",PENTHOUSE:"Penthouse",MAISONETTE:"Maisonette",LAND:"Grundstück",COMMERCIAL:"Gewerbe",OFFICE:"Büro",RETAIL:"Einzelhandel",GARAGE:"Garage",PARKING_SPACE:"Stellplatz",OTHER:"Sonstige"};

function valueLabel(value:unknown,field?:string){
  if(value===null||value===undefined||value==="")return"—";
  if(Array.isArray(value)){
    if(field==="property_types")return value.map(v=>TYPE_LABELS[String(v)]??String(v)).join(", ")||"—";
    return value.map(v=>String(v)).join(", ")||"—";
  }
  if(typeof value==="boolean")return value?"Ja":"Nein";
  if(typeof value==="object"){const text=JSON.stringify(value);return text.length>160?`${text.slice(0,157)}…`:text;}
  const raw=String(value);
  if(field==="status")return STATUS_LABELS[raw]??raw;
  if(field==="priority")return PRIORITY_LABELS[raw]??raw;
  if(field==="transaction_type")return TRANSACTION_LABELS[raw]??raw;
  if(field==="financing_status")return FINANCING_LABELS[raw]??raw;
  if(field==="property_types")return TYPE_LABELS[raw]??raw;
  // Benutzer- und Verweisfelder tragen eine UUID. Die hilft niemandem, deshalb
  // steht hier nur, ob eine Verknuepfung besteht.
  if(field?.endsWith("_id")||field?.endsWith("_by")||field?.endsWith("_user")||field==="primary_responsible_user")return raw?"Verknüpft":"—";
  return raw.length>160?`${raw.slice(0,157)}…`:raw;
}
export async function loader({request,context}:Route.LoaderArgs){const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"audit.read");const url=new URL(request.url);const entityType=(url.searchParams.get("entity")??"").trim();const action=(url.searchParams.get("action")??"").trim();const actor=(url.searchParams.get("actor")??"").trim();const reference=(url.searchParams.get("reference")??"").trim();const page=Math.max(1,Number(url.searchParams.get("page")??"1")||1);const from=(page-1)*PAGE_SIZE,to=from+PAGE_SIZE-1;let query=supabase.from("audit_events").select("id, occurred_at, actor_display_name_snapshot, entity_type, entity_id, entity_reference, action, field_changes, source, description",{count:"exact"}).neq("entity_type","WEBSITE_ACCESS").order("occurred_at",{ascending:false}).range(from,to);if(entityType)query=query.eq("entity_type",entityType);if(action)query=query.eq("action",action);if(actor)query=query.ilike("actor_display_name_snapshot",`%${actor}%`);if(reference)query=query.ilike("entity_reference",`%${reference}%`);const {data:events,count,error}=await query;if(error)throw new Response("Systemhistorie konnte nicht geladen werden.",{status:500});const total=count??0;return data({events:events??[],total,page,pageCount:Math.max(1,Math.ceil(total/PAGE_SIZE)),filters:{entityType,action,actor,reference},profile},{headers:responseHeaders()});}
function pageHref(page:number,filters:{entityType:string;action:string;actor:string;reference:string}){const params=new URLSearchParams();if(filters.entityType)params.set("entity",filters.entityType);if(filters.action)params.set("action",filters.action);if(filters.actor)params.set("actor",filters.actor);if(filters.reference)params.set("reference",filters.reference);params.set("page",String(page));return`/crm/history?${params.toString()}`;}
// Farbe je Aktion: angelegt gruen, geaendert blau, archiviert grau,
// wiederhergestellt bernstein, geloescht rot (13.10.2026).
const ACTION_CLASS:Record<string,string>={CREATE:"status-sold",UPDATE:"status-marketing",STATUS_CHANGE:"status-marketing",ROLE_ASSIGNED:"status-marketing",ARCHIVE:"status-archived",RESTORE:"status-preparation",DELETE:"status-lost"};

export default function AuditHistory(){
  const {events,total,page,pageCount,filters}=useLoaderData<typeof loader>();
  // Programmliste (13.10.2026): Werkzeugleiste und eine Tabelle -- Zeitpunkt,
  // Aktion, Bereich, Referenz, Benutzer. Die geaenderten Felder klappen je
  // Zeile auf; vorher stand jeder Eintrag als Karte mit dem vollen
  // Datensatz als JSON darunter.
  return <main className="editor-shell programm-liste"><ListenUeberschrift/>
    <Form method="get" className="programm-liste-werkzeuge">
      <label><span className="sr-only">Bereich</span><select name="entity" defaultValue={filters.entityType}><option value="">Alle Bereiche</option>{ENTITY_GROUPS.map(group=><optgroup key={group.label} label={group.label}>{group.types.map(([value,label])=><option key={value} value={value}>{label}</option>)}</optgroup>)}</select></label>
      <label><span className="sr-only">Aktion</span><select name="action" defaultValue={filters.action}><option value="">Alle Aktionen</option>{Object.entries(ACTION_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="programm-liste-suche"><span className="sr-only">Benutzer</span><input name="actor" defaultValue={filters.actor} placeholder="Benutzer"/></label>
      <label className="programm-liste-suche"><span className="sr-only">Referenz</span><input name="reference" defaultValue={filters.reference} placeholder="Referenz, z. B. ZM-S-000002"/></label>
      <button className="secondary-button" type="submit">Filtern</button>
      <span className="programm-liste-zaehler">{total} Ereignisse · Seite {page} / {pageCount}</span>
    </Form>
    <div className="programm-tabelle-rahmen">
      {events.length===0?<p className="programm-liste-leer">Keine Ereignisse für diese Filter.</p>:<table className="programm-tabelle historie">
        <thead><tr><th>Zeitpunkt</th><th>Aktion</th><th>Bereich</th><th>Referenz</th><th>Benutzer</th><th>Änderungen</th></tr></thead>
        <tbody>{events.map((event)=>{
          const changes=Object.entries((event.field_changes??{}) as Record<string,{old?:unknown;new?:unknown}>);
          return <tr key={event.id}>
            <td className="zahl">{formatDate(event.occurred_at)}</td>
            <td><span className={`status-pill ${ACTION_CLASS[event.action]??""}`}>{ACTION_LABELS[event.action]??event.action}</span></td>
            <td>{ENTITY_LABELS[event.entity_type]??event.entity_type}</td>
            <td className="zahl">{event.entity_reference??<span className="leise">—</span>}</td>
            <td>{event.actor_display_name_snapshot??<span className="leise">System</span>}</td>
            <td>{event.description?<div>{event.description}</div>:null}{changes.length===0?(event.description?null:<span className="leise">—</span>):<details className="historie-felder"><summary>{changes.length===1?(FIELD_LABELS[changes[0][0]]??changes[0][0].replaceAll("_"," ")):`${changes.length} Felder`}</summary><dl>{changes.slice(0,24).map(([field,change])=><div key={field}><dt>{FIELD_LABELS[field]??field.replaceAll("_"," ")}</dt><dd>{valueLabel(change?.old,field)} → {valueLabel(change?.new,field)}</dd></div>)}</dl></details>}</td>
          </tr>;
        })}</tbody>
      </table>}
    </div>
    {pageCount>1?<div className="programm-liste-seiten">{page>1?<Link to={pageHref(page-1,filters)}>← Zurück</Link>:<span/>}<span>Seite {page} von {pageCount}</span>{page<pageCount?<Link to={pageHref(page+1,filters)}>Weiter →</Link>:<span/>}</div>:null}
  </main>;
}
