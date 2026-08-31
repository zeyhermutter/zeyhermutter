import type { Route } from "./+types/sitemap";
import { createSupabaseServerClient } from "~/lib/supabase.server";

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

  const origin = new URL(request.url).origin;
  const staticPaths = ["/", "/immobilien", "/kontakt"];
  const entries = staticPaths.map((path) => ({
    location: new URL(path, origin).toString(),
    lastModified: null as string | null,
  }));

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
