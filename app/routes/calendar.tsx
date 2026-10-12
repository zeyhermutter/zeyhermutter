import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/calendar";
import { requireActiveUser } from "~/lib/auth.server";
import { uhrzeit as formatTime } from "~/lib/format";
import { TERMINKATEGORIEN, kategorie, uebersichtsWege, type Terminkategorie } from "~/lib/terminkategorien";
import { berlinLocalToIso, berlinParts, dateKey, ladeTermine, type CalendarEvent } from "~/lib/termine";
import "~/calendar.css";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  // Datumsspalten (date) brauchen Datumsgrenzen, keine Zeitpunkte: der
  // 31.10. gehoert zum Oktober, auch wenn der Oktober in Berlin erst um
  // 22:00 UTC endet.
  return { from, to, vonTag: `${month}-01`, bisTag: `${next}-01` };
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(new Date(Date.UTC(year, monthNumber - 1, 15, 12)));
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

function Monatsraster({ month, grouped, sichtbareArten }: { month: string; grouped: Record<string, CalendarEvent[]>; sichtbareArten: Terminkategorie[] }) {
  const wochen = monatsraster(month);
  const heute = heuteBerlin();
  const legende = TERMINKATEGORIEN.filter((art) => sichtbareArten.includes(art.schluessel));
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
                    return <span className={`termin-marke ${art.klasse}`} key={termin.key} title={`${termin.ganztags ? "ganztägig" : formatTime(termin.startsAt)} · ${art.beschriftung}: ${termin.title}`}>{art.kuerzel}</span>;
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
      {legende.map((art) => <li key={art.schluessel}>
        <span className={`termin-marke ${art.klasse}`} aria-hidden="true">{art.kuerzel}</span>
        <span className="monatsraster-legende-text">{art.beschriftung}</span>
        <span className="monatsraster-legende-zahl">{anzahl.get(art.schluessel) ?? 0}</span>
      </li>)}
    </ul>
  </aside>;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile, userId } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const month = validMonth(url.searchParams.get("month"));
  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine";
  const { from, to, vonTag, bisTag } = monthBounds(month);

  const { events: sichtbar, sichtbareArten, quellenfehler } = await ladeTermine(supabase, userId, { from, to, vonTag, bisTag }, scope);
  const grouped = sichtbar.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const key = dateKey(event.startsAt);
    (acc[key] ??= []).push(event);
    return acc;
  }, {});

  return data({ month, scope, events: sichtbar, grouped, profile, sichtbareArten, quellenfehler }, { headers: responseHeaders() });
}

export default function CalendarPage() {
  const { month, scope, events, grouped, profile, sichtbareArten, quellenfehler } = useLoaderData<typeof loader>();
  const wege = uebersichtsWege(sichtbareArten);
  // Die Kachel nennt die Anzahl, nicht die Namen: ausgeschrieben waren die
  // neun Kategorien rund 180 Zeichen und zogen die Nachbarkacheln auf die
  // doppelte Hoehe (siehe die Begruendung in app/calendar.css). Die Namen
  // stehen als Verweise unter der Werkzeugleiste und in der Legende des
  // Monatsrasters -- zweimal reicht.
  const quellenText = `${sichtbareArten.length} Terminarten aus ${wege.length} ${wege.length === 1 ? "Übersicht" : "Übersichten"}`;
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
        <div><span>Terminquellen</span><strong>{quellenText}</strong></div>
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
        {wege.map((weg) => <Link className="subtle-link" key={weg.pfad} to={weg.pfad}>{weg.beschriftung} öffnen</Link>)}
      </div>

      {quellenfehler.length > 0 ? <p className="form-error">
        Diese Terminquellen konnten nicht gelesen werden: {quellenfehler.join(", ")}. Die übrigen Termine stehen vollständig unten.
      </p> : null}

      <div className="calendar-ansichten">
        <div className="calendar-agenda">
          {Object.entries(grouped).map(([day, dayEvents]) => <section className="calendar-day" key={day} id={`tag-${day}`}>
            <div className="calendar-day-label"><strong>{formatDay(day)}</strong><small>{dayEvents.length} {dayEvents.length === 1 ? "Termin" : "Termine"}</small></div>
            <div className="calendar-day-events">
              {dayEvents.map((event) => <article className="calendar-event" key={event.key}>
                <div className="calendar-event-time">{event.ganztags
                  ? <strong className="calendar-event-ganztags">ganztägig</strong>
                  : <><strong>{formatTime(event.startsAt)}</strong>{event.endsAt ? <small>bis {formatTime(event.endsAt)}</small> : null}</>}</div>
                <div className="calendar-event-main"><strong>{event.title}</strong><p>{event.subtitle}</p><span className={`calendar-kind ${kategorie(event.kind).klasse}`}>{event.sourceLabel}{event.statusLabel ? ` · ${event.statusLabel}` : ""}</span></div>
                <div className="calendar-event-actions"><Link className="subtle-link" to={event.sourcePath}>CRM öffnen →</Link><a className="secondary-button link-button compact" href={event.exportUrl}>.ics</a></div>
              </article>)}
            </div>
          </section>)}
          {events.length === 0 ? <p className="empty-state">Im gewählten Monat sind für diese Ansicht keine CRM-Termine vorhanden.</p> : null}
        </div>

        <Monatsraster month={month} grouped={grouped} sichtbareArten={sichtbareArten} />
      </div>
    </section>
  </main>;
}
