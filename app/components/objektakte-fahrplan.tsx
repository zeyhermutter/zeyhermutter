import { Link } from "react-router";
import type { Haltepunkt } from "~/lib/objektakte-fahrplan";
import "~/objektakte-fahrplan.css";

/**
 * Der Fahrplan ueber der Objektakte.
 *
 * Eine Zeile je Station des Verkaufs. Die Zeile sagt drei Dinge: wie weit es
 * ist, was dazu im System steht, und wohin der naechste Klick fuehrt. Mehr
 * nicht -- der Fahrplan ist eine Uebersicht, kein zweiter Datensatz. Wer eine
 * Station bearbeiten will, oeffnet die Akte dahinter.
 *
 * ZUM AUSSEHEN
 *
 * Die Zeilen benutzen .data-row und .status-pill, also dieselben Bausteine
 * wie jede andere Liste im CRM. Das eigene Stylesheet setzt nur Anordnung
 * und Abstaende -- keine eigenen Farben. Eine neue Karte, die sich ihre
 * Farben selbst ausdenkt, ist der Anfang eines zweiten Erscheinungsbildes.
 *
 * Die Reihenfolge und die Stationen stehen in app/lib/objektakte-fahrplan.ts.
 */

const STAND_PILLE: Record<string, string> = {
  erledigt: "status-sold",
  laeuft: "status-marketing",
  offen: "status-archived",
};

const STAND_TEXT: Record<string, string> = {
  erledigt: "Erledigt",
  laeuft: "Läuft",
  offen: "Offen",
};

export function ObjektakteFahrplan({ haltepunkte, vorgangsFehler }: {
  haltepunkte: Haltepunkt[];
  vorgangsFehler: string[];
}) {
  const pflicht = haltepunkte.filter((h) => !h.station.freiwillig);
  const erledigt = pflicht.filter((h) => h.stand === "erledigt").length;
  const naechster = haltepunkte.find((h) => h.naechster);

  return <section className="data-card fahrplan" id="fahrplan">
    <div className="card-head">
      <div>
        <p className="eyebrow">Ein Verkauf, eine Spur</p>
        <h2>Fahrplan</h2>
      </div>
      <span className="badge">{erledigt} von {pflicht.length}</span>
    </div>

    <p className="fahrplan-naechster">
      {naechster
        ? <><span>Als Nächstes</span><strong>{naechster.station.beschriftung}</strong><small>{naechster.station.bedeutung}</small></>
        : <><span>Stand</span><strong>Alle Pflichtstationen erledigt</strong><small>Im Ablauf ist für dieses Objekt nichts mehr offen.</small></>}
    </p>

    {vorgangsFehler.length > 0
      ? <p className="form-error">
          Diese Vorgänge konnten nicht gelesen werden: {vorgangsFehler.join(", ")}. Die betroffenen
          Stationen zeigen deshalb keinen Stand — der Rest der Akte stimmt.
        </p>
      : null}

    <ol className="fahrplan-liste">
      {haltepunkte.map((h) => {
        const freiwilligLeer = h.station.freiwillig && h.anzahl === 0;
        return <li className={`data-row fahrplan-halt${h.naechster ? " fahrplan-dran" : ""}`} key={h.station.schluessel}>
          <div className="fahrplan-sache">
            <div className="fahrplan-titel">
              <strong>{h.station.beschriftung}</strong>
              {h.naechster ? <span className="fahrplan-dran-marke">dran</span> : null}
              {h.warnung ? <span className="status-pill status-lost">{h.warnung}</span> : null}
            </div>
            <small>{h.text}</small>
          </div>
          <div className="row-meta fahrplan-stand">
            <span className={`status-pill ${freiwilligLeer ? "status-archived" : STAND_PILLE[h.stand]}`}>
              {freiwilligLeer ? "Freiwillig" : STAND_TEXT[h.stand]}
            </span>
          </div>
          <div className="fahrplan-wege">
            {h.oeffnen ? <Link className="subtle-link" to={h.oeffnen}>Öffnen →</Link> : null}
            {!h.oeffnen && h.anzahl > 0 ? <Link className="subtle-link" to={h.liste}>Alle {h.anzahl} →</Link> : null}
            {h.anzahl === 0
              ? (h.anlegen
                  ? <Link className="secondary-button link-button compact" to={h.anlegen.pfad}>
                      {h.anlegen.vorbelegt ? "Anlegen" : "Auf der Liste anlegen"}
                    </Link>
                  : <Link className="subtle-link" to={h.liste}>Zur Liste →</Link>)
              : null}
          </div>
        </li>;
      })}
    </ol>
  </section>;
}
