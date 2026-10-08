import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/calendar";
import { requireActiveUser } from "~/lib/auth.server";
import { uhrzeit as formatTime } from "~/lib/format";
import {
  ABSCHLUSSSTATUS, AUFGABENSTATUS, AUFMASSPAKET, AUFMASSSTATUS, BESICHTIGUNGSSTATUS, CHECKSTATUS,
  beschrifte,
} from "~/lib/labels";
import { PHASE as VERKAUFSPHASE } from "./projects";
import { TERMINKATEGORIEN, kategorie, type Terminkategorie } from "~/lib/terminkategorien";
import "~/calendar.css";

type CalendarKind = Terminkategorie;
type CalendarEvent = {
  key: string;
  kind: CalendarKind;
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string | null;
  sourcePath: string;
  sourceLabel: string;
  exportUrl: string;
  statusLabel: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function berlinParts(value: Date) {
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

function berlinLocalToIso(value: string) {
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

function currentBerlinMonth() {
  const parts = berlinParts(new Date());
  return `${parts.year}-${parts.month}`;
}

function validMonth(value: string | null) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : currentBerlinMonth();
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string) {
  const next = shiftMonth(month, 1);
  const from = berlinLocalToIso(`${month}-01T00:00`);
  const to = berlinLocalToIso(`${next}-01T00:00`);
  if (!from || !to) throw new Response("Kalenderzeitraum ist ungültig.", { status: 400 });
  return { from, to };
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(Date.UTC(year, monthNumber - 1, 15, 12)));
}

function dateKey(value: string) {
  const parts = berlinParts(new Date(value));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(`${value}T12:00:00Z`));
}

function heuteBerlin() {
  const parts = berlinParts(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

type Rasterzelle = { tagSchluessel: string; tagZahl: number; imMonat: boolean; wochenende: boolean };

/**
 * Das Monatsraster: volle Wochen von Montag bis Sonntag, mit den angrenzenden
 * Tagen des Vor- und Folgemonats aufgefuellt.
 *
 * Gerechnet wird in UTC, weil hier nur Kalenderdaten vorkommen -- der 14. ist
 * der 14., unabhaengig von der Zeitzone. Die Zuordnung eines Termins zu einem
 * Tag passiert vorher in dateKey(), und zwar in Europe/Berlin.
 */
function monatsraster(month: string): Rasterzelle[][] {
  const [jahr, monatsNummer] = month.split("-").map(Number);
  const erster = new Date(Date.UTC(jahr, monatsNummer - 1, 1));
  const versatz = (erster.getUTCDay() + 6) % 7;
  const tageImMonat = new Date(Date.UTC(jahr, monatsNummer, 0)).getUTCDate();
  const zellen = Math.ceil((versatz + tageImMonat) / 7) * 7;
  const wochen: Rasterzelle[][] = [];
  for (let i = 0; i < zellen; i += 1) {
    const tag = new Date(Date.UTC(jahr, monatsNummer - 1, 1 - versatz + i));
    const tagSchluessel = `${tag.getUTCFullYear()}-${String(tag.getUTCMonth() + 1).padStart(2, "0")}-${String(tag.getUTCDate()).padStart(2, "0")}`;
    if (i % 7 === 0) wochen.push([]);
    wochen[wochen.length - 1].push({
      tagSchluessel,
      tagZahl: tag.getUTCDate(),
      imMonat: tagSchluessel.startsWith(`${month}-`),
      wochenende: i % 7 >= 5,
    });
  }
  return wochen;
}

/**
 * Wie viele Marken in eine Tageszelle passen -- eine Rechnung, keine Setzung.
 * Die Spalte ist 452 Pixel breit, auf schmaleren Bildschirmen 430; sieben Tage
 * ergeben 61 bis 64 Pixel je Zelle, davon 8 Innenabstand. Fuer Marken bleiben
 * 53 Pixel -- drei Marken von 15 Pixeln mit 2 Pixeln Abstand ergeben 49. Ab dem
 * vierten Termin stehen zwei Marken und eine Zahl da, damit die Zeile nicht
 * umbricht und die Wochen gleich hoch bleiben.
 */
const MARKEN_JE_TAG = 3;

function Monatsraster({ month, grouped }: { month: string; grouped: Record<string, CalendarEvent[]> }) {
  const wochen = monatsraster(month);
  const heute = heuteBerlin();
  const anzahl = new Map(TERMINKATEGORIEN.map((k) => [k.schluessel, 0]));
  for (const tagesTermine of Object.values(grouped)) {
    for (const termin of tagesTermine) anzahl.set(termin.kind, (anzahl.get(termin.kind) ?? 0) + 1);
  }

  return <aside className="calendar-monat" aria-label={`Monatsübersicht ${monthLabel(month)}`}>
    <div className="calendar-monat-kopf">
      <strong>Monatsübersicht</strong>
      <small>{Object.values(grouped).reduce((summe, tag) => summe + tag.length, 0)} Termine</small>
    </div>

    <div className="monatsraster-rahmen">
      <table className="monatsraster">
        <caption className="sr-only">Termine im Monat {monthLabel(month)}, nach Kategorie gekennzeichnet</caption>
        <thead>
          <tr>{WOCHENTAGE.map((tag) => <th key={tag} scope="col">{tag}</th>)}</tr>
        </thead>
        <tbody>
          {wochen.map((woche) => <tr key={woche[0].tagSchluessel}>
            {woche.map((zelle) => {
              const tagesTermine = grouped[zelle.tagSchluessel] ?? [];
              const sichtbar = tagesTermine.length > MARKEN_JE_TAG ? MARKEN_JE_TAG - 1 : MARKEN_JE_TAG;
              const klassen = ["monatsraster-tag"];
              if (!zelle.imMonat) klassen.push("monatsraster-fremd");
              if (zelle.wochenende) klassen.push("monatsraster-wochenende");
              if (zelle.tagSchluessel === heute) klassen.push("monatsraster-heute");
              const inhalt = <>
                <span className="monatsraster-zahl">{zelle.tagZahl}</span>
                {tagesTermine.length > 0 ? <span className="monatsraster-marken">
                  {tagesTermine.slice(0, sichtbar).map((termin) => {
                    const art = kategorie(termin.kind);
                    return <span className={`termin-marke ${art.klasse}`} key={termin.key} title={`${formatTime(termin.startsAt)} · ${art.beschriftung}: ${termin.title}`}>{art.kuerzel}</span>;
                  })}
                  {tagesTermine.length > sichtbar ? <span className="termin-weitere">+{tagesTermine.length - sichtbar}</span> : null}
                </span> : null}
              </>;
              return <td key={zelle.tagSchluessel}>
                {tagesTermine.length > 0
                  ? <a className={klassen.join(" ")} href={`#tag-${zelle.tagSchluessel}`} aria-label={`${formatDay(zelle.tagSchluessel)}, ${tagesTermine.length} ${tagesTermine.length === 1 ? "Termin" : "Termine"}`}>{inhalt}</a>
                  : <span className={klassen.join(" ")}>{inhalt}</span>}
              </td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div>

    <ul className="monatsraster-legende">
      {TERMINKATEGORIEN.map((art) => <li key={art.schluessel}>
        <span className={`termin-marke ${art.klasse}`} aria-hidden="true">{art.kuerzel}</span>
        <span className="monatsraster-legende-text">{art.beschriftung}</span>
        <span className="monatsraster-legende-zahl">{anzahl.get(art.schluessel) ?? 0}</span>
      </li>)}
    </ul>
  </aside>;
}

function minuteKey(value: string) {
  return Math.floor(new Date(value).getTime() / 60_000);
}

function taskSourcePath(task: any) {
  if (task.viewing_id) return `/viewings/${task.viewing_id}`;
  if (task.inquiry_id) return `/inquiries/${task.inquiry_id}`;
  if (task.lead_id) return `/leads/${task.lead_id}`;
  if (task.property_id) return `/properties/${task.property_id}`;
  if (task.search_profile_id) return `/search-profiles/${task.search_profile_id}`;
  return "/crm/tasks";
}

function contextDescription(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" · ") || "CRM-Termin";
}

function exportUrl(kind: string, id: string) {
  return `/crm/calendar/event.ics?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile, userId } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const month = validMonth(url.searchParams.get("month"));
  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine";
  const { from, to } = monthBounds(month);

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
  let projectQuery = supabase
    .from("sale_projects")
    .select("id,project_number,phase,follow_up_at,primary_responsible_user,contacts(first_name,last_name),properties(property_number,internal_title)")
    .is("archived_at", null)
    .not("follow_up_at", "is", null)
    .gte("follow_up_at", from)
    .lt("follow_up_at", to)
    .order("follow_up_at", { ascending: true });
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
    projectQuery = projectQuery.eq("primary_responsible_user", userId);
    handoverQuery = handoverQuery.eq("sale_closings.primary_responsible_user", userId);
    taskQuery = taskQuery.eq("responsible_user", userId);
    viewingQuery = viewingQuery.eq("primary_responsible_user", userId);
    followupQuery = followupQuery.eq("primary_responsible_user", userId);
    valuationQuery = valuationQuery.eq("primary_responsible_user", userId);
    closingQuery = closingQuery.eq("primary_responsible_user", userId);
  }

  const [taskResult, viewingResult, followupResult, valuationResult, closingResult, measurementResult, projectResult, inspectionResult, handoverResult] = await Promise.all([
    taskQuery,
    viewingQuery,
    followupQuery,
    valuationQuery,
    closingQuery,
    measurementQuery,
    projectQuery,
    inspectionQuery,
    handoverQuery,
  ]);
  const firstError = [taskResult.error, viewingResult.error, followupResult.error, valuationResult.error, closingResult.error,
    measurementResult.error, projectResult.error, inspectionResult.error, handoverResult.error].find(Boolean);
  if (firstError) throw new Response("CRM-Kalender konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });

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
      sourcePath: `/measurements/${row.id}`,
      sourceLabel: kategorie("MEASUREMENT").beschriftung,
      exportUrl: exportUrl("measurement", row.id),
      statusLabel: beschrifte(AUFMASSSTATUS, row.status),
    });
  }

  for (const row of (projectResult.data ?? []) as any[]) {
    if (!row.follow_up_at) continue;
    const contact = one(row.contacts) as { first_name: string; last_name: string } | null;
    const property = one(row.properties) as { property_number: string; internal_title: string } | null;
    events.push({
      key: `PROJECT_FOLLOWUP:${row.id}`,
      kind: "PROJECT_FOLLOWUP",
      title: `Wiedervorlage ${row.project_number}`,
      subtitle: contextDescription([
        contact ? `${contact.first_name} ${contact.last_name}` : null,
        property?.property_number,
      ]),
      startsAt: row.follow_up_at,
      endsAt: null,
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
      sourcePath: `/closings/${closing.id}/milestones`,
      sourceLabel: kategorie("HANDOVER").beschriftung,
      exportUrl: exportUrl("handover", row.id),
      statusLabel: beschrifte(ABSCHLUSSSTATUS, closing.status),
    });
  }

  events.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const grouped = events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const key = dateKey(event.startsAt);
    (acc[key] ??= []).push(event);
    return acc;
  }, {});

  return data({ month, scope, events, grouped, profile }, { headers: responseHeaders() });
}

export default function CalendarPage() {
  const { month, scope, events, grouped, profile } = useLoaderData<typeof loader>();
  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const currentMonth = currentBerlinMonth();

  return <main className="calendar-shell">
    <header className="calendar-header">
      <div>
        <p className="eyebrow">Arbeitsplatz · Integration</p>
        <h1>Kalender</h1>
        <p>Eine gemeinsame Agenda aus den führenden CRM-Datensätzen. Termine werden hier nicht dupliziert, sondern an ihrer fachlichen Quelle gepflegt.</p>
      </div>
      <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
    </header>

    <section className="data-card">
      <div className="card-head"><div><p className="eyebrow">Integrationsarchitektur</p><h2>CRM ist die führende Terminquelle</h2></div></div>
      <div className="calendar-provider-status">
        <div><span>Kalender-Provider</span><strong>Nicht verbunden</strong></div>
        <div><span>Terminquellen</span><strong>Aufgaben · Leads · Besichtigungen · Abschlüsse</strong></div>
        <div><span>Externer Kalender</span><strong>iCalendar (.ics) Export</strong></div>
      </div>
      <p className="calendar-note">Ein Export erzeugt eine Kalenderdatei aus dem bestehenden CRM-Termin. Änderungen werden weiterhin im zugehörigen CRM-Datensatz vorgenommen; es entsteht kein zweiter synchroner Terminbestand.</p>
    </section>

    <section className="data-card">
      <div className="calendar-toolbar">
        <div className="calendar-toolbar-group">
          <Link className="secondary-button link-button compact" to={`/crm/calendar?month=${previousMonth}&scope=${scope}`}>←</Link>
          <span className="calendar-month-title">{monthLabel(month)}</span>
          <Link className="secondary-button link-button compact" to={`/crm/calendar?month=${nextMonth}&scope=${scope}`}>→</Link>
          {month !== currentMonth ? <Link className="subtle-link" to={`/crm/calendar?month=${currentMonth}&scope=${scope}`}>Heute</Link> : null}
        </div>
        <div className="calendar-toolbar-group">
          <Link className={scope === "mine" ? "primary-button link-button compact" : "secondary-button link-button compact"} to={`/crm/calendar?month=${month}&scope=mine`}>Meine Termine</Link>
          <Link className={scope === "all" ? "primary-button link-button compact" : "secondary-button link-button compact"} to={`/crm/calendar?month=${month}&scope=all`}>Alle sichtbaren</Link>
        </div>
      </div>

      <div className="calendar-source-links">
        <Link className="subtle-link" to="/crm/tasks">Aufgaben öffnen</Link>
        <Link className="subtle-link" to="/viewings">Besichtigungen öffnen</Link>
        <Link className="subtle-link" to="/leads">Verkäufer-Leads öffnen</Link>
        <Link className="subtle-link" to="/closings">Abschlüsse & Notar öffnen</Link>
      </div>

      <div className="calendar-ansichten">
        <div className="calendar-agenda">
          {Object.entries(grouped).map(([day, dayEvents]) => <section className="calendar-day" key={day} id={`tag-${day}`}>
            <div className="calendar-day-label"><strong>{formatDay(day)}</strong><small>{dayEvents.length} {dayEvents.length === 1 ? "Termin" : "Termine"}</small></div>
            <div className="calendar-day-events">
              {dayEvents.map((event) => <article className="calendar-event" key={event.key}>
                <div className="calendar-event-time"><strong>{formatTime(event.startsAt)}</strong>{event.endsAt ? <small>bis {formatTime(event.endsAt)}</small> : null}</div>
                <div className="calendar-event-main"><strong>{event.title}</strong><p>{event.subtitle}</p><span className={`calendar-kind ${kategorie(event.kind).klasse}`}>{event.sourceLabel}{event.statusLabel ? ` · ${event.statusLabel}` : ""}</span></div>
                <div className="calendar-event-actions"><Link className="subtle-link" to={event.sourcePath}>CRM öffnen →</Link><a className="secondary-button link-button compact" href={event.exportUrl}>.ics</a></div>
              </article>)}
            </div>
          </section>)}
          {events.length === 0 ? <p className="empty-state">Im gewählten Monat sind für diese Ansicht keine CRM-Termine vorhanden.</p> : null}
        </div>

        <Monatsraster month={month} grouped={grouped} />
      </div>
    </section>
  </main>;
}
