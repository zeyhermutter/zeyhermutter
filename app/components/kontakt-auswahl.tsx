import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "~/kontakt-auswahl.css";

// Ein Kontakt in einem Formular waehlen -- mit Suche in der Datenbank statt
// einer vorab geladenen Liste (14.10.2026).
//
// Vorher war jedes dieser Felder ein <select> mit den ersten 250 bzw. 1000
// Kontakten. Wer dahinter lag, fehlte in der Auswahl, ohne dass es auffiel.
// Hier tippt man zwei Zeichen, die Datenbank sucht (api/kontakte), man
// waehlt. Das Formular bekommt wie bisher nur die Kennung in `name`.
//
// Das Feld steht selbst als .form-field im Raster -- es ersetzt das ganze
// <label className="form-field">…</label>, nicht nur das <select> darin.

export type GewaehlterKontakt = { id: string; name: string; nummer: string };
type Treffer = GewaehlterKontakt & { zusatz: string | null };

export function KontaktAuswahl({ name, beschriftung, vorbelegt, vorbelegtId, pflicht, ausschliessen, onWahl, disabled, hinweis }: {
  name: string;
  beschriftung: string;
  /** Bereits bekannter Kontakt mit Namen -- wird ohne Nachladen angezeigt. */
  vorbelegt?: GewaehlterKontakt | null;
  /** Nur die Kennung ist bekannt; Name und Nummer holt das Feld selbst. */
  vorbelegtId?: string | null;
  pflicht?: boolean;
  /** Kennungen, die nicht waehlbar sind -- etwa der Kontakt selbst. */
  ausschliessen?: string[];
  /** Fuer Formulare, die auf die Wahl reagieren (z. B. Suchprofile des Kontakts). "" = keiner. */
  onWahl?: (id: string) => void;
  /** Wie ein gesperrtes <select>: sichtbar, nicht aenderbar, wird nicht gesendet. */
  disabled?: boolean;
  /** Kleiner Text unter dem Feld, z. B. "Fehlt die Person? Kontakt anlegen". */
  hinweis?: ReactNode;
}) {
  const feldId = useId();
  const [gewaehlt, setGewaehlt] = useState<GewaehlterKontakt | null>(
    vorbelegt ?? (vorbelegtId ? { id: vorbelegtId, name: "", nummer: "" } : null),
  );
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [stand, setStand] = useState<"ruhe" | "sucht" | "fehler">("ruhe");
  const lauf = useRef(0);
  // Als Zeichenkette, damit ein neu erzeugtes Feld beim Neuzeichnen keine
  // neue Suche ausloest.
  const ausgeschlossen = (ausschliessen ?? []).join(",");

  // Nur die Kennung bekannt: Namen nachladen.
  useEffect(() => {
    if (!gewaehlt || gewaehlt.name || !gewaehlt.id) return;
    let aktiv = true;
    fetch(`/api/kontakte?id=${encodeURIComponent(gewaehlt.id)}`, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((a) => a.json() as Promise<{ treffer?: Treffer[] }>)
      .then((j) => {
        if (!aktiv) return;
        const k = j.treffer?.[0];
        setGewaehlt((g) => (g && g.id === gewaehlt.id ? (k ? { id: k.id, name: k.name, nummer: k.nummer } : { ...g, name: "Kontakt nicht gefunden" }) : g));
      })
      .catch(() => { if (aktiv) setGewaehlt((g) => (g && !g.name ? { ...g, name: "Kontakt (Name gerade nicht ladbar)" } : g)); });
    return () => { aktiv = false; };
  }, [gewaehlt?.id, gewaehlt?.name]);

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

  const waehle = (k: GewaehlterKontakt | null) => {
    setGewaehlt(k);
    setSuche("");
    if (onWahl && (k?.id ?? "") !== (gewaehlt?.id ?? "")) onWahl(k?.id ?? "");
  };

  return (
    <div className="form-field kontakt-auswahl">
      <label htmlFor={feldId}><span>{beschriftung}{pflicht ? " *" : ""}</span></label>
      <input type="hidden" name={name} value={gewaehlt?.id ?? ""} disabled={disabled} />
      {gewaehlt ? (
        <div className="kontakt-auswahl-gewaehlt">
          <strong>{gewaehlt.name || "Kontakt wird geladen …"}</strong> <span className="leise">{gewaehlt.nummer}</span>
          {disabled ? null : <button type="button" className="subtle-link" onClick={() => waehle(null)}>ändern</button>}
        </div>
      ) : disabled ? (
        <div className="kontakt-auswahl-gewaehlt"><span className="leise">—</span></div>
      ) : (
        <div className="kontakt-auswahl-suche">
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
                <button type="button" role="option" aria-selected={false} key={t.id} onClick={() => waehle(t)}>
                  <strong>{t.name}</strong> <span className="leise">{t.nummer}{t.zusatz ? ` · ${t.zusatz}` : ""}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
      {hinweis ? <small>{hinweis}</small> : null}
    </div>
  );
}
