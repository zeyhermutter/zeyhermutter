import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/contact-overview";
import { requireActiveUser } from "~/lib/auth.server";
import { tag, zeitpunkt } from "~/lib/format";
import { standKlasse } from "~/lib/stand-ton";
import {
  ANFRAGESTATUS, BESICHTIGUNGSSTATUS, IMMOBILIENSTATUS, KAUFANGEBOTSTATUS, LEADSTATUS, beschrifte, AKTIVITAETSART,
} from "~/lib/labels";
import { AufgabenBaustein } from "~/components/aufgaben-baustein";
import { TelefonatErfassen, TelefonatMeldung } from "~/components/telefonat-erfassen";
import { aufgabenRahmen, AUFGABEN_SPALTEN } from "~/lib/aufgaben.server";
import "~/programm-liste.css";
import "~/akte-blick.css";
import "~/kontakt-uebersicht.css";

// Die Uebersicht einer Kontaktakte -- der erste Reiter (P1-2, 14.10.2026).
//
// WARUM
//
// Wer einen Kontakt oeffnete, landete im Formular der Stammdaten. Was die
// Person mit dem Buero zu tun hat -- sucht sie, verkauft sie, wann war der
// letzte Kontakt, was ist als Naechstes faellig --, stand auf vier Reitern
// und sechs weiteren Seiten verteilt. Der Audit (14.10.) zaehlte bis zu
// sieben Seitenwechsel fuer die Frage "Was ist mit dieser Person?".
//
// Diese Seite beantwortet sie auf einen Blick und aendert nichts: Sie liest
// nur. Bearbeitet wird wie bisher auf den anderen Reitern und Akten, zu
// denen jede Zeile fuehrt. Der "Naechste Schritt" ist keine Empfehlung,
// sondern das frueheste Datum, das schon im System steht.

const MINDESTENS_PASSEND = 50;
const OFFEN_AUFGABE = ["OPEN", "IN_PROGRESS"];
const OFFEN_LEAD = ["NEW", "CONTACTED", "QUALIFIED", "APPOINTMENT", "VALUATION", "OFFER", "NURTURE"];
const OFFEN_ANFRAGE = ["NEW", "CONTACTED", "QUALIFIED", "VIEWING_PLANNED"];
const KOMMEND_BESICHTIGUNG = ["PLANNED", "CONFIRMED"];
const OFFEN_ANGEBOT = ["DRAFT", "SUBMITTED", "COUNTERED", "ACCEPTED"];
const SUCHPROFILSTATUS: Record<string, string> = { ACTIVE: "Aktiv", PAUSED: "Pausiert", CLOSED: "Abgeschlossen" };
const OBJEKTART: Record<string, string> = {
  DETACHED_HOUSE: "Einfamilienhaus", SEMI_DETACHED_HOUSE: "Doppelhaushälfte", TERRACED_HOUSE: "Reihenhaus",
  APARTMENT_BUILDING: "Mehrfamilienhaus", APARTMENT: "Wohnung", PENTHOUSE: "Penthouse", MAISONETTE: "Maisonette",
  LAND: "Grundstück", COMMERCIAL: "Gewerbe", OFFICE: "Büro", RETAIL: "Einzelhandel", GARAGE: "Garage",
  PARKING_SPACE: "Stellplatz", OTHER: "Sonstiges",
};
const KONTAKTWEG: Record<string, string> = { EMAIL: "E-Mail", MOBILE: "Mobil", PHONE: "Telefon", LETTER: "Brief" };

const eins = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const objektName = (p: any) => (p ? [p.property_number, p.internal_title].filter(Boolean).join(" · ") : "Objekt");

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const id = params.contactId;
  if (!id) throw new Response("Kontakt fehlt.", { status: 404 });

  const [kontaktRes, eigentumRes, suchRes, leadRes, anfrageRes, besichtigungRes, angebotRes, aufgabeRes, verlaufRes, nutzerRes] = await Promise.all([
    supabase.from("contacts").select("id,contact_number,first_name,last_name,email,phone,mobile,preferred_channel,status,archived_at").eq("id", id).maybeSingle(),
    supabase.from("property_owners").select("id,ownership_percentage,valid_until,properties(id,property_number,internal_title,status,archived_at)").eq("contact_id", id),
    supabase.from("search_profiles").select("id,search_profile_number,title,status,transaction_type,property_types,max_price,search_profile_locations(city,postal_code,radius_km)").eq("contact_id", id).is("archived_at", null).order("created_at", { ascending: false }),
    supabase.from("leads").select("id,lead_number,status,follow_up_at,property_type,property_city").eq("contact_id", id).is("archived_at", null).order("created_at", { ascending: false }).limit(10),
    supabase.from("inquiries").select("id,inquiry_number,status,received_at,answered_at,properties(id,property_number,internal_title)").eq("contact_id", id).is("archived_at", null).order("received_at", { ascending: false }).limit(10),
    supabase.from("viewings").select("id,viewing_number,status,starts_at,properties(id,property_number,internal_title)").eq("contact_id", id).is("archived_at", null).order("starts_at", { ascending: false }).limit(10),
    supabase.from("purchase_offers").select("id,offer_number,status,amount,properties(id,property_number,internal_title)").eq("contact_id", id).is("archived_at", null).order("created_at", { ascending: false }).limit(10),
    supabase.from("tasks").select(AUFGABEN_SPALTEN).eq("contact_id", id).in("status", OFFEN_AUFGABE).is("archived_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(20),
    supabase.from("activity_events").select("id,activity_type,title,occurred_at").eq("contact_id", id).order("occurred_at", { ascending: false }).limit(5),
    aufgabenRahmen(supabase),
  ]);
  if (kontaktRes.error) throw new Response("Kontakt konnte nicht geladen werden.", { status: 500 });
  if (!kontaktRes.data) throw new Response("Kontakt nicht gefunden.", { status: 404 });

  // Passende Objekte je aktivem Suchprofil -- dieselbe Funktion wie im
  // Suchprofil selbst, damit beide Zahlen gleich sind.
  const aktiveProfile = ((suchRes.data ?? []) as any[]).filter((s) => s.status === "ACTIVE").slice(0, 5);
  const treffer = await Promise.all(aktiveProfile.map((s) =>
    supabase.rpc("match_properties_for_search_profile", { p_search_profile_id: s.id, p_limit: 50 })));
  const passend = new Set<string>();
  const passendJeProfil: Record<string, number> = {};
  let passendFehlt = false;
  treffer.forEach((t, i) => {
    if (t.error) { passendFehlt = true; return; }
    // Die Funktion liefert auch "nicht passend" (unter 50 %) -- gezaehlt wird
    // wie im Suchprofil ab "teilweise passend".
    const ids = ((t.data ?? []) as any[]).filter((z) => Number(z.score) >= MINDESTENS_PASSEND).map((z) => z.property_id as string);
    passendJeProfil[aktiveProfile[i].id] = ids.length;
    ids.forEach((pid) => passend.add(pid));
  });

  const fehlt = [eigentumRes, suchRes, leadRes, anfrageRes, besichtigungRes, angebotRes, aufgabeRes, verlaufRes]
    .some((r) => r.error);

  return data({
    kontakt: kontaktRes.data,
    eigentum: ((eigentumRes.data ?? []) as any[]).map((e) => ({ ...e, objekt: eins(e.properties) })).filter((e) => e.objekt),
    suchprofile: (suchRes.data ?? []) as any[],
    leads: (leadRes.data ?? []) as any[],
    anfragen: (anfrageRes.data ?? []) as any[],
    besichtigungen: (besichtigungRes.data ?? []) as any[],
    angebote: (angebotRes.data ?? []) as any[],
    aufgaben: (aufgabeRes.data ?? []) as any[],
    verlauf: (verlaufRes.data ?? []) as any[],
    nutzer: nutzerRes.nutzer,
    darfAufgaben: nutzerRes.darfAufgaben,
    ich: userId as string,
    passend: passendFehlt && passend.size === 0 ? null : passend.size,
    passendJeProfil,
    fehlt,
    jetzt: new Date().toISOString(),
  }, { headers: responseHeaders() });
}

type Schritt = { wann: string; was: string; wo: string; pfad: string };

export default function ContactOverview() {
  const d = useLoaderData<typeof loader>();
  const k = d.kontakt as any;
  const basis = `/crm/contacts/${k.id}`;
  const heute = d.jetzt.slice(0, 10);

  const aktiveSuche = d.suchprofile.filter((s) => s.status === "ACTIVE");
  const offeneLeads = d.leads.filter((l) => OFFEN_LEAD.includes(l.status));
  const offeneAnfragen = d.anfragen.filter((a) => OFFEN_ANFRAGE.includes(a.status));
  const kommend = d.besichtigungen.filter((b) => KOMMEND_BESICHTIGUNG.includes(b.status) && b.starts_at >= d.jetzt)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const eigentum = d.eigentum.filter((e) => !e.objekt.archived_at && (!e.valid_until || e.valid_until >= heute));
  const offeneAngebote = d.angebote.filter((a) => OFFEN_ANGEBOT.includes(a.status));
  const ueberfaellig = d.aufgaben.filter((a) => a.due_at && a.due_at.slice(0, 10) < heute).length;

  // Wer ist diese Person fuer das Buero? Aus dem, was im System steht.
  const lage: string[] = [];
  for (const s of aktiveSuche.slice(0, 2)) {
    const ort = eins(s.search_profile_locations as any) as any;
    lage.push([
      s.transaction_type === "RENT" ? "Mietinteressent" : "Kaufinteressent",
      (s.property_types ?? []).slice(0, 2).map((t: string) => OBJEKTART[t] ?? t).join(" / ") || null,
      ort?.city ?? ort?.postal_code ?? null,
    ].filter(Boolean).join(" · "));
  }
  if (eigentum.length) lage.push(`Eigentümer · ${eigentum.length === 1 ? objektName(eigentum[0].objekt) : `${eigentum.length} Objekte`}`);
  if (offeneLeads.length) lage.push(`Verkaufsinteresse · ${offeneLeads[0].lead_number}${offeneLeads[0].property_city ? ` · ${offeneLeads[0].property_city}` : ""}`);

  // Naechster Schritt: das frueheste Datum, das im System schon steht.
  const schritte: Schritt[] = [
    ...d.aufgaben.filter((a) => a.due_at).map((a) => ({ wann: a.due_at, was: a.title, wo: `Aufgabe ${a.task_number}`, pfad: "#aufgaben" })),
    ...kommend.map((b) => ({ wann: b.starts_at, was: `Besichtigung ${objektName(eins(b.properties))}`, wo: b.viewing_number, pfad: `/viewings/${b.id}` })),
    ...offeneLeads.filter((l) => l.follow_up_at).map((l) => ({ wann: l.follow_up_at, was: "Wiedervorlage zum Verkaufsinteresse", wo: l.lead_number, pfad: `/leads/${l.id}` })),
    ...offeneAnfragen.filter((a) => a.status === "NEW" && !a.answered_at).map((a) => ({ wann: a.received_at, was: `Anfrage beantworten · ${objektName(eins(a.properties))}`, wo: a.inquiry_number, pfad: `/inquiries/${a.id}` })),
  ].sort((a, b) => a.wann.localeCompare(b.wann));
  const naechster = schritte[0] ?? null;
  const naechsterUeberfaellig = naechster ? naechster.wann.slice(0, 10) < heute : false;

  const telefon = k.mobile ?? k.phone ?? null;
  const letzter = d.verlauf[0] ?? null;

  type Vorgang = { id: string; pfad: string; art: string; titel: string; zusatz: string | null; stand: string };
  const vorgaenge: Vorgang[] = [
    ...d.suchprofile.filter((s) => s.status !== "CLOSED").map((s) => ({
      id: s.id, pfad: `/search-profiles/${s.id}`, art: "Suchprofil", titel: `${s.search_profile_number} · ${s.title}`,
      zusatz: s.status === "ACTIVE" && d.passendJeProfil[s.id] !== undefined ? `${d.passendJeProfil[s.id]} passende Objekte` : null,
      stand: SUCHPROFILSTATUS[s.status] ?? s.status,
    })),
    ...eigentum.map((e) => ({
      id: e.id, pfad: `/properties/${e.objekt.id}`, art: "Eigentum", titel: objektName(e.objekt),
      zusatz: e.ownership_percentage ? `${Number(e.ownership_percentage).toLocaleString("de-DE")} %` : null,
      stand: beschrifte(IMMOBILIENSTATUS, e.objekt.status),
    })),
    ...offeneLeads.map((l) => ({
      id: l.id, pfad: `/leads/${l.id}`, art: "Lead", titel: [l.lead_number, OBJEKTART[l.property_type] ?? null, l.property_city].filter(Boolean).join(" · "),
      zusatz: l.follow_up_at ? `Wiedervorlage ${tag(l.follow_up_at)}` : null, stand: beschrifte(LEADSTATUS, l.status),
    })),
    ...offeneAnfragen.map((a) => ({
      id: a.id, pfad: `/inquiries/${a.id}`, art: "Anfrage", titel: `${a.inquiry_number} · ${objektName(eins(a.properties))}`,
      zusatz: `eingegangen ${tag(a.received_at)}`, stand: beschrifte(ANFRAGESTATUS, a.status),
    })),
    ...kommend.map((b) => ({
      id: b.id, pfad: `/viewings/${b.id}`, art: "Besichtigung", titel: `${b.viewing_number} · ${objektName(eins(b.properties))}`,
      zusatz: zeitpunkt(b.starts_at), stand: beschrifte(BESICHTIGUNGSSTATUS, b.status),
    })),
    ...offeneAngebote.map((a) => ({
      id: a.id, pfad: `/purchase-offers/${a.id}`, art: "Kaufangebot", titel: `${a.offer_number} · ${objektName(eins(a.properties))}`,
      zusatz: Number(a.amount).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
      stand: beschrifte(KAUFANGEBOTSTATUS, a.status),
    })),
  ];

  return (
    <main className="editor-shell">
    <div className="kontakt-uebersicht">
      {d.fehlt ? <p className="form-warning">Ein Teil der Übersicht konnte gerade nicht geladen werden. Die übrigen Angaben stimmen.</p> : null}

      <section className="data-card akte-blick" aria-label="Auf einen Blick">
        <div className="akte-blick-kopf">
          <div>
            {lage.length
              ? lage.map((z) => <p className="akte-blick-satz" key={z}>{z}</p>)
              : <p className="akte-blick-satz leise">Noch kein Suchprofil, kein Objekt, kein Verkaufsinteresse.</p>}
            <p className="akte-blick-erreichbar">
              {telefon ? <a href={`tel:${telefon.replace(/[^+\d]/g, "")}`}>{telefon}</a> : null}
              {k.email ? <a href={`mailto:${k.email}`}>{k.email}</a> : null}
              {k.preferred_channel ? <span className="leise">bevorzugt: {KONTAKTWEG[k.preferred_channel] ?? k.preferred_channel}</span> : null}
              {!telefon && !k.email ? <span className="leise">Keine Telefonnummer und keine E-Mail hinterlegt.</span> : null}
            </p>
          </div>
          <div className="akte-blick-aktionen">
            {/* Nach dem Anruf steht das Formular "Telefonat" schon offen da. */}
            {telefon ? <a className="secondary-button link-button compact" href={`tel:${telefon.replace(/[^+\d]/g, "")}`} onClick={() => { window.location.hash = "telefonat-neu"; }}>Anrufen</a> : null}
            <a className="secondary-button link-button compact" href="#telefonat-neu">+ Telefonat</a>
            {d.darfAufgaben ? <a className="secondary-button link-button compact" href="#aufgabe-neu">+ Aufgabe</a> : null}
            <Link className="secondary-button link-button compact" to={`${basis}/collaboration`}>+ Notiz</Link>
          </div>
        </div>

        <p className="programm-kennzahlen akte-blick-zahlen">
          {aktiveSuche.length ? <a href="#vorgaenge"><strong>{d.passend ?? "—"}</strong> passende Objekte</a> : null}
          <a href="#aufgaben" className={ueberfaellig ? "warnung" : undefined}><strong>{d.aufgaben.length}</strong> offene Aufgaben{ueberfaellig ? `, ${ueberfaellig} überfällig` : ""}</a>
          <a href="#vorgaenge"><strong>{kommend.length}</strong> anstehende Besichtigungen</a>
          <a href="#vorgaenge"><strong>{eigentum.length}</strong> eigene Objekte</a>
        </p>

        <div className={`akte-naechster${naechsterUeberfaellig ? " ueberfaellig" : ""}`}>
          <span>Nächster Schritt</span>
          {naechster ? <>
            <Link to={naechster.pfad}><strong>{naechster.was}</strong></Link>
            <small>{naechster.wo} · {naechsterUeberfaellig ? "überfällig seit " : ""}{zeitpunkt(naechster.wann)}{schritte.length > 1 ? ` · danach ${schritte.length - 1} weitere` : ""}</small>
          </> : <>
            <strong>Kein nächster Schritt geplant</strong>
            {d.darfAufgaben ? <a className="subtle-link" href="#aufgabe-neu">Aufgabe anlegen →</a> : null}
          </>}
        </div>
      </section>

      <div className="kontakt-uebersicht-raster">
        <section className="data-card" id="vorgaenge">
          <div className="card-head">
            <div><p className="eyebrow">Was läuft</p><h2>Laufende Vorgänge{vorgaenge.length ? ` · ${vorgaenge.length}` : ""}</h2></div>
            <Link className="subtle-link" to={`/search-profiles/new?contact_id=${k.id}`}>+ Suchprofil</Link>
          </div>
          {vorgaenge.length === 0
            ? <p className="empty-state">Zu diesem Kontakt läuft gerade nichts.</p>
            : <div className="data-list">{vorgaenge.map((v) => (
                <Link className="data-row data-row-link" to={v.pfad} key={`${v.art}-${v.id}`}>
                  <div><small className="akte-art">{v.art}</small><strong>{v.titel}</strong>{v.zusatz ? <small>{v.zusatz}</small> : null}</div>
                  <div className="row-meta"><span className={`status-pill ${standKlasse(v.stand)}`}>{v.stand}</span></div>
                </Link>
              ))}</div>}
        </section>

        <div className="kontakt-uebersicht-spalte">
          <AufgabenBaustein aufgaben={d.aufgaben as any} art="contact" id={k.id} nutzer={d.nutzer} ich={d.ich} darfSchreiben={d.darfAufgaben} kontextName={`Kontakt ${k.contact_number}`} />

          <section className="data-card" id="letzter-kontakt">
            <div className="card-head">
              <div><p className="eyebrow">Letzter Kontakt</p><h2>{letzter ? tag(letzter.occurred_at) : "Noch keiner erfasst"}</h2></div>
              <Link className="subtle-link" to={`${basis}/collaboration`}>Verlauf →</Link>
            </div>
            <TelefonatMeldung />
            <TelefonatErfassen kontaktId={k.id} darfAufgaben={d.darfAufgaben} />
            {d.verlauf.length === 0
              ? <p className="empty-state">Telefonate, E-Mails und Notizen erscheinen hier, sobald sie im Verlauf erfasst sind.</p>
              : <div className="data-list">{d.verlauf.map((v) => (
                  <div className="data-row" key={v.id}>
                    <div><strong>{v.title ?? AKTIVITAETSART[v.activity_type] ?? "Eintrag"}</strong><small>{AKTIVITAETSART[v.activity_type] ?? "Eintrag"} · {zeitpunkt(v.occurred_at)}</small></div>
                  </div>
                ))}</div>}
          </section>

          <section className="data-card" id="datenschutz">
            <div className="card-head">
              <div><p className="eyebrow">Datenschutz</p><h2>Auskunft</h2></div>
              <Link className="subtle-link" to={`${basis}/auskunft`}>Datenauskunft →</Link>
            </div>
            <p className="form-help">Alles, was das CRM zu dieser Person speichert, mit Einwilligungen aus Formularen – zum Drucken oder als Datei.</p>
          </section>
        </div>
      </div>
    </div>
    </main>
  );
}
