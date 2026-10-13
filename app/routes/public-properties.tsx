import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/public-properties";
import { seitenkopf } from "~/lib/seitenkopf";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { ObjektKarte } from "~/components/objekt-karte";
import "~/public-website.css";

function seitenMeta(_args: Route.MetaArgs){return[{title:"Immobilien · ZeyherMutter"},{name:"description",content:"Aktuell veröffentlichte Immobilien von ZeyherMutter."}]}

export function meta(args: Route.MetaArgs) {
  return seitenkopf(args, seitenMeta(args));
}
export async function loader({request,context}:Route.LoaderArgs){const {supabase}=createSupabaseServerClient(request,context.cloudflare.env);const {data:rows,error}=await supabase.rpc("public_property_listings");if(error)throw new Response("Immobilien konnten nicht geladen werden.",{status:500});return data({rows:rows??[]},{headers:{"Cache-Control":"public, max-age=60, s-maxage=120"}});}
export default function PublicProperties(){const {rows}=useLoaderData<typeof loader>();return <main className="public-site"><PublicHeader/><section className="public-hero"><p className="public-eyebrow">Immobilien</p><h1>Aktuelle Angebote.</h1><p>Ausgewählte Immobilien, die derzeit von ZeyherMutter veröffentlicht sind.</p></section><section className="public-property-grid">{rows.map((row:any)=><ObjektKarte key={row.public_slug} row={row}/>)}{rows.length===0?<div className="public-empty"><h2>Aktuell keine veröffentlichten Immobilien.</h2><p>Neue Angebote erscheinen hier nach ihrer Freigabe automatisch.</p></div>:null}</section><PublicFooter/></main>}
