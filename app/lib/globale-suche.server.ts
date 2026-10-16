// Die Suche ueber alles -- fuer die Trefferseite (/crm/search) und die
// Schnellsuche mit Strg+K (/api/suche). P2-2, 16.10.2026.
//
// WAS VORHER SCHIEFLIEF
//
// 1. Kaufangebote und Abschluesse suchte die Trefferseite im Browser: sie
//    lud die 300 zuletzt geaenderten und filterte sie in JavaScript. Ein
//    aelteres Angebot war nicht zu finden, ohne Hinweis.
// 2. Die Datenbankfunktion crm_global_search liefert hoechstens 100
//    Treffer; die Seite schnitt danach nochmals still bei 100 ab.
// 3. Verkaufsprojekte und Besichtigungen fehlten ganz.
//
// JETZT
//
// - Alles wird in der Datenbank gefiltert. Kaufangebote, Abschluesse und
//   Verkaufsprojekte werden ueber ihre Nummer gefunden und ueber die
//   Kontakte und Objekte, die crm_global_search zum Suchbegriff findet --
//   wie vorher, aber ohne Obergrenze im Browser.
// - Erreicht eine Quelle ihre Grenze, sagt das Ergebnis "mehr" -- die Seite
//   bittet dann, genauer zu suchen, statt still abzuschneiden.
// - Reihenfolge: genaue Nummer zuerst, dann Titel, der mit dem Begriff
//   beginnt, dann zuletzt geaendert.
//
// Eine Erweiterung von crm_global_search selbst waere eine Migration und
// braucht eine eigene Freigabe.

import type { SupabaseClient } from "@supabase/supabase-js";
import { euroGenau, tagKurz } from "~/lib/format";
import { taskSourcePath } from "~/lib/termine";

export type Treffer = {
  entity_type: string;
  entity_id: string;
  reference: string;
  title: string;
  subtitle: string;
  status: string;
  updated_at: string;
  archived: boolean;
  /** Wohin ein Klick fuehrt. */
  pfad: string;
};

/** Grenze der Datenbankfunktion -- liefert sie so viele, gibt es vermutlich mehr. */
const RPC_GRENZE = 100;
const JE_QUELLE = 50;

function one(v: any) { return Array.isArray(v) ? v[0] : v; }
function name(k: any) { return k ? [k.first_name, k.last_name].filter(Boolean).join(" ") : ""; }

export function zielVon(art: string, id: string): string {
  switch (art) {
    case "CONTACT": return `/crm/contacts/${id}`;
    case "ORGANIZATION": return `/crm/organizations/${id}`;
    case "PROPERTY": return `/properties/${id}`;
    case "LEAD": return `/leads/${id}`;
    case "SEARCH_PROFILE": return `/search-profiles/${id}`;
    case "INQUIRY": return `/inquiries/${id}`;
    case "OFFER": return `/purchase-offers/${id}`;
    case "CLOSING": return `/closings/${id}`;
    case "PROJECT": return `/projects/${id}`;
    case "VIEWING": return `/viewings/${id}`;
    default: return "/crm/tasks";
  }
}

/** Fuer die Filtersprache: Komma, Prozent und Klammern trennen dort Bedingungen. */
function sicher(q: string) { return q.replace(/[,%()]/g, " ").trim(); }

export async function sucheUeberall(
  supabase: SupabaseClient,
  q: string,
  mitArchiv: boolean,
  hoechstens = 100,
): Promise<{ treffer: Treffer[]; mehr: boolean; fehler: boolean }> {
  const begriff = sicher(q);
  if (begriff.length < 2) return { treffer: [], mehr: false, fehler: false };
  const muster = `%${begriff}%`;

  const { data: rpc, error } = await supabase.rpc("crm_global_search", { p_query: q, p_include_archived: mitArchiv });
  if (error) return { treffer: [], mehr: false, fehler: true };
  const grund = (rpc ?? []) as Omit<Treffer, "pfad">[];
  const kontakte = grund.filter((t) => t.entity_type === "CONTACT").map((t) => t.entity_id);
  const objekte = grund.filter((t) => t.entity_type === "PROPERTY").map((t) => t.entity_id);
  const bezug = (kontaktSpalte: string) => [
    kontakte.length ? `${kontaktSpalte}.in.(${kontakte.join(",")})` : null,
    objekte.length ? `property_id.in.(${objekte.join(",")})` : null,
  ].filter(Boolean).join(",");
  const oder = (nummer: string, kontaktSpalte: string) => [`${nummer}.ilike.${muster}`, bezug(kontaktSpalte)].filter(Boolean).join(",");
  const archiv = <T,>(abfrage: T): T => (mitArchiv ? abfrage : (abfrage as any).is("archived_at", null));

  const [angebote, abschluesse, projekte, besichtigungen] = await Promise.all([
    archiv(supabase.from("purchase_offers").select("id,offer_number,amount,status,updated_at,archived_at,properties(property_number),contacts(first_name,last_name)")
      .or(oder("offer_number", "contact_id")).order("updated_at", { ascending: false }).limit(JE_QUELLE)),
    archiv(supabase.from("sale_closings").select("id,closing_number,agreed_purchase_price,notarial_purchase_price,status,updated_at,archived_at,properties(property_number),buyer:contacts!sale_closings_buyer_contact_id_fkey(first_name,last_name)")
      .or(oder("closing_number", "buyer_contact_id")).order("updated_at", { ascending: false }).limit(JE_QUELLE)),
    archiv(supabase.from("sale_projects").select("id,project_number,status,updated_at,archived_at,next_step,contacts(first_name,last_name),properties(property_number)")
      .or(oder("project_number", "contact_id")).order("updated_at", { ascending: false }).limit(JE_QUELLE)),
    // Besichtigungen nur ueber ihre Nummer: ueber Kontakt oder Objekt kaemen
    // sie zu Dutzenden und verdraengten die Akte selbst.
    archiv(supabase.from("viewings").select("id,viewing_number,status,starts_at,updated_at,archived_at,contacts(first_name,last_name),properties(property_number)")
      .ilike("viewing_number", muster).order("starts_at", { ascending: false }).limit(JE_QUELLE)),
  ]);

  const zeilen = (r: { data: unknown }) => (r.data ?? []) as any[];
  const treffer: Treffer[] = [
    ...grund.map((t) => ({ ...t, pfad: zielVon(t.entity_type, t.entity_id) })),
    ...zeilen(angebote).map((r) => ({
      entity_type: "OFFER", entity_id: r.id, reference: r.offer_number,
      title: name(one(r.contacts)) || "Kaufangebot", subtitle: `${one(r.properties)?.property_number ?? "—"} · ${euroGenau(r.amount)}`,
      status: r.status, updated_at: r.updated_at, archived: Boolean(r.archived_at), pfad: zielVon("OFFER", r.id),
    })),
    ...zeilen(abschluesse).map((r) => ({
      entity_type: "CLOSING", entity_id: r.id, reference: r.closing_number,
      title: `${one(r.properties)?.property_number ?? "Immobilie"} · ${name(one(r.buyer))}`.trim(),
      subtitle: `Verkaufsabschluss · ${euroGenau(r.notarial_purchase_price ?? r.agreed_purchase_price)}`,
      status: r.status, updated_at: r.updated_at, archived: Boolean(r.archived_at), pfad: zielVon("CLOSING", r.id),
    })),
    ...zeilen(projekte).map((r) => ({
      entity_type: "PROJECT", entity_id: r.id, reference: r.project_number,
      title: name(one(r.contacts)) || "Verkaufsprojekt",
      subtitle: [one(r.properties)?.property_number, r.next_step].filter(Boolean).join(" · ") || "—",
      status: r.status, updated_at: r.updated_at, archived: Boolean(r.archived_at), pfad: zielVon("PROJECT", r.id),
    })),
    ...zeilen(besichtigungen).map((r) => ({
      entity_type: "VIEWING", entity_id: r.id, reference: r.viewing_number,
      title: name(one(r.contacts)) || "Besichtigung",
      subtitle: [one(r.properties)?.property_number, r.starts_at ? tagKurz(r.starts_at) : null].filter(Boolean).join(" · ") || "—",
      status: r.status, updated_at: r.updated_at ?? r.starts_at, archived: Boolean(r.archived_at), pfad: zielVon("VIEWING", r.id),
    })),
  ];

  // Eine gefundene Aufgabe fuehrt dorthin, wo sie zu sehen ist (14.10.2026).
  const aufgabenIds = treffer.filter((t) => t.entity_type === "TASK").map((t) => t.entity_id);
  if (aufgabenIds.length) {
    const { data: aufgaben } = await supabase.from("tasks").select("id,contact_id,property_id,lead_id,inquiry_id,search_profile_id,viewing_id").in("id", aufgabenIds);
    const ziel = Object.fromEntries(((aufgaben ?? []) as any[]).map((a) => [a.id, taskSourcePath(a)]));
    for (const t of treffer) if (t.entity_type === "TASK" && ziel[t.entity_id]) t.pfad = ziel[t.entity_id];
  }

  const klein = begriff.toLocaleLowerCase("de-DE");
  const rang = (t: Treffer) => {
    if ((t.reference ?? "").toLocaleLowerCase("de-DE") === klein) return 0;
    if ((t.title ?? "").toLocaleLowerCase("de-DE").startsWith(klein)) return 1;
    return 2;
  };
  treffer.sort((a, b) => rang(a) - rang(b) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const quelleVoll = grund.length >= RPC_GRENZE || [angebote, abschluesse, projekte, besichtigungen].some((r) => zeilen(r).length >= JE_QUELLE);
  const quelleFehlt = [angebote, abschluesse, projekte, besichtigungen].some((r) => (r as any).error);
  return { treffer: treffer.slice(0, hoechstens), mehr: quelleVoll || treffer.length > hoechstens, fehler: quelleFehlt };
}
