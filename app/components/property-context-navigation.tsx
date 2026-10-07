// Die Leiste ueber der Objektakte.
//
// Zwei Zeilen, und das ist der Punkt:
//
//   Akte       die Abschnitte DIESER Immobilie
//   Vorgänge   andere Akten, nach dieser Immobilie gefiltert
//
// Vorher standen beide in einer Zeile, in derselben Pillenform, 19 Stueck.
// Wer auf "Provisionen" klickte, verliess die Objektakte, ohne dass die
// Leiste das andeutete. Jetzt sagen drei Dinge, dass die untere Zeile
// wegfuehrt: eigene Zeile, Rahmen statt Pille, Pfeil.
//
// Die Abschnittszeile zeigt, was zur Phase der Immobilie gehoert; der Rest
// steht hinter einem Zaehler, der dasteht und anklickbar ist. Nicht
// versteckt -- sichtbar eingeklappt. Wer den Status nicht kennt (Abfrage
// ausgefallen), bekommt alles.
//
// Welcher Abschnitt zu welcher Phase gehoert, steht in
// app/lib/objektakte-navigation.ts, nicht hier.

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  abschnitteFuerStatus,
  abschnittsPfad,
  objektakteAusPfad,
  vorgangsPfad,
  VORGAENGE,
  type Abschnitt,
} from "~/lib/objektakte-navigation";
import "~/property-context-nav.css";

function Abschnittslink({ propertyId, abschnitt, aktiv, leise }: {
  propertyId: string;
  abschnitt: Abschnitt;
  aktiv: boolean;
  leise?: boolean;
}) {
  const klassen = ["objektakte-abschnitt"];
  if (aktiv) klassen.push("active");
  if (leise) klassen.push("objektakte-abschnitt-leise");
  return (
    <Link className={klassen.join(" ")} to={abschnittsPfad(propertyId, abschnitt.schluessel)}>
      {abschnitt.beschriftung}
    </Link>
  );
}

export function PropertyContextNavigation({ immobilienStatus }: { immobilienStatus?: string | null }) {
  const location = useLocation();
  const akte = objektakteAusPfad(location.pathname);
  const [aufgeklappt, setAufgeklappt] = useState(false);

  // Beim Wechsel auf eine andere Immobilie faengt die Leiste wieder
  // eingeklappt an. Sonst bleibt ein Zustand stehen, den niemand gesetzt hat.
  const propertyId = akte?.propertyId;
  useEffect(() => { setAufgeklappt(false); }, [propertyId]);

  if (!akte) return null;

  const { vorn, dahinter } = abschnitteFuerStatus(immobilienStatus);
  const aktiverLiegtDahinter = dahinter.some((a) => a.schluessel === akte.abschnitt);
  // Steht man auf einem eingeklappten Abschnitt, ist er aufgeklappt -- sonst
  // waere die Seite, auf der man gerade ist, in ihrer eigenen Leiste nicht zu
  // sehen.
  const zeigeDahinter = aufgeklappt || aktiverLiegtDahinter;

  return (
    <div className="objektakte-navigation persistent-property-context-nav">
      <nav className="objektakte-zeile" aria-label="Abschnitte der Immobilienakte">
        <span className="objektakte-zeilentitel">Akte</span>
        <div className="objektakte-eintraege">
          {vorn.map((abschnitt) => (
            <Abschnittslink
              key={abschnitt.schluessel}
              propertyId={akte.propertyId}
              abschnitt={abschnitt}
              aktiv={akte.abschnitt === abschnitt.schluessel}
            />
          ))}
          {zeigeDahinter
            ? dahinter.map((abschnitt) => (
              <Abschnittslink
                key={abschnitt.schluessel}
                propertyId={akte.propertyId}
                abschnitt={abschnitt}
                aktiv={akte.abschnitt === abschnitt.schluessel}
                leise
              />
            ))
            : null}
          {dahinter.length > 0 && !aktiverLiegtDahinter ? (
            <button
              className="objektakte-mehr"
              type="button"
              aria-expanded={aufgeklappt}
              onClick={() => setAufgeklappt((offen) => !offen)}
            >
              {aufgeklappt
                ? "Weniger anzeigen"
                : `+ ${dahinter.length} ${dahinter.length === 1 ? "weiterer Abschnitt" : "weitere Abschnitte"}`}
            </button>
          ) : null}
        </div>
      </nav>

      <nav className="objektakte-zeile objektakte-vorgaenge" aria-label="Vorgänge zu dieser Immobilie">
        <span className="objektakte-zeilentitel">Vorgänge</span>
        <div className="objektakte-eintraege">
          {VORGAENGE.map((vorgang) => (
            <Link className="objektakte-vorgang" key={vorgang.liste} to={vorgangsPfad(akte.propertyId, vorgang.liste)}>
              {vorgang.beschriftung}
              <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 9 9 3M9 3H4.5M9 3v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
