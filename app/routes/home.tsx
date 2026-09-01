import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { HomePageSections } from "~/components/public-page-sections";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { loadPublicWebsitePage } from "~/lib/website-content.server";
import "~/public-website.css";
import "~/homepage-variants.css";
import "~/homepage-v7-realtor.css";

export function meta({ data: loaderData }: Route.MetaArgs) {
  return [
    { title: loaderData?.seoTitle ?? "Immobilien verkaufen · Zeyher & Mutter Immobilien" },
    { name: "description", content: loaderData?.seoDescription ?? "Zeyher & Mutter begleitet Eigentümer beim Immobilienverkauf von der Positionierung über die Vermarktung bis zum Abschluss. Der Verkaufsstrategie-Check ergänzt die Maklerleistung bei offenen Fragen vor dem Marktstart." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const page = await loadPublicWebsitePage(request, context.cloudflare.env, "HOME");
  return data(page, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

export default function Home() {
  const { content } = useLoaderData<typeof loader>();
  return <main className="public-site hv-site hv7r-site"><PublicHeader/><HomePageSections content={content}/><PublicFooter/></main>;
}
