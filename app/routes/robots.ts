import type { Route } from "./+types/robots";
import { INTERNE_PRAEFIXE, WEITERE_GESPERRTE_PFADE } from "~/lib/public-pages";

// Die Sperrliste stand hier einmal von Hand getippt und war bei /crm, /leads
// und /properties stehengeblieben, waehrend /mandates, /closings, /commissions
// und ein Dutzend weitere interne Bereiche dazugekommen sind. Sie kommt jetzt
// aus app/lib/public-pages.ts und wird bei jedem Build gegen app/routes.ts
// geprueft -- siehe scripts/check-sitemap.mjs.

export function loader({ request }: Route.LoaderArgs) {
  const sitemap = new URL("/sitemap.xml", request.url).toString();
  const gesperrt = [...new Set([...INTERNE_PRAEFIXE, ...WEITERE_GESPERRTE_PFADE])].sort();
  const body = [
    "User-agent: *",
    "Allow: /",
    ...gesperrt.map((pfad) => `Disallow: ${pfad}`),
    `Sitemap: ${sitemap}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
