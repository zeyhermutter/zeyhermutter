// Datenauskunft zu einem Kontakt (P2-6, 16.10.2026).
//
// Sammelt alles, was das CRM zu einer Person speichert: den Kontakt selbst und
// jeden Datensatz, der über eine Kontaktspalte auf ihn zeigt. Die Liste der
// Quellen stammt aus dem Schema von BETA (alle Spalten "*contact_id" am
// 16.10.2026); scripts/check-pakete-p-zwei.mjs hält fest, dass keine fehlt,
// die damals da war.
//
// Gelesen wird mit den Rechten des Benutzers. Was er nicht lesen darf oder was
// nicht geladen werden konnte, steht in der Auskunft ausdrücklich als
// "nicht gelesen" -- eine Auskunft, die still Lücken hat, wäre falsch.
//
// Dateien (Dokumente, Exposés, Ausweiskopien) sind mit ihren Angaben enthalten,
// nicht als Datei. Sie werden bei Bedarf einzeln aus der Akte heruntergeladen.

import type { SupabaseClient } from "@supabase/supabase-js";

const GRENZE = 1000;

type Quelle = {
  schluessel: string;
  titel: string;
  tabelle: string;
  /** Spalten, über die der Datensatz auf den Kontakt zeigt (eine reicht). */
  spalten: string[];
  auswahl?: string;
  /** Zusätzliche Bedingung, z. B. Kommentare nur am Kontakt. */
  extra?: (q: any) => any;
  ordnung?: string;
};

export const QUELLEN: Quelle[] = [
  { schluessel: "anschriften", titel: "Anschriften", tabelle: "contact_addresses", spalten: ["contact_id"] },
  { schluessel: "rollen", titel: "Rollen", tabelle: "contact_role_assignments", spalten: ["contact_id"], auswahl: "*,contact_roles(name)" },
  { schluessel: "beziehungen", titel: "Beziehungen zu anderen Kontakten", tabelle: "contact_relationships", spalten: ["contact_id", "related_contact_id"] },
  { schluessel: "organisationen", titel: "Organisationen", tabelle: "contact_organization_relationships", spalten: ["contact_id"], auswahl: "*,organizations(name,organization_number)" },
  { schluessel: "leads", titel: "Verkäufer-Leads", tabelle: "leads", spalten: ["contact_id"] },
  { schluessel: "anfragen", titel: "Anfragen", tabelle: "inquiries", spalten: ["contact_id"] },
  { schluessel: "suchprofile", titel: "Suchprofile", tabelle: "search_profiles", spalten: ["contact_id"], auswahl: "*,search_profile_locations(*)" },
  { schluessel: "besichtigungen", titel: "Besichtigungen", tabelle: "viewings", spalten: ["contact_id"] },
  { schluessel: "objektnachweise", titel: "Objektnachweise", tabelle: "property_disclosures", spalten: ["contact_id"] },
  { schluessel: "kaufangebote", titel: "Kaufangebote", tabelle: "purchase_offers", spalten: ["contact_id"] },
  { schluessel: "reservierungen", titel: "Reservierungen", tabelle: "property_reservations", spalten: ["contact_id"] },
  { schluessel: "eigentum", titel: "Eigentum an Immobilien", tabelle: "property_owners", spalten: ["contact_id"], auswahl: "*,properties(property_number,internal_title)" },
  { schluessel: "auftraege", titel: "Maklerauftrag (Auftraggeber)", tabelle: "brokerage_mandate_clients", spalten: ["contact_id"] },
  { schluessel: "projekte", titel: "Verkaufsprojekte", tabelle: "sale_projects", spalten: ["contact_id"] },
  { schluessel: "abschluesse", titel: "Verkaufsabschlüsse (Käufer oder Notar)", tabelle: "sale_closings", spalten: ["buyer_contact_id", "notary_contact_id"] },
  { schluessel: "provisionen", titel: "Provisionen", tabelle: "commissions", spalten: ["party_contact_id"] },
  { schluessel: "aufgaben", titel: "Aufgaben", tabelle: "tasks", spalten: ["contact_id"] },
  { schluessel: "verlauf", titel: "Verlauf (Telefonate, E-Mails, Notizen, Eingänge)", tabelle: "activity_events", spalten: ["contact_id"], ordnung: "occurred_at" },
  { schluessel: "kommentare", titel: "Kommentare am Kontakt", tabelle: "comments", spalten: ["entity_id"], extra: (q) => q.eq("entity_type", "CONTACT") },
  { schluessel: "dokumente", titel: "Dokumente (Angaben, ohne Datei)", tabelle: "documents", spalten: ["contact_id"] },
  { schluessel: "gwg", titel: "Geldwäsche-Identifizierung", tabelle: "gwg_identifications", spalten: ["contact_id", "represents_contact_id"] },
  { schluessel: "verfuegung", titel: "Verfügungsberechtigung", tabelle: "property_disposition_parties", spalten: ["contact_id", "represents_contact_id"] },
  { schluessel: "erblasser", titel: "Erbfall (als Erblasser)", tabelle: "property_dispositions", spalten: ["decedent_contact_id"] },
  { schluessel: "belastungen", titel: "Grundbuch-Belastungen (als Berechtigter)", tabelle: "property_encumbrances", spalten: ["beneficiary_contact_id"] },
  { schluessel: "weg", titel: "WEG-Verwaltung", tabelle: "property_hoa_data", spalten: ["manager_contact_id"] },
  { schluessel: "erbbaurecht", titel: "Erbbaurecht (als Geber)", tabelle: "property_legal_data", spalten: ["ground_lessor_contact_id"] },
  { schluessel: "miete", titel: "Mietverhältnisse (als Mieter)", tabelle: "property_tenancies", spalten: ["tenant_contact_id"] },
  { schluessel: "energieausweis", titel: "Vorlage des Energieausweises", tabelle: "energy_certificate_presentations", spalten: ["contact_id"] },
  { schluessel: "unterlagen", titel: "Unterlagen (angefordert bei)", tabelle: "property_document_requirements", spalten: ["responsible_contact_id"] },
  { schluessel: "aufmass", titel: "Aufmaß-Aufträge", tabelle: "measurement_orders", spalten: ["contact_id"] },
  { schluessel: "empfehlungen", titel: "Empfehlungen", tabelle: "referrals", spalten: ["referrer_contact_id", "referred_contact_id"] },
  { schluessel: "akquise", titel: "Akquise (als Empfehlungsgeber)", tabelle: "lead_acquisitions", spalten: ["referrer_contact_id"] },
  { schluessel: "casestudy", titel: "Case-Study-Freigaben", tabelle: "sale_case_studies", spalten: ["release_contact_id"] },
];

export type Abschnitt = { schluessel: string; titel: string; zeilen: Record<string, unknown>[]; fehler: boolean; gekappt: boolean };

export type Einwilligung = { quelle: string; nummer: string | null; erteilt: string | null; fassung: string | null };

export type Auskunft = {
  erstellt: string;
  kontakt: Record<string, unknown>;
  abschnitte: Abschnitt[];
  einwilligungen: Einwilligung[];
  nichtGelesen: string[];
};

export async function ladeAuskunft(supabase: SupabaseClient, kontaktId: string): Promise<Auskunft | null> {
  const { data: kontakt, error } = await supabase.from("contacts").select("*").eq("id", kontaktId).maybeSingle();
  if (error || !kontakt) return null;

  const abschnitte = await Promise.all(QUELLEN.map(async (q): Promise<Abschnitt> => {
    let abfrage: any = supabase.from(q.tabelle).select(q.auswahl ?? "*");
    abfrage = q.spalten.length === 1 ? abfrage.eq(q.spalten[0], kontaktId) : abfrage.or(q.spalten.map((s) => `${s}.eq.${kontaktId}`).join(","));
    if (q.extra) abfrage = q.extra(abfrage);
    abfrage = abfrage.order(q.ordnung ?? "created_at", { ascending: true }).limit(GRENZE);
    const { data, error: fehler } = await abfrage;
    const zeilen = (data ?? []) as Record<string, unknown>[];
    return { schluessel: q.schluessel, titel: q.titel, zeilen, fehler: Boolean(fehler), gekappt: zeilen.length >= GRENZE };
  }));

  // Einwilligungen aus den Formularen der Website, mit Fassung und Zeitpunkt.
  const einwilligungen: Einwilligung[] = [];
  const je = (schluessel: string) => abschnitte.find((a) => a.schluessel === schluessel)?.zeilen ?? [];
  for (const r of je("leads") as any[]) if (r.consent_given || r.consent_at) einwilligungen.push({ quelle: "Verkäufer-Lead", nummer: r.lead_number, erteilt: r.consent_at ?? null, fassung: r.consent_text_version ?? null });
  for (const r of je("anfragen") as any[]) if (r.consent_given_at) einwilligungen.push({ quelle: "Anfrage", nummer: r.inquiry_number, erteilt: r.consent_given_at, fassung: r.consent_text_version ?? null });
  for (const r of je("suchprofile") as any[]) if (r.consent_given_at) einwilligungen.push({ quelle: "Suchauftrag", nummer: r.search_profile_number, erteilt: r.consent_given_at, fassung: r.consent_text_version ?? null });
  for (const r of je("aufmass") as any[]) if (r.consent_given_at) einwilligungen.push({ quelle: "Aufmaß-Anfrage", nummer: r.order_number ?? null, erteilt: r.consent_given_at, fassung: r.consent_text_version ?? null });

  return {
    erstellt: new Date().toISOString(),
    kontakt,
    abschnitte,
    einwilligungen,
    nichtGelesen: abschnitte.filter((a) => a.fehler || a.gekappt).map((a) => a.titel),
  };
}
