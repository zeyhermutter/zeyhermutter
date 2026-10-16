import { useEffect } from "react";
import { useFetcher } from "react-router";
import { tagKurz } from "~/lib/format";
import { AMPEL_TEXT, AMPEL_ZEICHEN, type AmpelArt, type Schrittstand } from "~/lib/naechster-schritt";
import "~/ampel.css";

// Die Ampel in Listen (P2-1, 16.10.2026). Regeln: app/lib/naechster-schritt.ts.
//
// Die Staende kommen nach dem Laden der Seite ueber /api/naechster-schritt.
// Bis dahin steht nichts da -- eine Ampel, die erst gelb und dann gruen ist,
// waere schlimmer als eine, die einen Moment fehlt. Nach jeder Aktion (etwa
// "+ Aufgabe") laedt React Router die Daten neu, die Ampel folgt.

const KEINE: Record<string, Schrittstand> = {};

/** Ohne Bereich (art undefined) keine Anfrage und keine Ampel. */
export function useNaechsteSchritte(art: AmpelArt | undefined): Record<string, Schrittstand> {
  const fetcher = useFetcher<{ staende: Record<string, Schrittstand> }>();
  useEffect(() => {
    if (art) fetcher.load(`/api/naechster-schritt?art=${art}`);
    // fetcher ist bei jedem Rendern ein neues Objekt; geladen wird je Bereich einmal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art]);
  return art ? fetcher.data?.staende ?? KEINE : KEINE;
}

function text(s: Schrittstand, kurz: boolean): string {
  const datum = s.tag ? tagKurz(s.tag) : "";
  if (s.stand === "ueberfaellig") return datum ? `Überfällig · ${datum}` : AMPEL_TEXT.ueberfaellig;
  if (s.stand === "heute") return AMPEL_TEXT.heute;
  if (s.stand === "geplant") return datum || "Ohne Datum";
  return kurz ? "Kein Schritt" : AMPEL_TEXT.ohne;
}

export function Ampel({ s, kurz = false }: { s: Schrittstand | undefined; kurz?: boolean }) {
  if (!s) return null;
  const sichtbar = text(s, kurz);
  const voll = s.stand === "ohne" ? "Kein nächster Schritt geplant" : `Nächster Schritt: ${s.stand === "geplant" ? sichtbar : text(s, false)}`;
  return (
    <span className={`ampel ampel-${s.stand}`} title={voll}>
      <span className="ampel-zeichen" aria-hidden="true">{AMPEL_ZEICHEN[s.stand]}</span>
      <span className="sr-only">{voll}</span>
      <span aria-hidden="true">{sichtbar}</span>
    </span>
  );
}
