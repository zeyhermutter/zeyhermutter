// Exposé-Gestaltung (Generator 4, 19.10.2026).
//
// Reines Layout: bekommt pdf-lib, eingebettete Schriften und Bilder von aussen
// und zeichnet das Exposé. Keine Datenbank, kein Netz -- dadurch laeuft
// derselbe Code in der Edge-Funktion (Deno) und im Musterlauf
// (scripts/expose-muster.mjs, Node).
//
// Gestaltung: Marine (#0A223A) und Gold (#B58A45) aus dem Logo, viel Weissraum,
// Cormorant Garamond fuer Ueberschriften, Montserrat fuer Text -- wie die
// Website. Es werden nur eingetragene Angaben gezeigt; fehlt etwas, faellt die
// Zeile weg. Firmenangaben kommen aus Verwaltung › Firma & Fristen.

import { LOGO_BREITE, LOGO_GOLD, LOGO_HOEHE, LOGO_SCHRIFT } from "./logo.ts";

export type Bild = { image: any; title?: string | null };
export type Schriften = { serif: any; serifKursiv: any; serifHalbfett: any; sans: any; sansLeicht: any; sansMittel: any; sansHalbfett: any };
export type Firma = {
  legal_name?: string | null; brand_name?: string | null; street?: string | null; postal_code?: string | null; city?: string | null;
  registered_seat?: string | null; register_court?: string | null; register_number?: string | null; managing_directors?: string | null;
  tax_number?: string | null; vat_id?: string | null; phone?: string | null; email?: string | null; website?: string | null;
};
export type ExposeEingabe = {
  title: string; subtitle?: string | null; short_description?: string | null; long_description?: string | null;
  features_description?: string | null; location_description?: string | null; other_information?: string | null;
  price?: number | string | null; facts: any; energy: any; exposeNumber: string; versionNumber: number; erstelltAm: Date;
  firma: Firma | null; titelbild: Bild | null; galerie: Bild[]; grundrisse: Bild[];
};
export type PdfLib = { rgb: any; pushGraphicsState: any; popGraphicsState: any; rectangle: any; clip: any; endPath: any };

const A4: [number, number] = [595.28, 841.89];
const RAND = 56;
const BREITE = A4[0] - RAND * 2;

export function zeichneExpose(pdf: any, lib: PdfLib, s: Schriften, e: ExposeEingabe) {
  const { rgb } = lib;
  const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const F = {
    marine: hex("#0A223A"), marineTief: hex("#071A2D"), marineLinie: hex("#2A4258"), gold: hex("#B58A45"), goldHell: hex("#C9A46A"),
    elfenbein: hex("#F6F2EA"), elfenbeinLinie: hex("#E4DCCD"), text: hex("#26313B"), text2: hex("#5A6570"), text3: hex("#8A939B"),
    weiss: hex("#FFFFFF"), weissLeise: hex("#C9D2DB"), logoHell: hex("#ECEBF0"),
  };
  const facts = e.facts ?? {}, energy = e.energy ?? {}, firma = e.firma ?? null;
  const leer = (v: unknown) => v == null || !String(v).trim();

  // ---------- Text ----------
  const rein = (v: unknown) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim();
  const absaetze = (v: unknown) => rein(v).split(/\r?\n\s*\r?\n|\r?\n/).map((a) => a.trim()).filter(Boolean);
  const umbrechen = (text: string, font: any, size: number, max: number) => {
    const zeilen: string[] = []; let zeile = "";
    for (const wort of rein(text).split(" ").filter(Boolean)) {
      const neu = zeile ? `${zeile} ${wort}` : wort;
      if (font.widthOfTextAtSize(neu, size) <= max || !zeile) zeile = neu; else { zeilen.push(zeile); zeile = wort; }
    }
    if (zeile) zeilen.push(zeile);
    return zeilen;
  };
  const gesperrtBreite = (t: string, font: any, size: number, abstand: number) => [...t].reduce((b, z) => b + font.widthOfTextAtSize(z, size) + abstand, -abstand);
  const gesperrt = (page: any, t: string, x: number, y: number, font: any, size: number, color: any, abstand: number, ausrichtung: "links" | "rechts" | "mitte" = "links") => {
    const w = gesperrtBreite(t, font, size, abstand);
    let cx = ausrichtung === "rechts" ? x - w : ausrichtung === "mitte" ? x - w / 2 : x;
    for (const z of [...t]) { page.drawText(z, { x: cx, y, size, font, color }); cx += font.widthOfTextAtSize(z, size) + abstand; }
    return w;
  };
  const mitte = (page: any, t: string, y: number, font: any, size: number, color: any) => page.drawText(t, { x: A4[0] / 2 - font.widthOfTextAtSize(t, size) / 2, y, size, font, color });
  const rechts = (page: any, t: string, x: number, y: number, font: any, size: number, color: any) => page.drawText(t, { x: x - font.widthOfTextAtSize(t, size), y, size, font, color });

  // ---------- Zahlen ----------
  const zahl = (v: unknown, stellen = 1) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? new Intl.NumberFormat("de-DE", { maximumFractionDigits: stellen }).format(n) : null; };
  const miete = facts.transaction_type === "RENT";
  const preis = (() => { const n = zahl(e.price, 0); return n ? `${n} €` : "Preis auf Anfrage"; })();
  const preisLabel = miete ? "Kaltmiete / Monat" : "Kaufpreis";
  const datum = (v: unknown) => { const t = rein(v); const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : t; };
  const adresse = facts.address ?? {};
  const ort = [adresse.city, adresse.district].filter((x: unknown) => !leer(x)).map(rein);
  const lageZeile = [adresse.street && adresse.house_number ? `${rein(adresse.street)} ${rein(adresse.house_number)}` : null, [adresse.postal_code, adresse.city].filter((x: unknown) => !leer(x)).map(rein).join(" ") || null, leer(adresse.district) ? null : rein(adresse.district)].filter(Boolean).join(" · ");

  // ---------- Bausteine ----------
  const logo = (page: any, x: number, yOben: number, breite: number, aufDunkel: boolean) => {
    const scale = breite / LOGO_BREITE;
    for (const d of LOGO_GOLD) page.drawSvgPath(d, { x, y: yOben, scale, color: F.gold });
    for (const d of LOGO_SCHRIFT) page.drawSvgPath(d, { x, y: yOben, scale, color: aufDunkel ? F.logoHell : F.marine });
    return (LOGO_HOEHE * scale);
  };
  const bildFuellend = (page: any, img: any, x: number, y: number, w: number, h: number) => {
    const scale = Math.max(w / img.width, h / img.height), iw = img.width * scale, ih = img.height * scale;
    page.pushOperators(lib.pushGraphicsState(), lib.rectangle(x, y, w, h), lib.clip(), lib.endPath());
    page.drawImage(img, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih });
    page.pushOperators(lib.popGraphicsState());
  };
  const bildEingepasst = (page: any, img: any, x: number, y: number, w: number, h: number) => {
    const scale = Math.min(w / img.width, h / img.height), iw = img.width * scale, ih = img.height * scale;
    page.drawImage(img, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih });
  };
  const raute = (page: any, x: number, y: number, r: number, color: any) => page.drawSvgPath(`M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`, { x, y, color });
  const haken = (page: any, x: number, y: number, color: any) => page.drawSvgPath("M0 3.2 L2.6 5.8 L7.4 0.6", { x, y: y + 6, borderColor: color, borderWidth: 1.1 });

  const firmenname = rein(firma?.brand_name) || rein(firma?.legal_name) || "Zeyher & Mutter Immobilien";
  const pflichtangaben = (() => {
    if (!firma) return "";
    const anschrift = [firma.street, [firma.postal_code, firma.city].filter((x) => !leer(x)).join(" ")].filter((x) => !leer(x)).map(rein).join(", ");
    return [rein(firma.legal_name) || null, anschrift || null, leer(firma.registered_seat) ? null : `Sitz: ${rein(firma.registered_seat)}`,
      leer(firma.register_court) && leer(firma.register_number) ? null : `Registergericht: ${[firma.register_court, firma.register_number].filter((x) => !leer(x)).map(rein).join(", ")}`,
      // GbR/OHG/PartG: Gesellschafter statt Geschäftsführer (26.10.2026, wie app/lib/firma.ts).
      leer(firma.managing_directors) ? null : `${/\b(e?GbR|OHG|PartG)\b/.test(firma.legal_name ?? "") ? "Gesellschafter" : "Geschäftsführer"}: ${rein(firma.managing_directors)}`,
      leer(firma.vat_id) ? null : `USt-IdNr.: ${rein(firma.vat_id)}`].filter(Boolean).join(" · ");
  })();

  // ---------- Inhaltsseiten mit Kopf und Fuss ----------
  let seitenNr = 1;
  const OBEN = A4[1] - 96, UNTEN = 78;
  const fusszeilen = umbrechen(pflichtangaben, s.sans, 6.2, BREITE - 40);
  const neueSeite = () => {
    seitenNr++;
    const page = pdf.addPage(A4);
    logo(page, RAND - 6, A4[1] - 30, 112, false);
    gesperrt(page, `EXPOSÉ  ${rein(e.exposeNumber)}`, A4[0] - RAND, A4[1] - 52, s.sansMittel, 6.6, F.text3, 1.6, "rechts");
    page.drawLine({ start: { x: RAND, y: A4[1] - 72 }, end: { x: A4[0] - RAND, y: A4[1] - 72 }, thickness: 0.6, color: F.gold });
    page.drawLine({ start: { x: RAND, y: 52 }, end: { x: A4[0] - RAND, y: 52 }, thickness: 0.4, color: F.elfenbeinLinie });
    fusszeilen.slice(0, 2).forEach((z, i) => page.drawText(z, { x: RAND, y: 40 - i * 8.5, size: 6.2, font: s.sans, color: F.text3 }));
    rechts(page, String(seitenNr).padStart(2, "0"), A4[0] - RAND, 36, s.serifHalbfett, 11, F.gold);
    return page;
  };
  const kopf = (page: any, oberzeile: string, titel: string, y: number) => {
    gesperrt(page, oberzeile.toUpperCase(), RAND, y, s.sansHalbfett, 7.2, F.gold, 2.2);
    page.drawText(titel, { x: RAND, y: y - 34, size: 29, font: s.serif, color: F.marine });
    return y - 58;
  };

  // =========================================================
  // 1. Titelseite
  // =========================================================
  {
    const page = pdf.addPage(A4);
    const panel = 318;
    page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: F.marine });
    if (e.titelbild) bildFuellend(page, e.titelbild.image, 0, panel, A4[0], A4[1] - panel);
    else logo(page, A4[0] / 2 - 140, panel + (A4[1] - panel) / 2 + 41, 280, true); // ohne Titelbild: Logo statt leerer Flaeche
    page.drawRectangle({ x: 0, y: panel - 1.2, width: A4[0], height: 1.2, color: F.gold });
    if (e.titelbild) logo(page, RAND - 8, panel - 22, 168, true);
    gesperrt(page, "EXPOSÉ", A4[0] - RAND, panel - 48, s.sansHalbfett, 7.4, F.gold, 3, "rechts");
    gesperrt(page, rein(e.exposeNumber), A4[0] - RAND, panel - 62, s.sans, 6.8, F.weissLeise, 1.2, "rechts");

    let y = panel - 112;
    const oberzeile = ort.length ? ort.join(" · ") : (miete ? "Zur Miete" : "Zum Kauf");
    gesperrt(page, oberzeile.toUpperCase(), RAND, y, s.sansHalbfett, 7.6, F.gold, 2.6);
    y -= 32;
    // Titel: bis zwei Zeilen gross, sonst kleiner bis drei Zeilen; was nicht passt, endet mit "…".
    let tg = 27, tz = umbrechen(e.title, s.serif, tg, BREITE);
    if (tz.length > 2) { tg = 22; tz = umbrechen(e.title, s.serif, tg, BREITE); }
    if (tz.length > 3) { tz = tz.slice(0, 3); while (tz[2].includes(" ") && s.serif.widthOfTextAtSize(`${tz[2]} …`, tg) > BREITE) tz[2] = tz[2].slice(0, tz[2].lastIndexOf(" ")); tz[2] = `${tz[2]} …`; }
    for (const z of tz) { page.drawText(z, { x: RAND, y, size: tg, font: s.serif, color: F.weiss }); y -= tg + 4; }
    if (!leer(e.subtitle) && y + 4 >= 110) { const z = umbrechen(rein(e.subtitle), s.serifKursiv, 14, BREITE)[0]; page.drawText(z, { x: RAND, y: y + 4, size: 14, font: s.serifKursiv, color: F.weissLeise }); }

    const kennzahlen: [string, string][] = [[preisLabel, preis]];
    const wf = zahl(facts.living_area_sqm), gf = zahl(facts.plot_area_sqm), zi = zahl(facts.rooms);
    if (wf) kennzahlen.push(["Wohnfläche", `${wf} m²`]); else if (gf) kennzahlen.push(["Grundstück", `${gf} m²`]);
    if (zi) kennzahlen.push(["Zimmer", zi]);
    if (!leer(facts.year_built)) kennzahlen.push(["Baujahr", rein(facts.year_built)]);
    const spalte = BREITE / kennzahlen.length;
    page.drawLine({ start: { x: RAND, y: 92 }, end: { x: A4[0] - RAND, y: 92 }, thickness: 0.5, color: F.marineLinie });
    kennzahlen.forEach(([label, wert], i) => {
      const x = RAND + i * spalte + (i ? 16 : 0);
      if (i) page.drawLine({ start: { x: RAND + i * spalte, y: 44 }, end: { x: RAND + i * spalte, y: 78 }, thickness: 0.5, color: F.marineLinie });
      page.drawText(wert, { x, y: 56, size: i === 0 ? 19 : 18, font: s.serifHalbfett, color: F.weiss });
      gesperrt(page, label.toUpperCase(), x, 44 - 2, s.sansMittel, 6, F.goldHell, 1.4);
    });
  }

  // =========================================================
  // 2. Auf einen Blick
  // =========================================================
  const galerie = [...e.galerie];
  {
    const page = neueSeite();
    let y = kopf(page, "Das Objekt", "Auf einen Blick", OBEN);
    if (!leer(e.short_description)) {
      for (const z of umbrechen(rein(e.short_description), s.serifKursiv, 14.5, BREITE).slice(0, 6)) { page.drawText(z, { x: RAND, y, size: 14.5, font: s.serifKursiv, color: F.text }); y -= 20; }
      y -= 14;
    }
    const zeilen: [string, string][] = [];
    const add = (l: string, v: unknown) => { if (!leer(v)) zeilen.push([l, rein(v)]); };
    add(preisLabel, preis);
    add("Wohnfläche", zahl(facts.living_area_sqm) && `${zahl(facts.living_area_sqm)} m²`);
    add("Nutzfläche", zahl(facts.usable_area_sqm) && `${zahl(facts.usable_area_sqm)} m²`);
    add("Grundstück", zahl(facts.plot_area_sqm) && `${zahl(facts.plot_area_sqm)} m²`);
    add("Zimmer", zahl(facts.rooms)); add("Schlafzimmer", zahl(facts.bedrooms)); add("Badezimmer", zahl(facts.bathrooms));
    add("Etage", facts.floor); add("Baujahr", facts.year_built); add("Modernisierung", facts.modernization_year);
    add("Zustand", facts.condition); add("Stellplätze", zahl(facts.parking_spaces)); add("Wohneinheiten", zahl(facts.residential_units));
    add("Verfügbar ab", leer(facts.available_from) ? null : datum(facts.available_from));
    const highlights = (Array.isArray(facts.highlights) ? facts.highlights : []).map(rein).filter(Boolean).slice(0, 8);

    const links = highlights.length ? 236 : BREITE, start = y;
    gesperrt(page, "ECKDATEN", RAND, y, s.sansHalbfett, 6.8, F.text2, 1.8); y -= 14;
    for (const [l, v] of zeilen) {
      page.drawLine({ start: { x: RAND, y }, end: { x: RAND + links, y }, thickness: 0.4, color: F.elfenbeinLinie });
      y -= 15;
      page.drawText(l, { x: RAND, y, size: 8.6, font: s.sans, color: F.text2 });
      const gross = l === preisLabel;
      rechts(page, v, RAND + links, y - (gross ? 1 : 0), gross ? s.serifHalbfett : s.sansMittel, gross ? 13 : 8.8, gross ? F.marine : F.text);
      y -= 8;
    }
    page.drawLine({ start: { x: RAND, y }, end: { x: RAND + links, y }, thickness: 0.4, color: F.elfenbeinLinie });
    let yTabelle = y;
    if (highlights.length) {
      const x = RAND + links + 30, w = BREITE - links - 30;
      page.drawRectangle({ x: x - 14, y: Math.min(yTabelle, start - 40 - highlights.length * 26) - 6, width: w + 14, height: start - Math.min(yTabelle, start - 40 - highlights.length * 26) + 14, color: F.elfenbein });
      let hy = start;
      gesperrt(page, "HIGHLIGHTS", x + 4, hy, s.sansHalbfett, 6.8, F.gold, 1.8); hy -= 22;
      for (const h of highlights) {
        const zz = umbrechen(h, s.sans, 9, w - 26);
        raute(page, x + 7, hy + 3, 2.6, F.gold);
        for (const z of zz) { page.drawText(z, { x: x + 18, y: hy, size: 9, font: s.sans, color: F.text }); hy -= 13; }
        hy -= 8;
      }
      yTabelle = Math.min(yTabelle, hy);
    }
    y = yTabelle - 24;

    // Energieangaben als ruhige Leiste -- auf der ersten Inhaltsseite sichtbar.
    const energie: [string, string][] = [];
    const ea = (l: string, v: unknown) => { if (!leer(v)) energie.push([l, rein(v)]); };
    ea("Energieausweis", energy.certificate_type || (energy.certificate_present === true ? "liegt vor" : energy.certificate_present === false ? "liegt nicht vor" : null));
    ea("Kennwert", leer(energy.energy_value_kwh) ? null : `${zahl(energy.energy_value_kwh) ?? rein(energy.energy_value_kwh)} kWh/(m²·a)`);
    ea("Klasse", energy.efficiency_class); ea("Energieträger", energy.energy_source); ea("Baujahr lt. Ausweis", energy.building_year);
    ea("Gültig bis", leer(energy.valid_until) ? null : datum(energy.valid_until));
    if (energie.length) {
      const sp = Math.min(energie.length, 3), zeilenE = Math.ceil(energie.length / sp), w = (BREITE - 110) / sp, h = zeilenE * 26 + 18;
      page.drawRectangle({ x: RAND, y: y - h, width: BREITE, height: h, color: F.elfenbein });
      gesperrt(page, "ENERGIE", RAND + 16, y - 22, s.sansHalbfett, 6.8, F.gold, 1.8);
      energie.forEach(([l, v], i) => {
        const x = RAND + 110 + (i % sp) * w, yy = y - 18 - Math.floor(i / sp) * 26;
        page.drawText(l, { x, y: yy, size: 6.6, font: s.sans, color: F.text2 });
        page.drawText(umbrechen(v, s.sansMittel, 8.8, w - 10)[0], { x, y: yy - 11, size: 8.8, font: s.sansMittel, color: F.text });
      });
      y -= h + 20;
    }
    const bild = galerie.shift();
    if (bild && y - UNTEN > 140) { const h = Math.min(y - UNTEN - 4, 340); bildFuellend(page, bild.image, RAND, y - h, BREITE, h); }
    else if (bild) galerie.unshift(bild);
  }

  // =========================================================
  // 3. Beschreibung, Ausstattung, Lage, Sonstiges, Energie (fliessend)
  // =========================================================
  {
    let page = neueSeite();
    let y = kopf(page, "Die Immobilie", "Im Detail", OBEN);
    const TX = RAND + 54, TW = A4[0] - RAND - TX;
    const platz = (h: number) => { if (y - h < UNTEN) { page = neueSeite(); y = OBEN; } };
    let nr = 0;
    // Ueberschrift nie allein am Seitenende: sie braucht mindestens "folgt" Platz darunter.
    const abschnitt = (titel: string, folgt = 48) => {
      platz(32 + folgt); nr++;
      if (y < OBEN) y -= 10;
      page.drawText(String(nr).padStart(2, "0"), { x: RAND, y: y - 4, size: 24, font: s.serif, color: F.gold });
      page.drawText(titel, { x: TX, y, size: 17, font: s.serifHalbfett, color: F.marine });
      y -= 12;
      page.drawLine({ start: { x: TX, y }, end: { x: TX + 28, y }, thickness: 0.8, color: F.gold });
      y -= 20;
    };
    const fliesstext = (text: unknown) => {
      for (const a of absaetze(text)) {
        for (const z of umbrechen(a, s.sansLeicht, 9.4, TW)) { platz(15); page.drawText(z, { x: TX, y, size: 9.4, font: s.sansLeicht, color: F.text }); y -= 15.2; }
        y -= 6;
      }
      y -= 18;
    };
    if (!leer(e.long_description)) { abschnitt("Objektbeschreibung"); fliesstext(e.long_description); }
    const merkmale = (Array.isArray(facts.features) ? facts.features : []).map((f: any) => {
      if (f?.type === "BOOLEAN") return f.value === true ? rein(f.label) : null;
      return leer(f?.value) ? null : `${rein(f.label)}: ${rein(f.value)}${f.unit ? ` ${rein(f.unit)}` : ""}`;
    }).filter(Boolean).slice(0, 24) as string[];
    if (!leer(e.features_description) || merkmale.length) {
      abschnitt("Ausstattung");
      if (!leer(e.features_description)) fliesstext(e.features_description);
      if (merkmale.length) {
        const sw = (TW - 16) / 2;
        for (let i = 0; i < merkmale.length; i += 2) {
          platz(18);
          for (let j = 0; j < 2; j++) { const m = merkmale[i + j]; if (!m) continue; const x = TX + j * (sw + 16); haken(page, x, y - 1, F.gold); page.drawText(umbrechen(m, s.sans, 8.8, sw - 16)[0], { x: x + 14, y, size: 8.8, font: s.sans, color: F.text }); }
          y -= 17;
        }
        y -= 18;
      }
    }
    if (!leer(e.location_description)) {
      abschnitt("Lage");
      if (lageZeile) { page.drawText(lageZeile, { x: TX, y, size: 9, font: s.sansMittel, color: F.text2 }); y -= 20; }
      fliesstext(e.location_description);
    }
    if (!leer(e.other_information)) { abschnitt("Weitere Informationen"); fliesstext(e.other_information); }

  }

  // =========================================================
  // 4. Impressionen: je Seite ein grosses und zwei kleinere Bilder
  // =========================================================
  for (let i = 0; i < galerie.length; i += 3) {
    const page = neueSeite();
    let y = kopf(page, "Eindrücke", "Impressionen", OBEN);
    const gross = galerie[i], klein = galerie.slice(i + 1, i + 3);
    const verfuegbar = y - UNTEN - 10;
    const hGross = klein.length ? Math.round(verfuegbar * 0.58) : verfuegbar - 18;
    bildFuellend(page, gross.image, RAND, y - hGross, BREITE, hGross);
    if (!leer(gross.title)) page.drawText(rein(gross.title), { x: RAND, y: y - hGross - 13, size: 10, font: s.serifKursiv, color: F.text2 });
    y -= hGross + 26;
    if (klein.length) {
      const w = klein.length === 1 ? BREITE : (BREITE - 14) / 2, h = y - UNTEN - 22;
      klein.forEach((b, j) => {
        const x = RAND + j * (w + 14);
        bildFuellend(page, b.image, x, y - h, w, h);
        if (!leer(b.title)) page.drawText(umbrechen(rein(b.title), s.serifKursiv, 10, w)[0], { x, y: y - h - 13, size: 10, font: s.serifKursiv, color: F.text2 });
      });
    }
  }

  // =========================================================
  // 5. Grundrisse
  // =========================================================
  for (const plan of e.grundrisse) {
    const page = neueSeite();
    const y = kopf(page, "Grundriss", rein(plan.title) || "Grundriss", OBEN);
    const h = y - UNTEN - 10;
    page.drawRectangle({ x: RAND, y: UNTEN + 10, width: BREITE, height: h, color: F.elfenbein });
    page.drawRectangle({ x: RAND + 18, y: UNTEN + 28, width: BREITE - 36, height: h - 36, color: F.weiss });
    bildEingepasst(page, plan.image, RAND + 34, UNTEN + 44, BREITE - 68, h - 68);
  }

  // =========================================================
  // 6. Schlussseite: Kontakt und Firmenangaben
  // =========================================================
  {
    seitenNr++;
    const page = pdf.addPage(A4);
    page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: F.marine });
    const lb = 250;
    logo(page, A4[0] / 2 - lb / 2, A4[1] - 200, lb, true);
    let y = A4[1] - 390;
    mitte(page, "Wir freuen uns auf Sie.", y, s.serifKursiv, 30, F.weiss);
    y -= 34;
    const web = rein(firma?.website).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const kontakt: [string, string][] = ([["Telefon", rein(firma?.phone)], ["E-Mail", rein(firma?.email)], ["Web", web]] as [string, string][]).filter(([, v]) => v);
    // "Rufen Sie uns an" nur, wenn Telefon oder E-Mail darunter stehen (20.10.2026).
    const direkt = Boolean(rein(firma?.phone) || rein(firma?.email));
    for (const z of ["Gerne zeigen wir Ihnen diese Immobilie persönlich und beantworten Ihre Fragen.", direkt ? "Rufen Sie uns an oder schreiben Sie uns – wir melden uns zeitnah bei Ihnen." : "Sprechen Sie uns an – wir melden uns zeitnah bei Ihnen."]) { mitte(page, z, y, s.sansLeicht, 9.8, F.weissLeise); y -= 16; }
    y -= 26;
    page.drawLine({ start: { x: A4[0] / 2 - 22, y }, end: { x: A4[0] / 2 + 22, y }, thickness: 0.8, color: F.gold });
    y -= 46;
    if (kontakt.length) {
      const sw = BREITE / kontakt.length;
      kontakt.forEach(([l, v], i) => {
        const cx = RAND + sw * i + sw / 2;
        gesperrt(page, l.toUpperCase(), cx, y, s.sansHalbfett, 6.8, F.gold, 2, "mitte");
        page.drawText(v, { x: cx - s.serif.widthOfTextAtSize(v, 15) / 2, y: y - 22, size: 15, font: s.serif, color: F.weiss });
      });
      y -= 70;
    }
    const anschrift = firma ? [firma.street, [firma.postal_code, firma.city].filter((x) => !leer(x)).join(" ")].filter((x) => !leer(x)).map(rein).join(" · ") : "";
    if (anschrift) {
      gesperrt(page, "ANSCHRIFT", A4[0] / 2, y, s.sansHalbfett, 6.8, F.gold, 2, "mitte");
      mitte(page, rein(firma?.legal_name) || firmenname, y - 22, s.serif, 14, F.weiss);
      mitte(page, anschrift, y - 40, s.sansLeicht, 9.4, F.weissLeise);
    }
    page.drawLine({ start: { x: RAND, y: 92 }, end: { x: A4[0] - RAND, y: 92 }, thickness: 0.5, color: F.marineLinie });
    let fy = 76;
    for (const z of umbrechen(pflichtangaben, s.sans, 6.8, BREITE)) { mitte(page, z, fy, s.sans, 6.8, F.weissLeise); fy -= 10; }
    const stand = `Exposé ${rein(e.exposeNumber)} · Version ${e.versionNumber} · Datenstand ${e.erstelltAm.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`;
    mitte(page, stand, 36, s.sans, 6.4, F.text3);
    mitte(page, "Alle Angaben entsprechen dem Datenstand dieser Exposé-Version zum Zeitpunkt der Erstellung.", 26, s.sans, 6.4, F.text3);
  }
}
