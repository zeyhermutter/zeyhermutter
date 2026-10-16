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

pruefe((await lies("app/routes/api-aufgaben.ts")).includes('"doppelt"'), "api-aufgaben.ts: legt eine gleiche offene Aufgabe am selben Vorgang ohne Rueckfrage ein zweites Mal an");

// 8. Anfrage: die Nachricht zuerst
{
  const anfrage = await lies("app/routes/inquiry-detail.tsx");
  const nachricht = anfrage.indexOf('id="nachricht"');
  pruefe(nachricht > 0 && nachricht < anfrage.indexOf('<p className="eyebrow">Interessent</p>'), "inquiry-detail.tsx: Die Nachricht steht nicht mehr als erste Karte");
}

// 9. Interne Texte und Codes (P1-7, 15.10.2026)
{
  const dateien = [
    ...(await readdir(path.join(WURZEL, "app/routes"))).filter((n) => n.endsWith(".tsx")).map((n) => `app/routes/${n}`),
    ...(await readdir(path.join(WURZEL, "app/components"))).filter((n) => n.endsWith(".tsx")).map((n) => `app/components/${n}`),
  ];
  for (const datei of dateien) {
    const inhalt = await lies(datei);
    pruefe(!/Version \{[a-zA-Z]+\.version\}/.test(inhalt), `${datei}: zeigt den technischen Versionszaehler („Version 7“)`);
    pruefe(!/\{(a|e|event)\.action\}/.test(inhalt), `${datei}: zeigt den rohen Aktionscode im Verlauf (CREATE/UPDATE)`);
    pruefe(!/anwaltlich abzunehmen/i.test(inhalt) || datei.includes("public-page-sections") || datei.endsWith("anwaltspruefung.tsx"), `${datei}: Anwaltsprüfungs-Karte auf einer Arbeitsseite -- gehoert nach Verwaltung > Anwaltspruefung (app/lib/anwaltspruefung.ts)`);
    pruefe(!/>Append-only<|BETA-Backend aktiv|Snapshot ver|den Snapshot/.test(inhalt), `${datei}: Entwicklerbegriff in der Oberflaeche`);
    // Website-Seiten (P1, 15.10.2026): Fachbegriffe aus Webentwicklung und Datenmodell.
    pruefe(!/>[^<>{}]*(SEO-|Meta-Beschreibung|URL-Kürzel|Snapshot|Publikationsversion|Veröffentlichungsakte|Freigabeversion|Kandidat|Website-CMS)[^<>{}]*</.test(inhalt) && !/"[^"]*· (LIVE|KANDIDAT)"/.test(inhalt), `${datei}: Fachbegriff auf einer Website-Seite (SEO, Snapshot, Kandidat, LIVE …)`);
  }
  pruefe(!(await lies("app/routes/reports.tsx")).includes("<code>"), "reports.tsx: Feldnamen in den Definitionen statt Worten");
  const objekt = await lies("app/routes/property-detail.tsx");
  pruefe(objekt.includes("objektVerlaufZeilen(") && !/metadata\?\.change_type/.test(objekt), "property-detail.tsx: Objekthistorie zeigt Bereichscodes (CHECKLIST) und Spaltennamen statt objektVerlaufZeilen");
}

// 10. Ein Kopf je Akte bei Maklerauftrag und Provision (P1, 15.10.2026)
for (const [rahmen, seite] of [["maklerauftrag-arbeitsplatz", "mandate-detail"], ["provision-arbeitsplatz", "commission-detail"]]) {
  pruefe((await lies(`app/routes/${rahmen}.tsx`)).includes('seitenkopf="ausblenden"'), `${rahmen}.tsx: zeigt den Seitenkopf der Unterseite zusaetzlich zum Kopf der Akte`);
  const s = await lies(`app/routes/${seite}.tsx`);
  pruefe(!s.includes('className="editor-header"') && s.includes("<h2>Archiv</h2>"), `${seite}.tsx: eigener Seitenkopf statt Archiv-Karte`);
}

// 11. Eigentuemer: mit Link zum Kontakt, gleich beim Anlegen (P1, 15.10.2026)
pruefe((await lies("app/routes/property-detail.tsx")).includes('to={`/crm/contacts/${owner.contact_id}`}'), "property-detail.tsx: Eigentümername ohne Link zum Kontakt");
pruefe((await lies("app/routes/property-new.tsx")).includes('name="owner_contact_id"'), "property-new.tsx: Eigentümer kann beim Anlegen nicht gewählt werden");

// 12. Objektakte: keine Reiter ins Leere (P1, 15.10.2026)
{
  const nav = await lies("app/lib/objektakte-navigation.ts");
  const routen = await lies("app/routes.ts");
  // Jede Seite mit eigenem Recht muss in RECHT_JE_SEITE stehen.
  for (const m of routen.matchAll(/route\("properties\/:propertyId\/([a-z-]+)", "(routes\/[a-z-]+\.tsx)"/g)) {
    const quelle = await lies(`app/${m[2]}`);
    const recht = /requirePermission\([^)]*"([a-z_]+\.read)"\)/.exec(quelle)?.[1];
    if (recht && recht !== "property.read") pruefe(nav.includes(`"${m[1]}": "${recht}"`) || nav.includes(`${m[1]}: "${recht}"`), `objektakte-navigation.ts: Seite ${m[1]} verlangt ${recht}, steht aber nicht in RECHT_JE_SEITE -- der Reiter fuehrte sonst auf 403`);
  }
  pruefe((await lies("app/components/objektakte-reiter.tsx")).includes('"/api/objekt-rechte"'), "objektakte-reiter.tsx: Reiter ohne Rechtepruefung");
  // Nicht im Ladeteil des Arbeitsplatzes: dort teilen sich alle Ladeteile die Unteranfragen einer Anfrage.
  pruefe(!(await lies("app/routes/immobilien-arbeitsplatz.tsx")).includes("current_user_has_permission"), "immobilien-arbeitsplatz.tsx: Rechtepruefung im Ladeteil -- kostet Unteranfragen der Objektakte (Verlauf fiel am 15.10. deshalb aus)");
}

// 13. Veroeffentlichung: Statusbedingung vor dem Klick sichtbar
pruefe((await lies("app/routes/property-publication.tsx")).includes('id:"public-status"'), "property-publication.tsx: Objektstatus fehlt in der Prüfliste -- man erfuhr erst nach dem Klick, dass der Status nicht passt");

// 14. Unterlagenliste: Hochladen in der Zeile, ueber dieselbe Ablage wie die Dokumente
{
  const liste = await lies("app/routes/property-document-requirements.tsx");
  pruefe(liste.includes('value="upload"') && liste.includes("dateiInAblage("), "property-document-requirements.tsx: kein Hochladen in der Zeile");
  pruefe(!(await lies("app/routes/property-documents.tsx")).includes("function sha256Hex"), "property-documents.tsx: eigene Upload-Regeln statt app/lib/dokument-ablage.server.ts");
}

// 15. Medien: mehrere Dateien auf einmal; Signaturen gesammelt statt je Medium
{
  const m = await lies("app/routes/property-media.tsx");
  pruefe(/name="file" type="file" multiple/.test(m) && m.includes('fd.getAll("file")'), "property-media.tsx: nur eine Datei je Hochladen");
  pruefe(m.includes("createSignedUrls(") && !m.includes(".createSignedUrl("), "property-media.tsx: Signatur je Medium -- bei vielen Medien mehr Unteranfragen, als eine Worker-Anfrage darf");
}

// 16. Telefonat schnell erfassen, in Uebersicht und Verlauf der Kontaktakte
for (const datei of ["app/routes/contact-overview.tsx", "app/routes/contact-collaboration.tsx"]) {
  pruefe((await lies(datei)).includes("<TelefonatErfassen "), `${datei}: kein schnelles Erfassen eines Telefonats`);
}

// 17. Organisation zeigt ihre Ansprechpartner
pruefe((await lies("app/routes/organization-detail.tsx")).includes('id="ansprechpartner"'), "organization-detail.tsx: Ansprechpartner der Organisation nicht sichtbar");

// 18. Suchprofil anlegen behaelt die Typen; Leads ohne Dauer-Erklaerkarte und ohne zweiten Anlegen-Knopf
{
  const neu = await lies("app/routes/search-profile-new.tsx");
  pruefe(neu.includes('fields.property_types=fd.getAll("property_types")') && neu.includes('defaultChecked={(f.property_types'), "search-profile-new.tsx: gewählte Immobilientypen gehen bei einem Fehler verloren");
  const leads = await lies("app/routes/leads.tsx");
  pruefe(!leads.includes('<p className="eyebrow">Was ist ein Lead?</p>') && (leads.match(/to="\/leads\/new"/g) ?? []).length === 1, "leads.tsx: Erklärkarte dauerhaft offen oder zwei Knöpfe zum Anlegen");
}

// 19. Provision ohne stille Vorauswahl; Besichtigungen beginnen mit der naechsten
pruefe(!(await lies("app/components/commission-fields.tsx")).includes("properties[0]?.id"), "commission-fields.tsx: erste Immobilie still vorgewählt");
pruefe((await lies("app/routes/viewings.tsx")).includes('.gte("starts_at",jetzt).order("starts_at",{ascending:true})'), "viewings.tsx: Einstieg nicht bei der nächsten anstehenden Besichtigung");

if (fehler.length) {
  console.error("P1:\n  " + fehler.join("\n  "));
  process.exit(1);
}
console.log("P1: Beteiligte je Objekt, Exposé nur mit freigegebenen Bildern, Finanzierung als Auswahl, Kontaktakte mit Übersicht, Objektakte beginnt mit der Lage, Kontaktwahl überall per Suche, Aufgaben-Baustein in 7 Akten, Anfrage beginnt mit der Nachricht, keine internen Codes, ein Kopf je Akte bei Auftrag und Provision, Eigentümer verlinkt und beim Anlegen wählbar, Objektreiter nur mit Recht, Website-Seiten ohne Fachjargon und mit sichtbarer Statusbedingung, Hochladen in der Unterlagenzeile, mehrere Medien auf einmal, Telefonat schnell erfassen, Ansprechpartner an der Organisation, Suchprofil-Typen bleiben, Leads ruhiger, Provision ohne Vorauswahl, Besichtigungen ab der nächsten.");
