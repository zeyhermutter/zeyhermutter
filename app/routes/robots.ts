import type { Route } from "./+types/robots";

export function loader({ request }: Route.LoaderArgs) {
  const sitemap = new URL("/sitemap.xml", request.url).toString();
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /crm",
    "Disallow: /inquiries",
    "Disallow: /leads",
    "Disallow: /login",
    "Disallow: /logout",
    "Disallow: /properties",
    "Disallow: /search-profiles",
    "Disallow: /viewings",
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
