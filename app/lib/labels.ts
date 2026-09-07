// Deutsche Beschriftungen fuer die Zustandswerte aus der Datenbank.
//
// Die Datenbank speichert Zustaende englisch und in Grossbuchstaben:
// PURCHASE_PRICE_DUE, NOT_APPLICABLE, QUALIFIED_EXCLUSIVE. Das ist richtig so —
// solche Werte sind stabil und pruefbar. Auf dem Bildschirm haben sie nichts
// verloren.
//
// Bisher hatte jede Seite ihre eigenen Beschriftungstabellen. Auf neuen Seiten
// wurde das wiederholt vergessen; scripts/check-rohe-enums.mjs fand am
// 07.09.2026 noch 33 Stellen, an denen der rohe Wert im Text stand. Dieses
// Modul ist die gemeinsame Quelle fuer die Beschriftungen, die auf mehreren
// Seiten gebraucht werden.
//
// Die Wortwahl ist aus den bestehenden Tabellen der Anwendung uebernommen,
// damit derselbe Zustand ueberall gleich heisst. Die Wertebereiche stammen aus
// den CHECK-Bedingungen der Datenbank und sind vollstaendig — auch die Werte,
// die in keinem Auswahlfeld angeboten werden, koennen in Altbestaenden
// vorkommen.
//
// Die noch verbliebenen seitenlokalen Tabellen sind damit nicht abgeloest; sie
// nach und nach hierher zu ziehen bleibt Aufgabe.

export type Beschriftungen = Record<string, string>;

// --- Immobilie -------------------------------------------------------------

export const IMMOBILIENSTATUS: Beschriftungen = {
  DRAFT: "Entwurf", ACQUISITION: "Akquise", VALUATION: "Bewertung",
  CONTRACT_PENDING: "Vertrag in Vorbereitung", PREPARATION: "Vorbereitung",
  MARKETING: "Vermarktung", RESERVED: "Reserviert", NOTARY: "Notar",
  SOLD: "Verkauft", LOST: "Verloren", WITHDRAWN: "Zurückgezogen", ARCHIVED: "Archiviert",
};

export const ADRESSANZEIGE: Beschriftungen = {
  FULL: "Vollständige Adresse", STREET_ONLY: "Nur Straße", DISTRICT_ONLY: "Nur Stadtteil",
  CITY_ONLY: "Nur Ort", HIDDEN: "Adresse nicht öffentlich",
};

export const MEDIENART: Beschriftungen = {
  IMAGE: "Bild", VIDEO: "Video", FLOOR_PLAN: "Grundriss", OTHER: "Sonstiges",
};

export const CHECKLISTENKATEGORIE: Beschriftungen = {
  CONTRACT: "Vertrag", DOCUMENTS: "Unterlagen", ENERGY: "Energie",
  MARKETING: "Vermarktung", MEDIA: "Medien", OWNER: "Eigentümer", PROPERTY: "Objektdaten",
};

// --- Aufgaben --------------------------------------------------------------

export const AUFGABENSTATUS: Beschriftungen = {
  OPEN: "Offen", IN_PROGRESS: "In Bearbeitung", DONE: "Erledigt", CANCELLED: "Abgebrochen",
};

export const AUFGABENPRIORITAET: Beschriftungen = {
  LOW: "Niedrig", NORMAL: "Normal", HIGH: "Hoch", URGENT: "Dringend",
};

// --- Vertrieb --------------------------------------------------------------

export const LEADSTATUS: Beschriftungen = {
  NEW: "Neu", CONTACTED: "Kontaktiert", QUALIFIED: "Qualifiziert", APPOINTMENT: "Termin",
  VALUATION: "Bewertung", OFFER: "Angebot", WON: "Gewonnen",
  NURTURE: "Später nachfassen", LOST: "Verloren",
};

export const ANFRAGESTATUS: Beschriftungen = {
  NEW: "Neu", CONTACTED: "Kontaktiert", QUALIFIED: "Qualifiziert",
  VIEWING_PLANNED: "Besichtigung geplant", CLOSED: "Erledigt", LOST: "Kein weiteres Interesse",
};

export const ANFRAGEKANAL: Beschriftungen = {
  WEBSITE: "Website", PORTAL: "Immobilienportal", PHONE: "Telefon", EMAIL: "E-Mail",
  REFERRAL: "Empfehlung", WALK_IN: "Persönlich", OTHER: "Sonstige",
};

export const BESICHTIGUNGSSTATUS: Beschriftungen = {
  PLANNED: "Geplant", CONFIRMED: "Bestätigt", COMPLETED: "Durchgeführt",
  CANCELLED: "Abgesagt", NO_SHOW: "Nicht erschienen",
};

export const KAUFANGEBOTSTATUS: Beschriftungen = {
  DRAFT: "Entwurf", SUBMITTED: "Abgegeben", COUNTERED: "Gegenangebot", ACCEPTED: "Angenommen",
  REJECTED: "Abgelehnt", WITHDRAWN: "Zurückgezogen", REPLACED: "Ersetzt / nicht mehr aktuell",
  FAILED: "Abschluss gescheitert",
};

export const ABSCHLUSSSTATUS: Beschriftungen = {
  PREPARATION: "Abschlussvorbereitung", NOTARY_INSTRUCTED: "Notariat beauftragt",
  DRAFT_RECEIVED: "Entwurf eingegangen", APPOINTMENT_SCHEDULED: "Beurkundung terminiert",
  NOTARIZED: "Beurkundet", PURCHASE_PRICE_DUE: "Kaufpreis fällig",
  PURCHASE_PRICE_PAID: "Kaufpreis bezahlt", HANDOVER_COMPLETED: "Übergabe erfolgt",
  COMPLETED: "Abgeschlossen", CANCELLED: "Abgebrochen",
};

// --- Auftrag und Provision -------------------------------------------------

export const MAKLERAUFTRAGSTATUS: Beschriftungen = {
  DRAFT: "Entwurf", ACTIVE: "Aktiv", WITHDRAWN: "Widerrufen", TERMINATED: "Gekündigt",
  EXPIRED: "Abgelaufen", FULFILLED: "Erfüllt", CANCELLED: "Verworfen",
};

export const MAKLERAUFTRAGART: Beschriftungen = {
  SIMPLE: "Einfacher Auftrag", EXCLUSIVE: "Alleinauftrag",
  QUALIFIED_EXCLUSIVE: "Qualifizierter Alleinauftrag",
};

export const PROVISIONSSTATUS: Beschriftungen = {
  DRAFT: "Entwurf", EXPECTED: "Erwartet", DUE: "Fällig", INVOICED: "Abgerechnet",
  PARTIALLY_PAID: "Teilweise bezahlt", PAID: "Bezahlt", CANCELLED: "Storniert",
};

export const RECHNUNGSSTATUS: Beschriftungen = {
  NOT_ISSUED: "Noch nicht abgerechnet", ISSUED: "Abgerechnet", CANCELLED: "Storniert",
};

export const ZAHLUNGSSTATUS: Beschriftungen = {
  OPEN: "Offen", PARTIALLY_PAID: "Teilweise bezahlt", PAID: "Bezahlt",
};

// --- Kontakte und Organisationen -------------------------------------------

export const KONTAKTSTATUS: Beschriftungen = {
  ACTIVE: "Aktiv", INACTIVE: "Inaktiv", ARCHIVED: "Archiviert", BLOCKED: "Gesperrt",
};

export const ADRESSART: Beschriftungen = {
  PRIMARY: "Hauptadresse", PRIVATE: "Privat", BUSINESS: "Geschäftlich",
  CORRESPONDENCE: "Postanschrift", OTHER: "Sonstige",
};

export const ORGANISATIONSROLLE: Beschriftungen = {
  MITARBEITER: "Mitarbeiter", GESCHAEFTSFUEHRER: "Geschäftsführung",
  GESELLSCHAFTER: "Gesellschafter", ANSPRECHPARTNER: "Ansprechpartner",
  "BEVOLLMÄCHTIGTER": "Bevollmächtigter", SONSTIGES: "Sonstige Rolle",
};

// --- Unterlagen ------------------------------------------------------------

export const DOKUMENTKATEGORIE: Beschriftungen = {
  LAND_REGISTER: "Grundbuch", CADASTRAL_MAP: "Flurkarte", FLOOR_PLAN: "Grundriss",
  LIVING_AREA_CALCULATION: "Wohnflächenberechnung", ENERGY_CERTIFICATE: "Energieausweis",
  DECLARATION_OF_DIVISION: "Teilungserklärung", BUILDING_DOCUMENTS: "Bauunterlagen",
  TENANCY_AGREEMENT: "Mietvertrag", WEG: "WEG-Unterlagen", BUSINESS_PLAN: "Wirtschaftsplan",
  MINUTES: "Protokolle", BROKERAGE_AGREEMENT: "Maklervertrag", PHOTOS: "Fotos",
  NOTARY: "Notar", INVOICE: "Rechnung", IDENTITY_PROOF: "Identitätsnachweis",
  OTHER: "Sonstige", BUILDING_ENCUMBRANCE_REGISTER: "Baulastenverzeichnis",
  CONTAMINATION_REGISTER: "Altlastenauskunft", SUCCESSION_PROOF: "Erbnachweis",
  POWER_OF_ATTORNEY: "Vollmacht", GUARDIANSHIP_PROOF: "Betreuungsnachweis",
  WITHDRAWAL_INSTRUCTION: "Widerrufsbelehrung", PROPERTY_DISCLOSURE: "Objektnachweis",
  RESERVATION_AGREEMENT: "Reservierungsvereinbarung",
  FINANCING_CONFIRMATION: "Finanzierungsbestätigung",
  SERVICE_CHARGE_STATEMENT: "Betriebskostenabrechnung",
  RESOLUTION_COLLECTION: "Beschlusssammlung", HANDOVER_PROTOCOL: "Übergabeprotokoll",
  TRAINING_CERTIFICATE: "Weiterbildungsnachweis",
};

/**
 * Beschriftung nachschlagen. Ohne Treffer bleibt der gespeicherte Wert stehen:
 * ein unbekannter Zustand soll sichtbar sein, nicht verschwinden.
 */
export function beschrifte(tabelle: Beschriftungen, wert: string | null | undefined): string {
  if (wert === null || wert === undefined || wert === "") return "—";
  return tabelle[wert] ?? wert;
}
