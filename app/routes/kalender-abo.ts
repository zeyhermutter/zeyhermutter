import type { Route } from "./+types/kalender-abo";
import { datumsStempel, falte, icsEscape, naechsterTag, utcStamp } from "~/lib/ics";

// /kalender/<Kennung>.ics -- persoenliches Kalender-Abo (20.10.2026).
//
// Handy, Outlook oder Google laden diese Adresse regelmaessig, ohne
// Anmeldung -- die Kennung ist der Schluessel. Sie steht nirgends im Klartext:
// calendar_feeds speichert nur ihren SHA-256. Die Datenbankfunktion
// kalender_abo_termine liefert die Termine, fuer die der Abo-Inhaber
// verantwortlich ist (30 Tage zurueck bis 180 Tage voraus). Widerrufen oder
// neu erzeugen: im Kalender unter "Kalender abonnieren".

const DATEI = /^([A-Za-z0-9_-]{43})\.ics$/;

type Termin = { kind: string; id: string; summary: string; description: string | null; location: string | null; starts_at: string | null; ends_at: string | null; ganztags: boolean; tag: string | null; source_path: string };

async function sha256(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function basis(value: string | undefined) {
  try { const u = new URL(value || ""); return `${u.protocol}//${u.host}`; } catch { return "https://zeyhermutter.playsony.workers.dev"; }
}

const KOPF = { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

function kalender(zeilen: string[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ZeyherMutterOS//CRM Kalender-Abo//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:ZeyherMutter – meine Termine", "X-WR-TIMEZONE:Europe/Berlin", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...zeilen, "END:VCALENDAR", ""].map(falte).join("\r\n");
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const treffer = String(params.datei ?? "").match(DATEI);
  // Unbekannt, widerrufen oder ungueltig: 404 ohne Inhalt -- der Kalender
  // meldet dem Nutzer dann, dass das Abo nicht mehr erreichbar ist.
  if (!treffer) return new Response("Nicht gefunden.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const env = context.cloudflare.env;
  const antwort = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/kalender_abo_termine`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ p_token_hash: await sha256(treffer[1]) }),
  }).catch(() => null);
  if (!antwort || !antwort.ok) return new Response("Kalender gerade nicht erreichbar.", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "600" } });
  const termine = (await antwort.json().catch(() => null)) as Termin[] | null;
  if (!Array.isArray(termine)) return new Response("Kalender gerade nicht erreichbar.", { status: 503, headers: { "Cache-Control": "no-store" } });
  // Eine leere Liste kann "kein Termin" oder "Abo widerrufen" heissen; die
  // Datenbank unterscheidet das bewusst nicht nach aussen.
  const stamp = utcStamp(new Date());
  const base = basis(env.APP_BASE_URL);
  const zeilen = termine.flatMap((t) => {
    try {
      const zeit = t.ganztags && t.tag
        ? [`DTSTART;VALUE=DATE:${datumsStempel(t.tag)}`, `DTEND;VALUE=DATE:${naechsterTag(t.tag)}`]
        : t.starts_at ? [`DTSTART:${utcStamp(t.starts_at)}`, `DTEND:${utcStamp(t.ends_at ?? new Date(new Date(t.starts_at).getTime() + 30 * 60_000))}`] : null;
      if (!zeit) return [];
      return [
        "BEGIN:VEVENT",
        `UID:${icsEscape(`${t.kind}-${t.id}@zeyhermutteros`)}`,
        `DTSTAMP:${stamp}`,
        ...zeit,
        `SUMMARY:${icsEscape(t.summary)}`,
        ...(t.description ? [`DESCRIPTION:${icsEscape(t.description)}`] : []),
        ...(t.location ? [`LOCATION:${icsEscape(t.location)}`] : []),
        `URL:${icsEscape(`${base}${t.source_path}`)}`,
        "END:VEVENT",
      ];
    } catch { return []; }
  });
  return new Response(kalender(zeilen), { headers: KOPF });
}
