import { data, Form, Link, useLoaderData, redirect } from "react-router";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/viewings";
import { requirePermission } from "~/lib/auth.server";
import { zeitpunkt as formatDate } from "~/lib/format";
import { BESICHTIGUNGSSTATUS as STATUS } from "~/lib/labels";
import { seiteAus, seitenzahl, sicher, enthaelt, inListe, passendeBezuege, BEZUG_GRENZE } from "~/lib/blaettern.server";
import { Seiten, SucheZuAllgemein } from "~/components/seiten";
import "~/programm-liste.css";

function one(v:any){return Array.isArray(v)?v[0]:v;}
export async function loader({request,context}:Route.LoaderArgs){const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"viewing.read");
  // Einstieg: gleich den obersten Datensatz im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if(istEinstieg(request)){/* Einstieg (P1, 16.10.2026): was als Naechstes Arbeit macht, abgesagte und nicht erschienene nie. 1. naechste anstehende, 2. vergangene, die noch geplant/bestaetigt sind (Ergebnis fehlt), 3. zuletzt durchgefuehrte, 4. irgendeine. */const jetzt=new Date().toISOString();const offen=["PLANNED","CONFIRMED"];const basis=()=>supabase.from("viewings").select("id").is("archived_at",null);const stufen=[()=>basis().in("status",offen).gte("starts_at",jetzt).order("starts_at",{ascending:true}),()=>basis().in("status",offen).lt("starts_at",jetzt).order("starts_at",{ascending:false}),()=>basis().eq("status","COMPLETED").order("starts_at",{ascending:false}),()=>basis().order("starts_at",{ascending:false})];let erster:any=null;for(const stufe of stufen){const {data:z}=await stufe().limit(1).maybeSingle();if(z){erster=z;break;}}if(erster)throw redirect(`/viewings/${erster.id}`,{headers:responseHeaders()});}const u=new URL(request.url),status=u.searchParams.get("status")??"UPCOMING",responsible=u.searchParams.get("responsible")??"ALL",q=(u.searchParams.get("q")??"").trim();
  /* Blaettern ueber die Datenbank (19.10.2026, app/lib/blaettern.server.ts): gefiltert und gezaehlt wird dort, geholt nur die angezeigte Seite. */
  const {page,from,to}=seiteAus(u);const text=sicher(q);
  const [bezug,profilTreffer,anfrageTreffer]=await Promise.all([passendeBezuege(supabase,q,{kontakte:true,objekte:true}),text?supabase.from("search_profiles").select("id").ilike("search_profile_number",`%${text}%`).limit(BEZUG_GRENZE):Promise.resolve({data:[]}),text?supabase.from("inquiries").select("id").ilike("inquiry_number",`%${text}%`).limit(BEZUG_GRENZE):Promise.resolve({data:[]})]);
  let abfrage=supabase.from("viewings").select("id,viewing_number,status,starts_at,ends_at,meeting_point,primary_responsible_user,property_id,contact_id,search_profile_id,inquiry_id,properties!inner(property_number,internal_title),contacts!inner(first_name,last_name),search_profiles(search_profile_number,title),inquiries(inquiry_number)",{count:"exact"}).is("archived_at",null);
  if(status==="UPCOMING")abfrage=abfrage.not("status","in","(COMPLETED,CANCELLED,NO_SHOW)").gte("starts_at",new Date(Date.now()-6*3600000).toISOString());
  else if(status!=="ALL")abfrage=abfrage.eq("status",status);
  if(responsible!=="ALL")abfrage=abfrage.eq("primary_responsible_user",responsible);
  if(text)abfrage=abfrage.or([enthaelt(["viewing_number","meeting_point"],text),inListe("contact_id",bezug.kontakte),inListe("property_id",bezug.objekte),inListe("search_profile_id",((profilTreffer.data??[]) as any[]).map(r=>r.id)),inListe("inquiry_id",((anfrageTreffer.data??[]) as any[]).map(r=>r.id))].join(","));
  const [{data:rows,error,count},{data:profiles}]=await Promise.all([abfrage.order("starts_at",{ascending:true}).range(from,to),supabase.from("profiles").select("user_id,display_name,status").eq("status","ACTIVE").order("display_name")]);
  if(error)throw new Response("Besichtigungen konnten nicht geladen werden.",{status:500});const profileMap=Object.fromEntries((profiles??[]).map((x:any)=>[x.user_id,x.display_name]));
  return data({rows:rows??[],total:count??0,page,pageCount:seitenzahl(count),zuViele:bezug.zuViele,profiles:profiles??[],profileMap,profile,filters:{status,responsible,q}},{headers:responseHeaders()});}
// Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026).
// Vorher Seitenkopf, Filterkasten und Kartenzeilen.
export default function Viewings(){
 const {rows,total,page,pageCount,zuViele,profiles,profileMap,filters}=useLoaderData<typeof loader>();
 const gefiltert=Boolean(filters.q||filters.status!=="UPCOMING"||filters.responsible!=="ALL");
 return <main className="editor-shell programm-liste">
  <Form method="get" className="programm-liste-werkzeuge" role="search">
   <input type="hidden" name="ansicht" value="tabelle"/>
   <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={filters.q} placeholder="Kontakt, Objekt oder Nummer …" autoComplete="off"/></label>
   <label><span className="sr-only">Status</span><select name="status" defaultValue={filters.status}><option value="UPCOMING">Anstehende Termine</option><option value="ALL">Alle</option>{Object.entries(STATUS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   <label><span className="sr-only">Verantwortlich</span><select name="responsible" defaultValue={filters.responsible}><option value="ALL">Alle Verantwortlichen</option>{profiles.map((x:any)=><option key={x.user_id} value={x.user_id}>{x.display_name}</option>)}</select></label>
   <button className="secondary-button" type="submit">Filtern</button>
   <span className="programm-liste-zaehler">{total} {total===1?"Besichtigung":"Besichtigungen"}</span>
   <Link className="programm-liste-neu" to="/viewings/new">+ Neue Besichtigung</Link>
  </Form>
  <div className="programm-tabelle-rahmen">
   {rows.length===0?<p className="programm-liste-leer">{gefiltert?"Keine Besichtigung passt zu diesem Filter.":"Keine anstehende Besichtigung."} <Link to="/viewings/new">Besichtigung planen</Link></p>:<table className="programm-tabelle">
    <thead><tr><th scope="col">Termin</th><th scope="col">Objekt</th><th scope="col">Interessent</th><th scope="col">Bezug</th><th scope="col">Treffpunkt</th><th scope="col">Status</th><th scope="col">Verantwortlich</th><th scope="col" className="rechts">Nummer</th></tr></thead>
    <tbody>{rows.map((r:any)=>{const p=one(r.properties),c=one(r.contacts),sp=one(r.search_profiles),inq=one(r.inquiries);return <tr key={r.id}>
     <td className="zahl"><Link to={`/viewings/${r.id}`}>{formatDate(r.starts_at)}</Link></td>
     <td><Link to={`/viewings/${r.id}`}>{p.property_number} · {p.internal_title}</Link></td>
     <td>{r.contact_id?<Link to={`/crm/contacts/${r.contact_id}`}>{c.first_name} {c.last_name}</Link>:`${c.first_name} ${c.last_name}`}</td>
     <td>{sp?.search_profile_number??inq?.inquiry_number??<span className="leise">—</span>}</td>
     <td>{r.meeting_point??<span className="leise">offen</span>}</td>
     <td>{STATUS[r.status]??r.status}</td>
     <td>{profileMap[r.primary_responsible_user]??<span className="leise">—</span>}</td>
     <td className="zahl rechts leise">{r.viewing_number}</td>
    </tr>;})}</tbody>
   </table>}
   <SucheZuAllgemein an={zuViele}/>
  </div>
  <Seiten page={page} pageCount={pageCount}/>
 </main>;
}
