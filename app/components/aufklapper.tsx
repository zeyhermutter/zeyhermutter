import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";

// Ein Abschnitt, der erst auf Klick aufgeht -- fuer Anlegeformulare und
// Bearbeitungsfelder, die bisher offen auf den Listenseiten standen.
//
// WARUM
//
// Auf Empfehlungen, Case Studies, Reservierungen, Verkaufsprojekten und
// Kampagnen stand unter der Liste ein vollstaendiges Formular "... anlegen"
// (Reservierungen dazu je Reservierung ein Bearbeitungsformular). Die Seite
// war damit vor allem Formular und kaum Liste. In einer Maklersoftware oeffnet
// "+ Neu" das Formular; vorher stoert es nicht.
//
// Ein Verweis auf "#<id>" (etwa "+ Neu" im Arbeitsplatz oder im Seitenkopf)
// oeffnet den Abschnitt und rollt zu ihm -- auch beim Laden der Seite.

export function Aufklapper({ id, knopf, offen = false, children }: {
  id?: string;
  /** Die Beschriftung des Knopfs, etwa "+ Empfehlung erfassen". */
  knopf: ReactNode;
  /** Von vornherein offen, etwa wenn das Formular einen Fehler zeigt. */
  offen?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (!id || hash !== `#${id}` || !ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView({ block: "start" });
  }, [hash, id]);
  return (
    <details className="programm-aufklapper" id={id} ref={ref} open={offen || undefined}>
      <summary className="programm-aufklapper-knopf">{knopf}</summary>
      <div className="programm-aufklapper-inhalt">{children}</div>
    </details>
  );
}
