import { useEffect, useState } from "react";
import { Form, useLocation, useSearchParams } from "react-router";
import { crmToday } from "~/lib/local-time";
import { TELEFONAT_ERGEBNIS } from "~/lib/telefonat";
import "~/telefonat-erfassen.css";

// "Telefonat erfassen" -- ein Knopf und ein kurzes Formular in der Akte
// (P1, 16.10.2026). Gespeichert wird ueber /api/telefonat; danach geht es
// zurueck auf dieselbe Seite. "#telefonat-neu" oeffnet das Formular.

const MELDUNG: Record<string, { text: string; klasse: string }> = {
  gespeichert: { text: "Telefonat im Verlauf erfasst.", klasse: "form-success" },
  mit_rueckruf: { text: "Telefonat erfasst, Rückruf als Aufgabe angelegt.", klasse: "form-success" },
  ohne_rueckruf: { text: "Telefonat erfasst. Die Rückruf-Aufgabe konnte nicht angelegt werden.", klasse: "form-warning" },
  unvollstaendig: { text: "Bitte das Ergebnis des Telefonats wählen.", klasse: "form-error" },
  fehler: { text: "Das Telefonat konnte nicht gespeichert werden.", klasse: "form-error" },
};

export function TelefonatMeldung() {
  const [suche] = useSearchParams();
  const m = MELDUNG[suche.get("telefonat") ?? ""];
  return m ? <p className={m.klasse}>{m.text}</p> : null;
}

export function TelefonatErfassen({ kontaktId, darfAufgaben }: { kontaktId: string; darfAufgaben: boolean }) {
  const ort = useLocation();
  const [suche] = useSearchParams();
  const [offen, setOffen] = useState(false);
  const [ergebnis, setErgebnis] = useState("");
  // Nach dem Speichern zu (Live-Test 16.10.2026: das Formular blieb offen
  // stehen und sah aus, als waere noch nichts gespeichert).
  const gespeichert = ["gespeichert", "mit_rueckruf", "ohne_rueckruf"].includes(suche.get("telefonat") ?? "");
  useEffect(() => { if (gespeichert) { setOffen(false); setErgebnis(""); } }, [gespeichert, ort.key]);
  useEffect(() => {
    const pruefe = () => { if (window.location.hash === "#telefonat-neu") setOffen(true); };
    pruefe();
    window.addEventListener("hashchange", pruefe);
    return () => window.removeEventListener("hashchange", pruefe);
  }, []);
  const zurueck = (() => {
    const p = new URLSearchParams(ort.search);
    p.delete("telefonat");
    const q = p.toString();
    return `${ort.pathname}${q ? `?${q}` : ""}`;
  })();
  if (!offen) return <button type="button" className="secondary-button compact" onClick={() => setOffen(true)}>+ Telefonat</button>;
  return (
    <Form method="post" action="/api/telefonat" className="telefonat-erfassen" id="telefonat-neu">
      <input type="hidden" name="kontakt_id" value={kontaktId} />
      <input type="hidden" name="zurueck" value={zurueck} />
      <fieldset className="telefonat-ergebnis">
        <legend>Wie lief das Telefonat? *</legend>
        {Object.entries(TELEFONAT_ERGEBNIS).map(([wert, text]) => (
          <label key={wert} className={ergebnis === wert ? "gewaehlt" : undefined}>
            <input type="radio" name="ergebnis" value={wert} required checked={ergebnis === wert} onChange={() => setErgebnis(wert)} />
            {text}
          </label>
        ))}
      </fieldset>
      <label className="form-field"><span>Notiz</span><textarea name="notiz" rows={2} placeholder="Was wurde besprochen?" /></label>
      {darfAufgaben ? (
        <label className="form-field"><span>Rückruf am</span><input type="date" name="rueckruf_am" min={crmToday()} required={ergebnis === "RUECKRUF"} />
          <small className="subtle">Legt eine Aufgabe „Rückruf“ für dich an.{ergebnis === "RUECKRUF" ? " Bei „Rückruf vereinbart“ nötig." : ""}</small>
        </label>
      ) : null}
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={() => { setOffen(false); setErgebnis(""); }}>Abbrechen</button>
        <button type="submit" className="primary-button">Telefonat speichern</button>
      </div>
    </Form>
  );
}
