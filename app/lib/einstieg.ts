// Der Einstieg in einen Bereich mit Liste und Akte.
//
// Seit 12.10.2026 oeffnet ein Klick auf "Kontakte", "Objekte",
// "Verkäufer-Leads" usw. gleich den Arbeitsplatz mit dem obersten Datensatz
// -- wie ein Adressbuch-Programm beim Start. Die Tabelle mit allen Filtern
// bleibt erreichbar: als "Volle Liste" (?ansicht=tabelle) und mit jedem
// Filter, jeder Seite, jedem Verweis, der Parameter mitgibt.
//
// Die Regel ist deshalb so einfach wie moeglich: nur die nackte Adresse
// ohne jeden Parameter ist der Einstieg. Wer einen Filter baut, der alle
// Parameter weglaesst, muss ansicht=tabelle mitgeben --
// scripts/check-arbeitsplaetze.mjs prueft das fuer das Filterformular.

/** Ist das der nackte Aufruf des Bereichs, ohne Filter und ohne Ansicht? */
export function istEinstieg(request: Request): boolean {
  return new URL(request.url).searchParams.size === 0;
}
