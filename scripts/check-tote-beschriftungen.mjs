// Prueft, dass Beschriftungstabellen keine Werte beschriften, die es nicht
// gibt.
//
// Warum es diese Pruefung gibt
// ----------------------------
// Eine Tabelle wie
//
//   const OWNER_DECISION = { OPEN:"Entscheidung offen", ACCEPTED:"…",
//                            PARTIALLY_ACCEPTED:"…", DECLINED:"…" };
//   …
//   {OWNER_DECISION[check.owner_decision] ?? check.owner_decision}
//
// sieht im Quelltext vollkommen richtig aus. Die Spalte owner_decision laesst
// aber nur OPEN, AS_IS_SALE, RECOMMENDED_PREPARATION, EXTENDED_RENOVATION,
// INDIVIDUAL_MEASURES, POSTPONED und NO_SALE zu. Drei der vier Schluessel
// treffen also nie — und sobald ein Eigentuemer etwas anderes als "offen"
// entscheidet, steht AS_IS_SALE auf dem Bildschirm.
//
// Gefunden am 08.09.2026 in der Projektakte und in der
// Verkaufsstrategie-Uebersicht. Es war unsichtbar, weil auf BETA noch keine
// Entscheidung erfasst war.
//
// Was geprueft wird
// -----------------
// Jeder Schluessel einer Record<string,string>-Tabelle in Grossbuchstaben muss
// in mindestens einer CHECK-Bedingung der Datenbank vorkommen. Schluessel, die
// nirgends vorkommen, sind tot: entweder ein Tippfehler oder ein Rest aus einer
// frueheren Fassung der Fachlogik.
//
// Die Werteliste stammt aus der BETA-Datenbank, Stand 08.09.2026. Kommen neue
// Werte hinzu, gehoert sie ergaenzt; die Abfrage steht unten.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

// select distinct btrim(regexp_replace(x,'::text','','g'),' ''')
// from pg_constraint, lateral regexp_split_to_table(
//   (regexp_match(pg_get_constraintdef(oid),'= ANY \(ARRAY\[(.*?)\]\)'))[1], ',\s*') as x
// where contype='c' and connamespace='public'::regnamespace;
const ERLAUBT = new Set(`A A+ ACCEPTED ACCESS ACQUISITION ACTIVE AFTER AGREED ANNUAL ANNUITY_CHARGE
ANONYMIZED_ONLY APARTMENT APARTMENT_BUILDING API APPOINTMENT
APPOINTMENT_SCHEDULED APPROVED ARCHIVED AS_IS AS_IS_SALE ASSET ATTIC
ATTORNEY_IN_FACT AUDITOR AUTOMATIC AUTOMATION B BANK_GUARANTEE BASEMENT BEFORE
BENEFICIAL_OWNER BLENDED BLOCKED BOOLEAN BOTH BROKERAGE_AGREEMENT
BUILDING_DOCUMENTS BUILDING_ENCUMBRANCE BUILDING_ENCUMBRANCE_REGISTER BUSINESS
BUSINESS_PLAN BUY BUYER C CADASTRAL_MAP CALL CANCELLED CASH
CERTIFICATE_OF_INHERITANCE CERTIFIED CHECKED CHILDREN_PLAYGROUND CITY
CITY_ONLY CLEANING CLEARANCE_DISPOSAL CLOSED CO_HEIR COMMERCIAL
COMMISSION_POSSIBLE COMMISSIONED COMMUNITY_OF_HEIRS COMPARATIVE COMPLETED
CONFIDENTIAL CONFIRMED CONSULTATION CONSUMPTION CONTACT CONTACTED
CONTAMINATION_REGISTER CONTRACT CONTRACT_CONCLUSION CONTRACT_PENDING CONVERTED
COOPERATION_ONLY COPY_HANDED CORRESPONDENCE COUNTERED COVER CURRENT_STATE D
DECLARATION_OF_DIVISION DECLINED DEMAND DEMOLITION_PLANNED DETACHED_HOUSE
DETAIL DEVELOPMENT DIN_277 DIRECT DISABLED DISMISSED DISTANCE_AREA DISTRICT
DISTRICT_ONLY DOCUMENTS DONE DRAFT DRAFT_RECEIVED DUE DURING E ELECTRICITY
ELECTRONIC EMAIL EMAIL_REPLY ENDED ENERGY_CERTIFICATE ERROR ESTIMATED
EUROPEAN_CERTIFICATE EVENT EVIDENCE EXCLUSIVE EXECUTOR EXPECTED EXPIRED EXPORT
EXPOSE EXPOSE_EMAIL EXTENDED_MEASURES EXTENDED_RENOVATION F FAILED FEE
FINALIZED FINANCIAL FINANCING_CONFIRMATION FIXED FIXED_TERM FLOOR_PLAN
FLOORING_PARQUET FRACTIONAL FULFILLED FULL FURNITURE_STYLING G GALLERY GARAGE
GARDEN_EXTERIOR GAS GATE GENERAL GENERATED GIFT GIVEN GRANTED
GUARDIANSHIP_PROOF GWG_IDENTIFICATION H HANDED_OVER HANDOVER
HANDOVER_COMPLETED HANDOVER_PROTOCOL HEAT HERITABLE_BUILDING_RIGHT HIDDEN HIGH
HOME HOUSE_DOOR ID_CARD IDENTIFIABLE IDENTITY_PROOF IMAGE IMPORT IMPRINT
IN_PERSON IN_PROGRESS INACTIVE INCOME INDEX INDIVIDUAL_MEASURES
INSOLVENCY_NOTE INSURANCE INTERESTED INTERNAL INVITED INVOICE INVOICED ISSUED
LAND LAND_CHARGE LAND_REGISTER LAND_REGISTER_II LAND_REGISTER_III LAWYER LEAD
LEAD_CREATED LEGAL_CAPACITY LEGAL_GUARDIAN LEGAL_REVIEW_REQUIRED LETTER LIVE
LIVING_AREA_CALCULATION LOCKED LOST LOW MAILBOX MAISONETTE MANDATE MANUAL
MARITAL_COMMUNITY MARKET_ESTIMATE MARKETING MATCH MEASURE_DOCUMENTATION
MEASURE_EVIDENCE MEDIUM MIGRATION MINOR_REPAIRS MINUTES MISSING MOBILE MONTHLY
MONUMENT_PROTECTION MORTGAGE MUST_BE_DELETED NEW NO NO_COMMISSION NO_MATCH
NO_SALE NO_SHOW NONE NORMAL NOT_APPLICABLE NOT_ISSUED NOT_RECOMMENDED
NOT_REGULARLY_HEATED NOT_REQUESTED NOT_REQUIRED NOTARIAL
NOTARIAL_PURCHASE_PRICE NOTARIAL_WILL NOTARIZATION NOTARIZED NOTARY
NOTARY_INSTRUCTED NUMBER NURTURE OFFER OFFICE ON_HOLD ONLINE_LIVE OPEN
OPTIONAL OTHER OTHER_REGULATED OUTDATED OWN_WEBSITE OWNER OWNER_OCCUPIED
OWNER_TALK PAID PAINTING PARKING PARKING_SPACE PARTIALLY_PAID PARTIALLY_RENTED
PASSPORT PAUSED PENDING PENTHOUSE PERCENT PHONE PHOTO_PREPARATION PHOTOS
PLANNED PORTAL PORTAL_LOG POSSIBLE_MATCH POSTAL POSTPONED POWER_OF_ATTORNEY
PRE_EMPTION_RIGHT PRECAUTIONARY PREPARATION PRESENT PRIMARY PRINT
PRIORITY_NOTICE PRIVACY PRIVATE PRIVATE_WRITTEN PROPERTY PROPERTY_DISCLOSURE
PROPOSED PUBLIC PUBLISHABLE PUBLISHED PURCHASE_PRICE PURCHASE_PRICE_DUE
PURCHASE_PRICE_PAID PURCHASE_PRICE_RELEVANT QR_CODE QUALIFIED
QUALIFIED_EXCLUSIVE QUARTER QUARTERLY QUOTE_RECEIVED QUOTE_REQUESTED
QUOTE_REQUIRED READ_RECEIPT READINESS_CHECK READY READY_FOR_REVIEW REAL_CHARGE
REALLOCATION_NOTE RECOMMENDED RECOMMENDED_PREPARATION REDEVELOPMENT_NOTE
REFERRAL REFUSED REGION REJECTED RELEASED RENT RENTED REPLACED REPRESENTATIVE
REQUESTED REQUIRED RESERVATION_AGREEMENT RESERVED RESIDENCE_PERMIT
RESIDENCE_RIGHT RESOLUTION_COLLECTION RESOLVED RETAIL REVIEW RIGHT_OF_WAY
RUNNING SALE SAVINGS_ACCOUNT SELF_STUDY SELLER SEMI_DETACHED_HOUSE SENT
SERVICE_CHARGE_STATEMENT SIGNATURE SIMPLE SMALL_BUILDING SOCIAL SOLD SOLE
SPOUSE STAGED STREET_ONLY SUBMITTED SUBSIDISED SUCCESSION_PROOF SUGGESTED
SUPPLEMENTARY_CURATOR SURVEY SYSTEM TAX_ADVISOR TENANCY_AGREEMENT TERMINATED
TERRACED_HOUSE TEXT TEXT_FORM THANK_YOU_NOTE TO_CHECK TODO TRAINING
TRAINING_CERTIFICATE TRANSFERS_TO_BUYER UNCLEAR UNION UNKNOWN UNLIMITED
UNPUBLISHED UNSUITABLE URGENT URGENTLY_RECOMMENDED USER USUFRUCT
UTILITY_EASEMENT UTILITY_ROOM VACANT VALUATION VERBAL VIDEO VIEWED VIEWING
VIEWING_PLANNED VIEWING_REQUESTED WAITING_OWNER WAIVED WALK_IN WATER_COLD
WATER_HOT WEB_FORM WEBSITE WEG WINDOW WITHDRAWAL_INSTRUCTION WITHDRAWN WOFLV
WON WRITTEN YES`.split(/\s+/).filter(Boolean));

// Ganze Tabellen, deren Schluessel nicht aus einer CHECK-Bedingung stammen.
// Sie beschriften etwas, das die Anwendung selbst bildet — dort kann diese
// Pruefung nichts aussagen.
const AUSNAHMEN = {
  // Organisationsrollen: feste Auswahl in der Maske, freier Text in der Spalte.
  "app/lib/labels.ts": ["ORGANISATIONSROLLE", "CHECKLISTENKATEGORIE"],
  "app/routes/contact-associations.tsx": ["ORG_ROLE"],
  // Kategorien der Vermarktungscheckliste: gesetzt beim Anlegen der Akte,
  // ohne CHECK-Bedingung.
  "app/routes/property-detail.tsx": ["CHECKLIST_CATEGORY"],
  // Schluessel der Nachbetreuungsschritte, aus den Vorlagen der Verwaltung.
  "app/routes/after-sales.tsx": ["STEP_KEY"],
  // Vorgangsart und Bereich einer Protokollzeile: von den Triggern gesetzt.
  "app/routes/audit-history.tsx": ["FIELD_LABELS", "ACTION_LABELS"],
  // Schluessel der Abschlussmeilensteine, aus der Seed-Funktion.
  "app/routes/closing-milestones.tsx": ["MILESTONE_HINT"],
  // Grund einer Dublettenwarnung, in der Route selbst berechnet.
  "app/routes/contact-new.tsx": ["reasonLabel"],
  // Trefferart der globalen Suche, in der Route selbst gebildet.
  "app/routes/crm-search.tsx": ["LABELS"],
  // Antwortstand einer Anfrage: aus Fristen berechnet, nicht gespeichert.
  "app/routes/inquiries.tsx": ["RESPONSE_STATE", "RESPONSE_STATE_CLASS"],
  // Bereich eines Projekthindernisses, in der Route berechnet.
  "app/routes/projects.tsx": ["BLOCKER_AREA"],
};

function dateien(ordner, gesammelt = []) {
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) dateien(pfad, gesammelt);
    else if (/\.tsx?$/.test(eintrag)) gesammelt.push(pfad.split(sep).join("/"));
  }
  return gesammelt;
}

const befunde = [];
for (const datei of dateien("app")) {
  const quelle = readFileSync(datei, "utf8");
  const erlaubteTabellen = AUSNAHMEN[datei] ?? [];
  const re = /(?:export\s+)?const\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(?:Record<\s*string\s*,\s*string\s*>|Beschriftungen)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(quelle))) {
    let i = re.lastIndex - 1, klammern = 0, j = i;
    for (; j < quelle.length; j++) {
      if (quelle[j] === "{") klammern++;
      else if (quelle[j] === "}") { klammern--; if (klammern === 0) { j++; break; } }
    }
    if (erlaubteTabellen.includes(m[1])) continue;
    const rumpf = quelle.slice(i, j);
    const tot = [];
    for (const e of rumpf.matchAll(/(?:^|[{,\s])([A-Z][A-Z0-9_]*)\s*:/g)) {
      const schluessel = e[1];
      if (ERLAUBT.has(schluessel)) continue;
      tot.push(schluessel);
    }
    if (tot.length) {
      befunde.push({
        datei,
        zeile: quelle.slice(0, m.index).split("\n").length,
        tabelle: m[1],
        tot,
        gesamt: [...rumpf.matchAll(/(?:^|[{,\s])([A-Z][A-Z0-9_]*)\s*:/g)].length,
      });
    }
  }
}

if (befunde.length) {
  console.error(`\nBeschriftungen fuer Werte, die es nicht gibt: ${befunde.length} Tabellen\n`);
  for (const b of befunde) {
    console.error(`  ${b.datei}:${b.zeile}  ${b.tabelle}`);
    console.error(`    tote Schlüssel (${b.tot.length} von ${b.gesamt}): ${b.tot.join(", ")}`);
  }
  console.error(`
Ein Schlüssel, den keine CHECK-Bedingung der Datenbank kennt, trifft nie. Die
Anzeige faellt dann auf den rohen Wert zurueck — und das faellt erst auf, wenn
jemand den Zustand wirklich setzt.

Entweder ist der Schlüssel ein Tippfehler, oder die Tabelle stammt aus einer
frueheren Fassung der Fachlogik. Beschriftet die Tabelle etwas, das gar nicht
aus der Datenbank kommt, wird sie in scripts/check-tote-beschriftungen.mjs
unter AUSNAHMEN eingetragen — mit Begruendung.
`);
  process.exit(1);
}

console.log("Beschriftungen: kein toter Schlüssel.");
