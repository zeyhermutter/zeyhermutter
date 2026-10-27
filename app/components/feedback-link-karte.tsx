import { useState } from "react";
import { useFetcher } from "react-router";
import { ABSAGEGRUND, INTERESSE_KUNDE, PREISEINSCHAETZUNG, WUNSCH_KURZ, beschriftung } from "~/lib/besichtigung-feedback";
import { istMobilnummer, whatsappGruss, whatsappLink, whatsappNummer } from "~/lib/whatsapp";
import { zeitpunkt } from "~/lib/format";

// Rueckmeldung des Interessenten per Link (27.10.2026). Der Makler erzeugt
// den Link hier und verschickt ihn selbst -- das CRM sendet nichts. Die
// Antwort steht unten am Link und geht nur auf Klick ins Feedback.

type Link = {
  id: string; created_at: string; expires_at: string; revoked_at: string | null; opened_at: string | null;
  submitted_at: string | null; interest_level: string | null; liked: string | null; concerns: string | null;
  price_perception: string | null; wish: string | null; decline_reason: string | null; comment: string | null;
  taken_over_at: string | null;
};
type Kontakt = { salutation?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; mobile?: string | null };

function zustand(l: Link) {
  if (l.submitted_at) return `beantwortet am ${zeitpunkt(l.submitted_at)}`;
  if (l.revoked_at) return "zurückgezogen";
  if (new Date(l.expires_at).getTime() <= Date.now()) return "abgelaufen";
  return l.opened_at ? `geöffnet am ${zeitpunkt(l.opened_at)}, noch nicht beantwortet` : `offen bis ${zeitpunkt(l.expires_at)}`;
}

function nachricht(k: Kontakt, link: string) {
  return `${whatsappGruss(k)}vielen Dank, dass Sie sich die Immobilie angesehen haben. Wie hat sie Ihnen gefallen? `
    + `Ihre Rückmeldung dauert etwa zwei Minuten:\n${link}\n\nDer Link ist 14 Tage gültig.\n\nFreundliche Grüße`;
}

export function FeedbackLinkKarte({ status, canWrite, links, kontakt }: { status: string; canWrite: boolean; links: Link[]; kontakt: Kontakt }) {
  const erzeugen = useFetcher<{ error?: string; ok?: string; link?: string }>();
  const aktion = useFetcher<{ error?: string; ok?: string }>();
  const [kopiert, setKopiert] = useState(false);
  const neu = erzeugen.data?.link;
  const meldung = aktion.data ?? (erzeugen.data?.error ? erzeugen.data : null);
  const wa = istMobilnummer(kontakt.mobile) ? whatsappNummer(kontakt.mobile) : null;

  return (
    <section className="data-card feedback-link-karte">
      <div className="card-head"><div><p className="eyebrow">Feedback-Link</p><h2>Rückmeldung des Interessenten</h2></div></div>
      {meldung?.error ? <div className="form-error">{meldung.error}</div> : null}
      {meldung?.ok ? <div className="success-banner">{meldung.ok}</div> : null}
      {status !== "COMPLETED" ? <p className="empty-state">Den Link gibt es nach dem Status „Durchgeführt“.</p> : canWrite ? (
        neu ? (
          <div className="feedback-link-neu">
            <p className="subtle">Der Link wird nur jetzt angezeigt. Verschicken Sie ihn selbst – das CRM sendet nichts.</p>
            <div className="inline-actions">
              <input readOnly value={neu} aria-label="Feedback-Link" onFocus={(e) => e.currentTarget.select()} style={{ flex: "1 1 320px" }} />
              <button className="secondary-button compact" type="button" onClick={() => { navigator.clipboard?.writeText(nachricht(kontakt, neu)).then(() => setKopiert(true)); }}>{kopiert ? "Text kopiert" : "Text kopieren"}</button>
              {kontakt.email ? <a className="secondary-button link-button compact" href={`mailto:${encodeURIComponent(kontakt.email)}?subject=${encodeURIComponent("Ihre Besichtigung – kurze Rückmeldung")}&body=${encodeURIComponent(nachricht(kontakt, neu))}`}>E-Mail vorbereiten</a> : null}
              {wa ? <a className="secondary-button link-button compact" href={whatsappLink(wa, nachricht(kontakt, neu))} target="_blank" rel="noreferrer">WhatsApp vorbereiten</a> : null}
            </div>
          </div>
        ) : (
          <erzeugen.Form method="post">
            <input type="hidden" name="_intent" value="feedback_link" />
            <p className="subtle">Der Interessent beantwortet ein kurzes Formular ohne Anmeldung. Der Link gilt 14 Tage und lässt sich zurückziehen.</p>
            <button className="primary-button" type="submit" disabled={erzeugen.state !== "idle"}>Feedback-Link erzeugen</button>
          </erzeugen.Form>
        )
      ) : null}
      {links.length ? (
        <div className="data-list" style={{ marginTop: 14 }}>
          {links.map((l) => (
            <div className="data-row" key={l.id}>
              <div style={{ flex: 1 }}>
                <strong>Link vom {zeitpunkt(l.created_at)}</strong>
                <small className="row-meta">{zustand(l)}</small>
                {l.submitted_at ? (
                  <dl className="akte-felder" style={{ marginTop: 8 }}>
                    <div><dt>Eindruck</dt><dd>{beschriftung(INTERESSE_KUNDE, l.interest_level)}</dd></div>
                    {l.liked ? <div><dt>Gefallen</dt><dd>{l.liked}</dd></div> : null}
                    {l.concerns ? <div><dt>Gestört / offen</dt><dd>{l.concerns}</dd></div> : null}
                    {l.price_perception ? <div><dt>Preis</dt><dd>{beschriftung(PREISEINSCHAETZUNG, l.price_perception)}</dd></div> : null}
                    {l.wish ? <div><dt>Wunsch</dt><dd>{beschriftung(WUNSCH_KURZ, l.wish)}</dd></div> : null}
                    {l.decline_reason ? <div><dt>Hauptgrund</dt><dd>{beschriftung(ABSAGEGRUND, l.decline_reason)}</dd></div> : null}
                    {l.comment ? <div><dt>Anmerkung</dt><dd>{l.comment}</dd></div> : null}
                  </dl>
                ) : null}
              </div>
              {canWrite ? (
                l.submitted_at ? (l.taken_over_at ? <small className="row-meta">übernommen am {zeitpunkt(l.taken_over_at)}</small> : (
                  <aktion.Form method="post"><input type="hidden" name="_intent" value="feedback_uebernehmen" /><input type="hidden" name="link_id" value={l.id} /><button className="secondary-button compact" type="submit">In Feedback übernehmen</button></aktion.Form>
                )) : !l.revoked_at && new Date(l.expires_at).getTime() > Date.now() ? (
                  <aktion.Form method="post"><input type="hidden" name="_intent" value="feedback_link_zurueckziehen" /><input type="hidden" name="link_id" value={l.id} /><button className="secondary-button compact" type="submit">Zurückziehen</button></aktion.Form>
                ) : null
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
