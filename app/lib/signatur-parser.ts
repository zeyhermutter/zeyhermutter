// Kontakt aus einer E-Mail-Signatur (20.10.2026, onOffice-Abgleich).
//
// Ohne KI, wie der Anfragen-Assistent (app/lib/anfrage-parser.ts): feste
// Regeln fuer Name, E-Mail, Telefon, Mobil und Anschrift. Was nicht sicher
// erkannt wird, bleibt leer. Das Ergebnis fuellt nur die leeren Felder im
// Formular "Kontakt anlegen" -- gespeichert wird erst auf "Kontakt speichern".

export type SignaturVorschlag = {
  anrede: string | null;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  mobil: string | null;
  strasse: string | null;
  hausnummer: string | null;
  plz: string | null;
  ort: string | null;
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const NUMMER = /(?:\+|00)\d[\d\s/().-]{6,}\d|0\d{2,5}[\s/().-]*\d[\d\s/().-]{3,}\d/;
const GRUSS = /^(mit freundlichen gr(ü|ue)(ß|ss)en|freundliche gr(ü|ue)(ß|ss)e|viele gr(ü|ue)(ß|ss)e|beste gr(ü|ue)(ß|ss)e|liebe gr(ü|ue)(ß|ss)e|herzliche gr(ü|ue)(ß|ss)e|gr(ü|ue)(ß|ss)e|mfg|vg|lg|best regards|kind regards|regards|--+|_{3,})\W*$/i;
const FIRMA = /\b(gmbh|ag|ug|kg|ohg|gbr|e\.\s?k\.|e\.v\.|mbh|immobilien|verwaltung|bank|holding|partner|kanzlei|steuerberat)/i;
const STRASSE = /^(.+?(?:stra(ß|ss)e|str\.|weg|platz|allee|gasse|ring|damm|ufer|steig|chaussee|markt|berg|hof|anger|feld|park)(?![a-zäöüß]).*?)\s+(\d+\s*[a-z]?(?:\s*[-/]\s*\d+\s*[a-z]?)?)$/i;
const PLZ_ORT = /^(?:D-?\s?)?(\d{5})\s+([A-ZÄÖÜ][\wÄÖÜäöüß .()/-]+)$/;

const sauber = (s: string) => s.replace(/\(0\)/g, "").replace(/[^\d+ /-]/g, "").replace(/\s+/g, " ").trim();
const istMobil = (s: string) => /^(?:\+|00)?49\s?\(?0?\)?\s?1[567]|^01[567]/.test(s.replace(/[\s/().-]/g, ""));

export function leseSignatur(roh: string): SignaturVorschlag {
  // Signaturen trennen oft mit "|" oder "·" in einer Zeile; "Straße 5, 80331 Ort" ebenfalls.
  const zeilen = roh.replace(/\r\n/g, "\n").slice(0, 5000).split("\n")
    .flatMap((z) => z.split(/\s+[|·•]\s+|,\s+(?=(?:D-?\s?)?\d{5}\s)/))
    .map((z) => z.replace(/^[ \t>*|-]+/, "").trim()).filter(Boolean);
  const v: SignaturVorschlag = { anrede: null, vorname: null, nachname: null, email: null, telefon: null, mobil: null, strasse: null, hausnummer: null, plz: null, ort: null };

  for (const z of zeilen) {
    const klein = z.toLowerCase();
    if (!v.email) { const m = z.match(EMAIL); if (m) { v.email = m[0]; continue; } }
    if (/\bfax\b|telefax/i.test(klein)) continue;
    const nummer = z.match(NUMMER)?.[0];
    if (nummer && !/^\d{5}\s/.test(z)) {
      const n = sauber(nummer);
      if (/\b(mobil|handy|mobile|cell)\b/i.test(klein) || (istMobil(n) && !/\b(tel|telefon|fon|phone|festnetz)\b/i.test(klein))) { v.mobil = v.mobil ?? n; }
      else { v.telefon = v.telefon ?? n; }
      continue;
    }
    const plz = z.match(PLZ_ORT);
    if (plz && !v.plz) { v.plz = plz[1]; v.ort = plz[2].trim(); continue; }
    const str = z.match(STRASSE);
    if (str && !v.strasse && !EMAIL.test(z) && !/www\.|https?:/i.test(z)) { v.strasse = str[1].replace(/,$/, "").trim(); v.hausnummer = str[3].replace(/\s+/g, ""); continue; }
  }

  // Name: die erste Zeile mit 2 bis 4 Woertern aus Buchstaben, keine Gruss-,
  // Firmen-, Adress- oder Kontaktzeile.
  for (const z of zeilen) {
    if (GRUSS.test(z) || FIRMA.test(z) || EMAIL.test(z) || NUMMER.test(z) || PLZ_ORT.test(z) || STRASSE.test(z) || /www\.|https?:|:/.test(z)) continue;
    const teile = z.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    let anrede: string | null = null;
    if (/^(herr|frau)$/i.test(teile[0] ?? "")) { const a = teile.shift()!; anrede = a[0].toUpperCase() + a.slice(1).toLowerCase(); }
    while (/^(dr\.|prof\.|dipl\.-?\w*\.?|ing\.)$/i.test(teile[0] ?? "")) teile.shift();
    if (teile.length < 2 || teile.length > 4 || !teile.every((t) => /^[A-ZÄÖÜ][a-zäöüßé'-]+\.?$|^(von|van|de|zu|der|den)$/u.test(t))) continue;
    v.anrede = anrede;
    v.nachname = teile.pop()!;
    // "von", "zu" gehoeren zum Nachnamen
    while (teile.length > 1 && /^(von|van|de|zu|der|den)$/.test(teile[teile.length - 1])) v.nachname = `${teile.pop()} ${v.nachname}`;
    v.vorname = teile.join(" ");
    break;
  }
  return v;
}
