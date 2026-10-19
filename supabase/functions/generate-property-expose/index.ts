import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import * as SCHRIFTEN from "./schriften.ts";
import { zeichneExpose } from "./layout.ts";

// 4: neue Gestaltung mit Logo, Hausschriften und Firmenangaben (layout.ts, 19.10.2026)
// 3: Fusszeile mit den Firmenangaben aus company_profile (19.10.2026)
const GENERATOR_VERSION=4;
const BUCKET="zm-private-exposes";
function response(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function safeText(value:unknown){return String(value??"").replace(/[–—]/g,"-").replace(/[“”„]/g,'"').replace(/[‘’]/g,"'").replace(/…/g,"...").replace(/[^\x20-\x7E\u00A0-\u00FF€²]/g," ").replace(/\s+/g," ").trim();}
function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,"0")).join("");}
async function sha256(bytes:Uint8Array){const copy=new Uint8Array(bytes);return hex(await crypto.subtle.digest("SHA-256",copy.buffer));}
function one(value:any){return Array.isArray(value)?value[0]:value;}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return response({ok:false},405);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),auth=req.headers.get("Authorization")??"";
 if(!url||!anon||!auth)return response({ok:false},401);
 const db=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:userRes,error:userError}=await db.auth.getUser();const user=userRes?.user;if(userError||!user)return response({ok:false},401);
 const {data:canWrite}=await db.rpc("current_user_has_permission",{p_permission:"expose.write"});if(canWrite!==true)return response({ok:false,error:"FORBIDDEN"},403);
 let body:any;try{body=await req.json();}catch{return response({ok:false,error:"INVALID_REQUEST"},400);}
 const exposeId=String(body.expose_id??"");if(!exposeId)return response({ok:false,error:"EXPOSE_REQUIRED"},400);
 const {data:expose,error:exposeError}=await db.from("property_exposes").select("*").eq("id",exposeId).maybeSingle();
 if(exposeError||!expose)return response({ok:false,error:"EXPOSE_NOT_FOUND"},404);
 if(expose.status!=="DRAFT")return expose.storage_path?response({ok:true,expose:{id:expose.id,expose_number:expose.expose_number,version_number:expose.version_number,status:expose.status},reused:true}):response({ok:false,error:"EXPOSE_NOT_DRAFT"},400);
 if(!safeText(expose.title))return response({ok:false,error:"TITLE_REQUIRED"},400);
 const {data:mediaRows,error:mediaError}=await db.from("property_expose_media").select("role,sort_order,property_media!inner(id,media_type,storage_bucket,storage_path,title,alt_text)").eq("expose_id",exposeId).eq("property_media.public_approved",true).is("property_media.archived_at",null).order("sort_order");
 if(mediaError)return response({ok:false,error:"MEDIA_LOAD_FAILED"},500);
 const media=(mediaRows??[]).map((row:any)=>({role:row.role,sort_order:row.sort_order,...one(row.property_media)}));
 const facts:any=expose.facts??{},energy:any=expose.energy??{};
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const schrift=(b64:string)=>pdf.embedFont(Uint8Array.from(atob(b64),(c)=>c.charCodeAt(0)),{subset:false});
 const s={serif:await schrift(SCHRIFTEN.serif),serifKursiv:await schrift(SCHRIFTEN.serifKursiv),serifHalbfett:await schrift(SCHRIFTEN.serifHalbfett),sans:await schrift(SCHRIFTEN.sans),sansLeicht:await schrift(SCHRIFTEN.sansLeicht),sansMittel:await schrift(SCHRIFTEN.sansMittel),sansHalbfett:await schrift(SCHRIFTEN.sansHalbfett)};
 const {data:firma}=await db.from("company_profile").select("legal_name,brand_name,street,postal_code,city,registered_seat,register_court,register_number,managing_directors,tax_number,vat_id,phone,email,website").maybeSingle();
 // JPG/PNG am Dateianfang erkennen (der Speicher liefert den Typ nicht immer mit); andere Formate fallen weg.
 const loadImage=async(item:any)=>{if(!item?.storage_bucket||!item?.storage_path)return null;const {data:blob}=await db.storage.from(item.storage_bucket).download(item.storage_path);if(!blob)return null;try{const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes[0]===0xFF&&bytes[1]===0xD8)return await pdf.embedJpg(bytes);if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4E&&bytes[3]===0x47)return await pdf.embedPng(bytes);}catch{}return null;};
 // Bilder: Titelbild (sonst das erste Bild), Galerie bis 10, Grundrisse bis 6 -- wie bisher.
 const bild=async(item:any)=>{const image=await loadImage(item);return image?{image,title:item.title??null}:null;};
 const titelbild=await bild(media.find((item:any)=>item.role==="COVER")??media.find((item:any)=>item.media_type==="IMAGE"));
 const galerie:any[]=[];for(const item of media.filter((item:any)=>item.role==="GALLERY").slice(0,10)){const b=await bild(item);if(b)galerie.push(b);}
 const grundrisse:any[]=[];for(const item of media.filter((item:any)=>item.role==="FLOOR_PLAN").slice(0,6)){const b=await bild(item);if(b)grundrisse.push(b);}
 pdf.setTitle(`Exposé – ${safeText(expose.title)}`);pdf.setAuthor(safeText(firma?.brand_name||firma?.legal_name||"Zeyher & Mutter Immobilien"));pdf.setCreator(`ZeyherMutterOS Exposé-Generator ${GENERATOR_VERSION}`);
 zeichneExpose(pdf,{rgb,pushGraphicsState,popGraphicsState,rectangle,clip,endPath},s,{title:expose.title,subtitle:expose.subtitle,short_description:expose.short_description,long_description:expose.long_description,features_description:expose.features_description,location_description:expose.location_description,other_information:expose.other_information,price:expose.price,facts,energy,exposeNumber:expose.expose_number,versionNumber:expose.version_number,erstelltAm:new Date(),firma:firma??null,titelbild,galerie,grundrisse});
 const pdfBytes=await pdf.save({useObjectStreams:false});const digest=await sha256(pdfBytes);const path=`properties/${expose.property_id}/exposes/${expose.id}-v${expose.version_number}.pdf`,filename=`Expose-${safeText(facts.property_number??expose.expose_number)}-V${expose.version_number}.pdf`;
 const {error:uploadError}=await db.storage.from(BUCKET).upload(path,new Blob([pdfBytes],{type:"application/pdf"}),{contentType:"application/pdf",upsert:false});if(uploadError)return response({ok:false,error:"UPLOAD_FAILED"},500);
 const {data:updated,error:updateError}=await db.from("property_exposes").update({status:"GENERATED",generator_version:GENERATOR_VERSION,storage_bucket:BUCKET,storage_path:path,original_filename:filename,mime_type:"application/pdf",file_size_bytes:pdfBytes.byteLength,sha256:digest,generated_at:new Date().toISOString(),generated_by:user.id}).eq("id",expose.id).eq("status","DRAFT").eq("version",expose.version).select("id,expose_number,version_number,status,version").maybeSingle();
 if(updateError||!updated){await db.storage.from(BUCKET).remove([path]);return response({ok:false,error:updateError?.message?.includes('EXPOSE_')?updateError.message:"CONCURRENT_UPDATE"},409);}
 return response({ok:true,expose:updated});
});
