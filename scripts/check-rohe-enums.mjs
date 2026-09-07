// Prueft, dass keine rohen Datenbankwerte auf dem Bildschirm landen.
//
// Warum es diese Pruefung gibt
// ----------------------------
// Die Datenbank speichert Zustaende als englische Grossbuchstabenwerte:
// PURCHASE_PRICE_DUE, NOT_APPLICABLE, QUALIFIED_EXCLUSIVE. Fuer die Software
// ist das richtig — solche Werte sind stabil, uebersetzbar und pruefbar. Fuer
// den Menschen davor ist es unlesbar.
//
// Deshalb hat jede Seite Beschriftungstabellen: STATUS[row.status] ?? row.status.
// Bei neuen Seiten ist das wiederholt vergessen worden; es war der haeufigste
// Befund der bisherigen Abnahmen. Die Stelle sieht im Quelltext harmlos aus
// ({d.channel}) und faellt erst auf, wenn jemand die fertige Seite ansieht.
//
// Was geprueft wird
// -----------------
// Ein JSX-Ausdruck, dessen ganzer Inhalt ein Feldzugriff auf eine Spalte mit
// Wertebereich ist — {row.status}, {d.channel}, {m.mandate_type} — ist ein
// Befund. Erlaubt bleibt jede Form, in der der Wert nachschlaegt oder als
// Rueckfall hinter einer Tabelle steht:
//
//   {STATUS[row.status] ?? row.status}   erlaubt
//   {STATUS[row.status]}                 erlaubt
//   {row.status}                         Befund
//
// Die Spaltenliste stammt aus den CHECK-Bedingungen der BETA-Datenbank
// (Stand 07.09.2026, 85 Spalten). Neu hinzugekommene Spalten mit Wertebereich
// gehoeren hier ergaenzt; die Abfrage dafuer steht unten.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

// select distinct (regexp_match(pg_get_constraintdef(oid), '\(?([a-z_]+) = ANY \(ARRAY\['))[1]
// from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace;
const SPALTEN = [
  "acknowledgement_kind", "actor_type", "address_type", "applicability", "area_key", "area_type",
  "audience", "calculation_basis_kind", "calculation_method", "category", "certificate_type",
  "channel", "channel_type", "classification", "client_side", "compliance_status",
  "conclusion_channel", "confidence", "consent_form", "consent_status", "contract_type",
  "customer_feedback_source", "decision", "deletable", "delivery_mode", "deposit_form",
  "document_type", "due_event", "exemption_reason", "financing_status", "from_status",
  "ground_rent_interval", "identification_method", "interest_level", "invoice_status", "key_type",
  "kind", "living_area_basis", "mandate_type", "media_role", "media_type", "meter_type", "method",
  "occasion", "owner_approval_status", "owner_decision", "ownership_structure", "party_role",
  "payment_status", "phase", "power_of_attorney_form", "power_of_attorney_type",
  "preferred_channel", "presentation_form", "price_level", "priority", "property_type",
  "public_address_mode", "regulated_profession", "release_form", "release_scope", "release_status",
  "renewal_mode", "rent_adjustment_type", "response_channel", "retention_category", "risk_level",
  "role", "sale_impact", "scenario_kind", "screening_result", "section", "side", "source", "stage",
  "status", "succession_proof_type", "tenancy_status", "to_status", "transaction_type",
  "value_type", "withdrawal_instruction_form",
];

// Spalten, deren gespeicherter Wert zugleich die richtige Beschriftung ist.
// Sie stehen bewusst nicht in der Liste oben:
//   efficiency_class  — "A+", "B", "C" ist die amtliche Klasse selbst.
//   format            — kollidiert mit dem gleichnamigen Feld von Intl.
//   page_key          — kommt nur in der Verwaltung der Website-Seiten vor.

// Begruendete Ausnahmen: Datei → Ausdruecke, die roh stehen duerfen.
const AUSNAHMEN = {
  // Die Historie zeigt bewusst den technischen Vorgang, damit ein Eintrag im
  // Zweifel mit dem Datenbankprotokoll abgeglichen werden kann.
  "app/routes/audit-history.tsx": ["event.actor_type", "event.source"],
  // Die Quelle eines Vergleichsobjekts ist ein freies Textfeld
  // ("Kaufpreissammlung", "eigene Vermittlung"), kein Wertebereich.
  "app/routes/property-pricing.tsx": ["c.source"],
  // Die Rolle wird hier im Code auf Deutsch gesetzt ("Käufer", "Eigentümer")
  // und stammt nicht aus einer Spalte mit Wertebereich.
  "app/routes/case-study-detail.tsx": ["c.role"],
};

function dateien(ordner, gesammelt = []) {
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) dateien(pfad, gesammelt);
    else if (/\.tsx$/.test(eintrag)) gesammelt.push(pfad.split(sep).join("/"));
  }
  return gesammelt;
}

const AUSDRUCK = new RegExp(
  // { irgendwas.spalte }  — und sonst nichts zwischen den Klammern
  `\\{\\s*([A-Za-z_$][A-Za-z0-9_$]*(?:\\??\\.[A-Za-z_$][A-Za-z0-9_$]*)*\\??\\.(?:${SPALTEN.join("|")}))\\s*\\}`,
  "g",
);

const befunde = [];
for (const datei of dateien("app")) {
  const quelle = readFileSync(datei, "utf8");
  const erlaubt = AUSNAHMEN[datei] ?? [];
  for (const treffer of quelle.matchAll(AUSDRUCK)) {
    const ausdruck = treffer[1];
    if (erlaubt.includes(ausdruck)) continue;
    // Ein Attributwert (foo={row.status}) ist keine Anzeige, sondern ein Wert,
    // der weitergereicht wird. Angezeigt wird nur, was als Kindelement steht.
    const davor = quelle.slice(Math.max(0, treffer.index - 2), treffer.index);
    if (davor.endsWith("=")) continue;
    // Dasselbe gilt fuer den React-Schluessel einer Liste: key={`${a}-${b}`}
    // steht nie auf dem Bildschirm, sondern unterscheidet nur die Eintraege.
    const backtick = quelle.lastIndexOf("`", treffer.index);
    if (backtick !== -1 && quelle.slice(Math.max(0, backtick - 5), backtick) === "key={") continue;
    befunde.push({
      datei,
      zeile: quelle.slice(0, treffer.index).split("\n").length,
      ausdruck,
    });
  }
}

if (befunde.length) {
  console.error(`\nRohe Datenbankwerte in der Anzeige: ${befunde.length} Befund${befunde.length === 1 ? "" : "e"}\n`);
  for (const b of befunde) console.error(`  ${b.datei}:${b.zeile}  {${b.ausdruck}}`);
  console.error(`
So wird daraus eine lesbare Anzeige:

  const STATUS: Record<string, string> = { OPEN: "Offen", DONE: "Erledigt" };
  …
  {STATUS[row.status] ?? row.status}

Steht der rohe Wert an einer Stelle absichtlich, wird sie in
scripts/check-rohe-enums.mjs unter AUSNAHMEN eingetragen — mit Begruendung.
`);
  process.exit(1);
}

console.log("Rohe Datenbankwerte: keine gefunden.");
