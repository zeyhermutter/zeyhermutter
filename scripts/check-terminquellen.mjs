#!/usr/bin/env node
// Bewacht, dass jeder Zeitpunkt der Datenbank im Kalender ankommt -- oder
// dass jemand ausdruecklich entschieden hat, dass er es nicht soll.
//
// WIE DAS AUFKAM
//
// Sebastian hat am 08.10.2026 gefragt: "werden alle Termine, auch Aufmass, im
// Kalender hinterlegt?" Die Antwort war nein: vier Zeitpunkte standen in der
// Datenbank und in keiner Agenda. Diese Pruefung entstand daraufhin -- und
// liess noch am selben Tag den naechsten Fehler durch.
//
// WAS AN DER ERSTEN FASSUNG FALSCH WAR
//
// 1. Sie prüfte `seite.includes(feld)`: steht das Feld irgendwo in
//    app/routes/calendar.tsx, gilt es als abgefragt. Die neue Quelle
//    sale_projects.follow_up_at war damit erfuellt -- durch die Abfrage auf
//    leads.follow_up_at, einer voellig anderen Tabelle. Dass sale_projects
//    .follow_up_at von keiner Stelle der Anwendung je geschrieben wird und
//    die Kategorie "P" deshalb dauerhaft leer blieb, fiel der Pruefung nicht
//    auf. Jetzt wird im Abfrageblock *dieser* Tabelle gesucht.
//
// 2. Im Kopf stand "Unten steht JEDE Zeitpunktspalte der Datenbank". Das war
//    unwahr: die Abfrage, aus der die Liste stammte, filterte auf
//    `timestamp with time zone`. Alle Datumsspalten fehlten strukturell --
//    darunter sale_projects.next_step_due_on, also genau das Feld, das am
//    Verkaufsprojekt wirklich gepflegt wird. Jetzt stehen beide Typen drin,
//    159 Spalten.
//
// Eine Pruefung, die eine Zeichenkette irgendwo in einer Datei sucht, prueft
// nichts. Sie gibt nur gruenes Licht.
//
// WAS DIESE PRUEFUNG LEISTET
//
// Unten steht jede Spalte vom Typ date oder timestamptz, ohne die reinen
// Protokollspalten (created_at, updated_at, archived_at und Verwandte). Jede
// traegt genau eine Einstufung:
//
//   kategorie     Sie ist eine Kalenderquelle. Wird nachgeprueft.
//   grund         Sie gehoert nicht in den Kalender, mit Begruendung im Text.
//   rueckschau    Sie haelt fest, wann etwas geschehen ist. Rueckschau ist
//                 kein Termin.
//   zeitraum      Beginn oder Ende einer Gueltigkeit -- Vertrag, Reservierung,
//                 Mietverhaeltnis. Gehoert in die Akte, nicht in die Agenda.
//   frist         Ein Datum in der Zukunft, an dem etwas faellig ist, fuer das
//                 es bisher keine Uebersicht gibt. Diese Pruefung zaehlt sie
//                 bei jedem Lauf auf, damit sie nicht in Vergessenheit
//                 geraten -- sie laesst den Lauf aber durch, weil es eine
//                 fachliche Entscheidung ist, ob Fristen in den Kalender
//                 gehoeren oder in eine eigene Fristenuebersicht.
//
// Die Liste stammt aus der BETA-Datenbank, Stand 08.10.2026. Zum Erneuern:
//
//   select table_name || '.' || column_name, data_type
//   from information_schema.columns
//   where table_schema='public' and data_type in ('date','timestamp with time zone')
//     and column_name not in ('created_at','updated_at','archived_at','read_at',
//       'occurred_at','deleted_at','last_sign_in_at','consent_given_at','consent_at',
//       'sent_at','locked_at','expires_at')
//   order by 1;
//
// Was sie nicht leisten kann: eine ganz neue Spalte, die niemand hier
// eintraegt, faellt ihr nicht auf. Die Mindestzahl unten macht wenigstens das
// Schrumpfen der Liste unmoeglich.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));

/** Mindestzahl erfasster Spalten. Schuetzt davor, dass die Liste schrumpft. */
const MINDESTENS = 159;

const ZEITPUNKTE = {
  "acquisition_campaigns.ends_on": { zeitraum: true },
  "acquisition_campaigns.starts_on": { zeitraum: true },
  "acquisition_waves.sent_on": { rueckschau: true },
  "brokerage_mandate_clients.signed_on": { rueckschau: true },
  "brokerage_mandates.actual_end_on": { rueckschau: true },
  "brokerage_mandates.client_share_payment_proof_on": { rueckschau: true },
  "brokerage_mandates.concluded_on": { rueckschau: true },
  "brokerage_mandates.early_start_requested_on": { rueckschau: true },
  "brokerage_mandates.term_end": { zeitraum: true },
  "brokerage_mandates.term_start": { zeitraum: true },
  "brokerage_mandates.terminated_on": { rueckschau: true },
  "brokerage_mandates.withdrawal_deadline_on": { frist: true },
  "brokerage_mandates.withdrawal_instruction_given_on": { rueckschau: true },
  "brokerage_mandates.withdrawn_on": { rueckschau: true },
  "commissions.due_date": { frist: true },
  "commissions.paid_at": { rueckschau: true },
  "contact_organization_relationships.valid_from": { zeitraum: true },
  "contact_organization_relationships.valid_until": { zeitraum: true },
  "contact_relationships.valid_from": { zeitraum: true },
  "contact_relationships.valid_until": { zeitraum: true },
  "contacts.birth_date": { grund: "Geburtsdatum einer Person. Ein Stammdatum, kein Termin; eine Geburtstagsliste ist etwas anderes als eine Terminagenda." },
  "document_versions.uploaded_at": { rueckschau: true },
  "documents.deletion_eligible_at": { frist: true },
  "documents.retention_until": { frist: true },
  "energy_certificate_presentations.presented_on": { rueckschau: true },
  "gwg_cases.non_cash_payment_evidence_on": { rueckschau: true },
  "gwg_cases.report_filed_on": { rueckschau: true },
  "gwg_cases.retention_until": { frist: true },
  "gwg_cases.risk_assessed_on": { rueckschau: true },
  "gwg_cases.risk_next_review_on": { frist: true },
  "gwg_cases.source_of_funds_documented_on": { rueckschau: true },
  "gwg_cases.suspicious_indication_reviewed_on": { rueckschau: true },
  "gwg_cases.transparency_register_checked_on": { rueckschau: true },
  "gwg_identifications.birth_date": { grund: "Geburtsdatum aus dem Ausweis, erfasst zur Identifizierung. Stammdatum." },
  "gwg_identifications.document_valid_until": { frist: true },
  "gwg_identifications.identified_on": { rueckschau: true },
  "gwg_identifications.screening_done_on": { rueckschau: true },
  "inquiries.answered_at": { rueckschau: true },
  "inquiries.received_at": { rueckschau: true },
  "lead_acquisitions.response_on": { rueckschau: true },
  "lead_sales_readiness_checks.finalized_at": { rueckschau: true },
  "lead_sales_readiness_checks.inspection_at": { kategorie: "READINESS_INSPECTION" },
  "lead_sales_readiness_checks.owner_decision_at": { rueckschau: true },
  "lead_sales_readiness_measures.completed_at": { rueckschau: true },
  "lead_sales_readiness_measures.owner_approval_at": { rueckschau: true },
  "lead_sales_readiness_measures.planned_end_date": { frist: true },
  "lead_sales_readiness_measures.planned_start_date": { frist: true },
  "lead_sales_readiness_measures.target_date": { frist: true },
  "lead_sales_readiness_media.marketing_approved_at": { rueckschau: true },
  "leads.converted_at": { rueckschau: true },
  "leads.follow_up_at": { kategorie: "LEAD_FOLLOWUP" },
  "leads.offer_created_at": { rueckschau: true },
  "leads.valuation_appointment_at": { kategorie: "LEAD_VALUATION" },
  "measurement_orders.appointment_at": { kategorie: "MEASUREMENT" },
  "measurement_orders.delivered_on": { rueckschau: true },
  "measurement_orders.invoiced_on": { rueckschau: true },
  "measurement_orders.measured_on": { rueckschau: true },
  "measurement_orders.paid_on": { rueckschau: true },
  "measurement_orders.requested_on": { rueckschau: true },
  "partner_profiles.compliance_reviewed_on": { rueckschau: true },
  "partner_profiles.last_order_on": { rueckschau: true },
  "partner_referral_fees.agreed_on": { rueckschau: true },
  "properties.available_from": { zeitraum: true },
  "property_disclosures.acknowledged_at": { rueckschau: true },
  "property_disclosures.disclosed_at": { rueckschau: true },
  "property_disclosures.prior_knowledge_on": { rueckschau: true },
  "property_disposition_parties.consent_on": { rueckschau: true },
  "property_disposition_parties.court_approval_applied_on": { rueckschau: true },
  "property_disposition_parties.court_approval_granted_on": { rueckschau: true },
  "property_disposition_parties.power_of_attorney_revoked_on": { rueckschau: true },
  "property_disposition_parties.power_of_attorney_valid_until": { zeitraum: true },
  "property_dispositions.date_of_death": { grund: "Sterbedatum im Erbfall. Ein Stammdatum der Akte." },
  "property_dispositions.land_register_corrected_on": { rueckschau: true },
  "property_dispositions.reviewed_on": { rueckschau: true },
  "property_dispositions.spousal_consent_given_on": { rueckschau: true },
  "property_dispositions.succession_proof_applied_on": { rueckschau: true },
  "property_dispositions.succession_proof_issued_on": { rueckschau: true },
  "property_document_requirements.checked_on": { rueckschau: true },
  "property_document_requirements.received_on": { rueckschau: true },
  "property_document_requirements.requested_on": { rueckschau: true },
  "property_document_requirements.valid_until": { frist: true },
  "property_encumbrances.deleted_on": { rueckschau: true },
  "property_encumbrances.registered_on": { rueckschau: true },
  "property_energy_data.certificate_issued_on": { rueckschau: true },
  "property_energy_data.exemption_confirmed_on": { rueckschau: true },
  "property_energy_data.valid_until": { frist: true },
  "property_exposes.approved_at": { rueckschau: true },
  "property_exposes.generated_at": { rueckschau: true },
  "property_exposes.released_at": { rueckschau: true },
  "property_hoa_data.fee_reference_month": { grund: "Der Monat, auf den sich das Hausgeld bezieht. Ein Bezug, kein Zeitpunkt." },
  "property_hoa_data.maintenance_reserve_date": { rueckschau: true },
  "property_hoa_data.manager_contract_until": { zeitraum: true },
  "property_hoa_special_levies.due_on": { frist: true },
  "property_hoa_special_levies.resolved_on": { rueckschau: true },
  "property_legal_data.extract_dated_on": { rueckschau: true },
  "property_legal_data.ground_lease_until": { zeitraum: true },
  "property_legal_data.reviewed_on": { rueckschau: true },
  "property_marketing_checklist_items.completed_at": { rueckschau: true },
  "property_marketing_placements.ended_at": { rueckschau: true },
  "property_marketing_placements.last_verified_at": { rueckschau: true },
  "property_marketing_placements.live_at": { rueckschau: true },
  "property_marketing_placements.paused_at": { rueckschau: true },
  "property_marketing_placements.planned_go_live_at": { grund: "Geplanter Zeitpunkt, zu dem eine Anzeige online gehen soll. Niemand faehrt dorthin; der Stand steht in der Vermarktungsakte." },
  "property_owners.valid_from": { zeitraum: true },
  "property_owners.valid_until": { zeitraum: true },
  "property_price_stages.effective_from": { zeitraum: true },
  "property_publication_versions.approved_at": { rueckschau: true },
  "property_publication_versions.published_at": { rueckschau: true },
  "property_publications.content_review_confirmed_at": { rueckschau: true },
  "property_reservations.ended_on": { rueckschau: true },
  "property_reservations.reserved_from": { zeitraum: true },
  "property_reservations.reserved_until": { zeitraum: true },
  "property_tenancies.contract_date": { rueckschau: true },
  "property_tenancies.conversion_blocking_until": { zeitraum: true },
  "property_tenancies.ended_on": { rueckschau: true },
  "property_tenancies.ends_on": { zeitraum: true },
  "property_tenancies.starts_on": { zeitraum: true },
  "property_tenancies.termination_waiver_until": { zeitraum: true },
  "property_valuation_comparables.reference_date": { grund: "Stichtag eines Vergleichswerts. Rechengroesse der Bewertung." },
  "property_valuations.land_reference_date": { grund: "Stichtag des Bodenrichtwerts. Rechengroesse der Bewertung." },
  "property_valuations.valued_on": { rueckschau: true },
  "public_form_rate_limits.window_start": { grund: "Beginn des Zeitfensters der Einsendebremse. Technik, kein Termin." },
  "purchase_offers.submitted_at": { rueckschau: true },
  "purchase_offers.valid_until": { frist: true },
  "referrals.acknowledged_on": { rueckschau: true },
  "referrals.received_on": { rueckschau: true },
  "sale_case_studies.customer_feedback_on": { rueckschau: true },
  "sale_case_studies.release_decided_on": { rueckschau: true },
  "sale_case_studies.release_requested_on": { rueckschau: true },
  "sale_case_studies.website_published_at": { rueckschau: true },
  "sale_closing_milestones.completed_on": { rueckschau: true },
  "sale_closing_milestones.deadline_on": { frist: true },
  "sale_closing_milestones.initiated_on": { rueckschau: true },
  "sale_closings.completed_date": { rueckschau: true },
  "sale_closings.draft_received_date": { rueckschau: true },
  "sale_closings.handover_date": { grund: "Das im Vertrag vereinbarte Uebergabedatum. Der Termin, zu dem jemand hinfaehrt, steht am Uebergabeprotokoll (sale_handover_protocols.handover_at) und ist die Kalenderquelle. Zwei Eintraege waeren eine Dublette." },
  "sale_closings.notarized_date": { rueckschau: true },
  "sale_closings.notary_appointment_at": { kategorie: "CLOSING_NOTARY" },
  "sale_closings.notary_instruction_date": { rueckschau: true },
  "sale_closings.purchase_price_due_date": { frist: true },
  "sale_closings.purchase_price_paid_date": { rueckschau: true },
  "sale_handover_meters.read_on": { rueckschau: true },
  "sale_handover_protocols.buyer_confirmed_at": { rueckschau: true },
  "sale_handover_protocols.handover_at": { kategorie: "HANDOVER" },
  "sale_handover_protocols.seller_confirmed_at": { rueckschau: true },
  "sale_projects.follow_up_at": { grund: "Steht seit der Gruendungsmigration in der Tabelle und wird von keiner Stelle der Anwendung geschrieben. Gepflegt wird der naechste Schritt mit next_step_due_on, und das ist die Kalenderquelle. Diese Spalte ist tot -- sie zu lesen hiesse, eine leere Kategorie anzuzeigen." },
  "sale_projects.next_step_due_on": { kategorie: "PROJECT_FOLLOWUP" },
  "sale_projects.target_marketing_start": { zeitraum: true },
  "search_profile_property_decisions.decided_at": { rueckschau: true },
  "search_profiles.move_in_from": { zeitraum: true },
  "tasks.completed_at": { rueckschau: true },
  "tasks.due_at": { kategorie: "TASK" },
  "training_settings.period_start": { zeitraum: true },
  "user_roles.assigned_at": { rueckschau: true },
  "user_roles.revoked_at": { rueckschau: true },
  "user_training_records.completed_on": { rueckschau: true },
  "viewings.ends_at": { grund: "Das Ende derselben Besichtigung. Es steht als Endzeit an ihrem Termin und waere als eigener Eintrag eine Dublette." },
  "viewings.starts_at": { kategorie: "VIEWING" },
  "website_page_versions.published_at": { rueckschau: true },
};

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const kategorien = await lies("app/lib/terminkategorien.ts");
const seite = await lies("app/routes/calendar.tsx");

const beschrieben = [...kategorien.matchAll(/schluessel:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
pruefe(beschrieben.length > 0,
  "In app/lib/terminkategorien.ts liess sich keine Kategorie lesen.\n"
  + "  Entweder ist die Liste leer, oder ihre Form hat sich geaendert.");

/**
 * Der Abfrageblock einer Tabelle in calendar.tsx: von `.from("tabelle")` bis
 * zum Semikolon, das die Abfrage abschliesst.
 *
 * Genau hier lag der Fehler der ersten Fassung. Wer nur fragt, ob das Feld
 * irgendwo in der Datei steht, bekommt ein Ja von jeder gleichnamigen Spalte
 * einer anderen Tabelle.
 */
function abfrageblocke(tabelle) {
  const blocke = [];
  let suchen = 0;
  for (;;) {
    const anfang = seite.indexOf(`.from("${tabelle}")`, suchen);
    if (anfang < 0) break;
    const ende = seite.indexOf(";", anfang);
    blocke.push(ende < 0 ? seite.slice(anfang) : seite.slice(anfang, ende));
    suchen = ende < 0 ? seite.length : ende;
  }
  return blocke;
}

// --- 1. Jede Kalenderspalte wird auch wirklich abgefragt -----------------

for (const [spalte, eintrag] of Object.entries(ZEITPUNKTE)) {
  if (!eintrag.kategorie) continue;
  const [tabelle, feld] = spalte.split(".");
  const blocke = abfrageblocke(tabelle);
  pruefe(blocke.length > 0,
    `${spalte} soll als ${eintrag.kategorie} im Kalender stehen, aber\n`
    + `  app/routes/calendar.tsx fragt die Tabelle ${tabelle} gar nicht ab.`);
  if (blocke.length === 0) continue;
  // Dieselbe Tabelle kann mehrfach abgefragt werden -- leads einmal fuer die
  // Wiedervorlage und einmal fuer den Eigentuemertermin. Es genuegt, wenn
  // einer dieser Bloecke das Feld liest.
  pruefe(blocke.some((block) => block.includes(feld)),
    `${spalte} soll als ${eintrag.kategorie} im Kalender stehen, aber im\n`
    + `  ${blocke.length === 1 ? "Abfrageblock" : `einzigen ${blocke.length} Abfrageblöcken`} von ${tabelle} kommt das Feld ${feld} nicht vor.\n`
    + "  (Ein Treffer anderswo in der Datei zaehlt nicht -- genau so ist\n"
    + "  sale_projects.follow_up_at am 08.10.2026 durchgerutscht.)");

  // Dass das Feld im Block vorkommt, heisst noch nicht, dass die Abfrage es
  // benutzt. `.select("...,next_step_due_on,...")` zusammen mit
  // `.not("follow_up_at", "is", null)` liest die richtige Spalte und siebt
  // nach der falschen: das Ergebnis ist leer, und die Kategorie bleibt es
  // auch. Ein Monatskalender grenzt den Zeitraum ein und sortiert -- beides
  // muss an derselben Spalte haengen, die hier als Quelle steht.
  const nachFeld = blocke.filter((block) =>
    new RegExp(`\\.gte\\("${feld}"`).test(block)
    && new RegExp(`\\.lt\\("${feld}"`).test(block)
    && new RegExp(`\\.order\\("${feld}"`).test(block));
  pruefe(nachFeld.length > 0,
    `${spalte} steht als Quelle von ${eintrag.kategorie}, aber kein Abfrageblock\n`
    + `  von ${tabelle} grenzt den Monat an ${feld} ein und sortiert danach.\n`
    + "  Erwartet werden .gte(\"" + feld + "\", ...), .lt(\"" + feld + "\", ...)\n"
    + `  und .order("${feld}", ...) im selben Block. Ohne das liest die Abfrage\n`
    + "  die eine Spalte und siebt nach einer anderen -- ein Kalender, der\n"
    + "  jeden Monat leer bleibt oder jeden Eintrag zeigt.");
  pruefe(new RegExp(`kind:\\s*"${eintrag.kategorie}"`).test(seite),
    `Der Ladeteil legt keinen Termin mit kind: "${eintrag.kategorie}" an.\n`
    + `  Die Quelle ${spalte} erzeugt damit keinen Eintrag.`);
}

// --- 2. Jede Kategorie hat genau eine Quelle ----------------------------

for (const kategorie of beschrieben) {
  const quellen = Object.entries(ZEITPUNKTE).filter(([, e]) => e.kategorie === kategorie).map(([s]) => s);
  pruefe(quellen.length === 1,
    `Die Kategorie ${kategorie} hat ${quellen.length} Quellspalten${quellen.length ? ` (${quellen.join(", ")})` : ""}.\n`
    + "  Jede Kategorie steht fuer genau einen Zeitpunkt in der Datenbank. Ohne\n"
    + "  Quelle ist sie eine Zeile in der Legende, die nie etwas beschriftet.");
}
for (const [spalte, eintrag] of Object.entries(ZEITPUNKTE)) {
  if (!eintrag.kategorie) continue;
  pruefe(beschrieben.includes(eintrag.kategorie),
    `${spalte} nennt die Kategorie ${eintrag.kategorie}, die es in\n`
    + "  app/lib/terminkategorien.ts nicht gibt.");
}

// --- 3. Jede Spalte traegt genau eine Einstufung ------------------------

for (const [spalte, eintrag] of Object.entries(ZEITPUNKTE)) {
  const anzahl = [eintrag.kategorie, eintrag.grund, eintrag.rueckschau, eintrag.zeitraum, eintrag.frist]
    .filter(Boolean).length;
  pruefe(anzahl === 1,
    `${spalte} traegt ${anzahl} Einstufungen -- genau eine ist richtig:\n`
    + "  kategorie, grund, rueckschau, zeitraum oder frist.");
  if (eintrag.grund) {
    pruefe(eintrag.grund.length >= 40,
      `Die Begruendung bei ${spalte} ist zu knapp ("${eintrag.grund}").\n`
      + "  Eine Auslassung, die man in einem Jahr nicht mehr versteht, wird\n"
      + "  beim naechsten Mal einfach uebernommen.");
  }
}

// --- 4. Die Liste darf nicht schrumpfen ---------------------------------

const erfasst = Object.keys(ZEITPUNKTE).length;
pruefe(erfasst >= MINDESTENS,
  `Erfasst sind ${erfasst} Spalten, erwartet waren mindestens ${MINDESTENS}.\n`
  + "  Es wurde etwas aus der Liste entfernt. Eine Spalte verschwindet nur,\n"
  + "  wenn die Tabelle verschwindet -- dann gehoert die Mindestzahl angepasst.");

// --- Ergebnis -------------------------------------------------------------

const zaehle = (schluessel) => Object.values(ZEITPUNKTE).filter((e) => e[schluessel]).length;
const fristen = Object.entries(ZEITPUNKTE).filter(([, e]) => e.frist).map(([s]) => s);

if (fehler.length > 0) {
  console.error(`\nTerminquellen: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Terminquellen: ${erfasst} Zeitpunktspalten erfasst -- ${zaehle("kategorie")} im Kalender, `
  + `${zaehle("grund")} begruendet ausgenommen, ${zaehle("rueckschau")} Rueckschau, `
  + `${zaehle("zeitraum")} Gueltigkeitszeitraum, ${fristen.length} offene Fristen.`);
console.log(`  Offene Fristen ohne eigene Uebersicht (fachlich zu entscheiden, ob sie in den Kalender gehoeren):`);
for (const spalte of fristen) console.log(`    ${spalte}`);
