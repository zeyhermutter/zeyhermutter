import type { ReactNode } from "react";
import { Link } from "react-router";
import { ObjektKarte } from "~/components/objekt-karte";
import type { WebsiteContent } from "~/lib/website-content";

// --- Startseite ---------------------------------------------------------------
//
// Aufbau seit 13.10.2026, gedacht vom Besucher aus: Wer seid ihr, was bietet
// ihr, was mache ich jetzt? Der Kopf beantwortet alle drei -- Ueberschrift,
// vier Anliegen als Wegweiser, zwei Knoepfe. Darunter Belege statt
// Behauptungen: die Leistungen mit ihren Seiten, echte Immobilien aus dem
// CRM, der Ablauf, die Menschen. Keine erfundenen Zahlen, keine Bewertungen.

/** Schlichte Liniensymbole, eigene Zeichnung. */
const SYMBOL: Record<string, ReactNode> = {
  verkauf: <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>,
  bewertung: <><path d="M4 20h16" /><path d="M6 16l4-5 3 3 5-7" /><path d="M15 7h3v3" /></>,
  suche: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /><path d="M8.5 11.5 11 9l2.5 2.5V14h-5Z" /></>,
  aufmass: <><path d="M3.5 16.5 16.5 3.5l4 4-13 13Z" /><path d="m7 13 1.8 1.8M9.5 10.5l1.2 1.2M12 8l1.8 1.8M14.5 5.5l1.2 1.2" /></>,
  check: <><path d="M6 3.5h9l3.5 3.5v13.5H6Z" /><path d="M14.5 3.5v4h4" /><path d="m9 13.5 2.2 2.2 4.3-4.2" /></>,
  ratgeber: <><path d="M4 5.5c3-1.5 5.5-1.5 8 .5 2.5-2 5-2 8-.5v13c-3-1.5-5.5-1.5-8 .5-2.5-2-5-2-8-.5Z" /><path d="M12 6v13" /></>,
};

function Symbol({ name }: { name: string }) {
  return <svg className="zm-symbol" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{SYMBOL[name]}</svg>;
}

const ANLIEGEN = [
  { n: 1, pfad: "/kontakt", symbol: "verkauf" },
  { n: 2, pfad: "/bewertung", symbol: "bewertung" },
  { n: 3, pfad: "/suchauftrag", symbol: "suche" },
  { n: 4, pfad: "/technisches-aufmass", symbol: "aufmass" },
];

const LEISTUNGEN = [
  { k: "verkauf", pfad: "/kontakt", haupt: true },
  { k: "bewertung", pfad: "/bewertung" },
  { k: "check", pfad: "/verkaufsfertig-check" },
  { k: "aufmass", pfad: "/technisches-aufmass" },
  { k: "suche", pfad: "/suchauftrag" },
];

const ANLAESSE: [string, string][] = [
  ["Geerbte Immobilie", "/ratgeber/geerbte-immobilie"],
  ["Immobilie bei Trennung", "/ratgeber/immobilie-bei-trennung"],
  ["Verkauf im Alter", "/ratgeber/immobilie-im-alter"],
  ["Energieausweis", "/ratgeber/energieausweis"],
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HomePageSections({ content: c, objekte = [] }: { content: WebsiteContent; objekte?: any[] }) {
  return <>
    <section className="zm-hero zm-auf-navy zm-held">
      <div className="zm-held-raster">
        <div className="zm-held-text">
          <p className="public-eyebrow">{c.held_eyebrow}</p>
          <h1>{c.held_titel}</h1>
          <p className="zm-lead">{c.held_text}</p>
          <div className="zm-actions">
            <Link className="zm-primary" to="/kontakt">{c.held_knopf}</Link>
            <Link className="zm-secondary" to="/bewertung">{c.held_knopf_2}</Link>
          </div>
        </div>
        <nav className="zm-anliegen" aria-label={c.anliegen_titel}>
          <p className="zm-anliegen-titel">{c.anliegen_titel}</p>
          {ANLIEGEN.map((a) => (
            <Link key={a.n} to={a.pfad} className="zm-anliegen-eintrag">
              <Symbol name={a.symbol} />
              <span><strong>{c[`anliegen_${a.n}_titel`]}</strong><small>{c[`anliegen_${a.n}_text`]}</small></span>
              <span className="zm-pfeil" aria-hidden="true">→</span>
            </Link>
          ))}
        </nav>
      </div>
    </section>

    <ul className="zm-vorteile" aria-label="Was uns ausmacht">
      {[1, 2, 3, 4].map((n) => <li key={n}><span aria-hidden="true">✓</span>{c[`vorteil_${n}`]}</li>)}
    </ul>

    <section className="zm-leistungen" id="leistungen">
      <div className="zm-abschnitt-kopf">
        <p className="public-eyebrow">{c.leistungen_eyebrow}</p>
        <h2>{c.leistungen_titel}</h2>
        <p>{c.leistungen_text}</p>
      </div>
      <div className="zm-leistungen-raster">
        {LEISTUNGEN.map((l) => (
          <Link key={l.k} to={l.pfad} className={`zm-leistung${l.haupt ? " haupt" : ""}`}>
            <Symbol name={l.k} />
            <h3>{c[`leistung_${l.k}_titel`]}</h3>
            <p>{c[`leistung_${l.k}_text`]}</p>
            {l.haupt && c.leistung_verkauf_punkte ? <ul className="zm-leistung-punkte">{c.leistung_verkauf_punkte.split("\n").map((p) => p.trim()).filter(Boolean).map((p) => <li key={p}>{p}</li>)}</ul> : null}
            <span className="zm-leistung-link">{c[`leistung_${l.k}_link`]} →</span>
          </Link>
        ))}
      </div>
    </section>

    <section className="zm-objekte">
      <div className="zm-abschnitt-kopf zm-kopf-zeile">
        <div><p className="public-eyebrow">{c.objekte_eyebrow}</p><h2>{c.objekte_titel}</h2></div>
        {objekte.length ? <Link className="zm-text-link" to="/immobilien">Alle Immobilien ansehen →</Link> : null}
      </div>
      {objekte.length
        ? <div className="public-property-grid compact">{objekte.map((row) => <ObjektKarte key={row.public_slug} row={row} />)}</div>
        : <div className="zm-objekte-leer"><p>{c.objekte_leer}</p><Link className="zm-primary" to="/suchauftrag">Suchauftrag anlegen</Link></div>}
    </section>

    <section className="zm-ablauf" id="verkaufen">
      <div className="zm-abschnitt-kopf">
        <p className="public-eyebrow">{c.ablauf_eyebrow}</p>
        <h2>{c.ablauf_titel}</h2>
      </div>
      <ol className="zm-ablauf-schritte">
        {[1, 2, 3, 4, 5].map((n) => (
          <li key={n}><span className="zm-schritt-nr">{n}</span><h3>{c[`schritt_${n}_titel`]}</h3><p>{c[`schritt_${n}_text`]}</p></li>
        ))}
      </ol>
    </section>

    <section className="zm-check-band zm-auf-navy">
      <div><p className="public-eyebrow">{c.check_eyebrow}</p><h2>{c.check_title}</h2><p>{c.check_body}</p></div>
      <div className="zm-check-points">
        <div><span>A</span><strong>{c.check_point_a}</strong></div><div><span>B</span><strong>{c.check_point_b}</strong></div><div><span>C</span><strong>{c.check_point_c}</strong></div>
        <Link to="/verkaufsfertig-check">{c.check_link_label} →</Link>
      </div>
    </section>

    <section className="zm-team">
      <div>
        <p className="public-eyebrow">{c.team_eyebrow}</p>
        <h2>{c.team_titel}</h2>
        {/* Monogramme statt Fotos, solange keine freigegebenen Fotos vorliegen --
            ein Bild von irgendwem waere bei einem Makler eine Behauptung. */}
        <div className="zm-team-personen">
          {[c.team_person_1, c.team_person_2].filter((n) => n && n.trim()).map((name) => (
            <span key={name}><span className="zm-monogramm" aria-hidden="true">{name.trim().charAt(0)}</span>{name}</span>
          ))}
        </div>
      </div>
      <div className="zm-team-text">
        {paragraphs(c.team_text ?? "").map((text, index) => <p key={index}>{text}</p>)}
        <Link className="zm-text-link" to="/ueber-uns">{c.team_link} →</Link>
      </div>
    </section>

    <section className="zm-anlaesse">
      <h2>{c.anlass_titel}</h2>
      <div>{ANLAESSE.map(([name, pfad]) => <Link key={pfad} to={pfad}>{name} →</Link>)}</div>
    </section>

    <section className="zm-cta">
      <div><p className="public-eyebrow">{c.abschluss_eyebrow}</p><h2>{c.abschluss_titel}</h2><p>{c.abschluss_text}</p></div>
      <div><Link className="zm-primary" to="/kontakt">{c.abschluss_knopf}</Link><Link className="zm-secondary" to="/bewertung">{c.abschluss_knopf_2}</Link></div>
    </section>
  </>;
}

export function ContactIntroSections({ content: c }: { content: WebsiteContent }) {
  return <>
    <section className="public-hero"><p className="public-eyebrow">{c.eyebrow}</p><h1>{c.title}</h1><p>{c.lead}</p></section>
  </>;
}

export function ContactPersonal({ content: c }: { content: WebsiteContent }) {
  return <div><p className="public-eyebrow">{c.personal_eyebrow}</p><h2>{c.personal_title}</h2><p>{c.personal_body}</p></div>;
}

function paragraphs(value: string) {
  return value.split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean);
}

export function PublicLegalSection({ content: c, privacy = false }: { content: WebsiteContent; privacy?: boolean }) {
  return <section className="public-legal">
    <p className="public-eyebrow">{c.eyebrow}</p><h1>{c.title}</h1>
    <div className="public-legal-notice"><strong>{c.notice_title}</strong>{paragraphs(c.body).map((p, index) => <p key={index}>{p}</p>)}</div>
    {privacy && c.note_body ? <div className="public-legal-note"><h2>{c.note_title}</h2>{paragraphs(c.note_body).map((p, index) => <p key={index}>{p}</p>)}</div> : null}
  </section>;
}

/**
 * Über uns.
 *
 * Personen werden nur ausgegeben, wenn sie einen Namen tragen. Eine leere
 * Karte mit einer Rolle und ohne Menschen dahinter wäre schlimmer als ein
 * kürzerer Abschnitt — und solange im CRM niemand eingetragen ist, ist das
 * hier tatsächlich die Wahrheit über diese Seite.
 */
export function AboutSections({ content: c }: { content: WebsiteContent }) {
  const personen = [1, 2, 3]
    .map((n) => ({
      name: c[`person_${n}_name`] ?? "",
      rolle: c[`person_${n}_role`] ?? "",
      text: c[`person_${n}_body`] ?? "",
    }))
    .filter((p) => p.name.trim().length > 0);

  return <>
    <section className="public-hero">
      <p className="public-eyebrow">{c.eyebrow}</p>
      <h1>{c.title}</h1>
      <p>{c.lead}</p>
    </section>

    <section className="zm-warum">
      <div><p className="public-eyebrow">{c.story_eyebrow}</p><h2>{c.story_title}</h2></div>
      <div className="public-prose-large">
        {paragraphs(c.story_body ?? "").map((text, index) => <p key={index}>{text}</p>)}
      </div>
    </section>

    <section className="zm-personen">
      <div className="zm-personen-kopf">
        <p className="public-eyebrow">{c.people_eyebrow}</p>
        <h2>{c.people_title}</h2>
      </div>
      {personen.length ? (
        <div className="zm-personen-gitter">
          {personen.map((person) => (
            <article key={person.name}>
              <h3>{person.name}</h3>
              {person.rolle ? <p className="zm-personen-rolle">{person.rolle}</p> : null}
              {paragraphs(person.text).map((text, index) => <p key={index}>{text}</p>)}
            </article>
          ))}
        </div>
      ) : (
        <p className="zm-referenz-hinweis">Die Personen werden im CRM unter Website-CMS eingetragen. Solange dort niemand hinterlegt ist, steht hier niemand.</p>
      )}
    </section>
  </>;
}

/**
 * Ohne Makler verkaufen.
 *
 * Beide Seiten stehen gleichwertig nebeneinander — das ist der Punkt der
 * Seite. Würde die eine Spalte nur als Aufwärmer für die andere dienen, wäre
 * es wieder eine Verkaufsbroschüre.
 */
export function PrivateSaleSections({ content: c }: { content: WebsiteContent }) {
  const dafuer = [c.for_1, c.for_2, c.for_3].filter((wert) => (wert ?? "").trim().length > 0);
  const dagegen = [c.against_1, c.against_2, c.against_3].filter((wert) => (wert ?? "").trim().length > 0);
  return <>
    <section className="public-hero">
      <p className="public-eyebrow">{c.eyebrow}</p>
      <h1>{c.title}</h1>
      <p>{c.lead}</p>
    </section>

    <section className="zm-abwaegung">
      <article>
        <p className="public-eyebrow">{c.for_eyebrow}</p>
        <h2>{c.for_title}</h2>
        <ul>{dafuer.map((text, index) => <li key={index}>{text}</li>)}</ul>
      </article>
      <article>
        <p className="public-eyebrow">{c.against_eyebrow}</p>
        <h2>{c.against_title}</h2>
        <ul>{dagegen.map((text, index) => <li key={index}>{text}</li>)}</ul>
      </article>
    </section>

    <section className="zm-check-band zm-einspaltig zm-auf-navy">
      <div>
        <p className="public-eyebrow">{c.closing_eyebrow}</p>
        <h2>{c.closing_title}</h2>
        {paragraphs(c.closing_body ?? "").map((text, index) => <p key={index}>{text}</p>)}
      </div>
    </section>
  </>;
}

/**
 * Eine Anlassseite des Ratgebers.
 *
 * Alle vier haben denselben Aufbau, und das ist Absicht: wer die zweite Seite
 * liest, soll sich nicht neu zurechtfinden müssen. Der letzte Abschnitt
 * gehört dazu und ist nicht das Kleingedruckte — er sagt, wofür man Notar,
 * Anwältin oder Steuerberatung braucht. Eine Maklerseite, die diese Grenze
 * verwischt, erteilt Rechtsberatung.
 */
export function RatgeberSections({ content: c }: { content: WebsiteContent }) {
  const punkte = [c.effect_1, c.effect_2, c.effect_3, c.effect_4]
    .filter((wert) => (wert ?? "").trim().length > 0);
  return <>
    <section className="public-hero">
      <p className="public-eyebrow">{c.eyebrow}</p>
      <h1>{c.title}</h1>
      <p>{c.lead}</p>
    </section>

    <section className="zm-warum">
      <div><p className="public-eyebrow">Ausgangslage</p><h2>{c.situation_title}</h2></div>
      <div className="public-prose-large">
        {paragraphs(c.situation_body ?? "").map((text, index) => <p key={index}>{text}</p>)}
      </div>
    </section>

    <section className="zm-punkte">
      <div className="zm-punkte-kopf">
        <p className="public-eyebrow">Für den Verkauf</p>
        <h2>{c.effects_title}</h2>
      </div>
      <ol className="zm-punkte-liste">
        {punkte.map((text, index) => (
          <li key={index}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><p>{text}</p></li>
        ))}
      </ol>
    </section>

    <section className="zm-grenze">
      <article className="zm-grenze-wir">
        <p className="public-eyebrow">Unsere Aufgabe</p>
        <h2>{c.we_title}</h2>
        {paragraphs(c.we_body ?? "").map((text, index) => <p key={index}>{text}</p>)}
      </article>
      {/* Bewusst gleich groß wie der Abschnitt daneben. Wer die Grenze klein
          setzt, meint sie nicht ernst. */}
      <article className="zm-grenze-andere">
        <p className="public-eyebrow">Nicht unsere Aufgabe</p>
        <h2>{c.limits_title}</h2>
        {paragraphs(c.limits_body ?? "").map((text, index) => <p key={index}>{text}</p>)}
      </article>
    </section>
  </>;
}
