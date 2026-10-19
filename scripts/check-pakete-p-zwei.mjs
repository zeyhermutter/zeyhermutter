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
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

// 6. P2-5: Anfragen-Assistent -- ohne KI, Dublettenpruefung vor dem Anlegen, nichts ohne Klick gespeichert
const assistent = await lies("app/routes/inquiry-assistent.tsx");
pruefe(!/openai|anthropic|gpt|llm|ai\./i.test(assistent.replace(/\/\/.*$/gm, "")) && !/openai|anthropic|gpt/i.test(await lies("app/lib/anfrage-parser.ts")), "Anfragen-Assistent: keine KI ohne Freigabe");
pruefe((assistent.match(/find_contact_duplicates/g) ?? []).length >= 2 && assistent.includes('text(fd, "trotzdem_neu") !== "1"'), "inquiry-assistent.tsx: neuer Kontakt ohne Dublettenpruefung unmittelbar vor dem Speichern");
pruefe(/if \(absicht === "auswerten"\) \{[\s\S]*?return data<Ergebnis>\(\{ schritt: "vorschlag"/.test(assistent) && !/absicht === "auswerten"[\s\S]{0,600}\.insert\(/.test(assistent), "inquiry-assistent.tsx: Auswerten darf nichts speichern");

// 7. P2-6: Datenauskunft -- jede Tabelle mit Kontaktspalte (Schema BETA, 16.10.2026) ist Quelle
const auskunft = await lies("app/lib/auskunft.server.ts");
const KONTAKT_TABELLEN = ["activity_events", "brokerage_mandate_clients", "commissions", "contact_addresses", "contact_organization_relationships",
  "contact_relationships", "contact_role_assignments", "documents", "energy_certificate_presentations", "gwg_identifications", "inquiries",
  "lead_acquisitions", "leads", "measurement_orders", "property_disclosures", "property_disposition_parties", "property_dispositions",
  "property_document_requirements", "property_encumbrances", "property_hoa_data", "property_legal_data", "property_owners",
  "property_reservations", "property_tenancies", "purchase_offers", "referrals", "sale_case_studies", "sale_closings", "sale_projects",
  "search_profiles", "tasks", "viewings"];
for (const t of KONTAKT_TABELLEN) pruefe(auskunft.includes(`tabelle: "${t}"`), `auskunft.server.ts: Tabelle ${t} fehlt in der Datenauskunft`);
pruefe(auskunft.includes("nichtGelesen"), "auskunft.server.ts: nicht gelesene Bereiche muessen in der Auskunft stehen");

// 8. P2-6 Teil 2: Rechtsgrundlage, Werbewiderspruch, Anonymisieren -- das CRM bewertet nicht, sperrt nur, was die Datenbank einwendet
const datenschutz = await lies("app/routes/contact-auskunft.tsx");
pruefe(datenschutz.includes('rpc("anonymize_contact"') && datenschutz.includes('rpc("contact_anonymization_check"'), "contact-auskunft.tsx: Anonymisieren nicht ueber die Pruefung und Funktion der Datenbank");
pruefe(datenschutz.includes("bestaetigung.toUpperCase() !== String(k.contact_number).toUpperCase()") && datenschutz.includes("if (!grund)"), "contact-auskunft.tsx: Anonymisieren ohne Grund oder ohne eingetippte Kontaktnummer");
pruefe(datenschutz.includes("darfAnonymisieren && !anonymisiert"), "contact-auskunft.tsx: Anonymisieren auch ohne das Recht contact.anonymize sichtbar");
const pruefungSql = await lies("supabase/migrations/20261017100744_kontakt_anonymisieren_pruefung.sql");
pruefe(["legal_hold", "retention_until", "gwg_identifications", "converted_property_id"].every((w) => pruefungSql.includes(w)), "contact_anonymization_check: Sperre bei Frist, Sperrvermerk, Geldwaesche oder umgewandeltem Lead fehlt");
const anonymSql = await lies("supabase/migrations/20261017112525_kontakt_anonymisieren.sql");
pruefe(anonymSql.includes("has_permission('contact.anonymize')") && anonymSql.includes("ANONYMIZE_REASON_REQUIRED") && anonymSql.includes("contact_anonymization_check(p_contact_id)"), "anonymize_contact: ohne Recht, Grund oder Pruefung der Datenbank");
pruefe(anonymSql.includes("converted_property_id is null") && anonymSql.includes("'ANONYMIZE'") && anonymSql.includes("revoke all on function public.anonymize_contact(uuid, text) from public, anon"), "anonymize_contact: umgewandelte Leads, Protokoll oder Sperre fuer anon fehlt");
pruefe(compose.includes("schreiben?.werbewiderspruch") && !/werbewiderspruch[^\n]*(disabled|return null)/i.test(compose), "email-compose.tsx: Werbewiderspruch muss als Hinweis erscheinen, nicht als Sperre");

// 9. P2-7: Objektakte -- jeder Teil laedt nur, was er zeigt, alles in einem parallelen Block
const akte = await lies("app/routes/property-detail.tsx");
const ladeteil = akte.slice(akte.indexOf("export async function loader"), akte.indexOf("export async function action"));
const nurFuer = (tabelle, teile) => new RegExp(`nur\\(\\[${teile.map((t) => `"${t}"`).join(",")}\\],\\(\\)=>supabase\\.from\\("${tabelle}"\\)`).test(ladeteil);
for (const [tabelle, teile] of [["audit_events", ["verlauf"]], ["inquiries", ["record"]], ["viewings", ["record"]], ["property_features", ["objektdaten"]],
  ["property_addresses", ["objektdaten"]], ["property_legal_data", ["record"]], ["brokerage_mandates", ["record"]], ["tasks", ["record"]]])
  pruefe(nurFuer(tabelle, teile), `property-detail.tsx: ${tabelle} nicht nur fuer ${teile.join("/")} geladen`);
pruefe(/from\("inquiries"\)\.select\("id,inquiry_number[^"]*",\{count:"exact"\}\)[^\n]*\.in\("status",OFFEN_ANFRAGE\)/.test(ladeteil) && ladeteil.includes("interessentenZahl:"), "property-detail.tsx: offene Anfragen/Interessenten wieder aus einer gekappten Liste gezaehlt");
pruefe((ladeteil.match(/await Promise\.all\(/g) ?? []).length === 1 && !/\]\);[\s\S]*await supabase/.test(ladeteil), "property-detail.tsx: Abfragen der Akte wieder nacheinander statt in einem Block");

// 10. P2-8: Eine Listenform -- jede volle Liste ist eine Programmtabelle, keine Kartenzeilen
for (const datei of ["properties", "inquiries", "leads", "viewings", "search-profiles", "purchase-offers", "closings", "commissions", "organizations", "case-studies", "referrals", "compliance", "contacts", "mandates", "measurements", "reservations"]) {
  const quelle = await lies(`app/routes/${datei}.tsx`);
  pruefe(quelle.includes('className="programm-tabelle"') && quelle.includes('className="editor-shell programm-liste"'), `${datei}.tsx: volle Liste ist keine Programmtabelle`);
  pruefe(!/className="(data-row data-row-link|inquiry-row|search-profile-row|data-row lead-list-row[^"]*)"/.test(quelle), `${datei}.tsx: wieder Kartenzeilen in der Liste`);
}

// 11. P2-4: Taegliche Automatik -- legt nur Aufgaben und Benachrichtigungen an, dublettensicher, abschaltbar
const automatik = await lies("supabase/migrations/20261019064421_taegliche_automatik.sql") + await lies("supabase/migrations/20261019064739_automatik_suchprofile_rechte.sql");
pruefe(automatik.includes("constraint automation_hits_once unique (rule_key, entity_id, occurrence_key)") && (automatik.match(/on conflict do nothing returning id into neu;/g) ?? []).length >= 6, "Automatik: Regel ohne Dublettensperre");
pruefe(!/update public\.(properties|leads|inquiries|property_reservations|brokerage_mandates|gwg_cases|documents)\s+set/i.test(automatik) && !/net\.http|pg_net|send_mail|smtp/i.test(automatik), "Automatik: darf keinen Status aendern und nichts verschicken");
pruefe(automatik.includes("where active") && (await lies("app/routes/automatik.tsx")).includes('value="schalten"'), "Automatik: Regeln nicht einzeln abschaltbar");
pruefe(automatik.includes("cron.schedule('zeyhermutter-automatik'"), "Automatik: kein Zeitplan");

// 12. Blaettern ueber die Datenbank -- keine volle Liste laedt 500 Zeilen und filtert im Worker
for (const [datei, tabelle] of [["inquiries", "inquiries"], ["leads", "leads"], ["viewings", "viewings"], ["search-profiles", "search_profiles"], ["purchase-offers", "purchase_offers"], ["closings", "sale_closings"], ["commissions", "commissions"], ["organizations", "organizations"]]) {
  const quelle = await lies(`app/routes/${datei}.tsx`);
  const lader = quelle.slice(quelle.indexOf("export async function loader"));
  pruefe(lader.includes("seiteAus(") && /\.range\(from, ?to\)/.test(lader) && (lader.includes('{count:"exact"}') || lader.includes('{ count: "exact" }')), `${datei}.tsx: blaettert nicht ueber die Datenbank`);
  pruefe(lader.includes("seiteZuWeit("), `${datei}.tsx: Seite hinter dem Ende endet mit Fehler 500 statt auf Seite 1`);
  pruefe(!new RegExp(`from\\("${tabelle}"\\)\\.select\\("id,[^"]{40,}"\\)[^;]*\\.limit\\(500\\)`).test(lader) && !lader.includes("gekappt:"), `${datei}.tsx: wieder 500 Zeilen geladen und im Worker gefiltert`);
}

// 13. Aufgabe anlegen sucht Bezuege in der Datenbank statt aus 500 vorab geladenen Datensaetzen
const aufgabenListe = await lies("app/routes/tasks.tsx"), aufgabenDialog = await lies("app/components/task-create-modal.tsx");
pruefe(!aufgabenListe.includes(".limit(500)") && (aufgabenDialog.match(/<DatensatzAuswahl art="(LEAD|PROPERTY|SEARCH_PROFILE|INQUIRY|VIEWING)"/g) ?? []).length === 5 && !aufgabenDialog.includes("<select name=\"lead_id\""), "Aufgabe anlegen: Bezuege wieder aus vorab geladenen Listen");

// 14. Arbeitsplatz: blendet er die Seitenkoepfe aus, traegt der Kopf der Akte die Hauptueberschrift
const arbeitsplatzBaustein = await lies("app/components/arbeitsplatz.tsx");
pruefe(/alsUeberschrift \? <h1 className="arbeitsplatz-kopf-titel">/.test(arbeitsplatzBaustein) && arbeitsplatzBaustein.includes('value={ueberschriftImKopf ?? seitenkopf === "ausblenden"}') && (await lies("app/routes/immobilien-arbeitsplatz.tsx")).includes("ueberschriftImKopf={akteTeil}"), "Arbeitsplatz: ohne Seitenkopf keine h1 im Kopf der Akte");

// 15. Jede Programmliste hat eine Hauptueberschrift (h1) -- sichtbar oder fuer Bildschirmleser
//     (ListenUeberschrift, Text aus app/lib/programmbereiche.ts). Akten im Arbeitsplatz haben sie im Kopf.
{
  const { readdir } = await import("node:fs/promises");
  for (const datei of (await readdir(path.join(WURZEL, "app/routes"))).filter((n) => n.endsWith(".tsx"))) {
    const quelle = await lies(`app/routes/${datei}`);
    if (!/className="(editor-shell programm-liste|calendar-shell kalender-programm|reporting-shell)/.test(quelle)) continue;
    pruefe(quelle.includes("<h1") || quelle.includes("<ListenUeberschrift"), `${datei}: Liste ohne Hauptueberschrift (h1)`);
  }
}

// 16. Jeder modale Dialog haelt den Fokus und gibt ihn zurueck (app/components/dialog-fokus.ts)
{
  const { readdir } = await import("node:fs/promises");
  for (const ordner of ["app/components", "app/routes"]) {
    for (const datei of (await readdir(path.join(WURZEL, ordner))).filter((n) => n.endsWith(".tsx"))) {
      const quelle = await lies(`${ordner}/${datei}`);
      if (!quelle.includes('aria-modal="true"')) continue;
      pruefe(quelle.includes("useDialogFokus("), `${ordner}/${datei}: modaler Dialog ohne useDialogFokus (Fokus laeuft hinaus)`);
    }
  }
}

// 17. Wartezustand beim Absenden fuer alle Formulare des Programms
pruefe((await lies("app/routes/internal-layout.tsx")).includes("<AbsendenWarten />") && (await lies("app/styles.css")).includes('[data-wartet="1"]'), "internal-layout.tsx: Wartezustand beim Absenden fehlt");

if (fehler.length) {
  console.error("P2:\n  " + fehler.join("\n  "));
  process.exit(1);
}
console.log("P2: Ampel in 5 Arbeitsplätzen und 5 Listen (mit Zeichen und Text, eigene Anfrage, kein Falschgelb), Stillstand in Mein Tag (eigene Anfrage, nur echte Aktivität), Datumsgruppen, Strg+K mit Treffern beim Tippen, Suche in der Datenbank ohne stilles Kappen, Aufgaben mit Suche und Seiten, E-Mail mit Vorlage und Exposé samt Objektnachweis (nichts wird automatisch verschickt), Anfragen-Assistent ohne KI mit Dublettenprüfung, Datenauskunft aus allen Kontakt-Tabellen, Rechtsgrundlage und Werbewiderspruch (Hinweis, keine Sperre), Anonymisieren nur mit Recht, Grund, Bestätigung und ohne Einwand der Datenbank, Objektakte lädt je Teil nur, was er zeigt, 16 volle Listen als Programmtabelle, tägliche Automatik nur mit Aufgaben/Benachrichtigungen, dublettensicher und abschaltbar, 8 Listen blättern über die Datenbank, Aufgabe anlegen sucht seine Bezüge, Arbeitsplatz ohne Seitenkopf mit h1, jede Liste mit h1, Dialoge halten den Fokus, Absenden zeigt Warten.");
