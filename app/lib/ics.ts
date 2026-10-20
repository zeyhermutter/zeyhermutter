// iCalendar-Bausteine (RFC 5545), gemeinsam fuer Einzel-Export und Kalender-Abo.

export function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,");
}

export function utcStamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Terminzeit ist ungültig.");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Ein Tagesdatum als iCalendar-Datumswert: 2026-10-14 wird 20261014. */
export function datumsStempel(value: string) {
  const treffer = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!treffer) throw new Error("Termindatum ist ungültig.");
  return `${treffer[1]}${treffer[2]}${treffer[3]}`;
}

/** Der Folgetag -- DTEND ist bei ganztaegigen Terminen ausschliessend. */
export function naechsterTag(value: string) {
  const stempel = datumsStempel(value);
  const tag = new Date(Date.UTC(+stempel.slice(0, 4), +stempel.slice(4, 6) - 1, +stempel.slice(6, 8) + 1));
  return `${tag.getUTCFullYear()}${String(tag.getUTCMonth() + 1).padStart(2, "0")}${String(tag.getUTCDate()).padStart(2, "0")}`;
}

/** Zeilen ueber 75 Bytes umbrechen (Folgezeile beginnt mit einem Leerzeichen). */
export function falte(zeile: string) {
  const bytes = new TextEncoder().encode(zeile);
  if (bytes.length <= 75) return zeile;
  const teile: string[] = [];
  let aktuell = "", laenge = 0, grenze = 75;
  for (const zeichen of zeile) {
    const l = new TextEncoder().encode(zeichen).length;
    if (laenge + l > grenze) { teile.push(aktuell); aktuell = ""; laenge = 0; grenze = 74; }
    aktuell += zeichen; laenge += l;
  }
  teile.push(aktuell);
  return teile.join("\r\n ");
}
