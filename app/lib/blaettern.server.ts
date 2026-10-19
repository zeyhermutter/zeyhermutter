// Blaettern ueber die Datenbank fuer die Programmlisten (19.10.2026).
//
// VORHER luden acht Listen (Anfragen, Leads, Besichtigungen, Suchprofile,
// Kaufangebote, Abschluesse, Provisionen, Organisationen) die 500 zuletzt
// geaenderten Zeilen und filterten sie im Worker. Aeltere Eintraege waren
// in der Liste nicht zu finden; ein Hinweis sagte das nur.
//
// JETZT filtert und zaehlt die Datenbank, der Worker holt nur die eine
// Seite (50 Zeilen), die angezeigt wird. Die Suche findet eigene Nummern
// und Texte direkt und ueber die Kontakte und Objekte, die zum Suchwort
// passen (jedes Wort muss passen: "Max Muster" findet Max Mustermann).

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "react-router";

export const SEITE = 50;
/** Hoechstens so viele passende Kontakte/Objekte gehen in den Filter (Laenge der Adresse). */
export const BEZUG_GRENZE = 100;
const NIE = "00000000-0000-0000-0000-000000000000";

export function seiteAus(url: URL) {
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1);
  return { page, from: (page - 1) * SEITE, to: page * SEITE - 1 };
}

export function seitenzahl(total: number | null | undefined) {
  return Math.max(1, Math.ceil((total ?? 0) / SEITE));
}

/** Suchwort ohne die Zeichen, die einen PostgREST-Filter brechen. */
export function sicher(q: string) {
  return q.replace(/[,%()*\\"]/g, " ").replace(/\s+/g, " ").trim();
}

/** or()-Ausdruck: jede Spalte enthaelt den Text. */
export function enthaelt(spalten: string[], text: string) {
  return spalten.map((s) => `${s}.ilike.%${text}%`).join(",");
}

export type Bezug = { kontakte: string[]; objekte: string[]; zuViele: boolean };

/**
 * Kontakte und Objekte, die zum Suchwort passen. Jedes Wort muss in einer
 * der Spalten stehen. Leere Listen, wenn nichts gesucht wird.
 */
export async function passendeBezuege(
  supabase: SupabaseClient,
  q: string,
  welche: { kontakte?: boolean; objekte?: boolean },
): Promise<Bezug> {
  const text = sicher(q);
  if (!text) return { kontakte: [], objekte: [], zuViele: false };
  const woerter = text.split(" ").filter(Boolean).slice(0, 4);
  const kontaktAbfrage = () => {
    let a = supabase.from("contacts").select("id");
    for (const w of woerter) a = a.or(enthaelt(["first_name", "last_name", "contact_number", "email", "phone", "mobile"], w));
    return a.order("updated_at", { ascending: false }).limit(BEZUG_GRENZE + 1);
  };
  const objektAbfrage = () => {
    let a = supabase.from("properties").select("id");
    for (const w of woerter) a = a.or(enthaelt(["property_number", "internal_title"], w));
    return a.order("updated_at", { ascending: false }).limit(BEZUG_GRENZE + 1);
  };
  const leer = Promise.resolve({ data: [] as { id: string }[], error: null });
  const [k, o] = await Promise.all([
    welche.kontakte ? kontaktAbfrage() : leer,
    welche.objekte ? objektAbfrage() : leer,
  ]);
  const kontakte = ((k.data ?? []) as { id: string }[]).map((r) => r.id);
  const objekte = ((o.data ?? []) as { id: string }[]).map((r) => r.id);
  return {
    kontakte: kontakte.slice(0, BEZUG_GRENZE),
    objekte: objekte.slice(0, BEZUG_GRENZE),
    zuViele: kontakte.length > BEZUG_GRENZE || objekte.length > BEZUG_GRENZE,
  };
}

/** "spalte.in.(ids)" -- nie leer, damit der Filter gueltig bleibt. */
export function inListe(spalte: string, ids: string[]) {
  return `${spalte}.in.(${(ids.length ? ids : [NIE]).join(",")})`;
}

/**
 * Seite hinter dem Ende (alte Adresse, Filter geaendert): die Datenbank
 * antwortet mit PGRST103 statt mit einer leeren Seite. Dann zur ersten Seite
 * derselben Ansicht, statt "konnte nicht geladen werden" zu zeigen.
 */
export function seiteZuWeit(error: { code?: string } | null | undefined, url: URL, headers?: HeadersInit, param = "page") {
  if (error?.code !== "PGRST103") return;
  const ziel = new URL(url);
  ziel.searchParams.delete(param);
  throw redirect(`${ziel.pathname}${ziel.search}`, { headers });
}
