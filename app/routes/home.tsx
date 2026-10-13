import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { herkunft, organisation, seitenkopf } from "~/lib/seitenkopf";
import { HomePageSections } from "~/components/public-page-sections";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { loadPublicWebsitePage } from "~/lib/website-content.server";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import "~/public-website.css";

function seitenMeta({ data: loaderData }: Route.MetaArgs) {
  return [
    { title: loaderData?.seoTitle ?? "Immobilienmakler in München · Zeyher & Mutter Immobilien" },
    { name: "description", content: loaderData?.seoDescription ?? "Zeyher & Mutter, Ihr Immobilienmakler in München: Verkauf, Bewertung vor Ort, Aufmaß und Wohnflächenberechnung, Suchauftrag für Käufer – persönlich begleitet vom ersten Gespräch bis zur Übergabe." },
  ];
}

export function meta(args: Route.MetaArgs) {
  const origin = herkunft(args.matches);
  return [...seitenkopf(args, seitenMeta(args)), ...(origin ? [organisation(origin)] : [])];
}

/** Die drei zuletzt veroeffentlichten Immobilien. Ein Fehler beim Laden darf
 * die Startseite nicht kippen -- dann steht dort der Hinweis auf den
 * Suchauftrag, wie wenn keine veroeffentlicht waere. */
async function ladeObjekte(request: Request, env: Env) {
  try {
    const { supabase } = createSupabaseServerClient(request, env);
    const { data: rows, error } = await supabase.rpc("public_property_listings");
    if (error) return [];
    return ((rows ?? []) as unknown[]).slice(0, 3);
  } catch {
    return [];
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const [page, objekte] = await Promise.all([
    loadPublicWebsitePage(request, context.cloudflare.env, "HOME"),
    ladeObjekte(request, context.cloudflare.env),
  ]);
  return data({ ...page, objekte }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

export default function Home() {
  const { content, objekte } = useLoaderData<typeof loader>();
  return <main className="public-site"><PublicHeader/><HomePageSections content={content} objekte={objekte}/><PublicFooter/></main>;
}
