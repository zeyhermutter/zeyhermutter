// "Mein Tag" -- was heute ansteht, was liegen geblieben ist, was neu ist und
// welche Fristen laufen. Auf einer Seite.
//
// WARUM
//
// Bis 12.10.2026 war die Startseite eine Sammlung von Kennzahlen und
// "zuletzt bearbeitet"-Listen -- eine Webseite ueber das CRM, kein
// Arbeitsplatz. Was ein Makler morgens wissen will, stand auf fuenf Seiten
// verteilt: Termine im Kalender, ueberfaellige Wiedervorlagen in der
// Lead-Liste, neue Anfragen in der Anfragenliste, Fristen nirgends (siehe
// check-terminquellen: "offene Fristen ohne eigene Uebersicht").
//
// WOHER DIE DATEN KOMMEN
//
// Termine: ladeTermine() aus app/lib/termine.ts -- derselbe Code wie
// der Kalender, damit beide nie Verschiedenes zeigen.
//
// Alles andere sind Abfragen auf die fachlichen Tabellen, ohne eigene Logik
// ausser dem Filter. Keine Bewertung, keine Prognose: es steht da, was
// erfasst ist, und ein Klick fuehrt dorthin, wo es gepflegt wird.
//
// "Meins" heisst: mir zugewiesen. Neue Anfragen und neue Leads ohne
// Zuweisung zaehlen auch dazu -- sonst saehe sie niemand, bevor jemand sie
// zuweist, und genau das ist bei "neu" die Arbeit.
//
// scripts/check-terminquellen.mjs prueft, dass die als "meinTag"
// eingestuften Fristspalten hier wirklich abgefragt, eingegrenzt und
// sortiert werden.

import type { SupabaseClient } from "@supabase/supabase-js";
import { beschrifte, KAUFANGEBOTSTATUS, PROVISIONSSTATUS, ABSCHLUSSSTATUS } from "~/lib/labels";
import { crmDateAtTimeToIso } from "~/lib/local-time";
import { dateKey, ladeTermine, one, taskSourcePath, type CalendarEvent } from "~/lib/termine";
import type { Terminkategorie } from "~/lib/terminkategorien";

/** Wie weit die Termine vorausschauen: heute und die sieben Tage danach. */
export const VORSCHAU_TAGE = 8;
export const FRIST_TAGE = 14;
const JE_QUELLE = 25;

export type Eintrag = {
  key: string;
  /** Kurz, was es ist: "Aufgabe", "Wiedervorlage", "Kaufangebot" ... */
  art: string;
  titel: string;
  kontext: string;
  /** Datum "YYYY-MM-DD" oder Zeitpunkt (ISO). */
  wann: string;
  ganztags: boolean;
  pfad: string;
};

export type MeinTag = {
  heute: string;
  termineHeute: CalendarEvent[];
  termineDanach: CalendarEvent[];
  liegengeblieben: Eintrag[];
  neu: Eintrag[];
  fristen: (Eintrag & { ueberfaellig: boolean })[];
  sichtbareArten: Terminkategorie[];
  quellenfehler: string[];
};

/** "2026-10-12" + n Tage. */
export function plusTage(tag: string, n: number): string {
  const [j, m, t] = tag.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + n));
  return d.toISOString().slice(0, 10);
}

function name(k: { first_name?: string | null; last_name?: string | null } | null | undefined) {
  return k ? [k.first_name, k.last_name].filter(Boolean).join(" ") : "";
}

function mitTeilen(...teile: Array<string | null | undefined>) {
  return teile.filter(Boolean).join(" · ");
}

/**
 * userId ist die Person, deren Tag gezeigt wird -- der angemeldete Benutzer
 * oder ein Kollege ("Meins" / "Jochen"). Mit scope "all" spielt sie keine Rolle.
 */
export async function ladeMeinTag(
  supabase: SupabaseClient,
  userId: string,
  scope: "mine" | "all",
  heute: string,
): Promise<MeinTag> {
  const heuteBeginn = crmDateAtTimeToIso(heute, "00:00")!;
  const vorschauEnde = plusTage(heute, VORSCHAU_TAGE);
  const fristEnde = plusTage(heute, FRIST_TAGE);
  const meins = scope === "mine";
  const meinOderOffen = `primary_responsible_user.eq.${userId},primary_responsible_user.is.null`;

  // --- Liegen geblieben: faellig vor heute, nicht erledigt -----------------

  let aufgaben = supabase
    .from("tasks")
    .select("id,task_number,title,status,due_at,contact_id,property_id,lead_id,inquiry_id,search_profile_id,viewing_id")
    .is("archived_at", null)
    .in("status", ["OPEN", "IN_PROGRESS"])
    .lt("due_at", heuteBeginn)
    .order("due_at", { ascending: true })
    .limit(JE_QUELLE);
  // Gewonnene und verlorene Leads sind entschieden; eine stehengebliebene
  // Wiedervorlage daran ist keine Arbeit mehr.
  let wiedervorlagen = supabase
    .from("leads")
    .select("id,lead_number,status,follow_up_at,contacts!inner(first_name,last_name)")
    .is("archived_at", null)
    .not("status", "in", "(WON,LOST)")
    .lt("follow_up_at", heuteBeginn)
    .order("follow_up_at", { ascending: true })
    .limit(JE_QUELLE);
  let schritte = supabase
    .from("sale_projects")
    .select("id,project_number,next_step,next_step_due_on,contacts(first_name,last_name),properties(property_number)")
    .is("archived_at", null)
    .in("status", ["ACTIVE", "ON_HOLD"])
    .lt("next_step_due_on", heute)
    .order("next_step_due_on", { ascending: true })
    .limit(JE_QUELLE);

  // --- Neu: noch niemand hat sich gemeldet ---------------------------------

  let anfragen = supabase
    .from("inquiries")
    .select("id,inquiry_number,received_at,contacts!inner(first_name,last_name),properties(property_number),search_profiles(search_profile_number)")
    .is("archived_at", null)
    .eq("status", "NEW")
    .order("received_at", { ascending: false })
    .limit(JE_QUELLE);
  let leads = supabase
    .from("leads")
    .select("id,lead_number,created_at,property_city,contacts!inner(first_name,last_name)")
    .is("archived_at", null)
    .eq("status", "NEW")
    .order("created_at", { ascending: false })
    .limit(JE_QUELLE);

  // --- Fristen: ueberfaellig oder in den naechsten FRIST_TAGE Tagen --------

  // Nur die laufende Widerrufsfrist eines Verbrauchers ohne vorzeitiges
  // Verlangen -- dieselbe Bedingung, die der Fahrplan der Objektakte als
  // "Widerruf offen" zeigt. Eine abgelaufene Widerrufsfrist ist keine Frist
  // mehr, deshalb ab heute.
  let widerruf = supabase
    .from("brokerage_mandates")
    .select("id,mandate_number,withdrawal_deadline_on,properties(property_number)")
    .is("archived_at", null)
    .eq("status", "ACTIVE")
    .eq("client_is_consumer", true)
    .is("early_start_requested_on", null)
    .gte("withdrawal_deadline_on", heute)
    .lte("withdrawal_deadline_on", fristEnde)
    .order("withdrawal_deadline_on", { ascending: true })
    .limit(JE_QUELLE);
  let angebote = supabase
    .from("purchase_offers")
    .select("id,offer_number,status,valid_until,properties(property_number)")
    .is("archived_at", null)
    .in("status", ["SUBMITTED", "COUNTERED"])
    .lte("valid_until", fristEnde)
    .order("valid_until", { ascending: true })
    .limit(JE_QUELLE);
  let kaufpreise = supabase
    .from("sale_closings")
    .select("id,closing_number,status,purchase_price_due_date,properties(property_number)")
    .is("archived_at", null)
    .in("status", ["NOTARIZED", "PURCHASE_PRICE_DUE"])
    .lte("purchase_price_due_date", fristEnde)
    .order("purchase_price_due_date", { ascending: true })
    .limit(JE_QUELLE);
  let meilensteine = supabase
    .from("sale_closing_milestones")
    .select("id,title,deadline_on,sale_closing_id,sale_closings!inner(closing_number,status,archived_at,primary_responsible_user,properties(property_number))")
    .is("completed_on", null)
    .is("sale_closings.archived_at", null)
    .not("sale_closings.status", "in", "(COMPLETED,CANCELLED)")
    .lte("deadline_on", fristEnde)
    .order("deadline_on", { ascending: true })
    .limit(JE_QUELLE);
  let provisionen = supabase
    .from("commissions")
    .select("id,commission_number,status,due_date,properties(property_number)")
    .is("archived_at", null)
    .in("status", ["EXPECTED", "DUE", "INVOICED", "PARTIALLY_PAID"])
    .lte("due_date", fristEnde)
    .order("due_date", { ascending: true })
    .limit(JE_QUELLE);

  if (meins) {
    aufgaben = aufgaben.eq("responsible_user", userId);
    wiedervorlagen = wiedervorlagen.eq("primary_responsible_user", userId);
    schritte = schritte.or(`next_step_user.eq.${userId},and(next_step_user.is.null,primary_responsible_user.eq.${userId})`);
    anfragen = anfragen.or(meinOderOffen);
    leads = leads.or(meinOderOffen);
    widerruf = widerruf.eq("primary_responsible_user", userId);
    angebote = angebote.eq("primary_responsible_user", userId);
    kaufpreise = kaufpreise.eq("primary_responsible_user", userId);
    meilensteine = meilensteine.eq("sale_closings.primary_responsible_user", userId);
    provisionen = provisionen.eq("primary_responsible_user", userId);
  }

  const [termine, ...ergebnisse] = await Promise.all([
    ladeTermine(supabase, userId, {
      from: heuteBeginn,
      to: crmDateAtTimeToIso(vorschauEnde, "00:00")!,
      vonTag: heute,
      bisTag: vorschauEnde,
    }, scope),
    aufgaben, wiedervorlagen, schritte, anfragen, leads, widerruf, angebote, kaufpreise, meilensteine, provisionen,
  ]);
  const [aufgabenR, wiedervorlagenR, schritteR, anfragenR, leadsR, widerrufR, angeboteR, kaufpreiseR, meilensteineR, provisionenR] = ergebnisse;

  // Wie im Kalender: eine ausgefallene Quelle macht nicht die ganze Seite
  // dunkel, sie steht als Hinweis da.
  const benannt: Array<[string, { error: unknown }]> = [
    ["Überfällige Aufgaben", aufgabenR], ["Überfällige Wiedervorlagen", wiedervorlagenR], ["Fällige Projektschritte", schritteR],
    ["Neue Anfragen", anfragenR], ["Neue Leads", leadsR], ["Widerrufsfristen", widerrufR], ["Kaufangebote", angeboteR],
    ["Kaufpreisfälligkeiten", kaufpreiseR], ["Meilensteine", meilensteineR], ["Provisionen", provisionenR],
  ];
  const quellenfehler = [...termine.quellenfehler, ...benannt.filter(([, r]) => r.error).map(([n]) => n)];
  const zeilen = (r: { data: unknown }) => (r.data ?? []) as any[];

  const liegengeblieben: Eintrag[] = [
    ...zeilen(aufgabenR).map((r) => ({
      key: `TASK:${r.id}`, art: "Aufgabe", titel: r.title, kontext: r.task_number,
      wann: r.due_at, ganztags: false, pfad: taskSourcePath(r),
    })),
    ...zeilen(wiedervorlagenR).map((r) => ({
      key: `LEAD:${r.id}`, art: "Wiedervorlage", titel: name(one(r.contacts)) || r.lead_number, kontext: r.lead_number,
      wann: r.follow_up_at, ganztags: false, pfad: `/leads/${r.id}`,
    })),
    ...zeilen(schritteR).map((r) => ({
      key: `PROJECT:${r.id}`, art: "Projektschritt", titel: r.next_step || `Nächster Schritt ${r.project_number}`,
      kontext: mitTeilen(r.project_number, name(one(r.contacts)), one(r.properties)?.property_number),
      wann: r.next_step_due_on, ganztags: true, pfad: `/projects/${r.id}`,
    })),
  ].sort((a, b) => a.wann.localeCompare(b.wann));

  const neu: Eintrag[] = [
    ...zeilen(anfragenR).map((r) => ({
      key: `INQUIRY:${r.id}`, art: "Anfrage", titel: name(one(r.contacts)) || r.inquiry_number,
      kontext: mitTeilen(r.inquiry_number, one(r.properties)?.property_number, one(r.search_profiles)?.search_profile_number),
      wann: r.received_at, ganztags: false, pfad: `/inquiries/${r.id}`,
    })),
    ...zeilen(leadsR).map((r) => ({
      key: `NEWLEAD:${r.id}`, art: "Verkäufer-Lead", titel: name(one(r.contacts)) || r.lead_number,
      kontext: mitTeilen(r.lead_number, r.property_city),
      wann: r.created_at, ganztags: false, pfad: `/leads/${r.id}`,
    })),
  ].sort((a, b) => b.wann.localeCompare(a.wann));

  const frist = (e: Eintrag) => ({ ...e, ueberfaellig: e.wann < heute });
  const fristen = [
    ...zeilen(widerrufR).map((r) => frist({
      key: `WITHDRAWAL:${r.id}`, art: "Widerrufsfrist", titel: `Maklerauftrag ${r.mandate_number}`,
      kontext: mitTeilen(one(r.properties)?.property_number, "Verbraucher, kein vorzeitiges Verlangen erfasst"),
      wann: r.withdrawal_deadline_on, ganztags: true, pfad: `/mandates/${r.id}`,
    })),
    ...zeilen(angeboteR).map((r) => frist({
      key: `OFFER:${r.id}`, art: "Angebot gültig bis", titel: `Kaufangebot ${r.offer_number}`,
      kontext: mitTeilen(one(r.properties)?.property_number, beschrifte(KAUFANGEBOTSTATUS, r.status)),
      wann: r.valid_until, ganztags: true, pfad: `/purchase-offers/${r.id}`,
    })),
    ...zeilen(kaufpreiseR).map((r) => frist({
      key: `PRICE:${r.id}`, art: "Kaufpreis fällig", titel: `Abschluss ${r.closing_number}`,
      kontext: mitTeilen(one(r.properties)?.property_number, beschrifte(ABSCHLUSSSTATUS, r.status)),
      wann: r.purchase_price_due_date, ganztags: true, pfad: `/closings/${r.id}`,
    })),
    ...zeilen(meilensteineR).map((r) => {
      const abschluss = one(r.sale_closings) as any;
      return frist({
        key: `MILESTONE:${r.id}`, art: "Meilenstein", titel: r.title,
        kontext: mitTeilen(abschluss?.closing_number, one(abschluss?.properties as any)?.property_number),
        wann: r.deadline_on, ganztags: true, pfad: `/closings/${r.sale_closing_id}/milestones`,
      });
    }),
    ...zeilen(provisionenR).map((r) => frist({
      key: `COMMISSION:${r.id}`, art: "Provision fällig", titel: `Provision ${r.commission_number}`,
      kontext: mitTeilen(one(r.properties)?.property_number, beschrifte(PROVISIONSSTATUS, r.status)),
      wann: r.due_date, ganztags: true, pfad: `/commissions/${r.id}`,
    })),
  ].sort((a, b) => a.wann.localeCompare(b.wann));

  const termineHeute = termine.events.filter((e) => dateKey(e.startsAt) === heute);
  const termineDanach = termine.events.filter((e) => dateKey(e.startsAt) !== heute);

  return {
    heute,
    termineHeute,
    termineDanach,
    liegengeblieben,
    neu,
    fristen,
    sichtbareArten: termine.sichtbareArten,
    quellenfehler,
  };
}
