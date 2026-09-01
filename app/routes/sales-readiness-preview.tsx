import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/sales-readiness-preview";
import { SalesReadinessWorkspace } from "~/components/sales-readiness-workspace";
import { localSalesReadinessFixture } from "~/fixtures/sales-readiness";
import "~/sales-readiness.css";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function meta() {
  return [
    { title: "Lokale CRM-Vorschau · Verkaufsfertig-Check" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ];
}
export async function loader({ request }: Route.LoaderArgs) {
  const hostname = new URL(request.url).hostname;
  if (!LOCAL_HOSTNAMES.has(hostname)) throw new Response("Nicht gefunden.", { status: 404 });
  return data(
    { viewModel: localSalesReadinessFixture },
    { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" } },
  );
}

export default function SalesReadinessPreview() {
  const { viewModel } = useLoaderData<typeof loader>();
  return (
    <main className="editor-shell lead-shell readiness-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to="/">← Website-Vorschau</Link>
          <p className="eyebrow">Nur localhost · synthetische Fixture</p>
          <h1 className="editor-title">CRM-Arbeitsbereich prüfen</h1>
          <p className="editor-meta">Diese Route liefert keine BETA-/PROD-Daten und schreibt nichts in Supabase.</p>
        </div>
        <div className="header-user"><span className="badge">LOCAL PREVIEW</span></div>
      </header>
      <SalesReadinessWorkspace viewModel={viewModel} preview />
    </main>
  );
}
