// Leer ist nicht dasselbe wie unbekannt.
//
// Viele Nebenabfragen einer Akte liefen bisher ohne Fehlerpruefung: faellt so
// eine Abfrage aus, ist das Ergebnis null, die Seite rendert (x ?? []) und
// schreibt dann "Noch keine Person erfasst." Das ist keine leere Liste, das
// ist eine Behauptung — und sie kann falsch sein. In der Geldwaescheakte oder
// beim Auftraggeber eines Maklerauftrags ist das keine Kleinigkeit.
//
// Die Nebenabfrage darf trotzdem nicht die ganze Akte unerreichbar machen.
// Deshalb der dritte Zustand: nicht "nichts da", sondern "wissen wir gerade
// nicht".

export function LeerOderFehler({
  fehler,
  name,
  children,
}: {
  /** Namen der Abfragen, die beim Laden ausgefallen sind. */
  fehler?: string[] | null;
  /** Name dieser Abfrage. */
  name: string;
  /** Der Satz, der gilt, wenn wirklich nichts erfasst ist. */
  children: React.ReactNode;
}) {
  if (fehler?.includes(name)) {
    return (
      <p className="form-warning">
        Diese Angaben konnten nicht geladen werden. Ob etwas erfasst ist, lässt sich hier
        gerade nicht sagen — bitte die Seite neu laden.
      </p>
    );
  }
  return <p className="empty-state">{children}</p>;
}
