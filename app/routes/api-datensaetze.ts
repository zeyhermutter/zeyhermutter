import { data } from "react-router";
import { requireActiveUser } from "~/lib/auth.server";
import { kontaktName } from "~/lib/kontakt-name";
import { zeitpunkt } from "~/lib/format";
import { enthaelt, inListe, passendeBezuege, sicher } from "~/lib/blaettern.server";

// Lead, Objekt, Suchprofil, Anfrage oder Besichtigung fuer ein Auswahlfeld
// suchen (19.10.2026) -- wie api/kontakte fuer Kontakte.
//
// WARUM
//
// "Aufgabe anlegen" lud fuer seine fuenf Auswahlfelder je die 500 zuletzt
// geaenderten Datensaetze vorab. Was dahinter lag, liess sich nicht waehlen,
// und niemand merkte es. Jetzt sucht das Feld beim Tippen in der Datenbank
// (Nummer, Titel, Kontaktname, Objektnummer). Gelesen wird mit den Rechten
// des Benutzers; was er nicht sehen darf, findet er nicht.

const HOECHSTENS = 20;
const KENNUNG = /^[0-9a-f-]{36}$/i;

type Treffer = { id: string; name: string; nummer: string; zusatz: string | null };
const eins = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;

const ARTEN = {
  PROPERTY: {
    tabelle: "properties", spalten: "id,property_number,internal_title,status,archived_at", sortierung: "updated_at",
    eigene: ["property_number", "internal_title"], kontakt: null, objekt: null,
    treffer: (z: any): Treffer => ({ id: z.id, name: z.internal_title ?? "Objekt", nummer: z.property_number, zusatz: null }),
  },
  LEAD: {
    tabelle: "leads", spalten: "id,lead_number,property_city,archived_at,contacts(first_name,last_name)", sortierung: "updated_at",
    eigene: ["lead_number", "property_city"], kontakt: "contact_id", objekt: null,
    treffer: (z: any): Treffer => ({ id: z.id, name: kontaktName(eins(z.contacts)) || "Lead", nummer: z.lead_number, zusatz: z.property_city ?? null }),
  },
  SEARCH_PROFILE: {
    tabelle: "search_profiles", spalten: "id,search_profile_number,title,archived_at,contacts(first_name,last_name)", sortierung: "updated_at",
    eigene: ["search_profile_number", "title"], kontakt: "contact_id", objekt: null,
    treffer: (z: any): Treffer => ({ id: z.id, name: z.title ?? "Suchprofil", nummer: z.search_profile_number, zusatz: kontaktName(eins(z.contacts)) || null }),
  },
  INQUIRY: {
    tabelle: "inquiries", spalten: "id,inquiry_number,archived_at,contacts(first_name,last_name),properties(property_number)", sortierung: "received_at",
    eigene: ["inquiry_number"], kontakt: "contact_id", objekt: "property_id",
    treffer: (z: any): Treffer => ({ id: z.id, name: kontaktName(eins(z.contacts)) || "Anfrage", nummer: z.inquiry_number, zusatz: eins(z.properties)?.property_number ?? null }),
  },
  VIEWING: {
    tabelle: "viewings", spalten: "id,viewing_number,starts_at,archived_at,contacts(first_name,last_name),properties(property_number)", sortierung: "starts_at",
    eigene: ["viewing_number"], kontakt: "contact_id", objekt: "property_id",
    treffer: (z: any): Treffer => ({ id: z.id, name: `${zeitpunkt(z.starts_at)} · ${kontaktName(eins(z.contacts)) || "Besichtigung"}`, nummer: z.viewing_number, zusatz: eins(z.properties)?.property_number ?? null }),
  },
} as const;
export type DatensatzArt = keyof typeof ARTEN;

export async function loader({ request, context }: any) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const kopf = new Headers(responseHeaders());
  kopf.set("Cache-Control", "private, no-store");
  const art = url.searchParams.get("art") as DatensatzArt | null;
  const cfg = art && art in ARTEN ? ARTEN[art] : null;
  if (!cfg) return data({ treffer: [] }, { status: 400, headers: kopf });

  // Einen bereits gewaehlten Datensatz beschriften (?id=...).
  const id = url.searchParams.get("id") ?? "";
  if (id) {
    if (!KENNUNG.test(id)) return data({ treffer: [] }, { status: 400, headers: kopf });
    const { data: z, error } = await supabase.from(cfg.tabelle).select(cfg.spalten).eq("id", id).maybeSingle();
    if (error) return data({ treffer: [], fehler: "Nicht lesbar." }, { status: 500, headers: kopf });
    return data({ treffer: z ? [cfg.treffer(z)] : [] }, { headers: kopf });
  }

  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  const text = sicher(q);
  if (text.length < 2) return data({ treffer: [] }, { headers: kopf });
  const bezug = await passendeBezuege(supabase, q, { kontakte: Boolean(cfg.kontakt), objekte: Boolean(cfg.objekt) });
  const oder = [enthaelt([...cfg.eigene], text)];
  if (cfg.kontakt) oder.push(inListe(cfg.kontakt, bezug.kontakte));
  if (cfg.objekt) oder.push(inListe(cfg.objekt, bezug.objekte));
  let abfrage = supabase.from(cfg.tabelle).select(cfg.spalten).is("archived_at", null).or(oder.join(","));
  if (art === "PROPERTY") abfrage = abfrage.neq("status", "ARCHIVED");
  const { data: zeilen, error } = await abfrage.order(cfg.sortierung, { ascending: false }).limit(HOECHSTENS);
  if (error) return data({ treffer: [], fehler: "Suche nicht möglich." }, { status: 500, headers: kopf });
  return data({ treffer: ((zeilen ?? []) as any[]).map(cfg.treffer) }, { headers: kopf });
}
