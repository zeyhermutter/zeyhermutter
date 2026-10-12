// Die Termine aus allen fachlichen Quellen -- an einer Stelle.
//
// WARUM ES DIESE DATEI GIBT
//
// Bis 12.10.2026 stand das Laden im Kalender (routes/calendar.tsx). Mit
// "Mein Tag" braucht eine zweite Seite dieselben Termine, nur fuer einen
// Tag statt fuer einen Monat. Zwei Kopien der neun Abfragen liefen
// auseinander, sobald eine zehnte Quelle dazukommt oder eine Spalte
// wechselt -- genau das hat check-terminquellen am 08.10.2026 im Kalender
// schon einmal gefunden (follow_up_at statt next_step_due_on). Deshalb laden
// Kalender und Mein Tag hier, mit demselben Code.
//
// scripts/check-terminquellen.mjs und check-terminfarben.mjs lesen diese
// Datei zusammen mit routes/calendar.tsx.

import type { SupabaseClient } from "@supabase/supabase-js";
import { crmDateAtTimeToIso } from "~/lib/local-time";
import {
  ABSCHLUSSSTATUS, AUFGABENSTATUS, AUFMASSPAKET, AUFMASSSTATUS, BESICHTIGUNGSSTATUS, CHECKSTATUS,
  beschrifte,
} from "~/lib/labels";
import { PHASE as VERKAUFSPHASE } from "~/routes/projects";
import { TERMINKATEGORIEN, kategorie, type Terminkategorie } from "~/lib/terminkategorien";

export type CalendarKind = Terminkategorie;
export type CalendarEvent = {
  key: string;
  kind: CalendarKind;
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string | null;
  /** Quellspalte ist ein Datum ohne Uhrzeit -- keine Uhrzeit erfinden. */
  ganztags: boolean;
  sourcePath: string;
  sourceLabel: string;
  exportUrl: string;
  statusLabel: string | null;
};

export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function berlinParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function berlinLocalToIso(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const target = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  let guess = target;
  for (let i = 0; i < 2; i += 1) {
    const shownParts = berlinParts(new Date(guess));
    const shown = Date.UTC(+shownParts.year, +shownParts.month - 1, +shownParts.day, +shownParts.hour, +shownParts.minute);
    guess = target - (shown - guess);
  }
  return new Date(guess).toISOString();
}

/**
 * Der Tagesbeginn in Berlin als Zeitpunkt. Macht aus einer Datumsspalte
 * einen Eintrag, den dateKey() wieder genau diesem Tag zuordnet -- ohne eine
 * Uhrzeit zu behaupten, die in der Datenbank nicht steht.
 */
export function tagesanfangIso(datum: string) {
  return crmDateAtTimeToIso(datum, "00:00");
}

export function dateKey(value: string) {
  const parts = berlinParts(new Date(value));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function minuteKey(value: string) {
  return Math.floor(new Date(value).getTime() / 60_000);
}

export function taskSourcePath(task: any) {
  if (task.viewing_id) return `/viewings/${task.viewing_id}`;
  if (task.inquiry_id) return `/inquiries/${task.inquiry_id}`;
  if (task.lead_id) return `/leads/${task.lead_id}`;
  if (task.property_id) return `/properties/${task.property_id}`;
  if (task.search_profile_id) return `/search-profiles/${task.search_profile_id}`;
  return "/crm/tasks";
}

export function contextDescription(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" · ") || "CRM-Termin";
}

export function exportUrl(kind: string, id: string) {
  return `/crm/calendar/event.ics?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;
}

/** Ein Zeitraum: Zeitpunkte fuer Zeitspalten, Tage fuer Datumsspalten (bisTag ausschliesslich). */
export type Zeitraum = { from: string; to: string; vonTag: string; bisTag: string };

/**
 * Alle Termine im Zeitraum, sortiert, nur aus Kategorien, die der Benutzer
 * lesen darf. Faellt eine Quelle aus, steht sie in quellenfehler -- der Rest
 * bleibt lesbar.
 */
export async function ladeTermine(
  supabase: SupabaseClient,
  userId: string,
  { from, to, vonTag, bisTag }: Zeitraum,
  scope: "mine" | "all",
): Promise<{ events: CalendarEvent[]; sichtbareArten: Terminkategorie[]; quellenfehler: string[] }> {
  let taskQuery = supabase
    .from("tasks")
    .select("id,task_number,title,description,status,due_at,responsible_user,contact_id,property_id,lead_id,inquiry_id,search_profile_id,viewing_id")
    .is("archived_at", null)
    .gte("due_at", from)
    .lt("due_at", to)
    .order("due_at", { ascending: true });
  let viewingQuery = supabase
    .from("viewings")
    .select("id,viewing_number,status,starts_at,ends_at,meeting_point,primary_responsible_user,contacts(first_name,last_name),properties(property_number,internal_title)")
    .is("archived_at", null)
    .gte("starts_at", from)
    .lt("starts_at", to)
    .order("starts_at", { ascending: true });
  let followupQuery = supabase
    .from("leads")
    .select("id,lead_number,follow_up_at,primary_responsible_user,contacts!inner(first_name,last_name)")
    .is("archived_at", null)
    .not("follow_up_at", "is", null)
    .gte("follow_up_at", from)
    .lt("follow_up_at", to)
    .order("follow_up_at", { ascending: true });
  let valuationQuery = supabase
    .from("leads")
    .select("id,lead_number,valuation_appointment_at,primary_responsible_user,property_street,property_house_number,property_postal_code,property_city,contacts!inner(first_name,last_name)")
    .is("archived_at", null)
    .not("valuation_appointment_at", "is", null)
    .gte("valuation_appointment_at", from)
    .lt("valuation_appointment_at", to)
    .order("valuation_appointment_at", { ascending: true });
  let closingQuery = supabase
    .from("sale_closings")
    .select("id,closing_number,status,notary_appointment_at,primary_responsible_user,properties(property_number,internal_title)")
    .is("archived_at", null)
    .not("notary_appointment_at", "is", null)
    .gte("notary_appointment_at", from)
    .lt("notary_appointment_at", to)
    .order("notary_appointment_at", { ascending: true });

  let measurementQuery = supabase
    .from("measurement_orders")
    .select("id,order_number,service_package,status,appointment_at,object_street,object_house_number,object_postal_code,object_city,primary_responsible_user,contacts(first_name,last_name),properties(property_number,internal_title)")
    .is("archived_at", null)
    .not("appointment_at", "is", null)
    .gte("appointment_at", from)
    .lt("appointment_at", to)
    .order("appointment_at", { ascending: true });
  // Gelesen wird next_step_due_on, nicht follow_up_at.
  //
  // follow_up_at steht seit der Gruendungsmigration in sale_projects und wird
  // von keiner Stelle der Anwendung geschrieben -- weder von projects.tsx noch
  // von project-detail.tsx. Gepflegt wird der naechste Schritt mit Faelligkeit
  // (next_step, next_step_due_on, next_step_user). Der Kalender las am
  // 08.10.2026 die leere Spalte: eine Kategorie mit Farbe, Kuerzel und
  // Legendenzeile, die nie einen Eintrag erzeugen konnte.
  //
  // next_step_due_on ist ein Datum ohne Uhrzeit. Der Eintrag laeuft deshalb
  // als ganztaegig; eine Uhrzeit waere erfunden.
  let projectQuery = supabase
    .from("sale_projects")
    .select("id,project_number,phase,next_step,next_step_due_on,next_step_user,primary_responsible_user,contacts(first_name,last_name),properties(property_number,internal_title)")
    .is("archived_at", null)
    .not("next_step_due_on", "is", null)
    .gte("next_step_due_on", vonTag)
    .lt("next_step_due_on", bisTag)
    .order("next_step_due_on", { ascending: true });
  // Das Uebergabeprotokoll hat selbst keinen Verantwortlichen und kein
  // Archivkennzeichen -- beides haengt am Abschluss, zu dem es gehoert.
  let inspectionQuery = supabase
    .from("lead_sales_readiness_checks")
    .select("id,lead_id,status,inspection_at,responsible_user,leads(lead_number,contacts(first_name,last_name)),properties(property_number,internal_title)")
    .eq("is_current", true)
    .not("inspection_at", "is", null)
    .gte("inspection_at", from)
    .lt("inspection_at", to)
    .order("inspection_at", { ascending: true });
  let handoverQuery = supabase
    .from("sale_handover_protocols")
    .select("id,handover_at,sale_closing_id,sale_closings!inner(id,closing_number,status,primary_responsible_user,archived_at,properties(property_number,internal_title))")
    .not("handover_at", "is", null)
    .gte("handover_at", from)
    .lt("handover_at", to)
    .order("handover_at", { ascending: true });

  if (scope === "mine") {
    inspectionQuery = inspectionQuery.eq("responsible_user", userId);
    measurementQuery = measurementQuery.eq("primary_responsible_user", userId);
    // Der faellige Schritt hat einen eigenen Verantwortlichen. Hat er keinen,
    // zaehlt der des Projekts -- sonst waere ein Schritt ohne Zuweisung in
    // "Meine Termine" fuer niemanden sichtbar.
    projectQuery = projectQuery.or(`next_step_user.eq.${userId},and(next_step_user.is.null,primary_responsible_user.eq.${userId})`);
    handoverQuery = handoverQuery.eq("sale_closings.primary_responsible_user", userId);
    taskQuery = taskQuery.eq("responsible_user", userId);
    viewingQuery = viewingQuery.eq("primary_responsible_user", userId);
    followupQuery = followupQuery.eq("primary_responsible_user", userId);
    valuationQuery = valuationQuery.eq("primary_responsible_user", userId);
    closingQuery = closingQuery.eq("primary_responsible_user", userId);
  }

  // Die Rechte, ohne die eine Quelle gar nicht lesbar ist, stehen an der
  // Kategorie. Fehlt eines, verschwindet die Kategorie aus Legende und
  // Agenda -- statt als farbige Zeile zu stehen, die nie etwas beschriftet.
  const benoetigteRechte = [...new Set(TERMINKATEGORIEN.map((art) => art.berechtigung).filter(Boolean))] as string[];

  const [ergebnisse, rechteErgebnisse] = await Promise.all([
    Promise.all([taskQuery, viewingQuery, followupQuery, valuationQuery, closingQuery, measurementQuery, projectQuery, inspectionQuery, handoverQuery]),
    Promise.all(benoetigteRechte.map((recht) => supabase.rpc("current_user_has_permission", { p_permission: recht }))),
  ]);
  const [taskResult, viewingResult, followupResult, valuationResult, closingResult, measurementResult, projectResult, inspectionResult, handoverResult] = ergebnisse;

  const erlaubt = new Map(benoetigteRechte.map((recht, i) => [recht, rechteErgebnisse[i]?.data === true]));
  const sichtbareArten = TERMINKATEGORIEN
    .filter((art) => !art.berechtigung || erlaubt.get(art.berechtigung) === true)
    .map((art) => art.schluessel);

  // Neun Quellen an einem 500 aufzuhaengen war bei fuenf eine Entscheidung
  // und ist bei neun eine Wette: eine stillgelegte Tabelle oder ein fehlendes
  // Recht haette den ganzen Kalender dunkel gemacht. Faellt eine Quelle aus,
  // steht das als Hinweis ueber der Agenda -- der Rest bleibt lesbar.
  const quellen: Array<[Terminkategorie, { error: unknown } | undefined]> = [
    ["TASK", taskResult], ["VIEWING", viewingResult], ["LEAD_FOLLOWUP", followupResult],
    ["LEAD_VALUATION", valuationResult], ["CLOSING_NOTARY", closingResult], ["MEASUREMENT", measurementResult],
    ["PROJECT_FOLLOWUP", projectResult], ["READINESS_INSPECTION", inspectionResult], ["HANDOVER", handoverResult],
  ];
  const quellenfehler = quellen
    .filter(([art, ergebnis]) => ergebnis?.error && sichtbareArten.includes(art))
    .map(([art]) => kategorie(art).beschriftung);

  const tasks = taskResult.data ?? [];
  const taskLeadTimes = new Set(
    tasks
      .filter((task: any) => task.lead_id && task.due_at)
      .map((task: any) => `${task.lead_id}:${minuteKey(task.due_at)}`),
  );
  const events: CalendarEvent[] = [];

  for (const task of tasks as any[]) {
    events.push({
      key: `TASK:${task.id}`,
      kind: "TASK",
      title: task.title,
      subtitle: contextDescription([task.task_number, task.description]),
      startsAt: task.due_at,
      endsAt: null,
      ganztags: false,
      sourcePath: taskSourcePath(task),
      sourceLabel: kategorie("TASK").beschriftung,
      exportUrl: exportUrl("task", task.id),
      statusLabel: beschrifte(AUFGABENSTATUS, task.status),
    });
  }

  for (const row of (followupResult.data ?? []) as any[]) {
    if (!row.follow_up_at || taskLeadTimes.has(`${row.id}:${minuteKey(row.follow_up_at)}`)) continue;
    const contact = one(row.contacts) as { first_name: string; last_name: string } | null;
    events.push({
      key: `LEAD_FOLLOWUP:${row.id}`,
      kind: "LEAD_FOLLOWUP",
      title: `Wiedervorlage ${row.lead_number}`,
      subtitle: contact ? `${contact.first_name} ${contact.last_name}` : row.lead_number,
      startsAt: row.follow_up_at,
      endsAt: null,
      ganztags: false,
      sourcePath: `/leads/${row.id}`,
      sourceLabel: kategorie("LEAD_FOLLOWUP").beschriftung,
      exportUrl: exportUrl("lead_followup", row.id),
      statusLabel: null,
    });
  }

  for (const row of (valuationResult.data ?? []) as any[]) {
    if (!row.valuation_appointment_at) continue;
    const contact = one(row.contacts) as { first_name: string; last_name: string } | null;
    const address = [row.property_street, row.property_house_number, row.property_postal_code, row.property_city].filter(Boolean).join(" ");
    events.push({
      key: `LEAD_VALUATION:${row.id}`,
      kind: "LEAD_VALUATION",
      title: `Eigentümer-/Bewertungstermin ${row.lead_number}`,
      subtitle: contextDescription([contact ? `${contact.first_name} ${contact.last_name}` : null, address]),
      startsAt: row.valuation_appointment_at,
      endsAt: null,
      ganztags: false,
      sourcePath: `/leads/${row.id}`,
      sourceLabel: kategorie("LEAD_VALUATION").beschriftung,
      exportUrl: exportUrl("lead_valuation", row.id),
      statusLabel: null,
    });
  }

  for (const row of (viewingResult.data ?? []) as any[]) {
    const contact = one(row.contacts) as { first_name: string; last_name: string } | null;
    const property = one(row.properties) as { property_number: string; internal_title: string } | null;
    events.push({
      key: `VIEWING:${row.id}`,
      kind: "VIEWING",
      title: `Besichtigung ${row.viewing_number}`,
      subtitle: contextDescription([contact ? `${contact.first_name} ${contact.last_name}` : null, property?.property_number, row.meeting_point]),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      ganztags: false,
      sourcePath: `/viewings/${row.id}`,
      sourceLabel: kategorie("VIEWING").beschriftung,
      exportUrl: exportUrl("viewing", row.id),
      statusLabel: beschrifte(BESICHTIGUNGSSTATUS, row.status),
    });
  }

  for (const row of (closingResult.data ?? []) as any[]) {
    if (!row.notary_appointment_at) continue;
    const property = one(row.properties) as { property_number: string; internal_title: string } | null;
    events.push({
      key: `CLOSING_NOTARY:${row.id}`,
      kind: "CLOSING_NOTARY",
      title: `Notartermin ${row.closing_number}`,
      subtitle: contextDescription([property?.property_number, property?.internal_title]),
      startsAt: row.notary_appointment_at,
      endsAt: null,
      ganztags: false,
      sourcePath: `/closings/${row.id}`,
      sourceLabel: kategorie("CLOSING_NOTARY").beschriftung,
      exportUrl: exportUrl("closing_notary", row.id),
      statusLabel: beschrifte(ABSCHLUSSSTATUS, row.status),
    });
  }

  for (const row of (measurementResult.data ?? []) as any[]) {
    if (!row.appointment_at) continue;
    const contact = one(row.contacts) as { first_name: string; last_name: string } | null;
    const property = one(row.properties) as { property_number: string; internal_title: string } | null;
    const anschrift = [[row.object_street, row.object_house_number].filter(Boolean).join(" "),
      [row.object_postal_code, row.object_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    events.push({
      key: `MEASUREMENT:${row.id}`,
      kind: "MEASUREMENT",
      title: `Aufmaß ${row.order_number}`,
      subtitle: contextDescription([
        beschrifte(AUFMASSPAKET, row.service_package),
        property?.property_number ?? anschrift,
        contact ? `${contact.first_name} ${contact.last_name}` : null,
      ]),
      startsAt: row.appointment_at,
      endsAt: null,
      ganztags: false,
      sourcePath: `/measurements/${row.id}`,
      sourceLabel: kategorie("MEASUREMENT").beschriftung,
      exportUrl: exportUrl("measurement", row.id),
      statusLabel: beschrifte(AUFMASSSTATUS, row.status),
    });
  }

  for (const row of (projectResult.data ?? []) as any[]) {
    const beginn = row.next_step_due_on ? tagesanfangIso(row.next_step_due_on) : null;
    if (!beginn) continue;
    const contact = one(row.contacts) as { first_name: string; last_name: string } | null;
    const property = one(row.properties) as { property_number: string; internal_title: string } | null;
    events.push({
      key: `PROJECT_FOLLOWUP:${row.id}`,
      kind: "PROJECT_FOLLOWUP",
      title: row.next_step ? `${row.next_step} (${row.project_number})` : `Fälliger Schritt ${row.project_number}`,
      subtitle: contextDescription([
        contact ? `${contact.first_name} ${contact.last_name}` : null,
        property?.property_number,
      ]),
      startsAt: beginn,
      endsAt: null,
      ganztags: true,
      sourcePath: `/projects/${row.id}`,
      sourceLabel: kategorie("PROJECT_FOLLOWUP").beschriftung,
      exportUrl: exportUrl("project_followup", row.id),
      statusLabel: beschrifte(VERKAUFSPHASE, row.phase),
    });
  }

  for (const row of (inspectionResult.data ?? []) as any[]) {
    if (!row.inspection_at) continue;
    const lead = one(row.leads) as any;
    const contact = one(lead?.contacts) as { first_name: string; last_name: string } | null;
    const property = one(row.properties) as { property_number: string; internal_title: string } | null;
    events.push({
      key: `READINESS_INSPECTION:${row.id}`,
      kind: "READINESS_INSPECTION",
      title: `Begehung ${lead?.lead_number ?? "Verkaufsstrategie-Check"}`,
      subtitle: contextDescription([
        contact ? `${contact.first_name} ${contact.last_name}` : null,
        property?.property_number,
      ]),
      startsAt: row.inspection_at,
      endsAt: null,
      ganztags: false,
      sourcePath: `/leads/${row.lead_id}/sales-readiness`,
      sourceLabel: kategorie("READINESS_INSPECTION").beschriftung,
      exportUrl: exportUrl("readiness_inspection", row.id),
      statusLabel: beschrifte(CHECKSTATUS, row.status),
    });
  }

  for (const row of (handoverResult.data ?? []) as any[]) {
    const closing = one(row.sale_closings) as any;
    if (!row.handover_at || !closing || closing.archived_at) continue;
    const property = one(closing.properties) as { property_number: string; internal_title: string } | null;
    events.push({
      key: `HANDOVER:${row.id}`,
      kind: "HANDOVER",
      title: `Übergabe ${closing.closing_number}`,
      subtitle: contextDescription([property?.property_number, property?.internal_title]),
      startsAt: row.handover_at,
      endsAt: null,
      ganztags: false,
      sourcePath: `/closings/${closing.id}/milestones`,
      sourceLabel: kategorie("HANDOVER").beschriftung,
      exportUrl: exportUrl("handover", row.id),
      statusLabel: beschrifte(ABSCHLUSSSTATUS, closing.status),
    });
  }

  const sichtbar = events.filter((event) => sichtbareArten.includes(event.kind));
  sichtbar.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return { events: sichtbar, sichtbareArten, quellenfehler };
}
