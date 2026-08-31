import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const CONSENT_VERSION="website-inquiry-v1-2026-08-31";
function response(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:jsonHeaders});}
function clean(value:unknown,max:number){return String(value??"").trim().replace(/\s+/g," ").slice(0,max);}
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254;}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const hash=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,"0")).join("");}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return response({ok:false},405);
 const supabaseUrl=Deno.env.get("SUPABASE_URL");
 const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!supabaseUrl||!serviceRole)return response({ok:false},503);
 const db=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
 let body:any;
 try{body=await req.json();}catch{return response({ok:false,error:"INVALID_REQUEST"},400);}
 const firstName=clean(body.first_name,100),lastName=clean(body.last_name,100),email=clean(body.email,254).toLowerCase(),phone=clean(body.phone,60),message=clean(body.message,4000),slug=clean(body.slug,100),submissionKey=clean(body.submission_key,80),honeypot=clean(body.company,120),sourceUrl=clean(body.source_url,500);
 if(honeypot)return response({ok:true});
 if(!firstName||!lastName||!validEmail(email)||message.length<10||!slug||!submissionKey||body.consent!==true)return response({ok:false,error:"INVALID_INPUT"},400);
 const {data:published,error:publishedError}=await db.from("property_publication_versions").select("public_slug,snapshot").eq("public_slug",slug).eq("is_current_public",true).not("published_at","is",null).maybeSingle();
 if(publishedError||!published)return response({ok:false,error:"OBJECT_NOT_AVAILABLE"},404);
 const propertyId=String((published.snapshot as any)?.property_id??"");
 if(!propertyId)return response({ok:false,error:"OBJECT_NOT_AVAILABLE"},404);
 const {data:existingInquiry}=await db.from("inquiries").select("id").eq("website_submission_key",submissionKey).maybeSingle();
 if(existingInquiry)return response({ok:true,deduplicated:true});
 const fingerprint=await sha256(`${email}|${propertyId}`);
 const {data:allowed,error:rateError}=await db.rpc("consume_public_form_rate_limit",{p_fingerprint:fingerprint,p_limit:3,p_window_minutes:30});
 if(rateError||allowed!==true)return response({ok:false,error:"RATE_LIMIT"},429);
 const {data:property,error:propertyError}=await db.from("properties").select("id,property_number,primary_responsible_user").eq("id",propertyId).maybeSingle();
 if(propertyError||!property)return response({ok:false,error:"OBJECT_NOT_AVAILABLE"},404);
 const {data:duplicates,error:duplicateError}=await db.rpc("find_contact_duplicates",{p_first_name:firstName,p_last_name:lastName,p_email:email,p_mobile:phone||null,p_street:null,p_house_number:null,p_postal_code:null,p_city:null,p_exclude_contact_id:null});
 if(duplicateError)return response({ok:false,error:"PROCESSING_FAILED"},500);
 const duplicate=(duplicates??[]).find((item:any)=>Array.isArray(item.reasons)&&item.reasons.includes("EMAIL"))??(duplicates??[]).find((item:any)=>Array.isArray(item.reasons)&&item.reasons.includes("MOBILE")&&String(item.first_name).toLowerCase()===firstName.toLowerCase()&&String(item.last_name).toLowerCase()===lastName.toLowerCase());
 let contactId=duplicate?.contact_id??null;
 if(!contactId){
   const {data:createdContact,error:contactError}=await db.from("contacts").insert({first_name:firstName,last_name:lastName,email,phone:phone||null,preferred_channel:"EMAIL",primary_responsible_user:property.primary_responsible_user??null,created_by:null,updated_by:null}).select("id").single();
   if(contactError||!createdContact)return response({ok:false,error:"PROCESSING_FAILED"},500);
   contactId=createdContact.id;
 }
 const {data:inquiry,error:inquiryError}=await db.from("inquiries").insert({contact_id:contactId,property_id:propertyId,status:"NEW",channel:"WEBSITE",source_label:"ZeyherMutter Website",message,primary_responsible_user:property.primary_responsible_user??null,created_by:null,updated_by:null,website_submission_key:submissionKey,consent_given_at:new Date().toISOString(),consent_text_version:CONSENT_VERSION,public_source_url:sourceUrl||`/immobilien/${slug}`}).select("id,inquiry_number").single();
 if(inquiryError){
   if(String(inquiryError.message??"").toLowerCase().includes("website_submission_key"))return response({ok:true,deduplicated:true});
   return response({ok:false,error:"PROCESSING_FAILED"},500);
 }
 await db.from("activity_events").insert({activity_type:"WEBSITE_INQUIRY",title:"Website-Anfrage eingegangen",description:`Neue Website-Anfrage zu ${property.property_number}`,actor_user_id:null,contact_id:contactId,property_id:propertyId,inquiry_id:inquiry.id,metadata:{source:"PUBLIC_WEBSITE",consent_version:CONSENT_VERSION}});
 if(property.primary_responsible_user){await db.from("notifications").insert({user_id:property.primary_responsible_user,type:"WEBSITE_INQUIRY",title:"Neue Website-Anfrage",message:`Neue Anfrage zu ${property.property_number}`,entity_type:"INQUIRY",entity_id:inquiry.id});}
 return response({ok:true});
});
