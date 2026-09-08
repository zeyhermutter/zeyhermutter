import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/public-references";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { tag } from "~/lib/format";
import "~/public-website.css";

// Diese Seite erfindet nichts. Sie zeigt ausschliesslich Fallstudien, die im
// CRM eine erteilte Freigabe der Eigentuemer tragen (release_status GRANTED,
// per Datenbank-Constraint erzwungen) UND von einer berechtigten Person
// ausdruecklich fuer die Webseite freigeschaltet wurden.
//
// Solange keine Freigabe vorliegt, bleibt die Seite leer. Das ist kein Mangel,
// den man mit Beispieltexten kaschiert -- es ist die Aussage selbst: hier steht
// nur, wozu jemand ja gesagt hat.
//
// Fotos fehlen bewusst. Ein Bild macht ein Objekt erkennbar und faellt damit
// unter release_scope = 'IDENTIFIABLE'; ausserdem liegt die oeffentlich
// abrufbare Kopie eines Bildes nur vor, wenn das Objekt selbst veroeffentlicht
// wurde. Beides ist zu klaeren, bevor hier Bilder erscheinen.

const ZITAT_QUELLE: Record<string, string> = {
  WRITTEN: "schriftliche Rückmeldung",
  REVIEW: "öffentliche Bewertung",
};

export function meta() {
  return [
    { title: "Referenzen · ZeyherMutter" },
    { name: "description", content: "Abgeschlossene Verkäufe, die wir mit ausdrücklicher Freigabe der Eigentümer zeigen dürfen." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context.cloudflare.env);
  const { data: rows, error } = await supabase.rpc("public_case_studies");
  // Ein Ladefehler darf nicht wie "wir haben keine Referenzen" aussehen.
  if (error) return data({ rows: [], fehler: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  return data({ rows: rows ?? [], fehler: false }, {
    headers: { "Cache-Control": "public, max-age=120, s-maxage=300" },
  });
}

export default function PublicReferences() {
  const { rows, fehler } = useLoaderData<typeof loader>();
  return <main className="public-site">
    <PublicHeader />
    <section className="public-hero">
      <p className="public-eyebrow">Referenzen</p>
      <h1>Abgeschlossene Verkäufe.</h1>
      <p>Wir zeigen einen Verkauf erst, wenn die Eigentümer der Veröffentlichung ausdrücklich zugestimmt haben. Deshalb steht hier weniger, als wir begleitet haben.</p>
    </section>

    <section className="zm-referenzen">
      {fehler ? (
        <p className="zm-referenz-hinweis">Die Referenzen konnten gerade nicht geladen werden. Bitte versuchen Sie es später noch einmal — oder sprechen Sie uns direkt an.</p>
      ) : rows.length === 0 ? (
        <div className="zm-referenz-leer">
          <h2>Derzeit ist keine Referenz freigegeben.</h2>
          <p>Jede Veröffentlichung braucht die Zustimmung der Eigentümer, und wir fragen sie erst, wenn der Verkauf abgeschlossen ist. Wer wissen möchte, wie wir arbeiten, fragt am besten direkt nach — wir sprechen dann über konkrete Fälle.</p>
          <Link className="public-primary-button" to="/kontakt">Gespräch vereinbaren</Link>
        </div>
      ) : (
        <ol className="zm-referenz-liste">
          {rows.map((row: any) => (
            <li key={row.referenz}>
              <article>
                <p className="public-eyebrow">{row.anonymisiert ? "Anonymisiert" : "Mit Zustimmung namentlich"} · {row.referenz}</p>
                <h2>{row.titel}</h2>
                {row.ausgangslage ? <><h3>Ausgangslage</h3><p>{row.ausgangslage}</p></> : null}
                {row.besonderheiten ? <><h3>Besonderheiten</h3><p>{row.besonderheiten}</p></> : null}
                {row.zitat ? (
                  <blockquote className="zm-referenz-zitat">
                    <p>{row.zitat}</p>
                    <footer>
                      {ZITAT_QUELLE[row.zitat_quelle] ?? "Rückmeldung"}
                      {row.zitat_datum ? ` · ${tag(row.zitat_datum)}` : ""}
                    </footer>
                  </blockquote>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>

    <section className="zm-cta">
      <div>
        <p className="public-eyebrow">Nächster Schritt</p>
        <h2>Sprechen wir über Ihre Immobilie.</h2>
      </div>
      <div>
        <Link className="zm-primary" to="/kontakt">Gespräch vereinbaren</Link>
        <Link className="zm-secondary" to="/verkaufsfertig-check">Erst den Check</Link>
      </div>
    </section>

    <PublicFooter />
  </main>;
}
