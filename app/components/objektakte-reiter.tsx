// Die Reiter der Objektakte im Immobilien-Arbeitsplatz.
//
// Welche Reiter, welche Seiten darunter und wohin die Vorgaenge fuehren,
// steht in app/lib/objektakte-navigation.ts. Hier wird nur daraus die
// Eintragsliste fuer den gemeinsamen Baustein gebaut -- dieselben Reiter wie
// bei den Kontakten, mit einer zweiten Zeile fuer die Seiten.
//
// Ersetzt app/components/property-context-navigation.tsx (bis 12.10.2026):
// zwei gerahmte Zeilen, 14 Abschnitte nach Phase gefaltet, darunter die
// Vorgaenge.

import { useParams } from "react-router";
import { ArbeitsplatzReiter, type ArbeitsplatzReiterEintrag } from "~/components/arbeitsplatz";
import { REITER, VORGAENGE, abschnittsPfad, vorgangsPfad } from "~/lib/objektakte-navigation";

export function ObjektakteReiter() {
  const { propertyId } = useParams();
  if (!propertyId) return null;

  const eintraege: ArbeitsplatzReiterEintrag[] = REITER.map((reiter) => {
    const unter = reiter.seiten.map((seite) => ({
      beschriftung: seite.beschriftung,
      pfad: abschnittsPfad(propertyId, seite.schluessel),
      genau: seite.schluessel === "record",
    }));
    const hinaus = reiter.vorgaenge
      ? VORGAENGE.map((v) => ({ beschriftung: v.beschriftung, pfad: vorgangsPfad(propertyId, v.liste), hinaus: true }))
      : [];
    return { beschriftung: reiter.beschriftung, pfad: unter[0].pfad, unter: [...unter, ...hinaus] };
  });

  return <ArbeitsplatzReiter beschriftung="Reiter der Objektakte" eintraege={eintraege} />;
}
