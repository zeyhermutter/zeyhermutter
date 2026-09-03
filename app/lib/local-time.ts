// Ein `datetime-local`-Feld liefert reine Ortszeit ohne Zeitzone.
// Der Cloudflare-Worker läuft in UTC; `new Date("2026-09-03T13:47")` würde die
// Eingabe deshalb als UTC lesen und damit zwei Stunden in die Zukunft schieben.
// Das CRM zeigt alle Zeiten in Europe/Berlin an, also wird die Eingabe auch als
// Europe/Berlin gelesen — sommerzeitsicher über die tatsächliche Zonenverschiebung.

export const CRM_TIME_ZONE = "Europe/Berlin";

const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zoneOffsetMs(instant: number) {
  const parts = Object.fromEntries(
    PARTS_FORMAT.formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
  return asUtc - instant;
}

/**
 * Wandelt den Wert eines `datetime-local`-Feldes in einen ISO-Zeitpunkt um und
 * liest ihn dabei als Ortszeit der CRM-Zeitzone. Gibt null zurück, wenn der Wert
 * leer oder unbrauchbar ist.
 */
export function crmLocalDateTimeToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const guess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? 0));
  if (!Number.isFinite(guess)) return null;
  // Zwei Durchläufe, damit auch die Umstellungsnächte korrekt aufgelöst werden.
  let instant = guess - zoneOffsetMs(guess);
  instant = guess - zoneOffsetMs(instant);
  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/**
 * Wandelt ein reines Datum plus Uhrzeit (Ortszeit der CRM-Zeitzone) in einen
 * ISO-Zeitpunkt um, z. B. für Wiedervorlagen um 09:00 Uhr.
 */
export function crmDateAtTimeToIso(date: string, time = "09:00"): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return null;
  return crmLocalDateTimeToIso(`${date.trim()}T${time}`);
}
