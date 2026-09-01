import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/public-imprint";
import { PublicLegalSection } from "~/components/public-page-sections";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { loadPublicWebsitePage } from "~/lib/website-content.server";
import "~/public-website.css";

export function meta({data:loaderData}:Route.MetaArgs){return[{title:loaderData?.seoTitle??"Impressum · ZeyherMutter"},{name:"robots",content:"noindex,follow"}]}
export async function loader({request,context}:Route.LoaderArgs){const page=await loadPublicWebsitePage(request,context.cloudflare.env,"IMPRINT");return data(page,{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"}});}
export default function PublicImprint(){const {content}=useLoaderData<typeof loader>();return <main className="public-site"><PublicHeader/><PublicLegalSection content={content}/><PublicFooter/></main>}
