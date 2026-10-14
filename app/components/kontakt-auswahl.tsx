import { useEffect, useId, useRef, useState } from "react";
import "~/kontakt-auswahl.css";

// Ein Kontakt in einem Formular waehlen -- mit Suche in der Datenbank statt
// einer vorab geladenen Liste (14.10.2026).
//
// Vorher war jedes dieser Felder ein <select> mit den ersten 250 bzw. 1000
// Kontakten. Wer dahinter lag, fehlte in der Auswahl, ohne dass es auffiel.
// Hier tippt man zwei Zeichen, die Datenbank sucht (api/kontakte), man
// waehlt. Das Formular bekommt wie bisher nur die Kennung in `name`.

export type GewaehlterKontakt = { id: string; name: string; nummer: string };
type Treffer = GewaehlterKontakt & { zusatz: string | null };

export function KontaktAuswahl({ name, beschriftung, vorbelegt, pflicht, ausschliessen }: {
  name: string;
  beschriftung: string;
  vorbelegt?: GewaehlterKontakt | null;
  pflicht?: boolean;
  /** Kennungen, die nicht waehlbar sind -- etwa der Kontakt selbst. */
  ausschliessen?: string[];
}) {
  const feldId = useId();
  const [gewaehlt, setGewaehlt] = useState<GewaehlterKontakt | null>(vorbelegt ?? null);
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [stand, setStand] = useState<"ruhe" | "sucht" | "fehler">("ruhe");
  const lauf = useRef(0);
  // Als Zeichenkette, damit ein neu erzeugtes Feld beim Neuzeichnen keine
  // neue Suche ausloest.
  const ausgeschlossen = (ausschliessen ?? []).join(",");

  useEffect(() => {
    const q = suche.trim();
    if (gewaehlt || q.length < 2) { setTreffer([]); setStand("ruhe"); return; }
    const nummer = ++lauf.current;
    setStand("sucht");
    const zeitgeber = setTimeout(async () => {
      try {
        const antwort = await fetch(`/api/kontakte?q=${encodeURIComponent(q)}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
        const json = await antwort.json() as { treffer?: Treffer[] };
        if (nummer !== lauf.current) return;
        if (!antwort.ok) { setStand("fehler"); setTreffer([]); return; }
        setTreffer((json.treffer ?? []).filter((t) => !ausgeschlossen.split(",").includes(t.id)));
        setStand("ruhe");
      } catch {
        if (nummer === lauf.current) { setStand("fehler"); setTreffer([]); }
      }
    }, 250);
    return () => clearTimeout(zeitgeber);
  }, [suche, gewaehlt, ausgeschlossen]);

  return (
    <div className="kontakt-auswahl">
      <label htmlFor={feldId}><span>{beschriftung}{pflicht ? " *" : ""}</span></label>
      <input type="hidden" name={name} value={gewaehlt?.id ?? ""} />
      {gewaehlt ? (
        <div className="kontakt-auswahl-gewaehlt">
          <strong>{gewaehlt.name}</strong> <span className="leise">{gewaehlt.nummer}</span>
          <button type="button" className="subtle-link" onClick={() => { setGewaehlt(null); setSuche(""); }}>ändern</button>
        </div>
      ) : (
        <>
          <input
            id={feldId}
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.currentTarget.value)}
            placeholder="Name, Nummer, E-Mail oder Telefon …"
            autoComplete="off"
            required={pflicht}
          />
          {suche.trim().length >= 2 ? (
            <div className="kontakt-auswahl-treffer" role="listbox" aria-label={`Treffer für ${beschriftung}`}>
              {stand === "sucht" && treffer.length === 0 ? <p className="leise">Sucht …</p> : null}
              {stand === "fehler" ? <p className="leise">Suche gerade nicht möglich.</p> : null}
              {stand === "ruhe" && treffer.length === 0 ? <p className="leise">Kein Kontakt gefunden.</p> : null}
              {treffer.map((t) => (
                <button type="button" role="option" aria-selected={false} key={t.id} onClick={() => { setGewaehlt(t); setSuche(""); }}>
                  <strong>{t.name}</strong> <span className="leise">{t.nummer}{t.zusatz ? ` · ${t.zusatz}` : ""}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
