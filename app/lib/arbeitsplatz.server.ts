// Das Laden fuer einen Arbeitsplatz -- Liste links, Akte rechts.
//
// Jeder Arbeitsplatz laedt dasselbe: eine schlanke Liste (nur, was eine
// Zeile zeigt, begrenzt, ohne Archiv) und den geoeffneten Datensatz -- der
// darf archiviert sein und jenseits der Grenze liegen, er wird dann oben in
// der Liste gezeigt (siehe app/components/arbeitsplatz.tsx). Seit dem
// fuenften Bereich (12.10.2026) steht das hier einmal statt in jeder
// Layout-Route.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function ladeArbeitsplatz<R>(supabase: SupabaseClient, opt: {
  tabelle: string;
  /** Was eine Listenzeile braucht. */
  spalten: string;
  /** Zusaetzlich fuer den Kopf des geoeffneten Datensatzes. */
  akteSpalten?: string;
  sortierung: string;
  aufsteigend?: boolean;
  id: string | undefined;
  hoechstens: number;
}): Promise<{ liste: R[]; listeFehlt: boolean; abgeschnitten: boolean; akte: R | null }> {
  const [listeRes, akteRes] = await Promise.all([
    supabase.from(opt.tabelle).select(opt.spalten).is("archived_at", null)
      .order(opt.sortierung, { ascending: opt.aufsteigend ?? false }).limit(opt.hoechstens),
    supabase.from(opt.tabelle).select(opt.akteSpalten ? `${opt.spalten},${opt.akteSpalten}` : opt.spalten)
      .eq("id", opt.id ?? "").maybeSingle(),
  ]);
  const liste = (listeRes.data ?? []) as unknown as R[];
  return {
    liste,
    listeFehlt: Boolean(listeRes.error),
    abgeschnitten: liste.length >= opt.hoechstens,
    akte: (akteRes.data ?? null) as unknown as R | null,
  };
}

export const eins = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
