// Geburtstage (20.10.2026, onOffice-Abgleich). Gleiche Regel wie die
// Datenbankfunktion geburtstage_demnaechst: der naechste Geburtstag ab heute
// (Berliner Datum); ein 29.02. faellt in Nicht-Schaltjahren auf den 28.02.

function tagAlsUtc(iso: string) {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  return { j, m, t };
}

function datum(j: number, m: number, t: number) {
  const letzter = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return Date.UTC(j, m - 1, Math.min(t, letzter));
}

/** heute: YYYY-MM-DD (Berlin). Ergebnis null, wenn kein gueltiges Datum. */
export function naechsterGeburtstag(geburt: string | null | undefined, heute: string) {
  if (!geburt || !/^\d{4}-\d{2}-\d{2}/.test(geburt)) return null;
  const g = tagAlsUtc(geburt), h = tagAlsUtc(heute);
  const heuteMs = Date.UTC(h.j, h.m - 1, h.t);
  let jahr = h.j;
  if (datum(jahr, g.m, g.t) < heuteMs) jahr += 1;
  const ms = datum(jahr, g.m, g.t);
  const tage = Math.round((ms - heuteMs) / 86_400_000);
  return { tage, alter: jahr - g.j, tag: new Date(ms).toISOString().slice(0, 10) };
}

export function geburtstagText(n: { tage: number; alter: number } | null) {
  if (!n) return null;
  if (n.tage === 0) return `hat heute Geburtstag (${n.alter})`;
  if (n.tage === 1) return `hat morgen Geburtstag (${n.alter})`;
  if (n.tage <= 7) return `hat in ${n.tage} Tagen Geburtstag (${n.alter})`;
  return null;
}
