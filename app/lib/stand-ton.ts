// Welche Farbe ein Stand traegt -- aus seiner Beschriftung.
//
// WARUM AUS DEM WORT
//
// Die Arbeitsplaetze zeigen den Stand eines Datensatzes als Pille, aber
// dreizehn von achtzehn ohne Farbe: "Angenommen", "Abgelehnt" und "Entwurf"
// sahen gleich grau aus (BETA, 13.10.2026). Jeder Bereich hat eigene
// Statuswerte; die Beschriftungen dagegen stehen einheitlich in
// app/lib/labels.ts. Deshalb wird hier nach dem Wort entschieden, an einer
// Stelle fuer alle -- ein neuer Status mit bekanntem Wort bekommt seine Farbe
// ohne weiteres Zutun, ein unbekannter bleibt grau.
//
// Die Klassen sind die vorhandenen Statusflaechen (crm-light-theme.css):
//   status-sold        gruen      erledigt, erreicht, angenommen
//   status-marketing   blau       laeuft, offen, in Arbeit
//   status-preparation bernstein  wartet, faellig, ruht
//   status-lost        rot        abgelehnt, verloren, ueberschritten
//   status-archived    grau       Entwurf, archiviert, ersetzt

const GRUEN = ["aktiv", "gewonnen", "angenommen", "abgeschlossen", "beurkundet", "bezahlt", "erledigt", "durchgeführt", "bestätigt", "veröffentlicht", "übergabe erfolgt", "übergegangen", "freigegeben", "finalisiert", "erreicht", "verkauft", "eingegangen am", "dokumentiert"];
const ROT = ["verloren", "abgelehnt", "abgebrochen", "abgesagt", "zurückgezogen", "gescheitert", "aufgehoben", "kein weiteres interesse", "nicht erschienen", "storniert", "überschritten", "überfällig", "gesperrt"];
const BERNSTEIN = ["fällig", "ruht", "pausiert", "später", "vorbereitung", "wartet", "gegenangebot", "prüfbereit", "zur freigabe", "änderungen offen", "knapp"];
const GRAU = ["archiviert", "entwurf", "ersetzt", "abgelaufen", "inaktiv", "nicht gestartet"];

export function standKlasse(text: string | null | undefined): string {
  const t = String(text ?? "").toLocaleLowerCase("de-DE");
  if (!t) return "";
  // Reihenfolge: grau und rot zuerst -- "Entwurf eingegangen" ist ein
  // laufender Schritt (blau, unten), "Archiviert" schlaegt alles.
  if (t.startsWith("archiviert")) return "status-archived";
  if (ROT.some((w) => t.includes(w))) return "status-lost";
  if (t === "entwurf eingegangen") return "status-marketing";
  if (GRAU.some((w) => t.includes(w))) return "status-archived";
  if (BERNSTEIN.some((w) => t.includes(w))) return "status-preparation";
  if (GRUEN.some((w) => t.includes(w))) return "status-sold";
  return "status-marketing";
}
