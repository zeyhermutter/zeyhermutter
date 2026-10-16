// E-Mail-Vorlagen: Platzhalter und Anlass (P2-3, 16.10.2026).
//
// Die Vorlagentexte pflegt das Buero unter Verwaltung > E-Mail-Vorlagen. Hier
// steht nur, welche Platzhalter es gibt und wie sie gefuellt werden. Das CRM
// schreibt selbst keine Saetze in eine E-Mail -- ohne Vorlage bleibt der Text
// leer.
//
// Ein Platzhalter ohne Wert (etwa {{objekt_titel}} bei einer Anfrage ohne
// Objekt) bleibt sichtbar stehen und wird gemeldet. Still leer ersetzt, stuende
// dort "Guten Tag ," -- das faellt erst beim Empfaenger auf.

import type { Beschriftungen } from "~/lib/labels";

export const VORLAGENANLASS: Beschriftungen = {
  INQUIRY_REPLY: "Antwort auf Anfrage",
  EXPOSE: "Exposé-Versand",
  VIEWING_CONFIRMATION: "Terminbestätigung",
  DECLINE: "Absage",
  OTHER: "Sonstiges",
};

export const PLATZHALTER: { schluessel: string; bedeutung: string }[] = [
  { schluessel: "anrede", bedeutung: "Anrede und Name, z. B. „Frau Dr. Muster“; ohne Anrede „Erika Muster“" },
  { schluessel: "vorname", bedeutung: "Vorname des Empfängers" },
  { schluessel: "nachname", bedeutung: "Nachname des Empfängers" },
  { schluessel: "objekt_nummer", bedeutung: "Objektnummer, z. B. ZM-2026-0003" },
  { schluessel: "objekt_titel", bedeutung: "Titel des Objekts" },
  { schluessel: "objekt_ort", bedeutung: "PLZ und Ort des Objekts" },
  { schluessel: "anfrage_nummer", bedeutung: "Nummer der Anfrage" },
  { schluessel: "besichtigung_termin", bedeutung: "Nächste geplante Besichtigung, Datum und Uhrzeit" },
  { schluessel: "expose_link", bedeutung: "Download-Link zum Exposé (nur wenn „Link einfügen“ gewählt ist)" },
  { schluessel: "mein_name", bedeutung: "Ihr Name (angemeldeter Benutzer)" },
];

export type Werte = Partial<Record<string, string | null>>;

const MUSTER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Setzt die Werte ein. Was keinen Wert hat, bleibt als {{…}} stehen und steht in "fehlen". */
export function fuelle(text: string, werte: Werte): { text: string; fehlen: string[] } {
  const fehlen = new Set<string>();
  const ergebnis = text.replace(MUSTER, (ganz, schluessel: string) => {
    const wert = werte[schluessel];
    if (wert == null || wert === "") { fehlen.add(schluessel); return ganz; }
    return wert;
  });
  return { text: ergebnis, fehlen: [...fehlen] };
}

/** "Frau Dr. Muster"; ohne Anrede der volle Name. */
export function anredeVon(k: { salutation?: string | null; title?: string | null; first_name?: string | null; last_name?: string | null }): string {
  if (k.salutation && k.last_name) return [k.salutation, k.title, k.last_name].filter(Boolean).join(" ");
  return [k.title, k.first_name, k.last_name].filter(Boolean).join(" ");
}

/**
 * mailto-Adresse mit Betreff und Text. Sehr lange Adressen schneiden manche
 * Mailprogramme ab (Outlook bei rund 2.000 Zeichen) -- dann meldet die Seite
 * das und bietet "Text kopieren" an.
 */
export function mailtoAdresse(empfaenger: string, betreff: string, text: string): string {
  const teile = [betreff ? `subject=${encodeURIComponent(betreff)}` : null, text ? `body=${encodeURIComponent(text.replace(/\r?\n/g, "\r\n"))}` : null].filter(Boolean);
  // Das @ bleibt lesbar: "%40" in der Adresse verstehen nicht alle Mailprogramme
  // (live auf BETA, 16.10.2026: mailto:eva.demo%40example.invalid).
  return `mailto:${encodeURIComponent(empfaenger).replace(/%40/g, "@")}${teile.length ? `?${teile.join("&")}` : ""}`;
}

export const MAILTO_SICHER = 1900;
