import { CHECKLISTENKATEGORIE, IMMOBILIENSTATUS, OBJEKTART, type Beschriftungen } from "~/lib/labels";
import { euroRund } from "~/lib/format";
import { verlaufWert } from "~/lib/verlauf-wert";

// Objekthistorie lesbar (15.10.2026).
//
// Vorher stand im Reiter "Verlauf" einer Immobilie
//   "System · CHECKLIST"  /  "CHECKLIST  — → Datensatz"
//   "additional_costs  1200 → 1500"
// Die Trigger schreiben Aenderungen an Checkliste, Unterlagen, Ausstattung,
// Medien, Adresse, Eigentuemern und Energieausweis als ganzen Datensatz unter
// einem Bereichsnamen. Hier wird daraus eine Zeile wie
//   "Checkliste  Objektfotos vorbereitet: Offen → Erledigt".

const FELD: Record<string, string> = {
  status: "Status", status_before_archive: "Status vor Archivierung",
  archived_at: "Archiviert am", archived_by: "Archiviert von",
  internal_title: "Interner Titel", property_type: "Typ", transaction_type: "Transaktion",
  primary_responsible_user: "Verantwortlich", purchase_price: "Kaufpreis", rent_cold: "Kaltmiete",
  additional_costs: "Nebenkosten", hoa_fee: "Hausgeld", living_area_sqm: "Wohnfläche m²",
  usable_area_sqm: "Nutzfläche m²", plot_area_sqm: "Grundstück m²", rooms: "Zimmer",
  bedrooms: "Schlafzimmer", bathrooms: "Bäder", floor: "Etage", year_built: "Baujahr",
  modernization_year: "Modernisiert", condition: "Zustand", available_from: "Verfügbar ab",
  tenancy_status: "Vermietungsstatus", parking_spaces: "Stellplätze", residential_units: "Wohneinheiten",
  internal_notes: "Interne Notizen", public_title: "Öffentlicher Titel", public_description: "Exposé-Text",
};

const VERMIETUNG: Beschriftungen = {
  VACANT: "Leerstehend", OWNER_OCCUPIED: "Eigengenutzt", RENTED: "Vermietet",
  PARTIALLY_RENTED: "Teilvermietet", UNKNOWN: "Unbekannt",
};

const WERTE: Record<string, Beschriftungen> = {
  status: IMMOBILIENSTATUS, status_before_archive: IMMOBILIENSTATUS, property_type: OBJEKTART,
  transaction_type: { SALE: "Verkauf", RENT: "Vermietung" }, tenancy_status: VERMIETUNG,
};

/** Betraege: "469.000 €" statt "469000". */
const EURO = new Set(["purchase_price", "rent_cold", "additional_costs", "hoa_fee"]);

const BEREICH: Record<string, string> = {
  CHECKLIST: "Checkliste", DOCUMENT_REQUIREMENT: "Unterlage", FEATURE: "Ausstattung",
  MEDIA: "Medium", ADDRESS: "Adresse", OWNER: "Eigentümer", ENERGY: "Energieausweis",
};

const BEREICH_STATUS: Record<string, Beschriftungen> = {
  CHECKLIST: { TODO: "Offen", IN_PROGRESS: "In Arbeit", DONE: "Erledigt", WAIVED: "Entfällt" },
  DOCUMENT_REQUIREMENT: {
    MISSING: "Fehlt", REQUESTED: "Angefordert", PRESENT: "Vorhanden", TO_CHECK: "Zu prüfen",
    CHECKED: "Geprüft", OUTDATED: "Veraltet", NOT_APPLICABLE: "Nicht erforderlich",
  },
};

const VORGANG: Record<string, string> = { INSERT: "hinzugefügt", UPDATE: "geändert", DELETE: "entfernt" };

type Satz = Record<string, any>;
type Aenderung = { old?: unknown; new?: unknown };
export type VerlaufZeile = { feld: string; text: string };

function bezeichnung(bereich: string, s: Satz, kontakte: Record<string, Satz>): string {
  if (bereich === "ADDRESS") {
    const strasse = [s.street, s.house_number].filter(Boolean).join(" ");
    const ort = [s.postal_code, s.city].filter(Boolean).join(" ");
    return [strasse, ort].filter(Boolean).join(", ") || "Adresse";
  }
  if (bereich === "OWNER") {
    const c = kontakte[s.contact_id];
    const name = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "";
    const anteil = s.ownership_percentage != null ? `${String(s.ownership_percentage).replace(/\.00$/, "").replace(".", ",")} %` : "";
    return [name || "Eigentümer", anteil].filter(Boolean).join(" · ");
  }
  if (bereich === "ENERGY") return s.efficiency_class ? `Effizienzklasse ${s.efficiency_class}` : "Energieausweis";
  if (bereich === "CHECKLIST" && s.category && !s.title) return CHECKLISTENKATEGORIE[s.category] ?? "Punkt";
  return String(s.title ?? s.label ?? s.alt_text ?? "Eintrag");
}

function bereichsZeile(bereich: string, a: Aenderung, vorgang: string | undefined, kontakte: Record<string, Satz>): string {
  const alt = (a?.old && typeof a.old === "object" ? a.old : null) as Satz | null;
  const neu = (a?.new && typeof a.new === "object" ? a.new : null) as Satz | null;
  const satz = neu ?? alt ?? {};
  const name = bezeichnung(bereich, satz, kontakte);
  const art = VORGANG[vorgang ?? ""] ?? (alt && !neu ? "entfernt" : !alt && neu ? "hinzugefügt" : "geändert");
  if (alt && neu) {
    const st = BEREICH_STATUS[bereich];
    if (st && alt.status !== neu.status) return `${name}: ${st[alt.status] ?? "—"} → ${st[neu.status] ?? "—"}`;
    if (bereich === "MEDIA" && alt.public_approved !== neu.public_approved) return `${name}: ${neu.public_approved ? "für Veröffentlichung freigegeben" : "Freigabe zurückgenommen"}`;
    if (bereich === "MEDIA" && !alt.archived_at && neu.archived_at) return `${name}: archiviert`;
  }
  return `${name} ${art}`;
}

/** Die Zeilen eines Protokolleintrags zur Immobilie, ohne Rohcodes. */
export function objektVerlaufZeilen(
  aenderungen: Record<string, Aenderung> | null | undefined,
  metadaten: Satz | null | undefined,
  kontakte: Record<string, Satz> = {},
): VerlaufZeile[] {
  const zeilen: VerlaufZeile[] = [];
  for (const [schluessel, a] of Object.entries(aenderungen ?? {})) {
    if (schluessel === "record") continue;
    if (BEREICH[schluessel]) {
      zeilen.push({ feld: BEREICH[schluessel], text: bereichsZeile(schluessel, a, metadaten?.operation, kontakte) });
      continue;
    }
    const tabelle = WERTE[schluessel];
    const wert = (v: unknown) => EURO.has(schluessel) && v !== null && v !== "" && Number.isFinite(Number(v)) ? euroRund(Number(v)) : verlaufWert(v, tabelle);
    zeilen.push({
      feld: FELD[schluessel] ?? "Weitere Angabe",
      text: `${wert(a?.old)} → ${wert(a?.new)}`,
    });
  }
  return zeilen;
}
