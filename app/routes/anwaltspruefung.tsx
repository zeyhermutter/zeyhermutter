import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/anwaltspruefung";
import { requireActiveUser } from "~/lib/auth.server";
import { ANWALTSPRUEFUNG } from "~/lib/anwaltspruefung";
import "~/anwaltspruefung.css";

// Verwaltung > Anwaltspruefung (15.10.2026): alle Punkte, die vor der
// produktiven Nutzung anwaltlich abzunehmen sind, an einer Stelle. Vorher
// standen sie verteilt auf neun Arbeitsseiten. Die Seite bewertet nichts und
// haelt keinen Stand fest -- sie ist die Liste fuer das Gespraech mit dem
// Anwalt.

export async function loader({ request, context }: Route.LoaderArgs) {
  const { responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  return data({ gruppen: ANWALTSPRUEFUNG }, { headers: responseHeaders() });
}

export default function Anwaltspruefung() {
  const { gruppen } = useLoaderData<typeof loader>();
  const anzahl = gruppen.reduce((n, g) => n + g.punkte.length, 0);
  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <p className="eyebrow">Verwaltung</p>
          <h1 className="editor-title">Anwaltsprüfung</h1>
          <p className="editor-meta">{anzahl} Fragen in {gruppen.length} Bereichen, die vor der produktiven Nutzung anwaltlich zu klären sind. Das System beantwortet keine davon.</p>
        </div>
      </header>
      <div className="anwalt-seite">
        {gruppen.map((g) => (
          <section className="data-card" key={g.bereich}>
            <div className="card-head"><div><p className="eyebrow">{g.ort}</p><h2>{g.bereich}</h2></div><span className="subtle">{g.punkte.length} Fragen</span></div>
            <ol className="anwalt-liste">{g.punkte.map((p) => <li key={p}>{p}</li>)}</ol>
          </section>
        ))}
      </div>
    </main>
  );
}
