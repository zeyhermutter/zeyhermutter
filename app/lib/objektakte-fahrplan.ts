// Der Fahrplan eines Verkaufs -- die Stationen an einer Stelle.
//
// WARUM ES DIESE DATEI GIBT
//
// Ein Hausverkauf erzeugt in diesem CRM sieben eigenstaendige Akten mit je
// eigener Nummer: Maklerauftrag, Verkaufsprojekt, Aufmassauftrag,
// Kaufangebot, Reservierung, Abschluss und Provision. Fachlich ist jede
// davon zu Recht eigenstaendig -- ein Maklerauftrag ist ein Rechtsverhaeltnis
// und kein Kapitel einer Objektbeschreibung, eine Provision ueberlebt den
// Verkauf.
//
// Fuer den, der allein arbeitet, bedeutete das: sieben Listen oeffnen, in
// jeder nach derselben Immobilie suchen, um die Frage zu beantworten, die er
// zwanzigmal am Tag hat -- wo steht dieses Haus gerade, und was ist als
// Naechstes dran. Die Objektakte zeigte davon zwei (Verkaufsprojekt und
// Maklerauftrag) als eigene Karten; die uebrigen fuenf waren nur ueber die
// Vorgangszeile als gefilterte Liste erreichbar.
//
// Der Fahrplan beantwortet beide Fragen auf einem Blick und laesst die Akten
// unangetastet. Er legt nichts zusammen, er zeigt zusammen.
//
// WAS HIER NICHT STEHT
//
// Die Abschnitte der Objektakte selbst -- Recht & Lasten, Preis & Wert,
// Medien und so weiter. Die stehen in app/lib/objektakte-navigation.ts und
// gehoeren in die Leiste darueber, nicht in den Fahrplan: sie sind Kapitel
// derselben Akte, keine eigenen Vorgaenge.
//
// scripts/check-objektakte-fahrplan.mjs prueft bei jedem Build, dass jeder
// Vorgang aus VORGAENGE hier eine Station hat. Ein neuer Vorgang kann damit
// nicht mehr angelegt werden, ohne dass jemand entscheidet, wo er im Ablauf
// steht.

import { VORGAENGE } from "~/lib/objektakte-navigation";

/**
 * Wie weit eine Station ist.
 *
 * "laeuft" heisst: es gibt den Vorgang, er ist noch nicht fertig. Das ist
 * bewusst grob -- der genaue Stand steht in der Akte, der Fahrplan ist eine
 * Uebersicht und kein zweiter Datensatz.
 */
export type Stand = "erledigt" | "laeuft" | "offen";

export type Station = {
  schluessel: string;
  beschriftung: string;
  /**
   * Was dieser Schritt im Geschaeft bedeutet. Eine Zeile, die erklaert,
   * warum die Station da ist -- nicht, wie man das Formular bedient.
   */
  bedeutung: string;
  /**
   * Freiwillige Stationen gehoeren zum Ablauf, aber nicht zu jedem Verkauf.
   * Nicht jedes Haus braucht ein Aufmass, und viele Verkaeufe gehen ohne
   * Reservierung direkt zum Notar. Sie bleiben leer, ohne als Rueckstand zu
   * gelten, und werden nie als naechster Schritt vorgeschlagen.
   */
  freiwillig: boolean;
  /**
   * Die Beschriftung des zugehoerigen Vorgangs aus
   * app/lib/objektakte-navigation.ts, oder null fuer eine Station ohne
   * eigenen Eintrag in jener Liste. Die Pruefung vergleicht beide Listen.
   */
  vorgang: string | null;
};

/** In der Reihenfolge des Geschaefts, nicht der Datenbank. */
export const STATIONEN: Station[] = [
  {
    schluessel: "mandate",
    beschriftung: "Maklerauftrag",
    bedeutung: "Ab hier darf vermarktet und abgerechnet werden.",
    freiwillig: false,
    vorgang: "Maklerauftrag",
  },
  {
    schluessel: "project",
    beschriftung: "Verkaufsprojekt",
    bedeutung: "Die Klammer über den Verkauf: Phase, nächster Schritt, Verantwortung.",
    freiwillig: false,
    vorgang: null,
  },
  {
    schluessel: "measurement",
    beschriftung: "Aufmaß & Grundrisse",
    bedeutung: "Flächen und Grundrisse für Exposé und Kaufvertrag.",
    freiwillig: true,
    vorgang: "Aufmaß",
  },
  {
    schluessel: "offer",
    beschriftung: "Kaufangebot",
    bedeutung: "Das erste verbindliche Wort des Käufers.",
    freiwillig: false,
    vorgang: "Kaufangebote",
  },
  {
    schluessel: "reservation",
    beschriftung: "Reservierung",
    bedeutung: "Nimmt das Objekt für einen Interessenten vom Markt.",
    freiwillig: true,
    vorgang: "Reservierungen",
  },
  {
    schluessel: "closing",
    beschriftung: "Abschluss & Notar",
    bedeutung: "Beurkundung, Kaufpreisfälligkeit, Übergabe.",
    freiwillig: false,
    vorgang: "Abschluss & Notar",
  },
  {
    schluessel: "commission",
    beschriftung: "Provision",
    bedeutung: "Rechnung und Zahlungseingang.",
    freiwillig: false,
    vorgang: "Provisionen",
  },
];

/** Was der Fahrplan je Station anzeigt. */
export type Haltepunkt = {
  station: Station;
  stand: Stand;
  /** Nummer und Stand des vorhandenen Vorgangs, oder warum nichts da ist. */
  text: string;
  /** Der vorhandene Datensatz, wenn es genau einen gibt. */
  oeffnen: string | null;
  /** Die Liste aller Vorgänge dieser Art zu dieser Immobilie. */
  liste: string;
  /**
   * Wo ein neuer angelegt wird.
   *
   * `vorbelegt` unterscheidet die beiden Faelle, die auf dem Bildschirm sonst
   * gleich aussehen: ein Formular, in dem diese Immobilie schon eingetragen
   * ist, und eine Liste, auf der man sie erst wieder heraussuchen muss. Ein
   * Knopf, der "Anlegen" sagt und auf eine Liste fuehrt, ist eine kleine
   * Luege, die jedes Mal einen Klick und einen Moment Suchen kostet.
   */
  anlegen: { pfad: string; vorbelegt: boolean } | null;
  /** Mehr als einer vorhanden: dann führt der Weg auf die Liste. */
  anzahl: number;
  /** Die eine Station, die als Nächstes dran ist. */
  naechster: boolean;
  /**
   * Ein Hinweis, der nicht warten kann -- heute nur der offene Widerruf am
   * Maklerauftrag. Er stand bisher als rote Pille in der Maklerauftragskarte;
   * da die im Fahrplan aufgeht, muss er hier weiterleben. Ein Warnzeichen,
   * das beim Umbau verlorengeht, ist schlimmer als eines, das nie da war.
   */
  warnung: string | null;
};

/** Die Vorgangsliste zu einer Beschriftung -- damit kein Pfad doppelt steht. */
function vorgangsListe(beschriftung: string | null): string | null {
  if (!beschriftung) return null;
  return VORGAENGE.find((v) => v.beschriftung === beschriftung)?.liste ?? null;
}

export type FahrplanDaten = {
  propertyId: string;
  /** Heute als "2026-10-12" -- hereingereicht, damit die Auswertung prüfbar bleibt. */
  heute: string;
  mandates: any[];
  saleProject: any | null;
  measurements: any[];
  offers: any[];
  reservations: any[];
  closings: any[];
  commissions: any[];
};

type Auswertung = { stand: Stand; text: string; oeffnen: string | null; anzahl: number; warnung?: string | null };

/** Keine Zeile ohne Aussage: auch "nichts da" ist eine Auskunft. */
function leer(text: string): Auswertung {
  return { stand: "offen", text, oeffnen: null, anzahl: 0 };
}

/**
 * Der offene Widerruf eines Verbrauchers.
 *
 * Bei einem Verbraucher laeuft eine Widerrufsfrist, und vor ihrem Ablauf
 * darf ohne ausdrueckliches Verlangen nicht mit der Leistung begonnen
 * werden. Die Pruefung bildet ab, was die Objektakte bisher als rote Pille
 * zeigte: aktiver Auftrag, Verbraucher, und entweder keine Belehrung
 * dokumentiert oder die Frist laeuft noch ohne vorzeitiges Verlangen.
 *
 * Das ist eine Anzeige des erfassten Standes, keine rechtliche Bewertung.
 */
function widerrufOffen(m: any, heute: string): boolean {
  if (m.status !== "ACTIVE" || !m.client_is_consumer) return false;
  if (!m.withdrawal_instruction_given_on) return true;
  return Boolean(m.withdrawal_deadline_on && m.withdrawal_deadline_on >= heute && !m.early_start_requested_on);
}

export function fahrplan(
  daten: FahrplanDaten,
  beschrifte: (tabelle: Record<string, string>, wert: string) => string,
  labels: {
    MAKLERAUFTRAGSTATUS: Record<string, string>;
    MAKLERAUFTRAGART: Record<string, string>;
    AUFMASSSTATUS: Record<string, string>;
    KAUFANGEBOTSTATUS: Record<string, string>;
    ABSCHLUSSSTATUS: Record<string, string>;
    PROVISIONSSTATUS: Record<string, string>;
    RESERVIERUNGSSTATUS: Record<string, string>;
    PROJEKTPHASE: Record<string, string>;
  },
): Haltepunkt[] {
  const id = encodeURIComponent(daten.propertyId);

  const auswertung: Record<string, Auswertung> = {
    mandate: (() => {
      const rows = daten.mandates ?? [];
      if (rows.length === 0) return leer("Kein Maklerauftrag erfasst");
      const aktiv = rows.find((r) => r.status === "ACTIVE");
      const erfuellt = rows.find((r) => r.status === "FULFILLED");
      const zeigen = aktiv ?? erfuellt ?? rows[0];
      const mitWiderruf = rows.filter((r) => widerrufOffen(r, daten.heute));
      return {
        stand: aktiv ? "laeuft" : erfuellt ? "erledigt" : "offen",
        text: `${zeigen.mandate_number} · ${beschrifte(labels.MAKLERAUFTRAGART, zeigen.mandate_type)} · ${beschrifte(labels.MAKLERAUFTRAGSTATUS, zeigen.status)}`
          + ` · ${zeigen.text_form_confirmed ? "Textform dokumentiert" : "Textform offen"}`,
        oeffnen: `/mandates/${zeigen.id}`,
        anzahl: rows.length,
        warnung: mitWiderruf.length > 0 ? "Widerruf offen" : null,
      };
    })(),

    project: (() => {
      const p = daten.saleProject;
      if (!p) return leer("Kein Verkaufsprojekt angelegt");
      return {
        stand: p.status === "COMPLETED" ? "erledigt" : "laeuft",
        text: `${p.project_number} · ${beschrifte(labels.PROJEKTPHASE, p.phase)}`,
        oeffnen: `/projects/${p.id}`,
        anzahl: 1,
      };
    })(),

    measurement: (() => {
      const rows = daten.measurements ?? [];
      if (rows.length === 0) return leer("Kein Aufmaßauftrag — nicht jedes Objekt braucht einen");
      const fertig = rows.find((r) => ["DELIVERED", "INVOICED", "PAID"].includes(r.status));
      const zeigen = fertig ?? rows[0];
      return {
        stand: fertig ? "erledigt" : "laeuft",
        text: `${zeigen.order_number} · ${beschrifte(labels.AUFMASSSTATUS, zeigen.status)}`,
        oeffnen: `/measurements/${zeigen.id}`,
        anzahl: rows.length,
      };
    })(),

    offer: (() => {
      const rows = daten.offers ?? [];
      if (rows.length === 0) return leer("Noch kein Kaufangebot");
      const angenommen = rows.find((r) => r.status === "ACCEPTED");
      const offen = rows.find((r) => ["SUBMITTED", "COUNTERED"].includes(r.status));
      const zeigen = angenommen ?? offen ?? rows[0];
      return {
        stand: angenommen ? "erledigt" : offen ? "laeuft" : "offen",
        text: rows.length > 1
          ? `${rows.length} Angebote · zuletzt ${zeigen.offer_number} (${beschrifte(labels.KAUFANGEBOTSTATUS, zeigen.status)})`
          : `${zeigen.offer_number} · ${beschrifte(labels.KAUFANGEBOTSTATUS, zeigen.status)}`,
        oeffnen: rows.length === 1 ? `/purchase-offers/${zeigen.id}` : null,
        anzahl: rows.length,
      };
    })(),

    reservation: (() => {
      const rows = daten.reservations ?? [];
      if (rows.length === 0) return leer("Keine Reservierung — viele Verkäufe gehen ohne");
      const umgewandelt = rows.find((r) => r.status === "CONVERTED");
      const aktiv = rows.find((r) => r.status === "ACTIVE");
      const zeigen = umgewandelt ?? aktiv ?? rows[0];
      return {
        stand: umgewandelt ? "erledigt" : aktiv ? "laeuft" : "offen",
        text: `${zeigen.reservation_number ?? "Reservierung"} · ${beschrifte(labels.RESERVIERUNGSSTATUS, zeigen.status)}`,
        oeffnen: null,
        anzahl: rows.length,
      };
    })(),

    closing: (() => {
      const rows = daten.closings ?? [];
      if (rows.length === 0) return leer("Kein Abschlussvorgang");
      const fertig = rows.find((r) => r.status === "COMPLETED");
      const zeigen = fertig ?? rows.find((r) => r.status !== "CANCELLED") ?? rows[0];
      return {
        stand: fertig ? "erledigt" : "laeuft",
        text: `${zeigen.closing_number} · ${beschrifte(labels.ABSCHLUSSSTATUS, zeigen.status)}`,
        oeffnen: null,
        anzahl: rows.length,
      };
    })(),

    commission: (() => {
      const rows = daten.commissions ?? [];
      if (rows.length === 0) return leer("Keine Provision erfasst");
      const alleBezahlt = rows.every((r) => r.status === "PAID");
      const zeigen = rows.find((r) => r.status !== "PAID") ?? rows[0];
      return {
        stand: alleBezahlt ? "erledigt" : "laeuft",
        text: rows.length > 1
          ? `${rows.length} Provisionen · ${rows.filter((r) => r.status === "PAID").length} bezahlt`
          : `${zeigen.commission_number} · ${beschrifte(labels.PROVISIONSSTATUS, zeigen.status)}`,
        oeffnen: rows.length === 1 ? `/commissions/${zeigen.id}` : null,
        anzahl: rows.length,
      };
    })(),
  };

  // Die Wege zum Anlegen.
  //
  // Vier Vorgaenge haben ein eigenes Formular, das die Immobilie aus dem
  // Parameter uebernimmt. Verkaufsprojekt und Reservierung entstehen an ihrer
  // eigenen Liste, wo die Immobilie noch einmal gewaehlt werden muss -- das
  // steht als `vorbelegt: false` da und wird auf dem Knopf auch so gesagt.
  //
  // Der Abschluss hat gar keinen Weg: er entsteht aus einem angenommenen
  // Kaufangebot und nicht aus dem Nichts. Ein "Anlegen" waere hier kein
  // Angebot, sondern eine Sackgasse.
  const anlegenWege: Record<string, { pfad: string; vorbelegt: boolean } | null> = {
    mandate: { pfad: `/mandates/new?property_id=${id}`, vorbelegt: true },
    project: { pfad: "/projects", vorbelegt: false },
    measurement: { pfad: `/measurements/new?property_id=${id}`, vorbelegt: true },
    offer: { pfad: `/purchase-offers/new?property_id=${id}`, vorbelegt: true },
    reservation: { pfad: "/reservations", vorbelegt: false },
    closing: null,
    commission: { pfad: `/commissions/new?property_id=${id}`, vorbelegt: true },
  };

  const haltepunkte: Haltepunkt[] = STATIONEN.map((station) => {
    const a = auswertung[station.schluessel];
    const liste = vorgangsListe(station.vorgang);
    return {
      station,
      stand: a.stand,
      text: a.text,
      oeffnen: a.oeffnen,
      liste: liste ? `${liste}?property_id=${id}` : "/projects",
      anlegen: a.anzahl === 0 ? anlegenWege[station.schluessel] : null,
      anzahl: a.anzahl,
      naechster: false,
      warnung: a.warnung ?? null,
    };
  });

  // Der naechste Schritt ist die erste Pflichtstation, die nicht erledigt
  // ist. Eine laufende Station zaehlt dazu: wer einen Maklerauftrag im
  // Entwurf hat, ist dort noch nicht fertig.
  const naechster = haltepunkte.find((h) => !h.station.freiwillig && h.stand !== "erledigt");
  if (naechster) naechster.naechster = true;

  return haltepunkte;
}
