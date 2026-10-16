// Ampel und Stillstand: woher die Zahlen kommen (P2-1, 16.10.2026).
//
// Die Regeln stehen in app/lib/naechster-schritt.ts (Ampel) und
// app/lib/stillstand.ts (Schwellen, echte Aktivitaet). Hier stehen nur die
// Abfragen und das Zusammenzaehlen.
//
// WARUM NICHT IM LADETEIL DER LISTEN
//
// Die Arbeitsplaetze laden Liste und Akte in einer Worker-Anfrage, und ein
// Worker darf je Anfrage nur eine begrenzte Zahl Unteranfragen stellen. Die
// Objektakte liegt nahe an dieser Grenze (siehe api-objekt-rechte.ts). Die
// Ampel kommt deshalb ueber /api/naechster-schritt und der Stillstand ueber
// /api/stillstand, jeweils in einer eigenen Anfrage, nachdem die Seite steht.
//
// KEIN STILLES FALSCHGELB
//
// Jede Quelle ist begrenzt (GRENZE). Erreicht eine die Grenze oder faellt sie
// aus, ist unbekannt, ob ein Datensatz einen Schritt hat. Dann wird "kein
// nächster Schritt" nicht behauptet -- rot, gruen und grau bleiben, weil sie
// auf gelesenen Daten beruhen.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ANFRAGESTATUS, IMMOBILIENSTATUS, LEADSTATUS, beschrifte } from "~/lib/labels";
import { standAus, type AmpelArt, type Schrittstand } from "~/lib/naechster-schritt";
import { AKTIVITAET_ECHT, STILLSTAND_LAENGSTE, STILLSTAND_TAGE } from "~/lib/stillstand";
import { dateKey, one } from "~/lib/termine";

const GRENZE = 1000;

/** Objekte, die bearbeitet werden: ab Akquise bis zum Notar. Entwurf, Verkauft, Verloren usw. brauchen keinen Schritt. */
const OBJEKT_LAEUFT = ["ACQUISITION", "VALUATION", "CONTRACT_PENDING", "PREPARATION", "MARKETING", "RESERVED", "NOTARY"];
const ANFRAGE_LAEUFT = ["NEW", "CONTACTED", "QUALIFIED", "VIEWING_PLANNED"];
const LEAD_ENTSCHIEDEN = ["WON", "LOST"];

type Zeile = Record<string, any>;
type Abfrage = PromiseLike<{ data: unknown; error: unknown }>;

/** "2026-10-16" bleibt, ein Zeitpunkt wird zum Tag in der CRM-Zeitzone. */
function tagVon(wert: string | null | undefined): string | null {
  if (!wert) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(wert) ? wert : dateKey(wert);
}

function tageZwischen(von: string, bis: string): number {
  const [a, b] = [von, bis].map((t) => { const [j, m, d] = t.split("-").map(Number); return Date.UTC(j, m - 1, d); });
  return Math.round((b - a) / 86_400_000);
}

function minusTage(tag: string, n: number): string {
  const [j, m, d] = tag.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, d - n)).toISOString().slice(0, 10);
}

async function lese(abfrage: Abfrage | null): Promise<{ zeilen: Zeile[]; voll: boolean }> {
  if (!abfrage) return { zeilen: [], voll: true };
  const { data, error } = await abfrage;
  const zeilen = (data ?? []) as Zeile[];
  return { zeilen, voll: !error && zeilen.length < GRENZE };
}

// --- Ampel -----------------------------------------------------------------

export type Schritte = { staende: Record<string, Schrittstand>; vollstaendig: boolean };

/** Fuer einen Bereich: der Stand jedes Datensatzes, der einen Schritt hat oder einen braeuchte. */
export async function ladeSchritte(supabase: SupabaseClient, art: AmpelArt, heute: string): Promise<Schritte> {
  const braucht = {
    aufgaben: art !== "project",
    besichtigungen: art === "contact" || art === "property" || art === "inquiry",
    leads: art === "lead" || art === "contact",
    projekte: art === "project" || art === "contact",
    anfragen: art === "inquiry" || art === "contact",
    objekte: art === "property",
  };
  const spalte = ({ contact: "contact_id", property: "property_id", lead: "lead_id", inquiry: "inquiry_id" } as Record<string, string>)[art];

  const [aufgaben, besichtigungen, leads, projekte, anfragen, objekte] = await Promise.all([
    lese(braucht.aufgaben ? supabase.from("tasks").select(`${spalte},due_at`).is("archived_at", null)
      .in("status", ["OPEN", "IN_PROGRESS"]).not(spalte, "is", null).order("due_at", { ascending: true }).limit(GRENZE) : null),
    lese(braucht.besichtigungen ? supabase.from("viewings").select(`${spalte},starts_at`).is("archived_at", null)
      .in("status", ["PLANNED", "CONFIRMED"]).not(spalte, "is", null).order("starts_at", { ascending: true }).limit(GRENZE) : null),
    lese(braucht.leads ? supabase.from("leads").select("id,contact_id,status,follow_up_at").is("archived_at", null).limit(GRENZE) : null),
    lese(braucht.projekte ? supabase.from("sale_projects").select("id,contact_id,status,next_step_due_on,follow_up_at").is("archived_at", null).limit(GRENZE) : null),
    lese(braucht.anfragen ? supabase.from("inquiries").select("id,contact_id").is("archived_at", null).in("status", ANFRAGE_LAEUFT).limit(GRENZE) : null),
    lese(braucht.objekte ? supabase.from("properties").select("id").in("status", OBJEKT_LAEUFT).limit(GRENZE) : null),
  ]);

  const tage = new Map<string, string[]>();
  const ohneDatum = new Set<string>();
  const laeuft = new Set<string>();
  const merke = (id: string | null | undefined, wann: string | null | undefined) => {
    if (!id) return;
    const tag = tagVon(wann);
    if (!tag) { ohneDatum.add(id); return; }
    tage.set(id, [...(tage.get(id) ?? []), tag]);
  };
  // Leere Felder (Wiedervorlage nicht gesetzt) sind kein Schritt -- anders als eine Aufgabe ohne Datum.
  const merkeWennGesetzt = (id: string | null | undefined, wann: string | null | undefined) => { if (wann) merke(id, wann); };

  for (const r of aufgaben.zeilen) merke(r[spalte], r.due_at);
  for (const r of besichtigungen.zeilen) merke(r[spalte], r.starts_at);

  for (const r of leads.zeilen) {
    const offen = !LEAD_ENTSCHIEDEN.includes(r.status);
    const ziel = art === "lead" ? r.id : r.contact_id;
    if (offen) merkeWennGesetzt(ziel, r.follow_up_at);
    if (offen && ziel) laeuft.add(ziel);
  }
  for (const r of projekte.zeilen) {
    const offen = r.status === "ACTIVE" || r.status === "ON_HOLD";
    const ziel = art === "project" ? r.id : r.contact_id;
    if (offen) { merkeWennGesetzt(ziel, r.next_step_due_on); merkeWennGesetzt(ziel, r.follow_up_at); }
    if (r.status === "ACTIVE" && ziel) laeuft.add(ziel);
  }
  for (const r of anfragen.zeilen) { const ziel = art === "inquiry" ? r.id : r.contact_id; if (ziel) laeuft.add(ziel); }
  for (const r of objekte.zeilen) laeuft.add(r.id);

  const vollstaendig = [aufgaben, besichtigungen, leads, projekte, anfragen, objekte].every((q) => q.voll);
  const staende: Record<string, Schrittstand> = {};
  for (const id of new Set([...tage.keys(), ...ohneDatum])) {
    staende[id] = standAus(tage.get(id) ?? [], heute) ?? { stand: "geplant", tag: null };
  }
  if (vollstaendig) for (const id of laeuft) if (!staende[id]) staende[id] = { stand: "ohne", tag: null };
  return { staende, vollstaendig };
}

// --- Stillstand ------------------------------------------------------------

export type StillstandEintrag = {
  key: string;
  art: string;
  titel: string;
  kontext: string;
  /** Tag der letzten echten Aktivitaet, sonst der Entstehung. */
  seit: string;
  tage: number;
  schwelle: number;
  /** Gab es eine echte Aktivitaet? Sonst zaehlt die Entstehung. */
  mitAktivitaet: boolean;
  /**
   * Gesucht wird nur so weit zurueck, wie die laengste Schwelle reicht. Ist
   * der Vorgang aelter und nichts gefunden, ist "tage" eine Untergrenze.
   */
  mindestens: boolean;
  pfad: string;
};

function name(k: Zeile | null | undefined) {
  return k ? [k.first_name, k.last_name].filter(Boolean).join(" ") : "";
}

/**
 * Laufende Vorgaenge ohne echte Aktivitaet seit ihrer Schwelle und ohne
 * Schritt ab heute. Ein ueberfaelliger Schritt schuetzt nicht: er ist ja
 * gerade liegen geblieben.
 */
export async function ladeStillstand(
  supabase: SupabaseClient,
  userId: string,
  scope: "mine" | "all",
  heute: string,
): Promise<{ eintraege: StillstandEintrag[]; vollstaendig: boolean }> {
  const meins = scope === "mine";
  const ab = minusTage(heute, STILLSTAND_LAENGSTE + 1);

  let leads = supabase.from("leads").select("id,lead_number,status,created_at,contact_id,contacts(first_name,last_name)")
    .is("archived_at", null).in("status", Object.keys(STILLSTAND_TAGE.lead)).limit(GRENZE);
  let anfragen = supabase.from("inquiries").select("id,inquiry_number,status,received_at,answered_at,contact_id,contacts(first_name,last_name),properties(property_number)")
    .is("archived_at", null).in("status", Object.keys(STILLSTAND_TAGE.inquiry)).limit(GRENZE);
  let objekte = supabase.from("properties").select("id,property_number,internal_title,status,created_at")
    .is("archived_at", null).in("status", Object.keys(STILLSTAND_TAGE.property)).limit(GRENZE);
  let projekte = supabase.from("sale_projects").select("id,project_number,status,created_at,contact_id,property_id,lead_id,contacts(first_name,last_name),properties(property_number)")
    .is("archived_at", null).in("status", Object.keys(STILLSTAND_TAGE.project)).limit(GRENZE);
  if (meins) {
    leads = leads.eq("primary_responsible_user", userId);
    anfragen = anfragen.eq("primary_responsible_user", userId);
    objekte = objekte.eq("primary_responsible_user", userId);
    projekte = projekte.or(`next_step_user.eq.${userId},and(next_step_user.is.null,primary_responsible_user.eq.${userId})`);
  }

  const [leadsR, anfragenR, objekteR, projekteR, aktivitaeten, erledigt, schritteLead, schritteAnfrage, schritteObjekt, schritteProjekt] = await Promise.all([
    lese(leads), lese(anfragen), lese(objekte), lese(projekte),
    lese(supabase.from("activity_events").select("contact_id,property_id,lead_id,inquiry_id,occurred_at")
      .in("activity_type", AKTIVITAET_ECHT).gte("occurred_at", ab).order("occurred_at", { ascending: false }).limit(GRENZE)),
    lese(supabase.from("tasks").select("contact_id,property_id,lead_id,inquiry_id,completed_at")
      .eq("status", "DONE").gte("completed_at", ab).order("completed_at", { ascending: false }).limit(GRENZE)),
    ladeSchritte(supabase, "lead", heute), ladeSchritte(supabase, "inquiry", heute),
    ladeSchritte(supabase, "property", heute), ladeSchritte(supabase, "project", heute),
  ]);

  // Juengste echte Aktivitaet je Kennung und Spalte.
  const letzte: Record<string, Map<string, string>> = { contact_id: new Map(), property_id: new Map(), lead_id: new Map(), inquiry_id: new Map() };
  const trage = (r: Zeile, wann: string | null | undefined) => {
    const tag = tagVon(wann);
    if (!tag) return;
    for (const s of Object.keys(letzte)) {
      const id = r[s];
      if (id && (!letzte[s].get(id) || letzte[s].get(id)! < tag)) letzte[s].set(id, tag);
    }
  };
  for (const r of aktivitaeten.zeilen) trage(r, r.occurred_at);
  // Eine erledigte Aufgabe zaehlt am Vorgang selbst, nicht am Kontakt: eine
  // Aufgabe "Unterlagen anfordern" am Kontakt ist keine Arbeit an jeder seiner Anfragen.
  for (const r of erledigt.zeilen) trage({ ...r, contact_id: null }, r.completed_at);

  const juengste = (...werte: Array<string | null | undefined>) => werte.filter((w): w is string => Boolean(w)).sort().at(-1) ?? null;
  const geplantAbHeute = (s: Schritte, id: string) => {
    const st = s.staende[id]?.stand;
    return st === "heute" || st === "geplant";
  };

  const eintraege: StillstandEintrag[] = [];
  const pruefe = (e: Omit<StillstandEintrag, "tage" | "seit" | "mitAktivitaet" | "mindestens"> & { aktivitaet: string | null; entstanden: string | null }) => {
    const { aktivitaet, entstanden, ...rest } = e;
    if (!rest.schwelle) return;
    const mindestens = !aktivitaet && Boolean(entstanden) && entstanden! < ab;
    const seit = aktivitaet ?? (mindestens ? ab : entstanden);
    if (!seit) return;
    const tage = tageZwischen(seit, heute);
    if (tage < rest.schwelle) return;
    eintraege.push({ ...rest, seit, tage, mitAktivitaet: Boolean(aktivitaet), mindestens });
  };

  for (const r of leadsR.zeilen) {
    if (geplantAbHeute(schritteLead, r.id)) continue;
    pruefe({
      key: `LEAD:${r.id}`, art: `Lead · ${beschrifte(LEADSTATUS, r.status)}`,
      titel: name(one(r.contacts)) || r.lead_number, kontext: r.lead_number,
      schwelle: STILLSTAND_TAGE.lead[r.status], pfad: `/leads/${r.id}`,
      aktivitaet: juengste(letzte.lead_id.get(r.id), r.contact_id ? letzte.contact_id.get(r.contact_id) : null),
      entstanden: tagVon(r.created_at),
    });
  }
  for (const r of anfragenR.zeilen) {
    if (geplantAbHeute(schritteAnfrage, r.id)) continue;
    pruefe({
      key: `INQUIRY:${r.id}`, art: `Anfrage · ${beschrifte(ANFRAGESTATUS, r.status)}`,
      titel: name(one(r.contacts)) || r.inquiry_number,
      kontext: [r.inquiry_number, one(r.properties)?.property_number].filter(Boolean).join(" · "),
      schwelle: STILLSTAND_TAGE.inquiry[r.status], pfad: `/inquiries/${r.id}`,
      aktivitaet: juengste(letzte.inquiry_id.get(r.id), r.contact_id ? letzte.contact_id.get(r.contact_id) : null, tagVon(r.answered_at)),
      entstanden: tagVon(r.received_at),
    });
  }
  for (const r of objekteR.zeilen) {
    if (geplantAbHeute(schritteObjekt, r.id)) continue;
    pruefe({
      key: `PROPERTY:${r.id}`, art: `Objekt · ${beschrifte(IMMOBILIENSTATUS, r.status)}`,
      titel: r.internal_title || r.property_number, kontext: r.property_number,
      schwelle: STILLSTAND_TAGE.property[r.status], pfad: `/properties/${r.id}`,
      aktivitaet: letzte.property_id.get(r.id) ?? null,
      entstanden: tagVon(r.created_at),
    });
  }
  for (const r of projekteR.zeilen) {
    if (geplantAbHeute(schritteProjekt, r.id)) continue;
    pruefe({
      key: `PROJECT:${r.id}`, art: "Verkaufsprojekt",
      titel: name(one(r.contacts)) || r.project_number,
      kontext: [r.project_number, one(r.properties)?.property_number].filter(Boolean).join(" · "),
      schwelle: STILLSTAND_TAGE.project[r.status], pfad: `/projects/${r.id}`,
      aktivitaet: juengste(
        r.contact_id ? letzte.contact_id.get(r.contact_id) : null,
        r.property_id ? letzte.property_id.get(r.property_id) : null,
        r.lead_id ? letzte.lead_id.get(r.lead_id) : null,
      ),
      entstanden: tagVon(r.created_at),
    });
  }

  // Am laengsten ueber der Schwelle zuerst.
  eintraege.sort((a, b) => (b.tage - b.schwelle) - (a.tage - a.schwelle) || a.seit.localeCompare(b.seit));
  const vollstaendig = [leadsR, anfragenR, objekteR, projekteR, aktivitaeten, erledigt].every((q) => q.voll)
    && [schritteLead, schritteAnfrage, schritteObjekt, schritteProjekt].every((s) => s.vollstaendig);
  return { eintraege, vollstaendig };
}
