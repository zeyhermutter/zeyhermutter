// "In Bewegung" -- was kurz vor dem Abschluss steht, in einer Liste.
//
// WARUM ES DIESE SEITE GIBT
//
// Fuenf Dinge macht ein Makler taeglich: sehen was ansteht, eine Immobilie
// oeffnen, eine Besichtigung festhalten, eine Anfrage beantworten, und sehen
// was kurz vor dem Abschluss steht. Fuer die ersten vier gab es je einen
// Eintrag im Seitenstreifen. Fuer das fuenfte nicht: es lag verstreut ueber
// Kaufangebote, Reservierungen und Abschluesse -- drei Listen, die man
// einzeln durchgeht, jede nach ihrem eigenen Status sortiert.
//
// Dabei ist die Frage immer dieselbe, und sie ist eine Frage nach einem
// Datum: welches Angebot laeuft ab, welche Reservierung endet, welcher
// Notartermin steht an, welcher Kaufpreis wird faellig. Diese Seite zieht die
// drei Listen nach genau diesem Datum zusammen.
//
// Sie legt nichts an und aendert nichts. Jede Zeile fuehrt in die Akte, in
// der der Vorgang hingehoert -- die Seite ersetzt die drei Listen nicht, sie
// erspart den Weg ueber sie.
//
// BERECHTIGUNGEN
//
// Drei Tabellen, drei Rechte. Wer nur eines hat, soll nicht 403 sehen,
// sondern seinen Teil -- deshalb wird jedes einzeln geprueft und nur
// abgefragt, was erlaubt ist. Was fehlt, sagt die Seite.

import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/pipeline";
import { requireActiveUser } from "~/lib/auth.server";
import { euroGenau as geld, tag, zeitpunkt } from "~/lib/format";
import { crmToday } from "~/lib/local-time";
import "~/pipeline.css";
import "~/programm-liste.css";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
const ANGEBOTSSTATUS: Record<string, string> = {
  DRAFT: "Entwurf", SUBMITTED: "Abgegeben", COUNTERED: "Gegenangebot", ACCEPTED: "Angenommen",
};
const RESERVIERUNGSSTATUS: Record<string, string> = { ACTIVE: "Aktiv" };
const ABSCHLUSSSTATUS: Record<string, string> = {
  PREPARATION: "Abschlussvorbereitung", NOTARY_INSTRUCTED: "Notariat beauftragt",
  DRAFT_RECEIVED: "Entwurf eingegangen", APPOINTMENT_SCHEDULED: "Beurkundung terminiert",
  NOTARIZED: "Beurkundet", PURCHASE_PRICE_DUE: "Kaufpreis fällig",
  PURCHASE_PRICE_PAID: "Kaufpreis bezahlt", HANDOVER_COMPLETED: "Übergabe erfolgt",
};

/** Offen heisst: der Vorgang wartet noch auf jemanden. */
const OFFENE_ANGEBOTE = Object.keys(ANGEBOTSSTATUS);
const OFFENE_ABSCHLUESSE = Object.keys(ABSCHLUSSSTATUS);

type Zeile = {
  id: string;
  art: "ANGEBOT" | "RESERVIERUNG" | "ABSCHLUSS";
  artText: string;
  nummer: string;
  pfad: string;
  objekt: string;
  partei: string;
  betrag: number | null;
  statusText: string;
  /** Das Datum, auf das es ankommt -- als ISO-Tag oder Zeitpunkt. */
  frist: string | null;
  fristText: string;
};

const eines = (wert: unknown) => (Array.isArray(wert) ? wert[0] : wert) as Record<string, unknown> | undefined;
const text = (wert: unknown) => (typeof wert === "string" ? wert : "");

function objektText(roh: unknown): string {
  const p = eines(roh);
  if (!p) return "Ohne Immobilie";
  return [text(p.property_number), text(p.internal_title)].filter(Boolean).join(" · ") || "Ohne Immobilie";
}

function personText(roh: unknown): string {
  const c = eines(roh);
  if (!c) return "—";
  return [text(c.first_name), text(c.last_name)].filter(Boolean).join(" ") || text(c.contact_number) || "—";
}

/**
 * Der naechste Meilenstein eines Abschlusses. Welches Datum zaehlt, haengt am
 * Status: vor der Beurkundung der Notartermin, danach der Kaufpreis, danach
 * die Uebergabe. Ein Abschluss, bei dem das zustaendige Datum fehlt, taucht
 * ohne Frist auf -- und genau das will man sehen.
 */
function abschlussFrist(zeile: Record<string, unknown>): { frist: string | null; fristText: string } {
  const status = text(zeile.status);
  if (["PREPARATION", "NOTARY_INSTRUCTED", "DRAFT_RECEIVED", "APPOINTMENT_SCHEDULED"].includes(status)) {
    const termin = text(zeile.notary_appointment_at) || null;
    return { frist: termin, fristText: termin ? "Beurkundung" : "Notartermin offen" };
  }
  if (["NOTARIZED", "PURCHASE_PRICE_DUE"].includes(status)) {
    const faellig = text(zeile.purchase_price_due_date) || null;
    return { frist: faellig, fristText: faellig ? "Kaufpreis fällig" : "Kaufpreisfälligkeit offen" };
  }
  const uebergabe = text(zeile.handover_date) || null;
  return { frist: uebergabe, fristText: uebergabe ? "Übergabe" : "Übergabe offen" };
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sitzung = await requireActiveUser(request, context.cloudflare.env);
  const { supabase, responseHeaders, profile } = sitzung;

  const darf = async (recht: string) => {
    const { data: erlaubt } = await supabase.rpc("current_user_has_permission", { p_permission: recht });
    return erlaubt === true;
  };
  const [darfAngebote, darfReservierungen, darfAbschluesse] = await Promise.all([
    darf("offer.read"), darf("reservation.read"), darf("closing.read"),
  ]);

  const [angebote, reservierungen, abschluesse] = await Promise.all([
    darfAngebote
      ? supabase.from("purchase_offers")
        .select("id,offer_number,amount,status,valid_until,archived_at,properties(property_number,internal_title),contacts(contact_number,first_name,last_name)")
        .is("archived_at", null).in("status", OFFENE_ANGEBOTE).limit(300)
      : Promise.resolve({ data: [], error: null }),
    darfReservierungen
      ? supabase.from("property_reservations")
        .select("id,reservation_number,reserved_price,reserved_until,status,archived_at,properties(property_number,internal_title),contacts(contact_number,first_name,last_name)")
        .is("archived_at", null).eq("status", "ACTIVE").limit(300)
      : Promise.resolve({ data: [], error: null }),
    darfAbschluesse
      ? supabase.from("sale_closings")
        .select("id,closing_number,agreed_purchase_price,notarial_purchase_price,status,notary_appointment_at,purchase_price_due_date,handover_date,archived_at,properties(property_number,internal_title),buyer:contacts!sale_closings_buyer_contact_id_fkey(contact_number,first_name,last_name)")
        .is("archived_at", null).in("status", OFFENE_ABSCHLUESSE).limit(300)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Eine ausgefallene Abfrage wird gemeldet, nicht verschwiegen: eine Liste,
  // die stillschweigend einen Drittel weglaesst, ist schlimmer als keine.
  const ladefehler = [
    angebote.error && "Kaufangebote",
    reservierungen.error && "Reservierungen",
    abschluesse.error && "Abschlüsse",
  ].filter(Boolean) as string[];

  const zeilen: Zeile[] = [];

  for (const roh of (angebote.data ?? []) as Record<string, unknown>[]) {
    const frist = text(roh.valid_until) || null;
    zeilen.push({
      id: `angebot-${text(roh.id)}`, art: "ANGEBOT", artText: "Kaufangebot",
      nummer: text(roh.offer_number), pfad: `/purchase-offers/${text(roh.id)}`,
      objekt: objektText(roh.properties), partei: personText(roh.contacts),
      betrag: typeof roh.amount === "number" ? roh.amount : null,
      statusText: ANGEBOTSSTATUS[text(roh.status)] ?? text(roh.status),
      frist, fristText: frist ? "Bindung endet" : "ohne Bindefrist",
    });
  }

  for (const roh of (reservierungen.data ?? []) as Record<string, unknown>[]) {
    const frist = text(roh.reserved_until) || null;
    zeilen.push({
      id: `reservierung-${text(roh.id)}`, art: "RESERVIERUNG", artText: "Reservierung",
      nummer: text(roh.reservation_number), pfad: "/reservations",
      objekt: objektText(roh.properties), partei: personText(roh.contacts),
      betrag: typeof roh.reserved_price === "number" ? roh.reserved_price : null,
      statusText: RESERVIERUNGSSTATUS[text(roh.status)] ?? text(roh.status),
      frist, fristText: frist ? "Reservierung endet" : "ohne Enddatum",
    });
  }

  for (const roh of (abschluesse.data ?? []) as Record<string, unknown>[]) {
    const { frist, fristText } = abschlussFrist(roh);
    zeilen.push({
      id: `abschluss-${text(roh.id)}`, art: "ABSCHLUSS", artText: "Abschluss",
      nummer: text(roh.closing_number), pfad: `/closings/${text(roh.id)}`,
      objekt: objektText(roh.properties), partei: personText(roh.buyer),
      betrag: typeof roh.notarial_purchase_price === "number"
        ? roh.notarial_purchase_price
        : typeof roh.agreed_purchase_price === "number" ? roh.agreed_purchase_price : null,
      statusText: ABSCHLUSSSTATUS[text(roh.status)] ?? text(roh.status),
      frist, fristText,
    });
  }

  // Sortiert nach dem Datum, auf das es ankommt. Ohne Frist ganz nach unten:
  // da ist nichts terminiert, also drueckt auch nichts.
  zeilen.sort((a, b) => {
    if (!a.frist && !b.frist) return a.objekt.localeCompare(b.objekt, "de-DE");
    if (!a.frist) return 1;
    if (!b.frist) return -1;
    return a.frist.localeCompare(b.frist);
  });

  return data({
    profile, zeilen, ladefehler,
    heute: crmToday(),
    fehlendeRechte: [
      !darfAngebote && "Kaufangebote", !darfReservierungen && "Reservierungen", !darfAbschluesse && "Abschlüsse",
    ].filter(Boolean) as string[],
  }, { headers: responseHeaders() });
}

export function meta() {
  return [{ title: "In Bewegung · ZeyherMutterOS" }];
}

/** Ueberfaellig, diese Woche, spaeter, ohne Frist -- in dieser Reihenfolge. */
function gruppe(frist: string | null, heute: string): "UEBERFAELLIG" | "WOCHE" | "SPAETER" | "OFFEN" {
  if (!frist) return "OFFEN";
  const tagOnly = frist.slice(0, 10);
  if (tagOnly < heute) return "UEBERFAELLIG";
  const inSieben = new Date(`${heute}T00:00:00Z`);
  inSieben.setUTCDate(inSieben.getUTCDate() + 7);
  return tagOnly <= inSieben.toISOString().slice(0, 10) ? "WOCHE" : "SPAETER";
}

const GRUPPEN: { schluessel: ReturnType<typeof gruppe>; titel: string; hinweis: string }[] = [
  { schluessel: "UEBERFAELLIG", titel: "Überfällig", hinweis: "Die Frist ist vorbei." },
  { schluessel: "WOCHE", titel: "Diese Woche", hinweis: "In den nächsten sieben Tagen." },
  { schluessel: "SPAETER", titel: "Später", hinweis: "Terminiert, aber noch Zeit." },
  { schluessel: "OFFEN", titel: "Ohne Frist", hinweis: "Hier ist kein Datum gesetzt — oft ist genau das die Arbeit." },
];

export default function Pipeline() {
  const d = useLoaderData<typeof loader>();
  const inGruppe = (schluessel: string) => d.zeilen.filter((z) => gruppe(z.frist, d.heute) === schluessel);

  // Programmliste (13.10.2026): Kennzahlen als eine Zeile, darunter eine
  // Tabelle mit Spaltenkoepfen. Die vier Fristgruppen sind Zwischenzeilen
  // derselben Tabelle -- vorher je eine Karte mit Zeilen ohne Spalten.
  return (
    <main className="editor-shell programm-liste"><ListenUeberschrift/>
      {d.ladefehler.length > 0 ? (
        <div className="form-warning pipeline-breite">
          <strong>Ein Teil der Vorgänge konnte nicht geladen werden.</strong>
          <p>Nicht geladen: {d.ladefehler.join(", ")}. Die Liste ist dadurch unvollständig, ohne dass es auffällt. Bitte die Seite neu laden.</p>
        </div>
      ) : null}

      <p className="programm-kennzahlen">
        {GRUPPEN.map((g) => (
          <span className={g.schluessel === "UEBERFAELLIG" && inGruppe(g.schluessel).length > 0 ? "warnung" : undefined} key={g.schluessel} title={g.hinweis}>
            <strong>{inGruppe(g.schluessel).length}</strong> {g.titel}
          </span>
        ))}
        {d.fehlendeRechte.length > 0 ? <span>Ohne Berechtigung nicht enthalten: {d.fehlendeRechte.join(", ")}</span> : null}
      </p>

      <div className="programm-tabelle-rahmen">
        {d.zeilen.length === 0 ? (
          <p className="programm-liste-leer">Zurzeit ist kein Kaufangebot, keine Reservierung und kein Abschluss offen.</p>
        ) : (
          <table className="programm-tabelle">
            <thead><tr><th>Nummer</th><th>Objekt</th><th>Partei</th><th>Vorgang</th><th>Stand</th><th className="rechts">Betrag</th><th>Frist</th></tr></thead>
            <tbody>
              {GRUPPEN.map((g) => {
                const zeilen = inGruppe(g.schluessel);
                if (zeilen.length === 0) return null;
                return [
                  <tr className="programm-gruppe" key={g.schluessel}><th colSpan={7} scope="rowgroup">{g.titel} · {zeilen.length}<span className="leise"> — {g.hinweis}</span></th></tr>,
                  ...zeilen.map((z) => (
                    <tr className={g.schluessel === "UEBERFAELLIG" ? "frist-vorbei" : undefined} key={z.id}>
                      <td className="zahl"><Link to={z.pfad}>{z.nummer}</Link></td>
                      <td><Link to={z.pfad}>{z.objekt}</Link></td>
                      <td>{z.partei}</td>
                      <td><span className={`pipeline-art pipeline-art-${z.art.toLowerCase()}`}>{z.artText}</span></td>
                      <td>{z.statusText}</td>
                      <td className="zahl rechts">{z.betrag === null ? "—" : geld(z.betrag)}</td>
                      <td className="zahl">{z.frist ? <>{z.frist.length > 10 ? zeitpunkt(z.frist) : tag(z.frist)}<div className="leise">{z.fristText}</div></> : <span className="leise">{z.fristText}</span>}</td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
