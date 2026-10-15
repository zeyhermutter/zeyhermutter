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

import { useEffect } from "react";
import { useFetcher, useParams } from "react-router";
import { ArbeitsplatzReiter, type ArbeitsplatzReiterEintrag } from "~/components/arbeitsplatz";
import { RECHT_JE_SEITE, RECHT_JE_VORGANG, REITER, VORGAENGE, abschnittsPfad, vorgangsPfad } from "~/lib/objektakte-navigation";

/**
 * Eintraege, fuer die der Benutzer kein Recht hat, fallen weg (P1,
 * 15.10.2026). Die Rechte kommen in einer eigenen Anfrage
 * (/api/objekt-rechte, Begruendung dort); bis sie da sind, steht alles da wie
 * bisher.
 */
export function ObjektakteReiter() {
  const { propertyId } = useParams();
  const holer = useFetcher<{ rechte: string[] }>();
  useEffect(() => {
    if (holer.state === "idle" && !holer.data) holer.load("/api/objekt-rechte");
    // Einmal je Arbeitsplatz: die Rechte haengen am Benutzer, nicht am Objekt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rechte = holer.data?.rechte;
  if (!propertyId) return null;
  const darf = (recht: string | undefined) => !recht || !rechte || rechte.includes(recht);

  const eintraege = REITER.map((reiter): ArbeitsplatzReiterEintrag | null => {
    const unter = reiter.seiten.filter((seite) => darf(RECHT_JE_SEITE[seite.schluessel])).map((seite) => ({
      beschriftung: seite.beschriftung,
      pfad: abschnittsPfad(propertyId, seite.schluessel),
      genau: seite.schluessel === "record",
    }));
    const hinaus = reiter.vorgaenge
      ? VORGAENGE.map((v) => !darf(RECHT_JE_VORGANG[v.liste]) ? null : ({ beschriftung: v.beschriftung, pfad: vorgangsPfad(propertyId, v.liste), hinaus: true }))
      : [];
    const alle = [...unter, ...hinaus.filter((h) => h !== null)];
    // Ein Reiter ohne erlaubte Seite faellt ganz weg (etwa die Unterlagen ohne Dokumentenrecht).
    if (alle.length === 0) return null;
    return { beschriftung: reiter.beschriftung, pfad: alle[0].pfad, unter: alle };
  }).filter((e): e is ArbeitsplatzReiterEintrag => e !== null);

  return <ArbeitsplatzReiter beschriftung="Reiter der Objektakte" eintraege={eintraege} />;
}
