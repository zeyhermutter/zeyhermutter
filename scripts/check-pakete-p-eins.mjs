#!/usr/bin/env node
// Haelt die Korrekturen aus P1 (14.10.2026) fest.
//
//  1. Verfuegungsberechtigte: Die Objektakte und die Seite der
//     Verfuegungsberechtigung luden die Beteiligten ALLER Objekte. Gab es
//     zum Objekt noch keinen Datensatz, standen fremde Personen in der Akte.
//  2. Exposé: Das neue Exposé uebernahm alle Bilder des Objekts, auch die
//     nur intern abgelegten; die Auswahl bot sie ebenfalls an, das PDF
//     druckte sie. Jetzt nur, was unter Medien freigegeben ist.
//  3. Kaufangebot an der Besichtigung: "Finanzierung" war ein freies
//     Textfeld, die Datenbank kennt aber nur vier Werte. Jede andere Eingabe
//     liess das Speichern scheitern.
//  4. Kontaktakte: Der erste Reiter ist die Uebersicht, nicht das Formular.
//  5. Objektakte: Die Uebersicht beginnt mit Preis, Eigentuemern, Interessenten
//     und dem naechsten Faelligen; die sechs Statusknoepfe sind zugeklappt.
//  6. Kontaktwahl: 22 Formulare luden die ersten 500 oder 1000 Kontakte als
//     Auswahlliste; wer dahinter lag, war nicht waehlbar. Jetzt ueberall die
//     Suche (KontaktAuswahl).
//  7. Aufgaben: fuenf eigene Formulare -> ein Baustein (AufgabenBaustein,
//     /api/aufgaben) in sieben Akten, mit Haken in der Zeile.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const WURZEL = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const lies = (datei) => readFile(path.join(WURZEL, datei), "utf8");
const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

// 1.
for (const datei of ["app/routes/property-detail.tsx", "app/routes/property-disposition.tsx"]) {
  const inhalt = await lies(datei);
  const abfrage = inhalt.match(/from\("property_disposition_parties"\)\.select\(.*/)?.[0] ?? "";
  pruefe(abfrage.includes("property_dispositions!inner(property_id)") && abfrage.includes('.eq("property_dispositions.property_id",propertyId)'),
    `${datei}: Beteiligte werden nicht auf dieses Objekt beschraenkt`);
}

// 2.
const exposes = await lies("app/routes/property-exposes.tsx");
pruefe(/from\("property_media"\)\.select\("[^"]*"\)\.eq\("property_id",propertyId\)\.eq\("public_approved",true\)/.test(exposes), "property-exposes.tsx: neues Exposé uebernimmt nicht freigegebene Bilder");
const exposeDetail = await lies("app/routes/property-expose-detail.tsx");
const aktionen = exposeDetail.match(/from\("property_media"\)\.select\("id(?:,media_type)?"\)[^;]*/g) ?? [];
pruefe(aktionen.length >= 2 && aktionen.every((z) => z.includes('.eq("public_approved",true)')), "property-expose-detail.tsx: Speichern/Neue Version prueft die Freigabe nicht");
pruefe(exposeDetail.includes("m.media_type==='IMAGE'&&m.public_approved"), "property-expose-detail.tsx: Auswahl bietet interne Bilder an");
pruefe((await lies("supabase/functions/generate-property-expose/index.ts")).includes('.eq("property_media.public_approved",true)'), "generate-property-expose: PDF druckt nicht freigegebene Bilder");

// 3.
const besichtigung = await lies("app/routes/viewing-detail.tsx");
pruefe(!besichtigung.includes('<input name="financing_status"'), "viewing-detail.tsx: Finanzierung wieder als freies Textfeld");
pruefe(besichtigung.includes("financing_status:finanzierung(fd)"), "viewing-detail.tsx: Finanzierung wird ungeprueft gespeichert");

// 4.
pruefe((await lies("app/routes/contact-overview.tsx")).includes("Number(z.score) >= MINDESTENS_PASSEND"), "contact-overview.tsx: zaehlt auch nicht passende Objekte als passend");
const routen = await lies("app/routes.ts");
pruefe(routen.includes('route("crm/contacts/:contactId", "routes/contact-overview.tsx")'), "routes.ts: Kontaktakte oeffnet nicht mit der Uebersicht");
pruefe(routen.includes('route("crm/contacts/:contactId/stammdaten", "routes/contact-detail.tsx")'), "routes.ts: Stammdaten ohne eigenen Reiter");
pruefe((await lies("app/routes/kontakt-arbeitsplatz.tsx")).includes('{ beschriftung: "Übersicht", pfad: basis, genau: true }'), "kontakt-arbeitsplatz.tsx: Reiter „Übersicht“ fehlt");
pruefe((await lies("app/routes/contact-detail.tsx")).includes("/stammdaten?saved=1"), "contact-detail.tsx: nach dem Speichern zurueck auf die Uebersicht statt auf die Stammdaten");

// 5. Objektakte: zuerst die Lage, Status zugeklappt
const objektakte = await lies("app/routes/property-detail.tsx");
pruefe(objektakte.includes("<ObjektAufEinenBlick") && objektakte.indexOf("<ObjektAufEinenBlick") < objektakte.indexOf("<ObjektakteFahrplan"), "property-detail.tsx: Übersicht beginnt nicht mit „auf einen Blick“");
pruefe(!objektakte.includes('id="status"'), "property-detail.tsx: Statusknöpfe wieder als eigene Karte oben in der Akte");
pruefe((await lies("app/components/objekt-auf-einen-blick.tsx")).includes('<details className="akte-blick-status">'), "objekt-auf-einen-blick.tsx: Status ändern nicht mehr zugeklappt");

// 6. Kein Formular laedt mehr eine gekappte Kontaktliste vorab
for (const datei of (await readdir(path.join(WURZEL, "app/routes"))).filter((n) => n.endsWith(".tsx"))) {
  const inhalt = await lies(`app/routes/${datei}`);
  pruefe(!/from\("contacts"\)\.select\("[^"]*"\)\.is\("archived_at",\s*null\)\.order\("last_name"\)\.limit\(/.test(inhalt),
    `${datei}: laedt wieder die ersten N Kontakte fuer eine Auswahl -- Kontakt per <KontaktAuswahl> waehlen`);
}
pruefe(!(await lies("app/components/task-create-modal.tsx")).includes('<select name="contact_id"'), "task-create-modal.tsx: Kontakt wieder als vorab geladene Liste");

// 7. Aufgaben: ein Baustein in jeder Akte, eine Stelle zum Speichern
for (const datei of ["contact-overview", "contact-relations", "lead-detail", "inquiry-detail", "viewing-detail", "search-profile-detail", "property-detail"]) {
  const inhalt = await lies(`app/routes/${datei}.tsx`);
  pruefe(inhalt.includes("<AufgabenBaustein"), `${datei}.tsx: Aufgaben ohne den gemeinsamen Baustein`);
  pruefe(!/intent\s*===\s*"(task|task_status|create_task|complete_task)"/.test(inhalt), `${datei}.tsx: eigene Aufgaben-Aktion neben dem Baustein`);
}

if (fehler.length) {
  console.error("P1:\n  " + fehler.join("\n  "));
  process.exit(1);
}
console.log("P1: Beteiligte je Objekt, Exposé nur mit freigegebenen Bildern, Finanzierung als Auswahl, Kontaktakte mit Übersicht, Objektakte beginnt mit der Lage, Kontaktwahl überall per Suche, Aufgaben-Baustein in 7 Akten.");
