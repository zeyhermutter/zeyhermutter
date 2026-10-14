#!/usr/bin/env node
// Haelt die Aufraeumarbeiten von Paket 0 (14.10.2026) fest.
//
// Jede Regel hier war ein Fehler, der im Betrieb nicht auffiel:
//
//  1. Die E-Mail eines Kontakts, Leads oder einer Anfrage liess sich nur
//     ueber die Bereichsleiste erreichen -- die auf einer Akte nie zu sehen
//     war. Jetzt steht "E-Mail" im Kopf dieser drei Akten.
//  2. Aktivitaeten am Lead wurden ohne contact_id gespeichert und fehlten
//     im Verlauf des Kontakts.
//  3. Die Objektakte zeigte keine Aufgaben, obwohl Aufgaben am Objekt hingen.
//  4. Auswahlfelder luden die ersten 250 bzw. 1000 Kontakte vorab; wer
//     dahinter lag, war nicht waehlbar. Jetzt sucht das Feld in der Datenbank.
//  5. Reste: unsichtbare "Modul 0x"-Ueberschriften, englische Ueberschriften,
//     der Hinweis "Backend vorbereitet · noch nicht aktiviert".
//  6. Die OpenAI-Anbindung des Strategie-Checks war auf BETA eingeschaltet,
//     entgegen der Regel "keine OpenAI-API". Der Kopier-Prompt bleibt.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const WURZEL = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const lies = (datei) => readFile(path.join(WURZEL, datei), "utf8");
const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

// 1. E-Mail aus der Akte
for (const [datei, art] of [["kontakt-arbeitsplatz.tsx", "contact"], ["lead-arbeitsplatz.tsx", "lead"], ["anfrage-arbeitsplatz.tsx", "inquiry"]]) {
  const inhalt = await lies(`app/routes/${datei}`);
  pruefe(inhalt.includes(`<EmailKnopf art="${art}"`), `${datei}: kein E-Mail-Knopf im Kopf der Akte`);
}
pruefe(!(await lies("app/routes/email-compose.tsx")).includes("im Reiter „E-Mail“"), "email-compose.tsx: verweist auf einen Reiter „E-Mail“, den es nicht gibt");

// 2. Lead-Aktivitaeten mit Kontakt
const lead = await lies("app/routes/lead-detail.tsx");
const leadEinfuegen = lead.match(/from\("activity_events"\)\.insert\(\{[^}]*\}/g) ?? [];
pruefe(leadEinfuegen.length > 0 && leadEinfuegen.every((z) => z.includes("contact_id")), "lead-detail.tsx: Aktivitaet ohne contact_id gespeichert");

// 3. Aufgaben in der Objektakte
const objekt = await lies("app/routes/property-detail.tsx");
pruefe(/from\("tasks"\)\.select\([^)]*\)\.eq\("property_id"/.test(objekt), "property-detail.tsx: offene Aufgaben werden nicht geladen");
pruefe(objekt.includes("<AufgabenBaustein"), "property-detail.tsx: offene Aufgaben werden nicht angezeigt");
pruefe((await lies("app/lib/termine.ts")).includes("/crm/contacts/${task.contact_id}/relations"), "termine.ts: Aufgabe am Kontakt fuehrt nicht in die Kontaktakte");

// 4. Keine vorab gekappten Kontaktlisten in diesen Auswahlfeldern
for (const datei of ["property-detail.tsx", "contact-relations.tsx"]) {
  const inhalt = await lies(`app/routes/${datei}`);
  pruefe(inhalt.includes("<KontaktAuswahl"), `${datei}: Kontakt wird nicht ueber die Suche gewaehlt`);
  pruefe(!/from\("contacts"\)(?:(?!supabase\.)[\s\S])*?\.limit\((250|1000)\)/.test(inhalt), `${datei}: laedt wieder eine gekappte Kontaktliste`);
}

// 5. Reste
const routen = (await readdir(path.join(WURZEL, "app/routes"))).filter((n) => n.endsWith(".tsx"));
for (const datei of routen) {
  const inhalt = await lies(`app/routes/${datei}`);
  pruefe(!/Modul \d\d/.test(inhalt), `${datei}: alte Ueberschrift „Modul 0x“`);
  pruefe(!inhalt.includes(">Activity History<") && !inhalt.includes('eyebrow">Activity<'), `${datei}: englische Ueberschrift „Activity“`);
  pruefe(!inhalt.includes("Backend vorbereitet · noch nicht aktiviert"), `${datei}: veralteter Hinweis „Backend vorbereitet“`);
}

// 6. Keine OpenAI-Anbindung auf BETA
const wrangler = JSON.parse(await lies("wrangler.json"));
pruefe(wrangler.vars?.SALES_READINESS_AI_ENABLED === "false", "wrangler.json: SALES_READINESS_AI_ENABLED ist nicht false");
pruefe(wrangler.env?.beta?.vars?.SALES_READINESS_AI_ENABLED === "false", "wrangler.json (beta): SALES_READINESS_AI_ENABLED ist nicht false");

if (fehler.length) {
  console.error("Aufraeumen (Paket 0):\n  " + fehler.join("\n  "));
  process.exit(1);
}
console.log(`Aufraeumen: E-Mail in 3 Akten, Lead-Aktivitaeten mit Kontakt, Aufgaben in der Objektakte, Kontaktwahl per Suche, ${routen.length} Routen ohne Reste, OpenAI auf BETA aus.`);
