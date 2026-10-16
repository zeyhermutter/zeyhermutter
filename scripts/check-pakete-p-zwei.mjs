#!/usr/bin/env node
// Haelt die Pakete aus P2 (ab 16.10.2026) fest.
//
//  1. Ampel je Zeile in Kontakten, Leads, Objekten, Anfragen und
//     Verkaufsprojekten -- in den Arbeitsplaetzen und den vollen Listen.
//     Die Farbe ist nie das einzige Merkmal (Zeichen und Text).
//     Sie kommt ueber /api/naechster-schritt, nicht aus dem Ladeteil:
//     die Objektakte liegt nahe an der Grenze der Unteranfragen.
//     "Kein nächster Schritt" nur, wenn alle Quellen vollstaendig gelesen sind.
//  2. Stillstand in Mein Tag ueber /api/stillstand, Schwellen in
//     app/lib/stillstand.ts; nur echte Aktivitaet zaehlt.
//  3. Datumsgruppen in Mein Tag.

import { readFile } from "node:fs/promises";
import path from "node:path";

const WURZEL = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const lies = (datei) => readFile(path.join(WURZEL, datei), "utf8");
const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

// 1. Ampel
const ampel = await lies("app/components/ampel.tsx");
pruefe(ampel.includes("AMPEL_ZEICHEN[s.stand]") && ampel.includes('className="sr-only"'), "ampel.tsx: Ampel ohne Zeichen oder ohne Text fuer Bildschirmleser -- die Farbe darf nicht allein tragen");
pruefe(ampel.includes("/api/naechster-schritt?art="), "ampel.tsx: Ampel nicht ueber /api/naechster-schritt");
pruefe((await lies("app/components/arbeitsplatz.tsx")).includes("<Ampel s={staende[z.id]}"), "arbeitsplatz.tsx: Zeilen ohne Ampel");
for (const [datei, art] of [["kontakt", "contact"], ["lead", "lead"], ["immobilien", "property"], ["anfrage", "inquiry"], ["verkaufsprojekt", "project"]]) {
  const s = await lies(`app/routes/${datei}-arbeitsplatz.tsx`);
  pruefe(s.includes(`ampel="${art}"`), `${datei}-arbeitsplatz.tsx: Arbeitsplatz ohne ampel="${art}"`);
  pruefe(!s.includes("ladeSchritte"), `${datei}-arbeitsplatz.tsx: Ampel im Ladeteil -- gehoert in /api/naechster-schritt`);
}
for (const [datei, art] of [["contacts", "contact"], ["leads", "lead"], ["properties", "property"], ["inquiries", "inquiry"], ["projects", "project"]]) {
  const s = await lies(`app/routes/${datei}.tsx`);
  pruefe(s.includes(`useNaechsteSchritte("${art}")`) && s.includes("<Ampel s={"), `${datei}.tsx: volle Liste ohne Ampel`);
}
const stand = await lies("app/lib/vorgang-stand.server.ts");
pruefe(stand.includes('if (vollstaendig) for (const id of laeuft) if (!staende[id]) staende[id] = { stand: "ohne"'), "vorgang-stand.server.ts: \"kein nächster Schritt\" auch bei unvollstaendig gelesenen Quellen");

// 2. Stillstand
const tag = await lies("app/routes/crm-dashboard.tsx");
pruefe(tag.includes("/api/stillstand") && tag.includes('titel="Stillstand"'), "crm-dashboard.tsx: kein Feld Stillstand ueber /api/stillstand");
pruefe(!(await lies("app/lib/mein-tag.server.ts")).includes("ladeStillstand"), "mein-tag.server.ts: Stillstand im Ladeteil von Mein Tag -- gehoert in /api/stillstand");
const schwellen = await lies("app/lib/stillstand.ts");
pruefe(schwellen.includes('AKTIVITAET_ECHT = ["NOTE", "PHONE_CALL", "EMAIL", "MEETING"]'), "stillstand.ts: echte Aktivitaet anders definiert -- automatische Eintraege duerfen den Zaehler nicht zuruecksetzen");
// Die Hilfe nennt die Schwellen; aendert sich eine, muss die Hilfe mit.
const hilfe = await lies("app/help-content.ts");
const zahl = (re) => (schwellen.match(re) ?? [])[1];
const erwartet = [
  `neuer Lead ${zahl(/lead: \{ NEW: (\d+)/)} Tage`, `Lead in Bearbeitung ${zahl(/CONTACTED: (\d+)/)}`,
  `Lead bei Bewertung oder Angebot ${zahl(/VALUATION: (\d+)/)}`, `Anfrage in Bearbeitung ${zahl(/inquiry: \{ CONTACTED: (\d+)/)}`,
  `Objekt in Vermarktung ${zahl(/MARKETING: (\d+)/)}`, `Verkaufsprojekt ${zahl(/ACTIVE: (\d+)/)}`,
];
for (const e of erwartet) pruefe(hilfe.includes(e), `help-content.ts: Schwelle "${e}" fehlt -- Hilfe und app/lib/stillstand.ts stimmen nicht ueberein`);
pruefe(stand.includes('.in("activity_type", AKTIVITAET_ECHT)'), "vorgang-stand.server.ts: Stillstand liest nicht nur echte Aktivitaet");

// 2b. Mein Tag zeigt nur offene Termine
pruefe((await lies("app/lib/mein-tag.server.ts")).includes("termine.events.filter((e) => !e.beendet)"), "mein-tag.server.ts: abgebrochene/abgesagte Termine in Mein Tag");

// 3. Datumsgruppen
pruefe(tag.includes("kommenderTag(") && tag.includes("vergangenerAbschnitt(") && tag.includes("fristAbschnitt("), "crm-dashboard.tsx: Mein Tag ohne Datumsgruppen");

// 4. P2-2: Strg+K, Suche in der Datenbank, Seiten statt Kappung
const schnell = await lies("app/components/schnellsuche.tsx");
pruefe(schnell.includes('e.key.toLowerCase() === "k"') && schnell.includes("/api/suche?q="), "schnellsuche.tsx: kein Strg+K oder keine Treffer beim Tippen");
pruefe(schnell.includes('action="/crm/search"'), "schnellsuche.tsx: ohne JavaScript muss das Feld weiter auf /crm/search fuehren");
pruefe((await lies("app/components/programmrahmen.tsx")).includes("<Schnellsuche />"), "programmrahmen.tsx: Titelleiste ohne Schnellsuche");
const suche = await lies("app/routes/crm-search.tsx");
pruefe(!suche.includes(".limit(300)") && !suche.includes(".slice(0,100)") && suche.includes("sucheUeberall("), "crm-search.tsx: Suche wieder im Browser oder still gekappt -- gehoert in globale-suche.server.ts");
pruefe(suche.includes("{mehr?"), "crm-search.tsx: kein Hinweis, wenn es mehr Treffer gibt");
const aufgaben = await lies("app/routes/tasks.tsx");
pruefe(!aufgaben.includes(".limit(200)") && aufgaben.includes('{ count: "exact" }') && aufgaben.includes(".range("), "tasks.tsx: Aufgabenliste wieder gekappt statt in Seiten");
pruefe(aufgaben.includes("task_number.ilike.") && aufgaben.includes('name="q"'), "tasks.tsx: Aufgaben ohne Textsuche");
pruefe((await lies("app/components/arbeitsplatz.tsx")).includes("In allen suchen →"), "arbeitsplatz.tsx: gekappte Liste ohne Weg in die Suche ueber alles");

// 5. P2-3: Vorlagen und Exposé-Versand mit Nachweis -- das CRM verschickt nichts und schreibt keine Kundentexte
const schreiben = await lies("app/components/email-schreiben.tsx");
pruefe(schreiben.includes('name="_intent" value="gesendet"') && schreiben.includes("mailtoAdresse("), "email-schreiben.tsx: kein Weg ueber das Mailprogramm mit anschliessendem Festhalten");
pruefe(!/fetch\(|sendMail|resend|smtp/i.test(schreiben), "email-schreiben.tsx: darf nichts selbst verschicken");
const compose = await lies("app/routes/email-compose.tsx");
pruefe(compose.includes('from("property_disclosures").insert') && compose.includes('channel: "EXPOSE_EMAIL"'), "email-compose.tsx: Exposé-Versand ohne Objektnachweis");
pruefe(compose.includes('.eq("status", "RELEASED")'), "email-compose.tsx: Exposé nicht nur in der zur Verwendung freigegebenen Fassung");
pruefe(!/(Widerruf|Provision|Belehrung)/.test((await lies("app/lib/email-vorlage.ts")).replace(/\/\/.*$/gm, "")), "email-vorlage.ts: das CRM liefert keine Rechts- oder Provisionstexte");
pruefe((await lies("supabase/migrations/20261016175556_email_templates.sql")).includes("has_permission('settings.manage')"), "email_templates: Pflege nicht auf die Verwaltung beschraenkt");

if (fehler.length) {
  console.error("P2:\n  " + fehler.join("\n  "));
  process.exit(1);
}
console.log("P2: Ampel in 5 Arbeitsplätzen und 5 Listen (mit Zeichen und Text, eigene Anfrage, kein Falschgelb), Stillstand in Mein Tag (eigene Anfrage, nur echte Aktivität), Datumsgruppen, Strg+K mit Treffern beim Tippen, Suche in der Datenbank ohne stilles Kappen, Aufgaben mit Suche und Seiten, E-Mail mit Vorlage und Exposé samt Objektnachweis (nichts wird automatisch verschickt).");
