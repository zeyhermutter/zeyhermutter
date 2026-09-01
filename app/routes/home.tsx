import { Link } from "react-router";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import "~/public-website.css";
import "~/homepage-variants.css";
import "~/homepage-v7-realtor.css";

export function meta() {
  return [
    { title: "Immobilien verkaufen · ZeyherMutter Immobilienvermittlung" },
    { name: "description", content: "ZeyherMutter begleitet Eigentümer beim Immobilienverkauf von der Positionierung über die Vermarktung bis zum Abschluss. Der Verkaufsstrategie-Check ergänzt die Maklerleistung bei offenen Fragen vor dem Marktstart." },
  ];
}

export default function Home() {
  return (
    <main className="public-site hv-site hv7r-site">
      <PublicHeader />

      <section className="hv7r-hero">
        <div className="hv7r-hero-copy">
          <p className="public-eyebrow">ZeyherMutter · Immobilienvermittlung</p>
          <h1>Immobilien verkaufen. Persönlich begleitet, professionell vermarktet.</h1>
          <p className="hv7r-lead">Wir begleiten Eigentümer vom ersten Gespräch bis zum erfolgreichen Abschluss: mit realistischer Einordnung, klarer Positionierung, hochwertiger Vermarktung und persönlicher Betreuung.</p>
          <div className="hv7r-actions">
            <Link className="hv7r-primary" to="/kontakt">Immobilie verkaufen</Link>
            <Link className="hv7r-secondary" to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link>
            <Link className="hv7r-text" to="/immobilien">Immobilien ansehen →</Link>
          </div>
        </div>
        <div className="hv7r-photo-credit">Foto: Clay Banks / Unsplash</div>
      </section>

      <section className="hv7r-choice">
        <div className="hv7r-choice-head">
          <p className="public-eyebrow">Zwei Wege zu uns</p>
          <h2>Sie möchten verkaufen. Wir steigen dort ein, wo Sie gerade stehen.</h2>
          <p>Für die meisten Eigentümer beginnt die Zusammenarbeit klassisch mit der Immobilienvermittlung. Wenn vor dem Marktstart noch offen ist, ob und welche Vorbereitung sinnvoll ist, ergänzt der Verkaufsstrategie-Check unseren Maklerprozess.</p>
        </div>
        <div className="hv7r-choice-grid">
          <article className="primary">
            <span>01 · Immobilienverkauf</span>
            <h3>Klassische Maklerleistung aus einer Hand.</h3>
            <p>Einordnung, Positionierung, Exposé, Vermarktung, Interessentenmanagement, Besichtigungen, Verhandlung und Begleitung bis zum Abschluss.</p>
            <Link to="/kontakt">Verkaufsgespräch anfragen →</Link>
          </article>
          <article className="secondary">
            <span>02 · Option vor der Vermarktung</span>
            <h3>Verkaufsstrategie-Check</h3>
            <p>Wenn Zustand, Maßnahmen oder Investitionen vor dem Verkauf unklar sind, vergleichen wir Ist-Zustand, gezielte Aufbereitung und größere Maßnahmen.</p>
            <Link to="/verkaufsfertig-check">Verkaufsstrategie-Check ansehen →</Link>
          </article>
        </div>
      </section>

      <section className="hv7r-services">
        <div className="hv7r-services-head">
          <p className="public-eyebrow">Unsere Maklerleistung</p>
          <h2>Ein klarer Verkaufsprozess – professionell geführt.</h2>
        </div>
        <div className="hv7r-service-grid">
          <article><span>01</span><h3>Bewerten & positionieren</h3><p>Immobilie, Zielgruppe und Ausgangslage einordnen und daraus eine schlüssige Vermarktungsstrategie entwickeln.</p></article>
          <article><span>02</span><h3>Präsentieren & vermarkten</h3><p>Unterlagen, Aufbereitung, Darstellung und Vermarktungskanäle zu einem professionellen Marktauftritt zusammenführen.</p></article>
          <article><span>03</span><h3>Interessenten & Abschluss</h3><p>Anfragen qualifizieren, Besichtigungen koordinieren, Verhandlungen begleiten und den Verkaufsprozess strukturiert weiterführen.</p></article>
        </div>
      </section>

      <section className="hv7r-check-band">
        <div>
          <p className="public-eyebrow">Wenn vor dem Verkauf noch Fragen offen sind</p>
          <h2>Erst klären, was die Immobilie braucht. Dann klassisch vermarkten.</h2>
          <p>Der Verkaufsstrategie-Check ist kein Ersatz für unsere Maklerleistung, sondern eine zusätzliche Option davor. Er hilft bei der Entscheidung, ob die Immobilie direkt in den Markt gehen sollte oder ob ausgewählte Maßnahmen sinnvoll erscheinen.</p>
        </div>
        <div className="hv7r-check-points">
          <div><span>A</span><strong>Im Ist-Zustand verkaufen</strong></div>
          <div><span>B</span><strong>Gezielt aufbereiten</strong></div>
          <div><span>C</span><strong>Erweiterte Maßnahmen prüfen</strong></div>
          <Link to="/verkaufsfertig-check">Check im gleichen Design öffnen →</Link>
        </div>
      </section>

      <section className="hv7r-trust">
        <blockquote>„Eine gute Vermarktung beginnt mit einem klaren Blick auf die Immobilie – und mit einem Makler, der den gesamten Weg weiterführt.“</blockquote>
        <div><strong>ZeyherMutter Immobilienvermittlung</strong><p>Klassischer Immobilienverkauf als Kernleistung. Verkaufsstrategie-Check als zusätzliche Entscheidungshilfe, wenn vor dem Marktstart noch Klärungsbedarf besteht.</p></div>
      </section>

      <section className="hv7r-cta">
        <div><p className="public-eyebrow">Wie möchten Sie starten?</p><h2>Direkt verkaufen oder vorher den Verkaufsweg prüfen.</h2></div>
        <div><Link className="hv7r-primary" to="/kontakt">Immobilie verkaufen</Link><Link className="hv7r-secondary light" to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link></div>
      </section>

      <PublicFooter />
    </main>
  );
}
