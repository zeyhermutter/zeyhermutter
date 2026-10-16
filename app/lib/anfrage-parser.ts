// Anfragen-Assistent: eingefügten Text lesen (P2-5, 16.10.2026).
//
// Ohne KI. Feste Regeln: beschriftete Zeilen ("E-Mail:", "Telefon:",
// "Vorname:" ...), dazu Muster für E-Mail-Adressen, Telefonnummern,
// Objektnummern (ZM-2026-0003) und Postleitzahlen. Was nicht sicher erkannt
// wird, bleibt leer -- lieber ein leeres Feld als ein falsch geratener Name.
//
// Das Ergebnis ist immer nur ein Vorschlag: Der Assistent zeigt jedes Feld zum
// Prüfen an, gespeichert wird erst auf "Anfrage anlegen".
//
// Die Portalformate sind aus den beschrifteten Zeilen abgeleitet, die Portale
// üblicherweise schicken, nicht aus echten Beispielen des Büros. Passt ein
// Format nicht, bleibt das Feld leer und wird von Hand gefüllt.

export type AnfrageVorschlag = {
  anrede: string | null;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  nachricht: string | null;
  portal: string | null;
  kanal: "PORTAL" | "EMAIL" | "OTHER";
  objektnummer: string | null;
  portalObjektId: string | null;
  postleitzahlen: string[];
  /** Welche Felder aus einer beschrifteten Zeile stammen ("sicherer") */
  ausZeile: string[];
};

const PORTALE: [RegExp, string][] = [
  [/immobilienscout24|immoscout/i, "ImmoScout24"],
  [/immowelt/i, "Immowelt"],
  [/immonet/i, "Immonet"],
  [/kleinanzeigen/i, "Kleinanzeigen"],
  [/ohne-makler/i, "ohne-makler.net"],
];

/** Adressen, die zum Portal gehören, nicht zum Interessenten. */
const FREMDE_ADRESSE = /(noreply|no-reply|donotreply|immobilienscout24|immoscout|immowelt|immonet|kleinanzeigen|mailer-daemon)/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TELEFON = /(?:\+|00)\d[\d\s/().-]{6,}\d|0\d{2,5}[\s/().-]*\d[\d\s/().-]{4,}\d/g;
const OBJEKTNUMMER = /\bZM-\d{4}-\d{4}\b/i;

function zeilenwert(text: string, beschriftungen: string[]): string | null {
  for (const b of beschriftungen) {
    const re = new RegExp(`^[ \\t>*-]*${b}\\s*[:：]\\s*(.+)$`, "im");
    const m = re.exec(text);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

function telefonSauber(s: string): string {
  return s.replace(/[^\d+ /-]/g, "").replace(/\s+/g, " ").trim();
}

const NACHRICHT_BESCHRIFTUNG = /^[ \t>*-]*(nachricht|ihre nachricht|anfrage|mitteilung|text der anfrage|kommentar)\s*[:：]\s*/im;
const ENDE_BLOCK = /^(?:[ \t>*-]*(?:mit freundlichen grüßen|viele grüße|beste grüße|--\s*$|_{3,}|-{3,}|diese e-mail wurde|impressum|datenschutz)|[ \t>*-]*[A-ZÄÖÜ][\wäöüß .-]{1,30}\s*[:：])/im;

function nachrichtAus(text: string): { wert: string | null; ausZeile: boolean } {
  const m = NACHRICHT_BESCHRIFTUNG.exec(text);
  if (m) {
    const rest = text.slice(m.index + m[0].length);
    // Bis zum nächsten beschrifteten Feld oder Gruß -- aber mindestens die erste Zeile.
    const zeilen = rest.split(/\r?\n/);
    const behalten: string[] = [zeilen[0]];
    for (const z of zeilen.slice(1)) {
      if (ENDE_BLOCK.test(z)) break;
      behalten.push(z);
    }
    const wert = behalten.join("\n").trim();
    return { wert: wert || null, ausZeile: true };
  }
  return { wert: null, ausZeile: false };
}

export function leseAnfrage(roh: string): AnfrageVorschlag {
  const text = roh.replace(/\r\n/g, "\n").slice(0, 20000);
  const ausZeile: string[] = [];
  const merke = <T,>(feld: string, wert: T | null): T | null => { if (wert) ausZeile.push(feld); return wert; };

  const portal = PORTALE.find(([re]) => re.test(text))?.[1] ?? null;

  // E-Mail: beschriftete Zeile zuerst, sonst die erste Adresse, die nicht dem Portal gehört.
  const emailZeile = zeilenwert(text, ["e-?mail(?:-adresse)?", "mail"]);
  const emailAusZeile = emailZeile?.match(EMAIL)?.[0] ?? null;
  const email = merke("email", emailAusZeile)
    ?? ([...text.matchAll(EMAIL)].map((m) => m[0]).find((a) => !FREMDE_ADRESSE.test(a)) ?? null);

  const telZeile = zeilenwert(text, ["telefon(?:nummer)?", "tel\\.?", "mobil(?:nummer)?", "handy", "rufnummer", "phone"]);
  const telAusZeile = telZeile?.match(TELEFON)?.[0] ?? null;
  // Ohne Beschriftung nur eindeutige Formen: +49/0049 … oder Vorwahl mit Leerzeichen,
  // Schrägstrich oder Bindestrich. Ein Datum wie 01.10.2026 passt so nicht.
  const telefonRoh = merke("telefon", telAusZeile) ?? text.match(/(?:\+|00)49[\d\s/().-]{7,}\d|\b0\d{2,4}[ /-]\d{3,}(?:[ -]\d{2,})*\b/)?.[0] ?? null;
  const telefon = telefonRoh ? telefonSauber(telefonRoh) : null;

  let anrede = merke("anrede", zeilenwert(text, ["anrede"])?.match(/^(Herr|Frau)\b/i)?.[0] ?? null);
  let vorname = merke("vorname", zeilenwert(text, ["vorname"]));
  let nachname = merke("nachname", zeilenwert(text, ["nachname", "name, vorname"]));
  if (!vorname && !nachname) {
    // "Name: Frau Erika Muster" oder "Interessent: Erika Muster"
    const ganz = zeilenwert(text, ["name", "absender", "interessent(?:in)?", "kontakt(?:daten)?", "von"]);
    if (ganz && !ganz.includes("@")) {
      const teile = ganz.replace(/,.*$/, "").trim().split(/\s+/);
      if (/^(Herr|Frau)$/i.test(teile[0] ?? "")) { anrede = anrede ?? teile.shift()!; }
      if (/^(Dr\.|Prof\.)/.test(teile[0] ?? "")) teile.shift();
      if (teile.length >= 2 && teile.length <= 4) {
        nachname = teile.pop()!; vorname = teile.join(" ");
        ausZeile.push("vorname", "nachname");
      }
    }
  }
  if (anrede) anrede = anrede[0].toUpperCase() + anrede.slice(1).toLowerCase();

  const nachricht = nachrichtAus(text);
  if (nachricht.ausZeile) ausZeile.push("nachricht");

  const objektnummer = text.match(OBJEKTNUMMER)?.[0]?.toUpperCase() ?? null;
  const portalObjektId = zeilenwert(text, ["scout-id", "objekt-?id", "objekt-?nr\\.?", "objektnummer", "anzeigen-?id", "inserat(?:s)?-?nr\\.?"])?.match(/[A-Z0-9-]{4,}/i)?.[0] ?? null;
  const postleitzahlen = [...new Set([...text.matchAll(/\b(\d{5})\s+[A-ZÄÖÜ][a-zäöüß]/g)].map((m) => m[1]))];

  return {
    anrede, vorname, nachname, email, telefon,
    nachricht: nachricht.wert,
    portal,
    kanal: portal ? "PORTAL" : email ? "EMAIL" : "OTHER",
    objektnummer, portalObjektId, postleitzahlen,
    ausZeile: [...new Set(ausZeile)],
  };
}
