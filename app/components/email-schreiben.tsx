import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import { tag, zeitpunkt } from "~/lib/format";
import { MAILTO_SICHER, PLATZHALTER, VORLAGENANLASS, fuelle, mailtoAdresse, type Werte } from "~/lib/email-vorlage";
import "~/email-schreiben.css";

// "E-Mail schreiben" in der Akte (P2-3, 16.10.2026).
//
//   1. Vorlage wählen (bei einer Anfrage mit freigegebenem Exposé ist die
//      erste Exposé-Vorlage schon gewählt, sonst die erste Antwort-Vorlage)
//   2. optional: Exposé als PDF herunterladen oder als Link einfügen
//   3. "Im Mailprogramm öffnen" -- Empfänger, Betreff und Text vorbelegt
//   4. "Gesendet – festhalten" -- E-Mail im Verlauf, beim Exposé der
//      Objektnachweis, auf Wunsch die Anfrage auf "Kontaktiert"
//
// Das CRM verschickt nichts. Ohne Vorlage bleibt der Text leer: das CRM
// schreibt keine Sätze in eine E-Mail an Kunden.

export type SchreibDaten = {
  vorlagen: { id: string; purpose: string; name: string; subject: string; body: string }[];
  vorlagenFehlen: boolean;
  werte: Werte;
  expose: { id: string; nummer: string; datei: string } | null;
  linkTage: number;
  /** Ausgegebene Kurzlinks zu dieser Anfrage (A7), neueste zuerst. */
  links: { id: string; erstellt: string; von: string | null; bis: string; zurueckgezogen: string | null; nummer: string | null }[];
  anfrage: { status: string; version: number } | null;
  /** Werbewiderspruch des Kontakts (P2-6 Teil 2): Hinweis, keine Sperre. */
  werbewiderspruch: string | null;
};

type Kontext = { type: string; id: string; email: string | null };

const PLATZHALTER_MUSTER = /\{\{\s*([a-z_]+)\s*\}\}/g;

function vorauswahl(d: SchreibDaten): string {
  const passend = (zweck: string) => d.vorlagen.find((v) => v.purpose === zweck)?.id;
  if (d.expose) return passend("EXPOSE") ?? passend("INQUIRY_REPLY") ?? "";
  if (d.anfrage) return passend("INQUIRY_REPLY") ?? "";
  return "";
}

export function EmailSchreiben({ kontext, daten }: { kontext: Kontext; daten: SchreibDaten }) {
  const [vorlageId, setVorlageId] = useState(() => vorauswahl(daten));
  const [betreff, setBetreff] = useState("");
  const [text, setText] = useState("");
  const [weg, setWeg] = useState<"" | "PDF" | "LINK">("");
  const [geoeffnet, setGeoeffnet] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const linkFetcher = useFetcher<{ link?: string; linkId?: string; bis?: string; error?: string }>();
  const link = linkFetcher.data?.link ?? null;
  const linkId = linkFetcher.data?.linkId ?? null;
  // Wurde der eingefügte Link inzwischen zurückgezogen, öffnet er nichts mehr:
  // dann wieder "Neuen Link erzeugen" anbieten und keinen Nachweis dafür buchen.
  const linkZurueckgezogen = Boolean(linkId && daten.links.some((l) => l.id === linkId && l.zurueckgezogen));
  const vorigerLink = useRef<string | null>(null);

  const werte = useMemo<Werte>(() => ({ ...daten.werte, expose_link: link }), [daten.werte, link]);

  // Vorlage wählen = Betreff und Text neu setzen. Was der Benutzer danach
  // ändert, bleibt -- bis er eine andere Vorlage wählt.
  useEffect(() => {
    const v = daten.vorlagen.find((x) => x.id === vorlageId);
    setBetreff(v ? fuelle(v.subject, werte).text : "");
    setText(v ? fuelle(v.body, werte).text : "");
    setGeoeffnet(false);
    // werte absichtlich nicht: ein neuer Link soll den bearbeiteten Text nicht ueberschreiben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorlageId]);

  // Kommt der Link, ersetzt er {{expose_link}} oder einen vorher eingefügten
  // (zurückgezogenen) Link; fehlt beides, steht er am Ende.
  useEffect(() => {
    if (!link) return;
    const alt = vorigerLink.current;
    vorigerLink.current = link;
    setText((t) => (/\{\{\s*expose_link\s*\}\}/.test(t) ? t.replace(/\{\{\s*expose_link\s*\}\}/g, link)
      : alt && t.includes(alt) ? t.split(alt).join(link)
      : t.includes(link) ? t : `${t.replace(/\s+$/, "")}${t ? "\n\n" : ""}${link}`));
  }, [link]);

  const offen = useMemo(() => {
    const s = new Set<string>();
    for (const m of `${betreff}\n${text}`.matchAll(PLATZHALTER_MUSTER)) s.add(m[1]);
    return [...s];
  }, [betreff, text]);
  const bekannt = new Map(PLATZHALTER.map((p) => [p.schluessel, p.bedeutung]));

  const adresse = kontext.email ? mailtoAdresse(kontext.email, betreff, text) : null;
  const zuLang = adresse ? adresse.length > MAILTO_SICHER : false;
  const exposeGewaehlt = daten.expose && (weg === "PDF" || (weg === "LINK" && link && !linkZurueckgezogen));
  const gruppen = Object.entries(VORLAGENANLASS).map(([k, name]) => ({ name, vorlagen: daten.vorlagen.filter((v) => v.purpose === k) })).filter((g) => g.vorlagen.length);

  const kopieren = async () => {
    try { await navigator.clipboard.writeText(text); setKopiert(true); } catch { setKopiert(false); }
  };

  return (
    <section className="data-card email-schreiben" aria-label="E-Mail schreiben">
      <div className="card-head"><div><p className="eyebrow">Mit Vorlage</p><h2>E-Mail schreiben</h2></div><Link className="subtle-link" to="/crm/email-vorlagen">Vorlagen →</Link></div>

      {daten.vorlagenFehlen ? <p className="form-warning">Die Vorlagen konnten nicht geladen werden. Betreff und Text lassen sich trotzdem schreiben.</p> : null}
      {!daten.vorlagenFehlen && daten.vorlagen.length === 0 ? <p className="form-help">Noch keine Vorlage angelegt – Betreff und Text bitte selbst schreiben. Vorlagen pflegen Sie unter <Link to="/crm/email-vorlagen">Verwaltung › E-Mail-Vorlagen</Link>.</p> : null}

      <div className="email-schreiben-felder">
        {daten.vorlagen.length ? (
          <label className="form-field"><span>Vorlage</span>
            <select value={vorlageId} onChange={(e) => setVorlageId(e.currentTarget.value)}>
              <option value="">Ohne Vorlage</option>
              {gruppen.map((g) => <optgroup key={g.name} label={g.name}>{g.vorlagen.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>)}
            </select>
          </label>
        ) : null}
        <label className="form-field"><span>Betreff</span><input value={betreff} onChange={(e) => setBetreff(e.currentTarget.value)} maxLength={300} /></label>
        <label className="form-field"><span>Text</span><textarea value={text} onChange={(e) => setText(e.currentTarget.value)} rows={10} /></label>
      </div>

      {daten.expose ? (
        <fieldset className="email-schreiben-expose">
          <legend>Exposé {daten.expose.nummer} <small>(zur Verwendung freigegeben)</small></legend>
          <label><input type="radio" name="weg" checked={weg === ""} onChange={() => setWeg("")} /> Ohne Exposé</label>
          <label><input type="radio" name="weg" checked={weg === "PDF"} onChange={() => setWeg("PDF")} /> Als PDF anhängen</label>
          <label><input type="radio" name="weg" checked={weg === "LINK"} onChange={() => setWeg("LINK")} /> Als Link einfügen ({daten.linkTage} Tage gültig, jederzeit zurückziehbar)</label>
          {weg === "PDF" ? <p className="form-help"><a className="secondary-button link-button compact" href={`/crm/email?inquiry_id=${encodeURIComponent(kontext.id)}&expose_pdf=${encodeURIComponent(daten.expose.id)}`} download>PDF herunterladen</a> Danach im Mailprogramm anhängen.</p> : null}
          {weg === "LINK" && linkZurueckgezogen ? <p className="form-warning">Der eingefügte Link ist zurückgezogen und öffnet nichts mehr. Ein neuer Link ersetzt ihn im Text.</p> : null}
          {weg === "LINK" && (!link || linkZurueckgezogen) ? (
            <linkFetcher.Form method="post" className="email-schreiben-link">
              <input type="hidden" name="_intent" value="expose_link" />
              <input type="hidden" name="context_type" value={kontext.type} />
              <input type="hidden" name="context_id" value={kontext.id} />
              <input type="hidden" name="expose_id" value={daten.expose.id} />
              <button className="secondary-button compact" type="submit" disabled={linkFetcher.state !== "idle"}>{linkFetcher.state !== "idle" ? "Link wird erzeugt …" : linkZurueckgezogen ? "Neuen Link erzeugen und einsetzen" : "Link erzeugen und einfügen"}</button>
              <small>Wer den Link hat, kann das PDF {daten.linkTage} Tage lang öffnen – bis Sie ihn zurückziehen.</small>
            </linkFetcher.Form>
          ) : null}
          {weg === "LINK" && link && !linkZurueckgezogen ? <p className="form-help">Link eingefügt, gültig bis {linkFetcher.data?.bis ? tag(linkFetcher.data.bis) : `in ${daten.linkTage} Tagen`}. Zurückziehen unter „Ausgegebene Links“.</p> : null}
          {linkFetcher.data?.error ? <p className="form-error">{linkFetcher.data.error}</p> : null}
        </fieldset>
      ) : daten.anfrage ? <p className="form-help">Kein zur Verwendung freigegebenes Exposé zu dieser Anfrage – Exposé-Versand ist erst danach möglich.</p> : null}

      {daten.links.length ? <AusgegebeneLinks links={daten.links} /> : null}

      {offen.length ? (
        <p className="form-warning">Noch nicht ersetzt: {offen.map((o) => `{{${o}}}`).join(", ")} – {offen.map((o) => bekannt.has(o) ? (o === "expose_link" ? "Link noch nicht erzeugt" : "in dieser Akte kein Wert") : "unbekannter Platzhalter").filter((x, i, a) => a.indexOf(x) === i).join(", ")}. Bitte vor dem Senden anpassen.</p>
      ) : null}

      <div className="email-schreiben-aktionen">
        {adresse ? (
          <a className={geoeffnet ? "secondary-button link-button" : "primary-button link-button"} href={adresse} onClick={() => setGeoeffnet(true)}>Im Mailprogramm öffnen</a>
        ) : <span className="form-warning">Keine E-Mail-Adresse hinterlegt.</span>}
        <button className="secondary-button" type="button" onClick={kopieren}>{kopiert ? "Text kopiert" : "Text kopieren"}</button>
      </div>
      {zuLang ? <p className="form-help">Der Text ist lang. Manche Mailprogramme kürzen ihn beim Öffnen – dann „Text kopieren“ und im Mailprogramm einfügen.</p> : null}

      <Form method="post" className={`email-schreiben-festhalten${geoeffnet ? " bereit" : ""}`}>
        <input type="hidden" name="_intent" value="gesendet" />
        <input type="hidden" name="context_type" value={kontext.type} />
        <input type="hidden" name="context_id" value={kontext.id} />
        <input type="hidden" name="subject" value={betreff} />
        <input type="hidden" name="body" value={text} />
        <input type="hidden" name="template_id" value={vorlageId} />
        {exposeGewaehlt ? <><input type="hidden" name="expose_id" value={daten.expose!.id} /><input type="hidden" name="expose_weg" value={weg} /></> : null}
        {exposeGewaehlt && weg === "LINK" && linkId ? <input type="hidden" name="expose_link_id" value={linkId} /> : null}
        {daten.anfrage ? <input type="hidden" name="inquiry_version" value={daten.anfrage.version} /> : null}
        <p className="form-help">{geoeffnet ? "Haben Sie die E-Mail im Mailprogramm abgeschickt? Dann hier festhalten." : "Nach dem Senden im Mailprogramm hier festhalten – das Öffnen allein zählt nicht als Versand."}</p>
        {daten.anfrage?.status === "NEW" ? <label className="checkbox-row"><input type="checkbox" name="kontaktiert" value="1" defaultChecked /><span>Anfrage auf „Kontaktiert“ setzen</span></label> : null}
        {exposeGewaehlt ? <p className="form-help">Mit dem Festhalten wird auch der Objektnachweis gespeichert: Exposé {daten.expose!.nummer}, Weg „Exposé per E-Mail“, jetzt.</p> : null}
        <button className={geoeffnet ? "primary-button" : "secondary-button"} type="submit" disabled={!betreff.trim()}>Gesendet – festhalten</button>
      </Form>
    </section>
  );
}

/**
 * Ausgegebene Exposé-Links dieser Anfrage (A7). Ein Link lässt sich jederzeit
 * zurückziehen; danach zeigt er dem Empfänger nur noch „nicht mehr gültig“.
 * Ob ein Link geöffnet wurde, wird nicht erfasst.
 */
function AusgegebeneLinks({ links }: { links: SchreibDaten["links"] }) {
  const jetzt = Date.now();
  // Nur der Anfangszustand: nach "Zurückziehen" klappt die Liste nicht zu.
  const [offen] = useState(() => links.some((l) => !l.zurueckgezogen && Date.parse(l.bis) > jetzt));
  return (
    <details className="email-schreiben-links" open={offen}>
      <summary>Ausgegebene Links ({links.length})</summary>
      <ul>
        {links.map((l) => {
          const stand = l.zurueckgezogen ? `zurückgezogen ${zeitpunkt(l.zurueckgezogen)}` : Date.parse(l.bis) <= jetzt ? `abgelaufen ${tag(l.bis)}` : `gültig bis ${tag(l.bis)}`;
          const aktiv = !l.zurueckgezogen && Date.parse(l.bis) > jetzt;
          return (
            <li key={l.id}>
              <span>{l.nummer ? `Exposé ${l.nummer}` : "Exposé"} · erzeugt {zeitpunkt(l.erstellt)}</span>
              <span className={aktiv ? "email-schreiben-link-aktiv" : "leise"}>{stand}</span>
              {aktiv ? <Zurueckziehen id={l.id} /> : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Zurueckziehen({ id }: { id: string }) {
  const f = useFetcher<{ zurueckgezogen?: string | null; error?: string }>();
  return (
    <f.Form method="post">
      <input type="hidden" name="_intent" value="expose_link_zurueckziehen" />
      <input type="hidden" name="link_id" value={id} />
      <button className="secondary-button compact" type="submit">Zurückziehen</button>
      {f.data?.error ? <span className="form-error">{f.data.error}</span> : null}
    </f.Form>
  );
}
