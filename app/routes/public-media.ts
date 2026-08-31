import type { Route } from "./+types/public-media";
import { createSupabaseServerClient } from "~/lib/supabase.server";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loader({request,context,params}:Route.LoaderArgs){
  const mediaId=String(params.mediaId??"");
  const sourceVersion=Number(params.version);
  if(!UUID_RE.test(mediaId)||!Number.isInteger(sourceVersion)||sourceVersion<1)throw new Response("Medium nicht gefunden.",{status:404});
  const {supabase}=createSupabaseServerClient(request,context.cloudflare.env);
  const path=`media/${mediaId}/v${sourceVersion}`;
  const {data:blob,error}=await supabase.storage.from("zm-public-media").download(path);
  if(error||!blob)throw new Response("Medium nicht gefunden.",{status:404,headers:{"Cache-Control":"public, max-age=30, s-maxage=30"}});
  const headers=new Headers();
  headers.set("Content-Type",blob.type||"application/octet-stream");
  headers.set("Content-Length",String(blob.size));
  headers.set("Cache-Control","public, max-age=60, s-maxage=120, must-revalidate");
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Content-Security-Policy","default-src 'none'; sandbox");
  return new Response(blob,{status:200,headers});
}
