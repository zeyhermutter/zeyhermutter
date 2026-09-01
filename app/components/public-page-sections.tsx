import { Link } from "react-router";
import type { WebsiteContent } from "~/lib/website-content";

export function HomePageSections({ content: c }: { content: WebsiteContent }) {
  return <>
    <section className="hv7r-hero">
      <div className="hv7r-hero-copy">
        <p className="public-eyebrow">{c.hero_eyebrow}</p>
        <h1>{c.hero_title}</h1>
        <p className="hv7r-lead">{c.hero_lead}</p>
        <div className="hv7r-actions">
          <Link className="hv7r-primary" to="/kontakt">{c.primary_cta_label}</Link>
          <Link className="hv7r-secondary" to="/verkaufsfertig-check">{c.secondary_cta_label}</Link>
          <Link className="hv7r-text" to="/immobilien">{c.property_cta_label}</Link>
        </div>
      </div>
      <div className="hv7r-photo-credit">Foto: Clay Banks / Unsplash</div>
    </section>

    <section className="hv7r-choice">
      <div className="hv7r-choice-head"><p className="public-eyebrow">{c.choice_eyebrow}</p><h2>{c.choice_title}</h2><p>{c.choice_body}</p></div>
      <div className="hv7r-choice-grid">
        <article className="primary"><span>01 · Immobilienverkauf</span><h3>{c.primary_title}</h3><p>{c.primary_body}</p><Link to="/kontakt">{c.primary_link_label}</Link></article>
        <article className="secondary"><span>02 · Option vor der Vermarktung</span><h3>{c.secondary_title}</h3><p>{c.secondary_body}</p><Link to="/verkaufsfertig-check">{c.secondary_link_label}</Link></article>
      </div>
    </section>

    <section className="hv7r-services">
      <div className="hv7r-services-head"><p className="public-eyebrow">{c.services_eyebrow}</p><h2>{c.services_title}</h2></div>
      <div className="hv7r-service-grid">
        <article><span>01</span><h3>{c.service_1_title}</h3><p>{c.service_1_body}</p></article>
        <article><span>02</span><h3>{c.service_2_title}</h3><p>{c.service_2_body}</p></article>
        <article><span>03</span><h3>{c.service_3_title}</h3><p>{c.service_3_body}</p></article>
      </div>
    </section>

    <section className="hv7r-check-band">
      <div><p className="public-eyebrow">{c.check_eyebrow}</p><h2>{c.check_title}</h2><p>{c.check_body}</p></div>
      <div className="hv7r-check-points">
        <div><span>A</span><strong>{c.check_point_a}</strong></div><div><span>B</span><strong>{c.check_point_b}</strong></div><div><span>C</span><strong>{c.check_point_c}</strong></div>
        <Link to="/verkaufsfertig-check">{c.check_link_label}</Link>
      </div>
    </section>

    <section className="hv7r-trust"><blockquote>„{c.trust_quote}“</blockquote><div><strong>Zeyher & Mutter Immobilien</strong><p>{c.trust_body}</p></div></section>
    <section className="hv7r-cta"><div><p className="public-eyebrow">{c.cta_eyebrow}</p><h2>{c.cta_title}</h2></div><div><Link className="hv7r-primary" to="/kontakt">{c.cta_primary_label}</Link><Link className="hv7r-secondary light" to="/verkaufsfertig-check">{c.cta_secondary_label}</Link></div></section>
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
