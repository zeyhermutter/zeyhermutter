import type { Route } from "./+types/sitemap";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { sitemapPfade } from "~/lib/public-pages";

// Die Sitemap fuehrte vier von Hand getippte Pfade. Elf oeffentliche Seiten
// waren inzwischen dazugekommen und standen in keiner davon. Die Liste steht
// jetzt in app/lib/public-pages.ts und wird bei jedem Build gegen app/routes.ts
// geprueft -- siehe scripts/check-sitemap.mjs.

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context.cloudflare.env);
  const { data: listings, error } = await supabase.rpc("public_property_listings");
  if (error) throw new Response("Sitemap konnte nicht erstellt werden.", { status: 503 });

  // Welche CMS-Seiten eine oeffentliche Fassung haben. Nur fuer die wenigen
  // Seiten von Belang, deren Text noch aussteht: sie bleiben draussen, bis er
  // da ist. Faellt die Abfrage aus, bleibt die Sitemap ohne sie -- lieber eine
  // Seite zu wenig als eine Platzhalterseite im Index.
  const { data: versionen } = await supabase
    .from("website_page_versions")
    .select("page_key")
    .eq("is_current_public", true);

  const veroeffentlicht = new Set<string>((versionen ?? []).map((zeile) => zeile.page_key));

  const origin = new URL(request.url).origin;
  const entries: { location: string; lastModified: string | null }[] = [];

  for (const pfad of sitemapPfade(veroeffentlicht)) {
    entries.push({ location: new URL(pfad, origin).toString(), lastModified: null });
  }

  for (const listing of listings ?? []) {
    if (!listing.public_slug) continue;
    entries.push({
      location: new URL(`/immobilien/${encodeURIComponent(listing.public_slug)}`, origin).toString(),
      lastModified: listing.published_at ? new Date(listing.published_at).toISOString() : null,
    });
  }

  const urls = entries.map(({ location, lastModified }) => [
    "  <url>",
    `    <loc>${escapeXml(location)}</loc>`,
    lastModified ? `    <lastmod>${escapeXml(lastModified)}</lastmod>` : null,
    "  </url>",
  ].filter(Boolean).join("\n")).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=1800",
      "Content-Type": "application/xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
