import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/public-withdrawal";
import { loadPublicWebsitePage } from "~/lib/website-content.server";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { PublicLegalSection } from "~/components/public-page-sections";
import "~/public-website.css";

// Die Seite ist gebaut, der Text ist es nicht: eine Widerrufsbelehrung ist ein
// Rechtstext, und diese Software erzeugt keine Belehrungen, Klauseln oder
// Vertragsformulierungen. Der verbindliche Text kommt aus der Rechtsberatung
// und wird im CRM unter Website-CMS eingetragen.
//
// Aufbau und Auszeichnung sind dieselben wie bei Impressum und Datenschutz --
// die drei gehören zusammen und sollen auch gleich aussehen.

// Ohne veroeffentlichte Fassung steht hier der Standardtext, und der sagt, dass
// die Belehrung fehlt. Kein Index, und auch nicht in der Sitemap -- siehe
// SEITEN_OHNE_HINTERLEGTEN_TEXT in app/lib/public-pages.ts.
export function meta({ data: routeData }: Route.MetaArgs) {
  const seite = routeData as { seoTitle?: string | null; version?: number | null } | undefined;
  return [
    { title: seite?.seoTitle || "Widerrufsbelehrung · ZeyherMutter" },
    { name: "robots", content: seite?.version ? "index,follow" : "noindex,follow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const page = await loadPublicWebsitePage(request, context.cloudflare.env, "WITHDRAWAL");
  return data(page, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

export default function PublicWithdrawal() {
  const { content } = useLoaderData<typeof loader>();
  return <main className="public-site">
    <PublicHeader />
    <PublicLegalSection content={content} privacy />
    <PublicFooter />
  </main>;
}
