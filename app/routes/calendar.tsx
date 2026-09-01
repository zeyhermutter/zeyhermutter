import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/calendar";
import { requireActiveUser } from "~/lib/auth.server";
import "~/calendar.css";

type CalendarKind = "TASK" | "LEAD_FOLLOWUP" | "LEAD_VALUATION" | "VIEWING" | "CLOSING_NOTARY";
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
  status: string | null;
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(new Date(value));
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

  if (scope === "mine") {
    taskQuery = taskQuery.eq("responsible_user", userId);
    viewingQuery = viewingQuery.eq("primary_responsible_user", userId);
    followupQuery = followupQuery.eq("primary_responsible_user", userId);
    valuationQuery = valuationQuery.eq("primary_responsible_user", userId);
    closingQuery = closingQuery.eq("primary_responsible_user", userId);
  }

  const [taskResult, viewingResult, followupResult, valuationResult, closingResult] = await Promise.all([
    taskQuery,
    viewingQuery,
    followupQuery,
    valuationQuery,
    closingQuery,
  ]);
  const firstError = [taskResult.error, viewingResult.error, followupResult.error, valuationResult.error, closingResult.error].find(Boolean);
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
      sourceLabel: "Aufgabe / interner Termin",
      exportUrl: exportUrl("task", task.id),
      status: task.status,
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
      sourceLabel: "Wiedervorlage",
      exportUrl: exportUrl("lead_followup", row.id),
      status: null,
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
      sourceLabel: "Eigentümertermin",
      exportUrl: exportUrl("lead_valuation", row.id),
      status: null,
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
      sourceLabel: "Besichtigung",
      exportUrl: exportUrl("viewing", row.id),
      status: row.status,
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
      sourceLabel: "Notartermin",
      exportUrl: exportUrl("closing_notary", row.id),
      status: row.status,
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

    <section className="data-card" style={{ marginTop: 18 }}>
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

      <div className="calendar-agenda">
        {Object.entries(grouped).map(([day, dayEvents]) => <section className="calendar-day" key={day}>
          <div className="calendar-day-label"><strong>{formatDay(day)}</strong><small>{dayEvents.length} {dayEvents.length === 1 ? "Termin" : "Termine"}</small></div>
          <div className="calendar-day-events">
            {dayEvents.map((event) => <article className="calendar-event" key={event.key}>
              <div className="calendar-event-time"><strong>{formatTime(event.startsAt)}</strong>{event.endsAt ? <small>bis {formatTime(event.endsAt)}</small> : null}</div>
              <div className="calendar-event-main"><strong>{event.title}</strong><p>{event.subtitle}</p><span className="calendar-kind">{event.sourceLabel}{event.status ? ` · ${event.status}` : ""}</span></div>
              <div className="calendar-event-actions"><Link className="subtle-link" to={event.sourcePath}>CRM öffnen →</Link><a className="secondary-button link-button compact" href={event.exportUrl}>.ics</a></div>
            </article>)}
          </div>
        </section>)}
        {events.length === 0 ? <p className="empty-state">Im gewählten Monat sind für diese Ansicht keine CRM-Termine vorhanden.</p> : null}
      </div>
    </section>
  </main>;
}
