import type { Route } from "./+types/public-media";
import { createSupabaseServerClient } from "~/lib/supabase.server";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loader({request,context,params}:Route.LoaderArgs){
  const mediaId=String(params.mediaId??"");
  const sourceVersion=Number(params.version);
  if(!UUID_RE.test(mediaId)||!Number.isInteger(sourceVersion)||sourceVersion<1)throw new Response("Medium nicht gefunden.",{status:404});
  const {supabase}=createSupabaseServerClient(request,context.cloudflare.env);
  const path=`media/${mediaId}/v${sourceVersion}`;
  const {data:signed,error}=await supabase.storage.from("zm-public-media").createSignedUrl(path,30);
  if(error||!signed?.signedUrl)throw new Response("Medium nicht gefunden.",{status:404,headers:{"Cache-Control":"public, max-age=30, s-maxage=30"}});

  const signedUrl=new URL(signed.signedUrl);
  const supabaseUrl=new URL(context.cloudflare.env.SUPABASE_URL);
  if(signedUrl.origin!==supabaseUrl.origin||!signedUrl.pathname.startsWith("/storage/v1/object/sign/zm-public-media/")){
    throw new Response("Medium nicht gefunden.",{status:404});
  }

  const range=request.headers.get("Range");
  const upstream=await fetch(signedUrl,{headers:range?{Range:range}:undefined});
  if(!upstream.ok||!upstream.body)throw new Response("Medium nicht gefunden.",{status:404,headers:{"Cache-Control":"public, max-age=30, s-maxage=30"}});

  const headers=new Headers();
  for(const name of ["Content-Type","Content-Length","Content-Range","Accept-Ranges","ETag","Last-Modified"]){
    const value=upstream.headers.get(name);
    if(value)headers.set(name,value);
  }
  if(!headers.has("Content-Type"))headers.set("Content-Type","application/octet-stream");
  headers.set("Cache-Control","public, max-age=60, s-maxage=120, must-revalidate");
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Content-Security-Policy","default-src 'none'; sandbox");
  return new Response(upstream.body,{status:upstream.status,headers});
}
