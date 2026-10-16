// Datumsgruppen fuer Mein Tag (P2-1, 16.10.2026). Vorbild: monday.com "My Work".
//
// Eine lange Liste mit einem Datum je Zeile liest sich schlecht: man muss
// jede Zeile ansehen, um zu wissen, wo "morgen" anfaengt. Mit Zwischentiteln
// ("Morgen", "Älter als 7 Tage") findet das Auge den Abschnitt zuerst.

import { wochentagKurz } from "~/lib/format";
import { crmDateAtTimeToIso, crmIsoToLocalDateTime } from "~/lib/local-time";

/** "2026-10-16" bleibt, ein Zeitpunkt wird zum Tag in der CRM-Zeitzone. */
export function tagSchluessel(wert: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(wert) ? wert : crmIsoToLocalDateTime(wert).slice(0, 10);
}

function abstand(tag: string, heute: string): number {
  const [a, b] = [heute, tag].map((t) => { const [j, m, d] = t.split("-").map(Number); return Date.UTC(j, m - 1, d); });
  return Math.round((b - a) / 86_400_000);
}

/** Kommende Tage: "Morgen · Sa., 17.10.", danach "Mo., 19.10." */
export function kommenderTag(wert: string, heute: string): string {
  const tag = tagSchluessel(wert);
  const name = wochentagKurz(crmDateAtTimeToIso(tag, "12:00"));
  return abstand(tag, heute) === 1 ? `Morgen · ${name}` : name;
}

/** Vergangenes: "Gestern", "Letzte 7 Tage", "Älter als 7 Tage". */
export function vergangenerAbschnitt(wert: string, heute: string): string {
  const n = -abstand(tagSchluessel(wert), heute);
  return n <= 1 ? "Gestern" : n <= 7 ? "Letzte 7 Tage" : "Älter als 7 Tage";
}

/** Fristen: "Überfällig", "Heute", "Nächste 7 Tage", "Später". */
export function fristAbschnitt(wert: string, heute: string): string {
  const n = abstand(tagSchluessel(wert), heute);
  return n < 0 ? "Überfällig" : n === 0 ? "Heute" : n <= 7 ? "Nächste 7 Tage" : "Später";
}

/** Aufeinanderfolgende Eintraege mit gleichem Titel zu einer Gruppe; die Reihenfolge bleibt. */
export function gruppiere<T>(liste: T[], titelVon: (e: T) => string): { titel: string; eintraege: T[] }[] {
  const gruppen: { titel: string; eintraege: T[] }[] = [];
  for (const e of liste) {
    const titel = titelVon(e);
    const letzte = gruppen.at(-1);
    if (letzte && letzte.titel === titel) letzte.eintraege.push(e);
    else gruppen.push({ titel, eintraege: [e] });
  }
  return gruppen;
}
