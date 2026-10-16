import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/crm-search";
import { requireActiveUser } from "~/lib/auth.server";
import { tagKurz } from "~/lib/format";
import { ABSCHLUSSSTATUS, BESICHTIGUNGSSTATUS, SUCHTREFFERART, VERKAUFSPROJEKTSTATUS, ANFRAGEKANAL, ANFRAGESTATUS, AUFGABENSTATUS, IMMOBILIENSTATUS, KAUFANGEBOTSTATUS, KONTAKTSTATUS, LEADSTATUS, beschrifte, type Beschriftungen } from "~/lib/labels";
import "~/module04-fixes.css";
import "~/programm-liste.css";

import { sucheUeberall, type Treffer } from "~/lib/globale-suche.server";

// Woher die Treffer kommen: app/lib/globale-suche.server.ts (P2-2, 16.10.2026).
// Vorher filterte diese Seite Kaufangebote und Abschluesse im Browser aus den
// 300 zuletzt geaenderten und schnitt bei 100 Treffern still ab.
type SearchResult=Treffer;

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const includeArchived = url.searchParams.get("archived") === "1";
  const { treffer: results, mehr, fehler } = await sucheUeberall(supabase, q, includeArchived);
  if (fehler && results.length === 0) throw new Response("Suche konnte nicht ausgeführt werden.", { status: 500 });
  return data({ q, includeArchived, results, mehr, fehler }, { headers: responseHeaders() });
}
const LABELS=SUCHTREFFERART;
const STATUS_LABELS:Record<string,string>={OPEN:"Offen",IN_PROGRESS:"In Bearbeitung",DONE:"Erledigt",CANCELLED:"Abgebrochen",ACTIVE:"Aktiv",PAUSED:"Pausiert",CLOSED:"Erledigt",NEW:"Neu",CONTACTED:"Kontaktiert",QUALIFIED:"Qualifiziert",VIEWING_PLANNED:"Besichtigung geplant",LOST:"Kein weiteres Interesse",ARCHIVED:"Archiviert",DRAFT:"Entwurf",SUBMITTED:"Abgegeben",COUNTERED:"Gegenangebot",ACCEPTED:"Angenommen",REJECTED:"Abgelehnt",WITHDRAWN:"Zurückgezogen",REPLACED:"Ersetzt",FAILED:"Abschluss gescheitert",PREPARATION:"Abschlussvorbereitung",NOTARY_INSTRUCTED:"Notariat beauftragt",DRAFT_RECEIVED:"Entwurf eingegangen",APPOINTMENT_SCHEDULED:"Beurkundung terminiert",NOTARIZED:"Beurkundet",PURCHASE_PRICE_DUE:"Kaufpreis fällig",PURCHASE_PRICE_PAID:"Kaufpreis bezahlt",HANDOVER_COMPLETED:"Übergabe erfolgt",COMPLETED:"Abgeschlossen"};
// Der Stand haengt an der Art: MARKETING ist bei einer Immobilie
// "Vermarktung", NEW bei einem Lead "Neu". Vorher stand fuer Immobilien der
// gespeicherte Wert MARKETING in der Trefferliste (live auf BETA, 13.10.2026).
const STATUS_JE_ART:Record<string,Beschriftungen>={PROJECT:VERKAUFSPROJEKTSTATUS,VIEWING:BESICHTIGUNGSSTATUS,PROPERTY:IMMOBILIENSTATUS,LEAD:LEADSTATUS,INQUIRY:ANFRAGESTATUS,OFFER:KAUFANGEBOTSTATUS,CLOSING:ABSCHLUSSSTATUS,CONTACT:KONTAKTSTATUS,TASK:AUFGABENSTATUS};
// Die Unterzeile einer Anfrage faellt in der Datenbank auf den Kanal
// zurueck (i.channel), wenn weder Objekt noch Suchprofil noch Quelle
// gesetzt ist -- dann stand dort "OTHER".
function detailText(result:SearchResult){
  if(!result.subtitle) return "—";
  if(result.entity_type==="INQUIRY"&&result.subtitle in ANFRAGEKANAL) return ANFRAGEKANAL[result.subtitle];
  return result.subtitle;
}
function standText(result:SearchResult){
  if(result.archived) return "Archiviert";
  const tabelle=STATUS_JE_ART[result.entity_type];
  return beschrifte(tabelle&&result.status in tabelle?tabelle:STATUS_LABELS,result.status);
}
export default function CrmSearch() {
  const { q, includeArchived, results, mehr, fehler } = useLoaderData<typeof loader>();
  // Programmliste (13.10.2026): Suchleiste als Werkzeugleiste, Treffer als
  // Tabelle mit Spalten -- vorher grosses Suchfeld und Zeilen ohne Spalten.
  return <main className="editor-shell programm-liste">
    <Form method="get" className="programm-liste-werkzeuge" role="search">
      <label className="programm-liste-suche"><span className="sr-only">CRM durchsuchen</span><input type="search" name="q" defaultValue={q} placeholder="Name, Nummer, Ort, Adresse oder E-Mail …" minLength={2} autoFocus autoComplete="off"/></label>
      <label className="programm-liste-haken"><input type="checkbox" name="archived" value="1" defaultChecked={includeArchived}/><span>Archiv einbeziehen</span></label>
      <button className="secondary-button" type="submit">Suchen</button>
      <span className="programm-liste-zaehler" aria-live="polite">{q.length>=2?`${mehr?"Mehr als ":""}${results.length} Treffer`:""}</span>
    </Form>
    <div className="programm-tabelle-rahmen">
      {q.length<2?<p className="programm-liste-leer">Mindestens zwei Zeichen eingeben. Gesucht wird in Namen, CRM-Nummern, Orten, Adressen, E-Mail-Adressen und Telefonnummern.</p>:null}
      {q.length>=2&&results.length===0?<p className="programm-liste-leer">Keine Treffer.</p>:null}
      {mehr?<p className="form-warning programm-liste-hinweis">Es gibt mehr Treffer, als hier stehen. Bitte genauer suchen — etwa mit Nummer, Nachname oder Ort.</p>:null}
      {fehler?<p className="form-warning programm-liste-hinweis">Ein Teil der Suche (Kaufangebote, Abschlüsse, Verkaufsprojekte oder Besichtigungen) konnte nicht geladen werden.</p>:null}
      {results.length>0?<table className="programm-tabelle">
        <thead><tr><th>Nummer</th><th>Bezeichnung</th><th>Art</th><th>Details</th><th>Stand</th><th className="rechts">Geändert</th></tr></thead>
        <tbody>{results.map(result=><tr key={`${result.entity_type}-${result.entity_id}`}>
          <td className="zahl"><Link to={result.pfad}>{result.reference}</Link></td>
          <td><Link to={result.pfad}>{result.title}</Link></td>
          <td>{LABELS[result.entity_type]??result.entity_type}</td>
          <td className="leise">{detailText(result)}</td>
          <td>{standText(result)}</td>
          <td className="zahl rechts leise">{tagKurz(result.updated_at)}</td>
        </tr>)}</tbody>
      </table>:null}
    </div>
  </main>;
}
