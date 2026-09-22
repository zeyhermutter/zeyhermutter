import type { MetaDescriptor } from "react-router";

// Der gemeinsame Seitenkopf der oeffentlichen Webseite: kanonische Adresse und
// die Angaben fuer geteilte Links.
//
// WARUM ES DAS GIBT
//
// Keine einzige oeffentliche Seite trug Open-Graph-Angaben. Wer einen Link auf
// die Bewertungsseite oder ein Expose per WhatsApp, LinkedIn oder E-Mail
// weitergab, bekam beim Empfaenger eine nackte Adresse ohne Bild und oft ohne
// Titel -- ausgerechnet bei einem Makler, dessen Objekte zu einem guten Teil
// ueber weitergeleitete Links ihre Kaeufer finden.
//
// Die kanonische Adresse stand auf vier von fuenfzehn Seiten, jeweils von Hand
// in den Loader geschrieben.
//
// Jede oeffentliche Seite reicht ihre Meta-Angaben jetzt durch seitenkopf().
// Titel und Beschreibung bleiben, wo sie waren -- die Funktion liest sie aus
// und spiegelt sie in die Vorschau. scripts/check-seitenkopf.mjs faellt, wenn
// eine oeffentliche Seite das vergisst.

export const SEITENNAME = "Zeyher & Mutter Immobilien";

/** Das Bild fuer geteilte Links, 1200 x 630, wenn die Seite kein eigenes hat. */
export const TEILEN_BILD = { pfad: "/marke/teilen.jpg", breite: 1200, hoehe: 630 };

type Treffer = { id: string; data?: unknown } | undefined;
type MetaArgsAusschnitt = { matches: readonly Treffer[]; location: { pathname: string } };

/** Die Adresse der Seite, wie sie beim Aufruf angekommen ist. Kommt aus dem Loader in root.tsx. */
export function herkunft(matches: readonly Treffer[]): string | null {
  const wurzel = matches.find((treffer) => treffer?.id === "root")?.data as { origin?: unknown } | undefined;
  return typeof wurzel?.origin === "string" ? wurzel.origin : null;
}

function inhaltVon(eintraege: MetaDescriptor[], name: string): string | null {
  for (const eintrag of eintraege) {
    if ("name" in eintrag && eintrag.name === name && "content" in eintrag && typeof eintrag.content === "string") return eintrag.content;
  }
  return null;
}

function titelVon(eintraege: MetaDescriptor[]): string | null {
  for (const eintrag of eintraege) {
    if ("title" in eintrag && typeof eintrag.title === "string") return eintrag.title;
  }
  return null;
}

function istKanonisch(eintrag: MetaDescriptor): boolean {
  return "tagName" in eintrag && eintrag.tagName === "link" && "rel" in eintrag && eintrag.rel === "canonical";
}

/**
 * Ergaenzt die Meta-Angaben einer oeffentlichen Seite um kanonische Adresse
 * und Vorschau fuer geteilte Links.
 *
 * @param bild Ein eigenes Vorschaubild (Pfad oder absolute Adresse), etwa das
 *             Titelfoto eines Exposes. Ohne Angabe gilt TEILEN_BILD.
 */
export function seitenkopf(
  args: MetaArgsAusschnitt,
  eintraege: MetaDescriptor[],
  optionen: { bild?: string | null; typ?: "website" | "article" } = {},
): MetaDescriptor[] {
  const origin = herkunft(args.matches);
  const titel = titelVon(eintraege);
  const beschreibung = inhaltVon(eintraege, "description");
  const keinIndex = /noindex/i.test(inhaltVon(eintraege, "robots") ?? "");

  // Ohne bekannte Herkunft laesst sich keine absolute Adresse bilden. Dann lieber
  // gar keine Vorschau als eine mit relativen Adressen, die kein Dienst aufloest.
  if (!origin) return eintraege;

  const adresse = new URL(args.location.pathname, origin).toString();
  const eigenesBild = optionen.bild ? new URL(optionen.bild, origin).toString() : null;
  const bild = eigenesBild ?? new URL(TEILEN_BILD.pfad, origin).toString();

  const ergaenzt: MetaDescriptor[] = [
    // Eine kanonische Adresse gehoert nicht auf eine Seite, die gar nicht in den
    // Index soll -- die beiden Angaben widersprechen sich.
    ...eintraege.filter((eintrag) => !istKanonisch(eintrag)),
    ...(keinIndex ? [] : [{ tagName: "link" as const, rel: "canonical", href: adresse }]),
    { property: "og:site_name", content: SEITENNAME },
    { property: "og:locale", content: "de_DE" },
    { property: "og:type", content: optionen.typ ?? "website" },
    { property: "og:url", content: adresse },
    ...(titel ? [{ property: "og:title", content: titel }] : []),
    ...(beschreibung ? [{ property: "og:description", content: beschreibung }] : []),
    { property: "og:image", content: bild },
    ...(eigenesBild ? [] : [
      { property: "og:image:width", content: String(TEILEN_BILD.breite) },
      { property: "og:image:height", content: String(TEILEN_BILD.hoehe) },
    ]),
    { property: "og:image:alt", content: titel ?? SEITENNAME },
    { name: "twitter:card", content: "summary_large_image" },
  ];
  return ergaenzt;
}

/**
 * Die Organisation als strukturierte Angabe fuer Suchmaschinen -- nur mit dem,
 * was auf der Seite ohnehin steht: Name, Adresse der Seite, Logo.
 *
 * Anschrift, Telefon und Oeffnungszeiten fehlen absichtlich. Sie stehen nirgends
 * auf der Webseite, und eine strukturierte Angabe, die der sichtbaren Seite
 * widerspricht oder etwas behauptet, das dort nicht steht, wertet Google als
 * Taeuschung. Sobald sie im Impressum stehen, gehoeren sie auch hierher.
 */
export function organisation(origin: string): MetaDescriptor {
  return {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "RealEstateAgent",
      name: SEITENNAME,
      url: new URL("/", origin).toString(),
      logo: new URL("/marke/zeyher-mutter-logo.svg", origin).toString(),
      image: new URL(TEILEN_BILD.pfad, origin).toString(),
      areaServed: "München",
    },
  };
}
