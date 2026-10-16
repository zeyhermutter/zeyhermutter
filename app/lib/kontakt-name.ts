// Ein Name, eine Schreibweise in der Kontaktsuche (P1, 16.10.2026).
//
// Die Treffer der Suche kamen als "Markus Muster", ein vorbelegter Kontakt
// stand als "Muster, Markus" im selben Feld. Wer zwischen beiden wechselte,
// sah denselben Menschen zweimal anders geschrieben. In Auswahlfeldern gilt
// jetzt "Vorname Nachname" wie in der Suche. Listen, die nach Nachnamen
// sortiert sind (Arbeitsplatz-Listen), behalten "Nachname, Vorname".

type Person = { first_name?: string | null; last_name?: string | null; title?: string | null } | null | undefined;

export function kontaktName(k: Person): string {
  if (!k) return "";
  return [k.title, k.first_name, k.last_name].map((t) => (t ?? "").trim()).filter(Boolean).join(" ");
}
