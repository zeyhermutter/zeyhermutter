import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/lead-sales-readiness";
import { SalesReadinessWorkspace } from "~/components/sales-readiness-workspace";
import { requirePermission } from "~/lib/auth.server";
import { loadPreparedSalesReadiness, SALES_READINESS_BACKEND_ENABLED } from "~/lib/sales-readiness.server";
import "~/sales-readiness.css";

export function meta() {
  return [
    { title: "Verkaufsfertig-Check · ZeyherMutterOS" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(
    request,
    context.cloudflare.env,
    "lead.read",
  );
  if (!params.leadId) throw new Response("Lead fehlt.", { status: 404 });

  // Intentionally reads only the existing lead/contact/profile tables. The
  // prepared sales-readiness tables are untouched until the backend gate opens.
  const viewModel = await loadPreparedSalesReadiness(supabase, params.leadId);
  return data(
    { viewModel, profile, backendEnabled: SALES_READINESS_BACKEND_ENABLED },
    { headers: responseHeaders() },
  );
}

export default function LeadSalesReadiness() {
  const { viewModel, profile, backendEnabled } = useLoaderData<typeof loader>();
  return (
    <main className="editor-shell lead-shell readiness-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to={`/leads/${viewModel.lead.id}`}>← Lead-Detail</Link>
          <p className="eyebrow">Modul 03 · Verkaufsfertig</p>
          <h1 className="editor-title">Verkaufsfertig-Check</h1>
          <p className="editor-meta">Szenarien vergleichen, Maßnahmen priorisieren und die Verkaufsaufbereitung planen.</p>
        </div>
        <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
      </header>
      <SalesReadinessWorkspace viewModel={viewModel} preview={backendEnabled} />
    </main>
  );
}
