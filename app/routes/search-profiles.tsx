import { data, Form, Link, redirect, useLoaderData } from "react-router";
import { istEinstieg } from "~/lib/einstieg";
import type { Route } from "./+types/search-profiles";
import { requirePermission } from "~/lib/auth.server";
import { euroRund as money, tag } from "~/lib/format";
import { seiteAus, seitenzahl, sicher, enthaelt, inListe, passendeBezuege, BEZUG_GRENZE, seiteZuWeit } from "~/lib/blaettern.server";
import { Seiten, SucheZuAllgemein } from "~/components/seiten";
import "~/programm-liste.css";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
const STATUS_LABELS:Record<string,string>={ACTIVE:"Aktiv",PAUSED:"Pausiert",CLOSED:"Abgeschlossen"};
const TYPE_LABELS:Record<string,string>={DETACHED_HOUSE:"Einfamilienhaus",SEMI_DETACHED_HOUSE:"Doppelhaushälfte",TERRACED_HOUSE:"Reihenhaus",APARTMENT_BUILDING:"Mehrfamilienhaus",APARTMENT:"Wohnung",PENTHOUSE:"Penthouse",MAISONETTE:"Maisonette",LAND:"Grundstück",COMMERCIAL:"Gewerbe",OFFICE:"Büro",RETAIL:"Einzelhandel",GARAGE:"Garage",PARKING_SPACE:"Stellplatz",OTHER:"Sonstige"};
function one(v:any){return Array.isArray(v)?v[0]:v;}

export async function loader({request,context}:Route.LoaderArgs){
  const {supabase,responseHeaders,profile}=await requirePermission(request,context.cloudflare.env,"search_profile.read");
  // Einstieg: gleich das zuletzt bearbeitete Suchprofil im Arbeitsplatz oeffnen (app/lib/einstieg.ts).
  if(istEinstieg(request)){const {data:erstes}=await supabase.from("search_profiles").select("id").is("archived_at",null).order("updated_at",{ascending:false}).limit(1).maybeSingle(); if(erstes)throw redirect(`/search-profiles/${erstes.id}`,{headers:responseHeaders()});}
  const url=new URL(request.url);const q=(url.searchParams.get("q")??"").trim();const archived=url.searchParams.get("archived")==="1";// Im Archiv zaehlt der Status nur, wenn er ausdruecklich gewaehlt ist: der Haken "Archiv" schickt die Voreinstellung "Aktiv" mit, und archivierte Profile sind fast nie aktiv (P2-8).
  const statusParam=url.searchParams.get("status");const status=archived&&(!statusParam||statusParam==="ACTIVE")?"ALL":(statusParam??"ACTIVE");const transaction=url.searchParams.get("transaction")??"ALL";const responsible=url.searchParams.get("responsible")??"ALL";
  // Blaettern ueber die Datenbank (19.10.2026, app/lib/blaettern.server.ts).
  const {page,from,to}=seiteAus(url);const text=sicher(q);
  const [bezug,ortTreffer]=await Promise.all([passendeBezuege(supabase,q,{kontakte:true}),text?supabase.from("search_profile_locations").select("search_profile_id").or(enthaelt(["postal_code","city","district"],text)).limit(BEZUG_GRENZE):Promise.resolve({data:[]})]);
  let abfrage=supabase.from("search_profiles").select("id,search_profile_number,title,status,transaction_type,property_types,min_price,max_price,min_living_area,min_rooms,primary_responsible_user,updated_at,archived_at,contacts!inner(id,contact_number,first_name,last_name,email,mobile),search_profile_locations(id,postal_code,city,district,radius_km)",{count:"exact"});
  abfrage=archived?abfrage.not("archived_at","is",null):abfrage.is("archived_at",null);
  if(status!=="ALL")abfrage=abfrage.eq("status",status);
  if(transaction!=="ALL")abfrage=abfrage.eq("transaction_type",transaction);
  if(responsible!=="ALL")abfrage=abfrage.eq("primary_responsible_user",responsible);
  if(text)abfrage=abfrage.or([enthaelt(["search_profile_number","title"],text),inListe("contact_id",bezug.kontakte),inListe("id",((ortTreffer.data??[]) as any[]).map(r=>r.search_profile_id))].join(","));
  const [{data:rows,error,count},{data:profiles}]=await Promise.all([
    abfrage.order("updated_at",{ascending:false}).range(from,to),
    supabase.from("profiles").select("user_id,display_name,status").eq("status","ACTIVE").order("display_name")
  ]);
  seiteZuWeit(error,url,responseHeaders());if(error)throw new Response("Suchprofile konnten nicht geladen werden.",{status:500});
  const profileMap=Object.fromEntries((profiles??[]).map((p:any)=>[p.user_id,p.display_name]));
  return data({rows:rows??[],total:count??0,page,pageCount:seitenzahl(count),zuViele:bezug.zuViele,profiles:profiles??[],profileMap,profile,filters:{q,status,transaction,responsible,archived}},{headers:responseHeaders()});
}
// Eine Programmliste wie Kontakte und Makleraufträge (P2-8, 17.10.2026).
// Vorher Seitenkopf, Filterkasten und Kartenzeilen. Der Hinweis "Suchort
// erforderlich" bleibt in der Zeile.
export default function SearchProfiles(){
 const {rows,total,page,pageCount,zuViele,profiles,profileMap,filters}=useLoaderData<typeof loader>();
 const gefiltert=Boolean(filters.q||(filters.status!=="ACTIVE"&&!filters.archived)||filters.transaction!=="ALL"||filters.responsible!=="ALL");
 return <main className="editor-shell programm-liste"><ListenUeberschrift/>
  <Form method="get" className="programm-liste-werkzeuge" role="search">
   <input type="hidden" name="ansicht" value="tabelle"/>
   <label className="programm-liste-suche"><span className="sr-only">Suche</span><input type="search" name="q" defaultValue={filters.q} placeholder="Name, Profilnummer, Ort, E-Mail …" autoComplete="off"/></label>
   <label><span className="sr-only">Status</span><select name="status" defaultValue={filters.status}><option value="ALL">Alle Status</option><option value="ACTIVE">Aktiv</option><option value="PAUSED">Pausiert</option><option value="CLOSED">Abgeschlossen</option></select></label>
   <label><span className="sr-only">Art</span><select name="transaction" defaultValue={filters.transaction}><option value="ALL">Kauf und Miete</option><option value="BUY">Kauf</option><option value="RENT">Miete</option></select></label>
   <label><span className="sr-only">Verantwortlich</span><select name="responsible" defaultValue={filters.responsible}><option value="ALL">Alle Verantwortlichen</option>{profiles.map((p:any)=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label>
   <label className="programm-liste-haken"><input type="checkbox" name="archived" value="1" defaultChecked={filters.archived}/>Archiv</label>
   <button className="secondary-button" type="submit">Filtern</button>
   <span className="programm-liste-zaehler">{total} {total===1?"Suchprofil":"Suchprofile"}</span>
   <Link className="programm-liste-neu" to="/search-profiles/new">+ Neues Suchprofil</Link>
  </Form>
  <div className="programm-tabelle-rahmen">
   {rows.length===0?<p className="programm-liste-leer">{gefiltert||filters.archived?"Kein Suchprofil passt zu diesem Filter.":"Noch kein Suchprofil erfasst."} <Link to="/search-profiles/new">Suchprofil anlegen</Link></p>:<table className="programm-tabelle">
    <thead><tr><th scope="col">Nummer</th><th scope="col">Interessent</th><th scope="col">Suchort</th><th scope="col">Objektart</th><th scope="col" className="rechts">Preis</th><th scope="col">Fläche · Zimmer</th><th scope="col">Status</th><th scope="col">Verantwortlich</th><th scope="col" className="rechts">Geändert</th></tr></thead>
    <tbody>{rows.map((r:any)=>{const c=one(r.contacts);const locations=r.search_profile_locations??[];return <tr key={r.id}>
     <td className="zahl"><Link to={`/search-profiles/${r.id}`}>{r.search_profile_number}</Link></td>
     <td><Link to={`/search-profiles/${r.id}`}>{c?`${c.first_name} ${c.last_name}`:"Kontakt"}</Link>{r.title?<div className="leise">{r.title}</div>:null}</td>
     <td>{locations.length===0?<span className="warnung-text">Suchort erforderlich</span>:<>{locations.slice(0,2).map((l:any)=><div key={l.id}>{[l.postal_code,l.city,l.district].filter(Boolean).join(" ")} · {Number(l.radius_km)} km</div>)}{locations.length>2?<div className="leise">+ {locations.length-2} weitere</div>:null}</>}</td>
     <td>{(r.property_types??[]).map((t:string)=>TYPE_LABELS[t]??t).slice(0,3).join(", ")||<span className="leise">offen</span>}<div className="leise">{r.transaction_type==="BUY"?"Kauf":"Miete"}</div></td>
     <td className="zahl rechts">{r.min_price||r.max_price?`${money(r.min_price)} – ${money(r.max_price)}`:<span className="leise">offen</span>}</td>
     <td>{r.min_living_area?`ab ${Number(r.min_living_area)} m²`:<span className="leise">Fläche offen</span>}<div className="leise">{r.min_rooms?`ab ${Number(r.min_rooms)} Zimmer`:"Zimmer offen"}</div></td>
     <td>{r.archived_at?"Archiviert":STATUS_LABELS[r.status]??r.status}</td>
     <td>{profileMap[r.primary_responsible_user]??<span className="leise">—</span>}</td>
     <td className="zahl rechts leise">{tag(r.updated_at)}</td>
    </tr>;})}</tbody>
   </table>}
   <SucheZuAllgemein an={zuViele}/>
  </div>
  <Seiten page={page} pageCount={pageCount}/>
 </main>;
}
